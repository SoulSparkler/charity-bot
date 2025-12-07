#!/usr/bin/env ts-node

import { testConnection, closeDatabase, initializeDatabase } from './db/db';
import { sentimentService } from './services/sentimentService';
import { krakenService } from './services/krakenService';

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
    
    // Test database connection
    await testConnection();
    console.log('✅ Database connection verified');

    // Initialize database schema BEFORE any services that use DB
    console.log('📦 Initializing database schema...');
    await initializeDatabase();
    console.log('[DB] Schema initialized');

    // Initialize services (AFTER database schema is ready)
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

    console.log('🤖 Worker service started successfully');
    console.log('📅 Bot A: Every 5 minutes');
    console.log('📅 Bot B: Every 15 minutes');
    console.log('📊 Sentiment: Every hour');
    console.log('📈 Market data: Every 2 minutes');
    console.log('⏰ Worker is now monitoring and trading automatically');

  } catch (error) {
    console.error('❌ Failed to start worker service:', error);
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