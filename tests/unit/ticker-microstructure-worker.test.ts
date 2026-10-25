import { describe, it, expect } from "bun:test";
import {
  parseBinanceMicrostructurePayload,
  isBinanceRateLimit,
  createSerializedWorkerError,
  MICROSTRUCTURE_STRIDE,
} from "@/workers/ticker-worker";
import {
  BinanceWorkerManager,
  SLOT_OFFSET_TIMESTAMP,
  SLOT_OFFSET_SYMBOL_ID,
  SLOT_OFFSET_PRICE,
  SLOT_OFFSET_PRICE_CHANGE,
  SLOT_OFFSET_PRICE_CHANGE_PCT,
  SLOT_OFFSET_HIGH,
  SLOT_OFFSET_LOW,
  SLOT_OFFSET_VOLUME,
  SLOT_OFFSET_QUOTE_VOLUME,
  SLOT_OFFSET_BID_PRICE,
  SLOT_OFFSET_BID_QTY,
  SLOT_OFFSET_ASK_PRICE,
  SLOT_OFFSET_ASK_QTY,
  SLOT_OFFSET_SPREAD_BPS,
  SLOT_OFFSET_FLAGS,
  SLOT_OFFSET_UPDATE_ID,
  OrderBookFetchError,
} from "@/lib/performance/binance-worker-manager";
import { LockFreeSPSCQueue } from "@/lib/performance/lock-free-spsc-queue";
import { OffscreenChartController } from "@/lib/performance/offscreen-chart-controller";
import { connectChartToWorker, getGlobalWorkerManager } from "@/hooks/use-binance-stream";

describe("Worker de Microestrutura com SharedArrayBuffer (Pilar 1 Institucional)", () => {
  describe("Constantes e Alinhamento de Memória (128-byte Stride / 2 Cache Lines)", () => {
    it("deve definir o stride de microestrutura como 16 Float64 (128 bytes = 2x 64B cache lines)", () => {
      expect(MICROSTRUCTURE_STRIDE).toBe(16);
      const slotBytes = MICROSTRUCTURE_STRIDE * Float64Array.BYTES_PER_ELEMENT;
      expect(slotBytes).toBe(128);
      // Alinhamento perfeito com 2 linhas de cache L1 de 64 bytes (evita false sharing em x86-64 / ARM64)
      expect(slotBytes % 64).toBe(0);
      expect(slotBytes / 64).toBe(2);
    });

    it("deve cobrir todos os 16 offsets contíguos do slot sem gaps de memória", () => {
      expect(SLOT_OFFSET_TIMESTAMP).toBe(0);
      expect(SLOT_OFFSET_SYMBOL_ID).toBe(1);
      expect(SLOT_OFFSET_PRICE).toBe(2);
      expect(SLOT_OFFSET_PRICE_CHANGE).toBe(3);
      expect(SLOT_OFFSET_PRICE_CHANGE_PCT).toBe(4);
      expect(SLOT_OFFSET_HIGH).toBe(5);
      expect(SLOT_OFFSET_LOW).toBe(6);
      expect(SLOT_OFFSET_VOLUME).toBe(7);
      expect(SLOT_OFFSET_QUOTE_VOLUME).toBe(8);
      expect(SLOT_OFFSET_BID_PRICE).toBe(9);
      expect(SLOT_OFFSET_BID_QTY).toBe(10);
      expect(SLOT_OFFSET_ASK_PRICE).toBe(11);
      expect(SLOT_OFFSET_ASK_QTY).toBe(12);
      expect(SLOT_OFFSET_SPREAD_BPS).toBe(13);
      expect(SLOT_OFFSET_FLAGS).toBe(14);
      expect(SLOT_OFFSET_UPDATE_ID).toBe(15);
    });
  });

  describe("Parser de Microestrutura (@bookTicker e 24hr @ticker)", () => {
    it("deve deserializar payload puro de @bookTicker com cálculo exato de mid-price e spread bps", () => {
      const bookTickerJson = JSON.stringify({
        stream: "btcusdt@bookTicker",
        data: {
          u: 400900200,
          s: "BTCUSDT",
          b: "64500.00",
          B: "2.5400",
          a: "64501.00",
          A: "1.8200",
        },
      });

      const parsed = parseBinanceMicrostructurePayload(bookTickerJson);
      expect(parsed).not.toBeNull();
      if (!parsed) return;

      expect(parsed.symbol).toBe("BTCUSDT");
      expect(parsed.bidPrice).toBe(64500.00);
      expect(parsed.bidQty).toBe(2.54);
      expect(parsed.askPrice).toBe(64501.00);
      expect(parsed.askQty).toBe(1.82);
      expect(parsed.updateId).toBe(400900200);

      // Mid-Price: (64500 + 64501) / 2 = 64500.5
      expect(parsed.midPrice).toBe(64500.5);
      expect(parsed.price).toBe(64500.5);

      // Spread BPS: ((64501 - 64500) / 64500.5) * 10000 = (1 / 64500.5) * 10000 = ~0.155 BPS
      expect(parsed.spreadBps).toBeGreaterThan(0.15);
      expect(parsed.spreadBps).toBeLessThan(0.16);
      expect(parsed.flags).toBe(1); // bitmask 1 = @bookTicker
    });

    it("deve deserializar payload de 24hr @ticker preservando métricas de variação diária e volume", () => {
      const tickerJson = JSON.stringify({
        stream: "ethusdt@ticker",
        data: {
          e: "24hrTicker",
          E: 1715000000000,
          s: "ETHUSDT",
          p: "120.50",
          P: "3.55",
          c: "3512.40",
          h: "3550.00",
          l: "3380.00",
          v: "45000.12",
          q: "156000000.50",
        },
      });

      const parsed = parseBinanceMicrostructurePayload(tickerJson);
      expect(parsed).not.toBeNull();
      if (!parsed) return;

      expect(parsed.symbol).toBe("ETHUSDT");
      expect(parsed.price).toBe(3512.40);
      expect(parsed.priceChange).toBe(120.50);
      expect(parsed.priceChangePercent).toBe(3.55);
      expect(parsed.high).toBe(3550.00);
      expect(parsed.low).toBe(3380.00);
      expect(parsed.volume).toBe(45000.12);
      expect(parsed.quoteVolume).toBe(156000000.50);
      expect(parsed.timestamp).toBe(1715000000000);
      expect(parsed.flags).toBe(2); // bitmask 2 = @ticker
    });

    it("deve mesclar estado quando recebe @bookTicker e depois @ticker para o mesmo par", () => {
      const stateMap: Record<string, any> = {};

      const bookJson = JSON.stringify({
        stream: "solusdt@bookTicker",
        data: {
          u: 555666,
          s: "SOLUSDT",
          b: "152.40",
          B: "100.0",
          a: "152.42",
          A: "80.0",
        },
      });

      const tickerJson = JSON.stringify({
        stream: "solusdt@ticker",
        data: {
          s: "SOLUSDT",
          c: "152.41",
          p: "5.20",
          P: "3.53",
          h: "155.00",
          l: "144.00",
          v: "98000.0",
          q: "14800000.0",
          E: 1715000005000,
        },
      });

      const bookParsed = parseBinanceMicrostructurePayload(bookJson, stateMap);
      expect(bookParsed).not.toBeNull();
      expect(bookParsed?.symbol).toBe("SOLUSDT");
      expect(bookParsed?.bidPrice).toBe(152.40);

      const tickerParsed = parseBinanceMicrostructurePayload(tickerJson, stateMap);
      expect(tickerParsed).not.toBeNull();
      // O tickerParsed agora possui tanto as cotações de livro (bid/ask) quanto o volume 24h
      expect(tickerParsed?.bidPrice).toBe(152.40);
      expect(tickerParsed?.askPrice).toBe(152.42);
      expect(tickerParsed?.volume).toBe(98000.0);
      expect(tickerParsed?.flags).toBe(3); // bitmask 1 | 2 = 3
    });

    it("deve detectar e sinalizar violações de rate limit da Binance (-1003 / HTTP 429)", () => {
      expect(isBinanceRateLimit(429, "Too many requests")).toBe(true);
      expect(isBinanceRateLimit(418, "IP Banned")).toBe(true);
      expect(isBinanceRateLimit(-1003, "Way too many requests")).toBe(true);
      expect(isBinanceRateLimit(1008, "Policy violation")).toBe(true);
      expect(isBinanceRateLimit(200, "OK")).toBe(false);

      const err = createSerializedWorkerError("Rate limit exceeded", "BTCUSDT", 429);
      expect(err.name).toBe("OrderBookFetchError");
      expect(err.isRateLimit).toBe(true);
      expect(err.statusCode).toBe(429);
      expect(err.symbol).toBe("BTCUSDT");
    });
  });

  describe("LockFreeSPSCQueue com 16-Stride Atômico", () => {
    it("deve enfileirar e desenfileirar slots de microestrutura de 16 elementos sem corrupção", () => {
      const queue = LockFreeSPSCQueue.create(1024, MICROSTRUCTURE_STRIDE);
      expect(queue.getStride()).toBe(16);
      expect(queue.getCapacity()).toBe(1024);

      const pushSlot = new Float64Array(MICROSTRUCTURE_STRIDE);
      pushSlot[SLOT_OFFSET_TIMESTAMP] = 1715000001000;
      pushSlot[SLOT_OFFSET_SYMBOL_ID] = 42;
      pushSlot[SLOT_OFFSET_PRICE] = 65000.25;
      pushSlot[SLOT_OFFSET_PRICE_CHANGE] = 1500.0;
      pushSlot[SLOT_OFFSET_PRICE_CHANGE_PCT] = 2.36;
      pushSlot[SLOT_OFFSET_HIGH] = 66000.0;
      pushSlot[SLOT_OFFSET_LOW] = 63000.0;
      pushSlot[SLOT_OFFSET_VOLUME] = 12000.5;
      pushSlot[SLOT_OFFSET_QUOTE_VOLUME] = 780000000.0;
      pushSlot[SLOT_OFFSET_BID_PRICE] = 65000.0;
      pushSlot[SLOT_OFFSET_BID_QTY] = 3.25;
      pushSlot[SLOT_OFFSET_ASK_PRICE] = 65000.5;
      pushSlot[SLOT_OFFSET_ASK_QTY] = 4.10;
      pushSlot[SLOT_OFFSET_SPREAD_BPS] = 0.0769;
      pushSlot[SLOT_OFFSET_FLAGS] = 1;
      pushSlot[SLOT_OFFSET_UPDATE_ID] = 99887766;

      const pushed = queue.push(pushSlot);
      expect(pushed).toBe(true);
      expect(queue.getMetrics().available).toBe(1);

      const readSlot = new Float64Array(MICROSTRUCTURE_STRIDE);
      const popped = queue.pop(readSlot);
      expect(popped).toBe(true);
      expect(queue.getMetrics().available).toBe(0);

      // Verificação bit-a-bit de cada elemento do slot
      expect(readSlot[SLOT_OFFSET_TIMESTAMP]).toBe(1715000001000);
      expect(readSlot[SLOT_OFFSET_SYMBOL_ID]).toBe(42);
      expect(readSlot[SLOT_OFFSET_PRICE]).toBe(65000.25);
      expect(readSlot[SLOT_OFFSET_PRICE_CHANGE]).toBe(1500.0);
      expect(readSlot[SLOT_OFFSET_PRICE_CHANGE_PCT]).toBe(2.36);
      expect(readSlot[SLOT_OFFSET_HIGH]).toBe(66000.0);
      expect(readSlot[SLOT_OFFSET_LOW]).toBe(63000.0);
      expect(readSlot[SLOT_OFFSET_VOLUME]).toBe(12000.5);
      expect(readSlot[SLOT_OFFSET_QUOTE_VOLUME]).toBe(780000000.0);
      expect(readSlot[SLOT_OFFSET_BID_PRICE]).toBe(65000.0);
      expect(readSlot[SLOT_OFFSET_BID_QTY]).toBe(3.25);
      expect(readSlot[SLOT_OFFSET_ASK_PRICE]).toBe(65000.5);
      expect(readSlot[SLOT_OFFSET_ASK_QTY]).toBe(4.10);
      expect(readSlot[SLOT_OFFSET_SPREAD_BPS]).toBe(0.0769);
      expect(readSlot[SLOT_OFFSET_FLAGS]).toBe(1);
      expect(readSlot[SLOT_OFFSET_UPDATE_ID]).toBe(99887766);
    });

    it("deve realizar drain em lote de 100 ticks mantendo a ordem sequencial FIFO", () => {
      const queue = LockFreeSPSCQueue.create(512, MICROSTRUCTURE_STRIDE);
      const tempSlot = new Float64Array(MICROSTRUCTURE_STRIDE);

      for (let i = 0; i < 100; i++) {
        tempSlot[SLOT_OFFSET_TIMESTAMP] = 1000 + i;
        tempSlot[SLOT_OFFSET_SYMBOL_ID] = i + 1;
        tempSlot[SLOT_OFFSET_PRICE] = 100 + i * 0.5;
        tempSlot[SLOT_OFFSET_BID_PRICE] = 100 + i * 0.5 - 0.05;
        tempSlot[SLOT_OFFSET_ASK_PRICE] = 100 + i * 0.5 + 0.05;
        queue.push(tempSlot);
      }

      expect(queue.getMetrics().available).toBe(100);

      const received: number[] = [];
      const scratch = new Float64Array(MICROSTRUCTURE_STRIDE);
      const count = queue.drain(150, (slot) => {
        received.push(slot[SLOT_OFFSET_TIMESTAMP]);
      }, scratch);

      expect(count).toBe(100);
      expect(queue.getMetrics().available).toBe(0);
      expect(received[0]).toBe(1000);
      expect(received[99]).toBe(1099);
    });
  });

  describe("BinanceWorkerManager com Microestrutura & Falhas", () => {
    it("deve inicializar com filas atômicas em 16-stride e drenar cotações completas de microestrutura", () => {
      let drainedTicker: any = null;
      const manager = new BinanceWorkerManager();

      manager.subscribe(["BTCUSDT"]);

      const ok = manager.simulateTick({
        symbol: "BTCUSDT",
        price: 64800.5,
        priceChange: 500,
        priceChangePercent: 0.78,
        high: 65200,
        low: 64000,
        volume: 8500,
        quoteVolume: 550000000,
        bidPrice: 64800.0,
        bidQty: 2.1,
        askPrice: 64801.0,
        askQty: 1.9,
        spreadBps: 0.154,
        midPrice: 64800.5,
        flags: 1,
        updateId: 12345678,
        timestamp: 1715000010000,
      });

      expect(ok).toBe(true);

      const count = manager.drainQueue((t) => {
        drainedTicker = t;
      });

      expect(count).toBe(1);
      expect(drainedTicker).not.toBeNull();
      expect(drainedTicker.symbol).toBe("BTCUSDT");
      expect(drainedTicker.price).toBe(64800.5);
      expect(drainedTicker.bidPrice).toBe(64800.0);
      expect(drainedTicker.bidQty).toBe(2.1);
      expect(drainedTicker.askPrice).toBe(64801.0);
      expect(drainedTicker.askQty).toBe(1.9);
      expect(drainedTicker.spreadBps).toBe(0.154);
      expect(drainedTicker.midPrice).toBe(64800.5);
      expect(drainedTicker.flags).toBe(1);
      expect(drainedTicker.updateId).toBe(12345678);

      manager.destroy();
    });

    it("deve despachar OrderBookFetchError com isRateLimit=true em caso de erro 429", () => {
      let caughtError: OrderBookFetchError | null = null;
      const manager = new BinanceWorkerManager(undefined, (err) => {
        caughtError = err;
      });

      manager.simulateError("IP banned by Binance", "ALL", 429);
      expect(caughtError).not.toBeNull();
      expect(caughtError?.name).toBe("OrderBookFetchError");
      expect(caughtError?.statusCode).toBe(429);
      expect(caughtError?.isRateLimit).toBe(true);

      manager.destroy();
    });

    it("deve processar mensagem de TRANSFER_BATCH (ArrayBuffer Transferable) desembalando microestrutura", () => {
      let receivedBatch: any[] = [];
      const manager = new BinanceWorkerManager((batch) => {
        receivedBatch = batch;
      });

      // Simula a recepção de um ArrayBuffer transferido pelo Worker
      const count = 2;
      const stride = 16;
      const buffer = new ArrayBuffer(count * stride * 8);
      const view = new Float64Array(buffer);

      // Item 0: BTCUSDT
      view[0 * stride + SLOT_OFFSET_TIMESTAMP] = 1715000020000;
      view[0 * stride + SLOT_OFFSET_SYMBOL_ID] = 1;
      view[0 * stride + SLOT_OFFSET_PRICE] = 65000.0;
      view[0 * stride + SLOT_OFFSET_PRICE_CHANGE] = 100.0;
      view[0 * stride + SLOT_OFFSET_PRICE_CHANGE_PCT] = 0.15;
      view[0 * stride + SLOT_OFFSET_HIGH] = 66000.0;
      view[0 * stride + SLOT_OFFSET_LOW] = 64000.0;
      view[0 * stride + SLOT_OFFSET_VOLUME] = 5000.0;
      view[0 * stride + SLOT_OFFSET_QUOTE_VOLUME] = 325000000.0;
      view[0 * stride + SLOT_OFFSET_BID_PRICE] = 64999.5;
      view[0 * stride + SLOT_OFFSET_BID_QTY] = 1.5;
      view[0 * stride + SLOT_OFFSET_ASK_PRICE] = 65000.5;
      view[0 * stride + SLOT_OFFSET_ASK_QTY] = 2.0;
      view[0 * stride + SLOT_OFFSET_SPREAD_BPS] = 0.1538;
      view[0 * stride + SLOT_OFFSET_FLAGS] = 1;
      view[0 * stride + SLOT_OFFSET_UPDATE_ID] = 778899;

      // Item 1: ETHUSDT
      view[1 * stride + SLOT_OFFSET_TIMESTAMP] = 1715000020000;
      view[1 * stride + SLOT_OFFSET_SYMBOL_ID] = 2;
      view[1 * stride + SLOT_OFFSET_PRICE] = 3500.0;
      view[1 * stride + SLOT_OFFSET_PRICE_CHANGE] = -25.0;
      view[1 * stride + SLOT_OFFSET_PRICE_CHANGE_PCT] = -0.71;
      view[1 * stride + SLOT_OFFSET_HIGH] = 3580.0;
      view[1 * stride + SLOT_OFFSET_LOW] = 3450.0;
      view[1 * stride + SLOT_OFFSET_VOLUME] = 20000.0;
      view[1 * stride + SLOT_OFFSET_QUOTE_VOLUME] = 70000000.0;
      view[1 * stride + SLOT_OFFSET_BID_PRICE] = 3499.8;
      view[1 * stride + SLOT_OFFSET_BID_QTY] = 10.0;
      view[1 * stride + SLOT_OFFSET_ASK_PRICE] = 3500.2;
      view[1 * stride + SLOT_OFFSET_ASK_QTY] = 12.0;
      view[1 * stride + SLOT_OFFSET_SPREAD_BPS] = 0.1143;
      view[1 * stride + SLOT_OFFSET_FLAGS] = 1;
      view[1 * stride + SLOT_OFFSET_UPDATE_ID] = 889900;

      manager.handleWorkerMessage({
        type: "TRANSFER_BATCH",
        count,
        stride,
        buffer,
        symbolMap: {
          BTCUSDT: 1,
          ETHUSDT: 2,
        },
      });

      expect(receivedBatch.length).toBe(2);
      expect(receivedBatch[0].symbol).toBe("BTCUSDT");
      expect(receivedBatch[0].bidPrice).toBe(64999.5);
      expect(receivedBatch[0].askPrice).toBe(65000.5);
      expect(receivedBatch[0].spreadBps).toBe(0.1538);

      expect(receivedBatch[1].symbol).toBe("ETHUSDT");
      expect(receivedBatch[1].bidPrice).toBe(3499.8);
      expect(receivedBatch[1].askPrice).toBe(3500.2);
      expect(receivedBatch[1].spreadBps).toBe(0.1143);

      manager.destroy();
    });
  });

  describe("Conexão Direta Peer-to-Peer (MessagePort) com Render Worker (Zero-Hop Pipeline)", () => {
    it("deve interconectar BinanceWorkerManager e OffscreenChartController via MessageChannel", () => {
      const manager = new BinanceWorkerManager({
        symbols: ["BTCUSDT"],
        queueCapacity: 64,
        spscStride: 16,
      });

      const controller = new OffscreenChartController();

      const channel = OffscreenChartController.connectWorkers(manager, controller);
      expect(channel).not.toBeNull();

      const metrics = controller.getPeerMetrics();
      expect(metrics.isPeerConnected).toBe(true);
      expect(metrics.hasAtomicQueue).toBe(true);

      manager.destroy();
      controller.destroy();
    });

    it("deve receber cotações via canal Peer-to-Peer sem acordar a Main Thread e atualizar getLastPeerTick()", async () => {
      const controller = new OffscreenChartController();

      let callbackReceived: any = null;
      const unbind = controller.onPeerTick((t) => {
        callbackReceived = t;
      });

      // Cria um MessageChannel simulando a conexão entre Ingestion Worker e Render Controller
      const channel = new MessageChannel();
      controller.connectPeerPort(channel.port2);

      const mockTicker = {
        symbol: "BTCUSDT",
        price: 65120.5,
        bidPrice: 65120.0,
        bidQty: 3.5,
        askPrice: 65121.0,
        askQty: 4.2,
        spreadBps: 0.1535,
        midPrice: 65120.5,
        flags: 3,
        updateId: 998877,
        timestamp: Date.now(),
      };

      // Despacha na porta 1 (como o Ingestion Worker faria)
      channel.port1.postMessage({
        type: "PEER_TICK",
        ticker: mockTicker,
      });

      // Aguarda o ciclo de evento assíncrono do MessagePort
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(controller.getLastPeerTick()).not.toBeNull();
      expect(controller.getLastPeerTick().symbol).toBe("BTCUSDT");
      expect(controller.getLastPeerTick().price).toBe(65120.5);
      expect(controller.getLastPeerTick().bidPrice).toBe(65120.0);
      expect(controller.getLastPeerTick().askPrice).toBe(65121.0);
      expect(controller.getLastPeerTick().spreadBps).toBe(0.1535);

      expect(callbackReceived).not.toBeNull();
      expect(callbackReceived.symbol).toBe("BTCUSDT");
      expect(callbackReceived.price).toBe(65120.5);

      unbind();
      channel.port1.close();
      channel.port2.close();
      controller.destroy();
    });

    it("deve fornecer utilitários connectChartToWorker e getGlobalWorkerManager integrados ao hook", () => {
      expect(typeof getGlobalWorkerManager).toBe("function");
      expect(typeof connectChartToWorker).toBe("function");

      const controller = new OffscreenChartController();
      // Sem globalWorkerManager ativo no início, deve retornar null com segurança
      const channel = connectChartToWorker(controller);
      expect(channel).toBeNull();

      controller.destroy();
    });
  });
});

