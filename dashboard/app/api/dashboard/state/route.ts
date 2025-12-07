import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;

    if (!backendUrl) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing BACKEND_URL (or NEXT_PUBLIC_API_URL) in environment variables'
        },
        { status: 500 }
      );
    }

    // Fetch both test-balance and portfolio data
    const [testBalanceRes, portfolioRes] = await Promise.all([
      fetch(`${backendUrl}/api/test-balance`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      }),
      fetch(`${backendUrl}/api/portfolio`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      }).catch(() => null) // Don't fail if portfolio endpoint doesn't exist
    ]);

    if (!testBalanceRes.ok) {
      const text = await testBalanceRes.text();
      return NextResponse.json(
        {
          success: false,
          error: `Backend /api/test-balance failed with status ${testBalanceRes.status}`,
          body: text
        },
        { status: 500 }
      );
    }

    const krakenData = await testBalanceRes.json();
    
    // Get clean portfolio data if available
    let portfolio = null;
    if (portfolioRes && portfolioRes.ok) {
      portfolio = await portfolioRes.json();
    }

    return NextResponse.json(
      {
        success: true,
        last_updated: new Date().toISOString(),
        kraken: krakenData,
        portfolio: portfolio?.balances || null
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );
  } catch (error) {
    console.error('Error in /api/dashboard/state:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch dashboard state',
        message: (error as Error).message
      },
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
