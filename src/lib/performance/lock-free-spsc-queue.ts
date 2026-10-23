/**
 * LockFreeSPSCQueue - Fila Circular Lock-Free Single-Producer Single-Consumer (SPSC)
 * 
 * Arquitetura de Concorrência de Alta Frequência (Zero-Lock / Zero-Allocation):
 * - Eliminação de Mutexes / Synchronized: Operações atômicas puras (Atomics.load / store).
 * - Isolamento de Linhas de Cache (Cache-Line Padding de 64 Bytes): Impede falso compartilhamento
 *   (False Sharing) entre o núcleo produtor (thread de rede/WebSocket) e o núcleo consumidor (cálculo/renderização).
 * - Indexação por Máscara de Bits (Bitmask Indexing): Capacidade restrita a potências de 2 (2^N),
 *   substituindo divisões de módulo (idiv ~20-30 ciclos) por operador bitwise AND (1 ciclo de clock).
 * - Cache Local de Sequência (Sequence Caching): O produtor só lê o tail remoto quando o buffer aparenta
 *   estar cheio; o consumidor só lê o head remoto quando o buffer aparenta estar vazio, reduzindo o
 *   tráfego do barramento inter-core em >99%.
 */

export const CACHE_LINE_SIZE_BYTES = 64; // Padrão em x86-64 e ARM64
export const CACHE_LINE_INTS = CACHE_LINE_SIZE_BYTES / Int32Array.BYTES_PER_ELEMENT; // 16 inteiros de 32 bits

// Layout de Memória do Cabeçalho de Controle com Cache-Line Padding
// Cache Line 0 (Escrita exclusiva do Produtor): [0..15]
export const PRODUCER_HEAD_INDEX = 0;       // Ponteiro atômico de escrita (Producer)
export const PRODUCER_CACHED_TAIL = 1;      // Cópia local de tail no produtor
export const PRODUCER_DROPPED_COUNT = 2;    // Contador de pacotes descartados por overflow
export const PRODUCER_WRITE_COUNT = 3;      // Contador acumulado de gravações

// Cache Line 1 (Escrita exclusiva do Consumidor): [16..31]
export const CONSUMER_TAIL_INDEX = 16;      // Ponteiro atômico de leitura (Consumer)
export const CONSUMER_CACHED_HEAD = 17;     // Cópia local de head no consumidor
export const CONSUMER_READ_COUNT = 18;      // Contador acumulado de leituras

// Cache Line 2 (Configuração estática / Read-Only): [32..47]
export const CONFIG_CAPACITY_INDEX = 32;    // Capacidade da fila (potência de 2)
export const CONFIG_MASK_INDEX = 33;        // Máscara bitwise (capacity - 1)
export const CONFIG_STRIDE_INDEX = 34;      // Float64s por slot

export const TOTAL_HEADER_INTS = 48;        // 3 Cache Lines completas
export const TOTAL_HEADER_BYTES = TOTAL_HEADER_INTS * Int32Array.BYTES_PER_ELEMENT; // 192 bytes

export interface SPSCQueueMetrics {
  capacity: number;
  stride: number;
  head: number;
  tail: number;
  available: number;
  dropped: number;
  totalWrites: number;
  totalReads: number;
  isFull: boolean;
  isEmpty: boolean;
  cacheLinePaddingBytes: number;
}

export class LockFreeSPSCQueue {
  private readonly buffer: SharedArrayBuffer | ArrayBuffer;
  private readonly header: Int32Array;
  private readonly data: Float64Array;
  private readonly capacity: number;
  private readonly mask: number;
  private readonly stride: number;

  constructor(buffer: SharedArrayBuffer | ArrayBuffer) {
    this.buffer = buffer;
    this.header = new Int32Array(buffer, 0, TOTAL_HEADER_INTS);
    this.capacity = this.header[CONFIG_CAPACITY_INDEX];
    this.mask = this.header[CONFIG_MASK_INDEX];
    this.stride = this.header[CONFIG_STRIDE_INDEX];

    // O payload de dados inicia imediatamente após o alinhamento de 3 cache lines (192 bytes)
    this.data = new Float64Array(buffer, TOTAL_HEADER_BYTES, this.capacity * this.stride);
  }

  /**
   * Arredonda qualquer número para a próxima potência de 2.
   */
  public static nextPowerOfTwo(val: number): number {
    let v = Math.max(16, val - 1);
    v |= v >>> 1;
    v |= v >>> 2;
    v |= v >>> 4;
    v |= v >>> 8;
    v |= v >>> 16;
    return v + 1;
  }

  /**
   * Aloca uma nova fila SPSC com garantia estrita de padding de linhas de cache.
   */
  public static create(capacity: number = 2048, stride: number = 8): LockFreeSPSCQueue {
    const pow2Capacity = LockFreeSPSCQueue.nextPowerOfTwo(capacity);
    const totalBytes = TOTAL_HEADER_BYTES + pow2Capacity * stride * Float64Array.BYTES_PER_ELEMENT;

    const buffer: SharedArrayBuffer | ArrayBuffer =
      typeof SharedArrayBuffer !== "undefined" && typeof Atomics !== "undefined"
        ? new SharedArrayBuffer(totalBytes)
        : new ArrayBuffer(totalBytes);

    const header = new Int32Array(buffer, 0, TOTAL_HEADER_INTS);
    header[PRODUCER_HEAD_INDEX] = 0;
    header[PRODUCER_CACHED_TAIL] = 0;
    header[PRODUCER_DROPPED_COUNT] = 0;
    header[PRODUCER_WRITE_COUNT] = 0;

    header[CONSUMER_TAIL_INDEX] = 0;
    header[CONSUMER_CACHED_HEAD] = 0;
    header[CONSUMER_READ_COUNT] = 0;

    header[CONFIG_CAPACITY_INDEX] = pow2Capacity;
    header[CONFIG_MASK_INDEX] = pow2Capacity - 1;
    header[CONFIG_STRIDE_INDEX] = stride;

    return new LockFreeSPSCQueue(buffer);
  }

  public static fromBuffer(buffer: SharedArrayBuffer | ArrayBuffer): LockFreeSPSCQueue {
    return new LockFreeSPSCQueue(buffer);
  }

  public getRawBuffer(): SharedArrayBuffer | ArrayBuffer {
    return this.buffer;
  }

  public getCapacity(): number {
    return this.capacity;
  }

  public getStride(): number {
    return this.stride;
  }

  /**
   * Operação do Produtor: Enfileira um slot de dados sem bloqueios ou locks.
   * Utiliza caching local de tail para minimizar leituras de cache inter-core.
   */
  public push(slotValues: number[] | Float64Array): boolean {
    const head = Atomics.load(this.header, PRODUCER_HEAD_INDEX);
    let cachedTail = this.header[PRODUCER_CACHED_TAIL];

    // Se o head alcançar a capacidade aparente, atualiza a cópia local do tail
    if (head - cachedTail >= this.capacity) {
      cachedTail = Atomics.load(this.header, CONSUMER_TAIL_INDEX);
      this.header[PRODUCER_CACHED_TAIL] = cachedTail;

      // Se ainda estiver cheio após leitura fresca, há sobrecarga/overflow
      if (head - cachedTail >= this.capacity) {
        Atomics.add(this.header, PRODUCER_DROPPED_COUNT, 1);
        return false; // Backpressure: produtor descarta ou aplica política de amortecimento
      }
    }

    // Calcula o índice físico via máscara de bits (1 ciclo de CPU)
    const slotIndex = head & this.mask;
    const dataOffset = slotIndex * this.stride;
    const count = Math.min(slotValues.length, this.stride);

    for (let i = 0; i < count; i++) {
      this.data[dataOffset + i] = slotValues[i];
    }

    // Publica a escrita com semântica de Release Store (Atomics.store)
    Atomics.add(this.header, PRODUCER_WRITE_COUNT, 1);
    Atomics.store(this.header, PRODUCER_HEAD_INDEX, head + 1);

    return true;
  }

  /**
   * Operação do Consumidor: Desenfileira um slot copiando os valores para outBuffer.
   * Utiliza caching local de head para minimizar invasão de barramento.
   */
  public pop(outBuffer: Float64Array | number[]): boolean {
    const tail = Atomics.load(this.header, CONSUMER_TAIL_INDEX);
    let cachedHead = this.header[CONSUMER_CACHED_HEAD];

    // Se tail alcançou o cachedHead, busca o head fresco do produtor
    if (tail >= cachedHead) {
      cachedHead = Atomics.load(this.header, PRODUCER_HEAD_INDEX);
      this.header[CONSUMER_CACHED_HEAD] = cachedHead;

      if (tail >= cachedHead) {
        return false; // Fila vazia
      }
    }

    const slotIndex = tail & this.mask;
    const dataOffset = slotIndex * this.stride;
    const count = Math.min(outBuffer.length, this.stride);

    for (let i = 0; i < count; i++) {
      outBuffer[i] = this.data[dataOffset + i];
    }

    // Avança tail com semântica atômica
    Atomics.add(this.header, CONSUMER_READ_COUNT, 1);
    Atomics.store(this.header, CONSUMER_TAIL_INDEX, tail + 1);

    return true;
  }

  /**
   * Esvazia em lote até maxItems slots da fila com reaproveitamento de scratch buffer.
   */
  public drain(
    maxItems: number = 256,
    callback: (slot: Float64Array, index: number) => void,
    scratchBuffer?: Float64Array
  ): number {
    const slot = scratchBuffer ?? new Float64Array(this.stride);
    let drained = 0;

    while (drained < maxItems && this.pop(slot)) {
      callback(slot, drained);
      drained++;
    }

    return drained;
  }

  /**
   * Retorna telemetria da fila atômica SPSC.
   */
  public getMetrics(): SPSCQueueMetrics {
    const head = Atomics.load(this.header, PRODUCER_HEAD_INDEX);
    const tail = Atomics.load(this.header, CONSUMER_TAIL_INDEX);
    const dropped = Atomics.load(this.header, PRODUCER_DROPPED_COUNT);
    const totalWrites = Atomics.load(this.header, PRODUCER_WRITE_COUNT);
    const totalReads = Atomics.load(this.header, CONSUMER_READ_COUNT);
    const available = Math.max(0, head - tail);

    return {
      capacity: this.capacity,
      stride: this.stride,
      head,
      tail,
      available,
      dropped,
      totalWrites,
      totalReads,
      isFull: available >= this.capacity,
      isEmpty: available === 0,
      cacheLinePaddingBytes: CACHE_LINE_SIZE_BYTES,
    };
  }

  /**
   * Limpa a fila e redefine ponteiros e contadores.
   */
  public clear(): void {
    Atomics.store(this.header, PRODUCER_HEAD_INDEX, 0);
    this.header[PRODUCER_CACHED_TAIL] = 0;
    Atomics.store(this.header, PRODUCER_DROPPED_COUNT, 0);
    Atomics.store(this.header, PRODUCER_WRITE_COUNT, 0);

    Atomics.store(this.header, CONSUMER_TAIL_INDEX, 0);
    this.header[CONSUMER_CACHED_HEAD] = 0;
    Atomics.store(this.header, CONSUMER_READ_COUNT, 0);
  }
}
