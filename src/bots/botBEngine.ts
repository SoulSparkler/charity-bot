import { query } from '../db/db';
import { krakenService } from '../services/krakenService';
import { sentimentService } from '../services/sentimentService';
import { riskEngine, RiskAssessment } from '../services/riskEngine';
import { botBLogger, logger } from '../utils/logger';
import { calculatePnL } from '../utils/math';

export interface BotBState {
  id: string;
  botB_virtual_usd: number;
  monthly_start_balance: number;
  last_month_reset: Date;
}

export interface BotBTrade {
  pair: 'BTC/USD' | 'ETH/USD';
  side: 'buy' | 'sell';
  size: number;
  entry_price: number;
  exit_price?: number;
  pnl_usd: number;
}

export interface MonthlyReport {
  month: string;
  startBalance: number;
  endBalance: number;
  donationAmount: number;
  totalTrades: number;
  totalPnL: number;
}

class BotBEngine {
  private readonly MIN_MCS_FOR_TRADING = 0.5;
  private readonly DONATION_PERCENTAGE = 0.5; // 50% of profits donated monthly
  private readonly MAX_DAILY_TRADES = 2;

  /**
   * Main execution method for Bot B
   */
  async runBotBOnce(): Promise<{ success: boolean; message: string; trades?: BotBTrade[] }> {
    try {
      // Check if Bot B is enabled
      const isEnabled = await this.getBotBEnabledFlag();
      if (!isEnabled) {
        botBLogger.debug('[Bot-B] Not enabled. Skipping execution.');
        return { success: true, message: 'Bot B not enabled' };
      }

      botBLogger.info('Starting Bot B execution cycle');

      // Load current state
      const state = await this.getBotBState();
      botBLogger.info(`Current Bot B balance: $${state.botB_virtual_usd}`);

      // Check if trading is allowed
      const mcs = await sentimentService.getLatestMCS();
      if (mcs < this.MIN_MCS_FOR_TRADING) {
        botBLogger.info(`MCS too low for Bot B trading: ${mcs.toFixed(3)} < ${this.MIN_MCS_FOR_TRADING}`);
        return { success: true, message: `MCS too low: ${mcs.toFixed(3)}` };
      }

      // Check daily trade limit
      const todaysTrades = await this.getTodaysTradeCount();
      if (todaysTrades >= this.MAX_DAILY_TRADES) {
        botBLogger.info(`Daily trade limit reached: ${todaysTrades}/${this.MAX_DAILY_TRADES}`);
        return { success: true, message: 'Daily trade limit reached' };
      }

      // Get risk assessment
      const riskAssessment = await riskEngine.assessRisk('B', mcs);

      // Generate conservative trading signals
      const signals = await this.generateConservativeSignals();
      if (signals.length === 0) {
        botBLogger.info('No conservative trading signals generated');
        return { success: true, message: 'No trading signals' };
      }

      // Execute trades with strict risk management
      const executedTrades: BotBTrade[] = [];
      
      for (const signal of signals) {
        try {
          const trade = await this.executeConservativeTrade(signal, state, riskAssessment);
          if (trade) {
            executedTrades.push(trade);
          }
        } catch (error) {
          botBLogger.error(`Failed to execute conservative trade for ${signal.pair}`, error as Error);
        }
      }

      if (executedTrades.length > 0) {
        botBLogger.info(`Bot B executed ${executedTrades.length} conservative trades`);
      }

      return { 
        success: true, 
        message: `Bot B executed ${executedTrades.length} trades`,
        trades: executedTrades 
      };

    } catch (error) {
      botBLogger.error('Bot B execution failed', error as Error);
      return { success: false, message: 'Bot B execution failed' };
    }
  }

  /**
   * Generate conservative trading signals for Bot B
   */
  private async generateConservativeSignals(): Promise<Array<{
    pair: 'BTC/USD' | 'ETH/USD';
    side: 'buy' | 'sell';
    confidence: number;
  }>> {
    try {
      const signals: Array<{ pair: 'BTC/USD' | 'ETH/USD'; side: 'buy' | 'sell'; confidence: number }> = [];
      
      // Get current market data
      const tickerData = await krakenService.getTicker(['BTCUSD', 'ETHUSD']);
      const trendAnalysis = await sentimentService.getTrendAnalysis('BTCUSD');
      const mcs = await sentimentService.getLatestMCS();

      // Bot B only trades when there's strong bullish momentum
      if (trendAnalysis.signal === 'bullish' && mcs >= 0.7) {
        // BTC/USD - only trade with high confidence
        signals.push({
          pair: 'BTC/USD',
          side: 'buy',
          confidence: 0.8 + (trendAnalysis.trendScore * 0.2),
        });

        // ETH/USD - lower probability, only with very strong signals
        if (mcs >= 0.8 && Math.random() > 0.5) {
          signals.push({
            pair: 'ETH/USD',
            side: 'buy',
            confidence: 0.75,
          });
        }
      }

      // Bot B never trades on bearish signals - too conservative
      if (trendAnalysis.signal === 'bearish') {
        botBLogger.debug('Bearish signal detected - Bot B staying out of market');
      }

      botBLogger.debug(`Generated ${signals.length} conservative signals for Bot B`);
      return signals;

    } catch (error) {
      botBLogger.error('Failed to generate conservative signals', error as Error);
      return [];
    }
  }

  /**
   * Execute a conservative trade for Bot B
   */
  private async executeConservativeTrade(
    signal: { pair: 'BTC/USD' | 'ETH/USD'; side: 'buy' | 'sell'; confidence: number },
    state: BotBState,
    riskAssessment: RiskAssessment
  ): Promise<BotBTrade | null> {
    try {
      // Get current price
      const tickerData = await krakenService.getTicker([signal.pair.replace('/', '')]);
      const pairKey = signal.pair.replace('/', '').toUpperCase();
      const currentPrice = parseFloat(tickerData[pairKey].price);

      if (!currentPrice || currentPrice <= 0) {
        throw new Error(`Invalid price for ${signal.pair}: ${currentPrice}`);
      }

      // Very conservative position sizing - max 0.5% of balance
      const maxPositionSize = state.botB_virtual_usd * 0.005; // 0.5% max
      const riskBasedSize = state.botB_virtual_usd * riskAssessment.maxRiskPerTrade;
      const positionSize = Math.min(maxPositionSize, riskBasedSize);

      if (positionSize < 25) { // Minimum $25 trade for Bot B
        botBLogger.debug(`Position size too small for Bot B: $${positionSize.toFixed(2)}`);
        return null;
      }

      // Conservative execution - always at better than market price
      const executionPrice = signal.side === 'buy' ? 
        currentPrice * 0.998 : // Buy 0.2% below market
        currentPrice * 1.002;  // Sell 0.2% above market

      const size = positionSize / executionPrice;
      const simulatedPnL = this.simulateConservativePnL(signal, executionPrice);

      // Log the trade
      const trade: BotBTrade = {
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

      // Log conservative trade
      botBLogger.trade('B', signal.pair, signal.side, size, executionPrice, simulatedPnL);

      return trade;

    } catch (error) {
      botBLogger.error(`Failed to execute conservative trade for ${signal.pair}`, error as Error);
      return null;
    }
  }

  /**
   * Simulate P&L for Bot B trades (more conservative than Bot A)
   */
  private simulateConservativePnL(signal: { pair: string; side: 'buy' | 'sell'; confidence: number }, entryPrice: number): number {
    // Bot B has higher success rate but smaller profits
    const successProbability = Math.min(signal.confidence + 0.15, 0.95); // Boost confidence by 15%, cap at 95%
    const isSuccess = Math.random() < successProbability;

    if (isSuccess) {
      // Successful trade: 1-4% gain (smaller than Bot A)
      const gainPercentage = 0.01 + (Math.random() * 0.03);
      const positionSize = 25; // Smaller positions
      return positionSize * gainPercentage;
    } else {
      // Failed trade: 0.5-2% loss (smaller losses)
      const lossPercentage = 0.005 + (Math.random() * 0.015);
      const positionSize = 25;
      return -(positionSize * lossPercentage);
    }
  }

  /**
   * Process monthly donations
   */
  async processMonthlyDonations(): Promise<MonthlyReport | null> {
    try {
      botBLogger.info('Processing monthly donations...');

      // Get current month
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      // Check if report already exists for this month
      const existingReport = await query(`
        SELECT * FROM monthly_reports WHERE month = $1
      `, [currentMonth]);

      if (existingReport.rows.length > 0) {
        botBLogger.info('Monthly report already exists for current month');
        return null;
      }

      // Get start balance for this month
      const monthStartState = await query(`
        SELECT botB_virtual_usd, last_reset 
        FROM bot_state 
        WHERE created_at <= $1 
        ORDER BY created_at DESC 
        LIMIT 1
      `, [startOfMonth]);

      const startBalance = monthStartState.rows.length > 0 ? 
        parseFloat(monthStartState.rows[0].botB_virtual_usd) : 0;

      // Get current balance
      const currentState = await this.getBotBState();
      const endBalance = currentState.botB_virtual_usd;

      // Calculate profit and donation
      const monthProfit = endBalance - startBalance;
      const donationAmount = monthProfit > 0 ? monthProfit * this.DONATION_PERCENTAGE : 0;

      // Get trade statistics for the month
      const tradeStats = await query(`
        SELECT COUNT(*) as total_trades, SUM(pnl_usd) as total_pnl
        FROM trade_logs 
        WHERE bot = 'B' 
          AND created_at >= $1 
          AND created_at < $2
      `, [startOfMonth, new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)]);

      const totalTrades = parseInt(tradeStats.rows[0]?.total_trades) || 0;
      const totalPnL = parseFloat(tradeStats.rows[0]?.total_pnl) || 0;

      // Create monthly report
      const report: MonthlyReport = {
        month: currentMonth,
        startBalance,
        endBalance,
        donationAmount,
        totalTrades,
        totalPnL,
      };

      // Save report to database
      await query(`
        INSERT INTO monthly_reports (
          month, botB_start_balance, botB_end_balance, donation_amount
        ) VALUES ($1, $2, $3, $4)
      `, [
        report.month,
        report.startBalance,
        report.endBalance,
        report.donationAmount,
      ]);

      botBLogger.info(`Monthly Report for ${currentMonth}:`);
      botBLogger.info(`- Start Balance: $${startBalance.toFixed(2)}`);
      botBLogger.info(`- End Balance: $${endBalance.toFixed(2)}`);
      botBLogger.info(`- Profit: $${monthProfit.toFixed(2)}`);
      botBLogger.info(`- Donation Amount: $${donationAmount.toFixed(2)} (50% of profit)`);
      botBLogger.info(`- Total Trades: ${totalTrades}`);

      return report;

    } catch (error) {
      botBLogger.error('Failed to process monthly donations', error as Error);
      return null;
    }
  }

  /**
   * Get Bot B enabled flag from database
   */
  private async getBotBEnabledFlag(): Promise<boolean> {
    try {
      const result = await query(`
        SELECT botB_enabled
        FROM bot_state
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        return false;
      }

      return result.rows[0].botB_enabled === true;
    } catch (error) {
      botBLogger.error('Failed to get Bot B enabled flag', error as Error);
      return false;
    }
  }

  /**
   * Set Bot B enabled flag in database
   */
  private async setBotBEnabledFlag(enabled: boolean): Promise<void> {
    try {
      await query(`
        UPDATE bot_state
        SET botB_enabled = $1,
            updated_at = NOW()
        WHERE id = (
          SELECT id FROM bot_state
          ORDER BY created_at DESC
          LIMIT 1
        )
      `, [enabled]);
    } catch (error) {
      botBLogger.error('Failed to set Bot B enabled flag', error as Error);
      throw error;
    }
  }

  /**
   * Enable Bot B from Bot A trigger
   */
  async enableBotBFromBotA(): Promise<void> {
    try {
      botBLogger.info('[Bot-B] Activation request received from Bot-A');
      await this.setBotBEnabledFlag(true);
      botBLogger.info('[Bot-B] Enabled for trading (triggered by Bot-A)');
    } catch (error) {
      botBLogger.error('[Bot-B] Failed to enable from Bot-A trigger', error as Error);
      throw error;
    }
  }

  /**
   * Get current Bot B state
   */
  private async getBotBState(): Promise<BotBState> {
    const result = await query(`
      SELECT id, botB_virtual_usd, last_reset
      FROM bot_state
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      // Initialize if no state exists
      await this.initializeBotBState();
      return this.getBotBState();
    }

    return result.rows[0];
  }

  /**
   * Initialize Bot B state if it doesn't exist
   */
  private async initializeBotBState(): Promise<void> {
    await query(`
      INSERT INTO bot_state (
        botA_virtual_usd, 
        botB_virtual_usd, 
        botA_cycle_number, 
        botA_cycle_target
      ) VALUES (230.00, 0.00, 1, 200.00)
    `);
    botBLogger.info('Initialized Bot B state');
  }

  /**
   * Log trade to database
   */
  private async logTrade(trade: BotBTrade): Promise<void> {
    await query(`
      INSERT INTO trade_logs (
        bot, pair, side, size, entry_price, exit_price, pnl_usd
      ) VALUES ('B', $1, $2, $3, $4, $5, $6)
    `, [
      'B',
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
      SET botB_virtual_usd = botB_virtual_usd + $1,
          updated_at = NOW()
      WHERE id = $2
    `, [pnl, botStateId]);
  }

  /**
   * Get count of trades executed today
   */
  private async getTodaysTradeCount(): Promise<number> {
    const result = await query(`
      SELECT COUNT(*) as count
      FROM trade_logs 
      WHERE bot = 'B' 
        AND DATE(created_at) = CURRENT_DATE
    `);

    return parseInt(result.rows[0].count) || 0;
  }

  /**
   * Get Bot B statistics
   */
  async getBotBStatistics(days: number = 30): Promise<{
    totalTrades: number;
    winRate: number;
    totalPnL: number;
    averageTradeSize: number;
    monthlyDonations: number;
    currentBalance: number;
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
        WHERE bot = 'B' 
          AND created_at >= NOW() - INTERVAL '${days} days'
      `);

      // Get current balance
      const state = await this.getBotBState();

      // Get monthly donations
      const donationStats = await query(`
        SELECT SUM(donation_amount) as monthly_donations
        FROM monthly_reports 
        WHERE created_at >= NOW() - INTERVAL '${days} days'
      `);

      const row = tradeStats.rows[0];
      return {
        totalTrades: parseInt(row.total_trades) || 0,
        winRate: parseFloat(row.win_rate) || 0,
        totalPnL: parseFloat(row.total_pnl) || 0,
        averageTradeSize: parseFloat(row.avg_trade_size) || 0,
        monthlyDonations: parseFloat(donationStats.rows[0]?.monthly_donations) || 0,
        currentBalance: state.botB_virtual_usd,
      };
    } catch (error) {
      botBLogger.error('Failed to get Bot B statistics', error as Error);
      throw error;
    }
  }

  /**
   * Get Bot B status
   */
  async getStatus(): Promise<{
    active: boolean;
    balance: number;
    mcs: number;
    trading: boolean;
    todaysTrades: number;
    monthlyDonationReady: boolean;
  }> {
    try {
      const state = await this.getBotBState();
      const mcs = await sentimentService.getLatestMCS();
      const todaysTrades = await this.getTodaysTradeCount();
      
      // Check if monthly donation is ready
      const currentMonth = new Date().toISOString().slice(0, 7);
      const existingReport = await query(`
        SELECT id FROM monthly_reports WHERE month = $1
      `, [currentMonth]);
      const monthlyDonationReady = existingReport.rows.length === 0;

      return {
        active: true,
        balance: state.botB_virtual_usd,
        mcs,
        trading: mcs >= this.MIN_MCS_FOR_TRADING && todaysTrades < this.MAX_DAILY_TRADES,
        todaysTrades,
        monthlyDonationReady,
      };
    } catch (error) {
      botBLogger.error('Failed to get Bot B status', error as Error);
      return {
        active: false,
        balance: 0,
        mcs: 0,
        trading: false,
        todaysTrades: 0,
        monthlyDonationReady: false,
      };
    }
  }
}

// Export singleton instance
export const botBEngine = new BotBEngine();
export default botBEngine;