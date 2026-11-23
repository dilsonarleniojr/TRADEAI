import { create } from "zustand";
import { createAccountSlice, type AccountSlice } from "./accountSlice";
import { createPortfolioSlice, type PortfolioSlice } from "./portfolioSlice";
import { createMarketDataSlice, type MarketDataSlice } from "./marketDataSlice";
import { createTradeSlice, type TradeSlice } from "./tradeSlice";
import { createBotSlice, type BotSlice } from "./botSlice";
import { createTelemetrySlice, type TelemetrySlice } from "./telemetrySlice";
import { createUISlice, type UISlice } from "./uiSlice";
import type { TickerData } from "./types";

// Re-export all types for backward compatibility
export type {
  TickerData,
  KlineData,
  BotConfigData,
  BotInstance,
  BotExecutionReport,
  BotPosition,
  BotStrategy,
  BotStats,
  BotEntryCheck,
  PortfolioData,
  PortfolioPosition,
  TradeData,
  AISignalData,
  AgentTelemetryData,
  AgentToolInvocationData,
  AgentToolStatus,
  ChatMessage,
  PriceAlert,
  ActiveSection,
  TradingMode,
  ConnectionStatus,
  SyncMode,
  TradePrefill,
  SpoofingChartMarker,
  BotLogEntry,
  RiskProfile,
  StructuredLogEntry,
  LogChannel,
  LogSeverity,
} from "./types";

export { deduplicateBots } from "./botSlice";
export type {
  SupportedExchange,
  ConnectionProbeStatus,
  ServiceProbeResult,
  StartupConnectionsHealth,
} from "./accountSlice";

// Combined store type
export type CryptoStore = AccountSlice &
  PortfolioSlice &
  MarketDataSlice &
  TradeSlice &
  BotSlice &
  TelemetrySlice &
  UISlice & {
    // Clear mock/simulated data
    clearMockData: () => void;
    clearSimulatedData: () => Promise<void>;
    // Transactional frame batch update (tickers + bot PnLs + bot positions in a single set())
    applyRealtimeFrameBatch: (batch: Record<string, TickerData>) => void;
  };

export const useCryptoStore = create<CryptoStore>()((...a) => ({
  ...createAccountSlice(...a),
  ...createPortfolioSlice(...(a as Parameters<typeof createPortfolioSlice>)),
  ...createMarketDataSlice(...a),
  ...createTradeSlice(...a),
  ...createBotSlice(...(a as Parameters<typeof createBotSlice>)),
  ...createTelemetrySlice(...a),
  ...createUISlice(...a),

  applyRealtimeFrameBatch: (batch) => {
    const set = a[0];
    set((state) => {
      let tickersChanged = false;
      for (const sym in batch) {
        const cur = state.tickers[sym];
        const next = batch[sym];
        if (
          !cur ||
          cur.price !== next.price ||
          cur.priceChangePercent !== next.priceChangePercent ||
          cur.bidPrice !== next.bidPrice ||
          cur.askPrice !== next.askPrice
        ) {
          tickersChanged = true;
          break;
        }
      }

      const nextTickers = tickersChanged ? { ...state.tickers, ...batch } : state.tickers;

      // 1. Atualiza PnL de activeBots
      let activeBotsChanged = false;
      const nextActiveBots =
        state.activeBots.length > 0
          ? state.activeBots.map((bot) => {
              const t = nextTickers[bot.symbol];
              const alloc = (bot as { allocatedCapital?: number }).allocatedCapital;
              if (t && bot.status === "RUNNING" && typeof alloc === "number" && Number.isFinite(t.price) && t.price > 0) {
                const pct = Number.isFinite(t.priceChangePercent) ? t.priceChangePercent : 0;
                const nextPnl = Number((alloc * (pct / 100)).toFixed(2));
                if (nextPnl !== (bot as { pnl?: number }).pnl) {
                  activeBotsChanged = true;
                  return { ...bot, pnl: nextPnl };
                }
              }
              return bot;
            })
          : state.activeBots;

      let nextMarginLedger = state.marginLedger;
      if (activeBotsChanged) {
        const totalPnl = nextActiveBots.reduce((s, b) => s + ((b as { pnl?: number }).pnl ?? 0), 0);
        const currentEquity = state.marginLedger.totalAccount + totalPnl;
        const peakEquity = Math.max(state.marginLedger.peakEquity, currentEquity);
        const currentDrawdown = Math.max(0, peakEquity - currentEquity);
        nextMarginLedger = { ...state.marginLedger, currentDrawdown, peakEquity };
      }

      // 2. Atualiza posições abertas dos robôs em tempo real
      let botsChanged = false;
      const nextBots = state.bots.map((b) => {
        if (!b.position || b.position.quantity <= 0) return b;
        const targetSymbol =
          b.position.symbol || (b.overrideSymbol && b.overrideSymbol !== "AUTO" ? b.overrideSymbol : b.symbol);
        const cleanSymbol = targetSymbol ? (targetSymbol.endsWith("USDT") ? targetSymbol : `${targetSymbol}USDT`) : "";
        const ticker = nextTickers[targetSymbol] || (cleanSymbol ? nextTickers[cleanSymbol] : undefined);
        if (!ticker || !ticker.price) return b;

        const currentPrice = ticker.price;
        const entryPrice = b.position.entryPrice;
        if (entryPrice <= 0 || b.position.currentPrice === currentPrice) return b;

        const gainPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
        const unrealizedPnlUsdt = parseFloat(((currentPrice - entryPrice) * b.position.quantity).toFixed(2));
        const highestPrice = Math.max(b.position.highestPrice || entryPrice, currentPrice);
        const lowestPrice = Math.min(b.position.lowestPrice ?? entryPrice, currentPrice);

        botsChanged = true;
        return {
          ...b,
          position: {
            ...b.position,
            currentPrice,
            highestPrice,
            lowestPrice,
            unrealizedPnl: unrealizedPnlUsdt,
            unrealizedPnlPercent: parseFloat(gainPercent.toFixed(2)),
          },
        };
      });

      if (!tickersChanged && !activeBotsChanged && !botsChanged) {
        return state;
      }

      return {
        ...(tickersChanged ? { tickers: nextTickers, lastMarketUpdate: Date.now() } : {}),
        ...(activeBotsChanged ? { activeBots: nextActiveBots, marginLedger: nextMarginLedger } : {}),
        ...(botsChanged ? { bots: nextBots } : {}),
      };
    });
  },

  // Clear all mock/simulated data in memory
  clearMockData: () => {
    const set = a[0];
    const get = a[1] as () => CryptoStore;
    const current = get();

    // Mantém trades que sejam comprovadamente do modo real, limpa os simulados
    const remainingTrades = current.trades.filter((t) => t.mode === "live");

    const cleanedBots = current.bots.map((b) => ({
      ...b,
      active: false,
      status: "stopped" as const,
      position: null,
      stats: {
        totalTrades: 0,
        buyTrades: 0,
        sellTrades: 0,
        winTrades: 0,
        lossTrades: 0,
        winRate: 0,
        realizedPnl: 0,
        lastAction: "Dados simulados limpos",
        lastActionTime: new Date().toISOString(),
        entryChecks: undefined,
      },
    }));

    set({
      trades: remainingTrades,
      aiSignals: [],
      chatMessages: [],
      alerts: [],
      botLogs: [],
      scheduledOrders: [],
      botActive: false,
      portfolio: {
        totalValue: 10000,
        cashBalance: 10000,
        assetBalance: 0,
        assetQuantity: 0,
        pnl: 0,
        pnlPercent: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        positions: [],
      },
      bots: cleanedBots,
    });

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          "tradeai_bots_v1",
          JSON.stringify({
            version: 1,
            savedAt: Date.now(),
            bots: cleanedBots,
            selectedBotId: current.selectedBotId,
          })
        );
      } catch {}
    }
  },

  // Clear simulated data both locally and in backend SQLite
  clearSimulatedData: async () => {
    const get = a[1] as () => CryptoStore;
    get().clearMockData();
    try {
      await Promise.all([
        fetch("/api/trades?mode=paper", { method: "DELETE" }),
        fetch("/api/account", { method: "DELETE" }),
      ]);
    } catch (err) {
      console.warn("[Store] Erro ao limpar dados simulados no servidor:", err);
    }
  },
}));

// Expose store on window for debugging (dev only)
if (typeof window !== "undefined") {
  (window as any).useCryptoStore = useCryptoStore;
}
