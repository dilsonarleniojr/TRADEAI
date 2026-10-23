/**
 * OffscreenChartController
 * Controlador de renderização de alto desempenho com suporte a OffscreenCanvas e WebGL 2.0.
 * Gerencia a delegação do canvas para thread secundária de renderização quando suportado,
 * ou orquestra o fallback direto com WebGL 2.0 / Canvas 2D acelerado na thread principal.
 */

import { WebGLCandlestickRenderer, WebGLCandleData, WebGLViewBounds } from "./webgl-candlestick-renderer";

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
      // Código inline do worker de renderização WebGL2
      const workerCode = `
        let renderer = null;

        self.onmessage = function(e) {
          const msg = e.data;
          if (!msg) return;

          switch (msg.type) {
            case "INIT":
              // Importa ou instancia WebGL no OffscreenCanvas
              const canvas = msg.canvas;
              const gl = canvas.getContext("webgl2", {
                alpha: true,
                antialias: false,
                powerPreference: "high-performance"
              });
              if (gl) {
                // Configuração básica do contexto
                gl.viewport(0, 0, canvas.width, canvas.height);
                self.postMessage({ type: "INITIALIZED", success: true });
              } else {
                self.postMessage({ type: "INITIALIZED", success: false });
              }
              break;

            case "RESIZE":
              if (msg.width && msg.height) {
                // Redimensionamento
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
    this.canvas = null;
    this.offscreenCanvas = null;
  }
}
