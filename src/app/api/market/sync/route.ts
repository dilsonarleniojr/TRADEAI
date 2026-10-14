import { NextResponse } from 'next/server';
import { fetchFromBinanceService } from '@/lib/binance-service';

export async function POST() {
  return handleSync();
}

export async function GET() {
  return handleSync();
}

async function handleSync() {
  const localRes = await fetchFromBinanceService('/api/market/sync', 500);
  if (localRes) {
    try {
      const data = await localRes.json();
      return NextResponse.json(data);
    } catch {
      // ignore
    }
  }

  // Fallback direct to Binance
  try {
    const [infoRes, tickerRes] = await Promise.all([
      fetch('https://api.binance.com/api/v3/exchangeInfo', { signal: AbortSignal.timeout(12000), cache: 'no-store' }),
      fetch('https://api.binance.com/api/v3/ticker/24hr', { signal: AbortSignal.timeout(10000), cache: 'no-store' }),
    ]);

    if (infoRes.ok && tickerRes.ok) {
      const info = await infoRes.json();
      const tickers = await tickerRes.json();
      const spotUsdtSet = new Set(
        (info.symbols || [])
          .filter((s: any) => s.status === 'TRADING' && s.quoteAsset === 'USDT' && s.isSpotTradingAllowed)
          .map((s: any) => s.symbol)
      );

      const matchedCount = tickers.filter((t: any) => spotUsdtSet.has(t.symbol)).length;
      return NextResponse.json({
        success: true,
        symbolsCount: spotUsdtSet.size,
        tickersCount: matchedCount,
        timestamp: Date.now(),
        source: 'direct-binance-fallback',
      });
    }
  } catch (err: any) {
    console.error('[API Proxy] Direct sync error:', err.message);
  }

  return NextResponse.json({ error: 'Failed to synchronize with Binance' }, { status: 500 });
}
