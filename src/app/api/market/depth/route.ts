import { NextRequest, NextResponse } from 'next/server';

const BINANCE_SERVICE = 'http://localhost:3001';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawSymbol = searchParams.get('symbol') || 'BTCUSDT';
  const symbol = rawSymbol.toUpperCase();
  const limit = searchParams.get('limit') || '20';

  // 1. Try local microservice
  try {
    const response = await fetch(
      `${BINANCE_SERVICE}/api/market/depth?symbol=${symbol}&limit=${limit}`,
      { signal: AbortSignal.timeout(1500), cache: 'no-store' }
    );

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
  } catch {
    // Local service down
  }

  // 2. Fallback direct to Binance
  try {
    const resp = await fetch(
      `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`,
      { signal: AbortSignal.timeout(4000), cache: 'no-store' }
    );

    if (resp.ok) {
      const raw = await resp.json();
      const bids = (raw.bids || []).map((b: string[]) => ({
        price: parseFloat(b[0]),
        volume: parseFloat(b[1]),
      }));
      const asks = (raw.asks || []).map((a: string[]) => ({
        price: parseFloat(a[0]),
        volume: parseFloat(a[1]),
      }));
      return NextResponse.json({
        symbol,
        bids,
        asks,
        lastUpdateId: raw.lastUpdateId,
        timestamp: Date.now(),
      });
    }
  } catch (err: any) {
    console.error('[API Proxy] Depth fallback error:', err.message);
  }

  return NextResponse.json(
    { error: 'Binance service unavailable', details: 'Failed to fetch depth' },
    { status: 503 }
  );
}
