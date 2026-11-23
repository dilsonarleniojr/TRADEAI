// src/lib/bridge/tradeai-native-bridge.ts

export type NativeTradingMode = "paper" | "live";
export type NativeHapticType = "selection" | "warning" | "critical";

export interface TradeAINativeInterface {
  onTradingStateChanged?: (
    mode: NativeTradingMode,
    symbol: string,
    hasBlockingModal: boolean
  ) => void;
  onFeedHeartbeat?: (isStale: boolean, ageMs: number) => void;
  onRequestHaptic?: (type: NativeHapticType) => void;
}

declare global {
  interface Window {
    TradeAINative?: TradeAINativeInterface;
  }
}

export interface TradingStatePayload {
  mode: NativeTradingMode;
  symbol: string;
  hasBlockingModal: boolean;
}

export interface FeedHeartbeatPayload {
  isStale: boolean;
  lastUpdateAt: number | null;
  now?: number;
}

class TradeAINativeBridgeClient {
  private lastStateSignature = "";
  private lastStaleState: boolean | null = null;
  private lastHeartbeatSentAt = 0;

  public isAvailable(): boolean {
    if (typeof window === "undefined") return false;
    return Boolean(window.TradeAINative);
  }

  public syncTradingState(payload: TradingStatePayload): void {
    const bridge = this.getBridge();
    if (!bridge?.onTradingStateChanged) return;

    const normalizedMode: NativeTradingMode =
      payload.mode === "live" ? "live" : "paper";
    const normalizedSymbol = (payload.symbol || "").trim().toUpperCase();
    const hasBlockingModal = Boolean(payload.hasBlockingModal);

    const signature = `${normalizedMode}|${normalizedSymbol}|${hasBlockingModal}`;
    if (signature === this.lastStateSignature) return;

    this.lastStateSignature = signature;

    try {
      bridge.onTradingStateChanged(
        normalizedMode,
        normalizedSymbol,
        hasBlockingModal
      );
    } catch {
      // Ignora falhas transitórias da ponte nativa em runtime
    }
  }

  public syncFeedHeartbeat(
    payload: FeedHeartbeatPayload,
    minIntervalMs = 1_000
  ): void {
    const bridge = this.getBridge();
    if (!bridge?.onFeedHeartbeat) return;

    const now = payload.now ?? Date.now();
    const ageMs =
      payload.lastUpdateAt && payload.lastUpdateAt > 0
        ? Math.max(0, Math.round(now - payload.lastUpdateAt))
        : Number.MAX_SAFE_INTEGER;
    const isStale = Boolean(payload.isStale);

    const staleTransition = this.lastStaleState !== isStale;
    const elapsedSinceLastSend = now - this.lastHeartbeatSentAt;

    if (!staleTransition && elapsedSinceLastSend < minIntervalMs) {
      return;
    }

    this.lastStaleState = isStale;
    this.lastHeartbeatSentAt = now;

    try {
      bridge.onFeedHeartbeat(isStale, ageMs);
    } catch {
      // Ignora falhas transitórias da ponte nativa em runtime
    }
  }

  public requestHaptic(type: NativeHapticType): void {
    const bridge = this.getBridge();
    if (!bridge?.onRequestHaptic) return;

    try {
      bridge.onRequestHaptic(type);
    } catch {
      // Ignora falhas transitórias da ponte nativa em runtime
    }
  }

  public resetCache(): void {
    this.lastStateSignature = "";
    this.lastStaleState = null;
    this.lastHeartbeatSentAt = 0;
  }

  private getBridge(): TradeAINativeInterface | undefined {
    if (typeof window === "undefined") return undefined;
    return window.TradeAINative;
  }
}

export const tradeAINativeBridge = new TradeAINativeBridgeClient();
