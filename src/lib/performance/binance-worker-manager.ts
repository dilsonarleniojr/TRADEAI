import { SharedMemoryAtomicQueue } from "./shared-memory-atomic-queue";
import { LockFreeSPSCQueue } from "./lock-free-spsc-queue";
import { SharedL2DepthMatrix } from "./shared-l2-depth-matrix";
import type {
  NormalizedTicker,
  SerializedWorkerError,
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from "@/workers/binance-stream.worker";

/**
 * Erro Estruturado Tipado para Falhas de Conexão e Violação de Rate Limit (HTTP 429/418)
 */
export class OrderBookFetchError extends Error {
  public readonly statusCode?: number;
  public readonly symbol: string;
  public readonly isRateLimit: boolean;

  constructor(message: string, symbol: string = "ALL", statusCode?: number) {
    super(message);
    this.name = "OrderBookFetchError";
    this.symbol = symbol;
    this.statusCode = statusCode;
    this.isRateLimit = statusCode === 429 || statusCode === 418;
    Object.setPrototypeOf(this, OrderBookFetchError.prototype);
  }
}

export interface WorkerTickerUpdate {
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

export type WorkerBatchCallback = (tickers: WorkerTickerUpdate[]) => void;
export type WorkerErrorCallback = (error: OrderBookFetchError) => void;

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

/**
 * BinanceWorkerManager - Gerenciador Institucional de Web Worker com Concorrência Atômica
 * 
 * - Isola a ingestão de dados da Binance em thread de Web Worker dedicada.
 * - Suporta LockFreeSPSCQueue com 64-byte padding e SharedMemoryAtomicQueue para zero-copy IPC.
 * - Despacha para a UI via drain de alta frequência sem bloquear o loop principal.
 * - Fallback automático para transferência de ArrayBuffer (zero-copy) quando SAB não estiver disponível.
 * - Captura e despacha erros tipados via OrderBookFetchError.
 */
export class BinanceWorkerManager {
  private worker: Worker | null = null;
  private isWorkerActive = false;
  private subscribedSymbols = new Set<string>();
  private onBatchCallback: WorkerBatchCallback | null = null;
  private onErrorCallback: WorkerErrorCallback | null = null;

  // Filas atômicas e matrizes de profundidade L2 em memória compartilhada
  private spscQueue: LockFreeSPSCQueue | null = null;
  private sharedQueue: SharedMemoryAtomicQueue | null = null;
  private l2DepthMatrix: SharedL2DepthMatrix | null = null;
  private useSpsc = true;

  // Dicionário bi-direcional O(1) de mapeamento de símbolos
  private symbolToId: Record<string, number> = {};
  private idToSymbol: Record<number, string> = {};
  private nextSymbolId = 1;

  // Buffer de scratch para leitura de slot sem alocações
  private readonly scratchSlot = new Float64Array(DEFAULT_TICKER_STRIDE);
  private workerBlobUrl: string | null = null;

  constructor(onBatch?: WorkerBatchCallback, onError?: WorkerErrorCallback) {
    if (onBatch) this.onBatchCallback = onBatch;
    if (onError) this.onErrorCallback = onError;

    this.initQueues();
  }

  private initQueues(): void {
    // Inicializa filas atômicas se SharedArrayBuffer for suportado no ambiente
    if (typeof SharedArrayBuffer !== "undefined" && typeof Atomics !== "undefined") {
      try {
        this.spscQueue = LockFreeSPSCQueue.create(4096, DEFAULT_TICKER_STRIDE);
        this.sharedQueue = SharedMemoryAtomicQueue.create({
          capacity: 4096,
          stride: DEFAULT_TICKER_STRIDE,
        });
        this.l2DepthMatrix = SharedL2DepthMatrix.create(1000);
      } catch (err) {
        console.warn("[BinanceWorkerManager] SharedArrayBuffer restrito ou indisponível:", err);
      }
    }
  }

  public setCallback(callback: WorkerBatchCallback): void {
    this.onBatchCallback = callback;
  }

  public setErrorCallback(callback: WorkerErrorCallback): void {
    this.onErrorCallback = callback;
  }

  public getSPSCQueue(): LockFreeSPSCQueue | null {
    return this.spscQueue;
  }

  public getSharedQueue(): SharedMemoryAtomicQueue | null {
    return this.sharedQueue;
  }

  public isUsingSharedMemory(): boolean {
    return this.spscQueue !== null || this.sharedQueue !== null;
  }

  public isUsingWorker(): boolean {
    return this.isWorkerActive;
  }

  public getWorker(): Worker | null {
    return this.worker;
  }

  /**
   * Conecta um MessagePort para comunicação direta peer-to-peer com outro Worker
   * (ex: OffscreenChartController Worker), permitindo transmissão zero-hop sem tocar na Main Thread.
   */
  public connectPeerPort(port: MessagePort): boolean {
    if (!this.worker) {
      this.start();
    }
    if (this.worker && port) {
      try {
        const msg: WorkerInboundMessage = { type: "CONNECT_PEER_PORT", port };
        this.worker.postMessage(msg, [port]);
        return true;
      } catch (err) {
        console.warn("[BinanceWorkerManager] Falha ao despachar MessagePort para o worker:", err);
        return false;
      }
    }
    return false;
  }

  public getL2DepthMatrix(): SharedL2DepthMatrix | null {
    return this.l2DepthMatrix;
  }

  public shareL2DepthWith(renderController: { connectL2DepthMatrix(matrix: SharedL2DepthMatrix): boolean }): boolean {
    if (this.l2DepthMatrix && typeof renderController.connectL2DepthMatrix === "function") {
      return renderController.connectL2DepthMatrix(this.l2DepthMatrix);
    }
    return false;
  }

  /**
   * Compartilha a fila atômica e a matriz de profundidade L2 (SharedArrayBuffer) com o controlador gráfico.
   */
  public shareQueueWith(renderController: {
    connectAtomicQueue(queue: any): boolean;
    connectL2DepthMatrix?(matrix: any): boolean;
  }): boolean {
    let queueShared = false;
    if (this.spscQueue) {
      queueShared = renderController.connectAtomicQueue(this.spscQueue);
    } else if (this.sharedQueue) {
      queueShared = renderController.connectAtomicQueue(this.sharedQueue);
    }
    if (this.l2DepthMatrix && typeof renderController.connectL2DepthMatrix === "function") {
      renderController.connectL2DepthMatrix(this.l2DepthMatrix);
    }
    return queueShared;
  }

  public getSymbolId(sym: string): number {
    const upper = sym.toUpperCase();
    if (this.symbolToId[upper]) return this.symbolToId[upper];
    const id = this.nextSymbolId++;
    this.symbolToId[upper] = id;
    this.idToSymbol[id] = upper;
    return id;
  }

  public getSymbolFromId(id: number): string {
    return this.idToSymbol[id] || "UNKNOWN";
  }

  /**
   * Constrói o script do Worker embutido (Blob) como garantia de execução universal.
   */
  private createInlineWorkerBlobUrl(): string {
    const code = `
      var ws = null;
      var subscribedSymbols = [];
      var symbolMap = {};
      var nextSymbolId = 1;
      var sharedBuffer = null;
      var spscHeader = null;
      var spscData = null;
      var spscCapacity = 0;
      var spscMask = 0;
      var spscStride = 10;
      var queueMode = "SPSC";

      var atomicHeader = null;
      var atomicData = null;
      var atomicCapacity = 0;
      var atomicStride = 10;

      var TRANSFER_BATCH_SIZE = 64;
      var transferFloatArray = new Float64Array(TRANSFER_BATCH_SIZE * 10);
      var transferCount = 0;
      var transferTimer = null;
      var pendingJsonBatch = {};
      var jsonFlushTimer = null;
      var peerPort = null;
      var reconnectAttempts = 0;
      var reconnectTimer = null;

      function getSymbolId(sym) {
        if (symbolMap[sym]) return symbolMap[sym];
        symbolMap[sym] = nextSymbolId++;
        return symbolMap[sym];
      }

      function createError(msg, sym, code) {
        var isRate = code === 429 || code === 418;
        return {
          name: "OrderBookFetchError",
          message: isRate ? "Binance Rate limit exceeded (HTTP " + code + "): " + msg : msg,
          symbol: sym || "ALL",
          statusCode: code,
          isRateLimit: isRate,
          timestamp: Date.now()
        };
      }

      function isRateLimit(code, msg) {
        if (code === 429 || code === 418 || code === 1008 || code === 1013) return true;
        if (msg) {
          var l = String(msg).toLowerCase();
          if (l.indexOf("429") !== -1 || l.indexOf("418") !== -1 || l.indexOf("too many requests") !== -1 || l.indexOf("rate limit") !== -1) {
            return true;
          }
        }
        return false;
      }

      function flushTransferBatch() {
        if (transferCount === 0) return;
        var count = transferCount;
        transferCount = 0;
        var outView = transferFloatArray.slice(0, count * 10);
        self.postMessage({
          type: "TRANSFER_BATCH",
          count: count,
          stride: 10,
          buffer: outView.buffer,
          symbolMap: Object.assign({}, symbolMap)
        }, [outView.buffer]);
        transferFloatArray = new Float64Array(TRANSFER_BATCH_SIZE * 10);
      }

      function flushJsonBatch() {
        var list = [];
        for (var k in pendingJsonBatch) {
          list.push(pendingJsonBatch[k]);
        }
        pendingJsonBatch = {};
        if (list.length > 0) {
          self.postMessage({ type: "BATCH", tickers: list });
        }
      }

      function scheduleBatchFlush() {
        if (!sharedBuffer) {
          if (!transferTimer) {
            transferTimer = setTimeout(function() {
              transferTimer = null;
              flushTransferBatch();
            }, 16);
          }
          if (!jsonFlushTimer) {
            jsonFlushTimer = setTimeout(function() {
              jsonFlushTimer = null;
              flushJsonBatch();
            }, 16);
          }
        }
      }

      function writeToAtomicQueue(sym, p, pc, pcp, h, l, v, q, ts) {
        var symId = getSymbolId(sym);

        if (queueMode === "SPSC" && spscHeader && spscData) {
          var head = Atomics.load(spscHeader, 0);
          var cachedTail = spscHeader[1];
          if (head - cachedTail >= spscCapacity) {
            cachedTail = Atomics.load(spscHeader, 16);
            spscHeader[1] = cachedTail;
            if (head - cachedTail >= spscCapacity) {
              Atomics.add(spscHeader, 2, 1);
              return false;
            }
          }
          var slotIndex = head & spscMask;
          var dataOffset = slotIndex * spscStride;
          spscData[dataOffset + 0] = ts;
          spscData[dataOffset + 1] = symId;
          spscData[dataOffset + 2] = p;
          spscData[dataOffset + 3] = pc;
          spscData[dataOffset + 4] = pcp;
          spscData[dataOffset + 5] = h;
          spscData[dataOffset + 6] = l;
          spscData[dataOffset + 7] = v;
          spscData[dataOffset + 8] = q;
          spscData[dataOffset + 9] = 1;
          Atomics.add(spscHeader, 3, 1);
          Atomics.store(spscHeader, 0, head + 1);
          return true;
        }

        if (queueMode === "ATOMIC" && atomicHeader && atomicData) {
          var aHead = Atomics.load(atomicHeader, 0);
          var aTail = Atomics.load(atomicHeader, 1);
          if (aHead - aTail >= atomicCapacity) {
            Atomics.add(atomicHeader, 4, 1);
            Atomics.add(atomicHeader, 1, 1);
          }
          var aIndex = aHead % atomicCapacity;
          var aOffset = aIndex * atomicStride;
          atomicData[aOffset + 0] = ts;
          atomicData[aOffset + 1] = symId;
          atomicData[aOffset + 2] = p;
          atomicData[aOffset + 3] = pc;
          atomicData[aOffset + 4] = pcp;
          atomicData[aOffset + 5] = h;
          atomicData[aOffset + 6] = l;
          atomicData[aOffset + 7] = v;
          atomicData[aOffset + 8] = q;
          atomicData[aOffset + 9] = 1;
          Atomics.add(atomicHeader, 5, 1);
          Atomics.store(atomicHeader, 0, aHead + 1);
          if (typeof Atomics.notify === "function") {
            try { Atomics.notify(atomicHeader, 0, 1); } catch(e) {}
          }
          return true;
        }
        return false;
      }

      function handleRawMessage(raw) {
        if (!raw) return;
        try {
          var payload = JSON.parse(raw);
          var data = payload.data || payload;
          if (data && data.s && data.c) {
            var sym = String(data.s).toUpperCase();
            var p = parseFloat(data.c) || 0;
            var pc = parseFloat(data.p) || 0;
            var pcp = parseFloat(data.P) || 0;
            var h = parseFloat(data.h || data.c) || p;
            var l = parseFloat(data.l || data.c) || p;
            var v = parseFloat(data.v) || 0;
            var q = parseFloat(data.q) || 0;
            var ts = parseFloat(data.E) || Date.now();

            var wrote = writeToAtomicQueue(sym, p, pc, pcp, h, l, v, q, ts);

            if (peerPort) {
              try {
                peerPort.postMessage({
                  type: "PEER_TICK",
                  ticker: {
                    symbol: sym,
                    price: p,
                    priceChange: pc,
                    priceChangePercent: pcp,
                    high: h,
                    low: l,
                    volume: v,
                    quoteVolume: q,
                    timestamp: ts
                  }
                });
              } catch(e) {}
            }

            if (!wrote && !sharedBuffer) {
              if (transferCount < TRANSFER_BATCH_SIZE) {
                var off = transferCount * 10;
                var symId = getSymbolId(sym);
                transferFloatArray[off + 0] = ts;
                transferFloatArray[off + 1] = symId;
                transferFloatArray[off + 2] = p;
                transferFloatArray[off + 3] = pc;
                transferFloatArray[off + 4] = pcp;
                transferFloatArray[off + 5] = h;
                transferFloatArray[off + 6] = l;
                transferFloatArray[off + 7] = v;
                transferFloatArray[off + 8] = q;
                transferFloatArray[off + 9] = 1;
                transferCount++;
              }
              pendingJsonBatch[sym] = {
                symbol: sym,
                price: p,
                priceChange: pc,
                priceChangePercent: pcp,
                high: h,
                low: l,
                volume: v,
                quoteVolume: q,
                timestamp: ts
              };
              scheduleBatchFlush();
            }
          } else if (payload.code === -1003 || isRateLimit(payload.code, payload.msg)) {
            self.postMessage({
              type: "ERROR",
              error: createError(payload.msg || "Rate limit reached", "ALL", 429)
            });
          }
        } catch(e) {}
      }

      function connect() {
        if (subscribedSymbols.length === 0) return;
        if (ws) {
          try { ws.close(); } catch(e) {}
          ws = null;
        }

        var streams = subscribedSymbols.map(function(s) {
          return s.toLowerCase() + "@ticker";
        }).join("/");
        var url = "wss://stream.binance.com:9443/stream?streams=" + streams;

        try {
          ws = new WebSocket(url);
          ws.onopen = function() {
            reconnectAttempts = 0;
            self.postMessage({ type: "CONNECTED", symbols: subscribedSymbols });
          };
          ws.onmessage = function(evt) {
            handleRawMessage(evt.data);
          };
          ws.onerror = function(evt) {
            var isRate = isRateLimit(undefined, evt ? evt.message : "");
            self.postMessage({
              type: "ERROR",
              error: createError(evt && evt.message ? evt.message : "WebSocket transport error in worker", subscribedSymbols[0] || "ALL", isRate ? 429 : undefined)
            });
          };
          ws.onclose = function(evt) {
            var isRate = isRateLimit(evt.code, evt.reason);
            if (isRate) {
              self.postMessage({
                type: "ERROR",
                error: createError(evt.reason || "Rate limit triggered (code " + evt.code + ")", subscribedSymbols[0] || "ALL", 429)
              });
            }
            self.postMessage({ type: "DISCONNECTED", reason: evt.reason });
            reconnectAttempts++;
            var delay = Math.min(30000, 1000 * Math.pow(1.5, reconnectAttempts) + Math.random() * 500);
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(function() {
              if (subscribedSymbols.length > 0) connect();
            }, delay);
          };
        } catch(err) {
          self.postMessage({
            type: "ERROR",
            error: createError(err && err.message ? err.message : "Failed to open WebSocket in worker", subscribedSymbols[0] || "ALL", undefined)
          });
        }
      }

      self.onmessage = function(evt) {
        var msg = evt.data;
        if (!msg) return;

        if (msg.type === "INIT_SHARED_BUFFER") {
          if (msg.buffer) {
            sharedBuffer = msg.buffer;
            queueMode = msg.queueType || "SPSC";
            if (queueMode === "SPSC") {
              spscHeader = new Int32Array(sharedBuffer, 0, 48);
              spscCapacity = spscHeader[32] || 2048;
              spscMask = spscHeader[33] || (spscCapacity - 1);
              spscStride = spscHeader[34] || 10;
              spscData = new Float64Array(sharedBuffer, 192, spscCapacity * spscStride);
            } else {
              atomicHeader = new Int32Array(sharedBuffer, 0, 16);
              atomicCapacity = atomicHeader[2] || 2048;
              atomicStride = atomicHeader[3] || 10;
              atomicData = new Float64Array(sharedBuffer, 64, atomicCapacity * atomicStride);
            }
          }
        } else if (msg.type === "SUBSCRIBE") {
          subscribedSymbols = (msg.symbols || []).map(function(s) { return String(s).toUpperCase(); });
          if (msg.symbolMap) {
            symbolMap = Object.assign({}, msg.symbolMap);
            var maxVal = 0;
            for (var k in symbolMap) {
              if (symbolMap[k] > maxVal) maxVal = symbolMap[k];
            }
            nextSymbolId = maxVal + 1;
          } else {
            for (var i = 0; i < subscribedSymbols.length; i++) {
              getSymbolId(subscribedSymbols[i]);
            }
          }
          connect();
        } else if (msg.type === "DISCONNECT") {
          if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
          if (transferTimer) { clearTimeout(transferTimer); transferTimer = null; }
          if (jsonFlushTimer) { clearTimeout(jsonFlushTimer); jsonFlushTimer = null; }
          if (ws) {
            try { ws.close(); } catch(e) {}
            ws = null;
          }
          subscribedSymbols = [];
          self.postMessage({ type: "DISCONNECTED", reason: "Explicit disconnect requested" });
        } else if (msg.type === "CONNECT_PEER_PORT") {
          if (msg.port) {
            peerPort = msg.port;
            if (typeof peerPort.start === "function") {
              peerPort.start();
            }
            self.postMessage({ type: "PEER_PORT_CONNECTED" });
          }
        } else if (msg.type === "PING") {
          self.postMessage({ type: "PONG", timestamp: Date.now() });
        }
      };
    `;
    const blob = new Blob([code], { type: "application/javascript" });
    return URL.createObjectURL(blob);
  }

  /**
   * Inicializa o worker em segundo plano.
   */
  public start(): boolean {
    if (typeof window === "undefined" && typeof Worker === "undefined") {
      this.isWorkerActive = false;
      return false;
    }

    try {
      // 1. Tenta inicializar via arquivo de worker dedicado (Next.js bundler chunk)
      let workerInstance: Worker | null = null;
      try {
        if (typeof import.meta !== "undefined" && import.meta.url) {
          workerInstance = new Worker(
            new URL("../../workers/binance-stream.worker.ts", import.meta.url)
          );
        }
      } catch {
        workerInstance = null;
      }

      // 2. Se falhar ou indisponível, usa o Blob URL embutido (independente de bundler)
      if (!workerInstance && typeof Blob !== "undefined" && typeof URL !== "undefined") {
        this.workerBlobUrl = this.createInlineWorkerBlobUrl();
        workerInstance = new Worker(this.workerBlobUrl);
      }

      if (!workerInstance) {
        this.isWorkerActive = false;
        return false;
      }

      this.worker = workerInstance;

      // Se temos fila SPSC compartilhada, envia para o worker
      if (this.spscQueue) {
        const initMsg: WorkerInboundMessage = {
          type: "INIT_SHARED_BUFFER",
          buffer: this.spscQueue.getRawBuffer() as SharedArrayBuffer,
          queueType: "SPSC",
        };
        this.worker.postMessage(initMsg);
      } else if (this.sharedQueue) {
        const initMsg: WorkerInboundMessage = {
          type: "INIT_SHARED_BUFFER",
          buffer: this.sharedQueue.getRawBuffer() as SharedArrayBuffer,
          queueType: "ATOMIC",
        };
        this.worker.postMessage(initMsg);
      }

      // Se temos matriz colunar de profundidade L2 (SharedArrayBuffer), envia para o worker
      if (this.l2DepthMatrix) {
        const depthMsg: WorkerInboundMessage = {
          type: "INIT_L2_DEPTH_BUFFER",
          buffer: this.l2DepthMatrix.getRawBuffer(),
          maxLevels: this.l2DepthMatrix.getMaxLevels(),
        };
        this.worker.postMessage(depthMsg);
      }

      this.worker.onmessage = (event: MessageEvent<WorkerOutboundMessage>) => {
        this.handleWorkerMessage(event.data);
      };

      this.worker.onerror = (err) => {
        const errorObj = new OrderBookFetchError(
          err instanceof ErrorEvent ? err.message : "Worker execution error",
          "ALL",
          undefined
        );
        if (this.onErrorCallback) {
          this.onErrorCallback(errorObj);
        }
      };

      this.isWorkerActive = true;
      return true;
    } catch (err: any) {
      console.warn("[BinanceWorkerManager] Não foi possível iniciar Web Worker:", err?.message);
      this.isWorkerActive = false;
      return false;
    }
  }

  /**
   * Processa mensagens vindas do worker (fallback e eventos de controle).
   */
  public handleWorkerMessage(msg: WorkerOutboundMessage): void {
    if (!msg) return;

    switch (msg.type) {
      case "ERROR": {
        const error = new OrderBookFetchError(
          msg.error.message,
          msg.error.symbol,
          msg.error.statusCode
        );
        if (this.onErrorCallback) {
          this.onErrorCallback(error);
        }
        break;
      }

      case "TRANSFER_BATCH": {
        // Modo B: Transferable ArrayBuffer recebido com zero-copy
        const stride = msg.stride || DEFAULT_TICKER_STRIDE;
        const count = msg.count;
        const floatView = new Float64Array(msg.buffer);
        const tickers: WorkerTickerUpdate[] = [];

        // Atualiza tabela de símbolos recebida
        if (msg.symbolMap) {
          for (const [sym, id] of Object.entries(msg.symbolMap)) {
            this.symbolToId[sym] = id;
            this.idToSymbol[id] = sym;
          }
        }

        for (let i = 0; i < count; i++) {
          const off = i * stride;
          const symId = floatView[off + SLOT_OFFSET_SYMBOL_ID];
          const sym = this.getSymbolFromId(symId);
          tickers.push({
            symbol: sym,
            price: floatView[off + SLOT_OFFSET_PRICE],
            priceChange: floatView[off + SLOT_OFFSET_PRICE_CHANGE],
            priceChangePercent: floatView[off + SLOT_OFFSET_PRICE_CHANGE_PCT],
            high: floatView[off + SLOT_OFFSET_HIGH],
            low: floatView[off + SLOT_OFFSET_LOW],
            volume: floatView[off + SLOT_OFFSET_VOLUME],
            quoteVolume: floatView[off + SLOT_OFFSET_QUOTE_VOLUME],
            timestamp: floatView[off + SLOT_OFFSET_TIMESTAMP],
          });
        }

        if (tickers.length > 0 && this.onBatchCallback) {
          this.onBatchCallback(tickers);
        }
        break;
      }

      case "BATCH": {
        // Modo C: Fallback estruturado
        if (Array.isArray(msg.tickers) && msg.tickers.length > 0 && this.onBatchCallback) {
          this.onBatchCallback(msg.tickers);
        }
        break;
      }

      case "CONNECTED": {
        // Reconexão / conexão confirmada
        break;
      }

      case "DISCONNECTED": {
        // Desconexão informada
        break;
      }
    }
  }

  /**
   * Assina uma lista de pares de negociação e sincroniza a tabela de IDs.
   */
  public subscribe(symbols: string[]): void {
    const valid = symbols.filter(Boolean).map((s) => s.toUpperCase());
    this.subscribedSymbols = new Set(valid);

    // Registra símbolos na tabela local
    valid.forEach((sym) => this.getSymbolId(sym));

    if (this.isWorkerActive && this.worker) {
      const msg: WorkerInboundMessage = {
        type: "SUBSCRIBE",
        symbols: Array.from(this.subscribedSymbols),
        symbolMap: { ...this.symbolToId },
      };
      this.worker.postMessage(msg);
    }
  }

  /**
   * Drena itens diretamente da fila de memória atômica compartilhada (Zero-Copy)
   * sem bloquear o Event Loop principal. Chamado a cada V-Sync / frame tick da UI.
   */
  public drainQueue(callback: (ticker: WorkerTickerUpdate) => void, maxItems: number = 256): number {
    let drainedCount = 0;

    // 1. Drenagem da LockFreeSPSCQueue (se disponível)
    if (this.spscQueue) {
      drainedCount = this.spscQueue.drain(
        maxItems,
        (slot) => {
          const symId = slot[SLOT_OFFSET_SYMBOL_ID];
          const sym = this.getSymbolFromId(symId);
          callback({
            symbol: sym,
            price: slot[SLOT_OFFSET_PRICE],
            priceChange: slot[SLOT_OFFSET_PRICE_CHANGE],
            priceChangePercent: slot[SLOT_OFFSET_PRICE_CHANGE_PCT],
            high: slot[SLOT_OFFSET_HIGH],
            low: slot[SLOT_OFFSET_LOW],
            volume: slot[SLOT_OFFSET_VOLUME],
            quoteVolume: slot[SLOT_OFFSET_QUOTE_VOLUME],
            timestamp: slot[SLOT_OFFSET_TIMESTAMP],
          });
        },
        this.scratchSlot
      );
      return drainedCount;
    }

    // 2. Drenagem da SharedMemoryAtomicQueue (se disponível)
    if (this.sharedQueue) {
      drainedCount = this.sharedQueue.drain(
        maxItems,
        (slot) => {
          const symId = slot[SLOT_OFFSET_SYMBOL_ID];
          const sym = this.getSymbolFromId(symId);
          callback({
            symbol: sym,
            price: slot[SLOT_OFFSET_PRICE],
            priceChange: slot[SLOT_OFFSET_PRICE_CHANGE],
            priceChangePercent: slot[SLOT_OFFSET_PRICE_CHANGE_PCT],
            high: slot[SLOT_OFFSET_HIGH],
            low: slot[SLOT_OFFSET_LOW],
            volume: slot[SLOT_OFFSET_VOLUME],
            quoteVolume: slot[SLOT_OFFSET_QUOTE_VOLUME],
            timestamp: slot[SLOT_OFFSET_TIMESTAMP],
          });
        },
        this.scratchSlot
      );
      return drainedCount;
    }

    return 0;
  }

  /**
   * Simula a recepção de um tick diretamente na fila atômica (útil para testes unitários e headless).
   */
  public simulateTick(ticker: NormalizedTicker): boolean {
    const symId = this.getSymbolId(ticker.symbol);
    const slot = this.scratchSlot;
    slot[SLOT_OFFSET_TIMESTAMP] = ticker.timestamp;
    slot[SLOT_OFFSET_SYMBOL_ID] = symId;
    slot[SLOT_OFFSET_PRICE] = ticker.price;
    slot[SLOT_OFFSET_PRICE_CHANGE] = ticker.priceChange;
    slot[SLOT_OFFSET_PRICE_CHANGE_PCT] = ticker.priceChangePercent;
    slot[SLOT_OFFSET_HIGH] = ticker.high;
    slot[SLOT_OFFSET_LOW] = ticker.low;
    slot[SLOT_OFFSET_VOLUME] = ticker.volume;
    slot[SLOT_OFFSET_QUOTE_VOLUME] = ticker.quoteVolume;
    slot[SLOT_OFFSET_FLAGS] = 1;

    if (this.spscQueue) {
      return this.spscQueue.push(slot);
    }
    if (this.sharedQueue) {
      return this.sharedQueue.enqueue(slot);
    }

    // Fallback: callback direto
    if (this.onBatchCallback) {
      this.onBatchCallback([ticker]);
      return true;
    }
    return false;
  }

  /**
   * Simula a ocorrência de erro ou rate limit para testes unitários.
   */
  public simulateError(message: string, symbol: string = "ALL", statusCode?: number): void {
    const error = new OrderBookFetchError(message, symbol, statusCode);
    if (this.onErrorCallback) {
      this.onErrorCallback(error);
    }
  }

  /**
   * Encerra conexões, mata o worker e purga todas as filas e buffers.
   */
  public destroy(): void {
    if (this.worker) {
      try {
        this.worker.postMessage({ type: "DISCONNECT" });
        this.worker.terminate();
      } catch {}
      this.worker = null;
    }

    if (this.workerBlobUrl) {
      try {
        URL.revokeObjectURL(this.workerBlobUrl);
      } catch {}
      this.workerBlobUrl = null;
    }

    this.subscribedSymbols.clear();
    this.symbolToId = {};
    this.idToSymbol = {};
    this.nextSymbolId = 1;
    this.onBatchCallback = null;
    this.onErrorCallback = null;
    this.l2DepthMatrix = null;
    this.isWorkerActive = false;
  }
}
