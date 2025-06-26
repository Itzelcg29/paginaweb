const express = require('express');
const { body } = require('express-validator');
const { Notification, User } = require('../models');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { sendNotificationEmail } = require('../utils/email');

const router = express.Router();

// Validation middleware
const notificationValidation = [
  body('recipientId')
    .isUUID()
    .withMessage('Recipient ID must be a valid UUID'),
  body('type')
    .isIn([
      'course_start', 'course_end', 'payment_due', 'payment_received',
      'grade_posted', 'attendance_alert', 'assignment_due', 'general_announcement',
      'private_message', 'system_alert', 'certificate_ready', 'course_cancelled',
      'schedule_change', 'exam_reminder', 'enrollment_confirmed'
    ])
    .withMessage('Invalid notification type'),
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('message')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message must be between 1 and 1000 characters'),
  body('priority')
    .optional()
    .isIn(['low', 'normal', 'high', 'urgent'])
    .withMessage('Priority must be low, normal, high, or urgent'),
  body('category')
    .optional()
    .isIn(['academic', 'financial', 'administrative', 'personal', 'system'])
    .withMessage('Category must be academic, financial, administrative, personal, or system'),
  body('actionUrl')
    .optional()
    .isURL()
    .withMessage('Action URL must be a valid URL'),
  body('actionText')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Action text must be less than 100 characters'),
  body('scheduledFor')
    .optional()
    .isISO8601()
    .withMessage('Scheduled date must be a valid date'),
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Expiration date must be a valid date')
];

// Get all notifications for current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      isRead, 
      type, 
      priority,
      category 
    } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = { recipientId: req.user.id };
    if (isRead !== undefined) whereClause.isRead = isRead === 'true';
    if (type) whereClause.type = type;
    if (priority) whereClause.priority = priority;
    if (category) whereClause.category = category;

    const { count, rows: notifications } = await Notification.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['sentAt', 'DESC']]
    });

    res.json({
      notifications,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      error: 'Failed to retrieve notifications',
      message: 'Unable to get notifications list'
    });
  }
});

// Get notification by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findByPk(id, {
      include: [
        {
          model: User,
          as: 'recipient',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ]
    });

    if (!notification) {
      return res.status(404).json({
        error: 'Notification not found',
        message: 'Notification does not exist'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && req.user.id !== notification.recipientId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own notifications'
      });
    }

    res.json({ notification });
  } catch (error) {
    console.error('Get notification error:', error);
    res.status(500).json({
      error: 'Failed to retrieve notification',
      message: 'Unable to get notification details'
    });
  }
});

// Create new notification (admin only)
router.post('/', authenticateToken, requireAdmin, notificationValidation, async (req, res) => {
  try {
    const notificationData = req.body;

    // Check if recipient exists
    const recipient = await User.findByPk(notificationData.recipientId);
    if (!recipient) {
      return res.status(404).json({
        error: 'Recipient not found',
        message: 'Recipient does not exist'
      });
    }

    // Create notification
    const notification = await Notification.create({
      ...notificationData,
      senderId: req.user.id
    });

    // Send email notification if not scheduled
    if (!notification.isScheduled()) {
      try {
        await sendNotificationEmail(notification);
      } catch (emailError) {
        console.error('Email notification error:', emailError);
      }
    }

    res.status(201).json({
      message: 'Notification created successfully',
      notification: notification.toJSON()
    });
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({
      error: 'Failed to create notification',
      message: 'Unable to create notification'
    });
  }
});

// Mark notification as read
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findByPk(id);
    if (!notification) {
      return res.status(404).json({
        error: 'Notification not found',
        message: 'Notification does not exist'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && req.user.id !== notification.recipientId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only mark your own notifications as read'
      });
    }

    // Mark as read
    await notification.markAsRead();

    res.json({
      message: 'Notification marked as read',
      notification: notification.toJSON()
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({
      error: 'Failed to mark notification as read',
      message: 'Unable to mark notification as read'
    });
  }
});

// Mark all notifications as read
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    await Notification.update(
      { 
        isRead: true, 
        readAt: new Date() 
      },
      { 
        where: { 
          recipientId: req.user.id,
          isRead: false
        } 
      }
    );

    res.json({
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({
      error: 'Failed to mark notifications as read',
      message: 'Unable to mark notifications as read'
    });
  }
});

// Delete notification
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findByPk(id);
    if (!notification) {
      return res.status(404).json({
        error: 'Notification not found',
        message: 'Notification does not exist'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && req.user.id !== notification.recipientId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only delete your own notifications'
      });
    }

    // Delete notification
    await notification.destroy();

    res.json({
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      error: 'Failed to delete notification',
      message: 'Unable to delete notification'
    });
  }
});

// Get unread notifications count
router.get('/unread/count', authenticateToken, async (req, res) => {
  try {
    const count = await Notification.count({
      where: {
        recipientId: req.user.id,
        isRead: false
      }
    });

    res.json({ unreadCount: count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      error: 'Failed to get unread count',
      message: 'Unable to get unread notifications count'
    });
  }
});

// Send bulk notifications (admin only)
router.post('/bulk', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { notifications, recipientIds } = req.body;

    if (!notifications || !Array.isArray(notifications)) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Notifications array is required'
      });
    }

    if (!recipientIds || !Array.isArray(recipientIds)) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Recipient IDs array is required'
      });
    }

    const createdNotifications = [];
    const errors = [];

    for (const recipientId of recipientIds) {
      for (const notificationData of notifications) {
        try {
          // Check if recipient exists
          const recipient = await User.findByPk(recipientId);
          if (!recipient) {
            errors.push({
              recipientId,
              error: 'Recipient not found',
              data: notificationData
            });
            continue;
          }

          // Create notification
          const notification = await Notification.create({
            ...notificationData,
            recipientId,
            senderId: req.user.id
          });

          // Send email notification if not scheduled
          if (!notification.isScheduled()) {
            try {
              await sendNotificationEmail(notification);
            } catch (emailError) {
              console.error('Email notification error:', emailError);
            }
          }

          createdNotifications.push(notification);
        } catch (error) {
          errors.push({
            recipientId,
            error: error.message,
            data: notificationData
          });
        }
      }
    }

    res.status(201).json({
      message: `Created ${createdNotifications.length} notifications successfully`,
      createdNotifications: createdNotifications.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Bulk create notifications error:', error);
    res.status(500).json({
      error: 'Failed to create notifications',
      message: 'Unable to create notifications'
    });
  }
});

// Get notification statistics
router.get('/stats/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const totalNotifications = await Notification.count();
    const unreadNotifications = await Notification.count({
      where: { isRead: false }
    });
    const readNotifications = await Notification.count({
      where: { isRead: true }
    });

    // Notifications by type
    const notificationsByType = await Notification.findAll({
      attributes: [
        'type',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
      ],
      group: ['type'],
      raw: true
    });

    // Notifications by priority
    const notificationsByPriority = await Notification.findAll({
      attributes: [
        'priority',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
      ],
      group: ['priority'],
      raw: true
    });

    // Recent notifications (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentNotifications = await Notification.count({
      where: {
        sentAt: {
          [require('sequelize').Op.gte]: sevenDaysAgo
        }
      }
    });

    res.json({
      stats: {
        total: totalNotifications,
        unread: unreadNotifications,
        read: readNotifications,
        recent: recentNotifications
      },
      byType: notificationsByType,
      byPriority: notificationsByPriority
    });
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({
      error: 'Failed to retrieve notification statistics',
      message: 'Unable to get notification statistics'
    });
  }
});

// Get user notification preferences
router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    // For now, return default preferences
    // In a full implementation, you would store user preferences in a separate table
    const preferences = {
      emailNotifications: true,
      smsNotifications: false,
      pushNotifications: true,
      notificationTypes: {
        course_start: true,
        course_end: true,
        payment_due: true,
        payment_received: true,
        grade_posted: true,
        attendance_alert: true,
        assignment_due: true,
        general_announcement: true,
        private_message: true,
        system_alert: true,
        certificate_ready: true,
        course_cancelled: true,
        schedule_change: true,
        exam_reminder: true,
        enrollment_confirmed: true
      }
    };

    res.json({ preferences });
  } catch (error) {
    console.error('Get notification preferences error:', error);
    res.status(500).json({
      error: 'Failed to retrieve notification preferences',
      message: 'Unable to get notification preferences'
    });
  }
});

// Update user notification preferences
router.put('/preferences', authenticateToken, async (req, res) => {
  try {
    const { emailNotifications, smsNotifications, pushNotifications, notificationTypes } = req.body;

    // In a full implementation, you would update user preferences in a separate table
    // For now, just return success
    const preferences = {
      emailNotifications: emailNotifications !== undefined ? emailNotifications : true,
      smsNotifications: smsNotifications !== undefined ? smsNotifications : false,
      pushNotifications: pushNotifications !== undefined ? pushNotifications : true,
      notificationTypes: notificationTypes || {
        course_start: true,
        course_end: true,
        payment_due: true,
        payment_received: true,
        grade_posted: true,
        attendance_alert: true,
        assignment_due: true,
        general_announcement: true,
        private_message: true,
        system_alert: true,
        certificate_ready: true,
        course_cancelled: true,
        schedule_change: true,
        exam_reminder: true,
        enrollment_confirmed: true
      }
    };

    res.json({
      message: 'Notification preferences updated successfully',
      preferences
    });
  } catch (error) {
    console.error('Update notification preferences error:', error);
    res.status(500).json({
      error: 'Failed to update notification preferences',
      message: 'Unable to update notification preferences'
    });
  }
});

module.exports = router; 