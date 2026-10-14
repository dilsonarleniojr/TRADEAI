import { NextResponse } from 'next/server';
import { fetchFromBinanceService } from '@/lib/binance-service';

interface CachedSymbols {
  data: any[];
  timestamp: number;
}

let cachedSymbols: CachedSymbols | null = null;
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutos

export async function GET() {
  const now = Date.now();
  if (cachedSymbols && now - cachedSymbols.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({
      data: cachedSymbols.data,
      count: cachedSymbols.data.length,
      timestamp: cachedSymbols.timestamp,
      cached: true,
    });
  }

  // 1. Try microservice with circuit breaker
  const localRes = await fetchFromBinanceService('/api/market/symbols', 300);
  if (localRes) {
    try {
      const data = await localRes.json();
      if (data?.data && Array.isArray(data.data)) {
        cachedSymbols = { data: data.data, timestamp: now };
        return NextResponse.json(data);
      }
    } catch {
      // ignore
    }
  }

  // 2. Fallback direct to Binance exchangeInfo
  try {
    const resp = await fetch('https://api.binance.com/api/v3/exchangeInfo', {
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (resp.ok) {
      const info = await resp.json();
      const spotUsdt = (info.symbols || [])
        .filter((s: any) => s.status === 'TRADING' && s.quoteAsset === 'USDT' && s.isSpotTradingAllowed)
        .map((s: any) => ({
          symbol: s.symbol,
          name: s.baseAsset,
          short: s.baseAsset,
          category: 'Inovação',
          baseAsset: s.baseAsset,
          quoteAsset: 'USDT',
          isSpotTradingAllowed: true,
        }));
      cachedSymbols = { data: spotUsdt, timestamp: now };
      return NextResponse.json({ data: spotUsdt, count: spotUsdt.length, timestamp: now });
    }
  } catch (err: any) {
    console.error('[API Proxy] Direct Binance exchangeInfo error:', err.message);
  }

  if (cachedSymbols) {
    return NextResponse.json({
      data: cachedSymbols.data,
      count: cachedSymbols.data.length,
      timestamp: cachedSymbols.timestamp,
      stale: true,
    });
  }

  return NextResponse.json({ error: 'Failed to fetch symbols' }, { status: 500 });
}
