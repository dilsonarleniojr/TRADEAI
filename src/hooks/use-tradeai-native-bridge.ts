"use client";

import { useEffect, useRef } from "react";

export type TradeAIMode = "paper" | "live";
export type NativeHapticType = "selection" | "heavy" | "live" | "error" | "alert";

export interface TradeAINativeBridgeAPI {
  onTradingStateChanged: (mode: string, symbol: string, hasBlockingModal: boolean) => void;
  onFeedHeartbeat: (isStale: boolean, ageMs: number) => void;
  onRequestHaptic: (type: string) => void;
}

declare global {
  interface Window {
    __tradeai_native_ready?: boolean;
  }
}

export interface UseTradeAINativeBridgeOptions {
  /** Modo de operação atual ("paper" | "live"). */
  tradingMode: TradeAIMode;
  /** Símbolo/par ativo no terminal (ex.: "BTCUSDT"). */
  activeSymbol: string;
  /** Indica se há modal, gaveta ou confirmação bloqueante aberta no frontend. */
  hasBlockingModal: boolean;
  /** Indica se o feed de dados de mercado/ordens está obsoleto (stale). */
  isFeedStale: boolean;
  /** Idade do último tick/atualização em milissegundos. */
  lastUpdateAgeMs: number;
  /** Callback acionado quando o Android solicita fechar o modal/gaveta via gesto Voltar. */
  onDismissModal: () => void;
  /** Intervalo de envio periódico do heartbeat para o shell nativo (padrão: 2000 ms). */
  heartbeatIntervalMs?: number;
  /** Limite em ms para considerar o feed obsoleto caso lastUpdateAgeMs não venha pré-calculado. */
  staleThresholdMs?: number;
  /** Habilita ou desabilita a ponte (padrão: true). */
  enabled?: boolean;
}

export interface TradeAINativeBridgeController {
  isNativeBridgeAvailable: boolean;
  requestHaptic: (type: NativeHapticType) => void;
}

export function useTradeAINativeBridge({
  tradingMode,
  activeSymbol,
  hasBlockingModal,
  isFeedStale,
  lastUpdateAgeMs,
  onDismissModal,
  heartbeatIntervalMs = 2000,
  staleThresholdMs = 10_000,
  enabled = true,
}: UseTradeAINativeBridgeOptions): TradeAINativeBridgeController {
  const onDismissModalRef = useRef(onDismissModal);
  useEffect(() => {
    onDismissModalRef.current = onDismissModal;
  }, [onDismissModal]);

  const lastStateSignatureRef = useRef<string>("");
  const lastModeRef = useRef<TradeAIMode>(tradingMode);

  const feedMetricsRef = useRef({
    isStale: isFeedStale || lastUpdateAgeMs > staleThresholdMs,
    ageMs: Math.max(0, Math.round(lastUpdateAgeMs)),
  });
  useEffect(() => {
    feedMetricsRef.current = {
      isStale: isFeedStale || lastUpdateAgeMs > staleThresholdMs,
      ageMs: Math.max(0, Math.round(lastUpdateAgeMs)),
    };
  }, [isFeedStale, lastUpdateAgeMs, staleThresholdMs]);

  const getBridge = (): TradeAINativeBridgeAPI | undefined => {
    if (!enabled || typeof window === "undefined") return undefined;
    return window.TradeAINative;
  };

  const requestHaptic = (type: NativeHapticType) => {
    const bridge = getBridge();
    if (!bridge) return;
    try {
      bridge.onRequestHaptic(type);
    } catch {
      // Ignora falhas caso a interface nativa não esteja pronta na página atual
    }
  };

  // 1. Sincroniza tradingMode, activeSymbol e hasBlockingModal apenas quando houver mudança real
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;

    const normalizedSymbol = (activeSymbol || "BTCUSDT").toUpperCase();
    const signature = `${tradingMode}|${normalizedSymbol}|${hasBlockingModal ? "1" : "0"}`;

    if (lastStateSignatureRef.current === signature) {
      return;
    }

    const previousMode = lastModeRef.current;
    lastStateSignatureRef.current = signature;
    lastModeRef.current = tradingMode;

    try {
      bridge.onTradingStateChanged(tradingMode, normalizedSymbol, hasBlockingModal);

      // Dispara háptica nativa ao alternar explicitamente para modo Real ("live")
      if (previousMode !== "live" && tradingMode === "live") {
        bridge.onRequestHaptic("live");
      }
    } catch {
      // Evita que erro na bridge interrompa o ciclo de renderização React
    }
  }, [tradingMode, activeSymbol, hasBlockingModal, enabled]);

  // 2. Envia heartbeat de frescor do feed para o banner nativo do Android
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;

    const pushHeartbeat = () => {
      const currentBridge = getBridge();
      if (!currentBridge) return;
      try {
        currentBridge.onFeedHeartbeat(
          feedMetricsRef.current.isStale,
          feedMetricsRef.current.ageMs
        );
      } catch {
        // Ignora falhas transitórias da bridge
      }
    };

    // Envia imediatamente quando isFeedStale muda ou na montagem
    pushHeartbeat();

    const timerId = window.setInterval(pushHeartbeat, heartbeatIntervalMs);
    return () => {
      window.clearInterval(timerId);
    };
  }, [isFeedStale, lastUpdateAgeMs, staleThresholdMs, heartbeatIntervalMs, enabled]);

  // 3. Escuta o comando nativo de fechar modal/gaveta disparado pelo BackHandler do Android
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const handleDismissModalEvent = () => {
      onDismissModalRef.current();
    };

    window.addEventListener("tradeai:dismiss-modal", handleDismissModalEvent);
    return () => {
      window.removeEventListener("tradeai:dismiss-modal", handleDismissModalEvent);
    };
  }, [enabled]);

  const isNativeBridgeAvailable =
    enabled && typeof window !== "undefined" && Boolean(window.TradeAINative);

  return {
    isNativeBridgeAvailable,
    requestHaptic,
  };
}
