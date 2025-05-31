// src/scripts/seedData.js - Complete database seeding with comprehensive sample data
require('dotenv').config();
const { connect, disconnect } = require('../database/connection');
const { 
  User, 
  Treasure, 
  Achievement, 
  AppSettings, 
  HunterProfile,
  TreasureDiscovery,
  Transaction,
  UserAchievement 
} = require('../models');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// ========================================
// HANOI TREASURES DATA
// ========================================
const hanoiTreasures = [
  {
    treasureId: 'hanoi_hoan_kiem_001',
    name: 'Hoan Kiem Lake Sacred Sword',
    description: 'Legend says that King Le Loi returned the magical sword to the Golden Turtle God here. Find the hidden treasure where history and myth converge.',
    location: {
      type: 'Point',
      coordinates: [105.8542, 21.0285] // Hoan Kiem Lake
    },
    rarity: 3, // Legendary
    rewardPoints: 500,
    requiredRank: 2,
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=300&fit=crop',
    metadata: {
      district: 'Hoan Kiem',
      difficulty: 'hard',
      estimatedTime: '45 minutes',
      historicalPeriod: 'Le Dynasty',
      tags: ['legend', 'lake', 'sword', 'turtle'],
      hints: [
        'Where the turtle emerged from depths below',
        'The pagoda on the island holds ancient secrets',
        'Dawn is the best time to seek the truth'
      ],
      clues: {
        nfc_location: 'Near Ngoc Son Temple entrance',
        qr_location: 'Under the red bridge'
      }
    }
  },
  {
    treasureId: 'hanoi_temple_literature_001',
    name: 'Temple of Literature Scholar\'s Wisdom',
    description: 'Vietnam\'s first university holds treasures of knowledge. Discover what the ancient scholars left behind for future generations.',
    location: {
      type: 'Point',
      coordinates: [105.8355, 21.0267] // Temple of Literature
    },
    rarity: 2, // Rare
    rewardPoints: 300,
    requiredRank: 2,
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1555400208-5498b6b6b4f2?w=400&h=300&fit=crop',
    metadata: {
      district: 'Dong Da',
      difficulty: 'medium',
      estimatedTime: '35 minutes',
      historicalPeriod: 'Ly Dynasty',
      tags: ['education', 'confucius', 'literature', 'wisdom'],
      hints: [
        'Where 82 stone steles honor doctorate holders',
        'In the courtyard of the sages',
        'Knowledge is the greatest treasure'
      ],
      clues: {
        nfc_location: 'Near the Well of Heavenly Clarity',
        qr_location: 'Behind the main altar'
      }
    }
  },
  {
    treasureId: 'hanoi_old_quarter_001',
    name: 'Old Quarter Ancient Merchant\'s Cache',
    description: 'Hidden among the 36 ancient streets, a merchant once buried his treasures. Navigate the maze of history to claim your prize.',
    location: {
      type: 'Point',
      coordinates: [105.8520, 21.0351] // Old Quarter center
    },
    rarity: 1, // Common
    rewardPoints: 150,
    requiredRank: 1,
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=400&h=300&fit=crop',
    metadata: {
      district: 'Hoan Kiem',
      difficulty: 'easy',
      estimatedTime: '20 minutes',
      historicalPeriod: 'Medieval Period',
      tags: ['trade', 'streets', 'guilds', 'market'],
      hints: [
        'Where 36 guilds once traded their wares',
        'Follow the street of silver craftsmen',
        'The past echoes in narrow alleyways'
      ],
      clues: {
        nfc_location: 'Hang Bac Street corner',
        qr_location: 'Traditional coffee shop entrance'
      }
    }
  },
  {
    treasureId: 'hanoi_ba_dinh_001',
    name: 'Ba Dinh Independence Treasure',
    description: 'Where Uncle Ho declared independence, patriots once hid revolutionary treasures. Honor the past while discovering the future.',
    location: {
      type: 'Point',
      coordinates: [105.8336, 21.0369] // Ba Dinh Square
    },
    rarity: 2, // Rare
    rewardPoints: 400,
    requiredRank: 2,
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1580840513932-6b3aa472a3e9?w=400&h=300&fit=crop',
    metadata: {
      district: 'Ba Dinh',
      difficulty: 'medium',
      estimatedTime: '40 minutes',
      historicalPeriod: 'Modern Era',
      tags: ['independence', 'revolution', 'patriotism', 'history'],
      hints: [
        'Where freedom\'s voice first rang clear',
        'September 2nd, 1945 - remember this date',
        'National pride runs deep in these grounds'
      ],
      clues: {
        nfc_location: 'Near the Presidential Palace',
        qr_location: 'Ho Chi Minh Mausoleum vicinity'
      }
    }
  },
  {
    treasureId: 'hanoi_west_lake_001',
    name: 'West Lake Golden Pagoda Mystery',
    description: 'Hanoi\'s largest lake holds secrets beneath its serene surface. Find the treasure where monks once meditated by moonlight.',
    location: {
      type: 'Point',
      coordinates: [105.8252, 21.0545] // West Lake - Tran Quoc Pagoda
    },
    rarity: 2, // Rare
    rewardPoints: 250,
    requiredRank: 1,
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
    metadata: {
      district: 'Tay Ho',
      difficulty: 'medium',
      estimatedTime: '30 minutes',
      historicalPeriod: 'Ancient Times',
      tags: ['lake', 'pagoda', 'buddhism', 'serenity'],
      hints: [
        'Vietnam\'s oldest Buddhist temple stands guard',
        'Lotus flowers bloom where treasure sleeps',
        'Sunset prayers reveal hidden paths'
      ],
      clues: {
        nfc_location: 'Tran Quoc Pagoda entrance',
        qr_location: 'Lakeside walking path'
      }
    }
  },
  {
    treasureId: 'hanoi_long_bien_001',
    name: 'Long Bien Bridge Colonial Legacy',
    description: 'This iconic bridge witnessed both French colonial rule and American bombing. Discover what survived the test of time.',
    location: {
      type: 'Point',
      coordinates: [105.8667, 21.0447] // Long Bien Bridge
    },
    rarity: 1, // Common
    rewardPoints: 180,
    requiredRank: 1,
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400&h=300&fit=crop',
    metadata: {
      district: 'Long Bien',
      difficulty: 'easy',
      estimatedTime: '25 minutes',
      historicalPeriod: 'Colonial Period',
      tags: ['bridge', 'colonial', 'architecture', 'resilience'],
      hints: [
        'Built by the same engineer as Eiffel Tower',
        'Iron and steel tell stories of war and peace',
        'Trains still cross where history was made'
      ],
      clues: {
        nfc_location: 'Bridge entrance monument',
        qr_location: 'Railway platform area'
      }
    }
  },
  {
    treasureId: 'hanoi_dong_xuan_001',
    name: 'Dong Xuan Market Trader\'s Fortune',
    description: 'In Hanoi\'s oldest and largest covered market, a clever trader once hid his most precious goods. Can you outsmart the crowds?',
    location: {
      type: 'Point',
      coordinates: [105.8500, 21.0380] // Dong Xuan Market
    },
    rarity: 1, // Common
    rewardPoints: 120,
    requiredRank: 1,
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=300&fit=crop',
    metadata: {
      district: 'Hoan Kiem',
      difficulty: 'easy',
      estimatedTime: '15 minutes',
      historicalPeriod: 'Modern Era',
      tags: ['market', 'trade', 'commerce', 'crowds'],
      hints: [
        'Where wholesale meets retail chaos',
        'Navigate between fabric and food stalls',
        'Early morning brings the best deals'
      ],
      clues: {
        nfc_location: 'Main entrance gate',
        qr_location: 'Food court area'
      }
    }
  },
  {
    treasureId: 'hanoi_one_pillar_001',
    name: 'One Pillar Pagoda Miracle',
    description: 'Built from a royal dream of Goddess of Mercy, this unique pagoda holds miraculous treasures for those who believe.',
    location: {
      type: 'Point',
      coordinates: [105.8350, 21.0356] // One Pillar Pagoda
    },
    rarity: 3, // Legendary
    rewardPoints: 600,
    requiredRank: 3,
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=300&fit=crop',
    metadata: {
      district: 'Ba Dinh',
      difficulty: 'hard',
      estimatedTime: '50 minutes',
      historicalPeriod: 'Ly Dynasty',
      tags: ['pagoda', 'miracle', 'royal', 'unique'],
      hints: [
        'Built from Emperor Ly Thai To\'s divine dream',
        'Lotus blossom rising from water',
        'Single pillar supports infinite faith'
      ],
      clues: {
        nfc_location: 'Pagoda base pillar',
        qr_location: 'Lotus pond edge'
      }
    }
  }
];

// ========================================
// ACHIEVEMENTS DATA
// ========================================
const achievements = [
  {
    achievementId: 'first_steps',
    name: 'First Steps',
    description: 'Complete your very first treasure hunt',
    icon: 'footprints',
    category: 'milestone',
    requirementType: 'treasures_found',
    requirementValue: 1,
    points: 50,
    isActive: true
  },
  {
    achievementId: 'novice_hunter',
    name: 'Novice Hunter',
    description: 'Find 5 treasures to prove your dedication',
    icon: 'search',
    category: 'milestone',
    requirementType: 'treasures_found',
    requirementValue: 5,
    points: 150,
    isActive: true
  },
  {
    achievementId: 'treasure_collector',
    name: 'Treasure Collector',
    description: 'Amass a collection of 10 discovered treasures',
    icon: 'collection',
    category: 'milestone',
    requirementType: 'treasures_found',
    requirementValue: 10,
    points: 300,
    isActive: true
  },
  {
    achievementId: 'master_explorer',
    name: 'Master Explorer',
    description: 'Discover 25 treasures across the city',
    icon: 'compass',
    category: 'milestone',
    requirementType: 'treasures_found',
    requirementValue: 25,
    points: 750,
    isActive: true
  },
  {
    achievementId: 'legendary_seeker',
    name: 'Legendary Seeker',
    description: 'Find an incredible 50 treasures',
    icon: 'crown',
    category: 'milestone',
    requirementType: 'treasures_found',
    requirementValue: 50,
    points: 1500,
    isActive: true
  },
  {
    achievementId: 'daily_devotion',
    name: 'Daily Devotion',
    description: 'Hunt treasures for 7 consecutive days',
    icon: 'calendar',
    category: 'streak',
    requirementType: 'consecutive_days',
    requirementValue: 7,
    points: 400,
    isActive: true
  },
  {
    achievementId: 'streak_master',
    name: 'Streak Master',
    description: 'Maintain a 14-day treasure hunting streak',
    icon: 'flame',
    category: 'streak',
    requirementType: 'consecutive_days',
    requirementValue: 14,
    points: 800,
    isActive: true
  },
  {
    achievementId: 'unstoppable_force',
    name: 'Unstoppable Force',
    description: 'Hunt treasures for 30 consecutive days',
    icon: 'lightning',
    category: 'streak',
    requirementType: 'consecutive_days',
    requirementValue: 30,
    points: 2000,
    isActive: true
  },
  {
    achievementId: 'common_collector',
    name: 'Common Collector',
    description: 'Find your first common treasure',
    icon: 'gem-outline',
    category: 'rarity',
    requirementType: 'common_treasures',
    requirementValue: 1,
    points: 25,
    isActive: true
  },
  {
    achievementId: 'rare_finder',
    name: 'Rare Finder',
    description: 'Discover your first rare treasure',
    icon: 'gem',
    category: 'rarity',
    requirementType: 'rare_treasures',
    requirementValue: 1,
    points: 200,
    isActive: true
  },
  {
    achievementId: 'legendary_hunter',
    name: 'Legendary Hunter',
    description: 'Uncover a legendary treasure',
    icon: 'diamond',
    category: 'rarity',
    requirementType: 'legendary_treasures',
    requirementValue: 1,
    points: 1000,
    isActive: true
  },
  {
    achievementId: 'rarity_master',
    name: 'Rarity Master',
    description: 'Find at least one treasure of each rarity',
    icon: 'rainbow',
    category: 'rarity',
    requirementType: 'all_rarities',
    requirementValue: 3,
    points: 1500,
    isActive: true
  },
  {
    achievementId: 'hanoi_explorer',
    name: 'Hanoi Explorer',
    description: 'Discover treasures in 5 different districts',
    icon: 'map',
    category: 'location',
    requirementType: 'districts_visited',
    requirementValue: 5,
    points: 600,
    isActive: true
  },
  {
    achievementId: 'old_quarter_specialist',
    name: 'Old Quarter Specialist',
    description: 'Find all treasures in the historic Old Quarter',
    icon: 'buildings',
    category: 'location',
    requirementType: 'old_quarter_complete',
    requirementValue: 1,
    points: 500,
    isActive: true
  },
  {
    achievementId: 'lake_guardian',
    name: 'Lake Guardian',
    description: 'Discover all treasures around Hanoi\'s lakes',
    icon: 'waves',
    category: 'location',
    requirementType: 'lake_treasures',
    requirementValue: 3,
    points: 400,
    isActive: true
  },
  {
    achievementId: 'early_bird',
    name: 'Early Bird',
    description: 'Find a treasure before 7 AM',
    icon: 'sunrise',
    category: 'special',
    requirementType: 'early_morning_hunt',
    requirementValue: 1,
    points: 300,
    isActive: true
  },
  {
    achievementId: 'night_owl',
    name: 'Night Owl',
    description: 'Discover a treasure after 10 PM',
    icon: 'moon',
    category: 'special',
    requirementType: 'late_night_hunt',
    requirementValue: 1,
    points: 350,
    isActive: true
  },
  {
    achievementId: 'speed_demon',
    name: 'Speed Demon',
    description: 'Find 3 treasures in a single day',
    icon: 'flash',
    category: 'special',
    requirementType: 'daily_treasure_count',
    requirementValue: 3,
    points: 500,
    isActive: true
  },
  {
    achievementId: 'blockchain_pioneer',
    name: 'Blockchain Pioneer',
    description: 'Successfully mint your first NFT treasure',
    icon: 'link',
    category: 'technical',
    requirementType: 'nft_minted',
    requirementValue: 1,
    points: 100,
    isActive: true
  },
  {
    achievementId: 'crypto_collector',
    name: 'Crypto Collector',
    description: 'Own 10 treasure NFTs',
    icon: 'wallet',
    category: 'technical',
    requirementType: 'nfts_owned',
    requirementValue: 10,
    points: 800,
    isActive: true
  }
];

// ========================================
// APP SETTINGS DATA
// ========================================
const appSettings = [
  {
    key: 'app_version',
    value: '1.0.0',
    description: 'Current application version',
    isPublic: true
  },
  {
    key: 'app_name',
    value: 'Treasure Hunt Hanoi',
    description: 'Application display name',
    isPublic: true
  },
  {
    key: 'maintenance_mode',
    value: false,
    description: 'Enable maintenance mode to block user access',
    isPublic: true
  },
  {
    key: 'maintenance_message',
    value: 'We are currently updating the treasure maps. Please check back soon!',
    description: 'Message shown during maintenance',
    isPublic: true
  },
  {
    key: 'faucet_enabled',
    value: true,
    description: 'Enable SUI faucet for testnet users',
    isPublic: false
  },
  {
    key: 'faucet_amount_sui',
    value: 1.0,
    description: 'Amount of SUI given per faucet request',
    isPublic: false
  },
  {
    key: 'faucet_cooldown_hours',
    value: 24,
    description: 'Hours between faucet requests per user',
    isPublic: false
  },
  {
    key: 'max_treasures_per_user',
    value: 100,
    description: 'Maximum treasures a single user can discover',
    isPublic: false
  },
  {
    key: 'location_tolerance_meters',
    value: 100,
    description: 'GPS accuracy tolerance for treasure discovery',
    isPublic: false
  },
  {
    key: 'treasure_discovery_cooldown_seconds',
    value: 300,
    description: 'Minimum seconds between treasure discoveries',
    isPublic: false
  },
  {
    key: 'min_app_version',
    value: '1.0.0',
    description: 'Minimum supported app version',
    isPublic: true
  },
  {
    key: 'featured_treasure_id',
    value: 'hanoi_hoan_kiem_001',
    description: 'Currently featured treasure for promotion',
    isPublic: true
  },
  {
    key: 'daily_treasure_limit',
    value: 5,
    description: 'Maximum treasures per user per day',
    isPublic: false
  },
  {
    key: 'leaderboard_enabled',
    value: true,
    description: 'Enable leaderboard functionality',
    isPublic: true
  },
  {
    key: 'new_user_bonus_sui',
    value: 0.1,
    description: 'Bonus SUI for new user registration',
    isPublic: false
  },
  {
    key: 'treasure_creation_enabled',
    value: true,
    description: 'Allow admin to create new treasures',
    isPublic: false
  },
  {
    key: 'social_sharing_enabled',
    value: true,
    description: 'Enable social media sharing features',
    isPublic: true
  },
  {
    key: 'analytics_enabled',
    value: true,
    description: 'Enable user analytics tracking',
    isPublic: false
  },
  {
    key: 'support_email',
    value: 'support@treasurehunt.vn',
    description: 'Support contact email',
    isPublic: true
  },
  {
    key: 'privacy_policy_url',
    value: 'https://treasurehunt.vn/privacy',
    description: 'Privacy policy URL',
    isPublic: true
  },
  {
    key: 'terms_of_service_url',
    value: 'https://treasurehunt.vn/terms',
    description: 'Terms of service URL',
    isPublic: true
  }
];

// ========================================
// SEEDING FUNCTIONS
// ========================================

async function clearExistingData() {
  logger.info('🧹 Clearing existing data...');
  
  await Promise.all([
    User.deleteMany({}),
    Treasure.deleteMany({}),
    Achievement.deleteMany({}),
    AppSettings.deleteMany({}),
    HunterProfile.deleteMany({}),
    TreasureDiscovery.deleteMany({}),
    Transaction.deleteMany({}),
    UserAchievement.deleteMany({})
  ]);
  
  logger.info('✅ Database cleared successfully');
}

async function seedTreasures() {
  logger.info('💎 Seeding treasures...');
  
  const treasures = await Treasure.insertMany(hanoiTreasures);
  logger.info(`✅ Created ${treasures.length} treasures in Hanoi`);
  
  return treasures;
}

async function seedAchievements() {
  logger.info('🏆 Seeding achievements...');
  
  const createdAchievements = await Achievement.insertMany(achievements);
  logger.info(`✅ Created ${createdAchievements.length} achievements`);
  
  return createdAchievements;
}

async function seedAppSettings() {
  logger.info('⚙️ Seeding app settings...');
  
  const settings = await AppSettings.insertMany(appSettings);
  logger.info(`✅ Created ${settings.length} app settings`);
  
  return settings;
}

async function createIndexes() {
  logger.info('📊 Creating database indexes...');
  
  try {
    // Essential geospatial index for treasure discovery
    await Treasure.collection.createIndex({ location: '2dsphere' });
    
    // Performance indexes
    await Treasure.collection.createIndex({ isActive: 1, rarity: 1 });
    await Treasure.collection.createIndex({ 'metadata.district': 1 });
    
    // User-related indexes
    await User.collection.createIndex({ email: 1 }, { unique: true });
    await User.collection.createIndex({ username: 1 }, { unique: true });
    await User.collection.createIndex({ suiAddress: 1 }, { unique: true });
    
    // Discovery indexes
    await TreasureDiscovery.collection.createIndex({ treasureId: 1 }, { unique: true });
    await TreasureDiscovery.collection.createIndex({ userId: 1, discoveredAt: -1 });
    
    // Transaction indexes
    await Transaction.collection.createIndex({ digest: 1 }, { unique: true });
    await Transaction.collection.createIndex({ userId: 1, createdAt: -1 });
    
    logger.info('✅ Database indexes created successfully');
  } catch (error) {
    logger.warn('⚠️ Some indexes may already exist:', error.message);
  }
}

async function generateSampleUsers() {
  logger.info('👥 Creating sample users...');
  
  const sampleUsers = [
    {
      username: 'hanoi_explorer',
      email: 'explorer@treasurehunt.vn',
      suiAddress: '0x1111111111111111111111111111111111111111111111111111111111111111',
      encryptedPrivateKey: 'sample_encrypted_key_1',
      profileObjectId: '0x2222222222222222222222222222222222222222222222222222222222222222',
      isActive: true
    },
    {
      username: 'legend_seeker',
      email: 'seeker@treasurehunt.vn',
      suiAddress: '0x3333333333333333333333333333333333333333333333333333333333333333',
      encryptedPrivateKey: 'sample_encrypted_key_2',
      profileObjectId: '0x4444444444444444444444444444444444444444444444444444444444444444',
      isActive: true
    }
  ];
  
  const users = await User.insertMany(sampleUsers);
  
  // Create hunter profiles for sample users
  const profiles = await HunterProfile.insertMany([
    {
      userId: users[0]._id,
      rank: 'explorer',
      totalTreasuresFound: 12,
      totalScore: 2400,
      currentStreak: 5,
      longestStreak: 14,
      achievements: ['first_steps', 'novice_hunter', 'rare_finder']
    },
    {
      userId: users[1]._id,
      rank: 'hunter',
      totalTreasuresFound: 28,
      totalScore: 7200,
      currentStreak: 12,
      longestStreak: 25,
      achievements: ['first_steps', 'novice_hunter', 'treasure_collector', 'rare_finder', 'legendary_hunter']
    }
  ]);
  
  logger.info(`✅ Created ${users.length} sample users with profiles`);
  return { users, profiles };
}

// ========================================
// MAIN SEEDING FUNCTION
// ========================================

async function seedDatabase() {
  try {
    logger.info('🌱 Starting comprehensive database seeding...');
    console.log('=====================================');
    console.log('🏴‍☠️ TREASURE HUNT DATABASE SEEDING');
    console.log('=====================================\n');

    // Connect to database
    await connect();
    logger.info('🔗 Connected to MongoDB successfully');

    // Clear existing data in development
    if (process.env.NODE_ENV === 'development') {
      await clearExistingData();
    }

    // Seed all data
    const [treasures, createdAchievements, settings] = await Promise.all([
      seedTreasures(),
      seedAchievements(),
      seedAppSettings()
    ]);

    // Create sample users (optional)
    const { users, profiles } = await generateSampleUsers();

    // Create database indexes
    await createIndexes();

    // Summary
    const summary = {
      treasures: treasures.length,
      achievements: createdAchievements.length,
      appSettings: settings.length,
      sampleUsers: users.length,
      hunterProfiles: profiles.length,
      totalDocuments: treasures.length + createdAchievements.length + settings.length + users.length + profiles.length
    };

    console.log('\n🎉 DATABASE SEEDING COMPLETED!');
    console.log('=====================================');
    console.log('📊 SEEDING SUMMARY:');
    console.log(`💎 Treasures: ${summary.treasures}`);
    console.log(`🏆 Achievements: ${summary.achievements}`);
    console.log(`⚙️ App Settings: ${summary.appSettings}`);
    console.log(`👥 Sample Users: ${summary.sampleUsers}`);
    console.log(`🎯 Hunter Profiles: ${summary.hunterProfiles}`);
    console.log(`📈 Total Documents: ${summary.totalDocuments}`);
    console.log('=====================================');

    // Display treasure locations
    console.log('\n🗺️ HANOI TREASURE LOCATIONS:');
    treasures.forEach((treasure, index) => {
      const coords = treasure.location.coordinates;
      const rarity = treasure.rarity === 3 ? '💎 Legendary' : 
                    treasure.rarity === 2 ? '💜 Rare' : 
                    '💚 Common';
      console.log(`${index + 1}. ${treasure.name} (${rarity})`);
      console.log(`   📍 GPS: ${coords[1]}, ${coords[0]}`);
      console.log(`   🏛️ District: ${treasure.metadata.district}`);
      console.log(`   ⭐ Points: ${treasure.rewardPoints}\n`);
    });

    console.log('🚀 NEXT STEPS:');
    console.log('1. Start server: npm run dev');
    console.log('2. Register a new user via API');
    console.log('3. Test treasure discovery endpoints');
    console.log('4. Check leaderboard functionality\n');

    logger.info('✅ Database seeding completed successfully!');
    return summary;

  } catch (error) {
    logger.error('error during database seeding:', error);
    throw error;
  }
}