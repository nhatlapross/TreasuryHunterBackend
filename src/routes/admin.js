// src/routes/admin.js - Complete Real Implementation
const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { auth, adminAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { 
  User, 
  HunterProfile, 
  Treasure, 
  TreasureDiscovery, 
  Transaction, 
  Achievement, 
  UserAchievement, 
  AdminLog 
} = require('../models');
const SuiService = require('../services/SuiService');
const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    message: 'Admin routes working', 
    timestamp: new Date().toISOString(),
    service: 'admin'
  });
});

// Get admin dashboard stats
router.get('/stats', adminAuth, asyncHandler(async (req, res) => {
  try {
    console.log('📊 Getting admin dashboard stats...');

    // Get various statistics
    const [
      totalUsers,
      totalTreasures,
      totalDiscoveries,
      totalTransactions,
      activeUsers,
      treasureStats,
      userGrowth,
      recentActivity
    ] = await Promise.all([
      User.countDocuments({ isActive: true }),
      Treasure.countDocuments({ isActive: true }),
      TreasureDiscovery.countDocuments(),
      Transaction.countDocuments(),
      User.countDocuments({ 
        isActive: true,
        lastLoginAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
      }),
      getTreasureStatistics(),
      getUserGrowthStats(),
      getRecentActivity()
    ]);

    // Blockchain stats
    let blockchainStats = {};
    try {
      const suiService = new SuiService();
      const networkInfo = suiService.getNetworkInfo();
      blockchainStats = {
        network: networkInfo.network,
        packageId: networkInfo.packageId,
        registryId: networkInfo.treasureRegistryId,
        connected: true
      };
    } catch (error) {
      console.warn('⚠️ Failed to get blockchain stats:', error.message);
      blockchainStats = { connected: false, error: error.message };
    }

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalTreasures,
          totalDiscoveries,
          totalTransactions,
          activeUsers,
          discoveryRate: totalTreasures > 0 ? ((totalDiscoveries / totalTreasures) * 100).toFixed(1) : 0
        },
        treasures: treasureStats,
        users: userGrowth,
        blockchain: blockchainStats,
        recentActivity,
        lastUpdated: new Date()
      }
    });

  } catch (error) {
    console.error('❌ Failed to get admin stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get admin statistics',
      error: error.message
    });
  }
}));

// Get all users with filters
router.get('/users', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString(),
  query('rank').optional().isIn(['beginner', 'explorer', 'hunter', 'master']),
  query('active').optional().isBoolean()
], adminAuth, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const { page = 1, limit = 20, search, rank, active } = req.query;

  try {
    // Build query
    let userQuery = {};
    if (active !== undefined) userQuery.isActive = active === 'true';
    if (search) {
      userQuery.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Get users with their profiles
    const users = await User.aggregate([
      { $match: userQuery },
      {
        $lookup: {
          from: 'hunterprofiles',
          localField: '_id',
          foreignField: 'userId',
          as: 'profile'
        }
      },
      {
        $unwind: {
          path: '$profile',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $match: rank ? { 'profile.rank': rank } : {}
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
        $project: {
          username: 1,
          email: 1,
          suiAddress: 1,
          profileObjectId: 1,
          isActive: 1,
          createdAt: 1,
          lastLoginAt: 1,
          profile: {
            rank: '$profile.rank',
            totalTreasuresFound: '$profile.totalTreasuresFound',
            totalScore: '$profile.totalScore',
            currentStreak: '$profile.currentStreak'
          },
          discoveryCount: { $size: '$discoveries' }
        }
      },
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) }
    ]);

    // Get total count
    const totalCount = await User.countDocuments(userQuery);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        },
        filters: { search, rank, active }
      }
    });

  } catch (error) {
    console.error('❌ Failed to get users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users',
      error: error.message
    });
  }
}));

// Create new treasure
router.post('/treasures', [
  body('treasureId').notEmpty().withMessage('Treasure ID is required'),
  body('name').isLength({ min: 3, max: 100 }).withMessage('Name must be 3-100 characters'),
  body('description').optional().isString(),
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
  body('rarity').isInt({ min: 1, max: 3 }).withMessage('Rarity must be 1, 2, or 3'),
  body('rewardPoints').isInt({ min: 1 }).withMessage('Reward points must be positive'),
  body('requiredRank').isInt({ min: 1, max: 4 }).withMessage('Required rank must be 1-4'),
  body('imageUrl').optional().isURL()
], adminAuth, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const {
    treasureId,
    name,
    description,
    latitude,
    longitude,
    rarity,
    rewardPoints,
    requiredRank,
    imageUrl,
    metadata
  } = req.body;

  try {
    // Check if treasure ID already exists
    const existingTreasure = await Treasure.findOne({ treasureId });
    if (existingTreasure) {
      return res.status(400).json({
        success: false,
        message: 'Treasure ID already exists'
      });
    }

    // Create new treasure
    const treasure = new Treasure({
      treasureId,
      name,
      description: description || '',
      location: {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      },
      rarity: parseInt(rarity),
      rewardPoints: parseInt(rewardPoints),
      requiredRank: parseInt(requiredRank),
      imageUrl: imageUrl || '',
      metadata: metadata || {},
      createdBy: req.user.userId,
      isActive: true
    });

    await treasure.save();

    // Log admin action
    await logAdminAction(req.user.userId, 'create_treasure', 'treasure', treasureId, {
      name,
      rarity,
      rewardPoints,
      location: { latitude, longitude }
    }, req);

    console.log(`✅ Treasure created: ${treasureId} by admin ${req.user.userId}`);

    res.status(201).json({
      success: true,
      message: 'Treasure created successfully',
      data: {
        treasure: {
          id: treasure._id,
          treasureId: treasure.treasureId,
          name: treasure.name,
          description: treasure.description,
          latitude: treasure.latitude,
          longitude: treasure.longitude,
          rarity: treasure.rarity,
          rarityName: getRarityName(treasure.rarity),
          rewardPoints: treasure.rewardPoints,
          requiredRank: treasure.requiredRank,
          imageUrl: treasure.imageUrl,
          createdAt: treasure.createdAt
        }
      }
    });

  } catch (error) {
    console.error('❌ Failed to create treasure:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create treasure',
      error: error.message
    });
  }
}));

// Update treasure
router.put('/treasures/:treasureId', [
  body('name').optional().isLength({ min: 3, max: 100 }),
  body('description').optional().isString(),
  body('rarity').optional().isInt({ min: 1, max: 3 }),
  body('rewardPoints').optional().isInt({ min: 1 }),
  body('requiredRank').optional().isInt({ min: 1, max: 4 }),
  body('isActive').optional().isBoolean(),
  body('imageUrl').optional().isURL()
], adminAuth, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const { treasureId } = req.params;
  const updateData = req.body;

  try {
    const treasure = await Treasure.findOne({ treasureId });
    if (!treasure) {
      return res.status(404).json({
        success: false,
        message: 'Treasure not found'
      });
    }

    // Check if treasure has been discovered
    const isDiscovered = await TreasureDiscovery.exists({ treasureId });
    if (isDiscovered && (updateData.rarity || updateData.rewardPoints)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify rarity or reward points of discovered treasure'
      });
    }

    // Update treasure
    const updatedTreasure = await Treasure.findOneAndUpdate(
      { treasureId },
      updateData,
      { new: true, runValidators: true }
    );

    // Log admin action
    await logAdminAction(req.user.userId, 'update_treasure', 'treasure', treasureId, {
      updatedFields: Object.keys(updateData),
      changes: updateData
    }, req);

    console.log(`✅ Treasure updated: ${treasureId} by admin ${req.user.userId}`);

    res.json({
      success: true,
      message: 'Treasure updated successfully',
      data: {
        treasure: {
          id: updatedTreasure._id,
          treasureId: updatedTreasure.treasureId,
          name: updatedTreasure.name,
          description: updatedTreasure.description,
          latitude: updatedTreasure.latitude,
          longitude: updatedTreasure.longitude,
          rarity: updatedTreasure.rarity,
          rarityName: getRarityName(updatedTreasure.rarity),
          rewardPoints: updatedTreasure.rewardPoints,
          requiredRank: updatedTreasure.requiredRank,
          imageUrl: updatedTreasure.imageUrl,
          isActive: updatedTreasure.isActive,
          updatedAt: updatedTreasure.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('❌ Failed to update treasure:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update treasure',
      error: error.message
    });
  }
}));

// Delete treasure
router.delete('/treasures/:treasureId', adminAuth, asyncHandler(async (req, res) => {
  const { treasureId } = req.params;

  try {
    const treasure = await Treasure.findOne({ treasureId });
    if (!treasure) {
      return res.status(404).json({
        success: false,
        message: 'Treasure not found'
      });
    }

    // Check if treasure has been discovered
    const isDiscovered = await TreasureDiscovery.exists({ treasureId });
    if (isDiscovered) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete discovered treasure. Set as inactive instead.'
      });
    }

    // Delete treasure
    await Treasure.findOneAndDelete({ treasureId });

    // Log admin action
    await logAdminAction(req.user.userId, 'delete_treasure', 'treasure', treasureId, {
      name: treasure.name,
      rarity: treasure.rarity
    }, req);

    console.log(`✅ Treasure deleted: ${treasureId} by admin ${req.user.userId}`);

    res.json({
      success: true,
      message: 'Treasure deleted successfully'
    });

  } catch (error) {
    console.error('❌ Failed to delete treasure:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete treasure',
      error: error.message
    });
  }
}));

// Manage user (ban/unban/update)
router.put('/users/:userId', [
  body('isActive').optional().isBoolean(),
  body('rank').optional().isIn(['beginner', 'explorer', 'hunter', 'master']),
  body('action').optional().isIn(['ban', 'unban', 'update'])
], adminAuth, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const { userId } = req.params;
  const { isActive, rank, action } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let updateData = {};
    let actionType = action || 'update';

    // Handle specific actions
    if (action === 'ban') {
      updateData.isActive = false;
      actionType = 'ban_user';
    } else if (action === 'unban') {
      updateData.isActive = true;
      actionType = 'unban_user';
    } else {
      if (isActive !== undefined) updateData.isActive = isActive;
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );

    // Update hunter profile if rank specified
    let updatedProfile = null;
    if (rank) {
      updatedProfile = await HunterProfile.findOneAndUpdate(
        { userId },
        { rank },
        { new: true }
      );
    }

    // Log admin action
    await logAdminAction(req.user.userId, actionType, 'user', userId, {
      username: user.username,
      changes: { ...updateData, rank },
      reason: req.body.reason || 'Admin action'
    }, req);

    console.log(`✅ User ${actionType}: ${user.username} by admin ${req.user.userId}`);

    res.json({
      success: true,
      message: `User ${actionType} successfully`,
      data: {
        user: {
          userId: updatedUser._id,
          username: updatedUser.username,
          email: updatedUser.email,
          isActive: updatedUser.isActive,
          rank: updatedProfile?.rank || null,
          updatedAt: updatedUser.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('❌ Failed to manage user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to manage user',
      error: error.message
    });
  }
}));

// Get admin logs
router.get('/logs', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('action').optional().isString(),
  query('adminId').optional().isString()
], adminAuth, asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, action, adminId } = req.query;

  try {
    // Build query
    const query = {};
    if (action) query.action = action;
    if (adminId) query.adminUserId = adminId;

    const logs = await AdminLog.find(query)
      .populate('adminUserId', 'username email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await AdminLog.countDocuments(query);

    res.json({
      success: true,
      data: {
        logs: logs.map(log => ({
          id: log._id,
          action: log.action,
          actionDisplay: formatAdminAction(log.action),
          targetType: log.targetType,
          targetId: log.targetId,
          details: log.details,
          admin: {
            userId: log.adminUserId._id,
            username: log.adminUserId.username
          },
          ipAddress: log.ipAddress,
          createdAt: log.createdAt
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Failed to get admin logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get admin logs',
      error: error.message
    });
  }
}));

// System health check
router.get('/system', adminAuth, asyncHandler(async (req, res) => {
  try {
    // Database health
    const dbHealth = await checkDatabaseHealth();
    
    // Blockchain health
    let blockchainHealth = {};
    try {
      const suiService = new SuiService();
      blockchainHealth = await suiService.healthCheck();
    } catch (error) {
      blockchainHealth = { connected: false, error: error.message };
    }

    // Server stats
    const serverStats = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform,
      environment: process.env.NODE_ENV
    };

    res.json({
      success: true,
      data: {
        database: dbHealth,
        blockchain: blockchainHealth,
        server: serverStats,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('❌ Failed to get system health:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get system health',
      error: error.message
    });
  }
}));

// Helper functions
async function getTreasureStatistics() {
  try {
    const stats = await Treasure.aggregate([
      {
        $group: {
          _id: '$rarity',
          count: { $sum: 1 },
          totalReward: { $sum: '$rewardPoints' },
          active: {
            $sum: { $cond: ['$isActive', 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const discoveryStats = await TreasureDiscovery.aggregate([
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
          discovered: { $sum: 1 }
        }
      }
    ]);

    const discoveryMap = discoveryStats.reduce((map, item) => {
      map[item._id] = item.discovered;
      return map;
    }, {});

    return stats.map(stat => ({
      rarity: stat._id,
      rarityName: getRarityName(stat._id),
      total: stat.count,
      active: stat.active,
      discovered: discoveryMap[stat._id] || 0,
      totalReward: stat.totalReward,
      discoveryRate: stat.count > 0 ? ((discoveryMap[stat._id] || 0) / stat.count * 100).toFixed(1) : 0
    }));
  } catch (error) {
    console.error('Failed to get treasure statistics:', error);
    return [];
  }
}

async function getUserGrowthStats() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const growth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
          },
          newUsers: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    return growth.map(item => ({
      date: item._id.date,
      newUsers: item.newUsers
    }));
  } catch (error) {
    console.error('Failed to get user growth stats:', error);
    return [];
  }
}

async function getRecentActivity() {
  try {
    const [recentDiscoveries, recentUsers] = await Promise.all([
      TreasureDiscovery.find()
        .populate('userId', 'username')
        .populate('treasureId', 'name rarity')
        .sort({ discoveredAt: -1 })
        .limit(10),
      User.find({ isActive: true })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('username email createdAt')
    ]);

    return {
      discoveries: recentDiscoveries.map(discovery => ({
        id: discovery._id,
        username: discovery.userId?.username,
        treasureName: discovery.treasureId?.name,
        rarity: discovery.treasureId?.rarity,
        discoveredAt: discovery.discoveredAt
      })),
      newUsers: recentUsers.map(user => ({
        id: user._id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt
      }))
    };
  } catch (error) {
    console.error('Failed to get recent activity:', error);
    return { discoveries: [], newUsers: [] };
  }
}

async function checkDatabaseHealth() {
  try {
    const mongoose = require('mongoose');
    const isConnected = mongoose.connection.readyState === 1;
    
    if (!isConnected) {
      return { connected: false, status: 'disconnected' };
    }

    // Test database operations
    const testQuery = await User.findOne().limit(1);
    
    return {
      connected: true,
      status: 'healthy',
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    };
  } catch (error) {
    return {
      connected: false,
      status: 'error',
      error: error.message
    };
  }
}

async function logAdminAction(adminUserId, action, targetType, targetId, details, req) {
  try {
    const adminLog = new AdminLog({
      adminUserId,
      action,
      targetType,
      targetId,
      details,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });
    await adminLog.save();
  } catch (error) {
    console.error('Failed to log admin action:', error);
  }
}

function getRarityName(rarity) {
  const rarities = {
    1: 'Common',
    2: 'Rare',
    3: 'Legendary'
  };
  return rarities[rarity] || 'Common';
}

function formatAdminAction(action) {
  const actions = {
    'create_treasure': 'Create Treasure',
    'update_treasure': 'Update Treasure',
    'delete_treasure': 'Delete Treasure',
    'ban_user': 'Ban User',
    'unban_user': 'Unban User',
    'system_update': 'System Update'
  };
  return actions[action] || action;
}

module.exports = router;