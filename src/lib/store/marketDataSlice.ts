import type { StateCreator } from "zustand";
import type { TickerData, KlineData } from "./types";

export interface MarketDataSlice {
  // Market data
  tickers: Record<string, TickerData>;
  setTickers: (tickers: Record<string, TickerData>) => void;
  updateTicker: (symbol: string, data: TickerData) => void;

  // Kline data
  klines: KlineData[];
  setKlines: (klines: KlineData[]) => void;

  // Selected symbol
  selectedSymbol: string;
  setSelectedSymbol: (symbol: string) => void;

  // Cache timestamps for TTL management
  tickersCacheAt: number;
  highlightsCacheAt: number;
  setTickersCacheAt: (ts: number) => void;
  setHighlightsCacheAt: (ts: number) => void;
}

export const createMarketDataSlice: StateCreator<MarketDataSlice, [], [], MarketDataSlice> = (set) => ({
  // Market data
  tickers: {},
  setTickers: (tickers) => set({ tickers, tickersCacheAt: Date.now() }),
  updateTicker: (symbol, data) =>
    set((state) => ({
      tickers: { ...state.tickers, [symbol]: data },
    })),

  // Kline data
  klines: [],
  setKlines: (klines) => set({ klines }),

  // Selected symbol
  selectedSymbol: "BTCUSDT",
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),

  // Cache timestamps
  tickersCacheAt: 0,
  highlightsCacheAt: 0,
  setTickersCacheAt: (ts) => set({ tickersCacheAt: ts }),
  setHighlightsCacheAt: (ts) => set({ highlightsCacheAt: ts }),
});
