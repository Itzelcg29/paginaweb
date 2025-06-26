# Integración con Conekta - ERP Escuela de Inglés

## 📋 Descripción General

Esta documentación describe la integración completa con Conekta para el procesamiento de pagos en el sistema ERP de la escuela de inglés. Conekta es una plataforma de pagos líder en México que permite procesar pagos con tarjetas, OXXO Pay y SPEI.

## 🚀 Características Implementadas

### ✅ Métodos de Pago Soportados
- **Tarjetas de crédito/débito** (Visa, MasterCard, American Express)
- **OXXO Pay** (Pagos en efectivo en tiendas OXXO)
- **SPEI** (Transferencias bancarias electrónicas)

### ✅ Funcionalidades
- Creación de órdenes de pago
- Procesamiento de pagos en tiempo real
- Webhooks para notificaciones automáticas
- Manejo de reembolsos
- Gestión de estados de pago
- Envío de emails de confirmación

## 🔧 Configuración

### Variables de Entorno

#### Backend (.env)
```bash
# Conekta Configuration
CONEKTA_PRIVATE_KEY=key_your_conekta_private_key
CONEKTA_PUBLIC_KEY=key_your_conekta_public_key
CONEKTA_WEBHOOK_SECRET=whsec_your_conekta_webhook_secret
```

#### Frontend (.env)
```bash
# Conekta Configuration
REACT_APP_CONEKTA_PUBLIC_KEY=key_your_conekta_public_key
```

### Configuración de Conekta

1. **Crear cuenta en Conekta**
   - Registrarse en [conekta.com](https://conekta.com)
   - Verificar la cuenta de negocio

2. **Obtener las claves API**
   - Clave privada: Para el backend
   - Clave pública: Para el frontend
   - Webhook secret: Para verificar notificaciones

3. **Configurar webhooks**
   - URL: `https://tu-dominio.com/api/conekta/webhook`
   - Eventos: `order.paid`, `order.expired`, `charge.failed`

## 📡 Endpoints API

### Backend

#### POST `/api/conekta/create-order`
Crea una nueva orden de pago.

**Body:**
```json
{
  "enrollmentId": 1,
  "paymentMethod": {
    "type": "card",
    "tokenId": "tok_test_visa_4242"
  },
  "customerInfo": {
    "name": "Juan Pérez",
    "email": "juan@ejemplo.com",
    "phone": "+52 55 1234 5678"
  }
}
```

#### POST `/api/conekta/card-payment`
Procesa pago con tarjeta.

**Body:**
```json
{
  "enrollmentId": 1,
  "cardToken": "tok_test_visa_4242",
  "customerInfo": {
    "name": "Juan Pérez",
    "email": "juan@ejemplo.com",
    "phone": "+52 55 1234 5678"
  }
}
```

#### POST `/api/conekta/oxxo-payment`
Crea pago con OXXO Pay.

**Body:**
```json
{
  "enrollmentId": 1,
  "customerInfo": {
    "name": "Juan Pérez",
    "email": "juan@ejemplo.com",
    "phone": "+52 55 1234 5678"
  }
}
```

#### POST `/api/conekta/spei-payment`
Crea pago con SPEI.

**Body:**
```json
{
  "enrollmentId": 1,
  "customerInfo": {
    "name": "Juan Pérez",
    "email": "juan@ejemplo.com",
    "phone": "+52 55 1234 5678"
  }
}
```

#### GET `/api/conekta/payment/:paymentId`
Obtiene información detallada de un pago.

#### POST `/api/conekta/refund/:paymentId`
Procesa reembolso de un pago.

**Body:**
```json
{
  "reason": "Solicitud del cliente"
}
```

#### POST `/api/conekta/webhook`
Endpoint para recibir notificaciones de Conekta (público).

### Frontend

#### conektaAPI.createOrder(orderData)
Crea una nueva orden de pago.

#### conektaAPI.processCardPayment(paymentData)
Procesa pago con tarjeta.

#### conektaAPI.processOxxoPayment(paymentData)
Crea pago con OXXO Pay.

#### conektaAPI.processSpeiPayment(paymentData)
Crea pago con SPEI.

#### conektaAPI.getPaymentInfo(paymentId)
Obtiene información de un pago.

#### conektaAPI.refundPayment(paymentId, reason)
Procesa reembolso.

## 🎨 Componentes Frontend

### ConektaPayment
Componente principal para procesar pagos.

**Props:**
- `enrollmentId`: ID de la inscripción
- `amount`: Monto a pagar
- `courseName`: Nombre del curso
- `onSuccess`: Callback al completar pago
- `onCancel`: Callback al cancelar

**Uso:**
```tsx
import ConektaPayment from '../components/Payment/ConektaPayment';

<ConektaPayment
  enrollmentId={1}
  amount={1500}
  courseName="Inglés Básico"
  onSuccess={(payment) => console.log('Pago exitoso:', payment)}
  onCancel={() => console.log('Pago cancelado')}
/>
```

## 🔄 Flujo de Pagos

### 1. Pago con Tarjeta
1. Usuario selecciona pago con tarjeta
2. Se genera token de tarjeta (SDK Conekta)
3. Se envía token al backend
4. Backend crea orden en Conekta
5. Se procesa el pago inmediatamente
6. Se actualiza estado en base de datos
7. Se envía email de confirmación

### 2. Pago con OXXO
1. Usuario selecciona OXXO Pay
2. Se crea orden en Conekta
3. Se genera referencia OXXO
4. Se muestra referencia al usuario
5. Usuario paga en tienda OXXO
6. Conekta notifica vía webhook
7. Se actualiza estado automáticamente

### 3. Pago con SPEI
1. Usuario selecciona SPEI
2. Se crea orden en Conekta
3. Se genera referencia bancaria
4. Se muestra referencia al usuario
5. Usuario transfiere vía SPEI
6. Conekta notifica vía webhook
7. Se actualiza estado automáticamente

## 🛡️ Seguridad

### Validaciones
- Verificación de firma de webhooks
- Validación de datos de entrada
- Control de acceso basado en roles
- Rate limiting en endpoints críticos

### Manejo de Errores
- Logging detallado de errores
- Respuestas de error consistentes
- Rollback automático en fallos
- Notificaciones de errores críticos

## 📊 Estados de Pago

### Estados Principales
- `pending`: Pago pendiente (OXXO, SPEI)
- `completed`: Pago completado exitosamente
- `failed`: Pago fallido
- `refunded`: Pago reembolsado
- `expired`: Pago expirado (OXXO, SPEI)

### Transiciones de Estado
```
pending → completed (pago exitoso)
pending → failed (pago fallido)
pending → expired (tiempo expirado)
completed → refunded (reembolso)
```

## 🧪 Testing

### Tokens de Prueba
- **Tarjeta exitosa**: `tok_test_visa_4242`
- **Tarjeta declinada**: `tok_test_visa_4000`
- **Tarjeta insuficientes fondos**: `tok_test_visa_4001`

### Webhooks de Prueba
- Usar ngrok para testing local
- Configurar webhook en dashboard de Conekta
- Verificar firma de webhooks

## 📈 Monitoreo

### Métricas a Monitorear
- Tasa de éxito de pagos
- Tiempo de procesamiento
- Errores por método de pago
- Volumen de transacciones
- Reembolsos y disputas

### Logs
- Todas las transacciones se registran
- Errores detallados con stack trace
- Webhooks recibidos y procesados
- Cambios de estado de pagos

## 🚀 Deploy

### Producción
1. Configurar variables de entorno de producción
2. Usar claves de producción de Conekta
3. Configurar webhook de producción
4. Verificar SSL/HTTPS
5. Configurar monitoreo

### Consideraciones
- Usar claves de producción diferentes
- Configurar backup de base de datos
- Implementar alertas de errores
- Documentar procedimientos de emergencia

## 📞 Soporte

### Recursos
- [Documentación oficial de Conekta](https://developers.conekta.com/)
- [SDK de Node.js](https://github.com/conekta/conekta-node)
- [Dashboard de Conekta](https://admin.conekta.com/)

### Contacto
- Soporte técnico: support@conekta.com
- Documentación: developers.conekta.com
- Status page: status.conekta.com

## 🔄 Actualizaciones

### Versión Actual
- **Conekta SDK**: 2.0.0
- **API Version**: 2.0.0
- **Última actualización**: $(date)

### Próximas Mejoras
- [ ] Integración con Apple Pay/Google Pay
- [ ] Pagos recurrentes
- [ ] Split payments
- [ ] Pagos en cuotas
- [ ] Dashboard de analytics 