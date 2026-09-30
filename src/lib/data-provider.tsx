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

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useCryptoStore } from "@/lib/store";
import type { TickerData } from "@/lib/store";
import { getOrFetch, CACHE_TTL } from "@/lib/cache";

interface DataProviderState {
  dataReady: boolean;
  marketsLoaded: boolean;
  accountLoaded: boolean;
  tradesLoaded: boolean;
  error: string | null;
}

const DataProviderContext = createContext<DataProviderState>({
  dataReady: false,
  marketsLoaded: false,
  accountLoaded: false,
  tradesLoaded: false,
  error: null,
});

export function useDataProvider() {
  return useContext(DataProviderContext);
}

async function fetchInitialTickers(): Promise<Record<string, TickerData>> {
  const response = await fetch("/api/market/ticker");
  if (!response.ok) throw new Error("Failed to fetch tickers");

  const result = await response.json();
  const data = result.data;
  if (!Array.isArray(data)) throw new Error("Invalid ticker data");

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
  return tickersMap;
}

async function fetchInitialAccount(mode: string, state: any) {
  const res = await fetch(`/api/account?mode=${mode}`, {
    headers: {
      'x-binance-api-key': state.binanceApiKey || '',
      'x-binance-api-secret': state.binanceApiSecret || '',
      'x-binance-testnet': state.binanceTestnet ? 'true' : 'false'
    }
  });
  if (!res.ok) throw new Error("Failed to fetch account");
  const result = await res.json();
  if (!result.success || !result.data) throw new Error("Invalid account data");
  return result.data;
}

async function fetchInitialTrades() {
  const res = await fetch("/api/trades");
  if (!res.ok) throw new Error("Failed to fetch trades");
  const result = await res.json();
  if (!result.success || !Array.isArray(result.data)) throw new Error("Invalid trade data");
  return result.data;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataProviderState>({
    dataReady: false,
    marketsLoaded: false,
    accountLoaded: false,
    tradesLoaded: false,
    error: null,
  });

  useEffect(() => {
    let mounted = true;
    const store = useCryptoStore.getState();

    // Load credentials and trading mode from localStorage if present
    if (typeof window !== "undefined") {
      const key = localStorage.getItem("binance_api_key") || "";
      const secret = localStorage.getItem("binance_api_secret") || "";
      const connected = localStorage.getItem("binance_connected") === "true";
      const testnet = localStorage.getItem("binance_testnet") !== "false";
      store.setBinanceCredentials(key, secret);
      store.setBinanceConnected(connected);
      store.setBinanceTestnet(testnet);
      
      const savedMode = localStorage.getItem("trading_mode") as any;
      if (savedMode === "live" || savedMode === "paper") {
        store.setTradingMode(savedMode);
      }
    }

    // Clear any stale mock data
    store.setAiSignals([]);
    store.setBotActive(false);

    // Load all initial data in parallel
    const loadData = async () => {
      // Market data (highest priority)
      try {
        const tickers = await getOrFetch("initial-tickers", fetchInitialTickers, CACHE_TTL.TICKER_FULL);
        if (mounted) {
          useCryptoStore.getState().setTickers(tickers);
          setState((s) => ({ ...s, marketsLoaded: true }));
          console.log("[DataProvider] Markets loaded:", Object.keys(tickers).length, "symbols");
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
        const trades = await fetchInitialTrades();
        if (mounted) {
          useCryptoStore.getState().setTrades(trades);
          setState((s) => ({ ...s, tradesLoaded: true }));
          console.log("[DataProvider] Trades loaded:", trades.length);
        }
      } catch (err) {
        console.error("[DataProvider] Trades fetch failed:", err);
        if (mounted) {
          useCryptoStore.getState().setTrades([]);
          setState((s) => ({ ...s, tradesLoaded: true }));
        }
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
