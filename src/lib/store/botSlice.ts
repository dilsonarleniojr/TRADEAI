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
];

const BOTS_STORAGE_KEY = "tradeai_fleet_bots";

function loadBotsFromStorage(): BotInstance[] {
  if (typeof window === "undefined") return DEFAULT_BOTS;
  try {
    const raw = localStorage.getItem(BOTS_STORAGE_KEY);
    if (!raw) return DEFAULT_BOTS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Purgar robôs de teste hardcoded legados (BAT e AMP mockados)
      const sanitized = parsed.filter(
        (b) => b && b.id !== "bot-guardian-bat" && b.id !== "bot-guardian-amp"
      );
      if (sanitized.length > 0) {
        return sanitized;
      }
    }
  } catch (e) {
    console.warn("[botSlice] Falha ao carregar frota de robôs do localStorage:", e);
  }
  return DEFAULT_BOTS;
}

function persistBots(bots: BotInstance[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BOTS_STORAGE_KEY, JSON.stringify(bots));
  } catch (e) {
    console.warn("[botSlice] Falha ao salvar frota de robôs no localStorage:", e);
  }
}

export const createBotSlice: StateCreator<
  BotSlice & { setBotActive: (active: boolean) => void },
  [],
  [],
  BotSlice
> = (set, get) => ({
  bots: loadBotsFromStorage(),
  selectedBotId: "bot-alpha-btc",
  activeExecutionReport: null,

  setSelectedBotId: (id) => set({ selectedBotId: id }),
  setActiveExecutionReport: (report) => set({ activeExecutionReport: report }),

  setBots: (bots) => {
    persistBots(bots);
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

      persistBots(updated);
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
      persistBots(updated);
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
      status: (botData.active ? (botData.position ? "in_position" : "scanning") : "stopped") as BotInstance["status"],
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
      useAiExit: botData.useAiExit ?? (botData.strategy === "AI"),
      aiEngine: botData.aiEngine,
      position: botData.position || null,
      stats: {
        totalTrades: 0,
        buyTrades: 0,
        sellTrades: 0,
        winTrades: 0,
        lossTrades: 0,
        winRate: 0,
        realizedPnl: 0,
        lastAction: botData.active ? (botData.position ? `Gerenciando custódia de ${botData.position.quantity} ${botData.symbol.replace("USDT", "")}` : "Iniciado e analisando mercado") : "Criado (Desligado)",
        lastActionTime: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    };

    set((state) => {
      const updated = [newBot, ...state.bots];
      persistBots(updated);
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
      persistBots(updated);
      get().setBotActive(updated.some((b) => b.active));
      return { bots: updated };
    });
  },

  removeBot: (botId) => {
    set((state) => {
      const updated = state.bots.filter((b) => b.id !== botId);
      persistBots(updated);
      get().setBotActive(updated.some((b) => b.active));
      return {
        bots: updated,
        selectedBotId: state.selectedBotId === botId ? (updated[0]?.id || null) : state.selectedBotId,
      };
    });
  },

  removeAllBots: () => {
    persistBots([]);
    get().setBotActive(false);
    set({
      bots: [],
      selectedBotId: null,
    });
  },

  resetBotStats: (botId) => {
    set((state) => {
      const updated = state.bots.map((b) =>
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
      );
      persistBots(updated);
      return { bots: updated };
    });
  },

  resetAllBotStats: () => {
    set((state) => {
      const updated = state.bots.map((b) => ({
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
      }));
      persistBots(updated);
      return { bots: updated };
    });
  },

  clearSimulatedPositions: () => {
    set((state) => {
      const updated = state.bots.map((b) => {
        // Se a posição aberta do bot é simulada (ou sem modo explícito = paper), fecha ela
        if (b.position && (b.position.mode === "paper" || !b.position.mode)) {
          return {
            ...b,
            position: null,
            status: (b.active ? "scanning" : "stopped") as BotInstance["status"],
            stats: {
              ...b.stats,
              lastAction: "Posição simulada limpa",
              lastActionTime: new Date().toISOString(),
            },
          };
        }
        return b;
      });
      persistBots(updated);
      return { bots: updated };
    });
  },

  updateBotPosition: (botId, position) => {
    set((state) => {
      const updated = state.bots.map((b) => {
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
      });
      persistBots(updated);
      return { bots: updated };
    });
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
    set((state) => {
      const isSell = trade.side === "SELL";
      const isBuy = trade.side === "BUY";
      // 🛡️ PILAR 2: Identifica se é realização parcial para NÃO anular a posição restante
      const isPartial =
        trade.sellAll === false ||
        Boolean(trade.strategy?.includes("PARCIAL")) ||
        Boolean(trade.id?.includes("partial")) ||
        Boolean(trade.executionId?.includes("partial"));

      const updated = state.bots.map((b) => {
        if (b.id !== botId) return b;
        const newTotalTrades = b.stats.totalTrades + 1;
        const newBuyTrades = b.stats.buyTrades + (isBuy ? 1 : 0);
        const newSellTrades = b.stats.sellTrades + (isSell ? 1 : 0);
        const newWinTrades = b.stats.winTrades + (pnl > 0 ? 1 : 0);
        const newLossTrades = b.stats.lossTrades + (pnl < 0 ? 1 : 0);
        const closedCount = newWinTrades + newLossTrades;
        const newWinRate = closedCount > 0 ? (newWinTrades / closedCount) * 100 : 100;
        const newRealizedPnl = parseFloat((b.stats.realizedPnl + pnl).toFixed(2));

        const actionText = isSell
          ? isPartial
            ? `🎯 Parcial realizada (+${pnl.toFixed(2)} USDT) · Restante correndo protegido no Break-Even`
            : (pnl >= 0 ? `🎯 Take Profit realizado (+${pnl.toFixed(2)} USDT)` : `🛑 Stop Loss acionado (${pnl.toFixed(2)} USDT)`)
          : `🚀 Compra executada em ${trade.symbol} ($${trade.price})`;

        return {
          ...b,
          // Preserva a posição aberta caso seja realização parcial de lucros!
          position: isSell ? (isPartial ? b.position : null) : b.position,
          status: (isSell
            ? isPartial
              ? "in_position"
              : (b.active ? "scanning" : "stopped")
            : "in_position") as BotInstance["status"],
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
      });

      persistBots(updated);
      return { bots: updated };
    });
  },
});
