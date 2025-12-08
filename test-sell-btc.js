const axios = require('axios');

async function testSellBTC() {
    const baseURL = 'http://localhost:3000';
    
    console.log('🧪 Testing POST /api/sell-btc endpoint...\n');
    
    // Test 1: Invalid input (missing usdAmount)
    console.log('Test 1: Invalid input (missing usdAmount)');
    try {
        const response = await axios.post(`${baseURL}/api/sell-btc`, {});
        console.log('❌ Expected error but got success:', response.data);
    } catch (error) {
        console.log('✅ Expected error:', JSON.stringify(error.response?.data, null, 2));
        console.log('Status:', error.response?.status);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 2: Invalid input (negative number)
    console.log('Test 2: Invalid input (negative number)');
    try {
        const response = await axios.post(`${baseURL}/api/sell-btc`, { usdAmount: -100 });
        console.log('❌ Expected error but got success:', response.data);
    } catch (error) {
        console.log('✅ Expected error:', JSON.stringify(error.response?.data, null, 2));
        console.log('Status:', error.response?.status);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 3: Valid input (should fail due to trading disabled)
    console.log('Test 3: Valid input (trading disabled)');
    try {
        const response = await axios.post(`${baseURL}/api/sell-btc`, { usdAmount: 100 });
        console.log('❌ Expected error but got success:', response.data);
    } catch (error) {
        console.log('✅ Expected error (trading disabled):', JSON.stringify(error.response?.data, null, 2));
        console.log('Status:', error.response?.status);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 4: Very small amount (should fail due to minimum volume)
    console.log('Test 4: Very small amount (below minimum)');
    try {
        const response = await axios.post(`${baseURL}/api/sell-btc`, { usdAmount: 1 });
        console.log('❌ Expected error but got success:', response.data);
    } catch (error) {
        console.log('✅ Expected error (below minimum):', JSON.stringify(error.response?.data, null, 2));
        console.log('Status:', error.response?.status);
    }
}

testSellBTC().catch(console.error);