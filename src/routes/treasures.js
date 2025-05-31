// src/routes/treasures.js - Real Implementation
const express = require('express');
const { query, body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { Treasure, TreasureDiscovery, User, HunterProfile } = require('../models');
const SuiService = require('../services/SuiService');
const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    message: 'Treasures routes working', 
    timestamp: new Date().toISOString(),
    service: 'treasures'
  });
});

// Get nearby treasures - REAL IMPLEMENTATION
router.get('/nearby', [
  query('lat')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Valid latitude is required'),
  query('lng')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Valid longitude is required'),
  query('radius')
    .optional()
    .isInt({ min: 100, max: 50000 })
    .withMessage('Radius must be between 100m and 50km')
], auth, asyncHandler(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const { lat, lng, radius = 5000 } = req.query;
  const userId = req.user.userId;

  console.log(`🗺️ Finding treasures near: ${lat}, ${lng} within ${radius}m`);

  try {
    // 1. Find treasures using MongoDB geospatial query
    const treasures = await Treasure.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(radius)
        }
      },
      isActive: true
    }).limit(20); // Limit results

    console.log(`📍 Found ${treasures.length} treasures in database`);

    // 2. Get list of already discovered treasure IDs
    const discoveredTreasureIds = await TreasureDiscovery.distinct('treasureId');
    console.log(`🔍 ${discoveredTreasureIds.length} treasures already discovered`);

    // 3. Filter out discovered treasures
    const availableTreasures = treasures.filter(
      treasure => !discoveredTreasureIds.includes(treasure.treasureId)
    );

    console.log(`✅ ${availableTreasures.length} treasures available to hunt`);

    // 4. Get user's hunter profile for rank checking
    const hunterProfile = await HunterProfile.findOne({ userId });
    const userRank = getRankNumber(hunterProfile?.rank || 'beginner');

    // 5. Calculate distances and format response
    const treasuresWithDistance = availableTreasures.map(treasure => {
      const distance = calculateDistance(
        parseFloat(lat), parseFloat(lng),
        treasure.latitude, treasure.longitude
      );

      const canHunt = userRank >= treasure.requiredRank;

      return {
        treasureId: treasure.treasureId,
        name: treasure.name,
        description: treasure.description,
        latitude: treasure.latitude,
        longitude: treasure.longitude,
        rarity: treasure.rarity,
        rarityName: getRarityName(treasure.rarity),
        rewardPoints: treasure.rewardPoints,
        requiredRank: treasure.requiredRank,
        requiredRankName: getRankName(treasure.requiredRank),
        distance: Math.round(distance),
        canHunt,
        imageUrl: treasure.imageUrl,
        metadata: treasure.metadata || {}
      };
    });

    // 6. Sort by distance
    treasuresWithDistance.sort((a, b) => a.distance - b.distance);

    res.json({
      success: true,
      message: `Found ${treasuresWithDistance.length} nearby treasures`,
      data: {
        treasures: treasuresWithDistance,
        total: treasuresWithDistance.length,
        userLocation: { 
          latitude: parseFloat(lat), 
          longitude: parseFloat(lng) 
        },
        searchRadius: parseInt(radius),
        userProfile: {
          rank: hunterProfile?.rank || 'beginner',
          rankNumber: userRank,
          totalTreasuresFound: hunterProfile?.totalTreasuresFound || 0
        }
      }
    });

  } catch (error) {
    console.error('❌ Nearby treasures query failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get nearby treasures',
      error: error.message
    });
  }
}));

// Discover treasure - REAL IMPLEMENTATION
router.post('/discover', [
  body('treasureId').notEmpty().withMessage('Treasure ID is required'),
  body('location.latitude').isFloat({ min: -90, max: 90 }),
  body('location.longitude').isFloat({ min: -180, max: 180 }),
  body('locationProof').notEmpty().withMessage('Location proof is required')
], auth, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const { treasureId, location, nfcData, qrData, locationProof } = req.body;
  const userId = req.user.userId;

  console.log(`🏴‍☠️ User ${userId} attempting to discover treasure: ${treasureId}`);

  try {
    // 1. Verify treasure exists
    const treasure = await Treasure.findOne({ 
      treasureId, 
      isActive: true 
    });

    if (!treasure) {
      return res.status(404).json({
        success: false,
        message: 'Treasure not found or inactive'
      });
    }

    console.log(`✅ Treasure found: ${treasure.name}`);

    // 2. Check if already discovered
    const existingDiscovery = await TreasureDiscovery.findOne({ treasureId });
    if (existingDiscovery) {
      return res.status(400).json({
        success: false,
        message: 'Treasure already discovered',
        data: {
          discoveredBy: existingDiscovery.userId,
          discoveredAt: existingDiscovery.discoveredAt
        }
      });
    }

    // 3. Verify user location vs treasure location
    const distance = calculateDistance(
      location.latitude, location.longitude,
      treasure.latitude, treasure.longitude
    );

    console.log(`📍 Distance to treasure: ${Math.round(distance)}m`);

    if (distance > 100) { // 100 meters tolerance
      return res.status(400).json({
        success: false,
        message: 'You are too far from the treasure location',
        data: { 
          distance: Math.round(distance), 
          maxDistance: 100,
          treasureLocation: {
            latitude: treasure.latitude,
            longitude: treasure.longitude
          },
          userLocation: location
        }
      });
    }

    // 4. Check user rank requirement
    const hunterProfile = await HunterProfile.findOne({ userId });
    const userRank = getRankNumber(hunterProfile?.rank || 'beginner');

    if (userRank < treasure.requiredRank) {
      return res.status(400).json({
        success: false,
        message: 'Your hunter rank is too low for this treasure',
        data: {
          userRank: hunterProfile?.rank || 'beginner',
          requiredRank: getRankName(treasure.requiredRank),
          userRankNumber: userRank,
          requiredRankNumber: treasure.requiredRank
        }
      });
    }

    // 5. Get user blockchain data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // 6. Call Sui smart contract (if user has blockchain profile)
    let discoveryResult = null;
    let nftObjectId = null;
    let transactionDigest = null;

    if (user.profileObjectId && user.encryptedPrivateKey) {
      try {
        console.log('⛓️ Calling Sui smart contract...');
        const suiService = new SuiService();
        
        discoveryResult = await suiService.discoverTreasure(
          user.encryptedPrivateKey,
          user.profileObjectId,
          treasureId,
          `${location.latitude},${location.longitude}`
        );

        nftObjectId = discoveryResult.nftObjectId;
        transactionDigest = discoveryResult.transactionDigest;
        
        console.log(`✅ NFT minted: ${nftObjectId}`);
      } catch (blockchainError) {
        console.warn(`⚠️ Blockchain mint failed: ${blockchainError.message}`);
        // Continue without blockchain - save discovery anyway
      }
    } else {
      console.warn('⚠️ User has no blockchain profile, skipping smart contract call');
    }

    // 7. Save discovery to database
    const treasureDiscovery = new TreasureDiscovery({
      userId,
      treasureId,
      nftObjectId: nftObjectId || `offline_${Date.now()}`, // Fallback ID
      transactionDigest: transactionDigest || 'offline_transaction',
      locationProof: {
        latitude: location.latitude,
        longitude: location.longitude,
        nfcData,
        qrData,
        timestamp: new Date(),
        distance: Math.round(distance)
      },
      verificationData: {
        blockHeight: discoveryResult?.blockHeight,
        gasUsed: discoveryResult?.gasUsed,
        offline: !discoveryResult
      },
      discoveredAt: new Date()
    });

    await treasureDiscovery.save();
    console.log(`✅ Discovery saved to database`);

    // 8. Update hunter profile
    const oldRank = hunterProfile.rank;
    const oldScore = hunterProfile.totalScore;
    
    hunterProfile.totalTreasuresFound += 1;
    hunterProfile.totalScore += treasure.rewardPoints;
    hunterProfile.lastHuntTimestamp = new Date();

    // Update streak
    const timeDiff = Date.now() - (hunterProfile.lastHuntTimestamp?.getTime() || 0);
    if (timeDiff <= 86400000) { // 24 hours
      hunterProfile.currentStreak += 1;
    } else {
      hunterProfile.currentStreak = 1;
    }

    if (hunterProfile.currentStreak > hunterProfile.longestStreak) {
      hunterProfile.longestStreak = hunterProfile.currentStreak;
    }

    // Update rank based on total treasures found
    updateHunterRank(hunterProfile);

    await hunterProfile.save();
    console.log(`✅ Hunter profile updated: ${hunterProfile.rank}`);

    // 9. Success response
    res.json({
      success: true,
      message: 'Treasure discovered successfully! 🎉',
      data: {
        discovery: {
          discoveryId: treasureDiscovery._id,
          discoveredAt: treasureDiscovery.discoveredAt,
          distance: Math.round(distance)
        },
        nft: nftObjectId ? {
          objectId: nftObjectId,
          transactionDigest,
          blockHeight: discoveryResult?.blockHeight,
          onChain: !!discoveryResult
        } : null,
        treasure: {
          treasureId: treasure.treasureId,
          name: treasure.name,
          description: treasure.description,
          rarity: treasure.rarity,
          rarityName: getRarityName(treasure.rarity),
          rewardPoints: treasure.rewardPoints,
          imageUrl: treasure.imageUrl
        },
        profile: {
          oldRank,
          newRank: hunterProfile.rank,
          rankUpgraded: oldRank !== hunterProfile.rank,
          oldScore,
          newScore: hunterProfile.totalScore,
          pointsEarned: treasure.rewardPoints,
          totalTreasures: hunterProfile.totalTreasuresFound,
          currentStreak: hunterProfile.currentStreak,
          longestStreak: hunterProfile.longestStreak
        }
      }
    });

  } catch (error) {
    console.error('❌ Treasure discovery failed:', error);

    // Handle specific blockchain errors
    if (error.message?.includes('E_TREASURE_ALREADY_FOUND')) {
      return res.status(400).json({
        success: false,
        message: 'This treasure has already been found on the blockchain'
      });
    }

    if (error.message?.includes('E_INVALID_LOCATION')) {
      return res.status(400).json({
        success: false,
        message: 'Location verification failed on blockchain'
      });
    }

    if (error.message?.includes('Insufficient SUI balance')) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient SUI balance for transaction fees'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to discover treasure',
      error: error.message
    });
  }
}));

// Get all treasures (admin/debug)
router.get('/', auth, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, rarity, discovered } = req.query;
  
  const query = { isActive: true };
  if (rarity) query.rarity = parseInt(rarity);
  
  const treasures = await Treasure.find(query)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 });
    
  const total = await Treasure.countDocuments(query);
  
  // Add discovery status
  const treasuresWithStatus = await Promise.all(
    treasures.map(async (treasure) => {
      const discovery = await TreasureDiscovery.findOne({ treasureId: treasure.treasureId });
      return {
        ...treasure.toObject(),
        discovered: !!discovery,
        discoveredAt: discovery?.discoveredAt,
        discoveredBy: discovery?.userId
      };
    })
  );
  
  res.json({
    success: true,
    data: {
      treasures: treasuresWithStatus,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
}));

// Helper functions
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}

function getRankNumber(rank) {
  const ranks = {
    'beginner': 1,
    'explorer': 2,
    'hunter': 3,
    'master': 4
  };
  return ranks[rank] || 1;
}

function getRankName(rankNumber) {
  const ranks = {
    1: 'Beginner',
    2: 'Explorer', 
    3: 'Hunter',
    4: 'Master'
  };
  return ranks[rankNumber] || 'Beginner';
}

function getRarityName(rarity) {
  const rarities = {
    1: 'Common',
    2: 'Rare',
    3: 'Legendary'
  };
  return rarities[rarity] || 'Common';
}

function updateHunterRank(profile) {
  const treasuresFound = profile.totalTreasuresFound;
  
  if (treasuresFound >= 50) {
    profile.rank = 'master';
  } else if (treasuresFound >= 20) {
    profile.rank = 'hunter';
  } else if (treasuresFound >= 5) {
    profile.rank = 'explorer';
  } else {
    profile.rank = 'beginner';
  }
}

module.exports = router;