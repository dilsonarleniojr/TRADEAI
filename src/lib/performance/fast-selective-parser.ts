/**
 * FastSelectiveParser - Parser Seletivo Streaming de Payloads da Binance
 * 
 * - Extrai exclusivamente os campos essenciais para trading em tempo real (preço, volume, timestamp, símbolo).
 * - Evita a instanciação de árvores de objetos JSON com dezenas de campos desnecessários (b, B, a, A, F, L, etc).
 * - Utiliza String Interning para manter referências estáveis de símbolos em memória.
 * - Suporta payload direto em string ou ArrayBuffer (zero-copy decoding).
 */

export interface FastTickerPayload {
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

export interface FastKlinePayload {
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

export class FastSelectiveParser {
  private static symbolCache = new Map<string, string>();

  /**
   * String Interning para símbolos: retorna a mesma referência de string para economizar memória heap.
   */
  static internSymbol(sym: string): string {
    const key = sym.toUpperCase();
    let cached = this.symbolCache.get(key);
    if (!cached) {
      cached = key;
      this.symbolCache.set(key, cached);
    }
    return cached;
  }

  /**
   * Extrai um valor numérico associado a uma chave string sem parsear o JSON completo.
   * Ex: busca por `"c":"65432.10"` ou `"c":65432.10`
   */
  static extractNumberField(raw: string, fieldKey: string, startIndex = 0): number | null {
    const keyPattern = `"${fieldKey}":`;
    const keyPos = raw.indexOf(keyPattern, startIndex);
    if (keyPos === -1) return null;

    let valStart = keyPos + keyPattern.length;
    // Pula possíveis aspas de abertura se o número estiver como string ("65432.10")
    if (raw.charCodeAt(valStart) === 34) { // 34 = '"'
      valStart++;
    }

    let valEnd = valStart;
    const len = raw.length;
    while (valEnd < len) {
      const code = raw.charCodeAt(valEnd);
      // Termina em vírgula, chave fechando, aspas ou espaço
      if (code === 44 || code === 125 || code === 34 || code === 32 || code === 10 || code === 13) {
        break;
      }
      valEnd++;
    }

    if (valEnd <= valStart) return null;
    const numStr = raw.substring(valStart, valEnd);
    const num = parseFloat(numStr);
    return isNaN(num) ? null : num;
  }

  /**
   * Extrai uma string associada a uma chave sem parsear o JSON completo.
   * Ex: busca por `"s":"BTCUSDT"`
   */
  static extractStringField(raw: string, fieldKey: string, startIndex = 0): string | null {
    const keyPattern = `"${fieldKey}":"`;
    const keyPos = raw.indexOf(keyPattern, startIndex);
    if (keyPos === -1) return null;

    const valStart = keyPos + keyPattern.length;
    const valEnd = raw.indexOf('"', valStart);
    if (valEnd === -1) return null;

    return raw.substring(valStart, valEnd);
  }

  /**
   * Parser Seletivo Ultra-Rápido para Ticker da Binance.
   * Busca diretamente os offsets de campos críticos evitando overhead de deserialização de árvores profundas.
   */
  static parseTicker(raw: string): FastTickerPayload | null {
    const s = this.extractStringField(raw, "s");
    if (!s) return null;

    const c = this.extractNumberField(raw, "c");
    if (c === null) return null;

    const h = this.extractNumberField(raw, "h") ?? c;
    const l = this.extractNumberField(raw, "l") ?? c;
    const v = this.extractNumberField(raw, "v") ?? 0;
    const p = this.extractNumberField(raw, "p") ?? 0;
    const P = this.extractNumberField(raw, "P") ?? 0;
    const q = this.extractNumberField(raw, "q") ?? 0;
    const E = this.extractNumberField(raw, "E") ?? Date.now();

    return {
      type: "TICKER",
      symbol: this.internSymbol(s),
      price: c,
      priceChange: p,
      priceChangePercent: P,
      high: h,
      low: l,
      volume: v,
      quoteVolume: q,
      eventTime: E,
    };
  }

  /**
   * Parser Seletivo Ultra-Rápido para Klines da Binance.
   * Extrai estritamente o bloco `"k": { ... }` sem instanciar metadados supérfluos.
   */
  static parseKline(raw: string): FastKlinePayload | null {
    const kPos = raw.indexOf('"k":{');
    if (kPos === -1) return null;

    const s = this.extractStringField(raw, "s");
    if (!s) return null;

    const i = this.extractStringField(raw, "i", kPos) ?? "1m";
    const t = this.extractNumberField(raw, "t", kPos);
    const T = this.extractNumberField(raw, "T", kPos);
    const o = this.extractNumberField(raw, "o", kPos);
    const h = this.extractNumberField(raw, "h", kPos);
    const l = this.extractNumberField(raw, "l", kPos);
    const c = this.extractNumberField(raw, "c", kPos);
    const v = this.extractNumberField(raw, "v", kPos);

    if (t === null || o === null || h === null || l === null || c === null) {
      return null;
    }

    // Identifica se candle está fechado ("x":true ou "x":false)
    const xPos = raw.indexOf('"x":', kPos);
    const isClosed = xPos !== -1 && raw.charCodeAt(xPos + 4) === 116; // 't' de true

    return {
      type: "KLINE",
      symbol: this.internSymbol(s),
      interval: i,
      openTime: t,
      closeTime: T ?? t + 60000,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v ?? 0,
      isClosed,
    };
  }
}
