const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  recipientId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  senderId: {
    type: DataTypes.UUID,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.ENUM(
      'course_start', 'course_end', 'payment_due', 'payment_received',
      'grade_posted', 'attendance_alert', 'assignment_due', 'general_announcement',
      'private_message', 'system_alert', 'certificate_ready', 'course_cancelled',
      'schedule_change', 'exam_reminder', 'enrollment_confirmed'
    ),
    allowNull: false
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 200]
    }
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  readAt: {
    type: DataTypes.DATE
  },
  priority: {
    type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
    defaultValue: 'normal'
  },
  category: {
    type: DataTypes.ENUM('academic', 'financial', 'administrative', 'personal', 'system'),
    defaultValue: 'general'
  },
  relatedEntityType: {
    type: DataTypes.ENUM('course', 'enrollment', 'payment', 'grade', 'attendance', 'user'),
    allowNull: true
  },
  relatedEntityId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  actionUrl: {
    type: DataTypes.STRING // URL to navigate when notification is clicked
  },
  actionText: {
    type: DataTypes.STRING // Text for action button
  },
  scheduledFor: {
    type: DataTypes.DATE // For scheduled notifications
  },
  sentAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  expiresAt: {
    type: DataTypes.DATE // Auto-delete after this date
  },
  metadata: {
    type: DataTypes.JSONB, // Additional data
    defaultValue: {}
  },
  emailSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  emailSentAt: {
    type: DataTypes.DATE
  },
  smsSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  smsSentAt: {
    type: DataTypes.DATE
  },
  pushSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  pushSentAt: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'notifications',
  timestamps: true,
  indexes: [
    {
      fields: ['recipientId']
    },
    {
      fields: ['senderId']
    },
    {
      fields: ['type']
    },
    {
      fields: ['isRead']
    },
    {
      fields: ['priority']
    },
    {
      fields: ['category']
    },
    {
      fields: ['scheduledFor']
    },
    {
      fields: ['expiresAt']
    },
    {
      fields: ['sentAt']
    }
  ]
});

// Instance methods
Notification.prototype.markAsRead = async function() {
  this.isRead = true;
  this.readAt = new Date();
  await this.save();
};

Notification.prototype.isExpired = function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

Notification.prototype.isScheduled = function() {
  return this.scheduledFor && new Date() < this.scheduledFor;
};

Notification.prototype.canBeSent = function() {
  return !this.isScheduled() && !this.isExpired();
};

Notification.prototype.getPriorityColor = function() {
  switch (this.priority) {
    case 'urgent': return 'red';
    case 'high': return 'orange';
    case 'normal': return 'blue';
    case 'low': return 'gray';
    default: return 'blue';
  }
};

Notification.prototype.getTypeIcon = function() {
  switch (this.type) {
    case 'course_start': return '🎓';
    case 'course_end': return '🎉';
    case 'payment_due': return '💰';
    case 'payment_received': return '✅';
    case 'grade_posted': return '📊';
    case 'attendance_alert': return '⚠️';
    case 'assignment_due': return '📝';
    case 'general_announcement': return '📢';
    case 'private_message': return '💬';
    case 'system_alert': return '🔔';
    case 'certificate_ready': return '🏆';
    case 'course_cancelled': return '❌';
    case 'schedule_change': return '📅';
    case 'exam_reminder': return '📚';
    case 'enrollment_confirmed': return '🎯';
    default: return '📌';
  }
};

Notification.prototype.shouldSendEmail = function() {
  return !this.emailSent && this.canBeSent();
};

Notification.prototype.shouldSendSMS = function() {
  return !this.smsSent && this.canBeSent() && this.priority === 'urgent';
};

Notification.prototype.shouldSendPush = function() {
  return !this.pushSent && this.canBeSent();
};

module.exports = Notification; 