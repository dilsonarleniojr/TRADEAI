/**
 * SharedL2DepthMatrix
 * Matriz colunar (Structure of Arrays - SoA) de profundidade L2 em SharedArrayBuffer.
 * 
 * Permite que o Web Worker de Rede (Ingestão) grave snapshots contínuos de livro de ofertas
 * de alta densidade (depth@100ms / depth1000) diretamente em memória compartilhada, enquanto
 * o Web Worker de Renderização Gráfica consome a matriz para alimentar diretamente comandos
 * gl.texSubImage2D (WebGL) ou device.queue.writeTexture (WebGPU) em VRAM, sem passar pela Main Thread.
 */

export const L2_HEADER_BYTES = 64; // Alinhado para 64 bytes (1 cache line L1/L2)
export const DEFAULT_MAX_DEPTH_LEVELS = 1000;

// Offsets Int32 no Header (0 a 15)
export const L2_OFFSET_WRITE_SEQ = 0;       // Atomics sequence counter
export const L2_OFFSET_BIDS_COUNT = 1;      // Quantidade real de bids preenchidos
export const L2_OFFSET_ASKS_COUNT = 2;      // Quantidade real de asks preenchidos
export const L2_OFFSET_MAX_LEVELS = 3;      // Capacidade máxima configurada
export const L2_OFFSET_TIMESTAMP_LO = 4;   // Timestamp (baixo 32-bit)
export const L2_OFFSET_TIMESTAMP_HI = 5;   // Timestamp (alto 32-bit)
export const L2_OFFSET_RESERVED_A = 6;
export const L2_OFFSET_RESERVED_B = 7;

// Offsets Float64 no Header (8 a 15 -> indices 4 a 7 em Float64)
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

export class SharedL2DepthMatrix {
  private readonly buffer: SharedArrayBuffer;
  private readonly maxLevels: number;

  // Visualizações de cabeçalho
  private readonly headerInt32: Int32Array;
  private readonly headerFloat64: Float64Array;

  // Visualizações colunares (SoA) em Float64
  private readonly bidPrices: Float64Array;
  private readonly bidVolumes: Float64Array;
  private readonly askPrices: Float64Array;
  private readonly askVolumes: Float64Array;

  private constructor(buffer: SharedArrayBuffer, maxLevels: number = DEFAULT_MAX_DEPTH_LEVELS) {
    this.buffer = buffer;
    this.maxLevels = maxLevels;

    // Header de 64 bytes
    this.headerInt32 = new Int32Array(buffer, 0, 16);
    this.headerFloat64 = new Float64Array(buffer, 0, 8);

    // Offsets de colunas contíguas (SoA) após o cabeçalho
    const bytesPerColumn = maxLevels * Float64Array.BYTES_PER_ELEMENT;
    let offset = L2_HEADER_BYTES;

    this.bidPrices = new Float64Array(buffer, offset, maxLevels);
    offset += bytesPerColumn;

    this.bidVolumes = new Float64Array(buffer, offset, maxLevels);
    offset += bytesPerColumn;

    this.askPrices = new Float64Array(buffer, offset, maxLevels);
    offset += bytesPerColumn;

    this.askVolumes = new Float64Array(buffer, offset, maxLevels);
  }

  /**
   * Calcula o tamanho total em bytes necessário para uma matriz com capacidade N.
   */
  public static calculateRequiredBytes(maxLevels: number = DEFAULT_MAX_DEPTH_LEVELS): number {
    return L2_HEADER_BYTES + (maxLevels * 4 * Float64Array.BYTES_PER_ELEMENT);
  }

  /**
   * Instancia uma nova matriz de profundidade em SharedArrayBuffer pré-alocado.
   */
  public static create(maxLevels: number = DEFAULT_MAX_DEPTH_LEVELS): SharedL2DepthMatrix {
    const totalBytes = SharedL2DepthMatrix.calculateRequiredBytes(maxLevels);
    const sab = new SharedArrayBuffer(totalBytes);
    const matrix = new SharedL2DepthMatrix(sab, maxLevels);
    matrix.headerInt32[L2_OFFSET_MAX_LEVELS] = maxLevels;
    return matrix;
  }

  /**
   * Conecta-se a um SharedArrayBuffer já existente transferido por IPC.
   */
  public static fromBuffer(buffer: SharedArrayBuffer, maxLevels: number = DEFAULT_MAX_DEPTH_LEVELS): SharedL2DepthMatrix {
    return new SharedL2DepthMatrix(buffer, maxLevels);
  }

  public getRawBuffer(): SharedArrayBuffer {
    return this.buffer;
  }

  public getMaxLevels(): number {
    return this.maxLevels;
  }

  public getSequence(): number {
    return Atomics.load(this.headerInt32, L2_OFFSET_WRITE_SEQ);
  }

  /**
   * Grava um novo snapshot de profundidade L2 na matriz colunar em O(N) com zero alocações.
   */
  public writeDepthSnapshot(
    bids: ArrayLike<[number, number]> | ArrayLike<number> | Array<any>,
    asks: ArrayLike<[number, number]> | ArrayLike<number> | Array<any>,
    timestamp: number = Date.now()
  ): number {
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

      this.bidPrices[i] = p;
      this.bidVolumes[i] = q;
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

      this.askPrices[i] = p;
      this.askVolumes[i] = q;
      totalAskVol += q;
      if (i === 0) bestAsk = p;
    }

    // 3. Atualiza métricas float64 no cabeçalho
    this.headerFloat64[L2_F64_BEST_BID] = bestBid;
    this.headerFloat64[L2_F64_BEST_ASK] = bestAsk;
    this.headerFloat64[L2_F64_TOTAL_BID_VOL] = totalBidVol;
    this.headerFloat64[L2_F64_TOTAL_ASK_VOL] = totalAskVol;

    // 4. Atualiza contadores int32
    this.headerInt32[L2_OFFSET_BIDS_COUNT] = bidsLen;
    this.headerInt32[L2_OFFSET_ASKS_COUNT] = asksLen;

    const tsLo = timestamp & 0xffffffff;
    const tsHi = Math.floor(timestamp / 0x100000000);
    this.headerInt32[L2_OFFSET_TIMESTAMP_LO] = tsLo;
    this.headerInt32[L2_OFFSET_TIMESTAMP_HI] = tsHi;

    // 5. Incremento atômico de sequência com barreira de memória (Store-Release)
    const nextSeq = Atomics.add(this.headerInt32, L2_OFFSET_WRITE_SEQ, 1) + 1;

    if (typeof Atomics.notify === "function") {
      try {
        Atomics.notify(this.headerInt32, L2_OFFSET_WRITE_SEQ, 1);
      } catch {}
    }

    return nextSeq;
  }

  /**
   * Lê o resumo do snapshot com sincronização atômica (Optimistic Read).
   */
  public readSnapshotSummary(): L2DepthSnapshotSummary {
    const seq = Atomics.load(this.headerInt32, L2_OFFSET_WRITE_SEQ);
    const bidsCount = this.headerInt32[L2_OFFSET_BIDS_COUNT];
    const asksCount = this.headerInt32[L2_OFFSET_ASKS_COUNT];
    const tsLo = this.headerInt32[L2_OFFSET_TIMESTAMP_LO];
    const tsHi = this.headerInt32[L2_OFFSET_TIMESTAMP_HI];
    const timestamp = (tsHi * 0x100000000) + (tsLo >>> 0);

    const bestBid = this.headerFloat64[L2_F64_BEST_BID];
    const bestAsk = this.headerFloat64[L2_F64_BEST_ASK];
    const spread = bestAsk > 0 && bestBid > 0 ? Math.max(0, bestAsk - bestBid) : 0;
    const totalBidVol = this.headerFloat64[L2_F64_TOTAL_BID_VOL];
    const totalAskVol = this.headerFloat64[L2_F64_TOTAL_ASK_VOL];

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
    icebergVolumeThresholdArg?: number
  ): number {
    if (outSlice.length < priceBins * 4) return 0;
    outSlice.fill(0);

    const bidsCount = this.headerInt32[L2_OFFSET_BIDS_COUNT];
    const asksCount = this.headerInt32[L2_OFFSET_ASKS_COUNT];
    const priceRange = maxPrice - minPrice;
    if (priceRange <= 0) return 0;

    let icebergThreshold = 50.0;
    let manualMaxVol: number | null = null;

    if (icebergVolumeThresholdArg !== undefined) {
      icebergThreshold = icebergVolumeThresholdArg;
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
        if (this.bidVolumes[i] > maxVol) maxVol = this.bidVolumes[i];
      }
      for (let i = 0; i < asksCount; i++) {
        if (this.askVolumes[i] > maxVol) maxVol = this.askVolumes[i];
      }
    }

    // 1. Processa Bids (Canal R)
    for (let i = 0; i < bidsCount; i++) {
      const p = this.bidPrices[i];
      const q = this.bidVolumes[i];
      if (p < minPrice || p > maxPrice) continue;

      const norm = (p - minPrice) / priceRange;
      const bin = Math.max(0, Math.min(priceBins - 1, Math.floor(norm * (priceBins - 1))));
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
      const p = this.askPrices[i];
      const q = this.askVolumes[i];
      if (p < minPrice || p > maxPrice) continue;

      const norm = (p - minPrice) / priceRange;
      const bin = Math.max(0, Math.min(priceBins - 1, Math.floor(norm * (priceBins - 1))));
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
  public packToFloat32VRAMBuffer(outBuffer: Float32Array, maxLevelsPerSide?: number): number {
    const bidsCount = this.headerInt32[L2_OFFSET_BIDS_COUNT];
    const asksCount = this.headerInt32[L2_OFFSET_ASKS_COUNT];
    const availableSlots = Math.floor(outBuffer.length / 4);
    const requestedLevels = maxLevelsPerSide ? Math.min(maxLevelsPerSide, availableSlots) : availableSlots;
    const count = Math.min(requestedLevels, Math.max(bidsCount, asksCount));

    for (let i = 0; i < count; i++) {
      const offset = i * 4;
      outBuffer[offset + 0] = i < bidsCount ? this.bidPrices[i] : 0.0;
      outBuffer[offset + 1] = i < bidsCount ? this.bidVolumes[i] : 0.0;
      outBuffer[offset + 2] = i < asksCount ? this.askPrices[i] : 0.0;
      outBuffer[offset + 3] = i < asksCount ? this.askVolumes[i] : 0.0;
    }

    return count;
  }

  public getBidPrices(): Float64Array {
    return this.bidPrices;
  }

  public getBidVolumes(): Float64Array {
    return this.bidVolumes;
  }

  public getAskPrices(): Float64Array {
    return this.askPrices;
  }

  public getAskVolumes(): Float64Array {
    return this.askVolumes;
  }
}
