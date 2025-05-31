// src/utils/logger.js - Winston logger configuration
const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  defaultMeta: { 
    service: 'treasure-hunt-api',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: [
    // File transport for errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true
    })
  ],
  
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 10485760,
      maxFiles: 3
    })
  ],
  
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 10485760,
      maxFiles: 3
    })
  ]
});

// Add console transport for non-production environments
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
} else {
  // In production, only log to console if LOG_TO_CONSOLE is set
  if (process.env.LOG_TO_CONSOLE === 'true') {
    logger.add(new winston.transports.Console({
      format: consoleFormat,
      level: process.env.LOG_LEVEL || 'info'
    }));
  }
}

// Create child loggers for different modules
const createModuleLogger = (module) => {
  return logger.child({ module });
};

// Helper methods for structured logging
const logRequest = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.userId,
    requestId: req.id
  });
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.info('HTTP Response', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: req.user?.userId,
      requestId: req.id
    });
  });
  
  next();
};

// Database query logger
const logQuery = (query, params, duration) => {
  logger.debug('Database Query', {
    query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
    paramCount: params?.length || 0,
    duration: `${duration}ms`
  });
};

// Blockchain transaction logger
const logTransaction = (type, digest, address, success = true) => {
  logger.info('Blockchain Transaction', {
    type,
    digest,
    address,
    success,
    timestamp: new Date().toISOString()
  });
};

// Error logger with context
const logError = (error, context = {}) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context
  });
};

// Security event logger
const logSecurityEvent = (event, details = {}) => {
  logger.warn('Security Event', {
    event,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// Performance logger
const logPerformance = (operation, duration, metadata = {}) => {
  const level = duration > 5000 ? 'warn' : 'info';
  logger.log(level, 'Performance Metric', {
    operation,
    duration: `${duration}ms`,
    slow: duration > 5000,
    ...metadata
  });
};

// Audit logger for admin actions
const logAudit = (action, userId, details = {}) => {
  logger.info('Audit Log', {
    action,
    userId,
    timestamp: new Date().toISOString(),
    ...details
  });
};

module.exports = {
  // Main logger instance
  logger,
  
  // Child logger creator
  createModuleLogger,
  
  // Middleware
  logRequest,
  
  // Specific loggers
  logQuery,
  logTransaction,
  logError,
  logSecurityEvent,
  logPerformance,
  logAudit,
  
  // Direct access to winston methods
  debug: logger.debug.bind(logger),
  info: logger.info.bind(logger),
  warn: logger.warn.bind(logger),
  error: logger.error.bind(logger)
};