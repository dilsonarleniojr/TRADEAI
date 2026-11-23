"use client";

import { useEffect, useRef } from "react";

export interface NetworkRestoredDetail {
  transport?: string;
  source?: "android" | "browser";
}

interface UseNetworkRestoredOptions {
  /** Chamado quando a rede volta após queda, respeitando deduplicação e lock de execução. */
  onRestore: (detail: NetworkRestoredDetail) => Promise<void> | void;
  /** Janela mínima em ms entre reconciliações para evitar rajadas em oscilação de rede. */
  cooldownMs?: number;
  /** Permite desabilitar temporariamente o listener. */
  enabled?: boolean;
}

export function useNetworkRestored({
  onRestore,
  cooldownMs = 1500,
  enabled = true,
}: UseNetworkRestoredOptions) {
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  const lastRunAtRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);
  const wasOfflineRef = useRef<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const triggerRestore = async (detail: NetworkRestoredDetail) => {
      const now = Date.now();

      // Evita duplicidade em rajada (ex.: 'online' + 'tradeai:network-restored' ou oscilação rápida)
      if (inFlightRef.current) return;
      if (now - lastRunAtRef.current < cooldownMs) return;

      inFlightRef.current = true;
      lastRunAtRef.current = now;

      try {
        await onRestoreRef.current(detail);
      } finally {
        inFlightRef.current = false;
      }
    };

    const handleAndroidRestored = (event: Event) => {
      const customEvent = event as CustomEvent<{ transport?: string }>;
      wasOfflineRef.current = false;
      void triggerRestore({
        transport: customEvent.detail?.transport ?? "UNKNOWN",
        source: "android",
      });
    };

    const handleBrowserOffline = () => {
      wasOfflineRef.current = true;
    };

    const handleBrowserOnline = () => {
      // Só trata como restauração se houve queda prévia registrada
      if (!wasOfflineRef.current) return;
      wasOfflineRef.current = false;
      void triggerRestore({
        transport: "BROWSER_ONLINE",
        source: "browser",
      });
    };

    window.addEventListener("tradeai:network-restored", handleAndroidRestored);
    window.addEventListener("offline", handleBrowserOffline);
    window.addEventListener("online", handleBrowserOnline);

    return () => {
      window.removeEventListener("tradeai:network-restored", handleAndroidRestored);
      window.removeEventListener("offline", handleBrowserOffline);
      window.removeEventListener("online", handleBrowserOnline);
    };
  }, [cooldownMs, enabled]);
}
