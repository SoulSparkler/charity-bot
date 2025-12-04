import express from 'express';
import { testConnection, closeDatabase, getDatabaseType } from './db/db';
import { sentimentService } from './services/sentimentService';
import { krakenService } from './services/krakenService';

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

    // Initialize services (non-blocking)
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