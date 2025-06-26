const User = require('./User');
const Course = require('./Course');
const Enrollment = require('./Enrollment');
const Grade = require('./Grade');
const Attendance = require('./Attendance');
const Payment = require('./Payment');
const Notification = require('./Notification');

// User Associations
User.hasMany(Enrollment, { as: 'studentEnrollments', foreignKey: 'studentId' });
User.hasMany(Enrollment, { as: 'teacherEnrollments', foreignKey: 'teacherId' });
User.hasMany(Grade, { as: 'gradedGrades', foreignKey: 'gradedBy' });
User.hasMany(Attendance, { as: 'recordedAttendance', foreignKey: 'recordedBy' });
User.hasMany(Attendance, { as: 'verifiedAttendance', foreignKey: 'verifiedBy' });
User.hasMany(Payment, { as: 'processedPayments', foreignKey: 'processedBy' });
User.hasMany(Payment, { as: 'refundedPayments', foreignKey: 'refundedBy' });
User.hasMany(Notification, { as: 'receivedNotifications', foreignKey: 'recipientId' });
User.hasMany(Notification, { as: 'sentNotifications', foreignKey: 'senderId' });

// Course Associations
Course.hasMany(Enrollment, { as: 'enrollments', foreignKey: 'courseId' });
Course.hasMany(Grade, { as: 'grades', foreignKey: 'courseId' });
Course.hasMany(Attendance, { as: 'attendance', foreignKey: 'courseId' });

// Enrollment Associations
Enrollment.belongsTo(User, { as: 'student', foreignKey: 'studentId' });
Enrollment.belongsTo(User, { as: 'teacher', foreignKey: 'teacherId' });
Enrollment.belongsTo(Course, { as: 'course', foreignKey: 'courseId' });
Enrollment.hasMany(Grade, { as: 'grades', foreignKey: 'enrollmentId' });
Enrollment.hasMany(Attendance, { as: 'attendance', foreignKey: 'enrollmentId' });
Enrollment.hasMany(Payment, { as: 'payments', foreignKey: 'enrollmentId' });

// Grade Associations
Grade.belongsTo(Enrollment, { as: 'enrollment', foreignKey: 'enrollmentId' });
Grade.belongsTo(User, { as: 'gradedByUser', foreignKey: 'gradedBy' });

// Attendance Associations
Attendance.belongsTo(Enrollment, { as: 'enrollment', foreignKey: 'enrollmentId' });
Attendance.belongsTo(User, { as: 'recordedByUser', foreignKey: 'recordedBy' });
Attendance.belongsTo(User, { as: 'verifiedByUser', foreignKey: 'verifiedBy' });

// Payment Associations
Payment.belongsTo(Enrollment, { as: 'enrollment', foreignKey: 'enrollmentId' });
Payment.belongsTo(User, { as: 'processedByUser', foreignKey: 'processedBy' });
Payment.belongsTo(User, { as: 'refundedByUser', foreignKey: 'refundedBy' });

// Notification Associations
Notification.belongsTo(User, { as: 'recipient', foreignKey: 'recipientId' });
Notification.belongsTo(User, { as: 'sender', foreignKey: 'senderId' });

// Add courseId to Grade and Attendance for easier queries
Grade.belongsTo(Course, { as: 'course', foreignKey: 'courseId' });
Attendance.belongsTo(Course, { as: 'course', foreignKey: 'courseId' });

// Add studentId and teacherId to Grade and Attendance for easier queries
Grade.belongsTo(User, { as: 'student', foreignKey: 'studentId' });
Attendance.belongsTo(User, { as: 'student', foreignKey: 'studentId' });

module.exports = {
  User,
  Course,
  Enrollment,
  Grade,
  Attendance,
  Payment,
  Notification
}; 