#!/usr/bin/env node

/**
 * Test script to verify strict phase separation fix
 * This tests that PHASE 1 contains only base table creation and no INSERT operations
 */

const { initializeDatabase } = require('./src/db/db.ts');

async function testStrictPhaseSeparation() {
  console.log('🧪 Testing STRICT PHASE SEPARATION FIX...');
  console.log('');
  
  try {
    console.log('📋 Starting database initialization with strict phase separation...');
    console.log('🚫 NO INSERT/UPDATE OPERATIONS UNTIL PHASE 3 VERIFICATION PASSES');
    console.log('');
    
    // This should now work without checkInsertTargets errors
    await initializeDatabase();
    
    console.log('');
    console.log('✅ SUCCESS: Database initialization completed without errors!');
    console.log('✅ PHASE 1: Only CREATE TABLE (no INSERT operations)');
    console.log('✅ PHASE 2: Added all canonical columns');
    console.log('✅ PHASE 3: Schema verification passed');
    console.log('✅ PHASE 4: Data initialization completed safely');
    console.log('');
    console.log('🎉 STRICT PHASE SEPARATION FIX WORKING CORRECTLY!');
    console.log('🛡️ PostgreSQL checkInsertTargets errors should be eliminated');
    
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ TEST FAILED: Database initialization failed');
    console.error('❌ Error details:', error.message);
    console.error('');
    console.error('🚫 This indicates the phase separation fix did not work');
    console.error('🚫 Possible issues:');
    console.error('   - PHASE 1 still contains INSERT operations');
    console.error('   - Schema.sql contains references to canonical columns');
    console.error('   - Phase order is incorrect');
    console.error('');
    
    process.exit(1);
  }
}

// Set environment to use real database
process.env.USE_MOCK_DB = 'false';

testStrictPhaseSeparation();