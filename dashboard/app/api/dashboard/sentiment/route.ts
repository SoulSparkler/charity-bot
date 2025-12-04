import { NextRequest, NextResponse } from 'next/server';
import { 
  getLatestSentiment, 
  getSentimentHistory 
} from '@/lib/db';

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

    // Get real data from database
    const [latestSentiment, history] = await Promise.all([
      getLatestSentiment(),
      getSentimentHistory(limit)
    ]);

    if (!latestSentiment) {
      throw new Error('No sentiment data available');
    }

    // Calculate statistics
    const fgiValues = history.map((item: any) => parseInt(item.fgi_value));
    const mcsValues = history.map((item: any) => parseFloat(item.mcs));
    
    const avgFgi = fgiValues.length > 0 ? fgiValues.reduce((a: number, b: number) => a + b, 0) / fgiValues.length : 0;
    const avgMcs = mcsValues.length > 0 ? mcsValues.reduce((a: number, b: number) => a + b, 0) / mcsValues.length : 0;
    const maxFgi = fgiValues.length > 0 ? Math.max(...fgiValues) : 0;
    const minFgi = fgiValues.length > 0 ? Math.min(...fgiValues) : 0;
    
    // Determine trend direction
    const recentFgi = fgiValues.slice(0, 5);
    const olderFgi = fgiValues.slice(-5);
    const recentAvg = recentFgi.reduce((a: number, b: number) => a + b, 0) / recentFgi.length;
    const olderAvg = olderFgi.reduce((a: number, b: number) => a + b, 0) / olderFgi.length;
    const trendDirection = recentAvg > olderAvg ? 'Bullish' : recentAvg < olderAvg ? 'Bearish' : 'Neutral';

    const data = {
      latest: {
        fgi_value: parseInt(latestSentiment.fgi_value) || 0,
        trend_score: parseFloat(latestSentiment.trend_score) || 0,
        mcs: parseFloat(latestSentiment.mcs) || 0,
        created_at: latestSentiment.created_at,
      },
      history: history.map((item: any) => ({
        fgi_value: parseInt(item.fgi_value),
        mcs: parseFloat(item.mcs),
        created_at: item.created_at,
      })),
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
  } catch (error) {
    console.error('Error fetching sentiment data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sentiment data' },
      { status: 500 }
    );
  }
}