const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Grade = sequelize.define('Grade', {
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
  assessmentType: {
    type: DataTypes.ENUM('quiz', 'exam', 'homework', 'participation', 'project', 'final'),
    allowNull: false
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 100]
    }
  },
  description: {
    type: DataTypes.TEXT
  },
  score: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    validate: {
      min: 0,
      max: 100
    }
  },
  maxScore: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 100,
    validate: {
      min: 1
    }
  },
  weight: {
    type: DataTypes.DECIMAL(3, 2), // Percentage weight of this assessment
    allowNull: false,
    defaultValue: 1.00,
    validate: {
      min: 0,
      max: 1
    }
  },
  assessmentDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  dueDate: {
    type: DataTypes.DATEONLY
  },
  submittedDate: {
    type: DataTypes.DATE
  },
  feedback: {
    type: DataTypes.TEXT
  },
  comments: {
    type: DataTypes.TEXT
  },
  isLate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  latePenalty: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0
  },
  gradedBy: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  gradedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  attachments: {
    type: DataTypes.JSONB, // Array of file attachments
    defaultValue: []
  },
  rubric: {
    type: DataTypes.JSONB, // Assessment rubric
    defaultValue: {}
  },
  rubricScores: {
    type: DataTypes.JSONB, // Individual rubric scores
    defaultValue: {}
  }
}, {
  tableName: 'grades',
  timestamps: true,
  indexes: [
    {
      fields: ['enrollmentId']
    },
    {
      fields: ['assessmentType']
    },
    {
      fields: ['assessmentDate']
    },
    {
      fields: ['gradedBy']
    }
  ]
});

// Instance methods
Grade.prototype.getPercentage = function() {
  return this.maxScore > 0 ? (this.score / this.maxScore) * 100 : 0;
};

Grade.prototype.getWeightedScore = function() {
  return this.getPercentage() * this.weight;
};

Grade.prototype.getFinalScore = function() {
  return this.score - this.latePenalty;
};

Grade.prototype.isPassing = function() {
  const passingThreshold = 60; // 60% passing grade
  return this.getPercentage() >= passingThreshold;
};

Grade.prototype.getGradeLetter = function() {
  const percentage = this.getPercentage();
  if (percentage >= 90) return 'A';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
};

module.exports = Grade; 