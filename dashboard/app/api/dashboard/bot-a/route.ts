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
    const demoMode = searchParams.get('demo') === 'true' || process.env.DEMO_MODE === 'true';
    const limit = parseInt(searchParams.get('limit') || '10');

    if (demoMode) {
      // Return mock data for Bot A
      const mockTrades = [
        {
          pair: 'BTC/USD',
          side: 'buy',
          size: 0.005,
          entry_price: 45000,
          exit_price: 45200,
          pnl_usd: 10.50,
          created_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        },
        {
          pair: 'ETH/USD',
          side: 'buy',
          size: 0.015,
          entry_price: 3000,
          exit_price: 3025,
          pnl_usd: 12.75,
          created_at: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        },
        {
          pair: 'BTC/USD',
          side: 'sell',
          size: 0.003,
          entry_price: 44800,
          exit_price: 44900,
          pnl_usd: 3.20,
          created_at: new Date(Date.now() - 10800000).toISOString(), // 3 hours ago
        },
      ];

      const mockData = {
        current_balance: 245.75,
        cycle_number: 2,
        cycle_target: 230.00,
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
      };

      return NextResponse.json(mockData);
    }

    // Get real data from database
    const [
      botState,
      trades,
      stats,
      sentiment
    ] = await Promise.all([
      getBotState(),
      getBotATrades(limit),
      getBotAStats(),
      getLatestSentiment()
    ]);

    const cycleProgress = (parseFloat(botState.botA_virtual_usd) / parseFloat(botState.botA_cycle_target)) * 100;
    const riskMode = getRiskMode(parseFloat(sentiment.mcs));

    const data = {
      current_balance: parseFloat(botState.botA_virtual_usd) || 0,
      cycle_number: botState.botA_cycle_number || 1,
      cycle_target: parseFloat(botState.botA_cycle_target) || 200,
      cycle_progress: cycleProgress,
      risk_mode: riskMode,
      today_trades: parseInt(stats.total_trades) || 0,
      win_rate: parseFloat(stats.win_rate) || 0,
      total_pnl_today: parseFloat(stats.total_pnl) || 0,
      trades: trades.map(trade => ({
        pair: trade.pair,
        side: trade.side,
        size: parseFloat(trade.size) || 0,
        entry_price: parseFloat(trade.entry_price) || 0,
        exit_price: parseFloat(trade.exit_price) || 0,
        pnl_usd: parseFloat(trade.pnl_usd) || 0,
        created_at: trade.created_at,
      })),
      sentiment: {
        mcs: parseFloat(sentiment.mcs) || 0.5,
        risk_level: riskMode,
      },
      last_updated: new Date().toISOString(),
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching Bot A data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Bot A data' },
      { status: 500 }
    );
  }
}

function getRiskMode(mcs: number): string {
  if (mcs >= 0.7) return 'High';
  if (mcs >= 0.4) return 'Medium';
  return 'Low';
}