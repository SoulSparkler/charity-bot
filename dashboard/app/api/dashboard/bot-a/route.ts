import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');

    // LIVE MODE: Proxy to Railway backend API
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
      // Return error instead of fallback data
      return NextResponse.json({
        error: 'Failed to fetch Bot A data from backend',
        message: (apiError as Error).message
      }, {
        status: 500,
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


