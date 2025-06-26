const jwt = require('jsonwebtoken');
const { User } = require('../models');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        message: 'No token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'User not found' 
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ 
        error: 'Account disabled',
        message: 'Your account has been disabled' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'Token is not valid' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'Token has expired' 
      });
    }
    
    console.error('Auth middleware error:', error);
    return res.status(500).json({ 
      error: 'Authentication error',
      message: 'Internal server error' 
    });
  }
};

// Role-based access control
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please log in to access this resource' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: `Role '${req.user.role}' is not authorized to access this resource`,
        requiredRoles: roles,
        userRole: req.user.role
      });
    }

    next();
  };
};

// Specific role checks
const requireAdmin = authorizeRoles('admin');
const requireTeacher = authorizeRoles('admin', 'teacher');
const requireStudent = authorizeRoles('admin', 'teacher', 'student');

// Resource ownership check
const checkResourceOwnership = (resourceModel, resourceIdField = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdField] || req.body[resourceIdField];
      
      if (!resourceId) {
        return res.status(400).json({ 
          error: 'Resource ID required',
          message: 'Resource ID is missing' 
        });
      }

      const resource = await resourceModel.findByPk(resourceId);
      
      if (!resource) {
        return res.status(404).json({ 
          error: 'Resource not found',
          message: 'The requested resource does not exist' 
        });
      }

      // Admin can access all resources
      if (req.user.role === 'admin') {
        req.resource = resource;
        return next();
      }

      // Check if user owns the resource
      const ownershipField = req.user.role === 'teacher' ? 'teacherId' : 'studentId';
      if (resource[ownershipField] === req.user.id) {
        req.resource = resource;
        return next();
      }

      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to access this resource' 
      });
    } catch (error) {
      console.error('Resource ownership check error:', error);
      return res.status(500).json({ 
        error: 'Authorization error',
        message: 'Internal server error' 
      });
    }
  };
};

// Optional authentication (for public routes that can work with or without auth)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.userId);
      
      if (user && user.isActive) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

// Rate limiting for specific actions
const createRateLimiter = (windowMs, maxRequests, message) => {
  const rateLimit = require('express-rate-limit');
  return rateLimit({
    windowMs,
    max: maxRequests,
    message: {
      error: 'Rate limit exceeded',
      message: message || 'Too many requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Specific rate limiters
const loginRateLimit = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // 5 attempts
  'Too many login attempts, please try again in 15 minutes'
);

const registrationRateLimit = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  3, // 3 attempts
  'Too many registration attempts, please try again in 1 hour'
);

const passwordResetRateLimit = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  3, // 3 attempts
  'Too many password reset attempts, please try again in 1 hour'
);

module.exports = {
  authenticateToken,
  authorizeRoles,
  requireAdmin,
  requireTeacher,
  requireStudent,
  checkResourceOwnership,
  optionalAuth,
  loginRateLimit,
  registrationRateLimit,
  passwordResetRateLimit
}; 