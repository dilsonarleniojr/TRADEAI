import { NextResponse } from 'next/server';

const BINANCE_SERVICE = 'http://localhost:3001';

export async function GET() {
  try {
    const response = await fetch(`${BINANCE_SERVICE}/api/market/ticker`, {
      next: { revalidate: 15 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch ticker data' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[API Proxy] Ticker error:', error.message);
    return NextResponse.json(
      { error: 'Binance service unavailable', details: error.message },
      { status: 503 }
    );
  }
}
