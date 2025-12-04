import { NextRequest, NextResponse } from 'next/server';
import { 
  getBotState, 
  getBotATrades,
  getBotAStats,
  getLatestSentiment
} from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const demoMode =
      searchParams.get('demo') === 'true' ||
      process.env.DEMO_MODE === 'true';

    const limit = parseInt(searchParams.get('limit') || '10');

    // ───────────────────────────────
    // DEMO MODE
    // ───────────────────────────────
    if (demoMode) {
      const mockTrades = [
        {
          pair: 'BTC/USD',
          side: 'buy',
          size: 0.005,
          entry_price: 45000,
          exit_price: 45200,
          pnl_usd: 10.5,
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          pair: 'ETH/USD',
          side: 'buy',
          size: 0.015,
          entry_price: 3000,
          exit_price: 3025,
          pnl_usd: 12.75,
          created_at: new Date(Date.now() - 7200000).toISOString(),
        },
        {
          pair: 'BTC/USD',
          side: 'sell',
          size: 0.003,
          entry_price: 44800,
          exit_price: 44900,
          pnl_usd: 3.2,
          created_at: new Date(Date.now() - 10800000).toISOString(),
        },
      ];

      return NextResponse.json({
        current_balance: 245.75,
        cycle_number: 2,
        cycle_target: 230.0,
        cycle_progress: 106.7,
        risk_mode: 'High',
        today_trades: 3,
        win_rate: 0.67,
        total_pnl_today: 25.45,
        trades: mockTrades,
        sentiment: {
          mcs: 0.65,
          risk_level: 'High',
        },
        last_updated: new Date().toISOString(),
      });
    }

    // ───────────────────────────────
    // LIVE MODE — DATABASE
    // ───────────────────────────────
    const [botState, trades, stats, sentiment] = await Promise.all([
      getBotState(),
      getBotATrades(limit),
      getBotAStats(),
      getLatestSentiment(),
    ]);

    const cycleProgress =
      (parseFloat(botState.botA_virtual_usd) /
        parseFloat(botState.botA_cycle_target)) *
      100;

    const riskMode = getRiskMode(parseFloat(sentiment.mcs));

    // Format trades safely
    const formattedTrades = trades.map((trade: any) => ({
      pair: trade.pair,
      side: trade.side,
      size: parseFloat(trade.size) || 0,
      entry_price: parseFloat(trade.entry_price) ||
