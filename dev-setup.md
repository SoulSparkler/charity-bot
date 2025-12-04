# Charity Bot v1 - Development Setup Guide

## 🚀 Quick Start

Since Docker is not available in this environment, here's how to set up the development environment:

### Prerequisites
- Node.js 18+ (already installed)
- PostgreSQL (if available locally)
- npm (already available)

### Backend Setup Issues Encountered

1. **npm install failed** - Token access issues
2. **Docker not available** - Cannot use docker-compose
3. **Database not running** - No PostgreSQL container

### Alternative Setup Options

#### Option 1: Use Mock Mode Only (Recommended for Testing)
The backend can run in complete mock mode without any external dependencies:

```bash
cd charity-bot-v1
npm run dev
```

With these environment variables:
- `USE_MOCK_KRAKEN=true` (already set)
- No database connection required for mock mode

#### Option 2: Local Database Setup
If you have PostgreSQL installed locally:

```bash
# Create database
createdb charity_bot

# Run schema
psql charity_bot < src/db/schema.sql

# Set environment
export DATABASE_URL=postgresql://postgres:password@localhost:5432/charity_bot

# Start backend
npm run dev
```

#### Option 3: Dashboard in Mock Mode
The dashboard is already running successfully with mock data at:
- **Dashboard**: http://localhost:3000
- **API endpoints**: http://localhost:3000/api/dashboard/*

### Current Status

✅ **Dashboard**: Running successfully with mock data
❌ **Backend**: npm install failed due to token issues
❌ **Database**: Not available (no Docker)
❌ **Worker**: Cannot start without dependencies

### Development Workflow

Since the full backend setup has issues, here's the recommended workflow:

1. **Use Dashboard Mock Mode**: The dashboard provides full functionality with realistic mock data
2. **Backend Development**: Fix npm install issues and set up local PostgreSQL
3. **Integration**: Connect dashboard to real backend when available

### Next Steps

1. Fix npm token issues or use alternative package manager
2. Set up local PostgreSQL database
3. Run database migrations
4. Test backend endpoints
5. Connect dashboard to live backend data