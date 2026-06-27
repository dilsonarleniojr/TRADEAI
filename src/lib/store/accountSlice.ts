import type { StateCreator } from "zustand";
import type { TradingMode } from "./types";

export interface AccountSlice {
  // Trading mode
  tradingMode: TradingMode;
  setTradingMode: (mode: TradingMode) => void;

  // Binance credentials and connection state
  binanceApiKey: string;
  binanceApiSecret: string;
  binanceConnected: boolean;
  binanceTestnet: boolean;
  setBinanceCredentials: (key: string, secret: string) => void;
  setBinanceConnected: (connected: boolean) => void;
  setBinanceTestnet: (testnet: boolean) => void;
}

export const createAccountSlice: StateCreator<AccountSlice, [], [], AccountSlice> = (set) => ({
  // Trading mode
  tradingMode: "paper",
  setTradingMode: (mode) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("trading_mode", mode);
    }
    set({ tradingMode: mode });
  },

  // Binance credentials
  binanceApiKey: "",
  binanceApiSecret: "",
  binanceConnected: false,
  binanceTestnet: true,
  setBinanceCredentials: (key, secret) => set({ binanceApiKey: key, binanceApiSecret: secret }),
  setBinanceConnected: (connected) => set({ binanceConnected: connected }),
  setBinanceTestnet: (testnet) => set({ binanceTestnet: testnet }),
});
