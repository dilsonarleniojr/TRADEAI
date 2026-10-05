import { NextResponse } from 'next/server';

const BINANCE_SERVICE = 'http://localhost:3001';

export async function POST() {
  return handleSync();
}

export async function GET() {
  return handleSync();
}

async function handleSync() {
  try {
    const response = await fetch(`${BINANCE_SERVICE}/api/market/sync`, {
      method: 'GET',
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
  } catch (error: any) {
    console.warn('[API Proxy] Binance service sync failed, attempting direct sync:', error.message);
  }

  // Fallback direct to Binance
  try {
    const [infoRes, tickerRes] = await Promise.all([
      fetch('https://api.binance.com/api/v3/exchangeInfo', { signal: AbortSignal.timeout(12000) }),
      fetch('https://api.binance.com/api/v3/ticker/24hr', { signal: AbortSignal.timeout(10000) }),
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
