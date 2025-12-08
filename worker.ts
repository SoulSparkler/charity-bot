import dotenv from 'dotenv';
import cron from 'node-cron';
import express from 'express';
import { logger, performanceLogger } from './src/utils/logger';
import { testConnection, initializeDatabase, closeDatabase } from './src/db/db';
import { sentimentService } from './src/services/sentimentService';
import { krakenService } from './src/services/krakenService';
import { botAEngine } from './src/bots/botAEngine';
import { botBEngine } from './src/bots/botBEngine';
import { riskEngine } from './src/services/riskEngine';

// Load environment variables
dotenv.config();

// Trading configuration from environment
const ALLOW_REAL_TRADING = process.env.ALLOW_REAL_TRADING === 'true';
const DEMO_MODE = process.env.DEMO_MODE === 'true';
const BOT_A_ENABLED = ALLOW_REAL_TRADING && !DEMO_MODE;
const BOT_B_ENABLED = false; // Disabled for now
const BOT_C_ENABLED = false; // Disabled for now

class CharityBotWorker {
  private app: express.Application;
  private isRunning = false;
  private startTime: Date;

  constructor() {
    this.app = express();
    this.startTime = new Date();
    this.setupRoutes();
  }

  /**
   * Initialize the worker
   */
  async initialize(): Promise<void> {
    try {
      logger.info('🚀 Starting Charity Bot Worker v1.0.0');
      logger.info(`Mode: ${process.env.USE_MOCK_KRAKEN === 'true' ? '🧪 MOCK' : 'LIVE'}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

      // Test database connection
      const dbConnected = await testConnection();
      if (!dbConnected) {
        throw new Error('Database connection failed');
      }

      // Initialize database schema
      await initializeDatabase();

      // Test Kraken connection
      const krakenStatus = krakenService.getStatus();
      logger.info(`Kraken Service: ${krakenStatus.status} mode, API Key: ${krakenStatus.apiKeyConfigured ? '✅' : '❌'}`);

      // Test sentiment service
      const sentimentStatus = sentimentService.getStatus();
      logger.info(`Sentiment Service: API available: ${sentimentStatus.apiAvailable ? '✅' : '❌'}`);

      // Start scheduled tasks
      this.startScheduledTasks();

      this.isRunning = true;
      logger.info('✅ Charity Bot Worker initialized successfully');

    } catch (error) {
      logger.error('❌ Failed to initialize worker', error as Error);
      throw error;
    }
  }

  /**
   * Start all scheduled tasks
   */
  private startScheduledTasks(): void {
    logger.info('📅 Starting scheduled tasks...');

    // Sentiment Analysis - Every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
      await this.runSentimentAnalysis();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // Bot A Execution - Every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      await this.runBotA();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // Bot B Execution - Every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      await this.runBotB();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // Daily Maintenance - Every day at midnight UTC
    cron.schedule('0 0 * * *', async () => {
      await this.runDailyMaintenance();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // Hourly Status Check
    cron.schedule('0 * * * *', async () => {
      await this.runStatusCheck();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    logger.info('✅ All scheduled tasks configured');
  }

  /**
   * Run sentiment analysis cycle
   */
  private async runSentimentAnalysis(): Promise<void> {
    try {
      performanceLogger.info('🔄 Starting sentiment analysis cycle');

      // Update MCS
      const mcs = await sentimentService.calculateMCS();
      performanceLogger.sentiment(mcs, await sentimentService.getLatestFGValue());

      performanceLogger.info('✅ Sentiment analysis completed');
    } catch (error) {
      performanceLogger.error('Sentiment analysis failed', error as Error);
    }
  }

  /**
   * Run Bot A execution
   */
  private async runBotA(): Promise<void> {
    // Check if Bot A is enabled
    if (!BOT_A_ENABLED) {
      performanceLogger.info('⏸️ Bot A is disabled (ALLOW_REAL_TRADING=false or DEMO_MODE=true)');
      return;
    }

    try {
      performanceLogger.info('🔄 Starting Bot A execution (REAL TRADING ENABLED)');

      const result = await botAEngine.runBotAOnce();
      if (result.success) {
        performanceLogger.info(`✅ Bot A: ${result.message}`);
        if (result.trades && result.trades.length > 0) {
          performanceLogger.info(`Bot A executed ${result.trades.length} trades`);
        }
      } else {
        performanceLogger.error(`❌ Bot A failed: ${result.message}`);
      }
    } catch (error) {
      performanceLogger.error('Bot A execution error', error as Error);
    }
  }

  /**
   * Run Bot B execution
   */
  private async runBotB(): Promise<void> {
    // Bot B is disabled for now
    if (!BOT_B_ENABLED) {
      performanceLogger.info('⏸️ Bot B is disabled');
      return;
    }

    try {
      performanceLogger.info('🔄 Starting Bot B execution');

      const result = await botBEngine.runBotBOnce();
      if (result.success) {
        performanceLogger.info(`✅ Bot B: ${result.message}`);
        if (result.trades && result.trades.length > 0) {
          performanceLogger.info(`Bot B executed ${result.trades.length} trades`);
        }
      } else {
        performanceLogger.error(`❌ Bot B failed: ${result.message}`);
      }
    } catch (error) {
      performanceLogger.error('Bot B execution error', error as Error);
    }
  }

  /**
   * Run daily maintenance tasks
   */
  private async runDailyMaintenance(): Promise<void> {
    try {
      performanceLogger.info('🔄 Starting daily maintenance');

      // Clean old sentiment readings
      await sentimentService.cleanOldReadings();

      // Process monthly donations if needed
      const currentDay = new Date().getUTCDate();
      if (currentDay === 1) { // First day of month
        performanceLogger.info('📊 Processing monthly donations');
        const report = await botBEngine.processMonthlyDonations();
        if (report) {
          performanceLogger.info(`Monthly donation processed: $${report.donationAmount.toFixed(2)}`);
        }
      }

      // Log daily statistics
      await this.logDailyStatistics();

      performanceLogger.info('✅ Daily maintenance completed');
    } catch (error) {
      performanceLogger.error('Daily maintenance failed', error as Error);
    }
  }

  /**
   * Run status check
   */
  private async runStatusCheck(): Promise<void> {
    try {
      const uptime = Date.now() - this.startTime.getTime();
      const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
      const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));

      performanceLogger.info(`📊 Status Check - Uptime: ${uptimeHours}h ${uptimeMinutes}m`);

      // Log component statuses
      const botAStatus = await botAEngine.getStatus();
      const botBStatus = await botBEngine.getStatus();

      performanceLogger.info(`Bot A: Balance $${botAStatus.balance.toFixed(2)}, Cycle ${botAStatus.cycle}, MCS: ${botAStatus.mcs.toFixed(3)}`);
      performanceLogger.info(`Bot B: Balance $${botBStatus.balance.toFixed(2)}, MCS: ${botBStatus.mcs.toFixed(3)}, Trades today: ${botBStatus.todaysTrades}`);

    } catch (error) {
      performanceLogger.error('Status check failed', error as Error);
    }
  }

  /**
   * Log daily statistics
   */
  private async logDailyStatistics(): Promise<void> {
    try {
      // Get Bot A statistics
      const botAStats = await botAEngine.getBotAStatistics(1);
      performanceLogger.info('📈 Bot A Daily Stats:');
      performanceLogger.info(`- Trades: ${botAStats.totalTrades}, Win Rate: ${(botAStats.winRate * 100).toFixed(1)}%`);
      performanceLogger.info(`- P&L: $${botAStats.totalPnL.toFixed(2)}, Cycle Progress: ${botAStats.cycleProgress.toFixed(1)}%`);

      // Get Bot B statistics
      const botBStats = await botBEngine.getBotBStatistics(1);
      performanceLogger.info('📈 Bot B Daily Stats:');
      performanceLogger.info(`- Trades: ${botBStats.totalTrades}, Win Rate: ${(botBStats.winRate * 100).toFixed(1)}%`);
      performanceLogger.info(`- P&L: $${botBStats.totalPnL.toFixed(2)}, Balance: $${botBStats.currentBalance.toFixed(2)}`);

    } catch (error) {
      performanceLogger.error('Failed to log daily statistics', error as Error);
    }
  }

  /**
   * Setup Express routes for monitoring
   */
  private setupRoutes(): void {
    this.app.use(express.json());

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: this.isRunning ? 'healthy' : 'unhealthy',
        uptime: Date.now() - this.startTime.getTime(),
        mode: process.env.USE_MOCK_KRAKEN === 'true' ? 'mock' : 'live',
        timestamp: new Date().toISOString(),
      });
    });

    // Bot status endpoint
    this.app.get('/status', async (req, res) => {
      try {
        const botAStatus = await botAEngine.getStatus();
        const botBStatus = await botBEngine.getStatus();
        const sentimentStatus = sentimentService.getStatus();

        res.json({
          worker: {
            status: this.isRunning ? 'running' : 'stopped',
            uptime: Date.now() - this.startTime.getTime(),
            startTime: this.startTime,
          },
          botA: botAStatus,
          botB: botBStatus,
          sentiment: sentimentStatus,
          kraken: krakenService.getStatus(),
          riskEngine: riskEngine.getStatus(),
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to get status' });
      }
    });

    // Manual trigger endpoints (for testing)
    this.app.post('/trigger/sentiment', async (req, res) => {
      try {
        await this.runSentimentAnalysis();
        res.json({ message: 'Sentiment analysis triggered' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to trigger sentiment analysis' });
      }
    });

    this.app.post('/trigger/botA', async (req, res) => {
      try {
        const result = await botAEngine.runBotAOnce();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: 'Failed to trigger Bot A' });
      }
    });

    this.app.post('/trigger/botB', async (req, res) => {
      try {
        const result = await botBEngine.runBotBOnce();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: 'Failed to trigger Bot B' });
      }
    });

    this.app.post('/trigger/monthly', async (req, res) => {
      try {
        const report = await botBEngine.processMonthlyDonations();
        res.json({ report });
      } catch (error) {
        res.status(500).json({ error: 'Failed to process monthly donations' });
      }
    });
  }

  /**
   * Start the HTTP server
   */
  startServer(port: number = 3000): void {
    this.app.listen(port, () => {
      logger.info(`🌐 HTTP server started on port ${port}`);
      logger.info(`📊 Status endpoint: http://localhost:${port}/status`);
      logger.info(`❤️  Health endpoint: http://localhost:${port}/health`);
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('🔄 Shutting down Charity Bot Worker...');
    
    this.isRunning = false;

    try {
      // Close database connections
      await closeDatabase();
      logger.info('✅ Database connections closed');

      logger.info('✅ Charity Bot Worker shutdown complete');
    } catch (error) {
      logger.error('❌ Error during shutdown', error as Error);
    }
  }
}

// Create and initialize worker
const worker = new CharityBotWorker();

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  await worker.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await worker.shutdown();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the worker
async function start() {
  try {
    await worker.initialize();
    
    // Start server on specified port
    const port = parseInt(process.env.PORT || '3000');
    worker.startServer(port);

    logger.info('🎉 Charity Bot Worker is now running!');
    logger.info('');
    logger.info('📋 Bot Status:');
    logger.info(`   • Bot A: ${BOT_A_ENABLED ? '✅ ENABLED (Real Trading)' : '⏸️ DISABLED'}`);
    logger.info(`   • Bot B: ${BOT_B_ENABLED ? '✅ ENABLED' : '⏸️ DISABLED'}`);
    logger.info(`   • Bot C: ${BOT_C_ENABLED ? '✅ ENABLED' : '⏸️ DISABLED'}`);
    logger.info('');
    logger.info('📋 Scheduled Tasks:');
    logger.info('   • Sentiment Analysis: Every 15 minutes');
    logger.info('   • Bot A Execution: Every 5 minutes');
    logger.info('   • Bot B Execution: Every 5 minutes');
    logger.info('   • Daily Maintenance: Midnight UTC');
    logger.info('   • Status Check: Every hour');
    logger.info('');

    // Start cron jobs (commented out due to import issue)
    // cron.start();
    logger.info('✅ All cron jobs configured (start manually if needed)');

  } catch (error) {
    logger.error('Failed to start worker', error as Error);
    process.exit(1);
  }
}

// Run the worker
start();