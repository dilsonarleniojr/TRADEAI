import { NextResponse } from 'next/server';
import { getVerifiedBinanceSpotRegistry, isTradableBinanceSpotSymbol } from '@/lib/binance-spot-sync';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// In-memory cache to avoid hitting Binance rate limits
let cachedData: Record<string, unknown>[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 4000; // 4 seconds

export async function GET() {
  try {
    const now = Date.now();
    
    // Return cached data if still fresh
    if (cachedData && (now - lastFetchTime < CACHE_TTL)) {
      return NextResponse.json(cachedData);
    }

    const [response, spotRegistry] = await Promise.all([
      fetch('https://api.binance.com/api/v3/ticker/24hr', {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      }),
      getVerifiedBinanceSpotRegistry().catch(() => null),
    ]);

    if (!response.ok) {
      throw new Error(`Binance API responded with status: ${response.status}`);
    }

    const data = await response.json();
    
    // Filter strictly for valid, Spot-tradable USDT crypto pairs
    // (excludes *BUSDT tokenized stocks TRD_GRP_261, BREAK/delisted pairs, non-ASCII tickers, and stablecoins)
    const usdtPairs = Array.isArray(data)
      ? data.filter((item: Record<string, unknown>) =>
          typeof item.symbol === 'string' &&
          isTradableBinanceSpotSymbol(
            item.symbol,
            {
              lastPrice: item.lastPrice as string,
              bidPrice: item.bidPrice as string,
              askPrice: item.askPrice as string,
              highPrice: item.highPrice as string,
              lowPrice: item.lowPrice as string,
              quoteVolume: item.quoteVolume as string,
            },
            spotRegistry
          )
        )
      : [];

    // Update cache
    cachedData = usdtPairs;
    lastFetchTime = now;

    return NextResponse.json(usdtPairs);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API Market Ticker] Error fetching from Binance:', message);
    
    // Return stale cache if available on error
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    return NextResponse.json(
      { error: 'Failed to fetch market tickers', details: message },
      { status: 500 }
    );
  }
}
