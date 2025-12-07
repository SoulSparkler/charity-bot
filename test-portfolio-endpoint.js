#!/usr/bin/env node

// Test script to verify the portfolio endpoint
const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

async function testPortfolioEndpoint() {
  try {
    console.log('🔍 Testing portfolio endpoint...');
    console.log(`Backend URL: ${BACKEND_URL}`);
    
    // Test the portfolio endpoint directly
    const response = await axios.get(`${BACKEND_URL}/api/portfolio`, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Portfolio endpoint response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Check if BTC is being detected
    const balances = response.data.balances;
    if (balances) {
      console.log('\n📊 Balance Summary:');
      console.log(`USD: ${balances.USD}`);
      console.log(`BTC: ${balances.BTC}`);
      console.log(`ETH: ${balances.ETH}`);
      console.log(`Total Portfolio Value: ${balances.portfolioValueUSD}`);
      
      if (balances.BTC > 0) {
        console.log('✅ BTC balance detected successfully!');
      } else {
        console.log('⚠️ BTC balance is 0 - this might be the issue');
      }
    }
    
  } catch (error) {
    console.error('❌ Portfolio endpoint test failed:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data: ${error.response.data}`);
    } else {
      console.error(error.message);
    }
  }
}

// Test the dashboard state endpoint too
async function testDashboardState() {
  try {
    console.log('\n🔍 Testing dashboard state endpoint...');
    
    const response = await axios.get(`${BACKEND_URL}/api/dashboard/state`, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Dashboard state endpoint response:');
    const portfolio = response.data.portfolio;
    if (portfolio) {
      console.log('Portfolio data received:');
      console.log(JSON.stringify(portfolio, null, 2));
    } else {
      console.log('❌ No portfolio data in dashboard state');
    }
    
  } catch (error) {
    console.error('❌ Dashboard state endpoint test failed:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data: ${error.response.data}`);
    } else {
      console.error(error.message);
    }
  }
}

async function main() {
  await testPortfolioEndpoint();
  await testDashboardState();
}

if (require.main === module) {
  main();
}

module.exports = { testPortfolioEndpoint, testDashboardState };