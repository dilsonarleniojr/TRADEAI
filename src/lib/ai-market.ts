import type { MarketSnapshot } from "@/lib/ai-entries";

// Dados que alimentam o motor de entradas/saídas: sempre buscados pelo servidor, nunca vindos do navegador.
export async function loadSnapshot(symbol: string): Promise<MarketSnapshot | null> {
  try {
    const [tRes, kRes] = await Promise.all([
      fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, { signal: AbortSignal.timeout(5000), cache: "no-store" }),
      fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=120`, { signal: AbortSignal.timeout(5000), cache: "no-store" }),
    ]);
    if (!tRes.ok || !kRes.ok) return null;
    const t = await tRes.json();
    const k: any[] = await kRes.json();
    const price = parseFloat(t.lastPrice);
    const bid = parseFloat(t.bidPrice || '0');
    const ask = parseFloat(t.askPrice || '0');
    // Moedas sem liquidez ou suspensas/delistadas na Binance Spot têm bid/ask zerados
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(bid) || bid <= 0 || !Number.isFinite(ask) || ask <= 0) {
      return null;
    }
    return {
      symbol,
      price,
      changePct: parseFloat(t.priceChangePercent),
      high24h: parseFloat(t.highPrice),
      low24h: parseFloat(t.lowPrice),
      candles: k.map((c) => ({ high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5]) })),
    };
  } catch {
    return null;
  }
}
