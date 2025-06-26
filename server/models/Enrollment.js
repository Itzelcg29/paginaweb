const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Enrollment = sequelize.define('Enrollment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  studentId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  courseId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'courses',
      key: 'id'
    }
  },
  teacherId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('pending', 'active', 'completed', 'cancelled', 'suspended'),
    allowNull: false,
    defaultValue: 'pending'
  },
  enrollmentDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  startDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  endDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  completionDate: {
    type: DataTypes.DATEONLY
  },
  finalGrade: {
    type: DataTypes.DECIMAL(5, 2),
    validate: {
      min: 0,
      max: 100
    }
  },
  attendancePercentage: {
    type: DataTypes.DECIMAL(5, 2),
    validate: {
      min: 0,
      max: 100
    }
  },
  certificateIssued: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  certificateNumber: {
    type: DataTypes.STRING
  },
  notes: {
    type: DataTypes.TEXT
  },
  paymentStatus: {
    type: DataTypes.ENUM('pending', 'partial', 'completed', 'overdue'),
    defaultValue: 'pending'
  },
  totalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  paidAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  discountAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  discountReason: {
    type: DataTypes.STRING
  },
  paymentPlan: {
    type: DataTypes.ENUM('full', 'monthly', 'weekly'),
    defaultValue: 'full'
  },
  nextPaymentDate: {
    type: DataTypes.DATEONLY
  },
  lastPaymentDate: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'enrollments',
  timestamps: true,
  indexes: [
    {
      fields: ['studentId']
    },
    {
      fields: ['courseId']
    },
    {
      fields: ['teacherId']
    },
    {
      fields: ['status']
    },
    {
      fields: ['paymentStatus']
    },
    {
      unique: true,
      fields: ['studentId', 'courseId']
    }
  ]
});

// Instance methods
Enrollment.prototype.getRemainingAmount = function() {
  return this.totalAmount - this.paidAmount - this.discountAmount;
};

Enrollment.prototype.getPaymentProgress = function() {
  const total = this.totalAmount - this.discountAmount;
  return total > 0 ? (this.paidAmount / total) * 100 : 0;
};

Enrollment.prototype.isFullyPaid = function() {
  return this.getRemainingAmount() <= 0;
};

Enrollment.prototype.getDaysUntilNextPayment = function() {
  if (!this.nextPaymentDate) return null;
  const today = new Date();
  const nextPayment = new Date(this.nextPaymentDate);
  const diffTime = nextPayment - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

Enrollment.prototype.isPaymentOverdue = function() {
  if (this.paymentStatus !== 'partial') return false;
  const daysUntil = this.getDaysUntilNextPayment();
  return daysUntil !== null && daysUntil < 0;
};

module.exports = Enrollment; 