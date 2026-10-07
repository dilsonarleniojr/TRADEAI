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

// ===========================================================================
// SKILL: technical-scanner — Multi-Timeframe Key Levels, Composite Scoring & Regime
// ===========================================================================

export interface PivotPoints {
  pp: number;
  r1: number;
  s1: number;
  r2: number;
  s2: number;
  r3: number;
  s3: number;
}

/**
 * Calcula os Pivot Points clássicos a partir de High, Low e Close (geralmente D1 ou 24h).
 * PP = (H + L + C) / 3
 * R1 = 2*PP - L, S1 = 2*PP - H
 * R2 = PP + (H - L), S2 = PP - (H - L)
 * R3 = H + 2*(PP - L), S3 = L - 2*(H - PP)
 */
export function calculatePivotPoints(high: number, low: number, close: number): PivotPoints {
  if (high <= 0 || low <= 0 || close <= 0 || high < low) {
    return { pp: close, r1: close, s1: close, r2: close, s2: close, r3: close, s3: close };
  }
  const pp = (high + low + close) / 3;
  const r1 = 2 * pp - low;
  const s1 = 2 * pp - high;
  const r2 = pp + (high - low);
  const s2 = pp - (high - low);
  const r3 = high + 2 * (pp - low);
  const s3 = low - 2 * (high - pp);

  return {
    pp: parseFloat(pp.toFixed(6)),
    r1: parseFloat(r1.toFixed(6)),
    s1: parseFloat(s1.toFixed(6)),
    r2: parseFloat(r2.toFixed(6)),
    s2: parseFloat(s2.toFixed(6)),
    r3: parseFloat(r3.toFixed(6)),
    s3: parseFloat(s3.toFixed(6)),
  };
}

export interface ResistanceCheck {
  safeToBuy: boolean;
  nearestLevel: string;
  levelPrice: number;
  distancePercent: number;
  warning?: string;
}

/**
 * Valida a regra anti-topo da skill technical-scanner:
 * Proíbe BUY se a cotação estiver a menos de 0.8% da resistência R1 ou R2.
 */
export function checkResistanceProximity(currentPrice: number, pivots: PivotPoints, minDistancePct = 0.8): ResistanceCheck {
  if (currentPrice <= 0 || pivots.r1 <= 0) {
    return { safeToBuy: true, nearestLevel: "Nenhum", levelPrice: 0, distancePercent: 100 };
  }

  // Verifica R1
  if (currentPrice <= pivots.r1) {
    const distR1 = ((pivots.r1 - currentPrice) / currentPrice) * 100;
    if (distR1 < minDistancePct) {
      return {
        safeToBuy: false,
        nearestLevel: "R1",
        levelPrice: pivots.r1,
        distancePercent: parseFloat(distR1.toFixed(2)),
        warning: `Preço a apenas ${distR1.toFixed(2)}% da resistência diária R1 ($${pivots.r1}) — perigo de falso rompimento/topo`,
      };
    }
  }

  // Verifica R2 se rompeu R1
  if (currentPrice > pivots.r1 && currentPrice <= pivots.r2) {
    const distR2 = ((pivots.r2 - currentPrice) / currentPrice) * 100;
    if (distR2 < minDistancePct) {
      return {
        safeToBuy: false,
        nearestLevel: "R2",
        levelPrice: pivots.r2,
        distancePercent: parseFloat(distR2.toFixed(2)),
        warning: `Preço a apenas ${distR2.toFixed(2)}% da resistência secundária R2 ($${pivots.r2}) — exaustão de compra`,
      };
    }
  }

  return {
    safeToBuy: true,
    nearestLevel: currentPrice > pivots.r1 ? "R2" : "R1",
    levelPrice: currentPrice > pivots.r1 ? pivots.r2 : pivots.r1,
    distancePercent: currentPrice > pivots.r1
      ? parseFloat((((pivots.r2 - currentPrice) / currentPrice) * 100).toFixed(2))
      : parseFloat((((pivots.r1 - currentPrice) / currentPrice) * 100).toFixed(2)),
  };
}

export type TechnicalRegime = "Trending Up" | "Trending Down" | "Ranging" | "Volatile" | "Compressing";

export interface TechnicalScannerScore {
  compositeScore: number;
  recommendation: "Strong Buy" | "Buy" | "Neutral / Wait" | "Sell" | "Strong Sell";
  regime: TechnicalRegime;
  scores: {
    emaCross: number;
    rsi: number;
    macd: number;
    bollinger: number;
    atr: number;
    volume: number;
  };
}

/**
 * Sistema de pontuação quantitativa composta da skill technical-scanner:
 * Avalia 6 indicadores em escala de -2 a +2 (Total de -12 a +12):
 * >= 6: Strong Buy | 3 a 5: Buy | -2 a 2: Neutral | -5 a -3: Sell | <= -6: Strong Sell
 */
export function calculateTechnicalScannerScore(klines: KlineData[]): TechnicalScannerScore {
  const neutralResult: TechnicalScannerScore = {
    compositeScore: 0,
    recommendation: "Neutral / Wait",
    regime: "Ranging",
    scores: { emaCross: 0, rsi: 0, macd: 0, bollinger: 0, atr: 0, volume: 0 },
  };

  if (!klines || klines.length < 30) return neutralResult;

  const closes = klines.map((k) => k.close);
  const lastClose = closes[closes.length - 1];
  const lastCandle = klines[klines.length - 1];

  // 1. EMA Cross (9 / 21)
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  let emaScore = 0;
  if (lastClose > ema9 && ema9 > ema21) emaScore = 2;
  else if (lastClose > ema21 && ema9 >= ema21) emaScore = 1;
  else if (lastClose < ema21 && ema9 > ema21) emaScore = -1;
  else if (lastClose < ema9 && ema9 < ema21) emaScore = -2;

  // 2. RSI (14)
  const rsi = calculateRSI(closes, 14);
  let rsiScore = 0;
  if (rsi >= 52 && rsi <= 66) rsiScore = 2; // Forte impulso com espaço
  else if (rsi >= 46 && rsi < 52) rsiScore = 1; // Apoio em equilíbrio
  else if (rsi > 72) rsiScore = -2; // Sobrecompra crítica (armadilha de topo)
  else if (rsi < 35 && lastClose < ema21) rsiScore = -2; // Queda livre
  else if (rsi < 45) rsiScore = -1;

  // 3. MACD (12, 26, 9)
  const macd = calculateMACD(closes, 12, 26, 9);
  let macdScore = 0;
  if (macd) {
    if (macd.histogram > 0 && macd.histogram > macd.prevHistogram) macdScore = 2;
    else if (macd.histogram > 0) macdScore = 1;
    else if (macd.histogram < 0 && macd.histogram < macd.prevHistogram) macdScore = -2;
    else if (macd.histogram < 0) macdScore = -1;
  }

  // 4. Bollinger Bands (20, 2)
  const bb = calculateBollinger(closes, 20, 2);
  let bbScore = 0;
  if (bb) {
    if (bb.percentB >= 0.55 && bb.percentB <= 0.85) bbScore = 2; // Alta saudável
    else if (bb.percentB > 0.85 && bb.percentB <= 1.0) bbScore = 1;
    else if (bb.percentB > 1.02) bbScore = -1; // Exaustão além da banda superior
    else if (bb.percentB < 0.2) bbScore = -2; // Pressão contra banda inferior
  }

  // 5. ATR vs Média de 20 períodos
  const relAtr = relativeATR(klines, 14);
  let atrScore = 1; // Normal por padrão
  if (relAtr > 0.04) atrScore = -1; // Volatilidade descontrolada (>4% por barra)
  else if (relAtr < 0.005) atrScore = 0; // Mercado parado

  // 6. Volume vs Média de 20 períodos
  const avgVol = averageVolume(klines, 20, 1);
  const volRatio = avgVol > 0 ? lastCandle.volume / avgVol : 1;
  const isGreenCandle = lastCandle.close >= lastCandle.open;
  let volScore = 0;
  if (volRatio >= 1.25 && isGreenCandle) volScore = 2;
  else if (volRatio >= 1.0 && isGreenCandle) volScore = 1;
  else if (volRatio >= 1.25 && !isGreenCandle) volScore = -2; // Forte volume vendedor
  else if (volRatio < 0.7) volScore = -1; // Volume fraco / sem convicção

  const compositeScore = emaScore + rsiScore + macdScore + bbScore + atrScore + volScore;

  let recommendation: TechnicalScannerScore["recommendation"] = "Neutral / Wait";
  if (compositeScore >= 6) recommendation = "Strong Buy";
  else if (compositeScore >= 3) recommendation = "Buy";
  else if (compositeScore <= -6) recommendation = "Strong Sell";
  else if (compositeScore <= -3) recommendation = "Sell";

  // Detecção de Regime de Mercado (Skill)
  const adx = calculateADX(klines, 14) || 20;
  let regime: TechnicalRegime = "Ranging";
  if (lastClose > ema21 && ema9 > ema21 && adx > 25) regime = "Trending Up";
  else if (lastClose < ema21 && ema9 < ema21 && adx > 25) regime = "Trending Down";
  else if (relAtr > 0.035) regime = "Volatile";
  else if (adx < 20) regime = "Ranging";

  return {
    compositeScore,
    recommendation,
    regime,
    scores: {
      emaCross: emaScore,
      rsi: rsiScore,
      macd: macdScore,
      bollinger: bbScore,
      atr: atrScore,
      volume: volScore,
    },
  };
}

