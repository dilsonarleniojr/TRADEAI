import { describe, it, expect } from "bun:test";
import { CircularBuffer } from "@/lib/telemetry/circular-buffer";
import { StructuredLogger, StructuredLogEntry } from "@/lib/telemetry/structured-logger";
import { FlightRecorder } from "@/lib/telemetry/flight-recorder";
import { FeedWatchdog } from "@/lib/websocket/feed-watchdog";
import { ReconnectionManager } from "@/lib/websocket/reconnection-manager";

describe("Pilar 1 & 4: Telemetria e CircularBuffer", () => {
  it("CircularBuffer deve manter capacidade máxima fixa e despejar os registros mais antigos (FIFO)", () => {
    const buffer = new CircularBuffer<number>(3);
    expect(buffer.size).toBe(0);

    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    expect(buffer.size).toBe(3);
    expect(buffer.toArray()).toEqual([1, 2, 3]);

    // Push além da capacidade máxima deve descartar o item 1
    buffer.push(4);
    expect(buffer.size).toBe(3);
    expect(buffer.toArray()).toEqual([2, 3, 4]);
    expect(buffer.toArrayReversed()).toEqual([4, 3, 2]);

    buffer.push(5);
    expect(buffer.toArray()).toEqual([3, 4, 5]);

    buffer.clear();
    expect(buffer.size).toBe(0);
    expect(buffer.toArray()).toEqual([]);
  });

  it("StructuredLogger deve despachar entradas com timestamps em milissegundos e canais corretos", () => {
    const logger = new StructuredLogger(100);
    const captured: StructuredLogEntry[] = [];
    const unsubscribe = logger.subscribe((entry) => captured.push(entry));

    logger.log("SIGNALS", "INFO", "Sinal de compra gerado", { rsi: 28.5 });
    logger.log("RISK_ENGINE", "WARN", "Spread alto detectado", { spread: 0.42 });
    logger.log("BINANCE_API", "ERROR", "Rate limit warning 429", { weight: 1150 });
    logger.log("MARKET_DATA", "CRITICAL", "Feed desconectado há mais de 3s");

    expect(captured.length).toBe(4);
    expect(captured[0].channel).toBe("SIGNALS");
    expect(captured[0].severity).toBe("INFO");
    expect(captured[0].details).toEqual({ rsi: 28.5 });
    // Validação de formato de timestamp HH:mm:ss.SSS
    expect(captured[0].timestampFormatted).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);

    expect(captured[1].channel).toBe("RISK_ENGINE");
    expect(captured[1].severity).toBe("WARN");

    expect(captured[2].channel).toBe("BINANCE_API");
    expect(captured[2].severity).toBe("ERROR");

    expect(captured[3].channel).toBe("MARKET_DATA");
    expect(captured[3].severity).toBe("CRITICAL");

    // Filtragem por canal
    const riskLogs = logger.getByChannel("RISK_ENGINE");
    expect(riskLogs.length).toBe(1);
    expect(riskLogs[0].message).toBe("Spread alto detectado");

    unsubscribe();
  });

  it("FlightRecorder deve consolidar snapshot pós-mortem com Top 10 L2 e exportar JSON válido", () => {
    const recorder = new FlightRecorder();
    recorder.updateOrderBookSnapshot(
      "BTCUSDT",
      [
        [65000, 1.5],
        [64990, 2.0],
      ],
      [
        [65010, 0.8],
        [65020, 1.2],
      ]
    );

    recorder.recordTrade("BTCUSDT", {
      id: "t1",
      price: 65005,
      quantity: 0.5,
      side: "BUY",
      timestamp: Date.now(),
    });

    const mockBotState = {
      botId: "bot-grid-1",
      botName: "Grid Scalper",
      strategy: "GRID",
      symbol: "BTCUSDT",
      currentPrice: 65000,
      unrealizedPnl: -15,
      unrealizedPnlPercent: -1.5,
    };

    const snapshot = recorder.captureSnapshot(
      "STOP_LOSS_TRIGGERED",
      "BTCUSDT",
      "Stop loss atingido no preço 64500",
      mockBotState
    );

    expect(snapshot.triggerReason).toBe("STOP_LOSS_TRIGGERED");
    expect(snapshot.symbol).toBe("BTCUSDT");
    expect(snapshot.orderBook.bids.length).toBe(2);
    expect(snapshot.orderBook.asks.length).toBe(2);
    expect(snapshot.recentTrades.length).toBe(1);
    expect(snapshot.botState?.botId).toBe("bot-grid-1");

    const json = recorder.exportSnapshotJson(snapshot.id);
    const parsed = JSON.parse(json);
    expect(parsed.triggerReason).toBe("STOP_LOSS_TRIGGERED");
    expect(parsed.botState.botId).toBe("bot-grid-1");
  });
});

describe("Pilar 1: Resiliência de Conexão e Stale Data Watchdog", () => {
  it("FeedWatchdog deve detectar feed obsoleto se delta > 3000ms e recuperar quando novo tick chega", () => {
    let fakeNow = 1000000;
    const realDateNow = Date.now;
    Date.now = () => fakeNow;

    try {
      let isStaleReported = false;
      const watchdog = new FeedWatchdog(3000, 1000, (stale) => {
        isStaleReported = stale;
      });

      watchdog.recordTick("BTCUSDT");
      expect(watchdog.isFeedStale("BTCUSDT")).toBe(false);

      // Avança 3500ms
      fakeNow += 3500;
      expect(watchdog.isFeedStale("BTCUSDT")).toBe(true);

      // Novo tick chega
      watchdog.recordTick("BTCUSDT");
      expect(watchdog.isFeedStale("BTCUSDT")).toBe(false);
    } finally {
      Date.now = realDateNow;
    }
  });

  it("ReconnectionManager deve calcular backoff exponencial com jitter e validar drift do clock", () => {
    const manager = new ReconnectionManager({
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      factor: 2.0,
      jitterPct: 0.15,
      maxClockDriftMs: 1000,
    });

    expect(manager.getAttemptCount()).toBe(0);

    // Tentativa 1: base = 1000ms -> com jitter de ±15% fica entre 850ms e 1150ms
    const delay1 = manager.getNextDelayMs();
    expect(manager.getAttemptCount()).toBe(1);
    expect(delay1).toBeGreaterThanOrEqual(850);
    expect(delay1).toBeLessThanOrEqual(1150);

    // Tentativa 2: base = 2000ms -> entre 1700ms e 2300ms
    const delay2 = manager.getNextDelayMs();
    expect(manager.getAttemptCount()).toBe(2);
    expect(delay2).toBeGreaterThanOrEqual(1700);
    expect(delay2).toBeLessThanOrEqual(2300);

    // Reset restaura contagem
    manager.reset();
    expect(manager.getAttemptCount()).toBe(0);

    // Validação de Clock Drift contra serverTime da Binance
    const now = Date.now();
    const driftOk = manager.validateClockDrift(now + 250); // ~250ms de drift
    expect(driftOk.isAcceptable).toBe(true);
    expect(Math.abs(driftOk.driftMs - 250)).toBeLessThanOrEqual(5);

    const driftExcessive = manager.validateClockDrift(now - 1500); // ~1500ms de drift
    expect(driftExcessive.isAcceptable).toBe(false);
    expect(Math.abs(driftExcessive.driftMs - 1500)).toBeLessThanOrEqual(5);
  });
});

describe("Pilar 3: Simulação Paper com Fila Volumétrica Realista", () => {
  it("Ordem Limit Maker passiva só deve executar quando o volume acumulado na fila for inteiramente absorvido", () => {
    interface SimulatedLimitOrder {
      price: number;
      quantity: number;
      queueAheadVolume: number;
      consumedVolume: number;
      isFilled: boolean;
    }

    const order: SimulatedLimitOrder = {
      price: 64000,
      quantity: 0.5,
      queueAheadVolume: 2.0, // Há 2.0 BTC na frente na fila
      consumedVolume: 0.0,
      isFilled: false,
    };

    const processTickVolume = (tradePrice: number, tradeQty: number) => {
      if (tradePrice <= order.price) {
        order.consumedVolume += tradeQty;
        if (order.consumedVolume >= order.queueAheadVolume + order.quantity) {
          order.isFilled = true;
        }
      }
    };

    // 1. Preço toca 64000, mas com apenas 0.5 BTC transacionado
    // Em simulação ingênua teria executado. No modelo de fila realista, NÃO pode executar!
    processTickVolume(64000, 0.5);
    expect(order.consumedVolume).toBe(0.5);
    expect(order.isFilled).toBe(false);

    // 2. Mais 1.0 BTC transacionado (total 1.5 BTC consumido)
    processTickVolume(63999, 1.0);
    expect(order.consumedVolume).toBe(1.5);
    expect(order.isFilled).toBe(false);

    // 3. Mais 1.0 BTC transacionado (total 2.5 BTC consumido >= 2.0 queue + 0.5 quantity)
    processTickVolume(64000, 1.0);
    expect(order.consumedVolume).toBe(2.5);
    expect(order.isFilled).toBe(true);
  });
});
