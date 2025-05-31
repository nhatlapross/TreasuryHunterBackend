// src/middleware/auth.js - JWT authentication middleware
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

/**
 * JWT Authentication Middleware
 * Validates JWT token and attaches user info to request
 */
const auth = (req, res, next) => {
  try {
    console.log('🔍 Auth Debug:');
    console.log('Authorization header:', req.header('Authorization'));
    
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      console.log('❌ No auth header');
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      console.log('❌ Invalid token format');
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token format. Use "Bearer <token>".'
      });
    }

    const token = authHeader.substring(7);
    console.log('📄 Token extracted:', token.substring(0, 20) + '...');
    
    console.log('🔑 JWT_SECRET exists:', !!process.env.JWT_SECRET);
    console.log('🔑 JWT_SECRET length:', process.env.JWT_SECRET?.length);
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token decoded:', { userId: decoded.userId, username: decoded.username });

    req.user = {
      userId: decoded.userId,
      suiAddress: decoded.suiAddress,
      username: decoded.username,
      role: decoded.role || 'user'
    };

    next();
  } catch (error) {
    console.log('❌ Auth error:', error.name, error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

/**
 * Admin Authentication Middleware
 * Requires admin role in addition to valid token
 */
const adminAuth = (req, res, next) => {
  // First check regular authentication
  auth(req, res, (authError) => {
    if (authError) return; // auth middleware will handle the response

    // Check admin role
    if (req.user.role !== 'admin') {
      logger.warn(`Admin access denied for user: ${req.user.userId}`);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    logger.debug(`Admin authenticated: ${req.user.userId}`);
    next();
  });
};

/**
 * Optional Authentication Middleware
 * Attaches user info if token is present, but doesn't require it
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided, continue without authentication
    req.user = null;
    return next();
  }

  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    req.user = {
      userId: decoded.userId,
      suiAddress: decoded.suiAddress,
      username: decoded.username,
      role: decoded.role || 'user'
    };
    
    logger.debug(`Optional auth successful: ${decoded.userId}`);
  } catch (error) {
    // Invalid token, but continue without authentication
    logger.debug('Optional auth failed, continuing without user:', error.message);
    req.user = null;
  }
  
  next();
};

module.exports = {
  auth,
  adminAuth,
  optionalAuth
};