"use client";

import { structuredLogger } from "@/lib/telemetry/structured-logger";

export interface ClockSyncResult {
  synced: boolean;
  serverTime: number;
  clientTime: number;
  driftMs: number;
  roundTripMs: number;
  acceptable: boolean;
}

export interface ReconnectionConfig {
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitterPct?: number;
  maxClockDriftMs?: number;
}

export class ReconnectionManager {
  private attempt = 0;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly factor: number;
  private readonly jitterPct: number;
  readonly maxClockDriftMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    configOrInitialDelay: number | ReconnectionConfig = 1000,
    maxDelayMs = 30000
  ) {
    if (typeof configOrInitialDelay === "object") {
      this.initialDelayMs = configOrInitialDelay.initialDelayMs ?? 1000;
      this.maxDelayMs = configOrInitialDelay.maxDelayMs ?? 30000;
      this.factor = configOrInitialDelay.factor ?? 2.0;
      this.jitterPct = configOrInitialDelay.jitterPct ?? 0.15;
      this.maxClockDriftMs = configOrInitialDelay.maxClockDriftMs ?? 1000;
    } else {
      this.initialDelayMs = configOrInitialDelay;
      this.maxDelayMs = maxDelayMs;
      this.factor = 2.0;
      this.jitterPct = 0.15;
      this.maxClockDriftMs = 1000;
    }
  }

  /**
   * Calcula o próximo intervalo de reconexão aplicando backoff exponencial com jitter (±15%).
   * Δt = min(maxDelay, initialDelay * factor^attempt) * (1 - jitter + Math.random() * (2 * jitter))
   */
  calculateNextDelay(): number {
    const rawDelay = Math.min(this.maxDelayMs, this.initialDelayMs * Math.pow(this.factor, this.attempt));
    const minJitter = 1 - this.jitterPct;
    const maxJitter = 1 + this.jitterPct;
    const jitterFactor = minJitter + Math.random() * (maxJitter - minJitter);
    return Math.round(rawDelay * jitterFactor);
  }

  getNextDelayMs(): number {
    const delay = this.calculateNextDelay();
    this.attempt++;
    return delay;
  }

  /**
   * Agenda a próxima tentativa de reconexão.
   */
  scheduleReconnect(onReconnect: () => void): number {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    const delay = this.calculateNextDelay();
    this.attempt++;

    structuredLogger.warn(
      "BINANCE_API",
      `🔄 [RECONNECT_MGR] Conexão perdida. Tentativa #${this.attempt} agendada para daqui a ${delay}ms.`
    );

    this.timer = setTimeout(() => {
      this.timer = null;
      onReconnect();
    }, delay);

    return delay;
  }

  /**
   * Reseta o contador de tentativas após conexão bem-sucedida.
   */
  reset(): void {
    this.attempt = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  getAttempts(): number {
    return this.attempt;
  }

  getAttemptCount(): number {
    return this.attempt;
  }

  validateClockDrift(serverTime: number): { isAcceptable: boolean; driftMs: number } {
    const driftMs = Math.abs(Date.now() - serverTime);
    return {
      isAcceptable: driftMs <= this.maxClockDriftMs,
      driftMs,
    };
  }

  /**
   * Sincronização obrigatória de relógio (serverTime vs clientTime)
   * antes de reativar o motor de despacho de ordens.
   * Evita o erro fatal 'Timestamp for this request is outside of the recvWindow' (-1021).
   */
  async syncClock(): Promise<ClockSyncResult> {
    const start = Date.now();
    try {
      // Tenta endpoint local de time/health ou direto da Binance
      const res = await fetch("/api/trades?action=serverTime", { cache: "no-store" });
      const roundTripMs = Date.now() - start;

      let serverTime = Date.now();
      if (res.ok) {
        const json = await res.json();
        if (json.serverTime) {
          serverTime = typeof json.serverTime === "number" ? json.serverTime : parseInt(json.serverTime, 10);
        }
      } else {
        // Fallback: consulta timestamp via Date header
        const dateHeader = res.headers.get("Date");
        if (dateHeader) {
          serverTime = new Date(dateHeader).getTime();
        }
      }

      const clientTime = Date.now();
      const estimatedServerTime = serverTime + Math.round(roundTripMs / 2);
      const driftMs = clientTime - estimatedServerTime;
      const acceptable = Math.abs(driftMs) <= 1000;

      if (!acceptable) {
        structuredLogger.critical(
          "BINANCE_API",
          `⚠️ [CLOCK_DRIFT] Desalinhamento severo de relógio detectado! Drift: ${driftMs}ms (>1000ms). Risco de rejeição de ordens pela exchange.`
        );
      } else {
        structuredLogger.info(
          "BINANCE_API",
          `⏱️ [CLOCK_SYNC] Relógio sincronizado com exchange. Drift: ${driftMs}ms (RTT: ${roundTripMs}ms).`
        );
      }

      return {
        synced: true,
        serverTime: estimatedServerTime,
        clientTime,
        driftMs,
        roundTripMs,
        acceptable,
      };
    } catch (err: any) {
      structuredLogger.warn(
        "BINANCE_API",
        `⚠️ [CLOCK_SYNC] Falha ao sincronizar relógio com exchange: ${err?.message || "Timeout"}`
      );
      return {
        synced: false,
        serverTime: Date.now(),
        clientTime: Date.now(),
        driftMs: 0,
        roundTripMs: Date.now() - start,
        acceptable: true,
      };
    }
  }
}

export const reconnectionManager = new ReconnectionManager(1000, 30000);
