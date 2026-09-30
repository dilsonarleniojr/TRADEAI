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
  BotPosition,
  BotStrategy,
  BotStats,
  PortfolioData,
  PortfolioPosition,
  TradeData,
  AISignalData,
  ChatMessage,
  PriceAlert,
  ActiveSection,
  TradingMode,
  ConnectionStatus,
  SyncMode,
} from "./types";

// Combined store type
export type CryptoStore = AccountSlice &
  PortfolioSlice &
  MarketDataSlice &
  TradeSlice &
  BotSlice &
  TelemetrySlice &
  UISlice & {
    // Clear all data action
    clearMockData: () => void;
  };

export const useCryptoStore = create<CryptoStore>()((...a) => ({
  ...createAccountSlice(...a),
  ...createPortfolioSlice(...(a as Parameters<typeof createPortfolioSlice>)),
  ...createMarketDataSlice(...a),
  ...createTradeSlice(...a),
  ...createBotSlice(...(a as Parameters<typeof createBotSlice>)),
  ...createTelemetrySlice(...a),
  ...createUISlice(...a),

  // Clear all mock/simulated data
  clearMockData: () => {
    const set = a[0];
    set({
      trades: [],
      aiSignals: [],
      chatMessages: [],
      alerts: [],
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
      bots: (a[1]() as CryptoStore).bots.map((b) => ({
        ...b,
        active: false,
        status: "stopped",
        position: null,
      })),
    });
  },
}));

// Expose store on window for debugging (dev only)
if (typeof window !== "undefined") {
  (window as any).useCryptoStore = useCryptoStore;
}
