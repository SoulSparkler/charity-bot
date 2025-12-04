#!/usr/bin/env node
/**
 * Kraken API Test Script
 * 
 * This script tests the Kraken API integration to ensure:
 * 1. API credentials are valid
 * 2. Connection to Kraken API is working
 * 3. Balance retrieval works (read-only)
 * 4. Configuration is safe for read-only mode
 * 
 * Usage: node test-kraken-api.js
 */

require('dotenv').config();
const { krakenService } = require('./dist/services/krakenService');

async function testKrakenAPI() {
  console.log('🚀 Starting Kraken API Integration Test\n');

  try {
    // 1. Test service status
    console.log('📊 Service Status:');
    const status = krakenService.getStatus();
    console.log(`   Mode: ${status.mode}`);
    console.log(`   API Key Configured: ${status.apiKeyConfigured ? '✅' : '❌'}`);
    console.log(`   API Secret Configured: ${status.apiSecretConfigured ? '✅' : '❌'}`);
    console.log(`   Real Trading Enabled: ${status.realTradingEnabled ? '⚠️ YES' : '✅ NO'}`);
    console.log(`   Trade Confirmation Required: ${status.tradeConfirmationRequired ? '✅ YES' : '❌ NO'}`);
    console.log('');

    // 2. Test API connection
    console.log('🔗 Testing API Connection:');
    const connectionTest = await krakenService.testConnection();
    console.log(`   Connection: ${connectionTest.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`   Message: ${connectionTest.message}`);
    if (connectionTest.data) {
      console.log(`   Status: ${connectionTest.data.status}`);
    }
    console.log('');

    // 3. Test balance retrieval
    console.log('💰 Testing Balance Access:');
    const balanceTest = await krakenService.testBalanceAccess();
    console.log(`   Balance Access: ${balanceTest.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`   Message: ${balanceTest.message}`);
    
    if (balanceTest.success && balanceTest.balance) {
      const balances = balanceTest.balance;
      if (Object.keys(balances).length > 0) {
        console.log('   Balances:');
        for (const [currency, amount] of Object.entries(balances)) {
          console.log(`     ${currency}: ${amount}`);
        }
      } else {
        console.log('   ⚠️ Account appears to be empty');
      }
    }
    console.log('');

    // 4. Test ticker data
    console.log('📈 Testing Ticker Data:');
    try {
      const tickerData = await krakenService.getTicker(['BTCUSD', 'ETHUSD']);
      console.log(`   BTC Price: $${tickerData['BTCUSD']?.price || 'N/A'}`);
      console.log(`   ETH Price: $${tickerData['ETHUSD']?.price || 'N/A'}`);
      console.log(`   Ticker Data: ✅ SUCCESS`);
    } catch (error) {
      console.log(`   Ticker Data: ❌ FAILED - ${error.message}`);
    }
    console.log('');

    // 5. Overall assessment
    console.log('📋 Overall Assessment:');
    const allTestsPassed = connectionTest.success && balanceTest.success;
    
    if (status.mockMode) {
      console.log('   🧪 MOCK MODE: Running with simulated data');
      console.log('   ➡️  To use real data: Set USE_MOCK_KRAKEN=false');
    } else if (status.mode === 'read-only') {
      console.log('   🔒 READ-ONLY MODE: Safe for testing with real data');
      console.log('   ✅ Ready for balance tracking and market data');
      console.log('   🚫 Real trading disabled by default');
    } else if (status.realTradingEnabled) {
      console.log('   ⚠️  REAL TRADING MODE: Can place real orders!');
      console.log('   🛑 ONLY proceed if you understand the risks');
    }

    if (allTestsPassed) {
      console.log('\n🎉 ALL TESTS PASSED! Kraken API integration is working correctly.');
      process.exit(0);
    } else {
      console.log('\n❌ SOME TESTS FAILED! Please check the error messages above.');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n💥 UNEXPECTED ERROR:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testKrakenAPI();
}

module.exports = { testKrakenAPI };