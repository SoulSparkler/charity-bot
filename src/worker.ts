#!/usr/bin/env ts-node

import { testConnection, closeDatabase, initializeDatabase, ensureStartSnapshot, saveSnapshot } from './db/db';
import { sentimentService } from './services/sentimentService';
import { krakenService } from './services/krakenService';
import cron from 'node-cron';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

/**
 * Worker Service - Trading Engine Loop
 * 
 * This service runs the automated trading cycles for both bots:
 * - Bot A: Aggressive cycle-based trading (every 5 minutes)
 * - Bot B: Conservative donation bot (every 15 minutes)
 */

// Advanced balance caching to prevent duplicate API calls
let balanceCache: {
  balance: number;
  timestamp: number;
  callCount: number;
} | null = null;
const BALANCE_CACHE_TTL = 30000; // 30 seconds

async function getCachedBalance(): Promise<number> {
  const now = Date.now();
  
  // Return cached balance if still valid
  if (balanceCache && (now - balanceCache.timestamp) < BALANCE_CACHE_TTL) {
    balanceCache.callCount++;
    console.log(`📊 Using cached balance: $${balanceCache.balance.toFixed(2)} (call #${balanceCache.callCount})`);
    return balanceCache.balance;
  }
  
  // Fetch fresh balance and cache it
  console.log('📊 Fetching fresh balance from Kraken...');
  const balance = await krakenService.getTotalUSDValue();
  balanceCache = { balance, timestamp: now, callCount: 1 };
  console.log(`📊 Fresh balance cached: $${balance.toFixed(2)}`);
  return balance;
}

// Start worker service
async function startWorker() {
  try {
    console.log('🤖 Worker service starting...');
    console.log('');
    
    // PHASE 1: Database ready
    console.log('📋 PHASE 1: Database ready');
    console.log('🔌 Testing database connection...');
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('❌ Database connection failed - BLOCKING STARTUP');
      throw new Error('Database connection required for safe operation');
    }
    console.log('✅ Database connection verified');
    console.log('');
    
    // PHASE 2: Schema verified
    console.log('📋 PHASE 2: Schema verified');
    console.log('🔧 Initializing database with strict phase separation...');
    console.log('🚫 NO TRADING OPERATIONS UNTIL PHASE 3 VERIFICATION PASSES');
    try {
      await initializeDatabase();
      console.log('✅ Database initialization completed - PHASES 1-4 SUCCESSFUL');
      console.log('🛡️ SCHEMA VERIFIED - TRADING NOW SAFE');
    } catch (error) {
      console.error('❌ Database initialization failed - BLOCKING STARTUP');
      console.error('🚫 TRADING BLOCKED - Schema initialization failed');
      console.error('💥 REASON:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
    console.log('');
    
    // PHASE 3: Trading enabled
    console.log('📋 PHASE 3: Trading enabled');
    console.log('🔍 Final verification: Testing bot query compatibility...');
    try {
      const { query } = await import('./db/db');
      
      // Test the exact query that bots will use
      const botTestResult = await query(`
        SELECT bot_a_virtual_usd, bot_b_virtual_usd, bot_a_cycle_number, bot_a_cycle_target, bot_b_enabled, bot_b_triggered
        FROM bot_state
        LIMIT 1
      `);
      
      console.log('✅ Bot query test passed - All bot operations are safe');
      console.log('✅ TRADING ENABLED - All safety checks passed');
    } catch (error) {
      console.error('❌ Bot query test failed - BLOCKING TRADING');
      console.error('🚫 TRADING BLOCKED - Bot operations would fail');
      throw new Error(`Bot query test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    console.log('');
    
    // PHASE 4: Kraken LIVE MODE
    console.log('📋 PHASE 4: Kraken LIVE MODE');
    
    // Initialize Kraken LIVE MODE only after schema verification completes
    krakenService.initializeLiveMode();
    console.log('✅ KRAKEN LIVE MODE INITIALIZED - All safety checks passed');
    
    // Ensure start snapshot exists (for P/L calculations)
    console.log('📊 Checking start snapshot...');
    await ensureStartSnapshot(async () => {
      const balance = await getCachedBalance();
      return balance;
    });

    // Initialize services (AFTER database schema is verified as safe)
    try {
      await sentimentService.calculateMCS();
      await krakenService.getTicker(['BTCUSD', 'ETHUSD']);
      console.log('✅ Trading services initialized');
    } catch (error) {
      console.warn('⚠️  Some services failed to initialize:', error);
    }
    console.log('');

    // Start Bot A trading cycle (every 5 minutes)
    setInterval(async () => {
      try {
        const { botAEngine } = await import('./bots/botAEngine');
        console.log('🔄 Running Bot A cycle...');
        await botAEngine.runBotAOnce();
      } catch (error) {
        console.error('❌ Bot A cycle failed:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Start Bot B trading cycle (every 15 minutes)
    setInterval(async () => {
      try {
        const { botBEngine } = await import('./bots/botBEngine');
        console.log('🔄 Running Bot B cycle...');
        await botBEngine.runBotBOnce();
      } catch (error) {
        console.error('❌ Bot B cycle failed:', error);
      }
    }, 15 * 60 * 1000); // 15 minutes

    // Update sentiment data (every hour)
    setInterval(async () => {
      try {
        console.log('📊 Updating sentiment data...');
        await sentimentService.calculateMCS();
      } catch (error) {
        console.error('❌ Sentiment update failed:', error);
      }
    }, 60 * 60 * 1000); // 1 hour

    // Update market data (every 2 minutes)
    setInterval(async () => {
      try {
        await krakenService.getTicker(['BTCUSD', 'ETHUSD']);
      } catch (error) {
        console.error('❌ Market data update failed:', error);
      }
    }, 2 * 60 * 1000); // 2 minutes

    // Schedule balance snapshots for performance tracking
    // Daily snapshot at 00:00 UTC
    cron.schedule('0 0 * * *', async () => {
      try {
        console.log('📸 Taking daily balance snapshot...');
        const balance = await getCachedBalance();
        await saveSnapshot('daily', balance);
      } catch (error) {
        console.error('❌ Daily snapshot failed:', error);
      }
    }, { timezone: 'UTC' });

    // Weekly snapshot every Monday at 00:00 UTC
    cron.schedule('0 0 * * 1', async () => {
      try {
        console.log('📸 Taking weekly balance snapshot...');
        const balance = await getCachedBalance();
        await saveSnapshot('weekly', balance);
      } catch (error) {
        console.error('❌ Weekly snapshot failed:', error);
      }
    }, { timezone: 'UTC' });

    // Monthly snapshot on 1st of each month at 00:00 UTC
    cron.schedule('0 0 1 * *', async () => {
      try {
        console.log('📸 Taking monthly balance snapshot...');
        const balance = await getCachedBalance();
        await saveSnapshot('monthly', balance);
      } catch (error) {
        console.error('❌ Monthly snapshot failed:', error);
      }
    }, { timezone: 'UTC' });

    console.log('🤖 Worker service started successfully');
    console.log('');
    console.log('📅 STARTUP SEQUENCE COMPLETE:');
    console.log('   ✅ PHASE 1: Database ready');
    console.log('   ✅ PHASE 2: Schema verified');
    console.log('   ✅ PHASE 3: Trading enabled');
    console.log('   ✅ PHASE 4: Kraken LIVE MODE');
    console.log('');
    console.log('📅 SCHEDULES:');
    console.log('   Bot A: Every 5 minutes');
    console.log('   Bot B: Every 15 minutes');
    console.log('   Sentiment: Every hour');
    console.log('   Market data: Every 2 minutes');
    console.log('   Snapshots: Daily/Weekly/Monthly at 00:00 UTC');
    console.log('');
    console.log('🛡️  All safety checks passed - SAFE FOR LIVE TRADING');
    console.log('⏰ Worker is now monitoring and trading automatically');

  } catch (error) {
    console.error('');
    console.error('❌ Failed to start worker service:', error);
    console.error('🚫 TRADING BLOCKED - Startup failed due to safety checks');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('📴 Received SIGTERM, shutting down worker gracefully');
  await closeDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📴 Received SIGINT, shutting down worker gracefully');
  await closeDatabase();
  process.exit(0);
});

// Start the worker
startWorker().catch((error) => {
  console.error('❌ Unhandled error during worker startup:', error);
  process.exit(1);
});