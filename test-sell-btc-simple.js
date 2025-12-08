const http = require('http');

function makeRequest(data, callback) {
    const postData = JSON.stringify(data);
    
    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/sell-btc',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = http.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
            responseData += chunk;
        });
        
        res.on('end', () => {
            callback(null, {
                status: res.statusCode,
                headers: res.headers,
                data: responseData
            });
        });
    });

    req.on('error', (error) => {
        callback(error);
    });

    req.write(postData);
    req.end();
}

async function runTests() {
    console.log('🧪 Testing POST /api/sell-btc endpoint...\n');
    
    // Test 1: Invalid input (missing usdAmount)
    console.log('Test 1: Invalid input (missing usdAmount)');
    makeRequest({}, (error, result) => {
        if (error) {
            console.log('❌ Request failed:', error.message);
        } else {
            console.log(`✅ Status: ${result.status}`);
            console.log('Response:', result.data);
        }
        
        console.log('\n' + '='.repeat(50) + '\n');
        
        // Test 2: Invalid input (negative number)
        console.log('Test 2: Invalid input (negative number)');
        makeRequest({ usdAmount: -100 }, (error, result) => {
            if (error) {
                console.log('❌ Request failed:', error.message);
            } else {
                console.log(`✅ Status: ${result.status}`);
                console.log('Response:', result.data);
            }
            
            console.log('\n' + '='.repeat(50) + '\n');
            
            // Test 3: Valid input (should fail due to trading disabled)
            console.log('Test 3: Valid input (trading disabled)');
            makeRequest({ usdAmount: 100 }, (error, result) => {
                if (error) {
                    console.log('❌ Request failed:', error.message);
                } else {
                    console.log(`✅ Status: ${result.status}`);
                    console.log('Response:', result.data);
                }
                
                console.log('\n' + '='.repeat(50) + '\n');
                
                // Test 4: Very small amount (should fail due to minimum volume)
                console.log('Test 4: Very small amount (below minimum)');
                makeRequest({ usdAmount: 1 }, (error, result) => {
                    if (error) {
                        console.log('❌ Request failed:', error.message);
                    } else {
                        console.log(`✅ Status: ${result.status}`);
                        console.log('Response:', result.data);
                    }
                    
                    console.log('\n🎯 Testing completed!');
                });
            });
        });
    });
}

runTests();