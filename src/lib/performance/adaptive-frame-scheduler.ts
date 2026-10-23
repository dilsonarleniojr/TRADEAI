/**
 * AdaptiveFrameScheduler - Agendador Adaptativo de Renderização e Gestão de Frames
 * 
 * - Monitora o estado de foco e visibilidade da janela (document.visibilityState e focus/blur).
 * - Janela em Foco: Opera na taxa nativa máxima do monitor (60/120/144 FPS) com sincronia V-Sync.
 * - Janela em Background/Minimizada: Reduz o ciclo de renderização visual para 1-2 FPS (~500ms),
 *   poupando mais de 90% de GPU/CPU, enquanto os motores de dados, stops e robôs continuam operando a 100%.
 * - Rastreia métricas de Frametime em microssegundos (µs) e Jank Rate (% de frames lentos > 16.6ms).
 */

export interface FrameMetrics {
  fps: number;
  lastFrameDurationUs: number; // Microssegundos (µs)
  avgFrameDurationUs: number;
  jankRatePct: number; // Porcentagem de frames que excederam 16.6ms
  totalFrames: number;
  jankFrames: number;
  isThrottled: boolean;
  visibilityState: "visible" | "hidden" | "blurred";
}

export type RenderCallback = (frameTimestamp: number) => void;

export class AdaptiveFrameScheduler {
  private isDocumentVisible = true;
  private isWindowFocused = true;
  private isThrottled = false;

  private rafId: number | null = null;
  private backgroundIntervalId: ReturnType<typeof setInterval> | null = null;

  private listeners = new Set<RenderCallback>();

  // Métricas de Desempenho
  private totalFrames = 0;
  private jankFrames = 0;
  private lastFrameDurationUs = 0;
  private frameDurationHistoryUs: number[] = [];
  private lastRenderTimestamp = 0;
  private fpsCounter = 0;
  private lastFpsCalcTime = 0;
  private currentFps = 60;

  private isStarted = false;

  constructor() {
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      this.isDocumentVisible = !document.hidden;
      this.isWindowFocused = document.hasFocus ? document.hasFocus() : true;
      this.setupListeners();
    }
  }

  private setupListeners(): void {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    document.addEventListener("visibilitychange", () => {
      this.isDocumentVisible = !document.hidden;
      this.evaluateState();
    });

    window.addEventListener("focus", () => {
      this.isWindowFocused = true;
      this.evaluateState();
    });

    window.addEventListener("blur", () => {
      this.isWindowFocused = false;
      this.evaluateState();
    });
  }

  private evaluateState(): void {
    const shouldThrottle = !this.isDocumentVisible || !this.isWindowFocused;
    if (shouldThrottle !== this.isThrottled) {
      this.isThrottled = shouldThrottle;
      if (this.isStarted) {
        this.restartScheduling();
      }
    }
  }

  /**
   * Adiciona um callback de renderização que será acionado no ritmo adaptativo.
   */
  subscribe(callback: RenderCallback): () => void {
    this.listeners.add(callback);
    if (!this.isStarted) {
      this.start();
    }
    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0) {
        this.stop();
      }
    };
  }

  start(): void {
    if (this.isStarted) return;
    this.isStarted = true;
    this.lastRenderTimestamp = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.lastFpsCalcTime = this.lastRenderTimestamp;
    this.restartScheduling();
  }

  stop(): void {
    this.isStarted = false;
    if (this.rafId !== null) {
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(this.rafId);
      } else {
        clearTimeout(this.rafId);
      }
      this.rafId = null;
    }
    if (this.backgroundIntervalId !== null) {
      clearInterval(this.backgroundIntervalId);
      this.backgroundIntervalId = null;
    }
  }

  private restartScheduling(): void {
    if (this.rafId !== null) {
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(this.rafId);
      } else {
        clearTimeout(this.rafId);
      }
      this.rafId = null;
    }
    if (this.backgroundIntervalId !== null) {
      clearInterval(this.backgroundIntervalId);
      this.backgroundIntervalId = null;
    }

    if (this.isThrottled) {
      // Background / Desfocado: 1 a 2 FPS (intervalo de 600ms)
      this.backgroundIntervalId = setInterval(() => {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        this.executeFrame(now);
      }, 600);
    } else {
      // Janela Ativa em Foco: requestAnimationFrame V-Sync nativo ou fallback setTimeout
      const hasRaf = typeof requestAnimationFrame === "function";
      const loop = (time: number) => {
        if (!this.isStarted || this.isThrottled) return;
        this.executeFrame(time);
        if (hasRaf) {
          this.rafId = requestAnimationFrame(loop);
        } else {
          this.rafId = setTimeout(() => loop(Date.now()), 16) as any;
        }
      };

      if (hasRaf) {
        this.rafId = requestAnimationFrame(loop);
      } else {
        this.rafId = setTimeout(() => loop(Date.now()), 16) as any;
      }
    }
  }

  private executeFrame(frameTime: number): void {
    const startMicros = typeof performance !== "undefined" ? performance.now() * 1000 : Date.now() * 1000;

    // Dispara renderização para todos os inscritos
    for (const cb of this.listeners) {
      try {
        cb(frameTime);
      } catch (err) {
        console.error("[AdaptiveFrameScheduler] Erro no render subscriber:", err);
      }
    }

    const endMicros = typeof performance !== "undefined" ? performance.now() * 1000 : Date.now() * 1000;
    const durationUs = endMicros - startMicros;
    this.lastFrameDurationUs = durationUs;

    // Monitoramento de Jank (> 16.6ms = > 16666 µs)
    this.totalFrames++;
    if (durationUs > 16666) {
      this.jankFrames++;
    }

    this.frameDurationHistoryUs.push(durationUs);
    if (this.frameDurationHistoryUs.length > 60) {
      this.frameDurationHistoryUs.shift();
    }

    // Cálculo de FPS
    this.fpsCounter++;
    if (frameTime - this.lastFpsCalcTime >= 1000) {
      this.currentFps = this.fpsCounter;
      this.fpsCounter = 0;
      this.lastFpsCalcTime = frameTime;
    }
  }

  /**
   * Força uma execução pontual de frame (útil para testes ou atualização manual).
   */
  forceTick(time: number = Date.now()): void {
    this.executeFrame(time);
  }

  /**
   * Retorna telemetria detalhada de estabilidade visual e eficiência.
   */
  getMetrics(): FrameMetrics {
    const sumUs = this.frameDurationHistoryUs.reduce((a, b) => a + b, 0);
    const avgUs = this.frameDurationHistoryUs.length > 0 ? sumUs / this.frameDurationHistoryUs.length : 0;
    const jankPct = this.totalFrames > 0 ? (this.jankFrames / this.totalFrames) * 100 : 0;

    let state: "visible" | "hidden" | "blurred" = "visible";
    if (!this.isDocumentVisible) state = "hidden";
    else if (!this.isWindowFocused) state = "blurred";

    return {
      fps: this.currentFps,
      lastFrameDurationUs: Math.round(this.lastFrameDurationUs),
      avgFrameDurationUs: Math.round(avgUs),
      jankRatePct: parseFloat(jankPct.toFixed(2)),
      totalFrames: this.totalFrames,
      jankFrames: this.jankFrames,
      isThrottled: this.isThrottled,
      visibilityState: state,
    };
  }
}

// Instância singleton global do scheduler
export const globalFrameScheduler = new AdaptiveFrameScheduler();
