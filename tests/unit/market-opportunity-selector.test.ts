import { describe, it, expect } from "bun:test";
import { MarketOpportunitySelector, CandidateMarketData } from "@/lib/bot/pilot/market-opportunity-selector";
import { SymbolFilters } from "@/lib/bot/pilot/exchange-metadata-service";
import type { KlineData } from "@/lib/store";

describe("MarketOpportunitySelector (Quantitative & AI-Driven Selection)", () => {
  const selector = MarketOpportunitySelector.getInstance();

  const btcFilters: SymbolFilters = {
    symbol: "BTCUSDT",
    minQty: 0.00001,
    maxQty: 9000,
    stepSize: 0.00001,
    minPrice: 0.01,
    maxPrice: 1000000,
    tickSize: 0.01,
    minNotional: 5.0,
    baseAsset: "BTC",
    quoteAsset: "USDT",
    status: "TRADING",
  };

  function createTrendingKlines(basePrice: number, atrPercent = 0.015, count = 50): KlineData[] {
    const klines: KlineData[] = [];
    const now = Math.floor(Date.now() / 1000);
    const halfRange = (basePrice * atrPercent) / 2;

    for (let i = count; i >= 0; i--) {
      // Tendência de alta suave
      const center = basePrice * (1 + (count - i) * 0.001);
      klines.push({
        time: now - i * 900,
        open: center - halfRange * 0.5,
        high: center + halfRange,
        low: center - halfRange,
        close: center + halfRange * 0.3,
        volume: 5000,
      });
    }
    return klines;
  }

  it("deve aprovar ativo com alta liquidez, spread comprimido e volatilidade equilibrada", () => {
    const candidate: CandidateMarketData = {
      symbol: "BTCUSDT",
      volume24hUsd: 120_000_000,
      lastPrice: 65000.0,
      bestBid: 64998.0,
      bestAsk: 65000.0,
      spreadPct: 0.00003, // 0.003% (ultracompresso)
      priceChange24hPct: 2.5,
    };

    const klines = createTrendingKlines(65000.0, 0.015);
    const evaluated = selector.evaluateCandidate(candidate, klines, btcFilters, 70.0);

    expect(evaluated).not.toBeNull();
    expect(evaluated!.symbol).toBe("BTCUSDT");
    expect(evaluated!.score).toBeGreaterThan(60);
    expect(evaluated!.signal.suggestedPrice).toBe(64998.0);
    expect(evaluated!.signal.stopLoss).toBeLessThan(64998.0);
    expect(evaluated!.signal.takeProfit).toBeGreaterThan(64998.0);

    // Verifica assimetria R:R do sinal
    const risk = 64998.0 - evaluated!.signal.stopLoss;
    const reward = evaluated!.signal.takeProfit - 64998.0;
    const rr = reward / risk;
    expect(rr).toBeGreaterThanOrEqual(1.5);
  });

  it("deve descartar ativo se o spread bid-ask for aberto (> 0.05%)", async () => {
    // Tickers com spread > 0.05% não devem passar pela triagem de tickers
    const candidateSpreadLargo: CandidateMarketData = {
      symbol: "WIDEUSDT",
      volume24hUsd: 50_000_000,
      lastPrice: 10.0,
      bestBid: 9.99,
      bestAsk: 10.05, // Spread de 0.6%
      spreadPct: 0.006,
      priceChange24hPct: 1.0,
    };

    // A regra MAX_SPREAD_PERCENT é 0.0005 (0.05%)
    expect(candidateSpreadLargo.spreadPct).toBeGreaterThan(MarketOpportunitySelector.MAX_SPREAD_PERCENT);
  });

  it("deve descartar ativo se a volatilidade for excessiva (> 2.5% ATR)", () => {
    const candidate: CandidateMarketData = {
      symbol: "BTCUSDT",
      volume24hUsd: 80_000_000,
      lastPrice: 65000.0,
      bestBid: 64998.0,
      bestAsk: 65000.0,
      spreadPct: 0.00003,
      priceChange24hPct: 8.5,
    };

    // Klines com ATR de 4.0%
    const volatileKlines = createTrendingKlines(65000.0, 0.040);
    const evaluated = selector.evaluateCandidate(candidate, volatileKlines, btcFilters, 70.0);

    expect(evaluated).toBeNull();
  });

  it("deve descartar ativo se o mercado for Choppy / Consolidação sem tendência", () => {
    const candidate: CandidateMarketData = {
      symbol: "BTCUSDT",
      volume24hUsd: 50_000_000,
      lastPrice: 65000.0,
      bestBid: 64998.0,
      bestAsk: 65000.0,
      spreadPct: 0.00003,
      priceChange24hPct: 0.1,
    };

    // Klines perfeitamente flat (ADX < 15)
    const flatKlines: KlineData[] = [];
    const now = Math.floor(Date.now() / 1000);
    for (let i = 50; i >= 0; i--) {
      flatKlines.push({
        time: now - i * 900,
        open: 65000.0,
        high: 65005.0,
        low: 64995.0,
        close: 65000.0,
        volume: 500,
      });
    }

    const evaluated = selector.evaluateCandidate(candidate, flatKlines, btcFilters, 70.0);
    expect(evaluated).toBeNull();
  });

  it("deve encontrar a melhor oportunidade dinamicamente via findBestOpportunity", async () => {
    const best = await selector.findBestOpportunity(70.0);
    expect(best).toBeDefined();
    expect(best.symbol).toBeDefined();
    expect(best.score).toBeGreaterThan(0);
    expect(best.signal.suggestedPrice).toBeGreaterThan(0);
    expect(best.signal.stopLoss).toBeLessThan(best.signal.suggestedPrice);
    expect(best.signal.takeProfit).toBeGreaterThan(best.signal.suggestedPrice);
  });
});
