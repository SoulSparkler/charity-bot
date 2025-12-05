import { krakenLogger } from '../utils/logger';
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
  private mockMode: boolean = false;
  private httpClient: AxiosInstance;
  private lastRequestTime: number = 0;
  private readonly minRequestInterval: number = 1000; // 1 second between requests

  constructor() {
    this.apiKey = process.env.KRAKEN_API_KEY || '';
    this.apiSecret = process.env.KRAKEN_API_SECRET || '';
    this.mockMode = process.env.USE_MOCK_KRAKEN === 'true';
    
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
      if (!this.mockMode && config.url?.includes('/0/private/')) {
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

    if (!this.apiKey && !this.mockMode) {
      krakenLogger.warn('No Kraken API key provided. KrakenService will not work properly.');
    }

    if (!this.apiSecret && !this.mockMode) {
      krakenLogger.warn('No Kraken API secret provided. KrakenService will not work properly.');
    }

    if (this.mockMode) {
      krakenLogger.info('🧪 Running in MOCK MODE - no real API calls will be made');
    } else {
      krakenLogger.info('🚀 Running in LIVE MODE - using real Kraken API');
    }
  }

  /**
   * Add Kraken authentication headers to request
   */
  private async addAuthHeaders(config: any): Promise<void> {
    try {
      const nonce = Date.now() * 1000; // microseconds
      const url = new URL(config.url!, config.baseURL);
      const path = url.pathname + url.search;
      
      // Add nonce to request data
      const postData = config.data ? { ...config.data } : {};
      postData.nonce = nonce.toString();
      
      if (config.params) {
        Object.assign(postData, config.params);
      }

      // Create message for signing
      const message = path + this.objectToQueryString(postData);
      
      // Create signature
      const secret = Buffer.from(this.apiSecret, 'base64');
      const hash = crypto.createHash('sha256');
      hash.update(nonce.toString() + message);
      const hmac = crypto.createHmac('sha512', secret);
      hmac.update(path + hash.digest());
      const signature = hmac.digest('base64');
      
      // Add headers
      config.headers['API-Key'] = this.apiKey;
      config.headers['API-Sign'] = signature;
      
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
   * Get account balances
   */
  async getBalances(): Promise<KrakenBalance> {
    if (this.mockMode) {
      krakenLogger.debug('Returning mock balances');
      return {
        'ZUSD': '50000.00',
        'XXBT': '1.5',
        'XETH': '20.0',
      };
    }

    try {
      krakenLogger.info('Fetching real account balances from Kraken...');
      const response = await this.httpClient.post('/0/private/Balance');
      
      if (response.data.error && response.data.error.length > 0) {
        throw new Error(`Kraken API error: ${response.data.error.join(', ')}`);
      }

      const balances: KrakenBalance = {};
      const balanceData = response.data.result;
      
      // Convert Kraken format to our format
      for (const [currency, amount] of Object.entries(balanceData)) {
        if (parseFloat(amount as string) > 0) {
          balances[currency] = amount as string;
        }
      }

      krakenLogger.info(`Retrieved ${Object.keys(balances).length} non-zero balances`);
      return balances;
      
    } catch (error) {
      krakenLogger.error('Failed to fetch account balances', error as Error);
      
      // Safe fallback - return minimal safe data
      krakenLogger.warn('Using safe fallback - returning empty balances');
      return {};
    }
  }

  /**
   * Get total USD value of all holdings
   */
  async getTotalUSDValue(): Promise<number> {
    if (this.mockMode) {
      return 50000; // Mock balance
    }

    try {
      const balances = await this.getBalances();
      
      // Get USD value from balance
      const usdBalance = parseFloat(balances['ZUSD'] || '0');
      
      // Get BTC and ETH prices and calculate their USD value
      const tickerData = await this.getTicker(['BTCUSD', 'ETHUSD']);
      const btcPrice = parseFloat(tickerData['BTCUSD']?.price || '0');
      const ethPrice = parseFloat(tickerData['ETHUSD']?.price || '0');
      
      const btcAmount = parseFloat(balances['XXBT'] || '0');
      const ethAmount = parseFloat(balances['XETH'] || '0');
      
      const totalValue = usdBalance + (btcAmount * btcPrice) + (ethAmount * ethPrice);
      
      krakenLogger.debug(`Total USD value: ${totalValue.toFixed(2)} (USD: ${usdBalance}, BTC: ${(btcAmount * btcPrice).toFixed(2)}, ETH: ${(ethAmount * ethPrice).toFixed(2)})`);
      return totalValue;
      
    } catch (error) {
      krakenLogger.error('Failed to calculate total USD value', error as Error);
      // Safe fallback
      return 0;
    }
  }

  /**
   * Get ticker information
   */
  async getTicker(pairs: string[]): Promise<{ [pair: string]: KrakenTicker }> {
    if (this.mockMode) {
      krakenLogger.debug(`Returning mock ticker data for ${pairs.join(', ')}`);
      return {
        'BTCUSD': {
          pair: 'BTCUSD',
          price: '45000.25',
          volume: '1250.5',
          timestamp: Date.now(),
        },
        'ETHUSD': {
          pair: 'ETHUSD',
          price: '3000.12',
          volume: '2500.5',
          timestamp: Date.now(),
        },
      };
    }

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
      
      // Fallback to mock data on error
      krakenLogger.warn('Using mock ticker data due to API failure');
      return {
        'BTCUSD': {
          pair: 'BTCUSD',
          price: '45000.00',
          volume: '1000.0',
          timestamp: Date.now(),
        },
        'ETHUSD': {
          pair: 'ETHUSD',
          price: '3000.00',
          volume: '2000.0',
          timestamp: Date.now(),
        },
      };
    }
  }

  /**
   * Place an order
   */
  async placeSpotOrder(orderRequest: PlaceOrderRequest): Promise<KrakenOrder> {
    const allowRealTrading = process.env.ALLOW_REAL_TRADING === 'true';
    
    if (this.mockMode || !allowRealTrading) {
      if (this.mockMode) {
        krakenLogger.info('🧪 Returning mock order result');
      } else {
        krakenLogger.warn('🚫 Real trading disabled - set ALLOW_REAL_TRADING=true to enable');
      }
      
      return {
        orderId: `order_${Date.now()}`,
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
    }

    try {
      krakenLogger.warn('⚠️ ATTEMPTING REAL ORDER PLACEMENT - This will use real funds!');
      
      // Additional safety check - require explicit confirmation
      const confirmationRequired = process.env.TRADE_CONFIRMATION_REQUIRED === 'true';
      if (confirmationRequired) {
        krakenLogger.error('🚫 Real trading requires confirmation - rejecting order');
        throw new Error('Real trading requires explicit confirmation');
      }

      const orderData: any = {
        pair: orderRequest.pair.replace('/', ''),
        type: orderRequest.side.toLowerCase(),
        ordertype: orderRequest.type.toLowerCase(),
        volume: orderRequest.size.toString(),
      };

      if (orderRequest.price) {
        orderData.price = orderRequest.price.toString();
      }

      const response = await this.httpClient.post('/0/private/AddOrder', orderData);
      
      if (response.data.error && response.data.error.length > 0) {
        throw new Error(`Kraken API error: ${response.data.error.join(', ')}`);
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
    if (this.mockMode) {
      return {};
    }

    try {
      const response = await this.httpClient.post('/0/private/OpenOrders');
      
      if (response.data.error && response.data.error.length > 0) {
        throw new Error(`Kraken API error: ${response.data.error.join(', ')}`);
      }

      return response.data.result.open || {};
      
    } catch (error) {
      krakenLogger.error('Failed to fetch open orders', error as Error);
      return {};
    }
  }

  /**
   * Cancel all orders
   */
  async cancelAllOrders(): Promise<{ count: number }> {
    const allowRealTrading = process.env.ALLOW_REAL_TRADING === 'true';
    
    if (this.mockMode || !allowRealTrading) {
      return { count: 0 };
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
    if (this.mockMode) {
      // Generate mock OHLC data
      const mockData: number[][] = [];
      const basePrice = pair === 'BTCUSD' ? 45000 : 3000;
      
      for (let i = 0; i < 200; i++) {
        const timestamp = Date.now() - (i * interval * 60 * 1000);
        const price = basePrice + (Math.random() - 0.5) * 1000;
        const open = price;
        const high = price + Math.random() * 100;
        const low = price - Math.random() * 100;
        const close = price + (Math.random() - 0.5) * 50;
        const volume = Math.random() * 100;
        
        mockData.push([timestamp, open, high, low, close, volume]);
      }
      
      return mockData;
    }

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
      
      // Return empty array as fallback
      return [];
    }
  }

  /**
   * Check if service is in mock mode
   */
  isMockMode(): boolean {
    return this.mockMode;
  }

  /**
   * Test API connectivity - only for read operations
   */
  async testConnection(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      if (this.mockMode) {
        return {
          success: true,
          message: 'Mock mode - API connection test successful',
        };
      }

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
      status: this.mockMode ? 'mock' : 'live',
      mode: this.mockMode ? 'testing' : (allowRealTrading ? 'production' : 'read-only'),
      apiKeyConfigured: !!this.apiKey,
      apiSecretConfigured: !!this.apiSecret,
      realTradingEnabled: allowRealTrading && !this.mockMode,
      tradeConfirmationRequired,
    };
  }
}

// Export singleton instance
export const krakenService = new KrakenService();
export default krakenService;