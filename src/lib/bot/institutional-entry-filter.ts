/**
 * TradeAI Institutional Entry Filter & Capital Preservation Gate
 *
 * Incorpora as regras absolutas do Gestor Quantitativo Institucional:
 * 1. Nunca investir mais de 30% do capital total em uma única operação.
 * 2. Manter pelo menos 70% do capital protegido ou diversificado.
 * 3. Não operar quando não houver vantagem estatística clara.
 * 4. Priorizar preservação de capital acima de lucro.
 * 5. Operar apenas quando múltiplos sinais independentes confirmarem a oportunidade.
 * 6. Exigir relação risco/retorno mínima de 1:4 (>= 4.0).
 * 7. Usar stop loss obrigatório em 100% das operações.
 * 8. Encerrar operações automaticamente quando a tese for invalidada.
 * 9. Evitar ativos com baixa liquidez.
 * 10. Evitar operar durante eventos de alta volatilidade imprevisível.
 *
 * REGRA FINAL: Jamais afirmar que existe lucro garantido.
 */

import { MathematicalExpectancyGate } from "./mathematical-expectancy-gate";

export const MANDATORY_NO_TRADE_MESSAGE =
  "NÃO OPERAR. Preservar capital é mais importante que buscar lucro.";

export const NO_GUARANTEED_PROFIT_DISCLAIMER =
  "Nenhuma operação possui lucro garantido; preservação de capital e gestão estatística de risco têm prioridade absoluta.";

export const INSTITUTIONAL_RULES = {
  MAX_SINGLE_OPERATION_PCT: 30,
  MIN_PROTECTED_CAPITAL_PCT: 70,
  MIN_RISK_REWARD: 4.0,
  MIN_WIN_PROBABILITY_PCT: 70, // Deve ser estritamente > 70%
  MAX_SPREAD_PCT: 0.35,
  MIN_QUOTE_VOLUME_24H_USDT: 3_000_000,
} as const;

export interface InstitutionalEntryInput {
  asset: string;
  side: "BUY" | "SELL";
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2?: number;
  /** Percentual do capital total pretendido para esta operação (0..100) */
  allocatedCapitalPct: number;
  /** Percentual do capital já alocado em outras posições abertas (0..100) */
  currentAllocatedPortfolioPct?: number;
  /** Sinais independentes do Filtro de Entrada */
  trendConfirmed: boolean;
  volumeAboveAverage: boolean;
  favorableMomentum: boolean;
  macroNonContradictory: boolean;
  /** Probabilidade estimada de sucesso (0..100, exigido > 70) */
  estimatedProbabilityPct: number;
  /** Liquidez e regime de volatilidade */
  quoteVolume24hUsdt?: number;
  spreadPct?: number;
  unpredictableVolatilityEvent?: boolean;
  /** Justificativa e cenário de invalidação */
  detailedJustification?: string;
  invalidationScenario?: string;
  isMaker?: boolean;
}

export interface InstitutionalTradeRecommendation {
  asset: string;
  side: "Compra" | "Venda";
  allocatedCapitalPct: number;
  protectedCapitalPct: number;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskRewardRatio: number;
  estimatedProbabilityPct: number;
  expectedValuePercent: number;
  detailedJustification: string;
  invalidationScenario: string;
  disclaimer: string;
}

export interface InstitutionalEntryResult {
  shouldOperate: boolean;
  statusMessage: string;
  failedCriteria: string[];
  riskRewardRatio: number;
  estimatedProbabilityPct: number;
  expectedValuePercent: number;
  recommendation: InstitutionalTradeRecommendation | null;
  disclaimer: string;
}

/**
 * Avalia rigorosamente os critérios do Filtro de Entrada Institucional.
 * Caso qualquer critério não seja atendido, retorna `shouldOperate: false`
 * com `statusMessage` igual a `MANDATORY_NO_TRADE_MESSAGE`.
 */
export function evaluateInstitutionalEntry(
  input: InstitutionalEntryInput
): InstitutionalEntryResult {
  const failedCriteria: string[] = [];

  const {
    asset,
    side,
    entryPrice,
    stopLoss,
    target1,
    target2,
    allocatedCapitalPct,
    currentAllocatedPortfolioPct = 0,
    trendConfirmed,
    volumeAboveAverage,
    favorableMomentum,
    macroNonContradictory,
    estimatedProbabilityPct,
    quoteVolume24hUsdt,
    spreadPct,
    unpredictableVolatilityEvent = false,
    detailedJustification,
    invalidationScenario,
    isMaker = true,
  } = input;

  if (!asset || !asset.trim()) {
    failedCriteria.push("Ativo não informado.");
  }

  const pricesValid =
    Number.isFinite(entryPrice) &&
    entryPrice > 0 &&
    Number.isFinite(stopLoss) &&
    stopLoss > 0 &&
    Number.isFinite(target1) &&
    target1 > 0 &&
    (target2 === undefined || (Number.isFinite(target2) && target2 > 0));

  if (!pricesValid) {
    failedCriteria.push("Preços de entrada, stop loss ou alvo inválidos/ausentes.");
  }

  // Stop loss obrigatório e coerente com a direção
  const slGeometryOk =
    pricesValid &&
    (side === "BUY" ? stopLoss < entryPrice && target1 > entryPrice : stopLoss > entryPrice && target1 < entryPrice);

  if (pricesValid && !slGeometryOk) {
    failedCriteria.push(
      `Geometria inválida de Stop Loss/Alvo para operação de ${side === "BUY" ? "Compra" : "Venda"}.`
    );
  }

  const effectiveFinalTarget =
    target2 !== undefined && Number.isFinite(target2) && target2 > 0 ? target2 : target1;

  const riskDist = slGeometryOk ? Math.abs(entryPrice - stopLoss) : 0;
  const rewardDist = slGeometryOk ? Math.abs(effectiveFinalTarget - entryPrice) : 0;
  const riskRewardRatio =
    riskDist > 0 ? Math.round((rewardDist / riskDist) * 100) / 100 : 0;

  if (riskRewardRatio < INSTITUTIONAL_RULES.MIN_RISK_REWARD) {
    failedCriteria.push(
      `Relação risco/retorno (${riskRewardRatio.toFixed(2)}:1) abaixo do mínimo institucional de 1:4.`
    );
  }

  // Capital alocado <= 30% por operação e >= 70% protegido
  if (!Number.isFinite(allocatedCapitalPct) || allocatedCapitalPct <= 0) {
    failedCriteria.push("Percentual de capital alocado inválido.");
  } else if (allocatedCapitalPct > INSTITUTIONAL_RULES.MAX_SINGLE_OPERATION_PCT) {
    failedCriteria.push(
      `Alocação de ${allocatedCapitalPct.toFixed(2)}% excede o teto máximo de ${INSTITUTIONAL_RULES.MAX_SINGLE_OPERATION_PCT}% em uma única operação.`
    );
  }

  const projectedPortfolioAllocation =
    Math.max(0, currentAllocatedPortfolioPct) + Math.max(0, allocatedCapitalPct);
  const protectedCapitalPct = Math.max(0, 100 - projectedPortfolioAllocation);

  if (protectedCapitalPct < INSTITUTIONAL_RULES.MIN_PROTECTED_CAPITAL_PCT) {
    failedCriteria.push(
      `Capital protegido cairia para ${protectedCapitalPct.toFixed(2)}% (mínimo obrigatório: ${INSTITUTIONAL_RULES.MIN_PROTECTED_CAPITAL_PCT}%).`
    );
  }

  // Filtro de Entrada: múltiplos sinais independentes
  if (!trendConfirmed) {
    failedCriteria.push("Tendência principal não confirmada.");
  }
  if (!volumeAboveAverage) {
    failedCriteria.push("Volume não está acima da média.");
  }
  if (!favorableMomentum) {
    failedCriteria.push("Momentum não favorável.");
  }
  if (!macroNonContradictory) {
    failedCriteria.push("Contexto macroeconômico contraditório ou indefinido.");
  }

  // Probabilidade estritamente > 70%
  if (
    !Number.isFinite(estimatedProbabilityPct) ||
    estimatedProbabilityPct <= INSTITUTIONAL_RULES.MIN_WIN_PROBABILITY_PCT
  ) {
    failedCriteria.push(
      `Probabilidade estimada (${Number.isFinite(estimatedProbabilityPct) ? estimatedProbabilityPct.toFixed(1) : 0}%) deve ser superior a 70%.`
    );
  }

  // Liquidez e volatilidade imprevisível
  if (
    quoteVolume24hUsdt !== undefined &&
    (!Number.isFinite(quoteVolume24hUsdt) ||
      quoteVolume24hUsdt < INSTITUTIONAL_RULES.MIN_QUOTE_VOLUME_24H_USDT)
  ) {
    failedCriteria.push(
      `Baixa liquidez (volume 24h abaixo de $${(INSTITUTIONAL_RULES.MIN_QUOTE_VOLUME_24H_USDT / 1e6).toFixed(1)}M USDT).`
    );
  }

  if (
    spreadPct !== undefined &&
    (!Number.isFinite(spreadPct) || spreadPct > INSTITUTIONAL_RULES.MAX_SPREAD_PCT)
  ) {
    failedCriteria.push(
      `Spread relativo (${spreadPct.toFixed(3)}%) excede o limite de ${INSTITUTIONAL_RULES.MAX_SPREAD_PCT}%.`
    );
  }

  if (unpredictableVolatilityEvent) {
    failedCriteria.push("Evento de alta volatilidade imprevisível em andamento.");
  }

  // Expectativa Matemática líquida de taxas e slippage
  const slPct = slGeometryOk ? (riskDist / entryPrice) * 100 : 2.0;
  const tpPct = slGeometryOk ? (rewardDist / entryPrice) * 100 : 0;
  const evEval = MathematicalExpectancyGate.evaluate({
    winProbability: Math.max(0.01, Math.min(0.99, (estimatedProbabilityPct || 0) / 100)),
    projectedTpPercent: Math.max(0.1, tpPct),
    projectedSlPercent: Math.max(0.1, slPct),
    isMaker,
  });

  if (evEval.expectedValuePercent < MathematicalExpectancyGate.MIN_EXPECTED_VALUE_PCT) {
    failedCriteria.push(
      `Vantagem estatística insuficiente (EV líquido: +${evEval.expectedValuePercent.toFixed(2)}%).`
    );
  }

  if (failedCriteria.length > 0) {
    return {
      shouldOperate: false,
      statusMessage: MANDATORY_NO_TRADE_MESSAGE,
      failedCriteria,
      riskRewardRatio,
      estimatedProbabilityPct: Number.isFinite(estimatedProbabilityPct) ? estimatedProbabilityPct : 0,
      expectedValuePercent: evEval.expectedValuePercent,
      recommendation: null,
      disclaimer: NO_GUARANTEED_PROFIT_DISCLAIMER,
    };
  }

  return {
    shouldOperate: true,
    statusMessage: "OPERAR",
    failedCriteria: [],
    riskRewardRatio,
    estimatedProbabilityPct,
    expectedValuePercent: evEval.expectedValuePercent,
    recommendation: {
      asset: asset.toUpperCase(),
      side: side === "BUY" ? "Compra" : "Venda",
      allocatedCapitalPct: Number(allocatedCapitalPct.toFixed(2)),
      protectedCapitalPct: Number(protectedCapitalPct.toFixed(2)),
      entryPrice,
      stopLoss,
      target1,
      target2: effectiveFinalTarget,
      riskRewardRatio,
      estimatedProbabilityPct: Number(estimatedProbabilityPct.toFixed(1)),
      expectedValuePercent: evEval.expectedValuePercent,
      detailedJustification:
        detailedJustification?.trim() ||
        `Confluência institucional confirmada: tendência principal, volume acima da média, momentum favorável e contexto macro alinhado (EV líquido +${evEval.expectedValuePercent.toFixed(2)}%).`,
      invalidationScenario:
        invalidationScenario?.trim() ||
        `Encerramento automático se o preço romper o Stop Loss em $${stopLoss} ou se tendência/volume/momentum perderem alinhamento.`,
      disclaimer: NO_GUARANTEED_PROFIT_DISCLAIMER,
    },
    disclaimer: NO_GUARANTEED_PROFIT_DISCLAIMER,
  };
}

export interface ThesisInvalidationParams {
  side: "BUY" | "SELL";
  currentPrice: number;
  stopLoss: number;
  trendStillConfirmed: boolean;
  momentumStillFavorable: boolean;
  macroStillNonContradictory?: boolean;
}

/**
 * Regra 8: Encerrar operações automaticamente quando a tese for invalidada.
 */
export function checkThesisInvalidation(params: ThesisInvalidationParams): {
  invalidated: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const {
    side,
    currentPrice,
    stopLoss,
    trendStillConfirmed,
    momentumStillFavorable,
    macroStillNonContradictory = true,
  } = params;

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    reasons.push("Preço atual inválido para manutenção de tese.");
  } else if (side === "BUY" && currentPrice <= stopLoss) {
    reasons.push(`Stop loss atingido (${currentPrice} <= ${stopLoss}).`);
  } else if (side === "SELL" && currentPrice >= stopLoss) {
    reasons.push(`Stop loss atingido (${currentPrice} >= ${stopLoss}).`);
  }

  if (!trendStillConfirmed) {
    reasons.push("Tendência principal invalidada.");
  }
  if (!momentumStillFavorable) {
    reasons.push("Momentum favorável perdido.");
  }
  if (!macroStillNonContradictory) {
    reasons.push("Contexto macroeconômico tornou-se contraditório.");
  }

  return {
    invalidated: reasons.length > 0,
    reasons,
  };
}
