const express = require('express');
const { body } = require('express-validator');
const { Grade, Enrollment, User, Course } = require('../models');
const { authenticateToken, requireTeacher } = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const gradeValidation = [
  body('enrollmentId')
    .isUUID()
    .withMessage('Enrollment ID must be a valid UUID'),
  body('assessmentType')
    .isIn(['quiz', 'exam', 'homework', 'participation', 'project', 'final'])
    .withMessage('Assessment type must be quiz, exam, homework, participation, project, or final'),
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be between 1 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('score')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Score must be between 0 and 100'),
  body('maxScore')
    .isFloat({ min: 1 })
    .withMessage('Maximum score must be greater than 0'),
  body('weight')
    .isFloat({ min: 0, max: 1 })
    .withMessage('Weight must be between 0 and 1'),
  body('assessmentDate')
    .isISO8601()
    .withMessage('Assessment date must be a valid date'),
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date'),
  body('feedback')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Feedback must be less than 1000 characters'),
  body('comments')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Comments must be less than 500 characters')
];

// Get all grades (teacher/admin)
router.get('/', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      enrollmentId, 
      assessmentType, 
      courseId,
      studentId 
    } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (enrollmentId) whereClause.enrollmentId = enrollmentId;
    if (assessmentType) whereClause.assessmentType = assessmentType;

    // Teachers can only see grades for their courses
    if (req.user.role === 'teacher') {
      whereClause.gradedBy = req.user.id;
    }

    const includeClause = [
      {
        model: Enrollment,
        as: 'enrollment',
        include: [
          {
            model: User,
            as: 'student',
            attributes: ['id', 'firstName', 'lastName', 'email']
          },
          {
            model: Course,
            as: 'course',
            attributes: ['id', 'name', 'level']
          }
        ]
      }
    ];

    // Filter by course or student if specified
    if (courseId) {
      includeClause[0].where = { courseId };
    }
    if (studentId) {
      includeClause[0].where = { ...includeClause[0].where, studentId };
    }

    const { count, rows: grades } = await Grade.findAndCountAll({
      where: whereClause,
      include: includeClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['assessmentDate', 'DESC']]
    });

    res.json({
      grades,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get grades error:', error);
    res.status(500).json({
      error: 'Failed to retrieve grades',
      message: 'Unable to get grades list'
    });
  }
});

// Get grade by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const grade = await Grade.findByPk(id, {
      include: [
        {
          model: Enrollment,
          as: 'enrollment',
          include: [
            {
              model: User,
              as: 'student',
              attributes: ['id', 'firstName', 'lastName', 'email']
            },
            {
              model: Course,
              as: 'course',
              attributes: ['id', 'name', 'level']
            }
          ]
        },
        {
          model: User,
          as: 'gradedByUser',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    if (!grade) {
      return res.status(404).json({
        error: 'Grade not found',
        message: 'Grade does not exist'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && 
        req.user.id !== grade.enrollment.studentId && 
        req.user.id !== grade.gradedBy) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own grades'
      });
    }

    res.json({ grade });
  } catch (error) {
    console.error('Get grade error:', error);
    res.status(500).json({
      error: 'Failed to retrieve grade',
      message: 'Unable to get grade details'
    });
  }
});

// Create new grade (teacher only)
router.post('/', authenticateToken, requireTeacher, gradeValidation, async (req, res) => {
  try {
    const gradeData = req.body;

    // Check if enrollment exists and teacher has permission
    const enrollment = await Enrollment.findByPk(gradeData.enrollmentId, {
      include: [
        {
          model: Course,
          as: 'course'
        }
      ]
    });

    if (!enrollment) {
      return res.status(404).json({
        error: 'Enrollment not found',
        message: 'Enrollment does not exist'
      });
    }

    // Check if teacher has permission to grade this enrollment
    if (req.user.role !== 'admin' && req.user.id !== enrollment.teacherId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only grade enrollments you teach'
      });
    }

    // Check if enrollment is active
    if (enrollment.status !== 'active') {
      return res.status(400).json({
        error: 'Enrollment not active',
        message: 'Cannot grade inactive enrollment'
      });
    }

    // Check if grade already exists for this assessment
    const existingGrade = await Grade.findOne({
      where: {
        enrollmentId: gradeData.enrollmentId,
        title: gradeData.title,
        assessmentType: gradeData.assessmentType
      }
    });

    if (existingGrade) {
      return res.status(409).json({
        error: 'Grade already exists',
        message: 'A grade for this assessment already exists'
      });
    }

    // Create grade
    const grade = await Grade.create({
      ...gradeData,
      gradedBy: req.user.id
    });

    res.status(201).json({
      message: 'Grade created successfully',
      grade: grade.toJSON()
    });
  } catch (error) {
    console.error('Create grade error:', error);
    res.status(500).json({
      error: 'Failed to create grade',
      message: 'Unable to create grade'
    });
  }
});

// Update grade (teacher only)
router.put('/:id', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const grade = await Grade.findByPk(id, {
      include: [
        {
          model: Enrollment,
          as: 'enrollment'
        }
      ]
    });

    if (!grade) {
      return res.status(404).json({
        error: 'Grade not found',
        message: 'Grade does not exist'
      });
    }

    // Check if teacher has permission to update this grade
    if (req.user.role !== 'admin' && req.user.id !== grade.gradedBy) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update grades you created'
      });
    }

    // Update grade
    await grade.update(updateData);

    res.json({
      message: 'Grade updated successfully',
      grade: grade.toJSON()
    });
  } catch (error) {
    console.error('Update grade error:', error);
    res.status(500).json({
      error: 'Failed to update grade',
      message: 'Unable to update grade'
    });
  }
});

// Delete grade (teacher only)
router.delete('/:id', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { id } = req.params;

    const grade = await Grade.findByPk(id);
    if (!grade) {
      return res.status(404).json({
        error: 'Grade not found',
        message: 'Grade does not exist'
      });
    }

    // Check if teacher has permission to delete this grade
    if (req.user.role !== 'admin' && req.user.id !== grade.gradedBy) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only delete grades you created'
      });
    }

    // Delete grade
    await grade.destroy();

    res.json({
      message: 'Grade deleted successfully'
    });
  } catch (error) {
    console.error('Delete grade error:', error);
    res.status(500).json({
      error: 'Failed to delete grade',
      message: 'Unable to delete grade'
    });
  }
});

// Get grades by enrollment
router.get('/enrollment/:enrollmentId', authenticateToken, async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Check if enrollment exists
    const enrollment = await Enrollment.findByPk(enrollmentId);
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
        message: 'You can only view grades for your own enrollments'
      });
    }

    const { count, rows: grades } = await Grade.findAndCountAll({
      where: { enrollmentId },
      include: [
        {
          model: User,
          as: 'gradedByUser',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['assessmentDate', 'DESC']]
    });

    res.json({
      grades,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get enrollment grades error:', error);
    res.status(500).json({
      error: 'Failed to retrieve enrollment grades',
      message: 'Unable to get enrollment grades'
    });
  }
});

// Get grades by student
router.get('/student/:studentId', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { page = 1, limit = 10, courseId } = req.query;
    const offset = (page - 1) * limit;

    // Check permissions
    if (req.user.role !== 'admin' && req.user.id !== studentId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own grades'
      });
    }

    const includeClause = [
      {
        model: Enrollment,
        as: 'enrollment',
        where: { studentId },
        include: [
          {
            model: Course,
            as: 'course',
            attributes: ['id', 'name', 'level']
          }
        ]
      }
    ];

    if (courseId) {
      includeClause[0].where.courseId = courseId;
    }

    const { count, rows: grades } = await Grade.findAndCountAll({
      include: includeClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['assessmentDate', 'DESC']]
    });

    res.json({
      grades,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get student grades error:', error);
    res.status(500).json({
      error: 'Failed to retrieve student grades',
      message: 'Unable to get student grades'
    });
  }
});

// Bulk create grades (teacher only)
router.post('/bulk', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { grades } = req.body;

    if (!grades || !Array.isArray(grades)) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Grades array is required'
      });
    }

    const createdGrades = [];
    const errors = [];

    for (let i = 0; i < grades.length; i++) {
      try {
        const gradeData = grades[i];

        // Validate required fields
        if (!gradeData.enrollmentId || !gradeData.title || !gradeData.score) {
          errors.push({
            index: i,
            error: 'Missing required fields',
            data: gradeData
          });
          continue;
        }

        // Check if enrollment exists and teacher has permission
        const enrollment = await Enrollment.findByPk(gradeData.enrollmentId);
        if (!enrollment) {
          errors.push({
            index: i,
            error: 'Enrollment not found',
            data: gradeData
          });
          continue;
        }

        if (req.user.role !== 'admin' && req.user.id !== enrollment.teacherId) {
          errors.push({
            index: i,
            error: 'No permission to grade this enrollment',
            data: gradeData
          });
          continue;
        }

        // Create grade
        const grade = await Grade.create({
          ...gradeData,
          gradedBy: req.user.id,
          assessmentDate: gradeData.assessmentDate || new Date()
        });

        createdGrades.push(grade);
      } catch (error) {
        errors.push({
          index: i,
          error: error.message,
          data: grades[i]
        });
      }
    }

    res.status(201).json({
      message: `Created ${createdGrades.length} grades successfully`,
      createdGrades: createdGrades.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Bulk create grades error:', error);
    res.status(500).json({
      error: 'Failed to create grades',
      message: 'Unable to create grades'
    });
  }
});

module.exports = router; 