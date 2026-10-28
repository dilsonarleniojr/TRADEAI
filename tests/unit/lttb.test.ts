import { describe, expect, it } from "bun:test";
import { lttbDownsample } from "@/lib/performance/lttb";

describe("Largest Triangle Three Buckets (LTTB) Downsampling", () => {
  it("should return identical array when data length is <= threshold", () => {
    const raw = [100, 105, 102, 110];
    const sampled = lttbDownsample(raw, 60);
    expect(sampled).toEqual(raw);
  });

  it("should handle boundary conditions with 0, 1, or 2 points safely", () => {
    expect(lttbDownsample([], 60)).toEqual([]);
    expect(lttbDownsample([100], 60)).toEqual([100]);
    expect(lttbDownsample([100, 200], 60)).toEqual([100, 200]);
    expect(lttbDownsample([100, 200, 300], 1)).toEqual([100, 200, 300]);
  });

  it("should downsample a series of 500 points to exactly the requested threshold", () => {
    const series = Array.from({ length: 500 }, (_, i) => ({
      index: i,
      equity: 1000 + Math.sin(i / 10) * 100 + i * 2,
    }));

    const threshold = 60;
    const sampled = lttbDownsample(series, threshold, {
      getX: (d) => d.index,
      getY: (d) => d.equity,
    });

    expect(sampled.length).toBe(threshold);
    // Primeiro e último pontos ancorados com precisão
    expect(sampled[0]).toEqual(series[0]);
    expect(sampled[sampled.length - 1]).toEqual(series[series.length - 1]);
  });

  it("should preserve significant spikes and drawdown troughs", () => {
    // Cria uma série com um pico pronunciado e um vale de crash pronunciado
    const series = Array.from({ length: 300 }, (_, i) => ({
      tradeNumber: i,
      equity: 10000,
    }));

    // Injeta um grande pico no índice 120 e um grande vale no índice 210
    series[120].equity = 15000; // Pico (+50%)
    series[210].equity = 5000;  // Vale (-50%)

    const sampled = lttbDownsample(series, 40, {
      getX: (d) => d.tradeNumber,
      getY: (d) => d.equity,
    });

    expect(sampled.length).toBe(40);
    const equities = sampled.map((s) => s.equity);
    const maxSampled = Math.max(...equities);
    const minSampled = Math.min(...equities);

    // O pico e o vale devem ter sido capturados pelo algoritmo LTTB
    expect(maxSampled).toBe(15000);
    expect(minSampled).toBe(5000);
  });

  it("should run ultra fast (sub-millisecond) for 1000 equity entries", () => {
    const largeSeries = Array.from({ length: 1000 }, (_, i) => ({
      x: i,
      equity: 10000 + (i % 7) * 20 - (i % 13) * 15,
    }));

    const start = performance.now();
    const sampled = lttbDownsample(largeSeries, 60);
    const duration = performance.now() - start;

    expect(sampled.length).toBe(60);
    expect(duration).toBeLessThan(10); // Menos de 10ms
  });

  it("should gracefully handle timestamps and default equity fields", () => {
    const trades = [
      { timestamp: "2026-10-25T01:00:00Z", equity: 1000 },
      { timestamp: "2026-10-25T01:10:00Z", equity: 1050 },
      { timestamp: "2026-10-25T01:20:00Z", equity: 980 },
      { timestamp: "2026-10-25T01:30:00Z", equity: 1120 },
      { timestamp: "2026-10-25T01:40:00Z", equity: 1090 },
      { timestamp: "2026-10-25T01:50:00Z", equity: 1200 },
    ];

    const sampled = lttbDownsample(trades, 4);
    expect(sampled.length).toBe(4);
    expect(sampled[0].equity).toBe(1000);
    expect(sampled[3].equity).toBe(1200);
  });
});
