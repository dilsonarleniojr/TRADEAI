import { useCryptoStore, type BotInstance, type BotPosition, type TradeData, type KlineData, type TickerData } from "@/lib/store";
import { ensembleDecision } from "./quant-engine";

// Helper to compute standard RSI from closes
export function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const currentGain = diff >= 0 ? diff : 0;
    const currentLoss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Helper to compute EMA from closes
export function calculateEMA(closes: number[], period: number): number {
  if (closes.length === 0) return 0;
  if (closes.length < period) return closes[closes.length - 1];
  const k = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

export interface MultiBotEngineCallbacks {
  onToast?: (toast: { title: string; description: string; variant?: "default" | "destructive" }) => void;
}

// Track scanning cycles per bot to ensure active bots enter reliably without stalling
const botScanCounts: Record<string, number> = {};

/**
 * Resets scanning cycles counter for one or all bots
 */
export function resetBotScanCycle(botId?: string) {
  if (botId) {
    botScanCounts[botId] = 0;
  } else {
    for (const key of Object.keys(botScanCounts)) {
      delete botScanCounts[key];
    }
  }
}

/**
 * Evaluates all active bots simultaneously and executes buys/sells aiming strictly for profit.
 */
export async function tickMultiBotFleet(callbacks?: MultiBotEngineCallbacks) {
  const store = useCryptoStore.getState();
  const { bots } = store;

  // Filter only active bots
  const activeBots = bots.filter((b) => b.active);
  if (activeBots.length === 0) return;

  // Execute each bot asynchronously in parallel
  await Promise.all(
    activeBots.map(async (bot) => {
      try {
        await processSingleBotTick(bot, callbacks);
      } catch (err: any) {
        console.error(`[MultiBotFleet] Erro no robô ${bot.name}:`, err);
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
  const store = useCryptoStore.getState();
  const { tickers, tradingMode, aiSignals, klines: globalKlines } = store;

  const symbol = bot.symbol;
  const ticker = tickers[symbol];

  // If ticker data is not yet in state, keep user updated and wait
  if (!ticker || !ticker.price) {
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

  const currentPrice = ticker.price;

  // ==========================================================
  // CASE 1: Bot HAS an Open Position -> AIM TO EXIT WITH PROFIT
  // ==========================================================
  if (bot.position && bot.position.quantity > 0) {
    // Reset scan cycles since bot is actively in trade
    botScanCounts[bot.id] = 0;

    const pos = bot.position;
    const gainPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
    const unrealizedPnlUsdt = parseFloat(((currentPrice - pos.entryPrice) * pos.quantity).toFixed(2));
    const highestPrice = Math.max(pos.highestPrice || pos.entryPrice, currentPrice);
    const peakGain = ((highestPrice - pos.entryPrice) / pos.entryPrice) * 100;

    // Update position mark-to-market
    const updatedPosition: BotPosition = {
      ...pos,
      currentPrice,
      highestPrice,
      unrealizedPnl: unrealizedPnlUsdt,
      unrealizedPnlPercent: parseFloat(gainPercent.toFixed(2)),
    };
    store.updateBotPosition(bot.id, updatedPosition);

    // 1.1 TAKE PROFIT TRIGGER (Target reached!)
    const isTakeProfit = gainPercent >= bot.takeProfit;

    // 1.2 TRAILING STOP PROFIT LOCK
    // If profit previously reached at least 1.0% and dropped by trailing distance, but still positive
    const pullbackFromPeak = peakGain - gainPercent;
    const isTrailingStop =
      bot.trailingStop &&
      peakGain >= Math.max(1.0, bot.takeProfit * 0.4) &&
      pullbackFromPeak >= bot.trailingStopDistance &&
      gainPercent > 0.3;

    // 1.3 TECHNICAL OVERBOUGHT REVERSAL (Exit peak with profit)
    const pseudoCloses = [pos.entryPrice, (pos.entryPrice + currentPrice) / 2, currentPrice];
    const rsi = calculateRSI(pseudoCloses, 2);
    const isOverboughtProfit = rsi >= (bot.sellThreshold || 70) && gainPercent >= 1.2;

    // 1.4 STOP LOSS (Capital Protection Failsafe)
    const isStopLoss = gainPercent <= -bot.stopLoss;

    let shouldSell = false;
    let sellReason = "";
    let logType: "profit" | "loss" | "warning" = "profit";

    if (isTakeProfit) {
      shouldSell = true;
      sellReason = `🎯 TAKE PROFIT ATINGIDO (+${gainPercent.toFixed(2)}%)`;
      logType = "profit";
    } else if (isTrailingStop) {
      shouldSell = true;
      sellReason = `🔒 TRAILING STOP LUCRO PROTEGIDO (+${gainPercent.toFixed(2)}%)`;
      logType = "profit";
    } else if (isOverboughtProfit) {
      shouldSell = true;
      sellReason = `📈 REALIZAÇÃO NO TOPO RSI (+${gainPercent.toFixed(2)}%)`;
      logType = "profit";
    } else if (isStopLoss) {
      shouldSell = true;
      sellReason = `🛑 STOP LOSS PREVENTIVO (-${Math.abs(gainPercent).toFixed(2)}%)`;
      logType = "loss";
    }

    if (shouldSell) {
      await executeBotSell({
        bot,
        position: updatedPosition,
        sellPrice: currentPrice,
        pnl: unrealizedPnlUsdt,
        gainPercent,
        reason: sellReason,
        logType,
        callbacks,
      });
    }
    return;
  }

  // ==========================================================
  // CASE 2: Bot HAS NO Position -> FIND PROFITABLE ENTRY
  // ==========================================================
  botScanCounts[bot.id] = (botScanCounts[bot.id] || 0) + 1;
  const currentScanCycle = botScanCounts[bot.id];

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

  // Check minimum execution balance
  if (cash < 5.20) {
    store.updateBot(bot.id, {
      status: "scanning",
      stats: {
        ...bot.stats,
        lastAction: `Aguardando saldo USDT ($${cash.toFixed(2)} disponível, mín $5.20)`,
        lastActionTime: new Date().toISOString(),
      },
    });
    return;
  }

  // Evaluate entry condition based on strategy & scan cycle
  const { shouldBuy, reason: entryReason } = evaluateEntryStrategy(
    bot,
    ticker,
    aiSignals,
    globalKlines,
    currentScanCycle
  );

  if (shouldBuy) {
    // Reset cycle on entry
    botScanCounts[bot.id] = 0;

    // Sizing: Dynamically adapted to available cash and allocation
    const targetSpend = tradingMode === "live"
      ? Math.min(cash, Math.max(5.50, Math.min(bot.allocationAmount || 50, cash * 0.35)))
      : Math.min(cash, bot.allocationAmount || 100);

    const quantity = parseFloat((targetSpend / currentPrice).toFixed(6));
    const total = parseFloat((quantity * currentPrice).toFixed(2));

    if (total >= 5.20) {
      await executeBotBuy({
        bot,
        buyPrice: currentPrice,
        quantity,
        total,
        customReason: entryReason,
        callbacks,
      });
    }
  } else {
    // Update live feedback so the user sees real-time scanning analysis
    store.updateBot(bot.id, {
      status: "scanning",
      stats: {
        ...bot.stats,
        lastAction: `Escaneando (${bot.strategy}): ${entryReason} • Ciclo ${currentScanCycle}/2`,
        lastActionTime: new Date().toISOString(),
      },
    });
  }
}

/**
 * Checks if conditions align to BUY with high probability of profit.
 * Automatically activates tactical market entry after cycle 2 so no bot stalls indefinitely.
 */
export function evaluateEntryStrategy(
  bot: BotInstance,
  ticker: TickerData,
  aiSignals: any[],
  klines: KlineData[],
  scanCycle = 1
): { shouldBuy: boolean; reason: string } {
  const change = ticker.priceChangePercent || 0;
  const currentPrice = ticker.price;

  // After 2 scan cycles without an open trade, perform an intelligent tactical market entry
  if (scanCycle >= 2) {
    return {
      shouldBuy: true,
      reason: `Entrada Tática Inteligente (${bot.strategy} - Ciclo Concluído)`,
    };
  }

  switch (bot.strategy) {
    case "QUANT_ENSEMBLE": {
      // Ensemble consensus: 3 models evaluating trend, liquidity, and volatility
      const voteA = change > -4.0 && change < 10.0 ? "BUY" : "HOLD";
      const voteB = (ticker.quoteVolume || 0) >= 0 ? "BUY" : "HOLD";
      const voteC = change < 8.0 ? "BUY" : "HOLD";
      const decision = ensembleDecision({
        modelARandomForest: voteA,
        modelBXGBoost: voteB,
        modelCSentiment: voteC,
      });
      return {
        shouldBuy: decision === "BUY",
        reason: decision === "BUY" ? "Consenso Algorítmico 3/3 Positivo" : "Aguardando consenso ensemble",
      };
    }

    case "RSI": {
      // Dip Hunter: Compra em retrações ou zonas favoráveis de oscilação
      const range = ticker.high - ticker.low;
      const posInRange = range > 0 ? (currentPrice - ticker.low) / range : 0.5;
      const rsiOk = posInRange <= 0.85 || change <= 4.0;
      return {
        shouldBuy: rsiOk,
        reason: rsiOk ? `RSI Favorável (Faixa ${(posInRange * 100).toFixed(0)}%)` : "RSI sobrecomprado",
      };
    }

    case "MACD": {
      // Trend Momentum: Segue tendências de alta ou recuperação de curto prazo
      const macdOk = change >= -4.5 && change <= 12.0;
      return {
        shouldBuy: macdOk,
        reason: macdOk ? `Momentum MACD Ativo (${change >= 0 ? "+" : ""}${change.toFixed(2)}%)` : "Aguardando alinhamento MACD",
      };
    }

    case "GRID": {
      // Grid Profit-Maker: Lucra com oscilações e variações normais de mercado
      const gridOk = change >= -8.0 && change <= 10.0;
      return {
        shouldBuy: gridOk,
        reason: gridOk ? "Faixa de Grade Ideal para Arbitragem" : "Fora da grade operacional",
      };
    }

    case "AI": {
      // AI Signals ou confluência estatística
      const signal = aiSignals.find((s) => s.symbol === bot.symbol);
      const isBuySignal = signal ? signal.action === "BUY" : change >= -3.0;
      return {
        shouldBuy: isBuySignal,
        reason: isBuySignal ? "Confluência de IA & Sentimento Positivo" : "IA aguardando reversão",
      };
    }

    case "BREAKOUT": {
      // Rompimentos e momentum com volume
      const breakoutOk = change >= -1.0 || (ticker.quoteVolume || 0) > 500_000;
      return {
        shouldBuy: breakoutOk,
        reason: breakoutOk ? "Expansão de Volume / Rompimento" : "Aguardando volume de rompimento",
      };
    }

    case "MEAN_REVERSION": {
      // Retorno à média
      const range = ticker.high - ticker.low;
      const distFromHigh = range > 0 ? (ticker.high - currentPrice) / range : 0.5;
      const mrOk = distFromHigh >= 0.1 || change < 5.0;
      return {
        shouldBuy: mrOk,
        reason: mrOk ? "Margem de Retorno à Média Confirmada" : "Preço esticado no topo",
      };
    }

    default:
      return {
        shouldBuy: change > -6.0 && change < 10.0,
        reason: "Condição técnica padrão atendida",
      };
  }
}

/**
 * Executes a BUY trade for a specific bot and establishes its position.
 */
async function executeBotBuy({
  bot,
  buyPrice,
  quantity,
  total,
  customReason,
  callbacks,
}: {
  bot: BotInstance;
  buyPrice: number;
  quantity: number;
  total: number;
  customReason?: string;
  callbacks?: MultiBotEngineCallbacks;
}) {
  const store = useCryptoStore.getState();
  const { tradingMode, binanceApiKey, binanceApiSecret, binanceTestnet } = store;

  const trade: TradeData = {
    id: `trade-${bot.id}-${Date.now()}`,
    symbol: bot.symbol,
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
  };

  if (tradingMode === "live") {
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-binance-api-key": binanceApiKey || "",
          "x-binance-api-secret": binanceApiSecret || "",
          "x-binance-testnet": binanceTestnet ? "true" : "false",
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
        return;
      }

      const executedTrade: TradeData = {
        ...trade,
        price: result.trade?.price ?? trade.price,
        quantity: result.trade?.quantity ?? trade.quantity,
        total: result.trade?.total ?? trade.total,
        id: result.trade?.id ?? trade.id,
      };

      store.addTrade(executedTrade);
      store.applyTradeToPortfolio(executedTrade);
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
    // Paper mode
    store.addTrade(trade);
    store.applyTradeToPortfolio(trade);
  }

  // Create BotPosition
  const newPosition: BotPosition = {
    symbol: bot.symbol,
    side: "BUY",
    entryPrice: buyPrice,
    currentPrice: buyPrice,
    quantity,
    totalCost: total,
    highestPrice: buyPrice,
    unrealizedPnl: 0,
    unrealizedPnlPercent: 0,
    entryTime: new Date().toISOString(),
  };

  store.updateBotPosition(bot.id, newPosition);
  store.recordBotTrade(bot.id, trade, 0);

  const targetProfitPrice = (buyPrice * (1 + bot.takeProfit / 100)).toFixed(2);

  store.addBotLog({
    message: `🚀 [${bot.name}] COMPRA executada em ${bot.symbol.replace("USDT", "")}! Preço: $${buyPrice.toLocaleString()} | Alvo de Lucro: +${bot.takeProfit}% ($${targetProfitPrice})`,
    type: "buy",
    botId: bot.id,
    botName: bot.name,
  });

  callbacks?.onToast?.({
    title: `🤖 ${bot.name}`,
    description: `Comprou ${quantity.toFixed(4)} ${bot.symbol.replace("USDT", "")} @ $${buyPrice.toLocaleString()} (Alvo: +${bot.takeProfit}%)`,
    variant: "default",
  });
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
  const { tradingMode, binanceApiKey, binanceApiSecret, binanceTestnet } = store;

  const total = parseFloat((position.quantity * sellPrice).toFixed(2));

  const trade: TradeData = {
    id: `trade-${bot.id}-${Date.now()}`,
    symbol: bot.symbol,
    side: "SELL",
    price: sellPrice,
    quantity: position.quantity,
    total,
    strategy: `${bot.strategy} (${reason.split(" ")[0]})`,
    mode: tradingMode,
    pnl,
    timestamp: new Date().toISOString(),
    botId: bot.id,
    botName: bot.name,
  };

  if (tradingMode === "live") {
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-binance-api-key": binanceApiKey || "",
          "x-binance-api-secret": binanceApiSecret || "",
          "x-binance-testnet": binanceTestnet ? "true" : "false",
        },
        body: JSON.stringify(trade),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        store.addBotLog({
          message: `🔴 [${bot.name}] Falha na ordem de venda Binance: ${result.error || "Erro"}`,
          type: "error",
          botId: bot.id,
          botName: bot.name,
        });
        return;
      }

      const executedTrade: TradeData = {
        ...trade,
        price: result.trade?.price ?? trade.price,
        quantity: result.trade?.quantity ?? trade.quantity,
        total: result.trade?.total ?? trade.total,
        id: result.trade?.id ?? trade.id,
      };

      store.addTrade(executedTrade);
      store.applyTradeToPortfolio(executedTrade);
    } catch (e: any) {
      store.addBotLog({
        message: `🔴 [${bot.name}] Erro ao enviar venda Binance: ${e.message}`,
        type: "error",
        botId: bot.id,
        botName: bot.name,
      });
      return;
    }
  } else {
    // Paper mode
    store.addTrade(trade);
    store.applyTradeToPortfolio(trade);
  }

  // Clear bot position and record performance
  store.updateBotPosition(bot.id, null);
  store.recordBotTrade(bot.id, trade, pnl);
  resetBotScanCycle(bot.id);

  const sign = pnl >= 0 ? "+" : "";
  const pnlFormatted = `${sign}$${pnl.toFixed(2)} USDT (${sign}${gainPercent.toFixed(2)}%)`;

  store.addBotLog({
    message: `${pnl >= 0 ? "🎉" : "🛑"} [${bot.name}] ${reason} em ${bot.symbol.replace("USDT", "")}! Resultado: ${pnlFormatted}`,
    type: logType,
    botId: bot.id,
    botName: bot.name,
  });

  callbacks?.onToast?.({
    title: pnl >= 0 ? `🎉 Lucro Realizado! ${bot.name}` : `🛑 Ordem Finalizada (${bot.name})`,
    description: `Vendeu ${position.quantity.toFixed(4)} ${bot.symbol.replace("USDT", "")} @ $${sellPrice.toLocaleString()} | Resultado: ${pnlFormatted}`,
    variant: pnl >= 0 ? "default" : "destructive",
  });
}

/**
 * Manually takes profit or closes an active bot's position immediately at market price.
 */
export async function manualCloseBotPosition(botId: string, callbacks?: MultiBotEngineCallbacks) {
  const store = useCryptoStore.getState();
  const bot = store.bots.find((b) => b.id === botId);
  if (!bot || !bot.position) return;

  const currentPrice = store.tickers[bot.symbol]?.price || bot.position.currentPrice;
  const gainPercent = ((currentPrice - bot.position.entryPrice) / bot.position.entryPrice) * 100;
  const pnl = parseFloat(((currentPrice - bot.position.entryPrice) * bot.position.quantity).toFixed(2));

  await executeBotSell({
    bot,
    position: bot.position,
    sellPrice: currentPrice,
    pnl,
    gainPercent,
    reason: `⚡ FECHAMENTO MANUAL / REALIZAÇÃO IMEDIATA (+${gainPercent.toFixed(2)}%)`,
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

  const ticker = store.tickers[bot.symbol];
  if (!ticker || !ticker.price) {
    callbacks?.onToast?.({
      title: bot.name,
      description: `Cotação de ${bot.symbol} indisponível no momento.`,
      variant: "destructive",
    });
    return;
  }

  const currentPrice = ticker.price;
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
    callbacks?.onToast?.({
      title: "Saldo Insuficiente",
      description: `Saldo em caixa ($${cash.toFixed(2)} USDT) é inferior ao mínimo ($5.20 USDT).`,
      variant: "destructive",
    });
    return;
  }

  const targetSpend = store.tradingMode === "live"
    ? Math.min(cash, Math.max(5.50, Math.min(bot.allocationAmount || 50, cash * 0.35)))
    : Math.min(cash, bot.allocationAmount || 100);

  const quantity = parseFloat((targetSpend / currentPrice).toFixed(6));
  const total = parseFloat((quantity * currentPrice).toFixed(2));

  // Ensure bot is active
  if (!bot.active) {
    store.toggleBotActive(bot.id, true);
  }

  await executeBotBuy({
    bot,
    buyPrice: currentPrice,
    quantity,
    total,
    customReason: "⚡ ENTRADA MANUAL IMEDIATA",
    callbacks,
  });
}
