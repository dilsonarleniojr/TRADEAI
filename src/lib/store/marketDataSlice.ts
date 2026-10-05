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
  loadKlinesForSymbol: (symbol: string, interval?: string) => Promise<void>;

  // Selected symbol
  selectedSymbol: string;
  setSelectedSymbol: (symbol: string) => void;

  // Momento do último dado de mercado recebido (REST ou WebSocket), para detectar dados atrasados
  lastMarketUpdate: number;

  // Cache timestamps for TTL management
  tickersCacheAt: number;
  highlightsCacheAt: number;
  setTickersCacheAt: (ts: number) => void;
  setHighlightsCacheAt: (ts: number) => void;
}

export const createMarketDataSlice: StateCreator<MarketDataSlice, [], [], MarketDataSlice> = (set, get) => ({
  // Market data
  tickers: {},
  setTickers: (tickers) => set({ tickers, tickersCacheAt: Date.now(), lastMarketUpdate: Date.now() }),
  updateTicker: (symbol, data) =>
    set((state) => ({
      tickers: { ...state.tickers, [symbol]: data },
      lastMarketUpdate: Date.now(),
    })),

  // Kline data
  klines: [],
  setKlines: (klines) => set({ klines }),

  loadKlinesForSymbol: async (symbol: string, interval = "1h") => {
    const sym = symbol.toUpperCase();
    try {
      const res = await fetch(`/api/market/klines?symbol=${sym}&interval=${interval}&limit=100`);
      if (res.ok) {
        const json = await res.json();
        if (json?.data && Array.isArray(json.data) && json.data.length > 0) {
          const mapped: KlineData[] = json.data.map((k: any) => ({
            time: Number(k.openTime || k.time),
            open: parseFloat(k.open),
            high: parseFloat(k.high),
            low: parseFloat(k.low),
            close: parseFloat(k.close),
            volume: parseFloat(k.volume),
          }));
          set({ klines: mapped, lastMarketUpdate: Date.now() });
        }
      }
    } catch (err) {
      console.warn("[MarketData] Falha ao buscar candles para", sym, err);
    }
  },

  // Selected symbol - carrega automaticamente candles ao selecionar a moeda
  selectedSymbol: "BTCUSDT",
  setSelectedSymbol: (symbol) => {
    const sym = symbol.toUpperCase();
    set({ selectedSymbol: sym });
    get().loadKlinesForSymbol(sym);
  },

  lastMarketUpdate: 0,

  // Cache timestamps
  tickersCacheAt: 0,
  highlightsCacheAt: 0,
  setTickersCacheAt: (ts) => set({ tickersCacheAt: ts }),
  setHighlightsCacheAt: (ts) => set({ highlightsCacheAt: ts }),
});
