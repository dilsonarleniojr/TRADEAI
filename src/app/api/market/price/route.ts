import { NextRequest, NextResponse } from 'next/server';

const BINANCE_SERVICE = 'http://localhost:3001';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawSymbol = searchParams.get('symbol') || 'BTCUSDT';
  const symbol = rawSymbol.toUpperCase();

  // 1. Try local microservice
  try {
    const response = await fetch(
      `${BINANCE_SERVICE}/api/market/price?symbol=${symbol}`,
      { signal: AbortSignal.timeout(1500), cache: 'no-store' }
    );

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
  } catch {
    // Service down or timed out, fallback to Binance directly
  }

  // 2. Direct fallback to Binance public endpoints
  const fallbackUrls = [
    `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
    `https://data-api.binance.vision/api/v3/ticker/price?symbol=${symbol}`,
    `https://api1.binance.com/api/v3/ticker/price?symbol=${symbol}`,
  ];

  for (const url of fallbackUrls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(3000), cache: 'no-store' });
      if (resp.ok) {
        const json = await resp.json();
        return NextResponse.json({
          data: { symbol: json.symbol, price: json.price },
          timestamp: Date.now(),
        });
      }
    } catch {
      continue;
    }
  }

  return NextResponse.json(
    { error: 'Binance service unavailable', symbol },
    { status: 503 }
  );
}
