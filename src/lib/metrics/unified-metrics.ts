/**
 * Módulo Central de Métricas Institucionais Unificadas do TradeAI.
 * 
 * Regras e Definições Canônicas:
 * 1. Trade: Fechamento de posição (SELL correspondente a um ciclo de trade).
 * 2. Ordem: Qualquer operação de compra (BUY) ou venda (SELL).
 * 3. Vitória (Win): Trade fechado com PnL líquido > 0.
 * 4. Derrota (Loss): Trade fechado com PnL líquido < 0.
 * 5. Empate (Break-even): Trade fechado com PnL líquido exatamente 0 (|PnL| <= 0.0001).
 * 6. PnL Líquido: PnL Bruto − Comissões (taxas) − Slippage de Execução.
 * 7. Taxa de Acerto: (Vitórias / Trades Fechados) * 100.
 *    - Se Trades Fechados === 0: Retorna null (exibição: "—", proibido exibir 0% ou 100%).
 * 8. Amostra Pequena: Menos de 30 trades fechados (< 30).
 *    - Estatísticas avançadas (Sharpe, Sortino, Profit Factor) alertam "Amostra pequena (N trades)".
 * 9. Escopos:
 *    - "ALL": Todas as origens (Robôs, IA Direta, Manual).
 *    - "FLEET": Somente robôs da frota algorítmica.
 *    - "DIRECT_AI": Operações diretas guiadas por IA.
 *    - "MANUAL": Execuções manuais do usuário.
 */

import { formatCurrency, formatPercent } from "@/lib/format";

export type MetricScope = "ALL" | "FLEET" | "DIRECT_AI" | "MANUAL";
export type TradingModeScope = "all" | "paper" | "live";

export interface UnifiedTradeRecord {
  id: string;
  symbol: string;
  side: "BUY" | "SELL" | string;
  price: number;
  quantity?: number;
  amount?: number;
  total?: number;
  grossPnl?: number;
  fee?: number;
  feesPaid?: number;
  commissionFeesUsd?: number;
  slippage?: number;
  slippageEstimated?: number;
  netPnl?: number;
  pnl?: number;
  mode?: "paper" | "live" | string;
  source?: "LIVE_FLEET" | "DIRECT_AI" | "MANUAL" | string;
  botId?: string;
  botName?: string;
  strategy?: string;
  timestamp?: number | string | Date;
  time?: number | string | Date;
  exitTimestampMs?: number;
  entryPrice?: number;
  exitPrice?: number;
  [key: string]: any;
}

export interface UnifiedPortfolioInput {
  totalBalance?: number;
  cashBalance?: number;
  initialBalance?: number;
  positions?: Array<{
    symbol: string;
    quantity: number;
    marketValue?: number;
    unrealizedPnl?: number;
  }>;
}

export interface MetricCalculationOptions {
  scope?: MetricScope;
  mode?: TradingModeScope;
  strategy?: string;
  symbol?: string;
  botId?: string;
  periodMs?: number; // ex.: 24h (86_400_000), 7d, 30d
}

export interface UnifiedPlatformMetrics {
  // Escopo e Metadados
  scope: MetricScope;
  scopeLabel: string;
  mode: TradingModeScope;
  isSmallSample: boolean;
  sampleSizeNotice: string;

  // Ordens e Trades
  totalOrders: number;
  buyOrdersCount: number;
  sellOrdersCount: number;
  closedTradesCount: number;
  winningTradesCount: number;
  losingTradesCount: number;
  breakEvenTradesCount: number;

  // Taxa de Acerto (Win Rate)
  winRate: number | null; // 0 a 100 ou null se 0 trades
  winRateFormatted: string; // "23,8%" ou "—"

  // PnL e Resultados
  grossProfit: number;
  grossLoss: number;
  totalFees: number;
  totalSlippage: number;
  grossPnl: number;
  netPnl: number;
  netPnlFormatted: string; // "US$ 10.011,30" ou "−US$ 12,29"
  pnlPercent: number;
  pnlPercentFormatted: string; // "+0,11%" ou "−1,45%"
  unrealizedPnl: number;
  realizedPnl: number;

  // Patrimônio e Caixa
  totalEquity: number;
  cashBalance: number;
  investedBalance: number;
  totalEquityFormatted: string;
  cashBalanceFormatted: string;
  investedBalanceFormatted: string;

  // Indicadores Quantitativos
  profitFactor: number | null;
  profitFactorFormatted: string; // "0,12" ou "—"
  payoffRatio: number | null;
  payoffRatioFormatted: string; // "0,37x" ou "—"
  averageWin: number | null;
  averageLoss: number | null;
  sharpeRatio: number | null;
  sharpeRatioFormatted: string;
  sortinoRatio: number | null;
  sortinoRatioFormatted: string;
  maxDrawdownPercent: number;
  maxDrawdownFormatted: string;

  // Amostra e suficiência
  hasSufficientData: boolean;
}

/**
 * Normaliza o timestamp de um trade para milissegundos.
 */
export function extractTradeTimestamp(trade: UnifiedTradeRecord): number {
  if (typeof trade.exitTimestampMs === "number" && trade.exitTimestampMs > 0) {
    return trade.exitTimestampMs;
  }
  if (typeof trade.timestamp === "number" && trade.timestamp > 0) {
    return trade.timestamp;
  }
  if (typeof trade.time === "number" && trade.time > 0) {
    return trade.time;
  }
  if (trade.timestamp instanceof Date) {
    return trade.timestamp.getTime();
  }
  if (typeof trade.timestamp === "string") {
    const parsed = new Date(trade.timestamp).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  if (typeof trade.time === "string") {
    const parsed = new Date(trade.time).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  return Date.now();
}

/**
 * Extrai o PnL líquido de forma defensiva e canônica.
 */
export function extractNetPnl(trade: UnifiedTradeRecord): number {
  if (typeof trade.netPnl === "number" && !isNaN(trade.netPnl)) {
    return trade.netPnl;
  }
  if (typeof trade.pnl === "number" && !isNaN(trade.pnl)) {
    return trade.pnl;
  }
  return 0;
}

/**
 * Identifica se uma operação representa um trade fechado com realização contábil.
 */
export function isTradeClosed(trade: UnifiedTradeRecord): boolean {
  const side = (trade.side || "").toUpperCase();
  if (side === "SELL") return true;
  if (typeof trade.netPnl === "number" && trade.netPnl !== 0) return true;
  if (typeof trade.pnl === "number" && trade.pnl !== 0) return true;
  return false;
}

/**
 * Filtra a lista de trades conforme escopo, modo e janela temporal.
 */
export function filterUnifiedTrades(
  trades: UnifiedTradeRecord[],
  options?: MetricCalculationOptions
): UnifiedTradeRecord[] {
  if (!Array.isArray(trades) || trades.length === 0) return [];
  const now = Date.now();
  const scope = options?.scope || "ALL";
  const mode = options?.mode || "all";

  return trades.filter((t) => {
    // 1. Filtro de Modo (paper vs live)
    if (mode !== "all" && t.mode) {
      if (t.mode.toLowerCase() !== mode.toLowerCase()) return false;
    }

    // 2. Filtro de Escopo (Frota, IA Direta, Manual)
    if (scope === "FLEET") {
      const src = (t.source || "").toUpperCase();
      const botId = (t.botId || "").toLowerCase();
      const botName = (t.botName || "").toLowerCase();
      if (src === "DIRECT_AI" || botId.includes("direct") || botName.includes("direct")) {
        return false;
      }
      if (src === "MANUAL" || botId.includes("manual")) {
        return false;
      }
    } else if (scope === "DIRECT_AI") {
      const src = (t.source || "").toUpperCase();
      const botId = (t.botId || "").toLowerCase();
      const botName = (t.botName || "").toLowerCase();
      const isDirect = src === "DIRECT_AI" || botId.includes("direct") || botName.includes("direct");
      if (!isDirect) return false;
    } else if (scope === "MANUAL") {
      const src = (t.source || "").toUpperCase();
      const botId = (t.botId || "").toLowerCase();
      if (src !== "MANUAL" && !botId.includes("manual")) return false;
    }

    // 3. Filtro por Símbolo
    if (options?.symbol && t.symbol && t.symbol !== options.symbol) {
      return false;
    }

    // 4. Filtro por Estratégia
    if (options?.strategy && t.strategy) {
      if (!t.strategy.toUpperCase().includes(options.strategy.toUpperCase())) {
        return false;
      }
    }

    // 5. Filtro por BotId
    if (options?.botId && t.botId && t.botId !== options.botId) {
      return false;
    }

    // 6. Janela Temporal (ex: últimas 24h)
    if (options?.periodMs && options.periodMs > 0) {
      const tTime = extractTradeTimestamp(t);
      if (now - tTime > options.periodMs) return false;
    }

    return true;
  });
}

/**
 * Calcula todas as métricas analíticas e financeiras a partir da lista única de trades.
 */
export function calculateUnifiedMetrics(params: {
  trades: UnifiedTradeRecord[];
  portfolio?: UnifiedPortfolioInput;
  options?: MetricCalculationOptions;
}): UnifiedPlatformMetrics {
  const { trades = [], portfolio, options } = params;
  const scope = options?.scope || "ALL";
  const mode = options?.mode || "all";

  const scopeLabels: Record<MetricScope, string> = {
    ALL: "Todas as origens",
    FLEET: "Somente robôs",
    DIRECT_AI: "IA direta",
    MANUAL: "Operações manuais",
  };

  const filteredTrades = filterUnifiedTrades(trades, options);

  let totalOrders = 0;
  let buyOrdersCount = 0;
  let sellOrdersCount = 0;
  let winningTradesCount = 0;
  let losingTradesCount = 0;
  let breakEvenTradesCount = 0;

  let grossProfit = 0;
  let grossLoss = 0;
  let totalFees = 0;
  let totalSlippage = 0;
  let netPnl = 0;

  const returns: number[] = [];

  for (const t of filteredTrades) {
    totalOrders++;
    const side = (t.side || "").toUpperCase();
    if (side === "BUY") buyOrdersCount++;
    if (side === "SELL") sellOrdersCount++;

    const fee = t.feesPaid ?? t.commissionFeesUsd ?? t.fee ?? 0;
    const slippage = t.slippageEstimated ?? t.slippage ?? 0;
    totalFees += fee;
    totalSlippage += slippage;

    if (isTradeClosed(t)) {
      const tradeNet = extractNetPnl(t);
      netPnl += tradeNet;
      returns.push(tradeNet);

      if (tradeNet > 0.0001) {
        winningTradesCount++;
        grossProfit += tradeNet;
      } else if (tradeNet < -0.0001) {
        losingTradesCount++;
        grossLoss += Math.abs(tradeNet);
      } else {
        breakEvenTradesCount++;
      }
    }
  }

  const closedTradesCount = winningTradesCount + losingTradesCount + breakEvenTradesCount;
  const isSmallSample = closedTradesCount < 30;
  const hasSufficientData = closedTradesCount >= 30;

  let sampleSizeNotice = "";
  if (closedTradesCount === 0) {
    sampleSizeNotice = "Sem operações encerradas";
  } else if (closedTradesCount === 1) {
    sampleSizeNotice = "Amostra pequena (1 trade)";
  } else if (closedTradesCount < 30) {
    sampleSizeNotice = `Amostra pequena (${closedTradesCount} trades)`;
  } else {
    sampleSizeNotice = `Amostra robusta (${closedTradesCount} trades)`;
  }

  // Taxa de Acerto (Win Rate)
  let winRate: number | null = null;
  let winRateFormatted = "—";
  if (closedTradesCount > 0) {
    const totalDecisive = winningTradesCount + losingTradesCount;
    winRate = totalDecisive > 0 ? (winningTradesCount / totalDecisive) * 100 : 0;
    winRateFormatted = `${winRate.toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}%`;
  }

  // Relações Quantitativas (Profit Factor e Payoff Ratio)
  let profitFactor: number | null = null;
  let profitFactorFormatted = "—";
  if (closedTradesCount > 0) {
    if (grossLoss > 0) {
      profitFactor = grossProfit / grossLoss;
      profitFactorFormatted = profitFactor.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } else if (grossProfit > 0) {
      profitFactor = 99.0;
      profitFactorFormatted = "99,0+";
    } else {
      profitFactor = 0;
      profitFactorFormatted = "0,00";
    }
  }

  const averageWin = winningTradesCount > 0 ? grossProfit / winningTradesCount : null;
  const averageLoss = losingTradesCount > 0 ? grossLoss / losingTradesCount : null;

  let payoffRatio: number | null = null;
  let payoffRatioFormatted = "—";
  if (averageLoss !== null && averageLoss > 0 && averageWin !== null) {
    payoffRatio = averageWin / averageLoss;
    payoffRatioFormatted = `${payoffRatio.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}x`;
  } else if (averageWin !== null && averageWin > 0) {
    payoffRatio = 99.0;
    payoffRatioFormatted = "99,0x";
  }

  // Sharpe e Sortino
  let sharpeRatio: number | null = null;
  let sharpeRatioFormatted = "—";
  let sortinoRatio: number | null = null;
  let sortinoRatioFormatted = "—";

  if (returns.length >= 5) {
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) /
      Math.max(1, returns.length - 1);
    const stdDev = Math.sqrt(variance);

    if (stdDev > 0.0001) {
      // Anualizado assumindo trades intradiários (raiz de 252)
      sharpeRatio = (meanReturn / stdDev) * Math.sqrt(252);
      sharpeRatioFormatted = sharpeRatio.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }

    // Downside Deviation para Sortino
    const downsideReturns = returns.filter((r) => r < 0);
    if (downsideReturns.length > 0) {
      const downsideVariance =
        downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) /
        downsideReturns.length;
      const downsideStdDev = Math.sqrt(downsideVariance);
      if (downsideStdDev > 0.0001) {
        sortinoRatio = (meanReturn / downsideStdDev) * Math.sqrt(252);
        sortinoRatioFormatted = sortinoRatio.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
    }
  }

  // Curva de Patrimônio & Max Drawdown
  let peak = portfolio?.initialBalance ?? 10000;
  let currentEquityCurve = peak;
  let maxDrawdownPercent = 0;

  for (const r of returns) {
    currentEquityCurve += r;
    if (currentEquityCurve > peak) {
      peak = currentEquityCurve;
    }
    if (peak > 0) {
      const dd = ((peak - currentEquityCurve) / peak) * 100;
      if (dd > maxDrawdownPercent) {
        maxDrawdownPercent = dd;
      }
    }
  }

  const initialBal = portfolio?.initialBalance ?? 10000;
  const cashBalance = portfolio?.cashBalance ?? 10000;
  const positions = portfolio?.positions ?? [];
  const investedBalance = positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
  const unrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0);
  const totalEquity = portfolio?.totalBalance ?? (cashBalance + investedBalance);

  const pnlPercent = initialBal > 0 ? (netPnl / initialBal) * 100 : 0;

  return {
    scope,
    scopeLabel: scopeLabels[scope] || "Todas as origens",
    mode,
    isSmallSample,
    sampleSizeNotice,

    totalOrders,
    buyOrdersCount,
    sellOrdersCount,
    closedTradesCount,
    winningTradesCount,
    losingTradesCount,
    breakEvenTradesCount,

    winRate,
    winRateFormatted,

    grossProfit,
    grossLoss,
    totalFees,
    totalSlippage,
    grossPnl: grossProfit - grossLoss,
    netPnl,
    netPnlFormatted: formatCurrency(netPnl, { showSign: true }),
    pnlPercent,
    pnlPercentFormatted: formatPercent(pnlPercent),
    unrealizedPnl,
    realizedPnl: netPnl,

    totalEquity,
    cashBalance,
    investedBalance,
    totalEquityFormatted: formatCurrency(totalEquity),
    cashBalanceFormatted: formatCurrency(cashBalance),
    investedBalanceFormatted: formatCurrency(investedBalance),

    profitFactor,
    profitFactorFormatted,
    payoffRatio,
    payoffRatioFormatted,
    averageWin,
    averageLoss,
    sharpeRatio,
    sharpeRatioFormatted,
    sortinoRatio,
    sortinoRatioFormatted,
    maxDrawdownPercent,
    maxDrawdownFormatted: `-${maxDrawdownPercent.toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    })}%`,

    hasSufficientData,
  };
}
