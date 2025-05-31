// src/models/index.js - Final fix removing ALL duplicate indexes
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// User Schema - NO unique: true in field definitions
const userSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  username: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
    match: /^[a-zA-Z0-9_]+$/
    // REMOVED: unique: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    // REMOVED: unique: true
  },
  suiAddress: {
    type: String,
    required: true,
    match: /^0x[a-fA-F0-9]{64}$/
    // REMOVED: unique: true
  },
  encryptedPrivateKey: {
    type: String,
    required: true
  },
  profileObjectId: {
    type: String,
    match: /^0x[a-fA-F0-9]{64}$/
  },
  avatarUrl: String,
  isActive: {
    type: Boolean,
    default: true
  },
  lastLoginAt: Date,
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  collection: 'users'
});

// Only use .index() method for creating indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ suiAddress: 1 }, { unique: true });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

// Treasure Schema
const treasureSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  treasureId: {
    type: String,
    required: true,
    trim: true
    // REMOVED: unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      validate: {
        validator: function(coords) {
          return coords.length === 2 && 
                 coords[0] >= -180 && coords[0] <= 180 && 
                 coords[1] >= -90 && coords[1] <= 90;
        },
        message: 'Invalid coordinates'
      }
    }
  },
  rarity: {
    type: Number,
    required: true,
    enum: [1, 2, 3],
    default: 1
  },
  rewardPoints: {
    type: Number,
    default: 100,
    min: 0
  },
  requiredRank: {
    type: Number,
    default: 1,
    min: 1,
    max: 4
  },
  isActive: {
    type: Boolean,
    default: true
  },
  imageUrl: String,
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdBy: {
    type: String,
    ref: 'User'
  }
}, {
  timestamps: true,
  collection: 'treasures'
});

// Only use .index() method
treasureSchema.index({ treasureId: 1 }, { unique: true });
treasureSchema.index({ location: '2dsphere' });
treasureSchema.index({ isActive: 1 });
treasureSchema.index({ rarity: 1 });
treasureSchema.index({ createdAt: -1 });

// Treasure Discovery Schema
const treasureDiscoverySchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  treasureId: {
    type: String,
    required: true,
    ref: 'Treasure'
  },
  nftObjectId: {
    type: String,
    required: true,
    // 🆕 UPDATED: More flexible validation for NFT Object ID
    validate: {
      validator: function(v) {
        // Allow hexadecimal (0x...) format or offline format
        return /^0x[a-fA-F0-9]{64}$/.test(v) || /^offline_/.test(v);
      },
      message: 'NFT Object ID must be a valid Sui object ID (0x...) or offline format'
    }
  },
  transactionDigest: {
    type: String,
    required: true,
    // 🆕 UPDATED: Support both Base58 (Sui) and hexadecimal formats
    validate: {
      validator: function(v) {
        // Allow Base58 format (Sui transaction digests like: 4d31TeYDEzPbwGXKYejrs154daGkDo56jm1ACt2w7HRd)
        // Allow hexadecimal format (0x...)
        // Allow offline format
        const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/; // Base58 format
        const hexRegex = /^[a-fA-F0-9]{64}$/; // 64-character hex
        const hex0xRegex = /^0x[a-fA-F0-9]{64}$/; // 0x prefix hex
        const offlineRegex = /^offline_/; // Offline transactions
        
        return base58Regex.test(v) || hexRegex.test(v) || hex0xRegex.test(v) || offlineRegex.test(v);
      },
      message: 'Transaction digest must be a valid Base58 or hexadecimal format'
    }
  },
  locationProof: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  verificationData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  discoveredAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'treasurediscoveries'
});

// Only use .index() method
treasureDiscoverySchema.index({ userId: 1 });
treasureDiscoverySchema.index({ treasureId: 1 }, { unique: true });
treasureDiscoverySchema.index({ nftObjectId: 1 }, { unique: true });
treasureDiscoverySchema.index({ transactionDigest: 1 }, { unique: true });
treasureDiscoverySchema.index({ discoveredAt: -1 });

// Transaction Schema
const transactionSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  digest: {
    type: String,
    required: true,
    // 🆕 UPDATED: Support both Base58 and hexadecimal formats
    validate: {
      validator: function(v) {
        const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/; // Base58 format (Sui)
        const hexRegex = /^[a-fA-F0-9]{64}$/; // 64-character hex
        const hex0xRegex = /^0x[a-fA-F0-9]{64}$/; // 0x prefix hex
        const offlineRegex = /^offline_/; // Offline transactions
        
        return base58Regex.test(v) || hexRegex.test(v) || hex0xRegex.test(v) || offlineRegex.test(v);
      },
      message: 'Transaction digest must be a valid Base58 or hexadecimal format'
    }
  },
  type: {
    type: String,
    required: true,
    enum: ['treasure_reward', 'transfer', 'faucet', 'admin']
  },
  amount: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed'],
    default: 'pending'
  },
  blockHeight: Number,
  gasUsed: Number,
  fromAddress: {
    type: String,
    validate: {
      validator: function(v) {
        // Allow Sui address format or special values
        return !v || /^0x[a-fA-F0-9]{64}$/.test(v) || v === 'faucet' || v === 'system';
      },
      message: 'From address must be a valid Sui address format'
    }
  },
  toAddress: {
    type: String,
    validate: {
      validator: function(v) {
        // Allow Sui address format
        return !v || /^0x[a-fA-F0-9]{64}$/.test(v);
      },
      message: 'To address must be a valid Sui address format'
    }
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  collection: 'transactions'
});

// Only use .index() method
transactionSchema.index({ userId: 1 });
transactionSchema.index({ digest: 1 }, { unique: true });
transactionSchema.index({ type: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ createdAt: -1 });

// Hunter Profile Schema
const hunterProfileSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  userId: {
    type: String,
    required: true,
    ref: 'User'
    // REMOVED: unique: true
  },
  rank: {
    type: String,
    enum: ['beginner', 'explorer', 'hunter', 'master'],
    default: 'beginner'
  },
  totalTreasuresFound: {
    type: Number,
    default: 0,
    min: 0
  },
  totalScore: {
    type: Number,
    default: 0,
    min: 0
  },
  currentStreak: {
    type: Number,
    default: 0,
    min: 0
  },
  longestStreak: {
    type: Number,
    default: 0,
    min: 0
  },
  lastHuntTimestamp: Date,
  achievements: {
    type: [String],
    default: []
  },
  statistics: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  collection: 'hunterprofiles'
});

// Only use .index() method
hunterProfileSchema.index({ userId: 1 }, { unique: true });
hunterProfileSchema.index({ rank: 1 });
hunterProfileSchema.index({ totalScore: -1 });
hunterProfileSchema.index({ totalTreasuresFound: -1 });

// Achievement Schema
const achievementSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  achievementId: {
    type: String,
    required: true
    // REMOVED: unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  icon: String,
  category: String,
  requirementType: String,
  requirementValue: Number,
  points: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'achievements'
});

// Only use .index() method
achievementSchema.index({ achievementId: 1 }, { unique: true });
achievementSchema.index({ category: 1 });
achievementSchema.index({ isActive: 1 });

// User Achievement Schema
const userAchievementSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  achievementId: {
    type: String,
    required: true,
    ref: 'Achievement'
  },
  unlockedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'userachievements'
});

// Only use .index() method
userAchievementSchema.index({ userId: 1 });
userAchievementSchema.index({ achievementId: 1 });
userAchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });
userAchievementSchema.index({ unlockedAt: -1 });

// Admin Log Schema
const adminLogSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  adminUserId: {
    type: String,
    required: true,
    ref: 'User'
  },
  action: {
    type: String,
    required: true,
    enum: ['create_treasure', 'update_treasure', 'delete_treasure', 'ban_user', 'unban_user', 'system_update']
  },
  targetType: String,
  targetId: String,
  details: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: String,
  userAgent: String
}, {
  timestamps: true,
  collection: 'adminlogs'
});

// Only use .index() method
adminLogSchema.index({ adminUserId: 1 });
adminLogSchema.index({ action: 1 });
adminLogSchema.index({ createdAt: -1 });
adminLogSchema.index({ targetType: 1, targetId: 1 });

// App Settings Schema
const appSettingsSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  key: {
    type: String,
    required: true
    // REMOVED: unique: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  description: String,
  isPublic: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  collection: 'appsettings'
});

// Only use .index() method
appSettingsSchema.index({ key: 1 }, { unique: true });
appSettingsSchema.index({ isPublic: 1 });

// Create models
const User = mongoose.model('User', userSchema);
const Treasure = mongoose.model('Treasure', treasureSchema);
const TreasureDiscovery = mongoose.model('TreasureDiscovery', treasureDiscoverySchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const HunterProfile = mongoose.model('HunterProfile', hunterProfileSchema);
const Achievement = mongoose.model('Achievement', achievementSchema);
const UserAchievement = mongoose.model('UserAchievement', userAchievementSchema);
const AdminLog = mongoose.model('AdminLog', adminLogSchema);
const AppSettings = mongoose.model('AppSettings', appSettingsSchema);

// Helper functions
const findNearbyTreasures = async (longitude, latitude, maxDistance = 5000) => {
  return await Treasure.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance
      }
    },
    isActive: true
  }).populate('createdBy', 'username');
};

const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
};

const getLeaderboard = async (limit = 50) => {
  return await HunterProfile.aggregate([
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $unwind: '$user'
    },
    {
      $match: {
        'user.isActive': true
      }
    },
    {
      $sort: {
        totalTreasuresFound: -1,
        totalScore: -1
      }
    },
    {
      $limit: limit
    },
    {
      $project: {
        userId: 1,
        username: '$user.username',
        suiAddress: '$user.suiAddress',
        rank: 1,
        totalTreasuresFound: 1,
        totalScore: 1,
        currentStreak: 1,
        achievements: 1
      }
    }
  ]);
};

const getUserStats = async (userId) => {
  const result = await User.aggregate([
    {
      $match: { _id: userId }
    },
    {
      $lookup: {
        from: 'hunterprofiles',
        localField: '_id',
        foreignField: 'userId',
        as: 'profile'
      }
    },
    {
      $lookup: {
        from: 'treasurediscoveries',
        localField: '_id',
        foreignField: 'userId',
        as: 'discoveries'
      }
    },
    {
      $lookup: {
        from: 'transactions',
        localField: '_id',
        foreignField: 'userId',
        as: 'transactions'
      }
    },
    {
      $project: {
        username: 1,
        email: 1,
        suiAddress: 1,
        createdAt: 1,
        profile: { $arrayElemAt: ['$profile', 0] },
        totalDiscoveries: { $size: '$discoveries' },
        totalTransactions: { $size: '$transactions' },
        totalEarned: {
          $sum: {
            $map: {
              input: {
                $filter: {
                  input: '$transactions',
                  cond: { $eq: ['$this.type', 'treasure_reward'] }
                }
              },
              as: 'tx',
              in: '$tx.amount'
            }
          }
        }
      }
    }
  ]);
  
  return result[0] || null;
};

const getTreasureStats = async () => {
  return await TreasureDiscovery.aggregate([
    {
      $lookup: {
        from: 'treasures',
        localField: 'treasureId',
        foreignField: 'treasureId',
        as: 'treasure'
      }
    },
    {
      $unwind: '$treasure'
    },
    {
      $group: {
        _id: '$treasure.rarity',
        count: { $sum: 1 },
        avgReward: { $avg: '$treasure.rewardPoints' }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
};

module.exports = {
  User,
  Treasure,
  TreasureDiscovery,
  Transaction,
  HunterProfile,
  Achievement,
  UserAchievement,
  AdminLog,
  AppSettings,
  findNearbyTreasures,
  calculateDistance,
  getLeaderboard,
  getUserStats,
  getTreasureStats,
  mongoose
};