// src/server.js - Debug version with enhanced error logging
console.log('🚀 Starting server initialization...');

// Load environment variables first
require('dotenv').config();
console.log('✅ Environment variables loaded');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('MONGODB_URI exists:', !!process.env.MONGODB_URI);
console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);

const express = require('express');
console.log('✅ Express loaded');

const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
console.log('✅ Middleware packages loaded');

let logger;
try {
  logger = require('./utils/logger');
  console.log('✅ Logger loaded successfully');
} catch (error) {
  console.error('❌ Failed to load logger:', error.message);
  // Fallback to console logging
  logger = {
    info: console.log,
    error: console.error,
    warn: console.warn,
    debug: console.log
  };
}

let dbConnection;
try {
  dbConnection = require('./database/connection');
  console.log('✅ Database connection module loaded');
} catch (error) {
  console.error('❌ Failed to load database connection:', error.message);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}

console.log('✅ Core modules loaded, initializing app...');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Basic error handler for unhandled errors
process.on('uncaughtException', (error) => {
  console.error('💥 UNCAUGHT EXCEPTION! Shutting down...');
  console.error('Error name:', error.name);
  console.error('Error message:', error.message);
  console.error('Stack trace:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION! Shutting down...');
  console.error('Promise:', promise);
  console.error('Reason:', reason);
  process.exit(1);
});

// Validate critical environment variables
const requiredEnvVars = ['JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars);
  console.error('Please check your .env file and ensure these variables are set');
  process.exit(1);
}

console.log('✅ Environment validation passed');

// Security middleware
try {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false
  }));
  console.log('✅ Helmet security middleware configured');
} catch (error) {
  console.error('❌ Failed to configure helmet:', error.message);
}

// CORS configuration
try {
  const corsOptions = {
    origin: process.env.CORS_ORIGIN === '*' ? true : process.env.CORS_ORIGIN?.split(','),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
  };
  app.use(cors(corsOptions));
  console.log('✅ CORS configured');
} catch (error) {
  console.error('❌ Failed to configure CORS:', error.message);
}

// Rate limiting
try {
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(parseInt(process.env.RATE_LIMIT_WINDOW_MS) / 1000 / 60)
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', limiter);
  console.log('✅ Rate limiting configured');
} catch (error) {
  console.error('❌ Failed to configure rate limiting:', error.message);
}

// Compression middleware
try {
  app.use(compression());
  console.log('✅ Compression middleware configured');
} catch (error) {
  console.error('❌ Failed to configure compression:', error.message);
}

// Body parsing middleware
try {
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  console.log('✅ Body parsing middleware configured');
} catch (error) {
  console.error('❌ Failed to configure body parsing:', error.message);
}

// Logging middleware
try {
  if (process.env.NODE_ENV === 'production') {
    app.use(morgan('combined', { 
      stream: { 
        write: message => logger.info(message.trim()) 
      } 
    }));
  } else {
    app.use(morgan('dev'));
  }
  console.log('✅ Request logging configured');
} catch (error) {
  console.error('❌ Failed to configure request logging:', error.message);
}

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('🏥 Health check requested');
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    database: dbConnection ? dbConnection.getConnectionStatus() : 'Not connected'
  });
});

console.log('✅ Health check endpoint configured');

// Test endpoint for debugging
app.get('/debug', (req, res) => {
  console.log('🐛 Debug endpoint requested');
  res.json({
    message: 'Debug endpoint working',
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasMongoUri: !!process.env.MONGODB_URI,
    },
    database: dbConnection ? dbConnection.getConnectionStatus() : 'Not available'
  });
});

// Load routes with error handling
const API_VERSION = process.env.API_VERSION || 'v1';
console.log('📝 Loading API routes...');

try {
  // Try to load each route module individually
  console.log('  Loading auth routes...');
  const authRoutes = require('./routes/auth');
  app.use(`/api/${API_VERSION}/auth`, authRoutes);
  console.log('  ✅ Auth routes loaded');
} catch (error) {
  console.error('  ❌ Failed to load auth routes:', error.message);
}

try {
  console.log('  Loading wallet routes...');
  const walletRoutes = require('./routes/wallet');
  app.use(`/api/${API_VERSION}/wallet`, walletRoutes);
  console.log('  ✅ Wallet routes loaded');
} catch (error) {
  console.error('  ❌ Failed to load wallet routes:', error.message);
}

try {
  console.log('  Loading treasure routes...');
  const treasureRoutes = require('./routes/treasures');
  app.use(`/api/${API_VERSION}/treasures`, treasureRoutes);
  console.log('  ✅ Treasure routes loaded');
} catch (error) {
  console.error('  ❌ Failed to load treasure routes:', error.message);
}

try {
  console.log('  Loading profile routes...');
  const profileRoutes = require('./routes/profile');
  app.use(`/api/${API_VERSION}/profile`, profileRoutes);
  console.log('  ✅ Profile routes loaded');
} catch (error) {
  console.error('  ❌ Failed to load profile routes:', error.message);
}

try {
  console.log('  Loading admin routes...');
  const adminRoutes = require('./routes/admin');
  app.use(`/api/${API_VERSION}/admin`, adminRoutes);
  console.log('  ✅ Admin routes loaded');
} catch (error) {
  console.error('  ❌ Failed to load admin routes:', error.message);
}

// Catch-all for undefined routes
app.use('*', (req, res) => {
  console.log('❓ Unknown route accessed:', req.originalUrl);
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
let errorHandler;
try {
  errorHandler = require('./middleware/errorHandler');
  app.use(errorHandler.errorHandler);
  console.log('✅ Error handler configured');
} catch (error) {
  console.error('❌ Failed to load error handler:', error.message);
  // Fallback error handler
  app.use((err, req, res, next) => {
    console.error('💥 Unhandled error:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  });
}

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`\n📡 Received ${signal}. Starting graceful shutdown...`);
  
  server.close(async () => {
    console.log('🔌 HTTP server closed.');
    
    // Close database connections
    try {
      if (dbConnection && dbConnection.disconnect) {
        await dbConnection.disconnect();
        console.log('🗄️ Database connections closed.');
      }
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during graceful shutdown:', error);
      process.exit(1);
    }
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Start server
console.log('🎬 Starting HTTP server...');
const server = app.listen(PORT, HOST, async () => {
  console.log('\n🎉 ======================================');
  console.log('🚀 Treasure Hunt Backend Server Started');
  console.log('======================================');
  console.log(`📍 Server running at http://${HOST}:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 API Base URL: http://${HOST}:${PORT}/api/${API_VERSION}`);
  console.log(`🏥 Health Check: http://${HOST}:${PORT}/health`);
  console.log(`🐛 Debug Endpoint: http://${HOST}:${PORT}/debug`);
  
  // Test database connection
  console.log('\n🗄️ Testing database connection...');
  try {
    if (dbConnection && dbConnection.connect) {
      await dbConnection.connect();
      console.log('✅ Database connected successfully');
      
      // Test the connection
      const connectionStatus = dbConnection.getConnectionStatus();
      console.log('📊 Database status:', {
        connected: connectionStatus.isConnected,
        readyState: connectionStatus.readyState,
        host: connectionStatus.host,
        port: connectionStatus.port,
        database: connectionStatus.name
      });
    } else {
      console.log('⚠️ Database connection module not available');
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Stack trace:', error.stack);
    console.log('⚠️ Server will continue without database connection');
  }
  
  // Log important configurations
  console.log('\n⚙️ Configuration:');
  console.log(`🔐 JWT expires in: ${process.env.JWT_EXPIRES_IN || '7d'}`);
  console.log(`⛓️ Sui Network: ${process.env.SUI_NETWORK || 'testnet'}`);
  console.log(`📦 Package ID: ${process.env.SUI_PACKAGE_ID || 'Not set'}`);
  console.log(`🗃️ Registry ID: ${process.env.TREASURE_REGISTRY_ID || 'Not set'}`);
  
  console.log('\n✨ Server is ready to accept requests!');
  console.log('======================================\n');
});

// Handle server errors
server.on('error', (error) => {
  console.error('💥 Server error:', error.message);
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Try a different port.`);
  }
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;