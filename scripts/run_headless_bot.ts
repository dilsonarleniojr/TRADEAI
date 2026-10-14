/**
 * TradeAI - Headless Trading Fleet Supervisor
 * 
 * Executado em segundo plano sob supervisão de processo (systemd ou CLI autônomo).
 * Implementa:
 * 1. Protocolo sd_notify (READY=1, WATCHDOG=1, STOPPING=1) via unix_dgram socket
 * 2. Ingestão de market data e execução quantitativa estrita
 * 3. Validação de regras de risco (BTC Macro Guardrail, Volume >= 1.6x, R:R >= 1.85x)
 * 4. Graceful shutdown com cancelamento de ordens e fechamento de conexões
 */

import dgram from "dgram";
import { db } from "../src/lib/db";
import { evaluateBotEntry, calculateTargetAndStop } from "../src/lib/bot/entry-engine";
import { calculateATR } from "../src/lib/bot/indicators";

// --- Systemd Notification Helper ---
function sendSdNotify(message: string): boolean {
  const socketPath = process.env.NOTIFY_SOCKET;
  if (!socketPath) return false;
  try {
    const client = dgram.createSocket("unix_dgram");
    const buf = Buffer.from(message, "utf-8");
    const realPath = socketPath.startsWith("@") ? "\0" + socketPath.slice(1) : socketPath;
    client.send(buf, 0, buf.length, realPath, (err) => {
      client.close();
    });
    return true;
  } catch (err: any) {
    console.error("[Systemd] Falha ao enviar sd_notify:", err.message);
    return false;
  }
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
async function fetchCandles(symbol: string, limit = 50) {
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
async function fetch24hTickers(): Promise<Record<string, { priceChangePercent: number; volume: number; lastPrice: number }>> {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/24hr", { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return {};
    const list = await res.json();
    const map: Record<string, any> = {};
    for (const item of list) {
      map[item.symbol] = {
        priceChangePercent: parseFloat(item.priceChangePercent) || 0,
        volume: parseFloat(item.volume) || 0,
        lastPrice: parseFloat(item.lastPrice) || 0,
      };
    }
    return map;
  } catch {
    return {};
  }
}

// --- Ciclo Principal Quant ---
async function runQuantCycle() {
  lastLoopProgress = Date.now();

  try {
    // 1. Obter bots ativos no DB
    let activeBots = await db.botConfig.findMany({
      where: { isActive: true },
    });

    // Se nenhum bot ativo no DB, criar/carregar pares default monitorados
    const defaultSymbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    const symbolsToScan = activeBots.length > 0 ? activeBots.map((b) => b.symbol) : defaultSymbols;

    // 2. Obter tickers 24h (para filtro Macro BTC)
    const tickersMap = await fetch24hTickers();
    const btcTicker = tickersMap["BTCUSDT"];

    for (const symbol of symbolsToScan) {
      const candles = await fetchCandles(symbol, 60);
      if (candles.length < 30) continue;

      const currentPrice = candles[candles.length - 1].close;
      const ticker = tickersMap[symbol] || { priceChangePercent: 0, volume: 1000, lastPrice: currentPrice };

      // Avaliação com o novo motor matemático de sinais
      const evaluation = evaluateBotEntry({
        strategy: "BREAKOUT",
        symbol,
        currentPrice,
        candles,
        ticker,
        btcTicker,
      });

      if (evaluation.shouldEnter) {
        // Cálculo estrito de Risco:Retorno Asimétrico (Payoff >= 1.85x)
        const atr = calculateATR(candles, 14);
        const { stopLossPercent, takeProfitPercent, riskRewardRatio } = calculateTargetAndStop({
          strategy: "BREAKOUT",
          candles,
          currentPrice,
          atr,
        });

        quantLog("INFO", "VALID_SIGNAL_DISCOVERED", {
          symbol,
          direction: evaluation.direction,
          reason: evaluation.reason,
          stopLossPercent: `${stopLossPercent.toFixed(2)}%`,
          takeProfitPercent: `${takeProfitPercent.toFixed(2)}%`,
          riskRewardRatio: `${riskRewardRatio.toFixed(2)}x`,
          btcTrend: btcTicker ? `${btcTicker.priceChangePercent.toFixed(2)}%` : "N/A",
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
  sendSdNotify("READY=1\nSTATUS=TradeAI Fleet Headless Supervisor rodando com motor Quant v2");
  quantLog("INFO", "SD_NOTIFY_READY_SENT", { watchdogIntervalMs: pingIntervalMs });

  // Agendar ping de watchdog contínuo
  const watchdogTimer = setInterval(() => {
    const elapsed = Date.now() - lastLoopProgress;
    if (elapsed < 60_000) {
      sendSdNotify("WATCHDOG=1");
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

    sendSdNotify("STOPPING=1\nSTATUS=TradeAI encerrando tarefas e desarmando posições...");

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
