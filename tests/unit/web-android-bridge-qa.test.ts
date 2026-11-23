import { describe, expect, it } from "bun:test";
import fs from "fs";
import path from "path";
import {
  syncTradingState,
  syncFeedHeartbeat,
  requestNativeHaptic,
  registerNativeDismissListener,
} from "@/lib/bridge/tradeai-native-bridge";

const ROOT = path.resolve(import.meta.dir, "../..");

describe("QA — Pontos Críticos Web + Ponte Nativa Android", () => {
  it("1. use-keyboard-shortcuts exige Ctrl+Shift+M e bloqueia m isolado", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/hooks/use-keyboard-shortcuts.ts"), "utf8");
    expect(src).toContain('(e.key === "m" || e.key === "M") && (e.ctrlKey || e.metaKey) && e.shiftKey');
    expect(src).not.toContain('if (e.key === "m" && !e.ctrlKey');
  });

  it("2. DataFreshnessBanner (10s) e MarketView bloqueiam ordem em feed stale/offline e exibem custos Live", () => {
    const bannerSrc = fs.readFileSync(
      path.join(ROOT, "src/components/dashboard/data-freshness-banner.tsx"),
      "utf8"
    );
    expect(bannerSrc).toContain("const STALE_AFTER_MS = 10_000;");

    const marketSrc = fs.readFileSync(path.join(ROOT, "src/components/v2/market-view.tsx"), "utf8");
    expect(marketSrc).toContain("const isOrderBlockedByFeed = isFeedUnhealthy;");
    expect(marketSrc).toContain("disabled={isSubmittingTrade || isOrderBlockedByFeed}");
    expect(marketSrc).toContain("Spread atual");
    expect(marketSrc).toContain("Slippage estimado (MARKET)");
    expect(marketSrc).toContain("Taxa estimada (Taker 0,10% padrão)");
    expect(marketSrc).toContain("spreadPct > 0.35");
  });

  it("3. use-binance-stream pausa rAF em segundo plano, mantém exclusividade e usa transação única", () => {
    const streamSrc = fs.readFileSync(path.join(ROOT, "src/hooks/use-binance-stream.ts"), "utf8");
    expect(streamSrc).toContain('let activeMarketSource: "worker" | "socket" | "none" = "none"');
    expect(streamSrc).toContain('if (activeMarketSource === "worker") return;');
    expect(streamSrc).toContain("stopAtomicQueueConsumer();");
    expect(streamSrc).toContain("applyRealtimeFrameBatch(batch)");
  });

  it("4. tradeai-native-bridge deduplica syncTradingState, calcula ageMs/isStale em syncFeedHeartbeat e registra dismiss", () => {
    const stateCalls: Array<[string, string, boolean]> = [];
    const heartbeatCalls: Array<[boolean, number]> = [];
    const hapticCalls: string[] = [];
    const listeners: Record<string, Array<() => void>> = {};

    const origWindow = (globalThis as any).window;
    (globalThis as any).window = {
      TradeAINative: {
        onTradingStateChanged: (mode: string, sym: string, modal: boolean) =>
          stateCalls.push([mode, sym, modal]),
        onFeedHeartbeat: (isStale: boolean, ageMs: number) =>
          heartbeatCalls.push([isStale, ageMs]),
        onRequestHaptic: (type: string) => hapticCalls.push(type),
      },
      addEventListener: (ev: string, fn: () => void) => {
        listeners[ev] = listeners[ev] || [];
        listeners[ev].push(fn);
      },
      removeEventListener: (ev: string, fn: () => void) => {
        listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn);
      },
    };

    try {
      // Deduplicação de estado idêntico
      syncTradingState("paper", "BTCUSDT", false);
      syncTradingState("paper", "BTCUSDT", false);
      expect(stateCalls.length).toBe(1);
      expect(stateCalls[0]).toEqual(["paper", "BTCUSDT", false]);

      // Mudança real dispara novo evento
      syncTradingState("live", "BTCUSDT", true);
      expect(stateCalls.length).toBe(2);
      expect(stateCalls[1]).toEqual(["live", "BTCUSDT", true]);

      // Heartbeat fresco vs obsoleto (> 10s)
      syncFeedHeartbeat(Date.now() - 3000, 10_000);
      expect(heartbeatCalls.length).toBe(1);
      expect(heartbeatCalls[0][0]).toBe(false);
      expect(heartbeatCalls[0][1]).toBeGreaterThanOrEqual(2900);

      // Dentro de 2000ms com mesmo isStale: suprimido
      syncFeedHeartbeat(Date.now() - 3100, 10_000);
      expect(heartbeatCalls.length).toBe(1);

      // Transição imediata para isStale = true
      syncFeedHeartbeat(Date.now() - 15_000, 10_000);
      expect(heartbeatCalls.length).toBe(2);
      expect(heartbeatCalls[1][0]).toBe(true);
      expect(heartbeatCalls[1][1]).toBeGreaterThanOrEqual(14_900);

      // Haptic e Dismiss listener
      requestNativeHaptic("live");
      expect(hapticCalls).toEqual(["live"]);

      let dismissed = false;
      const unsub = registerNativeDismissListener(() => {
        dismissed = true;
      });
      listeners["tradeai:dismiss-modal"]?.forEach((fn) => fn());
      expect(dismissed).toBe(true);
      unsub();
      expect(listeners["tradeai:dismiss-modal"]?.length ?? 0).toBe(0);
    } finally {
      (globalThis as any).window = origWindow;
    }
  });
});
