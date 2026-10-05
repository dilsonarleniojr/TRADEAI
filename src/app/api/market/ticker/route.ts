import { NextResponse } from 'next/server';

const BINANCE_SERVICE = 'http://localhost:3001';

export async function GET() {
  // 1. Try local microservice first
  try {
    const response = await fetch(`${BINANCE_SERVICE}/api/market/ticker`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
  } catch {
    // Local service down, fallback to Binance directly
  }

  // 2. Direct fallback to Binance public endpoints
  const fallbackUrls = [
    'https://api.binance.com/api/v3/ticker/24hr',
    'https://data-api.binance.vision/api/v3/ticker/24hr',
    'https://api1.binance.com/api/v3/ticker/24hr',
  ];

  for (const url of fallbackUrls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(6000), cache: 'no-store' });
      if (resp.ok) {
        const raw = await resp.json();
        if (Array.isArray(raw)) {
          const usdt = raw
            .filter((t: any) => t.symbol?.endsWith('USDT'))
            .sort((a: any, b: any) => parseFloat(b.quoteVolume || '0') - parseFloat(a.quoteVolume || '0'));
          return NextResponse.json({ data: usdt, timestamp: Date.now() });
        }
      }
    } catch {
      continue;
    }
  }

  return NextResponse.json(
    { error: 'Binance service unavailable' },
    { status: 503 }
  );
}

