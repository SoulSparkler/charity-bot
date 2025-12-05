import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Database configuration - from Railway or .env
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// No mock DB support anymore — only PostgreSQL
let pool: Pool | null = null;

try {
  pool = new Pool(dbConfig);
  console.log('📦 PostgreSQL pool created');
} catch (error) {
  console.error('❌ Failed to create PostgreSQL pool:', error);
  pool = null;
}

// Test DB connection
export async function testConnection(): Promise<boolean> {
  if (!pool) {
    console.error('❌ DB pool is not initialized');
    return false;
  }

  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ PostgreSQL database connection successful');
    return true;
  } catch (error) {
    console.error('❌ PostgreSQL database connection failed:', error);
    return false;
  }
}

// Execute SQL query
export async function query(text: string, params?: any[]): Promise<any> {
  if (!pool) {
    throw new Error('Database connection pool is not available');
  }

  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    console.error('❌ PostgreSQL query error:', error);
    throw error;
  }
}

/* ================================
   REAL DB OPERATIONS BELOW  
   ================================ */

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

  return result.rows[0] || null;
}

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

  return result.rows[0] || null;
}

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

export async function getOpenTradesCount() {
  const result = await query(`
    SELECT COUNT(*) as count
    FROM trade_logs 
    WHERE created_at >= CURRENT_DATE
      AND (exit_price IS NULL OR exit_price = 0)
  `);

  return parseInt(result.rows[0].count) || 0;
}

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

  return result.rows[0] || null;
}

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

  return result.rows[0] || null;
}

export async function getBotBMonthToDatePnL() {
  const result = await query(`
    SELECT SUM(pnl_usd) as mtd_pnl
    FROM trade_logs 
    WHERE bot = 'B'
      AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
  `);

  return parseFloat(result.rows[0].mtd_pnl) || 0;
}

// Close DB connection
export async function closeConnection(): Promise<void> {
  if (!pool) return;

  try {
    await pool.end();
    console.log('🔌 PostgreSQL pool closed');
  } catch (error) {
    console.error('❌ Error closing PostgreSQL pool:', error);
  }
}

export function getDatabaseType(): 'postgresql' {
  return 'postgresql';
}
