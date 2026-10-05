import type { StateCreator } from "zustand";
import type { TradeData, AISignalData, ChatMessage, BotLogEntry } from "./types";

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

  // AI Signals
  aiSignals: AISignalData[];
  setAiSignals: (signals: AISignalData[]) => void;
  addAiSignal: (signal: AISignalData) => void;

  // Chat messages
  chatMessages: ChatMessage[];
  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;
}

export const createTradeSlice: StateCreator<TradeSlice, [], [], TradeSlice> = (set) => ({
  // Bot status
  botActive: false,
  setBotActive: (active) => set({ botActive: active }),

  // Multi-bot status
  activeBots: [
    {
      id: "bot_1",
      name: "ScalpingBTC",
      symbol: "BTCUSDT",
      strategy: "AI" as BotStrategy,
      pnl: 125.40,
      status: "RUNNING" as const,
      parameters: { gridLevels: "10", useKelly: "true" },
      allocatedMargin: 250.0,
      shadowMode: false,
      regime: "TREND" as MarketRegime,
      heartbeatAt: Date.now(),
      varContribution: 12.5,
      executionProgress: undefined
    },
    {
      id: "bot_2",
      name: "GridETH",
      symbol: "ETHUSDT",
      strategy: "Grid" as BotStrategy,
      pnl: -45.20,
      status: "PAUSED" as const,
      parameters: { gridLevels: "20", upperBound: "3200", lowerBound: "2800" },
      allocatedMargin: 250.0,
      shadowMode: true,
      regime: "RANGE" as MarketRegime,
      heartbeatAt: Date.now(),
      varContribution: 8.2,
      executionProgress: undefined
    },
    {
      id: "bot_3",
      name: "TWAP_SOL",
      symbol: "SOLUSDT",
      strategy: "TWAP" as BotStrategy,
      pnl: 18.60,
      status: "RUNNING" as const,
      parameters: { totalVolume: "10", intervalMinutes: "12", totalSlices: "10" },
      allocatedMargin: 250.0,
      shadowMode: false,
      regime: "UNKNOWN" as MarketRegime,
      heartbeatAt: Date.now(),
      varContribution: 5.0,
      executionProgress: {
        slicesDone: 3,
        totalSlices: 10,
        executedVolume: 3,
        remainingVolume: 7,
        estimatedMinutesLeft: 84
      }
    }
  ] as BotInstance[],
  marginLedger: {
    totalAccount: 1000.0,
    allocatedMargin: 750.0,
    freeMargin: 250.0,
    drawdownLimit: 900.0,
    currentDrawdown: 45.20,
    peakEquity: 1125.40,
    totalVaR: 25.7
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
  aiSuggestions: [
    {
      id: "sug_1",
      symbol: "ETHUSDT",
      strategy: "OBI" as BotStrategy,
      title: "Assimetria detectada — ETH/USDT",
      reasoning: "Order Book mostra desequilíbrio 3:1 no lado comprador. ATR em expansão (+18%). Janela de 4h favorável.",
      currentRiskPct: 2.0,
      proposedRiskPct: 3.5,
      parameters: { threshold: "0.65", atrMultiplier: "1.5" },
      sharpeExpected: 1.42,
      drawdownExpected: 0.08,
      status: "PENDING",
      createdAt: Date.now() - 120000
    },
    {
      id: "sug_2",
      symbol: "BTCUSDT",
      strategy: "Grid" as BotStrategy,
      title: "Range identificado — BTC/USDT",
      reasoning: "ADX=14 (Range). BB Width contraindo. Grid de 20 níveis entre $59k–$62k com R/R 2.1:1.",
      currentRiskPct: 1.5,
      proposedRiskPct: 2.0,
      parameters: { gridLevels: "20", upperBound: "62000", lowerBound: "59000" },
      sharpeExpected: 0.98,
      drawdownExpected: 0.05,
      status: "PENDING",
      createdAt: Date.now() - 300000
    }
  ] as AISuggestion[],
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
      const newLog: BotLogEntry = {
        ...log,
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
      };
      return { botLogs: [newLog, ...state.botLogs].slice(0, 100) };
    }),

  // AI Signals
  aiSignals: [],
  setAiSignals: (signals) => set({ aiSignals: signals }),
  addAiSignal: (signal) =>
    set((state) => ({
      aiSignals: [signal, ...state.aiSignals],
    })),

  // Chat messages
  chatMessages: [],
  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, message],
    })),
  clearChat: () => set({ chatMessages: [] }),
});
