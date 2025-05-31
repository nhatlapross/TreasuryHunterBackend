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


router.get('/verify/:treasureId', auth, asyncHandler(async (req, res) => {
    const { treasureId } = req.params;

    try {
        // Check database
        const dbTreasure = await Treasure.findOne({ treasureId, isActive: true });

        // 🆕 CHECK: Verify in blockchain registry
        const suiService = new SuiService();
        const blockchainVerification = await suiService.verifyTreasureInRegistry(treasureId);

        // Check if already discovered
        const discovery = await TreasureDiscovery.findOne({ treasureId });

        res.json({
            success: true,
            data: {
                treasureId,
                database: {
                    exists: !!dbTreasure,
                    active: dbTreasure?.isActive || false,
                    name: dbTreasure?.name || null,
                    rarity: dbTreasure?.rarity || null
                },
                blockchain: {
                    exists: blockchainVerification.exists,
                    verified: blockchainVerification.exists && !blockchainVerification.error,
                    error: blockchainVerification.error || null
                },
                discovery: {
                    discovered: !!discovery,
                    discoveredBy: discovery?.userId || null,
                    discoveredAt: discovery?.discoveredAt || null,
                    nftObjectId: discovery?.nftObjectId || null
                },
                canHunt: !!(dbTreasure && blockchainVerification.exists && !discovery)
            }
        });

    } catch (error) {
        console.error('❌ Failed to verify treasure:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify treasure',
            error: error.message
        });
    }
}));

// Helper function to parse treasure ID and determine defaults
function parseBlockchainTreasure(treasureId, coordinates = "21.0285,105.8542") {
    // Parse coordinates
    const [lat, lng] = coordinates.split(',').map(coord => parseFloat(coord.trim()));

    // Determine rarity and requirements based on treasure ID patterns
    let rarity = 1; // Default: Common
    let requiredRank = 1; // Default: Beginner
    let baseReward = 100; // Default reward

    // Smart parsing based on treasure ID patterns
    if (treasureId.includes('LEGENDARY') || treasureId.includes('DRAGON') || treasureId.includes('EPIC')) {
        rarity = 3; // Legendary
        requiredRank = 3; // Hunter
        baseReward = 500;
    } else if (treasureId.includes('RARE') || treasureId.includes('GOLDEN') || treasureId.includes('ROYAL')) {
        rarity = 2; // Rare
        requiredRank = 2; // Explorer
        baseReward = 300;
    } else if (treasureId.includes('COMMON') || treasureId.includes('BRONZE') || treasureId.includes('BASIC')) {
        rarity = 1; // Common
        requiredRank = 1; // Beginner
        baseReward = 150;
    }

    // Check for specific treasure IDs we know about
    const knownTreasures = {
        'TREASURE_001': {
            name: 'Golden Dragon Statue',
            description: 'An ancient golden dragon statue hidden in the mountains',
            rarity: 3,
            requiredRank: 2,
            rewardPoints: 500,
            imageUrl: 'https://example.com/images/golden_dragon.jpg'
        },
        'VN_COMMON_001': {
            name: 'Ancient Bronze Mirror',
            description: 'A bronze mirror from the Tran Dynasty, reflecting the soul of old Hanoi',
            rarity: 1,
            requiredRank: 1,
            rewardPoints: 150,
            imageUrl: 'https://ipfs.io/ipfs/QmBronzeMirror001'
        }
        // Add more known treasures here if needed
    };

    // Use known data if available, otherwise generate defaults
    const knownData = knownTreasures[treasureId];

    return {
        treasureId,
        name: knownData?.name || generateTreasureName(treasureId),
        description: knownData?.description || generateTreasureDescription(treasureId),
        rarity: knownData?.rarity || rarity,
        rewardPoints: knownData?.rewardPoints || baseReward,
        requiredRank: knownData?.requiredRank || requiredRank,
        latitude: lat,
        longitude: lng,
        location: {
            coordinates: [lng, lat] // [longitude, latitude] for MongoDB
        },
        imageUrl: knownData?.imageUrl || generateImageUrl(treasureId, rarity),
        isActive: true,
        fromBlockchain: true
    };
}

// Helper function to generate treasure name from ID
function generateTreasureName(treasureId) {
    // Convert ID to readable name
    let name = treasureId
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, l => l.toUpperCase());

    // Add descriptive words based on patterns
    if (treasureId.includes('VN_')) {
        name = name.replace('Vn ', 'Vietnamese ');
    }
    if (treasureId.includes('DRAGON')) {
        name += ' Dragon Artifact';
    } else if (treasureId.includes('MIRROR')) {
        name += ' Ancient Mirror';
    } else if (treasureId.includes('COMMON')) {
        name = name.replace('Common', 'Common');
    } else {
        name += ' Treasure';
    }

    return name;
}

// Helper function to generate treasure description
function generateTreasureDescription(treasureId) {
    const prefixes = [
        'A mysterious artifact',
        'An ancient relic',
        'A legendary treasure',
        'A sacred object',
        'A precious item'
    ];

    const suffixes = [
        'hidden in the depths of time',
        'waiting to be discovered',
        'from a forgotten era',
        'blessed with ancient power',
        'containing untold secrets'
    ];

    const prefix = prefixes[Math.abs(treasureId.length) % prefixes.length];
    const suffix = suffixes[Math.abs(treasureId.charCodeAt(0)) % suffixes.length];

    return `${prefix} ${suffix}.`;
}

// Helper function to generate image URL
function generateImageUrl(treasureId, rarity) {
    const baseUrl = 'https://via.placeholder.com/400x400';
    const colors = {
        1: 'green', // Common
        2: 'purple', // Rare  
        3: 'gold' // Legendary
    };

    const color = colors[rarity] || 'gray';
    const text = encodeURIComponent(treasureId.replace(/_/g, ' '));

    return `${baseUrl}/${color}/white?text=${text}`;
}

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
        // 1. Try to find treasure in database first
        let treasure = await Treasure.findOne({
            treasureId,
            isActive: true
        });

        // 🆕 SIMPLIFIED BYPASS: If not found, create it automatically
        if (!treasure) {
            console.log(`⚠️ Treasure ${treasureId} not found in database`);
            console.log(`🔄 Auto-generating treasure data (skipping blockchain verification)...`);

            // Parse coordinates from location proof or request
            const coordinates = locationProof || `${location.latitude},${location.longitude}`;

            // Create treasure using the parseBlockchainTreasure function
            treasure = parseBlockchainTreasure(treasureId, coordinates);

            console.log(`✅ Auto-generated treasure: ${treasure.name}`);
            console.log(`   Rarity: ${treasure.rarity} (${getRarityName(treasure.rarity)})`);
            console.log(`   Reward: ${treasure.rewardPoints} points`);
            console.log(`   Required Rank: ${treasure.requiredRank} (${getRankName(treasure.requiredRank)})`);
        } else {
            console.log(`✅ Treasure found in database: ${treasure.name}`);
        }

        // 2. Check if already discovered
        const existingDiscovery = await TreasureDiscovery.findOne({ treasureId });
        if (existingDiscovery) {
            return res.status(400).json({
                success: false,
                message: 'Treasure already discovered',
                data: {
                    discoveredBy: existingDiscovery.userId,
                    discoveredAt: existingDiscovery.discoveredAt,
                    nftObjectId: existingDiscovery.nftObjectId
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
        if (!hunterProfile) {
            return res.status(400).json({
                success: false,
                message: 'Hunter profile not found. Please create a profile first.'
            });
        }

        const userRank = getRankNumber(hunterProfile.rank || 'beginner');

        if (userRank < treasure.requiredRank) {
            return res.status(400).json({
                success: false,
                message: 'Your hunter rank is too low for this treasure',
                data: {
                    userRank: hunterProfile.rank || 'beginner',
                    requiredRank: getRankName(treasure.requiredRank),
                    userRankNumber: userRank,
                    requiredRankNumber: treasure.requiredRank,
                    treasuresNeeded: getTreasuresNeededForRank(treasure.requiredRank) - hunterProfile.totalTreasuresFound
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
        let blockchainSuccess = false;

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
                blockchainSuccess = true;

                console.log(`✅ NFT minted on blockchain: ${nftObjectId}`);
                console.log(`📜 Transaction: ${transactionDigest}`);
            } catch (blockchainError) {
                console.warn(`⚠️ Blockchain mint failed: ${blockchainError.message}`);

                // 🆕 Check for specific blockchain errors
                if (blockchainError.message?.includes('E_TREASURE_ALREADY_FOUND')) {
                    return res.status(400).json({
                        success: false,
                        message: 'This treasure has already been found on the blockchain',
                        error: 'BLOCKCHAIN_ALREADY_FOUND'
                    });
                }

                if (blockchainError.message?.includes('E_INVALID_LOCATION')) {
                    return res.status(400).json({
                        success: false,
                        message: 'Location verification failed on blockchain',
                        error: 'BLOCKCHAIN_LOCATION_FAILED'
                    });
                }

                if (blockchainError.message?.includes('Insufficient SUI balance')) {
                    return res.status(400).json({
                        success: false,
                        message: 'Insufficient SUI balance for blockchain transaction',
                        error: 'INSUFFICIENT_GAS',
                        suggestion: 'Request SUI from faucet or wait for balance to update'
                    });
                }

                // For other blockchain errors, continue with offline discovery
                console.log(`🔄 Continuing with offline discovery...`);
            }
        } else {
            console.warn('⚠️ User has no blockchain profile, proceeding with offline discovery');
        }

        // 7. Save discovery to database
        const treasureDiscovery = new TreasureDiscovery({
            userId,
            treasureId,
            nftObjectId: nftObjectId || `offline_${treasureId}_${Date.now()}`,
            transactionDigest: transactionDigest || `offline_tx_${Date.now()}`,
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
                blockchainSuccess,
                offline: !blockchainSuccess,
                autoGeneratedTreasure: treasure.fromBlockchain || false
            },
            discoveredAt: new Date()
        });

        await treasureDiscovery.save();
        console.log(`✅ Discovery saved to database: ${treasureDiscovery._id}`);

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
        const previousRank = hunterProfile.rank;
        updateHunterRank(hunterProfile);
        const rankUpgraded = previousRank !== hunterProfile.rank;

        await hunterProfile.save();
        console.log(`✅ Hunter profile updated: ${hunterProfile.rank} (${hunterProfile.totalTreasuresFound} treasures)`);

        // 9. Save auto-generated treasure to database for future reference
        if (treasure.fromBlockchain) {
            console.log(`💾 Saving auto-generated treasure to database...`);

            const newTreasure = new Treasure({
                treasureId: treasure.treasureId,
                name: treasure.name,
                description: treasure.description,
                location: {
                    type: 'Point',
                    coordinates: [treasure.longitude, treasure.latitude]
                },
                rarity: treasure.rarity,
                rewardPoints: treasure.rewardPoints,
                requiredRank: treasure.requiredRank,
                imageUrl: treasure.imageUrl,
                isActive: true,
                metadata: {
                    source: 'auto_generated_on_discovery',
                    syncedAt: new Date(),
                    discoveredBy: userId,
                    discoveryId: treasureDiscovery._id,
                    blockchainSuccess,
                    originalCoordinates: locationProof
                },
                createdBy: userId
            });

            try {
                await newTreasure.save();
                console.log(`✅ Auto-generated treasure saved to database: ${treasureId}`);
            } catch (saveError) {
                console.warn(`⚠️ Failed to save auto-generated treasure:`, saveError.message);
                // Continue anyway - discovery still works
            }
        }

        // 10. Success response
        res.json({
            success: true,
            message: 'Treasure discovered successfully! 🎉',
            data: {
                discovery: {
                    discoveryId: treasureDiscovery._id,
                    discoveredAt: treasureDiscovery.discoveredAt,
                    distance: Math.round(distance),
                    method: blockchainSuccess ? 'blockchain' : 'offline'
                },
                nft: nftObjectId ? {
                    objectId: nftObjectId,
                    transactionDigest,
                    blockHeight: discoveryResult?.blockHeight,
                    onChain: blockchainSuccess,
                    explorerUrl: blockchainSuccess ?
                        `https://testnet.suivision.xyz/object/${nftObjectId}` : null
                } : null,
                treasure: {
                    treasureId: treasure.treasureId,
                    name: treasure.name,
                    description: treasure.description,
                    rarity: treasure.rarity,
                    rarityName: getRarityName(treasure.rarity),
                    rewardPoints: treasure.rewardPoints,
                    imageUrl: treasure.imageUrl,
                    source: treasure.fromBlockchain ? 'auto_generated' : 'database',
                    wasAutoGenerated: treasure.fromBlockchain || false
                },
                profile: {
                    oldRank,
                    newRank: hunterProfile.rank,
                    rankUpgraded,
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

        res.status(500).json({
            success: false,
            message: 'Failed to discover treasure',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
            treasureId,
            debug: process.env.NODE_ENV === 'development' ? {
                stack: error.stack,
                userId,
                location
            } : undefined
        });
    }
}));

// Helper function to get treasures needed for a specific rank
function getTreasuresNeededForRank(rank) {
    const rankRequirements = {
        1: 0,   // Beginner
        2: 5,   // Explorer
        3: 20,  // Hunter
        4: 50   // Master
    };
    return rankRequirements[rank] || 0;
}

// Helper function for rarity names
function getRarityName(rarity) {
    const rarities = {
        1: 'Common',
        2: 'Rare',
        3: 'Legendary'
    };
    return rarities[rarity] || 'Common';
}

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

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

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