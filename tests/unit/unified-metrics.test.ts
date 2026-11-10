import { describe, it, expect } from "bun:test";
import {
  calculateUnifiedMetrics,
  type UnifiedTradeRecord,
  type MetricCalculationOptions,
} from "@/lib/metrics/unified-metrics";

describe("Unified Metrics Engine (Fase 1 - Fonte Única da Verdade)", () => {
  it("deve tratar carteira sem trades retornando valores nulos para taxas e ratios estatísticos", () => {
    const trades: UnifiedTradeRecord[] = [];
    const metrics = calculateUnifiedMetrics({
      trades,
      portfolio: {
        totalBalance: 10000,
        cashBalance: 10000,
        initialBalance: 10000,
      },
    });

    expect(metrics.totalOrders).toBe(0);
    expect(metrics.closedTradesCount).toBe(0);
    expect(metrics.winningTradesCount).toBe(0);
    expect(metrics.losingTradesCount).toBe(0);
    expect(metrics.winRate).toBeNull(); // Não deve ser 0% nem 100%
    expect(metrics.winRateFormatted).toBe("—");
    expect(metrics.profitFactor).toBeNull();
    expect(metrics.profitFactorFormatted).toBe("—");
    expect(metrics.payoffRatio).toBeNull();
    expect(metrics.sharpeRatio).toBeNull();
    expect(metrics.sortinoRatio).toBeNull();
    expect(metrics.isSmallSample).toBe(true);
    expect(metrics.sampleSizeNotice).toBe("Sem operações encerradas");
    expect(metrics.netPnl).toBe(0);
    expect(metrics.netPnlFormatted).toBe("US$ 0,00");
  });

  it("deve sinalizar amostra pequena para menos de 30 trades e calcular métricas com precisão", () => {
    // Cenário idêntico ao observado no Diário: 10 vitórias e 32 derrotas = 42 trades
    const trades: UnifiedTradeRecord[] = [];
    // 10 vitórias de $0.50 cada (bruto $5.00, taxas $0.05 cada)
    for (let i = 0; i < 10; i++) {
      trades.push({
        id: `trade-win-${i}`,
        symbol: "BTCUSDT",
        side: "SELL",
        price: 68000,
        quantity: 0.01,
        total: 680,
        grossPnl: 0.50,
        fee: 0.05,
        slippage: 0.01,
        netPnl: 0.44,
        mode: "paper",
        source: "LIVE_FLEET",
        timestamp: Date.now() - (42 - i) * 60000,
      });
    }
    // 32 derrotas de $0.50 cada (bruto -$16.00, taxas $0.05 cada)
    for (let i = 0; i < 32; i++) {
      trades.push({
        id: `trade-loss-${i}`,
        symbol: "ETHUSDT",
        side: "SELL",
        price: 3500,
        quantity: 0.1,
        total: 350,
        grossPnl: -0.50,
        fee: 0.05,
        slippage: 0.01,
        netPnl: -0.56,
        mode: "paper",
        source: "LIVE_FLEET",
        timestamp: Date.now() - (32 - i) * 60000,
      });
    }

    const metrics = calculateUnifiedMetrics({
      trades,
      portfolio: {
        totalBalance: 10000 - 13.52,
        cashBalance: 9986.48,
        initialBalance: 10000,
      },
    });

    expect(metrics.closedTradesCount).toBe(42);
    expect(metrics.winningTradesCount).toBe(10);
    expect(metrics.losingTradesCount).toBe(32);
    // Win rate = 10 / 42 = 23.8%
    expect(metrics.winRate).toBeCloseTo(23.8, 1);
    expect(metrics.winRateFormatted).toBe("23,8%");
    expect(metrics.isSmallSample).toBe(false); // 42 trades >= 30

    // PnL líquido total = 10 * 0.44 - 32 * 0.56 = 4.40 - 17.92 = -13.52
    expect(metrics.netPnl).toBeCloseTo(-13.52, 2);
    expect(metrics.grossProfit).toBeCloseTo(4.40, 2);
    expect(metrics.grossLoss).toBeCloseTo(17.92, 2);
    // Profit Factor = 4.40 / 17.92 = ~0.246
    expect(metrics.profitFactor).toBeCloseTo(0.25, 2);
  });

  it("deve filtrar por escopo (Frota vs IA Direta vs Todas)", () => {
    const trades: UnifiedTradeRecord[] = [
      {
        id: "t1",
        symbol: "BTCUSDT",
        side: "SELL",
        price: 68000,
        netPnl: 10.0,
        mode: "paper",
        source: "LIVE_FLEET",
        botId: "bot-alpha",
        timestamp: Date.now() - 5000,
      },
      {
        id: "t2",
        symbol: "SOLUSDT",
        side: "SELL",
        price: 150,
        netPnl: -5.0,
        mode: "paper",
        source: "DIRECT_AI",
        timestamp: Date.now() - 3000,
      },
    ];

    // Escopo Somente Robôs
    const fleetMetrics = calculateUnifiedMetrics({
      trades,
      options: { scope: "FLEET" },
    });
    expect(fleetMetrics.closedTradesCount).toBe(1);
    expect(fleetMetrics.netPnl).toBe(10.0);
    expect(fleetMetrics.scopeLabel).toBe("Somente robôs");

    // Escopo IA Direta
    const aiMetrics = calculateUnifiedMetrics({
      trades,
      options: { scope: "DIRECT_AI" },
    });
    expect(aiMetrics.closedTradesCount).toBe(1);
    expect(aiMetrics.netPnl).toBe(-5.0);
    expect(aiMetrics.scopeLabel).toBe("IA direta");

    // Escopo Todas as Origens
    const allMetrics = calculateUnifiedMetrics({
      trades,
      options: { scope: "ALL" },
    });
    expect(allMetrics.closedTradesCount).toBe(2);
    expect(allMetrics.netPnl).toBe(5.0);
    expect(allMetrics.scopeLabel).toBe("Todas as origens");
  });

  it("deve avisar sobre amostra pequena quando houver entre 1 e 29 trades", () => {
    const trades: UnifiedTradeRecord[] = [
      {
        id: "t1",
        symbol: "BTCUSDT",
        side: "SELL",
        price: 68000,
        netPnl: -0.05,
        mode: "paper",
        source: "LIVE_FLEET",
        timestamp: Date.now(),
      },
    ];

    const metrics = calculateUnifiedMetrics({ trades });
    expect(metrics.closedTradesCount).toBe(1);
    expect(metrics.winningTradesCount).toBe(0);
    expect(metrics.losingTradesCount).toBe(1);
    expect(metrics.winRate).toBe(0);
    expect(metrics.isSmallSample).toBe(true);
    expect(metrics.sampleSizeNotice).toBe("Amostra pequena (1 trade)");
  });
});
