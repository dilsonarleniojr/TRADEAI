/**
 * Quantitative Risk Metrics Calculation Module
 * Provides institutional risk-adjusted return analytics:
 * - Annualized Sharpe Ratio
 * - Annualized Sortino Ratio (downside deviation only)
 * - Profit Factor
 * - Mathematical Expectancy (E) & Expectancy Ratio
 * - Maximum Drawdown (MDD) & Current Drawdown
 * - Parametric / Historical Value at Risk (VaR 95%)
 */

import type { TradeData, BotInstance } from "@/lib/store/types";

export interface PortfolioRiskMetrics {
  totalTrades: number;
  closedTradesCount: number;
  winTrades: number;
  lossTrades: number;
  winRate: number; // 0 - 100
  totalRealizedPnl: number;
  grossProfits: number;
  grossLosses: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  payoffRatio: number; // avgWin / avgLoss
  expectancy: number; // Expectativa matemática em USDT por trade: (p * avgWin) - (q * avgLoss)
  expectancyPercent: number; // Expectativa percentual por trade
  sharpeRatio: number; // Anualizado (base 365 dias)
  sortinoRatio: number; // Anualizado (apenas desvio negativo)
  maxDrawdownPercent: number; // Maior queda de pico a vale (%)
  maxDrawdownUsdt: number;
  currentDrawdownPercent: number;
  calmarRatio: number;
  var95Percent: number; // Value at Risk a 95% de confiança
  cvar95Percent: number; // Conditional VaR / Expected Shortfall
  healthRating: "EXCELLENT" | "SOLID" | "BALANCED" | "NEEDS_OPTIMIZATION" | "INSUFFICIENT_DATA";
}

/**
 * Calculates comprehensive quantitative risk metrics from closed trades.
 */
export function calculateRiskMetrics(
  trades: TradeData[],
  initialBalance: number = 100.0,
  riskFreeRateAnnual: number = 0.02
): PortfolioRiskMetrics {
  // Filtra apenas trades encerrados com PnL apurado (geralmente ordens de SELL ou com pnl != 0)
  const closedTrades = trades.filter((t) => typeof t.pnl === "number" && t.pnl !== 0);

  if (closedTrades.length === 0) {
    return {
      totalTrades: trades.length,
      closedTradesCount: 0,
      winTrades: 0,
      lossTrades: 0,
      winRate: 100,
      totalRealizedPnl: 0,
      grossProfits: 0,
      grossLosses: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      payoffRatio: 0,
      expectancy: 0,
      expectancyPercent: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      maxDrawdownPercent: 0,
      maxDrawdownUsdt: 0,
      currentDrawdownPercent: 0,
      calmarRatio: 0,
      var95Percent: 0,
      cvar95Percent: 0,
      healthRating: "INSUFFICIENT_DATA",
    };
  }

  const pnls = closedTrades.map((t) => t.pnl || 0);
  const returns = closedTrades.map((t) => {
    const cost = t.total || (t.price * t.quantity) || 40.0;
    return cost > 0 ? (t.pnl || 0) / cost : 0;
  });

  const winPnls = pnls.filter((p) => p > 0);
  const lossPnls = pnls.filter((p) => p < 0);

  const winTrades = winPnls.length;
  const lossTrades = lossPnls.length;
  const totalClosed = closedTrades.length;
  const winRate = totalClosed > 0 ? (winTrades / totalClosed) * 100 : 0;

  const grossProfits = winPnls.reduce((sum, p) => sum + p, 0);
  const grossLosses = Math.abs(lossPnls.reduce((sum, p) => sum + p, 0));
  const totalRealizedPnl = grossProfits - grossLosses;

  // Profit Factor
  let profitFactor = 0;
  if (grossLosses === 0) {
    profitFactor = grossProfits > 0 ? 99.99 : 0;
  } else {
    profitFactor = parseFloat((grossProfits / grossLosses).toFixed(2));
  }

  // Médias
  const avgWin = winTrades > 0 ? grossProfits / winTrades : 0;
  const avgLoss = lossTrades > 0 ? grossLosses / lossTrades : 0;
  const payoffRatio = avgLoss > 0 ? parseFloat((avgWin / avgLoss).toFixed(2)) : (avgWin > 0 ? 10.0 : 0);

  // Expectativa Matemática: E = (p * avgWin) - (q * avgLoss)
  const p = winTrades / totalClosed;
  const q = lossTrades / totalClosed;
  const expectancy = parseFloat(((p * avgWin) - (q * avgLoss)).toFixed(2));

  const avgReturnWin = winPnls.length > 0 ? returns.filter((r) => r > 0).reduce((s, r) => s + r, 0) / winPnls.length : 0;
  const avgReturnLoss = lossPnls.length > 0 ? Math.abs(returns.filter((r) => r < 0).reduce((s, r) => s + r, 0) / lossPnls.length) : 0;
  const expectancyPercent = parseFloat((((p * avgReturnWin) - (q * avgReturnLoss)) * 100).toFixed(2));

  // Volatilidade e Desvio Padrão dos Retornos
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / totalClosed;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / totalClosed;
  const stdDev = Math.sqrt(variance);

  // Downside Deviation (apenas volatilidade de perdas)
  const downsideSquared = returns.filter((r) => r < 0).map((r) => Math.pow(r, 2));
  const downsideVariance = downsideSquared.length > 0
    ? downsideSquared.reduce((sum, d) => sum + d, 0) / downsideSquared.length
    : 0;
  const downsideDev = Math.sqrt(downsideVariance);

  // Fator de Anualização (Base diária cripto = 365)
  const annualizationFactor = Math.sqrt(365);
  const dailyRf = riskFreeRateAnnual / 365;

  // Sharpe Ratio Anualizado
  let sharpeRatio = 0;
  if (stdDev > 0) {
    sharpeRatio = parseFloat((((meanReturn - dailyRf) / stdDev) * annualizationFactor).toFixed(2));
  } else if (meanReturn > 0) {
    sharpeRatio = 5.0; // Ganho sem perdas
  }

  // Sortino Ratio Anualizado
  let sortinoRatio = 0;
  if (downsideDev > 0) {
    sortinoRatio = parseFloat((((meanReturn - dailyRf) / downsideDev) * annualizationFactor).toFixed(2));
  } else if (meanReturn > 0) {
    sortinoRatio = 9.99; // Sem volatilidade negativa
  }

  // Drawdown Analysis através da Curva de Equity Cumulativa
  let currentEquity = initialBalance;
  let peakEquity = initialBalance;
  let maxDrawdownUsdt = 0;
  let maxDrawdownPercent = 0;

  for (const pnl of pnls) {
    currentEquity += pnl;
    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    }
    const ddUsdt = peakEquity - currentEquity;
    const ddPct = peakEquity > 0 ? (ddUsdt / peakEquity) * 100 : 0;

    if (ddUsdt > maxDrawdownUsdt) {
      maxDrawdownUsdt = ddUsdt;
    }
    if (ddPct > maxDrawdownPercent) {
      maxDrawdownPercent = ddPct;
    }
  }

  const currentDrawdownUsdt = Math.max(0, peakEquity - currentEquity);
  const currentDrawdownPercent = peakEquity > 0 ? parseFloat(((currentDrawdownUsdt / peakEquity) * 100).toFixed(2)) : 0;
  maxDrawdownPercent = parseFloat(maxDrawdownPercent.toFixed(2));
  maxDrawdownUsdt = parseFloat(maxDrawdownUsdt.toFixed(2));

  // Calmar Ratio
  const annualizedReturn = meanReturn * 365 * 100;
  const calmarRatio = maxDrawdownPercent > 0 ? parseFloat((annualizedReturn / maxDrawdownPercent).toFixed(2)) : (annualizedReturn > 0 ? 10.0 : 0);

  // Value at Risk (VaR 95% Histórico)
  const sortedReturns = [...returns].sort((a, b) => a - b);
  const varIndex = Math.max(0, Math.floor(sortedReturns.length * 0.05));
  const var95Percent = parseFloat((Math.abs(Math.min(0, sortedReturns[varIndex])) * 100).toFixed(2));

  // CVaR (Expected Shortfall)
  const tailReturns = sortedReturns.slice(0, varIndex + 1);
  const cvar95Percent = tailReturns.length > 0
    ? parseFloat((Math.abs(tailReturns.reduce((s, r) => s + r, 0) / tailReturns.length) * 100).toFixed(2))
    : var95Percent;

  // Classificação de Saúde Quantitativa
  let healthRating: PortfolioRiskMetrics["healthRating"] = "BALANCED";
  if (totalClosed < 3) {
    healthRating = "INSUFFICIENT_DATA";
  } else if (sharpeRatio >= 2.0 && profitFactor >= 2.0 && maxDrawdownPercent <= 5.0) {
    healthRating = "EXCELLENT";
  } else if (sharpeRatio >= 1.2 && profitFactor >= 1.5 && maxDrawdownPercent <= 8.0) {
    healthRating = "SOLID";
  } else if (profitFactor < 1.0 || maxDrawdownPercent > 15.0) {
    healthRating = "NEEDS_OPTIMIZATION";
  }

  return {
    totalTrades: trades.length,
    closedTradesCount: totalClosed,
    winTrades,
    lossTrades,
    winRate: parseFloat(winRate.toFixed(1)),
    totalRealizedPnl: parseFloat(totalRealizedPnl.toFixed(2)),
    grossProfits: parseFloat(grossProfits.toFixed(2)),
    grossLosses: parseFloat(grossLosses.toFixed(2)),
    profitFactor,
    avgWin: parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    payoffRatio,
    expectancy,
    expectancyPercent,
    sharpeRatio,
    sortinoRatio,
    maxDrawdownPercent,
    maxDrawdownUsdt,
    currentDrawdownPercent,
    calmarRatio,
    var95Percent,
    cvar95Percent,
    healthRating,
  };
}

/**
 * Calculates risk metrics specifically for a single bot instance.
 */
export function calculateBotRiskMetrics(
  bot: BotInstance,
  allTrades: TradeData[]
): PortfolioRiskMetrics {
  const botTrades = allTrades.filter(
    (t) => t.botId === bot.id || (t.botName && t.botName === bot.name)
  );
  return calculateRiskMetrics(botTrades, bot.allocationAmount || 40.0);
}
