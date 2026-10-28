import { NextResponse } from 'next/server';
import { getVerifiedBinanceSpotRegistry, isTradableBinanceSpotSymbol, VERIFIED_FALLBACK_SPOT_SYMBOLS } from '@/lib/binance-spot-sync';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BINANCE_ENDPOINTS = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
  'https://data-api.binance.vision',
];

async function fetchFromBinance(path: string, timeoutMs = 6000): Promise<Response> {
  let lastError: Error | null = null;
  for (const base of BINANCE_ENDPOINTS) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res;
      lastError = new Error(`${base} returned HTTP ${res.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError || new Error('All Binance endpoints failed');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawSymbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const interval = searchParams.get('interval') || '1m';
  const limit = Math.min(Number(searchParams.get('limit') || 300), 1000);

  try {
    const spotRegistry = await getVerifiedBinanceSpotRegistry().catch(() => null);
    const symbol = isTradableBinanceSpotSymbol(rawSymbol, null, spotRegistry)
      ? rawSymbol
      : (VERIFIED_FALLBACK_SPOT_SYMBOLS[0] || 'BTCUSDT');

    const [klinesRes, tickerRes, depthRes] = await Promise.allSettled([
      fetchFromBinance(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`),
      fetchFromBinance(`/api/v3/ticker/24hr?symbol=${symbol}`),
      fetchFromBinance(`/api/v3/depth?symbol=${symbol}&limit=20`),
    ]);

    const klines =
      klinesRes.status === 'fulfilled' ? await klinesRes.value.json() : [];
    const ticker =
      tickerRes.status === 'fulfilled' ? await tickerRes.value.json() : null;
    const depth =
      depthRes.status === 'fulfilled' ? await depthRes.value.json() : null;

    return NextResponse.json({
      ok: Array.isArray(klines) && klines.length > 0,
      symbol,
      requestedSymbol: rawSymbol,
      interval,
      timestamp: Date.now(),
      klines: Array.isArray(klines) ? klines : [],
      ticker,
      depth,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API Market Sync] Failed for ${rawSymbol}:`, message);
    return NextResponse.json(
      { ok: false, symbol: rawSymbol, interval, error: message, klines: [], ticker: null, depth: null },
      { status: 502 }
    );
  }
}
