/**
 * TypedCandleRingBuffer - Pipeline de Dados de Baixa Alocação (Zero-GC Churn)
 * 
 * - Armazenamento colunar contíguo em memória via Float64Array
 * - Elimina a criação de milhares de objetos { open, high, low, close, volume } a cada tick
 * - Fornece métodos vetoriais para indicadores técnicos (SMA, EMA, RSI, Bollinger Bands, ATR)
 *   que operam diretamente sobre os ponteiros de memória contígua.
 */

export interface CandleInput {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class TypedCandleRingBuffer {
  readonly capacity: number;
  
  // Buffers colunares pré-alocados
  readonly timestamps: Float64Array;
  readonly opens: Float64Array;
  readonly highs: Float64Array;
  readonly lows: Float64Array;
  readonly closes: Float64Array;
  readonly volumes: Float64Array;

  private head = 0; // Próxima posição de escrita
  private count = 0; // Quantidade de candles válidos (até capacity)

  constructor(capacity = 1000) {
    if (capacity <= 0) throw new Error("Capacity must be greater than 0");
    this.capacity = capacity;
    this.timestamps = new Float64Array(capacity);
    this.opens = new Float64Array(capacity);
    this.highs = new Float64Array(capacity);
    this.lows = new Float64Array(capacity);
    this.closes = new Float64Array(capacity);
    this.volumes = new Float64Array(capacity);
  }

  get length(): number {
    return this.count;
  }

  /**
   * Adiciona um novo candle fechado na fila circular em O(1).
   */
  push(candle: CandleInput): void {
    const idx = this.head;
    this.timestamps[idx] = candle.time;
    this.opens[idx] = candle.open;
    this.highs[idx] = candle.high;
    this.lows[idx] = candle.low;
    this.closes[idx] = candle.close;
    this.volumes[idx] = candle.volume;

    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /**
   * Adiciona um candle usando valores primitivos diretamente (sem criar objeto { ... }).
   */
  pushCandle(time: number, open: number, high: number, low: number, close: number, volume: number): void {
    const idx = this.head;
    this.timestamps[idx] = time;
    this.opens[idx] = open;
    this.highs[idx] = high;
    this.lows[idx] = low;
    this.closes[idx] = close;
    this.volumes[idx] = volume;

    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  getCount(): number {
    return this.count;
  }

  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Retorna os dados do candle mais recente em O(1).
   */
  getLatestCandle(): { timestamp: number; open: number; high: number; low: number; close: number; volume: number } | null {
    if (this.count === 0) return null;
    const lastIdx = (this.head - 1 + this.capacity) % this.capacity;
    return {
      timestamp: this.timestamps[lastIdx],
      open: this.opens[lastIdx],
      high: this.highs[lastIdx],
      low: this.lows[lastIdx],
      close: this.closes[lastIdx],
      volume: this.volumes[lastIdx],
    };
  }

  /**
   * Converte a sequência de candles em array cronológico (0 = mais antigo).
   */
  toArray(): Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> {
    const result = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      const pIdx = this.getPhysicalIndex(i);
      result[i] = {
        timestamp: this.timestamps[pIdx],
        open: this.opens[pIdx],
        high: this.highs[pIdx],
        low: this.lows[pIdx],
        close: this.closes[pIdx],
        volume: this.volumes[pIdx],
      };
    }
    return result;
  }

  /**
   * Atualiza in-place o candle atual em formação (última barra aberta) em O(1),
   * sem alocar novos nós ou criar arrays temporários.
   */
  updateCurrentCandle(currentPrice: number, currentVolumeDelta: number = 0, timestamp?: number): void {
    if (this.count === 0) return;
    const lastIdx = (this.head - 1 + this.capacity) % this.capacity;

    if (currentPrice > this.highs[lastIdx]) {
      this.highs[lastIdx] = currentPrice;
    }
    if (currentPrice < this.lows[lastIdx]) {
      this.lows[lastIdx] = currentPrice;
    }
    this.closes[lastIdx] = currentPrice;
    if (currentVolumeDelta > 0) {
      this.volumes[lastIdx] += currentVolumeDelta;
    }
    if (timestamp) {
      this.timestamps[lastIdx] = timestamp;
    }
  }

  /**
   * Retorna os índices lógicos contíguos do buffer (0 = mais antigo, count - 1 = mais recente).
   */
  getPhysicalIndex(logicalIndex: number): number {
    if (logicalIndex < 0 || logicalIndex >= this.count) {
      throw new RangeError(`Index ${logicalIndex} out of bounds (0..${this.count - 1})`);
    }
    const start = this.count < this.capacity ? 0 : this.head;
    return (start + logicalIndex) % this.capacity;
  }

  /**
   * Obtém a cotação de fechamento do candle no índice lógico especificado.
   */
  getClose(logicalIndex: number): number {
    return this.closes[this.getPhysicalIndex(logicalIndex)];
  }

  /**
   * Calcula a Média Móvel Simples (SMA) preenchendo um Float64Array de saída pré-alocado
   * ou retornando um novo buffer.
   */
  calculateSMA(period: number, out?: Float64Array): Float64Array {
    const target = out || new Float64Array(this.count);
    if (period <= 0 || period > this.count) return target;

    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += this.closes[this.getPhysicalIndex(i)];
      target[i] = NaN; // Período incompleto
    }

    target[period - 1] = sum / period;

    for (let i = period; i < this.count; i++) {
      sum += this.closes[this.getPhysicalIndex(i)] - this.closes[this.getPhysicalIndex(i - period)];
      target[i] = sum / period;
    }
    return target;
  }

  /**
   * Calcula a Média Móvel Exponencial (EMA) preenchendo um Float64Array de saída pré-alocado
   * ou retornando um novo buffer.
   */
  calculateEMA(period: number, out?: Float64Array): Float64Array {
    const target = out || new Float64Array(this.count);
    if (period <= 0 || period > this.count) return target;

    const multiplier = 2 / (period + 1);
    
    // Inicia com SMA dos primeiros 'period' itens
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += this.closes[this.getPhysicalIndex(i)];
      target[i] = NaN;
    }

    let prevEma = sum / period;
    target[period - 1] = prevEma;

    for (let i = period; i < this.count; i++) {
      const price = this.closes[this.getPhysicalIndex(i)];
      const currentEma = (price - prevEma) * multiplier + prevEma;
      target[i] = currentEma;
      prevEma = currentEma;
    }
    return target;
  }

  /**
   * Calcula o Índice de Força Relativa (RSI de 14 períodos) com alisamento de Wilder
   * sem alocação de objetos intermediários.
   */
  calculateRSI(period: number, out?: Float64Array): Float64Array {
    const target = out || new Float64Array(this.count);
    if (period <= 0) return target;

    if (this.count <= period) {
      target.fill(50);
      return target;
    }

    target[0] = NaN;
    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i <= period; i++) {
      target[i] = NaN;
      const change = this.closes[this.getPhysicalIndex(i)] - this.closes[this.getPhysicalIndex(i - 1)];
      if (change > 0) avgGain += change;
      else avgLoss += Math.abs(change);
    }

    avgGain /= period;
    avgLoss /= period;

    const rsInitial = avgLoss === 0 ? 100 : avgGain / avgLoss;
    target[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + rsInitial));

    for (let i = period + 1; i < this.count; i++) {
      const change = this.closes[this.getPhysicalIndex(i)] - this.closes[this.getPhysicalIndex(i - 1)];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      if (avgLoss === 0) {
        target[i] = 100;
      } else {
        const rs = avgGain / avgLoss;
        target[i] = 100 - (100 / (1 + rs));
      }
    }
    return target;
  }

  /**
   * Calcula Bandas de Bollinger preenchendo três arrays de saída pré-alocados
   * ou retornando um objeto contendo os 3 buffers.
   */
  calculateBollingerBands(
    period: number,
    k: number,
    outUpper?: Float64Array,
    outMiddle?: Float64Array,
    outLower?: Float64Array
  ): { upper: Float64Array; middle: Float64Array; lower: Float64Array } {
    const upper = outUpper || new Float64Array(this.count);
    const middle = outMiddle || new Float64Array(this.count);
    const lower = outLower || new Float64Array(this.count);

    this.calculateSMA(period, middle);

    for (let i = 0; i < this.count; i++) {
      if (i < period - 1) {
        upper[i] = NaN;
        lower[i] = NaN;
        continue;
      }

      const mean = middle[i];
      let varianceSum = 0;
      for (let j = 0; j < period; j++) {
        const val = this.closes[this.getPhysicalIndex(i - j)];
        varianceSum += Math.pow(val - mean, 2);
      }
      const stdDev = Math.sqrt(varianceSum / period);
      upper[i] = mean + k * stdDev;
      lower[i] = mean - k * stdDev;
    }

    return { upper, middle, lower };
  }

  /**
   * Esvazia o buffer mantendo a alocação de memória ativa.
   */
  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
