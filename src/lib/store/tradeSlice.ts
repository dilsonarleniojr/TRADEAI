import type { StateCreator } from "zustand";
import type { TradeData, AISignalData, ChatMessage, BotLogEntry } from "./types";

export interface TradeSlice {
  // Bot status
  botActive: boolean;
  setBotActive: (active: boolean) => void;

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
      // Keep only the last 100 logs
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
