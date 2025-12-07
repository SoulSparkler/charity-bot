import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const demoMode = searchParams.get('demo') === 'true';

    // LIVE MODE: Proxy to Railway backend API
    try {
      // Get sentiment data from Railway backend
      const sentimentResponse = await fetch(`${API_BASE_URL}/api/sentiment`);
      if (!sentimentResponse.ok) {
        throw new Error(`Sentiment API failed: ${sentimentResponse.status}`);
      }
      const sentimentData = await sentimentResponse.json();
      
      // Transform the Alternative.me API response to our expected format
      const transformedData = {
        latest: {
          fgi_value: sentimentData.value || 50,
          trend_score: 0.15, // Placeholder - would need additional calculation
          mcs: (sentimentData.value || 50) / 100, // Convert FGI to 0-1 range for MCS
          created_at: sentimentData.updated || new Date().toISOString(),
        },
        history: [], // Placeholder for historical data
        statistics: {
          avg_fgi: sentimentData.value || 50,
          avg_mcs: (sentimentData.value || 50) / 100,
          max_fgi: sentimentData.value || 50,
          min_fgi: sentimentData.value || 50,
          trend_direction: sentimentData.classification || 'Neutral',
        },
        last_updated: new Date().toISOString(),
      };

      return NextResponse.json(transformedData, {
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