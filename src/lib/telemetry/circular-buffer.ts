/**
 * CircularBuffer (Ring Buffer) de Alta Performance para Telemetria em Memória
 * - Complexidade O(1) para inserção e acesso sequencial
 * - Alocação única em memória sem churn de Garbage Collection (GC)
 * - Evita memory leaks retendo apenas os últimos N eventos (ex: 2.000)
 */
export class CircularBuffer<T> {
  private buffer: (T | undefined)[];
  private pointer = 0;
  private count = 0;

  constructor(readonly capacity: number = 2000) {
    if (capacity <= 0) {
      throw new Error("Capacity must be greater than 0");
    }
    this.buffer = new Array(capacity);
  }

  /**
   * Insere um elemento no buffer em O(1).
   * Se o buffer estiver cheio, sobrescreve o item mais antigo.
   */
  push(item: T): void {
    this.buffer[this.pointer] = item;
    this.pointer = (this.pointer + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /**
   * Retorna os elementos armazenados em ordem cronológica (mais antigo primeiro).
   */
  toArray(): T[] {
    const result: T[] = new Array(this.count);
    const start = this.count < this.capacity ? 0 : this.pointer;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      result[i] = this.buffer[idx] as T;
    }
    return result;
  }

  /**
   * Retorna os elementos em ordem reversa (mais recente primeiro).
   */
  toArrayReversed(): T[] {
    const result: T[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      // O item mais recente está em (pointer - 1 - i + capacity) % capacity
      const idx = (this.pointer - 1 - i + this.capacity * 2) % this.capacity;
      result[i] = this.buffer[idx] as T;
    }
    return result;
  }

  /**
   * Quantidade de itens atualmente no buffer.
   */
  get size(): number {
    return this.count;
  }

  /**
   * Esvazia o buffer.
   */
  clear(): void {
    this.buffer = new Array(this.capacity);
    this.pointer = 0;
    this.count = 0;
  }
}
