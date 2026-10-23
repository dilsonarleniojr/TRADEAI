/**
 * SharedL2DepthMatrix & DoubleBufferedL2DepthMatrix
 * Matriz colunar (Structure of Arrays - SoA) de profundidade L2 em SharedArrayBuffer
 * com suporte nativo a Double-Buffering (Front & Back Buffer) e sincronização atômica (Store-Release).
 * 
 * Permite que o Web Worker de Rede (Ingestão) acumule deltas e grave snapshots de livro de ofertas
 * de alta densidade (depth@100ms / depth1000) no Back Buffer em memória compartilhada,
 * enquanto o Web Worker de Renderização Gráfica consome o Front Buffer para alimentar
 * diretamente comandos gl.texSubImage2D (WebGL) ou device.queue.writeTexture (WebGPU) em VRAM,
 * com zero contenção e sem passar pela Main Thread.
 */

export const L2_HEADER_BYTES = 64; // Alinhado para 64 bytes (1 cache line L1/L2)
export const L2_MASTER_HEADER_BYTES = 64; // Alinhado para 64 bytes
export const DEFAULT_MAX_DEPTH_LEVELS = 1000;

// Offsets Int32 no Master Header (0 a 15)
export const L2_MASTER_ACTIVE_INDEX = 0;       // 0 | 1 (Front Buffer atual)
export const L2_MASTER_SWAP_SEQ = 1;          // Contador atômico de swaps
export const L2_MASTER_IS_DOUBLE_BUFFERED = 2;// 1 = Double-Buffered, 0 = Single
export const L2_MASTER_MAX_LEVELS = 3;        // Capacidade máxima configurada
export const L2_MASTER_SLOT_BYTES = 4;        // Tamanho em bytes de cada slot
export const L2_MASTER_DELTA_COUNT = 5;       // Quantidade de deltas acumulados no back buffer
export const L2_MASTER_RESERVED_A = 6;
export const L2_MASTER_RESERVED_B = 7;

// Offsets Int32 no Header de cada Slot (0 a 15)
export const L2_OFFSET_WRITE_SEQ = 0;       // Atomics sequence counter
export const L2_OFFSET_BIDS_COUNT = 1;      // Quantidade real de bids preenchidos
export const L2_OFFSET_ASKS_COUNT = 2;      // Quantidade real de asks preenchidos
export const L2_OFFSET_MAX_LEVELS = 3;      // Capacidade máxima configurada
export const L2_OFFSET_TIMESTAMP_LO = 4;   // Timestamp (baixo 32-bit)
export const L2_OFFSET_TIMESTAMP_HI = 5;   // Timestamp (alto 32-bit)
export const L2_OFFSET_RESERVED_A = 6;
export const L2_OFFSET_RESERVED_B = 7;

// Offsets Float64 no Header de cada Slot (indices 4 a 7 em Float64)
export const L2_F64_BEST_BID = 4;
export const L2_F64_BEST_ASK = 5;
export const L2_F64_TOTAL_BID_VOL = 6;
export const L2_F64_TOTAL_ASK_VOL = 7;

export interface L2DepthSnapshotSummary {
  sequence: number;
  writeSequence: number;
  timestamp: number;
  bidsCount: number;
  asksCount: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  totalBidVol: number;
  totalBidVolume: number;
  totalAskVol: number;
  totalAskVolume: number;
}

export interface DeltaOptions {
  autoSync?: boolean; // Sincroniza Back Buffer com Front Buffer antes de aplicar delta (default: false)
  autoSwap?: boolean; // Alterna atomicamente os buffers após aplicar o delta (default: false)
}

export interface DynamicQuantizationOptions {
  atr?: number;
  centerPrice?: number;
  compressionFactor?: number;
}

/**
 * Busca binária para livro de compra (Bids) ordenado de forma DECRESCENTE (maior preço primeiro).
 */
export function binarySearchBid(prices: Float64Array, count: number, target: number): { found: boolean; index: number } {
  let low = 0;
  let high = count - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const midVal = prices[mid];
    if (midVal === target) {
      return { found: true, index: mid };
    }
    if (midVal < target) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return { found: false, index: low };
}

/**
 * Busca binária para livro de venda (Asks) ordenado de forma CRESCENTE (menor preço primeiro).
 */
export function binarySearchAsk(prices: Float64Array, count: number, target: number): { found: boolean; index: number } {
  let low = 0;
  let high = count - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const midVal = prices[mid];
    if (midVal === target) {
      return { found: true, index: mid };
    }
    if (midVal < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return { found: false, index: low };
}

export class SharedL2DepthMatrix {
  protected readonly buffer: SharedArrayBuffer;
  protected readonly maxLevels: number;
  protected readonly isDoubleBufferedFlag: boolean;
  protected readonly slotBytes: number;

  // Master Header (presente quando isDoubleBufferedFlag = true)
  protected readonly masterHeaderInt32: Int32Array | null;

  // Visualizações de cabeçalho por slot (0 e 1 quando double-buffered, apenas 0 quando single)
  protected readonly slotHeadersInt32: Int32Array[];
  protected readonly slotHeadersFloat64: Float64Array[];

  // Visualizações colunares (SoA) em Float64 por slot
  protected readonly slotsBidPrices: Float64Array[];
  protected readonly slotsBidVolumes: Float64Array[];
  protected readonly slotsAskPrices: Float64Array[];
  protected readonly slotsAskVolumes: Float64Array[];

  // Visualizações legadas/compatibilidade com código existente
  protected readonly headerInt32: Int32Array;
  protected readonly headerFloat64: Float64Array;
  protected readonly bidPrices: Float64Array;
  protected readonly bidVolumes: Float64Array;
  protected readonly askPrices: Float64Array;
  protected readonly askVolumes: Float64Array;

  protected constructor(
    buffer: SharedArrayBuffer,
    maxLevels: number = DEFAULT_MAX_DEPTH_LEVELS,
    isDoubleBuffered: boolean = false
  ) {
    this.buffer = buffer;
    this.maxLevels = maxLevels;
    this.isDoubleBufferedFlag = isDoubleBuffered;

    const bytesPerColumn = maxLevels * Float64Array.BYTES_PER_ELEMENT;
    this.slotBytes = L2_HEADER_BYTES + (bytesPerColumn * 4);

    if (isDoubleBuffered) {
      this.masterHeaderInt32 = new Int32Array(buffer, 0, 16);
      this.masterHeaderInt32[L2_MASTER_IS_DOUBLE_BUFFERED] = 1;
      this.masterHeaderInt32[L2_MASTER_MAX_LEVELS] = maxLevels;
      this.masterHeaderInt32[L2_MASTER_SLOT_BYTES] = this.slotBytes;

      const numSlots = 2;
      this.slotHeadersInt32 = [];
      this.slotHeadersFloat64 = [];
      this.slotsBidPrices = [];
      this.slotsBidVolumes = [];
      this.slotsAskPrices = [];
      this.slotsAskVolumes = [];

      for (let s = 0; s < numSlots; s++) {
        const slotOffset = L2_MASTER_HEADER_BYTES + (s * this.slotBytes);
        this.slotHeadersInt32.push(new Int32Array(buffer, slotOffset, 16));
        this.slotHeadersFloat64.push(new Float64Array(buffer, slotOffset, 8));

        let colOffset = slotOffset + L2_HEADER_BYTES;
        this.slotsBidPrices.push(new Float64Array(buffer, colOffset, maxLevels));
        colOffset += bytesPerColumn;

        this.slotsBidVolumes.push(new Float64Array(buffer, colOffset, maxLevels));
        colOffset += bytesPerColumn;

        this.slotsAskPrices.push(new Float64Array(buffer, colOffset, maxLevels));
        colOffset += bytesPerColumn;

        this.slotsAskVolumes.push(new Float64Array(buffer, colOffset, maxLevels));

        this.slotHeadersInt32[s][L2_OFFSET_MAX_LEVELS] = maxLevels;
      }
    } else {
      this.masterHeaderInt32 = null;
      this.slotHeadersInt32 = [new Int32Array(buffer, 0, 16)];
      this.slotHeadersFloat64 = [new Float64Array(buffer, 0, 8)];

      let colOffset = L2_HEADER_BYTES;
      this.slotsBidPrices = [new Float64Array(buffer, colOffset, maxLevels)];
      colOffset += bytesPerColumn;

      this.slotsBidVolumes = [new Float64Array(buffer, colOffset, maxLevels)];
      colOffset += bytesPerColumn;

      this.slotsAskPrices = [new Float64Array(buffer, colOffset, maxLevels)];
      colOffset += bytesPerColumn;

      this.slotsAskVolumes = [new Float64Array(buffer, colOffset, maxLevels)];

      this.slotHeadersInt32[0][L2_OFFSET_MAX_LEVELS] = maxLevels;
    }

    // Apontadores legados vinculados ao slot 0
    this.headerInt32 = this.slotHeadersInt32[0];
    this.headerFloat64 = this.slotHeadersFloat64[0];
    this.bidPrices = this.slotsBidPrices[0];
    this.bidVolumes = this.slotsBidVolumes[0];
    this.askPrices = this.slotsAskPrices[0];
    this.askVolumes = this.slotsAskVolumes[0];
  }

  /**
   * Calcula o tamanho total em bytes necessário para uma matriz com capacidade N.
   */
  public static calculateRequiredBytes(maxLevels: number = DEFAULT_MAX_DEPTH_LEVELS, doubleBuffered: boolean = false): number {
    const slotBytes = L2_HEADER_BYTES + (maxLevels * 4 * Float64Array.BYTES_PER_ELEMENT);
    if (doubleBuffered) {
      return L2_MASTER_HEADER_BYTES + (slotBytes * 2);
    }
    return slotBytes;
  }

  /**
   * Instancia uma nova matriz de profundidade em SharedArrayBuffer pré-alocado.
   */
  public static create(
    maxLevels: number = DEFAULT_MAX_DEPTH_LEVELS,
    options?: { doubleBuffered?: boolean }
  ): SharedL2DepthMatrix {
    const isDoubleBuffered = options?.doubleBuffered ?? false;
    const totalBytes = SharedL2DepthMatrix.calculateRequiredBytes(maxLevels, isDoubleBuffered);
    const sab = new SharedArrayBuffer(totalBytes);
    return new SharedL2DepthMatrix(sab, maxLevels, isDoubleBuffered);
  }

  /**
   * Instancia uma nova matriz de profundidade com Double-Buffering nativo (~64 KB para 1.000 níveis).
   */
  public static createDoubleBuffered(maxLevels: number = DEFAULT_MAX_DEPTH_LEVELS): SharedL2DepthMatrix {
    return SharedL2DepthMatrix.create(maxLevels, { doubleBuffered: true });
  }

  /**
   * Conecta-se a um SharedArrayBuffer já existente transferido por IPC.
   * Detecta automaticamente se o buffer recebido foi configurado com Double-Buffering.
   */
  public static fromBuffer(buffer: SharedArrayBuffer, maxLevels: number = DEFAULT_MAX_DEPTH_LEVELS): SharedL2DepthMatrix {
    const doubleBufferedBytes = SharedL2DepthMatrix.calculateRequiredBytes(maxLevels, true);
    let isDoubleBuffered = buffer.byteLength >= doubleBufferedBytes;
    if (isDoubleBuffered) {
      const masterCheck = new Int32Array(buffer, 0, 16);
      isDoubleBuffered = masterCheck[L2_MASTER_IS_DOUBLE_BUFFERED] === 1;
    }
    return new SharedL2DepthMatrix(buffer, maxLevels, isDoubleBuffered);
  }

  public getRawBuffer(): SharedArrayBuffer {
    return this.buffer;
  }

  public getMaxLevels(): number {
    return this.maxLevels;
  }

  public isDoubleBuffered(): boolean {
    return this.isDoubleBufferedFlag;
  }

  /**
   * Retorna o índice do Front Buffer ativo (0 ou 1) consumido pelo Render Worker.
   */
  public getActiveBufferIndex(): number {
    if (!this.isDoubleBufferedFlag || !this.masterHeaderInt32) return 0;
    return Atomics.load(this.masterHeaderInt32, L2_MASTER_ACTIVE_INDEX);
  }

  /**
   * Retorna o índice do Back Buffer (0 ou 1) onde o Ingestion Worker acumula deltas.
   */
  public getBackBufferIndex(): number {
    if (!this.isDoubleBufferedFlag || !this.masterHeaderInt32) return 0;
    const active = Atomics.load(this.masterHeaderInt32, L2_MASTER_ACTIVE_INDEX);
    return active === 0 ? 1 : 0;
  }

  /**
   * Retorna a quantidade de swaps atômicos realizados.
   */
  public getSwapSequence(): number {
    if (!this.isDoubleBufferedFlag || !this.masterHeaderInt32) return 0;
    return Atomics.load(this.masterHeaderInt32, L2_MASTER_SWAP_SEQ);
  }

  public getSequence(): number {
    const slot = this.getActiveBufferIndex();
    return Atomics.load(this.slotHeadersInt32[slot], L2_OFFSET_WRITE_SEQ);
  }

  /**
   * Alterna atomicamente o Front Buffer com o Back Buffer com Store-Release memory barrier.
   */
  public swap(): number {
    if (!this.isDoubleBufferedFlag || !this.masterHeaderInt32) return 0;

    const backIdx = this.getBackBufferIndex();
    Atomics.add(this.slotHeadersInt32[backIdx], L2_OFFSET_WRITE_SEQ, 1);

    const current = Atomics.load(this.masterHeaderInt32, L2_MASTER_ACTIVE_INDEX);
    const next = current === 0 ? 1 : 0;

    Atomics.store(this.masterHeaderInt32, L2_MASTER_ACTIVE_INDEX, next);
    const newSwapSeq = Atomics.add(this.masterHeaderInt32, L2_MASTER_SWAP_SEQ, 1) + 1;

    if (typeof Atomics.notify === "function") {
      try {
        Atomics.notify(this.masterHeaderInt32, L2_MASTER_ACTIVE_INDEX, 1);
      } catch {}
    }

    return newSwapSeq;
  }

  /**
   * Copia o estado do Front Buffer para o Back Buffer com zero alocações (memcpy ultra-rápido).
   */
  public copyFrontToBack(): void {
    if (!this.isDoubleBufferedFlag) return;
    const front = this.getActiveBufferIndex();
    const back = 1 - front;

    this.slotHeadersInt32[back].set(this.slotHeadersInt32[front]);
    this.slotHeadersFloat64[back].set(this.slotHeadersFloat64[front]);

    this.slotsBidPrices[back].set(this.slotsBidPrices[front]);
    this.slotsBidVolumes[back].set(this.slotsBidVolumes[front]);
    this.slotsAskPrices[back].set(this.slotsAskPrices[front]);
    this.slotsAskVolumes[back].set(this.slotsAskVolumes[front]);
  }

  /**
   * Acumula deltas de livro L2 (inserções, atualizações e remoções quando quantity == 0)
   * no Back Buffer de forma incremental com complexidade O(K log N) e zero alocações.
   */
  public applyDelta(
    bidsDelta: ArrayLike<[number, number]> | Array<any>,
    asksDelta: ArrayLike<[number, number]> | Array<any>,
    timestamp: number = Date.now(),
    options?: DeltaOptions
  ): number {
    if (options?.autoSync) {
      this.copyFrontToBack();
    }

    const back = this.getBackBufferIndex();
    const backHeaderInt32 = this.slotHeadersInt32[back];
    const backHeaderFloat64 = this.slotHeadersFloat64[back];
    const backBidPrices = this.slotsBidPrices[back];
    const backBidVolumes = this.slotsBidVolumes[back];
    const backAskPrices = this.slotsAskPrices[back];
    const backAskVolumes = this.slotsAskVolumes[back];

    let bidsCount = backHeaderInt32[L2_OFFSET_BIDS_COUNT];
    let asksCount = backHeaderInt32[L2_OFFSET_ASKS_COUNT];

    // 1. Processa deltas de Bids
    const bidsLen = bidsDelta.length;
    for (let i = 0; i < bidsLen; i++) {
      const item = bidsDelta[i] as any;
      let p = 0;
      let q = 0;
      if (Array.isArray(item)) {
        p = item[0] || 0;
        q = item[1] || 0;
      } else if (item && typeof item === "object") {
        p = item.price || 0;
        q = item.quantity || 0;
      }
      if (p <= 0) continue;

      const search = binarySearchBid(backBidPrices, bidsCount, p);
      if (search.found) {
        if (q === 0) {
          // Remover nível
          if (search.index < bidsCount - 1) {
            backBidPrices.copyWithin(search.index, search.index + 1, bidsCount);
            backBidVolumes.copyWithin(search.index, search.index + 1, bidsCount);
          }
          backBidPrices[bidsCount - 1] = 0;
          backBidVolumes[bidsCount - 1] = 0;
          bidsCount--;
        } else {
          // Atualizar volume
          backBidVolumes[search.index] = q;
        }
      } else if (q > 0) {
        // Inserir nível
        const insertIdx = search.index;
        if (insertIdx < this.maxLevels) {
          const shiftEnd = Math.min(bidsCount, this.maxLevels - 1);
          if (shiftEnd > insertIdx) {
            backBidPrices.copyWithin(insertIdx + 1, insertIdx, shiftEnd);
            backBidVolumes.copyWithin(insertIdx + 1, insertIdx, shiftEnd);
          }
          backBidPrices[insertIdx] = p;
          backBidVolumes[insertIdx] = q;
          if (bidsCount < this.maxLevels) bidsCount++;
        }
      }
    }

    // 2. Processa deltas de Asks
    const asksLen = asksDelta.length;
    for (let i = 0; i < asksLen; i++) {
      const item = asksDelta[i] as any;
      let p = 0;
      let q = 0;
      if (Array.isArray(item)) {
        p = item[0] || 0;
        q = item[1] || 0;
      } else if (item && typeof item === "object") {
        p = item.price || 0;
        q = item.quantity || 0;
      }
      if (p <= 0) continue;

      const search = binarySearchAsk(backAskPrices, asksCount, p);
      if (search.found) {
        if (q === 0) {
          // Remover nível
          if (search.index < asksCount - 1) {
            backAskPrices.copyWithin(search.index, search.index + 1, asksCount);
            backAskVolumes.copyWithin(search.index, search.index + 1, asksCount);
          }
          backAskPrices[asksCount - 1] = 0;
          backAskVolumes[asksCount - 1] = 0;
          asksCount--;
        } else {
          // Atualizar volume
          backAskVolumes[search.index] = q;
        }
      } else if (q > 0) {
        // Inserir nível
        const insertIdx = search.index;
        if (insertIdx < this.maxLevels) {
          const shiftEnd = Math.min(asksCount, this.maxLevels - 1);
          if (shiftEnd > insertIdx) {
            backAskPrices.copyWithin(insertIdx + 1, insertIdx, shiftEnd);
            backAskVolumes.copyWithin(insertIdx + 1, insertIdx, shiftEnd);
          }
          backAskPrices[insertIdx] = p;
          backAskVolumes[insertIdx] = q;
          if (asksCount < this.maxLevels) asksCount++;
        }
      }
    }

    // 3. Recalcula métricas agregadas do livro no Back Buffer
    let totalBidVol = 0;
    for (let i = 0; i < bidsCount; i++) totalBidVol += backBidVolumes[i];
    let totalAskVol = 0;
    for (let i = 0; i < asksCount; i++) totalAskVol += backAskVolumes[i];

    const bestBid = bidsCount > 0 ? backBidPrices[0] : 0;
    const bestAsk = asksCount > 0 ? backAskPrices[0] : 0;

    backHeaderFloat64[L2_F64_BEST_BID] = bestBid;
    backHeaderFloat64[L2_F64_BEST_ASK] = bestAsk;
    backHeaderFloat64[L2_F64_TOTAL_BID_VOL] = totalBidVol;
    backHeaderFloat64[L2_F64_TOTAL_ASK_VOL] = totalAskVol;

    backHeaderInt32[L2_OFFSET_BIDS_COUNT] = bidsCount;
    backHeaderInt32[L2_OFFSET_ASKS_COUNT] = asksCount;

    const tsLo = timestamp & 0xffffffff;
    const tsHi = Math.floor(timestamp / 0x100000000);
    backHeaderInt32[L2_OFFSET_TIMESTAMP_LO] = tsLo;
    backHeaderInt32[L2_OFFSET_TIMESTAMP_HI] = tsHi;

    if (this.masterHeaderInt32) {
      Atomics.add(this.masterHeaderInt32, L2_MASTER_DELTA_COUNT, 1);
    }

    if (options?.autoSwap) {
      return this.swap();
    }

    return Atomics.add(backHeaderInt32, L2_OFFSET_WRITE_SEQ, 1) + 1;
  }

  /**
   * Acumula delta e executa swap atômico em chamada combinada.
   */
  public applyDeltaAndSwap(
    bidsDelta: ArrayLike<[number, number]> | Array<any>,
    asksDelta: ArrayLike<[number, number]> | Array<any>,
    timestamp: number = Date.now(),
    autoSync: boolean = true
  ): number {
    return this.applyDelta(bidsDelta, asksDelta, timestamp, { autoSync, autoSwap: true });
  }

  /**
   * Grava um novo snapshot de profundidade L2 na matriz colunar em O(N) com zero alocações.
   * Em modo double-buffered, grava no Back Buffer e executa swap atômico para o Front Buffer.
   */
  public writeDepthSnapshot(
    bids: ArrayLike<[number, number]> | ArrayLike<number> | Array<any>,
    asks: ArrayLike<[number, number]> | ArrayLike<number> | Array<any>,
    timestamp: number = Date.now(),
    targetBufferIndex?: number
  ): number {
    const isDouble = this.isDoubleBufferedFlag;
    const targetSlot = targetBufferIndex !== undefined
      ? targetBufferIndex
      : (isDouble ? this.getBackBufferIndex() : 0);

    const targetHeaderInt32 = this.slotHeadersInt32[targetSlot];
    const targetHeaderFloat64 = this.slotHeadersFloat64[targetSlot];
    const targetBidPrices = this.slotsBidPrices[targetSlot];
    const targetBidVolumes = this.slotsBidVolumes[targetSlot];
    const targetAskPrices = this.slotsAskPrices[targetSlot];
    const targetAskVolumes = this.slotsAskVolumes[targetSlot];

    const bidsLen = Math.min(this.maxLevels, bids.length);
    const asksLen = Math.min(this.maxLevels, asks.length);

    let totalBidVol = 0;
    let totalAskVol = 0;
    let bestBid = 0;
    let bestAsk = 0;

    // 1. Grava Bids (Preço decrescente)
    for (let i = 0; i < bidsLen; i++) {
      const item = bids[i] as any;
      let p = 0;
      let q = 0;

      if (Array.isArray(item)) {
        p = item[0] || 0;
        q = item[1] || 0;
      } else if (typeof item === "object" && item !== null) {
        p = item.price || 0;
        q = item.quantity || 0;
      }

      targetBidPrices[i] = p;
      targetBidVolumes[i] = q;
      totalBidVol += q;
      if (i === 0) bestBid = p;
    }

    // 2. Grava Asks (Preço crescente)
    for (let i = 0; i < asksLen; i++) {
      const item = asks[i] as any;
      let p = 0;
      let q = 0;

      if (Array.isArray(item)) {
        p = item[0] || 0;
        q = item[1] || 0;
      } else if (typeof item === "object" && item !== null) {
        p = item.price || 0;
        q = item.quantity || 0;
      }

      targetAskPrices[i] = p;
      targetAskVolumes[i] = q;
      totalAskVol += q;
      if (i === 0) bestAsk = p;
    }

    // 3. Atualiza métricas float64 no cabeçalho do slot
    targetHeaderFloat64[L2_F64_BEST_BID] = bestBid;
    targetHeaderFloat64[L2_F64_BEST_ASK] = bestAsk;
    targetHeaderFloat64[L2_F64_TOTAL_BID_VOL] = totalBidVol;
    targetHeaderFloat64[L2_F64_TOTAL_ASK_VOL] = totalAskVol;

    // 4. Atualiza contadores int32
    targetHeaderInt32[L2_OFFSET_BIDS_COUNT] = bidsLen;
    targetHeaderInt32[L2_OFFSET_ASKS_COUNT] = asksLen;

    const tsLo = timestamp & 0xffffffff;
    const tsHi = Math.floor(timestamp / 0x100000000);
    targetHeaderInt32[L2_OFFSET_TIMESTAMP_LO] = tsLo;
    targetHeaderInt32[L2_OFFSET_TIMESTAMP_HI] = tsHi;

    // 5. Se for double-buffered e targetBufferIndex não foi fixado, executa swap atômico
    if (isDouble && targetBufferIndex === undefined) {
      return this.swap();
    }

    // 6. Modo single-buffer ou target explícito: incremento atômico simples
    const nextSeq = Atomics.add(targetHeaderInt32, L2_OFFSET_WRITE_SEQ, 1) + 1;
    if (typeof Atomics.notify === "function") {
      try {
        Atomics.notify(targetHeaderInt32, L2_OFFSET_WRITE_SEQ, 1);
      } catch {}
    }

    return nextSeq;
  }

  /**
   * Lê o resumo do snapshot com sincronização atômica (Optimistic Read).
   * Por padrão, lê o Front Buffer ativo consumido pelo renderizador.
   */
  public readSnapshotSummary(bufferIndex?: number): L2DepthSnapshotSummary {
    const slot = bufferIndex !== undefined ? bufferIndex : this.getActiveBufferIndex();
    const targetHeaderInt32 = this.slotHeadersInt32[slot];
    const targetHeaderFloat64 = this.slotHeadersFloat64[slot];

    const seq = Atomics.load(targetHeaderInt32, L2_OFFSET_WRITE_SEQ);
    const bidsCount = targetHeaderInt32[L2_OFFSET_BIDS_COUNT];
    const asksCount = targetHeaderInt32[L2_OFFSET_ASKS_COUNT];
    const tsLo = targetHeaderInt32[L2_OFFSET_TIMESTAMP_LO];
    const tsHi = targetHeaderInt32[L2_OFFSET_TIMESTAMP_HI];
    const timestamp = (tsHi * 0x100000000) + (tsLo >>> 0);

    const bestBid = targetHeaderFloat64[L2_F64_BEST_BID];
    const bestAsk = targetHeaderFloat64[L2_F64_BEST_ASK];
    const spread = bestAsk > 0 && bestBid > 0 ? Math.max(0, bestAsk - bestBid) : 0;
    const totalBidVol = targetHeaderFloat64[L2_F64_TOTAL_BID_VOL];
    const totalAskVol = targetHeaderFloat64[L2_F64_TOTAL_ASK_VOL];

    return {
      sequence: seq,
      writeSequence: seq,
      timestamp,
      bidsCount,
      asksCount,
      bestBid,
      bestAsk,
      spread,
      totalBidVol,
      totalBidVolume: totalBidVol,
      totalAskVol,
      totalAskVolume: totalAskVol,
    };
  }

  /**
   * Empacota diretamente a coluna de livro L2 em uma fatia RGBA pronta para gl.texSubImage2D.
   * Por padrão, lê do Front Buffer ativo garantindo zero contenção com gravações no Back Buffer.
   * R = Bid Liquidity [0, 255]
   * G = Ask Liquidity [0, 255]
   * B = Iceberg Detection [0 ou 255]
   * A = Alpha [255]
   */
  public packToSliceRGBA(
    outSlice: Uint8Array,
    priceBins: number,
    minPrice: number,
    maxPrice: number,
    maxVolumeOrIceberg?: number,
    icebergVolumeThresholdArg?: number | DynamicQuantizationOptions,
    bufferIndex?: number,
    dynamicOptions?: DynamicQuantizationOptions
  ): number {
    if (outSlice.length < priceBins * 4) return 0;
    outSlice.fill(0);

    const slot = bufferIndex !== undefined ? bufferIndex : this.getActiveBufferIndex();
    const targetHeaderInt32 = this.slotHeadersInt32[slot];
    const targetBidPrices = this.slotsBidPrices[slot];
    const targetBidVolumes = this.slotsBidVolumes[slot];
    const targetAskPrices = this.slotsAskPrices[slot];
    const targetAskVolumes = this.slotsAskVolumes[slot];

    const bidsCount = targetHeaderInt32[L2_OFFSET_BIDS_COUNT];
    const asksCount = targetHeaderInt32[L2_OFFSET_ASKS_COUNT];
    const priceRange = maxPrice - minPrice;
    if (priceRange <= 0) return 0;

    let effDynamicOptions = dynamicOptions;
    let actualIcebergThresholdArg: number | undefined;
    if (typeof icebergVolumeThresholdArg === "object" && icebergVolumeThresholdArg !== null) {
      effDynamicOptions = icebergVolumeThresholdArg as DynamicQuantizationOptions;
      actualIcebergThresholdArg = undefined;
    } else {
      actualIcebergThresholdArg = icebergVolumeThresholdArg as number | undefined;
    }

    const isDynamic = !!(effDynamicOptions?.atr && effDynamicOptions.atr > 0.00001);
    const effAtr = effDynamicOptions?.atr || 0;
    const effCenter = effDynamicOptions?.centerPrice || (minPrice + maxPrice) * 0.5;
    const effKappa = effDynamicOptions?.compressionFactor || 2.0;

    let gMin = 0;
    let gMax = 1;
    let gDelta = 1;
    if (isDynamic) {
      const xMin = (minPrice - effCenter) / effAtr;
      const xMax = (maxPrice - effCenter) / effAtr;
      gMin = Math.sign(xMin) * Math.log(1.0 + effKappa * Math.abs(xMin));
      gMax = Math.sign(xMax) * Math.log(1.0 + effKappa * Math.abs(xMax));
      gDelta = Math.max(gMax - gMin, 0.00001);
    }

    let icebergThreshold = 50.0;
    let manualMaxVol: number | null = null;

    if (actualIcebergThresholdArg !== undefined) {
      icebergThreshold = actualIcebergThresholdArg;
      if (maxVolumeOrIceberg && maxVolumeOrIceberg > 0) {
        manualMaxVol = maxVolumeOrIceberg;
      }
    } else if (maxVolumeOrIceberg !== undefined) {
      icebergThreshold = maxVolumeOrIceberg;
    }

    // Encontra volume máximo para normalização em passada única
    let maxVol = manualMaxVol || 1.0;
    if (!manualMaxVol) {
      for (let i = 0; i < bidsCount; i++) {
        if (targetBidVolumes[i] > maxVol) maxVol = targetBidVolumes[i];
      }
      for (let i = 0; i < asksCount; i++) {
        if (targetAskVolumes[i] > maxVol) maxVol = targetAskVolumes[i];
      }
    }

    // 1. Processa Bids (Canal R)
    for (let i = 0; i < bidsCount; i++) {
      const p = targetBidPrices[i];
      const q = targetBidVolumes[i];
      if (p < minPrice || p > maxPrice) continue;

      let bin: number;
      if (isDynamic) {
        const x = (p - effCenter) / effAtr;
        const gX = Math.sign(x) * Math.log(1.0 + effKappa * Math.abs(x));
        const norm = (gX - gMin) / gDelta;
        bin = Math.floor(Math.max(0, Math.min(1.0, norm)) * (priceBins - 1));
      } else {
        const norm = (p - minPrice) / priceRange;
        bin = Math.floor(norm * (priceBins - 1));
      }
      bin = Math.max(0, Math.min(priceBins - 1, bin));

      const intensity = Math.min(255, Math.floor((q / maxVol) * 255));
      const offset = bin * 4;

      outSlice[offset + 0] = Math.max(outSlice[offset + 0], intensity);
      if (q >= icebergThreshold) {
        outSlice[offset + 2] = 255; // Flag de Iceberg (Canal Azul)
      }
      outSlice[offset + 3] = 255;
    }

    // 2. Processa Asks (Canal G)
    for (let i = 0; i < asksCount; i++) {
      const p = targetAskPrices[i];
      const q = targetAskVolumes[i];
      if (p < minPrice || p > maxPrice) continue;

      let bin: number;
      if (isDynamic) {
        const x = (p - effCenter) / effAtr;
        const gX = Math.sign(x) * Math.log(1.0 + effKappa * Math.abs(x));
        const norm = (gX - gMin) / gDelta;
        bin = Math.floor(Math.max(0, Math.min(1.0, norm)) * (priceBins - 1));
      } else {
        const norm = (p - minPrice) / priceRange;
        bin = Math.floor(norm * (priceBins - 1));
      }
      bin = Math.max(0, Math.min(priceBins - 1, bin));

      const intensity = Math.min(255, Math.floor((q / maxVol) * 255));
      const offset = bin * 4;

      outSlice[offset + 1] = Math.max(outSlice[offset + 1], intensity);
      if (q >= icebergThreshold) {
        outSlice[offset + 2] = 255;
      }
      outSlice[offset + 3] = 255;
    }

    return priceBins;
  }

  /**
   * Converte a profundidade L2 em um buffer de Float32 contíguo para WebGPU device.queue.writeTexture
   * ou shaders WGSL de compute pass, formatado em vetores de 4 floats por nível:
   * [bidPrice, bidVolume, askPrice, askVolume]
   */
  public packToFloat32VRAMBuffer(outBuffer: Float32Array, maxLevelsPerSide?: number, bufferIndex?: number): number {
    const slot = bufferIndex !== undefined ? bufferIndex : this.getActiveBufferIndex();
    const targetHeaderInt32 = this.slotHeadersInt32[slot];
    const targetBidPrices = this.slotsBidPrices[slot];
    const targetBidVolumes = this.slotsBidVolumes[slot];
    const targetAskPrices = this.slotsAskPrices[slot];
    const targetAskVolumes = this.slotsAskVolumes[slot];

    const bidsCount = targetHeaderInt32[L2_OFFSET_BIDS_COUNT];
    const asksCount = targetHeaderInt32[L2_OFFSET_ASKS_COUNT];
    const availableSlots = Math.floor(outBuffer.length / 4);
    const requestedLevels = maxLevelsPerSide ? Math.min(maxLevelsPerSide, availableSlots) : availableSlots;
    const count = Math.min(requestedLevels, Math.max(bidsCount, asksCount));

    for (let i = 0; i < count; i++) {
      const offset = i * 4;
      outBuffer[offset + 0] = i < bidsCount ? targetBidPrices[i] : 0.0;
      outBuffer[offset + 1] = i < bidsCount ? targetBidVolumes[i] : 0.0;
      outBuffer[offset + 2] = i < asksCount ? targetAskPrices[i] : 0.0;
      outBuffer[offset + 3] = i < asksCount ? targetAskVolumes[i] : 0.0;
    }

    return count;
  }

  // Acessores de arrays tipados do Front Buffer ativo
  public getBidPrices(bufferIndex?: number): Float64Array {
    const slot = bufferIndex !== undefined ? bufferIndex : this.getActiveBufferIndex();
    return this.slotsBidPrices[slot];
  }

  public getBidVolumes(bufferIndex?: number): Float64Array {
    const slot = bufferIndex !== undefined ? bufferIndex : this.getActiveBufferIndex();
    return this.slotsBidVolumes[slot];
  }

  public getAskPrices(bufferIndex?: number): Float64Array {
    const slot = bufferIndex !== undefined ? bufferIndex : this.getActiveBufferIndex();
    return this.slotsAskPrices[slot];
  }

  public getAskVolumes(bufferIndex?: number): Float64Array {
    const slot = bufferIndex !== undefined ? bufferIndex : this.getActiveBufferIndex();
    return this.slotsAskVolumes[slot];
  }

  // Acessores explícitos Front Buffer
  public getFrontBidPrices(): Float64Array {
    return this.slotsBidPrices[this.getActiveBufferIndex()];
  }

  public getFrontBidVolumes(): Float64Array {
    return this.slotsBidVolumes[this.getActiveBufferIndex()];
  }

  public getFrontAskPrices(): Float64Array {
    return this.slotsAskPrices[this.getActiveBufferIndex()];
  }

  public getFrontAskVolumes(): Float64Array {
    return this.slotsAskVolumes[this.getActiveBufferIndex()];
  }

  // Acessores explícitos Back Buffer
  public getBackBidPrices(): Float64Array {
    return this.slotsBidPrices[this.getBackBufferIndex()];
  }

  public getBackBidVolumes(): Float64Array {
    return this.slotsBidVolumes[this.getBackBufferIndex()];
  }

  public getBackAskPrices(): Float64Array {
    return this.slotsAskPrices[this.getBackBufferIndex()];
  }

  public getBackAskVolumes(): Float64Array {
    return this.slotsAskVolumes[this.getBackBufferIndex()];
  }
}

/**
 * DoubleBufferedL2DepthMatrix
 * Subclasse tipada para conveniência institucional quando Double-Buffering é explicitamente requerido.
 */
export class DoubleBufferedL2DepthMatrix extends SharedL2DepthMatrix {
  public static create(maxLevels: number = DEFAULT_MAX_DEPTH_LEVELS): DoubleBufferedL2DepthMatrix {
    return SharedL2DepthMatrix.createDoubleBuffered(maxLevels) as DoubleBufferedL2DepthMatrix;
  }

  public static fromBuffer(buffer: SharedArrayBuffer, maxLevels: number = DEFAULT_MAX_DEPTH_LEVELS): DoubleBufferedL2DepthMatrix {
    return SharedL2DepthMatrix.fromBuffer(buffer, maxLevels) as DoubleBufferedL2DepthMatrix;
  }
}
