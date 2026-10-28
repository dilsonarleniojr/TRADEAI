import { NextResponse } from 'next/server';
import { getAssetCategory, getCryptoName, getCryptoIcon, CRYPTO_LIST } from '@/lib/crypto-meta';
import { getVerifiedBinanceSpotRegistry, isTradableBinanceSpotSymbol } from '@/lib/binance-spot-sync';

let cachedSymbols: { symbol: string; name: string; icon: string; category: string }[] | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

export async function GET() {
  try {
    const now = Date.now();
    if (cachedSymbols && (now - lastFetchTime < CACHE_DURATION)) {
      return NextResponse.json({ symbols: cachedSymbols });
    }

    const spotRegistry = await getVerifiedBinanceSpotRegistry();

    if (spotRegistry.size === 0) {
      throw new Error('Binance Spot registry returned empty symbol set');
    }

    const usdtSymbols = Array.from(spotRegistry.values())
      .filter((s) => isTradableBinanceSpotSymbol(s.symbol, null, spotRegistry))
      .map((s) => {
        const baseAsset = s.baseAsset;
        const symbol = s.symbol;
        return {
          symbol,
          name: getCryptoName(baseAsset),
          icon: getCryptoIcon(baseAsset),
          category: getAssetCategory(baseAsset),
        };
      });

    // Sort symbols: first the ones in our predefined CRYPTO_LIST, then alphabetically
    const predefinedOrder = new Map(CRYPTO_LIST.map((c, index) => [c.symbol, index]));
    
    usdtSymbols.sort((a: { symbol: string }, b: { symbol: string }) => {
      const orderA = predefinedOrder.has(a.symbol) ? predefinedOrder.get(a.symbol)! : 999999;
      const orderB = predefinedOrder.has(b.symbol) ? predefinedOrder.get(b.symbol)! : 999999;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.symbol.localeCompare(b.symbol);
    });

    cachedSymbols = usdtSymbols;
    lastFetchTime = now;

    return NextResponse.json({ symbols: usdtSymbols });
  } catch (error) {
    console.error('Error fetching Binance symbols:', error);
    // Fallback to static list (also sanitized against delisted/halted symbols)
    return NextResponse.json({
      symbols: CRYPTO_LIST.filter((c) => isTradableBinanceSpotSymbol(c.symbol)),
    });
  }
}
