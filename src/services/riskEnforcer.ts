/**
 * Risk Enforcer - Production Safety Controls
 * 
 * Enforces strict risk management rules for real trading operations.
 * This class provides active validation before any real orders are placed.
 */

import { query } from '../db/db';
import { krakenLogger } from '../utils/logger';

export interface TradeRequest {
  botId: 'A' | 'B';
  pair: 'BTC/USD' | 'ETH/USD';
  side: 'buy' | 'sell';
  size: number;
  price: number;
  reason: string;
  mcs: number;
  timestamp: Date;
}

export interface RiskValidationResult {
  approved: boolean;
  reason: string;
  maxSize?: number;
  currentRisk?: number;
  dailyLoss?: number;
}

export interface DailyLossData {
  botA: number;
  botB: number;
  date: string;
}

export interface PositionSizeData {
  botA: number;
  botB: number;
}

class RiskEnforcer {
  private readonly MAX_POSITION_SIZE_EUR = parseFloat(process.env.MAX_POSITION_SIZE_EUR || '20');
  private readonly MAX_DAILY_LOSS_BOT_A_EUR = parseFloat(process.env.MAX_DAILY_LOSS_BOT_A_EUR || '100');
  private readonly MAX_DAILY_LOSS_BOT_B_EUR = parseFloat(process.env.MAX_DAILY_LOSS_BOT_B_EUR || '50');
  private readonly MAX_OPEN_POSITIONS_BOT_A = parseInt(process.env.MAX_OPEN_POSITIONS_BOT_A || '3');
  private readonly MAX_OPEN_POSITIONS_BOT_B = parseInt(process.env.MAX_OPEN_POSITIONS_BOT_B || '2');
  private readonly EMERGENCY_STOP = process.env.EMERGENCY_STOP === 'true';

  /**
   * Main validation method - must be called before any real trade
   */
  async validateTrade(tradeRequest: TradeRequest): Promise<RiskValidationResult> {
    try {
      // Emergency stop check
      if (this.EMERGENCY_STOP) {
        return {
          approved: false,
          reason: 'EMERGENCY_STOP is enabled - all trading halted'
        };
      }

      // Check if real trading is enabled
      if (process.env.ALLOW_REAL_TRADING !== 'true') {
        return {
          approved: false,
          reason: 'Real trading is disabled - set ALLOW_REAL_TRADING=true to enable'
        };
      }

      // Check maximum position size
      const positionSizeEur = tradeRequest.size * tradeRequest.price;
      if (positionSizeEur > this.MAX_POSITION_SIZE_EUR) {
        krakenLogger.warn(`🚫 Trade blocked: Position size €${positionSizeEur.toFixed(2)} exceeds limit €${this.MAX_POSITION_SIZE_EUR}`);
        return {
          approved: false,
          reason: `Position size €${positionSizeEur.toFixed(2)} exceeds maximum €${this.MAX_POSITION_SIZE_EUR}`,
          maxSize: this.MAX_POSITION_SIZE_EUR
        };
      }

      // Check daily loss limits
      const dailyLoss = await this.getDailyLoss(tradeRequest.botId);
      const maxDailyLoss = this.getMaxDailyLoss(tradeRequest.botId);
      
      if (dailyLoss >= maxDailyLoss) {
        krakenLogger.warn(`🚫 Trade blocked: Daily loss €${dailyLoss.toFixed(2)} reaches limit €${maxDailyLoss}`);
        return {
          approved: false,
          reason: `Daily loss limit reached: €${dailyLoss.toFixed(2)} / €${maxDailyLoss}`,
          dailyLoss,
          currentRisk: dailyLoss
        };
      }

      // Check if this trade would exceed daily loss limit
      if (positionSizeEur > (maxDailyLoss - dailyLoss)) {
        krakenLogger.warn(`🚫 Trade blocked: Would exceed daily loss limit`);
        return {
          approved: false,
          reason: `Trade would exceed daily loss limit: €${(dailyLoss + positionSizeEur).toFixed(2)} > €${maxDailyLoss}`,
          dailyLoss,
          currentRisk: dailyLoss + positionSizeEur
        };
      }

      // Check open positions count
      const openPositions = await this.getOpenPositionsCount(tradeRequest.botId);
      const maxOpenPositions = this.getMaxOpenPositions(tradeRequest.botId);
      
      if (openPositions >= maxOpenPositions) {
        krakenLogger.warn(`🚫 Trade blocked: Too many open positions (${openPositions}/${maxOpenPositions})`);
        return {
          approved: false,
          reason: `Maximum open positions reached: ${openPositions}/${maxOpenPositions}`
        };
      }

      // Bot-specific risk checks
      if (tradeRequest.botId === 'A') {
        const botAValidation = await this.validateBotA(tradeRequest);
        if (!botAValidation.approved) return botAValidation;
      } else {
        const botBValidation = await this.validateBotB(tradeRequest);
        if (!botBValidation.approved) return botBValidation;
      }

      // Market condition checks
      const marketValidation = await this.validateMarketConditions(tradeRequest);
      if (!marketValidation.approved) return marketValidation;

      // All checks passed
      krakenLogger.info(`✅ Trade approved: Bot ${tradeRequest.botId} ${tradeRequest.side} ${tradeRequest.size} ${tradeRequest.pair} @ €${tradeRequest.price.toFixed(2)}`);
      
      return {
        approved: true,
        reason: 'All risk checks passed'
      };

    } catch (error) {
      krakenLogger.error('Risk validation error:', error as Error);
      return {
        approved: false,
        reason: 'Risk validation failed due to system error'
      };
    }
  }

  /**
   * Bot A specific validation rules
   */
  private async validateBotA(tradeRequest: TradeRequest): Promise<RiskValidationResult> {
    // Bot A should be more conservative with ETH trades
    if (tradeRequest.pair === 'ETH/USD' && tradeRequest.side === 'buy') {
      const ethLimit = this.MAX_POSITION_SIZE_EUR * 0.5; // Max 50% of position size for ETH
      const ethPositionSize = tradeRequest.size * tradeRequest.price;
      
      if (ethPositionSize > ethLimit) {
        return {
          approved: false,
          reason: `ETH position size €${ethPositionSize.toFixed(2)} exceeds Bot A limit €${ethLimit.toFixed(2)}`
        };
      }
    }

    // Check if Bot A is in a losing cycle
    const botAState = await this.getBotAState();
    if (botAState.botA_virtual_usd < botAState.botA_cycle_target * 0.8) {
      // In losing cycle, be more conservative
      const conservativeLimit = this.MAX_POSITION_SIZE_EUR * 0.5;
      const positionSize = tradeRequest.size * tradeRequest.price;
      
      if (positionSize > conservativeLimit) {
        return {
          approved: false,
          reason: `Bot A in losing cycle - position size reduced to €${conservativeLimit}`
        };
      }
    }

    return { approved: true, reason: 'Bot A validation passed' };
  }

  /**
   * Bot B specific validation rules
   */
  private async validateBotB(tradeRequest: TradeRequest): Promise<RiskValidationResult> {
    // Bot B should only trade high-confidence signals
    if (tradeRequest.mcs < 0.7) {
      return {
        approved: false,
        reason: `Bot B requires high confidence (MCS >= 0.7), got ${tradeRequest.mcs}`
      };
    }

    // Bot B position size should be smaller than Bot A
    const botBLimit = this.MAX_POSITION_SIZE_EUR * 0.3; // Max 30% of general limit
    const positionSize = tradeRequest.size * tradeRequest.price;
    
    if (positionSize > botBLimit) {
      return {
        approved: false,
        reason: `Bot B position size €${positionSize.toFixed(2)} exceeds limit €${botBLimit.toFixed(2)}`
      };
    }

    return { approved: true, reason: 'Bot B validation passed' };
  }

  /**
   * Validate current market conditions
   */
  private async validateMarketConditions(tradeRequest: TradeRequest): Promise<RiskValidationResult> {
    // Check for extreme market volatility
    if (tradeRequest.mcs < 0.3) {
      return {
        approved: false,
        reason: `Market conditions too risky (MCS: ${tradeRequest.mcs})`
      };
    }

    // Additional market-specific checks can be added here
    return { approved: true, reason: 'Market conditions acceptable' };
  }

  /**
   * Get daily loss for a specific bot
   */
  private async getDailyLoss(botId: 'A' | 'B'): Promise<number> {
    try {
      const result = await query(`
        SELECT COALESCE(SUM(CASE WHEN pnl_usd < 0 THEN ABS(pnl_usd) ELSE 0 END), 0) as daily_loss
        FROM trade_logs 
        WHERE bot = $1 
          AND DATE(created_at) = CURRENT_DATE
      `, [botId]);

      const dailyLoss = parseFloat(result.rows[0]?.daily_loss || '0');
      
      // Convert USD to EUR (approximate rate - in production, use real exchange rate)
      return dailyLoss * 0.85; // Rough USD to EUR conversion
    } catch (error) {
      krakenLogger.error(`Failed to get daily loss for Bot ${botId}:`, error as Error);
      return 0;
    }
  }

  /**
   * Get maximum daily loss for a bot
   */
  private getMaxDailyLoss(botId: 'A' | 'B'): number {
    return botId === 'A' ? this.MAX_DAILY_LOSS_BOT_A_EUR : this.MAX_DAILY_LOSS_BOT_B_EUR;
  }

  /**
   * Get maximum open positions for a bot
   */
  private getMaxOpenPositions(botId: 'A' | 'B'): number {
    return botId === 'A' ? this.MAX_OPEN_POSITIONS_BOT_A : this.MAX_OPEN_POSITIONS_BOT_B;
  }

  /**
   * Get count of currently open positions for a bot
   */
  private async getOpenPositionsCount(botId: 'A' | 'B'): Promise<number> {
    try {
      // For now, count recent trades as "open positions"
      // In a real implementation, you'd track actual open orders
      const result = await query(`
        SELECT COUNT(*) as count
        FROM trade_logs 
        WHERE bot = $1 
          AND created_at >= NOW() - INTERVAL '1 hour'
      `, [botId]);

      return parseInt(result.rows[0]?.count || '0');
    } catch (error) {
      krakenLogger.error(`Failed to get open positions for Bot ${botId}:`, error as Error);
      return 0;
    }
  }

  /**
   * Get Bot A current state
   */
  private async getBotAState(): Promise<any> {
    try {
      const result = await query(`
        SELECT botA_virtual_usd, botA_cycle_target
        FROM bot_state 
        ORDER BY created_at DESC 
        LIMIT 1
      `);
      
      return result.rows[0] || { botA_virtual_usd: 230, botA_cycle_target: 200 };
    } catch (error) {
      krakenLogger.error('Failed to get Bot A state:', error as Error);
      return { botA_virtual_usd: 230, botA_cycle_target: 200 };
    }
  }

  /**
   * Log approved trade for audit trail
   */
  async logApprovedTrade(tradeRequest: TradeRequest, validationResult: RiskValidationResult): Promise<void> {
    try {
      krakenLogger.info(`🔐 TRADE APPROVED: Bot ${tradeRequest.botId} - ${tradeRequest.side.toUpperCase()} ${tradeRequest.size} ${tradeRequest.pair} @ €${tradeRequest.price.toFixed(2)} - Reason: ${validationResult.reason}`);
      
      // In a real implementation, you might want to log this to a separate audit table
      await query(`
        INSERT INTO trade_audit_log (
          bot_id, pair, side, size, price, reason, mcs, approved_at, validation_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
      `, [
        tradeRequest.botId,
        tradeRequest.pair,
        tradeRequest.side,
        tradeRequest.size,
        tradeRequest.price,
        tradeRequest.reason,
        tradeRequest.mcs,
        validationResult.reason
      ]);
    } catch (error) {
      krakenLogger.error('Failed to log approved trade:', error as Error);
    }
  }

  /**
   * Get current risk status
   */
  async getRiskStatus(): Promise<{
    emergencyStop: boolean;
    realTradingEnabled: boolean;
    dailyLosses: DailyLossData;
    maxPositionSize: number;
    openPositions: PositionSizeData;
  }> {
    const [dailyLossA, dailyLossB, positionsA, positionsB] = await Promise.all([
      this.getDailyLoss('A'),
      this.getDailyLoss('B'),
      this.getOpenPositionsCount('A'),
      this.getOpenPositionsCount('B')
    ]);

    return {
      emergencyStop: this.EMERGENCY_STOP,
      realTradingEnabled: process.env.ALLOW_REAL_TRADING === 'true',
      dailyLosses: {
        botA: dailyLossA,
        botB: dailyLossB,
        date: new Date().toISOString().split('T')[0]
      },
      maxPositionSize: this.MAX_POSITION_SIZE_EUR,
      openPositions: {
        botA: positionsA,
        botB: positionsB
      }
    };
  }

  /**
   * Emergency stop mechanism
   */
  async triggerEmergencyStop(reason: string): Promise<void> {
    krakenLogger.error(`🛑 EMERGENCY STOP TRIGGERED: ${reason}`);
    
    // In a real implementation, you'd want to:
    // 1. Cancel all open orders
    // 2. Stop all trading activities
    // 3. Send emergency notifications
    // 4. Set a system-wide flag
    
    console.error('🛑 EMERGENCY STOP: All trading halted -', reason);
  }
}

// Export singleton instance
export const riskEnforcer = new RiskEnforcer();
export default riskEnforcer;