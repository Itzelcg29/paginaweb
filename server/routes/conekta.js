const express = require('express');
const router = express.Router();
const ConektaController = require('../controllers/conektaController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Rutas públicas (webhooks)
router.post('/webhook', ConektaController.webhook);

// Rutas protegidas
router.use(authenticateToken);

// Crear orden de pago
router.post('/create-order', requireRole(['student', 'admin']), ConektaController.createOrder);

// Procesar pagos con diferentes métodos
router.post('/card-payment', requireRole(['student', 'admin']), ConektaController.processCardPayment);
router.post('/oxxo-payment', requireRole(['student', 'admin']), ConektaController.processOxxoPayment);
router.post('/spei-payment', requireRole(['student', 'admin']), ConektaController.processSpeiPayment);

// Obtener información de pago
router.get('/payment/:paymentId', requireRole(['student', 'admin', 'teacher']), ConektaController.getPaymentInfo);

// Reembolsar pago (solo admin)
router.post('/refund/:paymentId', requireRole(['admin']), ConektaController.refundPayment);

module.exports = router; 