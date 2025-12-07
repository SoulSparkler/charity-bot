# Production Trading Guide
## Enabling Real Cryptocurrency Trading with Safety Controls

This guide explains how to safely enable real trading with your Kraken API while maintaining strict risk controls.

## ⚠️ IMPORTANT SAFETY DISCLAIMER

**Real trading involves significant financial risk. Only proceed if you:**
- Have thoroughly tested in demo mode
- Understand the risks of cryptocurrency trading
- Can afford to lose the funds you're trading with
- Have read and understood all safety controls

## Quick Start - Enable Real Trading

### 1. Environment Configuration

**For Production (.env.production):**
```bash
# Enable real database and Kraken API
USE_MOCK_DB=false
USE_MOCK_KRAKEN=false

# Enable real trading with safety controls
ALLOW_REAL_TRADING=true
TRADE_CONFIRMATION_REQUIRED=true

# Set conservative risk limits (EUR values)
MAX_POSITION_SIZE_EUR=20
MAX_DAILY_LOSS_BOT_A_EUR=100
MAX_DAILY_LOSS_BOT_B_EUR=50
MAX_OPEN_POSITIONS_BOT_A=3
MAX_OPEN_POSITIONS_BOT_B=2

# Set your actual Kraken API credentials
KRAKEN_API_KEY=your_real_kraken_api_key
KRAKEN_API_SECRET=your_real_kraken_api_secret

# Emergency stop (keep false unless emergency)
EMERGENCY_STOP=false
```

**For Development/Testing (.env):**
```bash
# Keep mock modes for testing
USE_MOCK_DB=true
USE_MOCK_KRAKEN=true
ALLOW_REAL_TRADING=false
```

### 2. Dashboard Mode Toggle

The dashboard now has a **Demo/Live mode toggle**:

- **Demo Mode** (Orange button): 
  - `USE_MOCK_KRAKEN=true`
  - `ALLOW_REAL_TRADING=false`
  - Uses simulated data, no real trades

- **Live Mode** (Green button):
  - `USE_MOCK_KRAKEN=false`  
  - `ALLOW_REAL_TRADING=true` (if set in environment)
  - Uses real Kraken data and can place real orders

## Safety Controls Explained

### 1. Risk Enforcer Validation

Every real trade is validated by the `RiskEnforcer` class before execution:

```typescript
// Checks performed before each trade:
✅ Position size limit (max €20 per trade)
✅ Daily loss limits (Bot A: €100, Bot B: €50)
✅ Maximum open positions (Bot A: 3, Bot B: 2)
✅ Bot-specific rules (Bot B only trades high confidence signals)
✅ Market condition checks (MCS >= 0.3)
✅ Emergency stop functionality
```

### 2. Multi-Layer Safety

```
Layer 1: Environment Variables
├── ALLOW_REAL_TRADING=false → Blocks all real trading
├── EMERGENCY_STOP=true → Immediate halt
└── TRADE_CONFIRMATION_REQUIRED=true → Manual approval needed

Layer 2: Risk Enforcer Validation
├── Position size validation
├── Daily loss limit enforcement
├── Market condition checks
└── Bot-specific restrictions

Layer 3: Kraken API Safety
├── Read-only API keys for testing
├── No withdrawal permissions
├── Rate limiting compliance
└── Order size validation
```

### 3. Real-Time Monitoring

Access risk status via API:
```bash
GET /api/risk/status
```

Returns comprehensive risk information:
```json
{
  "serviceStatus": {
    "realTradingEnabled": true,
    "mode": "production"
  },
  "riskStatus": {
    "dailyLosses": {
      "botA": 15.50,
      "botB": 8.25,
      "date": "2025-12-07"
    },
    "openPositions": {
      "botA": 2,
      "botB": 1
    }
  },
  "emergencyStop": false,
  "configuration": {
    "maxPositionSize": 20,
    "dailyLossLimits": {
      "botA": 100,
      "botB": 50
    }
  }
}
```

## Step-by-Step Deployment

### Step 1: Test with Mock Data
```bash
# 1. Start with full mock mode
USE_MOCK_DB=true
USE_MOCK_KRAKEN=true
ALLOW_REAL_TRADING=false

# 2. Test the system
npm run dev

# 3. Verify dashboard functionality
# Visit http://localhost:3001
# Test Demo mode toggle
```

### Step 2: Enable Real Data (Read-Only)
```bash
# 4. Enable real Kraken data (read-only)
USE_MOCK_DB=false
USE_MOCK_KRAKEN=false
ALLOW_REAL_TRADING=false
TRADE_CONFIRMATION_REQUIRED=true

# 5. Set your Kraken API credentials
KRAKEN_API_KEY=your_key_here
KRAKEN_API_SECRET=your_secret_here

# 6. Test connection
npm run test:kraken
```

### Step 3: Enable Real Trading (Carefully)
```bash
# 7. Enable real trading with safety controls
ALLOW_REAL_TRADING=true

# 8. Set conservative limits
MAX_POSITION_SIZE_EUR=10  # Start with €10 max
MAX_DAILY_LOSS_BOT_A_EUR=50  # Start with €50 max loss
MAX_DAILY_LOSS_BOT_B_EUR=25

# 9. Start with low balances
# Only deposit small amounts you can afford to lose
```

### Step 4: Monitor and Adjust
```bash
# 10. Monitor performance
curl http://localhost:3000/api/risk/status

# 11. Check logs
tail -f logs/combined.log

# 12. Adjust limits based on performance
# Gradually increase limits if performance is good
```

## Risk Management Best Practices

### 1. Start Small
- Begin with minimum position sizes (€10-20)
- Start with small daily loss limits (€25-50)
- Test thoroughly before increasing limits

### 2. Monitor Daily
- Check `/api/risk/status` daily
- Review daily loss reports
- Monitor bot performance metrics

### 3. Emergency Procedures

**If you need to stop trading immediately:**
```bash
# Method 1: Set emergency stop
EMERGENCY_STOP=true

# Method 2: Disable real trading
ALLOW_REAL_TRADING=false

# Method 3: Cancel all open orders
curl -X POST http://localhost:3000/api/bots/cancel-all
```

### 4. Regular Maintenance
- Weekly review of trading performance
- Monthly analysis of risk metrics
- Quarterly update of API credentials
- Annual security audit

## API Key Setup

### 1. Create Kraken API Key
1. Log into your Kraken account
2. Go to Settings → API
3. Create new API key with these permissions:
   - ✅ **Query Funds** (for balance checking)
   - ✅ **Query Open Orders** (for order monitoring)
   - ✅ **Query Closed Orders** (for trade history)
   - ✅ **Query Trades History** (for performance tracking)
   - ✅ **Query Trading Data** (for price data)
   - ❌ **Create & Modify Orders** (only if ALLOW_REAL_TRADING=true)
   - ❌ **Withdraw** (never enable for security)

### 2. Environment Variables
```bash
# Add to your production environment
KRAKEN_API_KEY=your_generated_api_key
KRAKEN_API_SECRET=your_generated_api_secret
```

### 3. Security Tips
- Use IP whitelisting on Kraken
- Rotate API keys regularly
- Monitor API usage through Kraken dashboard
- Never share API credentials

## Bot-Specific Trading Rules

### Bot A (Aggressive Growth)
- **Max Position Size**: €20 (configurable)
- **Daily Loss Limit**: €100 (configurable)
- **Max Open Positions**: 3
- **MCS Requirement**: >= 0.4
- **Strategy**: Cycle-based growth with fund transfers to Bot B

### Bot B (Conservative Donation)
- **Max Position Size**: €6 (30% of Bot A limit)
- **Daily Loss Limit**: €50 (configurable)
- **Max Open Positions**: 2
- **MCS Requirement**: >= 0.7 (higher threshold)
- **Strategy**: Conservative trading for charity donations

## Troubleshooting

### Common Issues

**1. "Real trading is disabled"**
- Check that `ALLOW_REAL_TRADING=true` in environment
- Verify environment variables are loaded correctly

**2. "Trade rejected by risk controls"**
- Position size exceeds limit
- Daily loss limit reached
- Market conditions too risky (low MCS)
- Check `/api/risk/status` for current limits

**3. "API credentials not configured"**
- Verify KRAKEN_API_KEY and KRAKEN_API_SECRET are set
- Check API key has correct permissions
- Test with `npm run test:kraken`

**4. "Emergency stop is enabled"**
- Set `EMERGENCY_STOP=false` to resume trading
- This should only be used in emergencies

### Debug Mode
Enable detailed logging:
```bash
LOG_LEVEL=debug
LOG_TO_FILE=true
```

Check logs:
```bash
tail -f logs/combined.log
```

## Performance Monitoring

### Key Metrics to Monitor
- Daily P&L for each bot
- Win rate and average trade size
- Risk metrics (position sizes, daily losses)
- API response times
- Error rates and system health

### Health Check
```bash
curl http://localhost:3000/health
```

### Bot Status
```bash
curl http://localhost:3000/api/bots/status
```

## Legal and Compliance

### Risk Disclosure
- Cryptocurrency trading involves substantial risk of loss
- Past performance does not guarantee future results
- Only trade with funds you can afford to lose
- This software is for educational and research purposes

### Tax Considerations
- Keep detailed records of all trades
- Consult with a tax professional for reporting requirements
- Consider using portfolio tracking tools for tax reporting

## Support and Updates

### Getting Help
1. Check this guide first
2. Review logs for error messages
3. Test with mock mode to isolate issues
4. Check GitHub issues for known problems

### Regular Updates
- Update dependencies monthly
- Review and adjust risk limits quarterly
- Update API documentation as needed
- Monitor Kraken API changes

---

**Remember: When in doubt, keep trading disabled and continue testing in demo mode!**
