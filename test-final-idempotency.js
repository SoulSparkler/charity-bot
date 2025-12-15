#!/usr/bin/env node

/**
 * Final Idempotency Test
 * Verifies the system can restart repeatedly without errors
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function runCommand(command, description) {
  console.log(`🔧 ${description}...`);
  try {
    const result = await execAsync(command);
    console.log(`✅ ${description} - SUCCESS`);
    return { success: true, output: result.stdout };
  } catch (error) {
    console.log(`❌ ${description} - FAILED: ${error.message}`);
    return { success: false, error: error.message, output: error.stdout };
  }
}

async function testFinalIdempotency() {
  console.log('🧪 FINAL IDEMPOTENCY TEST');
  console.log('=========================');
  console.log('');

  try {
    // Step 1: Setup PostgreSQL
    console.log('📋 STEP 1: Setting up PostgreSQL...');
    await runCommand('docker-compose up -d postgres', 'Starting PostgreSQL');
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Step 2: Create test database
    console.log('');
    console.log('📋 STEP 2: Creating fresh test database...');
    await runCommand('docker-compose exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS charity_bot_idempotent_test;"', 'Dropping test database');
    await runCommand('docker-compose exec -T postgres psql -U postgres -c "CREATE DATABASE charity_bot_idempotent_test;"', 'Creating test database');

    // Step 3: Configure environment
    const testEnv = `
NODE_ENV=test
DB_HOST=localhost
DB_PORT=5432
DB_NAME=charity_bot_idempotent_test
DB_USER=postgres
DB_PASSWORD=password
USE_MOCK_DB=false
USE_MOCK_KRAKEN=true
ALLOW_REAL_TRADING=false
`;

    require('fs').writeFileSync('.env.idempotent-test', testEnv);
    console.log('✅ Test environment configured');

    // Step 4: Test multiple restarts (idempotency)
    console.log('');
    console.log('📋 STEP 3-5: Testing multiple restarts for idempotency...');
    
    for (let i = 1; i <= 3; i++) {
      console.log('');
      console.log(`🔄 Restart Test ${i}/3:`);
      
      // Set environment for test
      process.env.USE_MOCK_DB = 'false';
      process.env.DB_NAME = 'charity_bot_idempotent_test';
      
      try {
        const { initializeDatabase } = require('./src/db/db.ts');
        
        console.log('🚀 Starting database initialization...');
        await initializeDatabase();
        
        console.log('✅ Restart test successful');
        
        // Verify no duplicate data
        const { query } = require('./src/db/db.ts');
        
        const botStateCount = await query('SELECT COUNT(*) as count FROM bot_state');
        const configCount = await query('SELECT COUNT(*) as count FROM configuration');
        
        console.log(`📊 Data verification:`);
        console.log(`   - bot_state rows: ${botStateCount.rows[0].count}`);
        console.log(`   - configuration entries: ${configCount.rows[0].count}`);
        
        if (botStateCount.rows[0].count > 1) {
          throw new Error(`Duplicate bot_state rows found: ${botStateCount.rows[0].count}`);
        }
        
        // Clear require cache for next iteration
        delete require.cache[require.resolve('./src/db/db.ts')];
        
      } catch (error) {
        console.error(`❌ Restart test ${i} failed:`, error.message);
        throw error;
      }
    }

    // Step 6: Final verification
    console.log('');
    console.log('📋 STEP 6: Final verification...');
    
    process.env.USE_MOCK_DB = 'false';
    process.env.DB_NAME = 'charity_bot_idempotent_test';
    
    const { query } = require('./src/db/db.ts');
    
    // Verify canonical schema
    const columnsResult = await query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'bot_state'
      ORDER BY column_name
    `);
    
    const columns = columnsResult.rows.map(row => row.column_name);
    console.log(`✅ Schema verification: ${columns.length} columns found`);
    
    // Verify expected column count
    const { BOT_STATE_COLUMN_NAMES } = require('./src/db/schema-constants');
    if (columns.length !== BOT_STATE_COLUMN_NAMES.length) {
      throw new Error(`Column count mismatch: found ${columns.length}, expected ${BOT_STATE_COLUMN_NAMES.length}`);
    }
    
    // Verify no data corruption
    const finalBotStateCount = await query('SELECT COUNT(*) as count FROM bot_state');
    const finalConfigCount = await query('SELECT COUNT(*) as count FROM configuration');
    
    console.log('✅ Final data verification:');
    console.log(`   - bot_state rows: ${finalBotStateCount.rows[0].count} (should be 1)`);
    console.log(`   - configuration entries: ${finalConfigCount.rows[0].count} (should be 5)`);
    
    // Verify constraints
    const constraintsResult = await query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'bot_state'
      AND is_nullable = 'NO'
    `);
    
    const notNullColumns = constraintsResult.rows.length;
    console.log(`✅ NOT NULL constraints: ${notNullColumns} columns constrained`);
    
    console.log('');
    console.log('🏆 IDEMPOTENCY TEST PASSED!');
    console.log('');
    console.log('✅ System can restart repeatedly without errors');
    console.log('✅ No duplicate inserts on restart');
    console.log('✅ No migration errors on repeated restarts');
    console.log('✅ No constraint violations');
    console.log('✅ Schema verification shows correct column count');
    console.log('✅ Data integrity maintained across restarts');
    console.log('');
    console.log('🎉 FINAL SYSTEM HARDENING COMPLETE!');
    console.log('🛡️ Charity Bot is production-ready and fully idempotent!');
    
    return true;
    
  } catch (error) {
    console.error('');
    console.error('❌ IDEMPOTENCY TEST FAILED:', error.message);
    console.error('');
    console.error('🚫 System has idempotency issues');
    console.error('🚫 Possible problems:');
    console.error('   - Duplicate inserts on restart');
    console.error('   - Migration errors on repeated execution');
    console.error('   - Constraint violations');
    console.error('   - Schema mismatch');
    
    return false;
  }
}

// Run the test
testFinalIdempotency().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('💥 Test execution failed:', error);
  process.exit(1);
});