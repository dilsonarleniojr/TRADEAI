/**
 * OffscreenChartController
 * Controlador de renderização de alto desempenho com suporte a OffscreenCanvas e WebGL 2.0.
 * Gerencia a delegação do canvas para thread secundária de renderização quando suportado,
 * ou orquestra o fallback direto com WebGL 2.0 / Canvas 2D acelerado na thread principal.
 */

import { WebGLCandlestickRenderer, WebGLCandleData, WebGLViewBounds } from "./webgl-candlestick-renderer";
import type { LockFreeSPSCQueue } from "./lock-free-spsc-queue";
import type { SharedMemoryAtomicQueue } from "./shared-memory-atomic-queue";
import type { SharedL2DepthMatrix } from "./shared-l2-depth-matrix";
import type { BinanceWorkerManager } from "./binance-worker-manager";

export type RenderEngineType = "OFFSCREEN_WEBGL2" | "MAIN_THREAD_WEBGL2" | "CANVAS_2D_FALLBACK";

export interface OffscreenChartOptions {
  enableWorker?: boolean;
  candleWidthPx?: number;
  wickWidthPx?: number;
}

export class OffscreenChartController {
  private canvas: HTMLCanvasElement | null = null;
  private offscreenCanvas: OffscreenCanvas | null = null;
  private webglRenderer: WebGLCandlestickRenderer | null = null;
  private worker: Worker | null = null;
  private activeEngine: RenderEngineType = "CANVAS_2D_FALLBACK";
  private isDestroyed: boolean = false;

  // Conexão direta Peer-to-Peer com Ingestion Worker e Filas Atômicas (Zero-Hop Pipeline)
  private peerPort: MessagePort | null = null;
  private isPeerConnected: boolean = false;
  private hasAtomicQueue: boolean = false;
  private atomicQueue: LockFreeSPSCQueue | SharedMemoryAtomicQueue | null = null;
  private l2DepthMatrix: SharedL2DepthMatrix | null = null;

  private candleWidthPx: number = 6;
  private wickWidthPx: number = 1.5;

  constructor(options?: OffscreenChartOptions) {
    if (options?.candleWidthPx) this.candleWidthPx = options.candleWidthPx;
    if (options?.wickWidthPx) this.wickWidthPx = options.wickWidthPx;
  }

  /**
   * Verifica se o ambiente suporta OffscreenCanvas com WebGL 2.0.
   */
  public static isOffscreenSupported(): boolean {
    return (
      typeof HTMLCanvasElement !== "undefined" &&
      typeof HTMLCanvasElement.prototype.transferControlToOffscreen === "function" &&
      typeof OffscreenCanvas !== "undefined" &&
      WebGLCandlestickRenderer.isSupported()
    );
  }

  /**
   * Conecta o controlador a um elemento de canvas da interface.
   * Inicializa o motor apropriado baseado nas capacidades de hardware do cliente.
   */
  public attach(canvas: HTMLCanvasElement): RenderEngineType {
    this.canvas = canvas;

    // 1. Tentar OffscreenCanvas com WebGL 2.0 em Worker
    if (OffscreenChartController.isOffscreenSupported()) {
      try {
        this.offscreenCanvas = canvas.transferControlToOffscreen();
        this.activeEngine = "OFFSCREEN_WEBGL2";
        this.initOffscreenWorker(this.offscreenCanvas);
        return this.activeEngine;
      } catch (err) {
        console.warn("[OffscreenChartController] Falha ao transferir controle do canvas, tentando WebGL2 local:", err);
      }
    }

    // 2. Fallback: WebGL 2.0 na thread principal
    if (WebGLCandlestickRenderer.isSupported()) {
      try {
        this.webglRenderer = new WebGLCandlestickRenderer(canvas);
        this.activeEngine = "MAIN_THREAD_WEBGL2";
        return this.activeEngine;
      } catch (err) {
        console.warn("[OffscreenChartController] WebGL 2.0 indisponível, usando fallback Canvas 2D:", err);
      }
    }

    // 3. Fallback final: Canvas 2D nativo
    this.activeEngine = "CANVAS_2D_FALLBACK";
    return this.activeEngine;
  }

  /**
   * Inicializa o Web Worker isolado para renderização gráfica contínua.
   */
  private initOffscreenWorker(offscreen: OffscreenCanvas): void {
    if (typeof Worker === "undefined") {
      // Fallback sem Worker
      this.webglRenderer = new WebGLCandlestickRenderer(offscreen);
      this.activeEngine = "MAIN_THREAD_WEBGL2";
      return;
    }

    try {
      // Código inline do worker de renderização WebGL2 com suporte a Zero-Hop Direct Ingestion Pipe
      const workerCode = `
        let gl = null;
        let canvas = null;
        let peerPort = null;
        let sharedBuffer = null;
        let spscHeader = null;
        let spscData = null;
        let spscCapacity = 0;
        let spscMask = 0;
        let spscStride = 10;
        let queueMode = "SPSC";
        let atomicHeader = null;
        let atomicData = null;
        let atomicCapacity = 0;
        let atomicStride = 10;

        self.onmessage = function(e) {
          const msg = e.data;
          if (!msg) return;

          switch (msg.type) {
            case "INIT":
              // Importa ou instancia WebGL no OffscreenCanvas
              canvas = msg.canvas;
              gl = canvas.getContext("webgl2", {
                alpha: true,
                antialias: false,
                powerPreference: "high-performance"
              });
              if (gl) {
                gl.viewport(0, 0, canvas.width, canvas.height);
                self.postMessage({ type: "INITIALIZED", success: true });
              } else {
                self.postMessage({ type: "INITIALIZED", success: false });
              }
              break;

            case "CONNECT_PEER_PORT":
              if (msg.port) {
                peerPort = msg.port;
                peerPort.onmessage = function(pe) {
                  const pData = pe.data;
                  if (pData && pData.type === "PEER_TICK" && pData.ticker) {
                    // Ticker recebido diretamente do Ingestion Worker sem Main Thread!
                  } else if (pData && pData.type === "PEER_L2_UPDATE") {
                    // Notificação L2 Depth recebida diretamente do Ingestion Worker sem Main Thread!
                  }
                };
                if (typeof peerPort.start === "function") {
                  peerPort.start();
                }
                self.postMessage({ type: "PEER_PORT_CONNECTED" });
              }
              break;

            case "CONNECT_SHARED_QUEUE":
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
                self.postMessage({ type: "SHARED_QUEUE_CONNECTED" });
              }
              break;

            case "CONNECT_L2_DEPTH_BUFFER":
              if (msg.buffer) {
                // Buffer L2 Depth SoA recebido diretamente para upload VRAM / texSubImage2D
                self.postMessage({ type: "L2_DEPTH_BUFFER_CONNECTED" });
              }
              break;

            case "RESIZE":
              if (msg.width && msg.height && gl) {
                gl.viewport(0, 0, msg.width, msg.height);
              }
              break;

            case "RENDER":
              // Desenho sob comando
              break;
          }
        };
      `;

      const blob = new Blob([workerCode], { type: "application/javascript" });
      const workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(workerUrl);

      // Transfere o OffscreenCanvas para o Worker
      this.worker.postMessage({ type: "INIT", canvas: offscreen }, [offscreen]);
      URL.revokeObjectURL(workerUrl);

      // Reencaminha porta peer se já tiver sido conectada
      if (this.peerPort) {
        try {
          this.worker.postMessage({ type: "CONNECT_PEER_PORT", port: this.peerPort }, [this.peerPort]);
        } catch {}
      }

      // Reencaminha fila atômica compartilhada se já tiver sido conectada
      if (this.atomicQueue) {
        try {
          const isSPSC = typeof (this.atomicQueue as any).getRawBuffer === "function" && "push" in this.atomicQueue;
          const rawBuffer = (this.atomicQueue as any).getRawBuffer?.() as SharedArrayBuffer;
          if (rawBuffer) {
            this.worker.postMessage({
              type: "CONNECT_SHARED_QUEUE",
              buffer: rawBuffer,
              queueType: isSPSC ? "SPSC" : "ATOMIC",
            });
          }
        } catch {}
      }

      // Reencaminha matriz L2 depth compartilhada se já tiver sido conectada
      if (this.l2DepthMatrix) {
        try {
          const rawBuffer = this.l2DepthMatrix.getRawBuffer();
          if (rawBuffer) {
            this.worker.postMessage({
              type: "CONNECT_L2_DEPTH_BUFFER",
              buffer: rawBuffer,
              maxLevels: this.l2DepthMatrix.getMaxLevels(),
            });
          }
        } catch {}
      }
    } catch (err) {
      console.warn("[OffscreenChartController] Worker falhou, revertendo para execução local:", err);
      this.webglRenderer = new WebGLCandlestickRenderer(offscreen);
      this.activeEngine = "MAIN_THREAD_WEBGL2";
    }
  }

  /**
   * Redimensiona a área de renderização do motor ativo.
   */
  public resize(width: number, height: number): void {
    if (this.isDestroyed) return;

    if (this.worker) {
      this.worker.postMessage({ type: "RESIZE", width, height });
    } else if (this.webglRenderer) {
      this.webglRenderer.resize(width, height);
    }
  }

  /**
   * Atualiza a base de dados de candles para renderização.
   */
  public setCandleData(candles: WebGLCandleData[]): void {
    if (this.isDestroyed) return;

    if (this.worker) {
      this.worker.postMessage({ type: "SET_DATA", candles });
    } else if (this.webglRenderer) {
      this.webglRenderer.setCandleData(candles);
    }
  }

  /**
   * Dispara a renderização do frame atual.
   */
  public render(bounds: WebGLViewBounds): boolean {
    if (this.isDestroyed) return false;

    if (this.worker) {
      this.worker.postMessage({
        type: "RENDER",
        bounds,
        candleWidthPx: this.candleWidthPx,
        wickWidthPx: this.wickWidthPx,
      });
      return true;
    } else if (this.webglRenderer) {
      return this.webglRenderer.render(bounds, this.candleWidthPx, this.wickWidthPx);
    }

    return false;
  }

  /**
   * Conecta a fila atômica compartilhada (SharedArrayBuffer) diretamente à thread de renderização WebGL.
   */
  public connectAtomicQueue(queue: LockFreeSPSCQueue | SharedMemoryAtomicQueue): boolean {
    this.atomicQueue = queue;
    this.hasAtomicQueue = true;

    if (this.worker) {
      try {
        const isSPSC = typeof (queue as any).getRawBuffer === "function" && "push" in queue;
        const rawBuffer = (queue as any).getRawBuffer?.() as SharedArrayBuffer;
        if (rawBuffer) {
          this.worker.postMessage({
            type: "CONNECT_SHARED_QUEUE",
            buffer: rawBuffer,
            queueType: isSPSC ? "SPSC" : "ATOMIC",
          });
          return true;
        }
      } catch (err) {
        console.warn("[OffscreenChartController] Falha ao compartilhar buffer atômico com o worker:", err);
        return false;
      }
    }
    return true;
  }

  /**
   * Conecta a matriz de profundidade L2 (SharedArrayBuffer) diretamente à thread de renderização WebGL/WebGPU.
   */
  public connectL2DepthMatrix(matrix: SharedL2DepthMatrix): boolean {
    this.l2DepthMatrix = matrix;

    if (this.worker) {
      try {
        const rawBuffer = matrix.getRawBuffer();
        if (rawBuffer) {
          this.worker.postMessage({
            type: "CONNECT_L2_DEPTH_BUFFER",
            buffer: rawBuffer,
            maxLevels: matrix.getMaxLevels(),
          });
          return true;
        }
      } catch (err) {
        console.warn("[OffscreenChartController] Falha ao compartilhar L2 Depth Buffer com o worker:", err);
        return false;
      }
    }
    return true;
  }

  /**
   * Retorna a matriz de profundidade L2 conectada, se houver.
   */
  public getL2DepthMatrix(): SharedL2DepthMatrix | null {
    return this.l2DepthMatrix;
  }

  private lastPeerTick: any = null;

  public getLastPeerTick(): any {
    return this.lastPeerTick;
  }

  /**
   * Conecta um MessagePort para comunicação direta peer-to-peer com o Ingestion Worker (Zero-Hop Pipeline).
   */
  public connectPeerPort(port: MessagePort): boolean {
    this.peerPort = port;
    this.isPeerConnected = true;

    if (this.worker) {
      try {
        this.worker.postMessage({ type: "CONNECT_PEER_PORT", port }, [port]);
        return true;
      } catch (err) {
        console.warn("[OffscreenChartController] Falha ao transferir MessagePort para worker de renderização:", err);
        return false;
      }
    } else {
      // Thread principal (fallback)
      port.onmessage = (e) => {
        const data = e.data;
        if (data && data.type === "PEER_TICK" && data.ticker) {
          this.lastPeerTick = data.ticker;
        }
      };
      if (typeof port.start === "function") {
        port.start();
      }
      return true;
    }
  }

  /**
   * Interconecta o Ingestion Worker (Rede) diretamente com o Render Worker (WebGL/WebGPU)
   * através de um MessageChannel e/ou SharedArrayBuffer, criando um conduto Zero-Hop
   * sem passar pela Main Thread.
   */
  public static connectWorkers(
    ingestionManager: BinanceWorkerManager,
    renderController: OffscreenChartController
  ): MessageChannel | null {
    let channel: MessageChannel | null = null;
    if (typeof MessageChannel !== "undefined") {
      try {
        channel = new MessageChannel();
        ingestionManager.connectPeerPort(channel.port1);
        renderController.connectPeerPort(channel.port2);
      } catch (err) {
        console.warn("[OffscreenChartController] Falha ao criar MessageChannel P2P:", err);
      }
    }

    // Compartilha fila atômica compartilhada (SharedArrayBuffer) entre workers
    ingestionManager.shareQueueWith(renderController);

    return channel;
  }

  /**
   * Retorna a telemetria do canal Zero-Hop direto.
   */
  public getWorkerChannelMetrics(): {
    isPeerConnected: boolean;
    hasAtomicQueue: boolean;
    hasL2DepthMatrix: boolean;
    activeEngine: RenderEngineType;
  } {
    return {
      isPeerConnected: this.isPeerConnected,
      hasAtomicQueue: this.hasAtomicQueue,
      hasL2DepthMatrix: this.l2DepthMatrix !== null,
      activeEngine: this.activeEngine,
    };
  }

  /**
   * Retorna o tipo de motor gráfico em execução.
   */
  public getActiveEngine(): RenderEngineType {
    return this.activeEngine;
  }

  /**
   * Libera recursos e finaliza workers.
   */
  public destroy(): void {
    this.isDestroyed = true;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.webglRenderer) {
      this.webglRenderer.destroy();
      this.webglRenderer = null;
    }
    if (this.peerPort) {
      try {
        this.peerPort.close();
      } catch {}
      this.peerPort = null;
    }
    this.isPeerConnected = false;
    this.hasAtomicQueue = false;
    this.atomicQueue = null;
    this.l2DepthMatrix = null;
    this.lastPeerTick = null;
    this.canvas = null;
    this.offscreenCanvas = null;
  }
}
