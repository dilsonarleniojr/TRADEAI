import { NextResponse } from 'next/server';

const BINANCE_SERVICE = 'http://localhost:3001';

export async function GET() {
  try {
    const response = await fetch(`${BINANCE_SERVICE}/api/market/symbols`, {
      next: { revalidate: 60 },
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
  } catch (error: any) {
    console.warn('[API Proxy] symbols fallback due to error:', error.message);
  }

  // Fallback direct to Binance exchangeInfo
  try {
    const resp = await fetch('https://api.binance.com/api/v3/exchangeInfo');
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
      return NextResponse.json({ data: spotUsdt, count: spotUsdt.length, timestamp: Date.now() });
    }
  } catch (err: any) {
    console.error('[API Proxy] Direct Binance exchangeInfo error:', err.message);
  }

  return NextResponse.json({ error: 'Failed to fetch symbols' }, { status: 500 });
}
