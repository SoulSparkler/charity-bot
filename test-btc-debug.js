// Test script to debug BTC balance retrieval from Kraken
// This will show the raw API responses and help diagnose the issue

const { krakenService } = require('./dist/services/krakenService');

async function testKrakenBalances() {
  console.log('🔍 Testing Kraken Balance Retrieval...\n');
  
  try {
    // Use the singleton instance
    
    console.log('📡 Getting raw balances from Kraken...');
    const balances = await krakenService.getBalances();
    
    console.log('\n📊 RAW BALANCES FROM KRAKEN:');
    console.log(JSON.stringify(balances, null, 2));
    
    console.log('\n🎯 Getting portfolio balances...');
    const portfolio = await krakenService.getPortfolioBalances();
    
    console.log('\n💼 PORTFOLIO BALANCES:');
    console.log(JSON.stringify(portfolio, null, 2));
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

// Run the test
testKrakenBalances();