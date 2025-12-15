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

// Start worker service
async function startWorker() {
  try {
    console.log('🤖 Worker service starting...');
    
    // CRITICAL: Test database connection first
    console.log('🔌 Testing database connection...');
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('❌ Database connection failed - BLOCKING STARTUP');
      throw new Error('Database connection required for safe operation');
    }
    console.log('✅ Database connection verified');

    // CRITICAL: Initialize database schema BEFORE any services that use DB
    console.log('📦 Initializing database schema with safety checks...');
    try {
      await initializeDatabase();
      console.log('[DB] ✅ Schema initialized - DATABASE SAFE FOR TRADING');
    } catch (error) {
      console.error('[DB] ❌ Database initialization failed - BLOCKING STARTUP');
      console.error('[DB] 🚫 TRADING BLOCKED - Database schema incomplete or invalid');
      throw new Error(`Database initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // CRITICAL: Verify canonical database schema before allowing any bot operations
    console.log('🔍 Verifying canonical database schema...');
    try {
      const { query } = await import('./db/db');
      const { BOT_STATE_COLUMN_NAMES } = await import('./db/schema-constants');
      
      // Verify all canonical columns exist
      const verificationResult = await query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'bot_state'
        ORDER BY column_name
      `);

      const existingColumns = verificationResult.rows.map((row: any) => row.column_name);
      const missingColumns = BOT_STATE_COLUMN_NAMES.filter(col => !existingColumns.includes(col));
      
      if (missingColumns.length > 0) {
        throw new Error(`Missing canonical columns: ${missingColumns.join(', ')}`);
      }

      // Test critical bot query
      await query(`
        SELECT bot_a_virtual_usd, bot_b_virtual_usd, bot_a_cycle_number, bot_a_cycle_target, bot_b_enabled, bot_b_triggered
        FROM bot_state
        LIMIT 1
      `);
      
      console.log('✅ Canonical database schema verification passed - ALL REQUIRED COLUMNS PRESENT');
    } catch (error) {
      console.error('❌ Canonical database verification failed - BLOCKING TRADING');
      console.error('🚫 KRAKEN LIVE MODE BLOCKED - Canonical schema verification failed');
      throw new Error(`Canonical schema verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Ensure start snapshot exists (for P/L calculations)
    console.log('📊 Checking start snapshot...');
    await ensureStartSnapshot(async () => {
      const balance = await krakenService.getTotalUSDValue();
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
        const balance = await krakenService.getTotalUSDValue();
        await saveSnapshot('daily', balance);
      } catch (error) {
        console.error('❌ Daily snapshot failed:', error);
      }
    }, { timezone: 'UTC' });

    // Weekly snapshot every Monday at 00:00 UTC
    cron.schedule('0 0 * * 1', async () => {
      try {
        console.log('📸 Taking weekly balance snapshot...');
        const balance = await krakenService.getTotalUSDValue();
        await saveSnapshot('weekly', balance);
      } catch (error) {
        console.error('❌ Weekly snapshot failed:', error);
      }
    }, { timezone: 'UTC' });

    // Monthly snapshot on 1st of each month at 00:00 UTC
    cron.schedule('0 0 1 * *', async () => {
      try {
        console.log('📸 Taking monthly balance snapshot...');
        const balance = await krakenService.getTotalUSDValue();
        await saveSnapshot('monthly', balance);
      } catch (error) {
        console.error('❌ Monthly snapshot failed:', error);
      }
    }, { timezone: 'UTC' });

    console.log('🤖 Worker service started successfully');
    console.log('📅 Bot A: Every 5 minutes');
    console.log('📅 Bot B: Every 15 minutes');
    console.log('📊 Sentiment: Every hour');
    console.log('📈 Market data: Every 2 minutes');
    console.log('📸 Snapshots: Daily/Weekly/Monthly at 00:00 UTC');
    console.log('🛡️  Database schema verified - SAFE FOR LIVE TRADING');
    console.log('✅ Kraken LIVE MODE ENABLED - All safety checks passed');
    console.log('⏰ Worker is now monitoring and trading automatically');

  } catch (error) {
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