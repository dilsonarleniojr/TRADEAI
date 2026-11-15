import type { StateCreator } from "zustand";
import type { TradingMode } from "./types";

export const TRADING_MODE_STORAGE_KEY = "tradeai_trading_mode_v1";
export const SELECTED_EXCHANGE_STORAGE_KEY = "tradeai_selected_exchange_v1";

export type SupportedExchange = "binance" | "okx";

export function getPersistedTradingMode(): TradingMode {
  if (typeof window === "undefined") return "paper";
  try {
    const saved = localStorage.getItem(TRADING_MODE_STORAGE_KEY);
    if (saved === "live" || saved === "paper") return saved;
  } catch {}
  return "paper";
}

export function getPersistedExchange(): SupportedExchange {
  if (typeof window === "undefined") return "binance";
  try {
    const saved = localStorage.getItem(SELECTED_EXCHANGE_STORAGE_KEY);
    if (saved === "binance" || saved === "okx") return saved;
  } catch {}
  return "binance";
}

export interface AccountSlice {
  // Trading mode
  tradingMode: TradingMode;
  setTradingMode: (mode: TradingMode) => void;

  // Selected Exchange (Binance or OKX)
  selectedExchange: SupportedExchange;
  setSelectedExchange: (exchange: SupportedExchange) => void;

  // Binance connection state (as chaves ficam apenas no servidor, em cookie httpOnly)
  binanceConnected: boolean;
  binanceTestnet: boolean;
  setBinanceConnected: (connected: boolean) => void;
  setBinanceTestnet: (testnet: boolean) => void;

  // OKX connection state (as chaves ficam apenas no servidor, em cookie httpOnly)
  okxConnected: boolean;
  okxSimulated: boolean;
  setOkxConnected: (connected: boolean) => void;
  setOkxSimulated: (simulated: boolean) => void;
}

export const createAccountSlice: StateCreator<AccountSlice, [], [], AccountSlice> = (set) => ({
  // Trading mode - inicialização segura para SSR/hidratação; DataProvider sincroniza com localStorage após montar
  tradingMode: "paper",
  setTradingMode: (mode) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(TRADING_MODE_STORAGE_KEY, mode);
      } catch {}
    }
    set({ tradingMode: mode });
  },

  // Selected Exchange
  selectedExchange: "binance",
  setSelectedExchange: (exchange) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(SELECTED_EXCHANGE_STORAGE_KEY, exchange);
      } catch {}
    }
    set({ selectedExchange: exchange });
  },

  // Binance connection state
  binanceConnected: false,
  binanceTestnet: false,
  setBinanceConnected: (connected) => set({ binanceConnected: connected }),
  setBinanceTestnet: (testnet) => set({ binanceTestnet: testnet }),

  // OKX connection state
  okxConnected: false,
  okxSimulated: false,
  setOkxConnected: (connected) => set({ okxConnected: connected }),
  setOkxSimulated: (simulated) => set({ okxSimulated: simulated }),
});
