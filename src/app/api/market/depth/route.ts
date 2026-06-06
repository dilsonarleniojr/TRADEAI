import { NextRequest, NextResponse } from 'next/server';

const BINANCE_SERVICE = 'http://localhost:3001';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'BTCUSDT';
    const limit = searchParams.get('limit') || '20';

    const response = await fetch(
      `${BINANCE_SERVICE}/api/market/depth?symbol=${symbol}&limit=${limit}`,
      { next: { revalidate: 2 } }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch order book depth' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[API Proxy] Depth error:', error.message);
    return NextResponse.json(
      { error: 'Binance service unavailable', details: error.message },
      { status: 503 }
    );
  }
}
