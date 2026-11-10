"use client";

/**
 * DataProvider — Global data initialization layer.
 *
 * Replaces the old FALLBACK_TICKERS pattern. Instead of showing fake data
 * while real data loads, this shows loading skeletons then transitions
 * to real Binance data.
 *
 * Responsibilities:
 * - Initializes market data from Binance API
 * - Loads account and trades from the database
 * - Sets up the RealTimeSyncManager
 * - Provides a "dataReady" flag for skeleton→content transitions
 */

import { restoreBinanceSession } from "@/lib/binance-client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useCryptoStore } from "@/lib/store";
import type { TickerData } from "@/lib/store";
import { getOrFetch, CACHE_TTL } from "@/lib/cache";
import { getPersistedTradingMode } from "@/lib/store/accountSlice";

import { registerDynamicSymbols } from "@/lib/crypto-meta";

interface DataProviderState {
  dataReady: boolean;
  marketsLoaded: boolean;
  accountLoaded: boolean;
  tradesLoaded: boolean;
  error: string | null;
  syncBinanceCoins: () => Promise<{ success: boolean; count: number }>;
}

const DataProviderContext = createContext<DataProviderState>({
  dataReady: false,
  marketsLoaded: false,
  accountLoaded: false,
  tradesLoaded: false,
  error: null,
  syncBinanceCoins: async () => ({ success: false, count: 0 }),
});

export function useDataProvider() {
  return useContext(DataProviderContext);
}

async function fetchInitialTickers(): Promise<Record<string, TickerData>> {
  const response = await fetch("/api/market/ticker");
  if (!response.ok) throw new Error("Failed to fetch tickers");

  const result = await response.json();
  const data = Array.isArray(result) ? result : Array.isArray(result?.data) ? result.data : null;
  if (!data || data.length === 0) {
    console.warn("[DataProvider] Formato de ticker vazio ou inesperado, mantendo dados anteriores.");
    return {};
  }

  const tickersMap: Record<string, TickerData> = {};
  for (const item of data) {
    tickersMap[item.symbol] = {
      symbol: item.symbol,
      price: parseFloat(item.lastPrice),
      priceChange: parseFloat(item.priceChange),
      priceChangePercent: parseFloat(item.priceChangePercent),
      high: parseFloat(item.highPrice),
      low: parseFloat(item.lowPrice),
      volume: parseFloat(item.volume),
      quoteVolume: parseFloat(item.quoteVolume),
    };
  }

  // Pre-register all symbols from tickers immediately
  registerDynamicSymbols(
    data.map((item) => ({
      symbol: item.symbol,
      short: item.symbol.replace(/USDT$/, ""),
    }))
  );

  return tickersMap;
}

async function fetchSymbolsMetadata() {
  try {
    const res = await fetch("/api/market/symbols");
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.data)) {
        registerDynamicSymbols(json.data);
        console.log(`[DataProvider] ${json.data.length} moedas Binance sincronizadas.`);
      }
    }
  } catch (err: any) {
    console.warn("[DataProvider] Falha ao carregar metadados dos símbolos:", err.message);
  }
}

async function fetchInitialAccount(mode: string, state: any) {
  const res = await fetch(`/api/account?mode=${mode}`);
  if (!res.ok) throw new Error("Failed to fetch account");
  const result = await res.json();
  if (!result.success || !result.data) throw new Error("Invalid account data");
  return result.data;
}

async function fetchInitialTrades(mode?: string) {
  const url = mode ? `/api/trades?mode=${mode}` : "/api/trades";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch trades");
  const result = await res.json();
  if (!result.success || !Array.isArray(result.data)) throw new Error("Invalid trade data");
  return result.data;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const syncBinanceCoins = async (): Promise<{ success: boolean; count: number }> => {
    try {
      const syncRes = await fetch("/api/market/sync", { method: "POST" });
      if (syncRes.ok) {
        const syncData = await syncRes.json();
        const updatedTickers = await fetchInitialTickers();
        useCryptoStore.getState().setTickers(updatedTickers);
        await fetchSymbolsMetadata();
        return { success: true, count: syncData.symbolsCount || Object.keys(updatedTickers).length };
      }
    } catch (err: any) {
      console.error("[DataProvider] Sync error:", err.message);
    }
    return { success: false, count: 0 };
  };

  const [state, setState] = useState<DataProviderState>({
    dataReady: false,
    marketsLoaded: false,
    accountLoaded: false,
    tradesLoaded: false,
    error: null,
    syncBinanceCoins,
  });


  useEffect(() => {
    let mounted = true;
    const store = useCryptoStore.getState();

    // Restaura o estado da conexão a partir da sessão do servidor (as chaves nunca chegam ao navegador)
    if (typeof window !== "undefined") {
      restoreBinanceSession().then((status) => {
        if (!mounted) return;
        const st = useCryptoStore.getState();
        st.setBinanceConnected(status.connected);
        st.setBinanceTestnet(status.testnet);
      });

      // Preserva o modo escolhido pelo usuário (live ou paper) sem resetar no F5
      const persistedMode = getPersistedTradingMode();
      store.setTradingMode(persistedMode);
    }

    // Limpa apenas sinais antigos de IA (mantém status de robôs ativos e configurações)
    store.setAiSignals([]);

    // Load all initial data in parallel
    const loadData = async () => {
      // Market data (highest priority)
      try {
        const tickers = await getOrFetch("initial-tickers", fetchInitialTickers, CACHE_TTL.TICKER_FULL);
        if (mounted) {
          useCryptoStore.getState().setTickers(tickers);
          setState((s) => ({ ...s, marketsLoaded: true }));
          console.log("[DataProvider] Markets loaded:", Object.keys(tickers).length, "symbols");
          fetchSymbolsMetadata().catch(() => {});
        }
      } catch (err) {
        console.error("[DataProvider] Market data failed:", err);
        if (mounted) setState((s) => ({ ...s, marketsLoaded: true, error: "Market data unavailable" }));
      }

      // Account data
      try {
        const currentStore = useCryptoStore.getState();
        const acc = await fetchInitialAccount(currentStore.tradingMode, currentStore);
        if (mounted) {
          useCryptoStore.getState().setAccount(acc);
          setState((s) => ({ ...s, accountLoaded: true }));
          console.log("[DataProvider] Account loaded");
        }
      } catch (err) {
        console.error("[DataProvider] Account fetch failed:", err);
        if (mounted) {
          const currentStore = useCryptoStore.getState();
          // Default account on failure (0 for live, 10000 for paper)
          useCryptoStore.getState().setAccount({
            cashBalance: currentStore.tradingMode === "live" ? 0 : 10000,
            assetQuantity: 0,
            symbol: "BTCUSDT",
          });
          setState((s) => ({ ...s, accountLoaded: true }));
        }
      }

      // Trade history
      try {
        const currentMode = useCryptoStore.getState().tradingMode;
        const trades = await fetchInitialTrades(currentMode);
        if (mounted) {
          useCryptoStore.getState().setTrades(trades);
          setState((s) => ({ ...s, tradesLoaded: true }));
          console.log("[DataProvider] Trades loaded for mode:", currentMode, trades.length);
        }
      } catch (err) {
        console.error("[DataProvider] Trades fetch failed:", err);
        if (mounted) {
          useCryptoStore.getState().setTrades([]);
          setState((s) => ({ ...s, tradesLoaded: true }));
        }
      }

      // Initial Candlestick (Kline) data
      try {
        const symbol = useCryptoStore.getState().selectedSymbol || "BTCUSDT";
        await useCryptoStore.getState().loadKlinesForSymbol(symbol);
        console.log("[DataProvider] Initial klines loaded for:", symbol);
      } catch (err) {
        console.warn("[DataProvider] Initial klines fetch error:", err);
      }

      // All loaded
      if (mounted) {
        setState((s) => ({ ...s, dataReady: true }));
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <DataProviderContext.Provider value={state}>
      {children}
    </DataProviderContext.Provider>
  );
}
