import { describe, expect, it } from "bun:test";
import { getOrderBookSnapshot } from "@/lib/bot/order-book-cache";
import { structuredLogger } from "@/lib/telemetry/structured-logger";
import { OrderBookFetchError } from "@/lib/performance/binance-worker-manager";
import {
  computeMobileIndicators,
  computeMobileRegime,
  formatMonoPrice,
} from "@/components/mobile/mobile-helpers";
import type { KlineData } from "@/lib/store";

function makeCandles(count: number, stepPct: number, spreadPct = 0.004): KlineData[] {
  const out: KlineData[] = [];
  let price = 100;
  const now = Date.now() - count * 60_000;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = price * (1 + stepPct);
    const high = Math.max(open, close) * (1 + spreadPct);
    const low = Math.min(open, close) * (1 - spreadPct);
    out.push({
      time: now + i * 60_000,
      open,
      high,
      low,
      close,
      volume: 1500 + i * 25,
    });
    price = close;
  }
  return out;
}

describe("TradeAI Mobile UI Parity & Engine Reuse", () => {
  it("expõe getOrderBookSnapshot com níveis Top Bids/Asks e análise OFI/Spread", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          bids: [
            ["90000.00", "2.0"],
            ["89990.00", "1.5"],
            ["89980.00", "1.0"],
          ],
          asks: [
            ["90010.00", "0.8"],
            ["90020.00", "0.7"],
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )) as typeof fetch;

    try {
      const snap = await getOrderBookSnapshot("MOBILETESTUSDT");
      expect(snap.symbol).toBe("MOBILETESTUSDT");
      expect(snap.bids.length).toBe(3);
      expect(snap.asks.length).toBe(2);
      expect(snap.bids[0].price).toBe(90000);
      expect(snap.asks[0].price).toBe(90010);
      expect(snap.analysis.bestBid).toBe(90000);
      expect(snap.analysis.bestAsk).toBe(90010);
      expect(snap.analysis.buyerPercent).toBeGreaterThan(50);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("classifica Trending Bull, High Volatility e calcula indicadores sem duplicação", () => {
    const bullKlines = makeCandles(35, 0.006, 0.003);
    const bullRegime = computeMobileRegime(bullKlines);
    expect(bullRegime.label).toBe("Trending Bull");

    const bullInd = computeMobileIndicators(bullKlines);
    expect(bullInd.rsi14).toBeGreaterThan(60);
    expect(bullInd.ema9).toBeGreaterThan(bullInd.ema21);
    expect(bullInd.vwap).toBeGreaterThan(0);

    const volatileKlines = makeCandles(35, 0.001, 0.025);
    const volRegime = computeMobileRegime(volatileKlines);
    expect(volRegime.label).toBe("High Volatility");
  });

  it("não vaza listeners do structuredLogger após alternar abas (subscribe/unsubscribe)", () => {
    let receivedCount = 0;
    const unsubscribe = structuredLogger.subscribe(() => {
      receivedCount++;
    });

    const err = new OrderBookFetchError("Timeout L2 Binance", "BTCUSDT", 503);
    expect(err.name).toBe("OrderBookFetchError");
    structuredLogger.error("MARKET_DATA", `[OrderBookFetchError] ${err.message}`);
    expect(receivedCount).toBe(1);

    unsubscribe();
    structuredLogger.info("RISK_ENGINE", "Evento após unmount da aba");
    expect(receivedCount).toBe(1);
  });

  it("formata preços monoespaçados adequadamente por faixa de valor", () => {
    expect(formatMonoPrice(95123.45)).toContain("95,123.45");
    expect(formatMonoPrice(2.3456)).toBe("2.3456");
    expect(formatMonoPrice(0.000412)).toBe("0.000412");
  });
});
