import { Pool, PoolClient } from "pg";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import { BOT_STATE_REQUIRED_COLUMNS, BOT_STATE_COLUMN_NAMES, validateBotStateSchema } from "./schema-constants";

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

/**
 * Comprehensive database initialization using canonical schema
 * This function ensures ALL required columns exist before any bot operations
 */
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
    console.log("[DB] Starting comprehensive database initialization...");

    // Step 1: Apply base schema
    const schemaPath = path.join(__dirname, "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");
    await query(schema);
    console.log("[DB] Base PostgreSQL schema applied");

    // Step 2: Comprehensive bot_state column migration using canonical schema
    console.log("[DB] Applying comprehensive bot_state column migrations...");
    await applyComprehensiveBotStateMigration();

    // Step 3: Verify canonical schema completeness
    console.log("[DB] Verifying canonical schema completeness...");
    await verifyCanonicalSchema();

    console.log("[DB] ✅ Database initialization completed successfully - CANONICAL SCHEMA VERIFIED");
  } catch (error) {
    console.error("[DB] ❌ Failed to initialize database:", error);
    console.error("[DB] 🚫 BLOCKING TRADING - Database schema incomplete");
    throw error;
  }
}

/**
 * Apply comprehensive bot_state migration covering ALL canonical columns
 */
async function applyComprehensiveBotStateMigration(): Promise<void> {
  const migrationSQL = `
    DO $$
    DECLARE
      column_record RECORD;
      missing_columns TEXT[] := ARRAY[]::TEXT[];
    BEGIN
      RAISE NOTICE 'Starting comprehensive bot_state migration...';
      
      -- Create table if it doesn't exist with canonical schema
      IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bot_state') THEN
        RAISE NOTICE 'Creating bot_state table with canonical schema...';
        CREATE TABLE bot_state (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          bot_a_virtual_usd NUMERIC(12, 2) NOT NULL DEFAULT 230.00,
          bot_b_virtual_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
          bot_a_cycle_number INTEGER NOT NULL DEFAULT 1,
          bot_a_cycle_target NUMERIC(12, 2) NOT NULL DEFAULT 200.00,
          bot_b_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          bot_b_triggered BOOLEAN NOT NULL DEFAULT FALSE,
          last_reset TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        RAISE NOTICE 'Created bot_state table with canonical schema';
      END IF;

      -- Migrate each canonical column
      ${BOT_STATE_REQUIRED_COLUMNS.map(col => `
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'bot_state'
          AND column_name = '${col.name}'
        ) THEN
          ALTER TABLE bot_state ADD COLUMN ${col.name} ${col.type} NOT NULL DEFAULT ${col.default};
          RAISE NOTICE 'Added column: ${col.name}';
          missing_columns := array_append(missing_columns, '${col.name}');
        ELSE
          RAISE NOTICE 'Column already exists: ${col.name}';
        END IF;
      `).join('\n      ')}

      -- Ensure at least one row exists
      IF NOT EXISTS (SELECT 1 FROM bot_state) THEN
        INSERT INTO bot_state (
          bot_a_virtual_usd, bot_b_virtual_usd, bot_a_cycle_number,
          bot_a_cycle_target, bot_b_enabled, bot_b_triggered
        ) VALUES (230.00, 0.00, 1, 200.00, FALSE, FALSE);
        RAISE NOTICE 'Inserted initial bot_state row';
      END IF;

      -- Report migration results
      IF array_length(missing_columns, 1) > 0 THEN
        RAISE NOTICE 'Migration completed. Added columns: %', array_to_string(missing_columns, ', ');
      ELSE
        RAISE NOTICE 'Migration completed. All canonical columns already existed.';
      END IF;
    END
    $$;
  `;

  try {
    await query(migrationSQL);
    console.log("[DB] ✅ Comprehensive bot_state migration completed");
  } catch (error) {
    console.error("[DB] ❌ Comprehensive bot_state migration failed:", error);
    throw new Error(`Bot state migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Verify that ALL canonical columns exist and are accessible
 */
async function verifyCanonicalSchema(): Promise<void> {
  try {
    // Get all existing columns in bot_state table
    const existingColumnsResult = await query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'bot_state'
      ORDER BY column_name
    `);

    const existingColumns = existingColumnsResult.rows.map((row: any) => row.column_name);
    
    // Validate against canonical schema
    const validation = validateBotStateSchema(existingColumns);
    
    if (!validation.isValid) {
      const missingColumns = validation.missingColumns.join(', ');
      throw new Error(`Canonical schema validation failed. Missing columns: ${missingColumns}`);
    }

    console.log(`[DB] ✅ Canonical schema verification passed: ${existingColumns.length}/${BOT_STATE_COLUMN_NAMES.length} columns present`);

    // Test accessibility of critical columns
    const criticalColumns = ['bot_a_virtual_usd', 'bot_b_virtual_usd', 'bot_b_enabled', 'bot_b_triggered'];
    const accessibilityTest = criticalColumns.every(col => existingColumns.includes(col));
    
    if (!accessibilityTest) {
      throw new Error(`Critical column accessibility test failed. Expected: ${criticalColumns.join(', ')}, Found: ${existingColumns.filter(col => criticalColumns.includes(col)).join(', ')}`);
    }

    console.log("[DB] ✅ Critical column accessibility test passed");
    
    // Test a real query that bots will use
    await query("SELECT bot_a_virtual_usd, bot_b_virtual_usd, bot_a_cycle_number, bot_a_cycle_target, bot_b_enabled, bot_b_triggered FROM bot_state LIMIT 1");
    console.log("[DB] ✅ Bot query test passed - schema ready for trading");

  } catch (error) {
    console.error("[DB] ❌ Canonical schema verification failed:", error);
    throw new Error(`Schema verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
