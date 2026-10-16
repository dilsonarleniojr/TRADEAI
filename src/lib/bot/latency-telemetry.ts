/**
 * Telemetria de Latência Tick-to-Trade e Execução de Rede (Pilar 1 & Pilar 4)
 * Mede:
 * - Latência de Dados de Mercado (Timestamp da Binance vs Recebimento local)
 * - Latência do Comitê de Decisão Algorítmica (tempo de computação matemática)
 * - Latência de Despacho de Ordens REST/WebSocket (RTT de rede e confirmação da exchange)
 * - Percentis p50, p90, p95 e p99 em ring buffer de alta performance
 */

export interface LatencySample {
  timestamp: number;
  marketDataMs: number;
  decisionMs: number;
  dispatchMs: number;
  totalMs: number;
  symbol: string;
}

export interface LatencyPercentiles {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
  sampleCount: number;
  lastUpdated: number;
}

export interface SystemLatencySnapshot {
  totalTickToTrade: LatencyPercentiles;
  orderDispatch: LatencyPercentiles;
  marketDataFeed: LatencyPercentiles;
  networkHealth: "EXCELLENT" | "GOOD" | "DEGRADED" | "CRITICAL";
  recentSamples: LatencySample[];
}

const BUFFER_CAPACITY = 300;
const ringBuffer: LatencySample[] = [];

function calculatePercentiles(values: number[]): LatencyPercentiles {
  if (values.length === 0) {
    return {
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      avg: 0,
      min: 0,
      max: 0,
      sampleCount: 0,
      lastUpdated: Date.now(),
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  const getPercentile = (pct: number) => {
    const idx = Math.min(n - 1, Math.max(0, Math.ceil((pct / 100) * n) - 1));
    return sorted[idx];
  };

  const sum = sorted.reduce((acc, v) => acc + v, 0);

  return {
    p50: parseFloat(getPercentile(50).toFixed(1)),
    p90: parseFloat(getPercentile(90).toFixed(1)),
    p95: parseFloat(getPercentile(95).toFixed(1)),
    p99: parseFloat(getPercentile(99).toFixed(1)),
    avg: parseFloat((sum / n).toFixed(1)),
    min: parseFloat(sorted[0].toFixed(1)),
    max: parseFloat(sorted[n - 1].toFixed(1)),
    sampleCount: n,
    lastUpdated: Date.now(),
  };
}

export const latencyTelemetry = {
  recordSample(symbol: string, marketDataMs: number, decisionMs: number, dispatchMs: number) {
    const totalMs = Math.max(0.1, marketDataMs + decisionMs + dispatchMs);
    const sample: LatencySample = {
      timestamp: Date.now(),
      marketDataMs: Math.max(0, parseFloat(marketDataMs.toFixed(1))),
      decisionMs: Math.max(0, parseFloat(decisionMs.toFixed(1))),
      dispatchMs: Math.max(0, parseFloat(dispatchMs.toFixed(1))),
      totalMs: parseFloat(totalMs.toFixed(1)),
      symbol,
    };

    if (ringBuffer.length >= BUFFER_CAPACITY) {
      ringBuffer.shift();
    }
    ringBuffer.push(sample);
  },

  recordDispatchOnly(symbol: string, dispatchMs: number) {
    this.recordSample(symbol, 2.0, 1.5, dispatchMs);
  },

  getSnapshot(): SystemLatencySnapshot {
    const totalValues = ringBuffer.map((s) => s.totalMs);
    const dispatchValues = ringBuffer.map((s) => s.dispatchMs);
    const feedValues = ringBuffer.map((s) => s.marketDataMs);

    const totalStats = calculatePercentiles(totalValues);
    const dispatchStats = calculatePercentiles(dispatchValues);
    const feedStats = calculatePercentiles(feedValues);

    let networkHealth: "EXCELLENT" | "GOOD" | "DEGRADED" | "CRITICAL" = "EXCELLENT";
    if (totalStats.p95 > 800 || dispatchStats.p95 > 600) {
      networkHealth = "CRITICAL";
    } else if (totalStats.p95 > 400 || dispatchStats.p95 > 300) {
      networkHealth = "DEGRADED";
    } else if (totalStats.p95 > 150) {
      networkHealth = "GOOD";
    }

    return {
      totalTickToTrade: totalStats,
      orderDispatch: dispatchStats,
      marketDataFeed: feedStats,
      networkHealth,
      recentSamples: ringBuffer.slice(-20),
    };
  },

  clear() {
    ringBuffer.length = 0;
  },
};
