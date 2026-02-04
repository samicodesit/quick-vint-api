import { NextRequest, NextResponse } from 'next/server';

// Required for static export with API routes
export const dynamic = 'force-static';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bypass_key } = body;

    // Check if the bypass key matches our environment variable
    const validBypassKey = process.env.DEV_BYPASS_KEY;

    if (!validBypassKey) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Bypass not configured',
        },
        { status: 500 }
      );
    }

    if (bypass_key && bypass_key === validBypassKey) {
      return NextResponse.json({
        valid: true,
        bypass: true,
        message: 'Developer bypass authenticated',
      });
    } else {
      return NextResponse.json(
        {
          valid: false,
          error: 'Invalid bypass key',
        },
        { status: 401 }
      );
    }
  } catch (error: any) {
    console.error('Dev bypass verification error:', error);
    return NextResponse.json(
      {
        valid: false,
        error: 'Failed to verify bypass',
      },
      { status: 500 }
    );
  }
}
