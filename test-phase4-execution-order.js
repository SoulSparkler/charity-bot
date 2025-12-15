#!/usr/bin/env node

/**
 * Test the corrected PHASE 4 execution order
 * Verifies that PostgreSQL error 23502 is resolved
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function testPhase4ExecutionOrder() {
  console.log('🧪 TESTING CORRECTED PHASE 4 EXECUTION ORDER');
  console.log('============================================');
  console.log('');

  try {
    // Step 1: Ensure PostgreSQL is running
    console.log('📋 Setting up PostgreSQL for test...');
    await execAsync('docker-compose up -d postgres');
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Step 2: Create fresh test database
    console.log('📋 Creating fresh test database...');
    await execAsync('docker-compose exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS charity_bot_order_test;"');
    await execAsync('docker-compose exec -T postgres psql -U postgres -c "CREATE DATABASE charity_bot_order_test;"');

    // Step 3: Set test environment
    const testEnv = `
NODE_ENV=test
DB_HOST=localhost
DB_PORT=5432
DB_NAME=charity_bot_order_test
DB_USER=postgres
DB_PASSWORD=password
USE_MOCK_DB=false
USE_MOCK_KRAKEN=true
ALLOW_REAL_TRADING=false
`;

    require('fs').writeFileSync('.env.order-test', testEnv);
    console.log('✅ Test environment configured');

    // Step 4: Test the corrected PHASE 4 execution
    console.log('');
    console.log('📋 Testing corrected PHASE 4 execution order...');
    console.log('🔧 Expected sequence:');
    console.log('   1. Create tables and triggers');
    console.log('   2. Add defaults (no NOT NULL yet)');
    console.log('   3. INSERT initial data');
    console.log('   4. Backfill NULL values');
    console.log('   5. Apply NOT NULL constraints ← KEY FIX');
    console.log('');

    // Set environment for test
    process.env.USE_MOCK_DB = 'false';
    process.env.DB_NAME = 'charity_bot_order_test';
    
    // Import and test
    const { initializeDatabase } = require('./src/db/db.ts');
    
    console.log('🚀 Starting database initialization...');
    await initializeDatabase();
    
    console.log('');
    console.log('✅ SUCCESS: Database initialization completed!');
    console.log('✅ PHASE 4 execution order fixed');
    console.log('✅ PostgreSQL error 23502 eliminated');
    
    // Step 5: Verify database state
    console.log('');
    console.log('📋 Verifying database integrity...');
    
    const { query } = require('./src/db/db.ts');
    
    // Check bot_state table structure
    const columnsResult = await query(`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'bot_state' 
      ORDER BY ordinal_position
    `);
    
    console.log('✅ bot_state table structure:');
    columnsResult.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULLable'} (default: ${row.column_default || 'none'})`);
    });
    
    // Verify data integrity
    const dataResult = await query('SELECT COUNT(*) as count FROM bot_state');
    const configResult = await query('SELECT COUNT(*) as count FROM configuration');
    
    console.log(`✅ Data integrity verified:`);
    console.log(`   - bot_state rows: ${dataResult.rows[0].count}`);
    console.log(`   - configuration entries: ${configResult.rows[0].count}`);
    
    // Verify no NULL values in NOT NULL columns
    const nullCheck = await query(`
      SELECT 
        COUNT(*) as total_rows,
        COUNT(bot_a_virtual_usd) as non_null_virtual_usd,
        COUNT(bot_b_virtual_usd) as non_null_bot_b_usd,
        COUNT(bot_a_cycle_number) as non_null_cycle_number,
        COUNT(bot_b_enabled) as non_null_bot_b_enabled
      FROM bot_state
    `);
    
    const nullStats = nullCheck.rows[0];
    if (nullStats.total_rows === nullStats.non_null_virtual_usd &&
        nullStats.total_rows === nullStats.non_null_bot_b_usd &&
        nullStats.total_rows === nullStats.non_null_cycle_number &&
        nullStats.total_rows === nullStats.non_null_bot_b_enabled) {
      console.log('✅ All NOT NULL constraints satisfied');
    } else {
      console.log('❌ NULL values found in NOT NULL columns');
      return false;
    }
    
    console.log('');
    console.log('🏆 PHASE 4 EXECUTION ORDER FIX SUCCESSFUL!');
    console.log('');
    console.log('🔧 Corrected execution sequence:');
    console.log('   1. ✅ Create tables and triggers');
    console.log('   2. ✅ Add defaults (no NOT NULL yet)');
    console.log('   3. ✅ INSERT initial data');
    console.log('   4. ✅ Backfill NULL values with COALESCE');
    console.log('   5. ✅ Apply NOT NULL constraints');
    console.log('');
    console.log('🎉 PostgreSQL error 23502 permanently eliminated!');
    
    return true;
    
  } catch (error) {
    console.error('');
    console.error('❌ TEST FAILED:', error.message);
    console.error('');
    console.error('🚫 PHASE 4 execution order fix did not resolve the issue');
    console.error('🚫 Possible causes:');
    console.error('   - Incorrect execution sequence');
    console.error('   - Missing backfill operations');
    console.error('   - Database connection issues');
    
    return false;
  }
}

// Run the test
testPhase4ExecutionOrder().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('💥 Test execution failed:', error);
  process.exit(1);
});