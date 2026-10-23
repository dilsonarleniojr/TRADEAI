/**
 * TickCoalescer - Despachante V-Sync de Alta Frequência com Coalescência de Ticks
 * 
 * - Alinha o envio de atualizações ao ciclo de renderização do monitor (requestAnimationFrame)
 * - Coalesce M múltiplos eventos de WebSocket que chegam dentro de um mesmo frame em 1 único despacho
 * - Previne frame drops e gargalos no Event Loop da Main Thread
 */

export interface CoalescedTickerDelta {
  symbol: string;
  price: number;
  priceChange?: number;
  priceChangePercent?: number;
  high?: number;
  low?: number;
  volume?: number;
  quoteVolume?: number;
  timestamp?: number;
}

export interface CoalescerMetrics {
  totalUpdatesReceived: number;
  totalFlushesExecuted: number;
  coalescedUpdatesCount: number;
  coalescingEfficiencyPct: number;
  fps: number;
  lastFrameDurationMs: number;
}

export type FlushCallback = (batch: Map<string, CoalescedTickerDelta>) => void;

export class TickCoalescer {
  private pendingUpdates = new Map<string, CoalescedTickerDelta>();
  private rafId: number | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private callback: FlushCallback;
  
  // Métricas
  private updatesReceived = 0;
  private flushesExecuted = 0;
  private lastFlushTime = 0;
  private frameDurations: number[] = [];
  private readonly maxMetricSamples = 60;

  constructor(onFlush: FlushCallback) {
    this.callback = onFlush;
  }

  /**
   * Enfileira uma atualização de ticker.
   * Se já houver uma atualização pendente para o par no frame atual, sobrescreve com os dados mais recentes (coalescência O(1)).
   */
  enqueue(delta: CoalescedTickerDelta): void {
    this.updatesReceived++;
    this.pendingUpdates.set(delta.symbol.toUpperCase(), delta);

    if (this.rafId === null && this.timeoutId === null) {
      this.scheduleFlush();
    }
  }

  /**
   * Agenda a liberação de dados no próximo frame de renderização (V-Sync).
   */
  private scheduleFlush(): void {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      this.rafId = window.requestAnimationFrame((frameTime) => {
        this.rafId = null;
        this.flush(frameTime);
      });
    } else {
      // Fallback para Node/Bun/SSR ou Web Worker
      this.timeoutId = setTimeout(() => {
        this.timeoutId = null;
        this.flush(Date.now());
      }, 16); // ~60fps
    }
  }

  /**
   * Executa a emissão atômica do lote consolidado para a UI.
   */
  flush(now: number = Date.now()): void {
    if (this.pendingUpdates.size === 0) return;

    const start = typeof performance !== "undefined" ? performance.now() : Date.now();

    // Copia o lote atual e limpa o buffer pendente
    const batchToDispatch = new Map(this.pendingUpdates);
    this.pendingUpdates.clear();

    try {
      this.callback(batchToDispatch);
    } catch (err) {
      console.error("[TickCoalescer] Erro ao despachar lote de ticks:", err);
    }

    this.flushesExecuted++;
    const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;

    if (this.lastFlushTime > 0) {
      const deltaFrame = now - this.lastFlushTime;
      if (deltaFrame > 0) {
        this.frameDurations.push(deltaFrame);
        if (this.frameDurations.length > this.maxMetricSamples) {
          this.frameDurations.shift();
        }
      }
    }
    this.lastFlushTime = now;
  }

  /**
   * Retorna métricas analíticas de eficiência e fluidez do motor.
   */
  getMetrics(): CoalescerMetrics {
    const coalesced = Math.max(0, this.updatesReceived - this.flushesExecuted);
    const efficiency = this.updatesReceived > 0 
      ? (coalesced / this.updatesReceived) * 100 
      : 0;

    const avgDuration = this.frameDurations.length > 0
      ? this.frameDurations.reduce((a, b) => a + b, 0) / this.frameDurations.length
      : 16.6;

    const fps = avgDuration > 0 ? Math.min(144, Math.round(1000 / avgDuration)) : 60;

    return {
      totalUpdatesReceived: this.updatesReceived,
      totalFlushesExecuted: this.flushesExecuted,
      coalescedUpdatesCount: coalesced,
      coalescingEfficiencyPct: parseFloat(efficiency.toFixed(1)),
      fps,
      lastFrameDurationMs: parseFloat(avgDuration.toFixed(2)),
    };
  }

  /**
   * Retorna a quantidade de atualizações únicas pendentes no buffer do frame.
   */
  getPendingCount(): number {
    return this.pendingUpdates.size;
  }

  /**
   * Força a emissão síncrona imediata do lote pendente (usado em testes ou teardown).
   */
  flushNow(): void {
    this.flush();
  }

  /**
   * Limpa buffers pendentes e cancela agendamentos.
   */
  reset(): void {
    if (this.rafId !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.pendingUpdates.clear();
  }

  /**
   * Destrói a instância e cancela recursos alocados.
   */
  destroy(): void {
    this.reset();
  }
}
