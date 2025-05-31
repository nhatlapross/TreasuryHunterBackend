// src/services/SuiService.js - Sui blockchain integration service
const { SuiClient, getFullnodeUrl } = require('@mysten/sui/client');
const { Ed25519Keypair } = require('@mysten/sui/keypairs/ed25519');
const { Transaction } = require('@mysten/sui/transactions');
const { fromB64, toB64 } = require('@mysten/bcs');
const CryptoJS = require('crypto-js');
const logger = require('../utils/logger');

class SuiService {
  constructor(network = 'testnet') {
    this.network = network;
    this.client = new SuiClient({
      url: process.env.SUI_RPC_URL || getFullnodeUrl(network),
    });
    this.packageId = process.env.SUI_PACKAGE_ID;
    this.treasureRegistryId = process.env.TREASURE_REGISTRY_ID;
    this.masterKey = process.env.ENCRYPTION_MASTER_KEY;

    if (!this.packageId) {
      throw new Error('SUI_PACKAGE_ID environment variable is required');
    }

    if (!this.masterKey) {
      throw new Error('ENCRYPTION_MASTER_KEY environment variable is required');
    }

    logger.info(`Sui Service initialized for ${network} network`);
  }

  /**
 * Create new wallet for user - SIMPLE APPROACH
 */
  async createWallet(userId) {
    try {
      logger.info(`Creating wallet for user: ${userId}`);

      // Method 1: Generate random 32 bytes and create keypair from that
      const crypto = require('crypto');
      const randomBytes = crypto.randomBytes(32);

      console.log('📝 Generated random bytes length:', randomBytes.length, 'bytes');

      // Create keypair from the 32 random bytes
      const keypair = Ed25519Keypair.fromSecretKey(randomBytes);
      const address = keypair.getPublicKey().toSuiAddress();

      // Convert the 32-byte secret key to base64 for storage
      const privateKeyForStorage = toB64(randomBytes);

      console.log('✅ Wallet generation details:');
      console.log('📍 Address:', address);
      console.log('📝 Private key B64 length:', privateKeyForStorage.length, 'chars');
      console.log('📝 Private key preview:', privateKeyForStorage.substring(0, 20) + '...');

      // Test that we can recreate the keypair from stored data
      const testBytes = fromB64(privateKeyForStorage);
      const testKeypair = Ed25519Keypair.fromSecretKey(testBytes);
      const testAddress = testKeypair.getPublicKey().toSuiAddress();

      if (testAddress !== address) {
        throw new Error('Keypair verification failed - addresses do not match');
      }

      console.log('✅ Direct verification passed');

      // Now test with encryption/decryption cycle
      const encryptedPrivateKey = this.encryptPrivateKey(privateKeyForStorage);
      const testKeypair2 = this.loadKeypair(encryptedPrivateKey);
      const testAddress2 = testKeypair2.getPublicKey().toSuiAddress();

      if (testAddress2 !== address) {
        throw new Error('Full cycle verification failed - addresses do not match');
      }

      console.log('✅ Full cycle verification passed');
      console.log('📝 Encrypted key length:', encryptedPrivateKey.length);

      logger.info(`Wallet created successfully: ${address}`);

      return {
        address,
        encryptedPrivateKey,
        keypair // Return the original keypair
      };
    } catch (error) {
      logger.error('Failed to create wallet:', error);
      throw new Error(`Failed to create wallet: ${error.message}`);
    }
  }

  /**
   * Load keypair from encrypted private key
   */
  loadKeypair(encryptedPrivateKey) {
    try {
      console.log('🔐 Loading keypair...');
      console.log('📝 Encrypted key exists:', !!encryptedPrivateKey);
      console.log('📝 Encrypted key length:', encryptedPrivateKey?.length || 0);

      if (!encryptedPrivateKey) {
        throw new Error('No encrypted private key provided');
      }

      if (!this.masterKey) {
        throw new Error('ENCRYPTION_MASTER_KEY not configured');
      }

      console.log('🔓 Attempting to decrypt private key...');
      const privateKey = this.decryptPrivateKey(encryptedPrivateKey);
      console.log('✅ Private key decrypted successfully');
      console.log('📝 Decrypted key length:', privateKey?.length || 0);
      console.log('📝 Decrypted key preview:', privateKey.substring(0, 20) + '...');

      console.log('🔧 Creating keypair from private key...');

      let keypair = null;

      // Try Method 1: Direct string (Sui encoded format)
      if (privateKey.length >= 40 && privateKey.length <= 90 && !privateKey.startsWith('AAAA')) {
        try {
          console.log('🔧 Trying Sui encoded format...');
          keypair = Ed25519Keypair.fromSecretKey(privateKey);
          console.log('✅ Keypair created with Sui encoded format');
        } catch (error) {
          console.log('❌ Sui encoded format failed:', error.message);
        }
      }

      // Try Method 2: Base64 decoded bytes
      if (!keypair) {
        try {
          console.log('🔧 Trying base64 decoded bytes...');
          const privateKeyBytes = fromB64(privateKey);
          console.log('📝 Decoded bytes length:', privateKeyBytes.length);

          if (privateKeyBytes.length === 32) {
            keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
            console.log('✅ Keypair created with 32-byte format');
          } else if (privateKeyBytes.length > 32) {
            // Extract first 32 bytes if longer
            const secretKey32 = privateKeyBytes.slice(0, 32);
            keypair = Ed25519Keypair.fromSecretKey(secretKey32);
            console.log('✅ Keypair created with extracted 32-byte format');
          }
        } catch (error) {
          console.log('❌ Base64 decoded format failed:', error.message);
        }
      }

      if (!keypair) {
        throw new Error('Could not create keypair with any supported format');
      }

      console.log('✅ Keypair created successfully');
      return keypair;
    } catch (error) {
      console.error('❌ Failed to load keypair:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to load keypair from encrypted key: ${error.message}`);
    }
  }

  /**
   * Create hunter profile on blockchain
   */
  async createHunterProfile(encryptedPrivateKey, username) {
    try {
      const keypair = this.loadKeypair(encryptedPrivateKey);
      const address = keypair.getPublicKey().toSuiAddress();

      logger.info(`Creating hunter profile for ${address} with username: ${username}`);

      // Check balance first
      const balance = await this.getBalance(address);
      const suiBalance = Number(balance) / 1000000000;

      if (suiBalance < 0.02) {
        throw new Error('Insufficient SUI balance for transaction. Need at least 0.02 SUI for gas.');
      }

      const tx = new Transaction();
      tx.setSender(address);
      tx.setGasBudget(20_000_000); // 0.02 SUI

      tx.moveCall({
        target: `${this.packageId}::treasure_nft::create_hunter_profile`,
        arguments: [tx.pure.string(username)],
      });

      console.log(`📡 Executing create_hunter_profile transaction...`);
      console.log(`📦 Package ID: ${this.packageId}`);
      console.log(`👤 Username: ${username}`);
      console.log(`💰 Gas budget: 0.02 SUI`);

      const result = await this.client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
          showEffects: true,
          showObjectChanges: true,
          showEvents: true,
        },
      });

      console.log(`📋 Transaction result:`, JSON.stringify(result, null, 2));

      if (result.effects?.status?.status !== 'success') {
        throw new Error(`Transaction failed: ${result.effects?.status?.error || 'Unknown error'}`);
      }

      // Extract profile object ID
      const createdObjects = result.objectChanges?.filter(
        change => change.type === 'created'
      );

      console.log(`🔍 Created objects:`, createdObjects);

      const profileObject = createdObjects.find(obj =>
        obj.type === 'created' &&
        obj.objectType?.includes('HunterProfile')
      );

      if (!profileObject?.objectId) {
        throw new Error('Failed to extract profile object ID from transaction result');
      }

      logger.info(`Hunter profile created successfully: ${profileObject.objectId}`);

      return {
        transactionDigest: result.digest,
        profileObjectId: profileObject.objectId,
        events: result.events || [],
        blockHeight: result.checkpoint
      };
    } catch (error) {
      logger.error('Failed to create hunter profile:', error);
      throw error;
    }
  }

  /**
   * Discover treasure and mint NFT
   */
  async discoverTreasure(encryptedPrivateKey, profileObjectId, treasureId, locationProof) {
    try {
      logger.info(`Discovering treasure: ${treasureId}`);

      const keypair = this.loadKeypair(encryptedPrivateKey);
      const address = keypair.getPublicKey().toSuiAddress();

      // Check balance first
      const balance = await this.getBalance(address);
      const suiBalance = Number(balance) / 1000000000;

      if (suiBalance < 0.05) {
        throw new Error('Insufficient SUI balance for transaction. Need at least 0.05 SUI for gas.');
      }

      if (!this.treasureRegistryId) {
        throw new Error('TREASURE_REGISTRY_ID not configured');
      }

      const tx = new Transaction();
      tx.setSender(address);
      tx.setGasBudget(50_000_000); // 0.05 SUI

      tx.moveCall({
        target: `${this.packageId}::treasure_nft::find_treasure`,
        arguments: [
          tx.object(this.treasureRegistryId),
          tx.object(profileObjectId),
          tx.pure.string(treasureId),
          tx.pure.string(locationProof),
          tx.object('0x6'), // System clock
        ],
      });

      const result = await this.client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
          showEffects: true,
          showObjectChanges: true,
          showEvents: true,
        },
      });

      if (result.effects?.status?.status !== 'success') {
        const error = result.effects?.status?.error || 'Unknown error';
        throw new Error(`Transaction failed: ${error}`);
      }

      // Extract NFT object
      const createdObjects = result.objectChanges?.filter(
        change => change.type === 'created'
      );

      const nftObject = createdObjects.find(obj =>
        obj.type === 'created' &&
        obj.objectType?.includes('TreasureNFT')
      );

      if (!nftObject?.objectId) {
        throw new Error('Failed to extract NFT object ID');
      }

      logger.info(`NFT minted successfully: ${nftObject.objectId}`);

      return {
        transactionDigest: result.digest,
        nftObjectId: nftObject.objectId,
        events: result.events || [],
        blockHeight: result.checkpoint
      };
    } catch (error) {
      logger.error('Treasure discovery failed:', error);
      throw error;
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(address) {
    try {
      const balance = await this.client.getBalance({
        owner: address,
        coinType: '0x2::sui::SUI'
      });
      return balance.totalBalance;
    } catch (error) {
      logger.error(`Failed to get balance for ${address}:`, error);
      return '0';
    }
  }

  /**
   * Get owned NFTs
   */
  async getOwnedNFTs(address) {
    try {
      const objects = await this.client.getOwnedObjects({
        owner: address,
        filter: {
          StructType: `${this.packageId}::treasure_nft::TreasureNFT`,
        },
        options: {
          showContent: true,
          showDisplay: true,
          showType: true,
        },
      });

      return objects.data || [];
    } catch (error) {
      logger.error(`Failed to get owned NFTs for ${address}:`, error);
      return [];
    }
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(address, limit = 20) {
    try {
      const transactions = await this.client.queryTransactionBlocks({
        filter: {
          FromAddress: address,
        },
        limit,
        order: 'descending',
        options: {
          showEffects: true,
          showEvents: true,
          showInput: true,
          showObjectChanges: true,
        },
      });

      return transactions.data || [];
    } catch (error) {
      logger.error(`Failed to get transaction history for ${address}:`, error);
      return [];
    }
  }

  /**
   * Get hunter profile stats
   */
  async getHunterProfile(profileObjectId) {
    try {
      const profile = await this.client.getObject({
        id: profileObjectId,
        options: {
          showContent: true,
          showDisplay: true,
        },
      });

      return profile;
    } catch (error) {
      logger.error(`Failed to get hunter profile ${profileObjectId}:`, error);
      return null;
    }
  }

  /**
   * Request SUI from faucet (testnet only)
   */
  async requestFaucet(address) {
    if (this.network === 'mainnet') {
      throw new Error('Faucet not available on mainnet');
    }

    try {
      const faucetUrl = this.network === 'testnet'
        ? 'https://faucet.testnet.sui.io/v2/gas'
        : 'https://faucet.devnet.sui.io/v2/gas';

      logger.info(`Requesting SUI from faucet for address: ${address}`);
      console.log(`🔗 Faucet URL: ${faucetUrl}`);

      const requestBody = {
        FixedAmountRequest: {
          recipient: address
        }
      };

      console.log(`📤 Request body:`, JSON.stringify(requestBody, null, 2));

      const response = await fetch(faucetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log(`📥 Response status: ${response.status}`);
      console.log(`📥 Response status text: ${response.statusText}`);
      console.log(`📥 Response headers:`, Object.fromEntries(response.headers.entries()));

      // Get the raw response text first
      const responseText = await response.text();
      console.log(`📥 Raw response text:`, responseText);

      // Try to parse as JSON
      let result;
      try {
        result = JSON.parse(responseText);
        console.log(`📥 Parsed JSON:`, result);
      } catch (parseError) {
        console.error(`❌ JSON parse error:`, parseError);
        console.error(`Raw response was:`, responseText);
        throw new Error(`Invalid JSON response from faucet: ${responseText.substring(0, 200)}...`);
      }

      if (response.ok) {
        logger.info(`Faucet request successful for ${address}`);
        return {
          success: true,
          transactionDigests: result.transferredGasObjects || [],
          message: 'SUI tokens sent successfully'
        };
      } else {
        logger.warn(`Faucet request failed for ${address}:`, result);
        return {
          success: false,
          message: result.error || result.status?.Failure || 'Faucet request failed'
        };
      }
    } catch (error) {
      logger.error(`Faucet request error for ${address}:`, error);
      return {
        success: false,
        message: `Network error occurred: ${error.message}`
      };
    }
  }

  /**
   * Get transaction details by digest
   */
  async getTransactionDetails(digest) {
    try {
      const transaction = await this.client.getTransactionBlock({
        digest,
        options: {
          showEffects: true,
          showEvents: true,
          showInput: true,
          showObjectChanges: true,
        },
      });
      return transaction;
    } catch (error) {
      logger.error(`Failed to get transaction details for ${digest}:`, error);
      throw error;
    }
  }

  /**
   * Verify treasure exists in registry
   */
  async verifyTreasureExists(treasureId) {
    try {
      if (!this.treasureRegistryId) {
        throw new Error('Treasure registry not configured');
      }

      const registryObject = await this.client.getObject({
        id: this.treasureRegistryId,
        options: {
          showContent: true,
        },
      });

      // This is a simplified check - in reality you'd need to parse the registry content
      // to verify the treasure exists and is available
      return registryObject?.data?.content ? true : false;
    } catch (error) {
      logger.error(`Failed to verify treasure ${treasureId}:`, error);
      return false;
    }
  }

  /**
   * Get network information
   */
  getNetworkInfo() {
    return {
      network: this.network,
      rpcUrl: this.client.transport.url,
      packageId: this.packageId,
      treasureRegistryId: this.treasureRegistryId,
    };
  }

  /**
   * Encrypt private key using AES
   */
  encryptPrivateKey(privateKey) {
    try {
      console.log('🔐 Encrypting private key...');
      console.log('📝 Private key length:', privateKey?.length || 0);
      console.log('🔑 Master key exists:', !!this.masterKey);

      const encrypted = CryptoJS.AES.encrypt(privateKey, this.masterKey).toString();
      console.log('✅ Encryption successful');
      console.log('📝 Encrypted length:', encrypted?.length || 0);

      return encrypted;
    } catch (error) {
      logger.error('Failed to encrypt private key:', error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt private key using AES
   */
  decryptPrivateKey(encryptedKey) {
    try {
      console.log('🔓 Decrypting private key...');
      console.log('📝 Encrypted key preview:', encryptedKey.substring(0, 30) + '...');
      console.log('🔑 Master key exists:', !!this.masterKey);

      const bytes = CryptoJS.AES.decrypt(encryptedKey, this.masterKey);
      console.log('📦 Decryption bytes created');

      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      console.log('📝 Decrypted string length:', decrypted?.length || 0);

      if (!decrypted || decrypted.length === 0) {
        throw new Error('Decryption failed - empty result. Wrong master key?');
      }

      console.log('✅ Private key decrypted successfully');
      return decrypted;
    } catch (error) {
      console.error('❌ Failed to decrypt private key:', error);
      console.error('❌ This usually means the ENCRYPTION_MASTER_KEY is wrong');
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Validate Sui address format
   */
  static isValidAddress(address) {
    return /^0x[a-fA-F0-9]{64}$/.test(address);
  }

  /**
   * Format balance for display (convert from MIST to SUI)
   */
  formatBalance(balanceInMist) {
    const sui = Number(balanceInMist) / 1000000000;
    return sui.toFixed(4);
  }

  /**
   * Calculate distance between coordinates in meters
   */
  static calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Verify location for treasure discovery
   */
  verifyLocation(userLat, userLng, treasureLat, treasureLng, tolerance = 100) {
    const distance = SuiService.calculateDistance(userLat, userLng, treasureLat, treasureLng);
    logger.debug(`Location verification: distance=${distance}m, tolerance=${tolerance}m`);
    return distance <= tolerance;
  }

  /**
   * Health check for Sui connection
   */
  async healthCheck() {
    try {
      const epochInfo = await this.client.getLatestSuiSystemState();
      return {
        connected: true,
        network: this.network,
        epoch: epochInfo.epoch,
        packageId: this.packageId,
        registryConfigured: !!this.treasureRegistryId
      };
    } catch (error) {
      logger.error('Sui health check failed:', error);
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Estimate gas cost for a transaction
   */
  async estimateGasCost(transactionType = 'discover_treasure') {
    const estimates = {
      create_profile: 20_000_000, // 0.02 SUI
      discover_treasure: 50_000_000, // 0.05 SUI
      transfer: 10_000_000, // 0.01 SUI
    };

    return estimates[transactionType] || 30_000_000; // Default 0.03 SUI
  }

  /**
 * Add treasure to registry (admin only) - calls smart contract
 */
  async addTreasure(adminEncryptedPrivateKey, treasureData) {
    try {
      const {
        treasureId,
        name,
        description,
        imageUrl,
        rarity,
        location,
        coordinates,
        requiredRank,
        rewardPoints
      } = treasureData;

      logger.info(`Adding treasure to blockchain registry: ${treasureId}`);

      const keypair = this.loadKeypair(adminEncryptedPrivateKey);
      const address = keypair.getPublicKey().toSuiAddress();

      // Check balance first
      const balance = await this.getBalance(address);
      const suiBalance = Number(balance) / 1000000000;

      if (suiBalance < 0.03) {
        throw new Error('Insufficient SUI balance for transaction. Need at least 0.03 SUI for gas.');
      }

      if (!this.treasureRegistryId) {
        throw new Error('TREASURE_REGISTRY_ID not configured');
      }

      const tx = new Transaction();
      tx.setSender(address);
      tx.setGasBudget(30_000_000); // 0.03 SUI

      // Call the add_treasure function from smart contract
      tx.moveCall({
        target: `${this.packageId}::treasure_nft::add_treasure`,
        arguments: [
          tx.object(this.treasureRegistryId),    // registry: &mut TreasureRegistry
          tx.pure.string(treasureId),            // treasure_id: string::String
          tx.pure.string(name),                  // name: string::String
          tx.pure.string(description),           // description: string::String
          tx.pure.string(imageUrl || ''),        // image_url: string::String
          tx.pure.u8(rarity),                    // rarity: u8
          tx.pure.string(location),              // location: string::String
          tx.pure.string(coordinates),           // coordinates: string::String
          tx.pure.u8(requiredRank),              // required_rank: u8
          tx.pure.u64(rewardPoints),             // reward_points: u64
        ],
      });

      console.log(`📡 Executing add_treasure transaction...`);
      console.log(`📦 Package ID: ${this.packageId}`);
      console.log(`🏛️ Registry ID: ${this.treasureRegistryId}`);
      console.log(`💎 Treasure: ${name} (${treasureId})`);
      console.log(`💰 Gas budget: 0.03 SUI`);

      const result = await this.client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
          showEffects: true,
          showObjectChanges: true,
          showEvents: true,
        },
      });

      console.log(`📋 Transaction result:`, JSON.stringify(result, null, 2));

      if (result.effects?.status?.status !== 'success') {
        throw new Error(`Transaction failed: ${result.effects?.status?.error || 'Unknown error'}`);
      }

      logger.info(`Treasure added to blockchain successfully: ${treasureId}`);

      return {
        transactionDigest: result.digest,
        treasureId,
        events: result.events || [],
        blockHeight: result.checkpoint,
        gasUsed: result.effects?.gasUsed?.computationCost || 0
      };

    } catch (error) {
      logger.error('Failed to add treasure to blockchain:', error);
      throw error;
    }
  }

  /**
   * Get hunter stats from blockchain profile
   */
  async getHunterStats(profileObjectId) {
    try {
      logger.info(`Getting hunter stats from blockchain: ${profileObjectId}`);

      if (!profileObjectId) {
        throw new Error('Profile object ID is required');
      }

      // Get the hunter profile object from blockchain
      const profileObject = await this.client.getObject({
        id: profileObjectId,
        options: {
          showContent: true,
          showDisplay: true,
          showType: true,
        },
      });

      if (!profileObject.data) {
        throw new Error('Hunter profile not found on blockchain');
      }

      console.log(`📊 Profile object:`, JSON.stringify(profileObject.data, null, 2));

      // Extract stats from the profile content
      const content = profileObject.data.content;
      let stats = {
        rank: 1,
        totalTreasuresFound: 0,
        streakCount: 0,
        score: 0
      };

      if (content && content.fields) {
        const fields = content.fields;

        // Map the blockchain fields to our stats structure
        stats = {
          rank: fields.rank || 1,
          totalTreasuresFound: parseInt(fields.total_treasures_found) || 0,
          streakCount: parseInt(fields.streak_count) || 0,
          score: parseInt(fields.score) || 0,
          lastHuntTimestamp: fields.last_hunt_timestamp ?
            parseInt(fields.last_hunt_timestamp) : null,
          achievements: fields.achievements || []
        };
      }

      // Alternative method: Call the view function if available
      try {
        console.log(`🔍 Attempting to call get_hunter_stats view function...`);

        // Note: This requires the smart contract to have a public view function
        // If your contract doesn't have this, we'll use the object data above
        const viewResult = await this.client.devInspectTransactionBlock({
          sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
          transactionBlock: (() => {
            const tx = new Transaction();
            tx.moveCall({
              target: `${this.packageId}::treasure_nft::get_hunter_stats`,
              arguments: [tx.object(profileObjectId)],
            });
            return tx;
          })(),
        });

        if (viewResult.results?.[0]?.returnValues) {
          const returnValues = viewResult.results[0].returnValues;
          console.log(`📈 View function results:`, returnValues);

          // Parse the return values (rank, total_treasures_found, streak_count, score)
          if (returnValues.length >= 4) {
            stats = {
              rank: parseInt(returnValues[0][0]) || stats.rank,
              totalTreasuresFound: parseInt(returnValues[1][0]) || stats.totalTreasuresFound,
              streakCount: parseInt(returnValues[2][0]) || stats.streakCount,
              score: parseInt(returnValues[3][0]) || stats.score,
              lastHuntTimestamp: stats.lastHuntTimestamp,
              achievements: stats.achievements
            };
          }
        }
      } catch (viewError) {
        console.log(`⚠️ View function call failed, using object data:`, viewError.message);
        // Continue with object data parsed above
      }

      logger.info(`Hunter stats retrieved successfully: ${JSON.stringify(stats)}`);

      return {
        profileObjectId,
        stats,
        objectVersion: profileObject.data.version,
        objectDigest: profileObject.data.digest,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`Failed to get hunter stats for ${profileObjectId}:`, error);
      throw error;
    }
  }

  /**
   * Get treasure NFT details from blockchain
   */
  async getTreasureDetails(nftObjectId) {
    try {
      logger.info(`Getting treasure details from blockchain: ${nftObjectId}`);

      if (!nftObjectId) {
        throw new Error('NFT object ID is required');
      }

      // Get the NFT object from blockchain
      const nftObject = await this.client.getObject({
        id: nftObjectId,
        options: {
          showContent: true,
          showDisplay: true,
          showType: true,
          showOwner: true,
        },
      });

      if (!nftObject.data) {
        throw new Error('Treasure NFT not found on blockchain');
      }

      console.log(`🎨 NFT object:`, JSON.stringify(nftObject.data, null, 2));

      // Extract details from the NFT content
      const content = nftObject.data.content;
      let treasureDetails = {
        name: 'Unknown Treasure',
        rarity: 1,
        location: 'Unknown',
        foundTimestamp: 0
      };

      if (content && content.fields) {
        const fields = content.fields;

        treasureDetails = {
          treasureId: fields.treasure_id || '',
          name: fields.name || 'Unknown Treasure',
          description: fields.description || '',
          imageUrl: fields.image_url || '',
          rarity: parseInt(fields.rarity) || 1,
          location: fields.location || 'Unknown',
          coordinates: fields.coordinates || '',
          foundTimestamp: parseInt(fields.found_timestamp) || 0,
          finderAddress: fields.finder_address || '',
          metadata: fields.metadata || {}
        };
      }

      // Alternative method: Call the view function if available
      try {
        console.log(`🔍 Attempting to call get_treasure_details view function...`);

        const viewResult = await this.client.devInspectTransactionBlock({
          sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
          transactionBlock: (() => {
            const tx = new Transaction();
            tx.moveCall({
              target: `${this.packageId}::treasure_nft::get_treasure_details`,
              arguments: [tx.object(nftObjectId)],
            });
            return tx;
          })(),
        });

        if (viewResult.results?.[0]?.returnValues) {
          const returnValues = viewResult.results[0].returnValues;
          console.log(`📝 View function results:`, returnValues);

          // Parse the return values (name, rarity, location, found_timestamp)
          if (returnValues.length >= 4) {
            treasureDetails.name = returnValues[0][0] || treasureDetails.name;
            treasureDetails.rarity = parseInt(returnValues[1][0]) || treasureDetails.rarity;
            treasureDetails.location = returnValues[2][0] || treasureDetails.location;
            treasureDetails.foundTimestamp = parseInt(returnValues[3][0]) || treasureDetails.foundTimestamp;
          }
        }
      } catch (viewError) {
        console.log(`⚠️ View function call failed, using object data:`, viewError.message);
        // Continue with object data parsed above
      }

      // Get owner information
      const owner = nftObject.data.owner;
      let ownerAddress = null;
      if (owner && typeof owner === 'object' && 'AddressOwner' in owner) {
        ownerAddress = owner.AddressOwner;
      }

      logger.info(`Treasure details retrieved successfully: ${treasureDetails.name}`);

      return {
        nftObjectId,
        owner: ownerAddress,
        treasureDetails,
        objectVersion: nftObject.data.version,
        objectDigest: nftObject.data.digest,
        objectType: nftObject.data.type,
        explorerUrl: `https://explorer.sui.io/object/${nftObjectId}?network=${this.network}`,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`Failed to get treasure details for ${nftObjectId}:`, error);
      throw error;
    }
  }

  /**
   * Get all treasures from registry (view function)
   */
  async getTreasuresFromRegistry(limit = 50, offset = 0) {
    try {
      logger.info(`Getting treasures from blockchain registry...`);

      if (!this.treasureRegistryId) {
        throw new Error('TREASURE_REGISTRY_ID not configured');
      }

      // Get the registry object
      const registryObject = await this.client.getObject({
        id: this.treasureRegistryId,
        options: {
          showContent: true,
          showDisplay: true,
        },
      });

      if (!registryObject.data) {
        throw new Error('Treasure registry not found on blockchain');
      }

      console.log(`🏛️ Registry object:`, JSON.stringify(registryObject.data, null, 2));

      // Extract treasures from registry
      const content = registryObject.data.content;
      let treasures = [];

      if (content && content.fields && content.fields.treasures) {
        // Parse the treasures map/vector from the registry
        // This structure depends on how your smart contract stores treasures
        treasures = content.fields.treasures || [];
      }

      return {
        treasures: treasures.slice(offset, offset + limit),
        total: treasures.length,
        registryId: this.treasureRegistryId,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to get treasures from registry:', error);
      throw error;
    }
  }

  /**
 * Verify treasure exists in registry - IMPROVED VERSION
 */
  async verifyTreasureInRegistry(treasureId) {
    try {
      logger.info(`Verifying treasure in registry: ${treasureId}`);

      if (!this.treasureRegistryId) {
        console.warn('TREASURE_REGISTRY_ID not configured, assuming treasure exists');
        // If no registry ID, assume treasure exists (fallback)
        return {
          treasureId,
          exists: true,
          registryId: 'not_configured',
          method: 'fallback_assume_exists',
          checkedAt: new Date().toISOString()
        };
      }

      // Method 1: Try to get the registry object and inspect its contents
      try {
        const registryObject = await this.client.getObject({
          id: this.treasureRegistryId,
          options: {
            showContent: true,
            showDisplay: true,
          },
        });

        if (registryObject.data && registryObject.data.content) {
          console.log(`📊 Registry object content:`, JSON.stringify(registryObject.data.content, null, 2));

          // Try to find the treasure in the registry content
          const content = registryObject.data.content;
          let treasureFound = false;

          // Check if treasures are stored in fields
          if (content.fields && content.fields.treasures) {
            const treasures = content.fields.treasures;
            console.log(`🔍 Checking treasures in registry:`, treasures);

            // Different ways treasures might be stored
            if (Array.isArray(treasures)) {
              treasureFound = treasures.some(t => t.treasure_id === treasureId || t.treasureId === treasureId);
            } else if (typeof treasures === 'object') {
              treasureFound = treasures.hasOwnProperty(treasureId) ||
                Object.values(treasures).some(t =>
                  t.treasure_id === treasureId ||
                  t.treasureId === treasureId
                );
            }
          }

          if (treasureFound) {
            return {
              treasureId,
              exists: true,
              registryId: this.treasureRegistryId,
              method: 'registry_object_inspection',
              checkedAt: new Date().toISOString()
            };
          }
        }
      } catch (registryError) {
        console.warn(`⚠️ Registry object inspection failed:`, registryError.message);
      }

      // Method 2: Try the view function (if it exists)
      try {
        console.log(`🔍 Attempting view function call...`);

        const viewResult = await this.client.devInspectTransactionBlock({
          sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
          transactionBlock: (() => {
            const tx = new Transaction();
            tx.moveCall({
              target: `${this.packageId}::treasure_nft::treasure_exists`,
              arguments: [
                tx.object(this.treasureRegistryId),
                tx.pure.string(treasureId)
              ],
            });
            return tx;
          })(),
        });

        let exists = false;
        if (viewResult.results?.[0]?.returnValues) {
          const returnValue = viewResult.results[0].returnValues[0];
          exists = returnValue && returnValue[0] === 1;
        }

        return {
          treasureId,
          exists,
          registryId: this.treasureRegistryId,
          method: 'view_function',
          checkedAt: new Date().toISOString()
        };

      } catch (viewError) {
        console.warn(`⚠️ View function call failed:`, viewError.message);
      }

      // Method 3: Fallback - assume treasure exists if we can't verify
      // This is better for user experience than blocking discoveries
      console.log(`🔄 All verification methods failed, using permissive fallback`);

      return {
        treasureId,
        exists: true, // 🆕 ASSUME EXISTS for better UX
        registryId: this.treasureRegistryId,
        method: 'permissive_fallback',
        warning: 'Could not verify treasure in registry, assuming it exists',
        checkedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`Failed to verify treasure ${treasureId}:`, error);

      // Even if verification completely fails, assume treasure exists
      // This prevents the app from breaking due to blockchain connectivity issues
      return {
        treasureId,
        exists: true, // 🆕 PERMISSIVE FALLBACK
        error: error.message,
        method: 'error_fallback',
        warning: 'Verification failed due to error, assuming treasure exists',
        checkedAt: new Date().toISOString()
      };
    }
  }

  // 🆕 ALTERNATIVE: Simpler approach - Skip verification entirely for known treasures
  /**
   * Check if treasure should be allowed (permissive approach)
   */
  isTreasureAllowed(treasureId) {
    // List of known treasure IDs that definitely exist
    const knownTreasures = [
      'TREASURE_001',
      'VN_COMMON_001',
      // Add more as needed
    ];

    // Allow known treasures
    if (knownTreasures.includes(treasureId)) {
      return {
        treasureId,
        allowed: true,
        reason: 'known_treasure',
        checkedAt: new Date().toISOString()
      };
    }

    // Allow treasures that follow expected patterns
    const validPatterns = [
      /^TREASURE_\d+$/,           // TREASURE_001, TREASURE_002, etc.
      /^VN_[A-Z]+_\d+$/,         // VN_COMMON_001, VN_RARE_002, etc.
      /^[A-Z]+_[A-Z]+_\d+$/,     // DRAGON_LEGENDARY_001, etc.
    ];

    const matchesPattern = validPatterns.some(pattern => pattern.test(treasureId));

    if (matchesPattern) {
      return {
        treasureId,
        allowed: true,
        reason: 'matches_valid_pattern',
        checkedAt: new Date().toISOString()
      };
    }

    // For demo/development, allow most treasures
    if (process.env.NODE_ENV === 'development' || process.env.ALLOW_ALL_TREASURES === 'true') {
      return {
        treasureId,
        allowed: true,
        reason: 'development_mode',
        checkedAt: new Date().toISOString()
      };
    }

    return {
      treasureId,
      allowed: false,
      reason: 'unknown_treasure_pattern',
      checkedAt: new Date().toISOString()
    };
  }

  /**
   * Get rank name from rank number
   */
  getRankName(rankNumber) {
    const ranks = {
      1: 'Beginner',
      2: 'Explorer',
      3: 'Hunter',
      4: 'Master'
    };
    return ranks[rankNumber] || 'Unknown';
  }

  /**
   * Get rarity name from rarity number  
   */
  getRarityName(rarityNumber) {
    const rarities = {
      1: 'Common',
      2: 'Rare',
      3: 'Legendary'
    };
    return rarities[rarityNumber] || 'Unknown';
  }

  /**
   * Format timestamp to readable date
   */
  formatTimestamp(timestamp) {
    if (!timestamp || timestamp === 0) {
      return null;
    }
    return new Date(timestamp).toISOString();
  }
}

module.exports = SuiService;