const Conekta = require('conekta');
const { Payment, Enrollment, User, Course } = require('../models');
const { sendPaymentConfirmationEmail } = require('../utils/email');

// Configurar Conekta
Conekta.api_key = process.env.CONEKTA_PRIVATE_KEY;
Conekta.api_version = '2.0.0';

class ConektaController {
  // Crear orden de pago
  static async createOrder(req, res) {
    try {
      const { enrollmentId, paymentMethod, customerInfo } = req.body;

      // Verificar que la inscripción existe
      const enrollment = await Enrollment.findByPk(enrollmentId, {
        include: [
          { model: User, as: 'student' },
          { model: Course, as: 'course' }
        ]
      });

      if (!enrollment) {
        return res.status(404).json({
          success: false,
          message: 'Enrollment not found'
        });
      }

      // Crear orden en Conekta
      const orderData = {
        amount: enrollment.course.price * 100, // Conekta usa centavos
        currency: 'MXN',
        customer_info: {
          name: customerInfo.name,
          email: customerInfo.email,
          phone: customerInfo.phone
        },
        line_items: [{
          name: enrollment.course.name,
          unit_price: enrollment.course.price * 100,
          quantity: 1
        }],
        charges: [{
          payment_method: {
            type: paymentMethod.type,
            token_id: paymentMethod.tokenId
          }
        }]
      };

      const order = await Conekta.Order.create(orderData);

      // Crear registro de pago en la base de datos
      const payment = await Payment.create({
        enrollmentId,
        studentId: enrollment.studentId,
        amount: enrollment.course.price,
        currency: 'MXN',
        method: 'conekta',
        status: order.charges.data[0].status === 'paid' ? 'completed' : 'pending',
        transactionId: order.id,
        description: `Payment for ${enrollment.course.name}`,
        dueDate: new Date(),
        paidDate: order.charges.data[0].status === 'paid' ? new Date() : null
      });

      // Si el pago fue exitoso, enviar email de confirmación
      if (order.charges.data[0].status === 'paid') {
        await sendPaymentConfirmationEmail(
          enrollment.student.email,
          enrollment.student.firstName,
          enrollment.course.name,
          payment.amount
        );
      }

      res.json({
        success: true,
        data: {
          order: order,
          payment: payment
        },
        message: 'Payment processed successfully'
      });

    } catch (error) {
      console.error('Conekta payment error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Payment processing failed'
      });
    }
  }

  // Procesar pago con tarjeta
  static async processCardPayment(req, res) {
    try {
      const { enrollmentId, cardToken, customerInfo } = req.body;

      const enrollment = await Enrollment.findByPk(enrollmentId, {
        include: [
          { model: User, as: 'student' },
          { model: Course, as: 'course' }
        ]
      });

      if (!enrollment) {
        return res.status(404).json({
          success: false,
          message: 'Enrollment not found'
        });
      }

      const orderData = {
        amount: enrollment.course.price * 100,
        currency: 'MXN',
        customer_info: {
          name: customerInfo.name,
          email: customerInfo.email,
          phone: customerInfo.phone
        },
        line_items: [{
          name: enrollment.course.name,
          unit_price: enrollment.course.price * 100,
          quantity: 1
        }],
        charges: [{
          payment_method: {
            type: 'card',
            token_id: cardToken
          }
        }]
      };

      const order = await Conekta.Order.create(orderData);

      const payment = await Payment.create({
        enrollmentId,
        studentId: enrollment.studentId,
        amount: enrollment.course.price,
        currency: 'MXN',
        method: 'conekta_card',
        status: order.charges.data[0].status === 'paid' ? 'completed' : 'pending',
        transactionId: order.id,
        description: `Card payment for ${enrollment.course.name}`,
        dueDate: new Date(),
        paidDate: order.charges.data[0].status === 'paid' ? new Date() : null
      });

      if (order.charges.data[0].status === 'paid') {
        await sendPaymentConfirmationEmail(
          enrollment.student.email,
          enrollment.student.firstName,
          enrollment.course.name,
          payment.amount
        );
      }

      res.json({
        success: true,
        data: {
          order: order,
          payment: payment
        },
        message: 'Card payment processed successfully'
      });

    } catch (error) {
      console.error('Conekta card payment error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Card payment processing failed'
      });
    }
  }

  // Procesar pago con OXXO
  static async processOxxoPayment(req, res) {
    try {
      const { enrollmentId, customerInfo } = req.body;

      const enrollment = await Enrollment.findByPk(enrollmentId, {
        include: [
          { model: User, as: 'student' },
          { model: Course, as: 'course' }
        ]
      });

      if (!enrollment) {
        return res.status(404).json({
          success: false,
          message: 'Enrollment not found'
        });
      }

      const orderData = {
        amount: enrollment.course.price * 100,
        currency: 'MXN',
        customer_info: {
          name: customerInfo.name,
          email: customerInfo.email,
          phone: customerInfo.phone
        },
        line_items: [{
          name: enrollment.course.name,
          unit_price: enrollment.course.price * 100,
          quantity: 1
        }],
        charges: [{
          payment_method: {
            type: 'oxxo_cash',
            expires_at: Math.floor(Date.now() / 1000) + (3 * 24 * 60 * 60) // 3 días
          }
        }]
      };

      const order = await Conekta.Order.create(orderData);

      const payment = await Payment.create({
        enrollmentId,
        studentId: enrollment.studentId,
        amount: enrollment.course.price,
        currency: 'MXN',
        method: 'conekta_oxxo',
        status: 'pending',
        transactionId: order.id,
        description: `OXXO payment for ${enrollment.course.name}`,
        dueDate: new Date(Date.now() + (3 * 24 * 60 * 60 * 1000)), // 3 días
        paidDate: null
      });

      res.json({
        success: true,
        data: {
          order: order,
          payment: payment,
          oxxo_reference: order.charges.data[0].payment_method.reference
        },
        message: 'OXXO payment created successfully'
      });

    } catch (error) {
      console.error('Conekta OXXO payment error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'OXXO payment processing failed'
      });
    }
  }

  // Procesar pago con SPEI
  static async processSpeiPayment(req, res) {
    try {
      const { enrollmentId, customerInfo } = req.body;

      const enrollment = await Enrollment.findByPk(enrollmentId, {
        include: [
          { model: User, as: 'student' },
          { model: Course, as: 'course' }
        ]
      });

      if (!enrollment) {
        return res.status(404).json({
          success: false,
          message: 'Enrollment not found'
        });
      }

      const orderData = {
        amount: enrollment.course.price * 100,
        currency: 'MXN',
        customer_info: {
          name: customerInfo.name,
          email: customerInfo.email,
          phone: customerInfo.phone
        },
        line_items: [{
          name: enrollment.course.name,
          unit_price: enrollment.course.price * 100,
          quantity: 1
        }],
        charges: [{
          payment_method: {
            type: 'spei',
            expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 horas
          }
        }]
      };

      const order = await Conekta.Order.create(orderData);

      const payment = await Payment.create({
        enrollmentId,
        studentId: enrollment.studentId,
        amount: enrollment.course.price,
        currency: 'MXN',
        method: 'conekta_spei',
        status: 'pending',
        transactionId: order.id,
        description: `SPEI payment for ${enrollment.course.name}`,
        dueDate: new Date(Date.now() + (24 * 60 * 60 * 1000)), // 24 horas
        paidDate: null
      });

      res.json({
        success: true,
        data: {
          order: order,
          payment: payment,
          spei_reference: order.charges.data[0].payment_method.reference
        },
        message: 'SPEI payment created successfully'
      });

    } catch (error) {
      console.error('Conekta SPEI payment error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'SPEI payment processing failed'
      });
    }
  }

  // Webhook para recibir notificaciones de Conekta
  static async webhook(req, res) {
    try {
      const event = req.body;

      // Verificar la firma del webhook
      const signature = req.headers['conekta-signature'];
      if (!signature) {
        return res.status(400).json({ error: 'No signature provided' });
      }

      // Procesar diferentes tipos de eventos
      switch (event.type) {
        case 'order.paid':
          await ConektaController.handleOrderPaid(event);
          break;
        case 'order.expired':
          await ConektaController.handleOrderExpired(event);
          break;
        case 'charge.failed':
          await ConektaController.handleChargeFailed(event);
          break;
        default:
          console.log('Unhandled event type:', event.type);
      }

      res.json({ received: true });

    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  // Manejar orden pagada
  static async handleOrderPaid(event) {
    try {
      const orderId = event.data.object.id;
      
      const payment = await Payment.findOne({
        where: { transactionId: orderId }
      });

      if (payment) {
        payment.status = 'completed';
        payment.paidDate = new Date();
        await payment.save();

        // Enviar email de confirmación
        const enrollment = await Enrollment.findByPk(payment.enrollmentId, {
          include: [
            { model: User, as: 'student' },
            { model: Course, as: 'course' }
          ]
        });

        if (enrollment) {
          await sendPaymentConfirmationEmail(
            enrollment.student.email,
            enrollment.student.firstName,
            enrollment.course.name,
            payment.amount
          );
        }
      }
    } catch (error) {
      console.error('Error handling order paid:', error);
    }
  }

  // Manejar orden expirada
  static async handleOrderExpired(event) {
    try {
      const orderId = event.data.object.id;
      
      const payment = await Payment.findOne({
        where: { transactionId: orderId }
      });

      if (payment) {
        payment.status = 'failed';
        await payment.save();
      }
    } catch (error) {
      console.error('Error handling order expired:', error);
    }
  }

  // Manejar cargo fallido
  static async handleChargeFailed(event) {
    try {
      const orderId = event.data.object.order_id;
      
      const payment = await Payment.findOne({
        where: { transactionId: orderId }
      });

      if (payment) {
        payment.status = 'failed';
        await payment.save();
      }
    } catch (error) {
      console.error('Error handling charge failed:', error);
    }
  }

  // Obtener información de un pago
  static async getPaymentInfo(req, res) {
    try {
      const { paymentId } = req.params;

      const payment = await Payment.findByPk(paymentId, {
        include: [
          { model: Enrollment, as: 'enrollment' },
          { model: User, as: 'student' }
        ]
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      // Obtener información de la orden de Conekta
      let conektaOrder = null;
      if (payment.transactionId) {
        try {
          conektaOrder = await Conekta.Order.find(payment.transactionId);
        } catch (error) {
          console.error('Error fetching Conekta order:', error);
        }
      }

      res.json({
        success: true,
        data: {
          payment: payment,
          conektaOrder: conektaOrder
        }
      });

    } catch (error) {
      console.error('Error getting payment info:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving payment information'
      });
    }
  }

  // Reembolsar pago
  static async refundPayment(req, res) {
    try {
      const { paymentId } = req.params;
      const { reason } = req.body;

      const payment = await Payment.findByPk(paymentId);

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      if (payment.status !== 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Payment cannot be refunded'
        });
      }

      // Procesar reembolso en Conekta
      const charge = await Conekta.Charge.find(payment.transactionId);
      const refund = await charge.refund();

      // Actualizar estado del pago
      payment.status = 'refunded';
      await payment.save();

      res.json({
        success: true,
        data: {
          refund: refund,
          payment: payment
        },
        message: 'Payment refunded successfully'
      });

    } catch (error) {
      console.error('Error refunding payment:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing refund'
      });
    }
  }
}

module.exports = ConektaController; 