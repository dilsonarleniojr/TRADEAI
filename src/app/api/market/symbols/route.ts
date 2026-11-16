import { NextRequest, NextResponse } from 'next/server';
import { getAssetCategory, getCryptoName, getCryptoIcon, CRYPTO_LIST } from '@/lib/crypto-meta';
import { getVerifiedBinanceSpotRegistry, isTradableBinanceSpotSymbol } from '@/lib/binance-spot-sync';
import { getVerifiedOkxSpotRegistry } from '@/lib/okx/okx-spot-sync';

export const dynamic = 'force-dynamic';

type SymbolItem = {
  symbol: string;
  name: string;
  icon: string;
  category: string;
  exchanges?: ('binance' | 'okx')[];
};

let cachedBinanceSymbols: SymbolItem[] | null = null;
let lastBinanceFetchTime = 0;
let cachedOkxSymbols: SymbolItem[] | null = null;
let lastOkxFetchTime = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

function sortSymbols(list: SymbolItem[]): SymbolItem[] {
  const predefinedOrder = new Map(CRYPTO_LIST.map((c, index) => [c.symbol, index]));
  list.sort((a, b) => {
    const orderA = predefinedOrder.has(a.symbol) ? predefinedOrder.get(a.symbol)! : 999999;
    const orderB = predefinedOrder.has(b.symbol) ? predefinedOrder.get(b.symbol)! : 999999;
    if (orderA !== orderB) return orderA - orderB;
    return a.symbol.localeCompare(b.symbol);
  });
  return list;
}

async function loadBinanceSymbols(forceRefresh: boolean): Promise<SymbolItem[]> {
  const now = Date.now();
  if (!forceRefresh && cachedBinanceSymbols && now - lastBinanceFetchTime < CACHE_DURATION) {
    return cachedBinanceSymbols;
  }

  const spotRegistry = await getVerifiedBinanceSpotRegistry();
  if (spotRegistry.size === 0) {
    throw new Error('Binance Spot registry returned empty symbol set');
  }

  const usdtSymbols: SymbolItem[] = Array.from(spotRegistry.values())
    .filter((s) => isTradableBinanceSpotSymbol(s.symbol, null, spotRegistry))
    .map((s) => ({
      symbol: s.symbol,
      name: getCryptoName(s.baseAsset),
      icon: getCryptoIcon(s.baseAsset),
      category: getAssetCategory(s.baseAsset),
      exchanges: ['binance'],
    }));

  cachedBinanceSymbols = sortSymbols(usdtSymbols);
  lastBinanceFetchTime = now;
  return cachedBinanceSymbols;
}

async function loadOkxSymbols(forceRefresh: boolean): Promise<SymbolItem[]> {
  const now = Date.now();
  if (!forceRefresh && cachedOkxSymbols && now - lastOkxFetchTime < CACHE_DURATION) {
    return cachedOkxSymbols;
  }

  const okxRegistry = await getVerifiedOkxSpotRegistry(forceRefresh);
  if (okxRegistry.size === 0) {
    throw new Error('OKX Spot registry returned empty symbol set');
  }

  const usdtSymbols: SymbolItem[] = Array.from(okxRegistry.values()).map((s) => ({
    symbol: s.symbol,
    name: getCryptoName(s.baseAsset),
    icon: getCryptoIcon(s.baseAsset),
    category: getAssetCategory(s.baseAsset),
    exchanges: ['okx'],
  }));

  cachedOkxSymbols = sortSymbols(usdtSymbols);
  lastOkxFetchTime = now;
  return cachedOkxSymbols;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const exchange = (searchParams.get('exchange') || 'binance').toLowerCase();
  const forceRefresh = searchParams.get('refresh') === '1' || searchParams.get('refresh') === 'true';

  try {
    if (exchange === 'okx') {
      const okxSymbols = await loadOkxSymbols(forceRefresh);
      return NextResponse.json({
        symbols: okxSymbols,
        data: okxSymbols,
        exchange: 'okx',
        count: okxSymbols.length,
      });
    }

    if (exchange === 'all') {
      const [bnRes, okxRes] = await Promise.allSettled([
        loadBinanceSymbols(forceRefresh),
        loadOkxSymbols(forceRefresh),
      ]);
      const mergedMap = new Map<string, SymbolItem>();
      if (bnRes.status === 'fulfilled') {
        for (const item of bnRes.value) mergedMap.set(item.symbol, { ...item, exchanges: ['binance'] });
      }
      if (okxRes.status === 'fulfilled') {
        for (const item of okxRes.value) {
          const existing = mergedMap.get(item.symbol);
          if (existing) {
            existing.exchanges = Array.from(new Set([...(existing.exchanges || []), 'okx']));
          } else {
            mergedMap.set(item.symbol, { ...item, exchanges: ['okx'] });
          }
        }
      }
      const allSymbols = sortSymbols(Array.from(mergedMap.values()));
      return NextResponse.json({
        symbols: allSymbols,
        data: allSymbols,
        exchange: 'all',
        count: allSymbols.length,
      });
    }

    const binanceSymbols = await loadBinanceSymbols(forceRefresh);
    return NextResponse.json({
      symbols: binanceSymbols,
      data: binanceSymbols,
      exchange: 'binance',
      count: binanceSymbols.length,
    });
  } catch (error) {
    console.error(`Error fetching ${exchange} symbols:`, error);
    const fallback = CRYPTO_LIST.filter((c) => isTradableBinanceSpotSymbol(c.symbol));
    return NextResponse.json({
      symbols: fallback,
      data: fallback,
      exchange,
      count: fallback.length,
    });
  }
}
