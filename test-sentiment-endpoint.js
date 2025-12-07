// Test script to verify the sentiment API endpoint
const http = require('http');

async function testSentimentEndpoint() {
  console.log('🔍 Testing /api/sentiment endpoint...\n');
  
  try {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/sentiment',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`📡 Response Status: ${res.statusCode}`);
        console.log(`📋 Response Headers: ${JSON.stringify(res.headers, null, 2)}`);
        console.log(`📊 Response Body: ${data}\n`);
        
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            console.log('✅ Sentiment endpoint working correctly!');
            console.log(`📈 Fear & Greed Index: ${parsed.value}`);
            console.log(`🏷️  Classification: ${parsed.classification}`);
            console.log(`🕒 Timestamp: ${parsed.timestamp}`);
            console.log(`🔄 Updated: ${parsed.updated}`);
          } catch (e) {
            console.log('❌ Failed to parse JSON response');
          }
        } else {
          console.log('❌ Sentiment endpoint returned error status');
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request failed:', error.message);
      console.log('💡 Make sure the server is running on port 3000');
    });

    req.end();

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testSentimentEndpoint();