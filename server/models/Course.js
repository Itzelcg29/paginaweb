const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Course = sequelize.define('Course', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [3, 100]
    }
  },
  description: {
    type: DataTypes.TEXT
  },
  level: {
    type: DataTypes.ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2'),
    allowNull: false
  },
  category: {
    type: DataTypes.ENUM('basic', 'intermediate', 'advanced', 'conversation', 'business', 'exam_preparation'),
    allowNull: false
  },
  duration: {
    type: DataTypes.INTEGER, // Duration in weeks
    allowNull: false,
    validate: {
      min: 1,
      max: 52
    }
  },
  sessionsPerWeek: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 2,
    validate: {
      min: 1,
      max: 7
    }
  },
  sessionDuration: {
    type: DataTypes.INTEGER, // Duration in minutes
    allowNull: false,
    defaultValue: 90,
    validate: {
      min: 30,
      max: 240
    }
  },
  maxStudents: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 15,
    validate: {
      min: 1,
      max: 50
    }
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'MXN'
  },
  startDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  endDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  schedule: {
    type: DataTypes.JSONB, // Array of schedule objects
    allowNull: false
  },
  classroom: {
    type: DataTypes.STRING
  },
  materials: {
    type: DataTypes.JSONB, // Array of material objects
    defaultValue: []
  },
  syllabus: {
    type: DataTypes.JSONB, // Array of syllabus items
    defaultValue: []
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isOnline: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  meetingLink: {
    type: DataTypes.STRING
  },
  requirements: {
    type: DataTypes.TEXT
  },
  objectives: {
    type: DataTypes.JSONB, // Array of learning objectives
    defaultValue: []
  },
  image: {
    type: DataTypes.STRING
  }
}, {
  tableName: 'courses',
  timestamps: true,
  indexes: [
    {
      fields: ['level']
    },
    {
      fields: ['category']
    },
    {
      fields: ['isActive']
    },
    {
      fields: ['startDate']
    }
  ]
});

// Instance methods
Course.prototype.getCurrentEnrollmentCount = async function() {
  const { Enrollment } = require('./Enrollment');
  return await Enrollment.count({
    where: {
      courseId: this.id,
      status: 'active'
    }
  });
};

Course.prototype.isFull = async function() {
  const enrollmentCount = await this.getCurrentEnrollmentCount();
  return enrollmentCount >= this.maxStudents;
};

Course.prototype.getAvailableSpots = async function() {
  const enrollmentCount = await this.getCurrentEnrollmentCount();
  return Math.max(0, this.maxStudents - enrollmentCount);
};

Course.prototype.getTotalSessions = function() {
  return this.duration * this.sessionsPerWeek;
};

Course.prototype.getTotalHours = function() {
  return (this.getTotalSessions() * this.sessionDuration) / 60;
};

module.exports = Course; 