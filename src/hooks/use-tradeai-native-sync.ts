// src/hooks/use-tradeai-native-sync.ts
"use client";

import { useEffect, useRef } from "react";
import {
  syncTradingState,
  syncFeedHeartbeat,
  requestNativeHaptic,
} from "@/lib/bridge/tradeai-native-bridge";

export type NativeTradingMode = "paper" | "live";

interface UseTradeAINativeSyncParams {
  tradingMode: NativeTradingMode;
  selectedSymbol: string;
  hasBlockingModal: boolean;
  isFeedStale: boolean;
  lastMarketUpdateAt: number | null;
  staleThresholdMs?: number;
}

export function useTradeAINativeSync({
  tradingMode,
  selectedSymbol,
  hasBlockingModal,
  isFeedStale,
  lastMarketUpdateAt,
  staleThresholdMs = 10_000,
}: UseTradeAINativeSyncParams): void {
  const previousModeRef = useRef<NativeTradingMode | null>(null);

  useEffect(() => {
    syncTradingState(tradingMode, selectedSymbol, hasBlockingModal);

    if (previousModeRef.current !== null && previousModeRef.current !== tradingMode) {
      requestNativeHaptic(tradingMode === "live" ? "live" : "selection");
    }
    previousModeRef.current = tradingMode;
  }, [tradingMode, selectedSymbol, hasBlockingModal]);

  useEffect(() => {
    const evaluateAndSync = () => {
      const ts = isFeedStale || !lastMarketUpdateAt ? 0 : lastMarketUpdateAt;
      syncFeedHeartbeat(ts, staleThresholdMs);
    };

    evaluateAndSync();

    const intervalId = window.setInterval(evaluateAndSync, 2_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [isFeedStale, lastMarketUpdateAt, staleThresholdMs]);
}
