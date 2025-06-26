const express = require('express');
const { body } = require('express-validator');
const { Attendance, Enrollment, User, Course } = require('../models');
const { authenticateToken, requireTeacher } = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const attendanceValidation = [
  body('enrollmentId')
    .isUUID()
    .withMessage('Enrollment ID must be a valid UUID'),
  body('sessionDate')
    .isISO8601()
    .withMessage('Session date must be a valid date'),
  body('sessionNumber')
    .isInt({ min: 1 })
    .withMessage('Session number must be a positive integer'),
  body('status')
    .isIn(['present', 'absent', 'late', 'excused', 'tardy'])
    .withMessage('Status must be present, absent, late, excused, or tardy'),
  body('arrivalTime')
    .optional()
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Arrival time must be in HH:MM format'),
  body('departureTime')
    .optional()
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Departure time must be in HH:MM format'),
  body('minutesLate')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minutes late must be a non-negative integer'),
  body('minutesPresent')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minutes present must be a non-negative integer'),
  body('excuse')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Excuse must be less than 500 characters'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be less than 500 characters'),
  body('isOnline')
    .optional()
    .isBoolean()
    .withMessage('isOnline must be a boolean'),
  body('onlinePlatform')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Online platform must be less than 100 characters'),
  body('participationScore')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Participation score must be between 0 and 1')
];

// Get all attendance records (teacher/admin)
router.get('/', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      enrollmentId, 
      status, 
      courseId,
      studentId,
      startDate,
      endDate 
    } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (enrollmentId) whereClause.enrollmentId = enrollmentId;
    if (status) whereClause.status = status;
    if (startDate && endDate) {
      whereClause.sessionDate = {
        [require('sequelize').Op.between]: [startDate, endDate]
      };
    }

    // Teachers can only see attendance for their courses
    if (req.user.role === 'teacher') {
      whereClause.recordedBy = req.user.id;
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

    const { count, rows: attendance } = await Attendance.findAndCountAll({
      where: whereClause,
      include: includeClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['sessionDate', 'DESC'], ['sessionNumber', 'ASC']]
    });

    res.json({
      attendance,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({
      error: 'Failed to retrieve attendance',
      message: 'Unable to get attendance list'
    });
  }
});

// Get attendance by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const attendance = await Attendance.findByPk(id, {
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
          as: 'recordedByUser',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    if (!attendance) {
      return res.status(404).json({
        error: 'Attendance record not found',
        message: 'Attendance record does not exist'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && 
        req.user.id !== attendance.enrollment.studentId && 
        req.user.id !== attendance.recordedBy) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own attendance records'
      });
    }

    res.json({ attendance });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({
      error: 'Failed to retrieve attendance',
      message: 'Unable to get attendance details'
    });
  }
});

// Create new attendance record (teacher only)
router.post('/', authenticateToken, requireTeacher, attendanceValidation, async (req, res) => {
  try {
    const attendanceData = req.body;

    // Check if enrollment exists and teacher has permission
    const enrollment = await Enrollment.findByPk(attendanceData.enrollmentId, {
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

    // Check if teacher has permission to record attendance for this enrollment
    if (req.user.role !== 'admin' && req.user.id !== enrollment.teacherId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only record attendance for enrollments you teach'
      });
    }

    // Check if enrollment is active
    if (enrollment.status !== 'active') {
      return res.status(400).json({
        error: 'Enrollment not active',
        message: 'Cannot record attendance for inactive enrollment'
      });
    }

    // Check if attendance already exists for this session
    const existingAttendance = await Attendance.findOne({
      where: {
        enrollmentId: attendanceData.enrollmentId,
        sessionDate: attendanceData.sessionDate,
        sessionNumber: attendanceData.sessionNumber
      }
    });

    if (existingAttendance) {
      return res.status(409).json({
        error: 'Attendance already exists',
        message: 'Attendance for this session already exists'
      });
    }

    // Create attendance record
    const attendance = await Attendance.create({
      ...attendanceData,
      recordedBy: req.user.id
    });

    res.status(201).json({
      message: 'Attendance recorded successfully',
      attendance: attendance.toJSON()
    });
  } catch (error) {
    console.error('Create attendance error:', error);
    res.status(500).json({
      error: 'Failed to record attendance',
      message: 'Unable to record attendance'
    });
  }
});

// Update attendance record (teacher only)
router.put('/:id', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const attendance = await Attendance.findByPk(id, {
      include: [
        {
          model: Enrollment,
          as: 'enrollment'
        }
      ]
    });

    if (!attendance) {
      return res.status(404).json({
        error: 'Attendance record not found',
        message: 'Attendance record does not exist'
      });
    }

    // Check if teacher has permission to update this attendance record
    if (req.user.role !== 'admin' && req.user.id !== attendance.recordedBy) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update attendance records you created'
      });
    }

    // Update attendance record
    await attendance.update(updateData);

    res.json({
      message: 'Attendance updated successfully',
      attendance: attendance.toJSON()
    });
  } catch (error) {
    console.error('Update attendance error:', error);
    res.status(500).json({
      error: 'Failed to update attendance',
      message: 'Unable to update attendance'
    });
  }
});

// Delete attendance record (teacher only)
router.delete('/:id', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { id } = req.params;

    const attendance = await Attendance.findByPk(id);
    if (!attendance) {
      return res.status(404).json({
        error: 'Attendance record not found',
        message: 'Attendance record does not exist'
      });
    }

    // Check if teacher has permission to delete this attendance record
    if (req.user.role !== 'admin' && req.user.id !== attendance.recordedBy) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only delete attendance records you created'
      });
    }

    // Delete attendance record
    await attendance.destroy();

    res.json({
      message: 'Attendance record deleted successfully'
    });
  } catch (error) {
    console.error('Delete attendance error:', error);
    res.status(500).json({
      error: 'Failed to delete attendance',
      message: 'Unable to delete attendance record'
    });
  }
});

// Get attendance by enrollment
router.get('/enrollment/:enrollmentId', authenticateToken, async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { page = 1, limit = 10, startDate, endDate } = req.query;
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
        message: 'You can only view attendance for your own enrollments'
      });
    }

    const whereClause = { enrollmentId };
    if (startDate && endDate) {
      whereClause.sessionDate = {
        [require('sequelize').Op.between]: [startDate, endDate]
      };
    }

    const { count, rows: attendance } = await Attendance.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'recordedByUser',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['sessionDate', 'DESC'], ['sessionNumber', 'ASC']]
    });

    res.json({
      attendance,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get enrollment attendance error:', error);
    res.status(500).json({
      error: 'Failed to retrieve enrollment attendance',
      message: 'Unable to get enrollment attendance'
    });
  }
});

// Get attendance by student
router.get('/student/:studentId', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { page = 1, limit = 10, courseId, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;

    // Check permissions
    if (req.user.role !== 'admin' && req.user.id !== studentId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own attendance'
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

    const whereClause = {};
    if (startDate && endDate) {
      whereClause.sessionDate = {
        [require('sequelize').Op.between]: [startDate, endDate]
      };
    }

    const { count, rows: attendance } = await Attendance.findAndCountAll({
      where: whereClause,
      include: includeClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['sessionDate', 'DESC'], ['sessionNumber', 'ASC']]
    });

    res.json({
      attendance,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get student attendance error:', error);
    res.status(500).json({
      error: 'Failed to retrieve student attendance',
      message: 'Unable to get student attendance'
    });
  }
});

// Bulk create attendance records (teacher only)
router.post('/bulk', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { attendanceRecords } = req.body;

    if (!attendanceRecords || !Array.isArray(attendanceRecords)) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Attendance records array is required'
      });
    }

    const createdRecords = [];
    const errors = [];

    for (let i = 0; i < attendanceRecords.length; i++) {
      try {
        const recordData = attendanceRecords[i];

        // Validate required fields
        if (!recordData.enrollmentId || !recordData.sessionDate || !recordData.status) {
          errors.push({
            index: i,
            error: 'Missing required fields',
            data: recordData
          });
          continue;
        }

        // Check if enrollment exists and teacher has permission
        const enrollment = await Enrollment.findByPk(recordData.enrollmentId);
        if (!enrollment) {
          errors.push({
            index: i,
            error: 'Enrollment not found',
            data: recordData
          });
          continue;
        }

        if (req.user.role !== 'admin' && req.user.id !== enrollment.teacherId) {
          errors.push({
            index: i,
            error: 'No permission to record attendance for this enrollment',
            data: recordData
          });
          continue;
        }

        // Check if attendance already exists
        const existingAttendance = await Attendance.findOne({
          where: {
            enrollmentId: recordData.enrollmentId,
            sessionDate: recordData.sessionDate,
            sessionNumber: recordData.sessionNumber || 1
          }
        });

        if (existingAttendance) {
          errors.push({
            index: i,
            error: 'Attendance already exists for this session',
            data: recordData
          });
          continue;
        }

        // Create attendance record
        const attendance = await Attendance.create({
          ...recordData,
          recordedBy: req.user.id,
          sessionNumber: recordData.sessionNumber || 1
        });

        createdRecords.push(attendance);
      } catch (error) {
        errors.push({
          index: i,
          error: error.message,
          data: attendanceRecords[i]
        });
      }
    }

    res.status(201).json({
      message: `Created ${createdRecords.length} attendance records successfully`,
      createdRecords: createdRecords.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Bulk create attendance error:', error);
    res.status(500).json({
      error: 'Failed to create attendance records',
      message: 'Unable to create attendance records'
    });
  }
});

// Get attendance statistics
router.get('/stats/enrollment/:enrollmentId', authenticateToken, async (req, res) => {
  try {
    const { enrollmentId } = req.params;

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
        message: 'You can only view attendance stats for your own enrollments'
      });
    }

    const attendanceRecords = await Attendance.findAll({
      where: { enrollmentId },
      order: [['sessionDate', 'ASC']]
    });

    const totalSessions = attendanceRecords.length;
    const presentSessions = attendanceRecords.filter(a => a.isPresent()).length;
    const absentSessions = attendanceRecords.filter(a => a.isAbsent()).length;
    const lateSessions = attendanceRecords.filter(a => a.isLate()).length;
    const excusedSessions = attendanceRecords.filter(a => a.isExcused()).length;

    const attendancePercentage = totalSessions > 0 ? (presentSessions / totalSessions) * 100 : 0;

    res.json({
      stats: {
        totalSessions,
        presentSessions,
        absentSessions,
        lateSessions,
        excusedSessions,
        attendancePercentage: Math.round(attendancePercentage * 100) / 100
      },
      records: attendanceRecords
    });
  } catch (error) {
    console.error('Get attendance stats error:', error);
    res.status(500).json({
      error: 'Failed to retrieve attendance statistics',
      message: 'Unable to get attendance statistics'
    });
  }
});

module.exports = router; 