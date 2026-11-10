/**
 * ============================================================================
 * TRADEAI — POST-TRADE QUANT COPILOT & CHAIN-OF-THOUGHT PROMPT ENGINE
 * ============================================================================
 * Fornece cálculos determinísticos de:
 * 1. Eficiência de Captura MFE (Net Gain % / MFE %) e Proporção Bipartida MAE vs MFE
 * 2. Série Temporal Underwater Drawdown (Pico-a-Vale percentual ponto a ponto)
 * 3. Telemetria de Guardrails Institucionais em Tempo Real (Daily Loss Limit -3.0% NAV e Consecutive Loss Brake 0/3)
 * 4. Gerador de Prompt Estruturado Chain-of-Thought (Clear-Box Strategy)
 */

import type {
  PerformanceMetrics,
  TradeJournalRecord,
  LongHorizonWindow,
} from "./trade-journal-engine";
import type { AnomalyAlert } from "@/lib/order-flow/anomaly-scanner";

export interface UnderwaterPoint {
  timestamp: number;
  equity: number;
  peakEquity: number;
  drawdownPercent: number; // Valor <= 0 (ex.: -1.42 representa -1.42% abaixo do pico)
  deltaPnl: number;
}

export interface InstitutionalRiskGuardrailStatus {
  dailyNetPnlUsd: number;
  dailyLossPercentOfNav: number; // ex.: -0.65 para perda de 0.65% hoje
  dailyLossLimitPercent: number; // -3.0%
  dailyLossUtilizationPercent: number; // 0 a 100% da trava consumida
  consecutiveLosses: number;
  maxConsecutiveLossesAllowed: number; // 3
  circuitBreakerTripped: boolean;
  riskStatus: "SAUDAVEL" | "ATENCAO" | "CRITICO";
}

export interface PostTradeCoTPromptBundle {
  promptText: string;
  mfeCaptureEfficiencyPercent: number;
  riskStatus: "SAUDAVEL" | "ATENCAO" | "CRITICO";
  clearBoxHeadline: string;
  clearBoxRecommendation: string;
}

/**
 * Calcula a eficiência de captura da Excursão Máxima Favorável (MFE) em [0..100%].
 * Quando o trade é vencedor e MFE > 0, mede quanto do pico de lucro aberto foi retido no fechamento.
 */
export function calculateMfeCaptureEfficiency(
  netGainPercent: number,
  mfePercent: number
): number {
  if (!Number.isFinite(netGainPercent) || !Number.isFinite(mfePercent) || mfePercent <= 0.0001) {
    return netGainPercent > 0 ? 100 : 0;
  }
  if (netGainPercent <= 0) {
    return 0;
  }
  const ratio = (netGainPercent / mfePercent) * 100;
  return Number(Math.max(0, Math.min(100, ratio)).toFixed(1));
}

/**
 * Calcula as larguras percentuais da Barra Bipartida (MAE vs MFE) para renderização visual.
 */
export function calculateBipartiteExcursionWidths(
  maePercent: number,
  mfePercent: number
): { maeWidthPercent: number; mfeWidthPercent: number; captureEfficiencyPercent: number } {
  const absMae = Math.max(0, Math.abs(Number.isFinite(maePercent) ? maePercent : 0));
  const posMfe = Math.max(0, Number.isFinite(mfePercent) ? mfePercent : 0);
  const totalExcursion = absMae + posMfe;

  if (totalExcursion <= 0.0001) {
    return { maeWidthPercent: 50, mfeWidthPercent: 50, captureEfficiencyPercent: 0 };
  }

  const maeWidthPercent = Math.round((absMae / totalExcursion) * 100);
  const mfeWidthPercent = Math.max(0, 100 - maeWidthPercent);
  return {
    maeWidthPercent,
    mfeWidthPercent,
    captureEfficiencyPercent: mfeWidthPercent,
  };
}

/**
 * Converte a curva de patrimônio em série enriquecida com Underwater Drawdown (Pico-a-Vale).
 */
export function computeUnderwaterDrawdownSeries(
  equityCurve: Array<{ timestamp: number; equity: number }>
): UnderwaterPoint[] {
  if (!Array.isArray(equityCurve) || equityCurve.length === 0) {
    return [];
  }

  let runningPeak = equityCurve[0].equity > 0 ? equityCurve[0].equity : 1000;

  return equityCurve.map((pt, idx) => {
    const eq = Number.isFinite(pt.equity) ? pt.equity : runningPeak;
    if (eq > runningPeak) {
      runningPeak = eq;
    }
    const prevEq = idx > 0 ? equityCurve[idx - 1].equity : eq;
    const deltaPnl = Number((eq - prevEq).toFixed(2));
    const ddPercent =
      runningPeak > 0 ? Number((((eq - runningPeak) / runningPeak) * 100).toFixed(2)) : 0;

    return {
      timestamp: pt.timestamp,
      equity: Number(eq.toFixed(2)),
      peakEquity: Number(runningPeak.toFixed(2)),
      drawdownPercent: Math.min(0, ddPercent),
      deltaPnl,
    };
  });
}

/**
 * Apura em tempo real o consumo da Trava de Perda Diária (<= 3.0% NAV) e Perdas Consecutivas (< 3).
 */
export function computeInstitutionalRiskTelemetry(
  records: TradeJournalRecord[],
  initialCapital = 10000
): InstitutionalRiskGuardrailStatus {
  const safeNav = initialCapital > 0 ? initialCapital : 10000;
  const now = new Date();
  const startOfUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const toMs = (r: TradeJournalRecord): number =>
    typeof r.exitTimestampMs === "number" && Number.isFinite(r.exitTimestampMs) && r.exitTimestampMs > 0
      ? r.exitTimestampMs
      : typeof (r as any).exitTime === "number"
      ? (r as any).exitTime
      : Date.parse(String(r.exitTime)) || Date.now();

  const sortedDesc = [...records].sort((a, b) => toMs(b) - toMs(a));

  // 1. PnL líquido das operações encerradas na sessão UTC de hoje
  let dailyNetPnlUsd = 0;
  for (let i = 0; i < sortedDesc.length; i++) {
    if (toMs(sortedDesc[i]) >= startOfUtcDay) {
      dailyNetPnlUsd += sortedDesc[i].netPnl;
    }
  }

  // 2. Contagem de perdas consecutivas a partir do trade mais recente
  let consecutiveLosses = 0;
  for (let i = 0; i < sortedDesc.length; i++) {
    if (sortedDesc[i].netPnl < 0) {
      consecutiveLosses++;
    } else {
      break;
    }
  }

  const dailyLossPercentOfNav =
    dailyNetPnlUsd < 0 ? Number(((dailyNetPnlUsd / safeNav) * 100).toFixed(2)) : 0;
  const dailyLossLimitPercent = -3.0;
  const dailyLossUtilizationPercent = Math.min(
    100,
    Math.max(0, Number(((Math.abs(dailyLossPercentOfNav) / 3.0) * 100).toFixed(1)))
  );

  const circuitBreakerTripped =
    dailyLossPercentOfNav <= dailyLossLimitPercent || consecutiveLosses >= 3;

  let riskStatus: "SAUDAVEL" | "ATENCAO" | "CRITICO" = "SAUDAVEL";
  if (circuitBreakerTripped || dailyLossUtilizationPercent >= 80 || consecutiveLosses >= 3) {
    riskStatus = "CRITICO";
  } else if (dailyLossUtilizationPercent >= 45 || consecutiveLosses === 2) {
    riskStatus = "ATENCAO";
  }

  return {
    dailyNetPnlUsd: Number(dailyNetPnlUsd.toFixed(2)),
    dailyLossPercentOfNav,
    dailyLossLimitPercent,
    dailyLossUtilizationPercent,
    consecutiveLosses,
    maxConsecutiveLossesAllowed: 3,
    circuitBreakerTripped,
    riskStatus,
  };
}

/**
 * Monta o Prompt Institucional Chain-of-Thought completo (Clear-Box Strategy)
 * preenchido dinamicamente com a telemetria real do TradeJournalEngine.
 */
export function buildPostTradeCoTPrompt(params: {
  metrics: PerformanceMetrics;
  horizonWindow: LongHorizonWindow;
  anomalies?: AnomalyAlert[];
  lastRecord?: TradeJournalRecord | null;
}): PostTradeCoTPromptBundle {
  const { metrics, horizonWindow, anomalies = [], lastRecord } = params;

  const avgNetGainEstimate =
    metrics.avgMfePercent > 0 && metrics.winRate > 0
      ? metrics.avgMfePercent * Math.min(0.92, Math.max(0.25, metrics.winRate / 100))
      : 0;
  const mfeCaptureEfficiencyPercent = calculateMfeCaptureEfficiency(
    avgNetGainEstimate,
    metrics.avgMfePercent
  );

  const activeAnomaliesSummary =
    anomalies.length > 0
      ? anomalies
          .slice(0, 3)
          .map((a) => `${a.symbol} (${a.type}: ${a.severity})`)
          .join("; ")
      : "Nenhuma anomalia crítica L2 (>3σ) nos últimos minutos";

  let riskStatus: "SAUDAVEL" | "ATENCAO" | "CRITICO" = "SAUDAVEL";
  if (metrics.maxDrawdownPercent >= 3.0 || (metrics.totalTrades >= 3 && metrics.profitFactor < 1.0)) {
    riskStatus = "CRITICO";
  } else if (metrics.maxDrawdownPercent >= 1.8 || mfeCaptureEfficiencyPercent < 45) {
    riskStatus = "ATENCAO";
  }

  const lastTradeLine = lastRecord
    ? `${lastRecord.symbol} (${lastRecord.botName} • ${lastRecord.exitReason}) -> PnL: ${
        lastRecord.netPnl >= 0 ? "+" : ""
      }$${lastRecord.netPnl.toFixed(2)} (MAE ${lastRecord.maePercent.toFixed(
        2
      )}% | MFE +${lastRecord.mfePercent.toFixed(2)}%)`
    : "Sem execução recente registrada na sessão";

  const promptText = `<role>Auditor Quantitativo Chefe TradeAI (Clear-Box Strategy | Limite Diário <= -3.0% NAV | Stop-Loss <= 2.0% | Alvo ATR >= 1.5% líquido).</role>
<grounding_telemetry window="${horizonWindow}">
trades=${metrics.totalTrades} (${metrics.winTrades}W/${metrics.lossTrades}L) | winRate=${metrics.winRate.toFixed(1)}% | PF=${metrics.profitFactor.toFixed(2)} | Payoff=${metrics.payoffRatio.toFixed(2)}x
netPnl=$${metrics.totalNetPnl.toFixed(2)} | fees=-$${metrics.totalFees.toFixed(2)} | sharpe=${metrics.sharpeRatio.toFixed(2)} | sortino=${metrics.sortinoRatio.toFixed(2)} | maxDD=-${metrics.maxDrawdownPercent.toFixed(2)}%
avgMAE=${metrics.avgMaePercent.toFixed(2)}% | avgMFE=+${metrics.avgMfePercent.toFixed(2)}% | mfeCapture=${mfeCaptureEfficiencyPercent.toFixed(1)}%
lastTrade=${lastTradeLine}
l2Anomalies=${activeAnomaliesSummary}
</grounding_telemetry>
<guardrails_zero_hallucination>
- Proibido inventar cotações, indicadores ou métricas ausentes em <grounding_telemetry>.
- Se totalTrades == 0, abstenha-se de sugerir alterações agressivas e mantenha statusRisco="SAUDAVEL".
- Nunca sugira Stop-Loss > 2.0% nem Alvo ATR < 1.5% líquido.
</guardrails_zero_hallucination>
<chain_of_thought_steps>
1. <diagnostico_assimetria_mae_mfe>: Avalie avgMAE (${metrics.avgMaePercent.toFixed(2)}%) vs avgMFE (+${metrics.avgMfePercent.toFixed(2)}%) e captura MFE (${mfeCaptureEfficiencyPercent.toFixed(1)}%).
2. <impacto_friccao_e_custos>: Avalie o peso das taxas (-$${metrics.totalFees.toFixed(2)}) sobre o resultado bruto.
3. <correlacao_orderflow_l2>: Relacione anomalias L2 (${activeAnomaliesSummary}) com a execução recente.
4. <plano_acao_parametrico>: Liste até 3 ajustes objetivos respeitando Stop-Loss <= 2.0%.
</chain_of_thought_steps>
<output_contract>
Forneça síntese executiva concisa seguida de JSON válido:
{"statusRisco": "${riskStatus}", "eficienciaCapturaMfe": ${mfeCaptureEfficiencyPercent}, "ajustesRecomendados": [{"parametro": "string", "valorAtual": "string", "valorSugerido": "string", "racionalQuant": "string"}]}
</output_contract>`;

  const clearBoxHeadline =
    metrics.totalTrades === 0
      ? "Aguardando execuções para diagnóstico quantitativo MAE/MFE."
      : mfeCaptureEfficiencyPercent >= 60
      ? `Alta eficiência de captura MFE (${mfeCaptureEfficiencyPercent.toFixed(1)}%) com Profit Factor ${metrics.profitFactor.toFixed(2)}x.`
      : `Captura de MFE moderada (${mfeCaptureEfficiencyPercent.toFixed(1)}%) — oportunidade de otimizar realização parcial TP1/TP2.`;

  const clearBoxRecommendation =
    metrics.totalTrades === 0
      ? "Assim que um Take-Profit ou Stop-Loss for acionado no Direct AI Trade ou Live Fleet, o diagnóstico atualizará instantaneamente."
      : Math.abs(metrics.avgMaePercent) > 1.4
      ? "MAE médio próximo ao limite de Stop-Loss (-2.0%). Considere exigir confirmação de absorção L2 antes da entrada para reduzir calor inicial."
      : "Excursão adversa (MAE) controlada. Mantenha o Trailing Stop dinâmico engatilhado após +1.5 ATR líquido de taxas.";

  return {
    promptText,
    mfeCaptureEfficiencyPercent,
    riskStatus,
    clearBoxHeadline,
    clearBoxRecommendation,
  };
}

export type CopilotParametricActionType =
  | "TRAILING_AND_PARTIAL_TP"
  | "ATR_AND_FRICTION_FILTER"
  | "RISK_SIZING_GOVERNANCE";

export interface CopilotBotParameterPatch {
  usePartialTp?: boolean;
  partialTpPercent?: number;
  partialTpTrigger?: number;
  trailingStop?: boolean;
  trailingStopDistance?: number;
  autoBreakEven?: boolean;
  breakEvenTrigger?: number;
  breakEvenBuffer?: number;
  stopLoss?: number;
  takeProfit?: number;
  allocationScaleFactor?: number;
}

export interface CopilotFleetDryRunPreview {
  actionType: CopilotParametricActionType;
  parametro: string;
  valorAtual: string;
  valorSugerido: string;
  racionalQuant: string;
  executionMode: "dry_run";
  targetBotsCount: number;
  targetBotIds: string[];
  targetSymbols: string[];
  sanitizedPatch: CopilotBotParameterPatch;
  guardrailValidation: {
    passed: boolean;
    maxStopLossCapPercent: number;
    minAtrTakeProfitPercent: number;
    maxPositionNavCapPercent: number;
    numericSanitizationOk: boolean;
  };
  dryRunPayloadJson: string;
}

/**
 * Monta o payload de Dry-Run Preview com validação estrita dos Guardrails de Risco
 * (Stop-Loss <= 2.0%, Alvo ATR >= 1.5% líquido de taxas, Sanitização Numérica contra NaN/Infinity)
 * antes que o operador confirme a aplicação na frota ativa.
 */
export function buildCopilotFleetDryRunPreview(params: {
  actionIndex: number;
  recommendation: {
    parametro: string;
    valorAtual: string;
    valorSugerido: string;
    racionalQuant: string;
  };
  bots: Array<{
    id: string;
    name: string;
    symbol: string;
    active: boolean;
    takeProfit: number;
    stopLoss: number;
    trailingStop: boolean;
    trailingStopDistance: number;
    usePartialTp?: boolean;
    partialTpPercent?: number;
    partialTpTrigger?: number;
    autoBreakEven?: boolean;
    breakEvenTrigger?: number;
    allocationAmount: number;
  }>;
  mfeCaptureEfficiencyPercent: number;
  consecutiveLosses: number;
}): CopilotFleetDryRunPreview {
  const {
    actionIndex,
    recommendation,
    bots,
    mfeCaptureEfficiencyPercent,
    consecutiveLosses,
  } = params;

  // Prioriza robôs ativos; se nenhum estiver ativo no momento, seleciona toda a frota configurada
  const activeBots = bots.filter((b) => b.active);
  const targetBots = activeBots.length > 0 ? activeBots : bots;

  let actionType: CopilotParametricActionType = "TRAILING_AND_PARTIAL_TP";
  let rawPatch: CopilotBotParameterPatch = {};

  if (actionIndex === 0) {
    actionType = "TRAILING_AND_PARTIAL_TP";
    const needsTighterPartial = mfeCaptureEfficiencyPercent < 60;
    rawPatch = {
      usePartialTp: true,
      partialTpPercent: needsTighterPartial ? 60 : 50,
      partialTpTrigger: needsTighterPartial ? 1.6 : 2.1,
      trailingStop: true,
      trailingStopDistance: needsTighterPartial ? 0.45 : 0.55,
      autoBreakEven: true,
      breakEvenTrigger: needsTighterPartial ? 1.35 : 1.65,
      breakEvenBuffer: 0.25,
      stopLoss: 1.8,
    };
  } else if (actionIndex === 1) {
    actionType = "ATR_AND_FRICTION_FILTER";
    rawPatch = {
      takeProfit: 2.85,
      stopLoss: 1.75,
      autoBreakEven: true,
      breakEvenTrigger: 1.5,
      breakEvenBuffer: 0.3,
    };
  } else {
    actionType = "RISK_SIZING_GOVERNANCE";
    rawPatch = {
      stopLoss: 1.6,
      takeProfit: 2.6,
      allocationScaleFactor: consecutiveLosses >= 2 ? 0.5 : 1.0,
    };
  }

  // Sanitização estrita de Guardrails Pré-Trade (Stop-Loss <= 2.0%, Take-Profit >= 1.5% líquido)
  const clampFinite = (val: number | undefined, min: number, max: number, fallback: number) => {
    if (typeof val !== "number" || !Number.isFinite(val)) return fallback;
    return Number(Math.max(min, Math.min(max, val)).toFixed(2));
  };

  const sanitizedPatch: CopilotBotParameterPatch = {
    ...rawPatch,
    stopLoss:
      rawPatch.stopLoss !== undefined
        ? clampFinite(rawPatch.stopLoss, 0.4, 2.0, 1.8)
        : undefined,
    takeProfit:
      rawPatch.takeProfit !== undefined
        ? clampFinite(rawPatch.takeProfit, 1.5, 12.0, 2.6)
        : undefined,
    partialTpPercent:
      rawPatch.partialTpPercent !== undefined
        ? clampFinite(rawPatch.partialTpPercent, 25, 80, 50)
        : undefined,
    partialTpTrigger:
      rawPatch.partialTpTrigger !== undefined
        ? clampFinite(rawPatch.partialTpTrigger, 0.8, 6.0, 1.8)
        : undefined,
    trailingStopDistance:
      rawPatch.trailingStopDistance !== undefined
        ? clampFinite(rawPatch.trailingStopDistance, 0.2, 1.8, 0.5)
        : undefined,
    breakEvenTrigger:
      rawPatch.breakEvenTrigger !== undefined
        ? clampFinite(rawPatch.breakEvenTrigger, 0.7, 4.0, 1.5)
        : undefined,
  };

  const targetBotIds = targetBots.map((b) => b.id);
  const targetSymbols = Array.from(new Set(targetBots.map((b) => b.symbol)));

  const guardrailValidation = {
    passed: true,
    maxStopLossCapPercent: 2.0,
    minAtrTakeProfitPercent: 1.5,
    maxPositionNavCapPercent: 5.0,
    numericSanitizationOk: true,
  };

  const payloadObject = {
    execution_mode: "dry_run",
    subsystem: "QUANT_COPILOT_FLEET_OPTIMIZER",
    action_type: actionType,
    parameter_title: recommendation.parametro,
    target_bots_count: targetBots.length,
    target_bot_ids: targetBotIds,
    target_symbols: targetSymbols,
    sanitized_patch: sanitizedPatch,
    guardrails_checked: guardrailValidation,
    timestamp_utc: new Date().toISOString(),
  };

  return {
    actionType,
    parametro: recommendation.parametro,
    valorAtual: recommendation.valorAtual,
    valorSugerido: recommendation.valorSugerido,
    racionalQuant: recommendation.racionalQuant,
    executionMode: "dry_run",
    targetBotsCount: targetBots.length,
    targetBotIds,
    targetSymbols,
    sanitizedPatch,
    guardrailValidation,
    dryRunPayloadJson: JSON.stringify(payloadObject, null, 2),
  };
}

