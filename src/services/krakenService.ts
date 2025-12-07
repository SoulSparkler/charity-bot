import { krakenLogger } from '../utils/logger';
import { riskEnforcer, TradeRequest } from './riskEnforcer';
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

export interface KrakenBalance {
  [currency: string]: string;
}

export interface KrakenOrder {
  orderId: string;
  pair: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  size: number;
  price?: number | null;
  status: 'open' | 'closed' | 'canceled';
  createdAt: Date;
  filledSize: number;
  remainingSize: number;
}

export interface KrakenTicker {
  pair: string;
  price: string;
  volume: string;
  timestamp: number;
}

export interface PlaceOrderRequest {
  pair: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  size: number;
  price?: number;
  clientId?: string;
}

class KrakenService {
  private apiKey: string;
  private apiSecret: string;
  private httpClient: AxiosInstance;
  private lastRequestTime: number = 0;
  private readonly minRequestInterval: number = 1000; // 1 second between requests

  constructor() {
    this.apiKey = process.env.KRAKEN_API_KEY || '';
    this.apiSecret = process.env.KRAKEN_API_SECRET || '';
    
    // Environment variable check for debugging
    console.log("ENV CHECK:", {
      keyExists: !!this.apiKey,
      secretExists: !!this.apiSecret,
      fullKey: this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'empty',
      fullSecret: this.apiSecret ? `${this.apiSecret.substring(0, 20)}...` : 'empty'
    });
    
    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: 'https://api.kraken.com',
      timeout: 10000,
      headers: {
        'User-Agent': 'CharityBot/1.0.0'
      }
    });

    // Set up request interceptor for rate limiting
    this.httpClient.interceptors.request.use(async (config) => {
      if (config.url?.includes('/0/private/')) {
        // Rate limit private API calls
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
          const waitTime = this.minRequestInterval - timeSinceLastRequest;
          krakenLogger.debug(`Rate limiting: waiting ${waitTime}ms`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        this.lastRequestTime = Date.now();
        
        // Add authentication headers for private endpoints
        await this.addAuthHeaders(config);
      }
      return config;
    });

    if (!this.apiKey) {
      krakenLogger.warn('No Kraken API key provided. KrakenService will not work properly.');
    }

    if (!this.apiSecret) {
      krakenLogger.warn('No Kraken API secret provided. KrakenService will not work properly.');
    }

    krakenLogger.info('🚀 Running in LIVE MODE - using real Kraken API');
  }

  /**
   * Add Kraken authentication headers to request
   */
  private async addAuthHeaders(config: any): Promise<void> {
    try {
      const nonce = Date.now() * 1000; // microseconds
      const url = new URL(config.url!, config.baseURL);
      const path = url.pathname;
      
      // Add nonce to request data
      const postData = config.data ? { ...config.data } : {};
      postData.nonce = nonce.toString();
      
      if (config.params) {
        Object.assign(postData, config.params);
      }

      // Convert to URL-encoded form data
      const postDataString = this.objectToQueryString(postData);
      
      // Create signature per Kraken docs:
      // HMAC-SHA512 of (URI path + SHA256(nonce + POST data)) and target is base64 decoded secret
      const secret = Buffer.from(this.apiSecret, 'base64');
      const sha256Hash = crypto.createHash('sha256')
        .update(nonce.toString() + postDataString)
        .digest();
      const signature = crypto.createHmac('sha512', secret)
        .update(Buffer.concat([Buffer.from(path), sha256Hash]))
        .digest('base64');
      
      // Add headers
      config.headers['API-Key'] = this.apiKey;
      config.headers['API-Sign'] = signature;
      config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      
      // Replace data with URL-encoded string
      config.data = postDataString;
      
      krakenLogger.debug(`Added auth headers for ${config.method?.toUpperCase()} ${path}`);
      
    } catch (error) {
      krakenLogger.error('Failed to add authentication headers', error as Error);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Convert object to query string
   */
  private objectToQueryString(obj: any): string {
    const pairs = [];
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        pairs.push(`${key}=${encodeURIComponent(obj[key])}`);
      }
    }
    return pairs.join('&');
  }

  /**
   * Get account balances using TradeBalance (for Unified accounts) with BalanceEx fallback
   */
  async getBalances(): Promise<KrakenBalance> {
    try {
      krakenLogger.info('Fetching account balances from Kraken (Unified account mode)...');
      
      // Try TradeBalance first (required for Unified accounts)
      try {
        const tradeBalanceResponse = await this.httpClient.post('/0/private/TradeBalance', {
          asset: 'ZUSD'
        });
        
        if (tradeBalanceResponse.data.error && tradeBalanceResponse.data.error.length > 0) {
          throw new Error(`TradeBalance API error: ${tradeBalanceResponse.data.error.join(', ')}`);
        }

        const tradeBalanceData = tradeBalanceResponse.data.result;
        const balances: KrakenBalance = {};
        
        // Parse equity balance (eb) as the primary balance indicator
        // eb = equivalent balance (combined balance of all currencies)
        if (tradeBalanceData.eb) {
          balances['ZUSD'] = tradeBalanceData.eb;
          krakenLogger.info(`TradeBalance equity balance (eb): ${tradeBalanceData.eb} USD`);
        }
        
        // Also capture other useful fields if available
        // tb = trade balance (balance available for trading)
        // m = margin amount of open positions
        // n = unrealized net profit/loss of open positions
        // e = equity = trade balance + unrealized net profit/loss
        if (tradeBalanceData.tb) {
          balances['_tradeBalance'] = tradeBalanceData.tb;
        }
        if (tradeBalanceData.e) {
          balances['_equity'] = tradeBalanceData.e;
        }

        krakenLogger.info(`Retrieved balance via TradeBalance: ${Object.keys(balances).length} fields`);
        return balances;
        
      } catch (tradeBalanceError) {
        krakenLogger.warn(`TradeBalance failed, falling back to BalanceEx: ${(tradeBalanceError as Error).message}`);
        
        // Fallback to BalanceEx
        const balanceExResponse = await this.httpClient.post('/0/private/BalanceEx');
        
        if (balanceExResponse.data.error && balanceExResponse.data.error.length > 0) {
          throw new Error(`BalanceEx API error: ${balanceExResponse.data.error.join(', ')}`);
        }

        const balances: KrakenBalance = {};
        const balanceExData = balanceExResponse.data.result;
        
        // BalanceEx returns extended balance info per currency
        for (const [currency, data] of Object.entries(balanceExData)) {
          const balanceInfo = data as { balance?: string; hold_trade?: string };
          if (balanceInfo.balance && parseFloat(balanceInfo.balance) > 0) {
            balances[currency] = balanceInfo.balance;
          }
        }

        krakenLogger.info(`Retrieved ${Object.keys(balances).length} non-zero balances via BalanceEx`);
        return balances;
      }
      
    } catch (error) {
      krakenLogger.error('Failed to fetch account balances (both TradeBalance and BalanceEx failed)', error as Error);
      throw error;
    }
  }

  /**
   * Get total USD value of all holdings
   */
  async getTotalUSDValue(): Promise<number> {
    try {
      const balances = await this.getBalances();
      
      // Get USD value from balance (equity balance from TradeBalance)
      const usdBalance = parseFloat(balances['ZUSD'] || '0');
      
      // Get BTC and ETH prices and calculate their USD value
      const tickerData = await this.getTicker(['BTCUSD', 'ETHUSD']);
      const btcPrice = parseFloat(tickerData['BTCUSD']?.price || '0');
      const ethPrice = parseFloat(tickerData['ETHUSD']?.price || '0');
      
      const btcAmount = parseFloat(balances['XXBT'] ?? balances['XBT'] ?? balances['BTC'] ?? '0');
      const ethAmount = parseFloat(balances['XETH'] || '0');
      
      const totalValue = usdBalance + (btcAmount * btcPrice) + (ethAmount * ethPrice);
      
      krakenLogger.debug(`Total USD value: ${totalValue.toFixed(2)} (USD: ${usdBalance}, BTC: ${(btcAmount * btcPrice).toFixed(2)}, ETH: ${(ethAmount * ethPrice).toFixed(2)})`);
      return totalValue;
      
    } catch (error) {
      krakenLogger.error('Failed to calculate total USD value', error as Error);
      throw error;
    }
  }

  /**
   * Get clean portfolio balances for dashboard display
   * Returns only user-friendly fields, no internal Kraken fields
   */
  async getPortfolioBalances(): Promise<{
    USD: number;
    BTC: number;
    ETH: number;
    portfolioValueUSD: number;
  }> {
    try {
      const balances = await this.getBalances();
      const tickerData = await this.getTicker(['BTCUSD', 'ETHUSD']);
      
      // Extract clean values - handle multiple possible Kraken key formats
      const usdBalance = parseFloat(balances['ZUSD'] ?? balances['USD'] ?? '0');
      
      // Debug: Log all available balance keys to help diagnose BTC detection issues
      const availableKeys = Object.keys(balances);
      krakenLogger.debug(`Available balance keys: ${availableKeys.join(', ')}`);
      
      // Check BTC with all possible keys
      const btcFromXXBT = balances['XXBT'] ? parseFloat(balances['XXBT']) : 0;
      const btcFromXBT = balances['XBT'] ? parseFloat(balances['XBT']) : 0;
      const btcFromBTC = balances['BTC'] ? parseFloat(balances['BTC']) : 0;
      const btcBalance = btcFromXXBT || btcFromXBT || btcFromBTC;
      
      krakenLogger.debug(`BTC detection: XXBT=${btcFromXXBT}, XBT=${btcFromXBT}, BTC=${btcFromBTC}, Final=${btcBalance}`);
      
      const ethBalance = parseFloat(balances['XETH'] ?? balances['ETH'] ?? '0');
      
      // Calculate portfolio value
      const btcPrice = parseFloat(tickerData['BTCUSD']?.price || '0');
      const ethPrice = parseFloat(tickerData['ETHUSD']?.price || '0');
      const portfolioValueUSD = usdBalance + (btcBalance * btcPrice) + (ethBalance * ethPrice);
      
      krakenLogger.debug(`Portfolio: USD=${usdBalance}, BTC=${btcBalance}, ETH=${ethBalance}, Total=${portfolioValueUSD}`);
      
      return {
        USD: usdBalance,
        BTC: btcBalance,
        ETH: ethBalance,
        portfolioValueUSD
      };
    } catch (error) {
      krakenLogger.error('Failed to get portfolio balances', error as Error);
      throw error;
    }
  }

  /**
   * Get ticker information
   */
  async getTicker(pairs: string[]): Promise<{ [pair: string]: KrakenTicker }> {
    try {
      // Convert pairs to Kraken format (remove / and use proper format)
      const krakenPairs = pairs.map(pair => pair.replace('/', '')).join(',');
      const response = await this.httpClient.get(`/0/public/Ticker?pair=${krakenPairs}`);
      
      if (response.data.error && response.data.error.length > 0) {
        throw new Error(`Kraken API error: ${response.data.error.join(', ')}`);
      }

      const result: { [pair: string]: KrakenTicker } = {};
      const tickerData = response.data.result;
      
      for (const [krakenPair, data] of Object.entries(tickerData)) {
        const pairInfo = data as any;
        
        // Map Kraken pair names to our format
        let ourPairName = krakenPair;
        if (krakenPair === 'XXBTZUSD') ourPairName = 'BTCUSD';
        if (krakenPair === 'XETHZUSD') ourPairName = 'ETHUSD';
        if (krakenPair === 'BTCUSD') ourPairName = 'BTCUSD';
        if (krakenPair === 'ETHUSD') ourPairName = 'ETHUSD';
        
        result[ourPairName] = {
          pair: ourPairName,
          price: pairInfo.c[0], // Last trade price
          volume: pairInfo.v[1], // Today's volume
          timestamp: Date.now(),
        };
      }

      krakenLogger.info(`Retrieved ticker data for ${Object.keys(result).length} pairs`);
      return result;
      
    } catch (error) {
      krakenLogger.error('Failed to fetch ticker data', error as Error);
      throw error;
    }
  }

  /**
   * Place an order with Risk Enforcer validation
   */
  async placeSpotOrder(orderRequest: PlaceOrderRequest & { botId?: 'A' | 'B'; reason?: string; mcs?: number }): Promise<KrakenOrder> {
    const allowRealTrading = process.env.ALLOW_REAL_TRADING === 'true';
    
    if (!allowRealTrading) {
      krakenLogger.warn('🚫 Real trading disabled - set ALLOW_REAL_TRADING=true to enable');
      throw new Error('Real trading is disabled. Set ALLOW_REAL_TRADING=true to enable.');
    }

    try {
      krakenLogger.warn('⚠️ ATTEMPTING REAL ORDER PLACEMENT - This will use real funds!');
      
      // Create trade request for risk validation
      const tradeRequest: TradeRequest = {
        botId: orderRequest.botId || 'A', // Default to Bot A if not specified
        pair: orderRequest.pair as 'BTC/USD' | 'ETH/USD',
        side: orderRequest.side,
        size: orderRequest.size,
        price: orderRequest.price || 0,
        reason: orderRequest.reason || 'Automated trading',
        mcs: orderRequest.mcs || 0.5,
        timestamp: new Date()
      };

      // Validate with Risk Enforcer BEFORE placing order
      const riskValidation = await riskEnforcer.validateTrade(tradeRequest);
      
      if (!riskValidation.approved) {
        krakenLogger.warn(`🚫 Trade blocked by risk controls: ${riskValidation.reason}`);
        throw new Error(`Trade rejected by risk controls: ${riskValidation.reason}`);
      }

      // Additional safety check - require explicit confirmation
      const confirmationRequired = process.env.TRADE_CONFIRMATION_REQUIRED === 'true';
      if (confirmationRequired) {
        krakenLogger.error('🚫 Real trading requires confirmation - rejecting order');
        throw new Error('Real trading requires explicit confirmation');
      }

      // Log the approved trade
      await riskEnforcer.logApprovedTrade(tradeRequest, riskValidation);

      const orderData: any = {
        pair: orderRequest.pair.replace('/', ''),
        type: orderRequest.side.toLowerCase(),
        ordertype: orderRequest.type.toLowerCase(),
        volume: orderRequest.size.toString(),
      };

      if (orderRequest.price) {
        orderData.price = orderRequest.price.toString();
      }

      // Add client ID for tracking
      if (orderRequest.clientId) {
        orderData.clientid = orderRequest.clientId;
      }

      krakenLogger.info(`📤 Placing real order: Bot ${tradeRequest.botId} ${tradeRequest.side.toUpperCase()} ${tradeRequest.size} ${tradeRequest.pair} @ €${tradeRequest.price.toFixed(2)}`);

      const response = await this.httpClient.post('/0/private/AddOrder', orderData);
      
      if (response.data.error && response.data.error.length > 0) {
        const errorMsg = `Kraken API error: ${response.data.error.join(', ')}`;
        krakenLogger.error('🚫 Order placement failed:', errorMsg);
        throw new Error(errorMsg);
      }

      const orderInfo = response.data.result;
      const order: KrakenOrder = {
        orderId: orderInfo.txid[0],
        pair: orderRequest.pair,
        side: orderRequest.side,
        type: orderRequest.type,
        size: orderRequest.size,
        price: orderRequest.price || null,
        status: 'open',
        createdAt: new Date(),
        filledSize: 0,
        remainingSize: orderRequest.size,
      };

      krakenLogger.trade('REAL', orderRequest.pair, orderRequest.side, orderRequest.size, orderRequest.price || 0, 0);
      krakenLogger.info(`✅ Real order placed successfully: ${order.orderId}`);
      
      return order;
      
    } catch (error) {
      krakenLogger.error('Failed to place real order', error as Error);
      throw error;
    }
  }

  /**
   * Get open orders
   */
  async getOpenOrders(): Promise<{ [orderId: string]: any }> {
    try {
      const response = await this.httpClient.post('/0/private/OpenOrders');
      
      if (response.data.error && response.data.error.length > 0) {
        throw new Error(`Kraken API error: ${response.data.error.join(', ')}`);
      }

      return response.data.result.open || {};
      
    } catch (error) {
      krakenLogger.error('Failed to fetch open orders', error as Error);
      throw error;
    }
  }

  /**
   * Cancel all orders
   */
  async cancelAllOrders(): Promise<{ count: number }> {
    const allowRealTrading = process.env.ALLOW_REAL_TRADING === 'true';
    
    if (!allowRealTrading) {
      throw new Error('Real trading is disabled. Set ALLOW_REAL_TRADING=true to enable.');
    }

    try {
      krakenLogger.warn('⚠️ Attempting to cancel all orders on Kraken...');
      
      const response = await this.httpClient.post('/0/private/CancelAll');
      
      if (response.data.error && response.data.error.length > 0) {
        throw new Error(`Kraken API error: ${response.data.error.join(', ')}`);
      }

      const count = response.data.result.count || 0;
      krakenLogger.info(`Cancelled ${count} orders on Kraken`);
      
      return { count };
      
    } catch (error) {
      krakenLogger.error('Failed to cancel all orders', error as Error);
      throw error;
    }
  }

  /**
   * Get OHLC data (for technical analysis)
   */
  async getOHLC(pair: string, interval: number = 60): Promise<number[][]> {
    try {
      const krakenPair = pair.replace('/', '');
      const response = await this.httpClient.get(`/0/public/OHLC?pair=${krakenPair}&interval=${interval}`);
      
      if (response.data.error && response.data.error.length > 0) {
        throw new Error(`Kraken API error: ${response.data.error.join(', ')}`);
      }

      const ohlcData = response.data.result[krakenPair] || [];
      
      // Convert to expected format: [timestamp, open, high, low, close, volume]
      return ohlcData.map((candle: any) => [
        candle[0] * 1000, // Convert to milliseconds
        parseFloat(candle[1]), // Open
        parseFloat(candle[2]), // High
        parseFloat(candle[3]), // Low
        parseFloat(candle[4]), // Close
        parseFloat(candle[6])  // Volume
      ]);
      
    } catch (error) {
      krakenLogger.error('Failed to fetch OHLC data', error as Error);
      throw error;
    }
  }

  /**
   * Test API connectivity - only for read operations
   */
  async testConnection(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      if (!this.apiKey || !this.apiSecret) {
        return {
          success: false,
          message: 'API credentials not configured',
        };
      }

      // Test with public endpoint first
      krakenLogger.info('Testing Kraken API connection...');
      const response = await this.httpClient.get('/0/public/SystemStatus');
      
      if (response.data.error && response.data.error.length > 0) {
        return {
          success: false,
          message: `API error: ${response.data.error.join(', ')}`,
        };
      }

      const systemStatus = response.data.result;
      
      return {
        success: true,
        message: `API connection successful - Status: ${systemStatus.status}`,
        data: systemStatus,
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Test balance retrieval - safe read-only operation
   */
  async testBalanceAccess(): Promise<{ success: boolean; message: string; balance?: KrakenBalance }> {
    try {
      const balances = await this.getBalances();
      
      if (Object.keys(balances).length > 0) {
        return {
          success: true,
          message: `Balance access successful - Found ${Object.keys(balances).length} currencies`,
          balance: balances,
        };
      } else {
        return {
          success: true,
          message: 'Balance access successful - Account appears to be empty',
          balance: balances,
        };
      }
      
    } catch (error) {
      return {
        success: false,
        message: `Balance access failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Get service status
   */
  getStatus(): { 
    status: string; 
    mode: string; 
    apiKeyConfigured: boolean; 
    apiSecretConfigured: boolean;
    realTradingEnabled: boolean;
    tradeConfirmationRequired: boolean;
  } {
    const allowRealTrading = process.env.ALLOW_REAL_TRADING === 'true';
    const tradeConfirmationRequired = process.env.TRADE_CONFIRMATION_REQUIRED === 'true';
    
    return {
      status: 'live',
      mode: allowRealTrading ? 'production' : 'read-only',
      apiKeyConfigured: !!this.apiKey,
      apiSecretConfigured: !!this.apiSecret,
      realTradingEnabled: allowRealTrading,
      tradeConfirmationRequired,
    };
  }

  /**
   * Get comprehensive risk status for monitoring
   */
  async getRiskStatus(): Promise<{
    serviceStatus: any;
    riskStatus: any;
    emergencyStop: boolean;
    configuration: {
      maxPositionSize: number;
      dailyLossLimits: { botA: number; botB: number };
      maxOpenPositions: { botA: number; botB: number };
    };
  }> {
    try {
      const serviceStatus = this.getStatus();
      const riskStatus = await riskEnforcer.getRiskStatus();

      return {
        serviceStatus,
        riskStatus,
        emergencyStop: riskStatus.emergencyStop,
        configuration: {
          maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE_EUR || '20'),
          dailyLossLimits: {
            botA: parseFloat(process.env.MAX_DAILY_LOSS_BOT_A_EUR || '100'),
            botB: parseFloat(process.env.MAX_DAILY_LOSS_BOT_B_EUR || '50')
          },
          maxOpenPositions: {
            botA: parseInt(process.env.MAX_OPEN_POSITIONS_BOT_A || '3'),
            botB: parseInt(process.env.MAX_OPEN_POSITIONS_BOT_B || '2')
          }
        }
      };
    } catch (error) {
      krakenLogger.error('Failed to get risk status:', error as Error);
      return {
        serviceStatus: this.getStatus(),
        riskStatus: { error: 'Failed to fetch risk status' },
        emergencyStop: false,
        configuration: {
          maxPositionSize: 20,
          dailyLossLimits: { botA: 100, botB: 50 },
          maxOpenPositions: { botA: 3, botB: 2 }
        }
      };
    }
  }
}

// Export singleton instance
export const krakenService = new KrakenService();
export default krakenService;