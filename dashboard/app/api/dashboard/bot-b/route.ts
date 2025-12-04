import { NextRequest, NextResponse } from 'next/server';
import { 
  getBotState, 
  getBotBTrades,
  getBotBStats,
  getBotBMonthToDatePnL,
  getMonthlyReports,
  getLatestSentiment
} from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const demoMode = searchParams.get('demo') === 'true' || process.env.DEMO_MODE === 'true';
    const limit = parseInt(searchParams.get('limit') || '10');

    if (demoMode) {
      // Return mock data for Bot B
      const mockTrades = [
        {
          pair: 'BTC/USD',
          side: 'buy',
          size: 0.002,
          entry_price: 45000,
          exit_price: 45100,
          pnl_usd: 2.20,
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          pair: 'BTC/USD',
          side: 'buy',
          size: 0.001,
          entry_price: 44950,
          exit_price: 45050,
          pnl_usd: 1.25,
          created_at: new Date(Date.now() - 7200000).toISOString(),
        },
      ];

      const mockMonthlyReports = [
        {
          month: '2024-11',
          botB_start_balance: 350.00,
          botB_end_balance: 420.50,
          donation_amount: 35.25,
          created_at: new Date('2024-12-01').toISOString(),
        },
        {
          month: '2024-10',
          botB_start_balance: 300.00,
          botB_end_balance: 350.00,
          donation_amount: 25.00,
          created_at: new Date('2024-11-01').toISOString(),
        },
      ];

      const mockData = {
        current_balance: 420.50,
        mtd_pnl: 45.25,
        estimated_next_month_donation: 22.63,
        today_trades: 2,
        win_rate: 0.80,
        total_pnl_today: 3.45,
        monthly_reports: mockMonthlyReports,
        risk_mode: 'Conservative',
        trades: mockTrades,
        sentiment: {
          mcs: 0.65,
          risk_level: 'Conservative',
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
      mtdPnL,
      monthlyReports,
      sentiment
    ] = await Promise.all([
      getBotState(),
      getBotBTrades(limit),
      getBotBStats(),
      getBotBMonthToDatePnL(),
      getMonthlyReports(12),
      getLatestSentiment()
    ]);

    const estimatedNextDonation = parseFloat(mtdPnL) > 0 ? (parseFloat(mtdPnL) * 0.5) : 0;
    const riskMode = 'Conservative';

    const data = {
      current_balance: parseFloat(botState.botB_virtual_usd) || 0,
      mtd_pnl: parseFloat(mtdPnL) || 0,
      estimated_next_month_donation: estimatedNextDonation,
      today_trades: parseInt(stats.total_trades) || 0,
      win_rate: parseFloat(stats.win_rate) || 0,
      total_pnl_today: parseFloat(stats.total_pnl) || 0,
      monthly_reports: monthlyReports.map(report => ({
        month: report.month,
        botB_start_balance: parseFloat(report.botB_start_balance) || 0,
        botB_end_balance: parseFloat(report.botB_end_balance) || 0,
        donation_amount: parseFloat(report.donation_amount) || 0,
        created_at: report.created_at,
      })),
      risk_mode: riskMode,
      trades: trades.map((trade: any) => ({
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
    console.error('Error fetching Bot B data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Bot B data' },
      { status: 500 }
    );
  }
}