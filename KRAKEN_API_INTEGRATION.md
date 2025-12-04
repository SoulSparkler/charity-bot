# Kraken API Integration Guide

This document explains how to configure and use the real Kraken API integration in the charity bot system.

## Overview

The bot now supports both **mock mode** (simulated data) and **real Kraken API integration** (live data). The integration is designed with multiple safety layers to prevent accidental real trading.

## Environment Variables

### Required API Credentials

Add these to your `.env` file:

```bash
# Kraken API Configuration
KRAKEN_API_KEY=your_kraken_api_key_here
KRAKEN_API_SECRET=your_kraken_api_secret_here

# Mode Configuration
USE_MOCK_KRAKEN=true          # true = mock data, false = real API
ALLOW_REAL_TRADING=false      # false = read-only, true = can trade
TRADE_CONFIRMATION_REQUIRED=true  # additional safety check
```

### API Key Permissions (Kraken Console)

For read-only operations, your API key needs these permissions:
- ✅ **Query Funds** - to get account balances
- ✅ **Query Open Orders** - to check existing orders
- ✅ **Query Closed Orders** - for order history
- ✅ **Query Trades History** - for trade records
- ✅ **Query Trading Data** - for ticker/price data

⚠️ **DO NOT enable** "Create & Modify Orders" unless you're ready for real trading.

## Configuration Modes

### 1. Mock Mode (Default)
```bash
USE_MOCK_KRAKEN=true
```
- Uses simulated/fake data
- Safe for development and testing
- No real API calls made

### 2. Read-Only Live Mode (Recommended)
```bash
USE_MOCK_KRAKEN=false
ALLOW_REAL_TRADING=false
TRADE_CONFIRMATION_REQUIRED=true
```
- Uses real Kraken API data
- Only read operations (balances, prices, orders)
- No real trading enabled

### 3. Real Trading Mode (Advanced)
```bash
USE_MOCK_KRAKEN=false
ALLOW_REAL_TRADING=true
TRADE_CONFIRMATION_REQUIRED=false
```
- Full integration with Kraken API
- **CAN PLACE REAL ORDERS WITH REAL MONEY**
- ⚠️ **EXTREME CAUTION REQUIRED**

## Testing the Integration

### Option 1: Dashboard Test Endpoint

Navigate to the dashboard and visit:
```
/api/dashboard/test-balance
```

This endpoint will test:
- ✅ API connection
- ✅ Authentication
- ✅ Balance retrieval
- ✅ Configuration safety

### Option 2: Command Line Test

Run the dedicated test script:
```bash
npm run build
npm run test:kraken
```

This provides detailed output about the API integration status.

### Option 3: Programmatic Test

```javascript
const { krakenService } = require('./dist/services/krakenService');

// Test connection
const connectionTest = await krakenService.testConnection();
console.log('Connection:', connectionTest);

// Test balance access
const balanceTest = await krakenService.testBalanceAccess();
console.log('Balance:', balanceTest);

// Check status
const status = krakenService.getStatus();
console.log('Status:', status);
```

## API Methods

### Read-Only Methods (Safe)

These methods work in both mock and live modes:

```javascript
// Get account balances
const balances = await krakenService.getBalances();

// Get total USD value of portfolio
const totalValue = await krakenService.getTotalUSDValue();

// Get ticker data (prices)
const ticker = await krakenService.getTicker(['BTCUSD', 'ETHUSD']);

// Get OHLC data for technical analysis
const ohlc = await krakenService.getOHLC('BTCUSD', 60);

// Check service status
const status = krakenService.getStatus();
```

### Trading Methods (Require Safety Flags)

These methods have additional safety checks:

```javascript
// Place an order
const order = await krakenService.placeSpotOrder({
  pair: 'BTC/USD',
  side: 'buy',
  type: 'market',
  size: 0.01
});

// Get open orders
const openOrders = await krakenService.getOpenOrders();

// Cancel all orders (emergency)
const result = await krakenService.cancelAllOrders();
```

## Safety Features

### 1. Mode-Based Safety
- Mock mode: No real API calls
- Read-only mode: No trading functions work
- Real trading mode: Explicit permission required

### 2. Environment-Based Safety
- `ALLOW_REAL_TRADING=false`: Blocks all trading operations
- `TRADE_CONFIRMATION_REQUIRED=true`: Requires additional confirmation

### 3. API Key Permissions
- Read-only API key: Can't create orders even if `ALLOW_REAL_TRADING=true`
- Trading API key: Can place orders (with proper configuration)

### 4. Error Handling
- All API calls have proper error handling
- Failed API calls fall back to safe defaults
- Detailed logging for troubleshooting

## Troubleshooting

### Common Issues

#### 1. "API credentials not configured"
```bash
# Solution: Set your API credentials
KRAKEN_API_KEY=your_key_here
KRAKEN_API_SECRET=your_secret_here
```

#### 2. "Connection test failed"
- Check internet connectivity
- Verify API key has correct permissions
- Ensure API key is activated on Kraken

#### 3. "Balance access failed"
- API key might not have "Query Funds" permission
- Account might be empty (this is normal)

#### 4. "Real trading disabled"
- Normal safety behavior - set `ALLOW_REAL_TRADING=true` if needed
- `TRADE_CONFIRMATION_REQUIRED=true` adds extra protection

### Debugging Tips

1. **Check service status first:**
   ```javascript
   const status = krakenService.getStatus();
   console.log(status);
   ```

2. **Enable debug logging:**
   ```bash
   LOG_LEVEL=debug
   ```

3. **Test with mock mode first:**
   ```bash
   USE_MOCK_KRAKEN=true
   npm run test:kraken
   ```

4. **Verify API key on Kraken:**
   - Log into Kraken account
   - Go to Settings → API
   - Ensure key is active and has correct permissions

## Migration from Mock Mode

1. **Step 1: Test Connection**
   ```bash
   USE_MOCK_KRAKEN=true
   npm run test:kraken
   ```

2. **Step 2: Enable Real Data**
   ```bash
   USE_MOCK_KRAKEN=false
   ALLOW_REAL_TRADING=false  # Keep trading disabled
   npm run test:kraken
   ```

3. **Step 3: Verify Read-Only Operations**
   - Check balance display on dashboard
   - Verify price data is real
   - Confirm no trading occurs

4. **Step 4: Enable Trading (Optional)**
   ```bash
   ALLOW_REAL_TRADING=true
   # Only if you're ready for real trading!
   ```

## Security Best Practices

1. **Never commit API keys** to version control
2. **Use read-only keys** for testing and monitoring
3. **Enable API key restrictions** (IP whitelisting) on Kraken
4. **Monitor API usage** through Kraken dashboard
5. **Keep `TRADE_CONFIRMATION_REQUIRED=true`** unless you understand the risks
6. **Test with small amounts** when enabling real trading
7. **Regularly rotate API keys** for security

## Support

If you encounter issues:

1. Run the test script: `npm run test:kraken`
2. Check the logs for detailed error messages
3. Verify your environment variables are set correctly
4. Ensure your API key has the correct permissions
5. Check network connectivity to api.kraken.com

Remember: **When in doubt, keep trading disabled!**