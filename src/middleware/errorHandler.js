// src/middleware/errorHandler.js - Global error handling middleware
const logger = require('../utils/logger');

/**
 * Global error handling middleware
 * Catches all unhandled errors and returns appropriate responses
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error details
  logger.error('Unhandled Error', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.userId,
    body: req.body,
    params: req.params,
    query: req.query
  });

  // Default error
  let statusCode = 500;
  let message = 'Internal Server Error';

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    message = 'Resource not found';
    statusCode = 404;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    message = 'Duplicate field value entered';
    statusCode = 400;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    message = Object.values(err.errors).map(val => val.message).join(', ');
    statusCode = 400;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    message = 'Invalid token';
    statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    message = 'Token expired';
    statusCode = 401;
  }

  // PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        message = 'Duplicate entry found';
        statusCode = 400;
        break;
      case '23503': // Foreign key violation
        message = 'Referenced resource not found';
        statusCode = 400;
        break;
      case '23502': // Not null violation
        message = 'Required field missing';
        statusCode = 400;
        break;
      case '22P02': // Invalid text representation
        message = 'Invalid data format';
        statusCode = 400;
        break;
      case '42P01': // Undefined table
        message = 'Database configuration error';
        statusCode = 500;
        break;
      default:
        if (err.code.startsWith('23')) {
          message = 'Data constraint violation';
          statusCode = 400;
        }
    }
  }

  // Sui blockchain errors
  if (err.message?.includes('Insufficient SUI balance')) {
    message = 'Insufficient SUI balance for transaction';
    statusCode = 400;
  }

  if (err.message?.includes('E_TREASURE_ALREADY_FOUND')) {
    message = 'This treasure has already been discovered';
    statusCode = 400;
  }

  if (err.message?.includes('E_INVALID_LOCATION')) {
    message = 'Location verification failed';
    statusCode = 400;
  }

  if (err.message?.includes('E_INSUFFICIENT_RANK')) {
    message = 'Your hunter rank is too low for this treasure';
    statusCode = 400;
  }

  // Network/timeout errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    message = 'Service temporarily unavailable';
    statusCode = 503;
  }

  // Rate limit errors
  if (err.status === 429) {
    message = 'Too many requests, please try again later';
    statusCode = 429;
  }

  // File/upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    message = 'File too large';
    statusCode = 400;
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    message = 'Unexpected file field';
    statusCode = 400;
  }

  // Custom application errors
  if (err.statusCode) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // Prepare error response
  const errorResponse = {
    success: false,
    message,
    timestamp: new Date().toISOString(),
    path: req.url,
    method: req.method
  };

  // Add error details in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error = {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code
    };
  }

  // Add request ID if available
  if (req.id) {
    errorResponse.requestId = req.id;
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * 404 handler for undefined routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route ${req.originalUrl} not found`);
  error.statusCode = 404;
  next(error);
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch promise rejections
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Custom error class for application-specific errors
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error helper
 */
const createValidationError = (message, field = null) => {
  const error = new AppError(message, 400, 'VALIDATION_ERROR');
  if (field) {
    error.field = field;
  }
  return error;
};

/**
 * Authentication error helper
 */
const createAuthError = (message = 'Authentication failed') => {
  return new AppError(message, 401, 'AUTH_ERROR');
};

/**
 * Authorization error helper
 */
const createAuthorizationError = (message = 'Access denied') => {
  return new AppError(message, 403, 'AUTHORIZATION_ERROR');
};

/**
 * Not found error helper
 */
const createNotFoundError = (resource = 'Resource') => {
  return new AppError(`${resource} not found`, 404, 'NOT_FOUND');
};

/**
 * Conflict error helper
 */
const createConflictError = (message) => {
  return new AppError(message, 409, 'CONFLICT_ERROR');
};

/**
 * Service unavailable error helper
 */
const createServiceUnavailableError = (message = 'Service temporarily unavailable') => {
  return new AppError(message, 503, 'SERVICE_UNAVAILABLE');
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError,
  createValidationError,
  createAuthError,
  createAuthorizationError,
  createNotFoundError,
  createConflictError,
  createServiceUnavailableError
};