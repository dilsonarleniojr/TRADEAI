import type { StateCreator } from "zustand";
import type { TradingMode } from "./types";

export const TRADING_MODE_STORAGE_KEY = "tradeai_trading_mode_v1";

export function getPersistedTradingMode(): TradingMode {
  if (typeof window === "undefined") return "paper";
  try {
    const saved = localStorage.getItem(TRADING_MODE_STORAGE_KEY);
    if (saved === "live" || saved === "paper") return saved;
  } catch {}
  return "paper";
}

export interface AccountSlice {
  // Trading mode
  tradingMode: TradingMode;
  setTradingMode: (mode: TradingMode) => void;

  // Binance connection state (as chaves ficam apenas no servidor, em cookie httpOnly)
  binanceConnected: boolean;
  binanceTestnet: boolean;
  setBinanceConnected: (connected) => void;
  setBinanceTestnet: (testnet: boolean) => void;
}

export const createAccountSlice: StateCreator<AccountSlice, [], [], AccountSlice> = (set) => ({
  // Trading mode - persistido para que F5 mantenha a escolha do usuário
  tradingMode: getPersistedTradingMode(),
  setTradingMode: (mode) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(TRADING_MODE_STORAGE_KEY, mode);
      } catch {}
    }
    set({ tradingMode: mode });
  },

  // Binance connection state
  binanceConnected: false,
  binanceTestnet: true,
  setBinanceConnected: (connected) => set({ binanceConnected: connected }),
  setBinanceTestnet: (testnet) => set({ binanceTestnet: testnet }),
});
