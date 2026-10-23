import { SharedMemoryAtomicQueue } from "./shared-memory-atomic-queue";

/**
 * BinanceWorkerManager - Gerenciador de WebSocket em Background Worker Dedicado
 * 
 * - Isola a ingestão de dados da Binance em uma thread de Web Worker dedicada.
 * - Desacopla 100% da pressão de deserialização e parsing de rede da Main Thread (UI).
 * - Suporta SharedMemoryAtomicQueue com Atomics para streaming zero-copy e sub-microssegundo.
 * - Despacha para a interface lotes consolidados de tickers em intervalos de V-Sync (~16ms).
 * - Fallback transparente quando Web Workers não estão disponíveis (ex: SSR, Bun, Node).
 */

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

export class BinanceWorkerManager {
  private worker: Worker | null = null;
  private isWorkerActive = false;
  private subscribedSymbols = new Set<string>();
  private onBatchCallback: WorkerBatchCallback | null = null;
  private fallbackWs: WebSocket | null = null;
  private sharedQueue: SharedMemoryAtomicQueue | null = null;

  constructor(onBatch?: WorkerBatchCallback) {
    if (onBatch) {
      this.onBatchCallback = onBatch;
    }
    // Inicializa fila de memória compartilhada atômica se houver suporte
    if (SharedMemoryAtomicQueue.isSupported()) {
      try {
        this.sharedQueue = SharedMemoryAtomicQueue.create({ capacity: 4096, stride: 8 });
      } catch (err) {
        console.warn("[BinanceWorkerManager] SharedArrayBuffer indisponível:", err);
      }
    }
  }

  setCallback(callback: WorkerBatchCallback): void {
    this.onBatchCallback = callback;
  }

  getSharedQueue(): SharedMemoryAtomicQueue | null {
    return this.sharedQueue;
  }

  /**
   * Inicializa o worker em segundo plano a partir de um Blob script embutido.
   */
  start(): boolean {
    if (typeof window === "undefined" || typeof Worker === "undefined") {
      return false; // Fallback para main thread
    }

    try {
      const workerCode = `
        var ws = null;
        var symbols = [];
        var pendingBatch = {};
        var flushTimer = null;
        var sharedQueueBuffer = null;
        var sharedHeader = null;
        var sharedData = null;

        function flush() {
          var list = [];
          for (var k in pendingBatch) {
            list.push(pendingBatch[k]);
          }
          pendingBatch = {};
          if (list.length > 0) {
            self.postMessage({ type: "BATCH", tickers: list });
          }
        }

        function scheduleFlush() {
          if (!flushTimer) {
            flushTimer = setTimeout(function() {
              flushTimer = null;
              flush();
            }, 16); // Batch a cada ~16ms (60fps)
          }
        }

        function connect() {
          if (symbols.length === 0) return;
          if (ws) {
            try { ws.close(); } catch(e) {}
          }

          var streams = symbols.map(function(s) {
            return s.toLowerCase() + "@ticker";
          }).join("/");

          var url = "wss://stream.binance.com:9443/stream?streams=" + streams;
          ws = new WebSocket(url);

          ws.onmessage = function(event) {
            var raw = event.data;
            if (!raw) return;
            try {
              var payload = JSON.parse(raw);
              var data = payload.data || payload;
              if (data && data.s && data.c) {
                var sym = data.s.toUpperCase();
                var p = parseFloat(data.c);
                var pc = parseFloat(data.p || 0);
                var pcp = parseFloat(data.P || 0);
                var h = parseFloat(data.h || data.c);
                var l = parseFloat(data.l || data.c);
                var v = parseFloat(data.v || 0);
                var q = parseFloat(data.q || 0);
                var ts = data.E || Date.now();

                // 1. Se shared queue estiver ativa, grava diretamente via Atomics (zero-alloc)
                if (sharedHeader && sharedData) {
                  try {
                    var head = Atomics.load(sharedHeader, 0); // HEADER_INDEX_HEAD
                    var cap = sharedHeader[2]; // HEADER_INDEX_CAPACITY
                    var stride = sharedHeader[3]; // HEADER_INDEX_STRIDE
                    var slotOffset = (head % cap) * stride;

                    sharedData[slotOffset + 0] = ts;
                    sharedData[slotOffset + 1] = p;
                    sharedData[slotOffset + 2] = pc;
                    sharedData[slotOffset + 3] = pcp;
                    sharedData[slotOffset + 4] = h;
                    sharedData[slotOffset + 5] = l;
                    sharedData[slotOffset + 6] = v;
                    sharedData[slotOffset + 7] = q;

                    Atomics.add(sharedHeader, 5, 1); // HEADER_INDEX_WRITE_SEQ
                    Atomics.store(sharedHeader, 0, head + 1); // HEADER_INDEX_HEAD
                    if (typeof Atomics.notify === "function") {
                      Atomics.notify(sharedHeader, 0, 1);
                    }
                  } catch(e) {}
                }

                // 2. Mantém batch postMessage para compatibilidade
                pendingBatch[sym] = {
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
                scheduleFlush();
              }
            } catch(err) {}
          };

          ws.onclose = function() {
            setTimeout(connect, 3000);
          };
        }

        self.onmessage = function(e) {
          var msg = e.data;
          if (!msg) return;

          if (msg.type === "INIT_SHARED_BUFFER") {
            if (msg.buffer) {
              sharedQueueBuffer = msg.buffer;
              sharedHeader = new Int32Array(sharedQueueBuffer, 0, 16);
              var cap = sharedHeader[2];
              var stride = sharedHeader[3];
              sharedData = new Float64Array(sharedQueueBuffer, 64, cap * stride);
            }
          } else if (msg.type === "SUBSCRIBE") {
            symbols = msg.symbols || [];
            connect();
          } else if (msg.type === "DISCONNECT") {
            if (ws) {
              try { ws.close(); } catch(e) {}
              ws = null;
            }
          }
        };
      `;

      const blob = new Blob([workerCode], { type: "application/javascript" });
      const workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(workerUrl);

      // Se temos sharedQueue, envia a referência do SharedArrayBuffer
      if (this.sharedQueue) {
        this.worker.postMessage({
          type: "INIT_SHARED_BUFFER",
          buffer: this.sharedQueue.getRawBuffer(),
        });
      }

      this.worker.onmessage = (event) => {
        const msg = event.data;
        if (msg && msg.type === "BATCH" && Array.isArray(msg.tickers)) {
          if (this.onBatchCallback) {
            this.onBatchCallback(msg.tickers);
          }
        }
      };

      this.worker.onerror = (err) => {
        console.warn("[BinanceWorkerManager] Erro no Web Worker:", err);
      };

      this.isWorkerActive = true;
      return true;
    } catch (err) {
      console.warn("[BinanceWorkerManager] Não foi possível iniciar Web Worker, usando fallback:", err);
      this.isWorkerActive = false;
      return false;
    }
  }

  /**
   * Assina uma lista de pares de negociação.
   */
  subscribe(symbols: string[]): void {
    const valid = symbols.filter(Boolean).map((s) => s.toUpperCase());
    this.subscribedSymbols = new Set(valid);

    if (this.isWorkerActive && this.worker) {
      this.worker.postMessage({
        type: "SUBSCRIBE",
        symbols: Array.from(this.subscribedSymbols),
      });
    }
  }

  /**
   * Encerra conexões e destrói o worker.
   */
  destroy(): void {
    if (this.worker) {
      this.worker.postMessage({ type: "DISCONNECT" });
      this.worker.terminate();
      this.worker = null;
    }
    if (this.fallbackWs) {
      try {
        this.fallbackWs.close();
      } catch {}
      this.fallbackWs = null;
    }
    this.isWorkerActive = false;
  }

  isUsingWorker(): boolean {
    return this.isWorkerActive;
  }
}
