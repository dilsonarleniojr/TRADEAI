import { NextRequest, NextResponse } from "next/server";
import {
  backfill,
  coverage,
  fetchLiveTail,
  isValidInterval,
  isValidSymbol,
  readCandles,
  type BackfillResult,
  type Candle,
} from "@/lib/market-history";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_SYMBOLS = 25;
const MAX_DAYS = 730;

// Mesmo formato de /api/market/klines (valores como string) para os consumidores reaproveitarem o parse.
const toWire = (c: Candle) => ({
  openTime: c.openTime,
  open: String(c.open),
  high: String(c.high),
  low: String(c.low),
  close: String(c.close),
  volume: String(c.volume),
  closeTime: c.closeTime,
  quoteVolume: String(c.quoteVolume),
  trades: c.trades,
});

/** GET ?coverage=1 → o que já está baixado. GET ?symbol&interval&limit → candles (histórico local + candle atual). */
export async function GET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams;

    if (sp.get("coverage")) {
      return NextResponse.json({ success: true, data: await coverage() });
    }

    const symbol = (sp.get("symbol") || "BTCUSDT").toUpperCase();
    const interval = sp.get("interval") || "1h";
    const limit = Math.min(1000, Math.max(1, parseInt(sp.get("limit") || "500", 10) || 500));
    if (!isValidSymbol(symbol) || !isValidInterval(interval)) {
      return NextResponse.json({ error: "symbol ou interval inválido" }, { status: 400 });
    }

    const stored = await readCandles(symbol, interval, limit);

    // Completa o fim da série com os candles mais recentes (inclui o em formação).
    let merged = stored;
    try {
      const tail = await fetchLiveTail(symbol, interval, 5);
      const byTime = new Map(stored.map((c) => [c.openTime, c]));
      for (const c of tail) byTime.set(c.openTime, c);
      merged = [...byTime.values()].sort((a, b) => a.openTime - b.openTime).slice(-limit);
    } catch {
      // sem rede: devolve só o que está salvo
    }

    return NextResponse.json({
      symbol,
      interval,
      stored: stored.length,
      data: merged.map(toWire),
      timestamp: Date.now(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Falha ao ler histórico", details: e?.message }, { status: 500 });
  }
}

/** POST { symbols: string[], interval?: string, days?: number } → baixa o histórico retroativo. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const interval = body.interval ?? "1h";
    const days = Math.min(MAX_DAYS, Math.max(1, Math.floor(Number(body.days) || 30)));
    const symbols: string[] = Array.from(
      new Set<string>((Array.isArray(body.symbols) ? body.symbols : []).map((s: unknown) => String(s).toUpperCase()))
    );

    if (!isValidInterval(interval)) {
      return NextResponse.json({ error: "interval inválido" }, { status: 400 });
    }
    if (symbols.length === 0 || symbols.length > MAX_SYMBOLS || !symbols.every(isValidSymbol)) {
      return NextResponse.json({ error: `Informe de 1 a ${MAX_SYMBOLS} símbolos válidos` }, { status: 400 });
    }

    // Em sequência (não em paralelo) para respeitar o limite de peso da Binance.
    const results: BackfillResult[] = [];
    for (const symbol of symbols) {
      const r = await backfill(symbol, interval, days);
      results.push(r);
      if (r.error?.includes("limitou")) break; // rate limit: não adianta continuar
    }

    return NextResponse.json({ success: true, interval, days, results });
  } catch (e: any) {
    return NextResponse.json({ error: "Falha no download", details: e?.message }, { status: 500 });
  }
}
