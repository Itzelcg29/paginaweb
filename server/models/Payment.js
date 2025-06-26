const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Payment = sequelize.define('Payment', {
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
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0.01
    }
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'MXN'
  },
  paymentMethod: {
    type: DataTypes.ENUM('cash', 'card', 'transfer', 'stripe', 'paypal', 'conekta'),
    allowNull: false
  },
  paymentType: {
    type: DataTypes.ENUM('full', 'partial', 'installment', 'refund'),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'),
    allowNull: false,
    defaultValue: 'pending'
  },
  transactionId: {
    type: DataTypes.STRING,
    unique: true
  },
  externalPaymentId: {
    type: DataTypes.STRING // Stripe, PayPal, etc.
  },
  receiptNumber: {
    type: DataTypes.STRING,
    unique: true
  },
  invoiceNumber: {
    type: DataTypes.STRING
  },
  description: {
    type: DataTypes.TEXT
  },
  paymentDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  dueDate: {
    type: DataTypes.DATEONLY
  },
  processedBy: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  processedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  cardLast4: {
    type: DataTypes.STRING(4)
  },
  cardBrand: {
    type: DataTypes.STRING
  },
  bankName: {
    type: DataTypes.STRING
  },
  accountLast4: {
    type: DataTypes.STRING(4)
  },
  fee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  tax: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  discount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  discountReason: {
    type: DataTypes.STRING
  },
  notes: {
    type: DataTypes.TEXT
  },
  metadata: {
    type: DataTypes.JSONB, // Additional payment data
    defaultValue: {}
  },
  refundReason: {
    type: DataTypes.TEXT
  },
  refundedBy: {
    type: DataTypes.UUID,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  refundedAt: {
    type: DataTypes.DATE
  },
  refundAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  installmentNumber: {
    type: DataTypes.INTEGER,
    validate: {
      min: 1
    }
  },
  totalInstallments: {
    type: DataTypes.INTEGER,
    validate: {
      min: 1
    }
  }
}, {
  tableName: 'payments',
  timestamps: true,
  indexes: [
    {
      fields: ['enrollmentId']
    },
    {
      fields: ['status']
    },
    {
      fields: ['paymentMethod']
    },
    {
      fields: ['paymentDate']
    },
    {
      fields: ['transactionId']
    },
    {
      fields: ['receiptNumber']
    },
    {
      fields: ['externalPaymentId']
    }
  ]
});

// Instance methods
Payment.prototype.getNetAmount = function() {
  return this.amount - this.fee - this.tax + this.discount;
};

Payment.prototype.isSuccessful = function() {
  return ['completed'].includes(this.status);
};

Payment.prototype.isPending = function() {
  return ['pending', 'processing'].includes(this.status);
};

Payment.prototype.isFailed = function() {
  return ['failed', 'cancelled'].includes(this.status);
};

Payment.prototype.isRefunded = function() {
  return this.status === 'refunded' || this.refundAmount > 0;
};

Payment.prototype.getPaymentMethodDisplay = function() {
  switch (this.paymentMethod) {
    case 'cash': return 'Efectivo';
    case 'card': return 'Tarjeta';
    case 'transfer': return 'Transferencia';
    case 'stripe': return 'Stripe';
    case 'paypal': return 'PayPal';
    case 'conekta': return 'Conekta';
    default: return this.paymentMethod;
  }
};

Payment.prototype.generateReceiptNumber = function() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `RCP-${year}${month}${day}-${random}`;
};

Payment.prototype.generateInvoiceNumber = function() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `INV-${year}${month}-${random}`;
};

module.exports = Payment; 