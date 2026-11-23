/**
 * Cliente TypeScript da ponte bidirecional TradeAI Web <-> Android Nativo (window.TradeAINative).
 */

declare global {
  interface Window {
    TradeAINative?: {
      onTradingStateChanged: (mode: string, symbol: string, hasBlockingModal: boolean) => void;
      onFeedHeartbeat: (isStale: boolean, ageMs: number) => void;
      onRequestHaptic: (type: string) => void;
    };
  }
}

let lastTradingState = {
  mode: "",
  symbol: "",
  hasBlockingModal: false,
};

let lastHeartbeatState = {
  isStale: false,
  ageMs: 0,
};

/**
 * Notifica o shell Android nativo sobre mudanças no estado da sessão de trading.
 * Possui deduplicação em memória para evitar chamadas redundantes através da JNI bridge.
 */
export function syncTradingState(mode: string, symbol: string, hasBlockingModal: boolean) {
  if (typeof window === "undefined" || !window.TradeAINative) return;

  if (
    lastTradingState.mode === mode &&
    lastTradingState.symbol === symbol &&
    lastTradingState.hasBlockingModal === hasBlockingModal
  ) {
    return;
  }

  lastTradingState = { mode, symbol, hasBlockingModal };
  window.TradeAINative.onTradingStateChanged(mode, symbol, hasBlockingModal);
}

/**
 * Envia batimento de feed para o Android monitorar latência e dados obsoletos.
 * @param lastUpdateTimestamp Timestamp em ms do último tick recebido da Binance.
 * @param staleThresholdMs Limiar estrito institucional de tolerância (padrão: 10.000 ms).
 */
export function syncFeedHeartbeat(lastUpdateTimestamp: number, staleThresholdMs = 10_000) {
  if (typeof window === "undefined" || !window.TradeAINative) return;

  const now = Date.now();
  const ageMs = lastUpdateTimestamp > 0 ? Math.max(0, now - lastUpdateTimestamp) : 999_999;
  const isStale = lastUpdateTimestamp === 0 || ageMs > staleThresholdMs;

  // Atualiza apenas se houve mudança de status ou a cada 2 segundos
  if (
    lastHeartbeatState.isStale === isStale &&
    Math.abs(lastHeartbeatState.ageMs - ageMs) < 2000
  ) {
    return;
  }

  lastHeartbeatState = { isStale, ageMs };
  window.TradeAINative.onFeedHeartbeat(isStale, ageMs);
}

/**
 * Solicita feedback tátil no hardware nativo do dispositivo Android.
 */
export function requestNativeHaptic(type: "selection" | "heavy" | "live" | "error" | "alert" = "selection") {
  if (typeof window === "undefined" || !window.TradeAINative) return;
  window.TradeAINative.onRequestHaptic(type);
}

/**
 * Registra listener para fechar modais/gavetas quando o botão voltar nativo do Android for acionado.
 */
export function registerNativeDismissListener(onDismiss: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleDismiss = () => {
    onDismiss();
  };

  window.addEventListener("tradeai:dismiss-modal", handleDismiss);
  return () => {
    window.removeEventListener("tradeai:dismiss-modal", handleDismiss);
  };
}
