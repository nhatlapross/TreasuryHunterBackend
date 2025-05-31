// src/database/migrate.js - Database migration script
const db = require('./connection');
const logger = require('../utils/logger');

const migrations = [
  {
    version: 1,
    name: 'Create users table',
    sql: `
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        sui_address VARCHAR(66) NOT NULL,
        encrypted_private_key TEXT NOT NULL,
        profile_object_id VARCHAR(66),
        avatar_url TEXT,
        is_active BOOLEAN DEFAULT true,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_sui_address ON users(sui_address);
    `
  },
  {
    version: 2,
    name: 'Create treasures table',
    sql: `
      CREATE TABLE IF NOT EXISTS treasures (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        treasure_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        rarity INTEGER NOT NULL CHECK (rarity >= 1 AND rarity <= 3),
        reward_points INTEGER DEFAULT 100,
        required_rank INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT true,
        image_url TEXT,
        metadata JSONB,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_treasures_location ON treasures USING GIST (
        ll_to_earth(latitude, longitude)
      );
      CREATE INDEX IF NOT EXISTS idx_treasures_active ON treasures(is_active);
      CREATE INDEX IF NOT EXISTS idx_treasures_rarity ON treasures(rarity);
    `
  },
  {
    version: 3,
    name: 'Create treasure_discoveries table',
    sql: `
      CREATE TABLE IF NOT EXISTS treasure_discoveries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        treasure_id VARCHAR(50) NOT NULL REFERENCES treasures(treasure_id),
        nft_object_id VARCHAR(66) NOT NULL,
        transaction_digest VARCHAR(66) NOT NULL,
        location_proof JSONB NOT NULL,
        verification_data JSONB,
        discovered_at TIMESTAMP DEFAULT NOW(),
        
        CONSTRAINT unique_treasure_discovery UNIQUE(treasure_id),
        CONSTRAINT unique_nft_object UNIQUE(nft_object_id),
        CONSTRAINT unique_transaction UNIQUE(transaction_digest)
      );
      
      CREATE INDEX IF NOT EXISTS idx_discoveries_user ON treasure_discoveries(user_id);
      CREATE INDEX IF NOT EXISTS idx_discoveries_treasure ON treasure_discoveries(treasure_id);
      CREATE INDEX IF NOT EXISTS idx_discoveries_date ON treasure_discoveries(discovered_at);
    `
  },
  {
    version: 4,
    name: 'Create transactions table',
    sql: `
      CREATE TYPE transaction_type AS ENUM ('treasure_reward', 'transfer', 'faucet', 'admin');
      CREATE TYPE transaction_status AS ENUM ('pending', 'success', 'failed');
      
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        digest VARCHAR(66) UNIQUE NOT NULL,
        type transaction_type NOT NULL,
        amount BIGINT NOT NULL DEFAULT 0,
        status transaction_status DEFAULT 'pending',
        block_height BIGINT,
        gas_used BIGINT,
        from_address VARCHAR(66),
        to_address VARCHAR(66),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
      CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(created_at);
    `
  },
  {
    version: 5,
    name: 'Create hunter_profiles table',
    sql: `
      CREATE TYPE hunter_rank AS ENUM ('beginner', 'explorer', 'hunter', 'master');
      
      CREATE TABLE IF NOT EXISTS hunter_profiles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rank hunter_rank DEFAULT 'beginner',
        total_treasures_found INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        current_streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        last_hunt_timestamp TIMESTAMP,
        achievements JSONB DEFAULT '[]',
        statistics JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_profiles_user ON hunter_profiles(user_id);
      CREATE INDEX IF NOT EXISTS idx_profiles_rank ON hunter_profiles(rank);
      CREATE INDEX IF NOT EXISTS idx_profiles_score ON hunter_profiles(total_score);
    `
  },
  {
    version: 6,
    name: 'Create achievements table',
    sql: `
      CREATE TABLE IF NOT EXISTS achievements (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        achievement_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        icon VARCHAR(50),
        category VARCHAR(50),
        requirement_type VARCHAR(50),
        requirement_value INTEGER,
        points INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS user_achievements (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        achievement_id VARCHAR(50) NOT NULL REFERENCES achievements(achievement_id),
        unlocked_at TIMESTAMP DEFAULT NOW(),
        
        CONSTRAINT unique_user_achievement UNIQUE(user_id, achievement_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_achievements_date ON user_achievements(unlocked_at);
    `
  },
  {
    version: 7,
    name: 'Create admin_logs table',
    sql: `
      CREATE TYPE admin_action AS ENUM ('create_treasure', 'update_treasure', 'delete_treasure', 'ban_user', 'unban_user', 'system_update');
      
      CREATE TABLE IF NOT EXISTS admin_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        admin_user_id UUID NOT NULL REFERENCES users(id),
        action admin_action NOT NULL,
        target_type VARCHAR(50),
        target_id VARCHAR(100),
        details JSONB,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON admin_logs(admin_user_id);
      CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);
      CREATE INDEX IF NOT EXISTS idx_admin_logs_date ON admin_logs(created_at);
    `
  },
  {
    version: 8,
    name: 'Create app_settings table',
    sql: `
      CREATE TABLE IF NOT EXISTS app_settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        key VARCHAR(100) UNIQUE NOT NULL,
        value JSONB NOT NULL,
        description TEXT,
        is_public BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_settings_key ON app_settings(key);
      CREATE INDEX IF NOT EXISTS idx_settings_public ON app_settings(is_public);
    `
  },
  {
    version: 9,
    name: 'Add spatial support and functions',
    sql: `
      -- Add earthdistance extension for location queries
      CREATE EXTENSION IF NOT EXISTS earthdistance CASCADE;
      
      -- Function to calculate distance between coordinates
      CREATE OR REPLACE FUNCTION calculate_distance(
        lat1 DECIMAL, lng1 DECIMAL, 
        lat2 DECIMAL, lng2 DECIMAL
      ) RETURNS DECIMAL AS $$
      BEGIN
        RETURN earth_distance(
          ll_to_earth(lat1, lng1), 
          ll_to_earth(lat2, lng2)
        );
      END;
      $$ LANGUAGE plpgsql;
      
      -- Function to find nearby treasures
      CREATE OR REPLACE FUNCTION find_nearby_treasures(
        user_lat DECIMAL, 
        user_lng DECIMAL, 
        radius_meters INTEGER DEFAULT 5000
      ) RETURNS TABLE (
        treasure_id VARCHAR,
        name VARCHAR,
        description TEXT,
        latitude DECIMAL,
        longitude DECIMAL,
        rarity INTEGER,
        reward_points INTEGER,
        distance_meters DECIMAL
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          t.treasure_id,
          t.name,
          t.description,
          t.latitude,
          t.longitude,
          t.rarity,
          t.reward_points,
          earth_distance(
            ll_to_earth(user_lat, user_lng),
            ll_to_earth(t.latitude, t.longitude)
          ) as distance_meters
        FROM treasures t
        WHERE t.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM treasure_discoveries td 
          WHERE td.treasure_id = t.treasure_id
        )
        AND earth_distance(
          ll_to_earth(user_lat, user_lng),
          ll_to_earth(t.latitude, t.longitude)
        ) <= radius_meters
        ORDER BY distance_meters;
      END;
      $$ LANGUAGE plpgsql;
    `
  },
  {
    version: 10,
    name: 'Add triggers and updated_at functions',
    sql: `
      -- Function to update updated_at timestamp
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      
      -- Add triggers for updated_at
      CREATE TRIGGER update_users_updated_at 
        BEFORE UPDATE ON users 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        
      CREATE TRIGGER update_treasures_updated_at 
        BEFORE UPDATE ON treasures 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        
      CREATE TRIGGER update_transactions_updated_at 
        BEFORE UPDATE ON transactions 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        
      CREATE TRIGGER update_hunter_profiles_updated_at 
        BEFORE UPDATE ON hunter_profiles 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        
      CREATE TRIGGER update_app_settings_updated_at 
        BEFORE UPDATE ON app_settings 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `
  }
];

// Function to check if migrations table exists
const createMigrationsTable = async () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      version INTEGER UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      executed_at TIMESTAMP DEFAULT NOW()
    );
  `;
  
  await db.query(sql);
  logger.info('Migrations table created or already exists');
};

// Function to get executed migrations
const getExecutedMigrations = async () => {
  try {
    const result = await db.query('SELECT version FROM migrations ORDER BY version');
    return result.rows.map(row => row.version);
  } catch (error) {
    logger.error('Error getting executed migrations:', error.message);
    return [];
  }
};

// Function to execute a single migration
const executeMigration = async (migration) => {
  try {
    logger.info(`Executing migration ${migration.version}: ${migration.name}`);
    
    await db.transaction(async (client) => {
      // Execute the migration SQL
      await client.query(migration.sql);
      
      // Record the migration as executed
      await client.query(
        'INSERT INTO migrations (version, name) VALUES ($1, $2)',
        [migration.version, migration.name]
      );
    });
    
    logger.info(`✅ Migration ${migration.version} completed successfully`);
  } catch (error) {
    logger.error(`❌ Migration ${migration.version} failed:`, error.message);
    throw error;
  }
};

// Main migration function
const runMigrations = async () => {
  try {
    logger.info('🚀 Starting database migrations...');
    
    // Create migrations table if it doesn't exist
    await createMigrationsTable();
    
    // Get list of executed migrations
    const executedMigrations = await getExecutedMigrations();
    
    // Find pending migrations
    const pendingMigrations = migrations.filter(
      migration => !executedMigrations.includes(migration.version)
    );
    
    if (pendingMigrations.length === 0) {
      logger.info('✅ No pending migrations found');
      return;
    }
    
    logger.info(`📋 Found ${pendingMigrations.length} pending migration(s)`);
    
    // Execute pending migrations in order
    for (const migration of pendingMigrations) {
      await executeMigration(migration);
    }
    
    logger.info('🎉 All migrations completed successfully!');
    
  } catch (error) {
    logger.error('💥 Migration failed:', error.message);
    process.exit(1);
  }
};

// Function to rollback migrations (for development)
const rollbackMigration = async (targetVersion) => {
  try {
    logger.warn(`🔄 Rolling back to migration version ${targetVersion}`);
    
    const executedMigrations = await getExecutedMigrations();
    const migrationsToRollback = executedMigrations.filter(
      version => version > targetVersion
    ).reverse();
    
    for (const version of migrationsToRollback) {
      logger.warn(`Rolling back migration ${version}`);
      await db.query('DELETE FROM migrations WHERE version = $1', [version]);
    }
    
    logger.warn('⚠️ Rollback completed. Note: This only removes migration records, not schema changes.');
    
  } catch (error) {
    logger.error('Rollback failed:', error.message);
    throw error;
  }
};

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  const targetVersion = process.argv[3];
  
  switch (command) {
    case 'up':
      runMigrations()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    case 'rollback':
      if (!targetVersion) {
        logger.error('Please specify target version for rollback');
        process.exit(1);
      }
      rollbackMigration(parseInt(targetVersion))
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    default:
      runMigrations()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
  }
}

module.exports = {
  runMigrations,
  rollbackMigration,
  migrations
};