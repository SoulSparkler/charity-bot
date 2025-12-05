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

// Database configuration
const dbConfig: DatabaseConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "charity_bot",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "password",
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
};

// ALWAYS real DB now – no mock mode
let pool: Pool | null = null;

try {
  pool = new Pool(dbConfig);
  console.log("📦 PostgreSQL pool created");
} catch (error) {
  console.error("❌ Failed to create PostgreSQL pool:", error);
  pool = null;
}

// Test database connection
export async function testConnection(): Promise<boolean> {
  if (!pool) {
    console.error("❌ DB pool not initialized
