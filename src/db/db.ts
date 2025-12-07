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
  if (!pool) {
    throw new Error("Database pool not initialized");
  }

  try {
    const schemaPath = path.join(__dirname, "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");
    await query(schema);
    console.log("[DB] PostgreSQL schema initialized");
  } catch (error) {
    console.error("[DB] Failed to initialize schema:", error);
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
 * Save a balance snapshot
 */
export async function saveSnapshot(type: string, balance: number): Promise<void> {
  try {
    await query(
      "INSERT INTO balance_snapshots (balance, type) VALUES ($1, $2)",
      [balance, type]
    );
    console.log(`[DB] Saved ${type} snapshot: ${balance.toFixed(2)}`);
  } catch (error) {
    console.error(`[DB] Failed to save ${type} snapshot:`, error);
    throw error;
  }
}

/**
 * Ensure a start snapshot exists, creating one if needed
 */
export async function ensureStartSnapshot(getCurrentBalance: () => Promise<number>): Promise<number> {
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
