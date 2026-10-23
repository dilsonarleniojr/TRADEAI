/**
 * binance-stream.worker.ts - Web Worker Dedicado para Ingestão e Parsing de WebSocket Binance
 * 
 * Arquitetura de Isolamento de Thread & Concorrência Atômica:
 * 1. Decoupling Total de Rede:
 *    A conexão WebSocket com a Binance e todo o processamento de stream (handshake, keep-alive,
 *    reconexão com backoff exponencial) rodam 100% isolados da Main Thread da UI.
 * 2. Parsing de Baixa Latência no Worker:
 *    Parsing de JSON bruto, normalização e extração de campos executados estritamente nesta thread.
 * 3. Enfileiramento Atômico Zero-Copy:
 *    Quando SharedArrayBuffer está disponível, os dados normalizados são escritos diretamente
 *    nos slots de memória compartilhada da LockFreeSPSCQueue / SharedMemoryAtomicQueue via Atomics,
 *    sem nenhum custo de serialização ou structured clone.
 * 4. Fallback por Transferable ArrayBuffer:
 *    Caso SharedArrayBuffer esteja bloqueado por headers de isolamento de origem (COOP/COEP),
 *    os lotes são despachados transferindo ownership de ArrayBuffer (zero-copy IPC).
 * 5. Detecção de Erros e Rate Limits (HTTP 429/418):
 *    Emissões tipadas de controle estruturadas via OrderBookFetchError quando ocorrem violações de cota.
 */

// Offsets do Slot Float64 (Stride = 10)
export const SLOT_OFFSET_TIMESTAMP = 0;
export const SLOT_OFFSET_SYMBOL_ID = 1;
export const SLOT_OFFSET_PRICE = 2;
export const SLOT_OFFSET_PRICE_CHANGE = 3;
export const SLOT_OFFSET_PRICE_CHANGE_PCT = 4;
export const SLOT_OFFSET_HIGH = 5;
export const SLOT_OFFSET_LOW = 6;
export const SLOT_OFFSET_VOLUME = 7;
export const SLOT_OFFSET_QUOTE_VOLUME = 8;
export const SLOT_OFFSET_FLAGS = 9;
export const DEFAULT_TICKER_STRIDE = 10;

// Cabeçalho LockFreeSPSCQueue (3 cache lines de 64 bytes = 192 bytes = 48 int32)
export const SPSC_PRODUCER_HEAD_INDEX = 0;
export const SPSC_PRODUCER_CACHED_TAIL = 1;
export const SPSC_PRODUCER_DROPPED_COUNT = 2;
export const SPSC_PRODUCER_WRITE_COUNT = 3;
export const SPSC_CONSUMER_TAIL_INDEX = 16;
export const SPSC_CONFIG_CAPACITY_INDEX = 32;
export const SPSC_CONFIG_MASK_INDEX = 33;
export const SPSC_CONFIG_STRIDE_INDEX = 34;
export const SPSC_HEADER_BYTES = 192;

// Cabeçalho SharedMemoryAtomicQueue clássico (64 bytes = 16 int32)
export const ATOMIC_HEADER_HEAD = 0;
export const ATOMIC_HEADER_TAIL = 1;
export const ATOMIC_HEADER_CAPACITY = 2;
export const ATOMIC_HEADER_STRIDE = 3;
export const ATOMIC_HEADER_DROPPED = 4;
export const ATOMIC_HEADER_WRITE_SEQ = 5;
export const ATOMIC_HEADER_SIZE_BYTES = 64;

export interface NormalizedTicker {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
  timestamp: number;
}

export interface SerializedWorkerError {
  name: "OrderBookFetchError";
  message: string;
  symbol: string;
  statusCode?: number;
  isRateLimit: boolean;
  timestamp: number;
}

export type WorkerInboundMessage =
  | { type: "INIT_SHARED_BUFFER"; buffer: SharedArrayBuffer; queueType?: "SPSC" | "ATOMIC" }
  | { type: "INIT_L2_DEPTH_BUFFER"; buffer: SharedArrayBuffer; maxLevels?: number }
  | { type: "SUBSCRIBE"; symbols: string[]; symbolMap?: Record<string, number> }
  | { type: "CONNECT_PEER_PORT"; port: MessagePort }
  | { type: "DISCONNECT" }
  | { type: "PING" };

export type WorkerOutboundMessage =
  | { type: "CONNECTED"; symbols: string[] }
  | { type: "DISCONNECTED"; reason?: string }
  | { type: "ERROR"; error: SerializedWorkerError }
  | { type: "TRANSFER_BATCH"; count: number; stride: number; buffer: ArrayBuffer; symbolMap: Record<string, number> }
  | { type: "BATCH"; tickers: NormalizedTicker[] }
  | { type: "PEER_PORT_CONNECTED" }
  | { type: "L2_DEPTH_BUFFER_CONNECTED" }
  | { type: "PONG"; timestamp: number };

/**
 * Converte erro em objeto estruturado tipado OrderBookFetchError.
 */
export function createSerializedWorkerError(
  message: string,
  symbol: string = "ALL",
  statusCode?: number
): SerializedWorkerError {
  const isRateLimit = statusCode === 429 || statusCode === 418;
  return {
    name: "OrderBookFetchError",
    message: isRateLimit
      ? `Binance Rate limit exceeded (HTTP ${statusCode}): ${message}`
      : message,
    symbol,
    statusCode,
    isRateLimit,
    timestamp: Date.now(),
  };
}

/**
 * Parser rápido de mensagens Binance Stream (individual ou combinado).
 */
export function parseBinanceStreamPayload(raw: string): NormalizedTicker | null {
  if (!raw || raw.length === 0) return null;
  try {
    const payload = JSON.parse(raw);
    const data = payload.data || payload;

    // Stream de ticker: possui "s" (symbol) e "c" (close price)
    if (data && data.s && data.c) {
      const sym = String(data.s).toUpperCase();
      const price = Number(data.c) || 0;
      const priceChange = Number(data.p) || 0;
      const priceChangePercent = Number(data.P) || 0;
      const high = Number(data.h) || price;
      const low = Number(data.l) || price;
      const volume = Number(data.v) || 0;
      const quoteVolume = Number(data.q) || 0;
      const timestamp = Number(data.E) || Date.now();

      return {
        symbol: sym,
        price,
        priceChange,
        priceChangePercent,
        high,
        low,
        volume,
        quoteVolume,
        timestamp,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Verifica se um código de status ou payload indica infração de rate limit (HTTP 429/418).
 */
export function isBinanceRateLimit(code?: number, message?: string): boolean {
  if (code === 429 || code === 418 || code === 1008 || code === 1013) return true;
  if (message) {
    const lower = message.toLowerCase();
    if (lower.includes("429") || lower.includes("418") || lower.includes("too many requests") || lower.includes("rate limit") || lower.includes("ip banned")) {
      return true;
    }
  }
  return false;
}

export interface ParsedBinanceDepth {
  bids: [number, number][];
  asks: [number, number][];
  timestamp: number;
  symbol?: string;
}

/**
 * Parser de alto desempenho de payloads de profundidade L2 (depth20, depth@100ms, depth1000).
 */
export function parseBinanceDepthPayload(raw: string): ParsedBinanceDepth | null {
  if (!raw || raw.length === 0) return null;
  try {
    const payload = JSON.parse(raw);
    const data = payload.data || payload;
    if (data && (data.bids || data.b) && (data.asks || data.a)) {
      const rawBids = data.bids || data.b;
      const rawAsks = data.asks || data.a;
      const bids: [number, number][] = [];
      const asks: [number, number][] = [];

      for (let i = 0; i < rawBids.length; i++) {
        bids.push([Number(rawBids[i][0]) || 0, Number(rawBids[i][1]) || 0]);
      }
      for (let i = 0; i < rawAsks.length; i++) {
        asks.push([Number(rawAsks[i][0]) || 0, Number(rawAsks[i][1]) || 0]);
      }

      return {
        bids,
        asks,
        timestamp: Number(data.E) || Date.now(),
        symbol: data.s ? String(data.s).toUpperCase() : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Execução do Worker (escopo isolado em thread secundária)
// ---------------------------------------------------------------------------
if (typeof self !== "undefined" && typeof (self as any).postMessage === "function") {
  let ws: WebSocket | null = null;
  let subscribedSymbols: string[] = [];
  let symbolMap: Record<string, number> = {};
  let nextSymbolId = 1;

  // Buffer compartilhado atômico
  let sharedBuffer: SharedArrayBuffer | null = null;
  let spscHeader: Int32Array | null = null;
  let spscData: Float64Array | null = null;
  let spscCapacity = 0;
  let spscMask = 0;
  let spscStride = DEFAULT_TICKER_STRIDE;
  let queueMode: "SPSC" | "ATOMIC" = "SPSC";

  // SharedMemoryAtomicQueue clássico
  let atomicHeader: Int32Array | null = null;
  let atomicData: Float64Array | null = null;
  let atomicCapacity = 0;
  let atomicStride = DEFAULT_TICKER_STRIDE;

  // Transferable ArrayBuffer Fallback (Modo B)
  const TRANSFER_BATCH_SIZE = 64;
  let transferFloatArray = new Float64Array(TRANSFER_BATCH_SIZE * DEFAULT_TICKER_STRIDE);
  let transferCount = 0;
  let transferTimer: any = null;

  // Batch JSON Fallback (Modo C)
  let pendingJsonBatch: Record<string, NormalizedTicker> = {};
  let jsonFlushTimer: any = null;

  // Canal direto Peer-to-Peer com o Worker de Renderização (Zero-Hop)
  let peerPort: MessagePort | null = null;

  // Matriz colunar de profundidade L2 (SoA) em SharedArrayBuffer
  let sharedDepthBuffer: SharedArrayBuffer | null = null;
  let depthHeaderInt32: Int32Array | null = null;
  let depthHeaderFloat64: Float64Array | null = null;
  let depthBidPrices: Float64Array | null = null;
  let depthBidVolumes: Float64Array | null = null;
  let depthAskPrices: Float64Array | null = null;
  let depthAskVolumes: Float64Array | null = null;
  let depthMaxLevels = 1000;

  function writeDepthToSharedMatrix(depth: ParsedBinanceDepth): boolean {
    if (!sharedDepthBuffer || !depthHeaderInt32 || !depthBidPrices || !depthBidVolumes || !depthAskPrices || !depthAskVolumes) {
      return false;
    }
    const bidsLen = Math.min(depthMaxLevels, depth.bids.length);
    const asksLen = Math.min(depthMaxLevels, depth.asks.length);
    let totalBidVol = 0;
    let totalAskVol = 0;
    let bestBid = 0;
    let bestAsk = 0;

    for (let i = 0; i < bidsLen; i++) {
      const p = depth.bids[i][0];
      const q = depth.bids[i][1];
      depthBidPrices[i] = p;
      depthBidVolumes[i] = q;
      totalBidVol += q;
      if (i === 0) bestBid = p;
    }

    for (let i = 0; i < asksLen; i++) {
      const p = depth.asks[i][0];
      const q = depth.asks[i][1];
      depthAskPrices[i] = p;
      depthAskVolumes[i] = q;
      totalAskVol += q;
      if (i === 0) bestAsk = p;
    }

    if (depthHeaderFloat64) {
      depthHeaderFloat64[4] = bestBid;
      depthHeaderFloat64[5] = bestAsk;
      depthHeaderFloat64[6] = bestAsk > 0 && bestBid > 0 ? Math.max(0, bestAsk - bestBid) : 0;
      depthHeaderFloat64[7] = totalBidVol;
    }

    depthHeaderInt32[1] = bidsLen;
    depthHeaderInt32[2] = asksLen;
    const tsLo = depth.timestamp & 0xffffffff;
    const tsHi = Math.floor(depth.timestamp / 0x100000000);
    depthHeaderInt32[4] = tsLo;
    depthHeaderInt32[5] = tsHi;

    Atomics.add(depthHeaderInt32, 0, 1);
    if (typeof Atomics.notify === "function") {
      try {
        Atomics.notify(depthHeaderInt32, 0, 1);
      } catch {}
    }
    return true;
  }

  let reconnectAttempts = 0;
  let reconnectTimer: any = null;

  function getSymbolId(sym: string): number {
    if (symbolMap[sym]) return symbolMap[sym];
    symbolMap[sym] = nextSymbolId++;
    return symbolMap[sym];
  }

  function flushTransferBatch() {
    if (transferCount === 0) return;
    const count = transferCount;
    transferCount = 0;

    // Envia fatia exata via Transferable ArrayBuffer (zero-copy)
    const outView = transferFloatArray.slice(0, count * DEFAULT_TICKER_STRIDE);
    (self as any).postMessage(
      {
        type: "TRANSFER_BATCH",
        count,
        stride: DEFAULT_TICKER_STRIDE,
        buffer: outView.buffer,
        symbolMap: { ...symbolMap },
      },
      [outView.buffer]
    );

    // Recria array para o próximo lote
    transferFloatArray = new Float64Array(TRANSFER_BATCH_SIZE * DEFAULT_TICKER_STRIDE);
  }

  function flushJsonBatch() {
    const list = Object.values(pendingJsonBatch);
    pendingJsonBatch = {};
    if (list.length > 0) {
      (self as any).postMessage({ type: "BATCH", tickers: list });
    }
  }

  function scheduleBatchFlush() {
    if (!sharedBuffer) {
      if (!transferTimer) {
        transferTimer = setTimeout(() => {
          transferTimer = null;
          flushTransferBatch();
        }, 16);
      }
      if (!jsonFlushTimer) {
        jsonFlushTimer = setTimeout(() => {
          jsonFlushTimer = null;
          flushJsonBatch();
        }, 16);
      }
    }
  }

  function writeToAtomicQueue(ticker: NormalizedTicker): boolean {
    const symId = getSymbolId(ticker.symbol);

    // 1. LockFreeSPSCQueue (192-byte padding de linha de cache)
    if (queueMode === "SPSC" && spscHeader && spscData) {
      const head = Atomics.load(spscHeader, SPSC_PRODUCER_HEAD_INDEX);
      let cachedTail = spscHeader[SPSC_PRODUCER_CACHED_TAIL];

      if (head - cachedTail >= spscCapacity) {
        cachedTail = Atomics.load(spscHeader, SPSC_CONSUMER_TAIL_INDEX);
        spscHeader[SPSC_PRODUCER_CACHED_TAIL] = cachedTail;

        if (head - cachedTail >= spscCapacity) {
          Atomics.add(spscHeader, SPSC_PRODUCER_DROPPED_COUNT, 1);
          return false; // Backpressure seguro
        }
      }

      const slotIndex = head & spscMask;
      const dataOffset = slotIndex * spscStride;

      spscData[dataOffset + SLOT_OFFSET_TIMESTAMP] = ticker.timestamp;
      spscData[dataOffset + SLOT_OFFSET_SYMBOL_ID] = symId;
      spscData[dataOffset + SLOT_OFFSET_PRICE] = ticker.price;
      spscData[dataOffset + SLOT_OFFSET_PRICE_CHANGE] = ticker.priceChange;
      spscData[dataOffset + SLOT_OFFSET_PRICE_CHANGE_PCT] = ticker.priceChangePercent;
      spscData[dataOffset + SLOT_OFFSET_HIGH] = ticker.high;
      spscData[dataOffset + SLOT_OFFSET_LOW] = ticker.low;
      spscData[dataOffset + SLOT_OFFSET_VOLUME] = ticker.volume;
      spscData[dataOffset + SLOT_OFFSET_QUOTE_VOLUME] = ticker.quoteVolume;
      spscData[dataOffset + SLOT_OFFSET_FLAGS] = 1;

      Atomics.add(spscHeader, SPSC_PRODUCER_WRITE_COUNT, 1);
      Atomics.store(spscHeader, SPSC_PRODUCER_HEAD_INDEX, head + 1);
      return true;
    }

    // 2. SharedMemoryAtomicQueue Clássico
    if (queueMode === "ATOMIC" && atomicHeader && atomicData) {
      const head = Atomics.load(atomicHeader, ATOMIC_HEADER_HEAD);
      const tail = Atomics.load(atomicHeader, ATOMIC_HEADER_TAIL);

      if (head - tail >= atomicCapacity) {
        Atomics.add(atomicHeader, ATOMIC_HEADER_DROPPED, 1);
        Atomics.add(atomicHeader, ATOMIC_HEADER_TAIL, 1);
      }

      const slotIndex = head % atomicCapacity;
      const dataOffset = slotIndex * atomicStride;

      atomicData[dataOffset + SLOT_OFFSET_TIMESTAMP] = ticker.timestamp;
      atomicData[dataOffset + SLOT_OFFSET_SYMBOL_ID] = symId;
      atomicData[dataOffset + SLOT_OFFSET_PRICE] = ticker.price;
      atomicData[dataOffset + SLOT_OFFSET_PRICE_CHANGE] = ticker.priceChange;
      atomicData[dataOffset + SLOT_OFFSET_PRICE_CHANGE_PCT] = ticker.priceChangePercent;
      atomicData[dataOffset + SLOT_OFFSET_HIGH] = ticker.high;
      atomicData[dataOffset + SLOT_OFFSET_LOW] = ticker.low;
      atomicData[dataOffset + SLOT_OFFSET_VOLUME] = ticker.volume;
      atomicData[dataOffset + SLOT_OFFSET_QUOTE_VOLUME] = ticker.quoteVolume;
      atomicData[dataOffset + SLOT_OFFSET_FLAGS] = 1;

      Atomics.add(atomicHeader, ATOMIC_HEADER_WRITE_SEQ, 1);
      Atomics.store(atomicHeader, ATOMIC_HEADER_HEAD, head + 1);

      if (typeof Atomics.notify === "function") {
        try {
          Atomics.notify(atomicHeader, ATOMIC_HEADER_HEAD, 1);
        } catch {}
      }
      return true;
    }

    return false;
  }

  function handleMessage(rawText: string) {
    // 1. Parsing sem alocações desnecessárias
    const ticker = parseBinanceStreamPayload(rawText);
    if (!ticker) {
      // 1.1 Verifica se é snapshot L2 de profundidade contínua (depth20, depth@100ms)
      const depth = parseBinanceDepthPayload(rawText);
      if (depth) {
        writeDepthToSharedMatrix(depth);
        if (peerPort) {
          try {
            peerPort.postMessage({
              type: "PEER_L2_UPDATE",
              timestamp: depth.timestamp,
              bidsCount: depth.bids.length,
              asksCount: depth.asks.length,
              symbol: depth.symbol,
            });
          } catch {}
        }
        return;
      }

      // Verifica se é erro JSON ou rate limit retornado pela Binance
      try {
        const errObj = JSON.parse(rawText);
        if (errObj && (errObj.code === -1003 || isBinanceRateLimit(errObj.code, errObj.msg))) {
          const serialized = createSerializedWorkerError(
            errObj.msg || "Binance Rate limit reached (-1003)",
            "ALL",
            429
          );
          (self as any).postMessage({ type: "ERROR", error: serialized });
        }
      } catch {}
      return;
    }

    // 1.5. Despacho direto P2P para o Worker de Renderização WebGL (Zero-Hop)
    if (peerPort) {
      try {
        peerPort.postMessage({
          type: "PEER_TICK",
          ticker,
        });
      } catch {}
    }

    // 2. Se temos buffer atômico, grava via Atomics
    const wroteAtomic = writeToAtomicQueue(ticker);

    // 3. Se não temos shared buffer (Modo B Transferable), armazena no buffer contíguo
    if (!wroteAtomic && !sharedBuffer) {
      if (transferCount < TRANSFER_BATCH_SIZE) {
        const offset = transferCount * DEFAULT_TICKER_STRIDE;
        const symId = getSymbolId(ticker.symbol);
        transferFloatArray[offset + SLOT_OFFSET_TIMESTAMP] = ticker.timestamp;
        transferFloatArray[offset + SLOT_OFFSET_SYMBOL_ID] = symId;
        transferFloatArray[offset + SLOT_OFFSET_PRICE] = ticker.price;
        transferFloatArray[offset + SLOT_OFFSET_PRICE_CHANGE] = ticker.priceChange;
        transferFloatArray[offset + SLOT_OFFSET_PRICE_CHANGE_PCT] = ticker.priceChangePercent;
        transferFloatArray[offset + SLOT_OFFSET_HIGH] = ticker.high;
        transferFloatArray[offset + SLOT_OFFSET_LOW] = ticker.low;
        transferFloatArray[offset + SLOT_OFFSET_VOLUME] = ticker.volume;
        transferFloatArray[offset + SLOT_OFFSET_QUOTE_VOLUME] = ticker.quoteVolume;
        transferFloatArray[offset + SLOT_OFFSET_FLAGS] = 1;
        transferCount++;
      }
      pendingJsonBatch[ticker.symbol] = ticker;
      scheduleBatchFlush();
    }
  }

  function connect() {
    if (subscribedSymbols.length === 0) return;
    if (ws) {
      try {
        ws.close();
      } catch {}
      ws = null;
    }

    const streams = subscribedSymbols
      .map((s) => `${s.toLowerCase()}@ticker`)
      .join("/");
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        reconnectAttempts = 0;
        (self as any).postMessage({ type: "CONNECTED", symbols: subscribedSymbols });
      };

      ws.onmessage = (event) => {
        const raw = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data);
        handleMessage(raw);
      };

      ws.onerror = (evt: any) => {
        const isRate = isBinanceRateLimit(undefined, evt?.message);
        const err = createSerializedWorkerError(
          evt?.message || "WebSocket transport error in worker",
          subscribedSymbols[0] || "ALL",
          isRate ? 429 : undefined
        );
        (self as any).postMessage({ type: "ERROR", error: err });
      };

      ws.onclose = (evt) => {
        const isRate = isBinanceRateLimit(evt.code, evt.reason);
        if (isRate) {
          const err = createSerializedWorkerError(
            evt.reason || `WebSocket rate limited by exchange (code ${evt.code})`,
            subscribedSymbols[0] || "ALL",
            429
          );
          (self as any).postMessage({ type: "ERROR", error: err });
        }

        (self as any).postMessage({ type: "DISCONNECTED", reason: evt.reason });

        // Reconexão com backoff exponencial e jitter anti-rajada
        reconnectAttempts++;
        const backoffMs = Math.min(30000, 1000 * Math.pow(1.5, reconnectAttempts) + Math.random() * 500);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          if (subscribedSymbols.length > 0) {
            connect();
          }
        }, backoffMs);
      };
    } catch (err: any) {
      const serialized = createSerializedWorkerError(
        err?.message || "Failed to initialize WebSocket in worker",
        subscribedSymbols[0] || "ALL",
        undefined
      );
      (self as any).postMessage({ type: "ERROR", error: serialized });
    }
  }

  self.onmessage = (evt: MessageEvent<WorkerInboundMessage>) => {
    const msg = evt.data;
    if (!msg) return;

    switch (msg.type) {
      case "INIT_SHARED_BUFFER": {
        if (msg.buffer) {
          sharedBuffer = msg.buffer;
          queueMode = msg.queueType || "SPSC";

          if (queueMode === "SPSC") {
            spscHeader = new Int32Array(sharedBuffer, 0, 48);
            spscCapacity = spscHeader[SPSC_CONFIG_CAPACITY_INDEX] || 2048;
            spscMask = spscHeader[SPSC_CONFIG_MASK_INDEX] || spscCapacity - 1;
            spscStride = spscHeader[SPSC_CONFIG_STRIDE_INDEX] || DEFAULT_TICKER_STRIDE;
            spscData = new Float64Array(sharedBuffer, SPSC_HEADER_BYTES, spscCapacity * spscStride);
          } else {
            atomicHeader = new Int32Array(sharedBuffer, 0, 16);
            atomicCapacity = atomicHeader[ATOMIC_HEADER_CAPACITY] || 2048;
            atomicStride = atomicHeader[ATOMIC_HEADER_STRIDE] || DEFAULT_TICKER_STRIDE;
            atomicData = new Float64Array(sharedBuffer, ATOMIC_HEADER_SIZE_BYTES, atomicCapacity * atomicStride);
          }
        }
        break;
      }

      case "INIT_L2_DEPTH_BUFFER": {
        if (msg.buffer) {
          sharedDepthBuffer = msg.buffer;
          depthMaxLevels = msg.maxLevels || 1000;
          depthHeaderInt32 = new Int32Array(sharedDepthBuffer, 0, 16);
          depthHeaderFloat64 = new Float64Array(sharedDepthBuffer, 0, 8);
          const bytesPerCol = depthMaxLevels * Float64Array.BYTES_PER_ELEMENT;
          let off = 64; // L2_HEADER_BYTES
          depthBidPrices = new Float64Array(sharedDepthBuffer, off, depthMaxLevels);
          off += bytesPerCol;
          depthBidVolumes = new Float64Array(sharedDepthBuffer, off, depthMaxLevels);
          off += bytesPerCol;
          depthAskPrices = new Float64Array(sharedDepthBuffer, off, depthMaxLevels);
          off += bytesPerCol;
          depthAskVolumes = new Float64Array(sharedDepthBuffer, off, depthMaxLevels);
          (self as any).postMessage({ type: "L2_DEPTH_BUFFER_CONNECTED" });
        }
        break;
      }

      case "SUBSCRIBE": {
        subscribedSymbols = (msg.symbols || []).map((s) => s.toUpperCase());
        if (msg.symbolMap) {
          symbolMap = { ...msg.symbolMap };
          // Atualiza nextSymbolId para evitar colisão
          const maxId = Math.max(0, ...Object.values(symbolMap));
          nextSymbolId = maxId + 1;
        } else {
          subscribedSymbols.forEach((s) => getSymbolId(s));
        }
        connect();
        break;
      }

      case "DISCONNECT": {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        if (transferTimer) {
          clearTimeout(transferTimer);
          transferTimer = null;
        }
        if (jsonFlushTimer) {
          clearTimeout(jsonFlushTimer);
          jsonFlushTimer = null;
        }
        if (ws) {
          try {
            ws.close();
          } catch {}
          ws = null;
        }
        subscribedSymbols = [];
        (self as any).postMessage({ type: "DISCONNECTED", reason: "Explicit disconnect requested" });
        break;
      }

      case "CONNECT_PEER_PORT": {
        if (msg.port) {
          peerPort = msg.port;
          peerPort.onmessage = (_pe) => {
            // Handshake ou sincronização de volta da render thread
          };
          if (typeof peerPort.start === "function") {
            peerPort.start();
          }
          (self as any).postMessage({ type: "PEER_PORT_CONNECTED" });
        }
        break;
      }

      case "PING": {
        (self as any).postMessage({ type: "PONG", timestamp: Date.now() });
        break;
      }
    }
  };
}
