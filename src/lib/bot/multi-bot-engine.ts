import { useCryptoStore, type BotInstance, type BotPosition, type TradeData } from "@/lib/store";
import type { BotExecutionReport } from "@/lib/store/types";
import { calculateRSI, calculateEMA } from "./indicators";
import { evaluateEntry } from "./entry-engine";
import { getSymbolKlines } from "./kline-cache";
import { scanHotCoins, type HotCoinCandidate } from "./quant-engine";
import { getOrderBookAnalysis } from "@/lib/bot/order-book-cache";

export interface MultiBotEngineCallbacks {
  onToast?: (toast: { title: string; description: string; variant?: "default" | "destructive" }) => void;
  stopBotAfterClose?: boolean;
}

let lastFleetAccountSync = 0;
let lastLiveAccountError: string | null = null;
let lastLiveAccountErrorLoggedAt = 0;
const botErrorCooldown = new Map<string, number>();
const botSymbolLossCooldown = new Map<string, number>();
const inFlightBuys = new Set<string>();

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

    // Se o BTC caiu mais de -0.5% nos últimos 15 min E está negociando abaixo da EMA20:
    if (btc15mChange <= -0.5 && currentBtc < ema20) {
      return {
        healthy: false,
        detail: `BTC em correção (${btc15mChange.toFixed(2)}% nos 15m · $${currentBtc.toFixed(0)} < EMA20 $${ema20.toFixed(0)})`,
      };
    }
    return { healthy: true, detail: `BTC saudável ($${currentBtc.toFixed(0)} · 15m: ${btc15mChange >= 0 ? "+" : ""}${btc15mChange.toFixed(2)}%)` };
  } catch {
    return { healthy: true, detail: "Consulta de BTC em andamento" };
  }
}

/**
 * Evaluates all active bots simultaneously and executes buys/sells aiming strictly for profit.
 */
export async function tickMultiBotFleet(callbacks?: MultiBotEngineCallbacks) {
  const store = useCryptoStore.getState();
  const { bots, tradingMode } = store;

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
  // Respeita cooldown de erro se houve rejeição recente da Binance
  const cooldownUntil = botErrorCooldown.get(bot.id) || 0;
  if (Date.now() < cooldownUntil) {
    return;
  }

  const store = useCryptoStore.getState();
  const { tickers, tradingMode, aiSignals } = store;

  const isAutoScreener = Boolean(bot.useAutoScreener || bot.symbol === "AUTO");
  const hasOpenPosition = Boolean(bot.position && bot.position.quantity > 0);
  const symbol = hasOpenPosition ? (bot.position!.symbol || bot.symbol) : bot.symbol;

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

    // 🛡️ BREAK-EVEN AUTOMÁTICO (Risco Zero Institucional)
    // Para evitar fatiamentos prematuros e micro-centavos, a Realização Parcial só é permitida em posições >= 60 USDT.
    // Em posições normais (< 60 USDT), o Break-Even só é armado após valorização expressiva (>= 1.8%).
    // O piso de proteção é 0.50% para cobrir 100% das taxas da Binance com folga e garantir lucro líquido.
    const isAutoBreakEvenEnabled = bot.autoBreakEven ?? true;
    const isUsePartialTp = bot.usePartialTp ?? false;
    const beBuffer = bot.breakEvenBuffer ?? 0.50;
    const breakEvenPrice = pos.entryPrice * (1 + beBuffer / 100);
    const positionNotional = pos.quantity * currentPrice!;
    const canUsePartialTp = isUsePartialTp && positionNotional >= 60.0;

    const isBreakEvenNowArmed = Boolean(
      pos.isBreakEvenArmed ||
      (pos.partialTpExecuted && isAutoBreakEvenEnabled) ||
      (isAutoBreakEvenEnabled && !canUsePartialTp && peakGain >= Math.max(1.8, bot.breakEvenTrigger || 1.8))
    );

    // O Break-Even só fecha a posição se estiver devidamente armado E
    // o preço recuar até a margem de proteção do Break-Even (ex: +0.50% garantidos)
    const isBreakEvenTriggered =
      isAutoBreakEvenEnabled &&
      isBreakEvenNowArmed &&
      (pos.partialTpExecuted || !canUsePartialTp) &&
      gainPercent <= beBuffer;

    // 🚀 TRAILING TAKE-PROFIT DINÂMICO (Deixar o Lucro Correr em Altas Fortes)
    // Ao bater a meta de Take Profit (ex: +2.5% a +3.0%), o robô não vende na hora;
    // ele arma o Trailing TP, rastreia o topo do pump e só realiza quando recuar X% do pico.
    const isTrailingTakeProfitEnabled = bot.trailingTakeProfit ?? true;
    const tpDistance = bot.trailingTakeProfitDistance ?? 0.6; // recuo percentual do pico (ex: 0.6%)

    let isTakeProfitNowArmed = Boolean(pos.isTakeProfitArmed);
    if (isTrailingTakeProfitEnabled && gainPercent >= bot.takeProfit) {
      isTakeProfitNowArmed = true;
    }

    let tpPeakPrice = pos.tpPeakPrice || currentPrice!;
    if (isTakeProfitNowArmed) {
      tpPeakPrice = Math.max(tpPeakPrice, currentPrice!);
    }
    const peakGainFromTp = ((tpPeakPrice - pos.entryPrice) / pos.entryPrice) * 100;
    const pullbackFromTpPeak = peakGainFromTp - gainPercent;

    // Condição de saída pelo Trailing TP:
    // 1. Está armado
    // 2. Teve um recuo >= tpDistance a partir do topo OU o lucro recuou para a base de proteção (takeProfit - 0.4%)
    const isTrailingTakeProfitTriggered =
      isTrailingTakeProfitEnabled &&
      isTakeProfitNowArmed &&
      (pullbackFromTpPeak >= tpDistance || gainPercent <= Math.max(1.2, bot.takeProfit - 0.4));

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

    // 1.0 CÁLCULO DE TEMPO EM OPERAÇÃO (Para Time-Stop e Monitoramento)
    const timeStopMinutes = bot.timeStopMinutes ?? 20;
    let isTimeStop = false;
    let minutesOpen = 0;
    if (pos.entryTime) {
      const entryMs = new Date(pos.entryTime).getTime();
      if (!isNaN(entryMs)) {
        minutesOpen = Math.max(0, (Date.now() - entryMs) / 60000);
        // Se a posição durou mais que timeStopMinutes e o preço está estagnado (entre -0.6% e +0.4%)
        if (timeStopMinutes > 0 && minutesOpen >= timeStopMinutes && gainPercent <= 0.4 && gainPercent >= -bot.stopLoss) {
          isTimeStop = true;
        }
      }
    }

    // Feedback de monitoramento em tempo real do robô em operação
    const targetProfitPrice = (pos.entryPrice * (1 + bot.takeProfit / 100)).toFixed(4);
    const sign = gainPercent >= 0 ? "+" : "";
    let statusNotice = "";
    if (pos.partialTpExecuted) {
      statusNotice += ` · 🎯 50% Salvo no Lucro (Risco Zero)`;
    }
    if (isTakeProfitNowArmed) {
      statusNotice += ` · 🚀 Surfando Pump (Trailing TP Ativo · Topo: +${peakGainFromTp.toFixed(2)}%)`;
    } else if (isBreakEvenNowArmed) {
      statusNotice += ` · 🛡️ Risco Zero Ativo (Break-Even Armado em $${breakEvenPrice.toFixed(4)})`;
    }
    const dcaNotice = (pos.dcaCount && pos.dcaCount > 0) ? ` · 🔄 DCA (${pos.dcaCount}/${bot.maxDcaOrders || 1})` : "";
    const timeNotice = timeStopMinutes > 0 && minutesOpen > 0 ? ` · ⏱️ ${minutesOpen.toFixed(0)}m/${timeStopMinutes}m` : "";

    store.updateBot(bot.id, {
      status: "in_position",
      stats: {
        ...bot.stats,
        lastAction: `Monitorando ${pos.symbol.replace("USDT", "")} · Cotação: $${currentPrice!.toFixed(5)} (${sign}${gainPercent.toFixed(2)}%) · Alvo: $${targetProfitPrice}${statusNotice}${dcaNotice}${timeNotice}`,
        lastActionTime: new Date().toISOString(),
      },
    });

    // ==========================================================
    // 1.0 REALIZAÇÃO PARCIAL AUTOMÁTICA (Scale-Out Institucional)
    // ==========================================================
    // Para proteger posições pequenas de fatiamentos inferiores ao mínimo da Binance ($5)
    // e evitar micro-lucros pulverizados, parciais só executam se o valor da posição for >= 60 USDT
    // e com gatilho mínimo de +2.0%. Posições normais seguem 100% até o alvo.
    const isPartialTpEnabled = (bot.usePartialTp ?? false) && ((updatedPosition.quantity * currentPrice!) >= 60.0);
    const partialTpTrigger = bot.partialTpTrigger ?? 2.0;
    if (isPartialTpEnabled && !pos.partialTpExecuted && gainPercent >= partialTpTrigger) {
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
      if (gainPercent >= bot.takeProfit) {
        isTakeProfit = true;
        takeProfitReason = bot.stopAfterProfit
          ? `🎯 TAKE PROFIT ATINGIDO (+${gainPercent.toFixed(2)}%) · OPERAÇÃO ÚNICA CONCLUÍDA`
          : `🎯 TAKE PROFIT ATINGIDO (+${gainPercent.toFixed(2)}%)`;
      }
    }

    // 1.2 TRAILING STOP / BREAKEVEN PROFIT LOCK
    // Só trava se a valorização tiver superado pelo menos +1.8% e recuar
    const pullbackFromPeak = peakGain - gainPercent;
    const isTrailingStop =
      bot.trailingStop &&
      !isTakeProfitNowArmed &&
      peakGain >= Math.max(1.8, bot.takeProfit * 0.7) &&
      pullbackFromPeak >= (bot.trailingStopDistance || 0.6) &&
      gainPercent >= 0.50;

    // 1.3 STOP LOSS DISCIPLINADO (Respeita o risco configurado sem cortes prematuros por ruído)
    const isHardStopLoss = gainPercent <= -bot.stopLoss;
    const isStopLoss = isHardStopLoss;

    // 1.4 ONE-SHOT QUICK PROFIT (Venda com lucro real conquistado)
    // Se o robô estiver no modo de operação única, só encerra quando atingir o alvo de take profit
    // ou no mínimo 1.8% líquido:
    const isQuickProfit = bot.stopAfterProfit && gainPercent >= Math.max(1.8, bot.takeProfit * 0.9);

    let shouldSell = false;
    let sellReason = "";
    let logType: "profit" | "loss" | "warning" = "profit";

    if (isTakeProfit) {
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
      sellReason = `⏱️ TIME-STOP ESCALONADO (${minutesOpen.toFixed(0)} min sem evolução) · LIBERANDO CAPITAL`;
      logType = gainPercent >= 0 ? "profit" : "warning";
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
        const isBullishCandle = lastCandle.close >= lastCandle.open;
        // Confirma suporte: RSI sobrevendido (<= 38) OU rejeição em fundo no candle atual
        const isSupportConfirmed = currentRsi <= 38 || (currentRsi <= 45 && isBullishCandle);

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

  // Check minimum execution balance
  // Limiar de Capital Institucional: Impede a abertura de posições "migalhas" ($6 a $12)
  // que quebram a simetria de risco e geram lucros insignificantes de centavos enquanto
  // perdas ocorrem em posições de $40-$50.
  const minRequiredCash = Math.max(10.0, Math.min(bot.allocationAmount || 40.0, 35.0));
  if (cash < minRequiredCash) {
    const actionMsg = (tradingMode === "live" && lastLiveAccountError)
      ? `Aguardando Binance: ${lastLiveAccountError.replace("Conexão Binance falhou: ", "")}`
      : `Aguardando capital livre: Saldo ($${cash.toFixed(2)}) abaixo do lote mínimo ($${minRequiredCash.toFixed(2)}). Preservando simetria de risco.`;
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
  if (bot.symbol !== "BTCUSDT" && bot.useBtcGatekeeper !== false) {
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
    const candidates = scanHotCoins(tickers, btcTicker, 12);

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

    // Avalia as melhores candidatas por ordem de score quantitativo
    for (const cand of availableCandidates.slice(0, 5)) {
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

        // Sizing Institucional: Posição padronizada (padrão $40 ou bot.allocationAmount)
        // para garantir que alvos de +3.0% gerem lucros reais de +US$ 1.20 a +US$ 2.50 líquidos
        const maxSafeCash = Math.max(0, cash * 0.95);
        const configuredAlloc = bot.allocationAmount || 40.0;
        const dynamicAlloc = (cash >= 35.0 && cash <= 90.0)
          ? Math.max(35.0, Math.min(maxSafeCash, cash * 0.85))
          : Math.min(maxSafeCash, configuredAlloc);
        const targetSpend = Math.max(minRequiredCash, Math.min(maxSafeCash, dynamicAlloc));
        const quantity = parseFloat((targetSpend / freshCandPrice).toFixed(6));
        const total = parseFloat((quantity * freshCandPrice).toFixed(2));

        if (total >= minRequiredCash * 0.95 && total <= cash) {
          const reasonFormatted = `🔥 Auto-Screener [${cand.symbol.replace("USDT", "")} +${cand.priceChangePercent.toFixed(1)}%]: ${decision.reason}`;
          await executeBotBuy({
            bot,
            targetSymbol: cand.symbol,
            buyPrice: freshCandPrice,
            quantity,
            total,
            customReason: reasonFormatted,
            callbacks,
          });
          return;
        }
      }
    }

    // Nenhuma candidata confirmou gatilho técnico no tick atual
    const topSummary = availableCandidates
      .slice(0, 3)
      .map((c) => `${c.symbol.replace("USDT", "")} (+${c.priceChangePercent.toFixed(1)}%)`)
      .join(", ");

    store.updateBot(bot.id, {
      status: "scanning",
      stats: {
        ...bot.stats,
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
      (b) => b.position && b.position.quantity > 0 && (b.position.symbol === symbol || b.symbol === symbol)
    );
  if (isHeldByAnyBot) {
    store.updateBot(bot.id, {
      status: "scanning",
      stats: {
        ...bot.stats,
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
    store.updateBot(bot.id, {
      status: "scanning",
      stats: {
        ...bot.stats,
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

  if (shouldBuy && currentPrice) {
    // Sizing Institucional: Posição padronizada (padrão $40 ou bot.allocationAmount)
    // para garantir que alvos de +3.0% gerem lucros reais de +US$ 1.20 a +US$ 2.50 líquidos
    const maxSafeCash = Math.max(0, cash * 0.95);
    const configuredAlloc = bot.allocationAmount || 40.0;
    const dynamicAlloc = (cash >= 35.0 && cash <= 90.0)
      ? Math.max(35.0, Math.min(maxSafeCash, cash * 0.85))
      : Math.min(maxSafeCash, configuredAlloc);
    const targetSpend = Math.max(minRequiredCash, Math.min(maxSafeCash, dynamicAlloc));

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
  targetSymbol,
  buyPrice,
  quantity,
  total,
  customReason,
  callbacks,
}: {
  bot: BotInstance;
  targetSymbol?: string;
  buyPrice: number;
  quantity: number;
  total: number;
  customReason?: string;
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
    const trade: TradeData = {
    id: `trade-${bot.id}-${Date.now()}`,
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
  };

  store.updateBotPosition(bot.id, newPosition);
  store.recordBotTrade(bot.id, trade, 0);

  const targetProfitPrice = (buyPrice * (1 + bot.takeProfit / 100)).toFixed(2);
  const modeTag = tradingMode === "live" ? "🟢 [REAL]" : "🔷 [SIMULADO]";

  store.addBotLog({
    message: `🚀 ${modeTag} [${bot.name}] COMPRA executada em ${execSymbol.replace("USDT", "")}! Preço: $${buyPrice.toLocaleString()} | Alvo de Lucro: +${bot.takeProfit}% ($${targetProfitPrice})`,
    type: "buy",
    botId: bot.id,
    botName: bot.name,
  });

  callbacks?.onToast?.({
    title: `🤖 ${bot.name} ${modeTag}`,
    description: `Comprou ${finalQty.toFixed(4)} ${execSymbol.replace("USDT", "")} @ $${buyPrice.toLocaleString()} (Alvo: +${bot.takeProfit}%)`,
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

  const partialRatio = (bot.partialTpPercent ?? 50) / 100;
  const sellQty = parseFloat((position.quantity * partialRatio).toFixed(6));
  const remainingQty = parseFloat((position.quantity - sellQty).toFixed(6));
  const partialCost = parseFloat((position.totalCost * partialRatio).toFixed(2));
  const remainingCost = parseFloat((position.totalCost - partialCost).toFixed(2));
  const partialTotal = parseFloat((sellQty * sellPrice).toFixed(2));
  const partialPnl = parseFloat((partialTotal - partialCost).toFixed(2));

  // Binance spot order requires min $5 notional
  if (tradingMode === "live" && partialTotal < 5.20) {
    return false;
  }

  const trade: TradeData = {
    id: `trade-partial-${bot.id}-${Date.now()}`,
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
        store.addBotLog({
          message: `⚠️ [${bot.name}] Parcial não executada na Binance: ${result.error || "Ordem rejeitada"}`,
          type: "warning",
          botId: bot.id,
          botName: bot.name,
        });
        return false;
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
      if (result.account) store.setAccount(result.account);
    } catch (e: any) {
      store.addBotLog({
        message: `⚠️ [${bot.name}] Erro de rede ao executar parcial: ${e.message}`,
        type: "warning",
        botId: bot.id,
        botName: bot.name,
      });
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

  const total = parseFloat((position.quantity * sellPrice).toFixed(2));

  const trade: TradeData = {
    id: `trade-${bot.id}-${Date.now()}`,
    symbol: execSymbol,
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
    sellAll: true, // Vender 100% de todo o saldo livre na Binance
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
          store.recordBotTrade(bot.id, trade, pnl);

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

  // Cálculos financeiros e custos operacionais
  const totalInvested = parseFloat((position.totalCost || position.quantity * position.entryPrice).toFixed(2));
  const totalReturned = parseFloat((position.quantity * sellPrice).toFixed(2));
  const grossPnl = parseFloat(pnl.toFixed(2));
  // Taxa padrão Binance Spot: 0.10% (0.001) para compra e 0.10% para venda
  const buyFee = parseFloat((totalInvested * 0.001).toFixed(4));
  const sellFee = parseFloat((totalReturned * 0.001).toFixed(4));
  const totalFees = parseFloat((buyFee + sellFee).toFixed(4));
  const netPnl = parseFloat((grossPnl - totalFees).toFixed(2));
  const netGainPercent = totalInvested > 0
    ? parseFloat((((totalReturned - totalFees - totalInvested) / totalInvested) * 100).toFixed(2))
    : parseFloat(gainPercent.toFixed(2));

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
  };

  // Se o robô tiver 'stopAfterProfit' ativo e obteve lucro (ou encerramento com lucro solicitado):
  const isProfitableSell =
    pnl > 0 ||
    gainPercent > 0 ||
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

  // Abre o relatório detalhado automaticamente para o usuário
  store.setActiveExecutionReport(executionReport);

  // 🛡️ COOLDOWN UNIVERSAL PÓS-TRADE INSTITUCIONAL:
  // Impede recompras precipitadas no mesmo ativo (evita overtrading e compras em facas caindo):
  // 1. Se encerrou com stop loss / prejuízo: 25 minutos de cooldown rigoroso
  // 2. Se encerrou com lucro ou break-even: 15 minutos de cooldown para aguardar consolidação e suporte real
  const isLoss = logType === "loss" || pnl < 0 || gainPercent < 0;
  const cooldownDuration = isLoss
    ? 25 * 60 * 1000 // 25 minutos após stop loss
    : 15 * 60 * 1000; // 15 minutos após gain/breakeven

  botSymbolLossCooldown.set(execSymbol, Date.now() + cooldownDuration);

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

  let targetSymbol = bot.symbol;
  let targetPrice = 0;

  if (bot.symbol === "AUTO" || bot.useAutoScreener) {
    const hotList = scanHotCoins(store.tickers, store.tickers["BTCUSDT"], 5);
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
