// Connection test between dashboard and backend
const http = require('http');

async function testBackendConnection() {
  console.log('🔗 Testing Backend-Dashboard Connection...\n');

  const tests = [
    { name: 'Backend Health', url: 'http://localhost:3000/health', method: 'GET' },
    { name: 'Backend Status', url: 'http://localhost:3000/status', method: 'GET' },
    { name: 'Dashboard', url: 'http://localhost:3001', method: 'GET' }
  ];

  for (const test of tests) {
    try {
      console.log(`Testing ${test.name}...`);
      
      const url = new URL(test.url);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: test.method,
        timeout: 5000
      };

      const req = http.request(options, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`   ✅ ${test.name}: ${res.statusCode} OK`);
        } else {
          console.log(`   ⚠️  ${test.name}: ${res.statusCode}`);
        }
        
        // Collect response data
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (data && test.url.includes('/health')) {
            try {
              const health = JSON.parse(data);
              console.log(`   📊 Status: ${health.status}, Mode: ${health.mode || 'unknown'}`);
            } catch (e) {
              // Ignore parse errors
            }
          }
        });
      });

      req.on('error', (err) => {
        console.log(`   ❌ ${test.name}: ${err.message}`);
      });

      req.on('timeout', () => {
        console.log(`   ⏱️  ${test.name}: Timeout`);
        req.destroy();
      });

      req.end();

    } catch (error) {
      console.log(`   ❌ ${test.name}: ${error.message}`);
    }
  }

  console.log('\n📋 Connection Test Complete');
  console.log('\n💡 If connections fail:');
  console.log('   1. Ensure backend is running: npm run dev');
  console.log('   2. Ensure dashboard is running: cd dashboard && npm run dev');
  console.log('   3. Check if ports 3000 and 3001 are available');
  console.log('   4. Verify environment variables are set correctly');
}

// Wait a moment and run tests
setTimeout(testBackendConnection, 2000);