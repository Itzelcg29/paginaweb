const express = require('express');
const { body } = require('express-validator');
const { Enrollment, Course, User } = require('../models');
const { authenticateToken, requireAdmin, requireTeacher } = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const enrollmentValidation = [
  body('studentId')
    .isUUID()
    .withMessage('Student ID must be a valid UUID'),
  body('courseId')
    .isUUID()
    .withMessage('Course ID must be a valid UUID'),
  body('teacherId')
    .isUUID()
    .withMessage('Teacher ID must be a valid UUID'),
  body('startDate')
    .isISO8601()
    .withMessage('Start date must be a valid date'),
  body('endDate')
    .isISO8601()
    .withMessage('End date must be a valid date'),
  body('totalAmount')
    .isFloat({ min: 0 })
    .withMessage('Total amount must be a positive number'),
  body('paymentPlan')
    .optional()
    .isIn(['full', 'monthly', 'weekly'])
    .withMessage('Payment plan must be full, monthly, or weekly'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes must be less than 1000 characters')
];

// Get all enrollments (admin/teacher)
router.get('/', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      paymentStatus, 
      courseId, 
      studentId, 
      teacherId 
    } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (status) whereClause.status = status;
    if (paymentStatus) whereClause.paymentStatus = paymentStatus;
    if (courseId) whereClause.courseId = courseId;
    if (studentId) whereClause.studentId = studentId;
    if (teacherId) whereClause.teacherId = teacherId;

    // Teachers can only see their own enrollments
    if (req.user.role === 'teacher') {
      whereClause.teacherId = req.user.id;
    }

    const { count, rows: enrollments } = await Enrollment.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'student',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: User,
          as: 'teacher',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Course,
          as: 'course',
          attributes: ['id', 'name', 'level', 'category']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      enrollments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get enrollments error:', error);
    res.status(500).json({
      error: 'Failed to retrieve enrollments',
      message: 'Unable to get enrollments list'
    });
  }
});

// Get enrollment by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const enrollment = await Enrollment.findByPk(id, {
      include: [
        {
          model: User,
          as: 'student',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone']
        },
        {
          model: User,
          as: 'teacher',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Course,
          as: 'course',
          attributes: ['id', 'name', 'level', 'category', 'description', 'schedule']
        }
      ]
    });

    if (!enrollment) {
      return res.status(404).json({
        error: 'Enrollment not found',
        message: 'Enrollment does not exist'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && 
        req.user.id !== enrollment.studentId && 
        req.user.id !== enrollment.teacherId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own enrollments'
      });
    }

    res.json({ enrollment });
  } catch (error) {
    console.error('Get enrollment error:', error);
    res.status(500).json({
      error: 'Failed to retrieve enrollment',
      message: 'Unable to get enrollment details'
    });
  }
});

// Create new enrollment (admin only)
router.post('/', authenticateToken, requireAdmin, enrollmentValidation, async (req, res) => {
  try {
    const enrollmentData = req.body;

    // Check if student and course exist
    const [student, course, teacher] = await Promise.all([
      User.findByPk(enrollmentData.studentId),
      Course.findByPk(enrollmentData.courseId),
      User.findByPk(enrollmentData.teacherId)
    ]);

    if (!student || student.role !== 'student') {
      return res.status(404).json({
        error: 'Student not found',
        message: 'Student does not exist or is not a student'
      });
    }

    if (!course) {
      return res.status(404).json({
        error: 'Course not found',
        message: 'Course does not exist'
      });
    }

    if (!teacher || teacher.role !== 'teacher') {
      return res.status(404).json({
        error: 'Teacher not found',
        message: 'Teacher does not exist or is not a teacher'
      });
    }

    // Check if course is active
    if (!course.isActive) {
      return res.status(400).json({
        error: 'Course not available',
        message: 'Course is not active'
      });
    }

    // Check if course is full
    const isFull = await course.isFull();
    if (isFull) {
      return res.status(400).json({
        error: 'Course is full',
        message: 'Course has reached maximum capacity'
      });
    }

    // Check if student is already enrolled in this course
    const existingEnrollment = await Enrollment.findOne({
      where: {
        studentId: enrollmentData.studentId,
        courseId: enrollmentData.courseId,
        status: ['pending', 'active']
      }
    });

    if (existingEnrollment) {
      return res.status(409).json({
        error: 'Already enrolled',
        message: 'Student is already enrolled in this course'
      });
    }

    // Validate date range
    if (new Date(enrollmentData.startDate) >= new Date(enrollmentData.endDate)) {
      return res.status(400).json({
        error: 'Invalid date range',
        message: 'End date must be after start date'
      });
    }

    // Create enrollment
    const enrollment = await Enrollment.create(enrollmentData);

    res.status(201).json({
      message: 'Enrollment created successfully',
      enrollment: enrollment.toJSON()
    });
  } catch (error) {
    console.error('Create enrollment error:', error);
    res.status(500).json({
      error: 'Failed to create enrollment',
      message: 'Unable to create enrollment'
    });
  }
});

// Update enrollment
router.put('/:id', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const enrollment = await Enrollment.findByPk(id);
    if (!enrollment) {
      return res.status(404).json({
        error: 'Enrollment not found',
        message: 'Enrollment does not exist'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && req.user.id !== enrollment.teacherId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update enrollments you teach'
      });
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

    // Update enrollment
    await enrollment.update(updateData);

    res.json({
      message: 'Enrollment updated successfully',
      enrollment: enrollment.toJSON()
    });
  } catch (error) {
    console.error('Update enrollment error:', error);
    res.status(500).json({
      error: 'Failed to update enrollment',
      message: 'Unable to update enrollment'
    });
  }
});

// Cancel enrollment
router.put('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const enrollment = await Enrollment.findByPk(id);
    if (!enrollment) {
      return res.status(404).json({
        error: 'Enrollment not found',
        message: 'Enrollment does not exist'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && 
        req.user.id !== enrollment.studentId && 
        req.user.id !== enrollment.teacherId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only cancel your own enrollments'
      });
    }

    // Check if enrollment can be cancelled
    if (enrollment.status === 'cancelled') {
      return res.status(400).json({
        error: 'Already cancelled',
        message: 'Enrollment is already cancelled'
      });
    }

    if (enrollment.status === 'completed') {
      return res.status(400).json({
        error: 'Cannot cancel completed enrollment',
        message: 'Cannot cancel a completed enrollment'
      });
    }

    // Cancel enrollment
    await enrollment.update({
      status: 'cancelled',
      notes: reason ? `${enrollment.notes || ''}\nCancelled: ${reason}`.trim() : enrollment.notes
    });

    res.json({
      message: 'Enrollment cancelled successfully',
      enrollment: enrollment.toJSON()
    });
  } catch (error) {
    console.error('Cancel enrollment error:', error);
    res.status(500).json({
      error: 'Failed to cancel enrollment',
      message: 'Unable to cancel enrollment'
    });
  }
});

// Complete enrollment
router.put('/:id/complete', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { id } = req.params;
    const { finalGrade, attendancePercentage, certificateNumber } = req.body;

    const enrollment = await Enrollment.findByPk(id);
    if (!enrollment) {
      return res.status(404).json({
        error: 'Enrollment not found',
        message: 'Enrollment does not exist'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && req.user.id !== enrollment.teacherId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only complete enrollments you teach'
      });
    }

    // Check if enrollment can be completed
    if (enrollment.status === 'completed') {
      return res.status(400).json({
        error: 'Already completed',
        message: 'Enrollment is already completed'
      });
    }

    if (enrollment.status === 'cancelled') {
      return res.status(400).json({
        error: 'Cannot complete cancelled enrollment',
        message: 'Cannot complete a cancelled enrollment'
      });
    }

    // Complete enrollment
    await enrollment.update({
      status: 'completed',
      completionDate: new Date(),
      finalGrade: finalGrade || enrollment.finalGrade,
      attendancePercentage: attendancePercentage || enrollment.attendancePercentage,
      certificateNumber: certificateNumber || enrollment.certificateNumber,
      certificateIssued: !!certificateNumber
    });

    res.json({
      message: 'Enrollment completed successfully',
      enrollment: enrollment.toJSON()
    });
  } catch (error) {
    console.error('Complete enrollment error:', error);
    res.status(500).json({
      error: 'Failed to complete enrollment',
      message: 'Unable to complete enrollment'
    });
  }
});

// Get enrollments by student
router.get('/student/:studentId', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    // Check permissions
    if (req.user.role !== 'admin' && req.user.id !== studentId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own enrollments'
      });
    }

    const whereClause = { studentId };
    if (status) whereClause.status = status;

    const { count, rows: enrollments } = await Enrollment.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'teacher',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Course,
          as: 'course',
          attributes: ['id', 'name', 'level', 'category', 'description', 'schedule']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      enrollments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get student enrollments error:', error);
    res.status(500).json({
      error: 'Failed to retrieve student enrollments',
      message: 'Unable to get student enrollments'
    });
  }
});

// Get enrollments by teacher
router.get('/teacher/:teacherId', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    // Check permissions
    if (req.user.role !== 'admin' && req.user.id !== teacherId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own enrollments'
      });
    }

    const whereClause = { teacherId };
    if (status) whereClause.status = status;

    const { count, rows: enrollments } = await Enrollment.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'student',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Course,
          as: 'course',
          attributes: ['id', 'name', 'level', 'category']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      enrollments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get teacher enrollments error:', error);
    res.status(500).json({
      error: 'Failed to retrieve teacher enrollments',
      message: 'Unable to get teacher enrollments'
    });
  }
});

module.exports = router; 