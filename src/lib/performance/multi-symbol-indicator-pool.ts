/**
 * MultiSymbolIndicatorPool
 *
 * Pool de memória estática em ArrayBuffer / SharedArrayBuffer compartilhado para robôs
 * de alta frequência operando múltiplos pares concorrentes (ex: BTC, ETH, SOL, AVAX, SUI).
 *
 * Arquitetura de Memória & Cache Line:
 * - Cada símbolo ocupa exatamente 16 floats de 64 bits (128 bytes = 2 cache lines de 64 bytes).
 * - Uma tabela de 64 símbolos ocupa apenas 8 KB (8.192 bytes), cabendo integralmente na
 *   cache L1D da CPU (32 KB - 48 KB) de qualquer processador moderno.
 * - Elimina 100% das alocações dinâmicas no heap ({ rsi, state }, { result, state })
 *   durante a alternância de contexto entre símbolos no loop crítico de ticks.
 */

export const STRIDE_INDICATOR_FLOATS = 16;
export const STRIDE_INDICATOR_BYTES = 128;

// Offsets no bloco de 16 floats do símbolo
export const OFFSET_RSI_LAST_CLOSE = 0;
export const OFFSET_RSI_AVG_GAIN = 1;
export const OFFSET_RSI_AVG_LOSS = 2;
export const OFFSET_RSI_VALUE = 3;
export const OFFSET_RSI_INITIALIZED = 4;

export const OFFSET_MACD_FAST_EMA = 5;
export const OFFSET_MACD_SLOW_EMA = 6;
export const OFFSET_MACD_SIGNAL_EMA = 7;
export const OFFSET_MACD_LINE = 8;
export const OFFSET_MACD_HISTOGRAM = 9;
export const OFFSET_MACD_PREV_HISTOGRAM = 10;
export const OFFSET_MACD_INITIALIZED = 11;

export const OFFSET_EMA_9 = 12;
export const OFFSET_EMA_21 = 13;
export const OFFSET_EMA_50 = 14;
export const OFFSET_LAST_PRICE = 15;

export interface IndicatorPoolMetrics {
  maxSymbols: number;
  registeredSymbols: number;
  bufferSizeBytes: number;
  strideBytes: number;
  isShared: boolean;
  cacheLineAligned: boolean;
}

export class MultiSymbolIndicatorPool {
  private static instance: MultiSymbolIndicatorPool | null = null;

  public readonly buffer: ArrayBuffer | SharedArrayBuffer;
  public readonly view: Float64Array;
  public readonly maxSymbols: number;

  private symbolToCode = new Map<string, number>();
  private codeToSymbol: string[] = [];
  private nextCode = 0;

  constructor(maxSymbols = 64, useSharedBuffer = false) {
    this.maxSymbols = maxSymbols;
    const totalBytes = maxSymbols * STRIDE_INDICATOR_BYTES;

    if (useSharedBuffer && typeof SharedArrayBuffer !== "undefined") {
      this.buffer = new SharedArrayBuffer(totalBytes);
    } else {
      this.buffer = new ArrayBuffer(totalBytes);
    }

    this.view = new Float64Array(this.buffer);

    // Pré-registra pares institucionais mais líquidos como padrão
    const defaultMajorPairs = [
      "BTCUSDT",
      "ETHUSDT",
      "SOLUSDT",
      "AVAXUSDT",
      "SUIUSDT",
      "BNBUSDT",
      "XRPUSDT",
      "DOGEUSDT",
      "ADAUSDT",
      "LINKUSDT",
    ];

    for (const sym of defaultMajorPairs) {
      this.registerSymbol(sym);
    }
  }

  /**
   * Obtém a instância Singleton do pool global compartilhado.
   */
  public static getInstance(maxSymbols = 64): MultiSymbolIndicatorPool {
    if (!MultiSymbolIndicatorPool.instance) {
      MultiSymbolIndicatorPool.instance = new MultiSymbolIndicatorPool(maxSymbols, false);
    }
    return MultiSymbolIndicatorPool.instance;
  }

  /**
   * Reinicia o singleton (usado principalmente em rotinas de teste e teardown).
   */
  public static resetInstance(): void {
    MultiSymbolIndicatorPool.instance = null;
  }

  /**
   * Registra um símbolo no pool e retorna seu symbolCode O(1).
   */
  public registerSymbol(symbol: string): number {
    const upper = symbol.toUpperCase();
    const existing = this.symbolToCode.get(upper);
    if (existing !== undefined) {
      return existing;
    }

    if (this.nextCode >= this.maxSymbols) {
      throw new Error(
        `[MultiSymbolIndicatorPool] Capacidade esgotada: maxSymbols = ${this.maxSymbols}. Não é possível registrar ${upper}`
      );
    }

    const code = this.nextCode++;
    this.symbolToCode.set(upper, code);
    this.codeToSymbol[code] = upper;
    return code;
  }

  /**
   * Retorna o symbolCode associado, ou o registra dinamicamente se ainda não existir.
   */
  public getOrRegisterSymbol(symbol: string): number {
    const upper = symbol.toUpperCase();
    const existing = this.symbolToCode.get(upper);
    if (existing !== undefined) {
      return existing;
    }
    return this.registerSymbol(upper);
  }

  /**
   * Retorna o symbolCode existente ou -1 se não registrado.
   */
  public getSymbolCode(symbol: string): number {
    return this.symbolToCode.get(symbol.toUpperCase()) ?? -1;
  }

  /**
   * Retorna o nome do símbolo a partir de seu symbolCode.
   */
  public getSymbolName(code: number): string | undefined {
    return this.codeToSymbol[code];
  }

  /**
   * Retorna o número de símbolos registrados atualmente.
   */
  public getRegisteredCount(): number {
    return this.nextCode;
  }

  /**
   * Atualização incremental in-place de RSI de Wilder em O(1) sem alocação no heap.
   * Retorna a primitiva numérica direta do novo valor de RSI.
   */
  public updateRSI(symbolCode: number, currentClose: number, period = 14): number {
    const base = symbolCode * STRIDE_INDICATOR_FLOATS;
    const isInit = this.view[base + OFFSET_RSI_INITIALIZED];

    if (isInit === 0) {
      this.view[base + OFFSET_RSI_LAST_CLOSE] = currentClose;
      this.view[base + OFFSET_RSI_AVG_GAIN] = 0;
      this.view[base + OFFSET_RSI_AVG_LOSS] = 0;
      this.view[base + OFFSET_RSI_VALUE] = 50.0;
      this.view[base + OFFSET_RSI_INITIALIZED] = 1.0;
      return 50.0;
    }

    const prevClose = this.view[base + OFFSET_RSI_LAST_CLOSE];
    const diff = currentClose - prevClose;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    const prevAvgGain = this.view[base + OFFSET_RSI_AVG_GAIN];
    const prevAvgLoss = this.view[base + OFFSET_RSI_AVG_LOSS];

    const avgGain = (prevAvgGain * (period - 1) + gain) / period;
    const avgLoss = (prevAvgLoss * (period - 1) + loss) / period;

    let rsi: number;
    if (avgLoss === 0) {
      rsi = 100.0;
    } else {
      const rs = avgGain / avgLoss;
      rsi = 100.0 - (100.0 / (1.0 + rs));
    }

    this.view[base + OFFSET_RSI_LAST_CLOSE] = currentClose;
    this.view[base + OFFSET_RSI_AVG_GAIN] = avgGain;
    this.view[base + OFFSET_RSI_AVG_LOSS] = avgLoss;
    this.view[base + OFFSET_RSI_VALUE] = rsi;

    return rsi;
  }

  /**
   * Atualização incremental in-place de MACD em O(1) sem alocação no heap.
   * Retorna a primitiva numérica do novo histograma do MACD.
   */
  public updateMACD(
    symbolCode: number,
    currentClose: number,
    fast = 12,
    slow = 26,
    signalPeriod = 9
  ): number {
    const base = symbolCode * STRIDE_INDICATOR_FLOATS;
    const isInit = this.view[base + OFFSET_MACD_INITIALIZED];

    if (isInit === 0) {
      this.view[base + OFFSET_MACD_FAST_EMA] = currentClose;
      this.view[base + OFFSET_MACD_SLOW_EMA] = currentClose;
      this.view[base + OFFSET_MACD_SIGNAL_EMA] = 0;
      this.view[base + OFFSET_MACD_LINE] = 0;
      this.view[base + OFFSET_MACD_HISTOGRAM] = 0;
      this.view[base + OFFSET_MACD_PREV_HISTOGRAM] = 0;
      this.view[base + OFFSET_MACD_INITIALIZED] = 1.0;
      return 0.0;
    }

    const kFast = 2 / (fast + 1);
    const kSlow = 2 / (slow + 1);
    const kSignal = 2 / (signalPeriod + 1);

    const prevFast = this.view[base + OFFSET_MACD_FAST_EMA];
    const prevSlow = this.view[base + OFFSET_MACD_SLOW_EMA];
    const prevSignal = this.view[base + OFFSET_MACD_SIGNAL_EMA];
    const prevHistogram = this.view[base + OFFSET_MACD_HISTOGRAM];

    const newFast = currentClose * kFast + prevFast * (1 - kFast);
    const newSlow = currentClose * kSlow + prevSlow * (1 - kSlow);
    const newMacd = newFast - newSlow;
    const newSignal = newMacd * kSignal + prevSignal * (1 - kSignal);
    const newHistogram = newMacd - newSignal;

    this.view[base + OFFSET_MACD_PREV_HISTOGRAM] = prevHistogram;
    this.view[base + OFFSET_MACD_FAST_EMA] = newFast;
    this.view[base + OFFSET_MACD_SLOW_EMA] = newSlow;
    this.view[base + OFFSET_MACD_SIGNAL_EMA] = newSignal;
    this.view[base + OFFSET_MACD_LINE] = newMacd;
    this.view[base + OFFSET_MACD_HISTOGRAM] = newHistogram;

    return newHistogram;
  }

  /**
   * Atualização combinada de tick completo (RSI 14, MACD 12/26/9, EMAs 9, 21, 50) in-place.
   * Estritamente 0 alocações no heap por milhão de chamadas.
   */
  public updateTick(symbolCode: number, price: number): void {
    const base = symbolCode * STRIDE_INDICATOR_FLOATS;
    this.view[base + OFFSET_LAST_PRICE] = price;

    // 1. Atualiza RSI in-place
    this.updateRSI(symbolCode, price, 14);

    // 2. Atualiza MACD in-place
    this.updateMACD(symbolCode, price, 12, 26, 9);

    // 3. Atualiza EMAs (9, 21, 50) in-place
    const ema9 = this.view[base + OFFSET_EMA_9];
    const ema21 = this.view[base + OFFSET_EMA_21];
    const ema50 = this.view[base + OFFSET_EMA_50];

    const k9 = 2 / (9 + 1);
    const k21 = 2 / (21 + 1);
    const k50 = 2 / (50 + 1);

    this.view[base + OFFSET_EMA_9] = ema9 === 0 ? price : price * k9 + ema9 * (1 - k9);
    this.view[base + OFFSET_EMA_21] = ema21 === 0 ? price : price * k21 + ema21 * (1 - k21);
    this.view[base + OFFSET_EMA_50] = ema50 === 0 ? price : price * k50 + ema50 * (1 - k50);
  }

  /**
   * Semeia histórico completo para um símbolo a partir de array cronológico de fechamentos.
   */
  public seedHistorical(
    symbolCode: number,
    closes: number[] | Float64Array,
    rsiPeriod = 14,
    fast = 12,
    slow = 26,
    signalPeriod = 9
  ): void {
    const len = closes.length;
    if (len === 0) return;

    const base = symbolCode * STRIDE_INDICATOR_FLOATS;
    const lastPrice = closes[len - 1];
    this.view[base + OFFSET_LAST_PRICE] = lastPrice;

    // Seeding RSI de Wilder
    if (len >= rsiPeriod + 1) {
      let gains = 0;
      let losses = 0;
      for (let i = 1; i <= rsiPeriod; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff;
        else losses += Math.abs(diff);
      }
      let avgGain = gains / rsiPeriod;
      let avgLoss = losses / rsiPeriod;

      for (let i = rsiPeriod + 1; i < len; i++) {
        const diff = closes[i] - closes[i - 1];
        avgGain = (avgGain * (rsiPeriod - 1) + (diff > 0 ? diff : 0)) / rsiPeriod;
        avgLoss = (avgLoss * (rsiPeriod - 1) + (diff < 0 ? -diff : 0)) / rsiPeriod;
      }

      const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
      this.view[base + OFFSET_RSI_LAST_CLOSE] = lastPrice;
      this.view[base + OFFSET_RSI_AVG_GAIN] = avgGain;
      this.view[base + OFFSET_RSI_AVG_LOSS] = avgLoss;
      this.view[base + OFFSET_RSI_VALUE] = rsi;
      this.view[base + OFFSET_RSI_INITIALIZED] = 1.0;
    } else {
      this.view[base + OFFSET_RSI_LAST_CLOSE] = lastPrice;
      this.view[base + OFFSET_RSI_AVG_GAIN] = 0;
      this.view[base + OFFSET_RSI_AVG_LOSS] = 0;
      this.view[base + OFFSET_RSI_VALUE] = 50.0;
      this.view[base + OFFSET_RSI_INITIALIZED] = 1.0;
    }

    // Seeding MACD
    if (len >= slow + signalPeriod) {
      const kFast = 2 / (fast + 1);
      const kSlow = 2 / (slow + 1);
      const kSignal = 2 / (signalPeriod + 1);

      let fastEma = closes[0];
      let slowEma = closes[0];
      const macdBuffer = new Float64Array(len);
      macdBuffer[0] = 0;

      for (let i = 1; i < len; i++) {
        fastEma = closes[i] * kFast + fastEma * (1 - kFast);
        slowEma = closes[i] * kSlow + slowEma * (1 - kSlow);
        macdBuffer[i] = fastEma - slowEma;
      }

      let signalEma = macdBuffer[0];
      let prevHist = 0;
      for (let i = 1; i < len; i++) {
        signalEma = macdBuffer[i] * kSignal + signalEma * (1 - kSignal);
        if (i === len - 2) {
          prevHist = macdBuffer[i] - signalEma;
        }
      }

      const currentMacd = macdBuffer[len - 1];
      const currentHist = currentMacd - signalEma;

      this.view[base + OFFSET_MACD_FAST_EMA] = fastEma;
      this.view[base + OFFSET_MACD_SLOW_EMA] = slowEma;
      this.view[base + OFFSET_MACD_SIGNAL_EMA] = signalEma;
      this.view[base + OFFSET_MACD_LINE] = currentMacd;
      this.view[base + OFFSET_MACD_HISTOGRAM] = currentHist;
      this.view[base + OFFSET_MACD_PREV_HISTOGRAM] = prevHist;
      this.view[base + OFFSET_MACD_INITIALIZED] = 1.0;
    } else {
      this.view[base + OFFSET_MACD_FAST_EMA] = lastPrice;
      this.view[base + OFFSET_MACD_SLOW_EMA] = lastPrice;
      this.view[base + OFFSET_MACD_SIGNAL_EMA] = 0;
      this.view[base + OFFSET_MACD_LINE] = 0;
      this.view[base + OFFSET_MACD_HISTOGRAM] = 0;
      this.view[base + OFFSET_MACD_PREV_HISTOGRAM] = 0;
      this.view[base + OFFSET_MACD_INITIALIZED] = 1.0;
    }

    // Seeding EMAs (9, 21, 50)
    const k9 = 2 / (9 + 1);
    const k21 = 2 / (21 + 1);
    const k50 = 2 / (50 + 1);

    let e9 = closes[0];
    let e21 = closes[0];
    let e50 = closes[0];

    for (let i = 1; i < len; i++) {
      const c = closes[i];
      e9 = c * k9 + e9 * (1 - k9);
      e21 = c * k21 + e21 * (1 - k21);
      e50 = c * k50 + e50 * (1 - k50);
    }

    this.view[base + OFFSET_EMA_9] = e9;
    this.view[base + OFFSET_EMA_21] = e21;
    this.view[base + OFFSET_EMA_50] = e50;
  }

  // --- Getters Primitivos Zero-Allocation O(1) ---

  public getRSI(symbolCode: number): number {
    return this.view[symbolCode * STRIDE_INDICATOR_FLOATS + OFFSET_RSI_VALUE];
  }

  public getMacdLine(symbolCode: number): number {
    return this.view[symbolCode * STRIDE_INDICATOR_FLOATS + OFFSET_MACD_LINE];
  }

  public getMacdSignal(symbolCode: number): number {
    return this.view[symbolCode * STRIDE_INDICATOR_FLOATS + OFFSET_MACD_SIGNAL_EMA];
  }

  public getMacdHistogram(symbolCode: number): number {
    return this.view[symbolCode * STRIDE_INDICATOR_FLOATS + OFFSET_MACD_HISTOGRAM];
  }

  public getMacdPrevHistogram(symbolCode: number): number {
    return this.view[symbolCode * STRIDE_INDICATOR_FLOATS + OFFSET_MACD_PREV_HISTOGRAM];
  }

  public getEMA9(symbolCode: number): number {
    return this.view[symbolCode * STRIDE_INDICATOR_FLOATS + OFFSET_EMA_9];
  }

  public getEMA21(symbolCode: number): number {
    return this.view[symbolCode * STRIDE_INDICATOR_FLOATS + OFFSET_EMA_21];
  }

  public getEMA50(symbolCode: number): number {
    return this.view[symbolCode * STRIDE_INDICATOR_FLOATS + OFFSET_EMA_50];
  }

  public getLastPrice(symbolCode: number): number {
    return this.view[symbolCode * STRIDE_INDICATOR_FLOATS + OFFSET_LAST_PRICE];
  }

  public isInitialized(symbolCode: number): boolean {
    const base = symbolCode * STRIDE_INDICATOR_FLOATS;
    return (
      this.view[base + OFFSET_RSI_INITIALIZED] === 1.0 &&
      this.view[base + OFFSET_MACD_INITIALIZED] === 1.0
    );
  }

  /**
   * Copia o snapshot de todos os 16 indicadores do símbolo para um buffer de rascunho
   * fornecido pelo chamador, sem alocar objetos no heap.
   */
  public readSnapshot(symbolCode: number, outScratch: Float64Array): void {
    const base = symbolCode * STRIDE_INDICATOR_FLOATS;
    for (let i = 0; i < STRIDE_INDICATOR_FLOATS; i++) {
      outScratch[i] = this.view[base + i];
    }
  }

  /**
   * Retorna métricas de alinhamento e memória do pool.
   */
  public getMetrics(): IndicatorPoolMetrics {
    return {
      maxSymbols: this.maxSymbols,
      registeredSymbols: this.nextCode,
      bufferSizeBytes: this.buffer.byteLength,
      strideBytes: STRIDE_INDICATOR_BYTES,
      isShared: typeof SharedArrayBuffer !== "undefined" && this.buffer instanceof SharedArrayBuffer,
      cacheLineAligned: STRIDE_INDICATOR_BYTES % 64 === 0,
    };
  }
}
