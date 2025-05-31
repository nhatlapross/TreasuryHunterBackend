// src/database/connection.js - Fixed MongoDB connection with updated options
const mongoose = require('mongoose');
const logger = require('../utils/logger');

class MongoConnection {
  constructor() {
    this.connection = null;
    this.isConnected = false;
  }

  /**
   * Connect to MongoDB
   */
  async connect() {
    try {
      // Ensure we don't have multiple connections
      if (this.isConnected && mongoose.connection.readyState === 1) {
        logger.info('✅ MongoDB already connected');
        return mongoose.connection;
      }

      const mongoPassword = process.env.MONGODB_PASSWORD;
      const mongoUri = process.env.MONGODB_URI?.replace('<db_password>', mongoPassword);
      const databaseName = process.env.DATABASE_NAME || 'treasure_hunt_db';

      if (!mongoUri) {
        throw new Error('MONGODB_URI environment variable is required');
      }

      if (!mongoPassword) {
        console.warn('⚠️ MONGODB_PASSWORD not set - assuming no password required');
      }

      // Updated MongoDB connection options - removed deprecated options
      const options = {
        dbName: databaseName,
        maxPoolSize: 10, // Replaces maxPoolSize
        minPoolSize: 2,  
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        retryReads: true,
        w: 'majority',
        connectTimeoutMS: 10000,
        // Removed deprecated options:
        // bufferCommands: false,     // Deprecated
        // bufferMaxEntries: 0,       // Deprecated - this was causing the error
      };

      // Set up event listeners before connecting
      this.setupEventListeners();

      logger.info('🔗 Connecting to MongoDB...');
      
      // Connect using mongoose.connect
      await mongoose.connect(mongoUri, options);
      this.connection = mongoose.connection;
      this.isConnected = true;

      logger.info('✅ MongoDB connected successfully', {
        database: databaseName,
        host: this.connection.host,
        port: this.connection.port,
        readyState: this.connection.readyState
      });

      return this.connection;
    } catch (error) {
      logger.error('❌ MongoDB connection failed:', error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Setup MongoDB event listeners
   */
  setupEventListeners() {
    // Remove existing listeners to prevent duplicates
    mongoose.connection.removeAllListeners();

    mongoose.connection.on('connected', () => {
      logger.info('🟢 MongoDB connected');
      this.isConnected = true;
    });

    mongoose.connection.on('error', (error) => {
      logger.error('🔴 MongoDB connection error:', error);
      this.isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('🟡 MongoDB disconnected');
      this.isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('🔄 MongoDB reconnected');
      this.isConnected = true;
    });

    // Handle process termination
    const gracefulClose = async () => {
      await this.disconnect();
      process.exit(0);
    };

    process.on('SIGINT', gracefulClose);
    process.on('SIGTERM', gracefulClose);
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect() {
    try {
      if (this.isConnected && mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
        logger.info('✅ MongoDB disconnected gracefully');
        this.isConnected = false;
        this.connection = null;
      }
    } catch (error) {
      logger.error('❌ Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
      collections: Object.keys(mongoose.connection.collections || {})
    };
  }

  /**
   * Test database connection
   */
  async testConnection() {
    try {
      if (!this.isConnected || mongoose.connection.readyState !== 1) {
        throw new Error('Database not connected');
      }

      // Simple ping to test connection
      await mongoose.connection.db.admin().ping();
      
      logger.info('✅ Database connection test successful');
      return true;
    } catch (error) {
      logger.error('❌ Database connection test failed:', error);
      return false;
    }
  }

  /**
   * Get database statistics
   */
  async getStats() {
    try {
      if (!this.isConnected || mongoose.connection.readyState !== 1) {
        throw new Error('Database not connected');
      }

      const stats = await mongoose.connection.db.stats();
      const serverStatus = await mongoose.connection.db.admin().serverStatus();
      
      return {
        database: {
          collections: stats.collections,
          dataSize: stats.dataSize,
          storageSize: stats.storageSize,
          indexes: stats.indexes,
          indexSize: stats.indexSize,
          objects: stats.objects
        },
        server: {
          version: serverStatus.version,
          uptime: serverStatus.uptime,
          connections: serverStatus.connections,
          network: serverStatus.network,
          opcounters: serverStatus.opcounters
        },
        mongoose: {
          version: mongoose.version,
          readyState: mongoose.connection.readyState,
          host: mongoose.connection.host,
          port: mongoose.connection.port,
          name: mongoose.connection.name
        }
      };
    } catch (error) {
      logger.error('Failed to get database stats:', error);
      throw error;
    }
  }

  /**
   * Clear all collections (for testing)
   */
  async clearDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clear database in production environment');
    }

    try {
      const collections = await mongoose.connection.db.collections();
      
      for (const collection of collections) {
        await collection.deleteMany({});
        logger.info(`Cleared collection: ${collection.collectionName}`);
      }
      
      logger.info('✅ Database cleared successfully');
    } catch (error) {
      logger.error('❌ Failed to clear database:', error);
      throw error;
    }
  }

  /**
   * Create indexes for better performance
   */
  async createIndexes() {
    try {
      logger.info('📊 Creating database indexes...');

      // Since we're using Mongoose models, indexes are created automatically
      // This method can be used for additional custom indexes if needed
      
      logger.info('✅ Database indexes handled by Mongoose models');
      return true;
    } catch (error) {
      logger.error('❌ Failed to create indexes:', error);
      throw error;
    }
  }
}

// Create singleton instance
const mongoConnection = new MongoConnection();

// Helper functions for backward compatibility with raw queries
const query = async (operation, collection, filter = {}, options = {}) => {
  try {
    if (!mongoConnection.isConnected) {
      throw new Error('Database not connected');
    }

    const db = mongoose.connection.db;
    const coll = db.collection(collection);
    
    switch (operation) {
      case 'find':
        return await coll.find(filter, options).toArray();
      case 'findOne':
        return await coll.findOne(filter, options);
      case 'insertOne':
        return await coll.insertOne(filter);
      case 'insertMany':
        return await coll.insertMany(filter);
      case 'updateOne':
        return await coll.updateOne(filter, options);
      case 'updateMany':
        return await coll.updateMany(filter, options);
      case 'deleteOne':
        return await coll.deleteOne(filter);
      case 'deleteMany':
        return await coll.deleteMany(filter);
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  } catch (error) {
    logger.error(`Database ${operation} operation failed:`, error);
    throw error;
  }
};

const transaction = async (callback) => {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Transaction aborted:', error);
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = {
  mongoConnection,
  connect: () => mongoConnection.connect(),
  disconnect: () => mongoConnection.disconnect(),
  testConnection: () => mongoConnection.testConnection(),
  getStats: () => mongoConnection.getStats(),
  getConnectionStatus: () => mongoConnection.getConnectionStatus(),
  clearDatabase: () => mongoConnection.clearDatabase(),
  createIndexes: () => mongoConnection.createIndexes(),
  query,
  transaction,
  mongoose,
  // Expose the connection for direct access
  connection: mongoose.connection
};