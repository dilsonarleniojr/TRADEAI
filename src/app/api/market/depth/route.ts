import { NextRequest, NextResponse } from 'next/server';
import { fetchFromBinanceService } from '@/lib/binance-service';

interface CachedDepth {
  data: any;
  timestamp: number;
}

const depthCache = new Map<string, CachedDepth>();
const DEPTH_CACHE_TTL_MS = 2000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawSymbol = searchParams.get('symbol') || 'BTCUSDT';
  const symbol = rawSymbol.toUpperCase();
  const limit = searchParams.get('limit') || '20';
  const cacheKey = `${symbol}_${limit}`;
  const now = Date.now();

  const cached = depthCache.get(cacheKey);
  if (cached && now - cached.timestamp < DEPTH_CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  // 1. Try local microservice with circuit breaker
  const localRes = await fetchFromBinanceService(
    `/api/market/depth?symbol=${symbol}&limit=${limit}`,
    300
  );
  if (localRes) {
    try {
      const data = await localRes.json();
      depthCache.set(cacheKey, { data, timestamp: now });
      return NextResponse.json(data);
    } catch {
      // ignore
    }
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
      const data = {
        symbol,
        bids,
        asks,
        lastUpdateId: raw.lastUpdateId,
        timestamp: Date.now(),
      };
      depthCache.set(cacheKey, { data, timestamp: now });
      return NextResponse.json(data);
    }
  } catch (err: any) {
    console.error('[API Proxy] Depth fallback error:', err.message);
  }

  if (cached) {
    return NextResponse.json(cached.data);
  }

  return NextResponse.json(
    { error: 'Binance service unavailable', details: 'Failed to fetch depth' },
    { status: 503 }
  );
}
