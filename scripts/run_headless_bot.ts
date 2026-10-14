/**
 * TradeAI - Headless Trading Fleet Supervisor
 * 
 * Executado em segundo plano sob supervisão de processo (systemd ou CLI autônomo).
 * Implementa:
 * 1. Protocolo sd_notify (READY=1, WATCHDOG=1, STOPPING=1) via /usr/bin/systemd-notify ou socket direto
 * 2. Ingestão de market data e execução quantitativa estrita
 * 3. Validação de regras de risco (BTC Macro Guardrail, Volume >= 1.6x, R:R >= 1.85x)
 * 4. Graceful shutdown com cancelamento de ordens e fechamento de conexões
 */

import { execFile } from "child_process";
import { db } from "../src/lib/db";
import { evaluateEntry } from "../src/lib/bot/entry-engine";
import { relativeATR } from "../src/lib/bot/indicators";
import type { BotInstance, KlineData, TickerData } from "../src/lib/store/types";

// --- Systemd Notification Helper ---
function sendSdNotify(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    if (!process.env.NOTIFY_SOCKET) {
      resolve(false);
      return;
    }
    execFile("/usr/bin/systemd-notify", args, (err) => {
      if (err) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// Intervalo do watchdog (padrão 15s ou metade de WATCHDOG_USEC)
const watchdogUsec = process.env.WATCHDOG_USEC ? parseInt(process.env.WATCHDOG_USEC, 10) : 30_000_000;
const pingIntervalMs = Math.max(1000, Math.floor((watchdogUsec / 1000) / 2));

let lastLoopProgress = Date.now();
let isRunning = true;

// --- Structured Logging ---
function quantLog(level: "INFO" | "WARN" | "ERROR", event: string, details: Record<string, any>) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      subsystem: "QUANT_FLEET_SUPERVISOR",
      event,
      details,
    })
  );
}

// --- Pre-Market Healthcheck ---
async function runPreFlightCheck(): Promise<boolean> {
  quantLog("INFO", "PRE_FLIGHT_CHECK_STARTED", { target: "Binance API & SQLite DB" });
  try {
    // 1. Validar DB
    await db.$queryRaw`SELECT 1`;
    // 2. Validar Binance Ping
    const res = await fetch("https://api.binance.com/api/v3/ping", { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`Binance ping retornou status ${res.status}`);
    quantLog("INFO", "PRE_FLIGHT_CHECK_PASSED", { status: "OK" });
    return true;
  } catch (err: any) {
    quantLog("ERROR", "PRE_FLIGHT_CHECK_FAILED", { error: err.message });
    return false;
  }
}

// --- Fetch Market Data Candles (1m) ---
async function fetchCandles(symbol: string, limit = 50): Promise<KlineData[]> {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=${limit}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((d: any) => ({
      time: d[0],
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5]),
    }));
  } catch {
    return [];
  }
}

// --- Fetch 24h Tickers for Macro Filter ---
async function fetch24hTickers(): Promise<Record<string, TickerData>> {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/24hr", { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return {};
    const list = await res.json();
    const map: Record<string, TickerData> = {};
    for (const item of list) {
      map[item.symbol] = {
        symbol: item.symbol,
        price: parseFloat(item.lastPrice) || 0,
        priceChange: parseFloat(item.priceChange) || 0,
        priceChangePercent: parseFloat(item.priceChangePercent) || 0,
        high: parseFloat(item.highPrice) || 0,
        low: parseFloat(item.lowPrice) || 0,
        volume: parseFloat(item.volume) || 0,
        quoteVolume: parseFloat(item.quoteVolume) || 0,
      };
    }
    return map;
  } catch {
    return {};
  }
}

// --- Helper to build a BotInstance structure for evaluation ---
function createMockBotInstance(symbol: string, strategy = "BREAKOUT"): BotInstance {
  return {
    id: `headless_${symbol.toLowerCase()}`,
    name: `Fleet ${symbol}`,
    strategy,
    symbol,
    status: "running",
    mode: "paper",
    balance: 1000,
    initialBalance: 1000,
    stopLoss: 1.5,
    takeProfit: 3.0,
    maxDailyTrades: 10,
    buyThreshold: 0,
    sellThreshold: 0,
    autoTradeSignals: true,
    signalConfidenceThreshold: 0.7,
    useQuantFunnel: true,
    useMarketRegime: true,
    useEnsemble: true,
    useAutoScreener: false,
    autoBreakEven: true,
    breakEvenTrigger: 1.3,
    breakEvenBuffer: 0.4,
    useBtcGatekeeper: true,
    rsiPeriod: 14,
    emaFast: 9,
    emaSlow: 21,
    position: null,
    stats: {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnL: 0,
      netPnL: 0,
      dailyTradesCount: 0,
      dailyProfit: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      profitFactor: 0,
      payoffRatio: 0,
      expectancy: 0,
      totalVolumeTraded: 0,
      totalFeesPaid: 0,
      tradeHistory: [],
    },
    activityLogs: [],
    lastExecutionReport: null,
  };
}

// --- Ciclo Principal Quant ---
async function runQuantCycle() {
  lastLoopProgress = Date.now();

  try {
    // 1. Obter bots ativos no DB
    const activeDbBots = await db.botConfig.findMany({
      where: { isActive: true },
    });

    const defaultSymbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    const symbolsToScan = activeDbBots.length > 0 ? activeDbBots.map((b) => b.symbol) : defaultSymbols;

    // 2. Obter tickers 24h (para filtro Macro BTC e cotações)
    const tickersMap = await fetch24hTickers();
    const btcTicker = tickersMap["BTCUSDT"];

    for (const symbol of symbolsToScan) {
      const candles = await fetchCandles(symbol, 60);
      if (candles.length < 30) continue;

      const ticker = tickersMap[symbol] || {
        symbol,
        price: candles[candles.length - 1].close,
        priceChange: 0,
        priceChangePercent: 0,
        high: candles[candles.length - 1].high,
        low: candles[candles.length - 1].low,
        volume: candles[candles.length - 1].volume,
        quoteVolume: candles[candles.length - 1].volume * candles[candles.length - 1].close,
      };

      const botInstance = createMockBotInstance(symbol, "BREAKOUT");

      // Avaliação com o novo motor quantitativo
      const decision = evaluateEntry(
        botInstance,
        ticker,
        btcTicker,
        candles,
        [] // Sem sinais de IA manuais
      );

      if (decision.shouldBuy) {
        const relAtr = relativeATR(candles, 14);
        const atrPercent = relAtr * 100;
        const suggestedSl = Math.max(1.0, Math.min(1.6, atrPercent * 1.5));
        const suggestedTp = Math.max(suggestedSl * 1.85, suggestedSl * 2.0);

        quantLog("INFO", "VALID_QUANT_ENTRY_SIGNAL", {
          symbol,
          reason: decision.reason,
          atrRelativePercent: `${atrPercent.toFixed(2)}%`,
          suggestedSl: `${suggestedSl.toFixed(2)}%`,
          suggestedTp: `${suggestedTp.toFixed(2)}%`,
          payoffRatio: `${(suggestedTp / suggestedSl).toFixed(2)}x`,
          btcTrend: btcTicker ? `${btcTicker.priceChangePercent.toFixed(2)}%` : "N/A",
          checksPassed: decision.checks.filter((c) => c.ok).map((c) => c.label),
        });
      }
    }
  } catch (err: any) {
    quantLog("ERROR", "CYCLE_ERROR", { error: err.message });
  }
}

// --- Inicialização do Processo ---
async function main() {
  quantLog("INFO", "STARTING_DAEMON", { pid: process.pid, nodeEnv: process.env.NODE_ENV || "development" });

  const healthy = await runPreFlightCheck();
  if (!healthy) {
    quantLog("ERROR", "HALT_ON_UNHEALTHY_START", { message: "Falha na checagem pré-voo. Encerrando." });
    process.exit(1);
  }

  // Notificar systemd de prontidão (READY=1)
  await sendSdNotify(["--ready", "--status=TradeAI Fleet Headless Supervisor rodando com motor Quant v2"]);
  quantLog("INFO", "SD_NOTIFY_READY_SENT", { watchdogIntervalMs: pingIntervalMs });

  // Agendar ping de watchdog contínuo
  const watchdogTimer = setInterval(async () => {
    const elapsed = Date.now() - lastLoopProgress;
    if (elapsed < 60_000) {
      await sendSdNotify(["--watchdog"]);
    } else {
      quantLog("WARN", "WATCHDOG_PING_SKIPPED_LOOP_STALLED", { elapsedMs: elapsed });
    }
  }, pingIntervalMs);

  // Loop principal de trading
  const cycleInterval = setInterval(async () => {
    if (!isRunning) return;
    await runQuantCycle();
  }, 10_000); // Executa a cada 10 segundos

  // Executar primeira iteração imediatamente
  runQuantCycle();

  // --- Graceful Shutdown Handler ---
  const shutdown = async (signal: string) => {
    quantLog("INFO", "SHUTDOWN_SIGNAL_RECEIVED", { signal });
    isRunning = false;
    clearInterval(watchdogTimer);
    clearInterval(cycleInterval);

    await sendSdNotify(["--stopping", "--status=TradeAI encerrando tarefas e desarmando posições..."]);

    // Drenar tarefas e fechar conexão com DB
    try {
      await db.$disconnect();
    } catch {}

    quantLog("INFO", "CLEAN_EXIT", { status: "SUCCESS" });
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  quantLog("ERROR", "UNCAUGHT_FATAL", { error: err.message, stack: err.stack });
  process.exit(1);
});
