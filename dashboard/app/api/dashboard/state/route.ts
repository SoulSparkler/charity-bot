import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

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

    // PRODUCTION MODE: Proxy to Railway backend API
    try {
      // Get bot status from Railway backend
      const botStatusResponse = await fetch(`${API_BASE_URL}/api/bots/status`);
      if (!botStatusResponse.ok) {
        throw new Error(`Bot status API failed: ${botStatusResponse.status}`);
      }
      const botStatus = await botStatusResponse.json();

      // Get sentiment data from Railway backend
      const sentimentResponse = await fetch(`${API_BASE_URL}/api/sentiment/current`);
      if (!sentimentResponse.ok) {
        throw new Error(`Sentiment API failed: ${sentimentResponse.status}`);
      }
      const sentimentData = await sentimentResponse.json();

      // Get market data for additional context
      const marketResponse = await fetch(`${API_BASE_URL}/api/market/data`);
      const marketData = marketResponse.ok ? await marketResponse.json() : null;

      const data = {
        botA_virtual_usd: botStatus.botA?.balance || 0,
        botB_virtual_usd: botStatus.botB?.balance || 0,
        cycle_number: botStatus.botA?.cycle || 1,
        cycle_target: botStatus.botA?.target || 200,
        mcs: sentimentData.mcs || 0.5,
        fgi: Math.round((sentimentData.mcs || 0.5) * 100),
        open_trades: 0, // Would come from detailed trade endpoint
        botA_today_trades: 0, // Would come from detailed stats
        botB_today_trades: botStatus.botB?.todaysTrades || 0,
        botA_win_rate: 0.67, // Default value
        botB_win_rate: 0.80, // Default value
        botB_mtd_pnl: 0, // Would come from detailed monthly report
        last_updated: new Date().toISOString(),
      };

      return NextResponse.json(data);

    } catch (apiError) {
      console.error('Railway API error:', apiError);
      // Fallback to mock data if API is unavailable
      return NextResponse.json({
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
        error: 'Using fallback data - Railway API unavailable'
      });
    }
  } catch (error) {
    console.error('Error fetching dashboard state:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard state' },
      { status: 500 }
    );
  }
}