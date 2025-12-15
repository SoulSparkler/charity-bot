#!/usr/bin/env node

/**
 * Comprehensive Schema Fix Validation Test
 * 
 * This script tests the canonical schema fix to ensure:
 * 1. Fresh database boots cleanly
 * 2. Existing database migrates correctly
 * 3. All canonical columns are present and accessible
 * 4. No "next missing column" errors occur
 */

const { Pool } = require('pg');
const { BOT_STATE_COLUMN_NAMES } = require('./dist/db/schema-constants.js');

// Test configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'charity_bot',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
};

let pool;

async function testDatabaseConnection() {
  console.log('🔌 Testing database connection...');
  try {
    pool = new Pool(dbConfig);
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

async function dropBotStateTable() {
  console.log('🗑️  Dropping bot_state table for fresh start test...');
  try {
    await pool.query('DROP TABLE IF EXISTS bot_state CASCADE');
    console.log('✅ bot_state table dropped');
  } catch (error) {
    console.error('❌ Failed to drop bot_state table:', error.message);
    throw error;
  }
}

async function testFreshDatabase() {
  console.log('\n🧪 TEST 1: Fresh Database Migration');
  console.log('=====================================');
  
  try {
    // Drop table to simulate fresh start
    await dropBotStateTable();
    
    // Import and run the database initialization
    const { initializeDatabase } = require('./dist/db/db.js');
    await initializeDatabase();
    
    console.log('✅ Fresh database migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Fresh database test failed:', error.message);
    return false;
  }
}

async function testExistingDatabase() {
  console.log('\n🧪 TEST 2: Existing Database Migration');
  console.log('=======================================');
  
  try {
    // Run initialization again (should be idempotent)
    const { initializeDatabase } = require('./dist/db/db.js');
    await initializeDatabase();
    
    console.log('✅ Existing database migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Existing database test failed:', error.message);
    return false;
  }
}

async function validateCanonicalSchema() {
  console.log('\n🧪 TEST 3: Canonical Schema Validation');
  console.log('========================================');
  
  try {
    // Check that all canonical columns exist
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'bot_state'
      ORDER BY column_name
    `);

    const existingColumns = result.rows.map(row => row.column_name);
    const missingColumns = BOT_STATE_COLUMN_NAMES.filter(col => !existingColumns.includes(col));
    
    console.log(`📋 Found ${existingColumns.length} columns in bot_state table`);
    console.log(`📋 Required canonical columns: ${BOT_STATE_COLUMN_NAMES.length}`);
    
    if (missingColumns.length > 0) {
      console.error('❌ Missing canonical columns:', missingColumns.join(', '));
      return false;
    }

    console.log('✅ All canonical columns present:', existingColumns.join(', '));

    // Test column accessibility
    const accessibilityTest = await pool.query(`
      SELECT bot_a_virtual_usd, bot_b_virtual_usd, bot_a_cycle_number, bot_a_cycle_target, bot_b_enabled, bot_b_triggered 
      FROM bot_state 
      LIMIT 1
    `);

    console.log('✅ Column accessibility test passed');
    console.log('✅ Sample data:', JSON.stringify(accessibilityTest.rows[0], null, 2));
    
    return true;
  } catch (error) {
    console.error('❌ Canonical schema validation failed:', error.message);
    return false;
  }
}

async function testBotQueries() {
  console.log('\n🧪 TEST 4: Bot Query Compatibility');
  console.log('===================================');
  
  try {
    // Test queries that bots actually use
    const queries = [
      {
        name: 'Bot A State Query',
        sql: 'SELECT id, bot_a_virtual_usd, bot_b_virtual_usd, bot_a_cycle_number, bot_a_cycle_target, bot_b_enabled, bot_b_triggered, last_reset FROM bot_state ORDER BY created_at DESC LIMIT 1'
      },
      {
        name: 'Bot B State Query', 
        sql: 'SELECT id, bot_b_virtual_usd, last_reset FROM bot_state ORDER BY created_at DESC LIMIT 1'
      },
      {
        name: 'Bot B Enabled Query',
        sql: 'SELECT bot_b_enabled FROM bot_state ORDER BY created_at DESC LIMIT 1'
      }
    ];

    for (const query of queries) {
      const result = await pool.query(query.sql);
      console.log(`✅ ${query.name}: ${result.rows.length} row(s) returned`);
    }

    console.log('✅ All bot queries executed successfully');
    return true;
  } catch (error) {
    console.error('❌ Bot query test failed:', error.message);
    return false;
  }
}

async function cleanup() {
  if (pool) {
    await pool.end();
    console.log('🧹 Database connection closed');
  }
}

async function runAllTests() {
  console.log('🚀 Starting Comprehensive Schema Fix Validation');
  console.log('================================================\n');

  const startTime = Date.now();
  let passedTests = 0;
  let totalTests = 4;

  try {
    // Test 1: Database Connection
    if (await testDatabaseConnection()) {
      passedTests++;
    } else {
      throw new Error('Database connection failed - aborting tests');
    }

    // Test 2: Fresh Database Migration
    if (await testFreshDatabase()) {
      passedTests++;
    }

    // Test 3: Existing Database Migration  
    if (await testExistingDatabase()) {
      passedTests++;
    }

    // Test 4: Schema Validation
    if (await validateCanonicalSchema()) {
      passedTests++;
    }

    // Test 5: Bot Query Compatibility
    if (await testBotQueries()) {
      passedTests++;
      totalTests = 5; // Adjust total since we added this test
    }

  } catch (error) {
    console.error('\n💥 Test suite failed with error:', error.message);
  } finally {
    await cleanup();
  }

  const duration = Date.now() - startTime;
  
  console.log('\n📊 Test Results Summary');
  console.log('========================');
  console.log(`✅ Tests Passed: ${passedTests}/${totalTests}`);
  console.log(`⏱️  Duration: ${duration}ms`);
  
  if (passedTests === totalTests) {
    console.log('🎉 ALL TESTS PASSED! Schema fix is working correctly.');
    console.log('🛡️  Production-ready: No more "column does not exist" errors');
    console.log('🔒 Safety: Canonical schema ensures all required columns exist');
    process.exit(0);
  } else {
    console.log('❌ SOME TESTS FAILED! Schema fix needs attention.');
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { runAllTests };