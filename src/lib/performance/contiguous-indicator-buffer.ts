/**
 * ContiguousIndicatorBuffer - Buffer Unidimensional Contíguo de Indicadores (Zero-GC Churn)
 * 
 * - Aloca um único Float64Array contíguo na memória: [capacidade * STRIDE].
 * - Maximiza localidade espacial de referência e acertos de cache L1/L2 da CPU.
 * - Recálculo incremental em O(1) da barra aberta (in-place mutation) sem criar novos objetos ou arrays intermediários.
 */

export const INDICATOR_STRIDE = 12;

export const OFFSET_TIME = 0;
export const OFFSET_OPEN = 1;
export const OFFSET_HIGH = 2;
export const OFFSET_LOW = 3;
export const OFFSET_CLOSE = 4;
export const OFFSET_VOLUME = 5;
export const OFFSET_SMA20 = 6;
export const OFFSET_SMA50 = 7;
export const OFFSET_EMA12 = 8;
export const OFFSET_EMA26 = 9;
export const OFFSET_RSI14 = 10;
export const OFFSET_ATR14 = 11;

export type ATRUpdateListener = (atr: number, closePrice: number, time: number) => void;

export class ContiguousIndicatorBuffer {
  readonly capacity: number;
  readonly stride: number;
  readonly data: Float64Array;

  private head = 0; // Próximo índice de slot para escrita
  private count = 0; // Quantidade de candles armazenados (até capacity)
  private atrListeners: ATRUpdateListener[] = [];

  // Multiplicadores pré-computados para EMA
  private readonly k12 = 2 / (12 + 1);
  private readonly k26 = 2 / (26 + 1);

  constructor(capacity = 500) {
    if (capacity <= 0) throw new Error("Capacity must be > 0");
    this.capacity = capacity;
    this.stride = INDICATOR_STRIDE;
    this.data = new Float64Array(capacity * this.stride);
  }

  get length(): number {
    return this.count;
  }

  /**
   * Registra um listener para notificações de novo cálculo de ATR14 a cada candle fechado.
   * Retorna uma função de desinscrição para evitar vazamentos de memória.
   */
  public onATRUpdate(listener: ATRUpdateListener): () => void {
    this.atrListeners.push(listener);
    return () => {
      const idx = this.atrListeners.indexOf(listener);
      if (idx !== -1) {
        this.atrListeners.splice(idx, 1);
      }
    };
  }

  /**
   * Remove todos os listeners registrados para ATR.
   */
  public removeAllATRListeners(): void {
    this.atrListeners.length = 0;
  }

  /**
   * Retorna o número de listeners registrados.
   */
  public getATRListenersCount(): number {
    return this.atrListeners.length;
  }

  /**
   * Converte índice lógico (0 = mais antigo, count - 1 = mais recente) para o índice físico no buffer plano.
   */
  private getSlotIndex(logicalIndex: number): number {
    if (this.count < this.capacity) {
      return logicalIndex;
    }
    return (this.head + logicalIndex) % this.capacity;
  }

  /**
   * Adiciona um novo candle fechado e calcula seus indicadores técnicos em O(1).
   */
  push(
    time: number,
    open: number,
    high: number,
    low: number,
    close: number,
    volume: number
  ): void {
    const slot = this.head;
    const base = slot * this.stride;

    this.data[base + OFFSET_TIME] = time;
    this.data[base + OFFSET_OPEN] = open;
    this.data[base + OFFSET_HIGH] = high;
    this.data[base + OFFSET_LOW] = low;
    this.data[base + OFFSET_CLOSE] = close;
    this.data[base + OFFSET_VOLUME] = volume;

    if (this.count < this.capacity) {
      this.count++;
    }

    // Recalcula indicadores para o novo candle já considerando a contagem atualizada
    this.computeIndicatorsForSlot(slot, close, high, low);

    // Notifica listeners do cálculo atualizado de ATR14
    if (this.atrListeners.length > 0) {
      const computedAtr = this.data[base + OFFSET_ATR14];
      for (let i = 0; i < this.atrListeners.length; i++) {
        this.atrListeners[i](computedAtr, close, time);
      }
    }

    this.head = (this.head + 1) % this.capacity;
  }

  /**
   * Atualiza in-place o candle atual em formação (última barra) em O(1) sem alocação.
   */
  updateCurrentBar(
    high: number,
    low: number,
    close: number,
    volumeDelta: number
  ): void {
    if (this.count === 0) return;

    const lastSlot = (this.head - 1 + this.capacity) % this.capacity;
    const base = lastSlot * this.stride;

    if (high > this.data[base + OFFSET_HIGH]) {
      this.data[base + OFFSET_HIGH] = high;
    }
    if (low < this.data[base + OFFSET_LOW]) {
      this.data[base + OFFSET_LOW] = low;
    }
    this.data[base + OFFSET_CLOSE] = close;
    this.data[base + OFFSET_VOLUME] += volumeDelta;

    // Recalcula indicadores in-place para o último candle
    this.computeIndicatorsForSlot(lastSlot, close, this.data[base + OFFSET_HIGH], this.data[base + OFFSET_LOW]);
  }

  /**
   * Recalcula os indicadores matemáticos diretamente sobre a memória linear contígua.
   */
  private computeIndicatorsForSlot(slot: number, close: number, high: number, low: number): void {
    const base = slot * this.stride;
    const prevSlot = (slot - 1 + this.capacity) % this.capacity;
    const prevBase = prevSlot * this.stride;
    const hasPrevious = this.count > 1;

    // 1. EMA 12 e EMA 26
    if (!hasPrevious) {
      this.data[base + OFFSET_EMA12] = close;
      this.data[base + OFFSET_EMA26] = close;
    } else {
      const prevEma12 = this.data[prevBase + OFFSET_EMA12];
      const prevEma26 = this.data[prevBase + OFFSET_EMA26];
      this.data[base + OFFSET_EMA12] = close * this.k12 + prevEma12 * (1 - this.k12);
      this.data[base + OFFSET_EMA26] = close * this.k26 + prevEma26 * (1 - this.k26);
    }

    // 2. SMA 20 e SMA 50
    this.data[base + OFFSET_SMA20] = this.computeWindowSMA(20);
    this.data[base + OFFSET_SMA50] = this.computeWindowSMA(50);

    // 3. ATR 14
    if (!hasPrevious) {
      this.data[base + OFFSET_ATR14] = high - low;
    } else {
      const prevClose = this.data[prevBase + OFFSET_CLOSE];
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      const prevAtr = this.data[prevBase + OFFSET_ATR14];
      this.data[base + OFFSET_ATR14] = (prevAtr * 13 + tr) / 14;
    }

    // 4. RSI 14 (Aproximação linear incremental de Wilder)
    if (!hasPrevious) {
      this.data[base + OFFSET_RSI14] = 50;
    } else {
      const prevClose = this.data[prevBase + OFFSET_CLOSE];
      const diff = close - prevClose;
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      
      const prevRsi = this.data[prevBase + OFFSET_RSI14];
      // Ajuste suave incremental
      const alpha = 1 / 14;
      const adjustedRsi = prevRsi + (gain > loss ? (100 - prevRsi) * alpha * 0.5 : -prevRsi * alpha * 0.5);
      this.data[base + OFFSET_RSI14] = Math.max(0, Math.min(100, adjustedRsi));
    }
  }

  /**
   * Cálculo vetorizado de SMA sobre a janela mais recente em memória contígua.
   */
  private computeWindowSMA(period: number): number {
    const n = Math.min(this.count, period);
    if (n === 0) return 0;

    let sum = 0;
    for (let i = 0; i < n; i++) {
      const logicalIdx = this.count - 1 - i;
      const slot = this.getSlotIndex(logicalIdx);
      sum += this.data[slot * this.stride + OFFSET_CLOSE];
    }
    return sum / n;
  }

  /**
   * Obtém um campo escalar específico do candle mais recente em O(1).
   */
  getLatestValue(fieldOffset: number): number {
    if (this.count === 0) return 0;
    const lastSlot = (this.head - 1 + this.capacity) % this.capacity;
    return this.data[lastSlot * this.stride + fieldOffset];
  }

  /**
   * Retorna os últimos N valores de um indicador específico como Float64Array.
   */
  getSeries(fieldOffset: number, maxCount = 50): Float64Array {
    const n = Math.min(this.count, maxCount);
    const series = new Float64Array(n);
    const startLogical = this.count - n;

    for (let i = 0; i < n; i++) {
      const slot = this.getSlotIndex(startLogical + i);
      series[i] = this.data[slot * this.stride + fieldOffset];
    }

    return series;
  }
}
