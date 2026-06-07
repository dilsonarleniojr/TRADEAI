// Web Worker for running trading strategy backtests
// Processes historical price candles (klines) without blocking the main UI thread

interface Kline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface BacktestTrade {
  id: string;
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  timestamp: number;
  pnl: number;
  balanceAfter: number;
  reason: string;
}

// Helpers for indicator calculations inside worker
function computeRSI(prices: number[], period: number = 14): number[] {
  if (prices.length < period) return [];
  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;

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

  const padding = Array(period).fill(50);
  return [...padding, ...rsi];
}

function computeEMA(prices: number[], period: number): number[] {
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

function runBacktest(
  klines: Kline[],
  strategy: string,
  initialBalance: number,
  stopLossPct: number,
  takeProfitPct: number,
  params: Record<string, any>
) {
  const prices = klines.map((k) => k.close);
  const trades: BacktestTrade[] = [];
  let cash = initialBalance;
  let positionSize = 0;
  let entryPrice = 0;
  let entryTime = 0;

  // Pre-calculate indicators
  let rsiValues: number[] = [];
  let emaFast: number[] = [];
  let emaSlow: number[] = [];

  if (strategy === "RSI") {
    const period = params.rsiPeriod || 14;
    rsiValues = computeRSI(prices, period);
  } else if (strategy === "EMA_CROSS") {
    const fastPeriod = params.emaFast || 9;
    const slowPeriod = params.emaSlow || 21;
    emaFast = computeEMA(prices, fastPeriod);
    emaSlow = computeEMA(prices, slowPeriod);
  }

  // Iterate over candles
  for (let i = 20; i < klines.length; i++) {
    const candle = klines[i];
    const price = candle.close;
    const high = candle.high;
    const low = candle.low;
    const time = candle.time;

    // Check Stop Loss & Take Profit if in position
    if (positionSize > 0) {
      const slPrice = entryPrice * (1 - stopLossPct / 100);
      const tpPrice = entryPrice * (1 + takeProfitPct / 100);

      // Check if Stop Loss hit
      if (low <= slPrice) {
        const pnl = (slPrice - entryPrice) * positionSize;
        cash += slPrice * positionSize;
        trades.push({
          id: `t_sl_${time}`,
          side: "SELL",
          price: slPrice,
          quantity: positionSize,
          timestamp: time,
          pnl,
          balanceAfter: cash,
          reason: "Stop Loss Hit",
        });
        positionSize = 0;
        entryPrice = 0;
        continue;
      }

      // Check if Take Profit hit
      if (high >= tpPrice) {
        const pnl = (tpPrice - entryPrice) * positionSize;
        cash += tpPrice * positionSize;
        trades.push({
          id: `t_tp_${time}`,
          side: "SELL",
          price: tpPrice,
          quantity: positionSize,
          timestamp: time,
          pnl,
          balanceAfter: cash,
          reason: "Take Profit Hit",
        });
        positionSize = 0;
        entryPrice = 0;
        continue;
      }
    }

    // Evaluate entry / exit signals
    if (strategy === "RSI" && rsiValues.length > i) {
      const rsi = rsiValues[i];
      const prevRsi = rsiValues[i - 1];
      const buyThresh = params.buyThreshold || 30;
      const sellThresh = params.sellThreshold || 70;

      if (positionSize === 0 && prevRsi < buyThresh && rsi >= buyThresh) {
        // Buy: Oversold breakout
        const qty = cash / price;
        positionSize = qty;
        entryPrice = price;
        entryTime = time;
        cash = 0;
        trades.push({
          id: `t_buy_${time}`,
          side: "BUY",
          price,
          quantity: qty,
          timestamp: time,
          pnl: 0,
          balanceAfter: cash,
          reason: `RSI Oversold Breakout (${rsi.toFixed(1)})`,
        });
      } else if (positionSize > 0 && prevRsi > sellThresh && rsi <= sellThresh) {
        // Sell: Overbought reversal
        const pnl = (price - entryPrice) * positionSize;
        cash = positionSize * price;
        trades.push({
          id: `t_sell_${time}`,
          side: "SELL",
          price,
          quantity: positionSize,
          timestamp: time,
          pnl,
          balanceAfter: cash,
          reason: `RSI Overbought Reversal (${rsi.toFixed(1)})`,
        });
        positionSize = 0;
        entryPrice = 0;
      }
    } else if (strategy === "EMA_CROSS" && emaFast.length > i && emaSlow.length > i) {
      const fast = emaFast[i];
      const slow = emaSlow[i];
      const prevFast = emaFast[i - 1];
      const prevSlow = emaSlow[i - 1];

      // Golden Cross (Fast crosses above Slow)
      if (positionSize === 0 && prevFast <= prevSlow && fast > slow) {
        const qty = cash / price;
        positionSize = qty;
        entryPrice = price;
        entryTime = time;
        cash = 0;
        trades.push({
          id: `t_buy_${time}`,
          side: "BUY",
          price,
          quantity: qty,
          timestamp: time,
          pnl: 0,
          balanceAfter: cash,
          reason: `Golden Cross (Fast ${fast.toFixed(2)} > Slow ${slow.toFixed(2)})`,
        });
      }
      // Death Cross (Fast crosses below Slow)
      else if (positionSize > 0 && prevFast >= prevSlow && fast < slow) {
        const pnl = (price - entryPrice) * positionSize;
        cash = positionSize * price;
        trades.push({
          id: `t_sell_${time}`,
          side: "SELL",
          price,
          quantity: positionSize,
          timestamp: time,
          pnl,
          balanceAfter: cash,
          reason: `Death Cross (Fast ${fast.toFixed(2)} < Slow ${slow.toFixed(2)})`,
        });
        positionSize = 0;
        entryPrice = 0;
      }
    }
  }

  // Force close any open position at the end
  if (positionSize > 0) {
    const finalCandle = klines[klines.length - 1];
    const finalPrice = finalCandle.close;
    const pnl = (finalPrice - entryPrice) * positionSize;
    cash += positionSize * finalPrice;
    trades.push({
      id: `t_force_close_${finalCandle.time}`,
      side: "SELL",
      price: finalPrice,
      quantity: positionSize,
      timestamp: finalCandle.time,
      pnl,
      balanceAfter: cash,
      reason: "Forced Close at End of Backtest",
    });
    positionSize = 0;
  }

  // Calculate Metrics
  const closedTrades = trades.filter((t) => t.side === "SELL");
  const wins = closedTrades.filter((t) => t.pnl > 0);
  const losses = closedTrades.filter((t) => t.pnl < 0);
  const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;

  const totalProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const totalLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 99.9 : 0;

  // Max Drawdown calculation
  let peak = initialBalance;
  let maxDrawdown = 0;
  trades.forEach((t) => {
    if (t.balanceAfter > peak) peak = t.balanceAfter;
    const dd = ((peak - t.balanceAfter) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  });

  const netPnl = cash - initialBalance;
  const netPnlPercent = (netPnl / initialBalance) * 100;

  return {
    trades,
    initialBalance,
    finalBalance: cash,
    netPnl,
    netPnlPercent,
    winRate,
    profitFactor,
    maxDrawdown,
    totalTradesCount: trades.length,
  };
}

self.onmessage = (e: MessageEvent) => {
  const { id, payload } = e.data;
  const { klines, strategy, initialBalance, stopLossPct, takeProfitPct, params } = payload;

  try {
    const result = runBacktest(klines, strategy, initialBalance, stopLossPct, takeProfitPct, params);
    self.postMessage({ id, success: true, result });
  } catch (error: any) {
    self.postMessage({ id, success: false, error: error?.message || "Erro desconhecido no backtest" });
  }
};
