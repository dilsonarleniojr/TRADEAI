/**
 * SharedMemoryAtomicQueue
 * Fila circular lock-free e zero-copy baseada em SharedArrayBuffer e primitivas de Atomics.
 * Permite comunicação bidirecional de altíssima frequência entre Web Workers de rede/cálculo
 * e a thread de renderização, eliminando o overhead de serialização estruturada de postMessage.
 */

export interface SharedQueueConfig {
  capacity?: number; // Capacidade em slots (ex: 1024, 2048, 4096)
  stride?: number;   // Quantidade de Float64 por slot (padrão: 8)
}

export interface SharedQueueMetrics {
  capacity: number;
  stride: number;
  head: number;
  tail: number;
  available: number;
  dropped: number;
  isFull: boolean;
  isEmpty: boolean;
}

// Índices do cabeçalho de controle (Int32Array de 16 posições = 64 bytes)
export const HEADER_INDEX_HEAD = 0;       // Próximo índice de escrita (produtor)
export const HEADER_INDEX_TAIL = 1;       // Próximo índice de leitura (consumidor)
export const HEADER_INDEX_CAPACITY = 2;   // Quantidade máxima de slots
export const HEADER_INDEX_STRIDE = 3;     // Float64s por slot
export const HEADER_INDEX_DROPPED = 4;    // Contador de pacotes descartados (overflow)
export const HEADER_INDEX_WRITE_SEQ = 5;  // Sequência atômica de escrita
export const HEADER_INDEX_READ_SEQ = 6;   // Sequência atômica de leitura
export const HEADER_SIZE_BYTES = 64;      // 16 inteiros de 32 bits

export class SharedMemoryAtomicQueue {
  private buffer: SharedArrayBuffer | ArrayBuffer;
  private header: Int32Array;
  private data: Float64Array;
  private readonly capacity: number;
  private readonly stride: number;

  constructor(buffer: SharedArrayBuffer | ArrayBuffer) {
    this.buffer = buffer;
    this.header = new Int32Array(buffer, 0, 16);
    this.capacity = this.header[HEADER_INDEX_CAPACITY];
    this.stride = this.header[HEADER_INDEX_STRIDE];
    
    // Offset de dados inicia após o cabeçalho de 64 bytes
    this.data = new Float64Array(buffer, HEADER_SIZE_BYTES, this.capacity * this.stride);
  }

  /**
   * Verifica se o ambiente possui suporte nativo a SharedArrayBuffer e Atomics.
   */
  public static isSupported(): boolean {
    return (
      typeof SharedArrayBuffer !== "undefined" &&
      typeof Atomics !== "undefined" &&
      typeof Atomics.load === "function" &&
      typeof Atomics.store === "function"
    );
  }

  /**
   * Cria uma nova fila em SharedArrayBuffer alocado com os parâmetros especificados.
   */
  public static create(config?: SharedQueueConfig): SharedMemoryAtomicQueue {
    const capacity = config?.capacity ?? 2048;
    const stride = config?.stride ?? 8;
    const totalBytes = HEADER_SIZE_BYTES + capacity * stride * Float64Array.BYTES_PER_ELEMENT;

    // Aloca SharedArrayBuffer se suportado; caso contrário, usa ArrayBuffer como fallback local
    const buffer: SharedArrayBuffer | ArrayBuffer = SharedMemoryAtomicQueue.isSupported()
      ? new SharedArrayBuffer(totalBytes)
      : new ArrayBuffer(totalBytes);

    const header = new Int32Array(buffer, 0, 16);
    header[HEADER_INDEX_HEAD] = 0;
    header[HEADER_INDEX_TAIL] = 0;
    header[HEADER_INDEX_CAPACITY] = capacity;
    header[HEADER_INDEX_STRIDE] = stride;
    header[HEADER_INDEX_DROPPED] = 0;
    header[HEADER_INDEX_WRITE_SEQ] = 0;
    header[HEADER_INDEX_READ_SEQ] = 0;

    return new SharedMemoryAtomicQueue(buffer);
  }

  /**
   * Reconstitui a instância a partir de um buffer compartilhado recebido via postMessage/Worker.
   */
  public static fromBuffer(buffer: SharedArrayBuffer | ArrayBuffer): SharedMemoryAtomicQueue {
    return new SharedMemoryAtomicQueue(buffer);
  }

  /**
   * Obtém a referência subjacente do buffer para envio a workers.
   */
  public getRawBuffer(): SharedArrayBuffer | ArrayBuffer {
    return this.buffer;
  }

  /**
   * Enfileira um registro de forma atômica e com zero alocações adicionais.
   * Retorna true se inserido, ou false se a fila estava cheia e sobrescreveu/descartou.
   */
  public enqueue(slotValues: number[] | Float64Array): boolean {
    const head = Atomics.load(this.header, HEADER_INDEX_HEAD);
    const tail = Atomics.load(this.header, HEADER_INDEX_TAIL);

    const available = head - tail;
    if (available >= this.capacity) {
      // Fila cheia: incrementa contador de overflow
      Atomics.add(this.header, HEADER_INDEX_DROPPED, 1);
      // Avança o tail para manter comportamento FIFO circular sob saturação
      Atomics.add(this.header, HEADER_INDEX_TAIL, 1);
    }

    const slotIndex = head % this.capacity;
    const dataOffset = slotIndex * this.stride;
    const count = Math.min(slotValues.length, this.stride);

    for (let i = 0; i < count; i++) {
      this.data[dataOffset + i] = slotValues[i];
    }

    // Publica escrita e avança head atomicamente
    Atomics.add(this.header, HEADER_INDEX_WRITE_SEQ, 1);
    Atomics.store(this.header, HEADER_INDEX_HEAD, head + 1);

    // Notifica consumidores que possam estar aguardando em Atomics.wait
    if (typeof Atomics.notify === "function") {
      try {
        Atomics.notify(this.header, HEADER_INDEX_HEAD, 1);
      } catch {
        // Ignora caso o contexto não suporte notify
      }
    }

    return true;
  }

  /**
   * Desenfileira um slot copiando os dados para outBuffer reutilizável (zero-copy).
   * Retorna true se um item foi lido, ou false se a fila estiver vazia.
   */
  public dequeue(outBuffer: Float64Array | number[]): boolean {
    const head = Atomics.load(this.header, HEADER_INDEX_HEAD);
    const tail = Atomics.load(this.header, HEADER_INDEX_TAIL);

    if (tail >= head) {
      return false; // Fila vazia
    }

    const slotIndex = tail % this.capacity;
    const dataOffset = slotIndex * this.stride;
    const count = Math.min(outBuffer.length, this.stride);

    for (let i = 0; i < count; i++) {
      outBuffer[i] = this.data[dataOffset + i];
    }

    // Avança ponteiro de leitura atomicamente
    Atomics.add(this.header, HEADER_INDEX_READ_SEQ, 1);
    Atomics.store(this.header, HEADER_INDEX_TAIL, tail + 1);

    return true;
  }

  /**
   * Esvazia todos os itens pendentes da fila chamando o callback por lote.
   * Evita chamadas repetidas de dequeue e maximiza vazão.
   */
  public drain(
    maxSlots: number = 256,
    callback: (slot: Float64Array, index: number) => void,
    scratchSlot?: Float64Array
  ): number {
    const slot = scratchSlot ?? new Float64Array(this.stride);
    let drainedCount = 0;

    while (drainedCount < maxSlots && this.dequeue(slot)) {
      callback(slot, drainedCount);
      drainedCount++;
    }

    return drainedCount;
  }

  /**
   * Aguarda atomicamente por novos itens disponíveis (apenas para threads de Web Worker).
   * Não deve ser invocado na thread principal da UI onde Atomics.wait lança TypeError.
   */
  public waitForData(timeoutMs: number = 50): "ok" | "not-equal" | "timed-out" | "unsupported" {
    if (typeof Atomics.wait !== "function") {
      return "unsupported";
    }

    const head = Atomics.load(this.header, HEADER_INDEX_HEAD);
    const tail = Atomics.load(this.header, HEADER_INDEX_TAIL);

    if (tail < head) {
      return "not-equal"; // Já há dados disponíveis
    }

    try {
      return Atomics.wait(this.header, HEADER_INDEX_HEAD, head, timeoutMs);
    } catch {
      // Thread principal ou ambiente restrito sem suporte a wait
      return "unsupported";
    }
  }

  /**
   * Retorna métricas de telemetria da fila atômica.
   */
  public getMetrics(): SharedQueueMetrics {
    const head = Atomics.load(this.header, HEADER_INDEX_HEAD);
    const tail = Atomics.load(this.header, HEADER_INDEX_TAIL);
    const dropped = Atomics.load(this.header, HEADER_INDEX_DROPPED);
    const available = Math.max(0, head - tail);

    return {
      capacity: this.capacity,
      stride: this.stride,
      head,
      tail,
      available,
      dropped,
      isFull: available >= this.capacity,
      isEmpty: available === 0,
    };
  }

  /**
   * Redefine os ponteiros da fila atômica.
   */
  public clear(): void {
    Atomics.store(this.header, HEADER_INDEX_HEAD, 0);
    Atomics.store(this.header, HEADER_INDEX_TAIL, 0);
    Atomics.store(this.header, HEADER_INDEX_DROPPED, 0);
    Atomics.store(this.header, HEADER_INDEX_WRITE_SEQ, 0);
    Atomics.store(this.header, HEADER_INDEX_READ_SEQ, 0);
  }
}
