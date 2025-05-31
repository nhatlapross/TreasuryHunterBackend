// src/routes/auth.js - Fixed Implementation
const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const SuiService = require('../services/SuiService');
const { User, HunterProfile } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { auth } = require('../middleware/auth'); // ← ADD THIS MISSING IMPORT
const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    message: 'Auth routes working',
    timestamp: new Date().toISOString(),
    service: 'auth'
  });
});

// Register new user with Sui wallet creation
router.post('/register', [
  body('username')
    .isLength({ min: 3, max: 50 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username must be 3-50 characters and contain only letters, numbers, and underscores'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
], asyncHandler(async (req, res) => {
  // 1. Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const { username, email, password } = req.body;

  // 2. Check if user already exists
  const existingUser = await User.findOne({
    $or: [{ email }, { username }]
  });

  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: existingUser.email === email ? 'Email already registered' : 'Username already taken'
    });
  }

  let user = null;
  let hunterProfile = null;

  try {
    // 3. Create Sui wallet with proper 32-byte key
    console.log(`🔐 Creating Sui wallet for user: ${username}`);
    const suiService = new SuiService();
    const walletData = await suiService.createWallet(username);
    
    console.log(`✅ Sui wallet created: ${walletData.address}`);
    console.log(`📝 Encrypted key length: ${walletData.encryptedPrivateKey.length}`);

    // 4. Verify the wallet works by testing decryption
    try {
      const testKeypair = suiService.loadKeypair(walletData.encryptedPrivateKey);
      const testAddress = testKeypair.getPublicKey().toSuiAddress();
      
      if (testAddress !== walletData.address) {
        throw new Error('Wallet verification failed - addresses do not match');
      }
      
      console.log(`✅ Wallet verification passed: ${testAddress}`);
    } catch (verifyError) {
      console.error('❌ Wallet verification failed:', verifyError);
      throw new Error(`Wallet verification failed: ${verifyError.message}`);
    }

    // 5. Hash password if provided
    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 12);
    }

    // 6. Create user in database
    user = new User({
      username,
      email,
      suiAddress: walletData.address,
      encryptedPrivateKey: walletData.encryptedPrivateKey,
      password: hashedPassword,
      isActive: true
    });

    await user.save();
    console.log(`✅ User saved to database: ${user._id}`);

    // 7. Create hunter profile in database
    hunterProfile = new HunterProfile({
      userId: user._id,
      rank: 'beginner',
      totalTreasuresFound: 0,
      totalScore: 0,
      currentStreak: 0,
      longestStreak: 0
    });

    await hunterProfile.save();
    console.log(`✅ Hunter profile saved to database`);

    // 8. Try to create blockchain profile (optional - don't fail if this fails)
    console.log(`⛓️ Attempting to create hunter profile on blockchain...`);
    try {
      // Check if user has some SUI first
      const balance = await suiService.getBalance(walletData.address);
      const suiBalance = Number(balance) / 1000000000;
      
      if (suiBalance >= 0.02) {
        const profileResult = await suiService.createHunterProfile(
          walletData.encryptedPrivateKey,
          username
        );

        // Update user with profile object ID
        user.profileObjectId = profileResult.profileObjectId;
        await user.save();
        
        console.log(`✅ Hunter profile created on blockchain: ${profileResult.profileObjectId}`);
      } else {
        console.log(`⚠️ Insufficient SUI balance (${suiBalance}) for blockchain profile creation`);
      }
    } catch (blockchainError) {
      console.warn(`⚠️ Failed to create blockchain profile: ${blockchainError.message}`);
      // Continue without blockchain profile - can be created later
    }

    // 9. Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id, 
        suiAddress: user.suiAddress,
        username: user.username,
        role: 'user'
      },
      process.env.JWT_SECRET,
      { 
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        issuer: 'treasure-hunt-api',
        audience: 'treasure-hunt-app'
      }
    );

    // 10. Get wallet balance
    let walletBalance = '0';
    try {
      walletBalance = await suiService.getBalance(user.suiAddress);
    } catch (balanceError) {
      console.warn(`⚠️ Failed to get wallet balance: ${balanceError.message}`);
    }

    // 11. Success response
    res.status(201).json({
      success: true,
      message: 'User registered successfully! Sui wallet created.',
      data: {
        user: {
          userId: user._id,
          username: user.username,
          email: user.email,
          suiAddress: user.suiAddress,
          profileObjectId: user.profileObjectId,
          rank: hunterProfile.rank,
          createdAt: user.createdAt
        },
        wallet: {
          address: user.suiAddress,
          balance: walletBalance,
          suiBalance: (parseFloat(walletBalance) / 1000000000).toFixed(4),
          verified: true // We verified the wallet works
        },
        token,
        tokenExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
        notes: {
          walletVerified: true,
          blockchainProfileCreated: !!user.profileObjectId,
          needsFaucet: parseFloat(walletBalance) === 0
        }
      }
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    
    // Clean up user if created but process failed
    if (user && user._id) {
      try {
        await User.findByIdAndDelete(user._id);
        if (hunterProfile && hunterProfile._id) {
          await HunterProfile.findByIdAndDelete(hunterProfile._id);
        }
        console.log('✅ Cleanup completed');
      } catch (cleanupError) {
        console.error('❌ Cleanup error:', cleanupError);
      }
    }

    // Return appropriate error
    if (error.message?.includes('Insufficient SUI balance')) {
      return res.status(400).json({
        success: false,
        message: 'Wallet created but failed to create blockchain profile. You can create it later after getting SUI.',
        error: 'INSUFFICIENT_GAS'
      });
    }

    if (error.message?.includes('Wallet verification failed')) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create valid wallet. Please try again.',
        error: 'WALLET_VERIFICATION_FAILED'
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
      message: 'Registration failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
}));

// Login user
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').optional()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const { email, password } = req.body;

  // Find user
  const user = await User.findOne({ email, isActive: true });
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password'
    });
  }

  // Check password
  if (user.password && password) {
    // If user has password and password provided, check it
    if (!await bcrypt.compare(password, user.password)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
  } else if (user.password && !password) {
    // User has password but none provided
    return res.status(401).json({
      success: false,
      message: 'Password is required for this account'
    });
  }

  // Update last login
  user.lastLoginAt = new Date();
  await user.save();

  // Get hunter profile
  const hunterProfile = await HunterProfile.findOne({ userId: user._id });

  // Generate token
  const token = jwt.sign(
    {
      userId: user._id,
      suiAddress: user.suiAddress,
      username: user.username,
      role: 'user'
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: 'treasure-hunt-api',
      audience: 'treasure-hunt-app'
    }
  );

  // Get wallet balance
  let walletBalance = '0';
  try {
    const suiService = new SuiService();
    walletBalance = await suiService.getBalance(user.suiAddress);
  } catch (error) {
    console.warn(`⚠️ Failed to get wallet balance: ${error.message}`);
  }

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        userId: user._id,
        username: user.username,
        email: user.email,
        suiAddress: user.suiAddress,
        profileObjectId: user.profileObjectId,
        rank: hunterProfile?.rank || 'beginner',
        lastLoginAt: user.lastLoginAt
      },
      wallet: {
        address: user.suiAddress,
        balance: walletBalance,
        suiBalance: (parseFloat(walletBalance) / 1000000000).toFixed(4)
      },
      profile: hunterProfile ? {
        rank: hunterProfile.rank,
        totalTreasuresFound: hunterProfile.totalTreasuresFound,
        totalScore: hunterProfile.totalScore,
        currentStreak: hunterProfile.currentStreak
      } : null,
      token,
      tokenExpiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  });
}));

// Verify and fix wallet if needed
router.post('/verify-wallet', auth, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('🔍 Verifying wallet for user:', user.username);

    const suiService = new SuiService();
    
    try {
      // Test if current wallet works
      const keypair = suiService.loadKeypair(user.encryptedPrivateKey);
      const derivedAddress = keypair.getPublicKey().toSuiAddress();
      
      if (derivedAddress === user.suiAddress) {
        // Wallet is perfect
        const balance = await suiService.getBalance(user.suiAddress);
        
        res.json({
          success: true,
          message: 'Wallet is working perfectly',
          data: {
            status: 'verified',
            address: user.suiAddress,
            balance: balance,
            balanceSui: (parseFloat(balance) / 1000000000).toFixed(4),
            canSignTransactions: true
          }
        });
      } else {
        // Address mismatch - update stored address
        console.log('⚠️ Address mismatch, updating stored address');
        
        user.suiAddress = derivedAddress;
        await user.save();
        
        const balance = await suiService.getBalance(derivedAddress);
        
        res.json({
          success: true,
          message: 'Wallet address updated to match private key',
          data: {
            status: 'address_updated',
            oldAddress: user.suiAddress,
            newAddress: derivedAddress,
            balance: balance,
            balanceSui: (parseFloat(balance) / 1000000000).toFixed(4),
            canSignTransactions: true
          }
        });
      }
      
    } catch (walletError) {
      // Wallet is broken, need to recreate
      console.log('❌ Wallet is broken, recreating...');
      
      const walletData = await suiService.createWallet(user.username);
      
      // Update user with new wallet
      user.suiAddress = walletData.address;
      user.encryptedPrivateKey = walletData.encryptedPrivateKey;
      user.profileObjectId = null; // Clear old blockchain profile
      await user.save();
      
      const balance = await suiService.getBalance(walletData.address);
      
      res.json({
        success: true,
        message: 'Wallet recreated successfully',
        data: {
          status: 'recreated',
          newAddress: walletData.address,
          balance: balance,
          balanceSui: (parseFloat(balance) / 1000000000).toFixed(4),
          canSignTransactions: true,
          note: 'Old wallet was corrupted and has been replaced'
        }
      });
    }

  } catch (error) {
    console.error('❌ Wallet verification failed:', error);
    res.status(500).json({
      success: false,
      message: 'Wallet verification failed',
      error: error.message
    });
  }
}));

// Verify token
router.get('/verify', auth, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    data: {
      user: req.user
    }
  });
});

// Logout (for completeness)
router.post('/logout', (req, res) => {
  // In a stateless JWT system, logout is handled client-side
  // You could maintain a blacklist of tokens if needed
  res.json({
    success: true,
    message: 'Logout successful. Please remove token from client.'
  });
});

// Request SUI from faucet (testnet only)
router.post('/faucet', auth, asyncHandler(async (req, res) => {
  if (process.env.SUI_NETWORK === 'mainnet') {
    return res.status(400).json({
      success: false,
      message: 'Faucet not available on mainnet'
    });
  }

  const user = await User.findById(req.user.userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  try {
    const suiService = new SuiService();
    const faucetResult = await suiService.requestFaucet(user.suiAddress);

    if (faucetResult.success) {
      // Get updated balance
      const newBalance = await suiService.getBalance(user.suiAddress);

      res.json({
        success: true,
        message: 'SUI tokens requested successfully',
        data: {
          transactionDigests: faucetResult.transactionDigests,
          newBalance,
          suiBalance: (parseFloat(newBalance) / 1000000000).toFixed(4)
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: faucetResult.message
      });
    }
  } catch (error) {
    console.error('Faucet request error:', error);
    res.status(500).json({
      success: false,
      message: 'Faucet request failed',
      error: error.message
    });
  }
}));

module.exports = router;