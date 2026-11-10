import type { StateCreator } from "zustand";
import type { TradeData, AISignalData, ChatMessage, BotLogEntry, StructuredLogEntry, LogChannel, LogSeverity, RiskProfile } from "./types";
import { structuredLogger } from "../telemetry/structured-logger";

// ─── Strategy Types ───────────────────────────────────────────────────────────
export type BotStrategy =
  | "AI"
  | "RSI"
  | "MACD"
  | "TWAP"
  | "VWAP"
  | "Grid"
  | "OBI"
  | "MeanReversion"
  | "PairsTrading"
  | "DCA"
  | "Sniper"
  | "Kelly";

export type MarketRegime = "TREND" | "RANGE" | "CHAOS" | "UNKNOWN";

// ─── Execution Progress (for TWAP/VWAP slicing) ───────────────────────────────
export interface ExecutionProgress {
  slicesDone: number;
  totalSlices: number;
  executedVolume: number;
  remainingVolume: number;
  estimatedMinutesLeft: number;
}

// ─── AI Suggestion (Decision Gate) ────────────────────────────────────────────
export interface AISuggestion {
  id: string;
  symbol: string;
  strategy: BotStrategy;
  title: string;
  reasoning: string;
  currentRiskPct: number;   // e.g. 2.0
  proposedRiskPct: number;  // e.g. 3.5
  parameters: Record<string, string>;
  sharpeExpected: number;
  drawdownExpected: number;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  createdAt: number;
}

// ─── Bot Instance ─────────────────────────────────────────────────────────────
export interface BotInstance {
  id: string;
  name: string;
  symbol: string;
  strategy: BotStrategy | string;
  pnl: number;
  status: "RUNNING" | "PAUSED" | "ERROR";
  parameters: Record<string, string>;
  allocatedMargin: number;
  shadowMode: boolean;                       // paper trading flag
  regime: MarketRegime;                      // last detected regime
  executionProgress?: ExecutionProgress;     // for TWAP/VWAP
  heartbeatAt: number;                       // for watchdog
  varContribution: number;                   // VaR allocated to this bot
}

// ─── Margin Ledger ────────────────────────────────────────────────────────────
export interface MarginLedger {
  totalAccount: number;
  allocatedMargin: number;
  freeMargin: number;
  drawdownLimit: number;    // user-set safety floor in $
  currentDrawdown: number;  // current $ drawdown from peak
  peakEquity: number;       // all-time high equity for drawdown calc
  totalVaR: number;         // aggregated portfolio VaR
}

export interface TradeSlice {
  // Bot status (legacy single bot)
  botActive: boolean;
  setBotActive: (active: boolean) => void;

  // Multi-bot status
  activeBots: BotInstance[];
  marginLedger: MarginLedger;
  addBotInstance: (bot: Omit<BotInstance, "id" | "pnl" | "status" | "regime" | "heartbeatAt" | "varContribution"> & { shadowMode?: boolean }) => void;
  toggleBotInstance: (id: string) => void;
  removeBotInstance: (id: string) => void;
  updateBotPnls: (tickers: Record<string, any>) => void;
  updateBotHeartbeat: (id: string) => void;
  updateBotRegime: (id: string, regime: MarketRegime) => void;
  updateBotProgress: (id: string, progress: ExecutionProgress) => void;
  killAllBots: () => void;

  // AI Suggestions (Decision Gate)
  aiSuggestions: AISuggestion[];
  addAiSuggestion: (s: Omit<AISuggestion, "id" | "createdAt" | "status">) => void;
  resolveAiSuggestion: (id: string, accept: boolean) => void;

  // Trades
  trades: TradeData[];
  setTrades: (trades: TradeData[]) => void;
  addTrade: (trade: TradeData) => void;

  // Bot Logs
  botLogs: BotLogEntry[];
  addBotLog: (log: Omit<BotLogEntry, 'id' | 'timestamp'>) => void;
  clearBotLogs: () => void;

  // Structured Telemetry Logs
  structuredLogs: StructuredLogEntry[];
  addStructuredLog: (entry: Omit<StructuredLogEntry, "id" | "formattedTime">) => void;
  clearStructuredLogs: () => void;

  // Ergonomia & Telemetria Desktop
  isLogAutoScrollPaused: boolean;
  toggleLogAutoScroll: (paused?: boolean) => void;
  activeRiskProfile: RiskProfile;
  setActiveRiskProfile: (profile: RiskProfile) => void;
  isMarketDataStale: boolean;
  setIsMarketDataStale: (stale: boolean) => void;

  // AI Signals
  aiSignals: AISignalData[];
  setAiSignals: (signals: AISignalData[]) => void;
  addAiSignal: (signal: AISignalData) => void;

  // Chat messages
  chatMessages: ChatMessage[];
  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;
}

export const createTradeSlice: StateCreator<any, [], [], TradeSlice> = (set, get) => ({
  // Bot status
  botActive: false,
  setBotActive: (active) => set({ botActive: active }),

  // Multi-bot status
  activeBots: [] as BotInstance[],
  marginLedger: {
    totalAccount: 10000.0,
    allocatedMargin: 0.0,
    freeMargin: 10000.0,
    drawdownLimit: 300.0,
    currentDrawdown: 0.0,
    peakEquity: 10000.0,
    totalVaR: 0.0
  },

  addBotInstance: (bot) =>
    set((state) => {
      const newBot: BotInstance = {
        ...bot,
        id: `bot_${Date.now()}`,
        pnl: 0,
        status: "RUNNING",
        shadowMode: bot.shadowMode ?? false,
        regime: "UNKNOWN",
        heartbeatAt: Date.now(),
        varContribution: bot.allocatedMargin * 0.024 * 1.65 // 95% VaR estimate
      };
      const updatedBots = [...state.activeBots, newBot];
      const newAllocated = state.marginLedger.allocatedMargin + bot.allocatedMargin;
      const free = state.marginLedger.totalAccount - newAllocated;
      const newTotalVaR = state.marginLedger.totalVaR + newBot.varContribution;
      return {
        activeBots: updatedBots,
        marginLedger: {
          ...state.marginLedger,
          allocatedMargin: newAllocated,
          freeMargin: free,
          totalVaR: newTotalVaR
        }
      };
    }),

  toggleBotInstance: (id) =>
    set((state) => {
      const updatedBots = state.activeBots.map((bot) => {
        if (bot.id === id) {
          const newStatus: "RUNNING" | "PAUSED" | "ERROR" =
            bot.status === "RUNNING" ? "PAUSED" : "RUNNING";
          return { ...bot, status: newStatus, heartbeatAt: Date.now() };
        }
        return bot;
      });
      return { activeBots: updatedBots };
    }),

  removeBotInstance: (id) =>
    set((state) => {
      const targetBot = state.activeBots.find((b) => b.id === id);
      const updatedBots = state.activeBots.filter((bot) => bot.id !== id);
      const returnedMargin = targetBot ? targetBot.allocatedMargin : 0;
      const returnedVaR = targetBot ? targetBot.varContribution : 0;
      const newAllocated = Math.max(0, state.marginLedger.allocatedMargin - returnedMargin);
      const free = state.marginLedger.totalAccount - newAllocated;
      return {
        activeBots: updatedBots,
        marginLedger: {
          ...state.marginLedger,
          allocatedMargin: newAllocated,
          freeMargin: free,
          totalVaR: Math.max(0, state.marginLedger.totalVaR - returnedVaR)
        }
      };
    }),

  // Kill Switch — pausa todos os bots e zera posições
  killAllBots: () =>
    set((state) => ({
      activeBots: state.activeBots.map((b) => ({ ...b, status: "PAUSED" as const })),
    })),

  // Watchdog — atualiza heartbeat
  updateBotHeartbeat: (id) =>
    set((state) => ({
      activeBots: state.activeBots.map((b) =>
        b.id === id ? { ...b, heartbeatAt: Date.now() } : b
      )
    })),

  // Regime detector update
  updateBotRegime: (id, regime) =>
    set((state) => ({
      activeBots: state.activeBots.map((b) =>
        b.id === id ? { ...b, regime } : b
      )
    })),

  // TWAP/VWAP progress
  updateBotProgress: (id, progress) =>
    set((state) => ({
      activeBots: state.activeBots.map((b) =>
        b.id === id ? { ...b, executionProgress: progress } : b
      )
    })),

  updateBotPnls: (tickers) =>
    set((state) => {
      const updatedBots = state.activeBots.map((bot) => {
        const t = tickers[bot.symbol];
        if (t && bot.status === "RUNNING") {
          const change = (t.priceChangePercent || 0) * 0.1;
          const newPnl = bot.pnl + change;
          return { ...bot, pnl: newPnl };
        }
        return bot;
      });
      // Recalculate global drawdown
      const totalPnl = updatedBots.reduce((s, b) => s + b.pnl, 0);
      const currentEquity = state.marginLedger.totalAccount + totalPnl;
      const peakEquity = Math.max(state.marginLedger.peakEquity, currentEquity);
      const currentDrawdown = Math.max(0, peakEquity - currentEquity);
      return {
        activeBots: updatedBots,
        marginLedger: { ...state.marginLedger, currentDrawdown, peakEquity }
      };
    }),

  // AI Suggestions (Decision Gate)
  aiSuggestions: [] as AISuggestion[],
  addAiSuggestion: (s) =>
    set((state) => ({
      aiSuggestions: [
        { ...s, id: `sug_${Date.now()}`, createdAt: Date.now(), status: "PENDING" as const },
        ...state.aiSuggestions
      ].slice(0, 20)
    })),
  resolveAiSuggestion: (id, accept) =>
    set((state) => ({
      aiSuggestions: state.aiSuggestions.map((s) =>
        s.id === id ? { ...s, status: (accept ? "ACCEPTED" : "REJECTED") as AISuggestion["status"] } : s
      )
    })),

  // Trades
  trades: [],
  setTrades: (trades) => set({ trades }),
  addTrade: (trade) =>
    set((state) => ({
      trades: [trade, ...state.trades],
    })),

  // Bot Logs
  botLogs: [],
  addBotLog: (log) =>
    set((state) => {
      const now = Date.now();
      const newLog: BotLogEntry = {
        ...log,
        id: `log-${now}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: now,
      };

      // Mapeia automaticamente para o canal e severidade do StructuredLogger
      let channel: LogChannel = log.channel || "SIGNALS";
      if (!log.channel) {
        if (log.type === "system") channel = "RISK_ENGINE";
        else if (log.type === "buy" || log.type === "sell") channel = "BINANCE_API";
        else if (log.message.includes("book") || log.message.includes("spread") || log.message.includes("tick")) channel = "MARKET_DATA";
      }

      let severity: LogSeverity = log.severity || "INFO";
      if (!log.severity) {
        if (log.type === "error") severity = "ERROR";
        else if (log.type === "warning") severity = "WARN";
        else if (log.type === "loss" && (log.message.includes("Stop-Loss") || log.message.includes("Circuit Breaker"))) severity = "CRITICAL";
      }

      structuredLogger.log(channel, severity, log.message, {
        botId: log.botId,
        botName: log.botName,
        timestamp: now,
      });

      return {
        botLogs: [newLog, ...state.botLogs].slice(0, 1500),
        structuredLogs: structuredLogger.getEntries(),
      };
    }),
  clearBotLogs: () => {
    structuredLogger.clear();
    set({ botLogs: [], structuredLogs: [] });
  },

  // Structured Telemetry Logs
  structuredLogs: [],
  addStructuredLog: (entry) => {
    structuredLogger.log(entry.channel, entry.severity, entry.message, {
      botId: entry.botId,
      botName: entry.botName,
      symbol: entry.symbol,
      metadata: entry.metadata,
      timestamp: entry.timestamp,
    });
    set({ structuredLogs: structuredLogger.getEntries() });
  },
  clearStructuredLogs: () => {
    structuredLogger.clear();
    set({ structuredLogs: [] });
  },

  // Ergonomia & Telemetria Desktop
  isLogAutoScrollPaused: false,
  toggleLogAutoScroll: (paused) =>
    set((state) => ({
      isLogAutoScrollPaused: paused !== undefined ? paused : !state.isLogAutoScrollPaused,
    })),

  activeRiskProfile: "conservative",
  setActiveRiskProfile: (profile) => set({ activeRiskProfile: profile }),

  isMarketDataStale: false,
  setIsMarketDataStale: (stale) => set({ isMarketDataStale: stale }),

  // AI Signals
  aiSignals: [],
  setAiSignals: (signals) => set({ aiSignals: signals }),
  addAiSignal: (signal) => {
    const state = (get as any)();
    if (
      state.botActive &&
      state.botConfig?.autoTradeSignals &&
      signal.action &&
      signal.action !== "HOLD" &&
      signal.confidence >= (state.botConfig.signalConfidenceThreshold / 100)
    ) {
      const cleanSym = signal.symbol.endsWith("USDT") ? signal.symbol : `${signal.symbol}USDT`;
      const curPrice =
        state.tickers?.[cleanSym]?.price ||
        state.tickers?.[signal.symbol]?.price ||
        signal.priceAtSignal ||
        100;
      const total = 100;
      const quantity = parseFloat((total / curPrice).toFixed(6));

      if (typeof window !== "undefined" && typeof fetch === "function") {
        fetch("/api/trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: cleanSym,
            side: signal.action === "SELL" ? "SELL" : "BUY",
            price: curPrice,
            quantity,
            total,
            strategy: "AI-Signal",
            mode: state.tradingMode || "paper",
            slippageTolerance: 50,
            pnl: 0,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.data && typeof state.addTrade === "function") {
              state.addTrade(data.data);
            }
          })
          .catch(() => {});
      }
    }

    set((s) => ({
      aiSignals: [signal, ...s.aiSignals],
    }));
  },

  // Chat messages
  chatMessages: [],
  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, message],
    })),
  clearChat: () => set({ chatMessages: [] }),
});
