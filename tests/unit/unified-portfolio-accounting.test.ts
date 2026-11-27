import { describe, it, expect } from "vitest";
import { selectPortfolioMetrics, type UnifiedPortfolioInput, type UnifiedTrade } from "@/lib/selectors/portfolioMetrics";

describe("Unified Portfolio Accounting (C1)", () => {
  const samplePortfolio: UnifiedPortfolioInput = {
    totalBalance: 10011.30,
    cashBalance: 9986.30,
    positions: [
      { symbol: "BTCUSDT", quantity: 0.00025, currentPrice: 100000, value: 25.0 }
    ],
    initialBalance: 10000,
  };

  const sampleTrades: UnifiedTrade[] = [
    {
      id: "t1",
      symbol: "BTCUSDT",
      side: "BUY",
      price: 90000,
      quantity: 0.001,
      total: 90,
      timestamp: Date.now() - 3600000,
      pnl: 10,
      netPnl: 9.5,
      mode: "paper",
    },
    {
      id: "t2",
      symbol: "ETHUSDT",
      side: "SELL",
      price: 3000,
      quantity: 0.05,
      total: 150,
      timestamp: Date.now() - 1800000,
      pnl: -5,
      netPnl: -5.5,
      mode: "paper",
    },
    {
      id: "t3",
      symbol: "SOLUSDT",
      side: "BUY",
      price: 200,
      quantity: 0.5,
      total: 100,
      timestamp: Date.now() - 900000,
      pnl: 8,
      netPnl: 7.3048,
      mode: "paper",
    },
  ];

  it("calculates exact matching netPnl, winRate and trade counts across consumers", () => {
    const metrics = selectPortfolioMetrics(samplePortfolio, sampleTrades, { mode: "paper" });

    // Net PnL = 9.5 - 5.5 + 7.3048 = 11.3048
    expect(metrics.netPnl).toBeCloseTo(11.3048, 4);
    expect(metrics.totalOrders).toBe(3);
    expect(metrics.closedTradesCount).toBe(3);
    expect(metrics.winningTradesCount).toBe(2);
    expect(metrics.losingTradesCount).toBe(1);
    expect(metrics.winRate).toBeCloseTo(66.6666, 2);

    // Consistency check: totalBalance must equal cashBalance + positions value
    expect(metrics.totalBalance).toBeCloseTo(10011.30, 2);
    expect(metrics.cashBalance).toBeCloseTo(9986.30, 2);
    expect(metrics.allocatedBalance).toBeCloseTo(25.0, 2);
  });

  it("filters out trades from different modes", () => {
    const mixedTrades: UnifiedTrade[] = [
      ...sampleTrades,
      {
        id: "t-live",
        symbol: "BTCUSDT",
        side: "BUY",
        price: 90000,
        quantity: 0.1,
        total: 9000,
        pnl: 500,
        netPnl: 495,
        mode: "live",
      }
    ];

    const paperMetrics = selectPortfolioMetrics(samplePortfolio, mixedTrades, { mode: "paper" });
    expect(paperMetrics.closedTradesCount).toBe(3);
    expect(paperMetrics.netPnl).toBeCloseTo(11.3048, 4);

    const liveMetrics = selectPortfolioMetrics(samplePortfolio, mixedTrades, { mode: "live" });
    expect(liveMetrics.closedTradesCount).toBe(1);
    expect(liveMetrics.netPnl).toBeCloseTo(495, 2);
  });

  it("safely handles zero trades without division by zero or NaN", () => {
    const emptyMetrics = selectPortfolioMetrics(samplePortfolio, [], { mode: "paper" });
    expect(emptyMetrics.totalOrders).toBe(0);
    expect(emptyMetrics.closedTradesCount).toBe(0);
    expect(emptyMetrics.winRate).toBeNull();
    expect(emptyMetrics.winRateFormatted).toBe("—");
    expect(emptyMetrics.profitFactor).toBe(0);
    expect(emptyMetrics.sharpeRatio).toBe(0);
    expect(emptyMetrics.netPnl).toBe(0);
  });
});
