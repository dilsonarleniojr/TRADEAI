import { NextRequest, NextResponse } from 'next/server';

interface RawBinanceKline {
  0: number; // openTime
  1: string; // open
  2: string; // high
  3: string; // low
  4: string; // close
  5: string; // volume
  6: number; // closeTime
  7: string; // quoteVolume
  8: number; // trades
  9: string; // takerBuyBaseVolume
  10: string; // takerBuyQuoteVolume
  11: string; // ignore
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawSymbol = searchParams.get('symbol') || 'BTCUSDT';
    const symbol = rawSymbol.toUpperCase() === 'AUTO' ? 'BTCUSDT' : rawSymbol.toUpperCase();
    const interval = searchParams.get('interval') || '1h';
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10), 10), 1000);

    const endpoints = [
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `https://api3.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    ];

    let rawData: any = null;
    let lastError = '';

    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(6000),
          cache: 'no-store',
        });

        if (response.ok) {
          const json = await response.json();
          if (Array.isArray(json) && json.length > 0) {
            rawData = json;
            break;
          }
        } else {
          lastError = `Status ${response.status} from ${url}`;
        }
      } catch (err: any) {
        lastError = err.message;
      }
    }

    if (!Array.isArray(rawData)) {
      // Fallback: Se a Binance estiver inacessível temporariamente, gera candles realistas para não deixar o gráfico vazio
      console.warn(`[Klines API] Binance endpoints failed for ${symbol} (${lastError}), generating fallback candles`);
      const now = Date.now();
      const intervalMs = interval.includes('m')
        ? parseInt(interval, 10) * 60_000
        : interval.includes('h')
        ? parseInt(interval, 10) * 3600_000
        : 86400_000;

      let basePrice = symbol.includes('BTC') ? 85000 : symbol.includes('ETH') ? 2300 : symbol.includes('SOL') ? 140 : 100;
      const fallbackKlines = Array.from({ length: limit }).map((_, idx) => {
        const time = now - (limit - idx) * intervalMs;
        const change = (Math.random() - 0.49) * 0.015 * basePrice;
        const open = basePrice;
        const close = basePrice + change;
        const high = Math.max(open, close) + Math.random() * 0.005 * basePrice;
        const low = Math.min(open, close) - Math.random() * 0.005 * basePrice;
        const volume = Math.random() * 100 + 10;
        basePrice = close;

        return {
          openTime: time,
          open: open.toFixed(2),
          high: high.toFixed(2),
          low: low.toFixed(2),
          close: close.toFixed(2),
          volume: volume.toFixed(2),
          closeTime: time + intervalMs - 1,
          quoteVolume: (volume * close).toFixed(2),
          trades: Math.floor(Math.random() * 1000) + 100,
        };
      });

      return NextResponse.json({
        success: true,
        symbol,
        interval,
        count: fallbackKlines.length,
        data: fallbackKlines,
        isFallback: true,
      });
    }

    // Formata os candles da Binance para o padrão esperado pela interface
    const formatted = rawData.map((k: any) => {
      // Formato array nativo da Binance [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, ...]
      if (Array.isArray(k)) {
        return {
          openTime: k[0],
          open: String(k[1]),
          high: String(k[2]),
          low: String(k[3]),
          close: String(k[4]),
          volume: String(k[5]),
          closeTime: k[6],
          quoteVolume: String(k[7]),
          trades: Number(k[8] || 0),
        };
      }
      return k;
    });

    return NextResponse.json({
      success: true,
      symbol,
      interval,
      count: formatted.length,
      data: formatted,
    });
  } catch (error: any) {
    console.error('[API Proxy] Klines error:', error.message);
    return NextResponse.json(
      { error: 'Falha ao processar candles', details: error.message },
      { status: 500 }
    );
  }
}
