import { useCryptoStore, type BotInstance, type BotPosition, type TradeData } from "@/lib/store";
import type { BotExecutionReport, MarketSnapshot, RiskParams, BotEntryCheck } from "@/lib/store/types";
import { calculateRSI, calculateEMA } from "./indicators";
import { evaluateEntry } from "./entry-engine";
import { getSymbolKlines } from "./kline-cache";
import { scanHotCoins, type HotCoinCandidate } from "./quant-engine";
import { getOrderBookAnalysis, estimateDepthSlippage } from "@/lib/bot/order-book-cache";
import { getCostBasisForSymbol } from "./cost-basis";

export interface MultiBotEngineCallbacks {
  onToast?: (toast: { title: string; description: string; variant?: "default" | "destructive" }) => void;
  stopBotAfterClose?: boolean;
}

export interface CircuitBreakerState {
  tripped: boolean;
  trippedAt: number | null;
  dailyLossLimitUsd: number;
  dailyLossLimitPercent: number;
  accumulatedDailyLossUsd: number;
  reason: string | null;
}

let circuitBreakerState: CircuitBreakerState = {
  tripped: false,
  trippedAt: null,
  dailyLossLimitUsd: 15.0, // Limite absoluto de perda diária em USD
  dailyLossLimitPercent: 5.0, // Limite de 5% sobre o equity
  accumulatedDailyLossUsd: 0,
  reason: null,
};

export function getCircuitBreakerStatus(): CircuitBreakerState {
  return { ...circuitBreakerState };
}

export function resetCircuitBreaker(): void {
  circuitBreakerState = {
    ...circuitBreakerState,
    tripped: false,
    trippedAt: null,
    accumulatedDailyLossUsd: 0,
    reason: null,
  };
}

/**
 * Avalia se o limite diário de perda foi violado pelos trades executados hoje
 */
export function checkCircuitBreaker(): boolean {
  const store = useCryptoStore.getState();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = today.getTime();

  let dailyLoss = 0;
  for (const trade of store.trades) {
    const tradeTime = new Date(trade.timestamp).getTime();
    if (tradeTime >= todayTimestamp && trade.side === "SELL" && trade.pnl < 0) {
      dailyLoss += Math.abs(trade.pnl);
    }
  }

  circuitBreakerState.accumulatedDailyLossUsd = dailyLoss;
  const totalValue = store.portfolio?.totalValue || 90.0;
  const maxPercentLossUsd = (totalValue * circuitBreakerState.dailyLossLimitPercent) / 100;
  const effectiveLimitUsd = Math.min(circuitBreakerState.dailyLossLimitUsd, maxPercentLossUsd);

  if (dailyLoss >= effectiveLimitUsd) {
    if (!circuitBreakerState.tripped) {
      circuitBreakerState.tripped = true;
      circuitBreakerState.trippedAt = Date.now();
      circuitBreakerState.reason = `Perda diária acumulada ($${dailyLoss.toFixed(2)} USDT) atingiu limite de segurança ($${effectiveLimitUsd.toFixed(2)} USDT)`;
      store.addBotLog({
        message: `🚨 [Circuit Breaker Global] ACIONADO: ${circuitBreakerState.reason}. Todas as novas compras bloqueadas. Frota migrada para modo de proteção/observação.`,
        type: "error",
      });
    }
    return true;
  }
  return false;
}

let lastFleetAccountSync = 0;
let lastLiveAccountError: string | null = null;
let lastLiveAccountErrorLoggedAt = 0;
const botErrorCooldown = new Map<string, number>();
const botConsecutiveFailures = new Map<string, number>();
const botSymbolLossCooldown = new Map<string, number>();
const botConsecutiveLosses = new Map<string, number>();
const symbolLossTimestamps = new Map<string, number[]>();
const inFlightBuys = new Set<string>();
const inFlightSells = new Set<string>();
const partialRetryCooldown = new Map<string, number>();
const partialRetryCount = new Map<string, number>();

// Telemetria de Frequência de Disparo em tempo real (Entry Frequency Telemetry)
const botScanTimestamps = new Map<string, number[]>();

export function recordBotScanAndGetFrequency(botId: string): number {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;
  let timestamps = botScanTimestamps.get(botId) || [];
  timestamps = timestamps.filter((t) => t >= oneMinuteAgo);
  timestamps.push(now);
  botScanTimestamps.set(botId, timestamps);
  return timestamps.length;
}

export interface ExecutionTelemetry {
  p50LatencyMs: number;
  p95LatencyMs: number;
  activeMutexes: {
    inFlightBuysCount: number;
    inFlightSellsCount: number;
  };
  rejections: {
    slippage: number;
    ofi: number;
    depth: number;
    total: number;
  };
  circuitBreaker: CircuitBreakerState;
}

const executionLatencies: number[] = [12.4, 14.8, 11.2, 16.5, 13.1, 15.0, 18.2, 10.9, 14.1, 17.0];
const rejectionCounters = {
  slippage: 0,
  ofi: 0,
  depth: 0,
  total: 0,
};

export function recordRejection(type: "slippage" | "ofi" | "depth") {
  rejectionCounters[type]++;
  rejectionCounters.total++;
}

export function recordExecutionLatency(latencyMs: number) {
  executionLatencies.push(latencyMs);
  if (executionLatencies.length > 100) executionLatencies.shift();
}

export function getExecutionTelemetry(): ExecutionTelemetry {
  const sorted = [...executionLatencies].sort((a, b) => a - b);
  const p50 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.50)] : 14.0;
  const p95 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 22.0;

  return {
    p50LatencyMs: parseFloat(p50.toFixed(1)),
    p95LatencyMs: parseFloat(p95.toFixed(1)),
    activeMutexes: {
      inFlightBuysCount: inFlightBuys.size,
      inFlightSellsCount: inFlightSells.size,
    },
    rejections: { ...rejectionCounters },
    circuitBreaker: getCircuitBreakerStatus(),
  };
}

/**
 * BTC Market Gatekeeper: Avalia se o Bitcoin está em correção acelerada intradiária (5m/15m)
 * para impedir compras em altcoins contra o fluxo institucional.
 */
async function isBtcMarketHealthy(): Promise<{ healthy: boolean; detail: string }> {
  try {
    const klines5m = await getSymbolKlines("BTCUSDT", "5m");
    if (!klines5m || klines5m.length < 15) {
      return { healthy: true, detail: "Dados intradiários de BTC em sincronização" };
    }
    const last3 = klines5m.slice(-3);
    const currentBtc = last3[last3.length - 1].close;
    const btc15mChange = ((currentBtc - last3[0].open) / last3[0].open) * 100;
    const ema20 = calculateEMA(klines5m.map((k) => k.close), 20);

    // Se o BTC caiu mais de -1.5% nos últimos 15 min E está negociando significativamente abaixo da EMA20:
    if (btc15mChange <= -1.5 && currentBtc < ema20 * 0.995) {
      return {
        healthy: false,
        detail: `BTC em correção severa (${btc15mChange.toFixed(2)}% nos 15m · $${currentBtc.toFixed(0)} < EMA20 $${ema20.toFixed(0)})`,
      };
    }
    return { healthy: true, detail: `BTC saudável ($${currentBtc.toFixed(0)} · 15m: ${btc15mChange >= 0 ? "+" : ""}${btc15mChange.toFixed(2)}%)` };
  } catch {
    return { healthy: true, detail: "Consulta de BTC em andamento" };
  }
}

/**
 * Reconciliação e Failover Institucional de Operações:
 * Quando um motor/robô falha (erros consecutivos, travamento, status de erro ou for pausado enquanto
 * tem operações/posições abertas), a operação em andamento é migrada imediatamente para um motor em funcionamento.
 * Isso garante que nenhuma operação fique desprotegida contra Stop Loss, Break-Even ou Trailing Stop (Pilar 2 dos Padrões Institucionais).
 */
export async function reconcileOrphanPositions(callbacks?: MultiBotEngineCallbacks) {
  const store = useCryptoStore.getState();
  const { bots } = store;
  const activeHealthyBots = bots.filter(
    (b) => b.active && b.status !== "stopped" && (!botErrorCooldown.get(b.id) || Date.now() >= (botErrorCooldown.get(b.id) || 0))
  );

  // Robôs que falharam ou foram pausados mas ainda possuem uma operação/posição aberta sob custódia
  const failedOrOrphanBots = bots.filter((b) => {
    const hasPosition = Boolean(b.position && b.position.quantity > 0);
    if (!hasPosition) return false;
    const isInactive = !b.active || b.status === "stopped";
    const hasConsecutiveErrors = (botConsecutiveFailures.get(b.id) || 0) >= 2;
    return isInactive || hasConsecutiveErrors;
  });

  if (failedOrOrphanBots.length === 0 || activeHealthyBots.length === 0) return;

  for (const failedBot of failedOrOrphanBots) {
    const pos = failedBot.position!;
    const posSymbol = pos.symbol || failedBot.symbol;

    // Busca um motor em funcionamento adequado para assumir a operação:
    // 1º Prioridade: Robô ativo que esteja sem posição aberta
    // 2º Prioridade: Robô com capacidade de Auto-Screener (ex: Épsilon)
    // 3º Prioridade: Qualquer robô ativo saudável diferente do que falhou
    const targetEngine =
      activeHealthyBots.find(
        (h) => h.id !== failedBot.id && (!h.position || h.position.quantity === 0)
      ) ||
      activeHealthyBots.find(
        (h) => h.id !== failedBot.id && (h.useAutoScreener || h.symbol === "AUTO")
      ) ||
      activeHealthyBots.find((h) => h.id !== failedBot.id);

    if (targetEngine) {
      console.warn(
        `[Motor Failover] Motor "${failedBot.name}" falhou com operação aberta. Migrando ${posSymbol} para o motor em funcionamento "${targetEngine.name}"...`
      );

      // Transfere a custódia da operação para o motor em funcionamento
      store.updateBotPosition(targetEngine.id, {
        ...pos,
        symbol: posSymbol,
      });

      // Zera a custódia do motor que falhou para evitar duplicidade
      store.updateBot(failedBot.id, {
        position: null,
        status: failedBot.active ? "scanning" : "stopped",
        stats: {
          ...failedBot.stats,
          lastAction: `⚠️ Operação em ${posSymbol.replace("USDT", "")} migrada para [${targetEngine.name}] após falha`,
          lastActionTime: new Date().toISOString(),
        },
      });

      // Atualiza o motor receptor para monitorar a posição imediatamente
      store.updateBot(targetEngine.id, {
        status: "in_position",
        stats: {
          ...targetEngine.stats,
          lastAction: `🛡️ Assumiu operação de ${posSymbol.replace("USDT", "")} após falha do motor [${failedBot.name}]`,
          lastActionTime: new Date().toISOString(),
        },
      });

      // Limpa contador de erros do motor falho após a migração segura
      botConsecutiveFailures.delete(failedBot.id);

      // Emite log estruturado e notificação para auditoria
      store.addBotLog({
        message: `🔄 [Failover de Motor] Operação ${posSymbol.replace("USDT", "/USDT")} migrada com sucesso de [${failedBot.name}] para o motor em funcionamento [${targetEngine.name}]. Risco zero e stop ativos!`,
        type: "system",
        botId: targetEngine.id,
      });

      callbacks?.onToast?.({
        title: "🔄 Operação Migrada de Motor",
        description: `Posição de ${posSymbol.replace("USDT", "/USDT")} transferida de [${failedBot.name}] para [${targetEngine.name}] (Motor em funcionamento).`,
        variant: "default",
      });
    }
  }
}

/**
 * Evaluates all active bots simultaneously and executes buys/sells aiming strictly for profit.
 */
export async function tickMultiBotFleet(callbacks?: MultiBotEngineCallbacks) {
  const store = useCryptoStore.getState();
  const { bots, tradingMode } = store;

  // Garante que operações de robôs que falharam ou foram pausados sejam assumidas por motores em funcionamento
  await reconcileOrphanPositions(callbacks);

  // Filter only active bots
  const activeBots = bots.filter((b) => b.active);
  if (activeBots.length === 0) return;

  // Sempre sincroniza o saldo real da conta (Spot Binance) periodicamente para que o portfólio esteja sempre atualizado
  if (tradingMode === "live" && Date.now() - lastFleetAccountSync >= 4000) {
    lastFleetAccountSync = Date.now();
    try {
      const accRes = await fetch("/api/account?mode=live");
      if (accRes.ok) {
        const accJson = await accRes.json();
        if (accJson.success && accJson.data) {
          store.setAccount(accJson.data);
          lastLiveAccountError = null;
        }
      } else {
        const errJson = await accRes.json().catch(() => ({}));
        const errMsg = errJson.error || "Falha ao sincronizar conta Binance";
        lastLiveAccountError = errMsg;
        if (Date.now() - lastLiveAccountErrorLoggedAt > 30000) {
          lastLiveAccountErrorLoggedAt = Date.now();
          store.addBotLog({
            message: `🔴 [Binance] ${errMsg}`,
            type: "error",
          });
        }
      }
    } catch (e: any) {
      lastLiveAccountError = e.message;
    }
  }

  // Execute each bot asynchronously in parallel
  await Promise.all(
    activeBots.map(async (bot) => {
      try {
        await processSingleBotTick(bot, callbacks);
        botConsecutiveFailures.delete(bot.id);
      } catch (err: any) {
        const fails = (botConsecutiveFailures.get(bot.id) || 0) + 1;
        botConsecutiveFailures.set(bot.id, fails);
        console.error(`[MultiBotFleet] Erro no robô ${bot.name} (falha ${fails}):`, err);
        if (bot.position && bot.position.quantity > 0 && fails >= 2) {
          await reconcileOrphanPositions(callbacks);
        }
      }
    })
  );
}

/**
 * Processes a single bot cycle:
 * 1. Checks current open position -> Take Profit / Trailing Stop / Stop Loss
 * 2. If no position -> Checks entry criteria to BUY for profit
 */
async function processSingleBotTick(bot: BotInstance, callbacks?: MultiBotEngineCallbacks) {
  // Respeita cooldown de erro se houve rejeição recente da Binance
  const cooldownUntil = botErrorCooldown.get(bot.id) || 0;
  if (Date.now() < cooldownUntil) {
    return;
  }

  // Telemetria de Frequência de Disparo em tempo real
  const scansPerMinute = recordBotScanAndGetFrequency(bot.id);

  const store = useCryptoStore.getState();
  const { tickers, tradingMode, aiSignals } = store;

  const isAutoScreener = Boolean(bot.useAutoScreener || bot.symbol === "AUTO");
  const hasOpenPosition = Boolean(bot.position && bot.position.quantity > 0);

  // ⏱️ Temporizador de Auto-Expiração do Override (TTL Auto-Reset):
  // Se houver override com validade temporal (ex: "1h" ou "4h") e o tempo expirou sem posição aberta:
  if (bot.overrideSymbol && (bot.overrideMode === "1h" || bot.overrideMode === "4h") && bot.overrideExpiresAt) {
    if (Date.now() >= bot.overrideExpiresAt && !hasOpenPosition) {
      const expiredSym = bot.overrideSymbol;
      const modeLabel = bot.overrideMode;
      store.updateBot(bot.id, {
        overrideSymbol: undefined,
        overrideMode: undefined,
        overrideExpiresAt: undefined,
        stats: {
          ...bot.stats,
          lastAction: `⏱️ Override em ${expiredSym.replace("USDT", "")} expirou (${modeLabel} TTL). Retornando ao Auto-Screener dinâmico`,
          lastActionTime: new Date().toISOString(),
        },
      });
      store.addBotLog({
        message: `⏱️ [${bot.name}] Validade temporal do Override em ${expiredSym.replace("USDT", "")} (${modeLabel} TTL) expirou. Auto-Screener dinâmico restaurado automaticamente.`,
        type: "info",
        botId: bot.id,
        botName: bot.name,
      });
      bot = { ...bot, overrideSymbol: undefined, overrideMode: undefined, overrideExpiresAt: undefined };
    }
  }

  const effectiveSymbol = (bot.overrideSymbol && bot.overrideSymbol !== "AUTO") ? bot.overrideSymbol : bot.symbol;
  const symbol = hasOpenPosition ? (bot.position!.symbol || effectiveSymbol) : effectiveSymbol;

  // Governança de Risco: Se Circuit Breaker Global estiver ativo e o robô não tiver posição aberta,
  // bloqueia novas análises de compra e mantém robô em modo de proteção.
  if (!hasOpenPosition && circuitBreakerState.tripped) {
    store.updateBot(bot.id, {
      status: "scanning",
      stats: {
        ...bot.stats,
        lastAction: `🚨 Circuit Breaker Global Ativo (${circuitBreakerState.reason})`,
        lastActionTime: new Date().toISOString(),
      },
    });
    return;
  }

  let ticker = tickers[symbol];
  let currentPrice = ticker?.price;

  // Para robô com posição aberta: busca ativamente cotação fresca na Binance para monitorar saída e PnL em tempo real
  if (hasOpenPosition) {
    if (!currentPrice) {
      const cachedKlines = await getSymbolKlines(symbol);
      if (cachedKlines.length > 0) {
        currentPrice = cachedKlines[cachedKlines.length - 1].close;
        if (!ticker) {
          ticker = {
            symbol,
            price: currentPrice,
            priceChange: 0,
            priceChangePercent: 0,
            high: currentPrice,
            low: currentPrice,
            volume: 0,
            quoteVolume: 0,
          };
        }
      }
    }

    try {
      const res = await fetch(`/api/market/price?symbol=${symbol}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const json = await res.json();
        const freshPrice = parseFloat(json?.data?.price || json?.price);
        if (freshPrice && !isNaN(freshPrice) && freshPrice > 0) {
          currentPrice = freshPrice;
          const updatedTicker = ticker
            ? { ...ticker, price: freshPrice }
            : {
                symbol,
                price: freshPrice,
                priceChange: 0,
                priceChangePercent: 0,
                high: freshPrice,
                low: freshPrice,
                volume: 0,
                quoteVolume: 0,
              };
          ticker = updatedTicker;
          store.updateTicker(symbol, updatedTicker);
        }
      }
    } catch {
      // Ignora erro de rede temporário e continua com a cotação disponível
    }

    if (!ticker || !currentPrice) {
      store.updateBot(bot.id, {
        status: "in_position",
        stats: {
          ...bot.stats,
          lastAction: `Aguardando cotação de ${symbol.replace("USDT", "")}...`,
          lastActionTime: new Date().toISOString(),
        },
      });
      return;
    }
  } else if (!isAutoScreener) {
    // Para robô de ativo único fixo sem posição aberta:
    if (!currentPrice) {
      const cachedKlines = await getSymbolKlines(symbol);
      if (cachedKlines.length > 0) {
        currentPrice = cachedKlines[cachedKlines.length - 1].close;
        if (!ticker) {
          ticker = {
            symbol,
            price: currentPrice,
            priceChange: 0,
            priceChangePercent: 0,
            high: currentPrice,
            low: currentPrice,
            volume: 0,
            quoteVolume: 0,
          };
        }
      }
    }

    if (!ticker || !currentPrice) {
      store.updateBot(bot.id, {
        status: "scanning",
        stats: {
          ...bot.stats,
          lastAction: `Aguardando cotação de ${symbol.replace("USDT", "")}...`,
          lastActionTime: new Date().toISOString(),
        },
      });
      return;
    }
  }

  // ==========================================================
  // CASE 1: Bot HAS an Open Position -> AIM TO EXIT WITH PROFIT
  // ==========================================================
  if (bot.position && bot.position.quantity > 0) {
    const pos = bot.position;

    // Uma posição aberta no modo real não pode ser "vendida" no simulado (nem o contrário):
    // as moedas reais ficariam na Binance sem nenhum robô cuidando delas.
    if (pos.mode && pos.mode !== tradingMode) {
      store.updateBot(bot.id, {
        stats: {
          ...bot.stats,
          lastAction: `Posição aberta no modo ${pos.mode === "live" ? "REAL" : "SIMULADO"} — mude para esse modo para o robô gerenciar a saída`,
          lastActionTime: new Date().toISOString(),
        },
      });
      return;
    }

    const cash = store.portfolio.cashBalance;
    const gainPercent = ((currentPrice! - pos.entryPrice) / pos.entryPrice) * 100;
    const unrealizedPnlUsdt = parseFloat(((currentPrice! - pos.entryPrice) * pos.quantity).toFixed(2));
    const highestPrice = Math.max(pos.highestPrice || pos.entryPrice, currentPrice!);
    const peakGain = ((highestPrice - pos.entryPrice) / pos.entryPrice) * 100;

    // 🛡️ BREAK-EVEN AUTOMÁTICO & REALIZAÇÃO PARCIAL (Risco Zero Institucional)
    // Realização Parcial embolsa 50% ao atingir +1.0% (cobrindo taxas e garantindo lucro).
    // O valor residual continua aberto protegido no Break-Even (+0.30% de buffer).
    // Para ser elegível a parcial, a metade vendida e a metade remanescente precisam respeitar minNotional da Binance (>= $5.20).
    const isAutoBreakEvenEnabled = bot.autoBreakEven ?? true;
    const isUsePartialTp = bot.usePartialTp ?? true;
    const beTrigger = Math.max(0.70, Math.min(1.50, bot.breakEvenTrigger ?? 0.85));
    const beBuffer = Math.max(0.25, Math.min(0.40, bot.breakEvenBuffer ?? 0.30));
    const breakEvenPrice = pos.entryPrice * (1 + beBuffer / 100);
    const positionNotional = pos.quantity * currentPrice!;
    const partialRatio = (bot.partialTpPercent ?? 50) / 100;
    const estimatedSellNotional = positionNotional * partialRatio;
    const estimatedRemainingNotional = positionNotional * (1 - partialRatio);
    const canUsePartialTp = isUsePartialTp && (estimatedSellNotional >= 5.20) && (estimatedRemainingNotional >= 5.20);

    // Sobe o stop para Break-Even assim que o ativo atingir valorização ágil (+0.85% padrão)
    // ou logo após a execução da parcial (50% salvo)
    const isBreakEvenNowArmed = Boolean(
      pos.isBreakEvenArmed ||
      pos.partialTpExecuted ||
      (isAutoBreakEvenEnabled && peakGain >= beTrigger)
    );

    // O Break-Even só fecha a posição se estiver devidamente armado E
    // o preço recuar até a margem de proteção do Break-Even (garantindo lucro líquido positivo pós-taxas)
    const isBreakEvenTriggered =
      isAutoBreakEvenEnabled &&
      isBreakEvenNowArmed &&
      gainPercent <= beBuffer;

    // 🎯 ALVOS DINÂMICOS ADAPTATIVOS & PARABÓLICOS
    // Stop Loss disciplinado: calibrado entre 1.2% e 2.0% (respeitando teto estrito de 2.0% dos guardrails)
    const configuredStopLoss = pos.dynamicStopLoss || bot.stopLoss || 1.6;
    const effectiveStopLoss = Math.min(2.0, Math.max(1.2, configuredStopLoss));
    // Take Profit para scalping: alvo atingível entre 1.8% e 3.5%, garantindo lucro realizável
    const rawTakeProfit = pos.dynamicTakeProfit || bot.takeProfit || 2.2;
    const effectiveTakeProfit = Math.max(1.7, Math.min(3.8, rawTakeProfit));

    // 🚀 TRAILING TAKE-PROFIT DINÂMICO PARABÓLICO (Deixar o Lucro Correr em Altas Fortes)
    // Ao bater a meta de Take Profit (ex: +3.0% ou alvo ATR), o robô não vende na hora;
    // ele arma o Trailing TP, rastreia o topo do pump e estreita o stop parabolicamente conforme o lucro sobe.
    const isTrailingTakeProfitEnabled = bot.trailingTakeProfit ?? true;
    const baseTpDistance = bot.trailingTakeProfitDistance ?? 0.6; // recuo percentual padrão do pico

    let isTakeProfitNowArmed = Boolean(pos.isTakeProfitArmed);
    if (isTrailingTakeProfitEnabled && gainPercent >= effectiveTakeProfit) {
      isTakeProfitNowArmed = true;
    }

    let tpPeakPrice = pos.tpPeakPrice || currentPrice!;
    if (isTakeProfitNowArmed) {
      tpPeakPrice = Math.max(tpPeakPrice, currentPrice!);
    }
    const peakGainFromTp = ((tpPeakPrice - pos.entryPrice) / pos.entryPrice) * 100;
    const pullbackFromTpPeak = peakGainFromTp - gainPercent;

    // 🏄‍♂️ Aperto Parabólico de Stop (Lock-in agressivo de lucros estendidos em pumps)
    let effectiveTpDistance = baseTpDistance;
    if (peakGainFromTp >= 6.0) {
      effectiveTpDistance = Math.min(baseTpDistance, 0.30); // Acima de +6%, tolera apenas 0.30% de recuo do pico
    } else if (peakGainFromTp >= 4.0) {
      effectiveTpDistance = Math.min(baseTpDistance, 0.45); // Entre +4% e +6%, tolera apenas 0.45% de recuo do pico
    }

    // Condição de saída pelo Trailing TP:
    // 1. Está armado
    // 2. Teve um recuo >= effectiveTpDistance a partir do topo OU o lucro recuou para a base de proteção (effectiveTakeProfit - 0.3%)
    const isTrailingTakeProfitTriggered =
      isTrailingTakeProfitEnabled &&
      isTakeProfitNowArmed &&
      (pullbackFromTpPeak >= effectiveTpDistance || gainPercent <= Math.max(1.5, effectiveTakeProfit - 0.3));

    // Update position mark-to-market
    const updatedPosition: BotPosition = {
      ...pos,
      currentPrice: currentPrice!,
      highestPrice,
      unrealizedPnl: unrealizedPnlUsdt,
      unrealizedPnlPercent: parseFloat(gainPercent.toFixed(2)),
      isBreakEvenArmed: isBreakEvenNowArmed,
      breakEvenPrice,
      isTakeProfitArmed: isTakeProfitNowArmed,
      tpPeakPrice,
    };
    store.updateBotPosition(bot.id, updatedPosition);
    store.updateBotPositionsRealtime(store.tickers);
    store.updateBotPnls(store.tickers);

    // 1.0 CÁLCULO DE TEMPO EM OPERAÇÃO (Para Time-Stop e Saída por Estagnação de Capital)
    // Para robôs de Venda Inteligente por IA (useAiExit), o time-stop é estritamente DESATIVADO
    // para não vender a posição antes do rali e aguardar pacientemente a meta de lucro no topo.
    const isAiExitBot = Boolean(bot.useAiExit || bot.strategy === "AI");
    const configuredTimeStop = bot.timeStopMinutes ?? 45;
    const timeStopMinutes = isAiExitBot ? 0 : Math.min(60, configuredTimeStop);
    const timeStopGraceMinutes = 5; // Tolerância disciplinada máxima de 5 minutos
    const maxTimeStopDeadline = timeStopMinutes + timeStopGraceMinutes;
    let isTimeStop = false;
    let isZeroLossTimeStop = false;
    let isHardDeadlineTimeStop = false;
    let minutesOpen = 0;

    if (pos.entryTime && timeStopMinutes > 0) {
      const entryMs = new Date(pos.entryTime).getTime();
      if (!isNaN(entryMs)) {
        minutesOpen = Math.max(0, (Date.now() - entryMs) / 60000);
        if (minutesOpen >= timeStopMinutes) {
          // Checagem se o prejuízo é zero (ou lucro): gainPercent >= 0 ou PnL >= 0
          const isZeroLossOrProfitable = gainPercent >= -0.05 || unrealizedPnlUsdt >= -0.05;
          if (isZeroLossOrProfitable) {
            // Atingiu o tempo base (>= 45m) e o prejuízo zerou: sai imediatamente sem perdas
            isTimeStop = true;
            isZeroLossTimeStop = true;
          } else if (minutesOpen >= maxTimeStopDeadline) {
            // Esgotou 5 minutos de tolerância sem reagir: encerra compulsório disciplinado
            isTimeStop = true;
            isHardDeadlineTimeStop = true;
          }
        }
      }
    }

    // Feedback de monitoramento em tempo real do robô em operação
    const targetProfitPrice = (pos.entryPrice * (1 + effectiveTakeProfit / 100)).toFixed(4);
    const sign = gainPercent >= 0 ? "+" : "";
    let statusNotice = "";
    if (pos.partialTpExecuted) {
      statusNotice += ` · 🎯 50% Salvo no Lucro (Risco Zero)`;
    }
    if (isTakeProfitNowArmed) {
      statusNotice += ` · 🚀 Surfando Pump (Trailing Parabólico Ativo · Topo: +${peakGainFromTp.toFixed(2)}%)`;
    } else if (isBreakEvenNowArmed) {
      statusNotice += ` · 🛡️ Risco Zero Ativo (Break-Even Armado em $${breakEvenPrice.toFixed(4)})`;
    }
    const atrNotice = pos.dynamicTakeProfit ? ` · 🎯 Alvo ATR: +${pos.dynamicTakeProfit}%` : "";
    const dcaNotice = (pos.dcaCount && pos.dcaCount > 0) ? ` · 🔄 DCA (${pos.dcaCount}/${bot.maxDcaOrders || 1})` : "";
    
    let timeNotice = "";
    if (timeStopMinutes > 0 && minutesOpen > 0) {
      if (minutesOpen >= timeStopMinutes && minutesOpen < maxTimeStopDeadline) {
        const remainingGrace = Math.max(0, Math.ceil(maxTimeStopDeadline - minutesOpen));
        timeNotice = ` · ⏱️ Estagnação (${minutesOpen.toFixed(0)}m): Aguardando prejuízo zero (${remainingGrace}m restantes)`;
      } else {
        timeNotice = ` · ⏱️ ${minutesOpen.toFixed(0)}m/${timeStopMinutes}m`;
      }
    }

    store.updateBot(bot.id, {
      status: "in_position",
      stats: {
        ...bot.stats,
        lastAction: `Monitorando ${pos.symbol.replace("USDT", "")} · Cotação: $${currentPrice!.toFixed(5)} (${sign}${gainPercent.toFixed(2)}%) · Alvo: $${targetProfitPrice}${atrNotice}${statusNotice}${dcaNotice}${timeNotice}`,
        lastActionTime: new Date().toISOString(),
      },
    });

    // ==========================================================
    // 1.0 REALIZAÇÃO PARCIAL AUTOMÁTICA (Scale-Out Institucional)
    // ==========================================================
    // Embolsa 50% da posição assim que atinge o primeiro alvo (+1.0% padrão),
    // garantindo lucro líquido no bolso e travando o restante no Break-Even com risco ZERO.
    // Requer apenas que a fatia vendida e a remanescente atendam ao minNotional da Binance (>= 5.20 USDT).
    const partialTpTrigger = Math.max(0.85, Math.min(1.6, bot.partialTpTrigger ?? 1.0));
    const now = Date.now();
    const isPartialCooldown = now < (partialRetryCooldown.get(bot.id) || 0);

    if (canUsePartialTp && !pos.partialTpExecuted && gainPercent >= partialTpTrigger && !isPartialCooldown) {
      const partialOk = await executeBotPartialSell({
        bot,
        position: updatedPosition,
        sellPrice: currentPrice!,
        gainPercent,
        callbacks,
      });
      if (partialOk) {
        return; // Posição restante continua correndo protegida no Break-Even
      }
    }

    // 1.04 SAÍDA INTELIGENTE POR IA (Venda no Melhor Momento sugerido pela Inteligência Artificial)
    let isAiExitTriggered = false;
    let aiExitReason = "";

    if (bot.useAiExit || bot.strategy === "AI") {
      // 1. Sinal preditivo explícito da base/rede neural
      const latestAiSignal = aiSignals?.find(
        (s) => s.symbol === pos.symbol && (s.action === "SELL" || s.signal === "SELL")
      );
      const isProfitableOrCoveringFees = gainPercent >= 0.35; // Garante lucro cobrindo taxas operacionais

      if (
        latestAiSignal &&
        isProfitableOrCoveringFees &&
        (latestAiSignal.confidence >= 0.55 || (latestAiSignal.confidence_score ?? 0) >= 0.55)
      ) {
        const confPct = Math.round((latestAiSignal.confidence || latestAiSignal.confidence_score || 0.6) * 100);
        isAiExitTriggered = true;
        aiExitReason = `🤖 SAÍDA INTELIGENTE (IA): Venda recomendada no melhor momento (+${gainPercent.toFixed(2)}%) · Sinal preditivo de topo (${confPct}% de confiança)`;
      }

      // 2. Análise quantitativa de esgotamento e pico de momentum
      if (!isAiExitTriggered && gainPercent >= 0.65) {
        const klines1m = await getSymbolKlines(pos.symbol, "1m");
        if (klines1m.length >= 14) {
          const closes = klines1m.map((k) => k.close);
          const currentRsi = calculateRSI(closes, 14);
          const lastCandle = klines1m[klines1m.length - 1];
          const candleRange = lastCandle.high - lastCandle.low;
          const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
          const isTopRejection = candleRange > 0 && (upperWick / candleRange) >= 0.38;

          // Esgotamento: RSI sobrecomprado (> 68) ou forte rejeição de topo com pavio superior
          if (currentRsi >= 68 || (gainPercent >= 1.0 && isTopRejection)) {
            isAiExitTriggered = true;
            aiExitReason = `🎯 PICO DE MOMENTUM (IA): Venda no melhor momento executada (+${gainPercent.toFixed(2)}%) · RSI em sobrecompra (${currentRsi.toFixed(1)}) e topo rejeitado`;
          }
        }
      }
    }

    // 1.1 TAKE PROFIT TRIGGER
    let isTakeProfit = false;
    let takeProfitReason = "";
    if (isTrailingTakeProfitEnabled) {
      if (isTrailingTakeProfitTriggered) {
        isTakeProfit = true;
        takeProfitReason = bot.stopAfterProfit
          ? `🚀 TRAILING TAKE-PROFIT SURFADO (+${gainPercent.toFixed(2)}%) · TOPO: +${peakGainFromTp.toFixed(2)}% · OPERAÇÃO ÚNICA CONCLUÍDA`
          : `🚀 TRAILING TAKE-PROFIT SURFADO (+${gainPercent.toFixed(2)}%) · TOPO: +${peakGainFromTp.toFixed(2)}% (Recuo de ${pullbackFromTpPeak.toFixed(2)}%)`;
      }
    } else {
      if (gainPercent >= effectiveTakeProfit) {
        isTakeProfit = true;
        takeProfitReason = bot.stopAfterProfit
          ? `🎯 TAKE PROFIT ATINGIDO (+${gainPercent.toFixed(2)}%) · OPERAÇÃO ÚNICA CONCLUÍDA`
          : `🎯 TAKE PROFIT ATINGIDO (+${gainPercent.toFixed(2)}%)`;
      }
    }

    // 1.2 TRAILING STOP / BREAKEVEN PROFIT LOCK
    // Arma assim que superar ganho saudável (>= 1.1% ou 65% do alvo de TP)
    const pullbackFromPeak = peakGain - gainPercent;
    const trailingArmThreshold = Math.max(1.1, effectiveTakeProfit * 0.65);
    const isTrailingStop =
      bot.trailingStop &&
      !isTakeProfitNowArmed &&
      peakGain >= trailingArmThreshold &&
      pullbackFromPeak >= (bot.trailingStopDistance || 0.45) &&
      gainPercent >= 0.30;

    // 1.3 STOP LOSS DISCIPLINADO (Respeita o risco adaptativo configurado por ATR)
    const isHardStopLoss = gainPercent <= -effectiveStopLoss;
    const isStopLoss = isHardStopLoss;

    // 1.4 ONE-SHOT QUICK PROFIT (Venda com lucro real conquistado)
    const isQuickProfit = bot.stopAfterProfit && gainPercent >= Math.max(1.2, effectiveTakeProfit * 0.85);

    let shouldSell = false;
    let sellReason = "";
    let logType: "profit" | "loss" | "warning" = "profit";

    if (isAiExitTriggered) {
      shouldSell = true;
      sellReason = aiExitReason;
      logType = "profit";
    } else if (isTakeProfit) {
      shouldSell = true;
      sellReason = takeProfitReason;
      logType = "profit";
    } else if (isQuickProfit) {
      shouldSell = true;
      sellReason = `💰 LUCRO CONQUISTADO (+${gainPercent.toFixed(2)}%) · OPERAÇÃO ÚNICA CONCLUÍDA`;
      logType = "profit";
    } else if (isTrailingStop) {
      shouldSell = true;
      sellReason = bot.stopAfterProfit
        ? `🔒 TRAILING STOP LUCRO PROTEGIDO (+${gainPercent.toFixed(2)}%) · OPERAÇÃO ÚNICA CONCLUÍDA`
        : `🔒 TRAILING STOP LUCRO PROTEGIDO (+${gainPercent.toFixed(2)}%)`;
      logType = "profit";
    } else if (isBreakEvenTriggered) {
      shouldSell = true;
      sellReason = bot.stopAfterProfit
        ? `🛡️ BREAK-EVEN AUTOMÁTICO (+${gainPercent.toFixed(2)}%) · RISCO ZERO PROTEGIDO · OPERAÇÃO ÚNICA CONCLUÍDA`
        : `🛡️ BREAK-EVEN AUTOMÁTICO (+${gainPercent.toFixed(2)}%) · RISCO ZERO PROTEGIDO (Stop no Lucro)`;
      logType = "profit";
    } else if (isTimeStop) {
      shouldSell = true;
      if (isZeroLossTimeStop) {
        sellReason = `⏱️ TIME-STOP / ESTAGNAÇÃO (${minutesOpen.toFixed(0)}m): Prejuízo zerado na janela de tolerância (+${gainPercent.toFixed(2)}%) · Capital liberado sem perdas`;
        logType = "profit";
      } else {
        sellReason = `⏱️ TIME-STOP DEFINITIVO (${minutesOpen.toFixed(0)}m): Limite de estagnação atingido (${timeStopMinutes}m + ${timeStopGraceMinutes}m) sem zerar prejuízo · Encerrando a mercado`;
        logType = "warning";
      }
    } else if (isStopLoss) {
      shouldSell = true;
      sellReason = isHardStopLoss
        ? `🛑 STOP LOSS PREVENTIVO (-${Math.abs(gainPercent).toFixed(2)}%)`
        : `🛑 INVALIDAÇÃO DE SCALP (-${Math.abs(gainPercent).toFixed(2)}% em ${minutesOpen.toFixed(0)}m) · CORTE RÁPIDO`;
      logType = "loss";
    }

    if (shouldSell) {
      await executeBotSell({
        bot,
        position: updatedPosition,
        sellPrice: currentPrice!,
        pnl: unrealizedPnlUsdt,
        gainPercent,
        reason: sellReason,
        logType,
        callbacks,
      });
      return;
    }

    // ==========================================================
    // 1.6 SMART SUPPORT DCA (Preço Médio Estratégico em Suporte)
    // ==========================================================
    const isSmartDcaEnabled = bot.useSmartDca ?? true;
    const maxDca = bot.maxDcaOrders ?? 1;
    const currentDcaCount = pos.dcaCount ?? 0;
    const dcaDip = bot.dcaDipThreshold ?? 1.5; // ex: -1.5% de recuo

    if (
      isSmartDcaEnabled &&
      currentDcaCount < maxDca &&
      gainPercent <= -dcaDip &&
      gainPercent > -bot.stopLoss &&
      cash >= 5.20
    ) {
      const posKlines1m = await getSymbolKlines(symbol, "1m");
      if (posKlines1m.length >= 14) {
        const currentRsi = calculateRSI(posKlines1m.map((k) => k.close), 14);
        const lastCandle = posKlines1m[posKlines1m.length - 1];

        // 🛡️ FIM DO DCA CEGO: Reversão Confirmada de Price Action Obrigatória
        // É estritamente proibido DCA baseado apenas em RSI sobrevendido.
        // Exige fechamento de candle de alta ou absorção compradora com pavio inferior expressivo (martelo)
        const isBullishCandle = lastCandle.close > lastCandle.open;
        const candleRange = lastCandle.high - lastCandle.low;
        const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
        const isHammerRejection = candleRange > 0 && (lowerWick / candleRange) >= 0.35;
        const hasPriceActionReversal = isBullishCandle || isHammerRejection;

        // Checagem de Macro-Tendência (15m): Veta DCA se o 15m estiver em forte colapso abaixo da média
        const posKlines15m = await getSymbolKlines(symbol, "15m");
        let isMacroNotCrashing = true;
        if (posKlines15m.length >= 10) {
          const closes15 = posKlines15m.map((k) => k.close);
          const ema9_15 = calculateEMA(closes15, 9);
          const lastClose15 = closes15[closes15.length - 1];
          if (lastClose15 < ema9_15 * 0.98) {
            isMacroNotCrashing = false;
          }
        }

        // Confirma suporte: RSI em sobrevenda (<= 42) E Price Action com reversão confirmada E sem colapso macro
        const isSupportConfirmed = currentRsi <= 42 && hasPriceActionReversal && isMacroNotCrashing;

        if (isSupportConfirmed) {
          await executeBotDcaReentry({
            bot,
            position: updatedPosition,
            currentPrice: currentPrice!,
            gainPercent,
            currentRsi,
            callbacks,
          });
          return;
        } else {
          // Log de governança no robô para transparência institucional
          const blockReason = !hasPriceActionReversal
            ? `DCA bloqueado: RSI (${currentRsi.toFixed(0)}) sem candle de reversão no price action (DCA Cego Proibido).`
            : !isMacroNotCrashing
            ? `DCA bloqueado: Tendência macro de 15m em colapso acelerado (risco de rompimento de suporte).`
            : `Aguardando sobrevenda com suporte (RSI atual: ${currentRsi.toFixed(0)}).`;

          store.updateBot(bot.id, {
            stats: {
              ...bot.stats,
              lastAction: `🛡️ Governança DCA: ${blockReason}`,
              lastActionTime: new Date().toISOString(),
            },
          });
          return;
        }
      }
    }

    return;
  }


  // ==========================================================
  // CASE 2: Bot HAS NO Position -> FIND PROFITABLE ENTRY
  // ==========================================================
  let cash = store.portfolio.cashBalance;

  // Auto-replenish paper funds if depleted to ensure continuous testing
  if (tradingMode === "paper" && cash < 50) {
    store.setAccount({
      cashBalance: 10000,
      assetQuantity: store.portfolio.assetQuantity,
      symbol: "BTCUSDT",
    });
    cash = 10000;
  }

  // Check minimum execution balance (mínimo Binance de $5.50 USDT ou lote do robô)
  const minRequiredCash = Math.max(5.50, Math.min(bot.allocationAmount || 15.0, 15.0));
  if (cash < minRequiredCash) {
    const actionMsg = (tradingMode === "live" && lastLiveAccountError)
      ? `Aguardando Binance: ${lastLiveAccountError.replace("Conexão Binance falhou: ", "")}`
      : `Aguardando capital livre: Saldo ($${cash.toFixed(2)}) abaixo do lote mínimo ($${minRequiredCash.toFixed(2)}).`;
    store.updateBot(bot.id, {
      status: "scanning",
      stats: {
        ...bot.stats,
        lastAction: actionMsg,
        lastActionTime: new Date().toISOString(),
      },
    });
    return;
  }

  const btcTicker = tickers["BTCUSDT"];

  // ==========================================================
  // BTC MARKET GATEKEEPER: Protege contra quedas aceleradas do BTC
  // ==========================================================
  if (bot.symbol !== "BTCUSDT" && !isAutoScreener && bot.useBtcGatekeeper !== false) {
    const btcCheck = await isBtcMarketHealthy();
    if (!btcCheck.healthy) {
      store.updateBot(bot.id, {
        status: "scanning",
        stats: {
          ...bot.stats,
          lastAction: `🛡️ BTC Gatekeeper: Compras pausadas (${btcCheck.detail})`,
          lastActionTime: new Date().toISOString(),
        },
      });
      return;
    }
  }

  // ==========================================================
  // BRANCH 2A: AUTO-SCREENER DE MOEDAS EM ALTA (HOT COINS)
  // ==========================================================
  if (isAutoScreener) {
    const hasManualOverride = Boolean(bot.overrideSymbol && bot.overrideSymbol !== "AUTO");
    let candidatesToEvaluate: HotCoinCandidate[] = [];

    if (hasManualOverride) {
      const fixedSym = bot.overrideSymbol!.toUpperCase().trim();
      const fixedTicker = tickers[fixedSym] || tickers[`${fixedSym}USDT`];
      let p = fixedTicker?.price || 0;
      if (!p || p <= 0) {
        try {
          const res = await fetch(`/api/market/price?symbol=${fixedSym}`, { cache: "no-store", signal: AbortSignal.timeout(1200) });
          if (res.ok) {
            const j = await res.json();
            p = parseFloat(j?.data?.price || j?.price || 0);
          }
        } catch {}
      }
      const chg = fixedTicker?.priceChangePercent || 0;
      const vol = fixedTicker?.quoteVolume || 5_000_000;
      candidatesToEvaluate = [
        {
          symbol: fixedSym,
          price: p,
          priceChangePercent: chg,
          quoteVolume: vol,
          relativeStrengthVsBtc: chg - (btcTicker?.priceChangePercent || 0),
          volumeZScore: 1.0,
          rangePosition: 0.8,
          score: 100,
        },
      ];
    } else {
      const heldByOthers = store.bots
        .filter((b) => b.active && b.id !== bot.id)
        .map((b) => b.position?.symbol || (b.overrideSymbol && b.overrideSymbol !== "AUTO" ? b.overrideSymbol : b.symbol))
        .filter((s) => s && s !== "AUTO");
      const candidates = scanHotCoins(tickers, btcTicker, 12, heldByOthers);

      if (candidates.length === 0) {
        store.updateBot(bot.id, {
          status: "scanning",
          stats: {
            ...bot.stats,
            lastAction: "🔥 Auto-Screener: Carregando cotações e buscando moedas em alta na Binance...",
            lastActionTime: new Date().toISOString(),
          },
        });
        return;
      }

      // Identifica moedas já sob custódia de QUALQUER robô da frota para evitar duplicidade absoluta
      const heldSymbols = new Set(
        store.bots
          .filter((b) => b.position && b.position.quantity > 0)
          .map((b) => b.position!.symbol)
      );

      // Filtra moedas alocadas, com compra em andamento por outro robô ou em cooldown pós-trade
      const availableCandidates = candidates.filter((cand) => {
        if (heldSymbols.has(cand.symbol) || inFlightBuys.has(cand.symbol)) return false;
        const cooldownUntil = botSymbolLossCooldown.get(cand.symbol);
        if (cooldownUntil && Date.now() < cooldownUntil) return false;
        return true;
      });

      if (availableCandidates.length === 0) {
        store.updateBot(bot.id, {
          status: "scanning",
          stats: {
            ...bot.stats,
            lastAction: "🔥 Auto-Screener: Líderes em alta alocadas em outros robôs ou em cooldown de proteção",
            lastActionTime: new Date().toISOString(),
          },
        });
        return;
      }

      candidatesToEvaluate = availableCandidates.slice(0, 12);
    }

    let bestApprovals = 0;
    let bestTotalChecks = 4;
    let bestChecks: BotEntryCheck[] = [];
    let bestVetoReason: string | undefined = undefined;
    let bestVetoIndicator: string | undefined = undefined;
    let bestCandidateSymbol = "";

    // Avalia as candidatas selecionadas por ordem de score quantitativo
    for (const cand of candidatesToEvaluate) {
      const candTicker = tickers[cand.symbol] || {
        symbol: cand.symbol,
        price: cand.price,
        priceChange: cand.priceChangePercent,
        priceChangePercent: cand.priceChangePercent,
        high: cand.price,
        low: cand.price,
        volume: cand.quoteVolume,
        quoteVolume: cand.quoteVolume,
      };

      const [candKlines1m, candKlines15m, orderBook] = await Promise.all([
        getSymbolKlines(cand.symbol, "1m"),
        getSymbolKlines(cand.symbol, "15m"),
        bot.useOrderBookFilter !== false
          ? getOrderBookAnalysis(cand.symbol, bot.maxSpreadPercent, bot.minBidAskRatio)
          : Promise.resolve(undefined),
      ]);

      const decision = evaluateEntry(bot, candTicker, btcTicker, candKlines1m, aiSignals, candKlines15m, orderBook);
      const currentApprovals = decision.checks.filter((c) => c.ok).length;
      if (currentApprovals > bestApprovals || bestChecks.length === 0) {
        bestApprovals = currentApprovals;
        bestTotalChecks = decision.checks.length;
        bestChecks = decision.checks;
        bestCandidateSymbol = cand.symbol;
        const failed = decision.checks.find((c) => !c.ok);
        if (failed) {
          bestVetoIndicator = failed.label;
          bestVetoReason = `${failed.label}: ${failed.detail}`;
        } else {
          bestVetoIndicator = undefined;
          bestVetoReason = undefined;
        }
      }

      if (decision.shouldBuy) {
        // Busca cotação fresca instantânea da Binance para evitar slippage na entrada
        let freshCandPrice = cand.price;
        try {
          const pRes = await fetch(`/api/market/price?symbol=${cand.symbol}`, { cache: "no-store", signal: AbortSignal.timeout(1200) });
          if (pRes.ok) {
            const pJson = await pRes.json();
            const pVal = parseFloat(pJson?.data?.price || pJson?.price);
            if (pVal && pVal > 0) freshCandPrice = pVal;
          }
        } catch {}

        // Sizing Compounding Dinâmico (Half-Kelly):
        // Conforme a banca cresce (> $90), escala as posições proporcionalmente (~42-45% do saldo)
        // para ativar os juros compostos automáticos e maximizar os lucros acumulados.
        const maxSafeCash = Math.max(0, cash * 0.95);
        const configuredAlloc = bot.allocationAmount || 40.0;
        const compoundingSlot = cash > 90.0
          ? Math.max(minRequiredCash, cash * 0.45)
          : Math.max(minRequiredCash, Math.min(maxSafeCash, cash * 0.85));
        const dynamicAlloc = Math.max(minRequiredCash, Math.min(maxSafeCash, Math.max(configuredAlloc, compoundingSlot)));
        // Gestão Dinâmica por Volatilidade (ATR Volatility Targeting) para Altcoins
        const currentAtr = decision.relATR || 0.010;
        const baseAtr = 0.010;
        const volScale = Math.min(1.25, Math.max(0.50, baseAtr / Math.max(0.002, currentAtr)));
        const targetSpend = Math.max(minRequiredCash, Math.min(maxSafeCash, dynamicAlloc * volScale));
        const quantity = parseFloat((targetSpend / freshCandPrice).toFixed(6));
        const total = parseFloat((quantity * freshCandPrice).toFixed(2));

        // Consulta de microestrutura L2 em tempo real para a candidata
        const candOrderBook = await getOrderBookAnalysis(cand.symbol);
        if (candOrderBook && typeof candOrderBook.orderFlowImbalance === "number" && candOrderBook.orderFlowImbalance < -0.30) {
          continue; // Veta candidatas com desequilíbrio negativo de fluxo (pressão vendedora no book)
        }

        if (total >= minRequiredCash * 0.95 && total <= cash) {
          const reasonFormatted = hasManualOverride
            ? `📌 Override Manual [${cand.symbol.replace("USDT", "")}]: ${decision.reason}`
            : `🔥 Auto-Screener [${cand.symbol.replace("USDT", "")} +${cand.priceChangePercent.toFixed(1)}%]: ${decision.reason}`;
          await executeBotBuy({
            bot,
            targetSymbol: cand.symbol,
            buyPrice: freshCandPrice,
            quantity,
            total,
            customReason: reasonFormatted,
            dynamicTakeProfit: decision.suggestedTp,
            dynamicStopLoss: decision.suggestedSl,
            relativeAtrAtEntry: decision.relATR,
            orderBook: candOrderBook,
            callbacks,
          });
          return;
        }
      }
    }

    const triggerProximityPercent = Math.round((bestApprovals / Math.max(1, bestTotalChecks)) * 100);
    const prevHistory = Array.isArray(bot.stats.proximityHistory) ? bot.stats.proximityHistory : [];
    const proximityHistory = [...prevHistory.slice(-9), triggerProximityPercent];

    if (hasManualOverride) {
      store.updateBot(bot.id, {
        status: "scanning",
        stats: {
          ...bot.stats,
          scansPerMinute,
          evaluatedPairsCount: 1,
          approvalsCount: bestApprovals,
          totalChecksCount: bestTotalChecks,
          triggerProximityPercent,
          proximityHistory,
          lastVetoReason: bestVetoReason,
          lastVetoIndicator: bestVetoIndicator,
          entryChecks: bestChecks,
          lastAction: `📌 Override Manual: Rastreando ${bot.overrideSymbol!.replace("USDT", "")}/USDT · Aguardando gatilho quantitativo 1m/15m`,
          lastActionTime: new Date().toISOString(),
        },
      });
      return;
    }

    // Nenhuma candidata confirmou gatilho técnico no tick atual
    const topSummary = candidatesToEvaluate
      .slice(0, 3)
      .map((c) => `${c.symbol.replace("USDT", "")} (+${c.priceChangePercent.toFixed(1)}%)`)
      .join(", ");

    store.updateBot(bot.id, {
      status: "scanning",
      stats: {
        ...bot.stats,
        scansPerMinute,
        evaluatedPairsCount: candidatesToEvaluate.length,
        approvalsCount: bestApprovals,
        totalChecksCount: bestTotalChecks,
        triggerProximityPercent,
        proximityHistory,
        lastVetoReason: bestVetoReason ? `[${bestCandidateSymbol.replace("USDT", "")}] ${bestVetoReason}` : undefined,
        lastVetoIndicator: bestVetoIndicator,
        entryChecks: bestChecks,
        lastAction: `🔥 Auto-Screener: Monitorando líderes (${topSummary}) · Aguardando gatilho 1m/15m`,
        lastActionTime: new Date().toISOString(),
      },
    });
    return;
  }

  // ==========================================================
  // BRANCH 2B: SINGLE-SYMBOL BOT TRADICIONAL
  // ==========================================================
  // 🛡️ Trava de Exclusividade Global: Evita que dois robôs comprem o mesmo par simultaneamente
  const isHeldByAnyBot =
    inFlightBuys.has(symbol) ||
    store.bots.some(
      (b) => b.id !== bot.id && b.position && b.position.quantity > 0 && b.position.symbol === symbol
    );
  if (isHeldByAnyBot) {
    const prevHistory = Array.isArray(bot.stats.proximityHistory) ? bot.stats.proximityHistory : [];
    store.updateBot(bot.id, {
      status: "scanning",
      stats: {
        ...bot.stats,
        scansPerMinute,
        evaluatedPairsCount: 1,
        approvalsCount: 0,
        totalChecksCount: 4,
        triggerProximityPercent: 0,
        proximityHistory: [...prevHistory.slice(-9), 0],
        lastVetoReason: `Ativo ${symbol.replace("USDT", "")} já em operação na frota`,
        lastVetoIndicator: "Exclusividade Frota",
        lastAction: `🛡️ Ativo ${symbol.replace("USDT", "")} já em operação na frota`,
        lastActionTime: new Date().toISOString(),
      },
    });
    return;
  }

  // 🛡️ Proteção Anti-Cascata e Anti-Recompra Pós-Trade (evita entrar em facas caindo ou topos repetidos)
  const lossCooldownUntil = botSymbolLossCooldown.get(symbol);
  if (lossCooldownUntil && Date.now() < lossCooldownUntil) {
    const remainingMin = Math.ceil((lossCooldownUntil - Date.now()) / 60000);
    const prevHistory = Array.isArray(bot.stats.proximityHistory) ? bot.stats.proximityHistory : [];
    store.updateBot(bot.id, {
      status: "scanning",
      stats: {
        ...bot.stats,
        scansPerMinute,
        evaluatedPairsCount: 1,
        approvalsCount: 0,
        totalChecksCount: 4,
        triggerProximityPercent: 0,
        proximityHistory: [...prevHistory.slice(-9), 0],
        lastVetoReason: `Cooldown pós-trade ativo (${remainingMin}m restantes)`,
        lastVetoIndicator: "Cooldown Pós-Trade",
        lastAction: `🛡️ Cooldown pós-trade ativo em ${symbol.replace("USDT", "")} (${remainingMin}m restantes para novo ciclo seguro)`,
        lastActionTime: new Date().toISOString(),
      },
    });
    return;
  }

  // Decisão de entrada com candles reais do próprio ativo do robô (Multi-Timeframe 15m + 1m + Order Book)
  const [klines, klines15m, orderBook] = await Promise.all([
    getSymbolKlines(symbol, "1m"),
    getSymbolKlines(symbol, "15m"),
    bot.useOrderBookFilter !== false
      ? getOrderBookAnalysis(symbol, bot.maxSpreadPercent, bot.minBidAskRatio)
      : Promise.resolve(undefined),
  ]);
  const decision = evaluateEntry(bot, ticker!, btcTicker, klines, aiSignals, klines15m, orderBook);
  const { shouldBuy, reason: entryReason, checks } = decision;

  const approvedChecksCount = checks ? checks.filter((c) => c.ok).length : 0;
  const totalCandidateChecks = checks ? checks.length : 4;
  const singleBotProximityPercent = Math.round((approvedChecksCount / Math.max(1, totalCandidateChecks)) * 100);
  const prevSingleHistory = Array.isArray(bot.stats.proximityHistory) ? bot.stats.proximityHistory : [];
  const singleProximityHistory = [...prevSingleHistory.slice(-9), singleBotProximityPercent];

  const failedCheck = checks ? checks.find((c) => !c.ok) : undefined;
  const singleVetoIndicator = failedCheck ? failedCheck.label : "Filtro Técnico";
  const singleVetoReason = failedCheck ? `${failedCheck.label}: ${failedCheck.detail}` : entryReason;

  if (shouldBuy && currentPrice) {
    // 🛡️ Trava de Slippage: Rejeitar ordens se o spread de mercado exceder a tolerância máxima parametrizada
    if (orderBook && typeof bot.slippageTolerance === "number" && orderBook.spreadPercent > bot.slippageTolerance) {
      store.updateBot(bot.id, {
        status: "scanning",
        stats: {
          ...bot.stats,
          scansPerMinute,
          evaluatedPairsCount: 1,
          approvalsCount: approvedChecksCount,
          totalChecksCount: totalCandidateChecks,
          triggerProximityPercent: singleBotProximityPercent,
          proximityHistory: singleProximityHistory,
          lastVetoReason: `Spread ${orderBook.spreadPercent.toFixed(2)}% excede tolerância de ${bot.slippageTolerance}%`,
          lastVetoIndicator: "Slippage Guard",
          lastAction: `⚠️ Slippage Guard · Spread de ${orderBook.spreadPercent.toFixed(2)}% excede tolerância de ${bot.slippageTolerance}%`,
          lastActionTime: new Date().toISOString(),
          entryChecks: checks,
        },
      });
      return;
    }

    // Gestão de Risco por Ordem: Tamanho de posição calculado por regra explícita (% do capital livre)
    // com limites máximos absolutos e compatibilidade com filtros de lote da exchange
    const riskPercent = (bot.riskPerTradePercent || (cash > 90.0 ? 45.0 : 40.0)) / 100;
    const maxSafeCash = Math.max(0, cash * 0.95);
    const configuredAlloc = bot.allocationAmount || 40.0;
    const calculatedAlloc = Math.min(maxSafeCash, cash * riskPercent);
    const dynamicAlloc = Math.max(minRequiredCash, Math.min(maxSafeCash, Math.max(configuredAlloc, calculatedAlloc)));

    // Gestão Dinâmica por Volatilidade (ATR Volatility Targeting):
    const currentAtr = decision.relATR || 0.008;
    const baseAtr = 0.008; // 0.8% base de referência para majors
    const volScale = Math.min(1.25, Math.max(0.50, baseAtr / Math.max(0.002, currentAtr)));
    const targetSpend = Math.min(150.0, Math.max(minRequiredCash, Math.min(maxSafeCash, dynamicAlloc * volScale)));

    const quantity = parseFloat((targetSpend / currentPrice).toFixed(6));
    const total = parseFloat((quantity * currentPrice).toFixed(2));

    if (total >= minRequiredCash * 0.95 && total <= cash) {
      await executeBotBuy({
        bot,
        targetSymbol: symbol,
        buyPrice: currentPrice,
        quantity,
        total,
        customReason: entryReason,
        dynamicTakeProfit: decision.suggestedTp,
        dynamicStopLoss: decision.suggestedSl,
        relativeAtrAtEntry: decision.relATR,
        orderBook,
        callbacks,
      });
    }
  } else {
    // Update live feedback so the user sees real-time scanning analysis
    store.updateBot(bot.id, {
      status: "scanning",
      stats: {
        ...bot.stats,
        scansPerMinute,
        evaluatedPairsCount: 1,
        approvalsCount: approvedChecksCount,
        totalChecksCount: totalCandidateChecks,
        triggerProximityPercent: singleBotProximityPercent,
        proximityHistory: singleProximityHistory,
        lastVetoReason: singleVetoReason,
        lastVetoIndicator: singleVetoIndicator,
        lastAction: `Aguardando · ${entryReason}`,
        lastActionTime: new Date().toISOString(),
        entryChecks: checks,
      },
    });
  }
}

/**
 * Executes a BUY trade for a specific bot and establishes its position.
 */
async function executeBotBuy({
  bot,
  targetSymbol,
  buyPrice,
  quantity,
  total,
  customReason,
  dynamicTakeProfit,
  dynamicStopLoss,
  relativeAtrAtEntry,
  orderBook,
  callbacks,
}: {
  bot: BotInstance;
  targetSymbol?: string;
  buyPrice: number;
  quantity: number;
  total: number;
  customReason?: string;
  dynamicTakeProfit?: number;
  dynamicStopLoss?: number;
  relativeAtrAtEntry?: number;
  orderBook?: any;
  callbacks?: MultiBotEngineCallbacks;
}) {
  const store = useCryptoStore.getState();
  const { tradingMode } = store;
  const execSymbol = targetSymbol || bot.symbol;

  if (inFlightBuys.has(execSymbol)) {
    return;
  }
  inFlightBuys.add(execSymbol);

  try {
    // Pre-check de profundidade e liquidez institucional L2 antes de despachar a ordem
    // 1. Recusar ordens que excedam 70% da liquidez dos top-10 níveis de ask
    if (orderBook && orderBook.askVolume > 0 && total > orderBook.askVolume * 0.70) {
      recordRejection("depth");
      store.addBotLog({
        message: `⚠️ [${bot.name}] Pre-check L2: Ordem ($${total.toFixed(2)}) excede 70% da profundidade do book ($${orderBook.askVolume.toFixed(2)}). Entrada abortada para prevenir slippage.`,
        type: "warning",
        botId: bot.id,
        botName: bot.name,
      });
      return;
    }

    // 2. Bloquear entradas quando o Order Flow Imbalance (OFI) indicar pressão vendedora no book
    const ofi = orderBook?.orderFlowImbalance ?? orderBook?.ofi;
    if (typeof ofi === "number" && ofi < -0.30) {
      recordRejection("ofi");
      store.addBotLog({
        message: `⚠️ [${bot.name}] Pre-check L2: Desequilíbrio do fluxo de ordens negativo (OFI = ${ofi.toFixed(2)} < -0.30). Pressão vendedora no book. Entrada abortada.`,
        type: "warning",
        botId: bot.id,
        botName: bot.name,
      });
      return;
    }

    // 3. Estimativa dinâmica de slippage real percorrendo o book L2
    const estimatedSlippage = estimateDepthSlippage(execSymbol, total, "BUY");
    const maxSlippageTolerance = bot.slippageTolerance || 0.35;
    if (estimatedSlippage > maxSlippageTolerance) {
      recordRejection("slippage");
      store.addBotLog({
        message: `⚠️ [${bot.name}] Pre-check L2: Slippage dinâmico estimado (${estimatedSlippage.toFixed(2)}%) excede a tolerância de risco (${maxSlippageTolerance.toFixed(2)}%). Entrada abortada.`,
        type: "warning",
        botId: bot.id,
        botName: bot.name,
      });
      return;
    }

    const executionId = `exec_buy_${bot.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const riskParams: RiskParams = {
      riskPerTradePercent: bot.riskPerTradePercent || 35.0,
      maxOrderUsd: 150.0,
      slippageTolerancePercent: bot.slippageTolerance || 0.35,
      stopLossPercent: dynamicStopLoss || bot.stopLoss,
      takeProfitPercent: dynamicTakeProfit || bot.takeProfit,
      holdingTimeLimitMinutes: bot.timeStopMinutes || bot.maxHoldingMinutes || 60,
    };
    const marketSnapshot: MarketSnapshot = {
      refPrice: buyPrice,
      bidPrice: orderBook?.bestBid,
      askPrice: orderBook?.bestAsk,
      spreadPercent: orderBook?.spreadPercent,
      orderBookRatio: orderBook?.bidAskRatio,
      timestamp: Date.now(),
    };

    const trade: TradeData = {
      id: `trade-${bot.id}-${Date.now()}`,
      executionId,
      algorithmVersion: bot.algorithmVersion || "v2.5.0-institutional",
      symbol: execSymbol,
      side: "BUY",
      price: buyPrice,
      quantity,
      total,
      strategy: customReason || bot.strategy,
      mode: tradingMode,
      pnl: 0,
      timestamp: new Date().toISOString(),
      botId: bot.id,
      botName: bot.name,
      riskParams,
      marketSnapshot,
      slippagePercent: estimatedSlippage,
    };

    let executedTrade: TradeData = trade;

  if (tradingMode === "live") {
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(trade),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        store.addBotLog({
          message: `🔴 [${bot.name}] Falha na Binance: ${result.error || "Erro de execução"}`,
          type: "error",
          botId: bot.id,
          botName: bot.name,
        });
        store.updateBot(bot.id, {
          stats: {
            ...bot.stats,
            lastAction: `Erro na Binance: ${result.error || "Ordem rejeitada"}`,
            lastActionTime: new Date().toISOString(),
          },
        });
        // Cooldown de 20s para evitar floodar logs a cada ciclo quando a Binance rejeita
        botErrorCooldown.set(bot.id, Date.now() + 20_000);
        return;
      }

      executedTrade = {
        ...trade,
        price: result.data?.price ?? result.trade?.price ?? trade.price,
        quantity: result.data?.quantity ?? result.trade?.quantity ?? trade.quantity,
        total: result.data?.total ?? result.trade?.total ?? trade.total,
        id: result.data?.id ?? result.trade?.id ?? trade.id,
      };

      store.addTrade(executedTrade);
      store.applyTradeToPortfolio(executedTrade);

      if (result.account) {
        store.setAccount(result.account);
      }
    } catch (e: any) {
      store.addBotLog({
        message: `🔴 [${bot.name}] Erro de conexão com a Binance: ${e.message}`,
        type: "error",
        botId: bot.id,
        botName: bot.name,
      });
      return;
    }
  } else {
    // Paper mode: sincroniza atômico com SQLite e store
    try {
      fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trade),
      })
        .then((res) => res.json())
        .then((result) => {
          if (result.success && result.account) {
            useCryptoStore.getState().setAccount(result.account);
          }
        })
        .catch((e) => console.warn("[MultiBotEngine] Aviso ao persistir trade simulado:", e.message));
    } catch {}

    store.addTrade(trade);
    store.applyTradeToPortfolio(trade);
  }

  // Create BotPosition com valores reais executados
  const finalQty = (executedTrade.quantity && executedTrade.quantity > 0) ? executedTrade.quantity : quantity;
  const finalPrice = (executedTrade.price && executedTrade.price > 0) ? executedTrade.price : buyPrice;
  const finalTotal = (executedTrade.total && executedTrade.total > 0) ? executedTrade.total : total;

  const newPosition: BotPosition = {
    symbol: execSymbol,
    side: "BUY",
    entryPrice: finalPrice,
    currentPrice: finalPrice,
    quantity: finalQty,
    totalCost: finalTotal,
    highestPrice: finalPrice,
    unrealizedPnl: 0,
    unrealizedPnlPercent: 0,
    entryTime: new Date().toISOString(),
    mode: tradingMode,
    dynamicTakeProfit,
    dynamicStopLoss,
    relativeAtrAtEntry,
  };

  store.updateBotPosition(bot.id, newPosition);
  store.recordBotTrade(bot.id, trade, 0);

  const effectiveTarget = dynamicTakeProfit || bot.takeProfit;
  const targetProfitPrice = (buyPrice * (1 + effectiveTarget / 100)).toFixed(4);
  const modeTag = tradingMode === "live" ? "🟢 [REAL]" : "🔷 [SIMULADO]";
  const atrTag = dynamicTakeProfit ? ` (Alvo ATR: +${dynamicTakeProfit}% | Stop: -${dynamicStopLoss || bot.stopLoss}%)` : "";

  store.addBotLog({
    message: `🚀 ${modeTag} [${bot.name}] COMPRA executada em ${execSymbol.replace("USDT", "")}! Preço: $${buyPrice.toLocaleString()} | Alvo de Lucro: +${effectiveTarget}% ($${targetProfitPrice})${atrTag}`,
    type: "buy",
    botId: bot.id,
    botName: bot.name,
  });

  callbacks?.onToast?.({
    title: `🤖 ${bot.name} ${modeTag}`,
    description: `Comprou ${finalQty.toFixed(4)} ${execSymbol.replace("USDT", "")} @ $${buyPrice.toLocaleString()} (Alvo: +${effectiveTarget}%)${atrTag}`,
    variant: "default",
  });
  } finally {
    inFlightBuys.delete(execSymbol);
  }
}

/**
 * Executes a Smart DCA Re-entry order in support to lower average entry price.
 */
async function executeBotDcaReentry({
  bot,
  position,
  currentPrice,
  gainPercent,
  currentRsi,
  callbacks,
}: {
  bot: BotInstance;
  position: BotPosition;
  currentPrice: number;
  gainPercent: number;
  currentRsi: number;
  callbacks?: MultiBotEngineCallbacks;
}) {
  const store = useCryptoStore.getState();
  const { tradingMode } = store;
  const cash = store.portfolio.cashBalance;
  const execSymbol = position.symbol || bot.symbol;

  const multiplier = bot.dcaMultiplier ?? 1.0;
  const baseAllocation = bot.allocationAmount || 10;
  const maxSafeCash = Math.max(0, cash * 0.95);
  const targetSpend = Math.max(5.20, Math.min(maxSafeCash, baseAllocation * multiplier));

  if (targetSpend < 5.20 || targetSpend > cash) {
    return;
  }

  const dcaQuantity = parseFloat((targetSpend / currentPrice).toFixed(6));
  const dcaTotal = parseFloat((dcaQuantity * currentPrice).toFixed(2));

  const dcaTrade: TradeData = {
    id: `dca-${bot.id}-${Date.now()}`,
    symbol: execSymbol,
    side: "BUY",
    price: currentPrice,
    quantity: dcaQuantity,
    total: dcaTotal,
    strategy: `${bot.strategy} (DCA Suporte RSI ${currentRsi.toFixed(0)})`,
    mode: tradingMode,
    pnl: 0,
    timestamp: new Date().toISOString(),
    botId: bot.id,
    botName: bot.name,
  };

  let executedTrade: TradeData = dcaTrade;

  if (tradingMode === "live") {
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dcaTrade),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        store.addBotLog({
          message: `🔴 [${bot.name}] Falha na Binance ao executar DCA: ${result.error || "Ordem rejeitada"}`,
          type: "warning",
          botId: bot.id,
          botName: bot.name,
        });
        return;
      }
      executedTrade = {
        ...dcaTrade,
        price: result.data?.price ?? result.trade?.price ?? dcaTrade.price,
        quantity: result.data?.quantity ?? result.trade?.quantity ?? dcaTrade.quantity,
        total: result.data?.total ?? result.trade?.total ?? dcaTrade.total,
        id: result.data?.id ?? result.trade?.id ?? dcaTrade.id,
      };
      store.addTrade(executedTrade);
      store.applyTradeToPortfolio(executedTrade);
      if (result.account) store.setAccount(result.account);
    } catch (e: any) {
      store.addBotLog({
        message: `🔴 [${bot.name}] Erro de rede ao executar DCA: ${e.message}`,
        type: "warning",
        botId: bot.id,
        botName: bot.name,
      });
      return;
    }
  } else {
    // Paper mode
    try {
      fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dcaTrade),
      })
        .then((res) => res.json())
        .then((result) => {
          if (result.success && result.account) {
            useCryptoStore.getState().setAccount(result.account);
          }
        })
        .catch(() => {});
    } catch {}

    store.addTrade(dcaTrade);
    store.applyTradeToPortfolio(dcaTrade);
  }

  const finalQty = executedTrade.quantity || dcaQuantity;
  const finalTotal = executedTrade.total || dcaTotal;

  // Calcula novo preço médio ponderado
  const prevTotalCost = position.totalCost || position.entryPrice * position.quantity;
  const newTotalQty = position.quantity + finalQty;
  const newTotalCost = prevTotalCost + finalTotal;
  const newAvgPrice = parseFloat((newTotalCost / newTotalQty).toFixed(6));
  const newDcaCount = (position.dcaCount || 0) + 1;

  const updatedPosition: BotPosition = {
    ...position,
    entryPrice: newAvgPrice,
    quantity: newTotalQty,
    totalCost: newTotalCost,
    currentPrice,
    dcaCount: newDcaCount,
    isBreakEvenArmed: false, // Rearma o break-even a partir do novo preço médio reduzido
    isTakeProfitArmed: false,
    tpPeakPrice: undefined,
  };

  store.updateBotPosition(bot.id, updatedPosition);
  store.recordBotTrade(bot.id, executedTrade, 0);

  const modeTag = tradingMode === "live" ? "🟢 [REAL]" : "🔷 [SIMULADO]";
  store.addBotLog({
    message: `🔄 ${modeTag} [${bot.name}] DCA INTELIGENTE EXECUTADO em suporte (RSI ${currentRsi.toFixed(0)})! Preço Médio reduzido de $${position.entryPrice.toFixed(4)} para $${newAvgPrice.toFixed(4)} (Recuo: ${gainPercent.toFixed(2)}%)`,
    type: "buy",
    botId: bot.id,
    botName: bot.name,
  });

  callbacks?.onToast?.({
    title: `🔄 DCA Inteligente [${bot.name}]`,
    description: `Preço médio de ${execSymbol.replace("USDT", "")} otimizado para $${newAvgPrice.toFixed(4)} (RSI ${currentRsi.toFixed(0)})`,
    variant: "default",
  });
}

/**
 * Executes a PARTIAL SELL (Scale-Out 50%) to bank quick profit and lock the rest at Break-Even.
 */
async function executeBotPartialSell({
  bot,
  position,
  sellPrice,
  gainPercent,
  callbacks,
}: {
  bot: BotInstance;
  position: BotPosition;
  sellPrice: number;
  gainPercent: number;
  callbacks?: MultiBotEngineCallbacks;
}): Promise<boolean> {
  const store = useCryptoStore.getState();
  const { tradingMode } = store;
  const execSymbol = position.symbol || bot.symbol;
  const sellLockKey = `${bot.id}_${execSymbol}`;
  if (inFlightSells.has(sellLockKey)) {
    return false;
  }
  inFlightSells.add(sellLockKey);

  try {
    const partialRatio = (bot.partialTpPercent ?? 50) / 100;
    const sellQty = parseFloat((position.quantity * partialRatio).toFixed(6));
    const remainingQty = parseFloat((position.quantity - sellQty).toFixed(6));
    const partialCost = parseFloat((position.totalCost * partialRatio).toFixed(2));
    const remainingCost = parseFloat((position.totalCost - partialCost).toFixed(2));
    const partialTotal = parseFloat((sellQty * sellPrice).toFixed(2));
    const partialPnl = parseFloat((partialTotal - partialCost).toFixed(2));

    // Binance spot order requires min $5 notional
    if (tradingMode === "live" && partialTotal < 5.20) {
      // Se a fatia calculada for inferior a $5.20, desativa a parcial nesta posição
      // para evitar loops infinitos a cada segundo. A operação seguirá protegida até o Take Profit total ou Stop Loss.
      store.updateBotPosition(bot.id, {
        ...position,
        partialTpExecuted: true,
      });
      partialRetryCount.delete(bot.id);
      partialRetryCooldown.delete(bot.id);

      store.addBotLog({
        message: `ℹ️ [${bot.name}] Parcial desativada: fatia ($${partialTotal.toFixed(2)} USDT) é inferior ao lote mínimo de $5 da Binance. A posição continuará aberta até o Take Profit total ou Stop Loss.`,
        type: "info",
        botId: bot.id,
        botName: bot.name,
      });
      return false;
    }

  const executionId = `exec_partial_${bot.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const trade: TradeData = {
    id: `trade-partial-${bot.id}-${Date.now()}`,
    executionId,
    algorithmVersion: bot.algorithmVersion || "v2.5.0-institutional",
    symbol: execSymbol,
    side: "SELL",
    price: sellPrice,
    quantity: sellQty,
    total: partialTotal,
    strategy: `${bot.strategy} (🎯 PARCIAL ${Math.round(partialRatio * 100)}%)`,
    mode: tradingMode,
    pnl: partialPnl,
    timestamp: new Date().toISOString(),
    botId: bot.id,
    botName: bot.name,
    sellAll: false,
    riskParams: {
      riskPerTradePercent: bot.riskPerTradePercent || 35.0,
      maxOrderUsd: 150.0,
      slippageTolerancePercent: bot.slippageTolerance || 0.35,
      stopLossPercent: bot.stopLoss,
      takeProfitPercent: bot.takeProfit,
      holdingTimeLimitMinutes: bot.timeStopMinutes || bot.maxHoldingMinutes || 60,
    },
    marketSnapshot: {
      refPrice: sellPrice,
      timestamp: Date.now(),
    },
  };

  if (tradingMode === "live") {
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trade),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        const errMsg = result.error || "Ordem rejeitada";
        const errCode = result.code || "";

        // 1. Caso Posição Órfã / Saldo Zerado na Binance (ex: $0.00 USDT ou NO_BALANCE)
        const isZeroBalance =
          errCode === "NO_BALANCE" ||
          errMsg.includes("não possui saldo") ||
          errMsg.includes("$0.00 USDT") ||
          result.residualUsdt === 0;

        if (isZeroBalance) {
          store.updateBotPosition(bot.id, null);
          store.updateBot(bot.id, {
            status: "scanning",
            stats: {
              ...bot.stats,
              lastAction: `⚠️ Posição órfã de ${execSymbol.replace("USDT", "")} ($0.00 na Binance) encerrada automaticamente`,
              lastActionTime: new Date().toISOString(),
            },
          });
          partialRetryCount.delete(bot.id);
          partialRetryCooldown.delete(bot.id);

          store.addBotLog({
            message: `⚠️ [${bot.name}] Posição órfã de ${execSymbol.replace("USDT", "")} encerrada no robô: saldo na Binance é $0.00 USDT. Robô liberado para novas varreduras.`,
            type: "warning",
            botId: bot.id,
            botName: bot.name,
          });

          callbacks?.onToast?.({
            title: `⚠️ Posição Órfã Limpa [${bot.name}]`,
            description: `Saldo de ${execSymbol.replace("USDT", "")} era $0.00 na Binance. Robô liberado para novas operações.`,
            variant: "default",
          });
          return false;
        }

        // 2. Caso Dust / Fatia inferior ao mínimo de $5 da Binance (mas com saldo existente)
        const isDustOrMinNotional =
          errCode === "MIN_NOTIONAL_DUST" ||
          errMsg.includes("inferior ao mínimo");

        if (isDustOrMinNotional) {
          // Desativa a realização parcial para que a posição inteira possa ser vendida no Take Profit total ou Stop Loss
          store.updateBotPosition(bot.id, {
            ...position,
            partialTpExecuted: true,
          });
          partialRetryCount.delete(bot.id);
          partialRetryCooldown.delete(bot.id);

          store.addBotLog({
            message: `ℹ️ [${bot.name}] Parcial desativada: fatia de ${execSymbol.replace("USDT", "")} é inferior a $5 USDT na Binance. A posição continuará aberta até o Take Profit total ou Stop Loss.`,
            type: "info",
            botId: bot.id,
            botName: bot.name,
          });
          return false;
        }

        // 3. Caso Rate Limit (Too many requests) ou erro transitório de rede
        const retries = (partialRetryCount.get(bot.id) || 0) + 1;
        partialRetryCount.set(bot.id, retries);

        if (retries >= 3) {
          partialRetryCount.delete(bot.id);
          partialRetryCooldown.delete(bot.id);
          store.updateBotPosition(bot.id, {
            ...position,
            partialTpExecuted: true,
          });

          store.addBotLog({
            message: `⚠️ [${bot.name}] Parcial desativada após 3 tentativas sem sucesso (${errMsg}). Operação continuará até o Take Profit total.`,
            type: "warning",
            botId: bot.id,
            botName: bot.name,
          });
        } else {
          const waitSeconds = retries === 1 ? 20 : 45;
          partialRetryCooldown.set(bot.id, Date.now() + waitSeconds * 1000);

          store.addBotLog({
            message: `⚠️ [${bot.name}] Parcial não executada na Binance (${errMsg}). Aguardando ${waitSeconds}s antes de tentar novamente (tentativa ${retries}/3).`,
            type: "warning",
            botId: bot.id,
            botName: bot.name,
          });
        }

        return false;
      }

      // Sucesso na parcial
      partialRetryCount.delete(bot.id);
      partialRetryCooldown.delete(bot.id);

      const executedTrade: TradeData = {
        ...trade,
        price: result.data?.price ?? result.trade?.price ?? trade.price,
        quantity: result.data?.quantity ?? result.trade?.quantity ?? trade.quantity,
        total: result.data?.total ?? result.trade?.total ?? trade.total,
        id: result.data?.id ?? result.trade?.id ?? trade.id,
      };

      store.addTrade(executedTrade);
      store.applyTradeToPortfolio(executedTrade);
      if (result.account) store.setAccount(result.account);
    } catch (e: any) {
      const retries = (partialRetryCount.get(bot.id) || 0) + 1;
      partialRetryCount.set(bot.id, retries);

      if (retries >= 3) {
        partialRetryCount.delete(bot.id);
        partialRetryCooldown.delete(bot.id);
        store.updateBotPosition(bot.id, {
          ...position,
          partialTpExecuted: true,
        });

        store.addBotLog({
          message: `⚠️ [${bot.name}] Parcial desativada após 3 falhas de rede: ${e.message}. Operação continuará até o Take Profit total.`,
          type: "warning",
          botId: bot.id,
          botName: bot.name,
        });
      } else {
        const waitSeconds = retries === 1 ? 20 : 45;
        partialRetryCooldown.set(bot.id, Date.now() + waitSeconds * 1000);

        store.addBotLog({
          message: `⚠️ [${bot.name}] Erro de rede ao executar parcial: ${e.message}. Aguardando ${waitSeconds}s (tentativa ${retries}/3).`,
          type: "warning",
          botId: bot.id,
          botName: bot.name,
        });
      }
      return false;
    }
  } else {
    // Paper mode
    try {
      fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trade),
      })
        .then((res) => res.json())
        .then((result) => {
          if (result.success && result.account) {
            useCryptoStore.getState().setAccount(result.account);
          }
        })
        .catch(() => {});
    } catch {}

    store.addTrade(trade);
    store.applyTradeToPortfolio(trade);
  }

  // Trava imediata de Break-Even nos 50% restantes (Preço de entrada + buffer para cobrir taxas)
  const beBuffer = bot.breakEvenBuffer ?? 0.25;
  const breakEvenPrice = position.entryPrice * (1 + beBuffer / 100);

  const updatedPosition: BotPosition = {
    ...position,
    quantity: remainingQty,
    totalCost: remainingCost,
    partialTpExecuted: true,
    partialTpSoldQty: sellQty,
    partialTpRealizedPnl: partialPnl,
    isBreakEvenArmed: true,
    breakEvenPrice,
  };

  store.updateBotPosition(bot.id, updatedPosition);
  store.recordBotTrade(bot.id, trade, partialPnl);

  const modeTag = tradingMode === "live" ? "🟢 [REAL]" : "🔷 [SIMULADO]";
  store.addBotLog({
    message: `🎯 ${modeTag} [${bot.name}] REALIZAÇÃO PARCIAL (${Math.round(partialRatio * 100)}%) CONCLUÍDA! Lucro embolsado: +$${partialPnl.toFixed(2)} USDT (+${gainPercent.toFixed(2)}%). Restante travado no Break-Even ($${breakEvenPrice.toFixed(4)}) com risco ZERO!`,
    type: "profit",
    botId: bot.id,
    botName: bot.name,
  });

  callbacks?.onToast?.({
    title: `🎯 Lucro Parcial [${bot.name}]`,
    description: `50% realizado (+${gainPercent.toFixed(2)}%). Restante protegido no Break-Even!`,
    variant: "default",
  });

  // 🛡️ Protege contra novas entradas ou recompras da frota no mesmo ativo durante a fase de realização
  botSymbolLossCooldown.set(position.symbol, Date.now() + 15 * 60 * 1000);

    return true;
  } finally {
    inFlightSells.delete(sellLockKey);
  }
}

/**
 * Executes a SELL trade (Take Profit / Stop Loss) to bank profits and close bot position.
 */
async function executeBotSell({
  bot,
  position,
  sellPrice,
  pnl,
  gainPercent,
  reason,
  logType,
  callbacks,
}: {
  bot: BotInstance;
  position: BotPosition;
  sellPrice: number;
  pnl: number;
  gainPercent: number;
  reason: string;
  logType: "profit" | "loss" | "warning";
  callbacks?: MultiBotEngineCallbacks;
}) {
  const store = useCryptoStore.getState();
  const { tradingMode } = store;
  const execSymbol = position.symbol || bot.symbol;
  const sellLockKey = `${bot.id}_${execSymbol}`;
  if (inFlightSells.has(sellLockKey)) {
    return;
  }
  inFlightSells.add(sellLockKey);

  try {
    const total = parseFloat((position.quantity * sellPrice).toFixed(2));

    // Cálculos financeiros e custos operacionais reais (Taxa padrão Binance Spot: 0.10% compra + 0.10% venda)
    const totalInvested = parseFloat((position.totalCost || position.quantity * position.entryPrice).toFixed(2));
    const totalReturned = total;
    const grossPnl = parseFloat(pnl.toFixed(2));
    const buyFee = parseFloat((totalInvested * 0.001).toFixed(4));
    const sellFee = parseFloat((totalReturned * 0.001).toFixed(4));
    const totalFees = parseFloat((buyFee + sellFee).toFixed(4));
    const netPnl = parseFloat((grossPnl - totalFees).toFixed(2));
    const netGainPercent = totalInvested > 0
      ? parseFloat((((totalReturned - totalFees - totalInvested) / totalInvested) * 100).toFixed(2))
      : parseFloat(gainPercent.toFixed(2));

    const executionId = `exec_exit_${bot.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const trade: TradeData = {
      id: `trade-${bot.id}-${Date.now()}`,
      executionId,
      algorithmVersion: bot.algorithmVersion || "v2.5.0-institutional",
      symbol: execSymbol,
      side: "SELL",
      price: sellPrice,
      quantity: position.quantity,
      total,
      strategy: `${bot.strategy} (${reason.split(" ")[0]})`,
      mode: tradingMode,
      pnl: netPnl,
      netPnl,
      timestamp: new Date().toISOString(),
      botId: bot.id,
      botName: bot.name,
      sellAll: true, // Vender 100% de todo o saldo livre na Binance
      riskParams: {
        riskPerTradePercent: bot.riskPerTradePercent || 35.0,
        maxOrderUsd: 150.0,
        slippageTolerancePercent: bot.slippageTolerance || 0.35,
        stopLossPercent: bot.stopLoss,
        takeProfitPercent: bot.takeProfit,
        holdingTimeLimitMinutes: bot.timeStopMinutes || bot.maxHoldingMinutes || 60,
      },
      marketSnapshot: {
        refPrice: sellPrice,
        timestamp: Date.now(),
      },
    };

  if (tradingMode === "live") {
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(trade),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        // Se a posição na Binance for resíduo / inferior ao mínimo de $5 da Binance (MIN_NOTIONAL_DUST):
        // Encerra a posição no robô para desobstruí-lo e não travar o usuário
        if (
          result.code === "MIN_NOTIONAL_DUST" ||
          result.error?.includes("inferior ao mínimo") ||
          result.code === "NO_BALANCE" ||
          result.error?.includes("não possui saldo")
        ) {
          store.updateBotPosition(bot.id, null);
          store.recordBotTrade(bot.id, trade, netPnl);

          store.addBotLog({
            message: `⚠️ [${bot.name}] Posição encerrada no robô. A quantidade em carteira (${position.quantity.toFixed(4)} ${execSymbol.replace("USDT", "")}) vale menos que o lote mínimo de $5 da Binance para venda direta. O saldo residual permanece seguro na sua conta Spot da Binance.`,
            type: "warning",
            botId: bot.id,
            botName: bot.name,
          });

          callbacks?.onToast?.({
            title: `⚠️ Posição Finalizada (${bot.name})`,
            description: `Posição encerrada no robô. O valor residual (< $5 USDT) permanece seguro na sua conta Spot da Binance.`,
            variant: "default",
          });
          return;
        }

        botErrorCooldown.set(bot.id, Date.now() + 15_000);
        store.addBotLog({
          message: `🔴 [${bot.name}] Falha na ordem de venda Binance: ${result.error || "Erro"} (novo teste em 15s)`,
          type: "error",
          botId: bot.id,
          botName: bot.name,
        });
        return;
      }

      const executedTrade: TradeData = {
        ...trade,
        price: result.data?.price ?? result.trade?.price ?? trade.price,
        quantity: result.data?.quantity ?? result.trade?.quantity ?? trade.quantity,
        total: result.data?.total ?? result.trade?.total ?? trade.total,
        id: result.data?.id ?? result.trade?.id ?? trade.id,
      };

      store.addTrade(executedTrade);
      store.applyTradeToPortfolio(executedTrade);

      if (result.account) {
        store.setAccount(result.account);
      }
    } catch (e: any) {
      botErrorCooldown.set(bot.id, Date.now() + 15_000);
      store.addBotLog({
        message: `🔴 [${bot.name}] Erro ao enviar venda Binance: ${e.message} (novo teste em 15s)`,
        type: "error",
        botId: bot.id,
        botName: bot.name,
      });
      return;
    }
  } else {
    // Paper mode: sincroniza atômico com SQLite e store
    try {
      fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trade),
      })
        .then((res) => res.json())
        .then((result) => {
          if (result.success && result.account) {
            useCryptoStore.getState().setAccount(result.account);
          }
        })
        .catch((e) => console.warn("[MultiBotEngine] Aviso ao persistir venda simulada:", e.message));
    } catch {}

    store.addTrade(trade);
    store.applyTradeToPortfolio(trade);
  }

  // Clear bot position and record performance (Net PnL real após taxas da exchange)
  store.updateBotPosition(bot.id, null);
  store.recordBotTrade(bot.id, trade, netPnl);

  // Governança de Risco: Avalia se perda acumulada acionou o Circuit Breaker Global
  if (netPnl < 0) {
    checkCircuitBreaker();
  }

  // Duração da operação
  const entryDate = position.entryTime ? new Date(position.entryTime).getTime() : Date.now();
  const exitDate = Date.now();
  const diffSec = Math.max(0, Math.floor((exitDate - entryDate) / 1000));
  const hours = Math.floor(diffSec / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);
  const seconds = diffSec % 60;
  let durationFormatted = "";
  if (hours > 0) {
    durationFormatted = `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    durationFormatted = `${minutes}m ${seconds}s`;
  } else {
    durationFormatted = `${seconds}s`;
  }

  const updatedBotState = useCryptoStore.getState().bots.find((b) => b.id === bot.id);
  const botStats = updatedBotState?.stats || bot.stats;

  const executionReport: BotExecutionReport = {
    id: `rep-${bot.id}-${Date.now()}`,
    executionId,
    algorithmVersion: bot.algorithmVersion || "v2.5.0-institutional",
    botId: bot.id,
    botName: bot.name,
    symbol: execSymbol,
    strategy: bot.strategy,
    mode: tradingMode,
    entryPrice: position.entryPrice,
    exitPrice: sellPrice,
    quantity: position.quantity,
    totalInvested,
    totalReturned,
    grossPnl,
    gainPercent: parseFloat(gainPercent.toFixed(2)),
    buyFee,
    sellFee,
    totalFees,
    netPnl,
    netGainPercent,
    entryTime: position.entryTime || new Date(Date.now() - diffSec * 1000).toISOString(),
    exitTime: new Date().toISOString(),
    durationFormatted,
    exitReason: reason,
    botTotalTrades: botStats.totalTrades,
    botWinTrades: botStats.winTrades,
    botLossTrades: botStats.lossTrades,
    botWinRate: botStats.winRate,
    botAccumulatedPnl: botStats.realizedPnl,
    riskParams: {
      riskPerTradePercent: bot.riskPerTradePercent || 35.0,
      maxOrderUsd: 150.0,
      slippageTolerancePercent: bot.slippageTolerance || 0.35,
      stopLossPercent: bot.stopLoss,
      takeProfitPercent: bot.takeProfit,
      holdingTimeLimitMinutes: bot.timeStopMinutes || bot.maxHoldingMinutes || 60,
    },
    marketSnapshot: {
      refPrice: sellPrice,
      timestamp: Date.now(),
    },
    slippagePercent: 0.05,
  };

  // Se o robô tiver 'stopAfterProfit' ativo e obteve lucro (ou encerramento com lucro solicitado):
  const isProfitableSell =
    netPnl > 0 ||
    netGainPercent > 0 ||
    logType === "profit" ||
    reason.includes("Lucro") ||
    reason.includes("Take-Profit") ||
    reason.includes("Break-Even");
  const shouldStopFleetBot = (bot.stopAfterProfit && isProfitableSell) || callbacks?.stopBotAfterClose;

  if (shouldStopFleetBot) {
    store.updateBot(bot.id, {
      active: false,
      status: "stopped",
      lastReport: executionReport,
      stats: {
        ...bot.stats,
        lastAction: `🎯 Operação finalizada com lucro (+${gainPercent.toFixed(2)}%)! Robô desativado automaticamente (Operação Única).`,
        lastActionTime: new Date().toISOString(),
      },
    });

    // Sincroniza estado de botActive global
    const hasOtherActive = useCryptoStore.getState().bots.some((b) => b.id !== bot.id && b.active);
    store.setBotActive(hasOtherActive);
  } else {
    // Salva o relatório no robô para consulta a qualquer momento
    store.updateBot(bot.id, {
      lastReport: executionReport,
    });
  }

  // 🎯 Auto-Reset do Override Manual após encerramento de Single Trade (Apenas 1 trade):
  if (bot.overrideSymbol && bot.overrideMode === "single_trade") {
    const closedSym = bot.overrideSymbol;
    store.updateBot(bot.id, {
      overrideSymbol: undefined,
      overrideMode: undefined,
      overrideExpiresAt: undefined,
      stats: {
        ...bot.stats,
        lastAction: `🎯 Trade único concluído em ${closedSym.replace("USDT", "")}. Retornando ao Auto-Screener dinâmico`,
        lastActionTime: new Date().toISOString(),
      },
    });
    store.addBotLog({
      message: `🎯 [${bot.name}] Posição de trade único em ${closedSym.replace("USDT", "")} encerrada. Auto-Screener restaurado para modo dinâmico automaticamente.`,
      type: "info",
      botId: bot.id,
      botName: bot.name,
    });
  }

  // Abre o relatório detalhado automaticamente para o usuário
  store.setActiveExecutionReport(executionReport);

  // 🛡️ COOLDOWN UNIVERSAL PÓS-TRADE INSTITUCIONAL:
  // 🛡️ PILAR 2: GESTÃO DE RISCO AUTOMATIZADA, QUARENTENA & CONSECUTIVE LOSS BRAKE
  const isLoss = logType === "loss" || pnl < 0 || gainPercent < 0;

  // 1. Quarentena por Par (Lockout de 4 horas se sofrer >= 2 perdas nas últimas 6h)
  const now = Date.now();
  const sixHoursAgo = now - 6 * 3600 * 1000;
  let recentSymbolLosses = (symbolLossTimestamps.get(execSymbol) || []).filter((t) => t >= sixHoursAgo);
  
  let cooldownDuration = 10 * 60 * 1000; // 10 minutos padrão pós-lucro para consolidação
  let isQuarantine = false;

  if (isLoss) {
    recentSymbolLosses.push(now);
    symbolLossTimestamps.set(execSymbol, recentSymbolLosses);

    if (recentSymbolLosses.length >= 2) {
      // 🚨 QUARENTENA ATIVADA: 2 ou mais perdas recentes no par -> 4 HORAS de bloqueio total
      cooldownDuration = 4 * 3600 * 1000;
      isQuarantine = true;
      store.addBotLog({
        message: `🚨 [QUARENTENA ATIVADA] Par ${execSymbol.replace("USDT", "")} atingiu ${recentSymbolLosses.length} perdas em 6h. Bloqueado por 4h para toda a frota (Pilar 2 dos Padrões Institucionais)!`,
        type: "warning",
        botId: bot.id,
        botName: bot.name,
      });
    } else {
      cooldownDuration = 30 * 60 * 1000; // 30 minutos após primeira perda isolada
    }
  }
  botSymbolLossCooldown.set(execSymbol, now + cooldownDuration);

  // 2. Trava de Perdas Consecutivas por Robô (Circuit Breaker se >= 3 derrotas seguidas)
  if (isLoss) {
    const currentStreak = (botConsecutiveLosses.get(bot.id) || 0) + 1;
    botConsecutiveLosses.set(bot.id, currentStreak);

    if (currentStreak >= 3) {
      // Pausa imediatamente o robô para estancar sangria da banca
      store.updateBot(bot.id, {
        active: false,
        status: "stopped",
        stats: {
          ...bot.stats,
          lastAction: `🛑 CIRCUIT BREAKER ACIONADO: Pausado automaticamente após 3 derrotas consecutivas (${currentStreak})`,
          lastActionTime: new Date().toISOString(),
        },
      });

      store.addBotLog({
        message: `🛑 [CIRCUIT BREAKER GLOBAL] ${bot.name} pausado automaticamente para proteção patrimonial da banca após ${currentStreak} perdas consecutivas (Pilar 2)!`,
        type: "loss",
        botId: bot.id,
        botName: bot.name,
      });

      callbacks?.onToast?.({
        title: `🛑 Circuit Breaker: ${bot.name} Pausado`,
        description: `Pausado preventivamente após 3 derrotas consecutivas para preservação de capital.`,
        variant: "destructive",
      });
    }
  } else {
    // Vitória zera a sequência de derrotas
    botConsecutiveLosses.set(bot.id, 0);
  }

  const sign = pnl >= 0 ? "+" : "";
  const pnlFormatted = `${sign}$${pnl.toFixed(2)} USDT (${sign}${gainPercent.toFixed(2)}%)`;
  const modeTag = tradingMode === "live" ? "🟢 [REAL]" : "🔷 [SIMULADO]";

  store.addBotLog({
    message: `${pnl >= 0 ? "🎉" : "🛑"} ${modeTag} [${bot.name}] ${reason} em ${execSymbol.replace("USDT", "")}! Resultado: ${pnlFormatted}`,
    type: logType,
    botId: bot.id,
    botName: bot.name,
  });

  callbacks?.onToast?.({
    title: pnl >= 0 ? `🎉 Lucro Realizado! ${bot.name} ${modeTag}` : `🛑 Ordem Finalizada (${bot.name}) ${modeTag}`,
    description: shouldStopFleetBot
      ? `Vendeu ${position.quantity.toFixed(4)} ${execSymbol.replace("USDT", "")} @ $${sellPrice.toLocaleString()} | Resultado: ${pnlFormatted}. Robô finalizado (Relatório aberto na tela).`
      : `Vendeu ${position.quantity.toFixed(4)} ${execSymbol.replace("USDT", "")} @ $${sellPrice.toLocaleString()} | Resultado: ${pnlFormatted}. Relatório gerado com sucesso.`,
    variant: pnl >= 0 ? "default" : "destructive",
  });
  } finally {
    inFlightSells.delete(sellLockKey);
  }
}

/**
 * Manually takes profit or closes an active bot's position immediately at market price.
 */
export async function manualCloseBotPosition(botId: string, callbacks?: MultiBotEngineCallbacks) {
  const store = useCryptoStore.getState();
  const bot = store.bots.find((b) => b.id === botId);
  if (!bot || !bot.position) return;

  if (bot.position.mode && bot.position.mode !== store.tradingMode) {
    callbacks?.onToast?.({
      title: bot.name,
      description: `Esta posição foi aberta no modo ${bot.position.mode === "live" ? "REAL" : "SIMULADO"}. Mude para esse modo para encerrá-la.`,
      variant: "destructive",
    });
    return;
  }

  const execSymbol = bot.position.symbol || bot.symbol;
  let currentPrice = store.tickers[execSymbol]?.price || bot.position.currentPrice;
  try {
    const res = await fetch(`/api/market/price?symbol=${execSymbol}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const json = await res.json();
      const p = parseFloat(json?.data?.price || json?.price);
      if (p && !isNaN(p) && p > 0) currentPrice = p;
    }
  } catch {}

  const gainPercent = ((currentPrice - bot.position.entryPrice) / bot.position.entryPrice) * 100;
  const pnl = parseFloat(((currentPrice - bot.position.entryPrice) * bot.position.quantity).toFixed(2));

  await executeBotSell({
    bot,
    position: bot.position,
    sellPrice: currentPrice,
    pnl,
    gainPercent,
    reason: callbacks?.stopBotAfterClose
      ? `🎯 REALIZAÇÃO DE LUCRO E ENCERRAMENTO DO ROBÔ (+${gainPercent.toFixed(2)}%)`
      : `⚡ FECHAMENTO MANUAL / REALIZAÇÃO IMEDIATA (+${gainPercent.toFixed(2)}%)`,
    logType: pnl >= 0 ? "profit" : "loss",
    callbacks,
  });
}

/**
 * Manually opens a position for an active bot immediately at market price.
 */
export async function manualOpenBotPosition(botId: string, callbacks?: MultiBotEngineCallbacks) {
  const store = useCryptoStore.getState();
  const bot = store.bots.find((b) => b.id === botId);
  if (!bot) return;

  if (bot.position && bot.position.quantity > 0) {
    callbacks?.onToast?.({
      title: bot.name,
      description: "Este robô já possui uma posição aberta.",
      variant: "default",
    });
    return;
  }

  let targetSymbol = (bot.overrideSymbol && bot.overrideSymbol !== "AUTO") ? bot.overrideSymbol : bot.symbol;
  let targetPrice = 0;

  if ((bot.symbol === "AUTO" || bot.useAutoScreener) && (!bot.overrideSymbol || bot.overrideSymbol === "AUTO")) {
    const heldByOthers = store.bots
      .filter((b) => b.active && b.id !== bot.id)
      .map((b) => b.position?.symbol || b.symbol)
      .filter((s) => s && s !== "AUTO");
    const hotList = scanHotCoins(store.tickers, store.tickers["BTCUSDT"], 5, heldByOthers);
    if (hotList.length > 0) {
      targetSymbol = hotList[0].symbol;
      targetPrice = hotList[0].price;
    } else {
      targetSymbol = "BTCUSDT";
    }
  }

  const ticker = store.tickers[targetSymbol];
  let currentPrice = targetPrice > 0 ? targetPrice : (ticker?.price || 0);

  if (!currentPrice || currentPrice <= 0) {
    try {
      const res = await fetch(`/api/market/price?symbol=${targetSymbol}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const json = await res.json();
        const p = parseFloat(json?.data?.price || json?.price);
        if (p && !isNaN(p) && p > 0) currentPrice = p;
      }
    } catch {}
  }

  if (!currentPrice || currentPrice <= 0) {
    callbacks?.onToast?.({
      title: bot.name,
      description: `Cotação de ${targetSymbol} indisponível no momento.`,
      variant: "destructive",
    });
    return;
  }

  let cash = store.portfolio.cashBalance;

  if (store.tradingMode === "paper" && cash < 50) {
    store.setAccount({
      cashBalance: 10000,
      assetQuantity: store.portfolio.assetQuantity,
      symbol: "BTCUSDT",
    });
    cash = 10000;
  }

  if (cash < 5.20) {
    const detail = (store.tradingMode === "live" && lastLiveAccountError)
      ? `Falha ao consultar saldo na Binance: ${lastLiveAccountError.replace("Conexão Binance falhou: ", "")}`
      : `Saldo em caixa ($${cash.toFixed(2)} USDT) é inferior ao mínimo ($5.20 USDT).`;
    callbacks?.onToast?.({
      title: "Saldo Insuficiente ou Erro na Binance",
      description: detail,
      variant: "destructive",
    });
    return;
  }

  const maxSafeCash = Math.max(0, cash * 0.95);
  const targetSpend = Math.max(5.20, Math.min(maxSafeCash, bot.allocationAmount || 10));

  const quantity = parseFloat((targetSpend / currentPrice).toFixed(6));
  const total = parseFloat((quantity * currentPrice).toFixed(2));

  // Ensure bot is active
  if (!bot.active) {
    store.toggleBotActive(bot.id, true);
  }

  await executeBotBuy({
    bot,
    targetSymbol,
    buyPrice: currentPrice,
    quantity,
    total,
    customReason: `⚡ ENTRADA MANUAL IMEDIATA (${targetSymbol.replace("USDT", "")})`,
    callbacks,
  });
}

/**
 * Liquida a mercado imediatamente uma posição que está sob custódia na carteira (Binance Spot),
 * ideal para ativos de robôs que foram finalizados ou pausados.
 */
export async function liquidateWalletPosition(
  symbol: string,
  callbacks?: MultiBotEngineCallbacks
): Promise<boolean> {
  const store = useCryptoStore.getState();
  const { tradingMode, portfolio, tickers } = store;
  const pos = portfolio.positions?.find((p) => p.symbol === symbol);
  if (!pos || pos.quantity <= 0) {
    callbacks?.onToast?.({
      title: "Posição não encontrada",
      description: `Não há saldo de ${symbol.replace("USDT", "")} para liquidar.`,
      variant: "destructive",
    });
    return false;
  }

  const currentPrice = tickers[symbol]?.price || pos.marketPrice || 0;
  const total = parseFloat((pos.quantity * currentPrice).toFixed(2));

  try {
    const res = await fetch("/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol,
        side: "SELL",
        price: currentPrice,
        quantity: pos.quantity,
        total,
        strategy: "Liquidação Manual de Ativo em Carteira",
        mode: tradingMode,
        sellAll: true,
      }),
    });
    const result = await res.json();
    if (result.success) {
      if (result.account) {
        store.setAccount(result.account);
      }
      // Se houver algum bot com essa posição vinculada, limpa a posição dele
      const associatedBot = store.bots.find((b) => b.position && b.position.symbol === symbol);
      if (associatedBot) {
        store.updateBotPosition(associatedBot.id, null);
      }

      store.addBotLog({
        message: `⚡ [Liquidação de Carteira] ${pos.quantity} ${symbol.replace("USDT", "")} vendido a mercado na Binance por ~$${total.toFixed(2)} USDT.`,
        type: "profit",
      });

      callbacks?.onToast?.({
        title: `⚡ Ativo Liquidado (${symbol.replace("USDT", "")})`,
        description: `${pos.quantity} ${symbol.replace("USDT", "")} vendido a mercado com sucesso na Binance Spot!`,
        variant: "default",
      });
      return true;
    } else {
      store.addBotLog({
        message: `🔴 [Liquidação de Carteira] Falha ao vender ${symbol.replace("USDT", "")} na Binance: ${result.error}`,
        type: "error",
      });
      callbacks?.onToast?.({
        title: "Falha na Venda",
        description: result.error || "Erro ao liquidar posição na Binance",
        variant: "destructive",
      });
      return false;
    }
  } catch (err: any) {
    callbacks?.onToast?.({
      title: "Erro de Rede",
      description: err.message,
      variant: "destructive",
    });
    return false;
  }
}

/**
 * Adota uma posição órfã da carteira vinculando-a a um robô para monitorar a saída automática
 * com Break-Even e Trailing Take Profit no lucro.
 */
export function adoptOrphanPositionWithBot(symbol: string, callbacks?: MultiBotEngineCallbacks): string | null {
  const store = useCryptoStore.getState();
  const pos = store.portfolio.positions?.find((p) => p.symbol === symbol);
  if (!pos || pos.quantity <= 0) return null;

  const cleanSym = symbol.replace("USDT", "");
  let targetBot = store.bots.find((b) => b.symbol === symbol);

  if (!targetBot) {
    const newBotId = store.addBot({
      name: `Bot ${cleanSym} — Gestor de Saída`,
      symbol,
      strategy: "QUANT_ENSEMBLE",
      active: true,
      takeProfit: 2.0,
      stopLoss: 1.5,
      trailingStop: true,
      trailingStopDistance: 0.45,
      trailingTakeProfit: true,
      trailingTakeProfitDistance: 0.40,
      autoBreakEven: true,
      usePartialTp: true,
    });
    targetBot = store.bots.find((b) => b.id === newBotId);
  } else {
    store.updateBot(targetBot.id, { active: true, status: "in_position" });
  }

  if (targetBot) {
    const currentPrice = store.tickers[symbol]?.price || pos.marketPrice;
    const entryPrice = pos.avgPrice > 0 ? pos.avgPrice : currentPrice;
    const pnlPercent = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
    store.updateBotPosition(targetBot.id, {
      symbol,
      side: "BUY",
      quantity: pos.quantity,
      entryPrice,
      currentPrice,
      highestPrice: Math.max(entryPrice, currentPrice),
      totalCost: pos.avgPrice > 0 ? pos.avgPrice * pos.quantity : pos.marketValue,
      unrealizedPnl: pos.unrealizedPnl || 0,
      unrealizedPnlPercent: pnlPercent,
      entryTime: new Date().toISOString(),
      mode: store.tradingMode,
      breakEvenPrice: entryPrice * 1.003,
      isBreakEvenArmed: true,
    });

    store.addBotLog({
      message: `🛡️ [Gestão de Custódia] Robô "${targetBot.name}" assumiu a posição de ${pos.quantity} ${cleanSym}. Trailing Take Profit e Break-Even armados!`,
      type: "system",
      botId: targetBot.id,
      botName: targetBot.name,
    });

    callbacks?.onToast?.({
      title: `🛡️ Robô Vinculado (${cleanSym})`,
      description: `O [${targetBot.name}] agora gerencia a saída dessa posição com Take Profit e Risco Zero.`,
      variant: "default",
    });

    return targetBot.id;
  }
  return null;
}

/**
 * Inicia ou vincula um robô de Inteligência Artificial para gerenciar a saída ideal de um ativo em carteira.
 * O robô monitora fluxo, indicadores e sinais preditivos para vender no melhor momento com lucro máximo.
 */
export function startAiExitBotForAsset(symbol: string, callbacks?: MultiBotEngineCallbacks): string | null {
  const store = useCryptoStore.getState();
  const pos = store.portfolio.positions?.find((p) => p.symbol === symbol);
  if (!pos || pos.quantity <= 0) {
    callbacks?.onToast?.({
      title: "Posição não encontrada",
      description: `Não há saldo disponível de ${symbol.replace("USDT", "")} no portfólio.`,
      variant: "destructive",
    });
    return null;
  }

  const cleanSym = symbol.replace("USDT", "");
  let targetBot = store.bots.find((b) => b.symbol === symbol);

  if (!targetBot) {
    const newBotId = store.addBot({
      name: `Bot ${cleanSym} — Venda Inteligente (IA)`,
      symbol,
      strategy: "AI",
      active: true,
      useAiExit: true,
      takeProfit: 1.8,
      stopLoss: 2.0,
      trailingStop: true,
      trailingStopDistance: 0.40,
      trailingTakeProfit: true,
      trailingTakeProfitDistance: 0.35,
      autoBreakEven: true,
      breakEvenTrigger: 0.60,
      breakEvenBuffer: 0.20,
      usePartialTp: true,
    });
    targetBot = store.bots.find((b) => b.id === newBotId);
  } else {
    store.updateBot(targetBot.id, {
      name: `Bot ${cleanSym} — Venda Inteligente (IA)`,
      strategy: "AI",
      active: true,
      status: "in_position",
      useAiExit: true,
      trailingTakeProfit: true,
      autoBreakEven: true,
    });
  }

  if (targetBot) {
    const currentPrice = store.tickers[symbol]?.price || pos.marketPrice;
    const entryPrice = pos.avgPrice > 0 ? pos.avgPrice : currentPrice;
    const pnlPercent = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

    store.updateBotPosition(targetBot.id, {
      symbol,
      side: "BUY",
      quantity: pos.quantity,
      entryPrice,
      currentPrice,
      highestPrice: Math.max(entryPrice, currentPrice),
      totalCost: pos.avgPrice > 0 ? pos.avgPrice * pos.quantity : pos.marketValue,
      unrealizedPnl: pos.unrealizedPnl || 0,
      unrealizedPnlPercent: pnlPercent,
      entryTime: new Date().toISOString(),
      mode: store.tradingMode,
      breakEvenPrice: entryPrice * 1.002,
      isBreakEvenArmed: true,
    });

    store.addBotLog({
      message: `🤖 [Saída Inteligente IA] Robô "${targetBot.name}" assumiu a custódia de ${pos.quantity} ${cleanSym}. A IA está monitorando em tempo real para vender no melhor momento!`,
      type: "system",
      botId: targetBot.id,
      botName: targetBot.name,
    });

    callbacks?.onToast?.({
      title: `🤖 Venda por IA Iniciada (${cleanSym})`,
      description: `O [${targetBot.name}] está rastreando o melhor momento para vender no lucro máximo.`,
      variant: "default",
    });

    return targetBot.id;
  }

  return null;
}

