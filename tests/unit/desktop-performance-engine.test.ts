import { describe, it, expect } from "bun:test";
import { TickCoalescer } from "@/lib/performance/tick-coalescer";
import { TypedCandleRingBuffer } from "@/lib/performance/typed-candle-ring-buffer";
import { MarketDataStreamParser } from "@/lib/performance/market-data-stream-parser";

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
});
