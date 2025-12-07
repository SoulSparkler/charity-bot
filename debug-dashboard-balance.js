#!/usr/bin/env node

/**
 * Debug Dashboard Balance Display
 * This script simulates what the dashboard sees when calling the backend APIs
 */

const krakenService = require('./dist/services/krakenService').krakenService;

async function debugDashboardBalance() {
  console.log('🔍 Debugging Dashboard Balance Display\n');
  
  try {
    // Step 1: Test connection
    console.log('1️⃣ Testing Kraken Connection:');
    const connection = await krakenService.testConnection();
    console.log(`   Status: ${connection.success ? '✅' : '❌'}`);
    console.log(`   Message: ${connection.message}\n`);

    // Step 2: Test balance access
    console.log('2️⃣ Testing Balance Access:');
    const balance = await krakenService.testBalanceAccess();
    console.log(`   Status: ${balance.success ? '✅' : '❌'}`);
    console.log(`   Message: ${balance.message}`);
    
    if (balance.success && balance.balance) {
      console.log('   📊 Raw Balance Data:');
      Object.entries(balance.balance).forEach(([key, value]) => {
        console.log(`      ${key}: ${value}`);
      });
      console.log();
    }

    // Step 3: Test portfolio balances (what dashboard should display)
    console.log('3️⃣ Testing Portfolio Balances:');
    try {
      const portfolio = await krakenService.getPortfolioBalances();
      console.log('   📊 Portfolio Data:');
      console.log(`      USD: $${portfolio.USD.toFixed(2)}`);
      console.log(`      BTC: ${portfolio.BTC.toFixed(8)} BTC`);
      console.log(`      ETH: ${portfolio.ETH.toFixed(8)} ETH`);
      console.log(`      Total Value: $${portfolio.portfolioValueUSD.toFixed(2)}`);
    } catch (err) {
      console.log(`   ❌ Portfolio Error: ${err.message}`);
    }
    
    console.log();

    // Step 4: Simulate what dashboard page.tsx would receive
    console.log('4️⃣ Dashboard Page.tsx Simulation:');
    console.log('   This is what the dashboard React component receives:');
    
    const mockState = {
      success: true,
      last_updated: new Date().toISOString(),
      kraken: {
        tests: {
          connection,
          balance,
          status: krakenService.getStatus()
        }
      }
    };

    // Try to get portfolio data
    try {
      const portfolio = await krakenService.getPortfolioBalances();
      mockState.portfolio = portfolio;
      console.log('   ✅ Portfolio data available');
    } catch (err) {
      mockState.portfolio = null;
      console.log(`   ❌ Portfolio data failed: ${err.message}`);
    }

    console.log('\n📋 Final State Object:');
    console.log(JSON.stringify(mockState, null, 2));

    // Step 5: Simulate dashboard parsing logic
    console.log('\n5️⃣ Dashboard Parsing Logic Simulation:');
    
    const rawBalances = mockState?.kraken?.tests?.balance?.balance ?? {};
    console.log('   🔍 Raw balances from API:', rawBalances);
    console.log('   🔍 Available balance keys:', Object.keys(rawBalances));
    
    // USD Balance parsing
    const usdBalance = parseFloat(
      rawBalances["_tradeBalance"] ??
      rawBalances["ZUSD"] ??
      "0"
    );
    console.log(`   💰 USD Balance: ${usdBalance} (from ${Object.keys(rawBalances).find(k => rawBalances[k] === usdBalance.toString() || k === '_tradeBalance' || k === 'ZUSD') || 'none'})`);
    
    // BTC Balance parsing
    const btcBalance = parseFloat(
      rawBalances["XXBT"] ??
      rawBalances["XBT"] ??
      rawBalances["BTC"] ??
      "0"
    );
    console.log(`   🪙 BTC Balance: ${btcBalance} (from ${Object.keys(rawBalances).find(k => ['XXBT', 'XBT', 'BTC'].includes(k)) || 'none'})`);
    
    // Asset count
    const assetKeys = Object.keys(rawBalances).filter(key => !key.startsWith("_"));
    const assetCount = assetKeys.length;
    console.log(`   📈 Asset Count: ${assetCount} (${assetKeys.join(', ') || 'none'})`);

    // Step 6: Final assessment
    console.log('\n6️⃣ Final Assessment:');
    console.log(`   🔗 Connection: ${connection.success ? 'Working' : 'Failed'}`);
    console.log(`   💰 Balance Data: ${balance.success ? 'Available' : 'Failed'}`);
    console.log(`   🪙 BTC Detection: ${btcBalance > 0 ? `Success (${btcBalance})` : 'No BTC found'}`);
    console.log(`   💵 USD Detection: ${usdBalance > 0 ? `Success (${usdBalance})` : 'No USD found'}`);
    console.log(`   📊 Asset Count: ${assetCount}`);

    if (!connection.success) {
      console.log('\n❌ ROOT CAUSE: Kraken API connection failed');
      console.log('   → Check API credentials in .env file');
      console.log('   → Ensure API key has proper permissions');
    } else if (!balance.success) {
      console.log('\n❌ ROOT CAUSE: Balance access failed');
      console.log('   → API key may lack balance reading permissions');
    } else if (assetCount === 0) {
      console.log('\n⚠️  Account Status: Empty or inaccessible');
      console.log('   → This is normal for new/test accounts');
      console.log('   → Dashboard should show "No assets detected"');
    } else {
      console.log('\n✅ All systems working - Dashboard should show correct data');
    }

  } catch (error) {
    console.error('\n💥 Test failed with error:', error.message);
    console.error(error.stack);
  }
}

debugDashboardBalance();