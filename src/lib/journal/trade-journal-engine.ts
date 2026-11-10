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

import {
  journalPersistenceManager,
  type JournalPersistenceStats,
  type CustomBatchSinkHandler,
} from "./journal-persistence-worker-manager";
import {
  ColdTierCompactionEngine,
  toUtcDateKey,
  type DailyRollupSnapshot,
  type ColdTierCompactionReport,
  type LongHorizonWindow,
} from "./cold-tier-compaction-engine";

export type {
  JournalPersistenceStats,
  CustomBatchSinkHandler,
  DailyRollupSnapshot,
  ColdTierCompactionReport,
  LongHorizonWindow,
};
export { ColdTierCompactionEngine };
export type ExecutionEventSource = "DIRECT_AI_TRADE" | "LIVE_FLEET" | "MANUAL";

export type ExecutionTriggerType =
  | "TAKE_PROFIT"
  | "PARTIAL_TAKE_PROFIT"
  | "STOP_LOSS"
  | "TRAILING_STOP"
  | "TIME_EXPIRED"
  | "MANUAL_CLOSE";

export interface BotExecutionEventPayload {
  eventId?: string;
  id?: string;
  source: ExecutionEventSource;
  triggerType: ExecutionTriggerType;
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
  commissionRate?: number;
  spreadPercent?: number;
  slippagePercent?: number;
  notes?: string;
}

export const TRADE_EXECUTION_CHANNEL_NAME = "tradeai_execution_channel_v1";
export const TRADE_EXECUTION_CUSTOM_EVENT = "tradeai:bot-execution";
export const JOURNAL_UPDATED_CUSTOM_EVENT = "tradeai:journal-updated";
export const DEFAULT_INITIAL_CAPITAL = 10000;

export interface TradeJournalRecord {
  id: string;
  botId: string;
  botName: string;
  symbol: string;
  side: "BUY" | "SELL";
  mode: "live" | "paper";
  strategy: string;
  source?: ExecutionEventSource;
  triggerType?: ExecutionTriggerType;

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
const MAX_IN_MEMORY_RECORDS = 5000;
const MAX_PROCESSED_EVENT_IDS = 10000;

/**
 * Escala de Ponto Fixo Financeiro (1e8 micro-unidades / Satoshis)
 * Garante precisão monetária exata e elimina deriva de ponto flutuante IEEE-754 (ex: 0.1 + 0.2 !== 0.3)
 */
export const FINANCIAL_MICRO_SCALE = 100_000_000;

export function toMicroUnits(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round(val * FINANCIAL_MICRO_SCALE);
}

export function fromMicroUnits(microVal: number, decimals = 4): number {
  if (!Number.isFinite(microVal)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((microVal / FINANCIAL_MICRO_SCALE) * factor) / factor;
}

export function addExactUsd(a: number, b: number, decimals = 4): number {
  return fromMicroUnits(toMicroUnits(a) + toMicroUnits(b), decimals);
}

export function subExactUsd(a: number, b: number, decimals = 4): number {
  return fromMicroUnits(toMicroUnits(a) - toMicroUnits(b), decimals);
}

export function mulExactUsd(a: number, b: number, decimals = 4): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const microProduct = Math.round(a * b * FINANCIAL_MICRO_SCALE);
  return fromMicroUnits(microProduct, decimals);
}

/**
 * BoundedIdRingBuffer
 * Estrutura de dados de tamanho fixo O(1) para controle de idempotência de eventos de execução,
 * prevenindo vazamento de memória (Unbounded Set) em sessões contínuas 24/7.
 */
export class BoundedIdRingBuffer {
  private readonly capacity: number;
  private readonly ring: (string | undefined)[];
  private readonly lookup = new Set<string>();
  private writePtr = 0;

  constructor(capacity = MAX_PROCESSED_EVENT_IDS) {
    this.capacity = Math.max(16, capacity);
    this.ring = new Array<string | undefined>(this.capacity);
  }

  public has(id: string): boolean {
    return this.lookup.has(id);
  }

  public add(id: string): void {
    if (!id || this.lookup.has(id)) return;
    const evicted = this.ring[this.writePtr];
    if (evicted !== undefined) {
      this.lookup.delete(evicted);
    }
    this.ring[this.writePtr] = id;
    this.lookup.add(id);
    this.writePtr = (this.writePtr + 1) % this.capacity;
  }

  public clear(): void {
    this.lookup.clear();
    this.ring.fill(undefined);
    this.writePtr = 0;
  }

  public get size(): number {
    return this.lookup.size;
  }
}

export interface JournalChannelStatus {
  broadcastChannelActive: boolean;
  customEventActive: boolean;
  processedEventsCount: number;
  lastEventTimestamp: number | null;
  lastEventSource: ExecutionEventSource | null;
  lastTriggerType: ExecutionTriggerType | null;
  persistence: JournalPersistenceStats;
}

export class TradeJournalEngine {
  private static instance: TradeJournalEngine | null = null;
  private records: TradeJournalRecord[] = [];
  private recordsById = new Map<string, TradeJournalRecord>();
  private dailyRollupsMap = new Map<string, DailyRollupSnapshot>();
  private lastCompactionReport: ColdTierCompactionReport | null = null;
  private listeners: Array<(records: TradeJournalRecord[]) => void> = [];
  private executionEventListeners: Array<
    (record: TradeJournalRecord, event: BotExecutionEventPayload) => void
  > = [];
  private processedEventIds = new BoundedIdRingBuffer(MAX_PROCESSED_EVENT_IDS);
  private returnsTypedBuffer = new Float64Array(MAX_IN_MEMORY_RECORDS);
  private broadcastChannel: BroadcastChannel | null = null;
  private customEventActive = false;
  private lastEventTimestamp: number | null = null;
  private lastEventSource: ExecutionEventSource | null = null;
  private lastTriggerType: ExecutionTriggerType | null = null;

  private constructor() {
    this.loadFromStorage();
    this.initRealtimeEventBus();
    void this.hydrateFromAsyncStorage();
  }

  public static getInstance(): TradeJournalEngine {
    if (!TradeJournalEngine.instance) {
      TradeJournalEngine.instance = new TradeJournalEngine();
    }
    return TradeJournalEngine.instance;
  }

  /**
   * Inicializa o barramento reativo dual (BroadcastChannel + CustomEvent)
   * para conectar o motor diretamente aos eventos de execução (Direct AI Trade & Live Fleet).
   */
  private initRealtimeEventBus(): void {
    // 1. Conexão via BroadcastChannel (comunicação entre abas, workers e contextos isolados)
    if (typeof BroadcastChannel !== "undefined") {
      try {
        this.broadcastChannel = new BroadcastChannel(TRADE_EXECUTION_CHANNEL_NAME);
        this.broadcastChannel.onmessage = (msgEvent: MessageEvent) => {
          const data = msgEvent?.data;
          if (!data || typeof data !== "object") return;

          if (data.type === "BOT_EXECUTION_EVENT" && data.payload) {
            this.ingestExternalExecutionEvent(data.payload as BotExecutionEventPayload, false);
          } else if (data.type === "BOT_EXECUTION_RECORDED" && data.record) {
            this.ingestBroadcastedRecord(
              data.record as TradeJournalRecord,
              data.event as BotExecutionEventPayload | undefined
            );
          } else if (data.type === "JOURNAL_CLEAR") {
            if (this.records.length > 0) {
              this.records = [];
              this.recordsById.clear();
              this.processedEventIds.clear();
              void journalPersistenceManager.clearAllPersisted();
              this.notifyListeners();
            }
          }
        };
      } catch {
        this.broadcastChannel = null;
      }
    }

    // 2. Conexão via CustomEvent no EventTarget global (window / globalThis)
    const target: EventTarget | undefined =
      typeof window !== "undefined"
        ? window
        : typeof globalThis !== "undefined" && typeof (globalThis as any).addEventListener === "function"
        ? (globalThis as unknown as EventTarget)
        : undefined;

    if (target) {
      try {
        target.addEventListener(TRADE_EXECUTION_CUSTOM_EVENT, ((evt: Event) => {
          const customEvt = evt as CustomEvent;
          const detail = customEvt?.detail;
          if (!detail || typeof detail !== "object") return;

          // Ignora eventos despachados internamente por este próprio motor (já processados)
          if (detail.__internalDispatched) return;

          const payload: BotExecutionEventPayload = detail.event || detail;
          if (payload && payload.symbol && typeof payload.entryPrice === "number") {
            this.ingestExternalExecutionEvent(payload, true);
          }
        }) as EventListener);

        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
          window.addEventListener("storage", (storageEvt: StorageEvent) => {
            if (storageEvt.key === STORAGE_KEY) {
              this.loadFromStorage();
              this.notifyListeners();
            }
          });
        }

        this.customEventActive = true;
      } catch {
        this.customEventActive = false;
      }
    }
  }

  /**
   * Processa um evento de execução vindo de CustomEvent externo ou BroadcastChannel
   */
  private ingestExternalExecutionEvent(
    event: BotExecutionEventPayload,
    shouldBroadcastToChannel: boolean
  ): TradeJournalRecord | null {
    const dedupId = event.eventId || event.id;
    if (dedupId && (this.processedEventIds.has(dedupId) || this.recordsById.has(dedupId))) {
      return this.recordsById.get(dedupId) || null;
    }

    return this.dispatchExecutionEvent(event, { broadcastToChannel: shouldBroadcastToChannel });
  }

  /**
   * Sincroniza um TradeJournalRecord já computado e transmitido por outra aba/worker via BroadcastChannel
   */
  private ingestBroadcastedRecord(
    record: TradeJournalRecord,
    event?: BotExecutionEventPayload
  ): void {
    if (!record || !record.id) return;
    if (this.processedEventIds.has(record.id) || this.recordsById.has(record.id)) {
      return;
    }

    this.processedEventIds.add(record.id);
    this.recordsById.set(record.id, record);
    this.lastEventTimestamp = record.exitTimestampMs || Date.now();
    this.lastEventSource = record.source || event?.source || "LIVE_FLEET";
    this.lastTriggerType = record.triggerType || event?.triggerType || "TAKE_PROFIT";

    this.records.unshift(record);
    if (this.records.length > MAX_IN_MEMORY_RECORDS) {
      const removed = this.records.pop();
      if (removed?.id) this.recordsById.delete(removed.id);
    }

    this.scheduleAsyncRecordPersistence(record);
    this.updateIncrementalDailyRollup(record);
    this.notifyListeners();

    if (event) {
      this.notifyExecutionEventListeners(record, event);
    }
  }

  /**
   * Despacha um evento de execução (Take-Profit, Parcial, Stop-Loss, Trailing Stop)
   * diretamente do motor algorítmico (Direct AI Trade ou Live Fleet), atualizando
   * imediatamente a curva de patrimônio em memória e propagando via BroadcastChannel e CustomEvent.
   */
  public dispatchExecutionEvent(
    event: BotExecutionEventPayload,
    options?: { broadcastToChannel?: boolean }
  ): TradeJournalRecord {
    const dedupId =
      event.eventId ||
      event.id ||
      `exec_${event.source.toLowerCase()}_${event.botId || "bot"}_${event.symbol}_${event.exitTimestampMs || Date.now()}`;

    const existing = this.recordsById.get(dedupId);
    if (existing) {
      return existing;
    }

    this.processedEventIds.add(dedupId);
    this.lastEventTimestamp = event.exitTimestampMs || Date.now();
    this.lastEventSource = event.source;
    this.lastTriggerType = event.triggerType;

    const record = this.recordTrade(
      {
        id: dedupId,
        botId: event.botId,
        botName: event.botName,
        symbol: event.symbol,
        side: event.side,
        mode: event.mode,
        strategy: event.strategy,
        source: event.source,
        triggerType: event.triggerType,
        entryPrice: event.entryPrice,
        exitPrice: event.exitPrice,
        quantity: event.quantity,
        highestPrice: event.highestPrice,
        lowestPrice: event.lowestPrice,
        entryTime: event.entryTime,
        exitTime: event.exitTime,
        entryTimestampMs: event.entryTimestampMs,
        exitTimestampMs: event.exitTimestampMs,
        exitReason: event.exitReason || event.triggerType,
        commissionRate: event.commissionRate,
        spreadPercent: event.spreadPercent,
        slippagePercent: event.slippagePercent,
        notes: event.notes,
      },
      { skipChannelBroadcast: options?.broadcastToChannel === false, originEvent: event }
    );

    return record;
  }

  /**
   * Retorna o status atual do barramento de eventos em tempo real
   */
  public getChannelStatus(): JournalChannelStatus {
    return {
      broadcastChannelActive: this.broadcastChannel !== null,
      customEventActive: this.customEventActive,
      processedEventsCount: this.processedEventIds.size,
      lastEventTimestamp: this.lastEventTimestamp,
      lastEventSource: this.lastEventSource,
      lastTriggerType: this.lastTriggerType,
      persistence: journalPersistenceManager.getStats(),
    };
  }

  /**
   * Retorna estatísticas da persistência assíncrona em lote (Web Worker IndexedDB + SQLite WAL)
   */
  public getPersistenceStats(): JournalPersistenceStats {
    return journalPersistenceManager.getStats();
  }

  /**
   * Força o flush imediato do lote pendente de 500ms para IndexedDB / SQLite
   */
  public async flushPersistence(): Promise<JournalPersistenceStats> {
    return journalPersistenceManager.flushNow();
  }

  /**
   * Configura parâmetros do gerenciador de persistência assíncrona (debounceMs, customBatchSink, etc.)
   */
  public configurePersistence(options: {
    debounceMs?: number;
    maxWaitMs?: number;
    maxBatchSize?: number;
    sqliteSyncEnabled?: boolean;
    customBatchSink?: CustomBatchSinkHandler | null;
  }): void {
    journalPersistenceManager.configure(options);
  }

  /**
   * Inscreve um listener nas estatísticas de flush assíncrono em lote
   */
  public subscribePersistenceStats(callback: (stats: JournalPersistenceStats) => void): () => void {
    return journalPersistenceManager.subscribeFlushStats(callback);
  }

  /**
   * Executa a Compactação Colunar (TJC1_DEFLATE) e Agregação Diária Imutável UTC (Daily Rollup)
   * sobre um conjunto de registros (ou sobre o histórico atual), pré-consolidando PnL diário,
   * Sharpe, Sortino e Drawdown para consultas de longo prazo (1Y/ALL) em tempo constante O(1).
   */
  public runColdTierCompaction(
    recordsToCompact: TradeJournalRecord[] = this.records,
    initialCapital = DEFAULT_INITIAL_CAPITAL,
    options?: { includeColumnarArchive?: boolean; referenceNowMs?: number }
  ): ColdTierCompactionReport {
    const report = ColdTierCompactionEngine.buildDailyRollups(
      recordsToCompact,
      initialCapital,
      options
    );
    this.dailyRollupsMap.clear();
    for (const rollup of report.rollups) {
      this.dailyRollupsMap.set(`${rollup.dateUtc}__${rollup.mode}`, rollup);
    }
    this.lastCompactionReport = report;
    return report;
  }

  /**
   * Retorna os snapshots de agregação diária pré-consolidados (Daily Rollup Table)
   */
  public getDailyRollups(): DailyRollupSnapshot[] {
    if (this.dailyRollupsMap.size === 0 && this.records.length > 0) {
      this.runColdTierCompaction(this.records, DEFAULT_INITIAL_CAPITAL, { includeColumnarArchive: true });
    }
    return Array.from(this.dailyRollupsMap.values()).sort((a, b) =>
      a.dateUtc.localeCompare(b.dateUtc)
    );
  }

  /**
   * Retorna o último relatório de compactação colunar (TJC1_DEFLATE)
   */
  public getLastCompactionReport(): ColdTierCompactionReport | null {
    return this.lastCompactionReport;
  }

  /**
   * Calcula em tempo constante O(1) (em relação ao número de trades) as métricas e a curva
   * de patrimônio para janelas de longo prazo (30D, 90D, 1Y, ALL) usando a Daily Rollup Table.
   */
  public getLongHorizonMetricsO1(
    horizon: LongHorizonWindow = "ALL",
    mode: "all" | "live" | "paper" = "all",
    initialCapital = DEFAULT_INITIAL_CAPITAL
  ): PerformanceMetrics {
    if (horizon === "LIVE") {
      const filtered = this.getFilteredRecords({ mode });
      return this.calculateMetrics(filtered, initialCapital);
    }
    const rollups = this.getDailyRollups();
    return ColdTierCompactionEngine.computeMetricsFromDailyRollups(rollups, {
      horizon,
      mode,
      initialCapital,
    });
  }

  /**
   * Atualiza incrementalmente em O(1) o snapshot diário UTC quando um novo trade é registrado em tempo real
   */
  private updateIncrementalDailyRollup(record: TradeJournalRecord): void {
    const dateUtc = toUtcDateKey(record.exitTimestampMs);
    const mode = record.mode === "live" ? "live" : "paper";
    const key = `${dateUtc}__${mode}`;
    const existing = this.dailyRollupsMap.get(key);
    const fees = addExactUsd(record.commissionFeesUsd || 0, record.spreadCostUsd || 0, 4);
    const g = record.netGainPercent || 0;

    if (!existing) {
      const openingEquity = 1000;
      const closingEquity = addExactUsd(openingEquity, record.netPnl, 2);
      const hwm = Math.max(openingEquity, closingEquity);
      const ddPct = hwm > 0 ? ((hwm - closingEquity) / hwm) * 100 : 0;

      this.dailyRollupsMap.set(key, {
        dateUtc,
        mode,
        totalTrades: 1,
        winningTrades: record.netPnl > 0 ? 1 : 0,
        losingTrades: record.netPnl < 0 ? 1 : 0,
        grossPnl: fromMicroUnits(toMicroUnits(record.grossPnl), 2),
        netPnl: fromMicroUnits(toMicroUnits(record.netPnl), 2),
        totalFeesUsd: fromMicroUnits(toMicroUnits(fees), 2),
        totalInvestedUsd: fromMicroUnits(toMicroUnits(record.totalInvested || 0), 2),
        sumGainPct: Number(g.toFixed(4)),
        sumGainPctSq: Number((g * g).toFixed(4)),
        sumDownsidePctSq: Number((g < 0 ? g * g : 0).toFixed(4)),
        openingEquity,
        closingEquity,
        highWaterMarkEquity: hwm,
        maxIntraDayDrawdownPct: Number(ddPct.toFixed(2)),
        sharpeEstimate: 0,
        sortinoEstimate: 0,
        isImmutableUtcClosed: dateUtc < toUtcDateKey(Date.now()),
        codec: "TJC1_DEFLATE",
        rawBytes: 0,
        compactedBytes: 0,
        compressionRatio: 1.0,
        updatedAtMs: Date.now(),
      });
      return;
    }

    existing.totalTrades += 1;
    if (record.netPnl > 0) existing.winningTrades += 1;
    else if (record.netPnl < 0) existing.losingTrades += 1;
    existing.grossPnl = addExactUsd(existing.grossPnl, record.grossPnl, 2);
    existing.netPnl = addExactUsd(existing.netPnl, record.netPnl, 2);
    existing.totalFeesUsd = addExactUsd(existing.totalFeesUsd, fees, 2);
    existing.totalInvestedUsd = addExactUsd(
      existing.totalInvestedUsd,
      record.totalInvested || 0,
      2
    );
    existing.sumGainPct = Number((existing.sumGainPct + g).toFixed(4));
    existing.sumGainPctSq = Number((existing.sumGainPctSq + g * g).toFixed(4));
    if (g < 0) {
      existing.sumDownsidePctSq = Number((existing.sumDownsidePctSq + g * g).toFixed(4));
    }
    existing.closingEquity = addExactUsd(existing.openingEquity, existing.netPnl, 2);
    if (existing.closingEquity > existing.highWaterMarkEquity) {
      existing.highWaterMarkEquity = existing.closingEquity;
    }
    const ddPct =
      existing.highWaterMarkEquity > 0
        ? ((existing.highWaterMarkEquity - existing.closingEquity) /
            existing.highWaterMarkEquity) *
          100
        : 0;
    if (ddPct > existing.maxIntraDayDrawdownPct) {
      existing.maxIntraDayDrawdownPct = Number(ddPct.toFixed(2));
    }

    const mean = existing.sumGainPct / existing.totalTrades;
    const variance = Math.max(0, existing.sumGainPctSq / existing.totalTrades - mean * mean);
    const stdDev = Math.sqrt(variance);
    existing.sharpeEstimate =
      stdDev > 0
        ? Number(((mean / stdDev) * Math.sqrt(existing.totalTrades)).toFixed(2))
        : 0;
    existing.updatedAtMs = Date.now();
  }

  /**
   * Inscreve um listener específico para eventos de execução em tempo real (TP/SL/Parciais)
   */
  public subscribeExecutionEvents(
    callback: (record: TradeJournalRecord, event: BotExecutionEventPayload) => void
  ): () => void {
    this.executionEventListeners.push(callback);
    return () => {
      this.executionEventListeners = this.executionEventListeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Registra a conclusão de uma operação e calcula todas as métricas analíticas.
   */
  public recordTrade(
    trade: {
      id?: string;
      botId?: string;
      botName?: string;
      symbol: string;
      side?: "BUY" | "SELL";
      mode?: "live" | "paper";
      strategy?: string;
      source?: ExecutionEventSource;
      triggerType?: ExecutionTriggerType;
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
    },
    internalOptions?: { skipChannelBroadcast?: boolean; originEvent?: BotExecutionEventPayload }
  ): TradeJournalRecord {
    // Lookup O(1) via Map hash (elimina varredura linear Array.find O(N))
    if (trade.id) {
      const existing = this.recordsById.get(trade.id);
      if (existing) {
        return existing;
      }
      this.processedEventIds.add(trade.id);
    }

    const side = trade.side || "BUY";
    const mode = trade.mode || "paper";
    const entryPrice = Number.isFinite(trade.entryPrice) ? trade.entryPrice : 0;
    const exitPrice = Number.isFinite(trade.exitPrice) ? trade.exitPrice : 0;
    const quantity = Number.isFinite(trade.quantity) ? trade.quantity : 0;

    // Aritmética de Ponto Fixo em Micro-Unidades (1e8) para eliminar deriva IEEE-754
    const totalInvested = mulExactUsd(entryPrice, quantity, 4);
    const totalReturned = mulExactUsd(exitPrice, quantity, 4);
    const grossPnl = subExactUsd(totalReturned, totalInvested, 4);
    const gainPercent = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;

    // Rastreamento e cálculo de MAE e MFE
    const lowestPrice = Math.min(trade.lowestPrice ?? entryPrice, entryPrice, exitPrice);
    const highestPrice = Math.max(trade.highestPrice ?? entryPrice, entryPrice, exitPrice);

    const maePrice = lowestPrice;
    const maePercent = entryPrice > 0 ? ((lowestPrice - entryPrice) / entryPrice) * 100 : 0; // valor <= 0
    const mfePrice = highestPrice;
    const mfePercent = entryPrice > 0 ? ((highestPrice - entryPrice) / entryPrice) * 100 : 0; // valor >= 0

    // Fricção de taxas e spread calculada em micro-unidades exatas
    const commissionRate = trade.commissionRate ?? 0.001; // Padrão Binance Spot 0.10%
    const spreadPct = trade.spreadPercent ?? 0.03;       // Spread típico 0.03%
    const totalTurnover = addExactUsd(totalInvested, totalReturned, 4);
    const commissionFeesUsd = mulExactUsd(totalTurnover, commissionRate, 4);
    const spreadCostUsd = mulExactUsd(totalTurnover, spreadPct / 200, 4); // Meio spread na entrada e saída
    const totalFrictionUsd = addExactUsd(commissionFeesUsd, spreadCostUsd, 4);
    const netPnl = subExactUsd(grossPnl, totalFrictionUsd, 4);
    const netGainPercent = totalInvested > 0 ? (netPnl / totalInvested) * 100 : 0;

    // Temporalidade
    const nowMs = Date.now();
    const exitTimestampMs = trade.exitTimestampMs || nowMs;
    const entryTimestampMs = trade.entryTimestampMs || (trade.entryTime ? new Date(trade.entryTime).getTime() : exitTimestampMs - 60000);
    const durationMs = Math.max(1000, exitTimestampMs - entryTimestampMs);
    const durationMinutes = parseFloat((durationMs / 60000).toFixed(2));
    const durationFormatted = this.formatDuration(durationMs);

    const resolvedTriggerType: ExecutionTriggerType =
      trade.triggerType ||
      (trade.exitReason?.toUpperCase().includes("PARTIAL") || trade.exitReason?.toUpperCase().includes("TP1") || trade.exitReason?.toUpperCase().includes("TP2")
        ? "PARTIAL_TAKE_PROFIT"
        : trade.exitReason?.toUpperCase().includes("TRAILING")
        ? "TRAILING_STOP"
        : trade.exitReason?.toUpperCase().includes("STOP") || trade.exitReason?.toUpperCase().includes("SL")
        ? "STOP_LOSS"
        : trade.exitReason?.toUpperCase().includes("TIME")
        ? "TIME_EXPIRED"
        : trade.exitReason?.toUpperCase().includes("MANUAL")
        ? "MANUAL_CLOSE"
        : "TAKE_PROFIT");

    const resolvedSource: ExecutionEventSource =
      trade.source ||
      (trade.botId?.startsWith("direct-") || trade.botName?.toLowerCase().includes("direct")
        ? "DIRECT_AI_TRADE"
        : "LIVE_FLEET");

    const record: TradeJournalRecord = {
      id: trade.id || `tj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      botId: trade.botId || "manual_or_bot",
      botName: trade.botName || "Trading Bot",
      symbol: trade.symbol.toUpperCase(),
      side,
      mode,
      strategy: trade.strategy || "Quantitative Strategy",
      source: resolvedSource,
      triggerType: resolvedTriggerType,
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

    this.processedEventIds.add(record.id);
    this.recordsById.set(record.id, record);
    this.lastEventTimestamp = exitTimestampMs;
    this.lastEventSource = resolvedSource;
    this.lastTriggerType = resolvedTriggerType;

    this.records.unshift(record);
    // Suporta históricos > 1.000+ execuções em memória (até MAX_IN_MEMORY_RECORDS = 5.000)
    // sem serialização JSON síncrona na Main Thread
    if (this.records.length > MAX_IN_MEMORY_RECORDS) {
      const removed = this.records.pop();
      if (removed?.id) this.recordsById.delete(removed.id);
    }

    this.scheduleAsyncRecordPersistence(record);
    this.updateIncrementalDailyRollup(record);
    this.notifyListeners();

    const effectiveEvent: BotExecutionEventPayload = internalOptions?.originEvent || {
      eventId: record.id,
      id: record.id,
      source: resolvedSource,
      triggerType: resolvedTriggerType,
      botId: record.botId,
      botName: record.botName,
      symbol: record.symbol,
      side: record.side,
      mode: record.mode,
      strategy: record.strategy,
      entryPrice: record.entryPrice,
      exitPrice: record.exitPrice,
      quantity: record.quantity,
      highestPrice: record.highestPrice,
      lowestPrice: record.lowestPrice,
      entryTime: record.entryTime,
      exitTime: record.exitTime,
      entryTimestampMs: record.entryTimestampMs,
      exitTimestampMs: record.exitTimestampMs,
      exitReason: record.exitReason,
      notes: record.notes,
    };

    this.notifyExecutionEventListeners(record, effectiveEvent);
    this.emitRealtimeSignals(record, effectiveEvent, internalOptions?.skipChannelBroadcast === true);

    return record;
  }

  /**
   * Calcula as métricas agregadas de performance para os registros (ou conjunto filtrado).
   */
  public calculateMetrics(recordsToAnalyze: TradeJournalRecord[] = this.records, initialEquity: number = DEFAULT_INITIAL_CAPITAL): PerformanceMetrics {
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

    // Acumuladores inteiros em micro-unidades (1e8) para zerar deriva de ponto flutuante IEEE-754
    let totalGrossPnlMicro = 0;
    let totalNetPnlMicro = 0;
    let totalFeesMicro = 0;
    let grossWinsMicro = 0;
    let grossLossesMicro = 0;
    let sumMae = 0;
    let sumMfe = 0;
    let sumDurationMin = 0;

    // Para a curva de patrimônio, ordenamos cronologicamente (do mais antigo ao mais novo)
    const chronological = [...list].sort((a, b) => a.exitTimestampMs - b.exitTimestampMs);
    const totalTrades = chronological.length;

    // Reutiliza Float64Array contíguo (redimensiona apenas se exceder a capacidade) para evitar GC spikes
    if (this.returnsTypedBuffer.length < totalTrades) {
      this.returnsTypedBuffer = new Float64Array(Math.max(totalTrades * 2, MAX_IN_MEMORY_RECORDS));
    }
    const returnsBuffer = this.returnsTypedBuffer;
    let sumReturns = 0;
    let sumDownsideSq = 0;
    let downsideCount = 0;

    const initialEquityMicro = toMicroUnits(initialEquity);
    let cumulativePnlMicro = 0;
    let peakEquityMicro = initialEquityMicro;
    let maxDrawdown = 0;

    const equityCurve: PerformanceMetrics["equityCurve"] = new Array(totalTrades + 1);
    equityCurve[0] = {
      timestamp: chronological[0]?.entryTimestampMs || Date.now(),
      tradeIndex: 0,
      netPnl: 0,
      cumulativeNetPnl: 0,
      equity: initialEquity,
    };

    for (let i = 0; i < totalTrades; i++) {
      const t = chronological[i];
      const grossMicro = toMicroUnits(t.grossPnl);
      const netMicro = toMicroUnits(t.netPnl);
      const feeMicro = toMicroUnits(t.commissionFeesUsd) + toMicroUnits(t.spreadCostUsd);

      totalGrossPnlMicro += grossMicro;
      totalNetPnlMicro += netMicro;
      totalFeesMicro += feeMicro;
      sumMae += t.maePercent;
      sumMfe += t.mfePercent;
      sumDurationMin += t.durationMinutes;

      const retPct = t.netGainPercent / 100;
      returnsBuffer[i] = retPct;
      sumReturns += retPct;

      if (t.netPnl > 0.001) {
        winTrades++;
        grossWinsMicro += netMicro;
      } else if (t.netPnl < -0.001) {
        lossTrades++;
        grossLossesMicro += Math.abs(netMicro);
        sumDownsideSq += retPct * retPct;
        downsideCount++;
      } else {
        breakevenTrades++;
      }

      cumulativePnlMicro += netMicro;
      const currentEquityMicro = initialEquityMicro + cumulativePnlMicro;
      if (currentEquityMicro > peakEquityMicro) {
        peakEquityMicro = currentEquityMicro;
      }
      const dd =
        peakEquityMicro > 0
          ? ((peakEquityMicro - currentEquityMicro) / peakEquityMicro) * 100
          : 0;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
      }

      equityCurve[i + 1] = {
        timestamp: t.exitTimestampMs,
        tradeIndex: i + 1,
        netPnl: t.netPnl,
        cumulativeNetPnl: fromMicroUnits(cumulativePnlMicro, 4),
        equity: fromMicroUnits(currentEquityMicro, 4),
      };
    }

    const totalGrossPnl = fromMicroUnits(totalGrossPnlMicro, 4);
    const totalNetPnl = fromMicroUnits(totalNetPnlMicro, 4);
    const totalFees = fromMicroUnits(totalFeesMicro, 4);
    const grossWins = fromMicroUnits(grossWinsMicro, 4);
    const grossLosses = fromMicroUnits(grossLossesMicro, 4);

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

    // Sharpe Ratio e Sortino Ratio sobre Float64Array contíguo (zero alocações de arrays intermediários)
    let sharpeRatio = 0;
    let sortinoRatio = 0;
    if (totalTrades > 1) {
      const meanReturn = sumReturns / totalTrades;
      let sumSqDiff = 0;
      for (let i = 0; i < totalTrades; i++) {
        const diff = returnsBuffer[i] - meanReturn;
        sumSqDiff += diff * diff;
      }
      const variance = sumSqDiff / (totalTrades - 1);
      const stdDev = Math.sqrt(variance);

      // Assumindo ~252 períodos operacionais
      if (stdDev > 0) {
        sharpeRatio = parseFloat(((meanReturn / stdDev) * Math.sqrt(252)).toFixed(2));
      }

      const downsideVar = downsideCount > 0 ? sumDownsideSq / downsideCount : 0;
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
    this.recordsById.clear();
    this.dailyRollupsMap.clear();
    this.lastCompactionReport = null;
    this.processedEventIds.clear();
    this.lastEventTimestamp = null;
    this.lastEventSource = null;
    this.lastTriggerType = null;
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignora erro de quota/permissão
      }
    }
    void journalPersistenceManager.clearAllPersisted();
    this.notifyListeners();
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type: "JOURNAL_CLEAR" });
      } catch {
        // Ignora erro se canal estiver fechado
      }
    }
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

  /**
   * Enfileira um único registro para escrita assíncrona em lote (debounced batch write 500ms)
   * no IndexedDB e SQLite (/api/journal/sync) via Web Worker dedicado, evitando serializações
   * JSON.stringify síncronas na thread principal.
   */
  private scheduleAsyncRecordPersistence(record: TradeJournalRecord): void {
    journalPersistenceManager.enqueueRecord(record);
  }

  /**
   * Hidrata de forma assíncrona os registros persistidos no IndexedDB e SQLite (/api/journal/sync),
   * mesclando de forma idempotente com registros em memória.
   */
  public async hydrateFromAsyncStorage(): Promise<number> {
    if (typeof window === "undefined") return 0;
    try {
      const persisted = await journalPersistenceManager.loadPersistedRecords(MAX_IN_MEMORY_RECORDS);
      if (!Array.isArray(persisted) || persisted.length === 0) return 0;

      let added = 0;
      for (const rec of persisted) {
        if (rec?.id && !this.processedEventIds.has(rec.id) && !this.recordsById.has(rec.id)) {
          this.processedEventIds.add(rec.id);
          this.recordsById.set(rec.id, rec);
          this.records.push(rec);
          added++;
        }
      }

      if (added > 0) {
        this.records.sort((a, b) => (b.exitTimestampMs || 0) - (a.exitTimestampMs || 0));
        if (this.records.length > MAX_IN_MEMORY_RECORDS) {
          this.records = this.records.slice(0, MAX_IN_MEMORY_RECORDS);
        }
        this.notifyListeners();
      }
      return added;
    } catch {
      return 0;
    }
  }

  private loadFromStorage(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const data = window.localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.records = parsed;
          for (const rec of this.records) {
            if (rec?.id) {
              this.processedEventIds.add(rec.id);
              this.recordsById.set(rec.id, rec);
            }
          }
          // Migra o snapshot legado de localStorage para o pipeline assíncrono IndexedDB + SQLite
          journalPersistenceManager.enqueueBatch(this.records);
          try {
            window.localStorage.removeItem(STORAGE_KEY);
          } catch {
            // Ignora erro
          }
        }
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

  private notifyExecutionEventListeners(
    record: TradeJournalRecord,
    event: BotExecutionEventPayload
  ): void {
    for (const listener of this.executionEventListeners) {
      try {
        listener(record, event);
      } catch (err) {
        console.error("[TradeJournalEngine] Erro no executionEventListener:", err);
      }
    }
  }

  private emitRealtimeSignals(
    record: TradeJournalRecord,
    event: BotExecutionEventPayload,
    skipChannelBroadcast: boolean = false
  ): void {
    if (!skipChannelBroadcast && this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: "BOT_EXECUTION_RECORDED",
          record,
          event,
        });
      } catch {
        // Ignora erro se o BroadcastChannel estiver indisponível ou fechado
      }
    }

    const eventTarget: EventTarget | null =
      typeof window !== "undefined"
        ? window
        : typeof globalThis !== "undefined" && typeof globalThis.dispatchEvent === "function"
          ? globalThis
          : null;

    if (eventTarget && typeof CustomEvent !== "undefined") {
      try {
        eventTarget.dispatchEvent(
          new CustomEvent(TRADE_EXECUTION_CUSTOM_EVENT, {
            detail: {
              record,
              event,
              __internalDispatched: true,
            },
          })
        );
        eventTarget.dispatchEvent(
          new CustomEvent(JOURNAL_UPDATED_CUSTOM_EVENT, {
            detail: {
              records: this.getAllRecords(),
              latestRecord: record,
              event,
            },
          })
        );
      } catch {
        // Ignora erro em runtime sem suporte a CustomEvent
      }
    }
  }
}

export const tradeJournalEngine = TradeJournalEngine.getInstance();
