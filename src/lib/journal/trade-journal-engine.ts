/**
 * TradeAI - Motor de Diário de Trades e Analytics Pós-Operação (Post-Trade Analytics Engine)
 *
 * Registra cada trade encerrado com granularidade institucional:
 * - MAE (Maximum Adverse Excursion): Pior preço e derrapagem negativa sofrida
 * - MFE (Maximum Favorable Excursion): Melhor preço e pico de lucro flutuante alcançado
 * - Decomposição estrita de fricção (comissões Maker/Taker + spread)
 * - Métricas agregadas: Win Rate, Profit Factor, Sharpe Ratio, Sortino, Payoff, Max Drawdown
 * - Persistência em armazenamento local e exportação em formato auditável (JSON / CSV)
 */

export interface TradeJournalRecord {
  id: string;
  botId: string;
  botName: string;
  symbol: string;
  side: "BUY" | "SELL";
  mode: "live" | "paper";
  strategy: string;

  // Preços e Quantidades
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  totalInvested: number; // USD / USDT
  totalReturned: number; // USD / USDT

  // Rastreamento de Excursão Intradiária
  highestPrice: number;
  lowestPrice: number;
  maePrice: number;
  maePercent: number;    // % negativa do ponto de entrada até a pior mínima
  mfePrice: number;
  mfePercent: number;    // % positiva do ponto de entrada até a melhor máxima

  // PnL e Resultados
  grossPnl: number;
  netPnl: number;
  gainPercent: number;
  netGainPercent: number;

  // Fricção Operacional e Taxas
  commissionFeesUsd: number;
  spreadCostUsd: number;
  slippagePercent?: number;

  // Temporalidade
  entryTime: string;
  exitTime: string;
  entryTimestampMs: number;
  exitTimestampMs: number;
  durationMs: number;
  durationMinutes: number;
  durationFormatted: string;

  // Governança e Motivo de Saída
  exitReason: string;
  riskRewardRatio?: number;
  notes?: string;
}

export interface PerformanceMetrics {
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  breakevenTrades: number;
  winRate: number; // 0 - 100%

  // Valores Financeiros
  totalGrossPnl: number;
  totalNetPnl: number;
  totalFees: number;
  profitFactor: number; // Gross Wins / Gross Losses
  payoffRatio: number;  // Avg Win / Avg Loss
  expectancyUsd: number;

  // Excursão Média
  avgMaePercent: number;
  avgMfePercent: number;

  // Tempo e Risco
  avgDurationMinutes: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;

  // Curva de Patrimônio Acumulado para Gráficos
  equityCurve: Array<{
    timestamp: number;
    tradeIndex: number;
    netPnl: number;
    cumulativeNetPnl: number;
    equity: number;
  }>;
}

export interface JournalFilterOptions {
  symbol?: string;
  mode?: "all" | "live" | "paper";
  botId?: string;
  startDate?: number;
  endDate?: number;
  outcome?: "all" | "win" | "loss";
}

const STORAGE_KEY = "tradeai_trade_journal_records_v1";

export class TradeJournalEngine {
  private static instance: TradeJournalEngine | null = null;
  private records: TradeJournalRecord[] = [];
  private listeners: Array<(records: TradeJournalRecord[]) => void> = [];

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): TradeJournalEngine {
    if (!TradeJournalEngine.instance) {
      TradeJournalEngine.instance = new TradeJournalEngine();
    }
    return TradeJournalEngine.instance;
  }

  /**
   * Registra a conclusão de uma operação e calcula todas as métricas analíticas.
   */
  public recordTrade(trade: {
    id?: string;
    botId?: string;
    botName?: string;
    symbol: string;
    side?: "BUY" | "SELL";
    mode?: "live" | "paper";
    strategy?: string;
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    highestPrice?: number;
    lowestPrice?: number;
    entryTime?: string;
    exitTime?: string;
    entryTimestampMs?: number;
    exitTimestampMs?: number;
    exitReason?: string;
    commissionRate?: number; // Ex: 0.001 (0.10%)
    spreadPercent?: number;  // Ex: 0.04%
    slippagePercent?: number;
    notes?: string;
  }): TradeJournalRecord {
    const side = trade.side || "BUY";
    const mode = trade.mode || "paper";
    const entryPrice = trade.entryPrice;
    const exitPrice = trade.exitPrice;
    const quantity = trade.quantity;

    const totalInvested = entryPrice * quantity;
    const totalReturned = exitPrice * quantity;
    const grossPnl = totalReturned - totalInvested;
    const gainPercent = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;

    // Rastreamento e cálculo de MAE e MFE
    // Para posição Long:
    // lowestPrice é o menor preço atingido durante a vida da posição.
    // highestPrice é o maior preço atingido.
    const lowestPrice = Math.min(trade.lowestPrice ?? entryPrice, entryPrice, exitPrice);
    const highestPrice = Math.max(trade.highestPrice ?? entryPrice, entryPrice, exitPrice);

    const maePrice = lowestPrice;
    const maePercent = entryPrice > 0 ? ((lowestPrice - entryPrice) / entryPrice) * 100 : 0; // valor <= 0
    const mfePrice = highestPrice;
    const mfePercent = entryPrice > 0 ? ((highestPrice - entryPrice) / entryPrice) * 100 : 0; // valor >= 0

    // Fricção de taxas e spread
    const commissionRate = trade.commissionRate ?? 0.001; // Padrão Binance Spot 0.10%
    const spreadPct = trade.spreadPercent ?? 0.03;       // Spread típico 0.03%
    const commissionFeesUsd = (totalInvested + totalReturned) * commissionRate;
    const spreadCostUsd = (totalInvested + totalReturned) * (spreadPct / 200); // Meio spread na entrada e saída
    const netPnl = grossPnl - (commissionFeesUsd + spreadCostUsd);
    const netGainPercent = totalInvested > 0 ? (netPnl / totalInvested) * 100 : 0;

    // Temporalidade
    const nowMs = Date.now();
    const exitTimestampMs = trade.exitTimestampMs || nowMs;
    const entryTimestampMs = trade.entryTimestampMs || (trade.entryTime ? new Date(trade.entryTime).getTime() : exitTimestampMs - 60000);
    const durationMs = Math.max(1000, exitTimestampMs - entryTimestampMs);
    const durationMinutes = parseFloat((durationMs / 60000).toFixed(2));
    const durationFormatted = this.formatDuration(durationMs);

    const record: TradeJournalRecord = {
      id: trade.id || `tj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      botId: trade.botId || "manual_or_bot",
      botName: trade.botName || "Trading Bot",
      symbol: trade.symbol.toUpperCase(),
      side,
      mode,
      strategy: trade.strategy || "Quantitative Strategy",
      entryPrice,
      exitPrice,
      quantity,
      totalInvested: parseFloat(totalInvested.toFixed(4)),
      totalReturned: parseFloat(totalReturned.toFixed(4)),
      highestPrice,
      lowestPrice,
      maePrice,
      maePercent: parseFloat(maePercent.toFixed(2)),
      mfePrice,
      mfePercent: parseFloat(mfePercent.toFixed(2)),
      grossPnl: parseFloat(grossPnl.toFixed(4)),
      netPnl: parseFloat(netPnl.toFixed(4)),
      gainPercent: parseFloat(gainPercent.toFixed(2)),
      netGainPercent: parseFloat(netGainPercent.toFixed(2)),
      commissionFeesUsd: parseFloat(commissionFeesUsd.toFixed(4)),
      spreadCostUsd: parseFloat(spreadCostUsd.toFixed(4)),
      slippagePercent: trade.slippagePercent,
      entryTime: trade.entryTime || new Date(entryTimestampMs).toISOString(),
      exitTime: trade.exitTime || new Date(exitTimestampMs).toISOString(),
      entryTimestampMs,
      exitTimestampMs,
      durationMs,
      durationMinutes,
      durationFormatted,
      exitReason: trade.exitReason || "Take-Profit / Stop-Loss Condition",
      riskRewardRatio: maePercent !== 0 ? parseFloat((Math.abs(mfePercent / maePercent)).toFixed(2)) : undefined,
      notes: trade.notes,
    };

    this.records.unshift(record);
    // Limitar histórico a 1000 registros em memória para proteção de RAM
    if (this.records.length > 1000) {
      this.records = this.records.slice(0, 1000);
    }

    this.saveToStorage();
    this.notifyListeners();
    return record;
  }

  /**
   * Calcula as métricas agregadas de performance para os registros (ou conjunto filtrado).
   */
  public calculateMetrics(recordsToAnalyze: TradeJournalRecord[] = this.records, initialEquity: number = 1000): PerformanceMetrics {
    const list = recordsToAnalyze;
    if (list.length === 0) {
      return {
        totalTrades: 0,
        winTrades: 0,
        lossTrades: 0,
        breakevenTrades: 0,
        winRate: 0,
        totalGrossPnl: 0,
        totalNetPnl: 0,
        totalFees: 0,
        profitFactor: 0,
        payoffRatio: 0,
        expectancyUsd: 0,
        avgMaePercent: 0,
        avgMfePercent: 0,
        avgDurationMinutes: 0,
        maxDrawdownPercent: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        equityCurve: [{ timestamp: Date.now(), tradeIndex: 0, netPnl: 0, cumulativeNetPnl: 0, equity: initialEquity }],
      };
    }

    let winTrades = 0;
    let lossTrades = 0;
    let breakevenTrades = 0;
    let totalGrossPnl = 0;
    let totalNetPnl = 0;
    let totalFees = 0;
    let grossWins = 0;
    let grossLosses = 0;
    let sumMae = 0;
    let sumMfe = 0;
    let sumDurationMin = 0;

    const returnsList: number[] = [];
    const downsideReturns: number[] = [];

    // Para a curva de patrimônio, ordenamos cronologicamente (do mais antigo ao mais novo)
    const chronological = [...list].sort((a, b) => a.exitTimestampMs - b.exitTimestampMs);
    let cumulativePnl = 0;
    let peakEquity = initialEquity;
    let maxDrawdown = 0;

    const equityCurve = [
      { timestamp: chronological[0]?.entryTimestampMs || Date.now(), tradeIndex: 0, netPnl: 0, cumulativeNetPnl: 0, equity: initialEquity }
    ];

    for (let i = 0; i < chronological.length; i++) {
      const t = chronological[i];
      totalGrossPnl += t.grossPnl;
      totalNetPnl += t.netPnl;
      totalFees += (t.commissionFeesUsd + t.spreadCostUsd);
      sumMae += t.maePercent;
      sumMfe += t.mfePercent;
      sumDurationMin += t.durationMinutes;

      const retPct = t.netGainPercent / 100;
      returnsList.push(retPct);

      if (t.netPnl > 0.001) {
        winTrades++;
        grossWins += t.netPnl;
      } else if (t.netPnl < -0.001) {
        lossTrades++;
        grossLosses += Math.abs(t.netPnl);
        downsideReturns.push(retPct);
      } else {
        breakevenTrades++;
      }

      cumulativePnl += t.netPnl;
      const currentEquity = initialEquity + cumulativePnl;
      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
      }
      const dd = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
      }

      equityCurve.push({
        timestamp: t.exitTimestampMs,
        tradeIndex: i + 1,
        netPnl: t.netPnl,
        cumulativeNetPnl: parseFloat(cumulativePnl.toFixed(4)),
        equity: parseFloat(currentEquity.toFixed(4)),
      });
    }

    const totalTrades = list.length;
    const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : (grossWins > 0 ? 99.9 : 0);
    const avgWin = winTrades > 0 ? grossWins / winTrades : 0;
    const avgLoss = lossTrades > 0 ? grossLosses / lossTrades : 0;
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    // Expectativa matemática por trade = (WinRate * AvgWin) - (LossRate * AvgLoss)
    const winProb = winRate / 100;
    const lossProb = lossTrades / (totalTrades || 1);
    const expectancyUsd = (winProb * avgWin) - (lossProb * avgLoss);

    // Média de MAE e MFE
    const avgMaePercent = parseFloat((sumMae / totalTrades).toFixed(2));
    const avgMfePercent = parseFloat((sumMfe / totalTrades).toFixed(2));
    const avgDurationMinutes = parseFloat((sumDurationMin / totalTrades).toFixed(2));

    // Sharpe Ratio e Sortino Ratio (anualizado aproximado)
    let sharpeRatio = 0;
    let sortinoRatio = 0;
    if (returnsList.length > 1) {
      const meanReturn = returnsList.reduce((acc, r) => acc + r, 0) / returnsList.length;
      const variance = returnsList.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / (returnsList.length - 1);
      const stdDev = Math.sqrt(variance);

      // Assumindo ~252 períodos operacionais
      if (stdDev > 0) {
        sharpeRatio = parseFloat(((meanReturn / stdDev) * Math.sqrt(252)).toFixed(2));
      }

      const downsideVar = downsideReturns.length > 0
        ? downsideReturns.reduce((acc, r) => acc + Math.pow(r, 2), 0) / downsideReturns.length
        : 0;
      const downsideDev = Math.sqrt(downsideVar);
      if (downsideDev > 0) {
        sortinoRatio = parseFloat(((meanReturn / downsideDev) * Math.sqrt(252)).toFixed(2));
      }
    }

    return {
      totalTrades,
      winTrades,
      lossTrades,
      breakevenTrades,
      winRate: parseFloat(winRate.toFixed(1)),
      totalGrossPnl: parseFloat(totalGrossPnl.toFixed(4)),
      totalNetPnl: parseFloat(totalNetPnl.toFixed(4)),
      totalFees: parseFloat(totalFees.toFixed(4)),
      profitFactor: parseFloat(profitFactor.toFixed(2)),
      payoffRatio: parseFloat(payoffRatio.toFixed(2)),
      expectancyUsd: parseFloat(expectancyUsd.toFixed(2)),
      avgMaePercent,
      avgMfePercent,
      avgDurationMinutes,
      maxDrawdownPercent: parseFloat(maxDrawdown.toFixed(2)),
      sharpeRatio,
      sortinoRatio,
      equityCurve,
    };
  }

  /**
   * Retorna os registros filtrados conforme opções
   */
  public getFilteredRecords(filters: JournalFilterOptions = {}): TradeJournalRecord[] {
    return this.records.filter((rec) => {
      if (filters.symbol && rec.symbol !== filters.symbol.toUpperCase()) return false;
      if (filters.mode && filters.mode !== "all" && rec.mode !== filters.mode) return false;
      if (filters.botId && rec.botId !== filters.botId) return false;
      if (filters.startDate && rec.exitTimestampMs < filters.startDate) return false;
      if (filters.endDate && rec.exitTimestampMs > filters.endDate) return false;
      if (filters.outcome === "win" && rec.netPnl <= 0) return false;
      if (filters.outcome === "loss" && rec.netPnl >= 0) return false;
      return true;
    });
  }

  public getAllRecords(): TradeJournalRecord[] {
    return [...this.records];
  }

  public clearAllRecords(): void {
    this.records = [];
    this.saveToStorage();
    this.notifyListeners();
  }

  public subscribe(callback: (records: TradeJournalRecord[]) => void): () => void {
    this.listeners.push(callback);
    callback(this.getAllRecords());
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Exporta os registros em formato CSV compatível com planilhas e relatórios contábeis.
   */
  public exportToCsv(recordsToExport: TradeJournalRecord[] = this.records): string {
    const headers = [
      "ID",
      "Symbol",
      "Side",
      "Mode",
      "Entry Time",
      "Exit Time",
      "Duration (min)",
      "Entry Price",
      "Exit Price",
      "Quantity",
      "Total Invested (USD)",
      "Total Returned (USD)",
      "Gross PnL (USD)",
      "Net PnL (USD)",
      "Net Gain %",
      "MAE %",
      "MFE %",
      "Fees (USD)",
      "Exit Reason"
    ];

    const rows = recordsToExport.map((r) => [
      `"${r.id}"`,
      `"${r.symbol}"`,
      `"${r.side}"`,
      `"${r.mode}"`,
      `"${r.entryTime}"`,
      `"${r.exitTime}"`,
      r.durationMinutes,
      r.entryPrice,
      r.exitPrice,
      r.quantity,
      r.totalInvested,
      r.totalReturned,
      r.grossPnl,
      r.netPnl,
      r.netGainPercent,
      r.maePercent,
      r.mfePercent,
      r.commissionFeesUsd + r.spreadCostUsd,
      `"${r.exitReason}"`
    ]);

    return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  }

  /**
   * Exporta os registros em JSON formatado.
   */
  public exportToJson(recordsToExport: TradeJournalRecord[] = this.records): string {
    return JSON.stringify(recordsToExport, null, 2);
  }

  private formatDuration(ms: number): string {
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  }

  private saveToStorage(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch {
      // Ignora erro de quota em ambiente restrito
    }
  }

  private loadFromStorage(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const data = window.localStorage.getItem(STORAGE_KEY);
      if (data) {
        this.records = JSON.parse(data);
      }
    } catch {
      this.records = [];
    }
  }

  private notifyListeners(): void {
    const list = this.getAllRecords();
    for (const listener of this.listeners) {
      try {
        listener(list);
      } catch (err) {
        console.error("[TradeJournalEngine] Erro no listener:", err);
      }
    }
  }
}

export const tradeJournalEngine = TradeJournalEngine.getInstance();
