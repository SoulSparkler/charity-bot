import { Pool, PoolClient } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Import mock database functions
import { 
  mockQuery, 
  testConnection as testMockConnection, 
  initializeDatabase as initializeMockDatabase, 
  closeDatabase as closeMockDatabase,
  healthCheck as mockHealthCheck
} from './mock-db';

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
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'charity_bot',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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

// Get database client with transaction support
export async function getClient(): Promise<PoolClient | null> {
  if (useMockDb || !pool) {
    console.warn('Mock database - transaction support not available');
    return null;
  }
  return await pool.connect();
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
    console.log(`Executed PostgreSQL query in ${duration}ms:`, text.substring(0, 50) + '...');
    return res;
  } catch (error) {
    console.error('PostgreSQL query error:', error);
    console.log('⚠️  Falling back to mock database');
    return await mockQuery(text, params);
  }
}

// Transaction wrapper
export async function withTransaction<T>(
  callback: (client: PoolClient | null) => Promise<T>
): Promise<T> {
  if (useMockDb || !pool) {
    console.warn('Mock database - transaction support not available, executing directly');
    return await callback(null);
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Initialize database schema
export async function initializeDatabase(): Promise<void> {
  if (useMockDb) {
    return await initializeMockDatabase();
  }
  
  if (!pool) {
    console.log('⚠️  Mock database - PostgreSQL schema initialization skipped');
    return await initializeMockDatabase();
  }
  
  try {
    // Read and execute schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await query(schema);
    console.log('✅ PostgreSQL database schema initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize PostgreSQL database schema:', error);
    throw error;
  }
}

// Graceful shutdown
export async function closeDatabase(): Promise<void> {
  if (useMockDb) {
    return await closeMockDatabase();
  }
  
  if (!pool) {
    console.log('⚠️  No PostgreSQL connection to close');
    return await closeMockDatabase();
  }
  
  try {
    await pool.end();
    console.log('✅ PostgreSQL database connection pool closed');
  } catch (error) {
    console.error('❌ Error closing PostgreSQL database connection:', error);
  }
}

// Health check query
export async function healthCheck(): Promise<{ status: string; timestamp: string }> {
  if (useMockDb || !pool) {
    return await mockHealthCheck();
  }
  
  try {
    const result = await query('SELECT NOW() as timestamp');
    return {
      status: 'healthy',
      timestamp: result.rows[0].timestamp
    };
  } catch (error) {
    console.error('PostgreSQL health check failed:', error);
    return {
      status: 'degraded',
      timestamp: new Date().toISOString()
    };
  }
}

// Export database type info
export function getDatabaseType(): 'postgresql' | 'mock' {
  return (useMockDb || !pool) ? 'mock' : 'postgresql';
}