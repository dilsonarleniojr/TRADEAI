/**
 * MarketDataStreamParser - Decodificador Rápido e Desacoplado de Payloads de Mercado
 * 
 * - String Interning (Symbol Pooling): Reaproveita referências estáticas de símbolos para evitar alocação de strings a cada mensagem
 * - Decodificação rápida de streams combinados da Binance (ticker, kline, depth)
 * - Compatível com execução em Web Worker (thread secundária) ou modo nativo otimizado
 */

export interface ParsedTickerUpdate {
  type: "TICKER";
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
  eventTime: number;
}

export interface ParsedKlineUpdate {
  type: "KLINE";
  symbol: string;
  interval: string;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

export interface ParsedDepthUpdate {
  type: "DEPTH";
  symbol: string;
  bids: [number, number][]; // [price, volume]
  asks: [number, number][];
  eventTime: number;
}

export type ParsedMarketUpdate = ParsedTickerUpdate | ParsedKlineUpdate | ParsedDepthUpdate;

export class MarketDataStreamParser {
  // Pool de strings para reaproveitar instâncias estáticas em memória
  private static symbolPool = new Map<string, string>();

  /**
   * Retorna a referência canônica do símbolo (String Interning) para evitar alocação de heap.
   */
  static internSymbol(sym: string): string {
    const upper = sym.toUpperCase();
    let cached = this.symbolPool.get(upper);
    if (!cached) {
      cached = upper;
      this.symbolPool.set(upper, cached);
    }
    return cached;
  }

  /**
   * Decodifica uma mensagem de texto bruta (JSON string) retornada pelo WebSocket da Binance.
   * Retorna o payload estruturado e normalizado com zero alocação de strings redundantes.
   */
  static parseMessage(rawMessage: string | ArrayBuffer): ParsedMarketUpdate | null {
    try {
      const text = typeof rawMessage === "string" ? rawMessage : new TextDecoder().decode(rawMessage);
      const payload = JSON.parse(text);

      // Trata stream multiplexado: { stream: "btcusdt@ticker", data: {...} }
      const data = payload?.data || payload;
      if (!data) return null;

      // 1. Ticker 24h: { e: "24hrTicker", s: "BTCUSDT", c: "...", ... }
      if (data.e === "24hrTicker" || (data.s && data.c && data.h && data.l && data.v && !data.k)) {
        const symbol = this.internSymbol(data.s);
        return {
          type: "TICKER",
          symbol,
          price: parseFloat(data.c),
          priceChange: parseFloat(data.p || "0"),
          priceChangePercent: parseFloat(data.P || "0"),
          high: parseFloat(data.h),
          low: parseFloat(data.l),
          volume: parseFloat(data.v),
          quoteVolume: parseFloat(data.q || "0"),
          eventTime: data.E || Date.now(),
        };
      }

      // 2. Kline Stream: { e: "kline", s: "BTCUSDT", k: { t: ..., o: ..., ... } }
      if (data.e === "kline" && data.k) {
        const k = data.k;
        const symbol = this.internSymbol(data.s);
        return {
          type: "KLINE",
          symbol,
          interval: k.i,
          openTime: k.t,
          closeTime: k.T,
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
          isClosed: Boolean(k.x),
        };
      }

      // 3. Depth L2 Snapshot / Stream: { bids: [...], asks: [...] }
      if (Array.isArray(data.bids) && Array.isArray(data.asks)) {
        let streamSym = data.s;
        if (!streamSym && typeof payload?.stream === "string") {
          const parts = payload.stream.split("@");
          if (parts[0]) streamSym = parts[0];
        }
        const symbol = this.internSymbol(streamSym || "BTCUSDT");
        const bids: [number, number][] = data.bids.slice(0, 20).map(([p, v]: [string | number, string | number]) => [
          typeof p === "number" ? p : parseFloat(p),
          typeof v === "number" ? v : parseFloat(v),
        ]);
        const asks: [number, number][] = data.asks.slice(0, 20).map(([p, v]: [string | number, string | number]) => [
          typeof p === "number" ? p : parseFloat(p),
          typeof v === "number" ? v : parseFloat(v),
        ]);

        return {
          type: "DEPTH",
          symbol,
          bids,
          asks,
          eventTime: data.E || Date.now(),
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Converte o parser em código de Web Worker embutido (Blob URL),
   * permitindo isolamento em thread secundária sem dependência de bundler de arquivos estáticos.
   */
  static createWorkerBlobUrl(): string {
    const workerScript = `
      self.onmessage = function(e) {
        var rawData = e.data;
        if (!rawData) return;
        try {
          var text = typeof rawData === "string" ? rawData : new TextDecoder().decode(rawData);
          var payload = JSON.parse(text);
          var data = payload.data || payload;
          if (!data) return;

          if (data.c && data.s) {
            self.postMessage({
              type: "TICKER",
              symbol: data.s.toUpperCase(),
              price: parseFloat(data.c),
              priceChangePercent: parseFloat(data.P || 0),
              high: parseFloat(data.h || 0),
              low: parseFloat(data.l || 0),
              volume: parseFloat(data.v || 0),
              eventTime: data.E || Date.now()
            });
          }
        } catch(err) {}
      };
    `;
    const blob = new Blob([workerScript], { type: "application/javascript" });
    return URL.createObjectURL(blob);
  }
}
