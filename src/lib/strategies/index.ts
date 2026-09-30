import type { KlineData, AISignalData } from "@/lib/store";

export interface StrategyParams {
  gridLower?: number;
  gridUpper?: number;
  gridCount?: number;
  dcaInterval?: number; // in hours or ticks
  dcaAmount?: number;
  breakoutPeriod?: number;
  breakoutVolumeMultiplier?: number;
  bollingerPeriod?: number;
  bollingerMultiplier?: number;
  aiMinConfidence?: number;
}

/**
 * 1. Grid Trading Strategy
 * Places buy orders below current price and sell orders above it at regular intervals.
 */
export function runGridTrading(
  currentPrice: number,
  lastPrice: number,
  params: StrategyParams
): "BUY" | "SELL" | "HOLD" {
  const lower = params.gridLower || 50000;
  const upper = params.gridUpper || 90000;
  const count = params.gridCount || 5;

  if (currentPrice < lower || currentPrice > upper) return "HOLD";

  const step = (upper - lower) / (count - 1);
  const gridLevels: number[] = [];
  for (let i = 0; i < count; i++) {
    gridLevels.push(lower + i * step);
  }

  // Check if price crossed a grid level
  for (const level of gridLevels) {
    if (lastPrice < level && currentPrice >= level) {
      return "SELL"; // crossed up: take profit/sell
    }
    if (lastPrice > level && currentPrice <= level) {
      return "BUY"; // crossed down: buy cheaper
    }
  }

  return "HOLD";
}

/**
 * 2. Dollar Cost Averaging (DCA) Strategy
 * Buys a fixed dollar amount of asset at set intervals.
 */
export function runDCA(
  tickCount: number,
  params: StrategyParams
): "BUY" | "SELL" | "HOLD" {
  const interval = params.dcaInterval || 10; // buy every N bot ticks
  if (tickCount > 0 && tickCount % interval === 0) {
    return "BUY";
  }
  return "HOLD";
}

/**
 * 3. Breakout Strategy with Volume Confirmation
 * Buys when price breaks 20-candle high with high volume, sells when it breaks low.
 */
export function runBreakoutStrategy(
  klines: KlineData[],
  params: StrategyParams
): "BUY" | "SELL" | "HOLD" {
  const period = params.breakoutPeriod || 20;
  const volumeMultiplier = params.breakoutVolumeMultiplier || 1.5;

  if (klines.length < period + 1) return "HOLD";

  const currentKline = klines[klines.length - 1];
  const slice = klines.slice(klines.length - period - 1, klines.length - 1);

  const highestHigh = Math.max(...slice.map((k) => k.high));
  const lowestLow = Math.min(...slice.map((k) => k.low));
  const avgVolume = slice.reduce((sum, k) => sum + k.volume, 0) / period;

  const priceBreakoutUp = currentKline.close > highestHigh;
  const priceBreakoutDown = currentKline.close < lowestLow;
  const volumeConfirmed = currentKline.volume > avgVolume * volumeMultiplier;

  if (priceBreakoutUp && volumeConfirmed) {
    return "BUY";
  }
  if (priceBreakoutDown) {
    return "SELL"; // Sell / Cut loss on downside breakdown
  }

  return "HOLD";
}

/**
 * 4. Mean Reversion using Bollinger Bands
 * Buys when price drops below the lower band, sells when it crosses the upper band.
 */
export function runMeanReversion(
  prices: number[],
  params: StrategyParams
): "BUY" | "SELL" | "HOLD" {
  const period = params.bollingerPeriod || 20;
  const multiplier = params.bollingerMultiplier || 2;

  if (prices.length < period) return "HOLD";

  const currentPrice = prices[prices.length - 1];
  const slice = prices.slice(prices.length - period);
  const sma = slice.reduce((sum, p) => sum + p, 0) / period;
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upperBand = sma + multiplier * stdDev;
  const lowerBand = sma - multiplier * stdDev;

  if (currentPrice <= lowerBand) {
    return "BUY"; // Oversold reversion trigger
  }
  if (currentPrice >= upperBand) {
    return "SELL"; // Overbought reversion trigger
  }

  return "HOLD";
}

/**
 * 5. AI Strategy with configurable confidence threshold
 */
export function runAIStrategy(
  signals: AISignalData[],
  params: StrategyParams
): "BUY" | "SELL" | "HOLD" {
  const minConfidence = params.aiMinConfidence || 75; // e.g. 75% confidence
  if (signals.length === 0) return "HOLD";

  const latestSignal = signals[0];
  if (latestSignal.confidence * 100 >= minConfidence) {
    if (latestSignal.action === "BUY") return "BUY";
    if (latestSignal.action === "SELL") return "SELL";
  }

  return "HOLD";
}
