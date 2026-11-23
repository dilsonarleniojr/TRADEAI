"use client";

import { useCallback, useEffect, useRef } from "react";
import { useNetworkRestored, type NetworkRestoredDetail } from "./use-network-restored";

interface ReconcileDeps {
  selectedSymbol: string;
  isStreamConnected: boolean;
  reconnectStream: (symbol: string) => void;
  refreshOpenOrdersAndBalances: (signal: AbortSignal) => Promise<void>;
}

export function useTradeRecoveryOnRestore({
  selectedSymbol,
  isStreamConnected,
  reconnectStream,
  refreshOpenOrdersAndBalances,
}: ReconcileDeps) {
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleRestore = useCallback(
    async (detail: NetworkRestoredDetail) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // 1. Garante que o stream de dados de mercado volte para o par ativo
      if (!isStreamConnected) {
        reconnectStream(selectedSymbol);
      }

      // 2. Reconcilia ordens abertas e saldos sem resetar o estado do formulário de ordem
      try {
        await refreshOpenOrdersAndBalances(controller.signal);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        throw err;
      }

      void detail;
    },
    [isStreamConnected, reconnectStream, refreshOpenOrdersAndBalances, selectedSymbol]
  );

  useNetworkRestored({
    onRestore: handleRestore,
    cooldownMs: 1500,
    enabled: true,
  });
}
