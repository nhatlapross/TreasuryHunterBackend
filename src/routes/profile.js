// src/routes/profile.js - Complete Real Implementation
const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { User, HunterProfile, TreasureDiscovery, Transaction, Achievement, UserAchievement } = require('../models');
const SuiService = require('../services/SuiService');
const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    message: 'Profile routes working', 
    timestamp: new Date().toISOString(),
    service: 'profile'
  });
});

// Get user profile stats
router.get('/stats', auth, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  try {
    // Get user and hunter profile
    const [user, hunterProfile] = await Promise.all([
      User.findById(userId),
      HunterProfile.findOne({ userId })
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!hunterProfile) {
      return res.status(404).json({
        success: false,
        message: 'Hunter profile not found'
      });
    }

    // Get additional stats
    const [
      recentDiscoveries,
      totalEarned,
      achievements,
      leaderboardPosition
    ] = await Promise.all([
      TreasureDiscovery.find({ userId })
        .populate('treasureId', 'name rarity imageUrl')
        .sort({ discoveredAt: -1 })
        .limit(5),
      Transaction.aggregate([
        { $match: { userId, type: 'treasure_reward', status: 'success' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      UserAchievement.find({ userId })
        .populate('achievementId', 'name description icon points')
        .sort({ unlockedAt: -1 }),
      getLeaderboardPosition(userId)
    ]);

    // Calculate streak info
    const streakInfo = calculateStreakInfo(hunterProfile);
    
    // Get rank info
    const rankInfo = getRankInfo(hunterProfile.rank, hunterProfile.totalTreasuresFound);

    // Wallet balance
    let walletBalance = '0';
    try {
      const suiService = new SuiService();
      walletBalance = await suiService.getBalance(user.suiAddress);
    } catch (error) {
      console.warn('⚠️ Failed to get wallet balance:', error.message);
    }

    res.json({
      success: true,
      data: {
        user: {
          userId: user._id,
          username: user.username,
          email: user.email,
          suiAddress: user.suiAddress,
          profileObjectId: user.profileObjectId,
          avatarUrl: user.avatarUrl,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt
        },
        profile: {
          rank: hunterProfile.rank,
          rankInfo,
          totalTreasuresFound: hunterProfile.totalTreasuresFound,
          totalScore: hunterProfile.totalScore,
          currentStreak: hunterProfile.currentStreak,
          longestStreak: hunterProfile.longestStreak,
          lastHuntTimestamp: hunterProfile.lastHuntTimestamp,
          streakInfo
        },
        wallet: {
          balance: walletBalance,
          balanceSui: (parseFloat(walletBalance) / 1000000000).toFixed(4),
          totalEarned: totalEarned[0]?.total || 0,
          totalEarnedSui: ((totalEarned[0]?.total || 0) / 1000000000).toFixed(4)
        },
        achievements: {
          total: achievements.length,
          recent: achievements.slice(0, 3),
          totalPoints: achievements.reduce((sum, ach) => sum + (ach.achievementId?.points || 0), 0)
        },
        leaderboard: {
          position: leaderboardPosition,
          percentile: leaderboardPosition ? calculatePercentile(leaderboardPosition) : null
        },
        recentActivity: {
          discoveries: recentDiscoveries.map(discovery => ({
            treasureId: discovery.treasureId?._id,
            treasureName: discovery.treasureId?.name,
            rarity: discovery.treasureId?.rarity,
            discoveredAt: discovery.discoveredAt,
            nftObjectId: discovery.nftObjectId
          }))
        },
        statistics: hunterProfile.statistics || {}
      }
    });

  } catch (error) {
    console.error('❌ Failed to get profile stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile statistics',
      error: error.message
    });
  }
}));

router.get('/debug-wallet', auth, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        userId: user._id,
        username: user.username,
        suiAddress: user.suiAddress,
        hasEncryptedPrivateKey: !!user.encryptedPrivateKey,
        encryptedPrivateKeyLength: user.encryptedPrivateKey?.length || 0,
        profileObjectId: user.profileObjectId,
        hasProfileObjectId: !!user.profileObjectId,
        // Don't expose the actual encrypted key for security
        encryptedPrivateKeyPreview: user.encryptedPrivateKey ? 
          user.encryptedPrivateKey.substring(0, 20) + '...' : 
          null
      }
    });

  } catch (error) {
    console.error('Debug wallet error:', error);
    res.status(500).json({
      success: false,
      message: 'Debug failed',
      error: error.message
    });
  }
}));

// Debug decryption process
router.post('/test-decryption', auth, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('🔍 Testing decryption process...');
    console.log('📝 Encrypted key preview:', user.encryptedPrivateKey.substring(0, 30) + '...');
    console.log('🔑 Master key exists:', !!process.env.ENCRYPTION_MASTER_KEY);
    console.log('🔑 Master key length:', process.env.ENCRYPTION_MASTER_KEY?.length || 0);

    const suiService = new SuiService();
    
    try {
      // Test the full keypair loading process (this includes decryption + fromB64 + keypair creation)
      const keypair = suiService.loadKeypair(user.encryptedPrivateKey);
      const address = keypair.getPublicKey().toSuiAddress();
      
      console.log('✅ Full keypair loading successful');
      console.log('📍 Derived address:', address);
      console.log('📍 Stored address:', user.suiAddress);
      console.log('✅ Addresses match:', address === user.suiAddress);

      res.json({
        success: true,
        message: 'Decryption test successful',
        data: {
          decryptionWorked: true,
          base64ConversionWorked: true,
          keypairCreationWorked: true,
          derivedAddress: address,
          storedAddress: user.suiAddress,
          addressesMatch: address === user.suiAddress
        }
      });

    } catch (decryptError) {
      console.error('❌ Decryption test failed:', decryptError);
      
      res.json({
        success: false,
        message: 'Decryption test failed',
        error: decryptError.message,
        data: {
          step: 'keypair_loading',
          encryptedKeyLength: user.encryptedPrivateKey?.length,
          masterKeyExists: !!process.env.ENCRYPTION_MASTER_KEY,
          masterKeyLength: process.env.ENCRYPTION_MASTER_KEY?.length
        }
      });
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Test failed',
      error: error.message
    });
  }
}));


router.get('/blockchain-stats', auth, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.profileObjectId) {
      return res.status(400).json({
        success: false,
        message: 'User does not have a blockchain profile',
        data: {
          hasProfile: false,
          suggestion: 'Create blockchain profile first'
        }
      });
    }

    // 🆕 GET: Hunter stats from blockchain
    const suiService = new SuiService();
    const blockchainStats = await suiService.getHunterStats(user.profileObjectId);

    // Get database stats for comparison
    const hunterProfile = await HunterProfile.findOne({ userId });

    res.json({
      success: true,
      data: {
        blockchain: {
          profileObjectId: user.profileObjectId,
          stats: blockchainStats.stats,
          explorerUrl: `https://explorer.sui.io/object/${user.profileObjectId}?network=${process.env.SUI_NETWORK || 'testnet'}`,
          lastUpdated: blockchainStats.lastUpdated
        },
        database: hunterProfile ? {
          rank: hunterProfile.rank,
          totalTreasuresFound: hunterProfile.totalTreasuresFound,
          totalScore: hunterProfile.totalScore,
          currentStreak: hunterProfile.currentStreak
        } : null,
        comparison: {
          synchronized: hunterProfile ? 
            (blockchainStats.stats.totalTreasuresFound === hunterProfile.totalTreasuresFound) : 
            false,
          blockchainLeading: blockchainStats.stats.totalTreasuresFound > (hunterProfile?.totalTreasuresFound || 0),
          databaseLeading: (hunterProfile?.totalTreasuresFound || 0) > blockchainStats.stats.totalTreasuresFound
        }
      }
    });

  } catch (error) {
    console.error('❌ Failed to get blockchain stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get blockchain statistics',
      error: error.message
    });
  }
}));

// Create hunter profile on blockchain
router.post('/create-blockchain-profile', [
  body('username').optional().isLength({ min: 3, max: 50 }).matches(/^[a-zA-Z0-9_]+$/),
], auth, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const userId = req.user.userId;
  const { username } = req.body;

  try {
    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user already has a blockchain profile
    if (user.profileObjectId) {
      return res.status(400).json({
        success: false,
        message: 'User already has a blockchain profile',
        data: {
          existingProfileId: user.profileObjectId
        }
      });
    }

    // Check if user has encrypted private key
    if (!user.encryptedPrivateKey) {
      return res.status(400).json({
        success: false,
        message: 'User wallet not properly configured'
      });
    }

    console.log(`⛓️ Creating blockchain profile for user: ${user.username}`);

    // Create hunter profile on blockchain
    const suiService = new SuiService();
    const profileResult = await suiService.createHunterProfile(
      user.encryptedPrivateKey,
      username || user.username
    );

    // Update user with profile object ID
    user.profileObjectId = profileResult.profileObjectId;
    await user.save();

    console.log(`✅ Blockchain profile created: ${profileResult.profileObjectId}`);

    res.json({
      success: true,
      message: 'Hunter profile created on blockchain successfully! ⛓️',
      data: {
        profileObjectId: profileResult.profileObjectId,
        transactionDigest: profileResult.transactionDigest,
        username: username || user.username,
        wallet: {
          address: user.suiAddress,
          network: process.env.SUI_NETWORK || 'testnet'
        },
        explorerUrl: `https://explorer.sui.io/object/${profileResult.profileObjectId}?network=${process.env.SUI_NETWORK || 'testnet'}`,
        transactionUrl: `https://explorer.sui.io/txblock/${profileResult.transactionDigest}?network=${process.env.SUI_NETWORK || 'testnet'}`
      }
    });

  } catch (error) {
    console.error('❌ Failed to create blockchain profile:', error);

    // Handle specific blockchain errors
    if (error.message?.includes('Insufficient SUI balance')) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient SUI balance for transaction. Need at least 0.02 SUI for gas fees.',
        error: 'INSUFFICIENT_GAS'
      });
    }

    if (error.message?.includes('connection')) {
      return res.status(503).json({
        success: false,
        message: 'Blockchain service temporarily unavailable',
        error: 'BLOCKCHAIN_UNAVAILABLE'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create blockchain profile',
      error: error.message
    });
  }
}));

// Update user profile
router.put('/update', [
  body('username').optional().isLength({ min: 3, max: 50 }).matches(/^[a-zA-Z0-9_]+$/),
  body('email').optional().isEmail().normalizeEmail(),
  body('avatarUrl').optional().isURL()
], auth, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const userId = req.user.userId;
  const { username, email, avatarUrl } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if username or email already exists (if changing)
    if (username && username !== user.username) {
      const existingUser = await User.findOne({ username, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Username already taken'
        });
      }
    }

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already registered'
        });
      }
    }

    // Update user data
    const updateData = {};
    if (username) updateData.username = username;
    if (email) updateData.email = email;
    if (avatarUrl) updateData.avatarUrl = avatarUrl;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );

    console.log(`✅ Profile updated for user: ${updatedUser.username}`);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          userId: updatedUser._id,
          username: updatedUser.username,
          email: updatedUser.email,
          suiAddress: updatedUser.suiAddress,
          avatarUrl: updatedUser.avatarUrl,
          updatedAt: new Date()
        }
      }
    });

  } catch (error) {
    console.error('❌ Failed to update profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
}));

// Get achievements
router.get('/achievements', [
  query('category').optional().isString(),
  query('unlocked').optional().isBoolean()
], auth, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { category, unlocked } = req.query;

  try {
    // Get all available achievements
    const achievementQuery = { isActive: true };
    if (category) achievementQuery.category = category;

    const [allAchievements, userAchievements] = await Promise.all([
      Achievement.find(achievementQuery),
      UserAchievement.find({ userId }).populate('achievementId')
    ]);

    // Create map of unlocked achievements
    const unlockedMap = userAchievements.reduce((map, userAch) => {
      if (userAch.achievementId) {
        map[userAch.achievementId.achievementId] = {
          unlockedAt: userAch.unlockedAt,
          points: userAch.achievementId.points
        };
      }
      return map;
    }, {});

    // Format achievements
    let formattedAchievements = allAchievements.map(achievement => ({
      achievementId: achievement.achievementId,
      name: achievement.name,
      description: achievement.description,
      icon: achievement.icon,
      category: achievement.category,
      requirementType: achievement.requirementType,
      requirementValue: achievement.requirementValue,
      points: achievement.points,
      isUnlocked: !!unlockedMap[achievement.achievementId],
      unlockedAt: unlockedMap[achievement.achievementId]?.unlockedAt || null,
      progress: calculateAchievementProgress(userId, achievement)
    }));

    // Filter by unlocked status if requested
    if (unlocked !== undefined) {
      formattedAchievements = formattedAchievements.filter(ach => 
        ach.isUnlocked === (unlocked === 'true')
      );
    }

    // Group by category
    const achievementsByCategory = formattedAchievements.reduce((groups, achievement) => {
      const category = achievement.category || 'general';
      if (!groups[category]) groups[category] = [];
      groups[category].push(achievement);
      return groups;
    }, {});

    res.json({
      success: true,
      data: {
        achievements: formattedAchievements,
        byCategory: achievementsByCategory,
        stats: {
          total: allAchievements.length,
          unlocked: userAchievements.length,
          totalPoints: userAchievements.reduce((sum, ach) => sum + (ach.achievementId?.points || 0), 0),
          completionRate: ((userAchievements.length / allAchievements.length) * 100).toFixed(1)
        }
      }
    });

  } catch (error) {
    console.error('❌ Failed to get achievements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get achievements',
      error: error.message
    });
  }
}));

// Get leaderboard
router.get('/leaderboard', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('sortBy').optional().isIn(['score', 'treasures', 'streak'])
], auth, asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, sortBy = 'score' } = req.query;
  const userId = req.user.userId;

  try {
    // Build sort criteria
    let sortCriteria = {};
    switch (sortBy) {
      case 'treasures':
        sortCriteria = { totalTreasuresFound: -1, totalScore: -1 };
        break;
      case 'streak':
        sortCriteria = { currentStreak: -1, totalScore: -1 };
        break;
      default:
        sortCriteria = { totalScore: -1, totalTreasuresFound: -1 };
    }

    // Get leaderboard data
    const leaderboard = await HunterProfile.aggregate([
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
        $sort: sortCriteria
      },
      {
        $skip: (page - 1) * limit
      },
      {
        $limit: parseInt(limit)
      },
      {
        $project: {
          userId: '$user._id',
          username: '$user.username',
          avatarUrl: '$user.avatarUrl',
          rank: 1,
          totalTreasuresFound: 1,
          totalScore: 1,
          currentStreak: 1,
          longestStreak: 1,
          isCurrentUser: { $eq: ['$userId', userId] }
        }
      }
    ]);

    // Add position numbers
    const startPosition = (page - 1) * limit + 1;
    const leaderboardWithPositions = leaderboard.map((entry, index) => ({
      ...entry,
      position: startPosition + index
    }));

    // Get current user's position if not in current page
    let currentUserPosition = null;
    const currentUserEntry = leaderboard.find(entry => entry.isCurrentUser);
    
    if (!currentUserEntry) {
      currentUserPosition = await getUserLeaderboardPosition(userId, sortBy);
    }

    // Get total count
    const totalCount = await HunterProfile.countDocuments({});

    res.json({
      success: true,
      data: {
        leaderboard: leaderboardWithPositions,
        currentUser: currentUserEntry || currentUserPosition,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit),
          hasNext: page * limit < totalCount,
          hasPrev: page > 1
        },
        sortBy
      }
    });

  } catch (error) {
    console.error('❌ Failed to get leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get leaderboard',
      error: error.message
    });
  }
}));

// Get discovery history
router.get('/discoveries', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('rarity').optional().isInt({ min: 1, max: 3 })
], auth, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { page = 1, limit = 20, rarity } = req.query;

  try {
    // Build query
    const query = { userId };
    
    // Get discoveries with treasure info
    const discoveries = await TreasureDiscovery.find(query)
      .populate({
        path: 'treasureId',
        match: rarity ? { rarity: parseInt(rarity) } : {},
        select: 'name description rarity imageUrl rewardPoints'
      })
      .sort({ discoveredAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Filter out discoveries where treasure doesn't match rarity filter
    const filteredDiscoveries = discoveries.filter(discovery => discovery.treasureId);

    // Format discoveries
    const formattedDiscoveries = filteredDiscoveries.map(discovery => ({
      discoveryId: discovery._id,
      nftObjectId: discovery.nftObjectId,
      transactionDigest: discovery.transactionDigest,
      discoveredAt: discovery.discoveredAt,
      treasure: {
        treasureId: discovery.treasureId.treasureId,
        name: discovery.treasureId.name,
        description: discovery.treasureId.description,
        rarity: discovery.treasureId.rarity,
        rarityName: getRarityName(discovery.treasureId.rarity),
        rewardPoints: discovery.treasureId.rewardPoints,
        imageUrl: discovery.treasureId.imageUrl
      },
      location: discovery.locationProof,
      explorerUrl: discovery.nftObjectId ? 
        `https://explorer.sui.io/object/${discovery.nftObjectId}?network=${process.env.SUI_NETWORK || 'testnet'}` : 
        null
    }));

    // Get total count
    const totalQuery = rarity ? 
      TreasureDiscovery.aggregate([
        { $match: { userId } },
        { $lookup: { from: 'treasures', localField: 'treasureId', foreignField: 'treasureId', as: 'treasure' } },
        { $match: { 'treasure.rarity': parseInt(rarity) } },
        { $count: 'total' }
      ]) :
      TreasureDiscovery.countDocuments({ userId });

    const totalCount = Array.isArray(totalQuery) ? 
      (await totalQuery)[0]?.total || 0 : 
      await totalQuery;

    res.json({
      success: true,
      data: {
        discoveries: formattedDiscoveries,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit),
          hasNext: page * limit < totalCount,
          hasPrev: page > 1
        },
        filters: {
          rarity: rarity ? parseInt(rarity) : null
        }
      }
    });

  } catch (error) {
    console.error('❌ Failed to get discovery history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get discovery history',
      error: error.message
    });
  }
}));

// Helper functions
async function getLeaderboardPosition(userId) {
  try {
    const userProfile = await HunterProfile.findOne({ userId });
    if (!userProfile) return null;

    const position = await HunterProfile.countDocuments({
      $or: [
        { totalScore: { $gt: userProfile.totalScore } },
        { 
          totalScore: userProfile.totalScore,
          totalTreasuresFound: { $gt: userProfile.totalTreasuresFound }
        }
      ]
    });

    return position + 1;
  } catch (error) {
    console.error('Failed to get leaderboard position:', error);
    return null;
  }
}

async function getUserLeaderboardPosition(userId, sortBy) {
  try {
    const userProfile = await HunterProfile.findOne({ userId }).populate('userId', 'username avatarUrl');
    if (!userProfile) return null;

    let countQuery = {};
    switch (sortBy) {
      case 'treasures':
        countQuery = {
          $or: [
            { totalTreasuresFound: { $gt: userProfile.totalTreasuresFound } },
            { 
              totalTreasuresFound: userProfile.totalTreasuresFound,
              totalScore: { $gt: userProfile.totalScore }
            }
          ]
        };
        break;
      case 'streak':
        countQuery = {
          $or: [
            { currentStreak: { $gt: userProfile.currentStreak } },
            { 
              currentStreak: userProfile.currentStreak,
              totalScore: { $gt: userProfile.totalScore }
            }
          ]
        };
        break;
      default:
        countQuery = {
          $or: [
            { totalScore: { $gt: userProfile.totalScore } },
            { 
              totalScore: userProfile.totalScore,
              totalTreasuresFound: { $gt: userProfile.totalTreasuresFound }
            }
          ]
        };
    }

    const position = await HunterProfile.countDocuments(countQuery) + 1;

    return {
      userId: userProfile.userId._id,
      username: userProfile.userId.username,
      avatarUrl: userProfile.userId.avatarUrl,
      rank: userProfile.rank,
      totalTreasuresFound: userProfile.totalTreasuresFound,
      totalScore: userProfile.totalScore,
      currentStreak: userProfile.currentStreak,
      position,
      isCurrentUser: true
    };
  } catch (error) {
    console.error('Failed to get user leaderboard position:', error);
    return null;
  }
}

function calculateStreakInfo(hunterProfile) {
  const now = new Date();
  const lastHunt = hunterProfile.lastHuntTimestamp;
  
  if (!lastHunt) {
    return {
      isActive: false,
      daysSinceLastHunt: null,
      streakStatus: 'No hunts yet',
      nextStreakAt: null
    };
  }

  const timeDiff = now.getTime() - lastHunt.getTime();
  const daysDiff = Math.floor(timeDiff / (24 * 60 * 60 * 1000));
  
  const isActive = daysDiff <= 1;
  const streakStatus = isActive ? 
    (daysDiff === 0 ? 'Active today' : 'Active (yesterday)') :
    'Streak broken';

  return {
    isActive,
    daysSinceLastHunt: daysDiff,
    streakStatus,
    nextStreakAt: isActive ? null : 'Start hunting to begin new streak'
  };
}

function getRankInfo(rank, treasuresFound) {
  const ranks = {
    'beginner': { name: 'Beginner', next: 'Explorer', nextRequirement: 5, color: '#10b981' },
    'explorer': { name: 'Explorer', next: 'Hunter', nextRequirement: 20, color: '#3b82f6' },
    'hunter': { name: 'Hunter', next: 'Master', nextRequirement: 50, color: '#8b5cf6' },
    'master': { name: 'Master', next: null, nextRequirement: null, color: '#f59e0b' }
  };

  const rankInfo = ranks[rank] || ranks['beginner'];
  
  return {
    ...rankInfo,
    progress: rankInfo.nextRequirement ? 
      Math.min((treasuresFound / rankInfo.nextRequirement) * 100, 100) : 
      100,
    treasuresUntilNext: rankInfo.nextRequirement ? 
      Math.max(rankInfo.nextRequirement - treasuresFound, 0) : 
      0
  };
}

function calculatePercentile(position) {
  // Simplified percentile calculation
  return Math.max(100 - Math.floor((position / 1000) * 100), 1);
}

async function calculateAchievementProgress(userId, achievement) {
  try {
    switch (achievement.requirementType) {
      case 'treasures_found':
        const treasureCount = await TreasureDiscovery.countDocuments({ userId });
        return {
          current: treasureCount,
          required: achievement.requirementValue,
          percentage: Math.min((treasureCount / achievement.requirementValue) * 100, 100)
        };
      
      case 'streak_days':
        const profile = await HunterProfile.findOne({ userId });
        const streakCount = profile?.longestStreak || 0;
        return {
          current: streakCount,
          required: achievement.requirementValue,
          percentage: Math.min((streakCount / achievement.requirementValue) * 100, 100)
        };
      
      case 'score_points':
        const scoreProfile = await HunterProfile.findOne({ userId });
        const score = scoreProfile?.totalScore || 0;
        return {
          current: score,
          required: achievement.requirementValue,
          percentage: Math.min((score / achievement.requirementValue) * 100, 100)
        };
      
      default:
        return {
          current: 0,
          required: achievement.requirementValue,
          percentage: 0
        };
    }
  } catch (error) {
    console.error('Failed to calculate achievement progress:', error);
    return {
      current: 0,
      required: achievement.requirementValue,
      percentage: 0
    };
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

module.exports = router;