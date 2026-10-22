import { describe, it, expect } from "bun:test";
import { calculateOrderBookImbalance, detectLiquiditySpoofing, calculateWickPenetration } from "@/lib/order-book-imbalance";

describe("Order Book Liquidity Imbalance (OBI) & Market Confluence", () => {
  it("deve lidar com livro vazio retornando neutro sem exceção", () => {
    const result = calculateOrderBookImbalance([], []);
    expect(result.bidPct).toBe(50);
    expect(result.askPct).toBe(50);
    expect(result.imbalancePct).toBe(0);
    expect(result.skewRatio).toBe(1);
    expect(result.confluenceSignal).toBe("NEUTRAL");
    expect(result.recommendedAction).toBe("NEUTRAL_WAIT");
  });

  it("deve calcular confluência compradora forte quando o Bid supera o Ask em mais de 25%", () => {
    const bids = [
      { price: 65000, volume: 10.0 },
      { price: 64990, volume: 8.0 },
      { price: 64980, volume: 12.0 },
    ];
    const asks = [
      { price: 65010, volume: 2.0 },
      { price: 65020, volume: 3.0 },
      { price: 65030, volume: 2.5 },
    ];

    const result = calculateOrderBookImbalance(bids, asks);
    expect(result.totalBidVol).toBe(30.0);
    expect(result.totalAskVol).toBe(7.5);
    expect(result.skewRatio).toBe(4.0);
    expect(result.bidPct).toBeGreaterThan(70);
    expect(result.imbalancePct).toBeGreaterThan(40);
    expect(result.confluenceSignal).toBe("BULLISH");
    expect(result.recommendedAction).toBe("MARKET_BUY_FAVORABLE");
    expect(result.levelImbalances.length).toBe(3);
    // Cada nível do Bid deve ter imbalance positivo
    expect(result.levelImbalances[0].imbalance).toBeGreaterThan(0);
  });

  it("deve calcular confluência vendedora quando o Ask supera o Bid", () => {
    const bids = [
      { price: 65000, volume: 1.5 },
      { price: 64990, volume: 1.0 },
    ];
    const asks = [
      { price: 65010, volume: 6.0 },
      { price: 65020, volume: 8.0 },
    ];

    const result = calculateOrderBookImbalance(bids, asks);
    expect(result.totalBidVol).toBe(2.5);
    expect(result.totalAskVol).toBe(14.0);
    expect(result.skewRatio).toBeLessThan(0.3);
    expect(result.askPct).toBeGreaterThan(80);
    expect(result.imbalancePct).toBeLessThan(-60);
    expect(result.confluenceSignal).toBe("BEARISH");
    expect(result.recommendedAction).toBe("MARKET_SELL_FAVORABLE");
  });

  it("deve classificar como neutro quando os volumes estão equilibrados dentro de 10%", () => {
    const bids = [
      { price: 65000, volume: 5.0 },
      { price: 64990, volume: 5.2 },
    ];
    const asks = [
      { price: 65010, volume: 4.8 },
      { price: 65020, volume: 5.0 },
    ];

    const result = calculateOrderBookImbalance(bids, asks);
    expect(result.confluenceSignal).toBe("NEUTRAL");
    expect(result.recommendedAction).toBe("NEUTRAL_WAIT");
    expect(Math.abs(result.imbalancePct)).toBeLessThan(10);
  });

  it("deve calcular desbalanceamento granular nível a nível (L1 a L8)", () => {
    const bids = Array.from({ length: 8 }, (_, i) => ({ price: 100 - i, volume: (i + 1) * 2 }));
    const asks = Array.from({ length: 8 }, (_, i) => ({ price: 101 + i, volume: (i + 1) * 1 }));

    const result = calculateOrderBookImbalance(bids, asks, 8);
    expect(result.levelImbalances.length).toBe(8);
    // Em cada nível, o bid tem o dobro do volume do ask -> imbalance = (2 - 1) / (2 + 1) = 0.333
    expect(result.levelImbalances[0].imbalance).toBeCloseTo(0.333, 2);
    expect(result.levelImbalances[7].level).toBe(8);
  });
});

describe("Liquidity Spoofing Guard (Inversão Repentina de Liquidez)", () => {
  it("deve detectar spoofing quando a liquidez do Bid cai >= 30% em menos de 1000ms", () => {
    const t0 = 100000;
    const previous = { totalBidVol: 100.0, totalAskVol: 50.0, timestamp: t0 };
    // Queda súbita de 100 para 65 (35% removido) em 350ms
    const current = { totalBidVol: 65.0, totalAskVol: 50.0, timestamp: t0 + 350 };

    const alert = detectLiquiditySpoofing(current, previous);
    expect(alert.isAlertActive).toBe(true);
    expect(alert.side).toBe("BID");
    expect(alert.dropPct).toBe(35.0);
    expect(alert.timeDeltaMs).toBe(350);
    expect(alert.severity).toBe("WARNING");
    expect(alert.message).toContain("Parede de Compra (-35%)");
  });

  it("deve classificar como CRITICAL quando a retirada for >= 45%", () => {
    const t0 = 100000;
    const previous = { totalBidVol: 100.0, totalAskVol: 50.0, timestamp: t0 };
    // Queda massiva de 100 para 40 (60% sumiu) em 400ms
    const current = { totalBidVol: 40.0, totalAskVol: 50.0, timestamp: t0 + 400 };

    const alert = detectLiquiditySpoofing(current, previous);
    expect(alert.isAlertActive).toBe(true);
    expect(alert.severity).toBe("CRITICAL");
    expect(alert.dropPct).toBe(60.0);
  });

  it("deve detectar spoofing no lado Ask quando uma parede vendedora é cancelada", () => {
    const t0 = 100000;
    const previous = { totalBidVol: 50.0, totalAskVol: 120.0, timestamp: t0 };
    // Venda recua de 120 para 70 (queda de 41.7%) em 450ms
    const current = { totalBidVol: 50.0, totalAskVol: 70.0, timestamp: t0 + 450 };

    const alert = detectLiquiditySpoofing(current, previous);
    expect(alert.isAlertActive).toBe(true);
    expect(alert.side).toBe("ASK");
    expect(alert.dropPct).toBeCloseTo(41.7, 1);
    expect(alert.message).toContain("Parede de Venda");
  });

  it("não deve acionar alerta quando a oscilação for normal (< 30%)", () => {
    const t0 = 100000;
    const previous = { totalBidVol: 100.0, totalAskVol: 100.0, timestamp: t0 };
    // Queda leve de 15%
    const current = { totalBidVol: 85.0, totalAskVol: 90.0, timestamp: t0 + 300 };

    const alert = detectLiquiditySpoofing(current, previous);
    expect(alert.isAlertActive).toBe(false);
    expect(alert.side).toBe("NONE");
  });

  it("não deve acionar alerta se a variação ocorreu após a janela máxima de spoofing (> 1500ms)", () => {
    const t0 = 100000;
    const previous = { totalBidVol: 100.0, totalAskVol: 100.0, timestamp: t0 };
    // Queda de 40% mas depois de 3000ms (fluxo orgânico normal de mercado)
    const current = { totalBidVol: 60.0, totalAskVol: 100.0, timestamp: t0 + 3000 };

    const alert = detectLiquiditySpoofing(current, previous);
    expect(alert.isAlertActive).toBe(false);
  });
});

describe("Filtro de Liquidação de Pavio (Wick Penetration Calculator)", () => {
  it("deve calcular a evasão de stop loss evitada por pavio de baixa em tentativa de compra (BID spoofing)", () => {
    const result = calculateWickPenetration({
      entryPrice: 1000,
      candleHigh: 1005,
      candleLow: 975,
      side: "BID",
      notionalUsd: 100,
      stopLossPct: 1.8,
    });

    expect(result.side).toBe("BID");
    expect(result.theoreticalStopPrice).toBe(982); // 1000 * (1 - 0.018)
    expect(result.manipulatedWickPrice).toBe(975);
    expect(result.didBreachStop).toBe(true);
    expect(result.distanceToStopUsd).toBe(7); // |975 - 982|
    expect(result.distanceToStopPct).toBe(0.7); // 7 / 1000 * 100
    expect(result.savedLossUsd).toBe(1.8); // 100 * 1.8%
    expect(result.narrative).toBe("Esta evasão evitou um stop de -$1.80 (-1.8%) causado pelo pavio de manipulação");
  });

  it("deve calcular evasão no lado vendedor (ASK spoofing) com pavio de alta violando stop de short", () => {
    const result = calculateWickPenetration({
      entryPrice: 2000,
      candleHigh: 2045,
      candleLow: 1990,
      side: "ASK",
      notionalUsd: 50,
      stopLossPct: 1.8,
    });

    expect(result.side).toBe("ASK");
    expect(result.theoreticalStopPrice).toBe(2036); // 2000 * (1 + 0.018)
    expect(result.manipulatedWickPrice).toBe(2045);
    expect(result.didBreachStop).toBe(true);
    expect(result.distanceToStopUsd).toBe(9); // |2045 - 2036|
    expect(result.savedLossUsd).toBe(0.9); // 50 * 1.8%
    expect(result.narrative).toBe("Esta evasão evitou um stop de -$0.90 (-1.8%) causado pelo pavio de manipulação");
  });

  it("deve respeitar customStopLossPrice quando fornecido pela sessão de trading", () => {
    const result = calculateWickPenetration({
      entryPrice: 100,
      candleHigh: 101,
      candleLow: 97.5,
      customStopLossPrice: 98.2,
      notionalUsd: 50,
    });

    expect(result.theoreticalStopPrice).toBe(98.2);
    expect(result.stopLossPct).toBe(1.8);
    expect(result.savedLossUsd).toBe(0.9);
    expect(result.narrative).toBe("Esta evasão evitou um stop de -$0.90 (-1.8%) causado pelo pavio de manipulação");
  });

  it("deve identificar corretamente quando o pavio se aproxima do stop sem perfurar", () => {
    const result = calculateWickPenetration({
      entryPrice: 1000,
      candleHigh: 1002,
      candleLow: 985,
      side: "BID",
      notionalUsd: 50,
      stopLossPct: 1.8,
    });

    expect(result.theoreticalStopPrice).toBe(982);
    expect(result.didBreachStop).toBe(false);
    expect(result.distanceToStopUsd).toBe(3); // 985 - 982
    expect(result.narrative).toBe("Esta evasão evitou um stop de -$0.90 (-1.8%) causado pelo pavio de manipulação");
  });

  it("deve calcular as métricas de velocidade de rejeição do pavio (WickRejectionMetrics)", () => {
    // Candle de 1000 a 970 (queda de $30), fechamento recuperou em 995 ($25 recuperados) em 350ms
    const result = calculateWickPenetration({
      entryPrice: 1000,
      candleHigh: 1002,
      candleLow: 970,
      candleClose: 995,
      side: "BID",
      timeDeltaMs: 350,
    });

    expect(result.rejection).toBeDefined();
    expect(result.rejection.rejectionTimeMs).toBe(350);
    expect(result.rejection.classification).toBe("ULTRA_FAST");
    expect(result.rejection.label).toContain("Instantânea");
    // $25 em 0.35s = ~71.43 $/s
    expect(result.rejection.rejectionVelocityUsdPerSec).toBeCloseTo(71.43, 1);
    // 25 / 32 = ~78.1% de absorção do pavio
    expect(result.rejection.absorptionPct).toBeGreaterThan(70);
    expect(result.rejection.estimatedTicks).toBeGreaterThan(10);
    expect(result.rejection.summary).toContain("350ms");
  });

  it("deve classificar rejeições mais lentas como FAST ou MODERATE conforme o timeDeltaMs", () => {
    const fastResult = calculateWickPenetration({
      entryPrice: 2000,
      candleHigh: 2050,
      candleLow: 1990,
      candleClose: 2010,
      side: "ASK",
      timeDeltaMs: 900,
    });
    expect(fastResult.rejection.classification).toBe("FAST");

    const modResult = calculateWickPenetration({
      entryPrice: 2000,
      candleHigh: 2050,
      candleLow: 1990,
      candleClose: 2010,
      side: "ASK",
      timeDeltaMs: 2200,
    });
    expect(modResult.rejection.classification).toBe("MODERATE");
  });
});
