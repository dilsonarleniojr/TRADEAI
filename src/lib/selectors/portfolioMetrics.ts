/**
 * Single source of truth for portfolio & trade metrics across all TradeAI screens.
 * Computes consistent metrics (PnL, Win Rate, Sharpe, Sortino, Drawdown, Profit Factor)
 * from a unified list of trades and portfolio state.
 */

import { formatCurrency, formatPercent } from "@/lib/format";

export interface UnifiedTrade {
  id: string;
  symbol: string;
  side: "BUY" | "SELL" | string;
  price: number;
  amount?: number;
  quantity?: number;
  total?: number;
  time?: number | string;
  timestamp?: number | string;
  pnl?: number;
  netPnl?: number;
  pnlPercent?: number;
  fee?: number;
  botId?: string;
  botName?: string;
  strategy?: string;
  source?: string;
  mode?: string;
  [key: string]: any;
}

export interface PortfolioPosition {
  symbol: string;
  quantity: number;
  entryPrice?: number;
  currentPrice?: number;
  value?: number;
  unrealizedPnl?: number;
  unrealizedPnlPercent?: number;
}

export interface UnifiedPortfolioInput {
  totalBalance: number;
  cashBalance: number;
  positions?: PortfolioPosition[];
  initialBalance?: number;
  pnl?: number;
  pnlPercent?: number;
  [key: string]: any;
}

export interface PortfolioMetrics {
  totalBalance: number;
  cashBalance: number;
  allocatedBalance: number;
  allocationPercent: number;
  positionsCount: number;

  // Trades & Orders
  totalOrders: number;
  closedTradesCount: number;
  winningTradesCount: number;
  losingTradesCount: number;
  breakEvenTradesCount: number;

  // Win Rate
  winRate: number | null; // 0 to 100 or null if no closed trades
  winRateFormatted: string; // "23,8%" or "—"

  // PnL
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number; // netPnl + unrealizedPnl
  netPnlPercent: number;

  // Formatted strings (pt-BR)
  netPnlFormatted: string;
  pnlPercentFormatted: string;
  realizedPnlFormatted: string;
  unrealizedPnlFormatted: string;

  // Quant & Risk Ratios
  profitFactor: number;
  payoffRatio: number;
  averageWin: number;
  averageLoss: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdownPercent: number;
  expectancy: number;

  // Today specific metrics
  todayTradesCount: number;
  todayWinningTradesCount: number;
  todayLosingTradesCount: number;
  todayNetPnl: number;
  todayWinRate: number | null;

  // Data sufficiency flags
  hasSufficientData: boolean;
  isSmallSample?: boolean;
  sampleSizeNotice?: string;
}

export interface MetricFilterOptions {
  mode?: string;
  strategy?: string;
  botId?: string;
  symbol?: string;
  periodMs?: number; // e.g. 24h, 7d, 30d
}

/**
 * Normalizes trade PnL value safely.
 */
export function getTradePnl(trade: UnifiedTrade): number {
  if (typeof trade.netPnl === "number" && !isNaN(trade.netPnl)) {
    return trade.netPnl;
  }
  if (typeof trade.pnl === "number" && !isNaN(trade.pnl)) {
    return trade.pnl;
  }
  return 0;
}

/**
 * Normalizes timestamp from a trade.
 */
export function getTradeTimestamp(trade: UnifiedTrade): number {
  if (typeof trade.timestamp === "number") return trade.timestamp;
  if (typeof trade.time === "number") return trade.time;
  if (typeof trade.timestamp === "string") {
    const t = new Date(trade.timestamp).getTime();
    if (!isNaN(t)) return t;
  }
  if (typeof trade.time === "string") {
    const t = new Date(trade.time).getTime();
    if (!isNaN(t)) return t;
  }
  return Date.now();
}

/**
 * Determines whether a trade is considered a closed trade with realized PnL.
 */
export function isClosedTrade(trade: UnifiedTrade): boolean {
  const pnl = getTradePnl(trade);
  if (pnl !== 0) return true;
  const sideUpper = (trade.side || "").toUpperCase();
  if (sideUpper === "SELL" && (typeof trade.pnl === "number" || typeof trade.netPnl === "number")) {
    return true;
  }
  return false;
}

/**
 * Filter trades by options (mode, strategy, symbol, period).
 */
export function filterTrades(trades: UnifiedTrade[], options?: MetricFilterOptions): UnifiedTrade[] {
  if (!options) return trades;
  const now = Date.now();

  return trades.filter((t) => {
    if (options.mode && t.mode && t.mode.toLowerCase() !== options.mode.toLowerCase()) {
      return false;
    }
    if (options.strategy && t.strategy && !t.strategy.toLowerCase().includes(options.strategy.toLowerCase())) {
      return false;
    }
    if (options.botId && t.botId && t.botId !== options.botId) {
      return false;
    }
    if (options.symbol && t.symbol !== options.symbol) {
      return false;
    }
    if (options.periodMs) {
      const tradeTime = getTradeTimestamp(t);
      if (now - tradeTime > options.periodMs) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Primary selector: Calculates unified portfolio metrics from trades and portfolio balances.
 */
export function selectPortfolioMetrics(
  portfolio: UnifiedPortfolioInput,
  trades: UnifiedTrade[],
  options?: MetricFilterOptions
): PortfolioMetrics {
  const safeTrades = Array.isArray(trades) ? trades : [];
  const filtered = filterTrades(safeTrades, options);
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  let grossProfit = 0;
  let grossLoss = 0;
  let netPnl = 0;
  let winningTradesCount = 0;
  let losingTradesCount = 0;
  let breakEvenTradesCount = 0;

  let todayTradesCount = 0;
  let todayWinningTradesCount = 0;
  let todayLosingTradesCount = 0;
  let todayNetPnl = 0;

  const returns: number[] = [];

  for (const t of filtered) {
    const isClosed = isClosedTrade(t);
    const pnl = getTradePnl(t);
    const tradeTime = getTradeTimestamp(t);
    const isToday = now - tradeTime <= oneDayMs;

    if (isClosed) {
      netPnl += pnl;
      returns.push(pnl);

      if (pnl > 0) {
        grossProfit += pnl;
        winningTradesCount++;
      } else if (pnl < 0) {
        grossLoss += Math.abs(pnl);
        losingTradesCount++;
      } else {
        breakEvenTradesCount++;
      }

      if (isToday) {
        todayTradesCount++;
        todayNetPnl += pnl;
        if (pnl > 0) todayWinningTradesCount++;
        else if (pnl < 0) todayLosingTradesCount++;
      }
    }
  }

  const closedTradesCount = winningTradesCount + losingTradesCount + breakEvenTradesCount;
  const winLossCount = winningTradesCount + losingTradesCount;
  const winRate: number | null = winLossCount > 0 ? (winningTradesCount / winLossCount) * 100 : null;
  const winRateFormatted = winRate !== null ? formatPercent(winRate) : "—";
  const todayWinLoss = todayWinningTradesCount + todayLosingTradesCount;
  const todayWinRate: number | null = todayWinLoss > 0 ? (todayWinningTradesCount / todayWinLoss) * 100 : null;

  const averageWin = winningTradesCount > 0 ? grossProfit / winningTradesCount : 0;
  const averageLoss = losingTradesCount > 0 ? grossLoss / losingTradesCount : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0;
  const payoffRatio = averageLoss > 0 ? averageWin / averageLoss : averageWin > 0 ? 99.9 : 0;
  const expectancy = closedTradesCount > 0 ? (grossProfit - grossLoss) / closedTradesCount : 0;

  // Unrealized PnL from positions
  let unrealizedPnl = 0;
  let allocatedBalance = 0;
  const positions = portfolio?.positions || [];
  for (const p of positions) {
    if (p.quantity > 0) {
      allocatedBalance += p.value ?? (p.currentPrice ? p.currentPrice * p.quantity : 0);
      if (typeof p.unrealizedPnl === "number") {
        unrealizedPnl += p.unrealizedPnl;
      }
    }
  }

  const totalBalance = portfolio?.totalBalance > 0
    ? portfolio.totalBalance
    : (portfolio?.cashBalance || 0) + allocatedBalance;
  const cashBalance = portfolio?.cashBalance || 0;
  const allocationPercent = totalBalance > 0 ? Math.min(100, Math.max(0, (allocatedBalance / totalBalance) * 100)) : 0;
  const baseCapital = portfolio?.initialBalance && portfolio.initialBalance > 0 ? portfolio.initialBalance : 10000;
  const totalPnl = netPnl + unrealizedPnl;
  const netPnlPercent = baseCapital > 0 ? (totalPnl / baseCapital) * 100 : 0;

  // Sharpe and Sortino ratios
  let sharpeRatio = 0;
  let sortinoRatio = 0;
  if (returns.length >= 2) {
    const meanReturn = returns.reduce((acc, r) => acc + r, 0) / returns.length;
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    const downsideVariance =
      returns.reduce((acc, r) => (r < 0 ? acc + Math.pow(r, 2) : acc), 0) / returns.length;
    const downsideStdDev = Math.sqrt(downsideVariance);

    const annualizationFactor = Math.sqrt(252);
    sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * annualizationFactor : 0;
    sortinoRatio = downsideStdDev > 0 ? (meanReturn / downsideStdDev) * annualizationFactor : 0;
  }

  // Max Drawdown calculation from returns sequence
  let peak = baseCapital;
  let currentCap = baseCapital;
  let maxDrawdown = 0;
  for (const r of returns) {
    currentCap += r;
    if (currentCap > peak) {
      peak = currentCap;
    }
    const dd = peak > 0 ? ((peak - currentCap) / peak) * 100 : 0;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
    }
  }

  return {
    totalBalance,
    cashBalance,
    allocatedBalance,
    allocationPercent,
    positionsCount: positions.filter((p) => p.quantity > 0).length,

    totalOrders: filtered.length,
    closedTradesCount,
    winningTradesCount,
    losingTradesCount,
    breakEvenTradesCount,

    winRate,
    winRateFormatted,

    grossProfit,
    grossLoss,
    netPnl,
    realizedPnl: netPnl,
    unrealizedPnl,
    totalPnl,
    netPnlPercent,

    netPnlFormatted: formatCurrency(netPnl, { showSign: true }),
    pnlPercentFormatted: formatPercent(netPnlPercent),
    realizedPnlFormatted: formatCurrency(netPnl, { showSign: true }),
    unrealizedPnlFormatted: formatCurrency(unrealizedPnl, { showSign: true }),

    profitFactor,
    payoffRatio,
    averageWin,
    averageLoss,
    sharpeRatio,
    sortinoRatio,
    maxDrawdownPercent: maxDrawdown,
    expectancy,

    todayTradesCount,
    todayWinningTradesCount,
    todayLosingTradesCount,
    todayNetPnl,
    todayWinRate,

    hasSufficientData: closedTradesCount >= 30,
    isSmallSample: closedTradesCount < 30,
    sampleSizeNotice:
      closedTradesCount === 0
        ? "Sem operações encerradas"
        : closedTradesCount < 30
        ? `Amostra pequena (${closedTradesCount} trades)`
        : `Amostra robusta (${closedTradesCount} trades)`,
  };
}
