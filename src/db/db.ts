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
 * STRICT PHASE database initialization using canonical schema
 *
 * CRITICAL: This function is split into strict phases to prevent
 * execution-order bugs where INSERT/UPDATE operations reference
 * columns before they are guaranteed to exist.
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
    console.log("[DB] Starting STRICT PHASE database initialization...");
    console.log("[DB] 🚫 NO INSERT/UPDATE OPERATIONS UNTIL PHASE 3 COMPLETES");

    // PHASE 1: Apply base schema (CREATE TABLE only, no data operations)
    await executePhase1CreateSchema();
    
    // PHASE 2: Add ALL canonical columns with existence checks
    await executePhase2AddColumns();
    
    // PHASE 3: Verify ALL required columns exist (CRITICAL BARRIER)
    await executePhase3VerifySchema();
    
    // PHASE 4: ONLY NOW can we insert initial data (safe because schema is verified)
    await executePhase4InitializeData();

    console.log("[DB] ✅ STRICT PHASE initialization completed successfully");
    console.log("[DB] 🛡️ SCHEMA VERIFIED - SAFE TO START TRADING");
  } catch (error) {
    console.error("[DB] ❌ STRICT PHASE initialization failed:", error);
    console.error("[DB] 🚫 BLOCKING TRADING - Schema initialization incomplete");
    throw error;
  }
}

/**
 * PHASE 1: Create base schema (CREATE TABLE only, NO data operations)
 */
async function executePhase1CreateSchema(): Promise<void> {
  console.log("[DB] 📋 PHASE 1: Creating base schema...");
  
  try {
    const schemaPath = path.join(__dirname, "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");
    await query(schema);
    console.log("[DB] ✅ PHASE 1 COMPLETE: Base schema applied");
  } catch (error) {
    console.error("[DB] ❌ PHASE 1 FAILED: Base schema creation failed:", error);
    throw error;
  }
}

/**
 * PHASE 2: Add ALL canonical columns with existence checks
 * CRITICAL: NO INSERT/UPDATE operations in this phase
 */
async function executePhase2AddColumns(): Promise<void> {
  console.log("[DB] 🔧 PHASE 2: Adding canonical columns...");
  
  try {
    // Create table if missing (without any data operations)
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bot_state') THEN
          RAISE NOTICE 'Creating bot_state table structure...';
          CREATE TABLE bot_state (
            id UUID PRIMARY KEY,
            bot_a_virtual_usd NUMERIC(12, 2),
            bot_b_virtual_usd NUMERIC(12, 2),
            bot_a_cycle_number INTEGER,
            bot_a_cycle_target NUMERIC(12, 2),
            bot_b_enabled BOOLEAN,
            bot_b_triggered BOOLEAN,
            last_reset TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE,
            updated_at TIMESTAMP WITH TIME ZONE
          );
          RAISE NOTICE 'Created bot_state table structure';
        ELSE
          RAISE NOTICE 'bot_state table already exists';
        END IF;
      END
      $$;
    `);

    // Add each canonical column if missing (without defaults to avoid conflicts)
    for (const column of BOT_STATE_REQUIRED_COLUMNS) {
      if (column.name !== 'id') { // Skip id as it's primary key
        await query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'bot_state'
              AND column_name = '${column.name}'
            ) THEN
              ALTER TABLE bot_state ADD COLUMN ${column.name} ${column.type};
              RAISE NOTICE 'Added column: ${column.name}';
            ELSE
              RAISE NOTICE 'Column already exists: ${column.name}';
            END IF;
          END
          $$;
        `);
      }
    }

    console.log("[DB] ✅ PHASE 2 COMPLETE: All canonical columns added");
  } catch (error) {
    console.error("[DB] ❌ PHASE 2 FAILED: Column addition failed:", error);
    throw error;
  }
}

/**
 * PHASE 3: Verify ALL required columns exist (CRITICAL BARRIER)
 * NO FURTHER OPERATIONS ALLOWED UNTIL THIS PASSES
 */
async function executePhase3VerifySchema(): Promise<void> {
  console.log("[DB] 🔍 PHASE 3: Verifying canonical schema...");
  
  try {
    // Get all existing columns
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
      throw new Error(`CRITICAL: Canonical schema validation failed. Missing columns: ${missingColumns}`);
    }

    console.log(`[DB] ✅ PHASE 3 VERIFIED: ${existingColumns.length}/${BOT_STATE_COLUMN_NAMES.length} canonical columns present`);

    // Test accessibility with real bot query
    await query(`
      SELECT bot_a_virtual_usd, bot_b_virtual_usd, bot_a_cycle_number, bot_a_cycle_target, bot_b_enabled, bot_b_triggered
      FROM bot_state
      LIMIT 1
    `);
    
    console.log("[DB] ✅ PHASE 3 COMPLETE: Schema verification passed - TRADING NOW SAFE");
  } catch (error) {
    console.error("[DB] ❌ PHASE 3 FAILED: Schema verification failed:", error);
    console.error("[DB] 🚫 BLOCKING ALL OPERATIONS - Schema incomplete");
    throw error;
  }
}

/**
 * PHASE 4: Initialize data (ONLY after schema verification passes)
 * CRITICAL: Correct execution order to avoid PostgreSQL error 23502
 */
async function executePhase4InitializeData(): Promise<void> {
  console.log("[DB] 📊 PHASE 4: Initializing data...");
  
  try {
    // Step 1: Create configuration table if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS configuration (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Step 2: Create triggers for both tables
    await query(`
      DROP TRIGGER IF EXISTS update_configuration_updated_at ON configuration;
      CREATE TRIGGER update_configuration_updated_at
          BEFORE UPDATE ON configuration
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    `);

    await query(`
      DROP TRIGGER IF EXISTS update_bot_state_updated_at ON bot_state;
      CREATE TRIGGER update_bot_state_updated_at
          BEFORE UPDATE ON bot_state
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    `);

    // Step 3: Add defaults (but NOT constraints yet)
    await query(`
      DO $$
      BEGIN
        -- Add defaults only (no NOT NULL constraints yet)
        ALTER TABLE bot_state ALTER COLUMN id SET DEFAULT uuid_generate_v4();
        ALTER TABLE bot_state ALTER COLUMN bot_a_virtual_usd SET DEFAULT 230.00;
        ALTER TABLE bot_state ALTER COLUMN bot_b_virtual_usd SET DEFAULT 0.00;
        ALTER TABLE bot_state ALTER COLUMN bot_a_cycle_number SET DEFAULT 1;
        ALTER TABLE bot_state ALTER COLUMN bot_a_cycle_target SET DEFAULT 200.00;
        ALTER TABLE bot_state ALTER COLUMN bot_b_enabled SET DEFAULT FALSE;
        ALTER TABLE bot_state ALTER COLUMN bot_b_triggered SET DEFAULT FALSE;
        ALTER TABLE bot_state ALTER COLUMN last_reset SET DEFAULT NOW();
        ALTER TABLE bot_state ALTER COLUMN created_at SET DEFAULT NOW();
        ALTER TABLE bot_state ALTER COLUMN updated_at SET DEFAULT NOW();

        RAISE NOTICE 'Added defaults only (NOT NULL constraints pending)';
      END
      $$;
    `);

    // Step 4: INSERT initial bot state data (if doesn't exist)
    await query(`
      INSERT INTO bot_state (
        bot_a_virtual_usd, bot_b_virtual_usd, bot_a_cycle_number,
        bot_a_cycle_target, bot_b_enabled, bot_b_triggered
      )
      SELECT 230.00, 0.00, 1, 200.00, FALSE, FALSE
      WHERE NOT EXISTS (SELECT 1 FROM bot_state);
    `);

    // Step 5: Backfill any NULL values to defaults BEFORE setting NOT NULL constraints
    await query(`
      UPDATE bot_state 
      SET 
        bot_a_virtual_usd = COALESCE(bot_a_virtual_usd, 230.00),
        bot_b_virtual_usd = COALESCE(bot_b_virtual_usd, 0.00),
        bot_a_cycle_number = COALESCE(bot_a_cycle_number, 1),
        bot_a_cycle_target = COALESCE(bot_a_cycle_target, 200.00),
        bot_b_enabled = COALESCE(bot_b_enabled, FALSE),
        bot_b_triggered = COALESCE(bot_b_triggered, FALSE),
        last_reset = COALESCE(last_reset, NOW()),
        created_at = COALESCE(created_at, NOW()),
        updated_at = COALESCE(updated_at, NOW())
      WHERE bot_a_virtual_usd IS NULL 
         OR bot_b_virtual_usd IS NULL 
         OR bot_a_cycle_number IS NULL 
         OR bot_a_cycle_target IS NULL 
         OR bot_b_enabled IS NULL 
         OR bot_b_triggered IS NULL 
         OR last_reset IS NULL 
         OR created_at IS NULL 
         OR updated_at IS NULL;
    `);

    // Step 6: Only NOW set NOT NULL constraints (after backfilling NULLs)
    await query(`
      DO $$
      BEGIN
        -- Set NOT NULL constraints ONLY after backfilling
        ALTER TABLE bot_state ALTER COLUMN id SET NOT NULL;
        ALTER TABLE bot_state ALTER COLUMN bot_a_virtual_usd SET NOT NULL;
        ALTER TABLE bot_state ALTER COLUMN bot_b_virtual_usd SET NOT NULL;
        ALTER TABLE bot_state ALTER COLUMN bot_a_cycle_number SET NOT NULL;
        ALTER TABLE bot_state ALTER COLUMN bot_a_cycle_target SET NOT NULL;
        ALTER TABLE bot_state ALTER COLUMN bot_b_enabled SET NOT NULL;
        ALTER TABLE bot_state ALTER COLUMN bot_b_triggered SET NOT NULL;
        ALTER TABLE bot_state ALTER COLUMN last_reset SET NOT NULL;
        ALTER TABLE bot_state ALTER COLUMN created_at SET NOT NULL;
        ALTER TABLE bot_state ALTER COLUMN updated_at SET NOT NULL;

        RAISE NOTICE 'NOT NULL constraints applied after backfilling';
      END
      $$;
    `);

    // Step 7: Insert default configuration values (moved from schema.sql)
    await query(`
      INSERT INTO configuration (key, value, description) VALUES 
          ('cycle_seed_amount', '30', 'Seed amount for new Bot A cycles'),
          ('botB_transfer_amount', '200', 'Amount transferred from Bot A to Bot B per cycle'),
          ('max_daily_trades_botA', '6', 'Maximum daily trades for Bot A when MCS >= 0.8'),
          ('min_mcs_for_trading', '0.4', 'Minimum MCS required for Bot A trading'),
          ('botB_min_mcs', '0.5', 'Minimum MCS required for Bot B trading')
      ON CONFLICT (key) DO NOTHING;
    `);

    console.log("[DB] ✅ PHASE 4 COMPLETE: Data initialization completed safely");
  } catch (error) {
    console.error("[DB] ❌ PHASE 4 FAILED: Data initialization failed:", error);
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
