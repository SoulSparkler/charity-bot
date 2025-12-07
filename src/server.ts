import express from 'express';
import { testConnection, closeDatabase, getDatabaseType, initializeDatabase, ensureStartSnapshot, getSnapshot } from './db/db';
import { sentimentService } from './services/sentimentService';
import { krakenService } from './services/krakenService';
import testBalanceRoute from './routes/testBalance';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    const dbStatus = getDatabaseType();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      service: 'api-server',
      environment: process.env.NODE_ENV || 'development',
      database: dbStatus,
      krakenMode: process.env.USE_MOCK_KRAKEN === 'true' ? 'mock' : 'live'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ error: 'Health check failed' });
  }
});

// API test endpoint - health check for the backend API
app.get("/api/test", (req, res) => {
  res.json({
    success: true,
    message: "Backend API is running",
    timestamp: new Date().toISOString(),
  });
});

// Test balance endpoint
app.use("/api/test-balance", testBalanceRoute);

// Bot status endpoints
app.get('/api/bots/status', async (_req, res) => {
  try {
    // Import dynamically to avoid circular dependencies
    const { botAEngine } = await import('./bots/botAEngine');
    const { botBEngine } = await import('./bots/botBEngine');
    
    const botAStatus = await botAEngine.getStatus();
    const botBStatus = await botBEngine.getStatus();
    
    res.json({
      botA: botAStatus,
      botB: botBStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting bot status:', error);
    res.status(500).json({ error: 'Failed to get bot status' });
  }
});

// Market data endpoint
app.get('/api/market/data', async (_req, res) => {
  try {
    const tickerData = await krakenService.getTicker(['BTCUSD', 'ETHUSD']);
    res.json({
      data: tickerData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting market data:', error);
    res.status(500).json({ error: 'Failed to get market data' });
  }
});

// Sentiment data endpoint
app.get('/api/sentiment/current', async (_req, res) => {
  try {
    const mcs = await sentimentService.getLatestMCS();
    const trendAnalysis = await sentimentService.getTrendAnalysis('BTCUSD');
    
    res.json({
      mcs,
      trend: trendAnalysis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting sentiment data:', error);
    res.status(500).json({ error: 'Failed to get sentiment data' });
  }
});

// Risk status endpoint
app.get('/api/risk/status', async (_req, res) => {
  try {
    const riskStatus = await krakenService.getRiskStatus();
    
    res.json({
      ...riskStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting risk status:', error);
    res.status(500).json({ error: 'Failed to get risk status' });
  }
});

// Sentiment endpoint - Fear & Greed Index from Alternative.me
app.get("/api/sentiment", async (req, res) => {
  try {
    const response = await fetch("https://api.alternative.me/fng/?limit=1&format=json");
    
    if (!response.ok) {
      res.status(500).json({ error: `HTTP error! status: ${response.status}` });
      return;
    }
    
    const data = await response.json() as any;

    if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
      res.status(500).json({ error: "No sentiment data available" });
      return;
    }

    const item = data.data[0];

    res.json({
      value: item.value,
      classification: item.value_classification,
      timestamp: item.timestamp,
      updated: new Date(Number(item.timestamp) * 1000),
    });
  } catch (err) {
    console.error("Sentiment fetch failed:", err);
    res.status(500).json({ error: "Failed to fetch sentiment" });
  }
});

// Portfolio balances endpoint (clean format for dashboard)
app.get('/api/portfolio', async (_req, res) => {
  try {
    const portfolio = await krakenService.getPortfolioBalances();
    res.json({
      balances: {
        USD: portfolio.USD,
        BTC: portfolio.BTC,
        ETH: portfolio.ETH,
        totalValue: portfolio.portfolioValueUSD
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting portfolio:', error);
    res.status(500).json({ error: 'Failed to get portfolio' });
  }
});

// Performance data endpoint
app.get('/api/performance', async (_req, res) => {
  try {
    // Get snapshots
    const startSnapshot = await getSnapshot('start');
    const dailySnapshot = await getSnapshot('daily');
    const weeklySnapshot = await getSnapshot('weekly');
    const monthlySnapshot = await getSnapshot('monthly');
    
    // Get current balance
    let currentBalance: number | null = null;
    try {
      currentBalance = await krakenService.getTotalUSDValue();
    } catch (error) {
      console.warn('Could not fetch current balance:', error);
    }

    // Calculate P/L values
    const startingBalance = startSnapshot?.balance ?? null;
    const dailyPL = (currentBalance !== null && dailySnapshot) 
      ? currentBalance - dailySnapshot.balance 
      : null;
    const weeklyPL = (currentBalance !== null && weeklySnapshot) 
      ? currentBalance - weeklySnapshot.balance 
      : null;
    const monthlyPL = (currentBalance !== null && monthlySnapshot) 
      ? currentBalance - monthlySnapshot.balance 
      : null;
    const totalReturnPercent = (currentBalance !== null && startingBalance !== null && startingBalance > 0)
      ? ((currentBalance - startingBalance) / startingBalance) * 100
      : null;

    res.json({
      startingBalance,
      currentBalance,
      dailyPL,
      weeklyPL,
      monthlyPL,
      totalReturnPercent,
      snapshots: {
        start: startSnapshot,
        daily: dailySnapshot,
        weekly: weeklySnapshot,
        monthly: monthlySnapshot
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting performance data:', error);
    res.status(500).json({ error: 'Failed to get performance data' });
  }
});

// Manual bot execution endpoints (for testing)
app.post('/api/bots/execute', async (req, res) => {
  try {
    const { bot } = req.body;
    
    if (bot === 'A') {
      const { botAEngine } = await import('./bots/botAEngine');
      const result = await botAEngine.runBotAOnce();
      res.json(result);
    } else if (bot === 'B') {
      const { botBEngine } = await import('./bots/botBEngine');
      const result = await botBEngine.runBotBOnce();
      res.json(result);
    } else {
      res.status(400).json({ error: 'Invalid bot specified' });
    }
  } catch (error) {
    console.error('Error executing bot:', error);
    res.status(500).json({ error: 'Failed to execute bot' });
  }
});

// Start server
async function startServer() {
  try {
    // Test database connection
    await testConnection();
    console.log('✅ Database connection tested');

    // Initialize database schema BEFORE any services that use DB
    console.log('📦 Initializing database schema...');
    await initializeDatabase();
    console.log('[DB] Schema initialized');

    // Ensure start snapshot exists (for P/L calculations)
    console.log('📊 Checking start snapshot...');
    await ensureStartSnapshot(async () => {
      const balance = await krakenService.getTotalUSDValue();
      return balance;
    });

    // Initialize services (AFTER database schema is ready)
    try {
      await sentimentService.calculateMCS();
      await krakenService.getTicker(['BTCUSD', 'ETHUSD']);
      console.log('✅ Services initialized');
    } catch (error) {
      console.warn('⚠️  Some services failed to initialize:', error);
    }

    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 API server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`💾 Database mode: ${getDatabaseType()}`);
      console.log(`🔗 Dashboard URL: http://localhost:3001`);
      console.log(`📋 Health check: http://localhost:${PORT}/health`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('📴 Received SIGTERM, shutting down gracefully');
  await closeDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📴 Received SIGINT, shutting down gracefully');
  await closeDatabase();
  process.exit(0);
});

// Start the server
startServer().catch((error) => {
  console.error('❌ Unhandled error during startup:', error);
  process.exit(1);
});

export { app };