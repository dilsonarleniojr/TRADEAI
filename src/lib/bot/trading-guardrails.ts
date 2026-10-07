/**
 * TradeAI Autonomous Trading Guardrails & Risk Governance Engine
 * Implements strict pre-trade rules:
 * 1. Data Freshness Gate (Stale Data Protection)
 * 2. Embedded Risk Limits (Fat-Finger & Capital Allocation Collar)
 * 3. Clear-Box Signal Explainability (Quantitative triggers vs Qualitative sentiment)
 * 4. Autonomous Rate Limit Manager (Anti-Ban & Exponential Backoff)
 * 5. Native Dry Run Simulator (Zero-risk execution pipeline)
 */

export type TradingHorizon = "SCALP" | "DAY_TRADE" | "SWING";

export const FRESHNESS_LIMITS_MS: Record<TradingHorizon, number> = {
  SCALP: 1000,       // 1 segundo
  DAY_TRADE: 30000,  // 30 segundos
  SWING: 300000,     // 5 minutos
};

export interface FreshnessValidationResult {
  valid: boolean;
  ageMs: number;
  maxAllowedMs: number;
  timestamp: number;
  error?: string;
}

/**
 * 1. Validação Estrita de Temporalidade (Data Freshness)
 * Rejeita qualquer cotação cujo timestamp exceda a janela de tolerância da estratégia.
 */
export function validateDataFreshness(
  dataTimestamp: number | Date | string | undefined,
  horizon: TradingHorizon = "DAY_TRADE",
  customMaxAgeMs?: number
): FreshnessValidationResult {
  if (!dataTimestamp) {
    return {
      valid: false,
      ageMs: Infinity,
      maxAllowedMs: customMaxAgeMs ?? FRESHNESS_LIMITS_MS[horizon],
      timestamp: 0,
      error: "Timestamp ausente ou nulo na cotação.",
    };
  }

  const numericTs = typeof dataTimestamp === "number"
    ? dataTimestamp
    : new Date(dataTimestamp).getTime();

  if (isNaN(numericTs) || numericTs <= 0) {
    return {
      valid: false,
      ageMs: Infinity,
      maxAllowedMs: customMaxAgeMs ?? FRESHNESS_LIMITS_MS[horizon],
      timestamp: 0,
      error: "Timestamp inválido ou corrompido.",
    };
  }

  const now = Date.now();
  const ageMs = Math.max(0, now - numericTs);
  const maxAllowedMs = customMaxAgeMs ?? FRESHNESS_LIMITS_MS[horizon];

  if (ageMs > maxAllowedMs) {
    return {
      valid: false,
      ageMs,
      maxAllowedMs,
      timestamp: numericTs,
      error: `[STALE_DATA_VETO] Cotação defasada em ${ageMs}ms (limite para ${horizon}: ${maxAllowedMs}ms). Execução abortada por segurança.`,
    };
  }

  return {
    valid: true,
    ageMs,
    maxAllowedMs,
    timestamp: numericTs,
  };
}

export interface RiskLimitParams {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  stopLossPrice?: number;
  portfolioTotalValueUsdt: number;
  maxPositionPct?: number; // Padrão: 5.0%
  maxSlPct?: number;       // Padrão: 2.0%
  leverage?: number;       // Padrão: 1.0 (Spot)
}

export interface RiskValidationResult {
  allowed: boolean;
  errors: string[];
  metrics: {
    orderValueUsdt: number;
    positionPctOfNav: number;
    stopLossPct?: number;
    leverage: number;
  };
}

/**
 * 2. Guardrails de Risco Embutidos (Risk Limits)
 * Verifica tamanho de posição (max 5% NAV), stop-loss obrigatório (<= 2%),
 * alavancagem e validação contra NaN ou floats malformados.
 */
export function validateRiskLimits(params: RiskLimitParams): RiskValidationResult {
  const errors: string[] = [];
  const maxPositionPct = params.maxPositionPct ?? 5.0;
  const maxSlPct = params.maxSlPct ?? 2.0;
  const leverage = params.leverage ?? 1.0;

  // Sanitização numérica
  if (!Number.isFinite(params.quantity) || params.quantity <= 0) {
    errors.push(`Quantidade inválida: ${params.quantity}. Deve ser número estritamente positivo.`);
  }
  if (!Number.isFinite(params.price) || params.price <= 0) {
    errors.push(`Preço da ordem inválido: ${params.price}. Deve ser número estritamente positivo.`);
  }
  if (!Number.isFinite(params.portfolioTotalValueUsdt) || params.portfolioTotalValueUsdt <= 0) {
    errors.push("Valor patrimonial (NAV) inválido ou zero.");
  }

  const orderValueUsdt = (params.quantity || 0) * (params.price || 0);
  const positionPctOfNav = params.portfolioTotalValueUsdt > 0
    ? (orderValueUsdt / params.portfolioTotalValueUsdt) * 100
    : 100;

  // Verificação de Exposição Máxima
  if (positionPctOfNav > maxPositionPct) {
    errors.push(
      `[POSITION_CAP_BREACH] Exposição calculada de ${positionPctOfNav.toFixed(2)}% ultrapassa o teto permitido de ${maxPositionPct.toFixed(2)}% da banca.`
    );
  }

  // Verificação de Stop-Loss Mandatório para Ordens de Entrada
  let calculatedSlPct: number | undefined;
  if (params.side === "BUY") {
    if (!params.stopLossPrice || !Number.isFinite(params.stopLossPrice) || params.stopLossPrice <= 0) {
      errors.push("[MISSING_STOP_LOSS] Ordem de compra sem Stop-Loss definido. Stop-loss obrigatório de até 2.0%.");
    } else if (params.stopLossPrice >= params.price) {
      errors.push(`Stop-Loss (${params.stopLossPrice}) deve ser inferior ao preço de compra (${params.price}).`);
    } else {
      calculatedSlPct = ((params.price - params.stopLossPrice) / params.price) * 100;
      if (calculatedSlPct > maxSlPct) {
        errors.push(
          `[STOP_LOSS_EXCEEDED] Stop-loss projetado em ${calculatedSlPct.toFixed(2)}% excede o teto permitido de ${maxSlPct.toFixed(2)}%.`
        );
      }
    }
  }

  // Alavancagem Spot Check
  if (leverage > 1.0) {
    errors.push(`Alavancagem de ${leverage}x detectada. Mercado configurado para Spot restrito (máximo 1x).`);
  }

  return {
    allowed: errors.length === 0,
    errors,
    metrics: {
      orderValueUsdt,
      positionPctOfNav,
      stopLossPct: calculatedSlPct,
      leverage,
    },
  };
}

export interface QuantitativeTrigger {
  name: string;
  indicator: string;
  period: string | number;
  currentValue: number | string;
  thresholdOrCross: string;
  triggered: boolean;
}

export interface ClearBoxSignalReport {
  symbol: string;
  decision: "BUY" | "SELL" | "HOLD";
  confidencePct: number;
  timestamp: number;
  quantitativeTriggers: QuantitativeTrigger[];
  sentimentContext?: {
    sentimentScore: number; // -1.0 a +1.0
    newsCount: number;
    headlinesSummary: string;
  };
  committeeBreakdown?: {
    trendVote: string;
    momentumVote: string;
    orderFlowVote: string;
  };
  summaryText: string;
}

/**
 * 3. Explicabilidade de Sinais Matemáticos (Clear-Box Strategy)
 * Separa explicitamente os gatilhos quantitativos matemáticos da análise qualitativa.
 */
export function buildClearBoxSignalReport(
  symbol: string,
  decision: "BUY" | "SELL" | "HOLD",
  confidencePct: number,
  triggers: QuantitativeTrigger[],
  sentiment?: { sentimentScore: number; newsCount: number; headlinesSummary: string },
  committee?: { trendVote: string; momentumVote: string; orderFlowVote: string }
): ClearBoxSignalReport {
  const triggeredMath = triggers.filter((t) => t.triggered);
  const mathNarrative = triggeredMath.length > 0
    ? triggeredMath.map((t) => `${t.name} (${t.period}): valor ${t.currentValue} acionou ${t.thresholdOrCross}`).join(" | ")
    : "Nenhum gatilho quantitativo técnico disparou confluência.";

  const sentimentNarrative = sentiment
    ? `Sentimento: ${sentiment.sentimentScore > 0 ? "Positivo" : sentiment.sentimentScore < 0 ? "Negativo" : "Neutro"} (${sentiment.sentimentScore.toFixed(2)} baseado em ${sentiment.newsCount} notícias)`
    : "Sentimento: Sem dados de notícias.";

  const summaryText = `[CLEAR-BOX REPORT] Decisão: ${decision} (${confidencePct}%) | Gatilhos Técnicos: [${mathNarrative}] | Qualitativo: [${sentimentNarrative}]`;

  return {
    symbol,
    decision,
    confidencePct,
    timestamp: Date.now(),
    quantitativeTriggers: triggers,
    sentimentContext: sentiment,
    committeeBreakdown: committee,
    summaryText,
  };
}

/**
 * 4. Gestão Autônoma de Rate Limits (Anti-Ban & Exponential Backoff)
 */
export class AutonomousRateLimiter {
  private static instance: AutonomousRateLimiter;
  private usedWeight1m: number = 0;
  private maxWeightPerMinute: number = 1200; // Padrão Binance Spot IP limit
  private lastResetTime: number = Date.now();
  private consecutive429Errors: number = 0;

  private constructor() {}

  public static getInstance(): AutonomousRateLimiter {
    if (!AutonomousRateLimiter.instance) {
      AutonomousRateLimiter.instance = new AutonomousRateLimiter();
    }
    return AutonomousRateLimiter.instance;
  }

  public recordRequest(weight: number = 1): { canProceed: boolean; currentWeight: number; delayMs: number } {
    this.checkMinuteReset();
    this.usedWeight1m += weight;

    // Se já consumiu mais de 80% da cota por minuto, introduz throttling preventivo
    const capacityRatio = this.usedWeight1m / this.maxWeightPerMinute;
    if (capacityRatio > 0.85) {
      const throttledDelayMs = Math.min(5000, Math.floor((capacityRatio - 0.85) * 20000));
      return {
        canProceed: capacityRatio < 0.95,
        currentWeight: this.usedWeight1m,
        delayMs: throttledDelayMs,
      };
    }

    return {
      canProceed: true,
      currentWeight: this.usedWeight1m,
      delayMs: 0,
    };
  }

  public handleHttp429(retryAfterSeconds?: number): number {
    this.consecutive429Errors++;
    // Exponential backoff com jitter: base 2s * 2^retries + random(500ms)
    const baseBackoff = retryAfterSeconds
      ? retryAfterSeconds * 1000
      : Math.min(60000, Math.pow(2, this.consecutive429Errors) * 2000 + Math.random() * 500);

    return Math.floor(baseBackoff);
  }

  public recordSuccess(): void {
    if (this.consecutive429Errors > 0) {
      this.consecutive429Errors = Math.max(0, this.consecutive429Errors - 1);
    }
  }

  private checkMinuteReset(): void {
    const now = Date.now();
    if (now - this.lastResetTime >= 60000) {
      this.usedWeight1m = 0;
      this.lastResetTime = now;
    }
  }
}

export interface DryRunOrderExecution {
  mode: "dry_run" | "live";
  dispatchPrevented: boolean;
  orderPayload: {
    symbol: string;
    side: "BUY" | "SELL";
    type: "LIMIT" | "MARKET";
    quantity: string;
    price?: string;
    timeInForce?: string;
    timestamp: number;
  };
  estimatedFees: {
    makerFeeUsdt: number;
    takerFeeUsdt: number;
    appliedRatePct: number;
  };
  auditValidation: {
    freshnessPassed: boolean;
    riskPassed: boolean;
    clearBoxReport: ClearBoxSignalReport;
  };
}

/**
 * 5. Execução em "Dry Run" por Padrão (Paper Trading Nativo)
 * Monta o payload JSON completo, valida a formatação, calcula taxas operacionais
 * e interrompe a execução antes do envio via POST.
 */
export function simulateDryRunExecution(
  params: RiskLimitParams,
  freshnessResult: FreshnessValidationResult,
  riskResult: RiskValidationResult,
  clearBoxReport: ClearBoxSignalReport,
  feeRatePct: number = 0.075 // Taxa padrão Binance Spot (0.075% com BNB)
): DryRunOrderExecution {
  const orderValueUsdt = params.quantity * params.price;
  const estimatedFee = (orderValueUsdt * feeRatePct) / 100;

  return {
    mode: "dry_run",
    dispatchPrevented: true,
    orderPayload: {
      symbol: params.symbol,
      side: params.side,
      type: "LIMIT",
      quantity: params.quantity.toFixed(6),
      price: params.price.toFixed(4),
      timeInForce: "GTC",
      timestamp: Date.now(),
    },
    estimatedFees: {
      makerFeeUsdt: Number((estimatedFee * 0.8).toFixed(4)),
      takerFeeUsdt: Number(estimatedFee.toFixed(4)),
      appliedRatePct: feeRatePct,
    },
    auditValidation: {
      freshnessPassed: freshnessResult.valid,
      riskPassed: riskResult.allowed,
      clearBoxReport,
    },
  };
}
