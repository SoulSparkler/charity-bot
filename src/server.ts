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

// Bot-A Dashboard endpoint - provides structured data for frontend dashboard
app.get('/api/bot-a/data', async (_req, res) => {
  console.log('🔍 [Bot-A Dashboard] Endpoint hit at', new Date().toISOString());
  
  try {
    const ALLOW_REAL_TRADING = process.env.ALLOW_REAL_TRADING === 'true';
    const DEMO_MODE = process.env.DEMO_MODE === 'true';
    
    console.log(`📊 [Bot-A Dashboard] Real trading: ${ALLOW_REAL_TRADING}, Demo mode: ${DEMO_MODE}`);
    
    let botData;
    
    if (ALLOW_REAL_TRADING && !DEMO_MODE) {
      // LIVE MODE: Get real data
      console.log('🚀 [Bot-A Dashboard] Loading LIVE data...');
      
      try {
        // Import dynamically to avoid circular dependencies
        const { botAEngine } = await import('./bots/botAEngine');
        const { sentimentService } = await import('./services/sentimentService');
        
        // Get bot status
        const botStatus = await botAEngine.getStatus();
        console.log('✅ [Bot-A Dashboard] Bot status retrieved:', botStatus);
        
        // Get real Kraken USD balance
        let usdBalance = 230; // Fallback to seed amount
        try {
          const balances = await krakenService.getBalances();
          usdBalance = Number(balances["ZUSD"] || balances["USD"] || 0);
          console.log("Bot A using Kraken USD balance:", usdBalance);
        } catch (balanceError) {
          console.warn('⚠️ [Bot-A Dashboard] Failed to get Kraken balance, using fallback:', balanceError);
        }
        
        // Get sentiment data
        const mcs = await sentimentService.getLatestMCS();
        console.log('✅ [Bot-A Dashboard] MCS retrieved:', mcs);
        
        // Get today's trades
        const stats = await botAEngine.getBotAStatistics(1); // Last 1 day
        console.log('✅ [Bot-A Dashboard] Statistics retrieved:', stats);
        
        botData = {
          mode: "LIVE",
          current_balance: usdBalance,
          cycle_number: botStatus.cycle || 1,
          cycle_target: botStatus.target || 200,
          cycle_progress: botStatus.progress || 0,
          risk_mode: botStatus.trading ? "High" : "Low",
          today_trades: stats.totalTrades || 0,
          win_rate: stats.winRate || 0.75,
          total_pnl_today: stats.totalPnL || 0,
          trades: [], // Will be populated from trade logs if needed
          sentiment: {
            mcs: mcs || 0.5,
            risk_level: botStatus.trading ? "High" : "Low",
          },
          last_updated: new Date().toISOString(),
        };
        
        console.log('✅ [Bot-A Dashboard] Live data assembled successfully');
        
      } catch (liveError) {
        console.error('❌ [Bot-A Dashboard] Failed to load live data:', liveError);
        
        // Fall back to mock data if live data fails
        botData = createMockBotAData("LIVE_FALLBACK");
      }
      
    } else {
      // DEMO MODE: Use mock data
      console.log('🎭 [Bot-A Dashboard] Loading DEMO data...');
      botData = createMockBotAData("DEMO");
    }
    
    // Ensure no null values in the response
    botData = sanitizeBotAData(botData);
    
    console.log('📤 [Bot-A Dashboard] Sending response:', {
      mode: botData.mode,
      balance: botData.current_balance,
      cycle: botData.cycle_number,
      trades: botData.today_trades
    });
    
    res.json(botData);
    
  } catch (error) {
    console.error('❌ [Bot-A Dashboard] Critical error:', error);
    
    // Always return valid data, never an error
    const fallbackData = createMockBotAData("ERROR_FALLBACK");
    res.json(fallbackData);
  }
});

// Helper function to create mock Bot-A data
function createMockBotAData(mode: string) {
  const now = new Date();
  const baseBalance = 150 + Math.random() * 100; // Random balance between 150-250
  const target = 200;
  const progress = (baseBalance / target) * 100;
  
  return {
    mode: mode,
    current_balance: Math.round(baseBalance * 100) / 100,
    cycle_number: 1 + Math.floor(Math.random() * 3),
    cycle_target: target,
    cycle_progress: Math.round(progress * 10) / 10,
    risk_mode: "Medium",
    today_trades: Math.floor(Math.random() * 5),
    win_rate: 0.65 + Math.random() * 0.25, // 65-90% win rate
    total_pnl_today: Math.round((Math.random() - 0.5) * 50 * 100) / 100, // -25 to +25
    trades: [],
    sentiment: {
      mcs: 0.4 + Math.random() * 0.4, // 0.4-0.8 MCS
      risk_level: "Medium",
    },
    last_updated: now.toISOString(),
  };
}

// Helper function to ensure no null/undefined values
function sanitizeBotAData(data: any) {
  return {
    mode: data.mode || "DEMO",
    current_balance: data.current_balance || 0,
    cycle_number: data.cycle_number || 1,
    cycle_target: data.cycle_target || 200,
    cycle_progress: data.cycle_progress || 0,
    risk_mode: data.risk_mode || "Low",
    today_trades: data.today_trades || 0,
    win_rate: data.win_rate || 0.5,
    total_pnl_today: data.total_pnl_today || 0,
    trades: data.trades || [],
    sentiment: {
      mcs: data.sentiment?.mcs || 0.5,
      risk_level: data.sentiment?.risk_level || "Low",
    },
    last_updated: data.last_updated || new Date().toISOString(),
  };
}

// Bot-B Dashboard endpoint - provides structured data for frontend dashboard
app.get('/api/bot-b/data', async (_req, res) => {
  console.log('🔍 [Bot-B Dashboard] Endpoint hit at', new Date().toISOString());
  
  try {
    const ALLOW_REAL_TRADING = process.env.ALLOW_REAL_TRADING === 'true';
    const DEMO_MODE = process.env.DEMO_MODE === 'true';
    
    console.log(`📊 [Bot-B Dashboard] Real trading: ${ALLOW_REAL_TRADING}, Demo mode: ${DEMO_MODE}`);
    
    let botData;
    
    if (ALLOW_REAL_TRADING && !DEMO_MODE) {
      // LIVE MODE: Get real data
      console.log('🚀 [Bot-B Dashboard] Loading LIVE data...');
      
      try {
        // Import dynamically to avoid circular dependencies
        const { botBEngine } = await import('./bots/botBEngine');
        const { sentimentService } = await import('./services/sentimentService');
        
        // Get bot status
        const botStatus = await botBEngine.getStatus();
        console.log('✅ [Bot-B Dashboard] Bot status retrieved:', botStatus);
        
        // Get sentiment data
        const mcs = await sentimentService.getLatestMCS();
        console.log('✅ [Bot-B Dashboard] MCS retrieved:', mcs);
        
        // Get today's trades
        const stats = await botBEngine.getBotBStatistics(1); // Last 1 day
        console.log('✅ [Bot-B Dashboard] Statistics retrieved:', stats);
        
        // Calculate MTD P&L and estimated donation
        const currentDate = new Date();
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const monthProfit = stats.currentBalance - (stats.currentBalance - stats.totalPnL); // Simplified calculation
        const estimatedDonation = monthProfit > 0 ? monthProfit * 0.5 : 0; // 50% of monthly profits
        
        botData = {
          mode: "LIVE",
          current_balance: botStatus.balance || 0,
          mtd_pnl: stats.totalPnL || 0,
          estimated_next_month_donation: estimatedDonation,
          today_trades: botStatus.todaysTrades || 0,
          win_rate: stats.winRate || 0.8,
          total_pnl_today: stats.totalPnL || 0,
          monthly_reports: [], // Will be populated from monthly reports if needed
          risk_mode: "Conservative",
          trades: [], // Will be populated from trade logs if needed
          sentiment: {
            mcs: mcs || 0.5,
            risk_level: "Conservative",
          },
          last_updated: new Date().toISOString(),
        };
        
        console.log('✅ [Bot-B Dashboard] Live data assembled successfully');
        
      } catch (liveError) {
        console.error('❌ [Bot-B Dashboard] Failed to load live data:', liveError);
        
        // Fall back to mock data if live data fails
        botData = createMockBotBData("LIVE_FALLBACK");
      }
      
    } else {
      // DEMO MODE: Use mock data
      console.log('🎭 [Bot-B Dashboard] Loading DEMO data...');
      botData = createMockBotBData("DEMO");
    }
    
    // Ensure no null values in the response
    botData = sanitizeBotBData(botData);
    
    console.log('📤 [Bot-B Dashboard] Sending response:', {
      mode: botData.mode,
      balance: botData.current_balance,
      trades: botData.today_trades,
      win_rate: botData.win_rate
    });
    
    res.json(botData);
    
  } catch (error) {
    console.error('❌ [Bot-B Dashboard] Critical error:', error);
    
    // Always return valid data, never an error
    const fallbackData = createMockBotBData("ERROR_FALLBACK");
    res.json(fallbackData);
  }
});

// Helper function to create mock Bot-B data
function createMockBotBData(mode: string) {
  const now = new Date();
  const baseBalance = 50 + Math.random() * 30; // Random balance between 50-80
  const winRate = 0.75 + Math.random() * 0.2; // 75-95% win rate (Bot B is more conservative)
  const todayPnL = Math.round((Math.random() - 0.3) * 15 * 100) / 100; // Generally positive P&L
  const mtdPnL = todayPnL + Math.round((Math.random() - 0.2) * 25 * 100) / 100; // Month-to-date P&L
  const estimatedDonation = mtdPnL > 0 ? mtdPnL * 0.5 : 0; // 50% of monthly profits
  
  return {
    mode: mode,
    current_balance: Math.round(baseBalance * 100) / 100,
    mtd_pnl: mtdPnL,
    estimated_next_month_donation: Math.round(estimatedDonation * 100) / 100,
    today_trades: Math.floor(Math.random() * 2), // Bot B trades less frequently
    win_rate: Math.round(winRate * 1000) / 1000,
    total_pnl_today: todayPnL,
    monthly_reports: [], // Empty for now, will be populated when real data available
    trades: [],
    sentiment: {
      mcs: 0.5 + Math.random() * 0.3, // 0.5-0.8 MCS
      risk_level: "Conservative",
    },
    last_updated: now.toISOString(),
  };
}

// Helper function to ensure no null/undefined values for Bot B
function sanitizeBotBData(data: any) {
  return {
    mode: data.mode || "DEMO",
    current_balance: data.current_balance || 0,
    mtd_pnl: data.mtd_pnl || 0,
    estimated_next_month_donation: data.estimated_next_month_donation || 0,
    today_trades: data.today_trades || 0,
    win_rate: data.win_rate || 0.75,
    total_pnl_today: data.total_pnl_today || 0,
    monthly_reports: data.monthly_reports || [],
    risk_mode: data.risk_mode || "Conservative",
    trades: data.trades || [],
    sentiment: {
      mcs: data.sentiment?.mcs || 0.5,
      risk_level: data.sentiment?.risk_level || "Conservative",
    },
    last_updated: data.last_updated || new Date().toISOString(),
  };
}

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

// Kraken balance endpoint - retrieves real account balance
app.get('/api/kraken/balance', async (_req, res) => {
  try {
    console.log('Fetching Kraken balance…');
    
    const balance = await krakenService.getBalances();
    
    console.log('Received Kraken response');
    
    res.json({
      success: true,
      balance: balance
    });
    
  } catch (error) {
    console.error('Balance endpoint error:', error);
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch balance'
    });
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

// BTC Sell endpoint
app.post('/api/sell-btc', async (req, res) => {
  try {
    // Input validation
    const { usdAmount } = req.body;
    
    if (!usdAmount || typeof usdAmount !== 'number' || usdAmount <= 0) {
      res.status(400).json({ 
        error: 'Invalid usdAmount. Must be a positive number.' 
      });
      return;
    }

    // Check if real trading is enabled
    if (process.env.ALLOW_REAL_TRADING !== 'true') {
      res.status(403).json({ 
        error: 'Real trading is disabled. Set ALLOW_REAL_TRADING=true to enable.' 
      });
      return;
    }

    console.log(`📤 BTC Sell Request: ${usdAmount} USD worth of BTC`);

    // 1. Fetch current BTC/USD price
    const tickerData = await krakenService.getTicker(['BTCUSD']);
    const btcPrice = parseFloat(tickerData['BTCUSD']?.price || '0');
    
    if (!btcPrice || btcPrice <= 0) {
      res.status(500).json({ 
        error: 'Failed to fetch valid BTC/USD price from Kraken' 
      });
      return;
    }

    console.log(`💰 Current BTC price: ${btcPrice.toFixed(2)}`);

    // 2. Convert USD amount to BTC volume
    const btcVolume = usdAmount / btcPrice;
    
    // Kraken requires minimum volume and specific decimal places
    const minVolume = 0.0001; // Minimum BTC volume for Kraken
    if (btcVolume < minVolume) {
      res.status(400).json({ 
        error: `USD amount too small. Minimum BTC volume is ${minVolume} BTC (≈${(minVolume * btcPrice).toFixed(2)} USD)`,
        calculatedVolume: btcVolume,
        minRequired: minVolume,
        currentPrice: btcPrice
      });
      return;
    }

    // Round to 8 decimal places (Kraken standard for BTC)
    const roundedBtcVolume = Math.round(btcVolume * 100000000) / 100000000;

    console.log(`🔄 Converting ${usdAmount} USD → ${roundedBtcVolume} BTC @ ${btcPrice.toFixed(2)}`);

    // 3. Check available BTC balance to prevent overselling
    const portfolio = await krakenService.getPortfolioBalances();
    const availableBtc = portfolio.BTC;

    if (availableBtc <= 0) {
      res.status(400).json({ 
        error: 'No BTC available to sell',
        availableBTC: availableBtc
      });
      return;
    }

    if (roundedBtcVolume > availableBtc) {
      res.status(400).json({ 
        error: 'Insufficient BTC balance',
        requestedVolume: roundedBtcVolume,
        availableBTC: availableBtc,
        maxSellableUSD: availableBtc * btcPrice
      });
      return;
    }

    console.log(`✅ Balance check passed: ${availableBtc} BTC available, selling ${roundedBtcVolume} BTC`);

    // 4. Create a Kraken market sell order
    const orderRequest = {
      pair: 'BTCUSD',
      side: 'sell' as const,
      type: 'market' as const,
      size: roundedBtcVolume,
      reason: 'Manual BTC sell order via API',
      botId: 'A' as const,
      mcs: 0.5
    };

    const order = await krakenService.placeSpotOrder(orderRequest);

    console.log(`🎯 Order placed successfully: ${order.orderId}`);

    // 5. Get updated balances after the sale
    const updatedPortfolio = await krakenService.getPortfolioBalances();
    
    // Calculate actual execution details
    // Note: Market orders execute at the best available price, which might differ slightly from the ticker
    const executedPrice = order.price || btcPrice;
    const actualUsdReceived = roundedBtcVolume * executedPrice;
    const newUsdBalance = updatedPortfolio.USD;

    const response = {
      success: true,
      orderId: order.orderId,
      executedPrice: executedPrice,
      volumeSold: roundedBtcVolume,
      usdAmountReceived: actualUsdReceived,
      newUsdBalance: newUsdBalance,
      remainingBTC: updatedPortfolio.BTC,
      executionTime: order.createdAt,
      details: {
        requestedUSD: usdAmount,
        marketPriceAtRequest: btcPrice,
        executedPrice: executedPrice,
        priceDifference: executedPrice - btcPrice,
        priceDifferencePercent: ((executedPrice - btcPrice) / btcPrice) * 100
      },
      timestamp: new Date().toISOString()
    };

    console.log(`✅ BTC Sell completed: ${roundedBtcVolume} BTC @ ${executedPrice.toFixed(2)} = ${actualUsdReceived.toFixed(2)} USD`);
    console.log(`📊 New balances - USD: ${newUsdBalance.toFixed(2)}, BTC: ${updatedPortfolio.BTC}`);

    res.json(response);

  } catch (error) {
    console.error('❌ BTC Sell failed:', error);
    
    // Handle specific Kraken API errors
    if (error instanceof Error) {
      const errorMessage = error.message;
      
      if (errorMessage.includes('Insufficient funds')) {
        res.status(400).json({ 
          error: 'Insufficient funds to complete the trade',
          details: errorMessage 
        });
        return;
      }
      
      if (errorMessage.includes('Trade rejected')) {
        res.status(400).json({ 
          error: 'Trade rejected by Kraken',
          details: errorMessage 
        });
        return;
      }
      
      if (errorMessage.includes('Invalid amount')) {
        res.status(400).json({ 
          error: 'Invalid trade amount',
          details: errorMessage 
        });
        return;
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to execute BTC sell order',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
    return;
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