import { NextResponse } from 'next/server';
import { fetchFromBinanceService } from '@/lib/binance-service';

interface CachedHighlights {
  data: any;
  timestamp: number;
}

let cachedHighlights: CachedHighlights | null = null;
const CACHE_TTL_MS = 10000; // 10 segundos

export async function GET() {
  const now = Date.now();
  if (cachedHighlights && now - cachedHighlights.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({
      data: cachedHighlights.data,
      timestamp: cachedHighlights.timestamp,
      cached: true,
    });
  }

  // 1. Try local microservice with circuit breaker
  const localRes = await fetchFromBinanceService('/api/market/highlights', 300);
  if (localRes) {
    try {
      const data = await localRes.json();
      if (data?.data) {
        cachedHighlights = { data: data.data, timestamp: now };
        return NextResponse.json(data);
      }
    } catch {
      // ignore
    }
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

      const highlightsData = { topGainers, topLosers, mostActive };
      cachedHighlights = { data: highlightsData, timestamp: now };

      return NextResponse.json({
        data: highlightsData,
        timestamp: now,
      });
    }
  } catch (err: any) {
    console.error('[API Proxy] Highlights fallback error:', err.message);
  }

  if (cachedHighlights) {
    return NextResponse.json({
      data: cachedHighlights.data,
      timestamp: cachedHighlights.timestamp,
      stale: true,
    });
  }

  return NextResponse.json(
    { error: 'Binance service unavailable', details: 'Failed to fetch highlights' },
    { status: 503 }
  );
}
