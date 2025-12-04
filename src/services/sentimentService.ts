import axios from 'axios';
import { query } from '../db/db';
import { sentimentLogger } from '../utils/logger';
import { krakenService } from './krakenService';
import { calculateEMA, clamp } from '../utils/math';

export interface SentimentReading {
  id?: string;
  fgi_value: number;
  trend_score: number;
  mcs: number;
  created_at?: Date;
}

export interface FearGreedResponse {
  value: string;
  value_classification: string;
  timestamp: string;
  time_until_update?: string;
}

export interface TrendAnalysis {
  price: number;
  ema200: number;
  trendScore: number;
  signal: 'bullish' | 'bearish' | 'neutral';
}

class SentimentService {
  private fgiApiUrl = 'https://api.alternative.me/fng/';
  private lastFgiFetch = 0;
  private readonly FGI_FETCH_INTERVAL = 15 * 60 * 1000; // 15 minutes

  /**
   * Fetch Fear & Greed Index from external API
   */
  async fetchFearGreed(): Promise<number> {
    try {
      const now = Date.now();
      
      // Check if we need to fetch new data (avoid API rate limiting)
      if (now - this.lastFgiFetch < this.FGI_FETCH_INTERVAL) {
        sentimentLogger.debug('Skipping FGI fetch - recently updated');
        const latest = await this.getLatestFGValue();
        return latest;
      }

      const response = await axios.get<{ data: FearGreedResponse[] }>(this.fgiApiUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'CharityBot/1.0.0',
        },
      });

      if (!response.data.data || response.data.data.length === 0) {
        throw new Error('No FGI data received from API');
      }

      const fgiValue = parseInt(response.data.data[0].value);
      
      if (isNaN(fgiValue) || fgiValue < 0 || fgiValue > 100) {
        throw new Error(`Invalid FGI value received: ${fgiValue}`);
      }

      this.lastFgiFetch = now;
      sentimentLogger.info(`Fetched Fear & Greed Index: ${fgiValue}`);

      // Save to database
      await this.saveFgiReading(fgiValue);

      return fgiValue;
    } catch (error) {
      sentimentLogger.error('Failed to fetch Fear & Greed Index', error as Error);
      
      // Return cached value or default
      const cached = await this.getLatestFGValue();
      return cached !== -1 ? cached : 50; // Default neutral value
    }
  }

  /**
   * Calculate trend score based on EMA200 analysis
   */
  async calculateTrendScore(): Promise<number> {
    try {
      // Get OHLC data for BTC/USD from Kraken
      const ohlcData = await krakenService.getOHLC('BTCUSD', 60); // 1 hour intervals
      
      if (!ohlcData || ohlcData.length < 200) {
        sentimentLogger.warn('Insufficient OHLC data for trend analysis');
        return 0; // Neutral trend score
      }

      // Extract closing prices
      const closingPrices = ohlcData.map((candle: number[]) => candle[4]); // Close price is at index 4

      // Calculate EMA200
      const ema200 = calculateEMA(closingPrices, 200);
      
      // Get current price (most recent closing price)
      const currentPrice = closingPrices[closingPrices.length - 1];

      // Calculate trend score
      const priceDifference = (currentPrice - ema200) / ema200;
      let trendScore = 0;

      if (priceDifference > 0.02) { // 2% above EMA200
        trendScore = 0.2; // Bullish
      } else if (priceDifference < -0.02) { // 2% below EMA200
        trendScore = -0.2; // Bearish
      } else {
        trendScore = 0; // Neutral
      }

      sentimentLogger.debug(`Trend Analysis - Price: $${currentPrice}, EMA200: $${ema200.toFixed(2)}, Score: ${trendScore}`);

      return trendScore;
    } catch (error) {
      sentimentLogger.error('Failed to calculate trend score', error as Error);
      return 0; // Return neutral on error
    }
  }

  /**
   * Calculate Market Confidence Score (MCS)
   */
  async calculateMCS(): Promise<number> {
    try {
      // Get FGI value
      const fgiValue = await this.fetchFearGreed();
      
      // Get trend score
      const trendScore = await this.calculateTrendScore();

      // Calculate MCS based on FGI buckets
      let mcs = 0;
      if (fgiValue <= 20) {
        mcs = 0.1;
      } else if (fgiValue <= 40) {
        mcs = 0.3;
      } else if (fgiValue <= 60) {
        mcs = 0.6;
      } else if (fgiValue <= 80) {
        mcs = 0.8;
      } else {
        mcs = 1.0;
      }

      // Add trend bonus
      mcs += trendScore;

      // Clamp to 0-1 range
      mcs = clamp(mcs, 0, 1);

      // Save to database
      await this.saveSentimentReading(fgiValue, trendScore, mcs);

      sentimentLogger.info(`MCS Calculated - FGI: ${fgiValue}, Trend: ${trendScore}, MCS: ${mcs.toFixed(3)}`);

      return mcs;
    } catch (error) {
      sentimentLogger.error('Failed to calculate MCS', error as Error);
      // Return neutral MCS on error
      return 0.5;
    }
  }

  /**
   * Get latest MCS from database
   */
  async getLatestMCS(): Promise<number> {
    try {
      const result = await query(`
        SELECT mcs FROM sentiment_readings 
        ORDER BY created_at DESC 
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        sentimentLogger.warn('No sentiment readings found in database');
        return 0.5; // Return neutral MCS
      }

      return parseFloat(result.rows[0].mcs);
    } catch (error) {
      sentimentLogger.error('Failed to get latest MCS', error as Error);
      return 0.5; // Return neutral MCS on error
    }
  }

  /**
   * Get latest FGI value from database
   */
  async getLatestFGValue(): Promise<number> {
    try {
      const result = await query(`
        SELECT fgi_value FROM sentiment_readings 
        ORDER BY created_at DESC 
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        return -1; // No data available
      }

      return parseInt(result.rows[0].fgi_value);
    } catch (error) {
      sentimentLogger.error('Failed to get latest FGI value', error as Error);
      return -1;
    }
  }

  /**
   * Get trend analysis for a specific pair
   */
  async getTrendAnalysis(pair: string = 'BTCUSD'): Promise<TrendAnalysis> {
    try {
      const ohlcData = await krakenService.getOHLC(pair, 60);
      
      if (!ohlcData || ohlcData.length < 200) {
        throw new Error(`Insufficient data for trend analysis of ${pair}`);
      }

      const closingPrices = ohlcData.map((candle: number[]) => candle[4]);
      const ema200 = calculateEMA(closingPrices, 200);
      const currentPrice = closingPrices[closingPrices.length - 1];
      
      const priceDifference = (currentPrice - ema200) / ema200;
      let trendScore = 0;
      let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';

      if (priceDifference > 0.02) {
        trendScore = 0.2;
        signal = 'bullish';
      } else if (priceDifference < -0.02) {
        trendScore = -0.2;
        signal = 'bearish';
      }

      return {
        price: currentPrice,
        ema200,
        trendScore,
        signal,
      };
    } catch (error) {
      sentimentLogger.error(`Failed to get trend analysis for ${pair}`, error as Error);
      throw error;
    }
  }

  /**
   * Get sentiment statistics for a given period
   */
  async getSentimentStatistics(days: number = 30): Promise<{
    averageMCS: number;
    averageFGI: number;
    maxMCS: number;
    minMCS: number;
    readingsCount: number;
  }> {
    try {
      const result = await query(`
        SELECT 
          AVG(mcs) as avg_mcs,
          AVG(fgi_value) as avg_fgi,
          MAX(mcs) as max_mcs,
          MIN(mcs) as min_mcs,
          COUNT(*) as readings_count
        FROM sentiment_readings 
        WHERE created_at >= NOW() - INTERVAL '${days} days'
      `);

      if (result.rows.length === 0) {
        return {
          averageMCS: 0.5,
          averageFGI: 50,
          maxMCS: 0.5,
          minMCS: 0.5,
          readingsCount: 0,
        };
      }

      const row = result.rows[0];
      return {
        averageMCS: parseFloat(row.avg_mcs) || 0.5,
        averageFGI: parseFloat(row.avg_fgi) || 50,
        maxMCS: parseFloat(row.max_mcs) || 0.5,
        minMCS: parseFloat(row.min_mcs) || 0.5,
        readingsCount: parseInt(row.readings_count) || 0,
      };
    } catch (error) {
      sentimentLogger.error('Failed to get sentiment statistics', error as Error);
      return {
        averageMCS: 0.5,
        averageFGI: 50,
        maxMCS: 0.5,
        minMCS: 0.5,
        readingsCount: 0,
      };
    }
  }

  /**
   * Save FGI reading to database
   */
  private async saveFgiReading(fgiValue: number): Promise<void> {
    try {
      await query(`
        INSERT INTO sentiment_readings (fgi_value, trend_score, mcs)
        VALUES ($1, 0, 0)
      `, [fgiValue]);
    } catch (error) {
      sentimentLogger.error('Failed to save FGI reading', error as Error);
      throw error;
    }
  }

  /**
   * Save complete sentiment reading to database
   */
  private async saveSentimentReading(fgiValue: number, trendScore: number, mcs: number): Promise<void> {
    try {
      await query(`
        INSERT INTO sentiment_readings (fgi_value, trend_score, mcs)
        VALUES ($1, $2, $3)
      `, [fgiValue, trendScore, mcs]);

      sentimentLogger.debug(`Saved sentiment reading - FGI: ${fgiValue}, Trend: ${trendScore}, MCS: ${mcs.toFixed(3)}`);
    } catch (error) {
      sentimentLogger.error('Failed to save sentiment reading', error as Error);
      throw error;
    }
  }

  /**
   * Clean old sentiment readings (keep last 1000 records)
   */
  async cleanOldReadings(): Promise<void> {
    try {
      const result = await query(`
        DELETE FROM sentiment_readings 
        WHERE id NOT IN (
          SELECT id FROM sentiment_readings 
          ORDER BY created_at DESC 
          LIMIT 1000
        )
      `);

      if (result.rowCount > 0) {
        sentimentLogger.info(`Cleaned ${result.rowCount} old sentiment readings`);
      }
    } catch (error) {
      sentimentLogger.error('Failed to clean old sentiment readings', error as Error);
    }
  }

  /**
   * Get service status
   */
  getStatus(): { lastFgiUpdate: number; nextAllowedUpdate: number; apiAvailable: boolean } {
    const now = Date.now();
    const timeUntilUpdate = this.lastFgiFetch + this.FGI_FETCH_INTERVAL - now;

    return {
      lastFgiUpdate: this.lastFgiFetch,
      nextAllowedUpdate: this.lastFgiFetch + this.FGI_FETCH_INTERVAL,
      apiAvailable: timeUntilUpdate <= 0,
    };
  }
}

// Export singleton instance
export const sentimentService = new SentimentService();
export default sentimentService;