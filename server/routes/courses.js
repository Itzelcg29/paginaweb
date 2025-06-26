const express = require('express');
const { body, query } = require('express-validator');
const { Course, User, Enrollment } = require('../models');
const { authenticateToken, requireAdmin, requireTeacher } = require('../middleware/auth');
const { uploadCourseMaterial, handleUploadError } = require('../utils/upload');

const router = express.Router();

// Validation middleware
const courseValidation = [
  body('name')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Course name must be between 3 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('level')
    .isIn(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
    .withMessage('Level must be A1, A2, B1, B2, C1, or C2'),
  body('category')
    .isIn(['basic', 'intermediate', 'advanced', 'conversation', 'business', 'exam_preparation'])
    .withMessage('Category must be basic, intermediate, advanced, conversation, business, or exam_preparation'),
  body('duration')
    .isInt({ min: 1, max: 52 })
    .withMessage('Duration must be between 1 and 52 weeks'),
  body('sessionsPerWeek')
    .isInt({ min: 1, max: 7 })
    .withMessage('Sessions per week must be between 1 and 7'),
  body('sessionDuration')
    .isInt({ min: 30, max: 240 })
    .withMessage('Session duration must be between 30 and 240 minutes'),
  body('maxStudents')
    .isInt({ min: 1, max: 50 })
    .withMessage('Maximum students must be between 1 and 50'),
  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('startDate')
    .isISO8601()
    .withMessage('Start date must be a valid date'),
  body('endDate')
    .isISO8601()
    .withMessage('End date must be a valid date'),
  body('schedule')
    .isArray()
    .withMessage('Schedule must be an array'),
  body('classroom')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Classroom must be less than 100 characters'),
  body('requirements')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Requirements must be less than 500 characters'),
  body('isOnline')
    .optional()
    .isBoolean()
    .withMessage('isOnline must be a boolean'),
  body('meetingLink')
    .optional()
    .isURL()
    .withMessage('Meeting link must be a valid URL')
];

const courseUpdateValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Course name must be between 3 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('level')
    .optional()
    .isIn(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
    .withMessage('Level must be A1, A2, B1, B2, C1, or C2'),
  body('category')
    .optional()
    .isIn(['basic', 'intermediate', 'advanced', 'conversation', 'business', 'exam_preparation'])
    .withMessage('Category must be basic, intermediate, advanced, conversation, business, or exam_preparation'),
  body('duration')
    .optional()
    .isInt({ min: 1, max: 52 })
    .withMessage('Duration must be between 1 and 52 weeks'),
  body('sessionsPerWeek')
    .optional()
    .isInt({ min: 1, max: 7 })
    .withMessage('Sessions per week must be between 1 and 7'),
  body('sessionDuration')
    .optional()
    .isInt({ min: 30, max: 240 })
    .withMessage('Session duration must be between 30 and 240 minutes'),
  body('maxStudents')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Maximum students must be between 1 and 50'),
  body('price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid date'),
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid date'),
  body('schedule')
    .optional()
    .isArray()
    .withMessage('Schedule must be an array'),
  body('classroom')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Classroom must be less than 100 characters'),
  body('requirements')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Requirements must be less than 500 characters'),
  body('isOnline')
    .optional()
    .isBoolean()
    .withMessage('isOnline must be a boolean'),
  body('meetingLink')
    .optional()
    .isURL()
    .withMessage('Meeting link must be a valid URL'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

// Get all courses
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      level, 
      category, 
      search, 
      isActive,
      isOnline,
      teacherId 
    } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (level) whereClause.level = level;
    if (category) whereClause.category = category;
    if (isActive !== undefined) whereClause.isActive = isActive === 'true';
    if (isOnline !== undefined) whereClause.isOnline = isOnline === 'true';
    if (search) {
      whereClause[require('sequelize').Op.or] = [
        { name: { [require('sequelize').Op.iLike]: `%${search}%` } },
        { description: { [require('sequelize').Op.iLike]: `%${search}%` } }
      ];
    }

    const includeClause = [
      {
        model: User,
        as: 'teacher',
        attributes: ['id', 'firstName', 'lastName', 'email']
      }
    ];

    // Filter by teacher if specified
    if (teacherId) {
      includeClause[0].where = { id: teacherId };
    }

    const { count, rows: courses } = await Course.findAndCountAll({
      where: whereClause,
      include: includeClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    // Add enrollment count and available spots
    const coursesWithEnrollment = await Promise.all(
      courses.map(async (course) => {
        const enrollmentCount = await course.getCurrentEnrollmentCount();
        const availableSpots = await course.getAvailableSpots();
        return {
          ...course.toJSON(),
          enrollmentCount,
          availableSpots,
          isFull: enrollmentCount >= course.maxStudents
        };
      })
    );

    res.json({
      courses: coursesWithEnrollment,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({
      error: 'Failed to retrieve courses',
      message: 'Unable to get courses list'
    });
  }
});

// Get course by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findByPk(id, {
      include: [
        {
          model: User,
          as: 'teacher',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Enrollment,
          as: 'enrollments',
          include: [
            {
              model: User,
              as: 'student',
              attributes: ['id', 'firstName', 'lastName', 'email']
            }
          ]
        }
      ]
    });

    if (!course) {
      return res.status(404).json({
        error: 'Course not found',
        message: 'Course does not exist'
      });
    }

    // Add enrollment count and available spots
    const enrollmentCount = await course.getCurrentEnrollmentCount();
    const availableSpots = await course.getAvailableSpots();

    const courseData = {
      ...course.toJSON(),
      enrollmentCount,
      availableSpots,
      isFull: enrollmentCount >= course.maxStudents
    };

    res.json({ course: courseData });
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({
      error: 'Failed to retrieve course',
      message: 'Unable to get course details'
    });
  }
});

// Create new course (admin only)
router.post('/', authenticateToken, requireAdmin, courseValidation, async (req, res) => {
  try {
    const courseData = req.body;

    // Validate date range
    if (new Date(courseData.startDate) >= new Date(courseData.endDate)) {
      return res.status(400).json({
        error: 'Invalid date range',
        message: 'End date must be after start date'
      });
    }

    // Create course
    const course = await Course.create(courseData);

    res.status(201).json({
      message: 'Course created successfully',
      course: course.toJSON()
    });
  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({
      error: 'Failed to create course',
      message: 'Unable to create course'
    });
  }
});

// Update course
router.put('/:id', authenticateToken, requireTeacher, courseUpdateValidation, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const course = await Course.findByPk(id);
    if (!course) {
      return res.status(404).json({
        error: 'Course not found',
        message: 'Course does not exist'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin') {
      // Teachers can only update courses they teach
      const enrollment = await Enrollment.findOne({
        where: { courseId: id, teacherId: req.user.id }
      });
      if (!enrollment) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only update courses you teach'
        });
      }
    }

    // Validate date range if dates are being updated
    if (updateData.startDate && updateData.endDate) {
      if (new Date(updateData.startDate) >= new Date(updateData.endDate)) {
        return res.status(400).json({
          error: 'Invalid date range',
          message: 'End date must be after start date'
        });
      }
    }

    // Update course
    await course.update(updateData);

    res.json({
      message: 'Course updated successfully',
      course: course.toJSON()
    });
  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({
      error: 'Failed to update course',
      message: 'Unable to update course'
    });
  }
});

// Delete course (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const course = await Course.findByPk(id);
    if (!course) {
      return res.status(404).json({
        error: 'Course not found',
        message: 'Course does not exist'
      });
    }

    // Check if course has active enrollments
    const enrollmentCount = await course.getCurrentEnrollmentCount();
    if (enrollmentCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete course',
        message: 'Course has active enrollments. Please cancel enrollments first.'
      });
    }

    // Soft delete - set isActive to false
    await course.update({ isActive: false });

    res.json({
      message: 'Course deactivated successfully'
    });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({
      error: 'Failed to delete course',
      message: 'Unable to delete course'
    });
  }
});

// Upload course material
router.post('/:id/materials', 
  authenticateToken, 
  requireTeacher, 
  uploadCourseMaterial.single('material'),
  handleUploadError,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, type } = req.body;

      const course = await Course.findByPk(id);
      if (!course) {
        return res.status(404).json({
          error: 'Course not found',
          message: 'Course does not exist'
        });
      }

      // Check permissions
      if (req.user.role !== 'admin') {
        const enrollment = await Enrollment.findOne({
          where: { courseId: id, teacherId: req.user.id }
        });
        if (!enrollment) {
          return res.status(403).json({
            error: 'Access denied',
            message: 'You can only upload materials for courses you teach'
          });
        }
      }

      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          message: 'Please select a file to upload'
        });
      }

      // Add material to course
      const materials = course.materials || [];
      const newMaterial = {
        id: Date.now().toString(),
        title: title || req.file.originalname,
        description: description || '',
        type: type || 'document',
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        size: req.file.size,
        uploadedBy: req.user.id,
        uploadedAt: new Date().toISOString()
      };

      materials.push(newMaterial);
      await course.update({ materials });

      res.json({
        message: 'Course material uploaded successfully',
        material: newMaterial
      });
    } catch (error) {
      console.error('Upload course material error:', error);
      res.status(500).json({
        error: 'Failed to upload material',
        message: 'Unable to upload course material'
      });
    }
  }
);

// Get course materials
router.get('/:id/materials', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const course = await Course.findByPk(id);
    if (!course) {
      return res.status(404).json({
        error: 'Course not found',
        message: 'Course does not exist'
      });
    }

    res.json({
      materials: course.materials || []
    });
  } catch (error) {
    console.error('Get course materials error:', error);
    res.status(500).json({
      error: 'Failed to retrieve materials',
      message: 'Unable to get course materials'
    });
  }
});

// Delete course material
router.delete('/:id/materials/:materialId', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { id, materialId } = req.params;

    const course = await Course.findByPk(id);
    if (!course) {
      return res.status(404).json({
        error: 'Course not found',
        message: 'Course does not exist'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin') {
      const enrollment = await Enrollment.findOne({
        where: { courseId: id, teacherId: req.user.id }
      });
      if (!enrollment) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only delete materials for courses you teach'
        });
      }
    }

    const materials = course.materials || [];
    const materialIndex = materials.findIndex(m => m.id === materialId);

    if (materialIndex === -1) {
      return res.status(404).json({
        error: 'Material not found',
        message: 'Material does not exist'
      });
    }

    // Remove material from array
    materials.splice(materialIndex, 1);
    await course.update({ materials });

    res.json({
      message: 'Course material deleted successfully'
    });
  } catch (error) {
    console.error('Delete course material error:', error);
    res.status(500).json({
      error: 'Failed to delete material',
      message: 'Unable to delete course material'
    });
  }
});

// Get courses by teacher
router.get('/teacher/:teacherId', authenticateToken, async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { page = 1, limit = 10, isActive } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = { teacherId };
    if (isActive !== undefined) whereClause.isActive = isActive === 'true';

    const { count, rows: courses } = await Course.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'teacher',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    // Add enrollment count and available spots
    const coursesWithEnrollment = await Promise.all(
      courses.map(async (course) => {
        const enrollmentCount = await course.getCurrentEnrollmentCount();
        const availableSpots = await course.getAvailableSpots();
        return {
          ...course.toJSON(),
          enrollmentCount,
          availableSpots,
          isFull: enrollmentCount >= course.maxStudents
        };
      })
    );

    res.json({
      courses: coursesWithEnrollment,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get teacher courses error:', error);
    res.status(500).json({
      error: 'Failed to retrieve teacher courses',
      message: 'Unable to get teacher courses'
    });
  }
});

module.exports = router; 