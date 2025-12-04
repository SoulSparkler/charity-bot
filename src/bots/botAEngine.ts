import { query } from '../db/db';
import { krakenService } from '../services/krakenService';
import { sentimentService } from '../services/sentimentService';
import { riskEngine, RiskAssessment } from '../services/riskEngine';
import { botALogger } from '../utils/logger';

export interface BotAState {
  id: string;
  botA_virtual_usd: number;
  botB_virtual_usd: number;
  botA_cycle_number: number;
  botA_cycle_target: number;
  last_reset: Date;
}

export interface BotATrade {
  pair: 'BTC/USD' | 'ETH/USD';
  side: 'buy' | 'sell';
  size: number;
  entry_price: number;
  exit_price?: number;
  pnl_usd: number;
}

class BotAEngine {
  private readonly MIN_MCS_FOR_TRADING = 0.4;
  private readonly CYCLE_SEED_AMOUNT = 30; // USD that remains for next cycle
  private readonly TRANSFER_TO_B = 200; // USD transferred to Bot B when target hit


  /**
   * Main execution method for Bot A
   */
  async runBotAOnce(): Promise<{ success: boolean; message: string; trades?: BotATrade[] }> {
    try {
      botALogger.info('Starting Bot A execution cycle');

      // Load current state
      const state = await this.getBotAState();
      botALogger.info(`Current state - Balance: $${state.botA_virtual_usd}, Cycle: ${state.botA_cycle_number}, Target: $${state.botA_cycle_target}`);

      // Check if trading is allowed
      const mcs = await sentimentService.getLatestMCS();
      if (mcs < this.MIN_MCS_FOR_TRADING) {
        botALogger.info(`MCS too low for trading: ${mcs.toFixed(3)} < ${this.MIN_MCS_FOR_TRADING}`);
        return { success: true, message: `MCS too low: ${mcs.toFixed(3)}` };
      }

      // Get risk assessment
      const riskAssessment = await riskEngine.assessRisk('A', mcs);

      // Check if target is reached and cycle should be reset
      if (state.botA_virtual_usd >= state.botA_cycle_target) {
        await this.handleCycleCompletion(state);
        return { 
          success: true, 
          message: `Cycle ${state.botA_cycle_number} completed. Target: $${state.botA_cycle_target} reached.` 
        };
      }

      // Generate trading signals
      const signals = await this.generateTradingSignals();
      if (signals.length === 0) {
        botALogger.info('No trading signals generated');
        return { success: true, message: 'No trading signals' };
      }

      // Execute trades
      const executedTrades: BotATrade[] = [];
      
      for (const signal of signals) {
        try {
          const trade = await this.executeTrade(signal, state, riskAssessment);
          if (trade) {
            executedTrades.push(trade);
          }
        } catch (error) {
          botALogger.error(`Failed to execute trade for ${signal.pair}`, error as Error);
        }
      }

      if (executedTrades.length > 0) {
        botALogger.info(`Executed ${executedTrades.length} trades`);
      }

      return { 
        success: true, 
        message: `Bot A executed ${executedTrades.length} trades`,
        trades: executedTrades 
      };

    } catch (error) {
      botALogger.error('Bot A execution failed', error as Error);
      return { success: false, message: 'Bot A execution failed' };
    }
  }

  /**
   * Generate trading signals based on market conditions
   */
  private async generateTradingSignals(): Promise<Array<{
    pair: 'BTC/USD' | 'ETH/USD';
    side: 'buy' | 'sell';
    confidence: number;
  }>> {
    try {
      const signals: Array<{ pair: 'BTC/USD' | 'ETH/USD'; side: 'buy' | 'sell'; confidence: number }> = [];
      
      // Get current price data
      const trendAnalysis = await sentimentService.getTrendAnalysis('BTCUSD');

      // BTC/USD Signal
      if (trendAnalysis.signal === 'bullish') {
        signals.push({
          pair: 'BTC/USD',
          side: 'buy',
          confidence: 0.7 + (trendAnalysis.trendScore * 0.3),
        });
      } else if (trendAnalysis.signal === 'bearish') {
        // For bearish signal, we might sell or wait
        // In v1, we'll be conservative and wait
        botALogger.debug('Bearish signal - waiting for better conditions');
      }

      // ETH/USD Signal (simplified - follow BTC trend for now)
      if (trendAnalysis.signal === 'bullish' && Math.random() > 0.3) { // 70% chance to trade ETH when bullish
        signals.push({
          pair: 'ETH/USD',
          side: 'buy',
          confidence: 0.6,
        });
      }

      botALogger.debug(`Generated ${signals.length} trading signals`);
      return signals;

    } catch (error) {
      botALogger.error('Failed to generate trading signals', error as Error);
      return [];
    }
  }

  /**
   * Execute a single trade
   */
  private async executeTrade(
    signal: { pair: 'BTC/USD' | 'ETH/USD'; side: 'buy' | 'sell'; confidence: number },
    state: BotAState,
    riskAssessment: RiskAssessment
  ): Promise<BotATrade | null> {
    try {
      // Get current price
      const tickerData = await krakenService.getTicker([signal.pair.replace('/', '')]);
      const pairKey = signal.pair.replace('/', '').toUpperCase();
      const currentPrice = parseFloat(tickerData[pairKey].price);

      if (!currentPrice || currentPrice <= 0) {
        throw new Error(`Invalid price for ${signal.pair}: ${currentPrice}`);
      }

      // Calculate position size based on risk assessment
      const positionSize = Math.min(
        riskAssessment.maxPositionSize,
        state.botA_virtual_usd * riskAssessment.maxRiskPerTrade
      );

      if (positionSize < 10) { // Minimum $10 trade
        botALogger.debug(`Position size too small: $${positionSize.toFixed(2)}`);
        return null;
      }

      // For simplicity, we'll simulate instant execution with a small price improvement
      const executionPrice = signal.side === 'buy' ? 
        currentPrice * 0.999 : // Buy 0.1% below market
        currentPrice * 1.001;  // Sell 0.1% above market

      const size = positionSize / executionPrice;
      const simulatedPnL = this.simulatePnL(signal, executionPrice);

      // Log the trade
      const trade: BotATrade = {
        pair: signal.pair,
        side: signal.side,
        size,
        entry_price: executionPrice,
        pnl_usd: simulatedPnL,
      };

      // Save trade to database
      await this.logTrade(trade);

      // Update virtual balance
      await this.updateVirtualBalance(state.id, simulatedPnL);

      // Log successful trade
      botALogger.trade('A', signal.pair, signal.side, size, executionPrice, simulatedPnL);

      return trade;

    } catch (error) {
      botALogger.error(`Failed to execute trade for ${signal.pair}`, error as Error);
      return null;
    }
  }

  /**
   * Simulate P&L for a trade (for v1 - in real implementation, this would track actual positions)
   */
  private simulatePnL(signal: { pair: string; side: 'buy' | 'sell'; confidence: number }, _entryPrice: number): number {
    // Simple simulation: trades are successful based on confidence
    const successProbability = signal.confidence;
    const isSuccess = Math.random() < successProbability;

    if (isSuccess) {
      // Successful trade: 2-8% gain
      const gainPercentage = 0.02 + (Math.random() * 0.06);
      const positionSize = 50; // Assume $50 position for simulation
      return positionSize * gainPercentage;
    } else {
      // Failed trade: 1-4% loss
      const lossPercentage = 0.01 + (Math.random() * 0.03);
      const positionSize = 50;
      return -(positionSize * lossPercentage);
    }
  }

  /**
   * Handle cycle completion - transfer funds to Bot B and reset
   */
  private async handleCycleCompletion(state: BotAState): Promise<void> {
    try {
      botALogger.cycle('A', state.botA_cycle_number, state.botA_cycle_target, state.botA_virtual_usd);
      botALogger.info(`Cycle ${state.botA_cycle_number} completed! Transferring $${this.TRANSFER_TO_B} to Bot B`);

      // Transfer to Bot B
      await query(`
        UPDATE bot_state 
        SET botB_virtual_usd = botB_virtual_usd + $1,
            botA_virtual_usd = $2,
            botA_cycle_number = botA_cycle_number + 1,
            botA_cycle_target = botA_cycle_target + $2,
            last_reset = NOW(),
            updated_at = NOW()
        WHERE id = $3
      `, [this.TRANSFER_TO_B, this.CYCLE_SEED_AMOUNT, state.id]);

      botALogger.info(`Cycle ${state.botA_cycle_number} completed. Next cycle target: $${(state.botA_cycle_target + this.CYCLE_SEED_AMOUNT).toFixed(2)}`);

    } catch (error) {
      botALogger.error('Failed to handle cycle completion', error as Error);
      throw error;
    }
  }

  /**
   * Get current Bot A state
   */
  private async getBotAState(): Promise<BotAState> {
    const result = await query(`
      SELECT id, botA_virtual_usd, botB_virtual_usd, botA_cycle_number, botA_cycle_target, last_reset
      FROM bot_state 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      // Initialize if no state exists
      await this.initializeBotAState();
      return this.getBotAState();
    }

    return result.rows[0];
  }

  /**
   * Initialize Bot A state if it doesn't exist
   */
  private async initializeBotAState(): Promise<void> {
    await query(`
      INSERT INTO bot_state (
        botA_virtual_usd, 
        botB_virtual_usd, 
        botA_cycle_number, 
        botA_cycle_target
      ) VALUES (230.00, 0.00, 1, 200.00)
    `);
    botALogger.info('Initialized Bot A state');
  }

  /**
   * Log trade to database
   */
  private async logTrade(trade: BotATrade): Promise<void> {
    await query(`
      INSERT INTO trade_logs (
        bot, pair, side, size, entry_price, exit_price, pnl_usd
      ) VALUES ('A', $1, $2, $3, $4, $5, $6)
    `, [
      'A',
      trade.pair,
      trade.side,
      trade.size,
      trade.entry_price,
      trade.exit_price,
      trade.pnl_usd,
    ]);
  }

  /**
   * Update virtual balance after trade
   */
  private async updateVirtualBalance(botStateId: string, pnl: number): Promise<void> {
    await query(`
      UPDATE bot_state 
      SET botA_virtual_usd = botA_virtual_usd + $1,
          updated_at = NOW()
      WHERE id = $2
    `, [pnl, botStateId]);
  }

  /**
   * Get Bot A statistics
   */
  async getBotAStatistics(days: number = 30): Promise<{
    totalTrades: number;
    winRate: number;
    totalPnL: number;
    averageTradeSize: number;
    currentCycle: number;
    cycleProgress: number;
  }> {
    try {
      // Get trade statistics
      const tradeStats = await query(`
        SELECT 
          COUNT(*) as total_trades,
          AVG(CASE WHEN pnl_usd > 0 THEN 1.0 ELSE 0.0 END) as win_rate,
          SUM(pnl_usd) as total_pnl,
          AVG(size * entry_price) as avg_trade_size
        FROM trade_logs 
        WHERE bot = 'A' 
          AND created_at >= NOW() - INTERVAL '${days} days'
      `);

      // Get current state
      const state = await this.getBotAState();

      const row = tradeStats.rows[0];
      const cycleProgress = state.botA_cycle_target > 0 ? 
        (state.botA_virtual_usd / state.botA_cycle_target) * 100 : 0;

      return {
        totalTrades: parseInt(row.total_trades) || 0,
        winRate: parseFloat(row.win_rate) || 0,
        totalPnL: parseFloat(row.total_pnl) || 0,
        averageTradeSize: parseFloat(row.avg_trade_size) || 0,
        currentCycle: state.botA_cycle_number,
        cycleProgress,
      };
    } catch (error) {
      botALogger.error('Failed to get Bot A statistics', error as Error);
      throw error;
    }
  }

  /**
   * Get Bot A status
   */
  async getStatus(): Promise<{
    active: boolean;
    balance: number;
    cycle: number;
    target: number;
    progress: number;
    mcs: number;
    trading: boolean;
  }> {
    try {
      const state = await this.getBotAState();
      const mcs = await sentimentService.getLatestMCS();
      const progress = state.botA_cycle_target > 0 ? 
        (state.botA_virtual_usd / state.botA_cycle_target) * 100 : 0;

      return {
        active: true,
        balance: state.botA_virtual_usd,
        cycle: state.botA_cycle_number,
        target: state.botA_cycle_target,
        progress,
        mcs,
        trading: mcs >= this.MIN_MCS_FOR_TRADING,
      };
    } catch (error) {
      botALogger.error('Failed to get Bot A status', error as Error);
      return {
        active: false,
        balance: 0,
        cycle: 0,
        target: 0,
        progress: 0,
        mcs: 0,
        trading: false,
      };
    }
  }
}

// Export singleton instance
export const botAEngine = new BotAEngine();
export default botAEngine;