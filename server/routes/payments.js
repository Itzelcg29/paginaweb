const express = require('express');
const { body } = require('express-validator');
const { Payment, Enrollment, User, Course } = require('../models');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

// Validation middleware
const paymentValidation = [
  body('enrollmentId')
    .isUUID()
    .withMessage('Enrollment ID must be a valid UUID'),
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  body('paymentMethod')
    .isIn(['cash', 'card', 'transfer', 'stripe', 'paypal', 'conekta'])
    .withMessage('Payment method must be cash, card, transfer, stripe, paypal, or conekta'),
  body('paymentType')
    .isIn(['full', 'partial', 'installment', 'refund'])
    .withMessage('Payment type must be full, partial, installment, or refund'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date'),
  body('installmentNumber')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Installment number must be a positive integer'),
  body('totalInstallments')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Total installments must be a positive integer')
];

// Get all payments (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      paymentMethod, 
      enrollmentId,
      startDate,
      endDate 
    } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (status) whereClause.status = status;
    if (paymentMethod) whereClause.paymentMethod = paymentMethod;
    if (enrollmentId) whereClause.enrollmentId = enrollmentId;
    if (startDate && endDate) {
      whereClause.paymentDate = {
        [require('sequelize').Op.between]: [startDate, endDate]
      };
    }

    const { count, rows: payments } = await Payment.findAndCountAll({
      where: whereClause,
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
          as: 'processedByUser',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['paymentDate', 'DESC']]
    });

    res.json({
      payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({
      error: 'Failed to retrieve payments',
      message: 'Unable to get payments list'
    });
  }
});

// Get payment by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await Payment.findByPk(id, {
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
          as: 'processedByUser',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found',
        message: 'Payment does not exist'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && 
        req.user.id !== payment.enrollment.studentId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own payments'
      });
    }

    res.json({ payment });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({
      error: 'Failed to retrieve payment',
      message: 'Unable to get payment details'
    });
  }
});

// Create new payment (admin only)
router.post('/', authenticateToken, requireAdmin, paymentValidation, async (req, res) => {
  try {
    const paymentData = req.body;

    // Check if enrollment exists
    const enrollment = await Enrollment.findByPk(paymentData.enrollmentId);
    if (!enrollment) {
      return res.status(404).json({
        error: 'Enrollment not found',
        message: 'Enrollment does not exist'
      });
    }

    // Check if enrollment is active
    if (enrollment.status !== 'active') {
      return res.status(400).json({
        error: 'Enrollment not active',
        message: 'Cannot process payment for inactive enrollment'
      });
    }

    // Generate transaction ID and receipt number
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const receiptNumber = paymentData.paymentMethod === 'stripe' ? 
      `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` : 
      null;

    // Create payment
    const payment = await Payment.create({
      ...paymentData,
      transactionId,
      receiptNumber,
      processedBy: req.user.id
    });

    // Update enrollment payment status
    const totalPaid = await Payment.sum('amount', {
      where: {
        enrollmentId: paymentData.enrollmentId,
        status: 'completed'
      }
    });

    const remainingAmount = enrollment.totalAmount - totalPaid;
    let paymentStatus = 'pending';

    if (remainingAmount <= 0) {
      paymentStatus = 'completed';
    } else if (totalPaid > 0) {
      paymentStatus = 'partial';
    }

    await enrollment.update({
      paidAmount: totalPaid,
      paymentStatus,
      lastPaymentDate: new Date()
    });

    res.status(201).json({
      message: 'Payment created successfully',
      payment: payment.toJSON()
    });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({
      error: 'Failed to create payment',
      message: 'Unable to create payment'
    });
  }
});

// Update payment (admin only)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const payment = await Payment.findByPk(id);
    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found',
        message: 'Payment does not exist'
      });
    }

    // Update payment
    await payment.update(updateData);

    res.json({
      message: 'Payment updated successfully',
      payment: payment.toJSON()
    });
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({
      error: 'Failed to update payment',
      message: 'Unable to update payment'
    });
  }
});

// Process Stripe payment
router.post('/stripe/create-payment-intent', authenticateToken, async (req, res) => {
  try {
    const { enrollmentId, amount, currency = 'mxn' } = req.body;

    // Check if enrollment exists
    const enrollment = await Enrollment.findByPk(enrollmentId, {
      include: [
        {
          model: User,
          as: 'student'
        },
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

    // Check permissions
    if (req.user.role !== 'admin' && req.user.id !== enrollment.studentId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only process payments for your own enrollments'
      });
    }

    // Create payment intent with Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      metadata: {
        enrollmentId,
        studentId: enrollment.studentId,
        courseId: enrollment.courseId,
        courseName: enrollment.course.name
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Create payment intent error:', error);
    res.status(500).json({
      error: 'Failed to create payment intent',
      message: 'Unable to create payment intent'
    });
  }
});

// Stripe webhook handler
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        
        // Find or create payment record
        let payment = await Payment.findOne({
          where: { externalPaymentId: paymentIntent.id }
        });

        if (!payment) {
          // Create new payment record
          const enrollmentId = paymentIntent.metadata.enrollmentId;
          const enrollment = await Enrollment.findByPk(enrollmentId);
          
          if (enrollment) {
            payment = await Payment.create({
              enrollmentId,
              amount: paymentIntent.amount / 100, // Convert from cents
              currency: paymentIntent.currency.toUpperCase(),
              paymentMethod: 'stripe',
              paymentType: 'partial',
              status: 'completed',
              externalPaymentId: paymentIntent.id,
              transactionId: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              receiptNumber: `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              processedBy: enrollment.teacherId, // Default to teacher
              paymentDate: new Date(),
              metadata: {
                stripePaymentIntentId: paymentIntent.id,
                stripeCustomerId: paymentIntent.customer
              }
            });

            // Update enrollment payment status
            const totalPaid = await Payment.sum('amount', {
              where: {
                enrollmentId,
                status: 'completed'
              }
            });

            const remainingAmount = enrollment.totalAmount - totalPaid;
            let paymentStatus = 'pending';

            if (remainingAmount <= 0) {
              paymentStatus = 'completed';
            } else if (totalPaid > 0) {
              paymentStatus = 'partial';
            }

            await enrollment.update({
              paidAmount: totalPaid,
              paymentStatus,
              lastPaymentDate: new Date()
            });
          }
        }
        break;

      case 'payment_intent.payment_failed':
        const failedPaymentIntent = event.data.object;
        
        // Update payment status to failed
        await Payment.update(
          { status: 'failed' },
          { where: { externalPaymentId: failedPaymentIntent.id } }
        );
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Get payments by enrollment
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
    if (req.user.role !== 'admin' && req.user.id !== enrollment.studentId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view payments for your own enrollments'
      });
    }

    const { count, rows: payments } = await Payment.findAndCountAll({
      where: { enrollmentId },
      include: [
        {
          model: User,
          as: 'processedByUser',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['paymentDate', 'DESC']]
    });

    res.json({
      payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get enrollment payments error:', error);
    res.status(500).json({
      error: 'Failed to retrieve enrollment payments',
      message: 'Unable to get enrollment payments'
    });
  }
});

// Get payments by student
router.get('/student/:studentId', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { page = 1, limit = 10, courseId } = req.query;
    const offset = (page - 1) * limit;

    // Check permissions
    if (req.user.role !== 'admin' && req.user.id !== studentId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own payments'
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

    const { count, rows: payments } = await Payment.findAndCountAll({
      include: includeClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['paymentDate', 'DESC']]
    });

    res.json({
      payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get student payments error:', error);
    res.status(500).json({
      error: 'Failed to retrieve student payments',
      message: 'Unable to get student payments'
    });
  }
});

// Process refund
router.post('/:id/refund', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { refundAmount, refundReason } = req.body;

    const payment = await Payment.findByPk(id);
    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found',
        message: 'Payment does not exist'
      });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({
        error: 'Payment not completed',
        message: 'Only completed payments can be refunded'
      });
    }

    if (refundAmount > payment.amount) {
      return res.status(400).json({
        error: 'Invalid refund amount',
        message: 'Refund amount cannot exceed payment amount'
      });
    }

    // Process refund with Stripe if it's a Stripe payment
    if (payment.paymentMethod === 'stripe' && payment.externalPaymentId) {
      try {
        const refund = await stripe.refunds.create({
          payment_intent: payment.externalPaymentId,
          amount: Math.round(refundAmount * 100) // Convert to cents
        });

        // Update payment record
        await payment.update({
          status: 'refunded',
          refundAmount,
          refundReason,
          refundedBy: req.user.id,
          refundedAt: new Date(),
          metadata: {
            ...payment.metadata,
            stripeRefundId: refund.id
          }
        });
      } catch (stripeError) {
        console.error('Stripe refund error:', stripeError);
        return res.status(500).json({
          error: 'Refund failed',
          message: 'Unable to process refund with payment processor'
        });
      }
    } else {
      // Manual refund for non-Stripe payments
      await payment.update({
        status: 'refunded',
        refundAmount,
        refundReason,
        refundedBy: req.user.id,
        refundedAt: new Date()
      });
    }

    res.json({
      message: 'Refund processed successfully',
      payment: payment.toJSON()
    });
  } catch (error) {
    console.error('Process refund error:', error);
    res.status(500).json({
      error: 'Failed to process refund',
      message: 'Unable to process refund'
    });
  }
});

module.exports = router; 