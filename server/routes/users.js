const express = require('express');
const { body, query } = require('express-validator');
const { User } = require('../models');
const { authenticateToken, requireAdmin, requireTeacher } = require('../middleware/auth');
const { upload } = require('../utils/upload');

const router = express.Router();

// Validation middleware
const userValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('role')
    .isIn(['admin', 'teacher', 'student'])
    .withMessage('Role must be admin, teacher, or student'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid date of birth'),
  body('address')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Address must be less than 500 characters')
];

const userUpdateValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('role')
    .optional()
    .isIn(['admin', 'teacher', 'student'])
    .withMessage('Role must be admin, teacher, or student'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid date of birth'),
  body('address')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Address must be less than 500 characters'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

// Get all users (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search, isActive } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (role) whereClause.role = role;
    if (isActive !== undefined) whereClause.isActive = isActive === 'true';
    if (search) {
      whereClause[require('sequelize').Op.or] = [
        { firstName: { [require('sequelize').Op.iLike]: `%${search}%` } },
        { lastName: { [require('sequelize').Op.iLike]: `%${search}%` } },
        { email: { [require('sequelize').Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: users } = await User.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['password', 'resetPasswordToken', 'resetPasswordExpires'] }
    });

    res.json({
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      error: 'Failed to retrieve users',
      message: 'Unable to get users list'
    });
  }
});

// Get user by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id, {
      attributes: { exclude: ['password', 'resetPasswordToken', 'resetPasswordExpires'] },
      include: [
        {
          model: User,
          as: 'studentEnrollments',
          include: ['course', 'teacher']
        },
        {
          model: User,
          as: 'teacherEnrollments',
          include: ['course', 'student']
        }
      ]
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    // Check if user can access this profile
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own profile'
      });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to retrieve user',
      message: 'Unable to get user details'
    });
  }
});

// Create new user (admin only)
router.post('/', authenticateToken, requireAdmin, userValidation, async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, phone, dateOfBirth, address } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'An account with this email already exists'
      });
    }

    // Create new user
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      role,
      phone,
      dateOfBirth,
      address
    });

    res.status(201).json({
      message: 'User created successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      error: 'Failed to create user',
      message: 'Unable to create user account'
    });
  }
});

// Update user
router.put('/:id', authenticateToken, userUpdateValidation, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update your own profile'
      });
    }

    // Only admin can change role and active status
    if (req.user.role !== 'admin') {
      delete updateData.role;
      delete updateData.isActive;
    }

    // Update user
    await user.update(updateData);

    res.json({
      message: 'User updated successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      error: 'Failed to update user',
      message: 'Unable to update user account'
    });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    // Prevent deleting own account
    if (req.user.id === id) {
      return res.status(400).json({
        error: 'Cannot delete own account',
        message: 'You cannot delete your own account'
      });
    }

    // Soft delete - set isActive to false
    await user.update({ isActive: false });

    res.json({
      message: 'User deactivated successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      error: 'Failed to delete user',
      message: 'Unable to delete user account'
    });
  }
});

// Upload profile image
router.post('/:id/profile-image', authenticateToken, upload.single('profileImage'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check permissions
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only upload your own profile image'
      });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please select an image file'
      });
    }

    // Update profile image path
    await user.update({
      profileImage: req.file.path
    });

    res.json({
      message: 'Profile image uploaded successfully',
      profileImage: req.file.path
    });
  } catch (error) {
    console.error('Upload profile image error:', error);
    res.status(500).json({
      error: 'Failed to upload profile image',
      message: 'Unable to upload image'
    });
  }
});

// Get teachers (for course assignment)
router.get('/teachers/list', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const teachers = await User.findAll({
      where: { 
        role: 'teacher',
        isActive: true 
      },
      attributes: ['id', 'firstName', 'lastName', 'email'],
      order: [['firstName', 'ASC']]
    });

    res.json({ teachers });
  } catch (error) {
    console.error('Get teachers error:', error);
    res.status(500).json({
      error: 'Failed to retrieve teachers',
      message: 'Unable to get teachers list'
    });
  }
});

// Get students (for enrollment)
router.get('/students/list', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const students = await User.findAll({
      where: { 
        role: 'student',
        isActive: true 
      },
      attributes: ['id', 'firstName', 'lastName', 'email'],
      order: [['firstName', 'ASC']]
    });

    res.json({ students });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({
      error: 'Failed to retrieve students',
      message: 'Unable to get students list'
    });
  }
});

// Bulk operations (admin only)
router.post('/bulk/activate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'User IDs array is required'
      });
    }

    await User.update(
      { isActive: true },
      { where: { id: userIds } }
    );

    res.json({
      message: `${userIds.length} users activated successfully`
    });
  } catch (error) {
    console.error('Bulk activate error:', error);
    res.status(500).json({
      error: 'Failed to activate users',
      message: 'Unable to activate users'
    });
  }
});

router.post('/bulk/deactivate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'User IDs array is required'
      });
    }

    await User.update(
      { isActive: false },
      { where: { id: userIds } }
    );

    res.json({
      message: `${userIds.length} users deactivated successfully`
    });
  } catch (error) {
    console.error('Bulk deactivate error:', error);
    res.status(500).json({
      error: 'Failed to deactivate users',
      message: 'Unable to deactivate users'
    });
  }
});

module.exports = router; 