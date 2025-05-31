// src/routes/wallet.js - Real Implementation
const express = require('express');
const { query, body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { User, Transaction, TreasureDiscovery } = require('../models');
const SuiService = require('../services/SuiService');
const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    message: 'Wallet routes working', 
    timestamp: new Date().toISOString(),
    service: 'wallet'
  });
});

// Get wallet balance and info
router.get('/balance', auth, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  try {
    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`💰 Getting balance for wallet: ${user.suiAddress}`);

    // Get balance from Sui network
    const suiService = new SuiService();
    const balanceInMist = await suiService.getBalance(user.suiAddress);
    const balanceInSui = (parseFloat(balanceInMist) / 1000000000).toFixed(4);

    console.log(`✅ Balance retrieved: ${balanceInSui} SUI`);

    // Get recent transactions count
    const transactionCount = await Transaction.countDocuments({ userId });
    
    // Get total earned from treasures
    const treasureRewards = await Transaction.aggregate([
      { 
        $match: { 
          userId, 
          type: 'treasure_reward',
          status: 'success' 
        } 
      },
      { 
        $group: { 
          _id: null, 
          totalEarned: { $sum: '$amount' } 
        } 
      }
    ]);

    const totalEarned = treasureRewards[0]?.totalEarned || 0;

    res.json({
      success: true,
      data: {
        wallet: {
          address: user.suiAddress,
          balance: balanceInMist,
          suiBalance: balanceInSui,
          network: process.env.SUI_NETWORK || 'testnet'
        },
        stats: {
          totalTransactions: transactionCount,
          totalEarned,
          totalEarnedSui: (totalEarned / 1000000000).toFixed(4)
        },
        user: {
          username: user.username,
          profileObjectId: user.profileObjectId,
          hasBlockchainProfile: !!user.profileObjectId
        }
      }
    });

  } catch (error) {
    console.error('❌ Failed to get wallet balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get wallet balance',
      error: error.message
    });
  }
}));

// Get wallet address
router.get('/address', auth, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

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
      address: user.suiAddress,
      profileObjectId: user.profileObjectId,
      network: process.env.SUI_NETWORK || 'testnet',
      explorerUrl: `https://explorer.sui.io/address/${user.suiAddress}?network=${process.env.SUI_NETWORK || 'testnet'}`
    }
  });
}));

// Get transaction history
router.get('/transactions', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('type').optional().isIn(['treasure_reward', 'transfer', 'faucet', 'admin'])
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
  const { page = 1, limit = 20, type } = req.query;

  try {
    // Build query
    const query = { userId };
    if (type) query.type = type;

    // Get transactions from database
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(query);

    // Also get transactions from blockchain
    const user = await User.findById(userId);
    let blockchainTransactions = [];
    
    try {
      const suiService = new SuiService();
      blockchainTransactions = await suiService.getTransactionHistory(user.suiAddress, 10);
    } catch (error) {
      console.warn('⚠️ Failed to get blockchain transactions:', error.message);
    }

    // Format transactions
    const formattedTransactions = transactions.map(tx => ({
      id: tx._id,
      digest: tx.digest,
      type: tx.type,
      typeDisplay: formatTransactionType(tx.type),
      amount: tx.amount,
      amountSui: (tx.amount / 1000000000).toFixed(4),
      status: tx.status,
      statusDisplay: formatTransactionStatus(tx.status),
      fromAddress: tx.fromAddress,
      toAddress: tx.toAddress,
      blockHeight: tx.blockHeight,
      gasUsed: tx.gasUsed,
      createdAt: tx.createdAt,
      metadata: tx.metadata || {},
      explorerUrl: tx.digest ? `https://explorer.sui.io/txblock/${tx.digest}?network=${process.env.SUI_NETWORK || 'testnet'}` : null
    }));

    res.json({
      success: true,
      data: {
        transactions: formattedTransactions,
        blockchainTransactions: blockchainTransactions.slice(0, 5), // Latest 5 from blockchain
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('❌ Failed to get transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get transaction history',
      error: error.message
    });
  }
}));

// Get NFTs owned by user
router.get('/nfts', auth, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get discoveries from database
    const discoveries = await TreasureDiscovery.find({ userId })
      .populate('treasureId', 'name description rarity imageUrl')
      .sort({ discoveredAt: -1 });

    const suiService = new SuiService();

    // 🆕 GET: Enhanced NFT details from blockchain
    const enhancedNFTs = await Promise.all(
      discoveries.map(async (discovery) => {
        let blockchainDetails = null;
        
        try {
          if (discovery.nftObjectId && discovery.nftObjectId !== `offline_${discovery.discoveredAt?.getTime()}`) {
            blockchainDetails = await suiService.getTreasureDetails(discovery.nftObjectId);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to get blockchain details for NFT ${discovery.nftObjectId}:`, error.message);
        }

        return {
          id: discovery._id,
          nftObjectId: discovery.nftObjectId,
          // Database data
          database: {
            treasureId: discovery.treasureId?._id,
            name: discovery.treasureId?.name || 'Unknown Treasure',
            description: discovery.treasureId?.description || '',
            rarity: discovery.treasureId?.rarity || 1,
            imageUrl: discovery.treasureId?.imageUrl || '',
            discoveredAt: discovery.discoveredAt
          },
          // Blockchain data
          blockchain: blockchainDetails ? {
            name: blockchainDetails.treasureDetails.name,
            rarity: blockchainDetails.treasureDetails.rarity,
            location: blockchainDetails.treasureDetails.location,
            foundTimestamp: blockchainDetails.treasureDetails.foundTimestamp,
            finderAddress: blockchainDetails.treasureDetails.finderAddress,
            owner: blockchainDetails.owner,
            explorerUrl: blockchainDetails.explorerUrl
          } : null,
          // Status
          onChain: !!blockchainDetails,
          synchronized: blockchainDetails ? 
            (discovery.treasureId?.name === blockchainDetails.treasureDetails.name) : 
            false
        };
      })
    );

    // Group by rarity for stats
    const rarityStats = enhancedNFTs.reduce((acc, nft) => {
      const rarity = getRarityName(nft.database.rarity);
      acc[rarity] = (acc[rarity] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        nfts: enhancedNFTs,
        stats: {
          total: enhancedNFTs.length,
          onChain: enhancedNFTs.filter(nft => nft.onChain).length,
          synchronized: enhancedNFTs.filter(nft => nft.synchronized).length,
          byRarity: rarityStats
        },
        wallet: {
          address: user.suiAddress,
          network: process.env.SUI_NETWORK || 'testnet'
        }
      }
    });

  } catch (error) {
    console.error('❌ Failed to get enhanced NFTs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get NFT collection',
      error: error.message
    });
  }
}));

// Request SUI from faucet (testnet only)
router.post('/faucet', auth, asyncHandler(async (req, res) => {
  if (process.env.SUI_NETWORK === 'mainnet') {
    return res.status(400).json({
      success: false,
      message: 'Faucet not available on mainnet'
    });
  }

  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`🚰 Requesting SUI from faucet for: ${user.suiAddress}`);

    // Check recent faucet requests to prevent spam
    const recentFaucetRequest = await Transaction.findOne({
      userId,
      type: 'faucet',
      createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
    });

    if (recentFaucetRequest) {
      return res.status(429).json({
        success: false,
        message: 'Please wait before requesting more SUI from faucet',
        data: {
          lastRequest: recentFaucetRequest.createdAt,
          nextRequestAvailable: new Date(recentFaucetRequest.createdAt.getTime() + 60 * 60 * 1000)
        }
      });
    }

    // Request from faucet
    const suiService = new SuiService();
    const faucetResult = await suiService.requestFaucet(user.suiAddress);

    if (faucetResult.success) {
      // Record faucet transaction
      const faucetTransaction = new Transaction({
        userId,
        digest: faucetResult.transactionDigests?.[0] || `faucet_${Date.now()}`,
        type: 'faucet',
        amount: 1000000000, // 1 SUI in MIST
        status: 'success',
        fromAddress: 'faucet',
        toAddress: user.suiAddress,
        metadata: {
          faucetResponse: faucetResult,
          network: process.env.SUI_NETWORK
        }
      });
      await faucetTransaction.save();

      // Get updated balance
      const newBalance = await suiService.getBalance(user.suiAddress);
      
      console.log(`✅ Faucet request successful. New balance: ${(parseFloat(newBalance) / 1000000000).toFixed(4)} SUI`);

      res.json({
        success: true,
        message: 'SUI tokens received from faucet!',
        data: {
          transactionDigests: faucetResult.transactionDigests,
          newBalance,
          newBalanceSui: (parseFloat(newBalance) / 1000000000).toFixed(4),
          transactionId: faucetTransaction._id
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: faucetResult.message || 'Faucet request failed'
      });
    }

  } catch (error) {
    console.error('❌ Faucet request failed:', error);
    res.status(500).json({
      success: false,
      message: 'Faucet request failed',
      error: error.message
    });
  }
}));

// Transfer SUI to another address
router.post('/transfer', [
  body('toAddress')
    .matches(/^0x[a-fA-F0-9]{64}$/)
    .withMessage('Invalid Sui address format'),
  body('amount')
    .isFloat({ min: 0.001 })
    .withMessage('Amount must be at least 0.001 SUI'),
  body('note').optional().isString().isLength({ max: 200 })
], auth, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const { toAddress, amount, note } = req.body;
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user || !user.encryptedPrivateKey) {
      return res.status(400).json({
        success: false,
        message: 'User wallet not found or not properly configured'
      });
    }

    // Check balance
    const suiService = new SuiService();
    const balance = await suiService.getBalance(user.suiAddress);
    const balanceInSui = parseFloat(balance) / 1000000000;
    const amountInMist = Math.floor(parseFloat(amount) * 1000000000);

    if (balanceInSui < parseFloat(amount) + 0.01) { // Include gas fee
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance for transfer and gas fees',
        data: {
          currentBalance: balanceInSui.toFixed(4),
          requestedAmount: parseFloat(amount),
          estimatedGas: 0.01
        }
      });
    }

    console.log(`💸 Transferring ${amount} SUI from ${user.suiAddress} to ${toAddress}`);

    // Execute transfer (this would need to be implemented in SuiService)
    // For now, we'll create a pending transaction
    const transferTransaction = new Transaction({
      userId,
      digest: `transfer_${Date.now()}`, // Will be updated with real digest
      type: 'transfer',
      amount: amountInMist,
      status: 'pending',
      fromAddress: user.suiAddress,
      toAddress,
      metadata: {
        note: note || '',
        initiatedAt: new Date()
      }
    });

    await transferTransaction.save();

    // TODO: Implement actual transfer in SuiService
    // const transferResult = await suiService.transferSui(
    //   user.encryptedPrivateKey,
    //   toAddress,
    //   amountInMist
    // );

    res.json({
      success: true,
      message: 'Transfer initiated successfully',
      data: {
        transactionId: transferTransaction._id,
        fromAddress: user.suiAddress,
        toAddress,
        amount: parseFloat(amount),
        amountMist: amountInMist,
        status: 'pending',
        note: note || ''
      }
    });

  } catch (error) {
    console.error('❌ Transfer failed:', error);
    res.status(500).json({
      success: false,
      message: 'Transfer failed',
      error: error.message
    });
  }
}));

// Get wallet stats
router.get('/stats', auth, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get various stats
    const [
      totalTransactions,
      totalEarned,
      totalSpent,
      treasureCount,
      balance
    ] = await Promise.all([
      Transaction.countDocuments({ userId }),
      Transaction.aggregate([
        { $match: { userId, type: 'treasure_reward', status: 'success' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        { $match: { userId, type: 'transfer', status: 'success' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      TreasureDiscovery.countDocuments({ userId }),
      new SuiService().getBalance(user.suiAddress)
    ]);

    const earned = totalEarned[0]?.total || 0;
    const spent = totalSpent[0]?.total || 0;
    const currentBalance = parseFloat(balance);

    res.json({
      success: true,
      data: {
        wallet: {
          address: user.suiAddress,
          currentBalance,
          currentBalanceSui: (currentBalance / 1000000000).toFixed(4)
        },
        transactions: {
          total: totalTransactions,
          earned: earned,
          earnedSui: (earned / 1000000000).toFixed(4),
          spent: spent,
          spentSui: (spent / 1000000000).toFixed(4),
          netGain: earned - spent,
          netGainSui: ((earned - spent) / 1000000000).toFixed(4)
        },
        achievements: {
          treasuresFound: treasureCount,
          hasBlockchainProfile: !!user.profileObjectId
        },
        network: {
          name: process.env.SUI_NETWORK || 'testnet',
          explorerUrl: `https://explorer.sui.io/address/${user.suiAddress}?network=${process.env.SUI_NETWORK || 'testnet'}`
        }
      }
    });

  } catch (error) {
    console.error('❌ Failed to get wallet stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get wallet statistics',
      error: error.message
    });
  }
}));

// Helper functions
function formatTransactionType(type) {
  const types = {
    'treasure_reward': 'Treasure Reward',
    'transfer': 'Transfer',
    'faucet': 'Faucet',
    'admin': 'Admin'
  };
  return types[type] || type;
}

function formatTransactionStatus(status) {
  const statuses = {
    'pending': 'Pending',
    'success': 'Success',
    'failed': 'Failed'
  };
  return statuses[status] || status;
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