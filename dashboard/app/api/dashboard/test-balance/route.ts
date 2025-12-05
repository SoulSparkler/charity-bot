import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
      return NextResponse.json(
        { success: false, error: "Missing BACKEND_URL in environment variables" },
        { status: 500 }
      );
    }

    const res = await fetch(`${backendUrl}/api/test-balance`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });

    const data = await res.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error("Dashboard → Backend error:", error);

    return NextResponse.json(
      { 
        success: false,
        error: "Dashboard failed to contact backend",
        message: (error as Error).message
      },
      { status: 500 }
    );
  }
}
