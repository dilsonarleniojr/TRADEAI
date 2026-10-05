import { useCryptoStore, type BotInstance, type BotPosition, type TradeData } from "@/lib/store";
import { calculateRSI } from "./indicators";
import { evaluateEntry } from "./entry-engine";
import { getSymbolKlines } from "./kline-cache";

export interface MultiBotEngineCallbacks {
  onToast?: (toast: { title: string; description: string; variant?: "default" | "destructive" }) => void;
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
  const { tickers, tradingMode, aiSignals } = store;

  const symbol = bot.symbol;
  let ticker = tickers[symbol];

  // Se o ticker não tiver preço imediato no estado, busca dos candles
  let currentPrice = ticker?.price;
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

  // If ticker data is not yet in state, keep user updated and wait
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

    // 1.3 TECHNICAL OVERBOUGHT REVERSAL (RSI real do ativo; só realiza se já está no lucro)
    let isOverboughtProfit = false;
    let exitRsi = 0;
    if (gainPercent >= 1.2) {
      const klines = await getSymbolKlines(symbol);
      if (klines.length > (bot.rsiPeriod || 14)) {
        exitRsi = calculateRSI(klines.map((k) => k.close), bot.rsiPeriod || 14);
        isOverboughtProfit = exitRsi >= (bot.sellThreshold || 70);
      }
    }

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
      sellReason = `📈 REALIZAÇÃO NO TOPO RSI ${exitRsi.toFixed(0)} (+${gainPercent.toFixed(2)}%)`;
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

  // Decisão de entrada com candles reais do próprio ativo do robô
  const klines = await getSymbolKlines(symbol);
  const decision = evaluateEntry(bot, ticker, tickers["BTCUSDT"], klines, aiSignals);
  const { shouldBuy, reason: entryReason, checks } = decision;

  if (shouldBuy) {
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
  const { tradingMode } = store;

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
    mode: tradingMode,
  };

  store.updateBotPosition(bot.id, newPosition);
  store.recordBotTrade(bot.id, trade, 0);

  const targetProfitPrice = (buyPrice * (1 + bot.takeProfit / 100)).toFixed(2);
  const modeTag = tradingMode === "live" ? "🟢 [REAL]" : "🔷 [SIMULADO]";

  store.addBotLog({
    message: `🚀 ${modeTag} [${bot.name}] COMPRA executada em ${bot.symbol.replace("USDT", "")}! Preço: $${buyPrice.toLocaleString()} | Alvo de Lucro: +${bot.takeProfit}% ($${targetProfitPrice})`,
    type: "buy",
    botId: bot.id,
    botName: bot.name,
  });

  callbacks?.onToast?.({
    title: `🤖 ${bot.name} ${modeTag}`,
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
  const { tradingMode } = store;

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
        message: `🔴 [${bot.name}] Erro ao enviar venda Binance: ${e.message}`,
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

  // Clear bot position and record performance
  store.updateBotPosition(bot.id, null);
  store.recordBotTrade(bot.id, trade, pnl);

  const sign = pnl >= 0 ? "+" : "";
  const pnlFormatted = `${sign}$${pnl.toFixed(2)} USDT (${sign}${gainPercent.toFixed(2)}%)`;
  const modeTag = tradingMode === "live" ? "🟢 [REAL]" : "🔷 [SIMULADO]";

  store.addBotLog({
    message: `${pnl >= 0 ? "🎉" : "🛑"} ${modeTag} [${bot.name}] ${reason} em ${bot.symbol.replace("USDT", "")}! Resultado: ${pnlFormatted}`,
    type: logType,
    botId: bot.id,
    botName: bot.name,
  });

  callbacks?.onToast?.({
    title: pnl >= 0 ? `🎉 Lucro Realizado! ${bot.name} ${modeTag}` : `🛑 Ordem Finalizada (${bot.name}) ${modeTag}`,
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

  if (bot.position.mode && bot.position.mode !== store.tradingMode) {
    callbacks?.onToast?.({
      title: bot.name,
      description: `Esta posição foi aberta no modo ${bot.position.mode === "live" ? "REAL" : "SIMULADO"}. Mude para esse modo para encerrá-la.`,
      variant: "destructive",
    });
    return;
  }

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
