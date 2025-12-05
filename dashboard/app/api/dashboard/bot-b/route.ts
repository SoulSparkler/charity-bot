import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const dynamic = 'force-dynamic';

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

      return NextResponse.json(mockData, {
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
        current_balance: botStatus.botB?.balance || 0,
        mtd_pnl: 0, // Will be populated from detailed stats
        estimated_next_month_donation: 0, // Will be calculated from MTD P&L
        today_trades: botStatus.botB?.todaysTrades || 0,
        win_rate: 0.80, // Default value
        total_pnl_today: 0, // Will be populated from detailed stats
        monthly_reports: [], // Will be populated from detailed reports
        risk_mode: 'Conservative',
        trades: [], // Will be populated from detailed trade logs
        sentiment: {
          mcs: sentimentData.mcs || 0.5,
          risk_level: 'Conservative',
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
        current_balance: 420.50,
        mtd_pnl: 45.25,
        estimated_next_month_donation: 22.63,
        today_trades: 2,
        win_rate: 0.80,
        total_pnl_today: 3.45,
        monthly_reports: [
          {
            month: '2024-11',
            botB_start_balance: 350.00,
            botB_end_balance: 420.50,
            donation_amount: 35.25,
            created_at: new Date('2024-12-01').toISOString(),
          },
        ],
        risk_mode: 'Conservative',
        trades: [],
        sentiment: {
          mcs: 0.65,
          risk_level: 'Conservative',
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
    console.error('Error fetching Bot B data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Bot B data' },
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
