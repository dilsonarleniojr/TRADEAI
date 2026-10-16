import { NextResponse } from 'next/server';
import { fetchFromBinanceService } from '@/lib/binance-service';

interface CachedTickers {
  data: any[];
  timestamp: number;
}

let cachedTickers: CachedTickers | null = null;
const CACHE_TTL_MS = 3500; // 3.5 segundos de cache em memória para evitar download de 2MB em rajada
let pendingFetch: Promise<any> | null = null;

export async function GET() {
  const now = Date.now();

  // 1. Cache hit em memória (retorno em < 1ms)
  if (cachedTickers && now - cachedTickers.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({
      data: cachedTickers.data,
      timestamp: cachedTickers.timestamp,
      cached: true,
    });
  }

  // 2. Se já existe uma requisição em voo, reaproveita a mesma promessa
  if (pendingFetch) {
    try {
      const data = await pendingFetch;
      return NextResponse.json({ data, timestamp: Date.now(), deduplicated: true });
    } catch {
      // continua para tentativa fresca se a anterior falhou
    }
  }

  pendingFetch = (async () => {
    // 3. Tenta microserviço local (com fail-fast circuit-breaker)
    const localRes = await fetchFromBinanceService('/api/market/ticker', 2000);
    if (localRes) {
      const data = await localRes.json();
      if (data && Array.isArray(data.data)) {
        cachedTickers = { data: data.data, timestamp: Date.now() };
        return data.data;
      }
    }

    // 4. Fallback direto para endpoints oficiais da Binance
    const fallbackUrls = [
      'https://api.binance.com/api/v3/ticker/24hr',
      'https://data-api.binance.vision/api/v3/ticker/24hr',
      'https://api1.binance.com/api/v3/ticker/24hr',
    ];

    for (const url of fallbackUrls) {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
        if (resp.ok) {
          const raw = await resp.json();
          if (Array.isArray(raw)) {
            // Filtrar estritamente pares USDT ativos: bid e ask DEVEM ser maiores que zero
            // Pares suspensos, delistados ou com status BREAK têm bidPrice/askPrice = "0.00000000"
            const usdt = raw
              .filter((t: any) => {
                if (!t.symbol?.endsWith('USDT')) return false;
                const bid = parseFloat(t.bidPrice || '0');
                const ask = parseFloat(t.askPrice || '0');
                const last = parseFloat(t.lastPrice || '0');
                const vol = parseFloat(t.quoteVolume || '0');
                return bid > 0 && ask > 0 && last > 0 && vol > 0;
              })
              .sort((a: any, b: any) => parseFloat(b.quoteVolume || '0') - parseFloat(a.quoteVolume || '0'));
            cachedTickers = { data: usdt, timestamp: Date.now() };
            return usdt;
          }
        }
      } catch {
        continue;
      }
    }

    throw new Error('Binance service unavailable');
  })();

  try {
    const data = await pendingFetch;
    return NextResponse.json({ data, timestamp: Date.now() });
  } catch {
    if (cachedTickers) {
      // Retorna cache anterior degradado em vez de 503
      return NextResponse.json({
        data: cachedTickers.data,
        timestamp: cachedTickers.timestamp,
        stale: true,
      });
    }
    return NextResponse.json(
      { error: 'Binance service unavailable' },
      { status: 503 }
    );
  } finally {
    pendingFetch = null;
  }
}
