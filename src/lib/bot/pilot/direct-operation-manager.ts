import {
  MarketOpportunitySelector,
  EvaluatedOpportunity,
  TriggerCondition,
  RankedOpportunitySummary,
  AiThoughtStep,
  OrderFlowMetrics,
  TargetRecalibrationState,
} from './market-opportunity-selector';
import { ExchangeMetadataService, SymbolFilters } from './exchange-metadata-service';
import { PilotTradeValidator, ValidationResult } from './pilot-trade-validator';
import { EnvironmentCleanupService } from './environment-cleanup-service';
import { CurrencyPairNormalizer } from './currency-pair-normalizer';
import { PreciseMath } from './precise-math';
import { PilotOrderExecutor, BinanceCredentials } from './pilot-order-executor';
import { getOrderBookAnalysis } from '@/lib/bot/order-book-cache';
import { GraduatedCircuitBreaker } from './chaos-test-harness';
import type { SpoofingAlert } from '@/lib/order-book-imbalance';
import { LockFreeSPSCQueue } from '@/lib/performance/lock-free-spsc-queue';
import { tradeJournalEngine, type ExecutionTriggerType } from '@/lib/journal/trade-journal-engine';
import { isTradableBinanceSpotSymbol } from '@/lib/binance-spot-sync';
import { BINANCE_RECV_WINDOW_MS, getBinanceTimestamp } from '@/lib/binance/time';

export interface DirectOperationSession {
  id: string;
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  investedAmountUsd: number;
  durationMinutes: number;
  startTime: number;
  endTime: number;
  entryPrice: number;
  targetPrice: number;
  stopLossPrice: number;
  quantity: number;
  notionalUsd: number;
  riskUsd: number;
  rewardRiskRatio: number;
  aiScore: number;
  mode: 'live' | 'paper';
  status: 'WAITING_TRIGGER' | 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  closeReason?: 'TIME_EXPIRED' | 'TARGET_REACHED' | 'STOP_LOSS' | 'MANUAL_CLOSE' | 'TRIGGER_EXPIRED' | 'RADAR_CANCELLED' | 'TRAILING_STOP';
  currentPrice: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPercent: number;
  realizedPnlUsd?: number;
  realizedPnlPercent?: number;
  feeDeductedUsd?: number;
  rationale: string;
  binanceOrderId?: string;
  binanceClientOrderId?: string;
  closeBinanceOrderId?: string;
  executedQuantity?: number;
  credentials?: BinanceCredentials;
  triggerCondition?: TriggerCondition;
  strategyChosen?: string;
  targetEntryPrice?: number;
  radarExpiresAt?: number;
  isExecutingTrigger?: boolean;
  topRanked?: RankedOpportunitySummary[];
  isCooldownApplied?: boolean;

  // Fase 1: Escada de Parciais 50/50 & Trailing Stop Parabólico
  partialTargetPrice?: number;
  isPartialProfitTaken?: boolean;
  partialQuantityExecuted?: number;
  partialRealizedPnlUsd?: number;
  breakEvenProtected?: boolean;
  trailingStopPrice?: number;
  highestPriceReached?: number;
  lowestPriceReached?: number;

  // Fase 2 & 3: IA Thought Stream & Microestrutura L2
  aiThoughtStream?: AiThoughtStep[];
  orderFlowMetrics?: OrderFlowMetrics;

  // Próxima Geração: Escada Tripla 33/33/34
  tp1Price?: number;
  tp2Price?: number;
  tp3Price?: number;
  isTp1Taken?: boolean;
  isTp2Taken?: boolean;
  tp1QuantityExecuted?: number;
  tp2QuantityExecuted?: number;
  tp1RealizedPnlUsd?: number;
  tp2RealizedPnlUsd?: number;
  tp1ExecutedPrice?: number;
  tp1ExecutedAt?: number;
  tp2ExecutedPrice?: number;
  tp2ExecutedAt?: number;
  closedAt?: number;

  // Próxima Geração: Regime, MTF, Sizing & Telemetria
  marketRegime?: string;
  multiTimeframeSummary?: string;
  sentimentScore?: number;
  volatilitySizingUsd?: number;
  executionLatencyMs?: number;
  priceHistory?: { price: number; timestamp: number }[];
  postTradeJournal?: TradeJournalEntry;
  targetRecalibration?: TargetRecalibrationState;

  // Trailing Stop Agressivo com Base em MAE Residual
  isAggressiveBreakEvenActive?: boolean;
  breakEvenOffsetPct?: number;
  initialMaeAtTp1Pct?: number;

  // Exclusão Temporária de Liquidez Residual em Livros Assimétricos (Order Book Skew Gate)
  isSkewGateActive?: boolean;
  orderBookSkewRatio?: number;
  tp1LiquidationPct?: number;
  injectedOrderBookRatio?: number;

  // Filtro de Desaceleração de Momentum (CVD Exhaustion Filter no TP2)
  isCvdExhaustionTriggered?: boolean;
  cvdDeltaAtTp2Pct?: number;
  tp2AnticipatedReason?: string;
  injectedCvdDeltaPct?: number;

  // Blindagem de Lucro Mínimo Absoluto no Runner (TP3 Hard Floor)
  isTp3HardFloorActive?: boolean;
  tp3HardFloorPrice?: number;
  tp3HardFloorPct?: number;

  // Aceleração Dinâmica de Expansão do Runner por ATR/Volume Spike (Runner Momentum Acceleration)
  isRunnerAccelerationActive?: boolean;
  isRunnerClimaxTighteningActive?: boolean;
  runnerTrailingFactor?: number; // 0.992 (padrão 0.8%), 0.988 (aceleração/folga 1.2%), 0.995 (clímax/aperto 0.5%)
  runnerVolumeRatio?: number;
  runnerAccelerationReason?: string;

  // Liquidity Spoofing Guard no Radar Sniper
  isSpoofingProtectionTriggered?: boolean;
  radarPausedUntil?: number;
  spoofingEvasionsCount?: number;
  injectedSpoofingAlert?: SpoofingAlert | null;
  spoofingEvents?: SpoofingEvasionEvent[];
}

export interface SpoofingEvasionEvent {
  timestamp: number;
  price: number;
  dropPct?: number;
  side?: 'BID' | 'ASK' | 'NONE' | 'BUY' | 'SELL';
  actionTaken?: string;
}

export interface TradeJournalEntry {
  id: string;
  sessionId: string;
  symbol: string;
  mode: 'live' | 'paper';
  entryPrice: number;
  exitPrice: number;
  notionalUsd: number;
  realizedPnlUsd: number;
  realizedPnlPercent: number;
  feeDeductedUsd: number;
  durationSeconds: number;
  closeReason: string;
  strategy?: string;
  marketRegime?: string;
  // Métricas de Excursão Institucionais
  mfePrice: number;
  mfePercent: number;
  maePrice: number;
  maePercent: number;
  exitEfficiencyPct: number;
  // Reflexão da IA e classificação
  aiReflection: string;
  rating: 'OPTIMAL' | 'ACCEPTABLE' | 'SUBOPTIMAL' | 'DEFENSIVE_EXIT';
  lessonsLearned: string[];
  timestamp: number;
  // Order Book Skew Gate
  isSkewGateActive?: boolean;
  orderBookSkewRatio?: number;
  // CVD Exhaustion Filter
  isCvdExhaustionTriggered?: boolean;
  cvdDeltaAtTp2Pct?: number;
  tp2AnticipatedReason?: string;
  // Blindagem de Lucro Mínimo Absoluto no Runner (TP3 Hard Floor)
  isTp3HardFloorActive?: boolean;
  tp3HardFloorPrice?: number;
  tp3HardFloorPct?: number;
  // Aceleração Dinâmica de Expansão do Runner por ATR/Volume Spike
  isRunnerAccelerationActive?: boolean;
  isRunnerClimaxTighteningActive?: boolean;
  runnerTrailingFactor?: number;
  runnerVolumeRatio?: number;
  runnerAccelerationReason?: string;
}

// Armazenamento em memória do Diário de Trades
const tradeJournalMemory: TradeJournalEntry[] = [];

// Armazenamento em memória de sessões ativas
const activeSessions = new Map<string, DirectOperationSession>();

/**
 * Monitor e Guardião de Latência de Execução e Slippage Drift
 */
export class ExecutionLatencyGuard {
  private static readonly MAX_LATENCY_MS = 1200;
  private static readonly MAX_SLIPPAGE_PCT = 0.0015; // 0.15%

  public static auditExecution(
    signalTime: number,
    executionTime: number,
    expectedPrice: number,
    executedPrice: number
  ): { latencyMs: number; slippagePct: number; isWithinSla: boolean; warning?: string } {
    const latencyMs = Math.max(0, executionTime - signalTime);
    const slippagePct = expectedPrice > 0 ? Math.abs(executedPrice - expectedPrice) / expectedPrice : 0;
    const latencyBreached = latencyMs > this.MAX_LATENCY_MS;
    const slippageBreached = slippagePct > this.MAX_SLIPPAGE_PCT;
    const isWithinSla = !latencyBreached && !slippageBreached;

    let warning: string | undefined;
    if (latencyBreached) {
      warning = `Latência de execução elevada (${latencyMs}ms > ${this.MAX_LATENCY_MS}ms).`;
    }
    if (slippageBreached) {
      warning = (warning ? `${warning} ` : "") + `Slippage de book excessivo (${(slippagePct * 100).toFixed(3)}% > 0.15%).`;
    }

    return { latencyMs, slippagePct: PreciseMath.roundDown(slippagePct * 100, 3), isWithinSla, warning };
  }
}

/**
 * Monitor de Rate Limits da Exchange com Throttling Preventivo
 */
export class RateLimitMonitor {
  private static usedWeight1m = 0;
  private static lastUpdated = Date.now();
  private static readonly WEIGHT_CAP = 1200;

  public static recordRequest(weight = 1): void {
    const now = Date.now();
    if (now - this.lastUpdated > 60_000) {
      this.usedWeight1m = 0;
      this.lastUpdated = now;
    }
    this.usedWeight1m += weight;
  }

  public static getRateLimitStatus(): { usedWeight1m: number; usageRatio: number; shouldThrottle: boolean } {
    const now = Date.now();
    if (now - this.lastUpdated > 60_000) {
      this.usedWeight1m = 0;
      this.lastUpdated = now;
    }
    const usageRatio = PreciseMath.roundDown(this.usedWeight1m / this.WEIGHT_CAP, 2);
    const shouldThrottle = usageRatio >= 0.8;
    return { usedWeight1m: this.usedWeight1m, usageRatio, shouldThrottle };
  }
}

/**
 * Despachante Assíncrono de Notificações Telegram / Webhook
 */
export class TelegramNotifier {
  private static botToken = process.env.TELEGRAM_BOT_TOKEN;
  private static chatId = process.env.TELEGRAM_CHAT_ID;

  public static async notify(message: string): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      return false;
    }
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: "Markdown",
        }),
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export class DirectOperationManager {
  // Fila circular Lock-Free SPSC para despacho atômico de ordens com zero alocações
  private static atomicOrderQueue: LockFreeSPSCQueue | null = null;
  private static readonly scratchOrderSlot = new Float64Array(8);

  /**
   * Inicializa ou conecta a fila atômica Lock-Free SPSC para ordens
   */
  public static initAtomicOrderQueue(capacity = 256): LockFreeSPSCQueue {
    this.atomicOrderQueue = LockFreeSPSCQueue.create(capacity, 8);
    return this.atomicOrderQueue;
  }

  /**
   * Retorna a fila atômica de ordens atual
   */
  public static getAtomicOrderQueue(): LockFreeSPSCQueue | null {
    return this.atomicOrderQueue;
  }

  /**
   * Enfileira uma ordem de compra ou venda na fila atômica em tempo O(1) sem locks.
   * Stride 8: [0: idNumeric, 1: symbolHash, 2: side, 3: quantity, 4: price, 5: timestamp, 6: status, 7: notional]
   */
  public static enqueueAtomicOrder(payload: {
    idNumeric: number;
    symbolHash: number;
    side: 1 | -1;
    quantity: number;
    price: number;
    timestamp?: number;
  }): boolean {
    if (!this.atomicOrderQueue) {
      this.initAtomicOrderQueue();
    }
    const slot = this.scratchOrderSlot;
    slot[0] = payload.idNumeric;
    slot[1] = payload.symbolHash;
    slot[2] = payload.side;
    slot[3] = payload.quantity;
    slot[4] = payload.price;
    slot[5] = payload.timestamp ?? Date.now();
    slot[6] = 0; // PENDING
    slot[7] = payload.quantity * payload.price;

    return this.atomicOrderQueue!.push(slot);
  }

  /**
   * Drena ordens pendentes da fila atômica em lote sem alocação transitória
   */
  public static drainAtomicOrders(
    maxCount = 32,
    onOrder?: (order: Float64Array) => void
  ): number {
    if (!this.atomicOrderQueue) return 0;
    return this.atomicOrderQueue.drain(maxCount, (data) => {
      if (onOrder) onOrder(data);
    });
  }

  // Histórico em memória de símbolos operados recentemente para rotação de ativos
  private static recentSymbolsHistory: { symbol: string; timestamp: number }[] = [];

  // Mock determinístico de Order Book Ratio para testes unitários e simulação de caos
  private static mockOrderBookRatios = new Map<string, number>();

  // Mock determinístico de CVD Delta para testes unitários e simulação de caos
  private static mockCvdDeltas = new Map<string, number>();

  /**
   * Configura ou limpa a razão mock Bid/Ask Depth para testes e simulação de caos
   */
  public static setMockOrderBookRatio(symbol: string, ratio: number | null): void {
    if (ratio === null) {
      this.mockOrderBookRatios.delete(symbol);
    } else {
      this.mockOrderBookRatios.set(symbol, ratio);
    }
  }

  /**
   * Configura ou limpa o mock de CVD Delta para testes e simulação de caos
   */
  public static setMockCvdDelta(symbol: string, delta: number | null): void {
    if (delta === null) {
      this.mockCvdDeltas.delete(symbol);
    } else {
      this.mockCvdDeltas.set(symbol, delta);
    }
  }

  // Mock determinístico de Runner Momentum Acceleration para testes unitários e simulação de caos
  private static mockRunnerSpikes = new Map<string, { isSpike: boolean; isExhausted: boolean; volumeRatio?: number }>();

  /**
   * Configura ou limpa o mock de Runner Momentum Spike para testes determinísticos
   */
  public static setMockRunnerSpike(
    symbol: string,
    mock: { isSpike: boolean; isExhausted: boolean; volumeRatio?: number } | null
  ): void {
    if (mock === null) {
      this.mockRunnerSpikes.delete(symbol);
    } else {
      this.mockRunnerSpikes.set(symbol, mock);
    }
  }

  // Registro global de eventos de evasão de spoofing para plotagem no gráfico principal
  private static globalSpoofingEvents: (SpoofingEvasionEvent & { symbol: string; id: string })[] = [];

  /**
   * Registra um evento de evasão de spoofing no histórico global
   */
  public static recordSpoofingEvasion(
    symbol: string,
    event: SpoofingEvasionEvent
  ): void {
    const id = `spoof-${symbol}-${event.timestamp}-${Math.random().toString(36).substring(2, 6)}`;
    this.globalSpoofingEvents.push({ ...event, symbol, id });
    if (this.globalSpoofingEvents.length > 200) {
      this.globalSpoofingEvents.shift();
    }
  }

  /**
   * Retorna os eventos de evasão de spoofing, opcionalmente filtrados por símbolo
   */
  public static getSpoofingEvents(symbol?: string): (SpoofingEvasionEvent & { symbol: string; id: string })[] {
    const results: (SpoofingEvasionEvent & { symbol: string; id: string })[] = [];
    const seen = new Set<string>();

    for (const ev of this.globalSpoofingEvents) {
      if (!symbol || ev.symbol === symbol) {
        const key = `${ev.symbol}-${ev.timestamp}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push(ev);
        }
      }
    }

    for (const s of activeSessions.values()) {
      if ((!symbol || s.symbol === symbol) && s.spoofingEvents) {
        for (const ev of s.spoofingEvents) {
          const key = `${s.symbol}-${ev.timestamp}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              ...ev,
              symbol: s.symbol,
              id: `session-spoof-${s.id}-${ev.timestamp}`,
            });
          }
        }
      }
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Limpa os eventos de spoofing (para testes unitários)
   */
  public static clearSpoofingEvents(): void {
    this.globalSpoofingEvents = [];
  }

  /**
   * Limpa todos os mocks estáticos configurados para testes unitários
   */
  public static resetMocks(): void {
    this.mockOrderBookRatios.clear();
    this.mockCvdDeltas.clear();
    this.mockRunnerSpikes.clear();
    this.clearSpoofingEvents();
  }

  /**
   * Audita o Momentum e Volume do Runner na janela de 1m via Binance Klines
   * Verifica se o candle de 1m recente apresenta amplitude volumétrica > 2.5x a média dos últimos 15 períodos
   * e fechamento acima da Upper Bollinger Band (2.0 stdDev dos últimos 15 períodos).
   * Detecta também exaustão volumétrica (volume recuando para < 1.5x média).
   */
  public static async auditRunnerMomentum(symbol: string): Promise<{
    isSpike: boolean;
    isExhausted: boolean;
    volumeRatio: number;
    upperBB: number;
    closePrice: number;
  }> {
    if (this.mockRunnerSpikes.has(symbol)) {
      const mock = this.mockRunnerSpikes.get(symbol)!;
      return {
        isSpike: mock.isSpike,
        isExhausted: mock.isExhausted,
        volumeRatio: mock.volumeRatio ?? (mock.isSpike ? 2.8 : 1.1),
        upperBB: 0,
        closePrice: 0,
      };
    }

    try {
      // Busca 16 klines de 1m: 15 anteriores para baseline e a última para teste de spike
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=16`;
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) {
        return { isSpike: false, isExhausted: false, volumeRatio: 1.0, upperBB: 0, closePrice: 0 };
      }
      const klines: any[] = await res.json();
      if (!Array.isArray(klines) || klines.length < 16) {
        return { isSpike: false, isExhausted: false, volumeRatio: 1.0, upperBB: 0, closePrice: 0 };
      }

      // 15 períodos de baseline: klines[0..14]
      let totalVol15 = 0;
      const closes15: number[] = [];

      for (let i = 0; i < 15; i++) {
        const v = parseFloat(klines[i][5]) || 0; // volume base
        const c = parseFloat(klines[i][4]) || 0; // close
        totalVol15 += v;
        closes15.push(c);
      }

      const avgVol15 = totalVol15 / 15;
      const meanClose15 = closes15.reduce((acc, c) => acc + c, 0) / 15;
      const variance15 = closes15.reduce((acc, c) => acc + Math.pow(c - meanClose15, 2), 0) / 15;
      const stdDev15 = Math.sqrt(variance15);
      const upperBB = meanClose15 + (2.0 * stdDev15);

      // Candle recente (último concluído/ativo): klines[15]
      const currentVol = parseFloat(klines[15][5]) || 0;
      const currentClose = parseFloat(klines[15][4]) || 0;
      const volumeRatio = avgVol15 > 0 ? (currentVol / avgVol15) : 1.0;

      const isSpike = volumeRatio > 2.5 && currentClose > upperBB;
      const isExhausted = volumeRatio < 1.5;

      return {
        isSpike,
        isExhausted,
        volumeRatio: PreciseMath.roundDown(volumeRatio, 2),
        upperBB: PreciseMath.roundDown(upperBB, 6),
        closePrice: currentClose,
      };
    } catch {
      return { isSpike: false, isExhausted: false, volumeRatio: 1.0, upperBB: 0, closePrice: 0 };
    }
  }

  /**
   * Audita o Delta Acumulado de Volume (CVD) dos últimos 5 minutos via Binance Klines
   * Retorna a variação percentual líquida de agressão compradora vs vendedora:
   * ((takerBuyQuoteVolume - takerSellQuoteVolume) / totalQuoteVolume) * 100
   * Valor negativo (< 0) indica exaustão de compradores / dominância de venda a mercado.
   */
  public static async auditCvdDelta5m(symbol: string): Promise<number> {
    if (this.mockCvdDeltas.has(symbol)) {
      return this.mockCvdDeltas.get(symbol)!;
    }

    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=5`;
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) {
        return 0; // Fallback neutro em caso de falha de rede/HTTP
      }
      const klines: any[] = await res.json();
      if (!Array.isArray(klines) || klines.length === 0) {
        return 0;
      }

      let totalQuoteVolume = 0;
      let totalTakerBuyQuoteVolume = 0;

      for (const k of klines) {
        // Índice 7: quote asset volume (volume total USDT)
        // Índice 10: taker buy quote asset volume (volume agressor comprador USDT)
        const quoteVol = parseFloat(k[7]) || 0;
        const takerBuyQuoteVol = parseFloat(k[10]) || 0;
        totalQuoteVolume += quoteVol;
        totalTakerBuyQuoteVolume += takerBuyQuoteVol;
      }

      const totalTakerSellQuoteVolume = Math.max(0, totalQuoteVolume - totalTakerBuyQuoteVolume);
      if (totalQuoteVolume <= 0) return 0;

      const netDeltaQuote = totalTakerBuyQuoteVolume - totalTakerSellQuoteVolume;
      const cvdDeltaPct = PreciseMath.roundDown((netDeltaQuote / totalQuoteVolume) * 100, 2);
      return cvdDeltaPct;
    } catch (err: any) {
      console.warn(`[DirectOperationManager] Falha não-bloqueante ao auditar CVD Delta 5m para ${symbol}: ${err.message}. Retornando neutro 0.`);
      return 0;
    }
  }

  /**
   * Recupera os símbolos operados dentro da janela de cooldown (padrão 30 minutos)
   */
  public static getCooldownSymbols(cooldownMs = 30 * 60 * 1000): string[] {
    const cutoff = Date.now() - cooldownMs;
    return this.recentSymbolsHistory
      .filter((h) => h.timestamp > cutoff)
      .map((h) => h.symbol);
  }

  /**
   * Registra um símbolo no histórico de rotação recente
   */
  public static recordSymbolExecution(symbol: string): void {
    this.recentSymbolsHistory = [
      { symbol, timestamp: Date.now() },
      ...this.recentSymbolsHistory.filter((h) => h.symbol !== symbol),
    ].slice(0, 20);
  }

  /**
   * Limpa histórico de cooldown (útil para testes ou reset manual)
   */
  public static clearCooldownHistory(): void {
    this.recentSymbolsHistory = [];
  }

  /**
   * Inicia uma nova Operação Direta com IA
   */
  public static async startOperation(params: {
    amount: number;
    durationMinutes: number;
    strategy?: string;
    mode?: 'live' | 'paper';
    binanceCredentials?: BinanceCredentials;
    overrideSymbol?: string;
  }): Promise<{ session: DirectOperationSession; validation: ValidationResult }> {
    const { amount, durationMinutes, strategy = 'AUTO', mode = 'paper', binanceCredentials, overrideSymbol } = params;

    // 1. Validação estrita de valor de investimento
    if (!Number.isFinite(amount) || amount < 11.00) {
      throw new Error('Valor mínimo para operação direta é $11.00 USD para cumprir o MIN_NOTIONAL da Binance com margem de segurança.');
    }
    if (amount > 500.00) {
      throw new Error('Valor máximo por operação direta é de $500.00 USD para preservação de capital.');
    }

    // 2. Sincronização de relógio da exchange e limpeza de travas
    const cleanupService = EnvironmentCleanupService.getInstance();
    await cleanupService.syncServerTime();

    // 3. Seleção inteligente do melhor ativo com rotação automática (Cooldown de 30 min)
    const sanitizedOverride =
      overrideSymbol && isTradableBinanceSpotSymbol(overrideSymbol)
        ? overrideSymbol.toUpperCase()
        : undefined;
    const cooldownSymbols = DirectOperationManager.getCooldownSymbols();
    const selector = MarketOpportunitySelector.getInstance();
    const opportunity: EvaluatedOpportunity = await selector.findBestOpportunity(
      amount,
      "https://api.binance.com",
      strategy,
      cooldownSymbols,
      sanitizedOverride
    );

    // Registra o símbolo selecionado para que a próxima operação priorize outro ativo
    DirectOperationManager.recordSymbolExecution(opportunity.symbol);

    // 4. Normalização de convenção de cotação cambial/cripto (ISO 4217 / Interbank)
    const normalized = CurrencyPairNormalizer.normalizeQuote({
      rawSymbol: opportunity.symbol,
      bidPrice: opportunity.marketData.bestBid,
      askPrice: opportunity.marketData.bestAsk,
    });

    if (normalized.isCrossed) {
      throw new Error(`[DirectOperationManager] Livro de ofertas cruzado detectado em ${opportunity.symbol}. Operação abortada.`);
    }

    // 5. Ingestão de filtros de microestrutura (exchangeInfo)
    const metadataService = ExchangeMetadataService.getInstance();
    const filters: SymbolFilters = await metadataService.getSymbolFilters(opportunity.symbol);

    // 6. Dimensionamento proporcional ao valor informado pelo usuário
    const entryPrice = opportunity.signal.suggestedPrice;
    const rawQty = amount / entryPrice;
    const quantizedQty = PreciseMath.quantizeLotDown(rawQty, filters.stepSize);
    const notionalUsd = PreciseMath.roundDown(quantizedQty * entryPrice, 2);

    // 7. Auto-cura de Stop Loss e garantia de R:R Líquido >= 1.80x contra atrito de comissões e tickSize
    const maxStopLossDist = entryPrice * 0.0175;
    if (entryPrice - opportunity.signal.stopLoss > maxStopLossDist) {
      opportunity.signal.stopLoss = metadataService.quantizePrice(
        Math.max(filters.tickSize, entryPrice - maxStopLossDist),
        filters
      );
    }
    const minSafeTakeProfit = PilotTradeValidator.calculateTargetTakeProfit(
      opportunity.signal.suggestedPrice,
      opportunity.signal.stopLoss,
      1.80,
      filters
    );
    if (opportunity.signal.takeProfit < minSafeTakeProfit) {
      opportunity.signal.takeProfit = minSafeTakeProfit;
    }

    // 8. Validação de risco através do PilotTradeValidator
    const validator = PilotTradeValidator.getInstance();
    const validation = await validator.validateSignal(
      opportunity.signal,
      amount,
      false,
      filters
    );

    if (!validation.valid || !validation.order) {
      throw new Error(`[DirectOperationManager] Falha na validação de risco: ${validation.rejectionReason}`);
    }

    // Validação mandatória de credenciais para modo real antes de qualquer agendamento ou execução
    if (mode === 'live') {
      if (!binanceCredentials || !binanceCredentials.apiKey || !binanceCredentials.apiSecret) {
        throw new Error('Chaves da API da Binance não encontradas ou inválidas para o modo Real.');
      }
    }

    const isImmediate = opportunity.triggerCondition.type === 'IMMEDIATE';
    let finalEntryPrice = entryPrice;
    let finalQty = quantizedQty;
    let finalNotional = notionalUsd;
    let binanceOrderId: string | undefined;
    let binanceClientOrderId: string | undefined;
    let executedQty: number | undefined;

    // 9. Se for modo REAL (live) e o gatilho for IMEDIATO, executa a compra a mercado agora na Binance Spot
    if (mode === 'live' && isImmediate) {
      const orderExecutor = PilotOrderExecutor.getInstance();
      const liveBuyResult = await orderExecutor.executeLiveBuy({
        symbol: opportunity.symbol,
        notionalUsd,
        suggestedQty: quantizedQty,
        filters,
        credentials: binanceCredentials!,
      });

      binanceOrderId = String(liveBuyResult.orderId);
      binanceClientOrderId = liveBuyResult.clientOrderId;
      executedQty = liveBuyResult.executedQty;
      finalQty = liveBuyResult.executedQty > 0 ? liveBuyResult.executedQty : quantizedQty;
      if (liveBuyResult.avgPrice > 0) {
        finalEntryPrice = liveBuyResult.avgPrice;
        finalNotional = PreciseMath.roundDown(finalQty * finalEntryPrice, 2);
      }
    }

    const sessionId = `direct-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const durationMs = durationMinutes * 60 * 1000;
    const radarExpiresAt = now + (opportunity.triggerCondition.expirationMinutes * 60 * 1000);

    const tickDecimals = filters.tickSize ? Math.max(2, -Math.floor(Math.log10(filters.tickSize))) : 4;
    const halfDistance = (opportunity.signal.takeProfit - finalEntryPrice) * 0.5;
    const computedPartialTarget = PreciseMath.roundDown(finalEntryPrice + halfDistance, tickDecimals);
    const safePartialTarget = computedPartialTarget > finalEntryPrice ? computedPartialTarget : PreciseMath.roundDown(finalEntryPrice * 1.018, tickDecimals);

    // Escada de 3 Alvos (Triple Target Ladder)
    const ladder = opportunity.tripleTargetLadder;
    const tp1 = ladder?.tp1Price ?? safePartialTarget;
    const tp2 = ladder?.tp2Price ?? PreciseMath.roundDown(finalEntryPrice + (opportunity.signal.takeProfit - finalEntryPrice) * 0.75, tickDecimals);
    const tp3 = ladder?.tp3Price ?? opportunity.signal.takeProfit;

    // Auditoria de Latência de Execução & Slippage (Pilar 3 Chaos & Infra)
    const latencyAudit = ExecutionLatencyGuard.auditExecution(
      opportunity.timestamp || now,
      now,
      entryPrice,
      finalEntryPrice
    );

    const session: DirectOperationSession = {
      id: sessionId,
      symbol: opportunity.symbol,
      baseCurrency: normalized.baseCurrency,
      quoteCurrency: normalized.quoteCurrency,
      investedAmountUsd: finalNotional,
      durationMinutes,
      startTime: isImmediate ? now : 0,
      endTime: isImmediate ? now + durationMs : 0,
      entryPrice: finalEntryPrice,
      targetPrice: opportunity.signal.takeProfit,
      stopLossPrice: opportunity.signal.stopLoss,
      quantity: finalQty,
      notionalUsd: finalNotional,
      riskUsd: validation.order.riskAmountUsd,
      rewardRiskRatio: validation.order.netRewardRiskRatio,
      aiScore: Math.round(opportunity.score),
      mode,
      status: isImmediate ? 'ACTIVE' : 'WAITING_TRIGGER',
      currentPrice: opportunity.marketData.lastPrice,
      unrealizedPnlUsd: 0,
      unrealizedPnlPercent: 0,
      rationale: `Oportunidade selecionada pela IA (${opportunity.effectiveStrategy}) com Score ${Math.round(opportunity.score)}/100. ${opportunity.triggerCondition.conditionDescription}`,
      binanceOrderId,
      binanceClientOrderId,
      executedQuantity: executedQty,
      credentials: binanceCredentials,
      triggerCondition: opportunity.triggerCondition,
      strategyChosen: opportunity.effectiveStrategy,
      targetEntryPrice: opportunity.triggerCondition.targetPrice,
      radarExpiresAt,
      isExecutingTrigger: false,
      topRanked: opportunity.topRanked,
      isCooldownApplied: opportunity.isCooldownApplied,

      // Fase 1: Escada de Parciais 50/50 & Trailing Stop Parabólico (Compatibilidade)
      partialTargetPrice: tp1,
      isPartialProfitTaken: false,
      partialQuantityExecuted: 0,
      partialRealizedPnlUsd: 0,
      breakEvenProtected: false,
      trailingStopPrice: opportunity.signal.stopLoss,
      highestPriceReached: finalEntryPrice,

      // Fase 2 & 3: IA Thought Stream & Microestrutura L2
      aiThoughtStream: opportunity.aiThoughtStream,
      orderFlowMetrics: opportunity.orderFlowMetrics,

      // Pilares de Próxima Geração: Triple Ladder, Regime, MTF, Sizing & Telemetria
      tp1Price: tp1,
      tp2Price: tp2,
      tp3Price: tp3,
      isTp1Taken: false,
      isTp2Taken: false,
      tp1QuantityExecuted: 0,
      tp2QuantityExecuted: 0,
      tp1RealizedPnlUsd: 0,
      tp2RealizedPnlUsd: 0,
      marketRegime: opportunity.marketRegime?.regime,
      multiTimeframeSummary: opportunity.multiTimeframe?.summary,
      sentimentScore: opportunity.sentimentFilter?.sentimentScore,
      volatilitySizingUsd: opportunity.volatilitySizing?.recommendedAllocationUsd,
      executionLatencyMs: latencyAudit.latencyMs,
      priceHistory: [{ price: finalEntryPrice, timestamp: now }],
      targetRecalibration: opportunity.targetRecalibration,
      spoofingEvasionsCount: 0,
      spoofingEvents: [],
    };

    activeSessions.set(sessionId, session);

    // Notificação institucional assíncrona
    TelegramNotifier.notify(
      `⚡ [TradeAI] Operação Iniciada: ${opportunity.symbol} (${mode.toUpperCase()})\n` +
      `Entrada: $${finalEntryPrice} | TP1: $${tp1} | TP2: $${tp2} | TP3: $${tp3} | SL: $${opportunity.signal.stopLoss}\n` +
      `Regime: ${session.marketRegime || 'NORMAL'} | MTF: ${session.multiTimeframeSummary || 'ALINHADO'}`
    );

    return { session, validation };
  }

  /**
   * Ativa a ordem de compra quando o gatilho ótimo for atingido ou forçado pelo usuário
   */
  public static async activateWaitingSession(
    sessionId: string,
    currentPrice?: number,
    force = false
  ): Promise<DirectOperationSession> {
    const session = activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Sessão ${sessionId} não encontrada.`);
    }

    if (session.status !== 'WAITING_TRIGGER') {
      return session;
    }

    // Trava de concorrência atômica para evitar double-buy
    if (session.isExecutingTrigger) {
      return session;
    }
    session.isExecutingTrigger = true;

    // Se for disparo autônomo (não forçado manualmente), verifica se o Liquidity Spoofing Guard está ativo
    if (!force) {
      const cb = GraduatedCircuitBreaker.getInstance();
      const isSpoofHalted = cb.isSpoofingHalted(session.symbol);
      const injectedAlert = session.injectedSpoofingAlert;
      const activeSpoof = (injectedAlert?.isAlertActive && injectedAlert.dropPct >= 30.0)
        ? injectedAlert
        : (isSpoofHalted ? cb.getSpoofingAlert(session.symbol) : null);

      if (activeSpoof) {
        session.isSpoofingProtectionTriggered = true;
        session.radarPausedUntil = Date.now() + 3000;
        session.spoofingEvasionsCount = (session.spoofingEvasionsCount || 0) + 1;
        session.isExecutingTrigger = false;

        const eventPrice = currentPrice ?? session.currentPrice;
        if (!session.spoofingEvents) session.spoofingEvents = [];
        const evasionEvent: SpoofingEvasionEvent = {
          timestamp: Date.now(),
          price: eventPrice,
          dropPct: activeSpoof.dropPct,
          side: activeSpoof.side,
          actionTaken: 'Despacho pausado por 3s para reavaliar profundidade real',
        };
        session.spoofingEvents.push(evasionEvent);
        DirectOperationManager.recordSpoofingEvasion(session.symbol, evasionEvent);

        if (!session.aiThoughtStream) session.aiThoughtStream = [];
        session.aiThoughtStream.push({
          id: `step-spoofing-${Date.now()}`,
          phase: 'RISK_GATE',
          title: '🛡️ Radar Sniper: Liquidity Spoofing Guard Acionado',
          description: `Cancelamento súbito de parede no ${activeSpoof.side} (-${activeSpoof.dropPct}%). Despacho pausado por 1 ciclo (3s) para reavaliação de liquidez.`,
          status: 'active',
          timestamp: Date.now(),
        });

        return session;
      }
    }

    try {
      const metadataService = ExchangeMetadataService.getInstance();
      const filters = await metadataService.getSymbolFilters(session.symbol);

      let effectiveEntryPrice = currentPrice ?? session.currentPrice;
      let finalQty = session.quantity;
      let finalNotional = session.notionalUsd;
      let binanceOrderId = session.binanceOrderId;
      let binanceClientOrderId = session.binanceClientOrderId;
      let executedQty = session.executedQuantity;

      // Se for modo REAL (live), despacha a compra a mercado agora na Binance Spot
      if (session.mode === 'live') {
        if (!session.credentials || !session.credentials.apiKey || !session.credentials.apiSecret) {
          throw new Error('Credenciais da Binance não disponíveis para executar disparo real.');
        }

        const orderExecutor = PilotOrderExecutor.getInstance();
        const liveBuyResult = await orderExecutor.executeLiveBuy({
          symbol: session.symbol,
          notionalUsd: session.notionalUsd,
          suggestedQty: session.quantity,
          filters,
          credentials: session.credentials,
        });

        binanceOrderId = String(liveBuyResult.orderId);
        binanceClientOrderId = liveBuyResult.clientOrderId;
        executedQty = liveBuyResult.executedQty;
        finalQty = liveBuyResult.executedQty > 0 ? liveBuyResult.executedQty : session.quantity;
        if (liveBuyResult.avgPrice > 0) {
          effectiveEntryPrice = liveBuyResult.avgPrice;
          finalNotional = PreciseMath.roundDown(finalQty * effectiveEntryPrice, 2);
        }
      }

      const now = Date.now();
      const durationMs = session.durationMinutes * 60 * 1000;

      const tickDecimals = filters.tickSize ? Math.max(2, -Math.floor(Math.log10(filters.tickSize))) : 4;
      const halfDistance = (session.targetPrice - effectiveEntryPrice) * 0.5;
      const computedPartialTarget = PreciseMath.roundDown(effectiveEntryPrice + halfDistance, tickDecimals);
      const safePartialTarget = computedPartialTarget > effectiveEntryPrice ? computedPartialTarget : PreciseMath.roundDown(effectiveEntryPrice * 1.018, tickDecimals);

      session.status = 'ACTIVE';
      session.entryPrice = effectiveEntryPrice;
      session.currentPrice = effectiveEntryPrice;
      session.quantity = finalQty;
      session.notionalUsd = finalNotional;
      session.executedQuantity = executedQty;
      session.binanceOrderId = binanceOrderId;
      session.binanceClientOrderId = binanceClientOrderId;
      session.startTime = now;
      session.endTime = now + durationMs;
      session.isExecutingTrigger = false;

      // Escada de 3 Alvos (Triple Target Ladder)
      const tp1 = session.tp1Price ?? safePartialTarget;
      const tp2 = session.tp2Price ?? PreciseMath.roundDown(effectiveEntryPrice + (session.targetPrice - effectiveEntryPrice) * 0.75, tickDecimals);
      const tp3 = session.tp3Price ?? session.targetPrice;

      // Inicializa métricas de parciais e trailing stop (Compatibilidade)
      session.partialTargetPrice = tp1;
      session.isPartialProfitTaken = false;
      session.partialQuantityExecuted = 0;
      session.partialRealizedPnlUsd = 0;
      session.breakEvenProtected = false;
      session.trailingStopPrice = session.stopLossPrice;
      session.highestPriceReached = effectiveEntryPrice;

      // Triple Target Ladder
      session.tp1Price = tp1;
      session.tp2Price = tp2;
      session.tp3Price = tp3;
      session.isTp1Taken = false;
      session.isTp2Taken = false;
      session.tp1QuantityExecuted = 0;
      session.tp2QuantityExecuted = 0;
      session.tp1RealizedPnlUsd = 0;
      session.tp2RealizedPnlUsd = 0;
      session.priceHistory = [{ price: effectiveEntryPrice, timestamp: now }];

      // Auditoria de latência
      const expectedP = session.targetEntryPrice || effectiveEntryPrice;
      const latencyAudit = ExecutionLatencyGuard.auditExecution(now - 100, now, expectedP, effectiveEntryPrice);
      session.executionLatencyMs = latencyAudit.latencyMs;

      TelegramNotifier.notify(
        `🎯 [TradeAI] Gatilho Sniper Disparado: ${session.symbol}\n` +
        `Entrada Efetiva: $${effectiveEntryPrice} | TP1: $${tp1} | TP2: $${tp2} | TP3: $${tp3}`
      );

      return session;
    } catch (err: any) {
      session.isExecutingTrigger = false;
      throw err;
    }
  }

  /**
   * Força a entrada imediata ignorando a espera pelo gatilho
   */
  public static async forceEntry(sessionId: string): Promise<DirectOperationSession> {
    const session = activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Sessão ${sessionId} não encontrada.`);
    }
    if (session.status !== 'WAITING_TRIGGER') {
      return session;
    }
    return await this.activateWaitingSession(sessionId, session.currentPrice, true);
  }

  /**
   * Cancela a espera no radar sem realizar nenhum trade
   */
  public static cancelRadar(sessionId: string): DirectOperationSession {
    const session = activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Sessão ${sessionId} não encontrada.`);
    }
    if (session.status !== 'WAITING_TRIGGER') {
      return session;
    }
    session.status = 'CANCELLED';
    session.closeReason = 'RADAR_CANCELLED';
    session.unrealizedPnlUsd = 0;
    session.unrealizedPnlPercent = 0;
    session.realizedPnlUsd = 0;
    session.realizedPnlPercent = 0;
    return session;
  }

  /**
   * Atualiza e consulta a telemetria ao vivo de uma sessão
   */
  public static async pollSession(sessionId: string): Promise<DirectOperationSession> {
    const session = activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Sessão de operação ${sessionId} não encontrada.`);
    }

    if (session.status === 'CLOSED' || session.status === 'CANCELLED') {
      return session;
    }

    // Consultar preço em tempo real na Binance
    let latestPrice = session.currentPrice;
    try {
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${session.symbol}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = await res.json();
        const p = parseFloat(data.price);
        if (Number.isFinite(p) && p > 0) latestPrice = p;
      }
    } catch {
      latestPrice = session.currentPrice;
    }

    return await this.processPriceTick(sessionId, latestPrice);
  }

  /**
   * Processa um tick de preço recebido (via WebSocket nativo ou Polling)
   * Executa a escada de parciais 50/50, break-even blindado (+0.35%) e trailing stop adaptativo
   */
  public static async processPriceTick(sessionId: string, latestPrice: number): Promise<DirectOperationSession> {
    const session = activeSessions.get(sessionId);
    if (!session || session.status === 'CLOSED' || session.status === 'CANCELLED') {
      return session!;
    }

    session.currentPrice = latestPrice;

    // Histórico de preços em tempo real para mini-gráfico (buffer circular sem O(N) shift e zero alocações)
    if (!session.priceHistory) session.priceHistory = [];
    const histLen = session.priceHistory.length;
    if (histLen >= 30) {
      const reusedSlot = session.priceHistory[0];
      reusedSlot.price = latestPrice;
      reusedSlot.timestamp = Date.now();
      session.priceHistory.copyWithin(0, 1);
      session.priceHistory[29] = reusedSlot;
    } else {
      session.priceHistory.push({ price: latestPrice, timestamp: Date.now() });
    }

    // Se estiver aguardando gatilho ótimo (Radar Sniper)
    if (session.status === 'WAITING_TRIGGER') {
      // Pausa defensiva de 1 ciclo (3s) do Liquidity Spoofing Guard
      if (session.radarPausedUntil && Date.now() < session.radarPausedUntil) {
        return session;
      }
      if (session.radarPausedUntil && Date.now() >= session.radarPausedUntil) {
        session.isSpoofingProtectionTriggered = false;
      }

      const trigger = session.triggerCondition;
      const target = trigger?.targetPrice ?? session.targetEntryPrice ?? session.entryPrice;
      const distPct = Math.abs(latestPrice - target) / latestPrice * 100;
      if (session.triggerCondition) {
        session.triggerCondition.distanceToTriggerPct = PreciseMath.roundDown(distPct, 2);
      }

      // 1. Radar expirado
      if (session.radarExpiresAt && Date.now() >= session.radarExpiresAt) {
        session.status = 'CLOSED';
        session.closeReason = 'TRIGGER_EXPIRED';
        session.realizedPnlUsd = 0;
        session.realizedPnlPercent = 0;
        session.unrealizedPnlUsd = 0;
        session.unrealizedPnlPercent = 0;
        return session;
      }

      // 2. Avaliação da condição de disparo
      let shouldTrigger = false;
      if (trigger?.triggerDirection === 'LESS_THAN_OR_EQUAL' && latestPrice <= target) {
        shouldTrigger = true;
      } else if (trigger?.triggerDirection === 'GREATER_THAN_OR_EQUAL' && latestPrice >= target) {
        shouldTrigger = true;
      } else if (trigger?.triggerDirection === 'NOW') {
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        return await this.activateWaitingSession(sessionId, latestPrice);
      }

      return session;
    }

    // Status ACTIVE
    if (session.status === 'ACTIVE') {
      // 1. Registra nova máxima e mínima alcançada pela operação (para métricas de MFE/MAE)
      session.highestPriceReached = Math.max(session.highestPriceReached || session.entryPrice, latestPrice);
      session.lowestPriceReached = Math.min(session.lowestPriceReached || session.entryPrice, latestPrice);

      const metadataService = ExchangeMetadataService.getInstance();
      const filters = await metadataService.getSymbolFilters(session.symbol);

      // 2. Escada Tripla de Alvos - Alvo TP1 (33% padrão ou 50% via Skew Gate):
      // Se no momento de bater TP1 o livro L2 apresentar razão Bid/Ask Depth <= 0.40 (pressão vendedora súbita),
      // a IA encerra imediatamente 50% em vez de 33% para mitigar absorção passiva antes do pull-back.
      let isTp1JustTakenInThisTick = false;
      const tp1Target = session.tp1Price || session.partialTargetPrice;
      if (!session.isTp1Taken && tp1Target && latestPrice >= tp1Target) {
        // Avaliação de Microestrutura L2: Order Book Skew Gate
        let bidAskDepthRatio = 1.0;
        try {
          if (session.injectedOrderBookRatio !== undefined) {
            bidAskDepthRatio = session.injectedOrderBookRatio;
          } else if (this.mockOrderBookRatios.has(session.symbol)) {
            bidAskDepthRatio = this.mockOrderBookRatios.get(session.symbol)!;
          } else {
            const ob = await getOrderBookAnalysis(session.symbol);
            if (ob && ob.askVolume > 0) {
              bidAskDepthRatio = PreciseMath.roundDown(ob.bidVolume / ob.askVolume, 2);
            }
          }
        } catch (err: any) {
          console.warn(`[DirectOperationManager] Falha não-bloqueante ao consultar Order Book Skew em TP1: ${err.message}. Mantendo fallback 33%.`);
          bidAskDepthRatio = 1.0;
        }

        const isSkewGateActive = bidAskDepthRatio <= 0.40;
        const liquidationPct = isSkewGateActive ? 0.50 : 0.33;
        const tp1PctNumber = isSkewGateActive ? 50 : 33;

        const tp1Qty = PreciseMath.quantizeLotDown(session.quantity * liquidationPct, filters.stepSize);

        if (tp1Qty > 0) {
          if (session.mode === 'live' && session.credentials) {
            try {
              const orderExecutor = PilotOrderExecutor.getInstance();
              await orderExecutor.executeLiveSell({
                symbol: session.symbol,
                baseAsset: session.baseCurrency,
                quantity: tp1Qty,
                filters,
                credentials: session.credentials,
              });
            } catch (err: any) {
              console.error(`[DirectOperationManager] Falha ao despachar venda TP1 na Binance:`, err.message);
            }
          }

          const partialGross = (latestPrice - session.entryPrice) * tp1Qty;
          const partialFee = (tp1Qty * latestPrice) * 0.001;
          const partialNetPnl = PreciseMath.roundDown(partialGross - partialFee, 2);

          const tp1ExecTimestamp = Date.now();
          session.isTp1Taken = true;
          isTp1JustTakenInThisTick = true;
          session.isPartialProfitTaken = true; // Compatibilidade com testes legados
          session.tp1QuantityExecuted = tp1Qty;
          session.partialQuantityExecuted = tp1Qty;
          session.tp1RealizedPnlUsd = partialNetPnl;
          session.tp1ExecutedPrice = latestPrice;
          session.tp1ExecutedAt = tp1ExecTimestamp;
          session.partialRealizedPnlUsd = (session.partialRealizedPnlUsd || 0) + partialNetPnl;
          session.quantity = PreciseMath.roundDown(session.quantity - tp1Qty, 8);
          session.isSkewGateActive = isSkewGateActive;
          session.orderBookSkewRatio = bidAskDepthRatio;
          session.tp1LiquidationPct = tp1PctNumber;

          // Dispara evento de execução em tempo real para o TradeJournalEngine (BroadcastChannel + CustomEvent)
          try {
            tradeJournalEngine.dispatchExecutionEvent({
              eventId: `direct_tp1_${session.id}`,
              source: 'DIRECT_AI_TRADE',
              triggerType: 'PARTIAL_TAKE_PROFIT',
              botId: session.id,
              botName: 'Direct AI Sniper (TP1)',
              symbol: session.symbol,
              side: 'BUY',
              mode: session.mode === 'live' ? 'live' : 'paper',
              strategy: session.strategyChosen || 'AI_SNIPER',
              entryPrice: session.entryPrice,
              exitPrice: latestPrice,
              quantity: tp1Qty,
              highestPrice: session.highestPriceReached || latestPrice,
              lowestPrice: session.lowestPriceReached || session.entryPrice,
              entryTimestampMs: session.startTime || tp1ExecTimestamp - 30000,
              exitTimestampMs: tp1ExecTimestamp,
              exitReason: isSkewGateActive ? 'TP1_SKEW_GATE_50PCT' : 'TP1_PARTIAL_33PCT',
            });
          } catch (journalErr) {
            console.warn('[DirectOperationManager] Falha ao emitir evento TP1 para o TradeJournalEngine:', journalErr);
          }

          // Trailing Stop Agressivo com Base em MAE Residual:
          // Se o ativo sofreu excursão adversa inicial acentuada (MAE <= -0.60%), eleva para +0.60% para proteger contra nova retração à zona de estresse.
          // Se o movimento foi limpo (MAE > -0.60%), mantém o Break-Even padrão de +0.35%.
          const lowest = session.lowestPriceReached || session.entryPrice;
          const maeAtTp1 = ((lowest - session.entryPrice) / session.entryPrice) * 100;
          session.initialMaeAtTp1Pct = PreciseMath.roundDown(maeAtTp1, 2);

          const isAggressive = maeAtTp1 <= -0.60;
          const breakEvenMultiplier = isAggressive ? 1.0060 : 1.0035;
          const offsetPct = isAggressive ? 0.60 : 0.35;

          const targetBreakEven = PreciseMath.roundDown(session.entryPrice * breakEvenMultiplier, 6);
          const breakEvenPrice = targetBreakEven < latestPrice
            ? targetBreakEven
            : PreciseMath.roundDown(session.entryPrice + (latestPrice - session.entryPrice) * 0.5, 6);

          session.stopLossPrice = breakEvenPrice;
          session.breakEvenProtected = true;
          session.trailingStopPrice = breakEvenPrice;
          session.isAggressiveBreakEvenActive = isAggressive;
          session.breakEvenOffsetPct = offsetPct;

          const skewPrefix = isSkewGateActive
            ? `⚡ [${session.symbol}] TP1 Executado com SKEW GATE ATIVO! 50% liquidado a $${latestPrice} (+${partialNetPnl} USD) devido a desbalanceamento crítico L2 (Bid/Ask Depth: ${bidAskDepthRatio.toFixed(2)} <= 0.40). Proteção ativada contra absorção passiva.`
            : `🎯 [${session.symbol}] TP1 Executado! 33% liquidado a $${latestPrice} (+${partialNetPnl} USD).`;

          const trailingSuffix = isAggressive
            ? ` Trailing Stop Elevado AGRESSIVAMENTE (+0.60%) devido a MAE Residual de ${maeAtTp1.toFixed(2)}% ($${breakEvenPrice}).`
            : ` Stop Loss blindado no Break-Even padrão (+0.35%) a $${breakEvenPrice}.`;

          TelegramNotifier.notify(skewPrefix + trailingSuffix);
        }
      }

      // 3. Escada Tripla de Alvos - Alvo TP2 (Mais 33%):
      // Filtro de Desaceleração de Momentum (CVD Exhaustion Filter no TP2):
      // Se o preço se aproximar a menos de 0.20% do TP2 (latestPrice >= tp2Price * 0.998 && latestPrice < tp2Price)
      // mas o CVD Delta dos últimos 5 minutos divergir negativamente (< 0), a IA antecipa o TP2 a mercado imediatamente,
      // evitando que uma exaustão de compradores no topo transforme uma posição lucrativa em saída prematura por trailing stop.
      // Se latestPrice >= session.tp2Price, o TP2 é executado normalmente pelo toque direto no alvo.
      let isCvdExhaustionHit = false;
      let cvdDelta = 0;

      if (!isTp1JustTakenInThisTick && session.isTp1Taken && !session.isTp2Taken && session.tp2Price) {
        const isWithinProximity = latestPrice < session.tp2Price && latestPrice >= session.tp2Price * 0.998;
        if (isWithinProximity) {
          try {
            if (session.injectedCvdDeltaPct !== undefined) {
              cvdDelta = session.injectedCvdDeltaPct;
            } else {
              cvdDelta = await DirectOperationManager.auditCvdDelta5m(session.symbol);
            }
            if (cvdDelta < 0) {
              isCvdExhaustionHit = true;
            }
          } catch (err: any) {
            console.warn(`[DirectOperationManager] Falha ao auditar CVD Delta em TP2: ${err.message}.`);
            isCvdExhaustionHit = false;
          }
        }
      }

      const shouldExecuteTp2 = session.isTp1Taken && !session.isTp2Taken && session.tp2Price && (
        latestPrice >= session.tp2Price || (!isTp1JustTakenInThisTick && isCvdExhaustionHit)
      );

      if (shouldExecuteTp2) {
        const tp2Qty = PreciseMath.quantizeLotDown(session.quantity * 0.5, filters.stepSize);

        if (tp2Qty > 0) {
          if (session.mode === 'live' && session.credentials) {
            try {
              const orderExecutor = PilotOrderExecutor.getInstance();
              await orderExecutor.executeLiveSell({
                symbol: session.symbol,
                baseAsset: session.baseCurrency,
                quantity: tp2Qty,
                filters,
                credentials: session.credentials,
              });
            } catch (err: any) {
              console.error(`[DirectOperationManager] Falha ao despachar venda TP2 na Binance:`, err.message);
            }
          }

          const grossPnl = (latestPrice - session.entryPrice) * tp2Qty;
          const fee = (tp2Qty * latestPrice) * 0.001;
          const tp2NetPnl = PreciseMath.roundDown(grossPnl - fee, 2);

          const tp2ExecTimestamp = Date.now();
          session.isTp2Taken = true;
          session.tp2QuantityExecuted = tp2Qty;
          session.tp2RealizedPnlUsd = tp2NetPnl;
          session.tp2ExecutedPrice = latestPrice;
          session.tp2ExecutedAt = tp2ExecTimestamp;
          session.partialRealizedPnlUsd = (session.partialRealizedPnlUsd || 0) + tp2NetPnl;
          session.quantity = PreciseMath.roundDown(session.quantity - tp2Qty, 8);
          session.isCvdExhaustionTriggered = isCvdExhaustionHit;
          session.cvdDeltaAtTp2Pct = cvdDelta;
          session.tp2AnticipatedReason = isCvdExhaustionHit ? 'CVD_EXHAUSTION' : undefined;

          // Dispara evento de execução em tempo real para o TradeJournalEngine (BroadcastChannel + CustomEvent)
          try {
            tradeJournalEngine.dispatchExecutionEvent({
              eventId: `direct_tp2_${session.id}`,
              source: 'DIRECT_AI_TRADE',
              triggerType: 'PARTIAL_TAKE_PROFIT',
              botId: session.id,
              botName: 'Direct AI Sniper (TP2)',
              symbol: session.symbol,
              side: 'BUY',
              mode: session.mode === 'live' ? 'live' : 'paper',
              strategy: session.strategyChosen || 'AI_SNIPER',
              entryPrice: session.entryPrice,
              exitPrice: latestPrice,
              quantity: tp2Qty,
              highestPrice: session.highestPriceReached || latestPrice,
              lowestPrice: session.lowestPriceReached || session.entryPrice,
              entryTimestampMs: session.startTime || tp2ExecTimestamp - 45000,
              exitTimestampMs: tp2ExecTimestamp,
              exitReason: isCvdExhaustionHit ? 'TP2_CVD_EXHAUSTION' : 'TP2_PARTIAL_33PCT',
            });
          } catch (journalErr) {
            console.warn('[DirectOperationManager] Falha ao emitir evento TP2 para o TradeJournalEngine:', journalErr);
          }

          // Blindagem de Lucro Mínimo Absoluto no Runner (TP3 Hard Floor)
          // Trava irrevogavelmente em no mínimo +1.0% acima do preço de entrada (ou no nível exato do TP1, o que for maior)
          const minProfitFloor = PreciseMath.round(session.entryPrice * 1.010, 6);
          const tp1Floor = session.tp1Price || minProfitFloor;
          const hardFloorPrice = Math.max(minProfitFloor, tp1Floor);
          const hardFloorPct = PreciseMath.round(((hardFloorPrice - session.entryPrice) / session.entryPrice) * 100, 2);

          session.isTp3HardFloorActive = true;
          session.tp3HardFloorPrice = hardFloorPrice;
          session.tp3HardFloorPct = hardFloorPct;

          // Aperta Trailing Stop para 0.8% abaixo da máxima, respeitando estritamente o TP3 Hard Floor como piso mínimo
          const tightTrailing = PreciseMath.roundDown(session.highestPriceReached * 0.992, 6);
          const newTrailingStop = Math.max(tightTrailing, hardFloorPrice, session.trailingStopPrice || 0);

          session.trailingStopPrice = newTrailingStop;
          session.stopLossPrice = newTrailingStop;

          const tp2Prefix = isCvdExhaustionHit
            ? `⚡ [${session.symbol}] TP2 ANTECIPADO A MERCADO (CVD Exhaustion Filter)! Preço a menos de 0.20% do alvo ($${latestPrice} vs TP2 $${session.tp2Price}) com divergência negativa de agressão compradora (CVD Delta 5m: ${cvdDelta.toFixed(2)}% < 0). Liquidando 50% do restante (+${tp2NetPnl} USD) antes de reversão.`
            : `🚀 [${session.symbol}] TP2 Executado! Mais 33% liquidado a $${latestPrice} (+${tp2NetPnl} USD).`;

          TelegramNotifier.notify(
            `${tp2Prefix} Trailing Stop apertado para $${session.trailingStopPrice} (🛡️ TP3 Hard Floor travado irrevogavelmente em $${hardFloorPrice} [+${hardFloorPct}%]).`
          );
        }
      }

      // 4. Trailing Stop Adaptativo no Runner
      if (session.isTp1Taken && session.highestPriceReached) {
        let trailingFactor = session.isTp2Taken ? 0.992 : 0.988;

        // Aceleração Dinâmica de Expansão do Runner por ATR Spike (Runner Momentum Acceleration)
        if (session.isTp2Taken) {
          const momentumAudit = await DirectOperationManager.auditRunnerMomentum(session.symbol);

          if (momentumAudit.isSpike) {
            // Volume > 2.5x média 15p e Fechamento > Upper BB: afrouxa trailing para 1.2% (factor 0.988) para o candle parabólico respirar
            trailingFactor = 0.988;
            session.isRunnerAccelerationActive = true;
            session.isRunnerClimaxTighteningActive = false;
            session.runnerTrailingFactor = 0.988;
            session.runnerVolumeRatio = momentumAudit.volumeRatio;
            session.runnerAccelerationReason = `Spike de Volume (${momentumAudit.volumeRatio.toFixed(2)}x > 2.5x) e rompimento de Upper BB`;
          } else if (session.isRunnerAccelerationActive && momentumAudit.isExhausted) {
            // Exaustão volumétrica pós-spike: aperta agressivamente para 0.5% (factor 0.995) para consolidar o clímax no topo
            trailingFactor = 0.995;
            session.isRunnerAccelerationActive = false;
            session.isRunnerClimaxTighteningActive = true;
            session.runnerTrailingFactor = 0.995;
            session.runnerVolumeRatio = momentumAudit.volumeRatio;
            session.runnerAccelerationReason = `Exaustão Volumétrica pós-Spike (${momentumAudit.volumeRatio.toFixed(2)}x < 1.5x) - Clímax Travado`;
          } else if (session.isRunnerClimaxTighteningActive) {
            trailingFactor = 0.995;
          } else if (session.isRunnerAccelerationActive) {
            trailingFactor = 0.988;
          }
        }

        let dynamicTrailing = PreciseMath.roundDown(session.highestPriceReached * trailingFactor, 6);

        // Se o TP3 Hard Floor estiver ativo, o trailing stop jamais pode recuar abaixo do piso rígido
        if (session.isTp3HardFloorActive && session.tp3HardFloorPrice && dynamicTrailing < session.tp3HardFloorPrice) {
          dynamicTrailing = session.tp3HardFloorPrice;
        }

        // Se a aceleração estiver ativa e dynamicTrailing >= hardFloorPrice, permite o afrouxamento controlado para 1.2%
        if (session.isRunnerAccelerationActive && dynamicTrailing >= (session.tp3HardFloorPrice || 0)) {
          session.trailingStopPrice = dynamicTrailing;
          session.stopLossPrice = dynamicTrailing;
        } else if (dynamicTrailing > (session.trailingStopPrice || 0)) {
          session.trailingStopPrice = dynamicTrailing;
          session.stopLossPrice = dynamicTrailing;
        }

        // Se o preço recuar e bater no trailing stop móvel
        if (session.trailingStopPrice && latestPrice <= session.trailingStopPrice) {
          return await this.closeOperation(sessionId, 'STOP_LOSS', latestPrice);
        }
      }

      // 5. Verificação de Alvo Final TP3 (Take Profit do Runner Remanescente)
      const finalTp3 = session.tp3Price || session.targetPrice;
      if (latestPrice >= finalTp3) {
        return await this.closeOperation(sessionId, 'TARGET_REACHED', latestPrice);
      }

      // 6. Verificação de Stop Loss inicial (se ainda não atingiu o TP1)
      if (!session.isTp1Taken && latestPrice <= session.stopLossPrice) {
        return await this.closeOperation(sessionId, 'STOP_LOSS', latestPrice);
      }

      // 7. Cálculo de PnL flutuante total (parciais realizadas + flutuante do restante)
      const currentQty = session.executedQuantity && !session.isTp1Taken
        ? session.executedQuantity
        : session.quantity;
      const floatingPnl = (latestPrice - session.entryPrice) * currentQty;
      const totalPnlUsd = (session.partialRealizedPnlUsd || 0) + floatingPnl;

      session.unrealizedPnlUsd = PreciseMath.roundDown(totalPnlUsd, 2);
      session.unrealizedPnlPercent = PreciseMath.roundDown(((latestPrice - session.entryPrice) / session.entryPrice) * 100, 2);

      // 8. Encerramento por tempo esgotado
      if (session.endTime > 0 && Date.now() >= session.endTime) {
        return await this.closeOperation(sessionId, 'TIME_EXPIRED', latestPrice);
      }
    }

    return session;
  }

  /**
   * Encerra a operação direta, liquida na Binance (se live) e entrega o resultado final consolidado
   */
  public static async closeOperation(
    sessionId: string,
    reason: 'TIME_EXPIRED' | 'TARGET_REACHED' | 'STOP_LOSS' | 'MANUAL_CLOSE',
    explicitExitPrice?: number,
    overrideCredentials?: BinanceCredentials
  ): Promise<DirectOperationSession> {
    const session = activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Sessão de operação ${sessionId} não encontrada.`);
    }

    if (session.status === 'CLOSED' || session.status === 'CANCELLED') {
      return session;
    }

    if (session.status === 'WAITING_TRIGGER') {
      if (reason === 'MANUAL_CLOSE') {
        session.status = 'CLOSED';
        session.closeReason = 'MANUAL_CLOSE';
        session.unrealizedPnlUsd = 0;
        session.unrealizedPnlPercent = 0;
        session.realizedPnlUsd = 0;
        session.realizedPnlPercent = 0;
        return session;
      }
      // Se for encerramento de alvo/tempo em teste/simulação, ativa a sessão mantendo o entryPrice planejado
      await this.activateWaitingSession(sessionId, session.entryPrice);
    }

    let exitPrice = explicitExitPrice ?? session.currentPrice;
    let closeBinanceOrderId: string | undefined;

    // Se a sessão foi aberta no modo LIVE, executa a VENDA da posição na Binance Spot
    if (session.mode === 'live') {
      const creds = overrideCredentials || session.credentials;
      if (!creds || !creds.apiKey || !creds.apiSecret) {
        throw new Error('Chaves da API da Binance não encontradas para liquidação da ordem real.');
      }

      const metadataService = ExchangeMetadataService.getInstance();
      const filters = await metadataService.getSymbolFilters(session.symbol);
      const orderExecutor = PilotOrderExecutor.getInstance();

      const liveSellResult = await orderExecutor.executeLiveSell({
        symbol: session.symbol,
        baseAsset: session.baseCurrency,
        quantity: session.quantity,
        filters,
        credentials: creds,
      });

      closeBinanceOrderId = String(liveSellResult.orderId);
      if (liveSellResult.avgPrice > 0) {
        exitPrice = liveSellResult.avgPrice;
      }
    }

    const effectiveQty = session.quantity;
    const priceDiff = exitPrice - session.entryPrice;
    const grossPnl = priceDiff * effectiveQty;

    // Dedução realista de taxas Maker (entrada) + Taker (saída a mercado de encerramento)
    const entryFee = session.notionalUsd * 0.001;
    const exitNotional = effectiveQty * exitPrice;
    const exitFee = exitNotional * 0.001;
    const totalFees = entryFee + exitFee;

    const netRunnerPnl = grossPnl - exitFee;
    const totalRealizedPnl = (session.partialRealizedPnlUsd || 0) + netRunnerPnl;
    const netPercent = (totalRealizedPnl / session.investedAmountUsd) * 100;

    const closeTimestamp = Date.now();
    session.status = 'CLOSED';
    session.closeReason = reason;
    session.currentPrice = exitPrice;
    session.closedAt = closeTimestamp;
    session.closeBinanceOrderId = closeBinanceOrderId;
    session.realizedPnlUsd = PreciseMath.roundDown(totalRealizedPnl, 2);
    session.realizedPnlPercent = PreciseMath.roundDown(netPercent, 2);
    session.feeDeductedUsd = PreciseMath.roundDown(totalFees, 2);
    session.unrealizedPnlUsd = 0;
    session.unrealizedPnlPercent = 0;

    // Dispara evento de execução final em tempo real para o TradeJournalEngine (BroadcastChannel + CustomEvent)
    if (effectiveQty > 0) {
      try {
        const triggerType: ExecutionTriggerType =
          reason === 'TARGET_REACHED'
            ? 'TAKE_PROFIT'
            : reason === 'STOP_LOSS'
              ? session.isTp1Taken || session.breakEvenProtected
                ? 'TRAILING_STOP'
                : 'STOP_LOSS'
              : reason === 'TIME_EXPIRED'
                ? 'TIME_EXPIRED'
                : 'MANUAL_CLOSE';

        const resolvedReasonLabel =
          reason === 'STOP_LOSS' && (session.isTp1Taken || session.breakEvenProtected)
            ? session.isTp2Taken
              ? 'TP3_RUNNER_TRAILING_STOP'
              : 'BREAK_EVEN_TRAILING_STOP'
            : reason;

        tradeJournalEngine.dispatchExecutionEvent({
          eventId: `direct_close_${session.id}`,
          source: 'DIRECT_AI_TRADE',
          triggerType,
          botId: session.id,
          botName: session.isTp1Taken ? 'Direct AI Sniper (Runner)' : 'Direct AI Sniper',
          symbol: session.symbol,
          side: 'BUY',
          mode: session.mode === 'live' ? 'live' : 'paper',
          strategy: session.strategyChosen || 'AI_SNIPER',
          entryPrice: session.entryPrice,
          exitPrice,
          quantity: effectiveQty,
          highestPrice: session.highestPriceReached || Math.max(session.entryPrice, exitPrice),
          lowestPrice: session.lowestPriceReached || Math.min(session.entryPrice, exitPrice),
          entryTimestampMs: session.startTime || closeTimestamp - 60000,
          exitTimestampMs: closeTimestamp,
          exitReason: resolvedReasonLabel,
        });
      } catch (journalErr) {
        console.warn('[DirectOperationManager] Falha ao emitir evento de fechamento para o TradeJournalEngine:', journalErr);
      }
    }

    // Gera auto-avaliação pós-trade da IA (Post-Trade Reflection) e salva no diário
    const journalEntry = this.generatePostTradeReflection(session);
    session.postTradeJournal = journalEntry;

    // Notificação de Encerramento Telegram
    TelegramNotifier.notify(
      `🏁 [TradeAI] Operação Encerrada: ${session.symbol}\n` +
      `Motivo: ${reason} | Saída: $${exitPrice}\n` +
      `PnL Final: $${session.realizedPnlUsd} (${session.realizedPnlPercent}%) | Taxas: $${session.feeDeductedUsd}`
    );

    return session;
  }

  /**
   * Gera a auto-reflexão pós-trade analítica da IA (Post-Trade Reflection & Journaling)
   */
  public static generatePostTradeReflection(session: DirectOperationSession): TradeJournalEntry {
    const entryPrice = session.entryPrice;
    const exitPrice = session.currentPrice;
    const highest = Math.max(session.highestPriceReached || entryPrice, exitPrice, entryPrice);
    const lowest = Math.min(session.lowestPriceReached || entryPrice, exitPrice, entryPrice);

    const mfePrice = highest;
    const mfePercent = entryPrice > 0 ? PreciseMath.roundDown(((highest - entryPrice) / entryPrice) * 100, 2) : 0;
    const maePrice = lowest;
    const maePercent = entryPrice > 0 ? PreciseMath.roundDown(((lowest - entryPrice) / entryPrice) * 100, 2) : 0;

    const realizedPct = session.realizedPnlPercent || 0;
    let exitEfficiency = 0;
    if (mfePercent > 0) {
      exitEfficiency = PreciseMath.roundDown(Math.min(100, Math.max(0, (realizedPct / mfePercent) * 100)), 1);
    } else if (realizedPct >= 0) {
      exitEfficiency = 100;
    }

    let rating: 'OPTIMAL' | 'ACCEPTABLE' | 'SUBOPTIMAL' | 'DEFENSIVE_EXIT' = 'ACCEPTABLE';
    if (realizedPct >= 1.5 || exitEfficiency >= 80) {
      rating = 'OPTIMAL';
    } else if (session.closeReason === 'STOP_LOSS' || realizedPct < 0) {
      rating = 'DEFENSIVE_EXIT';
    } else if (exitEfficiency < 40) {
      rating = 'SUBOPTIMAL';
    }

    const durationSeconds = Math.max(1, Math.round((Date.now() - session.startTime) / 1000));
    const lessons: string[] = [];

    if (session.isTp1Taken && session.isTp2Taken) {
      lessons.push('Escada de 3 alvos executada com maestria: 66% embolsado nos primeiros picos.');
    } else if (session.isTp1Taken) {
      lessons.push('Parcial 1 executada com sucesso e stop preservado no Break-Even.');
    }

    if (session.isSkewGateActive) {
      lessons.push(`Order Book Skew Gate ativado em TP1 (Bid/Ask ${session.orderBookSkewRatio?.toFixed(2) ?? '0.40'} <= 0.40): 50% liquidado preventivamente contra absorção passiva.`);
    }

    if (session.isCvdExhaustionTriggered) {
      lessons.push(`CVD Exhaustion Filter acionado em TP2 (CVD Delta ${session.cvdDeltaAtTp2Pct?.toFixed(2) ?? '-'}% < 0): TP2 antecipado a menos de 0.20% do alvo por exaustão compradora, blindando o lucro contra reversão.`);
    }

    if (session.isTp3HardFloorActive) {
      lessons.push(`Blindagem TP3 Hard Floor ativada após TP2: piso irrevogável travado em $${session.tp3HardFloorPrice} (+${session.tp3HardFloorPct}% acima da entrada), eliminando devolução de lucro no runner.`);
    }

    if (session.isRunnerAccelerationActive || session.runnerTrailingFactor === 0.988) {
      lessons.push(`Aceleração Dinâmica de Expansão no Runner (Spike Vol ${session.runnerVolumeRatio?.toFixed(2) ?? '2.5'}x > 2.5x e Upper BB): Trailing stop afrouxado temporariamente para 1.2% para respiro da vela parabólica com Hard Floor garantido.`);
    }

    if (session.isRunnerClimaxTighteningActive || session.runnerTrailingFactor === 0.995) {
      lessons.push(`Clímax e Exaustão Volumétrica no Runner: Trailing stop recapturado e apertado para 0.5% abaixo da máxima, consolidando o lucro do topo.`);
    }

    if (maePercent < -1.5) {
      lessons.push(`Drawdown flutuante MAE atingiu ${maePercent}%; considerar entrada em pullback mais profundo.`);
    } else {
      lessons.push('Excelente timing sniper: o ativo não recuou significativamente abaixo da entrada.');
    }

    if (exitEfficiency >= 75) {
      lessons.push(`Alta taxa de captura de lucro (${exitEfficiency}% do MFE máximo).`);
    } else {
      lessons.push(`O ativo expandiu até +${mfePercent}% antes da saída final; avaliar trailing stop mais folgado.`);
    }

    const aiReflection =
      `Operação encerrada via ${session.closeReason || 'MANUAL_CLOSE'} em ${durationSeconds}s. ` +
      `Resultado líquido: ${realizedPct > 0 ? '+' : ''}${realizedPct}% ($${session.realizedPnlUsd || 0} USD). ` +
      `MFE (Pico Favorável): +${mfePercent}% | MAE (Retração Suportada): ${maePercent}%. ` +
      `Eficiência de captura de topo: ${exitEfficiency}%. Classificação: ${rating}.`;

    const entry: TradeJournalEntry = {
      id: `journal-${session.id}`,
      sessionId: session.id,
      symbol: session.symbol,
      mode: session.mode,
      entryPrice,
      exitPrice,
      notionalUsd: session.notionalUsd,
      realizedPnlUsd: session.realizedPnlUsd || 0,
      realizedPnlPercent: realizedPct,
      feeDeductedUsd: session.feeDeductedUsd || 0,
      durationSeconds,
      closeReason: session.closeReason || 'MANUAL_CLOSE',
      strategy: session.strategyChosen,
      marketRegime: session.marketRegime,
      mfePrice,
      mfePercent,
      maePrice,
      maePercent,
      exitEfficiencyPct: exitEfficiency,
      aiReflection,
      rating,
      lessonsLearned: lessons,
      timestamp: Date.now(),
      isSkewGateActive: session.isSkewGateActive,
      orderBookSkewRatio: session.orderBookSkewRatio,
      isCvdExhaustionTriggered: session.isCvdExhaustionTriggered,
      cvdDeltaAtTp2Pct: session.cvdDeltaAtTp2Pct,
      tp2AnticipatedReason: session.tp2AnticipatedReason,
      isTp3HardFloorActive: session.isTp3HardFloorActive,
      tp3HardFloorPrice: session.tp3HardFloorPrice,
      tp3HardFloorPct: session.tp3HardFloorPct,
      isRunnerAccelerationActive: session.isRunnerAccelerationActive,
      isRunnerClimaxTighteningActive: session.isRunnerClimaxTighteningActive,
      runnerTrailingFactor: session.runnerTrailingFactor,
      runnerVolumeRatio: session.runnerVolumeRatio,
      runnerAccelerationReason: session.runnerAccelerationReason,
    };

    this.addJournalEntry(entry);
    return entry;
  }

  public static addJournalEntry(entry: TradeJournalEntry) {
    tradeJournalMemory.unshift(entry);
    if (tradeJournalMemory.length > 50) {
      tradeJournalMemory.pop();
    }

    try {
      import("fs").then((fs) => {
        import("path").then((path) => {
          const filePath = path.join(process.cwd(), "db", "trade_journal.json");
          fs.writeFileSync(filePath, JSON.stringify(tradeJournalMemory, null, 2), "utf-8");
        });
      }).catch(() => {});
    } catch {}
  }

  public static getTradeJournal(): TradeJournalEntry[] {
    if (tradeJournalMemory.length === 0) {
      try {
        const fs = require("fs");
        const path = require("path");
        const filePath = path.join(process.cwd(), "db", "trade_journal.json");
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf-8");
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            tradeJournalMemory.push(...parsed);
          }
        }
      } catch {}
    }
    return tradeJournalMemory;
  }

  /**
   * Reconcilia ordens abertas na exchange Binance Spot e cancela ordens não rastreadas (órfãs)
   */
  public static async reconcileOrphanOrders(
    credentials: BinanceCredentials
  ): Promise<{ cancelledOrdersCount: number; checkedAt: number; errors?: string[] }> {
    if (!credentials || !credentials.apiKey || !credentials.apiSecret) {
      return { cancelledOrdersCount: 0, checkedAt: Date.now() };
    }

    // Ambiente conforme a credencial: credencial de testnet nunca cancela ordens na conta real.
    const baseUrl = credentials.testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com';
    const errors: string[] = [];

    try {
      const activeSymbols = new Set(
        Array.from(activeSessions.values())
          .filter((s) => s.status === 'ACTIVE' || s.status === 'WAITING_TRIGGER')
          .map((s) => s.symbol)
      );

      const recent = this.getCooldownSymbols();
      let cancelledCount = 0;

      for (const sym of recent) {
        if (!activeSymbols.has(sym)) {
          try {
            const timestamp = await getBinanceTimestamp(baseUrl);
            const queryString = `symbol=${sym}&timestamp=${timestamp}&recvWindow=${BINANCE_RECV_WINDOW_MS}`;
            const crypto = await import("crypto");
            const signature = crypto.createHmac("sha256", credentials.apiSecret).update(queryString).digest("hex");

            const cancelRes = await fetch(
              `${baseUrl}/api/v3/openOrders?${queryString}&signature=${signature}`,
              {
                method: "DELETE",
                headers: { "X-MBX-APIKEY": credentials.apiKey },
              }
            );
            if (cancelRes.ok) {
              const resJson = await cancelRes.json();
              if (Array.isArray(resJson)) {
                cancelledCount += resJson.length;
              }
            } else {
              const body = await cancelRes.text().catch(() => '');
              errors.push(`${sym}: HTTP ${cancelRes.status} ${body.slice(0, 200)}`);
            }
          } catch (err: any) {
            errors.push(`${sym}: ${err?.message || err}`);
          }
        }
      }

      if (errors.length > 0) {
        console.warn('[DirectOperationManager] Falhas ao cancelar ordens órfãs:', errors);
      }
      return { cancelledOrdersCount: cancelledCount, checkedAt: Date.now(), errors };
    } catch (err: any) {
      errors.push(err?.message || String(err));
      console.warn('[DirectOperationManager] Falha na reconciliação de ordens órfãs:', errors);
      return { cancelledOrdersCount: 0, checkedAt: Date.now(), errors };
    }
  }

  /**
   * Limpa sessões expiradas da memória
   */
  public static clearSession(sessionId: string): boolean {
    return activeSessions.delete(sessionId);
  }

  /**
   * Atualiza propriedades de sessão em memória exclusivamente para cenários de testes
   */
  public static updateSessionForTesting(sessionId: string, updates: Partial<DirectOperationSession>): boolean {
    const session = activeSessions.get(sessionId);
    if (!session) return false;
    Object.assign(session, updates);
    return true;
  }

  /**
   * Cria uma sessão mockada em memória exclusivamente para cenários de testes
   */
  public static createSessionForTesting(overrides: Partial<DirectOperationSession>): DirectOperationSession {
    const id = overrides.id || `test-session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const session: DirectOperationSession = {
      id,
      symbol: overrides.symbol || 'BTCUSDT',
      baseCurrency: 'BTC',
      quoteCurrency: 'USDT',
      investedAmountUsd: 50.0,
      durationMinutes: 15,
      startTime: now,
      endTime: now + 15 * 60 * 1000,
      entryPrice: overrides.entryPrice || 60000,
      targetPrice: overrides.targetPrice || 61000,
      stopLossPrice: overrides.stopLossPrice || 59000,
      quantity: 0.001,
      notionalUsd: 50.0,
      riskUsd: 1.0,
      rewardRiskRatio: 2.0,
      aiScore: 85,
      mode: 'paper',
      status: overrides.status || 'WAITING_TRIGGER',
      currentPrice: overrides.entryPrice || 60000,
      unrealizedPnlUsd: 0,
      unrealizedPnlPercent: 0,
      rationale: 'Teste unitário automatizado',
      ...overrides,
    };
    activeSessions.set(id, session);
    return session;
  }
}
