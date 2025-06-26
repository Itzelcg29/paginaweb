const express = require('express');
const { query } = require('express-validator');
const { User, Course, Enrollment, Grade, Attendance, Payment } = require('../models');
const { authenticateToken, requireAdmin, requireTeacher } = require('../middleware/auth');
const { Op } = require('sequelize');

const router = express.Router();

// Validation middleware
const dateRangeValidation = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid date')
];

// Get dashboard overview (admin/teacher)
router.get('/dashboard', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const whereClause = {};
    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [startDate, endDate]
      };
    }

    // Get basic counts
    const totalStudents = await User.count({
      where: { 
        role: 'student',
        isActive: true,
        ...whereClause
      }
    });

    const totalTeachers = await User.count({
      where: { 
        role: 'teacher',
        isActive: true,
        ...whereClause
      }
    });

    const totalCourses = await Course.count({
      where: { 
        isActive: true,
        ...whereClause
      }
    });

    const activeEnrollments = await Enrollment.count({
      where: { 
        status: 'active',
        ...whereClause
      }
    });

    // Get recent enrollments
    const recentEnrollments = await Enrollment.findAll({
      where: { status: 'active' },
      include: [
        {
          model: User,
          as: 'student',
          attributes: ['firstName', 'lastName', 'email']
        },
        {
          model: Course,
          as: 'course',
          attributes: ['name', 'level']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    // Get recent payments
    const recentPayments = await Payment.findAll({
      where: { status: 'completed' },
      include: [
        {
          model: Enrollment,
          as: 'enrollment',
          include: [
            {
              model: User,
              as: 'student',
              attributes: ['firstName', 'lastName']
            },
            {
              model: Course,
              as: 'course',
              attributes: ['name']
            }
          ]
        }
      ],
      order: [['paymentDate', 'DESC']],
      limit: 5
    });

    // Calculate total revenue
    const totalRevenue = await Payment.sum('amount', {
      where: { 
        status: 'completed',
        ...whereClause
      }
    });

    // Get course enrollment statistics
    const courseStats = await Course.findAll({
      attributes: [
        'id',
        'name',
        'level',
        'category',
        [Op.fn('COUNT', Op.col('enrollments.id')), 'enrollmentCount']
      ],
      include: [
        {
          model: Enrollment,
          as: 'enrollments',
          attributes: [],
          where: { status: 'active' }
        }
      ],
      group: ['Course.id'],
      order: [[Op.fn('COUNT', Op.col('enrollments.id')), 'DESC']],
      limit: 10
    });

    res.json({
      overview: {
        totalStudents,
        totalTeachers,
        totalCourses,
        activeEnrollments,
        totalRevenue: totalRevenue || 0
      },
      recentEnrollments,
      recentPayments,
      courseStats
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      error: 'Failed to retrieve dashboard data',
      message: 'Unable to get dashboard overview'
    });
  }
});

// Get enrollment report
router.get('/enrollments', authenticateToken, requireTeacher, dateRangeValidation, async (req, res) => {
  try {
    const { startDate, endDate, courseId, teacherId, status } = req.query;

    const whereClause = {};
    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [startDate, endDate]
      };
    }
    if (status) whereClause.status = status;

    const includeClause = [
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
    ];

    if (courseId) {
      includeClause[2].where = { id: courseId };
    }
    if (teacherId) {
      includeClause[1].where = { id: teacherId };
    }

    // Teachers can only see their own enrollments
    if (req.user.role === 'teacher') {
      whereClause.teacherId = req.user.id;
    }

    const enrollments = await Enrollment.findAll({
      where: whereClause,
      include: includeClause,
      order: [['createdAt', 'DESC']]
    });

    // Calculate statistics
    const totalEnrollments = enrollments.length;
    const activeEnrollments = enrollments.filter(e => e.status === 'active').length;
    const completedEnrollments = enrollments.filter(e => e.status === 'completed').length;
    const cancelledEnrollments = enrollments.filter(e => e.status === 'cancelled').length;

    // Enrollments by status
    const enrollmentsByStatus = enrollments.reduce((acc, enrollment) => {
      acc[enrollment.status] = (acc[enrollment.status] || 0) + 1;
      return acc;
    }, {});

    // Enrollments by course level
    const enrollmentsByLevel = enrollments.reduce((acc, enrollment) => {
      const level = enrollment.course.level;
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {});

    res.json({
      enrollments,
      statistics: {
        total: totalEnrollments,
        active: activeEnrollments,
        completed: completedEnrollments,
        cancelled: cancelledEnrollments,
        byStatus: enrollmentsByStatus,
        byLevel: enrollmentsByLevel
      }
    });
  } catch (error) {
    console.error('Get enrollment report error:', error);
    res.status(500).json({
      error: 'Failed to retrieve enrollment report',
      message: 'Unable to get enrollment report'
    });
  }
});

// Get payment report
router.get('/payments', authenticateToken, requireAdmin, dateRangeValidation, async (req, res) => {
  try {
    const { startDate, endDate, paymentMethod, status, courseId } = req.query;

    const whereClause = {};
    if (startDate && endDate) {
      whereClause.paymentDate = {
        [Op.between]: [startDate, endDate]
      };
    }
    if (paymentMethod) whereClause.paymentMethod = paymentMethod;
    if (status) whereClause.status = status;

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

    if (courseId) {
      includeClause[0].where = { courseId };
    }

    const payments = await Payment.findAll({
      where: whereClause,
      include: includeClause,
      order: [['paymentDate', 'DESC']]
    });

    // Calculate statistics
    const totalPayments = payments.length;
    const totalAmount = payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
    const completedPayments = payments.filter(p => p.status === 'completed').length;
    const pendingPayments = payments.filter(p => p.status === 'pending').length;
    const failedPayments = payments.filter(p => p.status === 'failed').length;

    // Payments by method
    const paymentsByMethod = payments.reduce((acc, payment) => {
      acc[payment.paymentMethod] = (acc[payment.paymentMethod] || 0) + 1;
      return acc;
    }, {});

    // Payments by status
    const paymentsByStatus = payments.reduce((acc, payment) => {
      acc[payment.status] = (acc[payment.status] || 0) + 1;
      return acc;
    }, {});

    // Monthly revenue
    const monthlyRevenue = payments
      .filter(p => p.status === 'completed')
      .reduce((acc, payment) => {
        const month = new Date(payment.paymentDate).toISOString().slice(0, 7);
        acc[month] = (acc[month] || 0) + parseFloat(payment.amount);
        return acc;
      }, {});

    res.json({
      payments,
      statistics: {
        total: totalPayments,
        totalAmount,
        completed: completedPayments,
        pending: pendingPayments,
        failed: failedPayments,
        byMethod: paymentsByMethod,
        byStatus: paymentsByStatus,
        monthlyRevenue
      }
    });
  } catch (error) {
    console.error('Get payment report error:', error);
    res.status(500).json({
      error: 'Failed to retrieve payment report',
      message: 'Unable to get payment report'
    });
  }
});

// Get attendance report
router.get('/attendance', authenticateToken, requireTeacher, dateRangeValidation, async (req, res) => {
  try {
    const { startDate, endDate, courseId, studentId, status } = req.query;

    const whereClause = {};
    if (startDate && endDate) {
      whereClause.sessionDate = {
        [Op.between]: [startDate, endDate]
      };
    }
    if (status) whereClause.status = status;

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

    if (courseId) {
      includeClause[0].where = { courseId };
    }
    if (studentId) {
      includeClause[0].where = { ...includeClause[0].where, studentId };
    }

    // Teachers can only see attendance for their courses
    if (req.user.role === 'teacher') {
      whereClause.recordedBy = req.user.id;
    }

    const attendanceRecords = await Attendance.findAll({
      where: whereClause,
      include: includeClause,
      order: [['sessionDate', 'DESC']]
    });

    // Calculate statistics
    const totalSessions = attendanceRecords.length;
    const presentSessions = attendanceRecords.filter(a => a.isPresent()).length;
    const absentSessions = attendanceRecords.filter(a => a.isAbsent()).length;
    const lateSessions = attendanceRecords.filter(a => a.isLate()).length;
    const excusedSessions = attendanceRecords.filter(a => a.isExcused()).length;

    const attendancePercentage = totalSessions > 0 ? (presentSessions / totalSessions) * 100 : 0;

    // Attendance by status
    const attendanceByStatus = attendanceRecords.reduce((acc, record) => {
      acc[record.status] = (acc[record.status] || 0) + 1;
      return acc;
    }, {});

    // Attendance by student
    const attendanceByStudent = attendanceRecords.reduce((acc, record) => {
      const studentId = record.enrollment.studentId;
      const studentName = `${record.enrollment.student.firstName} ${record.enrollment.student.lastName}`;
      
      if (!acc[studentId]) {
        acc[studentId] = {
          studentId,
          studentName,
          totalSessions: 0,
          presentSessions: 0,
          absentSessions: 0,
          lateSessions: 0,
          excusedSessions: 0,
          attendancePercentage: 0
        };
      }

      acc[studentId].totalSessions++;
      if (record.isPresent()) acc[studentId].presentSessions++;
      if (record.isAbsent()) acc[studentId].absentSessions++;
      if (record.isLate()) acc[studentId].lateSessions++;
      if (record.isExcused()) acc[studentId].excusedSessions++;

      acc[studentId].attendancePercentage = (acc[studentId].presentSessions / acc[studentId].totalSessions) * 100;

      return acc;
    }, {});

    res.json({
      attendanceRecords,
      statistics: {
        totalSessions,
        presentSessions,
        absentSessions,
        lateSessions,
        excusedSessions,
        attendancePercentage: Math.round(attendancePercentage * 100) / 100,
        byStatus: attendanceByStatus,
        byStudent: Object.values(attendanceByStudent)
      }
    });
  } catch (error) {
    console.error('Get attendance report error:', error);
    res.status(500).json({
      error: 'Failed to retrieve attendance report',
      message: 'Unable to get attendance report'
    });
  }
});

// Get grade report
router.get('/grades', authenticateToken, requireTeacher, dateRangeValidation, async (req, res) => {
  try {
    const { startDate, endDate, courseId, studentId, assessmentType } = req.query;

    const whereClause = {};
    if (startDate && endDate) {
      whereClause.assessmentDate = {
        [Op.between]: [startDate, endDate]
      };
    }
    if (assessmentType) whereClause.assessmentType = assessmentType;

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

    if (courseId) {
      includeClause[0].where = { courseId };
    }
    if (studentId) {
      includeClause[0].where = { ...includeClause[0].where, studentId };
    }

    // Teachers can only see grades they created
    if (req.user.role === 'teacher') {
      whereClause.gradedBy = req.user.id;
    }

    const grades = await Grade.findAll({
      where: whereClause,
      include: includeClause,
      order: [['assessmentDate', 'DESC']]
    });

    // Calculate statistics
    const totalGrades = grades.length;
    const averageScore = grades.length > 0 ? 
      grades.reduce((sum, grade) => sum + grade.getPercentage(), 0) / grades.length : 0;

    // Grades by assessment type
    const gradesByType = grades.reduce((acc, grade) => {
      acc[grade.assessmentType] = (acc[grade.assessmentType] || 0) + 1;
      return acc;
    }, {});

    // Grades by letter grade
    const gradesByLetter = grades.reduce((acc, grade) => {
      const letter = grade.getGradeLetter();
      acc[letter] = (acc[letter] || 0) + 1;
      return acc;
    }, {});

    // Grades by student
    const gradesByStudent = grades.reduce((acc, grade) => {
      const studentId = grade.enrollment.studentId;
      const studentName = `${grade.enrollment.student.firstName} ${grade.enrollment.student.lastName}`;
      
      if (!acc[studentId]) {
        acc[studentId] = {
          studentId,
          studentName,
          totalGrades: 0,
          averageScore: 0,
          grades: []
        };
      }

      acc[studentId].totalGrades++;
      acc[studentId].grades.push({
        id: grade.id,
        title: grade.title,
        score: grade.score,
        maxScore: grade.maxScore,
        percentage: grade.getPercentage(),
        letterGrade: grade.getGradeLetter(),
        assessmentType: grade.assessmentType,
        assessmentDate: grade.assessmentDate
      });

      acc[studentId].averageScore = acc[studentId].grades.reduce((sum, g) => sum + g.percentage, 0) / acc[studentId].totalGrades;

      return acc;
    }, {});

    res.json({
      grades,
      statistics: {
        totalGrades,
        averageScore: Math.round(averageScore * 100) / 100,
        byType: gradesByType,
        byLetter: gradesByLetter,
        byStudent: Object.values(gradesByStudent)
      }
    });
  } catch (error) {
    console.error('Get grade report error:', error);
    res.status(500).json({
      error: 'Failed to retrieve grade report',
      message: 'Unable to get grade report'
    });
  }
});

// Get student performance report
router.get('/student/:studentId/performance', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;

    // Check permissions
    if (req.user.role !== 'admin' && req.user.id !== studentId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own performance report'
      });
    }

    const whereClause = { studentId };
    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [startDate, endDate]
      };
    }

    // Get student enrollments
    const enrollments = await Enrollment.findAll({
      where: whereClause,
      include: [
        {
          model: Course,
          as: 'course',
          attributes: ['id', 'name', 'level', 'category']
        },
        {
          model: User,
          as: 'teacher',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    // Get grades for all enrollments
    const enrollmentIds = enrollments.map(e => e.id);
    const grades = await Grade.findAll({
      where: { enrollmentId: enrollmentIds },
      order: [['assessmentDate', 'ASC']]
    });

    // Get attendance for all enrollments
    const attendance = await Attendance.findAll({
      where: { enrollmentId: enrollmentIds },
      order: [['sessionDate', 'ASC']]
    });

    // Get payments for all enrollments
    const payments = await Payment.findAll({
      where: { enrollmentId: enrollmentIds },
      order: [['paymentDate', 'ASC']]
    });

    // Calculate performance metrics
    const performanceData = enrollments.map(enrollment => {
      const enrollmentGrades = grades.filter(g => g.enrollmentId === enrollment.id);
      const enrollmentAttendance = attendance.filter(a => a.enrollmentId === enrollment.id);
      const enrollmentPayments = payments.filter(p => p.enrollmentId === enrollment.id);

      const averageGrade = enrollmentGrades.length > 0 ?
        enrollmentGrades.reduce((sum, grade) => sum + grade.getPercentage(), 0) / enrollmentGrades.length : 0;

      const attendancePercentage = enrollmentAttendance.length > 0 ?
        (enrollmentAttendance.filter(a => a.isPresent()).length / enrollmentAttendance.length) * 100 : 0;

      const totalPaid = enrollmentPayments
        .filter(p => p.status === 'completed')
        .reduce((sum, payment) => sum + parseFloat(payment.amount), 0);

      return {
        enrollment: enrollment.toJSON(),
        grades: enrollmentGrades,
        attendance: enrollmentAttendance,
        payments: enrollmentPayments,
        metrics: {
          averageGrade: Math.round(averageGrade * 100) / 100,
          attendancePercentage: Math.round(attendancePercentage * 100) / 100,
          totalPaid,
          remainingAmount: enrollment.totalAmount - totalPaid,
          paymentProgress: enrollment.totalAmount > 0 ? (totalPaid / enrollment.totalAmount) * 100 : 0
        }
      };
    });

    res.json({
      studentId,
      performanceData
    });
  } catch (error) {
    console.error('Get student performance report error:', error);
    res.status(500).json({
      error: 'Failed to retrieve student performance report',
      message: 'Unable to get student performance report'
    });
  }
});

// Export report to CSV
router.get('/export/:type', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { type } = req.params;
    const { startDate, endDate } = req.query;

    let data = [];
    let filename = '';

    switch (type) {
      case 'enrollments':
        data = await Enrollment.findAll({
          where: startDate && endDate ? {
            createdAt: {
              [Op.between]: [startDate, endDate]
            }
          } : {},
          include: [
            {
              model: User,
              as: 'student',
              attributes: ['firstName', 'lastName', 'email']
            },
            {
              model: User,
              as: 'teacher',
              attributes: ['firstName', 'lastName', 'email']
            },
            {
              model: Course,
              as: 'course',
              attributes: ['name', 'level', 'category']
            }
          ]
        });
        filename = `enrollments_${new Date().toISOString().split('T')[0]}.csv`;
        break;

      case 'payments':
        data = await Payment.findAll({
          where: startDate && endDate ? {
            paymentDate: {
              [Op.between]: [startDate, endDate]
            }
          } : {},
          include: [
            {
              model: Enrollment,
              as: 'enrollment',
              include: [
                {
                  model: User,
                  as: 'student',
                  attributes: ['firstName', 'lastName', 'email']
                },
                {
                  model: Course,
                  as: 'course',
                  attributes: ['name', 'level']
                }
              ]
            }
          ]
        });
        filename = `payments_${new Date().toISOString().split('T')[0]}.csv`;
        break;

      case 'attendance':
        data = await Attendance.findAll({
          where: startDate && endDate ? {
            sessionDate: {
              [Op.between]: [startDate, endDate]
            }
          } : {},
          include: [
            {
              model: Enrollment,
              as: 'enrollment',
              include: [
                {
                  model: User,
                  as: 'student',
                  attributes: ['firstName', 'lastName', 'email']
                },
                {
                  model: Course,
                  as: 'course',
                  attributes: ['name', 'level']
                }
              ]
            }
          ]
        });
        filename = `attendance_${new Date().toISOString().split('T')[0]}.csv`;
        break;

      default:
        return res.status(400).json({
          error: 'Invalid report type',
          message: 'Report type must be enrollments, payments, or attendance'
        });
    }

    // Convert to CSV format
    const csvData = convertToCSV(data, type);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvData);
  } catch (error) {
    console.error('Export report error:', error);
    res.status(500).json({
      error: 'Failed to export report',
      message: 'Unable to export report'
    });
  }
});

// Helper function to convert data to CSV
const convertToCSV = (data, type) => {
  if (data.length === 0) return '';

  let headers = [];
  let rows = [];

  switch (type) {
    case 'enrollments':
      headers = ['Student Name', 'Student Email', 'Teacher Name', 'Course Name', 'Level', 'Status', 'Enrollment Date', 'Total Amount', 'Paid Amount'];
      rows = data.map(item => [
        `${item.student.firstName} ${item.student.lastName}`,
        item.student.email,
        `${item.teacher.firstName} ${item.teacher.lastName}`,
        item.course.name,
        item.course.level,
        item.status,
        item.createdAt.toISOString().split('T')[0],
        item.totalAmount,
        item.paidAmount
      ]);
      break;

    case 'payments':
      headers = ['Student Name', 'Course Name', 'Amount', 'Payment Method', 'Status', 'Payment Date', 'Receipt Number'];
      rows = data.map(item => [
        `${item.enrollment.student.firstName} ${item.enrollment.student.lastName}`,
        item.enrollment.course.name,
        item.amount,
        item.paymentMethod,
        item.status,
        item.paymentDate.toISOString().split('T')[0],
        item.receiptNumber
      ]);
      break;

    case 'attendance':
      headers = ['Student Name', 'Course Name', 'Session Date', 'Session Number', 'Status', 'Minutes Present', 'Minutes Late'];
      rows = data.map(item => [
        `${item.enrollment.student.firstName} ${item.enrollment.student.lastName}`,
        item.enrollment.course.name,
        item.sessionDate,
        item.sessionNumber,
        item.status,
        item.minutesPresent,
        item.minutesLate
      ]);
      break;
  }

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');

  return csvContent;
};

module.exports = router; 