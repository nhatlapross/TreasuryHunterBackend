# 🏴‍☠️ Treasure Hunt Backend API

A blockchain-powered treasure hunting game backend built with Node.js, Express, MongoDB, and Sui blockchain integration.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Database Setup](#database-setup)
- [Running the Server](#running-the-server)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Deployment](#deployment)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

The Treasure Hunt Backend provides a complete RESTful API for a location-based treasure hunting game. Players discover virtual treasures using NFC tags or QR codes, verify their physical presence through GPS, and mint NFTs on the Sui blockchain as proof of discovery.

### Key Features

- **🔐 Sui Wallet Management**: Automatic wallet creation and private key encryption
- **⛓️ Blockchain Integration**: NFT minting and hunter profile management on Sui
- **📍 Location Verification**: GPS-based treasure discovery with proximity checking
- **🏆 Gamification**: Ranking system, achievements, and leaderboards
- **🛡️ Security**: JWT authentication, rate limiting, and input validation
- **📊 Analytics**: Comprehensive user statistics and admin dashboard

## 🛠 Tech Stack

### Core Technologies
- **Node.js** (v18+) - JavaScript runtime
- **Express.js** - Web framework
- **MongoDB** - Database with geospatial indexing
- **Mongoose** - ODM for MongoDB

### Blockchain
- **Sui SDK** (@mysten/sui) - Blockchain interaction
- **Move Language** - Smart contracts on Sui

### Security & Utilities
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT authentication
- **crypto-js** - Private key encryption
- **helmet** - Security headers
- **express-rate-limit** - Rate limiting

### Development
- **winston** - Logging
- **express-validator** - Input validation
- **cors** - Cross-origin resource sharing
- **dotenv** - Environment configuration

## 📦 Prerequisites

Before running the backend, ensure you have:

- **Node.js** v18 or higher
- **MongoDB** (local or cloud instance)
- **Sui CLI** (for smart contract deployment)
- **Git** for version control

### Optional but Recommended
- **Docker** for containerized deployment
- **PM2** for process management in production
- **MongoDB Compass** for database visualization

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/treasure-hunt-backend.git
cd treasure-hunt-backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Install Global Tools (Optional)

```bash
# For process management
npm install -g pm2

# For Sui blockchain interaction
curl -fLJO https://github.com/MystenLabs/sui/releases/latest/download/sui-ubuntu-x86_64.tgz
tar -xzf sui-ubuntu-x86_64.tgz
sudo mv sui /usr/local/bin/
```

## ⚙️ Configuration

### 1. Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Configure the following variables:

```env
# Server Configuration
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/treasure_hunt_db
MONGODB_PASSWORD=your_mongodb_password
DATABASE_NAME=treasure_hunt_db

# Authentication
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d
ENCRYPTION_MASTER_KEY=your_32_character_encryption_key

# Sui Blockchain Configuration
SUI_NETWORK=testnet
SUI_RPC_URL=https://fullnode.testnet.sui.io
SUI_PACKAGE_ID=0xYOUR_DEPLOYED_PACKAGE_ID
TREASURE_REGISTRY_ID=0xYOUR_REGISTRY_OBJECT_ID

# Security & Rate Limiting
CORS_ORIGIN=http://localhost:3000,http://localhost:19006
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_TO_CONSOLE=true

# API Configuration
API_VERSION=v1
```

### 2. Security Keys Generation

Generate secure keys for production:

```bash
# Generate JWT secret (64 characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate encryption master key (32 characters)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

## 🗄️ Database Setup

### 1. Start MongoDB

**Local MongoDB:**
```bash
# Ubuntu/Debian
sudo systemctl start mongod

# macOS with Homebrew
brew services start mongodb-community
```

**MongoDB Atlas (Cloud):**
1. Create account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create cluster and get connection string
3. Update `MONGODB_URI` in `.env`

### 2. Initialize Database

The database will be automatically initialized when you start the server. To manually seed with sample data:

```bash
# Seed database with sample treasures
npm run seed:treasures

# Seed with sample users (optional)
npm run seed:users
```

### 3. Create Indexes

Indexes are automatically created by Mongoose models, but you can manually ensure they exist:

```bash
npm run create-indexes
```

## 🏃‍♂️ Running the Server

### Development Mode

```bash
# Start with nodemon (auto-restart on changes)
npm run dev

# Or start normally
npm start
```

### Production Mode

```bash
# Set environment
export NODE_ENV=production

# Start with PM2
npm run start:prod

# Or start normally
npm run server
```

### Docker (Alternative)

```bash
# Build image
docker build -t treasure-hunt-backend .

# Run container
docker run -p 3000:3000 --env-file .env treasure-hunt-backend
```

### Verify Installation

Visit the health endpoints:

- **Health Check**: http://localhost:3000/health
- **Debug Info**: http://localhost:3000/debug
- **API Status**: http://localhost:3000/api/v1/auth/health

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication

All protected endpoints require a JWT token in the Authorization header:

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

### Core Endpoints

#### 🔐 Authentication (`/api/v1/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/register` | Register new user with Sui wallet | ❌ |
| POST | `/login` | User login | ❌ |
| GET | `/verify` | Verify JWT token | ✅ |
| POST | `/faucet` | Request SUI from testnet faucet | ✅ |

**Example Registration:**

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "hunter123",
    "email": "hunter@example.com"
  }'
```

#### 🏴‍☠️ Treasures (`/api/v1/treasures`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/nearby?lat=21.0285&lng=105.8542&radius=5000` | Find nearby treasures | ✅ |
| POST | `/discover` | Discover and mint treasure NFT | ✅ |
| GET | `/` | List all treasures (admin) | ✅ |

**Example Treasure Discovery:**

```bash
curl -X POST http://localhost:3000/api/v1/treasures/discover \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "treasureId": "treasure_hoankiem_001",
    "location": {
      "latitude": 21.0285,
      "longitude": 105.8542
    },
    "locationProof": "gps_verified"
  }'
```

#### 💰 Wallet (`/api/v1/wallet`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/balance` | Get wallet balance and info | ✅ |
| GET | `/address` | Get wallet address | ✅ |
| GET | `/transactions` | Get transaction history | ✅ |
| GET | `/nfts` | Get owned NFTs | ✅ |
| POST | `/faucet` | Request SUI tokens | ✅ |
| GET | `/stats` | Get wallet statistics | ✅ |

#### 👤 Profile (`/api/v1/profile`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/stats` | Get user profile and stats | ✅ |
| PUT | `/update` | Update profile information | ✅ |
| POST | `/create-blockchain-profile` | Create hunter profile on chain | ✅ |
| GET | `/achievements` | Get user achievements | ✅ |
| GET | `/leaderboard` | Get global leaderboard | ✅ |
| GET | `/discoveries` | Get discovery history | ✅ |

#### 🛡️ Admin (`/api/v1/admin`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/stats` | Get admin dashboard stats | ✅ (Admin) |
| GET | `/users` | List all users with filters | ✅ (Admin) |
| POST | `/treasures` | Create new treasure | ✅ (Admin) |
| PUT | `/treasures/:id` | Update treasure | ✅ (Admin) |
| DELETE | `/treasures/:id` | Delete treasure | ✅ (Admin) |
| GET | `/logs` | Get admin action logs | ✅ (Admin) |

### Response Format

All API responses follow this structure:

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data here
  },
  "timestamp": "2025-05-31T10:30:00Z"
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Error description",
  "error": "ERROR_CODE",
  "timestamp": "2025-05-31T10:30:00Z"
}
```

## 🧪 Testing

### Manual Testing

Use the complete testing guide:

```bash
# Run the complete test sequence
npm run test:manual
```

This will test:
- ✅ User registration and login
- ✅ Wallet functionality
- ✅ Treasure discovery
- ✅ NFT minting
- ✅ Profile management
- ✅ Admin functions

### Automated Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

### API Testing with Postman

Import the Postman collection:

```bash
# Generate Postman collection
npm run generate:postman
```

### Load Testing

```bash
# Install artillery
npm install -g artillery

# Run load tests
npm run test:load
```

## 🚀 Deployment

### Production Checklist

Before deploying to production:

- [ ] Environment variables configured
- [ ] MongoDB database ready
- [ ] Sui smart contracts deployed
- [ ] SSL certificates installed
- [ ] Domain configured
- [ ] Monitoring setup
- [ ] Backup strategy in place

### Docker Deployment

```bash
# Build production image
docker build -f Dockerfile.prod -t treasure-hunt-api:latest .

# Run with docker-compose
docker-compose up -d
```

### VPS Deployment

```bash
# Clone repository
git clone https://github.com/your-org/treasure-hunt-backend.git
cd treasure-hunt-backend

# Install dependencies
npm ci --only=production

# Configure environment
cp .env.example .env
nano .env

# Start with PM2
npm install -g pm2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

### Cloud Deployment

#### Heroku
```bash
# Install Heroku CLI
# Set config vars in Heroku dashboard
heroku create treasure-hunt-api
git push heroku main
```

#### Railway
```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway deploy
```

#### AWS/GCP/Azure
Use the provided Docker container with your preferred cloud container service.

### Environment-Specific Configurations

**Development:**
```env
NODE_ENV=development
LOG_LEVEL=debug
SUI_NETWORK=testnet
```

**Staging:**
```env
NODE_ENV=staging
LOG_LEVEL=info
SUI_NETWORK=testnet
```

**Production:**
```env
NODE_ENV=production
LOG_LEVEL=warn
SUI_NETWORK=mainnet
```

## 🏗️ Architecture

### Project Structure

```
backend/
├── src/
│   ├── database/           # Database connection and configuration
│   ├── middleware/         # Express middleware (auth, errors, etc.)
│   ├── models/            # Mongoose models and schemas
│   ├── routes/            # API route handlers
│   ├── services/          # Business logic and external integrations
│   ├── utils/             # Utility functions and helpers
│   └── server.js          # Main server entry point
├── logs/                  # Log files (auto-generated)
├── scripts/               # Database seeders and utilities
├── tests/                 # Test files
├── docs/                  # Additional documentation
├── .env.example           # Environment variables template
├── Dockerfile             # Docker configuration
├── ecosystem.config.js    # PM2 configuration
└── package.json           # Dependencies and scripts
```

### Database Schema

**Core Collections:**
- `users` - User accounts with encrypted Sui wallets
- `hunterprofiles` - Game stats and rankings
- `treasures` - Treasure locations with geospatial indexing
- `treasurediscoveries` - Discovery records and NFT references
- `transactions` - Blockchain transaction history
- `achievements` - Game achievements and unlocks

### Blockchain Integration

**Smart Contract Functions:**
- `create_hunter_profile()` - Initialize player on blockchain
- `find_treasure()` - Discover treasure and mint NFT
- `get_hunter_stats()` - Retrieve player statistics

**Sui Objects:**
- `TreasureNFT` - Proof of discovery NFTs
- `HunterProfile` - On-chain player profiles
- `TreasureRegistry` - Master treasure catalog

### Security Features

- **Authentication**: JWT tokens with configurable expiration
- **Authorization**: Role-based access (user/admin)
- **Rate Limiting**: Configurable request limits
- **Input Validation**: Express-validator middleware
- **Encryption**: AES encryption for private keys
- **CORS**: Configurable cross-origin policies
- **Helmet**: Security headers
- **Logging**: Comprehensive audit trails

## 🤝 Contributing

### Development Workflow

1. **Fork the repository**
2. **Create feature branch**: `git checkout -b feature/amazing-feature`
3. **Install dependencies**: `npm install`
4. **Make changes** and add tests
5. **Run tests**: `npm test`
6. **Commit changes**: `git commit -m 'Add amazing feature'`
7. **Push branch**: `git push origin feature/amazing-feature`
8. **Create Pull Request**

### Code Standards

- **ESLint**: Follow the configured linting rules
- **Prettier**: Use for code formatting
- **Comments**: Document complex logic
- **Tests**: Add tests for new features
- **Security**: Never commit secrets or private keys

### Adding New Features

1. **Routes**: Add new endpoints in `/src/routes/`
2. **Models**: Define schemas in `/src/models/`
3. **Services**: Business logic in `/src/services/`
4. **Middleware**: Custom middleware in `/src/middleware/`
5. **Tests**: Add corresponding tests

### Database Migrations

When changing schemas:

1. Update the model in `/src/models/`
2. Create migration script in `/scripts/migrations/`
3. Test migration on development data
4. Document breaking changes

## 🐛 Troubleshooting

### Common Issues

#### Server Won't Start

**Issue**: Port already in use
```bash
# Find process using port 3000
lsof -i :3000
# Kill the process
kill -9 PID
```

**Issue**: Missing environment variables
```bash
# Check required variables
node -e "
const required = ['JWT_SECRET', 'MONGODB_URI', 'ENCRYPTION_MASTER_KEY'];
required.forEach(key => {
  if (!process.env[key]) console.log('Missing:', key);
});
"
```

#### Database Connection Failed

**Issue**: MongoDB not running
```bash
# Start MongoDB service
sudo systemctl start mongod

# Check status
sudo systemctl status mongod
```

**Issue**: Wrong connection string
- Verify `MONGODB_URI` format
- Check username/password
- Ensure database exists

#### Blockchain Integration Issues

**Issue**: Sui network connection failed
- Verify `SUI_NETWORK` setting
- Check `SUI_RPC_URL` is accessible
- Ensure smart contracts are deployed

**Issue**: Insufficient gas for transactions
- Use testnet faucet: `POST /api/v1/auth/faucet`
- Check wallet balance: `GET /api/v1/wallet/balance`

#### Authentication Problems

**Issue**: JWT token invalid
- Check `JWT_SECRET` is set correctly
- Verify token hasn't expired
- Ensure client sends proper Authorization header

**Issue**: Wallet decryption failed
- Verify `ENCRYPTION_MASTER_KEY` is correct
- Check user has valid encrypted private key
- Use debug endpoint: `POST /api/v1/profile/test-decryption`

### Debug Mode

Enable detailed logging:

```bash
# Set debug environment
export NODE_ENV=development
export LOG_LEVEL=debug

# Start server
npm run dev
```

### Health Checks

Monitor system health:

```bash
# Basic health
curl http://localhost:3000/health

# Debug information
curl http://localhost:3000/debug

# Database status
curl http://localhost:3000/api/v1/admin/system \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Performance Issues

**High Memory Usage:**
- Check for memory leaks in logs
- Monitor with `htop` or `ps aux`
- Consider using PM2 clustering

**Slow Database Queries:**
- Enable MongoDB profiling
- Check index usage
- Optimize geospatial queries

**High CPU Usage:**
- Profile code with `clinic.js`
- Check for infinite loops
- Optimize heavy computations

### Getting Help

1. **Check Logs**: `tail -f logs/combined.log`
2. **Search Issues**: GitHub repository issues
3. **Ask Questions**: Stack Overflow with tags `node.js`, `express`, `mongodb`, `sui-blockchain`
4. **Contact Team**: Create GitHub issue with:
   - Environment details
   - Error logs
   - Steps to reproduce
   - Expected vs actual behavior

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Sui Foundation** for blockchain infrastructure
- **MongoDB** for geospatial database capabilities
- **Express.js** community for the robust web framework
- **Open Source Contributors** who made this project possible

---

**Built with ❤️ for the treasure hunting community**

For more information, visit our [documentation site](https://docs.treasure-hunt.example.com) or join our [Discord community](https://discord.gg/treasure-hunt).
