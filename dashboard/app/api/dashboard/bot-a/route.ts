import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const demoMode = searchParams.get('demo') === 'true' || process.env.DEMO_MODE === 'true';
    const limit = parseInt(searchParams.get('limit') || '10');

    if (demoMode) {
      const mockTrades = [
        {
          pair: 'BTC/USD',
          side: 'buy',
          size: 0.005,
          entry_price: 45000,
          exit_price: 45200,
          pnl_usd: 10.50,
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
          pnl_usd: 3.20,
          created_at: new Date(Date.now() - 10800000).toISOString(),
        },
      ];

      return NextResponse.json({
        current_balance: 245.75,
        cycle_number: 2,
        cycle_target: 230,
        cycle_progress: 106.7,
        risk_mode: "High",
        today_trades: 3,
        win_rate: 0.67,
        total_pnl_today: 25.45,
        trades: mockTrades,
        sentiment: {
          mcs: 0.65,
          risk_level: "High",
        },
        last_updated: new Date().toISOString(),
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
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

      // Transform the data to match the expected dashboard format
      const data = {
        current_balance: botStatus.botA?.balance || 0,
        cycle_number: botStatus.botA?.cycle || 1,
        cycle_target: botStatus.botA?.target || 200,
        cycle_progress: botStatus.botA?.progress || 0,
        risk_mode: botStatus.botA?.trading ? "High" : "Low",
        today_trades: 0, // Will be populated from detailed stats
        win_rate: 0.75, // Default value
        total_pnl_today: 0, // Will be populated from detailed stats
        trades: [], // Will be populated from detailed trade logs
        sentiment: {
          mcs: sentimentData.mcs || 0.5,
          risk_level: botStatus.botA?.trading ? "High" : "Low",
        },
        last_updated: new Date().toISOString(),
      };

      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });

    } catch (apiError) {
      console.error('Railway API error:', apiError);
      // Fallback to mock data if API is unavailable
      return NextResponse.json({
        current_balance: 245.75,
        cycle_number: 2,
        cycle_target: 230,
        cycle_progress: 106.7,
        risk_mode: "Medium",
        today_trades: 0,
        win_rate: 0.67,
        total_pnl_today: 0,
        trades: [],
        sentiment: {
          mcs: 0.5,
          risk_level: "Medium",
        },
        last_updated: new Date().toISOString(),
        error: 'Using fallback data - Railway API unavailable'
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }

  } catch (error) {
    console.error("Error fetching Bot A data:", error);
    return NextResponse.json(
      { error: "Failed to fetch Bot A data" },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );
  }
}


