import { type TickerData, type KlineData } from "@/lib/store";
import { calculateADX, calculateRSI, emaSeries } from "./indicators";

// ==========================================================
// 1. Regime de mercado (ADX de Wilder)
// ==========================================================

export type MarketRegime = "TREND_FOLLOWING" | "MEAN_REVERSION" | "NEUTRAL";

export const ADX_TREND = 25;
export const ADX_RANGE = 20;

export function regimeFromADX(adx: number | null): MarketRegime {
  if (adx === null) return "NEUTRAL";
  if (adx > ADX_TREND) return "TREND_FOLLOWING";
  if (adx < ADX_RANGE) return "MEAN_REVERSION";
  return "NEUTRAL";
}

export function detectMarketRegime(klines: KlineData[]): MarketRegime {
  return regimeFromADX(calculateADX(klines, 14));
}

// ==========================================================
// 2. Comitê (votação 2 de 3)
// ==========================================================

export type QuantVote = "BUY" | "SELL" | "HOLD";

/** Três análises independentes sobre os mesmos candles do ativo. */
export interface ModelVotes {
  trend: QuantVote;
  momentum: QuantVote;
  flow: QuantVote;
}

export function ensembleDecision(votes: ModelVotes): QuantVote {
  const list = [votes.trend, votes.momentum, votes.flow];
  if (list.filter((v) => v === "BUY").length >= 2) return "BUY";
  if (list.filter((v) => v === "SELL").length >= 2) return "SELL";
  return "HOLD";
}

// ==========================================================
// 3. Força relativa vs BTC (filtro de ativos)
// ==========================================================

export const MIN_QUOTE_VOLUME_USDT = 50_000_000;
export const MIN_RELATIVE_STRENGTH = -2; // pontos percentuais vs BTC em 24h

export interface StrengthCheck {
  relativeStrength: number;
  volume24h: number;
  liquid: boolean;
  ok: boolean;
}

export function checkRelativeStrength(
  symbol: string,
  ticker: TickerData,
  btcTicker?: TickerData
): StrengthCheck {
  const volume24h = ticker.quoteVolume || 0;
  const liquid = volume24h >= MIN_QUOTE_VOLUME_USDT;
  const relativeStrength =
    symbol === "BTCUSDT" || !btcTicker
      ? 0
      : (ticker.priceChangePercent || 0) - (btcTicker.priceChangePercent || 0);
  return { relativeStrength, volume24h, liquid, ok: liquid && relativeStrength >= MIN_RELATIVE_STRENGTH };
}

export interface HotCoinCandidate {
  symbol: string;
  price: number;
  priceChangePercent: number;
  quoteVolume: number;
  relativeStrengthVsBtc: number;
  score: number;
}

const EXCLUDED_SYMBOLS = new Set([
  "USDCUSDT",
  "FDUSDUSDT",
  "TUSDUSDT",
  "BUSDUSDT",
  "EURUSDT",
  "DAIUSDT",
  "AEURUSDT",
  "WBTCUSDT",
  "USDPUSDT",
]);

/**
 * Auto-Screener institucional da Binance:
 * Filtra moedas em USDT com liquidez robusta (> $5M), momentum positivo em 24h
 * e força relativa positiva vs Bitcoin, pontuando as melhores candidatas para entrada.
 */
export function scanHotCoins(
  tickers: Record<string, TickerData>,
  btcTicker?: TickerData,
  limit = 12
): HotCoinCandidate[] {
  const btcChange = btcTicker?.priceChangePercent ?? 0;
  const candidates: HotCoinCandidate[] = [];

  for (const ticker of Object.values(tickers)) {
    const s = ticker.symbol;
    if (!s || !s.endsWith("USDT") || EXCLUDED_SYMBOLS.has(s) || s === "BTCUSDT") continue;

    const vol = ticker.quoteVolume || 0;
    const change = ticker.priceChangePercent || 0;

    // Critério 1: Liquidez real na Binance (mínimo US$ 5 milhões nas últimas 24h)
    if (vol < 5_000_000) continue;

    // Critério 2: Variação positiva em 24h (evita ativos em sangria/queda livre)
    if (change < 0.5) continue;

    // Critério 3: Filtro Anti-Exaustão (evita comprar o topo de pumps já esgotados > 32%)
    if (change > 32.0) continue;

    const relStrength = change - btcChange;

    // Se o Bitcoin estiver em queda (< -1.5%), exige força relativa destacada (≥ +2.0%)
    if (btcChange < -1.5 && relStrength < 2.0) continue;

    // Pontuação quantitativa: bonifica a faixa ideal de expansão intradiária (2% a 18%) e liquidez robusta
    const isSweetSpot = change >= 2.0 && change <= 18.0;
    const volScore = Math.log10(Math.max(1, vol / 1_000_000));
    const score = change * 1.3 + (isSweetSpot ? 4.0 : 0) + relStrength * 0.8 + volScore * 1.5;

    candidates.push({
      symbol: s,
      price: ticker.price,
      priceChangePercent: change,
      quoteVolume: vol,
      relativeStrengthVsBtc: relStrength,
      score,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

/**
 * Varre os tickers e devolve os símbolos das maiores altas com volume robusto em 24h.
 */
export function runMarketScanner(tickers: Record<string, TickerData>): string[] {
  const hot = scanHotCoins(tickers, tickers["BTCUSDT"], 5);
  if (hot.length > 0) return hot.map((h) => h.symbol);

  // Fallback se poucos tickers estiverem no store
  const usdtTickers = Object.values(tickers).filter(
    (t) => t.symbol.endsWith("USDT") && !EXCLUDED_SYMBOLS.has(t.symbol)
  );
  usdtTickers.sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0));
  const top50 = usdtTickers.slice(0, 50);
  top50.sort((a, b) => (b.priceChangePercent || 0) - (a.priceChangePercent || 0));
  return top50.slice(0, 3).map((t) => t.symbol);
}

// ==========================================================
// 4. Algoritmo Genético (otimiza os parâmetros da estratégia do robô)
// ==========================================================

export interface GeneticChromosome {
  rsiPeriod: number;
  rsiBuyThreshold: number;
  rsiSellThreshold: number;
  emaFast: number;
  emaSlow: number;
  fitness?: number;
}

/** Quais parâmetros cada estratégia realmente usa; o GA só evolui esses. */
export type GeneticMode = "RSI" | "MACD";

const MIN_GA_TRADES = 5;
const MIN_GA_STD = 0.0025; // 0,25% por operação

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const randInt = (lo: number, hi: number) => Math.floor(lo + Math.random() * (hi - lo + 1));

function randomChromosome(): GeneticChromosome {
  const emaFast = randInt(5, 15);
  return {
    rsiPeriod: randInt(7, 21),
    rsiBuyThreshold: randInt(20, 40),
    rsiSellThreshold: randInt(60, 85),
    emaFast,
    emaSlow: Math.max(emaFast + 5, randInt(20, 50)),
  };
}

export function runGeneticOptimization(
  klines: KlineData[],
  mode: GeneticMode,
  generations = 8,
  populationSize = 40
): GeneticChromosome {
  let population = Array.from({ length: populationSize }, randomChromosome);

  for (let gen = 0; gen < generations; gen++) {
    population.forEach((c) => {
      c.fitness = evaluateFitness(klines, c, mode);
    });
    population.sort((a, b) => (b.fitness ?? -Infinity) - (a.fitness ?? -Infinity));
    if (gen === generations - 1) break;

    const elites = population.slice(0, Math.max(2, Math.floor(populationSize * 0.3)));
    const next: GeneticChromosome[] = [...elites];
    const pick = <K extends keyof GeneticChromosome>(a: GeneticChromosome, b: GeneticChromosome, k: K) =>
      Math.random() > 0.5 ? a[k] : b[k];

    while (next.length < populationSize) {
      const a = elites[Math.floor(Math.random() * elites.length)];
      const b = elites[Math.floor(Math.random() * elites.length)];
      const child: GeneticChromosome = {
        rsiPeriod: pick(a, b, "rsiPeriod") as number,
        rsiBuyThreshold: pick(a, b, "rsiBuyThreshold") as number,
        rsiSellThreshold: pick(a, b, "rsiSellThreshold") as number,
        emaFast: pick(a, b, "emaFast") as number,
        emaSlow: pick(a, b, "emaSlow") as number,
      };
      const step = () => (Math.random() > 0.5 ? 1 : -1);
      if (Math.random() < 0.15) child.rsiPeriod = clamp(child.rsiPeriod + step(), 5, 30);
      if (Math.random() < 0.15) child.rsiBuyThreshold = clamp(child.rsiBuyThreshold + 2 * step(), 15, 45);
      if (Math.random() < 0.15) child.rsiSellThreshold = clamp(child.rsiSellThreshold + 2 * step(), 55, 90);
      if (Math.random() < 0.15) child.emaFast = clamp(child.emaFast + step(), 3, 20);
      if (Math.random() < 0.15) child.emaSlow = clamp(child.emaSlow + 2 * step(), child.emaFast + 5, 60);
      next.push(child);
    }
    population = next;
  }

  return population[0];
}

/**
 * Backtest rápido (sem custos) que devolve um Sharpe aproximado por operação.
 * RSI: compra com RSI <= limiar de compra, vende com RSI >= limiar de venda.
 * MACD: compra quando a EMA rápida cruza acima da lenta, vende no cruzamento contrário.
 */
function evaluateFitness(klines: KlineData[], c: GeneticChromosome, mode: GeneticMode): number {
  const closes = klines.map((k) => k.close);
  if (closes.length < 40) return -999;

  const returns: number[] = [];
  let entry: number | null = null;

  if (mode === "RSI") {
    for (let i = c.rsiPeriod + 1; i < closes.length; i++) {
      const rsi = calculateRSI(closes.slice(0, i + 1), c.rsiPeriod);
      if (entry === null && rsi <= c.rsiBuyThreshold) entry = closes[i];
      else if (entry !== null && rsi >= c.rsiSellThreshold) {
        returns.push((closes[i] - entry) / entry);
        entry = null;
      }
    }
  } else {
    const fast = emaSeries(closes, c.emaFast);
    const slow = emaSeries(closes, c.emaSlow);
    for (let i = c.emaSlow; i < closes.length; i++) {
      const crossedUp = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i];
      const crossedDown = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];
      if (entry === null && crossedUp) entry = closes[i];
      else if (entry !== null && crossedDown) {
        returns.push((closes[i] - entry) / entry);
        entry = null;
      }
    }
  }

  // Poucas operações = resultado estatisticamente fraco; descarta.
  if (returns.length < MIN_GA_TRADES) return -999;
  const avg = returns.reduce((s, x) => s + x, 0) / returns.length;
  const variance = returns.reduce((s, x) => s + (x - avg) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  // Piso no desvio: retornos quase idênticos não podem gerar pontuação "infinita".
  return (avg / Math.max(std, MIN_GA_STD)) * Math.sqrt(returns.length);
}
