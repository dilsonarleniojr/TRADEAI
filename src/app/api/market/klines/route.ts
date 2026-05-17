import { NextRequest, NextResponse } from 'next/server';

const BINANCE_SERVICE = 'http://localhost:3001';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'BTCUSDT';
    const interval = searchParams.get('interval') || '1h';
    const limit = searchParams.get('limit') || '100';

    const response = await fetch(
      `${BINANCE_SERVICE}/api/market/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      { next: { revalidate: 10 } }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch klines data' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[API Proxy] Klines error:', error.message);
    return NextResponse.json(
      { error: 'Binance service unavailable', details: error.message },
      { status: 503 }
    );
  }
}
