import type { StateCreator } from "zustand";
import type { TradeData, AISignalData, ChatMessage, BotLogEntry } from "./types";

export interface BotInstance {
  id: string;
  name: string;
  symbol: string;
  strategy: string;
  pnl: number;
  status: "RUNNING" | "PAUSED" | "ERROR";
  parameters: Record<string, string>;
  allocatedMargin: number;
}

export interface MarginLedger {
  totalAccount: number;
  allocatedMargin: number;
  freeMargin: number;
}

export interface TradeSlice {
  // Bot status (legacy single bot)
  botActive: boolean;
  setBotActive: (active: boolean) => void;

  // Multi-bot status
  activeBots: BotInstance[];
  marginLedger: MarginLedger;
  addBotInstance: (bot: Omit<BotInstance, "id" | "pnl" | "status">) => void;
  toggleBotInstance: (id: string) => void;
  removeBotInstance: (id: string) => void;
  updateBotPnls: (tickers: Record<string, any>) => void;

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
      strategy: "AI",
      pnl: 125.40,
      status: "RUNNING",
      parameters: { "gridLevels": "10", "useKelly": "true" },
      allocatedMargin: 250.0
    },
    {
      id: "bot_2",
      name: "GridETH",
      symbol: "ETHUSDT",
      strategy: "RSI",
      pnl: -45.20,
      status: "PAUSED",
      parameters: { "rsiPeriod": "14", "buyThreshold": "30" },
      allocatedMargin: 250.0
    },
    {
      id: "bot_3",
      name: "MeanReversionSOL",
      symbol: "SOLUSDT",
      strategy: "MACD",
      pnl: 0.0,
      status: "ERROR",
      parameters: { "emaFast": "9", "emaSlow": "21" },
      allocatedMargin: 250.0
    }
  ],
  marginLedger: {
    totalAccount: 1000.0,
    allocatedMargin: 750.0,
    freeMargin: 250.0
  },

  addBotInstance: (bot) =>
    set((state) => {
      const newBot: BotInstance = {
        ...bot,
        id: `bot_${Date.now()}`,
        pnl: 0,
        status: "RUNNING"
      };
      const updatedBots = [...state.activeBots, newBot];
      const newAllocated = state.marginLedger.allocatedMargin + bot.allocatedMargin;
      const free = state.marginLedger.totalAccount - newAllocated;
      return {
        activeBots: updatedBots,
        marginLedger: {
          ...state.marginLedger,
          allocatedMargin: newAllocated,
          freeMargin: free
        }
      };
    }),

  toggleBotInstance: (id) =>
    set((state) => {
      const updatedBots = state.activeBots.map((bot) => {
        if (bot.id === id) {
          const newStatus: "RUNNING" | "PAUSED" | "ERROR" =
            bot.status === "RUNNING" ? "PAUSED" : "RUNNING";
          return { ...bot, status: newStatus };
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
      const newAllocated = Math.max(0, state.marginLedger.allocatedMargin - returnedMargin);
      const free = state.marginLedger.totalAccount - newAllocated;
      return {
        activeBots: updatedBots,
        marginLedger: {
          ...state.marginLedger,
          allocatedMargin: newAllocated,
          freeMargin: free
        }
      };
    }),

  updateBotPnls: (tickers) =>
    set((state) => {
      const updatedBots = state.activeBots.map((bot) => {
        const t = tickers[bot.symbol];
        if (t && bot.status === "RUNNING") {
          // Generate small dynamic fluctuation for demo purposes based on ticker change
          const change = (t.priceChangePercent || 0) * 0.1;
          return { ...bot, pnl: bot.pnl + change };
        }
        return bot;
      });
      return { activeBots: updatedBots };
    }),

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
