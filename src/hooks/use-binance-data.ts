"use client";

import { useEffect, useRef, useCallback } from "react";
import { useCryptoStore, type TickerData } from "@/lib/store";

const BINANCE_API = "/api/market";

export function useBinanceData() {
  const {
    setTickers,
    updateTicker,
    selectedSymbol,
    setKlines,
    setIsLoading,
  } = useCryptoStore();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch all tickers from Binance
  const fetchTickers = useCallback(async () => {
    try {
      const response = await fetch(`${BINANCE_API}/ticker`);
      if (!response.ok) return;

      const result = await response.json();
      const data = result.data;

      if (!Array.isArray(data)) return;

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

      setTickers(tickersMap);
    } catch (err) {
      console.error("[BinanceData] Ticker fetch error:", err);
    }
  }, [setTickers]);

  // Fetch klines for selected symbol
  const fetchKlines = useCallback(
    async (symbol?: string, interval = "1h", limit = 100) => {
      const sym = symbol || selectedSymbol;
      try {
        setIsLoading(true);
        const response = await fetch(
          `${BINANCE_API}/klines?symbol=${sym}&interval=${interval}&limit=${limit}`
        );
        if (!response.ok) return;

        const result = await response.json();
        if (result.data) {
          const klines = result.data.map(
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
          setKlines(klines);
        }
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

    // Refresh tickers every 15 seconds
    intervalRef.current = setInterval(fetchTickers, 15000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchTickers]);

  return { fetchTickers, fetchKlines };
}
