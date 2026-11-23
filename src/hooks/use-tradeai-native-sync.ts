// src/hooks/use-tradeai-native-sync.ts
"use client";

import { useEffect, useRef } from "react";
import {
  tradeAINativeBridge,
  type NativeTradingMode,
} from "@/lib/bridge/tradeai-native-bridge";

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
    tradeAINativeBridge.syncTradingState({
      mode: tradingMode,
      symbol: selectedSymbol,
      hasBlockingModal,
    });

    if (previousModeRef.current !== null && previousModeRef.current !== tradingMode) {
      tradeAINativeBridge.requestHaptic(
        tradingMode === "live" ? "critical" : "selection"
      );
    }
    previousModeRef.current = tradingMode;
  }, [tradingMode, selectedSymbol, hasBlockingModal]);

  useEffect(() => {
    const evaluateAndSync = () => {
      const now = Date.now();
      const computedStale =
        isFeedStale ||
        !lastMarketUpdateAt ||
        lastMarketUpdateAt <= 0 ||
        now - lastMarketUpdateAt > staleThresholdMs;

      tradeAINativeBridge.syncFeedHeartbeat({
        isStale: computedStale,
        lastUpdateAt: lastMarketUpdateAt,
        now,
      });
    };

    evaluateAndSync();

    const intervalId = window.setInterval(evaluateAndSync, 2_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [isFeedStale, lastMarketUpdateAt, staleThresholdMs]);
}
