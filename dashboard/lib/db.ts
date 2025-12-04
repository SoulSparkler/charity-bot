import { Pool } from 'pg';
import dotenv from 'dotenv';

// Import mock database functions
import { mockQuery, testConnection as testMockConnection } from './mock-db';

dotenv.config();

// Database configuration - can be overridden by environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'charity_bot',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Determine if we should use mock database
const useMockDb = process.env.USE_MOCK_DB === 'true' || process.env.DEMO_MODE === 'true';
let pool: Pool | null = null;

// Create connection pool if not using mock
if (!useMockDb) {
  try {
    pool = new Pool(dbConfig);
  } catch (error) {
    console.warn('⚠️  Failed to create PostgreSQL connection pool, falling back to mock database:', error);
  }
}

// Test database connection
export async function testConnection(): Promise<boolean> {
  if (useMockDb) {
    return await testMockConnection();
  }
  
  if (!pool) {
    console.log('⚠️  Using mock database - PostgreSQL connection pool not available');
    return await testMockConnection();
  }
  
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ PostgreSQL database connection successful');
    return true;
  } catch (error) {
    console.error('❌ PostgreSQL database connection failed:', error);
    console.log('⚠️  Falling back to mock database');
    return await testMockConnection();
  }
}

// Execute query with error handling
export async function query(text: string, params?: any[]): Promise<any> {
  const start = Date.now();
  
  if (useMockDb || !pool) {
    console.log(`🔄 Mock DB Query:`, text.substring(0, 50) + '...');
    return await mockQuery(text, params);
  }
  
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed PostgreSQL query:', { text: text.substring(0, 50) + '...', duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('PostgreSQL query error:', error);
    console.log('⚠️  Falling back to mock database');
    return await mockQuery(text, params);
  }
}

// Get bot state data
export async function getBotState() {
  const result = await query(`
    SELECT 
      botA_virtual_usd,
      botB_virtual_usd,
      botA_cycle_number,
      botA_cycle_target,
      last_reset,
      updated_at
    FROM bot_state 
    ORDER BY created_at DESC 
    LIMIT 1
  `);
  
  return result.rows[0] || {
    botA_virtual_usd: 230,
    botB_virtual_usd: 0,
    botA_cycle_number: 1,
    botA_cycle_target: 200,
    last_reset: new Date(),
    updated_at: new Date(),
  };
}

// Get latest sentiment data
export async function getLatestSentiment() {
  const result = await query(`
    SELECT 
      fgi_value,
      trend_score,
      mcs,
      created_at
    FROM sentiment_readings 
    ORDER BY created_at DESC 
    LIMIT 1
  `);
  
  return result.rows[0] || {
    fgi_value: 50,
    trend_score: 0,
    mcs: 0.5,
    created_at: new Date(),
  };
}

// Get sentiment history (last 30 entries)
export async function getSentimentHistory(limit: number = 30) {
  const result = await query(`
    SELECT 
      fgi_value,
      mcs,
      created_at
    FROM sentiment_readings 
    ORDER BY created_at DESC 
    LIMIT $1
  `, [limit]);
  
  return result.rows || [];
}

// Get Bot A trades
export async function getBotATrades(limit: number = 10) {
  const result = await query(`
    SELECT 
      pair,
      side,
      size,
      entry_price,
      exit_price,
      pnl_usd,
      created_at
    FROM trade_logs 
    WHERE bot = 'A'
    ORDER BY created_at DESC 
    LIMIT $1
  `, [limit]);
  
  return result.rows || [];
}

// Get Bot B trades
export async function getBotBTrades(limit: number = 10) {
  const result = await query(`
    SELECT 
      pair,
      side,
      size,
      entry_price,
      exit_price,
      pnl_usd,
      created_at
    FROM trade_logs 
    WHERE bot = 'B'
    ORDER BY created_at DESC 
    LIMIT $1
  `, [limit]);
  
  return result.rows || [];
}

// Get monthly reports
export async function getMonthlyReports(limit: number = 12) {
  const result = await query(`
    SELECT 
      month,
      botB_start_balance,
      botB_end_balance,
      donation_amount,
      created_at
    FROM monthly_reports 
    ORDER BY created_at DESC 
    LIMIT $1
  `, [limit]);
  
  return result.rows || [];
}

// Get open trades count
export async function getOpenTradesCount() {
  const result = await query(`
    SELECT COUNT(*) as count
    FROM trade_logs 
    WHERE created_at >= CURRENT_DATE
      AND (exit_price IS NULL OR exit_price = 0)
  `);
  
  return parseInt(result.rows[0].count) || 0;
}

// Get Bot A statistics
export async function getBotAStats() {
  const result = await query(`
    SELECT 
      COUNT(*) as total_trades,
      AVG(CASE WHEN pnl_usd > 0 THEN 1.0 ELSE 0.0 END) as win_rate,
      SUM(pnl_usd) as total_pnl,
      AVG(size * entry_price) as avg_trade_size
    FROM trade_logs 
    WHERE bot = 'A' 
      AND created_at >= CURRENT_DATE
  `);
  
  return result.rows[0] || {
    total_trades: 0,
    win_rate: 0,
    total_pnl: 0,
    avg_trade_size: 0,
  };
}

// Get Bot B statistics
export async function getBotBStats() {
  const result = await query(`
    SELECT 
      COUNT(*) as total_trades,
      AVG(CASE WHEN pnl_usd > 0 THEN 1.0 ELSE 0.0 END) as win_rate,
      SUM(pnl_usd) as total_pnl,
      AVG(size * entry_price) as avg_trade_size
    FROM trade_logs 
    WHERE bot = 'B' 
      AND created_at >= CURRENT_DATE
  `);
  
  return result.rows[0] || {
    total_trades: 0,
    win_rate: 0,
    total_pnl: 0,
    avg_trade_size: 0,
  };
}

// Get month-to-date P&L for Bot B
export async function getBotBMonthToDatePnL() {
  const result = await query(`
    SELECT SUM(pnl_usd) as mtd_pnl
    FROM trade_logs 
    WHERE bot = 'B'
      AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
  `);
  
  return parseFloat(result.rows[0].mtd_pnl) || 0;
}

// Close database connections
export async function closeConnection(): Promise<void> {
  if (useMockDb || !pool) {
    console.log('⚠️  Mock database - no connections to close');
    return;
  }
  
  try {
    await pool.end();
    console.log('✅ PostgreSQL database connection closed');
  } catch (error) {
    console.error('❌ Error closing PostgreSQL database connection:', error);
  }
}

// Export database type info
export function getDatabaseType(): 'postgresql' | 'mock' {
  return (useMockDb || !pool) ? 'mock' : 'postgresql';
}