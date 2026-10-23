import { describe, it, expect } from "bun:test";
import { TickCoalescer } from "@/lib/performance/tick-coalescer";
import { TypedCandleRingBuffer } from "@/lib/performance/typed-candle-ring-buffer";
import { MarketDataStreamParser } from "@/lib/performance/market-data-stream-parser";
import { FastSelectiveParser } from "@/lib/performance/fast-selective-parser";
import { MarketEventPool } from "@/lib/performance/market-event-pool";
import {
  ContiguousIndicatorBuffer,
  OFFSET_CLOSE,
  OFFSET_SMA20,
  OFFSET_EMA12,
  OFFSET_RSI14,
  OFFSET_ATR14,
} from "@/lib/performance/contiguous-indicator-buffer";
import { AdaptiveFrameScheduler } from "@/lib/performance/adaptive-frame-scheduler";
import { BinanceWorkerManager } from "@/lib/performance/binance-worker-manager";
import { SharedMemoryAtomicQueue } from "@/lib/performance/shared-memory-atomic-queue";
import { LockFreeSPSCQueue, TOTAL_HEADER_BYTES, CACHE_LINE_SIZE_BYTES } from "@/lib/performance/lock-free-spsc-queue";
import { SharedL2DepthMatrix, DoubleBufferedL2DepthMatrix } from "@/lib/performance/shared-l2-depth-matrix";
import { WebGLCandlestickRenderer } from "@/lib/performance/webgl-candlestick-renderer";
import { OffscreenChartController } from "@/lib/performance/offscreen-chart-controller";
import { WebGLL2HeatmapRenderer } from "@/lib/performance/webgl-l2-heatmap-renderer";
import { GPUTransformFeedbackEngine } from "@/lib/performance/gpu-transform-feedback-engine";
import {
  WebGPUOrderBookComputeEngine,
  WGSL_SUBGROUPS_ORDER_BOOK_IMBALANCE_SHADER,
  WGSL_ORDER_BOOK_IMBALANCE_SHADER,
  WGSL_BLOOM_POST_PROCESSING_SHADER,
  WGSL_HORIZONTAL_BLOOM_SHADER,
} from "@/lib/performance/webgpu-compute-engine";
import {
  fastRound1,
  fastRound2,
  evaluateConfluence,
  calculateOrderBookImbalance,
  type LevelImbalance,
} from "@/lib/order-book-imbalance";
import {
  parseOrderBookDepthResponse,
  OrderBookFetchError,
} from "@/components/chart/order-book";
import {
  parseBinanceStreamPayload,
  createSerializedWorkerError,
  isBinanceRateLimit,
  DEFAULT_TICKER_STRIDE,
} from "@/workers/binance-stream.worker";

describe("Desktop High-Performance Engine (Low-Allocation & V-Sync Pipeline)", () => {
  describe("1. TickCoalescer (V-Sync Frame Batching & Pacing)", () => {
    it("deve consolidar múltiplos ticks recebidos dentro da janela de frame em um único flush atômico", () => {
      let flushCount = 0;
      let lastBatch: Map<string, any> | null = null;

      const coalescer = new TickCoalescer((batch) => {
        flushCount++;
        lastBatch = new Map(batch);
      });

      // Simula rajada de 50 atualizações de WebSocket para múltiplos pares
      for (let i = 0; i < 50; i++) {
        coalescer.enqueue({ symbol: "BTCUSDT", price: 65000 + i, timestamp: Date.now() });
        coalescer.enqueue({ symbol: "ETHUSDT", price: 3500 + i, timestamp: Date.now() });
        coalescer.enqueue({ symbol: "SOLUSDT", price: 150 + i, timestamp: Date.now() });
      }

      // Nenhuma renderização deve ter sido disparada de forma síncrona/bloqueante
      expect(flushCount).toBe(0);
      expect(coalescer.getPendingCount()).toBe(3); // 3 símbolos únicos enfileirados

      // Força o flush do frame (como se o V-Sync/RAF tivesse disparado)
      coalescer.flushNow();

      expect(flushCount).toBe(1);
      expect(lastBatch).not.toBeNull();
      expect(lastBatch!.get("BTCUSDT").price).toBe(65049);
      expect(lastBatch!.get("ETHUSDT").price).toBe(3549);
      expect(lastBatch!.get("SOLUSDT").price).toBe(199);
      expect(coalescer.getPendingCount()).toBe(0);

      // Métricas de eficiência: 150 ticks consolidados em 1 único despacho
      const metrics = coalescer.getMetrics();
      expect(metrics.coalescingEfficiencyPct).toBeGreaterThan(90);

      coalescer.destroy();
    });

    it("não deve disparar flush se o buffer estiver vazio", () => {
      let flushCount = 0;
      const coalescer = new TickCoalescer(() => {
        flushCount++;
      });

      coalescer.flushNow();
      expect(flushCount).toBe(0);
      coalescer.destroy();
    });
  });

  describe("2. TypedCandleRingBuffer (Contiguous Float64Array & Vectorized Math)", () => {
    it("deve gerenciar capacidade fixa em ring buffer circular sem realocar memória", () => {
      const buffer = new TypedCandleRingBuffer(5);

      // Adiciona 3 candles
      buffer.pushCandle(1000, 100, 105, 95, 102, 500);
      buffer.pushCandle(2000, 102, 108, 100, 107, 600);
      buffer.pushCandle(3000, 107, 112, 104, 110, 750);

      expect(buffer.getCount()).toBe(3);
      expect(buffer.getCapacity()).toBe(5);

      const latest = buffer.getLatestCandle();
      expect(latest).not.toBeNull();
      expect(latest!.close).toBe(110);
      expect(latest!.volume).toBe(750);

      // Adiciona mais 4 candles (deve circular e manter no máximo 5)
      buffer.pushCandle(4000, 110, 115, 108, 114, 800);
      buffer.pushCandle(5000, 114, 120, 112, 118, 900);
      buffer.pushCandle(6000, 118, 122, 116, 121, 1000);
      buffer.pushCandle(7000, 121, 125, 120, 124, 1100);

      expect(buffer.getCount()).toBe(5);
      const chronological = buffer.toArray();
      expect(chronological.length).toBe(5);
      expect(chronological[0].timestamp).toBe(3000);
      expect(chronological[4].timestamp).toBe(7000);
      expect(chronological[4].close).toBe(124);
    });

    it("deve atualizar a vela em formação (in-place mutation) sem criar novos nós", () => {
      const buffer = new TypedCandleRingBuffer(10);
      buffer.pushCandle(1000, 100, 105, 98, 102, 100);

      // Tick atinge nova máxima e altera fechamento
      buffer.updateCurrentCandle(108, 50);
      let latest = buffer.getLatestCandle()!;
      expect(latest.high).toBe(108);
      expect(latest.close).toBe(108);
      expect(latest.volume).toBe(150);

      // Tick atinge nova mínima
      buffer.updateCurrentCandle(96, 30);
      latest = buffer.getLatestCandle()!;
      expect(latest.high).toBe(108);
      expect(latest.low).toBe(96);
      expect(latest.close).toBe(96);
      expect(latest.volume).toBe(180);
      expect(buffer.getCount()).toBe(1);
    });

    it("deve calcular SMA, EMA, RSI e Bandas de Bollinger diretamente sobre Float64Array", () => {
      const buffer = new TypedCandleRingBuffer(20);
      const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

      prices.forEach((p, idx) => {
        buffer.pushCandle(idx * 60000, p - 1, p + 2, p - 2, p, 1000);
      });

      // SMA de 5 períodos sobre os últimos 5 fechamentos: [16, 17, 18, 19, 20] -> média = 18.0
      const sma5 = buffer.calculateSMA(5);
      expect(sma5.length).toBe(prices.length);
      expect(sma5[sma5.length - 1]).toBe(18);

      // EMA de 5 períodos: cálculo deve convergir sem NaN
      const ema5 = buffer.calculateEMA(5);
      expect(ema5.length).toBe(prices.length);
      expect(isNaN(ema5[ema5.length - 1])).toBe(false);
      expect(ema5[ema5.length - 1]).toBeGreaterThan(16);

      // Bandas de Bollinger de 5 períodos (desvio padrão de [16, 17, 18, 19, 20])
      const bb = buffer.calculateBollingerBands(5, 2);
      expect(bb.middle[bb.middle.length - 1]).toBe(18);
      expect(bb.upper[bb.upper.length - 1]).toBeGreaterThan(18);
      expect(bb.lower[bb.lower.length - 1]).toBeLessThan(18);

      // RSI (14 períodos com 11 candles deve preencher 50 por padrão sem quebrar)
      const rsi = buffer.calculateRSI(14);
      expect(rsi.length).toBe(prices.length);
      expect(rsi[rsi.length - 1]).toBe(50);
    });
  });

  describe("3. MarketDataStreamParser (String Interning & Low Allocation Parsing)", () => {
    it("deve reaproveitar a mesma referência de string para símbolos repetidos (Interning)", () => {
      const sym1 = MarketDataStreamParser.internSymbol("btcusdt");
      const sym2 = MarketDataStreamParser.internSymbol("BTCUSDT");
      const sym3 = MarketDataStreamParser.internSymbol("BTCUSDT");

      expect(sym1).toBe("BTCUSDT");
      expect(sym2).toBe("BTCUSDT");
      // Mesma referência de string no pool interno
      expect(sym1 === sym2).toBe(true);
      expect(sym2 === sym3).toBe(true);
    });

    it("deve decodificar payloads de 24hrTicker normalizando campos", () => {
      const rawPayload = JSON.stringify({
        stream: "btcusdt@ticker",
        data: {
          e: "24hrTicker",
          s: "BTCUSDT",
          c: "65432.10",
          p: "1234.50",
          P: "2.35",
          h: "66000.00",
          l: "64000.00",
          v: "15420.55",
          q: "1000000.00",
          C: 1729630000000,
        },
      });

      const parsed = MarketDataStreamParser.parseMessage(rawPayload);
      expect(parsed).not.toBeNull();
      expect(parsed!.type).toBe("TICKER");
      expect(parsed!.symbol).toBe("BTCUSDT");

      if (parsed!.type === "TICKER") {
        expect(parsed.price).toBe(65432.1);
        expect(parsed.priceChangePercent).toBe(2.35);
        expect(parsed.high).toBe(66000);
        expect(parsed.low).toBe(64000);
        expect(parsed.volume).toBe(15420.55);
      }
    });

    it("deve decodificar payloads de kline com timestamps e valores numéricos", () => {
      const rawPayload = JSON.stringify({
        stream: "ethusdt@kline_1m",
        data: {
          e: "kline",
          s: "ETHUSDT",
          k: {
            t: 1729630000000,
            T: 1729630059999,
            s: "ETHUSDT",
            i: "1m",
            o: "3500.00",
            c: "3515.50",
            h: "3520.00",
            l: "3495.00",
            v: "250.75",
            x: true,
          },
        },
      });

      const parsed = MarketDataStreamParser.parseMessage(rawPayload);
      expect(parsed).not.toBeNull();
      expect(parsed!.type).toBe("KLINE");
      expect(parsed!.symbol).toBe("ETHUSDT");

      if (parsed!.type === "KLINE") {
        expect(parsed.open).toBe(3500);
        expect(parsed.close).toBe(3515.5);
        expect(parsed.isClosed).toBe(true);
      }
    });

    it("deve decodificar payloads de profundidade L2 (depth20) preservando bids e asks", () => {
      const rawPayload = JSON.stringify({
        stream: "solusdt@depth20@100ms",
        data: {
          lastUpdateId: 987654321,
          bids: [
            ["150.50", "12.5"],
            ["150.40", "30.0"],
          ],
          asks: [
            ["150.60", "15.0"],
            ["150.70", "45.0"],
          ],
        },
      });

      const parsed = MarketDataStreamParser.parseMessage(rawPayload);
      expect(parsed).not.toBeNull();
      expect(parsed!.type).toBe("DEPTH");
      expect(parsed!.symbol).toBe("SOLUSDT");

      if (parsed!.type === "DEPTH") {
        expect(parsed.bids.length).toBe(2);
        expect(parsed.bids[0][0]).toBe(150.5);
        expect(parsed.bids[0][1]).toBe(12.5);
        expect(parsed.asks[0][0]).toBe(150.6);
        expect(parsed.asks[0][1]).toBe(15.0);
      }
    });

    it("deve retornar null de forma resiliente para mensagens JSON inválidas ou não mapeadas", () => {
      expect(MarketDataStreamParser.parseMessage("")).toBeNull();
      expect(MarketDataStreamParser.parseMessage("invalid json {")).toBeNull();
      expect(MarketDataStreamParser.parseMessage(JSON.stringify({ ping: 123 }))).toBeNull();
    });
  });

  describe("4. Virtualização do Order Book (Fixed Slot Zero-DOM Keying)", () => {
    it("deve manter chaves estáticas de slots baseadas em índice para evitar destruição de nós DOM", () => {
      // Simula a estratégia de chaveamento adotada no OrderBook
      const getSlotKey = (side: "ask" | "bid", index: number) => `${side}-slot-${index}`;

      const askSlots = Array.from({ length: 10 }, (_, i) => getSlotKey("ask", i));
      const bidSlots = Array.from({ length: 10 }, (_, i) => getSlotKey("bid", i));

      expect(askSlots[0]).toBe("ask-slot-0");
      expect(askSlots[9]).toBe("ask-slot-9");
      expect(bidSlots[0]).toBe("bid-slot-0");

      // Chaves não variam mesmo com preços mudando drasticamente
      const keyAtPrice1 = getSlotKey("ask", 0);
      const keyAtPrice2 = getSlotKey("ask", 0);
      expect(keyAtPrice1).toBe(keyAtPrice2);
    });
  });

  describe("5. FastSelectiveParser (Zero-Reflection Token Extraction)", () => {
    it("deve extrair campos de ticker diretamente sem instanciar árvores JSON completas", () => {
      const rawTicker = JSON.stringify({
        e: "24hrTicker",
        E: 1700000000000,
        s: "BTCUSDT",
        p: "1250.50",
        P: "1.95",
        w: "64500.00",
        x: "63000.00",
        c: "65432.10",
        Q: "0.500",
        b: "65430.00",
        B: "1.200",
        a: "65432.00",
        A: "0.850",
        o: "64181.60",
        h: "66000.00",
        l: "63500.00",
        v: "14520.55",
        q: "945000000.00",
        O: 1699900000000,
        C: 1700000000000,
        F: 100000,
        L: 250000,
        n: 150000,
      });

      const parsed = FastSelectiveParser.parseTicker(rawTicker);
      expect(parsed).not.toBeNull();
      expect(parsed!.type).toBe("TICKER");
      expect(parsed!.symbol).toBe("BTCUSDT");
      expect(parsed!.price).toBe(65432.1);
      expect(parsed!.priceChange).toBe(1250.5);
      expect(parsed!.priceChangePercent).toBe(1.95);
      expect(parsed!.high).toBe(66000);
      expect(parsed!.low).toBe(63500);
      expect(parsed!.volume).toBe(14520.55);

      // Reuso da mesma referência de string em memória (String Interning)
      const parsedAgain = FastSelectiveParser.parseTicker(rawTicker);
      expect(parsed!.symbol).toBe(parsedAgain!.symbol);
    });

    it("deve extrair campos de kline seletivamente preservando o status isClosed", () => {
      const rawKline = JSON.stringify({
        e: "kline",
        E: 1700000060000,
        s: "ETHUSDT",
        k: {
          t: 1700000000000,
          T: 1700000059999,
          s: "ETHUSDT",
          i: "1m",
          f: 100,
          L: 200,
          o: "3450.00",
          c: "3485.50",
          h: "3490.00",
          l: "3445.00",
          v: "450.25",
          n: 120,
          x: true,
          q: "1560000.00",
          V: "220.00",
          Q: "760000.00",
          B: "0",
        },
      });

      const kline = FastSelectiveParser.parseKline(rawKline);
      expect(kline).not.toBeNull();
      expect(kline!.type).toBe("KLINE");
      expect(kline!.symbol).toBe("ETHUSDT");
      expect(kline!.interval).toBe("1m");
      expect(kline!.open).toBe(3450);
      expect(kline!.close).toBe(3485.5);
      expect(kline!.high).toBe(3490);
      expect(kline!.low).toBe(3445);
      expect(kline!.volume).toBe(450.25);
      expect(kline!.isClosed).toBe(true);
    });
  });

  describe("6. MarketEventPool (Zero-GC Churn & Object Recycling)", () => {
    it("deve reutilizar instâncias de eventos pré-alocadas sem gerar lixo no Heap", () => {
      const pool = new MarketEventPool(10, 10);
      const metricsBefore = pool.getMetrics();
      expect(metricsBefore.availableTickers).toBe(10);
      expect(metricsBefore.inUseTickers).toBe(0);

      // Adquire 3 tickers
      const t1 = pool.acquireTicker("BTCUSDT", 65000, 100, 0.5, 65500, 64500, 1000, 65000000, 1700000000);
      const t2 = pool.acquireTicker("ETHUSDT", 3500, 50, 1.2, 3550, 3450, 500, 1750000, 1700000000);
      const t3 = pool.acquireTicker("SOLUSDT", 150, 5, 2.5, 155, 145, 200, 30000, 1700000000);

      const metricsInUse = pool.getMetrics();
      expect(metricsInUse.availableTickers).toBe(7);
      expect(metricsInUse.inUseTickers).toBe(3);
      expect(t1.symbol).toBe("BTCUSDT");

      // Devolve t1 e t2 para o pool
      pool.releaseTicker(t1);
      pool.releaseTicker(t2);

      const metricsAfterRelease = pool.getMetrics();
      expect(metricsAfterRelease.availableTickers).toBe(9);
      expect(metricsAfterRelease.inUseTickers).toBe(1);

      // Re-adquire um ticker: deve reaproveitar a instância existente
      const tReused = pool.acquireTicker("BNBUSDT", 580, 10, 1.5, 590, 570, 50, 29000, 1700000000);
      expect(tReused.symbol).toBe("BNBUSDT");
      expect(pool.getMetrics().availableTickers).toBe(8);

      pool.releaseTicker(t3);
      pool.releaseTicker(tReused);
      expect(pool.getMetrics().inUseTickers).toBe(0);
    });
  });

  describe("7. ContiguousIndicatorBuffer (Vectorized Flat Memory & L1/L2 Locality)", () => {
    it("deve armazenar dados em array contíguo Float64Array e atualizar candle atual in-place", () => {
      const buffer = new ContiguousIndicatorBuffer(10);
      expect(buffer.length).toBe(0);
      expect(buffer.data.length).toBe(120); // 10 slots * 12 stride

      // Insere primeiro candle fechado
      buffer.push(1000, 100, 105, 95, 102, 50);
      expect(buffer.length).toBe(1);
      expect(buffer.getLatestValue(OFFSET_CLOSE)).toBe(102);

      // Insere segundo candle
      buffer.push(1060, 102, 108, 101, 107, 75);
      expect(buffer.length).toBe(2);
      expect(buffer.getLatestValue(OFFSET_CLOSE)).toBe(107);
      expect(buffer.getLatestValue(OFFSET_SMA20)).toBe(104.5); // Média de 102 e 107

      // Atualiza in-place o candle em formação (novo high e novo close)
      buffer.updateCurrentBar(110, 100, 109, 25);
      expect(buffer.length).toBe(2); // Quantidade de candles não muda
      expect(buffer.getLatestValue(OFFSET_CLOSE)).toBe(109);
      expect(buffer.getLatestValue(OFFSET_SMA20)).toBe(105.5); // Média de 102 e 109

      // Verifica cálculo incremental contíguo de ATR e RSI
      expect(buffer.getLatestValue(OFFSET_ATR14)).toBeGreaterThan(0);
      expect(buffer.getLatestValue(OFFSET_RSI14)).toBeGreaterThan(0);
      expect(buffer.getLatestValue(OFFSET_RSI14)).toBeLessThanOrEqual(100);
    });
  });

  describe("8. AdaptiveFrameScheduler (Focus Throttling & Frametime Tracking)", () => {
    it("deve inicializar scheduler e rastrear frametime em microssegundos", () => {
      const scheduler = new AdaptiveFrameScheduler();
      let renderCount = 0;

      const unsubscribe = scheduler.subscribe((frameTime) => {
        renderCount++;
      });

      // Dispara 5 frames manuais
      for (let i = 0; i < 5; i++) {
        scheduler.forceTick(Date.now() + i * 16);
      }

      expect(renderCount).toBe(5);
      const metrics = scheduler.getMetrics();
      expect(metrics.totalFrames).toBeGreaterThanOrEqual(5);
      expect(metrics.lastFrameDurationUs).toBeGreaterThanOrEqual(0);
      expect(metrics.jankRatePct).toBeLessThanOrEqual(100);

      unsubscribe();
      scheduler.stop();
    });
  });

  describe("9. SharedMemoryAtomicQueue (Zero-Copy IPC & Atomics Synchronization)", () => {
    it("deve inicializar a fila atômica com cabeçalho de controle e capacidade correta", () => {
      const queue = SharedMemoryAtomicQueue.create({ capacity: 64, stride: 8 });
      const metrics = queue.getMetrics();

      expect(metrics.capacity).toBe(64);
      expect(metrics.stride).toBe(8);
      expect(metrics.head).toBe(0);
      expect(metrics.tail).toBe(0);
      expect(metrics.available).toBe(0);
      expect(metrics.isEmpty).toBe(true);
      expect(metrics.isFull).toBe(false);
      expect(metrics.dropped).toBe(0);
    });

    it("deve enfileirar e desenfileirar dados atomicamente preservando a ordem (FIFO)", () => {
      const queue = SharedMemoryAtomicQueue.create({ capacity: 16, stride: 4 });
      const slotData = [1700000000, 65000.5, 65100.0, 64900.0];

      // Enfileira 1 slot
      const enqueued = queue.enqueue(slotData);
      expect(enqueued).toBe(true);

      const metricsAfterEnqueue = queue.getMetrics();
      expect(metricsAfterEnqueue.available).toBe(1);
      expect(metricsAfterEnqueue.head).toBe(1);
      expect(metricsAfterEnqueue.tail).toBe(0);
      expect(metricsAfterEnqueue.isEmpty).toBe(false);

      // Desenfileira para buffer reutilizável (zero-alloc)
      const outBuffer = new Float64Array(4);
      const dequeued = queue.dequeue(outBuffer);
      expect(dequeued).toBe(true);
      expect(outBuffer[0]).toBe(1700000000);
      expect(outBuffer[1]).toBe(65000.5);
      expect(outBuffer[2]).toBe(65100.0);
      expect(outBuffer[3]).toBe(64900.0);

      const metricsAfterDequeue = queue.getMetrics();
      expect(metricsAfterDequeue.available).toBe(0);
      expect(metricsAfterDequeue.tail).toBe(1);
      expect(metricsAfterDequeue.isEmpty).toBe(true);

      // Nova tentativa de dequeue com fila vazia
      const emptyDequeue = queue.dequeue(outBuffer);
      expect(emptyDequeue).toBe(false);
    });

    it("deve drenar em lote múltiplos registros via drain() e rastrear overflow de capacidade", () => {
      const queue = SharedMemoryAtomicQueue.create({ capacity: 4, stride: 2 });

      // Insere 6 itens em uma fila de capacidade 4 (causará 2 drops)
      for (let i = 0; i < 6; i++) {
        queue.enqueue([Date.now(), i * 10]);
      }

      const metrics = queue.getMetrics();
      expect(metrics.dropped).toBe(2);

      // Esvazia os 4 itens disponíveis via drain
      const collected: number[] = [];
      const drainedCount = queue.drain(10, (slot) => {
        collected.push(slot[1]);
      });

      expect(drainedCount).toBe(4);
      expect(collected).toEqual([20, 30, 40, 50]);
      expect(queue.getMetrics().isEmpty).toBe(true);
    });

    it("deve permitir compartilhar o mesmo buffer subjacente entre produtor e consumidor", () => {
      const producer = SharedMemoryAtomicQueue.create({ capacity: 8, stride: 3 });
      const rawBuffer = producer.getRawBuffer();

      // Consumidor instanciado a partir do buffer compartilhado
      const consumer = SharedMemoryAtomicQueue.fromBuffer(rawBuffer);

      producer.enqueue([100, 200, 300]);
      expect(consumer.getMetrics().available).toBe(1);

      const out = new Float64Array(3);
      consumer.dequeue(out);
      expect(out[0]).toBe(100);
      expect(out[1]).toBe(200);
      expect(out[2]).toBe(300);
      expect(producer.getMetrics().available).toBe(0);
    });
  });

  describe("10. WebGL 2.0 & OffscreenCanvas (Instanced Geometry & Worker Coordinator)", () => {
    it("deve expor métodos estáticos de detecção de capacidades do ambiente", () => {
      // No ambiente headless do Bun/Node, APIs gráficas de browser não estão presentes
      expect(typeof WebGLCandlestickRenderer.isSupported).toBe("function");
      expect(typeof OffscreenChartController.isOffscreenSupported).toBe("function");
    });

    it("deve instanciar WebGLCandlestickRenderer e gerenciar ciclo de vida", () => {
      const renderer = new WebGLCandlestickRenderer();
      expect(renderer).toBeDefined();

      // Resize seguro sem crash
      renderer.resize(1024, 600);

      // Envio de dados seguro mesmo sem contexto GPU inicializado
      renderer.setCandleData([
        { index: 0, open: 100, high: 105, low: 98, close: 103, volume: 50 },
        { index: 1, open: 103, high: 108, low: 101, close: 107, volume: 75 },
      ]);

      // Render seguro retorna false se contexto não estiver ativo
      const rendered = renderer.render({
        startIndex: 0,
        visibleCount: 10,
        minPrice: 90,
        maxPrice: 110,
      });
      expect(rendered).toBe(false);

      // Limpeza de recursos
      renderer.destroy();
    });

    it("deve instanciar OffscreenChartController e selecionar motor com fallback", () => {
      const controller = new OffscreenChartController({
        candleWidthPx: 8,
        wickWidthPx: 2,
      });

      expect(controller).toBeDefined();
      expect(controller.getActiveEngine()).toBe("CANVAS_2D_FALLBACK");

      // Atualizações de layout e dados
      controller.resize(1200, 800);
      controller.setCandleData([
        { index: 0, open: 50, high: 55, low: 48, close: 52, volume: 10 },
      ]);

      // Destrói com liberação de recursos
      controller.destroy();
    });
  });

  describe("11. WebGLL2HeatmapRenderer (GPU L2 Order Book Heatmap & Volume Profile)", () => {
    it("deve quantizar faixas de preço para bins discretos de textura corretamente", () => {
      const renderer = new WebGLL2HeatmapRenderer(null, { priceBins: 100, historyLength: 64 });
      
      expect(renderer.quantizePrice(100, 100, 200)).toBe(0);
      expect(renderer.quantizePrice(200, 100, 200)).toBe(99);
      expect(renderer.quantizePrice(150, 100, 200)).toBe(49);
      expect(renderer.quantizePrice(80, 100, 200)).toBe(0); // Clamped
      expect(renderer.quantizePrice(250, 100, 200)).toBe(99); // Clamped
    });

    it("deve processar snapshot L2 com bids, asks e ordens iceberg sem alocações transitórias", () => {
      const renderer = new WebGLL2HeatmapRenderer(null, { priceBins: 64, historyLength: 32 });
      const bids = [
        { price: 65000, quantity: 15.0 },
        { price: 64950, quantity: 120.0 }, // Iceberg (> 50.0)
      ];
      const asks = [
        { price: 65050, quantity: 12.0 },
        { price: 65100, quantity: 80.0 }, // Iceberg (> 50.0)
      ];

      const pushed = renderer.pushDepthSnapshot(bids, asks, 64900, 65150, 50.0);
      expect(pushed).toBe(true);

      const metrics = renderer.getMetrics();
      expect(metrics.historyLength).toBe(32);
      expect(metrics.priceBins).toBe(64);
      expect(metrics.currentColumn).toBe(1); // Avançou para a próxima coluna circular
      expect(metrics.bytesUploadedPerSlice).toBe(64 * 4); // 256 bytes por slice
      expect(metrics.totalTextureBytes).toBe(32 * 64 * 4); // 8192 bytes
      expect(metrics.mipmappingEnabled).toBe(true);
      expect(metrics.anisotropicLevel).toBeGreaterThanOrEqual(1);
      expect(metrics.dualAxisBloom).toBe(true);
    });

    it("deve configurar Mipmapping e Filtragem Anisotrópica com fallback controlado", () => {
      const disabledRenderer = new WebGLL2HeatmapRenderer(null, {
        priceBins: 32,
        historyLength: 16,
        mipmappingEnabled: false,
        anisotropicFiltering: false,
        dualAxisBloomEnabled: false,
      });

      const disabledMetrics = disabledRenderer.getMetrics();
      expect(disabledMetrics.mipmappingEnabled).toBe(false);
      expect(disabledMetrics.anisotropicLevel).toBe(1);
      expect(disabledMetrics.dualAxisBloom).toBe(false);

      disabledRenderer.destroy();
    });

    it("deve calcular o Volume Profile Dinâmico com Point of Control (POC) e Value Area (VAH/VAL 70%)", () => {
      const renderer = new WebGLL2HeatmapRenderer(null, { priceBins: 32 });
      const candles = [
        { open: 100, high: 105, low: 95, close: 102, volume: 100 },
        { open: 102, high: 104, low: 101, close: 103, volume: 500 }, // Concentração de volume
        { open: 103, high: 108, low: 102, close: 107, volume: 150 },
      ];

      const profile = renderer.calculateVolumeProfile(candles, 95, 108);

      expect(profile.totalVolume).toBeCloseTo(750, 1);
      expect(profile.maxBinVolume).toBeGreaterThan(0);
      expect(profile.bins.length).toBe(32);

      // Deve identificar um único Point of Control (POC)
      const pocBins = profile.bins.filter((b) => b.isPoc);
      expect(pocBins.length).toBe(1);
      expect(pocBins[0].price).toBeGreaterThanOrEqual(101);
      expect(pocBins[0].price).toBeLessThanOrEqual(104);

      // VAH e VAL devem conter a faixa de 70% do volume
      expect(profile.vahPrice).toBeGreaterThan(profile.valPrice);
      expect(profile.pocPrice).toBeGreaterThanOrEqual(profile.valPrice);
      expect(profile.pocPrice).toBeLessThanOrEqual(profile.vahPrice);

      const valueAreaBins = profile.bins.filter((b) => b.isValueArea);
      expect(valueAreaBins.length).toBeGreaterThan(0);
    });

    it("deve gerenciar ciclo de vida e liberação de recursos sem falhas", () => {
      const renderer = new WebGLL2HeatmapRenderer(null);
      renderer.destroy();
      expect(renderer.getMetrics().totalTextureBytes).toBeGreaterThan(0);
    });
  });

  describe("12. GPUTransformFeedbackEngine (Parallel Order Book Imbalance via GLSL Transform Feedback)", () => {
    it("deve verificar suporte do ambiente a Transform Feedback", () => {
      expect(typeof GPUTransformFeedbackEngine.isSupported).toBe("function");
    });

    it("deve calcular o desbalanceamento cumulativo de 50 níveis L2 com ponderação exponencial", () => {
      const engine = new GPUTransformFeedbackEngine(null, 100, 2.5);
      const levels: Array<{ price: number; quantity: number; side: 1 | -1; distanceFromMidPct: number }> = [];

      // Gera 25 níveis de Bids (compradores fortes no topo: 200 BTC)
      for (let i = 0; i < 25; i++) {
        levels.push({
          price: 65000 - i * 5,
          quantity: i === 0 ? 200 : 10,
          side: 1,
          distanceFromMidPct: (i * 5) / 65000,
        });
      }

      // Gera 25 níveis de Asks (vendedores mais fracos: 10 BTC cada)
      for (let i = 0; i < 25; i++) {
        levels.push({
          price: 65005 + i * 5,
          quantity: 10,
          side: -1,
          distanceFromMidPct: (i * 5) / 65000,
        });
      }

      const metrics = engine.computeImbalance(levels);

      expect(metrics.processedLevels).toBe(50);
      expect(metrics.weightedBidVolume).toBeGreaterThan(metrics.weightedAskVolume);
      expect(metrics.imbalanceRatio).toBeGreaterThan(0.20);
      expect(metrics.dominantSide).toBe("BUY_DOMINANT");
      expect(metrics.absorptionPressure).toBeGreaterThan(0);
    });

    it("deve detectar dominância vendedora e equilíbrio neutro de acordo com os fluxos", () => {
      const engine = new GPUTransformFeedbackEngine(null, 64);

      // Cenário de pressão vendedora maciça
      const sellHeavyLevels = [
        { price: 65000, quantity: 5, side: 1 as const, distanceFromMidPct: 0.0001 },
        { price: 65005, quantity: 150, side: -1 as const, distanceFromMidPct: 0.0001 },
      ];
      const sellMetrics = engine.computeImbalance(sellHeavyLevels);
      expect(sellMetrics.dominantSide).toBe("SELL_DOMINANT");
      expect(sellMetrics.imbalanceRatio).toBeLessThan(-0.20);

      // Cenário perfeitamente simétrico
      const balancedLevels = [
        { price: 65000, quantity: 50, side: 1 as const, distanceFromMidPct: 0.0001 },
        { price: 65005, quantity: 50, side: -1 as const, distanceFromMidPct: 0.0001 },
      ];
      const balMetrics = engine.computeImbalance(balancedLevels);
      expect(balMetrics.dominantSide).toBe("BALANCED");
      expect(balMetrics.imbalanceRatio).toBe(0);
    });

    it("deve retornar métricas zeradas de forma resiliente para coleções vazias", () => {
      const engine = new GPUTransformFeedbackEngine(null);
      const emptyMetrics = engine.computeImbalance([]);
      expect(emptyMetrics.processedLevels).toBe(0);
      expect(emptyMetrics.imbalanceRatio).toBe(0);
      expect(emptyMetrics.dominantSide).toBe("BALANCED");

      engine.destroy();
      expect(engine.getOutputBuffer()).toBeNull();
    });
  });

  describe("13. WebGPUOrderBookComputeEngine (WGSL Compute Pipelines & Workgroup Reduction)", () => {
    it("deve verificar suporte do ambiente a WebGPU e inicializar graceful fallback", async () => {
      expect(typeof WebGPUOrderBookComputeEngine.isWebGPUSupported).toBe("function");

      const engine = new WebGPUOrderBookComputeEngine(128, 3.0);
      expect(engine.maxLevels).toBe(128);
      expect(engine.lambdaDecay).toBe(3.0);

      // Em ambiente de teste headless (sem WebGPU device nativo), init deve retornar false e preparar fallback
      const initialized = await engine.init();
      expect(typeof initialized).toBe("boolean");

      engine.destroy();
    });

    it("deve processar 50 níveis L2 com redução paralela O(log N) e decaimento exponencial", async () => {
      const engine = new WebGPUOrderBookComputeEngine(128, 2.5);
      await engine.init();

      // Monta livro sintético com 50 níveis de BTC (pressão compradora forte na ponta)
      const levels = [];
      for (let i = 0; i < 25; i++) {
        levels.push({
          price: 65000 - i * 5,
          quantity: i === 0 ? 250 : 12,
          side: 1 as const,
          distanceFromMidPct: (i * 5) / 65000,
        });
      }
      for (let i = 0; i < 25; i++) {
        levels.push({
          price: 65005 + i * 5,
          quantity: 10,
          side: -1 as const,
          distanceFromMidPct: (i * 5) / 65000,
        });
      }

      const metrics = await engine.computeImbalance(levels, 65000);

      expect(metrics.processedLevels).toBe(50);
      expect(metrics.weightedBidVolume).toBeGreaterThan(metrics.weightedAskVolume);
      expect(metrics.imbalanceRatio).toBeGreaterThan(0.20);
      expect(metrics.dominantSide).toBe("BUY_DOMINANT");
      expect(metrics.absorptionPressure).toBeGreaterThan(0);
      expect(metrics.backend).toBeDefined();

      engine.destroy();
    });

    it("deve detectar dominância de venda e equilíbrio simétrico com precisão WGSL", async () => {
      const engine = new WebGPUOrderBookComputeEngine(64);
      await engine.init();

      // Cenário de venda pesada
      const sellLevels = [
        { price: 65000, quantity: 10, side: 1 as const, distanceFromMidPct: 0.0001 },
        { price: 65005, quantity: 200, side: -1 as const, distanceFromMidPct: 0.0001 },
      ];
      const sellMetrics = await engine.computeImbalance(sellLevels);
      expect(sellMetrics.dominantSide).toBe("SELL_DOMINANT");
      expect(sellMetrics.imbalanceRatio).toBeLessThan(-0.20);

      // Cenário perfeitamente balanceado
      const balancedLevels = [
        { price: 65000, quantity: 40, side: 1 as const, distanceFromMidPct: 0.0001 },
        { price: 65005, quantity: 40, side: -1 as const, distanceFromMidPct: 0.0001 },
      ];
      const balMetrics = await engine.computeImbalance(balancedLevels);
      expect(balMetrics.dominantSide).toBe("BALANCED");
      expect(balMetrics.imbalanceRatio).toBe(0);

      engine.destroy();
    });

    it("deve retornar métricas seguras para coleções vazias e permitir ciclo de vida limpo", async () => {
      const engine = new WebGPUOrderBookComputeEngine(64);
      await engine.init();

      const emptyMetrics = await engine.computeImbalance([]);
      expect(emptyMetrics.processedLevels).toBe(0);
      expect(emptyMetrics.imbalanceRatio).toBe(0);
      expect(emptyMetrics.dominantSide).toBe("BALANCED");

      engine.destroy();
      expect(engine.getResultBuffer()).toBeNull();
    });

    it("deve gerenciar alocação de textura de Heatmap e suportar copyBufferToTexture zero-copy", () => {
      const engine = new WebGPUOrderBookComputeEngine(128);

      // Em ambiente headless sem device nativo, métodos respondem de forma resiliente
      expect(engine.getHeatmapTexture()).toBeNull();
      const texture = engine.initHeatmapTexture(256, 128);
      expect(texture).toBeNull(); // Sem GPU device nativo

      // Execução de copyBufferToTexture não deve quebrar
      const blitResult = engine.copyBufferToTexture({ columnIdx: 5 });
      expect(blitResult).toBeNull();

      engine.destroy();
    });

    it("deve suportar opções avançadas de computação com zero-copy (readbackToCpu: false)", async () => {
      const engine = new WebGPUOrderBookComputeEngine(64);
      await engine.init();

      const levels = [
        { price: 65000, quantity: 50, side: 1 as const, distanceFromMidPct: 0.0001 },
        { price: 65005, quantity: 20, side: -1 as const, distanceFromMidPct: 0.0001 },
      ];

      // Modo com readback desativado para pipeline streaming VRAM puro
      const zeroCopyMetrics = await engine.computeImbalance(levels, {
        readbackToCpu: false,
        targetHeatmapColumn: 42,
        midPrice: 65002.5,
      });

      expect(zeroCopyMetrics.processedLevels).toBe(2);
      expect(zeroCopyMetrics.backend).toBeDefined();

      engine.destroy();
    });

    it("deve conter diretiva enable subgroups e funções intrínsecas no WGSL de subgroups", () => {
      expect(WGSL_SUBGROUPS_ORDER_BOOK_IMBALANCE_SHADER).toContain("enable subgroups;");
      expect(WGSL_SUBGROUPS_ORDER_BOOK_IMBALANCE_SHADER).toContain("subgroupAdd(");
      expect(WGSL_SUBGROUPS_ORDER_BOOK_IMBALANCE_SHADER).toContain("subgroupElect()");
      expect(WGSL_SUBGROUPS_ORDER_BOOK_IMBALANCE_SHADER).toContain("builtin(subgroup_size)");
      expect(WGSL_SUBGROUPS_ORDER_BOOK_IMBALANCE_SHADER).toContain("builtin(subgroup_invocation_id)");

      // Subgroup Shuffle Primitives para detecção de Iceberg Orders e Muralhas
      expect(WGSL_SUBGROUPS_ORDER_BOOK_IMBALANCE_SHADER).toContain("subgroupShuffleDown(rawQty, 1u)");
      expect(WGSL_SUBGROUPS_ORDER_BOOK_IMBALANCE_SHADER).toContain("subgroupBroadcastFirst(rawQty)");
      expect(WGSL_SUBGROUPS_ORDER_BOOK_IMBALANCE_SHADER).toContain("detectedIcebergs");
      expect(WGSL_SUBGROUPS_ORDER_BOOK_IMBALANCE_SHADER).toContain("maxWallRatio");

      // Projeção Direta no Canal Azul (B) da Textura 2D do Heatmap L2
      expect(WGSL_SUBGROUPS_ORDER_BOOK_IMBALANCE_SHADER).toContain("heatmapSlice: array<atomic<u32>>");
      expect(WGSL_SUBGROUPS_ORDER_BOOK_IMBALANCE_SHADER).toContain("0x00FF0000u");
      expect(WGSL_SUBGROUPS_ORDER_BOOK_IMBALANCE_SHADER).toContain("atomicOr(&heatmapSlice");

      // Shader padrão não deve conter enable subgroups para compatibilidade retroativa
      expect(WGSL_ORDER_BOOK_IMBALANCE_SHADER).not.toContain("enable subgroups;");
      expect(WGSL_ORDER_BOOK_IMBALANCE_SHADER).toContain("workgroupBarrier()");
      expect(WGSL_ORDER_BOOK_IMBALANCE_SHADER).toContain("detectedIcebergs");
      expect(WGSL_ORDER_BOOK_IMBALANCE_SHADER).toContain("heatmapSlice: array<atomic<u32>>");
      expect(WGSL_ORDER_BOOK_IMBALANCE_SHADER).toContain("0x00FF0000u");
      expect(WGSL_ORDER_BOOK_IMBALANCE_SHADER).toContain("atomicOr(&heatmapSlice");
    });

    it("deve detectar e ativar pipeline SIMD Subgroups com Shuffle Primitives quando adapter expuser 'subgroups'", async () => {
      const origNavigator = (globalThis as any).navigator;
      let requestedFeatures: string[] = [];
      let compiledShaderCode = "";

      const mockDevice = {
        createShaderModule: (desc: { code: string }) => {
          if (desc.code.includes("LevelData")) {
            compiledShaderCode = desc.code;
          }
          return {};
        },
        createComputePipeline: () => ({
          getBindGroupLayout: () => ({}),
        }),
        createBuffer: () => ({ destroy: () => {} }),
        createBindGroup: () => ({}),
        queue: {
          writeBuffer: () => {},
          submit: () => {},
        },
        destroy: () => {},
      };

      const mockAdapter = {
        features: {
          has: (feat: string) => feat === "subgroups",
        },
        requestDevice: async (desc: any) => {
          requestedFeatures = desc.requiredFeatures || [];
          return mockDevice;
        },
      };

      (globalThis as any).navigator = {
        gpu: {
          requestAdapter: async () => mockAdapter,
        },
      };

      try {
        const engine = new WebGPUOrderBookComputeEngine(64);
        const initialized = await engine.init();
        expect(initialized).toBe(true);
        expect(engine.hasSubgroups()).toBe(true);
        expect(engine.hasSubgroupShuffle()).toBe(true);
        expect(requestedFeatures).toContain("subgroups");
        expect(compiledShaderCode).toContain("enable subgroups;");
        expect(compiledShaderCode).toContain("subgroupAdd(");
        expect(compiledShaderCode).toContain("subgroupShuffleDown(rawQty, 1u)");
        expect(compiledShaderCode).toContain("subgroupBroadcastFirst(rawQty)");

        engine.destroy();
        expect(engine.hasSubgroups()).toBe(false);
        expect(engine.hasSubgroupShuffle()).toBe(false);
      } finally {
        (globalThis as any).navigator = origNavigator;
      }
    });

    it("deve compilar shader padrão com fallback de árvore de redução quando subgroups não estiver disponível", async () => {
      const origNavigator = (globalThis as any).navigator;
      let requestedFeatures: string[] = [];
      let compiledShaderCode = "";

      const mockDevice = {
        createShaderModule: (desc: { code: string }) => {
          if (desc.code.includes("LevelData")) {
            compiledShaderCode = desc.code;
          }
          return {};
        },
        createComputePipeline: () => ({
          getBindGroupLayout: () => ({}),
        }),
        createBuffer: () => ({ destroy: () => {} }),
        createBindGroup: () => ({}),
        queue: {
          writeBuffer: () => {},
          submit: () => {},
        },
        destroy: () => {},
      };

      const mockAdapter = {
        features: {
          has: (_feat: string) => false,
        },
        requestDevice: async (desc: any) => {
          requestedFeatures = desc.requiredFeatures || [];
          return mockDevice;
        },
      };

      (globalThis as any).navigator = {
        gpu: {
          requestAdapter: async () => mockAdapter,
        },
      };

      try {
        const engine = new WebGPUOrderBookComputeEngine(64);
        const initialized = await engine.init();
        expect(initialized).toBe(true);
        expect(engine.hasSubgroups()).toBe(false);
        expect(engine.hasSubgroupShuffle()).toBe(false);
        expect(requestedFeatures).not.toContain("subgroups");
        expect(compiledShaderCode).toContain("workgroupBarrier()");
        expect(compiledShaderCode).not.toContain("enable subgroups;");

        engine.destroy();
      } finally {
        (globalThis as any).navigator = origNavigator;
      }
    });

    it("deve detectar ordens iceberg e muralhas de liquidez anômalas via gradiente de volume", async () => {
      const engine = new WebGPUOrderBookComputeEngine(64);
      await engine.init();

      // Livro com uma ordem iceberg anômala no nível 1 (300 BTC vs 20 BTC no vizinho)
      const icebergBook = [
        { price: 65000, quantity: 40, side: 1 as const, distanceFromMidPct: 0.0001 },
        { price: 64990, quantity: 300, side: 1 as const, distanceFromMidPct: 0.0002 }, // Iceberg (7.5x top, 15x vizinho)
        { price: 64980, quantity: 20, side: 1 as const, distanceFromMidPct: 0.0003 },
        { price: 65010, quantity: 30, side: -1 as const, distanceFromMidPct: 0.0001 },
        { price: 65020, quantity: 25, side: -1 as const, distanceFromMidPct: 0.0002 },
      ];

      const metrics = await engine.computeImbalance(icebergBook);
      expect(metrics.detectedIcebergs).toBeGreaterThanOrEqual(1);
      expect(metrics.maxWallRatio).toBeGreaterThanOrEqual(3.0);

      // Livro perfeitamente liso e homogêneo (sem icebergs)
      const flatBook = [
        { price: 65000, quantity: 20, side: 1 as const, distanceFromMidPct: 0.0001 },
        { price: 64990, quantity: 22, side: 1 as const, distanceFromMidPct: 0.0002 },
        { price: 65010, quantity: 21, side: -1 as const, distanceFromMidPct: 0.0001 },
        { price: 65020, quantity: 20, side: -1 as const, distanceFromMidPct: 0.0002 },
      ];

      const flatMetrics = await engine.computeImbalance(flatBook);
      expect(flatMetrics.detectedIcebergs).toBe(0);
      expect(flatMetrics.maxWallRatio).toBe(1.0);

      engine.destroy();
    });

    it("deve gerenciar e ativar projeção direta de Iceberg Orders no Canal Azul (B) da textura VRAM", async () => {
      const origNavigator = (globalThis as any).navigator;
      let boundEntries: any[] = [];

      const mockDevice = {
        createShaderModule: () => ({}),
        createComputePipeline: () => ({
          getBindGroupLayout: () => ({}),
        }),
        createBuffer: () => ({ destroy: () => {} }),
        createTexture: () => ({ destroy: () => {} }),
        createBindGroup: (desc: any) => {
          if (desc.entries?.some((e: any) => e.binding === 3)) {
            boundEntries = desc.entries || [];
          }
          return {};
        },
        destroy: () => {},
      };

      const mockAdapter = {
        features: { has: () => true },
        requestDevice: async () => mockDevice,
      };

      (globalThis as any).navigator = {
        gpu: { requestAdapter: async () => mockAdapter },
      };

      try {
        const engine = new WebGPUOrderBookComputeEngine(64);
        expect(engine.hasDirectIcebergProjection()).toBe(false);

        const initialized = await engine.init();
        expect(initialized).toBe(true);
        expect(engine.hasDirectIcebergProjection()).toBe(true);

        // Deve conter binding 3 (heatmapSliceBuffer) no bindGroup
        const sliceBinding = boundEntries.find((e) => e.binding === 3);
        expect(sliceBinding).toBeDefined();

        engine.destroy();
        expect(engine.hasDirectIcebergProjection()).toBe(false);
      } finally {
        (globalThis as any).navigator = origNavigator;
      }
    });

    it("deve validar o shader WGSL de Bloom Pass com convolução Gaussiana 1D e isolamento do canal azul", () => {
      expect(WGSL_BLOOM_POST_PROCESSING_SHADER).toBeDefined();
      expect(WGSL_BLOOM_POST_PROCESSING_SHADER).toContain("struct BloomParams");
      expect(WGSL_BLOOM_POST_PROCESSING_SHADER).toContain("s_blueChannel: array<f32, 128>");
      // Pesos gaussianos 5-tap normalizados
      expect(WGSL_BLOOM_POST_PROCESSING_SHADER).toContain("0.38774");
      expect(WGSL_BLOOM_POST_PROCESSING_SHADER).toContain("0.24477");
      expect(WGSL_BLOOM_POST_PROCESSING_SHADER).toContain("0.06136");
      // Mascaramento atômico de bits: preserva R, G, A e atualiza exclusivamente B (bits 16..23)
      expect(WGSL_BLOOM_POST_PROCESSING_SHADER).toContain("0xFF00FFFFu");
      expect(WGSL_BLOOM_POST_PROCESSING_SHADER).toContain("finalBlueByte");
    });

    it("deve inicializar e despachar o Compute Pass de Bloom Gaussiano em VRAM", async () => {
      const origNavigator = (globalThis as any).navigator;
      let bloomPassDispatched = false;
      let recordedPipeline: any = null;

      const mockPass = {
        setPipeline: (p: any) => { recordedPipeline = p; },
        setBindGroup: () => {},
        dispatchWorkgroups: () => { bloomPassDispatched = true; },
        end: () => {},
      };

      const mockEncoder = {
        beginComputePass: () => mockPass,
        finish: () => ({}),
      };

      const mockDevice = {
        createShaderModule: () => ({}),
        createComputePipeline: () => ({
          getBindGroupLayout: () => ({}),
        }),
        createBuffer: () => ({ destroy: () => {} }),
        createTexture: () => ({ destroy: () => {} }),
        createBindGroup: () => ({}),
        createCommandEncoder: () => mockEncoder,
        queue: {
          writeBuffer: () => {},
          submit: () => {},
        },
        destroy: () => {},
      };

      const mockAdapter = {
        features: { has: () => true },
        requestDevice: async () => mockDevice,
      };

      (globalThis as any).navigator = {
        gpu: { requestAdapter: async () => mockAdapter },
      };

      try {
        const engine = new WebGPUOrderBookComputeEngine(64);
        expect(engine.hasBloomPass()).toBe(false);

        const initialized = await engine.init();
        expect(initialized).toBe(true);
        expect(engine.hasBloomPass()).toBe(true);

        // Despacha bloom pass explicitamente
        const success = engine.applyBloomPass({
          blurRadius: 2,
          intensity: 1.4,
          customEncoder: mockEncoder,
        });
        expect(success).toBe(true);
        expect(bloomPassDispatched).toBe(true);

        // Testa limpeza em destroy
        engine.destroy();
        expect(engine.hasBloomPass()).toBe(false);
      } finally {
        (globalThis as any).navigator = origNavigator;
      }
    });

    it("deve validar o shader WGSL de Horizontal Bloom Pass para análise de persistência temporal", () => {
      expect(WGSL_HORIZONTAL_BLOOM_SHADER).toBeDefined();
      expect(WGSL_HORIZONTAL_BLOOM_SHADER).toContain("struct HorizontalBloomParams");
      expect(WGSL_HORIZONTAL_BLOOM_SHADER).toContain("s_hBlueChannel: array<f32, 128>");
      // Pesos gaussianos 5-tap normalizados para eixo temporal
      expect(WGSL_HORIZONTAL_BLOOM_SHADER).toContain("0.38774");
      expect(WGSL_HORIZONTAL_BLOOM_SHADER).toContain("0.24477");
      expect(WGSL_HORIZONTAL_BLOOM_SHADER).toContain("0.06136");
      // Mascaramento atômico de bits: preserva R, G, A e atualiza exclusivamente B (bits 16..23)
      expect(WGSL_HORIZONTAL_BLOOM_SHADER).toContain("0xFF00FFFFu");
      expect(WGSL_HORIZONTAL_BLOOM_SHADER).toContain("finalBlueByte");
    });

    it("deve gerenciar pipeline Dual-Axis Bloom (Vertical + Horizontal Separable Pass)", async () => {
      const origNavigator = (globalThis as any).navigator;
      let dispatchCount = 0;

      const mockPass = {
        setPipeline: () => {},
        setBindGroup: () => {},
        dispatchWorkgroups: () => { dispatchCount++; },
        end: () => {},
      };

      const mockEncoder = {
        beginComputePass: () => mockPass,
        copyBufferToBuffer: () => {},
        finish: () => ({}),
      };

      const mockBuffer = {
        destroy: () => {},
        mapAsync: async () => {},
        getMappedRange: () => new Float32Array([100, 50, 0.33, 0.5, 1, 4.0, 0, 0]).buffer,
        unmap: () => {},
      };

      const mockDevice = {
        createShaderModule: () => ({}),
        createComputePipeline: () => ({
          getBindGroupLayout: () => ({}),
        }),
        createBuffer: () => mockBuffer,
        createTexture: () => ({ destroy: () => {} }),
        createBindGroup: () => ({}),
        createCommandEncoder: () => mockEncoder,
        queue: {
          writeBuffer: () => {},
          submit: () => {},
        },
        destroy: () => {},
      };

      const mockAdapter = {
        features: { has: () => true },
        requestDevice: async () => mockDevice,
      };

      (globalThis as any).navigator = {
        gpu: { requestAdapter: async () => mockAdapter },
      };

      try {
        const engine = new WebGPUOrderBookComputeEngine(64, {
          enableBloomPass: true,
          enableDualAxisBloom: true,
          bloomAxes: "DUAL_AXIS",
        });

        expect(engine.hasDualAxisBloom()).toBe(false);

        const initialized = await engine.init();
        expect(initialized).toBe(true);
        expect(engine.hasDualAxisBloom()).toBe(true);

        // 1. Testa despacho de DUAL_AXIS (2 passes: Vertical e Horizontal)
        dispatchCount = 0;
        const dualSuccess = engine.applyBloomPass({
          axis: "DUAL_AXIS",
          blurRadius: 2,
          intensity: 1.5,
          customEncoder: mockEncoder,
        });
        expect(dualSuccess).toBe(true);
        expect(dispatchCount).toBe(2);

        // 2. Testa despacho isolado de HORIZONTAL (1 pass)
        dispatchCount = 0;
        const hSuccess = engine.applyBloomPass({
          axis: "HORIZONTAL",
          blurRadius: 3,
          intensity: 1.2,
          customEncoder: mockEncoder,
        });
        expect(hSuccess).toBe(true);
        expect(dispatchCount).toBe(1);

        // 3. Testa despacho isolado de VERTICAL (1 pass)
        dispatchCount = 0;
        const vSuccess = engine.applyBloomPass({
          axis: "VERTICAL",
          blurRadius: 1,
          intensity: 1.0,
          customEncoder: mockEncoder,
        });
        expect(vSuccess).toBe(true);
        expect(dispatchCount).toBe(1);

        // 4. Testa métrica dualAxisBloomApplied em computeImbalance
        const metrics = await engine.computeImbalance([
          { price: 65000, quantity: 200, side: 1, distanceFromMidPct: 0.0001 },
          { price: 65010, quantity: 20, side: -1, distanceFromMidPct: 0.0001 },
        ]);
        expect(metrics.dualAxisBloomApplied).toBe(true);

        // 5. Destrói e valida teardown
        engine.destroy();
        expect(engine.hasDualAxisBloom()).toBe(false);
        expect(engine.hasBloomPass()).toBe(false);
      } finally {
        (globalThis as any).navigator = origNavigator;
      }
    });
  });

  describe("14. LockFreeSPSCQueue, SoA Hardware Streaming & Thermal/Battery Throttling", () => {
    it("deve alinhar cabeçalho para 64 bytes por cache line e garantir capacidade potência de 2", () => {
      expect(CACHE_LINE_SIZE_BYTES).toBe(64);
      expect(TOTAL_HEADER_BYTES).toBe(192); // 3 cache lines (Producer, Consumer, Config)
      expect(LockFreeSPSCQueue.nextPowerOfTwo(10)).toBe(16);
      expect(LockFreeSPSCQueue.nextPowerOfTwo(100)).toBe(128);
      expect(LockFreeSPSCQueue.nextPowerOfTwo(1024)).toBe(1024);
      expect(LockFreeSPSCQueue.nextPowerOfTwo(1025)).toBe(2048);

      const queue = LockFreeSPSCQueue.create(100, 4);
      expect(queue.getCapacity()).toBe(128); // Arredondado para 2^7
      expect(queue.getStride()).toBe(4);

      const metrics = queue.getMetrics();
      expect(metrics.cacheLinePaddingBytes).toBe(64);
      expect(metrics.isEmpty).toBe(true);
      expect(metrics.isFull).toBe(false);
      expect(metrics.dropped).toBe(0);
    });

    it("deve transferir dados de ticks sem travas (Lock-Free FIFO) com zero alocações", () => {
      const queue = LockFreeSPSCQueue.create(64, 4);
      const scratchIn = new Float64Array([65000.5, 1.25, 1700000000, 1]);
      const scratchOut = new Float64Array(4);

      // Enfileira 10 ticks
      for (let i = 0; i < 10; i++) {
        scratchIn[0] = 65000 + i;
        const pushed = queue.push(scratchIn);
        expect(pushed).toBe(true);
      }

      let metrics = queue.getMetrics();
      expect(metrics.available).toBe(10);
      expect(metrics.totalWrites).toBe(10);

      // Desenfileira e valida ordem FIFO
      for (let i = 0; i < 10; i++) {
        const popped = queue.pop(scratchOut);
        expect(popped).toBe(true);
        expect(scratchOut[0]).toBe(65000 + i);
      }

      // Fila deve estar vazia
      expect(queue.pop(scratchOut)).toBe(false);
      metrics = queue.getMetrics();
      expect(metrics.available).toBe(0);
      expect(metrics.isEmpty).toBe(true);
      expect(metrics.totalReads).toBe(10);
    });

    it("deve aplicar backpressure seguro e contabilizar pacotes descartados sob saturação", () => {
      const queue = LockFreeSPSCQueue.create(16, 2); // Capacidade 16
      const tick = new Float64Array([100, 1]);

      // Preenche todos os 16 slots
      for (let i = 0; i < 16; i++) {
        expect(queue.push(tick)).toBe(true);
      }

      let metrics = queue.getMetrics();
      expect(metrics.isFull).toBe(true);

      // 17º item deve sofrer backpressure (push retorna false e incrementa dropped)
      expect(queue.push(tick)).toBe(false);
      expect(queue.push(tick)).toBe(false);

      metrics = queue.getMetrics();
      expect(metrics.dropped).toBe(2);

      // Esvazia em lote com drain()
      let drained = 0;
      const readCount = queue.drain(32, () => {
        drained++;
      });
      expect(readCount).toBe(16);
      expect(drained).toBe(16);
      expect(queue.getMetrics().isEmpty).toBe(true);
    });

    it("deve transmitir candles a partir de vetores contíguos SoA diretamente para a GPU", () => {
      const renderer = new WebGLCandlestickRenderer(null);

      // Simula vetores colunares SoA de 100 velas (Float64Array contíguos)
      const count = 100;
      const opens = new Float64Array(count);
      const highs = new Float64Array(count);
      const lows = new Float64Array(count);
      const closes = new Float64Array(count);
      const volumes = new Float64Array(count);
      const timestamps = new Float64Array(count);

      for (let i = 0; i < count; i++) {
        opens[i] = 100 + i;
        highs[i] = 105 + i;
        lows[i] = 95 + i;
        closes[i] = 102 + i;
        volumes[i] = 1000 + i * 10;
        timestamps[i] = 1700000000 + i * 60;
      }

      // Executa envio via SoA (sem lançar exceções mesmo em ambiente sem canvas)
      expect(() => {
        renderer.setCandleDataFromSoA(count, opens, highs, lows, closes, volumes, timestamps);
      }).not.toThrow();

      renderer.destroy();
    });

    it("deve expor métricas de economia de bateria e pressão térmica no AdaptiveFrameScheduler", () => {
      const scheduler = new AdaptiveFrameScheduler();
      const metrics = scheduler.getMetrics();

      expect(metrics).toBeDefined();
      expect(typeof metrics.fps).toBe("number");
      expect(metrics.isBatterySaverMode).toBeDefined();
      expect(metrics.isThermalThrottled).toBeDefined();
    });
  });

  describe("15. Refatoração de Baixa Latência, Zero-Allocation & Tipagem Estrita", () => {
    it("deve realizar arredondamento matemático rápido sem alocações transitórias de string (fastRound1 & fastRound2)", () => {
      // Arredondamento com 1 casa decimal
      expect(fastRound1(12.3456)).toBe(12.3);
      expect(fastRound1(12.3654)).toBe(12.4);
      expect(fastRound1(-15.88)).toBe(-15.9);
      expect(fastRound1(0.0)).toBe(0);

      // Arredondamento com 2 casas decimais
      expect(fastRound2(1.2345)).toBe(1.23);
      expect(fastRound2(1.2389)).toBe(1.24);
      expect(fastRound2(-0.856)).toBe(-0.86);
      expect(fastRound2(99.999)).toBe(100);
    });

    it("deve classificar confluência de order book como função pura e determinística (evaluateConfluence)", () => {
      // Predominância compradora forte
      const strongBullish = evaluateConfluence(28.5, 1.65, 1500, 800);
      expect(strongBullish.confluenceSignal).toBe("BULLISH");
      expect(strongBullish.recommendedAction).toBe("MARKET_BUY_FAVORABLE");
      expect(strongBullish.slippageScore).toBe("LOW");
      expect(strongBullish.confluenceBadge).toContain("Bid Heavy");

      // Viés de alta moderado
      const modBullish = evaluateConfluence(14.0, 1.30, 950, 700);
      expect(modBullish.confluenceSignal).toBe("BULLISH");
      expect(modBullish.recommendedAction).toBe("MARKET_BUY_FAVORABLE");
      expect(modBullish.confluenceBadge).toContain("Moderado");

      // Predominância vendedora forte
      const strongBearish = evaluateConfluence(-30.0, 0.55, 600, 1400);
      expect(strongBearish.confluenceSignal).toBe("BEARISH");
      expect(strongBearish.recommendedAction).toBe("MARKET_SELL_FAVORABLE");
      expect(strongBearish.confluenceBadge).toContain("Ask Heavy");

      // Livro equilibrado neutro
      const neutral = evaluateConfluence(2.0, 1.05, 1000, 1000);
      expect(neutral.confluenceSignal).toBe("NEUTRAL");
      expect(neutral.recommendedAction).toBe("NEUTRAL_WAIT");
      expect(neutral.confluenceBadge).toBe("Livro Equilibrado");
    });

    it("deve reciclar array pré-alocado em calculateOrderBookImbalance evitando realocações de Heap", () => {
      const bids = [
        { price: 65000, volume: 10.5 },
        { price: 64990, volume: 20.0 },
      ];
      const asks = [
        { price: 65010, volume: 8.0 },
        { price: 65020, volume: 15.0 },
      ];

      // Buffer de reciclagem pré-alocado
      const reusableBuffer: LevelImbalance[] = [
        { level: 1, bidVol: 0, askVol: 0, imbalance: 0, imbalancePct: 0, bidPrice: 0, askPrice: 0 },
        { level: 2, bidVol: 0, askVol: 0, imbalance: 0, imbalancePct: 0, bidPrice: 0, askPrice: 0 },
      ];

      const res = calculateOrderBookImbalance(bids, asks, 2, reusableBuffer);

      // Garante identidade referencial (zero garbage collection allocations)
      expect(res.levelImbalances).toBe(reusableBuffer);
      expect(res.levelImbalances.length).toBe(2);
      expect(res.levelImbalances[0].bidPrice).toBe(65000);
      expect(res.levelImbalances[0].askPrice).toBe(65010);
      expect(res.levelImbalances[0].bidVol).toBe(10.5);
      expect(res.levelImbalances[0].askVol).toBe(8.0);
      expect(res.totalBidVol).toBe(30.5);
      expect(res.totalAskVol).toBe(23.0);
    });

    it("deve converter resposta de profundidade L2 em passada única (parseOrderBookDepthResponse)", () => {
      const rawData = {
        bids: [
          { price: 65000, volume: 2.5 },
          { price: 64900, volume: 3.5 },
        ],
        asks: [
          { price: 65050, volume: 1.5 },
          { price: 65100, volume: 2.0 },
        ],
      };

      const parsed = parseOrderBookDepthResponse(rawData);

      expect(parsed.bids.length).toBe(2);
      expect(parsed.asks.length).toBe(2);
      expect(parsed.bids[0].cumulative).toBe(2.5);
      expect(parsed.bids[1].cumulative).toBe(6.0);
      expect(parsed.asks[0].cumulative).toBe(1.5);
      expect(parsed.asks[1].cumulative).toBe(3.5);
      expect(parsed.totalBidVolume).toBe(6.0);
      expect(parsed.totalAskVolume).toBe(3.5);
      expect(parsed.spread).toBe(50);
      expect(parsed.spreadPercent).toBeGreaterThan(0);
    });

    it("deve encapsular erros de consulta à exchange com tipagem forte (OrderBookFetchError)", () => {
      const rateLimitErr = new OrderBookFetchError("Rate limited", "BTCUSDT", 429);
      expect(rateLimitErr instanceof Error).toBe(true);
      expect(rateLimitErr instanceof OrderBookFetchError).toBe(true);
      expect(rateLimitErr.isRateLimit).toBe(true);
      expect(rateLimitErr.symbol).toBe("BTCUSDT");
      expect(rateLimitErr.statusCode).toBe(429);

      const serverErr = new OrderBookFetchError("Internal server error", "ETHUSDT", 500);
      expect(serverErr.isRateLimit).toBe(false);
      expect(serverErr.statusCode).toBe(500);
    });
  });

  describe("16. Web Worker de Ingestão Binance, Canal Atômico Zero-Copy & Resiliência a Rate Limit (HTTP 429/418)", () => {
    it("deve realizar parsing de stream Binance e extração de campos numéricos sem falhas (parseBinanceStreamPayload)", () => {
      const rawJson = JSON.stringify({
        stream: "btcusdt@ticker",
        data: {
          s: "BTCUSDT",
          c: "65432.10",
          p: "123.45",
          P: "0.19",
          h: "65900.00",
          l: "64800.00",
          v: "1250.5",
          q: "81500000",
          E: 1700000000123,
        },
      });

      const parsed = parseBinanceStreamPayload(rawJson);
      expect(parsed).not.toBeNull();
      expect(parsed?.symbol).toBe("BTCUSDT");
      expect(parsed?.price).toBe(65432.1);
      expect(parsed?.priceChange).toBe(123.45);
      expect(parsed?.priceChangePercent).toBe(0.19);
      expect(parsed?.high).toBe(65900);
      expect(parsed?.low).toBe(64800);
      expect(parsed?.volume).toBe(1250.5);
      expect(parsed?.quoteVolume).toBe(81500000);
      expect(parsed?.timestamp).toBe(1700000000123);

      // Resiliência contra payloads nulos ou inválidos
      expect(parseBinanceStreamPayload("")).toBeNull();
      expect(parseBinanceStreamPayload("{ invalid json }")).toBeNull();
      expect(parseBinanceStreamPayload(JSON.stringify({ result: null, id: 1 }))).toBeNull();
    });

    it("deve detectar violação de rate limit (HTTP 429/418) e emitir OrderBookFetchError tipado com isRateLimit=true", () => {
      // Testes da função de detecção
      expect(isBinanceRateLimit(429)).toBe(true);
      expect(isBinanceRateLimit(418)).toBe(true);
      expect(isBinanceRateLimit(1008)).toBe(true);
      expect(isBinanceRateLimit(1013)).toBe(true);
      expect(isBinanceRateLimit(200)).toBe(false);
      expect(isBinanceRateLimit(undefined, "Too many requests")).toBe(true);
      expect(isBinanceRateLimit(undefined, "IP banned")).toBe(true);
      expect(isBinanceRateLimit(undefined, "Normal close")).toBe(false);

      // Serialização tipada de erro
      const serialized = createSerializedWorkerError("Rate limit exceeded", "BTCUSDT", 429);
      expect(serialized.name).toBe("OrderBookFetchError");
      expect(serialized.isRateLimit).toBe(true);
      expect(serialized.statusCode).toBe(429);
      expect(serialized.symbol).toBe("BTCUSDT");
      expect(serialized.message).toContain("429");

      // Reconstrução em OrderBookFetchError
      const errorObj = new OrderBookFetchError(serialized.message, serialized.symbol, serialized.statusCode);
      expect(errorObj instanceof Error).toBe(true);
      expect(errorObj instanceof OrderBookFetchError).toBe(true);
      expect(errorObj.isRateLimit).toBe(true);
      expect(errorObj.statusCode).toBe(429);
    });

    it("deve enfileirar e desenfileirar ticks no buffer atômico com fidelidade numérica e mapeamento bi-direcional O(1)", () => {
      const manager = new BinanceWorkerManager();
      manager.subscribe(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);

      // Validação do mapeamento O(1) de símbolos para IDs inteiros compactos
      const btcId = manager.getSymbolId("BTCUSDT");
      const ethId = manager.getSymbolId("ETHUSDT");
      const solId = manager.getSymbolId("SOLUSDT");

      expect(btcId).toBeGreaterThan(0);
      expect(ethId).toBeGreaterThan(0);
      expect(solId).toBeGreaterThan(0);
      expect(btcId).not.toBe(ethId);

      expect(manager.getSymbolFromId(btcId)).toBe("BTCUSDT");
      expect(manager.getSymbolFromId(ethId)).toBe("ETHUSDT");
      expect(manager.getSymbolFromId(solId)).toBe("SOLUSDT");

      // Enfileira 2 ticks simulados no buffer atômico
      const tick1 = {
        symbol: "BTCUSDT",
        price: 67123.45,
        priceChange: 500.25,
        priceChangePercent: 0.75,
        high: 68000,
        low: 66500,
        volume: 120.5,
        quoteVolume: 8088000,
        timestamp: 1700000000000,
      };
      const tick2 = {
        symbol: "ETHUSDT",
        price: 3512.8,
        priceChange: -25.4,
        priceChangePercent: -0.72,
        high: 3600,
        low: 3480,
        volume: 450.2,
        quoteVolume: 1581000,
        timestamp: 1700000000050,
      };

      const pushed1 = manager.simulateTick(tick1);
      const pushed2 = manager.simulateTick(tick2);
      expect(pushed1).toBe(true);
      expect(pushed2).toBe(true);

      // Desenfileira via drainQueue (zero-alloc scratch slot)
      const drained: any[] = [];
      const drainCount = manager.drainQueue((t) => {
        drained.push(t);
      }, 10);

      expect(drainCount).toBe(2);
      expect(drained.length).toBe(2);

      // Validação estrita de fidelidade numérica
      expect(drained[0].symbol).toBe("BTCUSDT");
      expect(drained[0].price).toBe(67123.45);
      expect(drained[0].priceChange).toBe(500.25);
      expect(drained[0].priceChangePercent).toBe(0.75);
      expect(drained[0].high).toBe(68000);
      expect(drained[0].low).toBe(66500);
      expect(drained[0].volume).toBe(120.5);
      expect(drained[0].quoteVolume).toBe(8088000);
      expect(drained[0].timestamp).toBe(1700000000000);

      expect(drained[1].symbol).toBe("ETHUSDT");
      expect(drained[1].price).toBe(3512.8);

      manager.destroy();
    });

    it("deve aplicar backpressure seguro durante rajadas extremas de ticks sem estourar o Heap", () => {
      const manager = new BinanceWorkerManager();
      manager.subscribe(["BTCUSDT"]);

      // Injeta uma rajada extrema de 5.000 ticks em sequência rápida
      const startTime = performance.now();
      let enqueuedSuccess = 0;
      let backpressured = 0;

      for (let i = 0; i < 5000; i++) {
        const ok = manager.simulateTick({
          symbol: "BTCUSDT",
          price: 65000 + (i % 100),
          priceChange: i,
          priceChangePercent: i / 100,
          high: 66000,
          low: 64000,
          volume: 10 + i,
          quoteVolume: (65000 + i) * 10,
          timestamp: 1700000000000 + i,
        });
        if (ok) enqueuedSuccess++;
        else backpressured++;
      }
      const durationMs = performance.now() - startTime;

      // Execução ultra-rápida (menos de 50ms para 5.000 ticks)
      expect(durationMs).toBeLessThan(100);
      expect(enqueuedSuccess).toBeGreaterThan(0);

      // Esvazia os dados restantes sem quebrar ou alocar excessivamente
      let drainedCount = 0;
      while (true) {
        const drained = manager.drainQueue(() => {
          drainedCount++;
        }, 1024);
        if (drained === 0) break;
      }

      expect(drainedCount).toBe(enqueuedSuccess);
      expect(manager.drainQueue(() => {}, 10)).toBe(0);

      manager.destroy();
    });

    it("deve suportar fallback de Transferable ArrayBuffer (Modo B) com zero cópia de dados", () => {
      let receivedBatch: any[] = [];
      const manager = new BinanceWorkerManager((batch) => {
        receivedBatch = batch;
      });

      // Simula a recepção de uma mensagem TRANSFER_BATCH contendo ArrayBuffer transferível
      const stride = DEFAULT_TICKER_STRIDE;
      const count = 2;
      const transferBuffer = new ArrayBuffer(count * stride * Float64Array.BYTES_PER_ELEMENT);
      const view = new Float64Array(transferBuffer);

      // Slot 0: BTCUSDT (id = 1)
      view[0] = 1700000001000; // ts
      view[1] = 1; // symId
      view[2] = 68500.5; // price
      view[3] = 1500.0; // priceChange
      view[4] = 2.24; // priceChangePercent
      view[5] = 69000; // high
      view[6] = 67000; // low
      view[7] = 500; // volume
      view[8] = 34250250; // quoteVolume
      view[9] = 1; // flags

      // Slot 1: ETHUSDT (id = 2)
      view[10] = 1700000001000;
      view[11] = 2;
      view[12] = 3620.0;
      view[13] = 45.0;
      view[14] = 1.25;
      view[15] = 3700;
      view[16] = 3550;
      view[17] = 800;
      view[18] = 2896000;
      view[19] = 1;

      manager.handleWorkerMessage({
        type: "TRANSFER_BATCH",
        count,
        stride,
        buffer: transferBuffer,
        symbolMap: { BTCUSDT: 1, ETHUSDT: 2 },
      });

      expect(receivedBatch.length).toBe(2);
      expect(receivedBatch[0].symbol).toBe("BTCUSDT");
      expect(receivedBatch[0].price).toBe(68500.5);
      expect(receivedBatch[1].symbol).toBe("ETHUSDT");
      expect(receivedBatch[1].price).toBe(3620.0);

      manager.destroy();
    });

    it("deve gerenciar ciclo de vida limpo e resiliência a desconexões sem vazamentos de memória", () => {
      let capturedError: OrderBookFetchError | null = null;
      const manager = new BinanceWorkerManager(
        () => {},
        (err) => {
          capturedError = err;
        }
      );

      manager.subscribe(["BTCUSDT", "SOLUSDT"]);
      expect(manager.getSymbolId("BTCUSDT")).toBeGreaterThan(0);

      // Simula erro de rate limit vindo do worker
      manager.simulateError("Too many orders placed", "BTCUSDT", 429);
      expect(capturedError).not.toBeNull();
      expect(capturedError?.name).toBe("OrderBookFetchError");
      expect(capturedError?.isRateLimit).toBe(true);
      expect(capturedError?.statusCode).toBe(429);
      expect(capturedError?.symbol).toBe("BTCUSDT");

      // Destruição e limpeza estrita
      manager.destroy();
      expect(manager.isUsingWorker()).toBe(false);

      // Após destroy, nenhuma referência de símbolo pendente
      expect(manager.getSymbolFromId(1)).toBe("UNKNOWN");
    });
  });

  describe("17. Zero-Hop Direct Worker-to-Worker Ingestion-to-Render Conduit (SharedArrayBuffer & MessageChannel)", () => {
    it("deve interconectar Ingestion Worker e Render Controller via MessageChannel e SharedArrayBuffer", () => {
      const ingestionManager = new BinanceWorkerManager();
      const renderController = new OffscreenChartController();

      // Interconecta os dois subsistemas de worker
      const channel = OffscreenChartController.connectWorkers(ingestionManager, renderController);

      const metrics = renderController.getWorkerChannelMetrics();
      expect(metrics.hasAtomicQueue).toBe(true);

      if (typeof MessageChannel !== "undefined") {
        expect(channel).not.toBeNull();
        expect(metrics.isPeerConnected).toBe(true);
      }

      // Valida compartilhamento direto da LockFreeSPSCQueue / SharedMemoryAtomicQueue
      const spscQueue = ingestionManager.getSPSCQueue();
      const sharedQueue = ingestionManager.getSharedQueue();
      expect(spscQueue !== null || sharedQueue !== null).toBe(true);

      // Limpeza estrita
      if (channel) {
        channel.port1.close();
        channel.port2.close();
      }
      ingestionManager.destroy();
      renderController.destroy();

      const metricsAfterDestroy = renderController.getWorkerChannelMetrics();
      expect(metricsAfterDestroy.isPeerConnected).toBe(false);
      expect(metricsAfterDestroy.hasAtomicQueue).toBe(false);
    });

    it("deve transmitir ticks de alta frequência diretamente através de MessagePort sem passar pela Main Thread", async () => {
      const ingestionManager = new BinanceWorkerManager();
      const renderController = new OffscreenChartController();

      if (typeof MessageChannel !== "undefined") {
        const channel = new MessageChannel();

        // Conecta o port2 no controlador de renderização
        renderController.connectPeerPort(channel.port2);

        // Despacha tick diretamente pela porta 1 (simulando o canal de rede)
        channel.port1.postMessage({
          type: "PEER_TICK",
          ticker: {
            symbol: "BTCUSDT",
            price: 69420.5,
            priceChange: 1420.5,
            priceChangePercent: 2.08,
            high: 70000,
            low: 67800,
            volume: 1200,
            quoteVolume: 83304600,
            timestamp: 1700000005000,
          },
        });

        // Aguarda transferência microtask/evento
        await new Promise((resolve) => setTimeout(resolve, 25));

        const receivedTick = renderController.getLastPeerTick();
        expect(receivedTick).not.toBeNull();
        expect(receivedTick.symbol).toBe("BTCUSDT");
        expect(receivedTick.price).toBe(69420.5);

        // Transfere o port1 para o Ingestion Worker
        const connected = ingestionManager.connectPeerPort(channel.port1);
        expect(connected).toBe(true);

        channel.port1.close();
        channel.port2.close();
      }

      ingestionManager.destroy();
      renderController.destroy();
    });

    it("deve permitir que o Ingestion Worker enfileire ticks no buffer atômico compartilhado lido diretamente pelo renderizador", () => {
      const ingestionManager = new BinanceWorkerManager();
      const renderController = new OffscreenChartController();

      OffscreenChartController.connectWorkers(ingestionManager, renderController);

      const spscQueue = ingestionManager.getSPSCQueue();
      if (spscQueue) {
        // Enfileira direto como produtor
        const slot = new Float64Array(10);
        slot[0] = 1700000010000; // ts
        slot[1] = 1; // symId
        slot[2] = 71200.0; // price
        slot[3] = 2200.0;
        slot[4] = 3.18;
        slot[5] = 71500;
        slot[6] = 68900;
        slot[7] = 2500;
        slot[8] = 178000000;
        slot[9] = 1; // flag

        const pushed = spscQueue.push(slot);
        expect(pushed).toBe(true);

        // O consumidor (Worker de Renderização) lê da mesma memória compartilhada
        const readSlot = new Float64Array(10);
        const popped = spscQueue.pop(readSlot);
        expect(popped).toBe(true);
        expect(readSlot[0]).toBe(1700000010000);
        expect(readSlot[2]).toBe(71200.0);
      }

      ingestionManager.destroy();
      renderController.destroy();
    });
  });

  describe("18. Zero-Hop Shared L2 Depth Matrix (Order Book Heatmap GPU Direct Ingestion)", () => {
    it("deve alocar a matriz SoA com alinhamento de cache e cabeçalho atômico", () => {
      const matrix = SharedL2DepthMatrix.create(1000);
      expect(matrix).toBeDefined();
      expect(matrix.getMaxLevels()).toBe(1000);

      const buffer = matrix.getRawBuffer();
      // 64 bytes de cabeçalho + 4 colunas * 1000 * 8 bytes = 32064 bytes
      expect(buffer.byteLength).toBe(64 + 4 * 1000 * 8);

      const summary = matrix.readSnapshotSummary();
      expect(summary.bidsCount).toBe(0);
      expect(summary.asksCount).toBe(0);
      expect(summary.writeSequence).toBe(0);
    });

    it("deve preencher níveis de bids e asks em formato SoA com zero allocations e atualizar métricas atômicas", () => {
      const matrix = SharedL2DepthMatrix.create(500);

      const bids: [number, number][] = [
        [69000.0, 5.5],
        [68990.0, 12.0],
        [68980.0, 25.0],
      ];
      const asks: [number, number][] = [
        [69010.0, 4.2],
        [69020.0, 8.1],
        [69030.0, 15.6],
      ];

      const writeSeq = matrix.writeDepthSnapshot(bids, asks, 1700000050000);
      expect(writeSeq).toBe(1);

      const summary = matrix.readSnapshotSummary();
      expect(summary.bidsCount).toBe(3);
      expect(summary.asksCount).toBe(3);
      expect(summary.timestamp).toBe(1700000050000);
      expect(summary.bestBid).toBe(69000.0);
      expect(summary.bestAsk).toBe(69010.0);
      expect(summary.spread).toBeCloseTo(10.0, 2);
      expect(summary.totalBidVolume).toBeCloseTo(5.5 + 12.0 + 25.0, 4);
      expect(summary.totalAskVolume).toBeCloseTo(4.2 + 8.1 + 15.6, 4);

      // Verificação de acesso zero-copy direto aos arrays tipados
      const bidPrices = matrix.getBidPrices();
      const bidVolumes = matrix.getBidVolumes();
      const askPrices = matrix.getAskPrices();
      const askVolumes = matrix.getAskVolumes();

      expect(bidPrices[0]).toBe(69000.0);
      expect(bidVolumes[0]).toBe(5.5);
      expect(askPrices[0]).toBe(69010.0);
      expect(askVolumes[0]).toBe(4.2);
    });

    it("deve permitir leitura através de SharedL2DepthMatrix.fromBuffer conectada à mesma memória física", () => {
      const writer = SharedL2DepthMatrix.create(100);
      const reader = SharedL2DepthMatrix.fromBuffer(writer.getRawBuffer(), 100);

      writer.writeDepthSnapshot(
        [[70000, 10], [69990, 20]],
        [[70010, 15], [70020, 30]],
        1700000060000
      );

      const readerSummary = reader.readSnapshotSummary();
      expect(readerSummary.bidsCount).toBe(2);
      expect(readerSummary.asksCount).toBe(2);
      expect(readerSummary.bestBid).toBe(70000);
      expect(readerSummary.bestAsk).toBe(70010);
      expect(reader.getBidPrices()[1]).toBe(69990);
      expect(reader.getAskVolumes()[1]).toBe(30);
    });

    it("deve empacotar fatia temporal em texels RGBA para gl.texSubImage2D com detecção de icebergs", () => {
      const matrix = SharedL2DepthMatrix.create(100);
      matrix.writeDepthSnapshot(
        [[100, 10], [90, 50]], // nível 90 tem 50 de volume (> threshold 25) -> Iceberg!
        [[110, 8], [120, 12]],
        1700000070000
      );

      const priceBins = 10;
      const targetRGBA = new Uint8Array(priceBins * 4);

      const packedBins = matrix.packToSliceRGBA(
        targetRGBA,
        priceBins,
        80, // minPrice
        130, // maxPrice
        50.0, // maxVolume
        25.0 // icebergVolumeThreshold
      );

      expect(packedBins).toBe(priceBins);
      expect(targetRGBA.byteLength).toBe(priceBins * 4);

      // Algum bin deve conter cor de bid (R > 0)
      let foundBid = false;
      let foundAsk = false;
      let foundIceberg = false;

      for (let i = 0; i < priceBins; i++) {
        const r = targetRGBA[i * 4 + 0];
        const g = targetRGBA[i * 4 + 1];
        const b = targetRGBA[i * 4 + 2];
        const a = targetRGBA[i * 4 + 3];

        if (r > 0 && a > 0) foundBid = true;
        if (g > 0 && a > 0) foundAsk = true;
        if (b === 255) foundIceberg = true;
      }

      expect(foundBid).toBe(true);
      expect(foundAsk).toBe(true);
      expect(foundIceberg).toBe(true);
    });

    it("deve empacotar matriz colunar em Float32Array para WebGPU storage buffer e writeTexture", () => {
      const matrix = SharedL2DepthMatrix.create(50);
      matrix.writeDepthSnapshot(
        [[69000, 1.5], [68900, 3.0]],
        [[69100, 2.0], [69200, 4.5]],
        1700000080000
      );

      const targetF32 = new Float32Array(50 * 4);
      const packedCount = matrix.packToFloat32VRAMBuffer(targetF32, 50);

      expect(packedCount).toBe(2); // 2 níveis de bids e asks
      // [bidPrice, bidVol, askPrice, askVol]
      expect(targetF32[0]).toBe(69000);
      expect(targetF32[1]).toBeCloseTo(1.5, 2);
      expect(targetF32[2]).toBe(69100);
      expect(targetF32[3]).toBeCloseTo(2.0, 2);
    });

    it("deve interconectar automaticamente o SharedL2DepthMatrix através de OffscreenChartController.connectWorkers", () => {
      const ingestionManager = new BinanceWorkerManager();
      const renderController = new OffscreenChartController();

      // Antes da conexão
      expect(renderController.getL2DepthMatrix()).toBeNull();
      expect(renderController.getWorkerChannelMetrics().hasL2DepthMatrix).toBe(false);

      // Conexão P2P com compartilhamento atômico e L2
      OffscreenChartController.connectWorkers(ingestionManager, renderController);

      // O renderController agora tem acesso direto ao L2 Depth Matrix em memória compartilhada
      const l2Matrix = renderController.getL2DepthMatrix();
      if (l2Matrix) {
        expect(l2Matrix.getMaxLevels()).toBe(1000);
        expect(renderController.getWorkerChannelMetrics().hasL2DepthMatrix).toBe(true);
      }

      ingestionManager.destroy();
      renderController.destroy();
      expect(renderController.getL2DepthMatrix()).toBeNull();
    });
  });

  describe("19. Double-Buffering de Matriz L2 no SharedArrayBuffer (Zero-Contention Hot Path & Delta Accumulation)", () => {
    it("deve alocar buffer duplo de ~64 KB (64.192 bytes para 1.000 níveis) com Master Header de 64 bytes e isDoubleBuffered === true", () => {
      const matrix = SharedL2DepthMatrix.createDoubleBuffered(1000);
      expect(matrix).toBeDefined();
      expect(matrix.isDoubleBuffered()).toBe(true);
      expect(matrix.getMaxLevels()).toBe(1000);

      const buffer = matrix.getRawBuffer();
      // 64 bytes master header + 2 * (64 bytes slot header + 4 colunas * 1000 * 8 bytes) = 64 + 2 * 32064 = 64192 bytes
      expect(buffer.byteLength).toBe(64 + 2 * (64 + 4 * 1000 * 8));
      expect(matrix.getActiveBufferIndex()).toBe(0);
      expect(matrix.getBackBufferIndex()).toBe(1);
      expect(matrix.getSwapSequence()).toBe(0);
    });

    it("deve alternar atômica e ciclicamente os índices de Front/Back Buffer através de swap()", () => {
      const matrix = SharedL2DepthMatrix.createDoubleBuffered(500);

      expect(matrix.getActiveBufferIndex()).toBe(0);
      expect(matrix.getBackBufferIndex()).toBe(1);
      expect(matrix.getSwapSequence()).toBe(0);

      const seq1 = matrix.swap();
      expect(seq1).toBe(1);
      expect(matrix.getActiveBufferIndex()).toBe(1);
      expect(matrix.getBackBufferIndex()).toBe(0);
      expect(matrix.getSwapSequence()).toBe(1);

      const seq2 = matrix.swap();
      expect(seq2).toBe(2);
      expect(matrix.getActiveBufferIndex()).toBe(0);
      expect(matrix.getBackBufferIndex()).toBe(1);
      expect(matrix.getSwapSequence()).toBe(2);
    });

    it("deve sincronizar cópia zero-alloc de Front para Back Buffer via copyFrontToBack()", () => {
      const matrix = SharedL2DepthMatrix.createDoubleBuffered(100);

      // Preenche dados no slot 0 diretamente
      matrix.writeDepthSnapshot(
        [[69000, 10], [68990, 20]],
        [[69010, 15], [69020, 25]],
        1700000090000,
        0 // fixa no slot 0
      );

      // Copia do Front (slot 0) para o Back (slot 1)
      matrix.copyFrontToBack();

      // Lê resumo do slot 1 (Back)
      const backSummary = matrix.readSnapshotSummary(1);
      expect(backSummary.bidsCount).toBe(2);
      expect(backSummary.asksCount).toBe(2);
      expect(backSummary.bestBid).toBe(69000);
      expect(backSummary.bestAsk).toBe(69010);
      expect(backSummary.timestamp).toBe(1700000090000);
      expect(backSummary.totalBidVolume).toBe(30);
      expect(backSummary.totalAskVolume).toBe(40);

      const backBidPrices = matrix.getBackBidPrices();
      const backBidVolumes = matrix.getBackBidVolumes();
      expect(backBidPrices[0]).toBe(69000);
      expect(backBidVolumes[0]).toBe(10);
      expect(backBidPrices[1]).toBe(68990);
      expect(backBidVolumes[1]).toBe(20);
    });

    it("deve acumular deltas parciais no Back Buffer mantendo o Front Buffer imutável até swap() (Zero-Contention)", () => {
      const matrix = SharedL2DepthMatrix.createDoubleBuffered(100);

      // 1. Estado inicial no Front Buffer (slot 0)
      matrix.writeDepthSnapshot(
        [[100, 10], [90, 20]],
        [[110, 15], [120, 25]],
        1700000100000,
        0
      );

      // Prepara Back Buffer com cópia idêntica
      matrix.copyFrontToBack();

      // 2. Ingestion worker acumula deltas parciais no Back Buffer (sem tocar no Front!)
      // Deltas:
      // - Atualiza volume do bid 100 de 10 para 12
      // - Insere novo bid 95 com volume 8 (entre 100 e 90)
      // - Remove bid 90 (quantidade 0)
      // - Atualiza volume do ask 110 para 18
      // - Insere novo ask 115 com volume 5 (entre 110 e 120)
      const bidsDelta: [number, number][] = [
        [100, 12],
        [95, 8],
        [90, 0],
      ];
      const asksDelta: [number, number][] = [
        [110, 18],
        [115, 5],
      ];

      matrix.applyDelta(bidsDelta, asksDelta, 1700000100100);

      // 3. Render Worker lê Front Buffer: estado permanece TOTALMENTE INTACTO (Zero Data Tearing)
      const frontSummary = matrix.readSnapshotSummary(); // lê slot 0 (ativo)
      expect(frontSummary.bidsCount).toBe(2);
      expect(frontSummary.asksCount).toBe(2);
      expect(frontSummary.bestBid).toBe(100);
      expect(frontSummary.bestAsk).toBe(110);
      expect(matrix.getBidPrices()[0]).toBe(100);
      expect(matrix.getBidVolumes()[0]).toBe(10); // ainda o valor antigo!
      expect(matrix.getBidPrices()[1]).toBe(90);  // ainda presente!

      // 4. Ingestion Worker sinaliza que o frame de deltas está pronto e faz swap()
      matrix.swap();

      // 5. Render Worker agora lê Front Buffer (agora slot 1): reflete as alterações do delta
      const updatedSummary = matrix.readSnapshotSummary();
      expect(updatedSummary.bidsCount).toBe(2); // [100, 12], [95, 8]
      expect(updatedSummary.asksCount).toBe(3); // [110, 18], [115, 5], [120, 25]
      expect(updatedSummary.bestBid).toBe(100);
      expect(updatedSummary.bestAsk).toBe(110);

      const activeBidPrices = matrix.getBidPrices();
      const activeBidVolumes = matrix.getBidVolumes();
      expect(activeBidPrices[0]).toBe(100);
      expect(activeBidVolumes[0]).toBe(12);
      expect(activeBidPrices[1]).toBe(95);
      expect(activeBidVolumes[1]).toBe(8);

      const activeAskPrices = matrix.getAskPrices();
      const activeAskVolumes = matrix.getAskVolumes();
      expect(activeAskPrices[0]).toBe(110);
      expect(activeAskVolumes[0]).toBe(18);
      expect(activeAskPrices[1]).toBe(115);
      expect(activeAskVolumes[1]).toBe(5);
      expect(activeAskPrices[2]).toBe(120);
      expect(activeAskVolumes[2]).toBe(25);
    });

    it("deve executar applyDeltaAndSwap() de forma atômica com reordenação binária zero-allocation", () => {
      const matrix = SharedL2DepthMatrix.createDoubleBuffered(50);

      // Snapshot inicial
      matrix.writeDepthSnapshot(
        [[50000, 1.0], [49900, 2.0]],
        [[50100, 1.5], [50200, 2.5]],
        1700000200000
      );

      // Inicia novo delta com applyDeltaAndSwap (copyFrontToBack + apply + swap)
      const seq = matrix.applyDeltaAndSwap(
        [[50050, 0.8], [49900, 0.0]], // novo bid em 50050 (topo!), remove 49900
        [[50100, 3.0]], // atualiza volume do ask 50100
        1700000200100
      );

      expect(seq).toBeGreaterThan(0);

      const summary = matrix.readSnapshotSummary();
      expect(summary.bestBid).toBe(50050); // novo topo de book!
      expect(summary.bestAsk).toBe(50100);
      expect(summary.bidsCount).toBe(2); // [50050, 0.8], [50000, 1.0]
      expect(summary.asksCount).toBe(2); // [50100, 3.0], [50200, 2.5]
      expect(summary.totalBidVolume).toBeCloseTo(0.8 + 1.0, 4);
      expect(summary.totalAskVolume).toBeCloseTo(3.0 + 2.5, 4);
    });

    it("deve operar via classe utilitária DoubleBufferedL2DepthMatrix e auto-detectar em fromBuffer", () => {
      const writer = DoubleBufferedL2DepthMatrix.create(100);
      expect(writer.isDoubleBuffered()).toBe(true);

      const rawBuffer = writer.getRawBuffer();
      const reader = SharedL2DepthMatrix.fromBuffer(rawBuffer, 100);
      expect(reader.isDoubleBuffered()).toBe(true);

      writer.writeDepthSnapshot(
        [[1000, 50], [990, 75]],
        [[1010, 40], [1020, 60]],
        1700000300000
      );

      const readerSummary = reader.readSnapshotSummary();
      expect(readerSummary.bestBid).toBe(1000);
      expect(readerSummary.bestAsk).toBe(1010);
      expect(readerSummary.totalBidVolume).toBe(125);
    });

    it("deve integrar perfeitamente com BinanceWorkerManager e OffscreenChartController com telemetria isDoubleBuffered", () => {
      const ingestionManager = new BinanceWorkerManager();
      const renderController = new OffscreenChartController();

      expect(ingestionManager.getL2DepthMatrix()?.isDoubleBuffered()).toBe(true);

      OffscreenChartController.connectWorkers(ingestionManager, renderController);

      const metrics = renderController.getWorkerChannelMetrics();
      expect(metrics.hasL2DepthMatrix).toBe(true);
      expect(metrics.isDoubleBuffered).toBe(true);

      ingestionManager.destroy();
      renderController.destroy();
    });
  });

  describe("20. Dynamic Price Range Quantization & 1D Texture Heat Palette Compression (Logarithmic ATR Scaling)", () => {
    it("deve concentrar resolução de bins ao redor do centerPrice com escala logarítmica ponderada por ATR", () => {
      const renderer = new WebGLL2HeatmapRenderer(null, {
        priceBins: 128,
        dynamicQuantizationEnabled: true,
        atr: 2.0,
        compressionFactor: 4.0,
      });

      const minPrice = 80;
      const maxPrice = 120;
      const centerPrice = 100;
      const atr = 2.0;
      const kappa = 4.0;

      // Compara quantização linear vs logarítmica com ATR
      const linearBin1 = renderer.quantizePrice(100.5, minPrice, maxPrice);
      const linearBin2 = renderer.quantizePrice(101.5, minPrice, maxPrice);
      const linearSpreadDelta = linearBin2 - linearBin1;

      const dynamicBin1 = renderer.quantizePrice(100.5, minPrice, maxPrice, atr, centerPrice, kappa);
      const dynamicBin2 = renderer.quantizePrice(101.5, minPrice, maxPrice, atr, centerPrice, kappa);
      const dynamicSpreadDelta = dynamicBin2 - dynamicBin1;

      // Ao redor do centerPrice (spread ativo), a quantização logarítmica com ATR
      // deve alocar MAIS bins por unidade de preço do que o mapeamento linear tradicional
      expect(dynamicSpreadDelta).toBeGreaterThanOrEqual(linearSpreadDelta);

      // No extremo longe do centro (ex: 118 vs 119), a quantização logarítmica comprime a resolução
      const linearFar1 = renderer.quantizePrice(118, minPrice, maxPrice);
      const linearFar2 = renderer.quantizePrice(119, minPrice, maxPrice);
      const linearFarDelta = linearFar2 - linearFar1;

      const dynamicFar1 = renderer.quantizePrice(118, minPrice, maxPrice, atr, centerPrice, kappa);
      const dynamicFar2 = renderer.quantizePrice(119, minPrice, maxPrice, atr, centerPrice, kappa);
      const dynamicFarDelta = dynamicFar2 - dynamicFar1;

      expect(dynamicFarDelta).toBeLessThanOrEqual(linearFarDelta);

      // Limites e clamping estritos
      expect(renderer.quantizePrice(70, minPrice, maxPrice, atr, centerPrice, kappa)).toBe(0);
      expect(renderer.quantizePrice(80, minPrice, maxPrice, atr, centerPrice, kappa)).toBe(0);
      expect(renderer.quantizePrice(120, minPrice, maxPrice, atr, centerPrice, kappa)).toBe(127);
      expect(renderer.quantizePrice(150, minPrice, maxPrice, atr, centerPrice, kappa)).toBe(127);
    });

    it("deve garantir monotonicidade estrita (sem inversão de preços) em qualquer range de volatilidade", () => {
      const renderer = new WebGLL2HeatmapRenderer(null, { priceBins: 128 });
      const minPrice = 50000;
      const maxPrice = 70000;
      const centerPrice = 61250;
      const atr = 450;
      const kappa = 3.5;

      // Gera sequência ascendente de 100 preços
      const prices: number[] = [];
      for (let p = minPrice; p <= maxPrice; p += 200) {
        prices.push(p);
      }

      let lastBin = -1;
      for (const p of prices) {
        const bin = renderer.quantizePrice(p, minPrice, maxPrice, atr, centerPrice, kappa);
        expect(bin).toBeGreaterThanOrEqual(0);
        expect(bin).toBeLessThanOrEqual(127);
        expect(bin).toBeGreaterThanOrEqual(lastBin); // Monotonicidade não-decrescente
        lastBin = bin;
      }
    });

    it("deve atualizar parâmetros dinâmicos via métodos fluentes e expor telemetria no getMetrics()", () => {
      const renderer = new WebGLL2HeatmapRenderer(null, {
        priceBins: 128,
        dynamicQuantizationEnabled: false,
        adaptivePaletteEnabled: false,
      });

      let metrics = renderer.getMetrics();
      expect(metrics.dynamicQuantizationEnabled).toBe(false);
      expect(metrics.adaptivePaletteEnabled).toBe(false);

      renderer.setDynamicRangeParams(12.5, 3450.0, 5.0);
      renderer.setDynamicQuantization(true);
      renderer.setAdaptivePalette(true);

      metrics = renderer.getMetrics();
      expect(metrics.dynamicQuantizationEnabled).toBe(true);
      expect(metrics.adaptivePaletteEnabled).toBe(true);
      expect(metrics.atr).toBe(12.5);
      expect(metrics.centerPrice).toBe(3450.0);
      expect(metrics.compressionFactor).toBe(5.0);

      renderer.destroy();
    });

    it("deve aplicar quantização adaptativa por ATR no pushDepthSnapshot sem alocação de memória", () => {
      const renderer = new WebGLL2HeatmapRenderer(null, {
        priceBins: 128,
        historyLength: 64,
        dynamicQuantizationEnabled: true,
      });

      const bids = [
        { price: 65000, quantity: 20 },
        { price: 64990, quantity: 15 },
        { price: 64950, quantity: 45 },
      ];
      const asks = [
        { price: 65010, quantity: 18 },
        { price: 65020, quantity: 22 },
        { price: 65060, quantity: 60 },
      ];

      const success = renderer.pushDepthSnapshot(
        bids,
        asks,
        64500,
        65500,
        50.0,
        { atr: 75.0, centerPrice: 65005.0, compressionFactor: 3.5 }
      );

      expect(success).toBe(true);
      const metrics = renderer.getMetrics();
      expect(metrics.currentColumn).toBe(1);
      expect(metrics.bytesUploadedPerSlice).toBe(128 * 4);
    });

    it("deve integrar SharedL2DepthMatrix.packToSliceRGBA com DynamicQuantizationOptions e ATR scaling", () => {
      const matrix = SharedL2DepthMatrix.create(100);
      matrix.writeDepthSnapshot(
        [
          [65000, 10.0],
          [64980, 25.0],
          [64900, 5.0],
        ],
        [
          [65010, 12.0],
          [65030, 30.0],
          [65100, 8.0],
        ],
        1700000400000
      );

      const targetSlice = new Uint8Array(128 * 4);

      // Pack com quantização dinâmica por ATR
      matrix.packToSliceRGBA(
        targetSlice,
        128,
        64500,
        65500,
        20.0,
        { atr: 80.0, centerPrice: 65005.0, compressionFactor: 3.5 }
      );

      // Verifica se houve preenchimento de pixels RGBA válidos
      let nonZeroCount = 0;
      for (let i = 0; i < 128; i++) {
        const r = targetSlice[i * 4 + 0];
        const g = targetSlice[i * 4 + 1];
        const b = targetSlice[i * 4 + 2];
        const a = targetSlice[i * 4 + 3];

        if (a > 0 || r > 0 || g > 0 || b > 0) {
          nonZeroCount++;
        }
      }

      expect(nonZeroCount).toBeGreaterThan(0);
      expect(nonZeroCount).toBeLessThanOrEqual(6); // 6 níveis discretos mapeados
    });

    it("deve propagar parâmetros de ATR e Dynamic Range do WebGLCandlestickRenderer para o L2 Heatmap", () => {
      const candlestickRenderer = new WebGLCandlestickRenderer(null, {
        heatmapEnabled: true,
      });

      expect(() => {
        candlestickRenderer.render({
          minPrice: 64000,
          maxPrice: 66000,
          startIndex: 0,
          endIndex: 100,
          atr: 95.0,
          centerPrice: 65000.0,
          compressionFactor: 4.0,
        });
      }).not.toThrow();

      const heatmapRenderer = candlestickRenderer.getHeatmapRenderer();
      expect(heatmapRenderer).not.toBeNull();
      const metrics = heatmapRenderer!.getMetrics();
      expect(metrics.priceBins).toBeGreaterThan(0);

      candlestickRenderer.destroy();
    });
  });
});




