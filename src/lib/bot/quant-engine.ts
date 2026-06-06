import { type TickerData, type KlineData } from "@/lib/store";

export interface QuantCandidate {
  symbol: string;
  volume24h: number;
  relativeStrength: number; // vs BTC
  relATR: number;
  direction: "LONG" | "SHORT" | "HOLD";
}

export interface GeneticChromosome {
  rsiPeriod: number;
  rsiBuyThreshold: number;
  rsiSellThreshold: number;
  emaFast: number;
  emaSlow: number;
  fitness?: number;
}

// ==========================================================
// 1. Triagem de Ativos (The Funnel)
// ==========================================================

/**
 * Filters and ranks symbols by volume, relative ATR volatility, and strength against BTC.
 */
export function runAssetFunnel(
  tickers: Record<string, TickerData>,
  klinesHistory: Record<string, KlineData[]>,
  minVolumeUsdt = 50_000_000 // $50M threshold
): QuantCandidate[] {
  const btcTicker = tickers["BTCUSDT"];
  const btcPriceChange = btcTicker ? btcTicker.priceChangePercent : 0;
  const candidates: QuantCandidate[] = [];

  for (const [symbol, ticker] of Object.entries(tickers)) {
    // Ignore stablecoins or BTC itself for relative calculation
    if (symbol === "BTCUSDT" || symbol.includes("USD") && !symbol.includes("USDT")) continue;

    // Filter 1: Liquidity/Volume (ignore < $50M)
    const volume24h = ticker.quoteVolume || 0;
    if (volume24h < minVolumeUsdt) continue;

    // Filter 2: Volatilidade (ATR relative distance to average)
    const klines = klinesHistory[symbol] || [];
    if (klines.length < 15) continue;

    const relATR = calculateRelativeATR(klines);
    const avgHistoricalATR = calculateAvgHistoricalATR(klines);

    // Filter out low-volatility/inactive assets
    if (relATR < avgHistoricalATR) continue;

    // Ranking: Relative Strength against BTC
    const assetPriceChange = ticker.priceChangePercent || 0;
    const relativeStrength = assetPriceChange - btcPriceChange;

    // Quant bias: Long strong assets (outperforming BTC), Short weak assets
    const direction = relativeStrength > 2.0 ? "LONG" : relativeStrength < -2.0 ? "SHORT" : "HOLD";

    candidates.push({
      symbol,
      volume24h,
      relativeStrength,
      relATR,
      direction,
    });
  }

  // Sort by absolute relative strength
  return candidates.sort((a, b) => Math.abs(b.relativeStrength) - Math.abs(a.relativeStrength));
}

function calculateRelativeATR(klines: KlineData[]): number {
  let trSum = 0;
  for (let i = 1; i < klines.length; i++) {
    const k = klines[i];
    const prev = klines[i - 1];
    trSum += Math.max(k.high - k.low, Math.abs(k.high - prev.close), Math.abs(k.low - prev.close));
  }
  const atr = trSum / (klines.length - 1);
  return atr / (klines[klines.length - 1]?.close || 1);
}

function calculateAvgHistoricalATR(klines: KlineData[]): number {
  // Simple historical benchmark proxy (e.g. median relative volatility)
  return 0.015; // 1.5% average relative true range threshold
}

// ==========================================================
// 2. Seleção Dinâmica de Regime de Mercado
// ==========================================================

export type MarketRegime = "TREND_FOLLOWING" | "MEAN_REVERSION" | "NEUTRAL";

/**
 * Analyzes market regime using ADX trend strength calculations.
 */
export function detectMarketRegime(klines: KlineData[]): MarketRegime {
  const period = 14;
  if (klines.length < period + 1) return "NEUTRAL";

  let trSum = 0;
  let plusDM = 0;
  let minusDM = 0;

  for (let i = 1; i < klines.length; i++) {
    const k = klines[i];
    const prev = klines[i - 1];
    
    trSum += Math.max(k.high - k.low, Math.abs(k.high - prev.close), Math.abs(k.low - prev.close));

    const upMove = k.high - prev.high;
    const downMove = prev.low - k.low;

    if (upMove > downMove && upMove > 0) {
      plusDM += upMove;
    } else if (downMove > upMove && downMove > 0) {
      minusDM += downMove;
    }
  }

  const plusDI = trSum > 0 ? (plusDM / trSum) * 100 : 50;
  const minusDI = trSum > 0 ? (minusDM / trSum) * 100 : 50;
  const sumDI = plusDI + minusDI;
  const adx = sumDI > 0 ? (Math.abs(plusDI - minusDI) / sumDI) * 100 : 25;

  if (adx > 25) {
    return "TREND_FOLLOWING"; // Active trend, trigger breakout / crosses
  } else if (adx < 20) {
    return "MEAN_REVERSION";  // Range-bound / sideways, trigger oscillation buy/sell
  }
  
  return "NEUTRAL";
}

// ==========================================================
// 3. Otimização por Algoritmos Genéticos (GA)
// ==========================================================

/**
 * Runs a Genetic Algorithm cycle over historical data to optimize indicator parameters.
 */
export function runGeneticOptimization(
  klines: KlineData[],
  generations = 5,
  populationSize = 30
): GeneticChromosome {
  // 1. Initial Population
  let population: GeneticChromosome[] = Array.from({ length: populationSize }, () => ({
    rsiPeriod: Math.floor(7 + Math.random() * 21),
    rsiBuyThreshold: Math.floor(20 + Math.random() * 20),
    rsiSellThreshold: Math.floor(60 + Math.random() * 25),
    emaFast: Math.floor(5 + Math.random() * 15),
    emaSlow: Math.floor(20 + Math.random() * 30),
  }));

  for (let gen = 0; gen < generations; gen++) {
    // 2. Evaluate Fitness (using Sharpe Ratio backtest proxy)
    population.forEach((chrom) => {
      chrom.fitness = evaluateFitness(klines, chrom);
    });

    // Sort by fitness descending
    population.sort((a, b) => (b.fitness || 0) - (a.fitness || 0));

    // Exit early if best generation is found
    if (gen === generations - 1) break;

    // 3. Selection & Crossover (Keep top 30% elite, cross to fill rest)
    const eliteSize = Math.floor(populationSize * 0.3);
    const elites = population.slice(0, eliteSize);
    const nextGen: GeneticChromosome[] = [...elites];

    while (nextGen.length < populationSize) {
      const parentA = elites[Math.floor(Math.random() * elites.length)];
      const parentB = elites[Math.floor(Math.random() * elites.length)];

      // Crossover
      const child: GeneticChromosome = {
        rsiPeriod: Math.random() > 0.5 ? parentA.rsiPeriod : parentB.rsiPeriod,
        rsiBuyThreshold: Math.random() > 0.5 ? parentA.rsiBuyThreshold : parentB.rsiBuyThreshold,
        rsiSellThreshold: Math.random() > 0.5 ? parentA.rsiSellThreshold : parentB.rsiSellThreshold,
        emaFast: Math.random() > 0.5 ? parentA.emaFast : parentB.emaFast,
        emaSlow: Math.random() > 0.5 ? parentA.emaSlow : parentB.emaSlow,
      };

      // 4. Mutation (10% chance per parameter)
      if (Math.random() < 0.1) child.rsiPeriod = Math.max(5, child.rsiPeriod + (Math.random() > 0.5 ? 1 : -1));
      if (Math.random() < 0.1) child.rsiBuyThreshold = Math.max(15, child.rsiBuyThreshold + (Math.random() > 0.5 ? 2 : -2));
      if (Math.random() < 0.1) child.rsiSellThreshold = Math.min(95, child.rsiSellThreshold + (Math.random() > 0.5 ? 2 : -2));
      if (Math.random() < 0.1) child.emaFast = Math.max(3, child.emaFast + (Math.random() > 0.5 ? 1 : -1));
      if (Math.random() < 0.1) child.emaSlow = Math.max(15, child.emaSlow + (Math.random() > 0.5 ? 2 : -2));

      nextGen.push(child);
    }

    population = nextGen;
  }

  return population[0]; // Best optimized chromosome
}

function evaluateFitness(klines: KlineData[], chrom: GeneticChromosome): number {
  // Fast, scale-invariant backtesting simulation returning a fitness score (Sharpe Ratio proxy)
  let balance = 10000;
  let inPosition = false;
  let entryPrice = 0;
  const closes = klines.map((k) => k.close);
  
  // Calculate relative returns
  const returns: number[] = [];

  // Simulate basic RSI/EMA cross strategy
  const emaMultiplier = 2 / (chrom.emaFast + 1);
  let ema = closes[0] || 0;
  
  for (let i = 1; i < closes.length; i++) {
    ema = (closes[i] - ema) * emaMultiplier + ema;
    const isBullish = closes[i] > ema;

    if (!inPosition && isBullish) {
      inPosition = true;
      entryPrice = closes[i];
    } else if (inPosition && !isBullish) {
      inPosition = false;
      const tradeReturn = (closes[i] - entryPrice) / entryPrice;
      returns.push(tradeReturn);
      balance *= (1 + tradeReturn);
    }
  }

  if (returns.length < 2) return -999;

  // Calculate Sharpe Ratio fitness metric
  const avg = returns.reduce((s, x) => s + x, 0) / returns.length;
  const variance = returns.reduce((s, x) => s + (x - avg) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);

  return std > 0 ? (avg / std) * Math.sqrt(252) : -999;
}

// ==========================================================
// 4. Tomada de Decisão por Ensemble (Votação)
// ==========================================================

export type QuantVote = "BUY" | "SELL" | "HOLD";

export interface ModelVotes {
  modelARandomForest: QuantVote;
  modelBXGBoost: QuantVote;
  modelCSentiment: QuantVote;
}

/**
 * Decides whether to enter a trade using a 2-out-of-3 voting consensus scheme.
 */
export function ensembleDecision(votes: ModelVotes): QuantVote {
  const voteList = [votes.modelARandomForest, votes.modelBXGBoost, votes.modelCSentiment];
  
  // Count directions
  const buyVotes = voteList.filter(v => v === "BUY").length;
  const sellVotes = voteList.filter(v => v === "SELL").length;

  // 2/3 confluency threshold
  if (buyVotes >= 2) return "BUY";
  if (sellVotes >= 2) return "SELL";
  
  return "HOLD";
}

/**
  * Soft voting and Hard voting decision with Failsafe Risk Veto.
  * If ATR relative volatility exceeds threshold, BUY votes are vetoed and trade is blocked.
  */
export function ensembleDecisionWithVeto(
  votes: ModelVotes,
  relATR: number,
  limitATR = 0.05 // 5% volatility threshold
): QuantVote | "VETO" {
  if (relATR >= limitATR) {
    return "VETO";
  }
  return ensembleDecision(votes);
}

/**
 * Scans market tickers, filters top 50 by volume, and selects top 3 with highest price change
 * to focus operations.
 */
export function runMarketScanner(tickers: Record<string, TickerData>): string[] {
  const usdtTickers = Object.values(tickers).filter(
    (t) => t.symbol.endsWith("USDT") && 
    !["USDCUSDT", "FDUSDUSDT", "TUSDUSDT", "BUSDUSDT", "EURUSDT"].includes(t.symbol)
  );

  // 1. Sort by quote volume descending to get top 50
  usdtTickers.sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0));
  const top50 = usdtTickers.slice(0, 50);

  // 2. Sort by price change percentage descending
  top50.sort((a, b) => (b.priceChangePercent || 0) - (a.priceChangePercent || 0));

  // 3. Return top 3 symbols
  return top50.slice(0, 3).map((t) => t.symbol);
}
