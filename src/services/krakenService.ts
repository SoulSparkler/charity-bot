import { krakenLogger } from '../utils/logger';

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
  private mockMode: boolean = false;

  constructor() {
    this.apiKey = process.env.KRAKEN_API_KEY || '';
    this.mockMode = process.env.USE_MOCK_KRAKEN === 'true';

    if (!this.apiKey && !this.mockMode) {
      krakenLogger.warn('No Kraken API key provided. KrakenService will not work properly.');
    }

    if (this.mockMode) {
      krakenLogger.info('🧪 Running in MOCK MODE - no real API calls will be made');
    }
  }

  /**
   * Get account balances
   */
  async getBalances(): Promise<KrakenBalance> {
    if (this.mockMode) {
      return {
        'ZUSD': '50000.00',
        'XXBT': '1.5',
        'XETH': '20.0',
      };
    }
    // Simplified version - no real API calls for demo
    krakenLogger.warn('Real API calls not implemented in demo mode');
    return {};
  }

  /**
   * Get total USD value of all holdings
   */
  async getTotalUSDValue(): Promise<number> {
    if (this.mockMode) {
      return 50000; // Mock balance
    }
    return 50000; // Default for demo
  }

  /**
   * Get ticker information
   */
  async getTicker(pairs: string[]): Promise<{ [pair: string]: KrakenTicker }> {
    if (this.mockMode) {
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

    // Simplified version for demo
    const tickerData: { [pair: string]: KrakenTicker } = {};
    pairs.forEach(pair => {
      tickerData[pair.toUpperCase()] = {
        pair: pair.toUpperCase(),
        price: '45000.00',
        volume: '1000.0',
        timestamp: Date.now(),
      };
    });
    
    return tickerData;
  }

  /**
   * Place an order
   */
  async placeSpotOrder(orderRequest: PlaceOrderRequest): Promise<KrakenOrder> {
    if (this.mockMode) {
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

    // Simplified for demo
    krakenLogger.warn('Real order placement not implemented in demo mode');
    throw new Error('Real trading not implemented');
  }

  /**
   * Get open orders
   */
  async getOpenOrders(): Promise<{ [orderId: string]: any }> {
    if (this.mockMode) {
      return {};
    }
    return {};
  }

  /**
   * Cancel all orders
   */
  async cancelAllOrders(): Promise<{ count: number }> {
    if (this.mockMode) {
      return { count: 0 };
    }
    return { count: 0 };
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

    // Simplified for demo
    return [];
  }

  /**
   * Check if service is in mock mode
   */
  isMockMode(): boolean {
    return this.mockMode;
  }

  /**
   * Get service status
   */
  getStatus(): { status: string; mode: string; apiKeyConfigured: boolean } {
    return {
      status: this.mockMode ? 'mock' : 'live',
      mode: this.mockMode ? 'testing' : 'production',
      apiKeyConfigured: !!this.apiKey,
    };
  }
}

// Export singleton instance
export const krakenService = new KrakenService();
export default krakenService;