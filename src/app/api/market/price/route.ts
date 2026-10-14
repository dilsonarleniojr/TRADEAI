import { NextRequest, NextResponse } from 'next/server';
import { fetchFromBinanceService } from '@/lib/binance-service';

interface CachedPrice {
  price: string;
  timestamp: number;
}

const priceCache = new Map<string, CachedPrice>();
const PRICE_CACHE_TTL_MS = 2000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawSymbol = searchParams.get('symbol') || 'BTCUSDT';
  const symbol = rawSymbol.toUpperCase();
  const now = Date.now();

  const cached = priceCache.get(symbol);
  if (cached && now - cached.timestamp < PRICE_CACHE_TTL_MS) {
    return NextResponse.json({
      data: { symbol, price: cached.price },
      timestamp: cached.timestamp,
      cached: true,
    });
  }

  // 1. Try local microservice with circuit breaker
  const localRes = await fetchFromBinanceService(`/api/market/price?symbol=${symbol}`, 300);
  if (localRes) {
    try {
      const data = await localRes.json();
      if (data?.data?.price) {
        priceCache.set(symbol, { price: data.data.price, timestamp: now });
        return NextResponse.json(data);
      }
    } catch {
      // ignore
    }
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
        priceCache.set(symbol, { price: json.price, timestamp: now });
        return NextResponse.json({
          data: { symbol: json.symbol, price: json.price },
          timestamp: now,
        });
      }
    } catch {
      continue;
    }
  }

  if (cached) {
    return NextResponse.json({
      data: { symbol, price: cached.price },
      timestamp: cached.timestamp,
      stale: true,
    });
  }

  return NextResponse.json(
    { error: 'Binance service unavailable', symbol },
    { status: 503 }
  );
}
