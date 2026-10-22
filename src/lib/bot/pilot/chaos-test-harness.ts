/**
 * TradeAI - Chaos Engineering Test Harness & Graduated Circuit Breaker
 *
 * Módulo de injeção controlada de faltas (Grey Failure, Message Loss, Stale Data)
 * e Circuit Breakers graduados em 3 níveis proporcionais de contenção.
 *
 * Em estrita conformidade com .agents/rules/institutional_platform_standards.md e
 * .agents/skills/chaos-engineering-for-trading-infrastructure/SKILL.md
 */

import type { SpoofingAlert } from "@/lib/order-book-imbalance";

export interface ChaosConfig {
  enabled?: boolean;
  name?: string;
  latencyMs?: number;
  jitterMs?: number;
  dropRate?: number; // 0.0 a 1.0
  seed?: number;
}

export class ChaosInjector {
  private enabled: boolean;
  private name: string;
  private latencyMs: number;
  private jitterMs: number;
  private dropRate: number;
  private seed: number;

  constructor(config: ChaosConfig = {}) {
    this.enabled = config.enabled ?? false;
    this.name = config.name ?? "default-chaos-gateway";
    this.latencyMs = config.latencyMs ?? 0;
    this.jitterMs = config.jitterMs ?? 0;
    this.dropRate = config.dropRate ?? 0;
    this.seed = config.seed ?? 20261017;
  }

  /**
   * Gerador pseudoaleatório determinístico baseado em seed (Linear Congruential Generator)
   */
  private nextRandom(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  /**
   * Envelopa uma chamada de rede ou I/O e injeta falhas se ativado
   */
  public async wrap<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) {
      return fn();
    }

    const rand = this.nextRandom();

    // 1. Injeção de perda de pacotes / corte de conexão
    if (this.dropRate > 0 && rand < this.dropRate) {
      throw new Error(`[ChaosInjector:${this.name}] ConnectionAbortedError: Simulated network drop at I/O boundary`);
    }

    // 2. Injeção de Grey Failure (Latência e Jitter anômalos)
    if (this.latencyMs > 0) {
      const addedDelay = this.latencyMs + Math.floor(this.nextRandom() * this.jitterMs);
      await new Promise((resolve) => setTimeout(resolve, addedDelay));
    }

    return fn();
  }

  /**
   * Injeta defasagem temporal sintética em timestamps para validar o gate de temporalidade
   */
  public injectStaleTimestamp(originalTimestamp: number, delayMs = 35000): number {
    if (!this.enabled) return originalTimestamp;
    return originalTimestamp - delayMs;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }
}

export type CircuitBreakerTier =
  | "NORMAL"
  | "TIER_1_CAUTION"
  | "TIER_2_SUSPEND_NEW_ORDERS"
  | "TIER_3_EMERGENCY_HALT"
  | "TIER_SPOOFING_PAUSE";

export interface CircuitBreakerStatus {
  tier: CircuitBreakerTier;
  positionScale: number; // 1.0 (Normal), 0.5 (Cautela), 0.0 (Suspenso/Pausado)
  canOpenNewOrder: boolean;
  reason: string;
  consecutiveLosses: number;
  dailyLossUsd: number;
  maxDailyDrawdownUsd: number;
}

export class GraduatedCircuitBreaker {
  private static instance: GraduatedCircuitBreaker;

  private consecutiveLosses = 0;
  private dailyLossUsd = 0;
  private lastLossTimestamp = 0;
  private isHalted = false;
  private haltExpiresAt = 0;
  private spoofingAlerts = new Map<string, { alert: SpoofingAlert; expiresAt: number }>();

  public readonly MAX_DAILY_DRAWDOWN_USD = 3.5; // $3.50 USD (5% da banca de $70)
  public readonly CONSECUTIVE_LOSS_SUSPEND_THRESHOLD = 2; // 2 perdas consecutivas acionam Tier 2
  public readonly TIER_2_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutos de suspensão de novas ordens
  public readonly TIER_3_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 horas de hibernação
  public readonly SPOOFING_PAUSE_DURATION_MS = 3000; // 1 ciclo de 3 segundos para reavaliação de liquidez

  private constructor() {}

  public static getInstance(): GraduatedCircuitBreaker {
    if (!GraduatedCircuitBreaker.instance) {
      GraduatedCircuitBreaker.instance = new GraduatedCircuitBreaker();
    }
    return GraduatedCircuitBreaker.instance;
  }

  /**
   * Registra um evento de Liquidity Spoofing detectado no topo do book
   */
  public registerSpoofingAlert(symbol: string, alert: SpoofingAlert): void {
    if (alert && alert.isAlertActive && alert.dropPct >= 30.0) {
      this.spoofingAlerts.set(symbol, {
        alert,
        expiresAt: Date.now() + this.SPOOFING_PAUSE_DURATION_MS,
      });
    }
  }

  /**
   * Verifica se o símbolo está sob pausa defensiva por Liquidity Spoofing
   */
  public isSpoofingHalted(symbol: string): boolean {
    const record = this.spoofingAlerts.get(symbol);
    if (!record) return false;
    if (Date.now() >= record.expiresAt) {
      this.spoofingAlerts.delete(symbol);
      return false;
    }
    return true;
  }

  /**
   * Retorna o alerta de spoofing ativo no momento para o símbolo
   */
  public getSpoofingAlert(symbol: string): SpoofingAlert | null {
    if (!this.isSpoofingHalted(symbol)) return null;
    return this.spoofingAlerts.get(symbol)?.alert ?? null;
  }

  /**
   * Avalia a saúde da infraestrutura e do capital em tempo real
   */
  public evaluateHealth(metrics: {
    latencyMs?: number;
    spreadPct?: number;
    stalenessMs?: number;
    symbol?: string;
    spoofingAlert?: SpoofingAlert | null;
  }): CircuitBreakerStatus {
    const now = Date.now();

    // Se métricas trouxerem alerta de spoofing em tempo real
    if (metrics.symbol && metrics.spoofingAlert) {
      this.registerSpoofingAlert(metrics.symbol, metrics.spoofingAlert);
    }

    // Verifica se expirou o bloqueio de Tier 3 ou Tier 2
    if (this.isHalted && now >= this.haltExpiresAt) {
      this.isHalted = false;
      this.consecutiveLosses = 0;
    }

    // 1. Nível 3: Perda diária acumulada máxima violada (Kill Switch Global)
    if (this.dailyLossUsd >= this.MAX_DAILY_DRAWDOWN_USD || this.isHalted) {
      this.isHalted = true;
      if (this.haltExpiresAt <= now) {
        this.haltExpiresAt = now + this.TIER_3_COOLDOWN_MS;
      }
      return {
        tier: "TIER_3_EMERGENCY_HALT",
        positionScale: 0.0,
        canOpenNewOrder: false,
        reason: `Kill Switch Nível 3 Ativo: Perda diária acumulada de $${this.dailyLossUsd.toFixed(2)} USD atingiu o teto de $${this.MAX_DAILY_DRAWDOWN_USD.toFixed(2)} USD. Sistema em hibernação.`,
        consecutiveLosses: this.consecutiveLosses,
        dailyLossUsd: this.dailyLossUsd,
        maxDailyDrawdownUsd: this.MAX_DAILY_DRAWDOWN_USD,
      };
    }

    // 2. Nível 2: Perdas consecutivas ou anomalias severas de I/O
    const isTier2TimeLocked = this.consecutiveLosses >= this.CONSECUTIVE_LOSS_SUSPEND_THRESHOLD && now - this.lastLossTimestamp < this.TIER_2_COOLDOWN_MS;
    const isSevereLatency = (metrics.latencyMs ?? 0) > 1500;
    const isStaleData = (metrics.stalenessMs ?? 0) > 30000;

    if (isTier2TimeLocked || isSevereLatency || isStaleData) {
      const reason = isTier2TimeLocked
        ? `Freio de Nível 2 Ativo: ${this.consecutiveLosses} perdas consecutivas. Novas ordens suspensas por 15 min.`
        : isSevereLatency
        ? `Degradação Severa de Rede: Latência de ${metrics.latencyMs}ms excede SLA máximo (1500ms).`
        : `Dados Obsoletos: Atraso de ${metrics.stalenessMs}ms viola temporalidade máxima.`;

      return {
        tier: "TIER_2_SUSPEND_NEW_ORDERS",
        positionScale: 0.0,
        canOpenNewOrder: false,
        reason,
        consecutiveLosses: this.consecutiveLosses,
        dailyLossUsd: this.dailyLossUsd,
        maxDailyDrawdownUsd: this.MAX_DAILY_DRAWDOWN_USD,
      };
    }

    // 2.5. Nível Spoofing Pause: Parede cancelada no book recente (pausa 3s de despacho)
    if (metrics.symbol && this.isSpoofingHalted(metrics.symbol)) {
      const activeAlert = this.getSpoofingAlert(metrics.symbol);
      return {
        tier: "TIER_SPOOFING_PAUSE",
        positionScale: 0.0,
        canOpenNewOrder: false,
        reason: `Liquidity Spoofing Guard Ativo: Queda súbita de ${activeAlert?.dropPct ?? 30}% no book de ${activeAlert?.side ?? 'L2'}. Despacho pausado por 1 ciclo (3s) para reavaliação de liquidez.`,
        consecutiveLosses: this.consecutiveLosses,
        dailyLossUsd: this.dailyLossUsd,
        maxDailyDrawdownUsd: this.MAX_DAILY_DRAWDOWN_USD,
      };
    }

    // 3. Nível 1: Cautela (Spread elevado ou latência moderada)
    const isHighSpread = (metrics.spreadPct ?? 0) > 0.0012; // Spread > 0.12%
    const isModerateLatency = (metrics.latencyMs ?? 0) > 800; // Latência > 800ms

    if (isHighSpread || isModerateLatency) {
      return {
        tier: "TIER_1_CAUTION",
        positionScale: 0.5,
        canOpenNewOrder: true,
        reason: `Modo Cautela Nível 1: ${isHighSpread ? `Spread alargado (${((metrics.spreadPct ?? 0) * 100).toFixed(3)}%)` : `Latência elevada (${metrics.latencyMs}ms)`}. Tamanho de lote reduzido em 50%.`,
        consecutiveLosses: this.consecutiveLosses,
        dailyLossUsd: this.dailyLossUsd,
        maxDailyDrawdownUsd: this.MAX_DAILY_DRAWDOWN_USD,
      };
    }

    // 4. Nível 0: Operação Normal
    return {
      tier: "NORMAL",
      positionScale: 1.0,
      canOpenNewOrder: true,
      reason: "Infraestrutura e balanço de risco em estado ótimo (Green).",
      consecutiveLosses: this.consecutiveLosses,
      dailyLossUsd: this.dailyLossUsd,
      maxDailyDrawdownUsd: this.MAX_DAILY_DRAWDOWN_USD,
    };
  }

  public recordTradeOutcome(pnlUsd: number) {
    if (pnlUsd < 0) {
      const loss = Math.abs(pnlUsd);
      this.dailyLossUsd += loss;
      this.consecutiveLosses += 1;
      this.lastLossTimestamp = Date.now();
    } else {
      // Ganho reseta perdas consecutivas
      this.consecutiveLosses = 0;
    }
  }

  public reset() {
    this.consecutiveLosses = 0;
    this.dailyLossUsd = 0;
    this.isHalted = false;
    this.haltExpiresAt = 0;
    this.spoofingAlerts.clear();
  }
}
