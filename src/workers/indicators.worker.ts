// Web Worker for indicators and mathematical calculations
// Runs on a separate thread to keep the UI buttery smooth

function calculateRSI(prices: number[], period: number = 14): number[] {
  if (prices.length < period) return [];
  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;

  // First RSI value calculation
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi.push(100 - 100 / (1 + avgGain / (avgLoss || 1)));

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    rsi.push(100 - 100 / (1 + avgGain / (avgLoss || 1)));
  }

  // Pad the beginning with zeroes to match prices array length
  const padding = Array(period).fill(50); // Default to neutral index
  return [...padding, ...rsi];
}

function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  const ema: number[] = [];
  const k = 2 / (period + 1);

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  let currentEma = sum / period;
  ema.push(currentEma);

  for (let i = period; i < prices.length; i++) {
    currentEma = prices[i] * k + currentEma * (1 - k);
    ema.push(currentEma);
  }

  const padding = Array(period - 1).fill(prices[0]);
  return [...padding, ...ema];
}

function calculateBollingerBands(prices: number[], period: number = 20, multiplier: number = 2) {
  const middle: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      middle.push(prices[i]);
      upper.push(prices[i]);
      lower.push(prices[i]);
      continue;
    }

    const slice = prices.slice(i - period + 1, i + 1);
    const sma = slice.reduce((sum, p) => sum + p, 0) / period;
    const variance = slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    middle.push(sma);
    upper.push(sma + multiplier * stdDev);
    lower.push(sma - multiplier * stdDev);
  }

  return { middle, upper, lower };
}

function calculateFibonacci(high: number, low: number) {
  const diff = high - low;
  return {
    "0.0": high,
    "23.6": high - diff * 0.236,
    "38.2": high - diff * 0.382,
    "50.0": high - diff * 0.5,
    "61.8": high - diff * 0.618,
    "78.6": high - diff * 0.786,
    "100.0": low,
  };
}

function calculateSharpeSortino(pnls: number[], initialBalance: number = 10000) {
  if (pnls.length < 2) return { sharpe: 0, sortino: 0, rawSharpe: 0, rawSortino: 0, meanReturn: 0, stdDev: 0, downsideDev: 0 };

  const balances: number[] = [];
  let currentBalance = initialBalance;
  balances.push(currentBalance);

  for (const pnl of pnls) {
    currentBalance += pnl;
    balances.push(currentBalance);
  }

  const returns: number[] = [];
  for (let i = 1; i < balances.length; i++) {
    const prev = balances[i - 1];
    const ret = prev > 0 ? (balances[i] - prev) / prev : 0;
    returns.push(ret);
  }

  const n = returns.length;
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / n;

  // StdDev
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  // Downside Dev
  const negativeReturns = returns.filter(r => r < 0);
  const downsideVariance = negativeReturns.length > 0 
    ? negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / n
    : 0;
  const downsideDev = Math.sqrt(downsideVariance);

  const sharpe = stdDev > 0 ? meanReturn / stdDev : 0;
  const sortino = downsideDev > 0 ? meanReturn / downsideDev : 0;

  const annualScaling = Math.sqrt(252);
  
  return {
    sharpe: sharpe * annualScaling,
    sortino: sortino * annualScaling,
    rawSharpe: sharpe,
    rawSortino: sortino,
    meanReturn,
    stdDev,
    downsideDev,
  };
}

function calculateVWAP(klines: any[]): number[] {
  const vwap: number[] = [];
  let sumPV = 0;
  let sumV = 0;
  for (let i = 0; i < klines.length; i++) {
    const k = klines[i];
    const high = typeof k.high === 'string' ? parseFloat(k.high) : k.high;
    const low = typeof k.low === 'string' ? parseFloat(k.low) : k.low;
    const close = typeof k.close === 'string' ? parseFloat(k.close) : k.close;
    const volume = typeof k.volume === 'string' ? parseFloat(k.volume) : k.volume;

    const typicalPrice = (high + low + close) / 3;
    sumPV += typicalPrice * volume;
    sumV += volume;
    vwap.push(sumV > 0 ? sumPV / sumV : typicalPrice);
  }
  return vwap;
}

function calculateVolumeProfile(klines: any[], binsCount: number = 12) {
  if (klines.length === 0) return [];
  const prices = klines.map(k => typeof k.close === 'string' ? parseFloat(k.close) : k.close);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice;
  const binSize = range / binsCount || 1;

  const bins = Array.from({ length: binsCount }, (_, idx) => {
    const low = minPrice + idx * binSize;
    const high = low + binSize;
    return {
      price: (low + high) / 2,
      buyVol: 0,
      sellVol: 0,
      totalVol: 0,
      low,
      high
    };
  });

  for (const k of klines) {
    const high = typeof k.high === 'string' ? parseFloat(k.high) : k.high;
    const low = typeof k.low === 'string' ? parseFloat(k.low) : k.low;
    const close = typeof k.close === 'string' ? parseFloat(k.close) : k.close;
    const open = typeof k.open === 'string' ? parseFloat(k.open) : k.open;
    const volume = typeof k.volume === 'string' ? parseFloat(k.volume) : k.volume;
    const isBullish = close >= open;

    const candleLow = low;
    const candleHigh = high;
    let added = false;

    for (const bin of bins) {
      if (candleHigh >= bin.low && candleLow <= bin.high) {
        const overlapLow = Math.max(candleLow, bin.low);
        const overlapHigh = Math.min(candleHigh, bin.high);
        const overlapRatio = (overlapHigh - overlapLow) / (candleHigh - candleLow || 1);
        const allocatedVol = volume * overlapRatio;

        if (isBullish) {
          bin.buyVol += allocatedVol;
        } else {
          bin.sellVol += allocatedVol;
        }
        bin.totalVol += allocatedVol;
        added = true;
      }
    }

    if (!added) {
      let binIdx = Math.floor((close - minPrice) / binSize);
      if (binIdx >= binsCount) binIdx = binsCount - 1;
      if (binIdx < 0) binIdx = 0;
      if (isBullish) {
        bins[binIdx].buyVol += volume;
      } else {
        bins[binIdx].sellVol += volume;
      }
      bins[binIdx].totalVol += volume;
    }
  }

  return bins;
}

function calculateEMARibbon(prices: number[]): Record<number, number[]> {
  const periods = [20, 25, 30, 35, 40, 45, 50, 55];
  const ribbon: Record<number, number[]> = {};
  for (const p of periods) {
    ribbon[p] = calculateEMA(prices, p);
  }
  return ribbon;
}

// Handle message inputs
self.onmessage = (e: MessageEvent) => {
  const { id, type, payload } = e.data;

  try {
    switch (type) {
      case "rsi": {
        const { prices, period } = payload;
        const result = calculateRSI(prices, period);
        self.postMessage({ id, success: true, result });
        break;
      }
      case "ema": {
        const { prices, period } = payload;
        const result = calculateEMA(prices, period);
        self.postMessage({ id, success: true, result });
        break;
      }
      case "bollinger": {
        const { prices, period, multiplier } = payload;
        const result = calculateBollingerBands(prices, period, multiplier);
        self.postMessage({ id, success: true, result });
        break;
      }
      case "fibonacci": {
        const { high, low } = payload;
        const result = calculateFibonacci(high, low);
        self.postMessage({ id, success: true, result });
        break;
      }
      case "sharpe_sortino": {
        const { pnls, initialBalance } = payload;
        const result = calculateSharpeSortino(pnls, initialBalance);
        self.postMessage({ id, success: true, result });
        break;
      }
      case "vwap": {
        const { klines } = payload;
        const result = calculateVWAP(klines);
        self.postMessage({ id, success: true, result });
        break;
      }
      case "volume_profile": {
        const { klines, binsCount } = payload;
        const result = calculateVolumeProfile(klines, binsCount);
        self.postMessage({ id, success: true, result });
        break;
      }
      case "ema_ribbon": {
        const { prices } = payload;
        const result = calculateEMARibbon(prices);
        self.postMessage({ id, success: true, result });
        break;
      }
      default:
        self.postMessage({ id, success: false, error: `Tipo de cálculo desconhecido: ${type}` });
    }
  } catch (error: any) {
    self.postMessage({ id, success: false, error: error?.message || "Erro desconhecido" });
  }
};
