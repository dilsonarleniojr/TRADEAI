// Indicadores técnicos puros usados pelo motor dos robôs e pelo painel de Motores.
// Todas as funções recebem séries em ordem cronológica (mais antigo -> mais recente).

import type { KlineData } from "@/lib/store";

export function sma(values: number[], period: number): number {
  const len = values.length;
  if (len === 0) return 0;
  const n = Math.min(len, period);
  let sum = 0;
  for (let i = len - n; i < len; i++) {
    sum += values[i];
  }
  return sum / n;
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

/** Cálculo de EMA sem alocação transitória de array O(1) heap. */
export function calculateEMA(closes: number[], period: number): number {
  const len = closes.length;
  if (len === 0) return 0;
  if (len < period) return closes[len - 1];
  const k = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < len; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

/** Atualização incremental O(1) de EMA para o hot path de ticks. */
export function calculateIncrementalEMA(currentPrice: number, previousEma: number, period: number): number {
  const k = 2 / (period + 1);
  return currentPrice * k + previousEma * (1 - k);
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
  const len = closes.length;
  if (len < period) return null;
  const start = len - period;
  let sum = 0;
  for (let i = start; i < len; i++) {
    sum += closes[i];
  }
  const middle = sum / period;
  let varianceSum = 0;
  for (let i = start; i < len; i++) {
    const diff = closes[i] - middle;
    varianceSum += diff * diff;
  }
  const std = Math.sqrt(varianceSum / period);
  const upper = middle + mult * std;
  const lower = middle - mult * std;
  const last = closes[len - 1];
  const width = upper - lower;
  return { upper, middle, lower, percentB: width > 0 ? (last - lower) / width : 0.5 };
}

/** ATR médio relativo ao último fechamento (ex.: 0.02 = 2%). Zero-allocation. */
export function relativeATR(klines: KlineData[], period = 14): number {
  const len = klines.length;
  if (len < 2) return 0;
  const windowCount = Math.min(len - 1, period);
  const start = len - windowCount;
  let trSum = 0;
  for (let i = start; i < len; i++) {
    const k = klines[i];
    const prev = klines[i - 1];
    trSum += Math.max(k.high - k.low, Math.abs(k.high - prev.close), Math.abs(k.low - prev.close));
  }
  const atr = trSum / windowCount;
  return atr / (klines[len - 1].close || 1);
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

// ==========================================================
// Análise de Correlação Cruzada & Beta de Carteira (Pearson r)
// ==========================================================

/**
 * Converte uma série de preços cronológicos em retornos percentuais logarítmicos/aritméticos.
 * R_t = (P_t - P_{t-1}) / P_{t-1}
 */
export function calculateReturns(prices: number[]): number[] {
  if (prices.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    if (prev <= 0 || isNaN(prev)) continue;
    returns.push((prices[i] - prev) / prev);
  }
  return returns;
}

/**
 * Coeficiente de Correlação Linear de Pearson (r) entre duas séries.
 * r = Cov(X, Y) / (sigma_X * sigma_Y)
 * Varia entre -1.0 e +1.0.
 */
export function calculatePearsonCorrelation(seriesA: number[], seriesB: number[]): number {
  const n = Math.min(seriesA.length, seriesB.length);
  if (n < 3) return 0;

  const aSlice = seriesA.slice(seriesA.length - n);
  const bSlice = seriesB.slice(seriesB.length - n);

  const meanA = aSlice.reduce((s, v) => s + v, 0) / n;
  const meanB = bSlice.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let denA = 0;
  let denB = 0;

  for (let i = 0; i < n; i++) {
    const da = aSlice[i] - meanA;
    const db = bSlice[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }

  const den = Math.sqrt(denA * denB);
  if (den === 0 || isNaN(den)) return 0;

  const r = num / den;
  return Math.max(-1, Math.min(1, parseFloat(r.toFixed(4))));
}

/**
 * Mapeamento de Setores Cripto Institucionais para Gestão de Risco & Descorrelação.
 * Setores DePIN e RWA possuem comportamento assíncrono durante rotações setoriais.
 */
export const CRYPTO_SECTOR_MAP: Record<string, { sector: string; isAlternative: boolean }> = {
  // DePIN (Decentralized Physical Infrastructure)
  RENDER: { sector: "DePIN", isAlternative: true },
  FIL: { sector: "DePIN", isAlternative: true },
  AR: { sector: "DePIN", isAlternative: true },
  AKT: { sector: "DePIN", isAlternative: true },
  THETA: { sector: "DePIN", isAlternative: true },
  IO: { sector: "DePIN", isAlternative: true },
  HNT: { sector: "DePIN", isAlternative: true },
  LPT: { sector: "DePIN", isAlternative: true },
  JASMY: { sector: "DePIN", isAlternative: true },

  // RWA (Real World Assets & Tokenização Institucional)
  ONDO: { sector: "RWA", isAlternative: true },
  MKR: { sector: "RWA", isAlternative: true },
  PENDLE: { sector: "RWA", isAlternative: true },
  CFG: { sector: "RWA", isAlternative: true },
  TRU: { sector: "RWA", isAlternative: true },
  OM: { sector: "RWA", isAlternative: true },
  POLYX: { sector: "RWA", isAlternative: true },
  SNX: { sector: "RWA", isAlternative: true },

  // Inteligência Artificial & Computação
  FET: { sector: "IA & Big Data", isAlternative: true },
  TAO: { sector: "IA & Big Data", isAlternative: true },
  NEAR: { sector: "IA & Big Data", isAlternative: false },
  WLD: { sector: "IA & Big Data", isAlternative: true },
  ARKM: { sector: "IA & Big Data", isAlternative: true },
  GRT: { sector: "IA & Big Data", isAlternative: true },
  AGIX: { sector: "IA & Big Data", isAlternative: true },
  OCEAN: { sector: "IA & Big Data", isAlternative: true },

  // DeFi (Finanças Descentralizadas)
  UNI: { sector: "DeFi Institucional", isAlternative: false },
  AAVE: { sector: "DeFi Institucional", isAlternative: false },
  LINK: { sector: "Oráculos & DeFi", isAlternative: false },
  CRV: { sector: "DeFi Institucional", isAlternative: false },
  INJ: { sector: "DeFi Institucional", isAlternative: false },
  LDO: { sector: "Liquid Staking", isAlternative: false },
  JUP: { sector: "DEX Solana", isAlternative: false },
  RAY: { sector: "DEX Solana", isAlternative: false },
  ENA: { sector: "DeFi Institucional", isAlternative: true },
  CAKE: { sector: "DeFi Institucional", isAlternative: false },
  SUSHI: { sector: "DeFi Institucional", isAlternative: false },

  // Layer 1 / Majors (Alto Beta / Co-integrado com BTC)
  BTC: { sector: "Macro Sovereign", isAlternative: false },
  ETH: { sector: "Smart Contracts L1", isAlternative: false },
  SOL: { sector: "High-Throughput L1", isAlternative: false },
  BNB: { sector: "Exchange Ecosystem", isAlternative: false },
  AVAX: { sector: "Smart Contracts L1", isAlternative: false },
  SUI: { sector: "Next-Gen L1", isAlternative: false },
  APT: { sector: "Next-Gen L1", isAlternative: false },
  SEI: { sector: "Trading L1", isAlternative: false },
  TIA: { sector: "Modular Blockchain", isAlternative: false },
  TON: { sector: "Social Ecosystem", isAlternative: false },
  ADA: { sector: "Smart Contracts L1", isAlternative: false },
  DOT: { sector: "Interoperabilidade L0", isAlternative: false },
  KAS: { sector: "PoW DAG L1", isAlternative: true },

  // Memes / High-Beta Volatilidade
  DOGE: { sector: "Memes & High-Beta", isAlternative: false },
  SHIB: { sector: "Memes & High-Beta", isAlternative: false },
  PEPE: { sector: "Memes & High-Beta", isAlternative: false },
  WIF: { sector: "Memes & High-Beta", isAlternative: false },
  BONK: { sector: "Memes & High-Beta", isAlternative: false },
  FLOKI: { sector: "Memes & High-Beta", isAlternative: false },
  POPCAT: { sector: "Memes & High-Beta", isAlternative: false },
  BOME: { sector: "Memes & High-Beta", isAlternative: false },
};

/**
 * Identifica o setor do par e se é um ativo alternativo descorrelacionado.
 */
export function getCryptoSector(symbol: string): { sector: string; isAlternative: boolean } {
  const base = symbol.toUpperCase().replace("USDT", "").replace("BUSD", "").replace("USDC", "").trim();
  const found = CRYPTO_SECTOR_MAP[base];
  if (found) return found;
  return { sector: "Altcoin Diversificada", isAlternative: false };
}

