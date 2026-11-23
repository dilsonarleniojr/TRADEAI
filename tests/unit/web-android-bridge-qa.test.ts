import { describe, expect, it } from "bun:test";
import fs from "fs";
import path from "path";
import { tradeAINativeBridge } from "@/lib/bridge/tradeai-native-bridge";

const ROOT = path.resolve(import.meta.dir, "../..");

describe("QA — Pontos Críticos Web + Ponte Nativa Android", () => {
  it("1. use-keyboard-shortcuts exige Ctrl+Shift+M e dispara confirmação ao ir para live", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/hooks/use-keyboard-shortcuts.ts"), "utf8");
    expect(src).toContain('e.key.toLowerCase() === "m" && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey');
    expect(src).toContain('window.dispatchEvent(new CustomEvent("tradeai:request-live-mode"))');
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

  it("4. tradeAINativeBridge deduplica syncTradingState, calcula ageMs e respeita transição imediata de isStale", () => {
    const stateCalls: Array<[string, string, boolean]> = [];
    const heartbeatCalls: Array<[boolean, number]> = [];
    const hapticCalls: string[] = [];

    const origWindow = (globalThis as any).window;
    (globalThis as any).window = {
      TradeAINative: {
        onTradingStateChanged: (mode: any, sym: string, modal: boolean) =>
          stateCalls.push([mode, sym, modal]),
        onFeedHeartbeat: (isStale: boolean, ageMs: number) =>
          heartbeatCalls.push([isStale, ageMs]),
        onRequestHaptic: (type: string) => hapticCalls.push(type),
      },
    };

    try {
      tradeAINativeBridge.resetCache();
      expect(tradeAINativeBridge.isAvailable()).toBe(true);

      // Deduplicação de assinatura idêntica (normalizando símbolo)
      tradeAINativeBridge.syncTradingState({
        mode: "paper",
        symbol: " btcusdt ",
        hasBlockingModal: false,
      });
      tradeAINativeBridge.syncTradingState({
        mode: "paper",
        symbol: "BTCUSDT",
        hasBlockingModal: false,
      });
      expect(stateCalls.length).toBe(1);
      expect(stateCalls[0]).toEqual(["paper", "BTCUSDT", false]);

      // Mudança real dispara novo evento
      tradeAINativeBridge.syncTradingState({
        mode: "live",
        symbol: "BTCUSDT",
        hasBlockingModal: true,
      });
      expect(stateCalls.length).toBe(2);
      expect(stateCalls[1]).toEqual(["live", "BTCUSDT", true]);

      // Heartbeat: primeiro envio + throttle dentro de 1000ms + transição imediata de isStale
      tradeAINativeBridge.syncFeedHeartbeat({
        isStale: false,
        lastUpdateAt: 10_000,
        now: 12_500,
      });
      expect(heartbeatCalls.length).toBe(1);
      expect(heartbeatCalls[0]).toEqual([false, 2500]);

      // Dentro da janela de 1000ms com mesmo isStale: deve ser suprimido
      tradeAINativeBridge.syncFeedHeartbeat({
        isStale: false,
        lastUpdateAt: 10_000,
        now: 12_900,
      });
      expect(heartbeatCalls.length).toBe(1);

      // Transição imediata para isStale = true mesmo dentro de 1000ms: deve disparar imediatamente
      tradeAINativeBridge.syncFeedHeartbeat({
        isStale: true,
        lastUpdateAt: 10_000,
        now: 13_000,
      });
      expect(heartbeatCalls.length).toBe(2);
      expect(heartbeatCalls[1]).toEqual([true, 3000]);

      // Haptic
      tradeAINativeBridge.requestHaptic("critical");
      expect(hapticCalls).toEqual(["critical"]);
    } finally {
      tradeAINativeBridge.resetCache();
      (globalThis as any).window = origWindow;
    }
  });
});
