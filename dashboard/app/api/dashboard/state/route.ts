import { NextRequest, NextResponse } from 'next/server';
import { 
  getBotState, 
  getLatestSentiment, 
  getOpenTradesCount,
  getBotAStats,
  getBotBStats,
  getBotBMonthToDatePnL
} from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const demoMode = searchParams.get('demo') === 'true' || process.env.DEMO_MODE === 'true';

    if (demoMode) {
      // Return mock data for demo/testing
      const mockData = {
        botA_virtual_usd: 245.75,
        botB_virtual_usd: 420.50,
        cycle_number: 2,
        cycle_target: 230.00,
        mcs: 0.65,
        fgi: 72,
        open_trades: 1,
        botA_today_trades: 3,
        botB_today_trades: 1,
        botA_win_rate: 0.67,
        botB_win_rate: 0.80,
        botB_mtd_pnl: 45.25,
        last_updated: new Date().toISOString(),
      };

      return NextResponse.json(mockData);
    }

    // Get real data from database
    const [
      botState,
      sentiment,
      openTradesCount,
      botAStats,
      botBStats,
      botBMTDPnL
    ] = await Promise.all([
      getBotState(),
      getLatestSentiment(),
      getOpenTradesCount(),
      getBotAStats(),
      getBotBStats(),
      getBotBMonthToDatePnL()
    ]);

    const data = {
      botA_virtual_usd: parseFloat(botState.botA_virtual_usd) || 0,
      botB_virtual_usd: parseFloat(botState.botB_virtual_usd) || 0,
      cycle_number: botState.botA_cycle_number || 1,
      cycle_target: parseFloat(botState.botA_cycle_target) || 200,
      mcs: parseFloat(sentiment.mcs) || 0.5,
      fgi: parseInt(sentiment.fgi_value) || 50,
      open_trades: openTradesCount,
      botA_today_trades: parseInt(botAStats.total_trades) || 0,
      botB_today_trades: parseInt(botBStats.total_trades) || 0,
      botA_win_rate: parseFloat(botAStats.win_rate) || 0,
      botB_win_rate: parseFloat(botBStats.win_rate) || 0,
      botB_mtd_pnl: parseFloat(botBMTDPnL) || 0,
      last_updated: new Date().toISOString(),
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching dashboard state:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard state' },
      { status: 500 }
    );
  }
}