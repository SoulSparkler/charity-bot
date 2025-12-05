import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '30');

    // LIVE MODE: Proxy to Railway backend API
    try {
      // Get sentiment data from Railway backend
      const sentimentResponse = await fetch(`${API_BASE_URL}/api/sentiment/current`);
      if (!sentimentResponse.ok) {
        throw new Error(`Sentiment API failed: ${sentimentResponse.status}`);
      }
      const sentimentData = await sentimentResponse.json();

      // Get sentiment history data from Railway backend (placeholder for future implementation)
      const historyResponse = await fetch(`${API_BASE_URL}/api/sentiment/history?limit=${limit}`);
      
      const data = {
        latest: {
          fgi_value: Math.round((sentimentData.mcs || 0.5) * 100),
          trend_score: sentimentData.trend_score || 0.15,
          mcs: sentimentData.mcs || 0.5,
          created_at: sentimentData.timestamp || new Date().toISOString(),
        },
        history: historyResponse.ok ? (await historyResponse.json()).history || [] : [],
        statistics: {
          avg_fgi: sentimentData.avg_fgi || 50,
          avg_mcs: sentimentData.avg_mcs || 0.5,
          max_fgi: sentimentData.max_fgi || 100,
          min_fgi: sentimentData.min_fgi || 0,
          trend_direction: sentimentData.trend_direction || 'Neutral',
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
        error: 'Failed to fetch sentiment data from backend',
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
    console.error('Error fetching sentiment data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sentiment data' },
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