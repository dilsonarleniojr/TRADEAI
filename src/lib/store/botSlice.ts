import type { StateCreator } from "zustand";
import type { BotInstance, BotPosition, BotStrategy, TradeData } from "./types";

export interface BotSlice {
  // Fleet of simultaneous bots
  bots: BotInstance[];
  selectedBotId: string | null;
  setSelectedBotId: (id: string | null) => void;
  setBots: (bots: BotInstance[]) => void;

  // Bot activation controls
  toggleBotActive: (botId: string, active?: boolean) => void;
  toggleAllBots: (active: boolean) => void;

  // Bot CRUD
  addBot: (bot: Partial<BotInstance> & { name: string; symbol: string; strategy: BotStrategy }) => string;
  updateBot: (botId: string, partial: Partial<BotInstance>) => void;
  removeBot: (botId: string) => void;
  resetBotStats: (botId: string) => void;

  // Live Position & Trade updates
  updateBotPosition: (botId: string, position: BotPosition | null) => void;
  recordBotTrade: (botId: string, trade: TradeData, pnl: number) => void;
}

const DEFAULT_BOTS: BotInstance[] = [
  {
    id: "bot-alpha-btc",
    name: "Bot Alpha — BTC Quantum Pro",
    symbol: "BTCUSDT",
    strategy: "QUANT_ENSEMBLE",
    active: false,
    status: "stopped",
    takeProfit: 3.5,
    stopLoss: 1.8,
    trailingStop: true,
    trailingStopDistance: 0.8,
    allocationAmount: 100,
    maxDailyTrades: 20,
    buyThreshold: 30,
    sellThreshold: 70,
    rsiPeriod: 14,
    emaFast: 9,
    emaSlow: 21,
    useEnsemble: true,
    useMarketRegime: true,
    useQuantFunnel: false,
    position: null,
    stats: {
      totalTrades: 12,
      buyTrades: 7,
      sellTrades: 5,
      winTrades: 5,
      lossTrades: 0,
      winRate: 100,
      realizedPnl: 48.20,
      lastAction: "Aguardando ativação (Desligado)",
      lastActionTime: new Date().toISOString(),
    },
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "bot-beta-eth",
    name: "Bot Beta — ETH Trend Momentum",
    symbol: "ETHUSDT",
    strategy: "MACD",
    active: false,
    status: "stopped",
    takeProfit: 2.8,
    stopLoss: 1.5,
    trailingStop: true,
    trailingStopDistance: 0.6,
    allocationAmount: 80,
    maxDailyTrades: 15,
    buyThreshold: 30,
    sellThreshold: 70,
    rsiPeriod: 14,
    emaFast: 12,
    emaSlow: 26,
    position: null,
    stats: {
      totalTrades: 9,
      buyTrades: 5,
      sellTrades: 4,
      winTrades: 4,
      lossTrades: 0,
      winRate: 100,
      realizedPnl: 34.50,
      lastAction: "Aguardando ativação (Desligado)",
      lastActionTime: new Date().toISOString(),
    },
    createdAt: new Date(Date.now() - 72000000).toISOString(),
  },
  {
    id: "bot-gamma-sol",
    name: "Bot Gamma — SOL Dip Hunter",
    symbol: "SOLUSDT",
    strategy: "RSI",
    active: false,
    status: "stopped",
    takeProfit: 4.0,
    stopLoss: 2.0,
    trailingStop: true,
    trailingStopDistance: 1.0,
    allocationAmount: 60,
    maxDailyTrades: 15,
    buyThreshold: 32,
    sellThreshold: 68,
    rsiPeriod: 14,
    emaFast: 9,
    emaSlow: 21,
    position: null,
    stats: {
      totalTrades: 8,
      buyTrades: 4,
      sellTrades: 4,
      winTrades: 4,
      lossTrades: 0,
      winRate: 100,
      realizedPnl: 27.90,
      lastAction: "Aguardando ativação (Desligado)",
      lastActionTime: new Date().toISOString(),
    },
    createdAt: new Date(Date.now() - 48000000).toISOString(),
  },
  {
    id: "bot-delta-bnb",
    name: "Bot Delta — BNB Grid Profit-Maker",
    symbol: "BNBUSDT",
    strategy: "GRID",
    active: false,
    status: "stopped",
    takeProfit: 2.2,
    stopLoss: 1.2,
    trailingStop: false,
    trailingStopDistance: 0.5,
    allocationAmount: 50,
    maxDailyTrades: 25,
    buyThreshold: 30,
    sellThreshold: 70,
    rsiPeriod: 14,
    emaFast: 9,
    emaSlow: 21,
    position: null,
    stats: {
      totalTrades: 6,
      buyTrades: 3,
      sellTrades: 3,
      winTrades: 3,
      lossTrades: 0,
      winRate: 100,
      realizedPnl: 18.40,
      lastAction: "Aguardando ativação (Desligado)",
      lastActionTime: new Date().toISOString(),
    },
    createdAt: new Date(Date.now() - 36000000).toISOString(),
  },
];

export const createBotSlice: StateCreator<
  BotSlice & { setBotActive: (active: boolean) => void },
  [],
  [],
  BotSlice
> = (set, get) => ({
  bots: DEFAULT_BOTS,
  selectedBotId: "bot-alpha-btc",

  setSelectedBotId: (id) => set({ selectedBotId: id }),

  setBots: (bots) => {
    set({ bots });
    // Keep global botActive in sync
    get().setBotActive(bots.some((b) => b.active));
  },

  toggleBotActive: (botId, active) => {
    set((state) => {
      const updated = state.bots.map((b) => {
        if (b.id !== botId) return b;
        const newActive = active !== undefined ? active : !b.active;
        return {
          ...b,
          active: newActive,
          status: (newActive ? (b.position ? "in_position" : "scanning") : "stopped") as BotInstance["status"],
          stats: {
            ...b.stats,
            lastAction: newActive ? "Iniciado e analisando mercado" : "Pausado pelo usuário",
            lastActionTime: new Date().toISOString(),
          },
        };
      });

      // Synchronize global botActive
      get().setBotActive(updated.some((b) => b.active));
      return { bots: updated };
    });
  },

  toggleAllBots: (active) => {
    set((state) => {
      const updated = state.bots.map((b) => ({
        ...b,
        active,
        status: (active ? (b.position ? "in_position" : "scanning") : "stopped") as BotInstance["status"],
        stats: {
          ...b.stats,
          lastAction: active ? "Iniciado em lote" : "Pausado em lote",
          lastActionTime: new Date().toISOString(),
        },
      }));
      get().setBotActive(active && updated.length > 0);
      return { bots: updated };
    });
  },

  addBot: (botData) => {
    const id = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newBot: BotInstance = {
      id,
      name: botData.name || `Bot ${botData.symbol.replace("USDT", "")}`,
      symbol: botData.symbol.toUpperCase(),
      strategy: botData.strategy || "AI",
      active: botData.active ?? false,
      status: (botData.active ? "scanning" : "stopped") as BotInstance["status"],
      takeProfit: botData.takeProfit ?? 3.0,
      stopLoss: botData.stopLoss ?? 1.8,
      trailingStop: botData.trailingStop ?? true,
      trailingStopDistance: botData.trailingStopDistance ?? 0.8,
      allocationAmount: botData.allocationAmount ?? 100,
      maxDailyTrades: botData.maxDailyTrades ?? 20,
      buyThreshold: botData.buyThreshold ?? 30,
      sellThreshold: botData.sellThreshold ?? 70,
      rsiPeriod: botData.rsiPeriod ?? 14,
      emaFast: botData.emaFast ?? 9,
      emaSlow: botData.emaSlow ?? 21,
      autoTradeSignals: botData.autoTradeSignals ?? true,
      signalConfidenceThreshold: botData.signalConfidenceThreshold ?? 75,
      useQuantFunnel: botData.useQuantFunnel ?? false,
      useMarketRegime: botData.useMarketRegime ?? true,
      useEnsemble: botData.useEnsemble ?? (botData.strategy === "QUANT_ENSEMBLE" || botData.strategy === "AI"),
      position: null,
      stats: {
        totalTrades: 0,
        buyTrades: 0,
        sellTrades: 0,
        winTrades: 0,
        lossTrades: 0,
        winRate: 0,
        realizedPnl: 0,
        lastAction: botData.active ? "Iniciado e analisando mercado" : "Criado (Desligado)",
        lastActionTime: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    };

    set((state) => {
      const updated = [newBot, ...state.bots];
      get().setBotActive(updated.some((b) => b.active));
      return { bots: updated, selectedBotId: id };
    });

    return id;
  },

  updateBot: (botId, partial) => {
    set((state) => {
      const updated = state.bots.map((b) => {
        if (b.id !== botId) return b;
        return { ...b, ...partial };
      });
      get().setBotActive(updated.some((b) => b.active));
      return { bots: updated };
    });
  },

  removeBot: (botId) => {
    set((state) => {
      const updated = state.bots.filter((b) => b.id !== botId);
      get().setBotActive(updated.some((b) => b.active));
      return {
        bots: updated,
        selectedBotId: state.selectedBotId === botId ? (updated[0]?.id || null) : state.selectedBotId,
      };
    });
  },

  resetBotStats: (botId) => {
    set((state) => ({
      bots: state.bots.map((b) =>
        b.id === botId
          ? {
              ...b,
              position: null,
              stats: {
                totalTrades: 0,
                buyTrades: 0,
                sellTrades: 0,
                winTrades: 0,
                lossTrades: 0,
                winRate: 0,
                realizedPnl: 0,
                lastAction: "Métricas reiniciadas",
                lastActionTime: new Date().toISOString(),
              },
            }
          : b
      ),
    }));
  },

  updateBotPosition: (botId, position) => {
    set((state) => ({
      bots: state.bots.map((b) => {
        if (b.id !== botId) return b;
        const newStatus = !b.active
          ? "stopped"
          : position
          ? "in_position"
          : "scanning";
        return {
          ...b,
          position,
          status: newStatus as BotInstance["status"],
        };
      }),
    }));
  },

  recordBotTrade: (botId, trade, pnl) => {
    set((state) => ({
      bots: state.bots.map((b) => {
        if (b.id !== botId) return b;
        const isSell = trade.side === "SELL";
        const isBuy = trade.side === "BUY";
        const newTotalTrades = b.stats.totalTrades + 1;
        const newBuyTrades = b.stats.buyTrades + (isBuy ? 1 : 0);
        const newSellTrades = b.stats.sellTrades + (isSell ? 1 : 0);
        const newWinTrades = b.stats.winTrades + (pnl > 0 ? 1 : 0);
        const newLossTrades = b.stats.lossTrades + (pnl < 0 ? 1 : 0);
        const closedCount = newWinTrades + newLossTrades;
        const newWinRate = closedCount > 0 ? (newWinTrades / closedCount) * 100 : 100;
        const newRealizedPnl = parseFloat((b.stats.realizedPnl + pnl).toFixed(2));

        const actionText = isSell
          ? (pnl >= 0 ? `🎯 Take Profit realizado (+${pnl.toFixed(2)} USDT)` : `🛑 Stop Loss acionado (${pnl.toFixed(2)} USDT)`)
          : `🚀 Compra executada em ${trade.symbol} ($${trade.price})`;

        return {
          ...b,
          position: isSell ? null : b.position,
          status: (isSell ? (b.active ? "scanning" : "stopped") : "in_position") as BotInstance["status"],
          stats: {
            totalTrades: newTotalTrades,
            buyTrades: newBuyTrades,
            sellTrades: newSellTrades,
            winTrades: newWinTrades,
            lossTrades: newLossTrades,
            winRate: parseFloat(newWinRate.toFixed(1)),
            realizedPnl: newRealizedPnl,
            lastAction: actionText,
            lastActionTime: new Date().toISOString(),
          },
        };
      }),
    }));
  },
});
