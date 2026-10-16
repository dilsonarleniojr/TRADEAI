import { create } from "zustand";
import { createAccountSlice, type AccountSlice } from "./accountSlice";
import { createPortfolioSlice, type PortfolioSlice } from "./portfolioSlice";
import { createMarketDataSlice, type MarketDataSlice } from "./marketDataSlice";
import { createTradeSlice, type TradeSlice } from "./tradeSlice";
import { createBotSlice, type BotSlice } from "./botSlice";
import { createTelemetrySlice, type TelemetrySlice } from "./telemetrySlice";
import { createUISlice, type UISlice } from "./uiSlice";

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
} from "./types";

export { deduplicateBots } from "./botSlice";

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
  };

export const useCryptoStore = create<CryptoStore>()((...a) => ({
  ...createAccountSlice(...a),
  ...createPortfolioSlice(...(a as Parameters<typeof createPortfolioSlice>)),
  ...createMarketDataSlice(...a),
  ...createTradeSlice(...a),
  ...createBotSlice(...(a as Parameters<typeof createBotSlice>)),
  ...createTelemetrySlice(...a),
  ...createUISlice(...a),

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
