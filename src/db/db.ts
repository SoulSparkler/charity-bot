import { Pool, PoolClient } from "pg";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: { rejectUnauthorized: boolean } | boolean;
}

const dbConfig: DatabaseConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "charity_bot",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "password",
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
};

let pool: Pool | null = null;

function initPool() {
  if (!pool) {
    try {
      pool = new Pool(dbConfig);
      console.log("[DB] PostgreSQL pool created");
    } catch (error) {
      console.error("[DB] Failed to initialize PostgreSQL pool:", error);
      pool = null;
    }
  }
}

initPool();

export async function testConnection(): Promise<boolean> {
  // Check if we should use mock database mode
  if (process.env.USE_MOCK_DB === 'true') {
    console.log("[DB] Using mock database mode");
    return true;
  }

  if (!pool) {
    console.error("[DB] Pool not initialized");
    return false;
  }

  try {
    const client = await pool.connect();
    await client.query("SELECT NOW()");
    client.release();
    console.log("[DB] PostgreSQL database connection OK");
    return true;
  } catch (error) {
    console.error("[DB] PostgreSQL database connection failed:", error);
    return false;
  }
}

export async function getClient(): Promise<PoolClient> {
  if (!pool) {
    throw new Error("Database pool not initialized");
  }
  return await pool.connect();
}

export async function query(
  text: string,
  params?: any[]
): Promise<any> {
  if (!pool) {
    throw new Error("Database pool not initialized");
  }
  return await pool.query(text, params);
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function initializeDatabase(): Promise<void> {
  // Check if we should use mock database mode
  if (process.env.USE_MOCK_DB === 'true') {
    console.log("[DB] Skipping schema initialization in mock mode");
    return;
  }

  if (!pool) {
    throw new Error("Database pool not initialized");
  }

  try {
    console.log("[DB] Starting database initialization...");

    // First, ensure schema is applied
    const schemaPath = path.join(__dirname, "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");
    await query(schema);
    console.log("[DB] PostgreSQL schema initialized");

    // CRITICAL: Apply bot_state column migrations BEFORE any bot queries
    // This ensures the columns exist before bots try to access them
    console.log("[DB] Applying bot_state column migrations...");
    
    try {
      // Add botB_enabled column if it doesn't exist
      await query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'bot_state'
            AND column_name = 'botB_enabled'
          ) THEN
            ALTER TABLE bot_state ADD COLUMN botB_enabled BOOLEAN NOT NULL DEFAULT FALSE;
            RAISE NOTICE 'Added botB_enabled column to bot_state';
          ELSE
            RAISE NOTICE 'botB_enabled column already exists';
          END IF;
        END
        $$;
      `);
      console.log("[DB] botB_enabled column migration completed");
    } catch (error) {
      console.error("[DB] Failed to migrate botB_enabled column:", error);
      throw error;
    }

    try {
      // Add botB_triggered column if it doesn't exist
      await query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'bot_state'
            AND column_name = 'botB_triggered'
          ) THEN
            ALTER TABLE bot_state ADD COLUMN botB_triggered BOOLEAN NOT NULL DEFAULT FALSE;
            RAISE NOTICE 'Added botB_triggered column to bot_state';
          ELSE
            RAISE NOTICE 'botB_triggered column already exists';
          END IF;
        END
        $$;
      `);
      console.log("[DB] botB_triggered column migration completed");
    } catch (error) {
      console.error("[DB] Failed to migrate botB_triggered column:", error);
      throw error;
    }

    // Verify columns exist by testing a query
    try {
      await query("SELECT botB_enabled, botB_triggered FROM bot_state LIMIT 1");
      console.log("[DB] Verified bot_state columns exist and are accessible");
    } catch (error) {
      console.error("[DB] Failed to verify bot_state columns:", error);
      throw new Error("Database migration failed - bot_state columns not accessible");
    }

    console.log("[DB] Database initialization completed successfully");
  } catch (error) {
    console.error("[DB] Failed to initialize database:", error);
    throw error;
  }
}

/**
 * Get a balance snapshot by type
 */
export async function getSnapshot(type: string): Promise<{ balance: number; timestamp: Date } | null> {
  try {
    const result = await query(
      "SELECT balance, timestamp FROM balance_snapshots WHERE type = $1 ORDER BY timestamp DESC LIMIT 1",
      [type]
    );
    if (result.rows.length > 0) {
      return {
        balance: parseFloat(result.rows[0].balance),
        timestamp: result.rows[0].timestamp
      };
    }
    return null;
  } catch (error) {
    console.error(`[DB] Failed to get ${type} snapshot:`, error);
    return null;
  }
}

/**
 * Get the period key for snapshot deduplication
 */
function getSnapshotPeriodKey(type: string): string {
  const now = new Date();
  switch (type) {
    case 'daily':
      return now.toISOString().split('T')[0]; // YYYY-MM-DD
    case 'weekly':
      // Get Monday of current week
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now);
      monday.setDate(diff);
      return monday.toISOString().split('T')[0];
    case 'monthly':
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    default:
      return now.toISOString().split('T')[0];
  }
}

/**
 * Save a balance snapshot (upsert - update if exists for period, insert if not)
 */
export async function saveSnapshot(type: string, balance: number): Promise<void> {
  try {
    // For 'start' type, only insert if none exists
    if (type === 'start') {
      const existing = await getSnapshot('start');
      if (existing) {
        console.log(`[DB] Start snapshot already exists, skipping`);
        return;
      }
      await query(
        "INSERT INTO balance_snapshots (balance, type) VALUES ($1, $2)",
        [balance, type]
      );
      console.log(`[DB] Saved ${type} snapshot: ${balance.toFixed(2)}`);
      return;
    }

    // For daily/weekly/monthly, check if one exists for current period
    const periodKey = getSnapshotPeriodKey(type);
    const existingForPeriod = await query(
      `SELECT id FROM balance_snapshots 
       WHERE type = $1 AND DATE(timestamp) = DATE($2)`,
      [type, periodKey]
    );

    if (existingForPeriod.rows.length > 0) {
      // Update existing snapshot
      await query(
        `UPDATE balance_snapshots SET balance = $1, timestamp = NOW() 
         WHERE type = $2 AND DATE(timestamp) = DATE($3)`,
        [balance, type, periodKey]
      );
      console.log(`[DB] Updated ${type} snapshot: ${balance.toFixed(2)}`);
    } else {
      // Insert new snapshot
      await query(
        "INSERT INTO balance_snapshots (balance, type) VALUES ($1, $2)",
        [balance, type]
      );
      console.log(`[DB] Saved ${type} snapshot: ${balance.toFixed(2)}`);
    }
  } catch (error) {
    console.error(`[DB] Failed to save ${type} snapshot:`, error);
    throw error;
  }
}

/**
 * Ensure a start snapshot exists, creating one if needed
 */
export async function ensureStartSnapshot(getCurrentBalance: () => Promise<number>): Promise<number> {
  // Check if we should use mock database mode
  if (process.env.USE_MOCK_DB === 'true') {
    console.log("[DB] Mock mode: using default start balance of 10000");
    return 10000;
  }

  const existing = await getSnapshot('start');
  if (existing) {
    console.log(`[DB] Start snapshot exists: ${existing.balance.toFixed(2)} from ${existing.timestamp}`);
    return existing.balance;
  }
  
  // No start snapshot exists, create one
  const currentBalance = await getCurrentBalance();
  await saveSnapshot('start', currentBalance);
  console.log(`[DB] Created initial start snapshot: ${currentBalance.toFixed(2)}`);
  return currentBalance;
}

/**
 * Get performance data for dashboard
 */
export async function getPerformanceData(): Promise<{
  startingBalance: number | null;
  currentBalance: number | null;
  dailyPL: number | null;
  weeklyPL: number | null;
  monthlyPL: number | null;
  totalReturnPercent: number | null;
}> {
  const startSnapshot = await getSnapshot('start');
  const dailySnapshot = await getSnapshot('daily');
  const weeklySnapshot = await getSnapshot('weekly');
  const monthlySnapshot = await getSnapshot('monthly');

  return {
    startingBalance: startSnapshot?.balance ?? null,
    currentBalance: null, // Will be filled by caller with live balance
    dailyPL: null,
    weeklyPL: null,
    monthlyPL: null,
    totalReturnPercent: null
  };
}

export async function healthCheck(): Promise<{
  status: string;
  timestamp: string;
}> {
  try {
    const result = await query("SELECT NOW() AS timestamp");
    return {
      status: "healthy",
      timestamp: result.rows[0].timestamp,
    };
  } catch (error) {
    console.error("[DB] Health check failed:", error);
    return {
      status: "degraded",
      timestamp: new Date().toISOString(),
    };
  }
}

export async function closeDatabase(): Promise<void> {
  if (!pool) return;

  try {
    await pool.end();
    console.log("[DB] PostgreSQL pool closed");
  } catch (error) {
    console.error("[DB] Error closing DB connection:", error);
  }
}

export function getDatabaseType(): "postgresql" {
  return "postgresql";
}
