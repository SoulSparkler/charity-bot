import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const demoMode = searchParams.get('demo') === 'true' || process.env.DEMO_MODE === 'true';
    const limit = parseInt(searchParams.get('limit') || '30');

    if (demoMode) {
      // Return mock sentiment data
      const mockHistory = [];
      const now = new Date();
      
      for (let i = 0; i < 30; i++) {
        const date = new Date(now.getTime() - (i * 60 * 60 * 1000)); // Every hour
        const baseFgi = 50 + (Math.sin(i / 5) * 30); // Sine wave variation
        const fgi = Math.max(0, Math.min(100, Math.round(baseFgi + (Math.random() * 20 - 10))));
        const mcs = fgi > 60 ? 0.8 : fgi > 40 ? 0.6 : fgi > 20 ? 0.3 : 0.1;
        
        mockHistory.push({
          fgi_value: fgi,
          mcs: mcs,
          created_at: date.toISOString(),
        });
      }

      const mockData = {
        latest: {
          fgi_value: 72,
          trend_score: 0.15,
          mcs: 0.75,
          created_at: new Date().toISOString(),
        },
        history: mockHistory.reverse(), // Most recent first
        statistics: {
          avg_fgi: 65.4,
          avg_mcs: 0.68,
          max_fgi: 89,
          min_fgi: 23,
          trend_direction: 'Bullish',
        },
        last_updated: new Date().toISOString(),
      };

      return NextResponse.json(mockData);
    }

    // PRODUCTION MODE: Proxy to Railway backend API
    try {
      // Get sentiment data from Railway backend
      const sentimentResponse = await fetch(`${API_BASE_URL}/api/sentiment/current`);
      if (!sentimentResponse.ok) {
        throw new Error(`Sentiment API failed: ${sentimentResponse.status}`);
      }
      const sentimentData = await sentimentResponse.json();

      // Generate mock history for now (in production, this would come from detailed endpoints)
      const mockHistory = [];
      const now = new Date();
      
      for (let i = 0; i < limit; i++) {
        const date = new Date(now.getTime() - (i * 60 * 60 * 1000)); // Every hour
        const baseFgi = 50 + (Math.sin(i / 5) * 30); // Sine wave variation
        const fgi = Math.max(0, Math.min(100, Math.round(baseFgi + (Math.random() * 20 - 10))));
        const mcs = fgi > 60 ? 0.8 : fgi > 40 ? 0.6 : fgi > 20 ? 0.3 : 0.1;
        
        mockHistory.push({
          fgi_value: fgi,
          mcs: mcs,
          created_at: date.toISOString(),
        });
      }

      // Calculate statistics from mock history
      const fgiValues = mockHistory.map((item: any) => item.fgi_value);
      const mcsValues = mockHistory.map((item: any) => item.mcs);
      
      const avgFgi = fgiValues.reduce((a: number, b: number) => a + b, 0) / fgiValues.length;
      const avgMcs = mcsValues.reduce((a: number, b: number) => a + b, 0) / mcsValues.length;
      const maxFgi = Math.max(...fgiValues);
      const minFgi = Math.min(...fgiValues);
      
      // Determine trend direction
      const recentFgi = fgiValues.slice(0, 5);
      const olderFgi = fgiValues.slice(-5);
      const recentAvg = recentFgi.reduce((a: number, b: number) => a + b, 0) / recentFgi.length;
      const olderAvg = olderFgi.reduce((a: number, b: number) => a + b, 0) / olderFgi.length;
      const trendDirection = recentAvg > olderAvg ? 'Bullish' : recentAvg < olderAvg ? 'Bearish' : 'Neutral';

      const data = {
        latest: {
          fgi_value: Math.round((sentimentData.mcs || 0.5) * 100),
          trend_score: 0.15,
          mcs: sentimentData.mcs || 0.5,
          created_at: sentimentData.timestamp || new Date().toISOString(),
        },
        history: mockHistory.reverse(), // Most recent first
        statistics: {
          avg_fgi: avgFgi,
          avg_mcs: avgMcs,
          max_fgi: maxFgi,
          min_fgi: minFgi,
          trend_direction: trendDirection,
        },
        last_updated: new Date().toISOString(),
      };

      return NextResponse.json(data);

    } catch (apiError) {
      console.error('Railway API error:', apiError);
      // Fallback to mock data if API is unavailable
      return NextResponse.json({
        latest: {
          fgi_value: 72,
          trend_score: 0.15,
          mcs: 0.75,
          created_at: new Date().toISOString(),
        },
        history: [],
        statistics: {
          avg_fgi: 65.4,
          avg_mcs: 0.68,
          max_fgi: 89,
          min_fgi: 23,
          trend_direction: 'Bullish',
        },
        last_updated: new Date().toISOString(),
        error: 'Using fallback data - Railway API unavailable'
      });
    }
  } catch (error) {
    console.error('Error fetching sentiment data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sentiment data' },
      { status: 500 }
    );
  }
}