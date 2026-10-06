import type { StateCreator } from "zustand";
import type { PortfolioData, TickerData, BotConfigData, PortfolioPosition, TradeData } from "./types";

export interface PortfolioSlice {
  // Portfolio
  portfolio: PortfolioData;
  setPortfolio: (portfolio: PortfolioData) => void;

  /** Última sincronização do saldo com o servidor e de onde veio ("paper", "binance", "binance-testnet"). */
  accountSyncedAt: number | null;
  accountSource: string | null;

  // Account from backend — authoritative source
  setAccount: (account: {
    cashBalance: number;
    cashFree?: number;
    assetQuantity: number;
    symbol: string;
    totalValue?: number;
    /** Valor total em moedas (todas as posições). */
    assetBalance?: number;
    pnl?: number;
    pnlPercent?: number;
    realizedPnl?: number;
    unrealizedPnl?: number;
    positions?: PortfolioPosition[];
    source?: string;
  }) => void;

  // Bot config (needed for initialBalance reference)
  botConfig: BotConfigData;
  setBotConfig: (config: BotConfigData) => void;

  // Apply a trade executed by any bot or manually
  applyTradeToPortfolio: (trade: TradeData) => void;
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
    realizedPnl: 0,
    unrealizedPnl: 0,
    positions: [],
  },
  setPortfolio: (portfolio) => set({ portfolio }),

  accountSyncedAt: null,
  accountSource: null,

  // Account from backend — single source of truth for balance
  setAccount: (account) => {
    const state = get();
    // Valor em moedas: o do servidor (todas as posições) > soma das posições > moeda principal.
    const assetBalance =
      account.assetBalance ??
      (account.positions
        ? account.positions.reduce((sum, p) => sum + (p.marketValue || 0), 0)
        : account.assetQuantity * (state.tickers[account.symbol]?.price ?? 0));
    
    const totalValue = account.totalValue !== undefined ? account.totalValue : (account.cashBalance + assetBalance);
    const pnl = account.pnl !== undefined ? account.pnl : (totalValue - (state.botConfig.initialBalance || 10000));
    const pnlPercent = account.pnlPercent !== undefined ? account.pnlPercent : ((state.botConfig.initialBalance || 10000) > 0 ? (pnl / (state.botConfig.initialBalance || 10000)) * 100 : 0);
    const realizedPnl = account.realizedPnl !== undefined ? account.realizedPnl : 0;
    const unrealizedPnl = account.unrealizedPnl !== undefined ? account.unrealizedPnl : 0;
    const positions = account.positions !== undefined ? account.positions : [];

    set({
      accountSyncedAt: Date.now(),
      accountSource: account.source ?? null,
      portfolio: {
        totalValue,
        cashBalance: account.cashFree !== undefined ? account.cashFree : account.cashBalance,
        assetBalance,
        assetQuantity: account.assetQuantity,
        pnl,
        pnlPercent,
        realizedPnl,
        unrealizedPnl,
        positions,
      },
    });
  },

  // Apply simulated or executed trade across multi-coin positions
  applyTradeToPortfolio: (trade) => {
    const state = get();
    const currentPort = state.portfolio;
    const initialBalance = state.botConfig.initialBalance || 10000;
    let newCash = currentPort.cashBalance;
    let newRealizedPnl = currentPort.realizedPnl || 0;
    const positions = [...(currentPort.positions || [])];

    const posIdx = positions.findIndex((p) => p.symbol === trade.symbol);
    const tickerPrice = state.tickers[trade.symbol]?.price || trade.price;

    if (trade.side === "BUY") {
      newCash = Math.max(0, newCash - trade.total);
      if (posIdx >= 0) {
        const existing = positions[posIdx];
        const newQty = existing.quantity + trade.quantity;
        const newAvg = (existing.quantity * existing.avgPrice + trade.total) / (newQty || 1);
        const marketVal = newQty * tickerPrice;
        const unrealized = marketVal - (newQty * newAvg);
        positions[posIdx] = {
          ...existing,
          quantity: newQty,
          avgPrice: newAvg,
          marketPrice: tickerPrice,
          marketValue: marketVal,
          unrealizedPnl: unrealized,
        };
      } else {
        const marketVal = trade.quantity * tickerPrice;
        positions.push({
          symbol: trade.symbol,
          quantity: trade.quantity,
          avgPrice: trade.price,
          marketPrice: tickerPrice,
          marketValue: marketVal,
          unrealizedPnl: marketVal - trade.total,
          realizedPnl: 0,
        });
      }
    } else {
      // SELL: Cash added, position reduced/closed
      newCash += trade.total;
      const tradePnl = trade.pnl || 0;
      newRealizedPnl += tradePnl;

      if (posIdx >= 0) {
        const existing = positions[posIdx];
        const remainingQty = Math.max(0, existing.quantity - trade.quantity);
        if (remainingQty <= 0.00001) {
          positions.splice(posIdx, 1);
        } else {
          const marketVal = remainingQty * tickerPrice;
          const unrealized = marketVal - (remainingQty * existing.avgPrice);
          positions[posIdx] = {
            ...existing,
            quantity: remainingQty,
            marketPrice: tickerPrice,
            marketValue: marketVal,
            unrealizedPnl: unrealized,
            realizedPnl: (existing.realizedPnl || 0) + tradePnl,
          };
        }
      }
    }

    // Recompute portfolio totals
    const totalAssetBalance = positions.reduce((sum, p) => sum + (p.marketValue || 0), 0);
    const totalUnrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0);
    const newTotalValue = newCash + totalAssetBalance;
    const newPnl = newTotalValue - initialBalance;
    const newPnlPercent = initialBalance > 0 ? (newPnl / initialBalance) * 100 : 0;
    const primaryAssetQty = positions.find((p) => p.symbol === state.botConfig.symbol)?.quantity || (positions[0]?.quantity || 0);

    set({
      portfolio: {
        totalValue: newTotalValue,
        cashBalance: newCash,
        assetBalance: totalAssetBalance,
        assetQuantity: primaryAssetQty,
        pnl: newPnl,
        pnlPercent: newPnlPercent,
        realizedPnl: newRealizedPnl,
        unrealizedPnl: totalUnrealizedPnl,
        positions,
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
    useMultiTimeframe: true,
    rsiPeriod: 14,
    emaFast: 9,
    emaSlow: 21,
  },
  setBotConfig: (config) => set({ botConfig: config }),
});
