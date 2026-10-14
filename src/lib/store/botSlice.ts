import type { StateCreator } from "zustand";
import type { BotInstance, BotPosition, BotStrategy, TickerData, TradeData, BotExecutionReport } from "./types";

export interface BotSlice {
  // Fleet of simultaneous bots
  bots: BotInstance[];
  selectedBotId: string | null;
  setSelectedBotId: (id: string | null) => void;
  setBots: (bots: BotInstance[]) => void;

  // Active execution report modal
  activeExecutionReport: BotExecutionReport | null;
  setActiveExecutionReport: (report: BotExecutionReport | null) => void;

  // Bot activation controls
  toggleBotActive: (botId: string, active?: boolean) => void;
  toggleAllBots: (active: boolean) => void;

  // Bot CRUD
  addBot: (bot: Partial<BotInstance> & { name: string; symbol: string; strategy: BotStrategy }) => string;
  updateBot: (botId: string, partial: Partial<BotInstance>) => void;
  removeBot: (botId: string) => void;
  removeAllBots: () => void;
  resetBotStats: (botId: string) => void;
  resetAllBotStats: () => void;
  clearSimulatedPositions: () => void;

  // Live Position & Trade updates
  updateBotPosition: (botId: string, position: BotPosition | null) => void;
  updateBotPositionsRealtime: (tickers: Record<string, TickerData>) => void;
  recordBotTrade: (botId: string, trade: TradeData, pnl: number) => void;
}

export const DEFAULT_BOTS: BotInstance[] = [
  {
    id: "bot-alpha-btc",
    name: "Bot Alpha — BTC Quantum Pro",
    symbol: "BTCUSDT",
    strategy: "QUANT_ENSEMBLE",
    active: false,
    status: "stopped",
    algorithmVersion: "v2.5.0-institutional",
    slippageTolerance: 0.35,
    riskPerTradePercent: 40.0,
    maxHoldingMinutes: 45,
    timeStopMinutes: 45,
    takeProfit: 2.0,
    stopLoss: 1.5,
    trailingStop: true,
    trailingStopDistance: 0.45,
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
    useMultiTimeframe: true,
    autoBreakEven: true,
    breakEvenTrigger: 0.85,
    breakEvenBuffer: 0.30,
    usePartialTp: true,
    partialTpTrigger: 1.0,
    partialTpPercent: 50,
    position: null,
    stats: {
      totalTrades: 0,
      buyTrades: 0,
      sellTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      winRate: 0,
      realizedPnl: 0,
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
    algorithmVersion: "v2.5.0-institutional",
    slippageTolerance: 0.35,
    riskPerTradePercent: 35.0,
    maxHoldingMinutes: 45,
    timeStopMinutes: 45,
    takeProfit: 2.2,
    stopLoss: 1.5,
    trailingStop: true,
    trailingStopDistance: 0.45,
    allocationAmount: 80,
    maxDailyTrades: 15,
    buyThreshold: 30,
    sellThreshold: 70,
    rsiPeriod: 14,
    emaFast: 12,
    emaSlow: 26,
    useMultiTimeframe: true,
    autoBreakEven: true,
    breakEvenTrigger: 0.85,
    breakEvenBuffer: 0.30,
    usePartialTp: true,
    partialTpTrigger: 1.0,
    partialTpPercent: 50,
    position: null,
    stats: {
      totalTrades: 0,
      buyTrades: 0,
      sellTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      winRate: 0,
      realizedPnl: 0,
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
    algorithmVersion: "v2.5.0-institutional",
    slippageTolerance: 0.40,
    riskPerTradePercent: 35.0,
    maxHoldingMinutes: 45,
    timeStopMinutes: 45,
    takeProfit: 2.4,
    stopLoss: 1.6,
    trailingStop: true,
    trailingStopDistance: 0.5,
    allocationAmount: 60,
    maxDailyTrades: 15,
    buyThreshold: 32,
    sellThreshold: 68,
    rsiPeriod: 14,
    emaFast: 9,
    emaSlow: 21,
    useMultiTimeframe: true,
    autoBreakEven: true,
    breakEvenTrigger: 0.85,
    breakEvenBuffer: 0.30,
    usePartialTp: true,
    partialTpTrigger: 1.0,
    partialTpPercent: 50,
    position: null,
    stats: {
      totalTrades: 0,
      buyTrades: 0,
      sellTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      winRate: 0,
      realizedPnl: 0,
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
    algorithmVersion: "v2.5.0-institutional",
    slippageTolerance: 0.35,
    riskPerTradePercent: 30.0,
    maxHoldingMinutes: 45,
    timeStopMinutes: 45,
    takeProfit: 2.0,
    stopLoss: 1.5,
    trailingStop: false,
    trailingStopDistance: 0.5,
    allocationAmount: 50,
    maxDailyTrades: 25,
    buyThreshold: 30,
    sellThreshold: 70,
    rsiPeriod: 14,
    emaFast: 9,
    emaSlow: 21,
    useMultiTimeframe: true,
    autoBreakEven: true,
    breakEvenTrigger: 0.85,
    breakEvenBuffer: 0.30,
    usePartialTp: true,
    partialTpTrigger: 1.0,
    partialTpPercent: 50,
    position: null,
    stats: {
      totalTrades: 0,
      buyTrades: 0,
      sellTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      winRate: 0,
      realizedPnl: 0,
      lastAction: "Aguardando ativação (Desligado)",
      lastActionTime: new Date().toISOString(),
    },
    createdAt: new Date(Date.now() - 36000000).toISOString(),
  },
  {
    id: "bot-epsilon-auto",
    name: "Bot Épsilon — Auto-Screener Top Altas",
    symbol: "AUTO",
    strategy: "QUANT_ENSEMBLE",
    active: false,
    status: "stopped",
    algorithmVersion: "v2.5.0-institutional",
    slippageTolerance: 0.40,
    riskPerTradePercent: 40.0,
    maxHoldingMinutes: 45,
    timeStopMinutes: 45,
    takeProfit: 2.2,
    stopLoss: 1.6,
    trailingStop: true,
    trailingStopDistance: 0.45,
    trailingTakeProfit: true,
    trailingTakeProfitDistance: 0.45,
    allocationAmount: 40,
    maxDailyTrades: 25,
    buyThreshold: 30,
    sellThreshold: 70,
    rsiPeriod: 14,
    emaFast: 9,
    emaSlow: 21,
    useAutoScreener: true,
    useMultiTimeframe: true,
    useMarketRegime: false,
    autoBreakEven: true,
    breakEvenTrigger: 0.85,
    breakEvenBuffer: 0.30,
    usePartialTp: true,
    partialTpTrigger: 1.0,
    partialTpPercent: 50,
    position: null,
    stats: {
      totalTrades: 0,
      buyTrades: 0,
      sellTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      winRate: 0,
      realizedPnl: 0,
      lastAction: "Aguardando ativação (Desligado)",
      lastActionTime: new Date().toISOString(),
    },
    createdAt: new Date(Date.now() - 18000000).toISOString(),
  },
  {
    id: "bot-guardian-bat",
    name: "Bot BAT — Gestor de Saída (Custódia)",
    symbol: "BATUSDT",
    strategy: "QUANT_ENSEMBLE",
    active: true,
    status: "in_position",
    algorithmVersion: "v2.5.0-institutional",
    slippageTolerance: 0.35,
    riskPerTradePercent: 35.0,
    maxHoldingMinutes: 180,
    timeStopMinutes: 180,
    takeProfit: 1.5,
    stopLoss: 2.0,
    trailingStop: true,
    trailingStopDistance: 0.45,
    trailingTakeProfit: true,
    trailingTakeProfitDistance: 0.40,
    allocationAmount: 116,
    maxDailyTrades: 10,
    buyThreshold: 30,
    sellThreshold: 70,
    rsiPeriod: 14,
    emaFast: 9,
    emaSlow: 21,
    useEnsemble: true,
    useMarketRegime: true,
    autoBreakEven: true,
    breakEvenTrigger: 0.60,
    breakEvenBuffer: 0.20,
    usePartialTp: true,
    partialTpTrigger: 1.0,
    partialTpPercent: 50,
    position: {
      symbol: "BATUSDT",
      side: "BUY",
      quantity: 573.426,
      entryPrice: 0.2023,
      currentPrice: 0.2023,
      highestPrice: 0.2023,
      totalCost: 116.0,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      entryTime: new Date().toISOString(),
      mode: "live",
      breakEvenPrice: 0.2029,
      isBreakEvenArmed: true,
    },
    stats: {
      totalTrades: 0,
      buyTrades: 1,
      sellTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      winRate: 0,
      realizedPnl: 0,
      lastAction: "Gerenciando saída de 573.42 BAT com Trailing TP e Break-Even",
      lastActionTime: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "bot-guardian-amp",
    name: "Bot AMP — Gestor de Saída (Custódia)",
    symbol: "AMPUSDT",
    strategy: "QUANT_ENSEMBLE",
    active: true,
    status: "in_position",
    algorithmVersion: "v2.5.0-institutional",
    slippageTolerance: 0.35,
    riskPerTradePercent: 35.0,
    maxHoldingMinutes: 180,
    timeStopMinutes: 180,
    takeProfit: 1.5,
    stopLoss: 2.0,
    trailingStop: true,
    trailingStopDistance: 0.45,
    trailingTakeProfit: true,
    trailingTakeProfitDistance: 0.40,
    allocationAmount: 31.5,
    maxDailyTrades: 10,
    buyThreshold: 30,
    sellThreshold: 70,
    rsiPeriod: 14,
    emaFast: 9,
    emaSlow: 21,
    useEnsemble: true,
    useMarketRegime: true,
    autoBreakEven: true,
    breakEvenTrigger: 0.60,
    breakEvenBuffer: 0.20,
    usePartialTp: true,
    partialTpTrigger: 1.0,
    partialTpPercent: 50,
    position: {
      symbol: "AMPUSDT",
      side: "BUY",
      quantity: 43275.681,
      entryPrice: 0.000727,
      currentPrice: 0.000727,
      highestPrice: 0.000727,
      totalCost: 31.46,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      entryTime: new Date().toISOString(),
      mode: "live",
      breakEvenPrice: 0.000729,
      isBreakEvenArmed: true,
    },
    stats: {
      totalTrades: 0,
      buyTrades: 1,
      sellTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      winRate: 0,
      realizedPnl: 0,
      lastAction: "Gerenciando saída de 43.275 AMP com Trailing TP e Break-Even",
      lastActionTime: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
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
  activeExecutionReport: null,

  setSelectedBotId: (id) => set({ selectedBotId: id }),
  setActiveExecutionReport: (report) => set({ activeExecutionReport: report }),

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
      name: botData.name || (botData.symbol === "AUTO" ? "Bot Auto-Screener" : `Bot ${botData.symbol.replace("USDT", "")}`),
      symbol: botData.symbol.toUpperCase(),
      strategy: botData.strategy || "AI",
      active: botData.active ?? false,
      status: (botData.active ? "scanning" : "stopped") as BotInstance["status"],
      takeProfit: botData.takeProfit ?? 2.2,
      stopLoss: botData.stopLoss ?? 1.0,
      trailingStop: botData.trailingStop ?? true,
      trailingStopDistance: botData.trailingStopDistance ?? 0.4,
      allocationAmount: botData.allocationAmount ?? 25,
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
      useEnsemble: botData.useEnsemble ?? false,
      useMultiTimeframe: botData.useMultiTimeframe ?? true,
      useAutoScreener: botData.useAutoScreener ?? (botData.symbol === "AUTO"),
      autoBreakEven: botData.autoBreakEven ?? true,
      breakEvenTrigger: botData.breakEvenTrigger ?? 1.2,
      breakEvenBuffer: botData.breakEvenBuffer ?? 0.25,
      trailingTakeProfit: botData.trailingTakeProfit ?? true,
      trailingTakeProfitDistance: botData.trailingTakeProfitDistance ?? 0.4,
      usePartialTp: botData.usePartialTp ?? true,
      partialTpTrigger: botData.partialTpTrigger ?? 1.0,
      partialTpPercent: botData.partialTpPercent ?? 50,
      maxHoldingMinutes: botData.maxHoldingMinutes ?? 45,
      timeStopMinutes: botData.timeStopMinutes ?? 45,
      useBtcGatekeeper: botData.useBtcGatekeeper ?? true,
      useSmartDca: botData.useSmartDca ?? true,
      maxDcaOrders: botData.maxDcaOrders ?? 1,
      dcaDipThreshold: botData.dcaDipThreshold ?? 1.5,
      dcaMultiplier: botData.dcaMultiplier ?? 1.0,
      useOrderBookFilter: botData.useOrderBookFilter ?? true,
      maxSpreadPercent: botData.maxSpreadPercent ?? 0.15,
      minBidAskRatio: botData.minBidAskRatio ?? 0.45,
      stopAfterProfit: botData.stopAfterProfit ?? false,
      aiEngine: botData.aiEngine,
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

  removeAllBots: () => {
    get().setBotActive(false);
    set({
      bots: [],
      selectedBotId: null,
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

  resetAllBotStats: () => {
    set((state) => ({
      bots: state.bots.map((b) => ({
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
      })),
    }));
  },

  clearSimulatedPositions: () => {
    set((state) => ({
      bots: state.bots.map((b) => {
        // Se a posição aberta do bot é simulada (ou sem modo explícito = paper), fecha ela
        if (b.position && (b.position.mode === "paper" || !b.position.mode)) {
          return {
            ...b,
            position: null,
            status: b.active ? "scanning" : "stopped",
            stats: {
              ...b.stats,
              lastAction: "Posição simulada limpa",
              lastActionTime: new Date().toISOString(),
            },
          };
        }
        return b;
      }),
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

  updateBotPositionsRealtime: (tickers) => {
    set((state) => {
      let hasChanges = false;
      const updatedBots = state.bots.map((b) => {
        if (!b.position || b.position.quantity <= 0) return b;
        const ticker = tickers[b.symbol];
        if (!ticker || !ticker.price) return b;

        const currentPrice = ticker.price;
        const entryPrice = b.position.entryPrice;
        if (entryPrice <= 0) return b;

        const gainPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
        const unrealizedPnlUsdt = parseFloat(((currentPrice - entryPrice) * b.position.quantity).toFixed(2));
        const highestPrice = Math.max(b.position.highestPrice || entryPrice, currentPrice);

        hasChanges = true;
        return {
          ...b,
          position: {
            ...b.position,
            currentPrice,
            highestPrice,
            unrealizedPnl: unrealizedPnlUsdt,
            unrealizedPnlPercent: parseFloat(gainPercent.toFixed(2)),
          },
        };
      });

      return hasChanges ? { bots: updatedBots } : state;
    });
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
