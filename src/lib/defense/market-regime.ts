/**
 * Market Regime Detector
 * Classifica o regime de mercado usando ADX + Bollinger Band Width.
 * TREND:  ADX > 25
 * RANGE:  ADX < 20
 * CHAOS:  BB Width > 2σ (alta volatilidade)
 */

import type { MarketRegime } from "@/lib/store/tradeSlice";

export interface RegimeInput {
  closes: number[];   // array de fechamentos (mín 20 candles)
  highs: number[];
  lows: number[];
  period?: number;    // ADX period, default 14
}

function calcEMA(values: number[], period: number): number {
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcADX(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (highs.length < period + 1) return 0;
  const trList: number[] = [];
  const dmPlus: number[] = [];
  const dmMinus: number[] = [];

  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trList.push(tr);
    dmPlus.push(Math.max(highs[i] - highs[i - 1], 0));
    dmMinus.push(Math.max(lows[i - 1] - lows[i], 0));
  }

  const atrPeriod = trList.slice(-period);
  const atr = atrPeriod.reduce((a, b) => a + b, 0) / period;
  if (atr === 0) return 0;

  const diPlus = (dmPlus.slice(-period).reduce((a, b) => a + b, 0) / period / atr) * 100;
  const diMinus = (dmMinus.slice(-period).reduce((a, b) => a + b, 0) / period / atr) * 100;
  const diSum = diPlus + diMinus;
  if (diSum === 0) return 0;
  return (Math.abs(diPlus - diMinus) / diSum) * 100;
}

function calcBollingerWidth(closes: number[], period = 20): number {
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  return mean > 0 ? (std * 2 * 2) / mean : 0; // (2σ width) / price
}

export function detectRegime(input: RegimeInput): {
  regime: MarketRegime;
  adx: number;
  bbWidth: number;
} {
  const period = input.period ?? 14;
  const adx = calcADX(input.highs, input.lows, input.closes, period);
  const bbWidth = calcBollingerWidth(input.closes);

  let regime: MarketRegime;
  if (bbWidth > 0.08) {
    regime = "CHAOS";
  } else if (adx > 25) {
    regime = "TREND";
  } else if (adx < 20) {
    regime = "RANGE";
  } else {
    regime = "UNKNOWN";
  }

  return { regime, adx, bbWidth };
}

/** Regras de compatibilidade: quais estratégias rodam em cada regime */
export const REGIME_STRATEGY_MAP: Record<MarketRegime, string[]> = {
  TREND:   ["AI", "OBI", "MeanReversion", "Sniper", "TWAP", "VWAP"],
  RANGE:   ["Grid", "PairsTrading", "DCA", "Kelly"],
  CHAOS:   ["MeanReversion"],  // apenas reversão a média extrema no caos
  UNKNOWN: ["AI", "DCA"],
};

export function isStrategyAllowed(strategy: string, regime: MarketRegime): boolean {
  return REGIME_STRATEGY_MAP[regime]?.includes(strategy) ?? true;
}
