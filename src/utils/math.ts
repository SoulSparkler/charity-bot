/**
 * Mathematical utility functions for the charity bot
 */

export interface ExponentialMovingAverageOptions {
  period: number;
}

/**
 * Calculate Exponential Moving Average (EMA)
 * @param prices Array of closing prices
 * @param period EMA period (default: 20)
 * @returns EMA value
 */
export function calculateEMA(prices: number[], period: number = 20): number {
  if (prices.length < period) {
    throw new Error(`Not enough data points. Need at least ${period} prices`);
  }

  // Simple moving average for first value
  let multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
  
  // Calculate EMA for remaining prices
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
  }
  
  return ema;
}

/**
 * Calculate Simple Moving Average (SMA)
 * @param prices Array of closing prices
 * @param period SMA period (default: 20)
 * @returns SMA value
 */
export function calculateSMA(prices: number[], period: number = 20): number {
  if (prices.length < period) {
    throw new Error(`Not enough data points. Need at least ${period} prices`);
  }
  
  const slice = prices.slice(-period);
  return slice.reduce((sum, price) => sum + price, 0) / period;
}

/**
 * Calculate RSI (Relative Strength Index)
 * @param prices Array of closing prices
 * @param period RSI period (default: 14)
 * @returns RSI value (0-100)
 */
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) {
    throw new Error(`Not enough data points. Need at least ${period + 1} prices`);
  }

  let gains = 0;
  let losses = 0;

  // Calculate initial average gain and loss
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Calculate RSI for subsequent periods
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) {
    return 100; // Avoid division by zero
  }

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  return rsi;
}

/**
 * Calculate percentage change between two values
 * @param oldValue Original value
 * @param newValue New value
 * @returns Percentage change (-100 to infinity)
 */
export function calculatePercentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) {
    throw new Error('Cannot calculate percentage change from zero');
  }
  
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Calculate position size based on risk percentage
 * @param balance Total balance
 * @param riskPercentage Risk per trade (0-1)
 * @returns Position size in USD
 */
export function calculatePositionSize(balance: number, riskPercentage: number): number {
  if (riskPercentage < 0 || riskPercentage > 1) {
    throw new Error('Risk percentage must be between 0 and 1');
  }
  
  return balance * riskPercentage;
}

/**
 * Calculate stop loss price based on entry price and stop loss percentage
 * @param entryPrice Entry price
 * @param stopLossPercentage Stop loss percentage (0-1)
 * @param isLongPosition Whether this is a long position
 * @returns Stop loss price
 */
export function calculateStopLossPrice(
  entryPrice: number, 
  stopLossPercentage: number, 
  isLongPosition: boolean = true
): number {
  if (stopLossPercentage < 0 || stopLossPercentage > 1) {
    throw new Error('Stop loss percentage must be between 0 and 1');
  }
  
  const factor = isLongPosition ? (1 - stopLossPercentage) : (1 + stopLossPercentage);
  return entryPrice * factor;
}

/**
 * Calculate take profit price based on entry price and take profit percentage
 * @param entryPrice Entry price
 * @param takeProfitPercentage Take profit percentage (0-1)
 * @param isLongPosition Whether this is a long position
 * @returns Take profit price
 */
export function calculateTakeProfitPrice(
  entryPrice: number, 
  takeProfitPercentage: number, 
  isLongPosition: boolean = true
): number {
  if (takeProfitPercentage < 0 || takeProfitPercentage > 1) {
    throw new Error('Take profit percentage must be between 0 and 1');
  }
  
  const factor = isLongPosition ? (1 + takeProfitPercentage) : (1 - takeProfitPercentage);
  return entryPrice * factor;
}

/**
 * Calculate P&L for a trade
 * @param entryPrice Entry price
 * @param exitPrice Exit price
 * @param quantity Quantity traded
 * @param isLongPosition Whether this is a long position
 * @returns P&L in USD
 */
export function calculatePnL(
  entryPrice: number, 
  exitPrice: number, 
  quantity: number, 
  isLongPosition: boolean = true
): number {
  const priceDiff = isLongPosition ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
  return priceDiff * quantity;
}

/**
 * Calculate win rate from an array of trades
 * @param trades Array of trades with P&L
 * @returns Win rate as percentage (0-100)
 */
export function calculateWinRate(trades: { pnl: number }[]): number {
  if (trades.length === 0) return 0;
  
  const winningTrades = trades.filter(trade => trade.pnl > 0).length;
  return (winningTrades / trades.length) * 100;
}

/**
 * Calculate maximum drawdown from a series of balances
 * @param balances Array of balance values over time
 * @returns Maximum drawdown as percentage (0-100)
 */
export function calculateMaxDrawdown(balances: number[]): number {
  if (balances.length === 0) return 0;
  
  let maxDrawdown = 0;
  let peak = balances[0];
  
  for (let i = 1; i < balances.length; i++) {
    if (balances[i] > peak) {
      peak = balances[i];
    }
    
    const drawdown = ((peak - balances[i]) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  
  return maxDrawdown;
}

/**
 * Calculate average return from an array of returns
 * @param returns Array of percentage returns
 * @returns Average return as percentage
 */
export function calculateAverageReturn(returns: number[]): number {
  if (returns.length === 0) return 0;
  
  const sum = returns.reduce((acc, ret) => acc + ret, 0);
  return sum / returns.length;
}

/**
 * Calculate risk-reward ratio for a trade
 * @param entryPrice Entry price
 * @param stopLoss Stop loss price
 * @param takeProfit Take profit price
 * @param isLongPosition Whether this is a long position
 * @returns Risk-reward ratio (should be >= 2 for good trades)
 */
export function calculateRiskRewardRatio(
  entryPrice: number,
  stopLoss: number,
  takeProfit: number,
  isLongPosition: boolean = true
): number {
  const risk = isLongPosition ? 
    Math.abs(entryPrice - stopLoss) / entryPrice :
    Math.abs(stopLoss - entryPrice) / entryPrice;
    
  const reward = isLongPosition ?
    Math.abs(takeProfit - entryPrice) / entryPrice :
    Math.abs(entryPrice - takeProfit) / entryPrice;
    
  return reward / risk;
}

/**
 * Clamp a value between minimum and maximum
 * @param value Value to clamp
 * @param min Minimum value
 * @param max Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculate exponential decay
 * @param initialValue Initial value
 * @param decayRate Decay rate (0-1)
 * @param periods Number of periods
 * @returns Decayed value
 */
export function calculateExponentialDecay(initialValue: number, decayRate: number, periods: number): number {
  return initialValue * Math.pow(1 - decayRate, periods);
}

/**
 * Calculate volatility (standard deviation of returns)
 * @param returns Array of percentage returns
 * @returns Volatility as percentage
 */
export function calculateVolatility(returns: number[]): number {
  if (returns.length === 0) return 0;
  
  const mean = calculateAverageReturn(returns);
  const squaredDiffs = returns.map(ret => Math.pow(ret - mean, 2));
  const variance = squaredDiffs.reduce((acc, diff) => acc + diff, 0) / returns.length;
  
  return Math.sqrt(variance);
}

/**
 * Round number to specified decimal places
 * @param value Number to round
 * @param decimals Number of decimal places (default: 2)
 * @returns Rounded number
 */
export function roundTo(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Check if a number is within a range
 * @param value Value to check
 * @param min Minimum value (inclusive)
 * @param max Maximum value (inclusive)
 * @returns True if value is within range
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}