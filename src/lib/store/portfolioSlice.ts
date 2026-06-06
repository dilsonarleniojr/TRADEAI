import type { StateCreator } from "zustand";
import type { PortfolioData, TickerData, BotConfigData } from "./types";

export interface PortfolioSlice {
  // Portfolio
  portfolio: PortfolioData;
  setPortfolio: (portfolio: PortfolioData) => void;

  // Account from backend — authoritative source
  setAccount: (account: {
    cashBalance: number;
    assetQuantity: number;
    symbol: string;
    positions?: Array<{ symbol: string; quantity: number; marketValue: number }>;
  }) => void;

  // Bot config (needed for initialBalance reference)
  botConfig: BotConfigData;
  setBotConfig: (config: BotConfigData) => void;
}

// This slice needs access to tickers from marketDataSlice.
// We use a getter pattern where setAccount reads tickers from the combined store.
export const createPortfolioSlice: StateCreator<
  PortfolioSlice & { tickers: Record<string, TickerData> },
  [],
  [],
  PortfolioSlice
> = (set, get) => ({
  // Portfolio
  portfolio: {
    totalValue: 10000,
    cashBalance: 10000,
    assetBalance: 0,
    assetQuantity: 0,
    pnl: 0,
    pnlPercent: 0,
  },
  setPortfolio: (portfolio) => set({ portfolio }),

  // Account from backend — single source of truth for balance
  setAccount: (account) => {
    const state = get();
    const price = state.tickers[account.symbol]?.price ?? 0;
    const assetBalance = account.assetQuantity * price;
    const totalValue = account.cashBalance + assetBalance;
    const initial = state.botConfig.initialBalance || 10000;
    const pnl = totalValue - initial;
    const pnlPercent = initial > 0 ? (pnl / initial) * 100 : 0;
    set({
      portfolio: {
        totalValue,
        cashBalance: account.cashBalance,
        assetBalance,
        assetQuantity: account.assetQuantity,
        pnl,
        pnlPercent,
      },
    });
  },

  // Bot config
  botConfig: {
    strategy: "AI",
    symbol: "BTCUSDT",
    stopLoss: 2,
    takeProfit: 5,
    maxDailyTrades: 10,
    buyThreshold: 30,
    sellThreshold: 70,
    initialBalance: 10000,
    autoTradeSignals: false,
    signalConfidenceThreshold: 75,
    useQuantFunnel: false,
    useMarketRegime: false,
    useEnsemble: false,
    rsiPeriod: 14,
    emaFast: 9,
    emaSlow: 21,
  },
  setBotConfig: (config) => set({ botConfig: config }),
});
