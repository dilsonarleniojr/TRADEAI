// Indicadores técnicos puros usados pelo motor dos robôs e pelo painel de Motores.
// Todas as funções recebem séries em ordem cronológica (mais antigo -> mais recente).

import type { KlineData } from "@/lib/store";

export function sma(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

/** Série completa de EMA (mesmo comprimento da entrada). */
export function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

export function calculateEMA(closes: number[], period: number): number {
  if (closes.length === 0) return 0;
  if (closes.length < period) return closes[closes.length - 1];
  const series = emaSeries(closes, period);
  return series[series.length - 1];
}

/** RSI de Wilder. Retorna 50 (neutro) quando não há candles suficientes. */
export function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export interface MacdResult {
  macd: number;
  signal: number;
  histogram: number;
  prevHistogram: number;
}

export function calculateMACD(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult | null {
  if (closes.length < slow + signalPeriod) return null;
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  const macdLine = closes.map((_, i) => fastEma[i] - slowEma[i]);
  const signalLine = emaSeries(macdLine, signalPeriod);
  const n = closes.length - 1;
  return {
    macd: macdLine[n],
    signal: signalLine[n],
    histogram: macdLine[n] - signalLine[n],
    prevHistogram: macdLine[n - 1] - signalLine[n - 1],
  };
}

export interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
  /** Posição do preço na banda: 0 = banda inferior, 1 = banda superior. */
  percentB: number;
}

export function calculateBollinger(closes: number[], period = 20, mult = 2): BollingerResult | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const middle = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - middle) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  const upper = middle + mult * std;
  const lower = middle - mult * std;
  const last = closes[closes.length - 1];
  const width = upper - lower;
  return { upper, middle, lower, percentB: width > 0 ? (last - lower) / width : 0.5 };
}

/** ATR médio relativo ao último fechamento (ex.: 0.02 = 2%). */
export function relativeATR(klines: KlineData[], period = 14): number {
  if (klines.length < 2) return 0;
  const slice = klines.slice(-(period + 1));
  let trSum = 0;
  for (let i = 1; i < slice.length; i++) {
    const k = slice[i];
    const prev = slice[i - 1];
    trSum += Math.max(k.high - k.low, Math.abs(k.high - prev.close), Math.abs(k.low - prev.close));
  }
  const atr = trSum / (slice.length - 1);
  return atr / (slice[slice.length - 1].close || 1);
}

/** ADX de Wilder (suavizado). Retorna null sem candles suficientes. */
export function calculateADX(klines: KlineData[], period = 14): number | null {
  if (klines.length < period * 2 + 1) return null;

  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const k = klines[i];
    const prev = klines[i - 1];
    tr.push(Math.max(k.high - k.low, Math.abs(k.high - prev.close), Math.abs(k.low - prev.close)));
    const up = k.high - prev.high;
    const down = prev.low - k.low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }

  const smooth = (arr: number[]) => {
    let acc = arr.slice(0, period).reduce((s, v) => s + v, 0);
    const out = [acc];
    for (let i = period; i < arr.length; i++) {
      acc = acc - acc / period + arr[i];
      out.push(acc);
    }
    return out;
  };

  const sTR = smooth(tr);
  const sPlus = smooth(plusDM);
  const sMinus = smooth(minusDM);

  const dx = sTR.map((t, i) => {
    const pdi = t > 0 ? (sPlus[i] / t) * 100 : 0;
    const mdi = t > 0 ? (sMinus[i] / t) * 100 : 0;
    const sum = pdi + mdi;
    return sum > 0 ? (Math.abs(pdi - mdi) / sum) * 100 : 0;
  });

  if (dx.length < period) return null;
  let adx = dx.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < dx.length; i++) {
    adx = (adx * (period - 1) + dx[i]) / period;
  }
  return adx;
}

export function averageVolume(klines: KlineData[], period = 20, skipLast = 1): number {
  const slice = klines.slice(-(period + skipLast), skipLast > 0 ? -skipLast : undefined);
  if (slice.length === 0) return 0;
  return slice.reduce((s, k) => s + k.volume, 0) / slice.length;
}
