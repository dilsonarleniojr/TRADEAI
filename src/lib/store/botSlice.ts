import type { StateCreator } from "zustand";
import type { BotInstance, BotPosition, BotStrategy, TickerData, TradeData, BotExecutionReport } from "./types";
import { riskManager, type ProtectionSettings, DEFAULT_PROTECTION_SETTINGS } from "../bot/risk-manager";
import { resetBotConsecutiveLosses, resetGlobalCircuitBreaker, calculateBotProfitabilityScore } from "../bot/multi-bot-engine";

export interface BotSlice {
  // Fleet of simultaneous bots
  bots: BotInstance[];
  selectedBotId: string | null;
  setSelectedBotId: (id: string | null) => void;
  setBots: (bots: BotInstance[]) => void;

  // Modos de proteção e governança de risco configuráveis pelo usuário
  protectionSettings: ProtectionSettings;
  updateProtectionSettings: (settings: Partial<ProtectionSettings>) => void;
  resetProtectionSettings: () => void;

  // Active execution report modal
  activeExecutionReport: BotExecutionReport | null;
  setActiveExecutionReport: (report: BotExecutionReport | null) => void;

  // Bot activation controls
  toggleBotActive: (botId: string, active?: boolean) => void;
  toggleAllBots: (active: boolean) => void;
  activateTopProfitableBots: (maxActive?: number) => { activated: string[]; paused: string[] };
  pauseDeficitBots: () => { pausedCount: number; pausedNames: string[] };

  // Fleet Auto-Rotation (Pilar 3)
  fleetAutoRotationEnabled: boolean;
  setFleetAutoRotationEnabled: (enabled: boolean) => void;
  applyFleetRotation: (assignments: {
    botId: string;
    symbol: string;
    name: string;
    takeProfit: number;
    stopLoss: number;
    trailingStop: boolean;
    trailingStopDistance: number;
    breakEvenTrigger: number;
    breakEvenBuffer: number;
    score: number;
    volume24h: number;
  }[]) => { rotatedCount: number; newPairs: string[] };

  // Bot CRUD
  addBot: (bot: Partial<BotInstance> & { name: string; symbol: string; strategy: BotStrategy }) => string;
  updateBot: (botId: string, partial: Partial<BotInstance>) => void;
  removeBot: (botId: string) => void;
  removeAllBots: () => void;
  resetBotStats: (botId: string) => void;
  resetAllBotStats: () => void;
  resetConsecutiveLossBrake: (botId?: string) => void;
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
    maxHoldingMinutes: 60,
    timeStopMinutes: 60,
    takeProfit: 3.6,
    stopLoss: 1.8,
    trailingStop: true,
    trailingStopDistance: 0.55,
    useSmartDca: true,
    maxDcaOrders: 1,
    dcaDipThreshold: 1.8,
    dcaMultiplier: 1.0,
    allocationAmount: 12,
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
    breakEvenTrigger: 1.4,
    breakEvenBuffer: 0.35,
    usePartialTp: true,
    partialTpTrigger: 2.0,
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
    riskPerTradePercent: 15.0,
    maxHoldingMinutes: 60,
    timeStopMinutes: 60,
    takeProfit: 3.8,
    stopLoss: 1.9,
    trailingStop: true,
    trailingStopDistance: 0.60,
    useSmartDca: true,
    maxDcaOrders: 1,
    dcaDipThreshold: 1.8,
    dcaMultiplier: 1.0,
    allocationAmount: 12,
    maxDailyTrades: 15,
    buyThreshold: 30,
    sellThreshold: 70,
    rsiPeriod: 14,
    emaFast: 12,
    emaSlow: 26,
    useMultiTimeframe: true,
    autoBreakEven: true,
    breakEvenTrigger: 1.5,
    breakEvenBuffer: 0.35,
    usePartialTp: true,
    partialTpTrigger: 2.2,
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
    riskPerTradePercent: 15.0,
    maxHoldingMinutes: 60,
    timeStopMinutes: 60,
    takeProfit: 4.0,
    stopLoss: 2.0,
    trailingStop: true,
    trailingStopDistance: 0.65,
    useSmartDca: true,
    maxDcaOrders: 1,
    dcaDipThreshold: 2.0,
    dcaMultiplier: 1.0,
    allocationAmount: 12,
    maxDailyTrades: 15,
    buyThreshold: 32,
    sellThreshold: 68,
    rsiPeriod: 14,
    emaFast: 9,
    emaSlow: 21,
    useMultiTimeframe: true,
    autoBreakEven: true,
    breakEvenTrigger: 1.6,
    breakEvenBuffer: 0.35,
    usePartialTp: true,
    partialTpTrigger: 2.4,
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
    maxHoldingMinutes: 60,
    timeStopMinutes: 60,
    takeProfit: 3.6,
    stopLoss: 1.8,
    trailingStop: true,
    trailingStopDistance: 0.55,
    useSmartDca: true,
    maxDcaOrders: 1,
    dcaDipThreshold: 1.8,
    dcaMultiplier: 1.0,
    allocationAmount: 50,
    maxDailyTrades: 25,
    buyThreshold: 30,
    sellThreshold: 70,
    rsiPeriod: 14,
    emaFast: 9,
    emaSlow: 21,
    useMultiTimeframe: true,
    autoBreakEven: true,
    breakEvenTrigger: 1.4,
    breakEvenBuffer: 0.35,
    usePartialTp: true,
    partialTpTrigger: 2.0,
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
    createdAt: new Date(Date.now() - 24000000).toISOString(),
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
    maxHoldingMinutes: 60,
    timeStopMinutes: 60,
    takeProfit: 4.2,
    stopLoss: 2.8,
    trailingStop: true,
    trailingStopDistance: 0.60,
    trailingTakeProfit: true,
    trailingTakeProfitDistance: 0.60,
    useSmartDca: true,
    maxDcaOrders: 1,
    dcaDipThreshold: 1.8,
    dcaMultiplier: 1.0,
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
    breakEvenTrigger: 2.0,
    breakEvenBuffer: 0.60,
    usePartialTp: true,
    partialTpTrigger: 2.50,
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

/**
 * Deduplica a frota de robôs garantindo estritamente que não existam robôs repetidos para o mesmo par ou ID.
 * Se houver duplicidade, preserva o robô com prioridade institucional:
 * 1. Robô com posição aberta em andamento (protege o capital alocado).
 * 2. Robô ativo em execução (evita desarmar monitoramento).
 * 3. Maior histórico operacional (totalTrades / winTrades / PnL realizado).
 */
export function deduplicateBots(bots: BotInstance[]): BotInstance[] {
  if (!Array.isArray(bots) || bots.length <= 1) return bots || [];

  const seenSymbols = new Map<string, BotInstance>();
  const seenIds = new Set<string>();

  for (const b of bots) {
    if (!b || !b.id || !b.symbol) continue;
    const sym = b.symbol.trim().toUpperCase();

    // Se já vimos esse ID exato
    if (seenIds.has(b.id)) continue;

    if (!seenSymbols.has(sym)) {
      seenSymbols.set(sym, b);
      seenIds.add(b.id);
    } else {
      const current = seenSymbols.get(sym)!;
      const bHasPos = !!(b.position && b.position.quantity > 0);
      const curHasPos = !!(current.position && current.position.quantity > 0);

      let replace = false;
      if (bHasPos && !curHasPos) {
        replace = true;
      } else if (!bHasPos && curHasPos) {
        replace = false;
      } else if (b.active && !current.active) {
        replace = true;
      } else if (!b.active && current.active) {
        replace = false;
      } else {
        const bTrades = b.stats?.totalTrades || 0;
        const curTrades = current.stats?.totalTrades || 0;
        if (bTrades > curTrades) {
          replace = true;
        } else if (bTrades === curTrades) {
          const bPnl = b.stats?.realizedPnl || 0;
          const curPnl = current.stats?.realizedPnl || 0;
          if (bPnl > curPnl) replace = true;
        }
      }

      if (replace) {
        seenIds.delete(current.id);
        seenSymbols.set(sym, b);
        seenIds.add(b.id);
      }
    }
  }

  return Array.from(seenSymbols.values());
}

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
        // Auto-migração institucional obrigatória:
        // 1. Desativa DCA Martingale por padrão (evita dobrar posições em queda)
        // 2. Trava Stop Loss em no máximo 2.0% (Guardrails rígidos de governança)
        // 3. Calibra Break-Even em +1.4% para travar lucro precocemente
        // 4. Deduplica para NUNCA permitir bots repetidos do mesmo par
        const migrated = sanitized.map((b) => {
          return {
            ...b,
            stopLoss: Math.max(1.4, Math.min(2.0, b.stopLoss || 1.8)),
            takeProfit: Math.max(3.0, Math.min(6.0, b.takeProfit || 3.5)),
            useSmartDca: b.useSmartDca === true, // Anti-Martingale: false por padrão
            autoBreakEven: b.autoBreakEven ?? true,
            breakEvenTrigger: Math.max(1.4, b.breakEvenTrigger || 1.6),
            breakEvenBuffer: Math.max(0.35, Math.min(0.80, b.breakEvenBuffer || 0.45)),
            timeStopMinutes: Math.max(b.timeStopMinutes || 0, 60),
          };
        });
        return deduplicateBots(migrated);
      }
    }
  } catch (e) {
    console.warn("[botSlice] Falha ao carregar frota de robôs do localStorage:", e);
  }
  return DEFAULT_BOTS;
}

let persistBotsTimer: ReturnType<typeof setTimeout> | null = null;

function persistBots(bots: BotInstance[]) {
  if (typeof window === "undefined") return;
  if (persistBotsTimer) clearTimeout(persistBotsTimer);
  persistBotsTimer = setTimeout(() => {
    try {
      localStorage.setItem(BOTS_STORAGE_KEY, JSON.stringify(bots));
    } catch (e) {
      console.warn("[botSlice] Falha ao salvar frota de robôs no localStorage:", e);
    }
  }, 1000);
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
  protectionSettings: riskManager.getProtectionSettings(),
  fleetAutoRotationEnabled: typeof window !== "undefined"
    ? window.localStorage.getItem("tradeai_fleet_auto_rotation") !== "false"
    : true,

  setFleetAutoRotationEnabled: (enabled) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("tradeai_fleet_auto_rotation", String(enabled));
    }
    set({ fleetAutoRotationEnabled: enabled });
  },

  setSelectedBotId: (id) => set({ selectedBotId: id }),
  setActiveExecutionReport: (report) => set({ activeExecutionReport: report }),

  updateProtectionSettings: (partial) => {
    const updated = riskManager.setProtectionSettings(partial);
    set({ protectionSettings: updated });
  },

  resetProtectionSettings: () => {
    const reset = riskManager.resetProtectionSettings();
    set({ protectionSettings: reset });
  },

  setBots: (bots) => {
    const deduplicated = deduplicateBots(bots);
    persistBots(deduplicated);
    set({ bots: deduplicated });
    // Keep global botActive in sync
    get().setBotActive(deduplicated.some((b) => b.active));
  },

  toggleBotActive: (botId, active) => {
    set((state) => {
      const updated = state.bots.map((b) => {
        if (b.id !== botId) return b;
        const newActive = active !== undefined ? active : !b.active;
        if (newActive) {
          // Destrava perdas consecutivas do robô ao iniciar manualmente
          resetBotConsecutiveLosses(botId);
        }
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

  resetConsecutiveLossBrake: (botId) => {
    resetBotConsecutiveLosses(botId);
    riskManager.resetConsecutiveLossBrake();
    if (!botId) {
      resetGlobalCircuitBreaker();
    }
    set((state) => {
      const updated = state.bots.map((b) => {
        if (botId && b.id !== botId) return b;
        return {
          ...b,
          stats: {
            ...b.stats,
            lastAction: b.active
              ? "Trava de perdas consecutivas removida (Operando normalmente)"
              : "Trava de perdas consecutivas removida (Pronto para iniciar)",
            lastActionTime: new Date().toISOString(),
          },
        };
      });
      persistBots(updated);
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

  activateTopProfitableBots: (maxActive) => {
    const activated: string[] = [];
    const paused: string[] = [];
    const effectiveMaxActive = maxActive || get().protectionSettings.maxSimultaneousPositions || 5;

    set((state) => {
      // 1. Calcula o Score de Lucratividade institucional para cada robô
      const scored = state.bots.map((b) => ({
        bot: b,
        score: calculateBotProfitabilityScore(b),
        pnl: b.stats?.realizedPnl || 0,
        hasOpenPosition: Boolean(b.position && b.position.quantity > 0),
      }));

      // Ordena decrescente por score de lucratividade
      scored.sort((a, b) => b.score - a.score);

      // 2. Define o conjunto de robôs elegíveis a ficarem ativos:
      // - Robôs com posições abertas DEVEM continuar ativos para gerenciar Take Profit / Stop Loss / Break-Even
      // - Os melhores robôs lucrativos até a cota maxActive
      // - Robôs com prejuízo comprovado (pnl < 0) e sem posição são sumariamente pausados
      const activeIds = new Set<string>();

      // Prioridade 1: robôs com posições em andamento
      scored.forEach((item) => {
        if (item.hasOpenPosition) {
          activeIds.add(item.bot.id);
        }
      });

      // Prioridade 2: robôs com lucro positivo comprovado
      for (const item of scored) {
        if (activeIds.size >= effectiveMaxActive) break;
        if (item.pnl > 0) {
          activeIds.add(item.bot.id);
        }
      }

      // Prioridade 3: robôs com melhor score (neutros/novos), descartando robôs deficitários
      for (const item of scored) {
        if (activeIds.size >= effectiveMaxActive) break;
        if (item.pnl < 0 && !item.hasOpenPosition) continue; // Descarta deficitários
        activeIds.add(item.bot.id);
      }

      const updated = state.bots.map((b) => {
        const shouldBeActive = activeIds.has(b.id);
        if (shouldBeActive && !b.active) {
          activated.push(b.name);
        } else if (!shouldBeActive && b.active) {
          paused.push(b.name);
        }

        const newStatus = shouldBeActive
          ? (b.position ? "in_position" : "scanning")
          : "stopped";

        return {
          ...b,
          active: shouldBeActive,
          status: newStatus as BotInstance["status"],
          stats: {
            ...b.stats,
            lastAction: shouldBeActive
              ? (b.active ? b.stats.lastAction : "🏆 Priorizado e ativado por Score de Lucratividade")
              : (b.active ? "🛑 Pausado automaticamente (baixo rendimento/prejuízo acumulado)" : b.stats.lastAction),
            lastActionTime: new Date().toISOString(),
          },
        };
      });

      persistBots(updated);
      get().setBotActive(updated.some((b) => b.active));
      return { bots: updated };
    });

    return { activated, paused };
  },

  pauseDeficitBots: () => {
    const pausedNames: string[] = [];
    set((state) => {
      const updated: BotInstance[] = state.bots.map((b): BotInstance => {
        const pnl = b.stats?.realizedPnl || 0;
        const losses = b.stats?.lossTrades || 0;
        const wins = b.stats?.winTrades || 0;
        const isDeficit = pnl < -0.30 || (losses >= 2 && wins === 0);

        if (isDeficit && b.active && (!b.position || b.position.quantity <= 0)) {
          pausedNames.push(b.name);
          return {
            ...b,
            active: false,
            status: "stopped" as const,
            stats: {
              ...b.stats,
              lastAction: `🛑 Pausado por Quarentena Deficitária (PnL: $${pnl.toFixed(2)} USDT)`,
              lastActionTime: new Date().toISOString(),
            },
          };
        }
        return b;
      });

      persistBots(updated);
      get().setBotActive(updated.some((b) => b.active));
      return { bots: updated };
    });
    return { pausedCount: pausedNames.length, pausedNames };
  },

  applyFleetRotation: (assignments) => {
    const rotatedPairs: string[] = [];
    const assignmentMap = new Map(assignments.map((a) => [a.botId, a]));

    set((state) => {
      const updated: BotInstance[] = state.bots.map((b): BotInstance => {
        // Robô com posição aberta JAMAIS é rotacionado para proteger o trade
        if (b.position && b.position.quantity > 0) return b;

        const assign = assignmentMap.get(b.id);
        if (assign && assign.symbol !== b.symbol) {
          rotatedPairs.push(assign.symbol);
          return {
            ...b,
            symbol: assign.symbol,
            name: assign.name,
            takeProfit: assign.takeProfit,
            stopLoss: assign.stopLoss,
            trailingStop: assign.trailingStop,
            trailingStopDistance: assign.trailingStopDistance,
            autoBreakEven: true,
            breakEvenTrigger: assign.breakEvenTrigger,
            breakEvenBuffer: assign.breakEvenBuffer,
            stats: {
              ...b.stats,
              lastAction: `🔄 Par rotacionado para ${assign.symbol} (Score: ${assign.score.toFixed(0)} | Vol: $${(assign.volume24h / 1e6).toFixed(1)}M)`,
              lastActionTime: new Date().toISOString(),
            },
          };
        }
        return b;
      });

      const deduplicated = deduplicateBots(updated);
      persistBots(deduplicated);
      return { bots: deduplicated };
    });

    return { rotatedCount: rotatedPairs.length, newPairs: rotatedPairs };
  },

  addBot: (botData) => {
    const cleanSymbol = (botData.symbol || "").trim().toUpperCase();
    const cleanId = botData.id?.trim();

    // Guardrail Institucional: Não permitir robôs repetidos para o mesmo par ou mesmo ID
    const state = get();
    const existingIndex = state.bots.findIndex(
      (b) => b.symbol.trim().toUpperCase() === cleanSymbol || (cleanId && b.id === cleanId)
    );

    if (existingIndex !== -1) {
      const existing = state.bots[existingIndex];
      const shouldActivate = botData.active !== undefined ? botData.active : existing.active;
      const updatedBot: BotInstance = {
        ...existing,
        ...botData,
        id: existing.id,
        symbol: existing.symbol,
        active: shouldActivate,
        status: (shouldActivate ? (existing.position ? "in_position" : "scanning") : "stopped") as BotInstance["status"],
        stats: {
          ...existing.stats,
          lastAction: shouldActivate
            ? "Parâmetros atualizados (robô existente preservado, sem duplicação)"
            : existing.stats.lastAction,
          lastActionTime: new Date().toISOString(),
        },
      };

      const updatedList = [...state.bots];
      updatedList[existingIndex] = updatedBot;
      const deduplicated = deduplicateBots(updatedList);
      persistBots(deduplicated);
      set({ bots: deduplicated, selectedBotId: existing.id });
      get().setBotActive(deduplicated.some((b) => b.active));
      return existing.id;
    }

    const id = cleanId || `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newBot: BotInstance = {
      id,
      name: botData.name || (cleanSymbol === "AUTO" ? "Bot Auto-Screener" : `Bot ${cleanSymbol.replace("USDT", "")}`),
      symbol: cleanSymbol,
      strategy: botData.strategy || "AI",
      active: botData.active ?? false,
      status: (botData.active ? (botData.position ? "in_position" : "scanning") : "stopped") as BotInstance["status"],
      takeProfit: botData.takeProfit ?? 3.8,
      stopLoss: Math.min(2.0, botData.stopLoss ?? 1.8),
      trailingStop: botData.trailingStop ?? true,
      trailingStopDistance: botData.trailingStopDistance ?? 0.60,
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
      useAutoScreener: botData.useAutoScreener ?? (cleanSymbol === "AUTO"),
      autoBreakEven: botData.autoBreakEven ?? true,
      breakEvenTrigger: botData.breakEvenTrigger ?? 2.0,
      breakEvenBuffer: botData.breakEvenBuffer ?? 0.60,
      trailingTakeProfit: botData.trailingTakeProfit ?? true,
      trailingTakeProfitDistance: botData.trailingTakeProfitDistance ?? 0.60,
      usePartialTp: botData.usePartialTp ?? false,
      partialTpTrigger: botData.partialTpTrigger ?? 2.5,
      partialTpPercent: botData.partialTpPercent ?? 30,
      maxHoldingMinutes: botData.maxHoldingMinutes ?? 60,
      timeStopMinutes: botData.timeStopMinutes ?? 60,
      useBtcGatekeeper: botData.useBtcGatekeeper ?? true,
      useSmartDca: botData.useSmartDca ?? false,
      maxDcaOrders: botData.maxDcaOrders ?? 1,
      dcaDipThreshold: botData.dcaDipThreshold ?? 1.8,
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
        lastAction: botData.active ? (botData.position ? `Gerenciando custódia de ${botData.position.quantity} ${cleanSymbol.replace("USDT", "")}` : "Iniciado e analisando mercado") : "Criado (Desligado)",
        lastActionTime: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    };

    set((state) => {
      const updated = deduplicateBots([newBot, ...state.bots]);
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
    resetBotConsecutiveLosses(botId);
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
    resetBotConsecutiveLosses();
    riskManager.resetConsecutiveLossBrake();
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
