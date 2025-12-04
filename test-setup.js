// Test script to verify database and mock setup
const { testConnection, getDatabaseType, query } = require('./src/db/db.js');

async function testSetup() {
  console.log('🧪 Testing Charity Bot Setup...\n');

  try {
    // Test database connection
    console.log('1. Testing database connection...');
    const dbConnected = await testConnection();
    console.log(`   Database connected: ${dbConnected ? '✅' : '❌'}`);

    // Test database type
    console.log('\n2. Testing database type...');
    const dbType = getDatabaseType();
    console.log(`   Database type: ${dbType}`);

    // Test basic query
    console.log('\n3. Testing basic query...');
    const result = await query('SELECT NOW() as timestamp');
    console.log(`   Query result: ${JSON.stringify(result.rows[0], null, 2)}`);

    console.log('\n✅ All tests completed successfully!');
    console.log('\n📋 Setup Summary:');
    console.log(`   • Database Type: ${dbType}`);
    console.log(`   • Connection: ${dbConnected ? 'Working' : 'Failed'}`);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

testSetup();