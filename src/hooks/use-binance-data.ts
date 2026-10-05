"use client";

import { useEffect, useRef, useCallback } from "react";
import { useCryptoStore, type TickerData } from "@/lib/store";
import { getOrFetch, CACHE_TTL } from "@/lib/cache";
import { syncManager } from "@/lib/realtime-sync";
import { useShallow } from "zustand/react/shallow";

const BINANCE_API = "/api/market";

export function useBinanceData() {
  const {
    setTickers,
    selectedSymbol,
    setKlines,
    setIsLoading,
    tradingMode,
  } = useCryptoStore(
  useShallow((s) => ({ setTickers: s.setTickers, selectedSymbol: s.selectedSymbol, setKlines: s.setKlines, setIsLoading: s.setIsLoading, tradingMode: s.tradingMode }))
);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch all tickers from Binance with TTL cache
  const fetchTickers = useCallback(async () => {
    try {
      const tickersMap = await getOrFetch<Record<string, TickerData>>(
        "tickers-all",
        async () => {
          const response = await fetch(`${BINANCE_API}/ticker`);
          if (!response.ok) throw new Error("Ticker fetch failed");

          const result = await response.json();
          const data = result.data;
          if (!Array.isArray(data)) throw new Error("Invalid ticker data");

          const map: Record<string, TickerData> = {};
          for (const item of data) {
            map[item.symbol] = {
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
          return map;
        },
        CACHE_TTL.TICKER_FULL
      );

      setTickers(tickersMap);
      syncManager.onPollingSuccess();
    } catch (err) {
      console.error("[BinanceData] Ticker fetch error:", err);
      syncManager.onPollingFailure();
    }
  }, [setTickers]);

  // Fetch klines for selected symbol
  const fetchKlines = useCallback(
    async (symbol?: string, interval = "1h", limit = 100) => {
      const sym = symbol || selectedSymbol;
      try {
        setIsLoading(true);

        const klines = await getOrFetch(
          `klines-${sym}-${interval}-${limit}`,
          async () => {
            const response = await fetch(
              `${BINANCE_API}/klines?symbol=${sym}&interval=${interval}&limit=${limit}`
            );
            if (!response.ok) throw new Error("Klines fetch failed");

            const result = await response.json();
            if (!result.data) throw new Error("No kline data");

            return result.data.map(
              (k: {
                openTime: number;
                open: string;
                high: string;
                low: string;
                close: string;
                volume: string;
              }) => ({
                time: k.openTime,
                open: parseFloat(k.open),
                high: parseFloat(k.high),
                low: parseFloat(k.low),
                close: parseFloat(k.close),
                volume: parseFloat(k.volume),
              })
            );
          },
          CACHE_TTL.KLINES
        );

        setKlines(klines);
      } catch (err) {
        console.error("[BinanceData] Klines fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [selectedSymbol, setKlines, setIsLoading]
  );

  // Setup periodic ticker refresh
  useEffect(() => {
    fetchTickers(); // Initial fetch

    // Refresh tickers every 60 seconds as fallback (Socket.IO provides real-time updates)
    intervalRef.current = setInterval(fetchTickers, 60000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchTickers]);

  // Setup periodic account/portfolio balance poll via SyncManager
  useEffect(() => {
    // Delegate account polling fallback orchestration to the central syncManager
    syncManager.startPolling();
    return () => {
      syncManager.stopPolling();
    };
  }, [tradingMode]);

  return { fetchTickers, fetchKlines };
}
