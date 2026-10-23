import { PreciseMath } from "./precise-math";

export interface CircuitBreakerState {
  isTripped: boolean;
  tripReason?: string;
  accumulatedDailyPnlUsd: number;
  accumulatedDailyLossUsd: number;
  consecutiveLossCount: number;
  consecutiveLossCooldownUntil?: number;
  hibernationUntil?: number;
  baselineCapitalUsd: number;
  totalTradesRecorded: number;
}

export class PilotRiskCircuitBreaker {
  private static instance: PilotRiskCircuitBreaker;

  // Limites institucionais para banca piloto de $70 USD
  public static readonly DEFAULT_BASELINE_USD = 70.0;
  public static readonly DAILY_DRAWDOWN_LIMIT_PCT = 0.05; // 5.0% ($3.50 USD)
  public static readonly MAX_CONSECUTIVE_LOSSES = 3;
  public static readonly CONSECUTIVE_LOSS_COOLDOWN_MS = 60 * 60 * 1000; // 60 minutos
  public static readonly HIBERNATION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

  private baselineCapitalUsd: number = PilotRiskCircuitBreaker.DEFAULT_BASELINE_USD;
  private accumulatedDailyPnlUsd: number = 0;
  private accumulatedDailyLossUsd: number = 0;
  private consecutiveLossCount: number = 0;
  private consecutiveLossCooldownUntil: number | null = null;
  private hibernationUntil: number | null = null;
  private totalTradesRecorded: number = 0;

  // Flag de reentrância atômica síncrona (elimina microtasks e heap closures de Promises)
  private isProcessing: boolean = false;

  private constructor() {}

  public static getInstance(): PilotRiskCircuitBreaker {
    if (!PilotRiskCircuitBreaker.instance) {
      PilotRiskCircuitBreaker.instance = new PilotRiskCircuitBreaker();
    }
    return PilotRiskCircuitBreaker.instance;
  }

  /**
   * Reseta o estado do Circuit Breaker para a linha de base
   */
  public reset(baselineCapitalUsd = PilotRiskCircuitBreaker.DEFAULT_BASELINE_USD): void {
    this.baselineCapitalUsd = baselineCapitalUsd;
    this.accumulatedDailyPnlUsd = 0;
    this.accumulatedDailyLossUsd = 0;
    this.consecutiveLossCount = 0;
    this.consecutiveLossCooldownUntil = null;
    this.hibernationUntil = null;
    this.totalTradesRecorded = 0;
    this.isProcessing = false;
  }

  /**
   * Registra um trade finalizado de forma estritamente síncrona O(1) e Zero-Allocation.
   */
  public recordTradeSync(pnlUsd: number): { canContinueTrading: boolean; reason?: string } {
    if (this.isProcessing) {
      // Reentrância protegida
      return { canContinueTrading: false, reason: "CONCURRENT_ACCESS_BLOCKED" };
    }
    this.isProcessing = true;
    try {
      this.totalTradesRecorded++;
      this.accumulatedDailyPnlUsd = PreciseMath.add(this.accumulatedDailyPnlUsd, pnlUsd);

      if (pnlUsd < 0) {
        const lossAbs = Math.abs(pnlUsd);
        this.accumulatedDailyLossUsd = PreciseMath.add(this.accumulatedDailyLossUsd, lossAbs);
        this.consecutiveLossCount++;
      } else {
        // Vitória zera o contador de perdas consecutivas
        this.consecutiveLossCount = 0;
      }

      const maxAllowedDailyLoss = PreciseMath.multiply(
        this.baselineCapitalUsd,
        PilotRiskCircuitBreaker.DAILY_DRAWDOWN_LIMIT_PCT
      );

      // 1. Checagem de Trava de Perda Diária Máxima ($3.50 USD para banca de $70 USD)
      if (this.accumulatedDailyLossUsd >= maxAllowedDailyLoss) {
        this.hibernationUntil = Date.now() + PilotRiskCircuitBreaker.HIBERNATION_DURATION_MS;
        const msg = `DAILY_DRAWDOWN_CIRCUIT_BREAKER_TRIPPED: Perda diária acumulada ($${this.accumulatedDailyLossUsd.toFixed(2)} USD) atingiu o limite de 5.0% ($${maxAllowedDailyLoss.toFixed(2)} USD). Ativada hibernação de segurança por 24 horas.`;
        console.error(`[PilotRiskCircuitBreaker] 🛑 ${msg}`);
        return { canContinueTrading: false, reason: msg };
      }

      // 2. Checagem de Freio de Perdas Consecutivas (>= 3 perdas seguidas)
      if (this.consecutiveLossCount >= PilotRiskCircuitBreaker.MAX_CONSECUTIVE_LOSSES) {
        this.consecutiveLossCooldownUntil = Date.now() + PilotRiskCircuitBreaker.CONSECUTIVE_LOSS_COOLDOWN_MS;
        const msg = `CONSECUTIVE_LOSS_BRAKE_TRIPPED: ${this.consecutiveLossCount} perdas consecutivas registradas. Cooldown mandatório ativado por 60 minutos.`;
        console.warn(`[PilotRiskCircuitBreaker] ⚠️ ${msg}`);
        return { canContinueTrading: false, reason: msg };
      }

      return { canContinueTrading: true };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Registra um trade finalizado mantendo compatibilidade assíncrona sem overhead de encadeamento de Promises.
   */
  public async recordTrade(pnlUsd: number): Promise<{ canContinueTrading: boolean; reason?: string }> {
    return this.recordTradeSync(pnlUsd);
  }

  /**
   * Consulta o estado atual e verifica se novas ordens podem ser emitidas
   */
  public canOpenNewOrder(): { allowed: boolean; reason?: string } {
    const now = Date.now();

    // Verifica hibernação de 24h
    if (this.hibernationUntil && now < this.hibernationUntil) {
      const remainingMinutes = Math.ceil((this.hibernationUntil - now) / 60000);
      return {
        allowed: false,
        reason: `HIBERNATION_ACTIVE: Circuit Breaker diário disparado. Hibernação restante: ${remainingMinutes} minutos.`,
      };
    }

    // Verifica cooldown de perdas consecutivas (60 min)
    if (this.consecutiveLossCooldownUntil && now < this.consecutiveLossCooldownUntil) {
      const remainingMinutes = Math.ceil((this.consecutiveLossCooldownUntil - now) / 60000);
      return {
        allowed: false,
        reason: `CONSECUTIVE_LOSS_COOLDOWN_ACTIVE: Freio de perdas consecutivas ativo. Restante: ${remainingMinutes} minutos.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Retorna snapshot completo do estado de risco
   */
  public getState(): CircuitBreakerState {
    const check = this.canOpenNewOrder();
    return {
      isTripped: !check.allowed,
      tripReason: check.reason,
      accumulatedDailyPnlUsd: this.accumulatedDailyPnlUsd,
      accumulatedDailyLossUsd: this.accumulatedDailyLossUsd,
      consecutiveLossCount: this.consecutiveLossCount,
      consecutiveLossCooldownUntil: this.consecutiveLossCooldownUntil || undefined,
      hibernationUntil: this.hibernationUntil || undefined,
      baselineCapitalUsd: this.baselineCapitalUsd,
      totalTradesRecorded: this.totalTradesRecorded,
    };
  }
}
