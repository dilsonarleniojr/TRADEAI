import { NextResponse } from 'next/server';

const BINANCE_SERVICE = 'http://localhost:3001';

export async function GET() {
  // 1. Try local microservice
  try {
    const response = await fetch(`${BINANCE_SERVICE}/api/market/highlights`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
  } catch {
    // Local service down
  }

  // 2. Fallback direct to Binance
  try {
    const resp = await fetch('https://api.binance.com/api/v3/ticker/24hr', {
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    });

    if (resp.ok) {
      const raw: any[] = await resp.json();
      const usdt = raw.filter((t) => t.symbol?.endsWith('USDT'));
      const sorted = [...usdt].sort(
        (a, b) => parseFloat(b.priceChangePercent || '0') - parseFloat(a.priceChangePercent || '0')
      );
      const topGainers = sorted.slice(0, 5);
      const topLosers = sorted.slice(-5).reverse();
      const byVolume = [...usdt].sort(
        (a, b) => parseFloat(b.quoteVolume || '0') - parseFloat(a.quoteVolume || '0')
      );
      const mostActive = byVolume.slice(0, 5);

      return NextResponse.json({
        data: { topGainers, topLosers, mostActive },
        timestamp: Date.now(),
      });
    }
  } catch (err: any) {
    console.error('[API Proxy] Highlights fallback error:', err.message);
  }

  return NextResponse.json(
    { error: 'Binance service unavailable' },
    { status: 503 }
  );
}
