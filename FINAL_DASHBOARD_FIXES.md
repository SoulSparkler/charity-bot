# Final Dashboard Balance Fixes

## Issues Fixed ✅

### 1. USD Balance Logic ✅
**File:** `src/services/krakenService.ts`
**Method:** `getPortfolioBalances()`

**Updated USD detection to use proper Kraken fields:**
```typescript
// Before: Used ZUSD (full account value)
const usdBalance = parseFloat(balances['ZUSD'] ?? balances['USD'] ?? '0');

// After: Use _tradeBalance (trading balance), fallback to ZUSD
const usdBalance = parseFloat(balances['_tradeBalance'] ?? balances['ZUSD'] ?? balances['USD'] ?? '0');
```

### 2. BTC Balance Detection ✅
**File:** `src/services/krakenService.ts`
**Method:** `getPortfolioBalances()`

**Updated BTC detection as requested:**
```typescript
// Before: Used all three keys including BTC
const btcBalance = parseFloat(balances['XXBT'] ?? balances['XBT'] ?? balances['BTC'] ?? '0');

// After: Use XXBT first, then XBT (no BTC fallback)
const btcBalance = parseFloat(balances['XXBT'] ?? balances['XBT'] ?? '0');
```

### 3. Portfolio Value Calculation ✅
**File:** `src/services/krakenService.ts`
**Method:** `getPortfolioBalances()`

**Updated to use _equity for total portfolio value:**
```typescript
// Use _equity (total portfolio value), fallback to calculated
const equityValue = parseFloat(balances['_equity'] ?? '0');
const portfolioValueUSD = equityValue > 0 ? equityValue : usdBalance + (btcBalance * btcPrice) + (ethBalance * ethPrice);
```

### 4. Assets Count ✅
**File:** `dashboard/app/page.tsx`
**Method:** `getBalanceEntries()`

**Already fixed:** Filters out internal fields starting with '_'
```typescript
return Object.entries(balance).filter(([asset]) => !asset.startsWith('_'));
```

## Expected Dashboard Results

After these fixes, the dashboard should show:

1. **USD Balance:** Available trading balance (from `_tradeBalance`)
2. **BTC Balance:** Correct Bitcoin amount from `XXBT` or `XBT`
3. **Portfolio Value:** Total portfolio value (from `_equity` or calculated)
4. **Assets Count:** Only real tradeable assets (ZUSD, XXBT, XETH, etc.)

## Kraken Balance Field Priority

### USD Balance (Trading Balance)
1. `_tradeBalance` (available for trading)
2. `ZUSD` (fallback)
3. `USD` (final fallback)

### BTC Balance
1. `XXBT` (primary)
2. `XBT` (fallback)

### Portfolio Value
1. `_equity` (total portfolio value)
2. Calculated value (USD + BTC + ETH conversions)

### Asset Display
- Shows only non-internal fields (doesn't show `_tradeBalance`, `_equity`, etc.)
- Maps currency codes: ZUSD → USD, XXBT → BTC, XETH → ETH

## Backend Requirements

For these fixes to work:
1. Backend server must be running with updated `krakenService.ts`
2. Kraken API must return TradeBalance data (not just BalanceEx)
3. TradeBalance must include `tb` (trade balance) and `e` (equity) fields

## Testing

The fixes have been implemented according to your specifications:
- ✅ USD uses `_tradeBalance` for trading balance
- ✅ Portfolio value uses `_equity` when available
- ✅ BTC detection uses `XXBT` → `XBT` priority
- ✅ Assets count excludes internal fields
- ✅ Navigation shows "Una Fémina" and "Vorgina"