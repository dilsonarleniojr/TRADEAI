"use client";

import { structuredLogger } from "@/lib/telemetry/structured-logger";
import { useCryptoStore } from "@/lib/store";

export interface FeedFreshness {
  stale: boolean;
  elapsedMs: number;
  lastTickAt: number;
}

export class FeedWatchdog {
  private lastTickMap = new Map<string, number>();
  private staleMap = new Map<string, boolean>();
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly staleThresholdMs: number;

  constructor(staleThresholdMs = 3000) {
    this.staleThresholdMs = staleThresholdMs;
  }

  /**
   * Registra a chegada de um tick em tempo real para o par.
   */
  recordTick(symbol: string, timestamp: number = Date.now()): void {
    const sym = symbol.toUpperCase();
    this.lastTickMap.set(sym, timestamp);

    const wasStale = this.staleMap.get(sym);
    if (wasStale) {
      this.staleMap.set(sym, false);
      this.checkGlobalStaleStatus();
      structuredLogger.info(
        "MARKET_DATA",
        `✅ [FEED_WATCHDOG] Feed restabelecido para ${sym}. Dados atualizados em tempo real.`
      );
    }
  }

  /**
   * Avalia a frescura dos dados para um símbolo específico.
   */
  checkFreshness(symbol: string): FeedFreshness {
    const sym = symbol.toUpperCase();
    const lastTick = this.lastTickMap.get(sym) || 0;
    const now = Date.now();
    const elapsedMs = lastTick > 0 ? now - lastTick : 999999;
    const stale = elapsedMs > this.staleThresholdMs;

    return {
      stale,
      elapsedMs,
      lastTickAt: lastTick,
    };
  }

  /**
   * Inicia o loop contínuo de verificação do Watchdog (a cada 500ms).
   */
  start(intervalMs = 500): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.evaluateAllFeeds();
    }, intervalMs);
  }

  /**
   * Pausa o monitoramento do Watchdog.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private evaluateAllFeeds(): void {
    const store = useCryptoStore.getState();
    const selectedSymbol = store.selectedSymbol?.toUpperCase() || "BTCUSDT";

    // Avalia o par atualmente selecionado no gráfico e pares com posições abertas
    const activeSymbols = new Set<string>([selectedSymbol]);
    for (const bot of store.bots) {
      if (bot.active && bot.position && bot.position.quantity > 0) {
        activeSymbols.add(bot.position.symbol.toUpperCase());
      }
    }

    let anyStale = false;
    const now = Date.now();

    for (const sym of activeSymbols) {
      const lastTick = this.lastTickMap.get(sym) || 0;
      if (lastTick === 0) continue; // Ainda inicializando

      const elapsedMs = now - lastTick;
      const isStale = elapsedMs > this.staleThresholdMs;
      const previouslyStale = this.staleMap.get(sym) || false;

      if (isStale) {
        anyStale = true;
        this.staleMap.set(sym, true);

        if (!previouslyStale) {
          structuredLogger.warn(
            "MARKET_DATA",
            `⚠️ [FEED_WATCHDOG] MARKET DATA STALE! ${sym} sem ticks há ${elapsedMs}ms (>3s). Entradas automáticas suspensas.`,
            { symbol: sym, metadata: { elapsedMs } }
          );
        }
      } else {
        this.staleMap.set(sym, false);
      }
    }

    if (store.isMarketDataStale !== anyStale) {
      store.setIsMarketDataStale(anyStale);
    }
  }

  private checkGlobalStaleStatus(): void {
    const anyStale = Array.from(this.staleMap.values()).some((v) => v);
    const store = useCryptoStore.getState();
    if (store.isMarketDataStale !== anyStale) {
      store.setIsMarketDataStale(anyStale);
    }
  }

  reset(): void {
    this.lastTickMap.clear();
    this.staleMap.clear();
  }
}

export const feedWatchdog = new FeedWatchdog(3000);
