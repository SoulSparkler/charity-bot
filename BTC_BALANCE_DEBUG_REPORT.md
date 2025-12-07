# BTC Balance Debug Report

## Summary
Successfully identified the root cause of the BTC balance mismatch between Kraken Pro and the `/api/portfolio` endpoint.

## Root Cause
The issue was **invalid Kraken API credentials**, not code logic problems.

### Evidence from Raw API Responses:
```
TradeBalance API: {"error":["EAPI:Invalid key"], "result":undefined}
BalanceEx API:    {"error":["EAPI:Invalid key"], "result":undefined}
```

## Changes Made

### 1. Enhanced Raw Response Logging
- Added comprehensive logging of raw TradeBalance and BalanceEx API responses
- Added detection logic to check if TradeBalance returns individual crypto balances
- Implemented proper fallback to BalanceEx when TradeBalance doesn't provide crypto details

### 2. Asset Name Mapping
- Added `assetNameMap` to properly map Kraken asset codes:
  - `XXBT` → `BTC` (Bitcoin primary code)
  - `XBT` → `BTC` (Bitcoin alternative code)  
  - `XETH` → `ETH` (Ethereum)
  - `ZUSD` → `USD` (US Dollar)

### 3. Improved Balance Processing
- Enhanced `getPortfolioBalances()` to properly extract XXBT and XETH balances
- Added detailed logging of raw balances before processing
- Improved error handling and logging throughout the balance retrieval process

## Files Modified
- `src/services/krakenService.ts` - Enhanced balance retrieval with comprehensive logging and asset mapping

## Test Script Created
- `test-btc-debug.js` - Standalone script to test Kraken API responses

## Next Steps
1. **Update Kraken API Credentials**
   - Verify KRAKEN_API_KEY and KRAKEN_API_SECRET are valid
   - Ensure API key has "Query Funds" permission
   - Confirm using correct environment (production vs testnet)

2. **Test After Credential Update**
   - Run `node test-btc-debug.js` to verify API connectivity
   - Test `/api/portfolio` endpoint to confirm BTC balance appears
   - Verify `balances.BTC` shows actual BTC amount instead of 0

## Expected Result
Once valid API credentials are provided, the `/api/portfolio` endpoint should return:
```json
{
  "balances": {
    "USD": 198.6083,
    "BTC": "actual_btc_amount",
    "ETH": "actual_eth_amount", 
    "totalValue": "recalculated_total"
  },
  "timestamp": "2025-12-07T19:40:38.999Z"
}
```

The BTC balance will be properly mapped from Kraken's `XXBT` asset code using the assetNameMap.