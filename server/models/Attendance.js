const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Attendance = sequelize.define('Attendance', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  enrollmentId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'enrollments',
      key: 'id'
    }
  },
  sessionDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  sessionNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1
    }
  },
  status: {
    type: DataTypes.ENUM('present', 'absent', 'late', 'excused', 'tardy'),
    allowNull: false,
    defaultValue: 'present'
  },
  arrivalTime: {
    type: DataTypes.TIME
  },
  departureTime: {
    type: DataTypes.TIME
  },
  minutesLate: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  minutesPresent: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  excuse: {
    type: DataTypes.TEXT
  },
  excuseDocument: {
    type: DataTypes.STRING // File path
  },
  notes: {
    type: DataTypes.TEXT
  },
  recordedBy: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  recordedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  verifiedBy: {
    type: DataTypes.UUID,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  verifiedAt: {
    type: DataTypes.DATE
  },
  isOnline: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  onlinePlatform: {
    type: DataTypes.STRING
  },
  onlineSessionId: {
    type: DataTypes.STRING
  },
  participationScore: {
    type: DataTypes.DECIMAL(3, 2),
    validate: {
      min: 0,
      max: 1
    }
  }
}, {
  tableName: 'attendance',
  timestamps: true,
  indexes: [
    {
      fields: ['enrollmentId']
    },
    {
      fields: ['sessionDate']
    },
    {
      fields: ['status']
    },
    {
      fields: ['recordedBy']
    },
    {
      unique: true,
      fields: ['enrollmentId', 'sessionDate', 'sessionNumber']
    }
  ]
});

// Instance methods
Attendance.prototype.isPresent = function() {
  return ['present', 'late', 'tardy'].includes(this.status);
};

Attendance.prototype.isAbsent = function() {
  return ['absent'].includes(this.status);
};

Attendance.prototype.isExcused = function() {
  return ['excused'].includes(this.status);
};

Attendance.prototype.getAttendancePercentage = function() {
  if (this.minutesPresent === 0) return 0;
  const totalMinutes = this.minutesPresent + this.minutesLate;
  return totalMinutes > 0 ? (this.minutesPresent / totalMinutes) * 100 : 0;
};

Attendance.prototype.isLate = function() {
  return this.minutesLate > 0;
};

Attendance.prototype.getStatusColor = function() {
  switch (this.status) {
    case 'present': return 'green';
    case 'late': return 'yellow';
    case 'tardy': return 'orange';
    case 'absent': return 'red';
    case 'excused': return 'blue';
    default: return 'gray';
  }
};

module.exports = Attendance; 