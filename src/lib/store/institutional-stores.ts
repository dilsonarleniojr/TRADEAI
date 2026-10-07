import { create } from "zustand";

// ============================================================================
// 1. usePnLStore: Telemetria de PnL Líquido Real-Time & Série Temporal
// ============================================================================

export type PnLEventType = "BUY" | "SELL" | "BREAK_EVEN" | "CIRCUIT_BREAKER" | "AI_ALERT";

export interface PnLDataPoint {
  timestamp: number;
  timeFormatted: string;
  netPnl: number;
  grossPnl: number;
  eventMarker?: PnLEventType;
  eventLabel?: string;
  strategy?: string;
}

export interface PnLState {
  totalNetPnl: number;
  totalGrossPnl: number;
  totalFees: number;
  totalSlippage: number;
  intradayChangePercent: number;
  trend5mNet: number;
  trend1hNet: number;
  trend24hNet: number;
  zoom: "5m" | "1h" | "24h" | "7d";
  pnlSeries: PnLDataPoint[];
  lastUpdateTimestamp: number;

  setZoom: (zoom: "5m" | "1h" | "24h" | "7d") => void;
  updateGlobalPnL: (metrics: Partial<PnLState>) => void;
  addPnlPoint: (point: PnLDataPoint) => void;
  setSeries: (series: PnLDataPoint[]) => void;
}

export const usePnLStore = create<PnLState>((set) => ({
  totalNetPnl: 0,
  totalGrossPnl: 0,
  totalFees: 0,
  totalSlippage: 0,
  intradayChangePercent: 0,
  trend5mNet: 0,
  trend1hNet: 0,
  trend24hNet: 0,
  zoom: "1h",
  pnlSeries: [],
  lastUpdateTimestamp: Date.now(),

  setZoom: (zoom) => set({ zoom }),
  updateGlobalPnL: (metrics) =>
    set((state) => ({
      ...state,
      ...metrics,
      lastUpdateTimestamp: Date.now(),
    })),
  addPnlPoint: (point) =>
    set((state) => {
      // Manter até 500 pontos no buffer de alta resolução
      const nextSeries = [...state.pnlSeries, point].slice(-500);
      return { pnlSeries: nextSeries, lastUpdateTimestamp: Date.now() };
    }),
  setSeries: (series) => set({ pnlSeries: series, lastUpdateTimestamp: Date.now() }),
}));

// ============================================================================
// 2. useStrategyStore: Desempenho e Governança das Estratégias
// ============================================================================

export interface StrategyCardItem {
  name: string;
  key: string;
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  drawTrades: number;
  winRateNet: number;
  grossPnl: number;
  feesPaid: number;
  slippageEstimated: number;
  netPnl: number;
  payoffRatio: number;
  maxDrawdownPercent: number;
  status: "lucrativa" | "em_calibracao" | "deficitaria";
  statusEmoji: string;
  lastUpdated?: string;
}

export interface StrategyState {
  strategies: StrategyCardItem[];
  selectedStrategyKey: string | null;
  setSelectedStrategy: (key: string | null) => void;
  setStrategies: (strategies: StrategyCardItem[]) => void;
  updateStrategy: (key: string, patch: Partial<StrategyCardItem>) => void;
}

export const useStrategyStore = create<StrategyState>((set) => ({
  strategies: [
    {
      name: "Breakout Fleet",
      key: "BREAKOUT",
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      drawTrades: 0,
      winRateNet: 0,
      grossPnl: 0,
      feesPaid: 0,
      slippageEstimated: 0,
      netPnl: 0,
      payoffRatio: 0,
      maxDrawdownPercent: 0,
      status: "em_calibracao",
      statusEmoji: "🛡️",
    },
    {
      name: "RSI Reversal",
      key: "RSI",
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      drawTrades: 0,
      winRateNet: 0,
      grossPnl: 0,
      feesPaid: 0,
      slippageEstimated: 0,
      netPnl: 0,
      payoffRatio: 0,
      maxDrawdownPercent: 0,
      status: "em_calibracao",
      statusEmoji: "🛡️",
    },
    {
      name: "Grid Scalper",
      key: "GRID",
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      drawTrades: 0,
      winRateNet: 0,
      grossPnl: 0,
      feesPaid: 0,
      slippageEstimated: 0,
      netPnl: 0,
      payoffRatio: 0,
      maxDrawdownPercent: 0,
      status: "em_calibracao",
      statusEmoji: "🛡️",
    },
    {
      name: "Momentum MACD",
      key: "MACD",
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      drawTrades: 0,
      winRateNet: 0,
      grossPnl: 0,
      feesPaid: 0,
      slippageEstimated: 0,
      netPnl: 0,
      payoffRatio: 0,
      maxDrawdownPercent: 0,
      status: "em_calibracao",
      statusEmoji: "🛡️",
    },
    {
      name: "Quant Ensemble",
      key: "QUANT_ENSEMBLE",
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      drawTrades: 0,
      winRateNet: 0,
      grossPnl: 0,
      feesPaid: 0,
      slippageEstimated: 0,
      netPnl: 0,
      payoffRatio: 0,
      maxDrawdownPercent: 0,
      status: "em_calibracao",
      statusEmoji: "🛡️",
    },
    {
      name: "Mean Reversion",
      key: "MEAN_REVERSION",
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      drawTrades: 0,
      winRateNet: 0,
      grossPnl: 0,
      feesPaid: 0,
      slippageEstimated: 0,
      netPnl: 0,
      payoffRatio: 0,
      maxDrawdownPercent: 0,
      status: "em_calibracao",
      statusEmoji: "🛡️",
    },
  ],
  selectedStrategyKey: null,
  setSelectedStrategy: (key) => set({ selectedStrategyKey: key }),
  setStrategies: (strategies) => set({ strategies }),
  updateStrategy: (key, patch) =>
    set((state) => ({
      strategies: state.strategies.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    })),
}));

// ============================================================================
// 3. useAlertStore: Alertas Inteligentes Preditivos com IA
// ============================================================================

export type AlertSeverity = "info" | "atencao" | "risco" | "critico";
export type AlertCategory = "PnL" | "Risco" | "Slippage" | "OFI" | "Saúde";

export interface InstitutionalAlert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  score: number; // 0 - 100
  title: string;
  prediction: string;
  triggerReason: string;
  recommendedAction: string;
  context: {
    strategy?: string;
    pair?: string;
    botId?: string;
  };
  timestamp: string;
  isRead?: boolean;
}

export interface AlertState {
  alerts: InstitutionalAlert[];
  filterSeverity: "all" | AlertSeverity;
  criticalPulseActive: boolean;
  setFilterSeverity: (sev: "all" | AlertSeverity) => void;
  addAlert: (alert: InstitutionalAlert) => void;
  setAlerts: (alerts: InstitutionalAlert[]) => void;
  markAsRead: (id: string) => void;
  clearAlerts: () => void;
  dismissCriticalPulse: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  filterSeverity: "all",
  criticalPulseActive: false,
  setFilterSeverity: (filterSeverity) => set({ filterSeverity }),
  addAlert: (alert) =>
    set((state) => {
      const isCritical = alert.severity === "critico";
      return {
        alerts: [alert, ...state.alerts.filter((a) => a.id !== alert.id)].slice(0, 200),
        criticalPulseActive: isCritical ? true : state.criticalPulseActive,
      };
    }),
  setAlerts: (alerts) =>
    set((state) => ({
      alerts,
      criticalPulseActive: alerts.some((a) => a.severity === "critico") ? true : state.criticalPulseActive,
    })),
  markAsRead: (id) =>
    set((state) => ({
      alerts: state.alerts.map((a) => (a.id === id ? { ...a, isRead: true } : a)),
    })),
  clearAlerts: () => set({ alerts: [], criticalPulseActive: false }),
  dismissCriticalPulse: () => set({ criticalPulseActive: false }),
}));

// ============================================================================
// 4. useMicrostructureStore: Livro L2 Binance, OFI, Spread & Predições
// ============================================================================

export interface DepthLevel {
  price: number;
  amount: number;
  total: number;
}

export interface MicrostructureData {
  symbol: string;
  bestBid: number;
  bestAsk: number;
  spreadPercent: number;
  orderFlowImbalance: number; // -1.0 a +1.0
  bidVolumeUsd: number;
  askVolumeUsd: number;
  aggressiveBuyVolumeUsd: number;
  aggressiveSellVolumeUsd: number;
  estimatedSlippagePercent: number;
  depthBids: DepthLevel[];
  depthAsks: DepthLevel[];
  predictiveAlert: "NORMAL" | "ROMPIMENTO" | "REVERSAO" | "COLAPSO_LIQUIDEZ";
  predictiveConfidence: number; // 0 - 100%
  lastUpdate: number;
}

export interface MicrostructureState {
  pairs: Record<string, MicrostructureData>;
  activeSymbol: string;
  setActiveSymbol: (symbol: string) => void;
  updateMicrostructure: (symbol: string, data: Partial<MicrostructureData>) => void;
  setAllMicrostructures: (data: Record<string, MicrostructureData>) => void;
}

export const useMicrostructureStore = create<MicrostructureState>((set) => ({
  pairs: {},
  activeSymbol: "BTCUSDT",
  setActiveSymbol: (activeSymbol) => set({ activeSymbol }),
  updateMicrostructure: (symbol, data) =>
    set((state) => {
      const current = state.pairs[symbol] || {
        symbol,
        bestBid: 0,
        bestAsk: 0,
        spreadPercent: 0,
        orderFlowImbalance: 0,
        bidVolumeUsd: 0,
        askVolumeUsd: 0,
        aggressiveBuyVolumeUsd: 0,
        aggressiveSellVolumeUsd: 0,
        estimatedSlippagePercent: 0,
        depthBids: [],
        depthAsks: [],
        predictiveAlert: "NORMAL" as const,
        predictiveConfidence: 85,
        lastUpdate: Date.now(),
      };
      return {
        pairs: {
          ...state.pairs,
          [symbol]: { ...current, ...data, lastUpdate: Date.now() },
        },
      };
    }),
  setAllMicrostructures: (pairs) => set({ pairs }),
}));

// ============================================================================
// 5. useExecutionStore: Telemetria de Execução, Slippage & Latência
// ============================================================================

export interface ExecutionRecord {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  total: number;
  feesPaid: number;
  slippageL2: number;
  slippagePercent: number;
  netPnl: number;
  holdingTimeMinutes?: number;
  decisionToOrderLatencyMs: number;
  timestamp: string;
  strategy: string;
}

export interface ExecutionState {
  avgSlippageLast10Percent: number;
  dailyCumulativeFeesUsd: number;
  decisionToOrderLatencyP50Ms: number;
  decisionToOrderLatencyP95Ms: number;
  rejectedOrdersCount: number;
  recentExecutions: ExecutionRecord[];
  updateExecutionMetrics: (metrics: Partial<ExecutionState>) => void;
  addExecutionRecord: (exec: ExecutionRecord) => void;
}

export const useExecutionStore = create<ExecutionState>((set) => ({
  avgSlippageLast10Percent: 0.05,
  dailyCumulativeFeesUsd: 0,
  decisionToOrderLatencyP50Ms: 12,
  decisionToOrderLatencyP95Ms: 28,
  rejectedOrdersCount: 0,
  recentExecutions: [],
  updateExecutionMetrics: (metrics) => set((state) => ({ ...state, ...metrics })),
  addExecutionRecord: (exec) =>
    set((state) => ({
      recentExecutions: [exec, ...state.recentExecutions].slice(0, 100),
    })),
}));

// ============================================================================
// 6. useBotHealthStore: Concorrência, Mutex, Binance Status & SQLite WAL
// ============================================================================

export type GlobalFleetState = "active" | "observation" | "paused";

export interface BotHealthState {
  globalBotState: GlobalFleetState;
  activeBotsCount: number;
  observationBotsCount: number;
  pausedBotsCount: number;
  totalBotsCount: number;
  mutexBuysCount: number;
  mutexSellsCount: number;
  zeroDuplicatesActive: boolean;
  binanceErrorCount: number;
  lastBinanceError?: string;
  executionFrequencyPerMin: number;
  wsState: "connected" | "connecting" | "disconnected";
  sqliteWalStatus: "WAL_SYNCED" | "CHECKPOINTING" | "ERROR";
  sqliteDivergenceDetected: boolean;
  sqliteAuditedTradesCount: number;
  circuitBreakerTripped: boolean;
  circuitBreakerReason?: string;
  circuitBreakerLossUsd: number;
  circuitBreakerLimitUsd: number;

  setGlobalFleetState: (state: GlobalFleetState) => void;
  updateHealthMetrics: (metrics: Partial<BotHealthState>) => void;
}

export const useBotHealthStore = create<BotHealthState>((set) => ({
  globalBotState: "active",
  activeBotsCount: 6,
  observationBotsCount: 0,
  pausedBotsCount: 0,
  totalBotsCount: 6,
  mutexBuysCount: 0,
  mutexSellsCount: 0,
  zeroDuplicatesActive: true,
  binanceErrorCount: 0,
  executionFrequencyPerMin: 14,
  wsState: "connected",
  sqliteWalStatus: "WAL_SYNCED",
  sqliteDivergenceDetected: false,
  sqliteAuditedTradesCount: 0,
  circuitBreakerTripped: false,
  circuitBreakerLossUsd: 0,
  circuitBreakerLimitUsd: 15,

  setGlobalFleetState: (globalBotState) => set({ globalBotState }),
  updateHealthMetrics: (metrics) => set((state) => ({ ...state, ...metrics })),
}));
