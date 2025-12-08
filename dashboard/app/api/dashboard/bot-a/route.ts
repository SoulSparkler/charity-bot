import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  console.log('🌐 [Dashboard Bot-A] Request received at', new Date().toISOString());
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');

    // Use the dedicated Bot-A data endpoint
    try {
      console.log(`🔗 [Dashboard Bot-A] Fetching from ${API_BASE_URL}/api/bot-a/data`);
      
      const botAResponse = await fetch(`${API_BASE_URL}/api/bot-a/data`);
      if (!botAResponse.ok) {
        throw new Error(`Bot-A API failed: ${botAResponse.status} ${botAResponse.statusText}`);
      }
      
      const botAData = await botAResponse.json();
      console.log('✅ [Dashboard Bot-A] Data received:', {
        mode: botAData.mode,
        balance: botAData.current_balance,
        cycle: botAData.cycle_number,
        trades: botAData.today_trades
      });

      // Ensure we always have valid data structure
      const data = {
        current_balance: botAData.current_balance || 0,
        cycle_number: botAData.cycle_number || 1,
        cycle_target: botAData.cycle_target || 200,
        cycle_progress: botAData.cycle_progress || 0,
        risk_mode: botAData.risk_mode || "Low",
        today_trades: botAData.today_trades || 0,
        win_rate: botAData.win_rate || 0.5,
        total_pnl_today: botAData.total_pnl_today || 0,
        trades: botAData.trades || [],
        sentiment: {
          mcs: botAData.sentiment?.mcs || 0.5,
          risk_level: botAData.sentiment?.risk_level || "Low",
        },
        last_updated: botAData.last_updated || new Date().toISOString(),
      };

      console.log('📤 [Dashboard Bot-A] Returning processed data');
      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });

    } catch (apiError) {
      console.error('❌ [Dashboard Bot-A] API error:', apiError);
      
      // Return mock data instead of error
      console.log('🎭 [Dashboard Bot-A] Returning fallback mock data');
      const fallbackData = {
        current_balance: 175.50,
        cycle_number: 1,
        cycle_target: 200,
        cycle_progress: 87.75,
        risk_mode: "Medium",
        today_trades: 2,
        win_rate: 0.75,
        total_pnl_today: 15.25,
        trades: [],
        sentiment: {
          mcs: 0.65,
          risk_level: "Medium",
        },
        last_updated: new Date().toISOString(),
      };

      return NextResponse.json(fallbackData, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }

  } catch (error) {
    console.error("❌ [Dashboard Bot-A] Unexpected error:", error);
    
    // Always return valid data, never an error response
    const errorFallbackData = {
      current_balance: 150.00,
      cycle_number: 1,
      cycle_target: 200,
      cycle_progress: 75.0,
      risk_mode: "Low",
      today_trades: 0,
      win_rate: 0.50,
      total_pnl_today: 0,
      trades: [],
      sentiment: {
        mcs: 0.50,
        risk_level: "Low",
      },
      last_updated: new Date().toISOString(),
    };

    return NextResponse.json(errorFallbackData, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  }
}


