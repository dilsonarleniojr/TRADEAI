import type { StateCreator } from "zustand";
import type { TradeData, AISignalData, ChatMessage } from "./types";

export interface TradeSlice {
  // Bot status
  botActive: boolean;
  setBotActive: (active: boolean) => void;

  // Trades
  trades: TradeData[];
  setTrades: (trades: TradeData[]) => void;
  addTrade: (trade: TradeData) => void;

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
