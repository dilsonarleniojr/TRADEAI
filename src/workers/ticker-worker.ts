/**
 * ticker-worker.ts - Web Worker Dedicado de Microestrutura Binance (@bookTicker & @ticker)
 * 
 * Arquitetura de Isolamento de Thread & Concorrência Atômica (Pilar 1 Institucional):
 * 1. Decoupling Total de Rede:
 *    A conexão WebSocket com a Binance e todo o processamento de stream (@bookTicker contínuo <10ms e @ticker 1000ms)
 *    rodam 100% isolados da Main Thread da UI.
 * 2. Parsing de Baixa Latência no Worker:
 *    Parsing de JSON bruto, cálculo de Mid-Price, Spread em Basis Points (BPS), Best Bid/Ask e normalização
 *    são executados estritamente nesta thread. Zero JSON.parse na UI.
 * 3. Enfileiramento Atômico Zero-Copy (128-byte Stride / 2 Cache Lines):
 *    Quando SharedArrayBuffer está disponível, os dados de microestrutura são gravados diretamente
 *    nos slots contíguos da LockFreeSPSCQueue via Atomics sem serialização ou structured clone.
 * 4. Fallback por Transferable ArrayBuffer:
 *    Caso SharedArrayBuffer esteja restrito no navegador (sem headers COOP/COEP), os lotes são despachados
 *    transferindo ownership de ArrayBuffer (zero-copy IPC) ou BATCH estruturado.
 */

// Offsets do Slot Float64 (Microstructure Stride = 16 = 128 bytes = 2 Cache Lines de 64 bytes)
export const SLOT_OFFSET_TIMESTAMP = 0;
export const SLOT_OFFSET_SYMBOL_ID = 1;
export const SLOT_OFFSET_PRICE = 2; // Mid-Price ou Last Close
export const SLOT_OFFSET_PRICE_CHANGE = 3;
export const SLOT_OFFSET_PRICE_CHANGE_PCT = 4;
export const SLOT_OFFSET_HIGH = 5;
export const SLOT_OFFSET_LOW = 6;
export const SLOT_OFFSET_VOLUME = 7;
export const SLOT_OFFSET_QUOTE_VOLUME = 8;
export const SLOT_OFFSET_BID_PRICE = 9; // Best Bid
export const SLOT_OFFSET_BID_QTY = 10;
export const SLOT_OFFSET_ASK_PRICE = 11; // Best Ask
export const SLOT_OFFSET_ASK_QTY = 12;
export const SLOT_OFFSET_SPREAD_BPS = 13; // Basis Points Spread ((Ask-Bid)/Mid)*10000
export const SLOT_OFFSET_FLAGS = 14; // Bitmask: 1 = @bookTicker, 2 = @ticker, 3 = ambos
export const SLOT_OFFSET_UPDATE_ID = 15; // Binance updateId (u)
export const MICROSTRUCTURE_STRIDE = 16;

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

export interface NormalizedMicrostructureTicker {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
  bidPrice: number;
  bidQty: number;
  askPrice: number;
  askQty: number;
  spreadBps: number;
  midPrice: number;
  flags: number;
  updateId: number;
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
  | { type: "DISPATCH_L2_UPDATE"; symbol: string; bids: [number, number][]; asks: [number, number][]; timestamp?: number }
  | { type: "DISCONNECT" }
  | { type: "PING" };

export type WorkerOutboundMessage =
  | { type: "CONNECTED"; symbols: string[] }
  | { type: "DISCONNECTED"; reason?: string }
  | { type: "ERROR"; error: SerializedWorkerError }
  | { type: "TRANSFER_BATCH"; count: number; stride: number; buffer: ArrayBuffer; symbolMap: Record<string, number> }
  | { type: "BATCH"; tickers: NormalizedMicrostructureTicker[] }
  | { type: "PEER_PORT_CONNECTED" }
  | { type: "PONG"; timestamp: number };

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

/**
 * Parser de alto desempenho para streams Binance (@bookTicker e @ticker combinados)
 */
export function parseBinanceMicrostructurePayload(
  raw: string,
  cacheMap: Record<string, Partial<NormalizedMicrostructureTicker>> = {}
): NormalizedMicrostructureTicker | null {
  if (!raw || raw.length === 0) return null;
  try {
    const payload = JSON.parse(raw);
    const data = payload.data || payload;

    // 1. Stream @bookTicker (Topo de Livro em Tempo Real: b = bid, a = ask, B = bidQty, A = askQty)
    if (data && data.s && data.b !== undefined && data.a !== undefined) {
      const sym = String(data.s).toUpperCase();
      const bidPrice = Number(data.b) || 0;
      const bidQty = Number(data.B) || 0;
      const askPrice = Number(data.a) || 0;
      const askQty = Number(data.A) || 0;
      const updateId = Number(data.u) || 0;
      const midPrice = bidPrice > 0 && askPrice > 0 ? (bidPrice + askPrice) / 2 : (bidPrice || askPrice);
      const spread = askPrice > bidPrice ? askPrice - bidPrice : 0;
      const spreadBps = midPrice > 0 ? (spread / midPrice) * 10000 : 0;
      const timestamp = Number(data.E) || Date.now();

      // Recupera dados complementares do 24h ticker do cache local em memória
      const cached = cacheMap[sym] || {};
      cached.bidPrice = bidPrice;
      cached.bidQty = bidQty;
      cached.askPrice = askPrice;
      cached.askQty = askQty;
      cached.midPrice = midPrice;
      cached.spreadBps = spreadBps;
      cached.updateId = updateId;
      cached.flags = (cached.flags || 0) | 1; // bit 0 = @bookTicker
      cacheMap[sym] = cached;

      return {
        symbol: sym,
        price: midPrice > 0 ? midPrice : (cached.price || bidPrice),
        priceChange: cached.priceChange || 0,
        priceChangePercent: cached.priceChangePercent || 0,
        high: cached.high || Math.max(askPrice, cached.price || 0),
        low: cached.low || Math.min(bidPrice, cached.price || bidPrice),
        volume: cached.volume || 0,
        quoteVolume: cached.quoteVolume || 0,
        bidPrice,
        bidQty,
        askPrice,
        askQty,
        spreadBps,
        midPrice,
        flags: cached.flags,
        updateId,
        timestamp,
      };
    }

    // 2. Stream @ticker (24h Ticker: c = close, p = change, P = change %, h = high, l = low, v = vol)
    if (data && data.s && data.c !== undefined) {
      const sym = String(data.s).toUpperCase();
      const price = Number(data.c) || 0;
      const priceChange = Number(data.p) || 0;
      const priceChangePercent = Number(data.P) || 0;
      const high = Number(data.h) || price;
      const low = Number(data.l) || price;
      const volume = Number(data.v) || 0;
      const quoteVolume = Number(data.q) || 0;
      const timestamp = Number(data.E) || Date.now();

      const cached = cacheMap[sym] || {};
      cached.price = price;
      cached.priceChange = priceChange;
      cached.priceChangePercent = priceChangePercent;
      cached.high = high;
      cached.low = low;
      cached.volume = volume;
      cached.quoteVolume = quoteVolume;
      cached.flags = (cached.flags || 0) | 2; // bit 1 = @ticker
      cacheMap[sym] = cached;

      return {
        symbol: sym,
        price,
        priceChange,
        priceChangePercent,
        high,
        low,
        volume,
        quoteVolume,
        bidPrice: cached.bidPrice || price,
        bidQty: cached.bidQty || 0,
        askPrice: cached.askPrice || price,
        askQty: cached.askQty || 0,
        spreadBps: cached.spreadBps || 0,
        midPrice: cached.midPrice || price,
        flags: cached.flags,
        updateId: cached.updateId || 0,
        timestamp,
      };
    }

    return null;
  } catch {
    return null;
  }
}

// ==========================================
// Execução do Worker (Escopo de Thread Isolada)
// ==========================================
if (typeof self !== "undefined" && typeof (self as any).postMessage === "function" && typeof window === "undefined") {
  let ws: WebSocket | null = null;
  let subscribedSymbols: string[] = [];
  const symbolMap: Record<string, number> = {};
  const cacheMap: Record<string, Partial<NormalizedMicrostructureTicker>> = {};
  let nextSymbolId = 1;

  let sharedBuffer: SharedArrayBuffer | null = null;
  let spscHeader: Int32Array | null = null;
  let spscData: Float64Array | null = null;
  let spscCapacity = 0;
  let spscMask = 0;
  let spscStride = MICROSTRUCTURE_STRIDE;
  let l2DepthBuffer: SharedArrayBuffer | null = null;

  // Fallback Transferable ArrayBuffer
  const TRANSFER_BATCH_SIZE = 64;
  let transferFloatArray = new Float64Array(TRANSFER_BATCH_SIZE * MICROSTRUCTURE_STRIDE);
  let transferCount = 0;
  let transferTimer: any = null;

  // Fallback BATCH estruturado
  let pendingJsonBatch: Record<string, NormalizedMicrostructureTicker> = {};
  let jsonFlushTimer: any = null;

  let peerPort: MessagePort | null = null;
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

    const outView = transferFloatArray.slice(0, count * MICROSTRUCTURE_STRIDE);
    const msg: WorkerOutboundMessage = {
      type: "TRANSFER_BATCH",
      count,
      stride: MICROSTRUCTURE_STRIDE,
      buffer: outView.buffer,
      symbolMap: { ...symbolMap },
    };
    (self as any).postMessage(msg, [outView.buffer]);
    transferFloatArray = new Float64Array(TRANSFER_BATCH_SIZE * MICROSTRUCTURE_STRIDE);
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
        }, 16); // Alinhado a 60 FPS (16.6ms)
      }
      if (!jsonFlushTimer) {
        jsonFlushTimer = setTimeout(() => {
          jsonFlushTimer = null;
          flushJsonBatch();
        }, 16);
      }
    }
  }

  function writeToAtomicQueue(ticker: NormalizedMicrostructureTicker): boolean {
    const symId = getSymbolId(ticker.symbol);

    if (spscHeader && spscData) {
      const head = Atomics.load(spscHeader, SPSC_PRODUCER_HEAD_INDEX);
      let cachedTail = spscHeader[SPSC_PRODUCER_CACHED_TAIL];

      if (head - cachedTail >= spscCapacity) {
        cachedTail = Atomics.load(spscHeader, SPSC_CONSUMER_TAIL_INDEX);
        spscHeader[SPSC_PRODUCER_CACHED_TAIL] = cachedTail;

        if (head - cachedTail >= spscCapacity) {
          Atomics.add(spscHeader, SPSC_PRODUCER_DROPPED_COUNT, 1);
          return false;
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
      spscData[dataOffset + SLOT_OFFSET_BID_PRICE] = ticker.bidPrice;
      spscData[dataOffset + SLOT_OFFSET_BID_QTY] = ticker.bidQty;
      spscData[dataOffset + SLOT_OFFSET_ASK_PRICE] = ticker.askPrice;
      spscData[dataOffset + SLOT_OFFSET_ASK_QTY] = ticker.askQty;
      spscData[dataOffset + SLOT_OFFSET_SPREAD_BPS] = ticker.spreadBps;
      spscData[dataOffset + SLOT_OFFSET_FLAGS] = ticker.flags;
      spscData[dataOffset + SLOT_OFFSET_UPDATE_ID] = ticker.updateId;

      Atomics.add(spscHeader, SPSC_PRODUCER_WRITE_COUNT, 1);
      Atomics.store(spscHeader, SPSC_PRODUCER_HEAD_INDEX, head + 1);
      return true;
    }

    return false;
  }

  function handleMessage(rawText: string) {
    const ticker = parseBinanceMicrostructurePayload(rawText, cacheMap);
    if (!ticker) {
      try {
        const payload = JSON.parse(rawText);
        const data = payload.data || payload;

        // Suporte a Depth Snapshot / Update (@depth20@100ms ou @depth@100ms)
        if (data && data.bids && data.asks) {
          const sym = String(data.s || (payload.stream ? payload.stream.split("@")[0] : "")).toUpperCase();
          const ts = Number(data.E) || Date.now();
          if (peerPort) {
            try {
              peerPort.postMessage({
                type: "PEER_L2_UPDATE",
                symbol: sym,
                bids: data.bids,
                asks: data.asks,
                timestamp: ts,
              });
            } catch {}
          }
          return;
        }

        if (payload && (payload.code === -1003 || isBinanceRateLimit(payload.code, payload.msg))) {
          const serialized = createSerializedWorkerError(
            payload.msg || "Binance Rate limit reached (-1003)",
            "ALL",
            429
          );
          (self as any).postMessage({ type: "ERROR", error: serialized });
        }
      } catch {}
      return;
    }

    // Despacho direto P2P para o Worker de Renderização WebGL (Zero-Hop)
    if (peerPort) {
      try {
        peerPort.postMessage({
          type: "PEER_TICK",
          ticker,
        });
      } catch {}
    }

    // 1. Grava na fila circular de memória compartilhada (Zero-Copy)
    const wroteAtomic = writeToAtomicQueue(ticker);

    // 2. Se não temos shared buffer (Modo B Transferable), acumula para envio em lote
    if (!wroteAtomic && !sharedBuffer) {
      if (transferCount < TRANSFER_BATCH_SIZE) {
        const offset = transferCount * MICROSTRUCTURE_STRIDE;
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
        transferFloatArray[offset + SLOT_OFFSET_BID_PRICE] = ticker.bidPrice;
        transferFloatArray[offset + SLOT_OFFSET_BID_QTY] = ticker.bidQty;
        transferFloatArray[offset + SLOT_OFFSET_ASK_PRICE] = ticker.askPrice;
        transferFloatArray[offset + SLOT_OFFSET_ASK_QTY] = ticker.askQty;
        transferFloatArray[offset + SLOT_OFFSET_SPREAD_BPS] = ticker.spreadBps;
        transferFloatArray[offset + SLOT_OFFSET_FLAGS] = ticker.flags;
        transferFloatArray[offset + SLOT_OFFSET_UPDATE_ID] = ticker.updateId;
        transferCount++;
      }

      pendingJsonBatch[ticker.symbol] = ticker;
      scheduleBatchFlush();
    }
  }

  function connect() {
    if (subscribedSymbols.length === 0) return;
    if (ws) {
      try { ws.close(); } catch {}
      ws = null;
    }

    // Assina tanto o fluxo ultra-rápido de @bookTicker (<10ms) quanto o @ticker de 24h
    const streamNames: string[] = [];
    subscribedSymbols.forEach((s) => {
      const lower = s.toLowerCase();
      streamNames.push(`${lower}@bookTicker`);
      streamNames.push(`${lower}@ticker`);
    });

    const streamUrl = `wss://stream.binance.com:9443/stream?streams=${streamNames.join("/")}`;

    try {
      ws = new WebSocket(streamUrl);
      ws.onopen = () => {
        reconnectAttempts = 0;
        (self as any).postMessage({ type: "CONNECTED", symbols: subscribedSymbols });
      };
      ws.onmessage = (event) => {
        handleMessage(typeof event.data === "string" ? event.data : "");
      };
      ws.onerror = (event: any) => {
        const isRate = isBinanceRateLimit(undefined, event?.message);
        const err = createSerializedWorkerError(
          event?.message || "WebSocket transport error in ticker worker",
          subscribedSymbols[0] || "ALL",
          isRate ? 429 : undefined
        );
        (self as any).postMessage({ type: "ERROR", error: err });
      };
      ws.onclose = (event) => {
        const isRate = isBinanceRateLimit(event.code, event.reason);
        if (isRate) {
          const err = createSerializedWorkerError(
            event.reason || `Binance Rate limit triggered (code ${event.code})`,
            subscribedSymbols[0] || "ALL",
            429
          );
          (self as any).postMessage({ type: "ERROR", error: err });
        }
        (self as any).postMessage({ type: "DISCONNECTED", reason: event.reason });
        reconnectAttempts++;
        const backoffDelay = Math.min(30000, 1000 * Math.pow(1.5, reconnectAttempts) + Math.random() * 500);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          if (subscribedSymbols.length > 0) connect();
        }, backoffDelay);
      };
    } catch (err: any) {
      const serialized = createSerializedWorkerError(
        err?.message || "Failed to initialize WebSocket in ticker worker",
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
          spscHeader = new Int32Array(sharedBuffer, 0, TOTAL_HEADER_INTS_WORKER);
          spscCapacity = spscHeader[SPSC_CONFIG_CAPACITY_INDEX] || 2048;
          spscMask = spscHeader[SPSC_CONFIG_MASK_INDEX] || (spscCapacity - 1);
          spscStride = spscHeader[SPSC_CONFIG_STRIDE_INDEX] || MICROSTRUCTURE_STRIDE;
          spscData = new Float64Array(sharedBuffer, SPSC_HEADER_BYTES, spscCapacity * spscStride);
        }
        break;
      }

      case "INIT_L2_DEPTH_BUFFER": {
        if (msg.buffer) {
          l2DepthBuffer = msg.buffer;
        }
        break;
      }

      case "SUBSCRIBE": {
        subscribedSymbols = (msg.symbols || []).map((s) => String(s).toUpperCase());
        if (msg.symbolMap) {
          Object.assign(symbolMap, msg.symbolMap);
          const maxVal = Math.max(0, ...Object.values(symbolMap));
          nextSymbolId = maxVal + 1;
        } else {
          subscribedSymbols.forEach((s) => getSymbolId(s));
        }
        connect();
        break;
      }

      case "DISCONNECT": {
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        if (transferTimer) { clearTimeout(transferTimer); transferTimer = null; }
        if (jsonFlushTimer) { clearTimeout(jsonFlushTimer); jsonFlushTimer = null; }
        if (ws) {
          try { ws.close(); } catch {}
          ws = null;
        }
        subscribedSymbols = [];
        (self as any).postMessage({ type: "DISCONNECTED", reason: "Explicit disconnect requested" });
        break;
      }

      case "CONNECT_PEER_PORT": {
        if (msg.port) {
          peerPort = msg.port;
          if (typeof peerPort.start === "function") {
            peerPort.start();
          }
          (self as any).postMessage({ type: "PEER_PORT_CONNECTED" });
        }
        break;
      }

      case "DISPATCH_L2_UPDATE": {
        if (peerPort) {
          try {
            peerPort.postMessage({
              type: "PEER_L2_UPDATE",
              symbol: msg.symbol,
              bids: msg.bids,
              asks: msg.asks,
              timestamp: msg.timestamp || Date.now(),
            });
          } catch {}
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

const TOTAL_HEADER_INTS_WORKER = 48;
