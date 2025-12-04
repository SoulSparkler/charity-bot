// import { logger, performanceLogger } from '../utils/logger'; // Unused imports
import { performanceLogger } from '../utils/logger';
import { sentimentService } from './sentimentService';
// import { krakenService } from './krakenService'; // Unused import
import { query } from '../db/db';
import { calculatePositionSize, calculateStopLossPrice, calculateRiskRewardRatio /*, clamp */ } from '../utils/math';

export interface RiskAssessment {
  maxRiskPerTrade: number; // 0-1 (percentage)
  maxDailyTrades: number;
  maxPositionSize: number; // in USD
  stopLossPercentage: number; // 0-1
  takeProfitPercentage: number; // 0-1
  recommendedPairs: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
}

export interface TradeRisk {
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  riskRewardRatio: number;
  positionSize: number;
  riskAmount: number; // in USD
  potentialLoss: number; // in USD
  potentialGain: number; // in USD
}

export interface BotRiskProfile {
  maxDailyLoss: number; // in USD
  maxDrawdown: number; // 0-1
  maxOpenPositions: number;
  riskPerTradeMultiplier: number;
  conservativeMode: boolean;
}

class RiskEngine {
  private readonly DEFAULT_BOT_RISK_PROFILES = {
    A: {
      maxDailyLoss: 100, // $100 max daily loss
      maxDrawdown: 0.05, // 5% max drawdown
      maxOpenPositions: 3,
      riskPerTradeMultiplier: 1.0, // Normal risk
      conservativeMode: false,
    },
    B: {
      maxDailyLoss: 50, // $50 max daily loss for donation bot
      maxDrawdown: 0.02, // 2% max drawdown
      maxOpenPositions: 2,
      riskPerTradeMultiplier: 0.5, // Half risk
      conservativeMode: true,
    },
  };

  /**
   * Assess overall market risk for a bot
   */
  async assessRisk(botId: 'A' | 'B', mcs?: number): Promise<RiskAssessment> {
    try {
      // Get MCS if not provided
      const marketConfidenceScore = mcs !== undefined ? mcs : await sentimentService.getLatestMCS();
      
      // Get current bot state
      const botState = await this.getBotState(botId);
      const currentBalance = botId === 'A' ? botState.botA_virtual_usd : botState.botB_virtual_usd;
      
      // Calculate risk parameters based on MCS
      const baseRisk = this.calculateBaseRisk(marketConfidenceScore, botId);
      const dailyTradeLimit = this.calculateDailyTradeLimit(marketConfidenceScore, botId);
      const recommendedPairs = this.recommendTradingPairs(marketConfidenceScore);

      // Apply bot-specific adjustments
      const profile = this.DEFAULT_BOT_RISK_PROFILES[botId];
      const adjustedRisk = baseRisk * profile.riskPerTradeMultiplier;

      // Calculate position sizing
      const maxPositionSize = currentBalance * adjustedRisk;

      // Determine stop loss and take profit levels
      const { stopLossPercentage, takeProfitPercentage } = this.calculateRiskLevels(marketConfidenceScore, botId);

      // Determine overall risk level
      const riskLevel = this.determineRiskLevel(adjustedRisk, marketConfidenceScore);

      performanceLogger.info(`Risk Assessment for Bot ${botId}:`);
      performanceLogger.info(`- MCS: ${marketConfidenceScore.toFixed(3)}`);
      performanceLogger.info(`- Max Risk/Trade: ${(adjustedRisk * 100).toFixed(2)}%`);
      performanceLogger.info(`- Max Daily Trades: ${dailyTradeLimit}`);
      performanceLogger.info(`- Risk Level: ${riskLevel}`);

      return {
        maxRiskPerTrade: adjustedRisk,
        maxDailyTrades: dailyTradeLimit,
        maxPositionSize,
        stopLossPercentage,
        takeProfitPercentage,
        recommendedPairs,
        riskLevel,
      };
    } catch (error) {
      performanceLogger.error(`Failed to assess risk for Bot ${botId}`, error as Error);
      throw error;
    }
  }

  /**
   * Calculate trade-specific risk
   */
  calculateTradeRisk(
    entryPrice: number,
    balance: number,
    riskPerTrade: number,
    stopLossPercentage: number,
    takeProfitPercentage: number,
    isLongPosition: boolean = true
  ): TradeRisk {
    try {
      // Calculate position size
      const positionSize = calculatePositionSize(balance, riskPerTrade);
      const quantity = positionSize / entryPrice;

      // Calculate stop loss and take profit prices
      const stopLossPrice = calculateStopLossPrice(entryPrice, stopLossPercentage, isLongPosition);
      const takeProfitPrice = calculateStopLossPrice(entryPrice, takeProfitPercentage, isLongPosition);

      // Calculate risk/reward ratio
      const riskRewardRatio = calculateRiskRewardRatio(
        entryPrice,
        stopLossPrice,
        takeProfitPrice,
        isLongPosition
      );

      // Calculate risk amounts
      const riskAmount = positionSize * riskPerTrade;
      const potentialLoss = quantity * Math.abs(entryPrice - stopLossPrice);
      const potentialGain = quantity * Math.abs(takeProfitPrice - entryPrice);

      return {
        entryPrice,
        stopLossPrice,
        takeProfitPrice,
        riskRewardRatio,
        positionSize,
        riskAmount,
        potentialLoss,
        potentialGain,
      };
    } catch (error) {
      performanceLogger.error('Failed to calculate trade risk', error as Error);
      throw error;
    }
  }

  /**
   * Check if trade is within risk limits
   */
  async validateTrade(botId: 'A' | 'B', tradeRisk: TradeRisk, pair: string): Promise<{
    approved: boolean;
    reasons: string[];
    adjustments?: Partial<TradeRisk>;
  }> {
    try {
      const reasons: string[] = [];
      let approved = true;

      // Get current bot state
      const botState = await this.getBotState(botId);
      const currentBalance = botId === 'A' ? botState.botA_virtual_usd : botState.botB_virtual_usd;

      // Check position size limits
      if (tradeRisk.positionSize > currentBalance) {
        reasons.push(`Position size ($${tradeRisk.positionSize.toFixed(2)}) exceeds balance ($${currentBalance.toFixed(2)})`);
        approved = false;
      }

      // Check risk/reward ratio
      if (tradeRisk.riskRewardRatio < 1.5) {
        reasons.push(`Risk/reward ratio (${tradeRisk.riskRewardRatio.toFixed(2)}) too low (minimum 1.5)`);
        approved = false;
      }

      // Check daily loss limits
      const dailyLoss = await this.getDailyLoss(botId);
      const profile = this.DEFAULT_BOT_RISK_PROFILES[botId];

      if (dailyLoss + tradeRisk.potentialLoss > profile.maxDailyLoss) {
        reasons.push(`Trade would exceed daily loss limit ($${dailyLoss.toFixed(2)} + $${tradeRisk.potentialLoss.toFixed(2)} > $${profile.maxDailyLoss})`);
        approved = false;
      }

      // Check open positions
      const openPositions = await this.getOpenPositionsCount(botId);
      if (openPositions >= profile.maxOpenPositions) {
        reasons.push(`Maximum open positions reached (${openPositions}/${profile.maxOpenPositions})`);
        approved = false;
      }

      // Validate pair
      const validPairs = ['BTC/USD', 'ETH/USD'];
      if (!validPairs.includes(pair)) {
        reasons.push(`Invalid trading pair: ${pair}`);
        approved = false;
      }

      return { approved, reasons };
    } catch (error) {
      performanceLogger.error('Failed to validate trade', error as Error);
      return {
        approved: false,
        reasons: ['Risk validation failed due to system error'],
      };
    }
  }

  /**
   * Calculate base risk percentage based on MCS
   */
  private calculateBaseRisk(mcs: number, botId: 'A' | 'B'): number {
    let baseRisk: number;

    if (mcs >= 0.7) {
      // High confidence - increase risk for Bot A, moderate for Bot B
      baseRisk = botId === 'A' ? 0.05 : 0.01; // 5% for A, 1% for B
    } else if (mcs >= 0.4) {
      // Medium confidence
      baseRisk = botId === 'A' ? 0.02 : 0.005; // 2% for A, 0.5% for B
    } else {
      // Low confidence - minimal risk
      baseRisk = botId === 'A' ? 0.01 : 0.0025; // 1% for A, 0.25% for B
    }

    return baseRisk;
  }

  /**
   * Calculate daily trade limit based on MCS
   */
  private calculateDailyTradeLimit(mcs: number, botId: 'A' | 'B'): number {
    if (botId === 'A') {
      if (mcs >= 0.8) return 6;
      if (mcs >= 0.6) return 3;
      if (mcs >= 0.4) return 1;
      return 0;
    } else {
      // Bot B - more conservative
      if (mcs >= 0.7) return 2;
      if (mcs >= 0.5) return 1;
      return 0;
    }
  }

  /**
   * Recommend trading pairs based on market conditions
   */
  private recommendTradingPairs(mcs: number): string[] {
    const pairs = ['BTC/USD', 'ETH/USD'];
    
    // In low confidence markets, only trade BTC
    if (mcs < 0.4) {
      return ['BTC/USD'];
    }
    
    // In medium confidence, trade both but prefer BTC
    if (mcs < 0.7) {
      return ['BTC/USD', 'ETH/USD'];
    }
    
    // In high confidence, trade both equally
    return pairs;
  }

  /**
   * Calculate stop loss and take profit percentages
   */
  private calculateRiskLevels(mcs: number, botId: 'A' | 'B'): {
    stopLossPercentage: number;
    takeProfitPercentage: number;
  } {
    const profile = this.DEFAULT_BOT_RISK_PROFILES[botId];
    
    let stopLossPercentage: number;
    let takeProfitPercentage: number;

    if (profile.conservativeMode) {
      // Bot B - tighter stops, smaller targets
      stopLossPercentage = 0.02; // 2%
      takeProfitPercentage = 0.03; // 3%
    } else {
      // Bot A - wider stops, larger targets
      if (mcs >= 0.7) {
        stopLossPercentage = 0.04; // 4%
        takeProfitPercentage = 0.08; // 8%
      } else if (mcs >= 0.4) {
        stopLossPercentage = 0.03; // 3%
        takeProfitPercentage = 0.06; // 6%
      } else {
        stopLossPercentage = 0.02; // 2%
        takeProfitPercentage = 0.04; // 4%
      }
    }

    return { stopLossPercentage, takeProfitPercentage };
  }

  /**
   * Determine overall risk level
   */
  private determineRiskLevel(riskPerTrade: number, mcs: number): 'low' | 'medium' | 'high' | 'extreme' {
    if (riskPerTrade >= 0.05 || mcs >= 0.8) {
      return 'extreme';
    } else if (riskPerTrade >= 0.03 || mcs >= 0.6) {
      return 'high';
    } else if (riskPerTrade >= 0.01 || mcs >= 0.4) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Get bot state from database
   */
  private async getBotState(botId: 'A' | 'B'): Promise<any> {
    const result = await query(`
      SELECT botA_virtual_usd, botB_virtual_usd, botA_cycle_number, botA_cycle_target
      FROM bot_state 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      throw new Error('No bot state found in database');
    }

    return result.rows[0];
  }

  /**
   * Get daily loss for a bot
   */
  private async getDailyLoss(botId: 'A' | 'B'): Promise<number> {
    const result = await query(`
      SELECT COALESCE(SUM(CASE WHEN pnl_usd < 0 THEN pnl_usd ELSE 0 END), 0) as daily_loss
      FROM trade_logs 
      WHERE bot = $1 
        AND created_at >= CURRENT_DATE
    `, [botId]);

    return Math.abs(parseFloat(result.rows[0].daily_loss) || 0);
  }

  /**
   * Get number of open positions for a bot
   */
  private async getOpenPositionsCount(botId: 'A' | 'B'): Promise<number> {
    // This would typically check against actual open positions
    // For now, we'll use trade logs as a proxy
    const result = await query(`
      SELECT COUNT(*) as open_positions
      FROM trade_logs 
      WHERE bot = $1 
        AND created_at >= CURRENT_DATE
        AND (exit_price IS NULL OR exit_price = 0)
    `, [botId]);

    return parseInt(result.rows[0].open_positions) || 0;
  }

  /**
   * Get risk engine status
   */
  getStatus(): { profiles: BotRiskProfile[]; active: boolean } {
    return {
      profiles: Object.values(this.DEFAULT_BOT_RISK_PROFILES),
      active: true,
    };
  }
}

// Export singleton instance
export const riskEngine = new RiskEngine();
export default riskEngine;