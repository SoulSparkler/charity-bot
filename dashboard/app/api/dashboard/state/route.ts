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

    const res = await fetch(`${backendUrl}/api/test-balance`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store'
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        {
          success: false,
          error: `Backend /api/test-balance failed with status ${res.status}`,
          body: text
        },
        { status: 500 }
      );
    }

    const krakenData = await res.json();

    return NextResponse.json(
      {
        success: true,
        last_updated: new Date().toISOString(),
        kraken: krakenData
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
