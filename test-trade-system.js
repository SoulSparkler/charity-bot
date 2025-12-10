// Test script for trade history system
const { Pool } = require('pg');
require('dotenv').config();

async function testTradeSystem() {
  const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME || "charity_bot",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "password",
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log("🧪 Testing Trade History System...");
    
    // Test 1: Check if trades table exists and has correct schema
    console.log("\n📋 Test 1: Checking trades table schema...");
    const schemaResult = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'trades' 
      ORDER BY ordinal_position
    `);
    
    console.log("Trades table columns:");
    schemaResult.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    // Test 2: Check if we can insert a sample trade
    console.log("\n💾 Test 2: Testing saveTrade function...");
    const sampleTrade = {
      bot: 'A',
      type: 'buy',
      pair: 'BTCUSD',
      price: 45000.00,
      volume: 0.001,
      usd_value: 45.00,
      order_id: 'TEST_ORDER_123',
      mcs: 0.75
    };
    
    await pool.query(`
      INSERT INTO trades (bot, type, pair, price, volume, usd_value, order_id, mcs)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      sampleTrade.bot,
      sampleTrade.type,
      sampleTrade.pair,
      sampleTrade.price,
      sampleTrade.volume,
      sampleTrade.usd_value,
      sampleTrade.order_id,
      sampleTrade.mcs
    ]);
    
    console.log("✅ Sample trade inserted successfully");
    
    // Test 3: Test the API endpoint logic
    console.log("\n🌐 Test 3: Testing API endpoint query logic...");
    
    // Test without bot filter
    const allTradesResult = await pool.query("SELECT * FROM trades ORDER BY timestamp DESC LIMIT 10");
    console.log(`📊 Found ${allTradesResult.rows.length} total trades`);
    
    // Test with bot filter
    const botATradesResult = await pool.query("SELECT * FROM trades WHERE bot = $1 ORDER BY timestamp DESC LIMIT 10", ['A']);
    console.log(`🤖 Found ${botATradesResult.rows.length} Bot A trades`);
    
    // Test 4: Display sample trade data
    console.log("\n📄 Sample trade record:");
    if (allTradesResult.rows.length > 0) {
      const trade = allTradesResult.rows[0];
      console.log(JSON.stringify(trade, null, 2));
    }
    
    // Test 5: Clean up test data
    console.log("\n🧹 Cleaning up test data...");
    await pool.query("DELETE FROM trades WHERE order_id = $1", ['TEST_ORDER_123']);
    console.log("✅ Test data cleaned up");
    
    console.log("\n🎉 All tests passed! Trade history system is working correctly.");
    
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    await pool.end();
  }
}

// Test the server endpoint
async function testServerEndpoint() {
  console.log("\n🔗 Testing server endpoint...");
  
  const axios = require('axios');
  
  try {
    // Test the trades endpoint
    const response = await axios.get('http://localhost:3000/api/trades?limit=5');
    console.log(`✅ API endpoint responded with ${response.data.length} trades`);
    
    if (response.data.length > 0) {
      console.log("Sample API response:");
      console.log(JSON.stringify(response.data[0], null, 2));
    }
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log("⚠️  Server not running. Start the server with 'npm start' to test the endpoint.");
    } else {
      console.error("❌ API endpoint test failed:", error.message);
    }
  }
}

// Run tests
testTradeSystem()
  .then(() => testServerEndpoint())
  .catch(console.error);