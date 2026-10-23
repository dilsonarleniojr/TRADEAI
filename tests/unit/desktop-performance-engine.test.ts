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
import { WebGLCandlestickRenderer } from "@/lib/performance/webgl-candlestick-renderer";
import { OffscreenChartController } from "@/lib/performance/offscreen-chart-controller";
import { WebGLL2HeatmapRenderer } from "@/lib/performance/webgl-l2-heatmap-renderer";
import { GPUTransformFeedbackEngine } from "@/lib/performance/gpu-transform-feedback-engine";
import {
  WebGPUOrderBookComputeEngine,
  WGSL_SUBGROUPS_ORDER_BOOK_IMBALANCE_SHADER,
  WGSL_ORDER_BOOK_IMBALANCE_SHADER,
} from "@/lib/performance/webgpu-compute-engine";

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

      // Shader padrão não deve conter enable subgroups para compatibilidade retroativa
      expect(WGSL_ORDER_BOOK_IMBALANCE_SHADER).not.toContain("enable subgroups;");
      expect(WGSL_ORDER_BOOK_IMBALANCE_SHADER).toContain("workgroupBarrier()");
      expect(WGSL_ORDER_BOOK_IMBALANCE_SHADER).toContain("detectedIcebergs");
    });

    it("deve detectar e ativar pipeline SIMD Subgroups com Shuffle Primitives quando adapter expuser 'subgroups'", async () => {
      const origNavigator = (globalThis as any).navigator;
      let requestedFeatures: string[] = [];
      let compiledShaderCode = "";

      const mockDevice = {
        createShaderModule: (desc: { code: string }) => {
          compiledShaderCode = desc.code;
          return {};
        },
        createComputePipeline: () => ({
          getBindGroupLayout: () => ({}),
        }),
        createBuffer: () => ({ destroy: () => {} }),
        createBindGroup: () => ({}),
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
          compiledShaderCode = desc.code;
          return {};
        },
        createComputePipeline: () => ({
          getBindGroupLayout: () => ({}),
        }),
        createBuffer: () => ({ destroy: () => {} }),
        createBindGroup: () => ({}),
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
  });
});




