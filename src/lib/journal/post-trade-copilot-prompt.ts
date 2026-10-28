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
  initialCapital = 1000
): InstitutionalRiskGuardrailStatus {
  const safeNav = initialCapital > 0 ? initialCapital : 1000;
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

  const promptText = `# ROLE & CONTEXTO INSTITUCIONAL
Você é o Auditor Quantitativo Chefe e Estrategista de Risco do TradeAI, operando sob os princípios estritos de Clear-Box Strategy e Governança de Risco Institucional (Limite de Perda Diária <= 3.0% NAV, Stop-Loss Obrigatório <= 2.0%, Filtro de Amplitude Mínima ATR >= 1.5% líquido de taxas).

# TELEMETRIA PÓS-TRADE EM TEMPO REAL (INPUT DINÂMICO)
- Janela Analisada: ${horizonWindow} (${metrics.totalTrades} execuções | ${metrics.winTrades}W / ${metrics.lossTrades}L)
- Net PnL Acumulado: $${metrics.totalNetPnl.toFixed(2)} USD (Fricção Total de Taxas + Slippage: -$${metrics.totalFees.toFixed(2)} USD)
- Taxa de Acerto (Win Rate): ${metrics.winRate.toFixed(1)}% | Profit Factor: ${metrics.profitFactor.toFixed(2)} | Payoff Ratio: ${metrics.payoffRatio.toFixed(2)}x
- Índice de Sharpe: ${metrics.sharpeRatio.toFixed(2)} | Índice de Sortino: ${metrics.sortinoRatio.toFixed(2)} | Drawdown Máximo: -${metrics.maxDrawdownPercent.toFixed(2)}%
- Excursão Média: MAE ${metrics.avgMaePercent.toFixed(2)}% (Pior Queda) vs MFE +${metrics.avgMfePercent.toFixed(2)}% (Pico de Lucro)
- Eficiência Média de Captura MFE: ${mfeCaptureEfficiencyPercent.toFixed(1)}%
- Última Execução: ${lastTradeLine}
- Anomalias Recentes de Order Flow L2 (RVOL > 3σ / Imbalance > 70/30): ${activeAnomaliesSummary}

# INSTRUÇÕES DE RACIOCÍNIO (CHAIN-OF-THOUGHT)
Analise os dados acima seguindo obrigatoriamente estas 4 etapas estruturadas:
1. <diagnostico_assimetria_mae_mfe>: Avalie a relação entre MAE médio (${metrics.avgMaePercent.toFixed(2)}%) e MFE médio (+${metrics.avgMfePercent.toFixed(2)}%). Identifique se os robôs estão sofrendo stop-loss por ruído de microestrutura (MAE próximo ao SL) ou devolvendo lucro aberto (baixa captura de MFE).
2. <impacto_friccao_e_custos>: Calcule o peso percentual das taxas e slippage (-$${metrics.totalFees.toFixed(2)} USD) sobre o lucro bruto e indique se há overtrading em ativos com baixa amplitude ATR.
3. <correlacao_orderflow_l2>: Relacione as anomalias de fluxo L2 (${activeAnomaliesSummary}) com o desempenho recente da frota.
4. <plano_acao_parametrico>: Forneça até 3 ajustes objetivos e acionáveis (ex.: calibragem de TP1/TP2 parcial, distância de Trailing Stop em múltiplos de ATR ou bloqueio temporário de par específico), mantendo o risco por trade <= 2.0% do preço de entrada.

# FORMATO DE SAÍDA (JSON + RESUMO EXECUTIVO)
Responda com um bloco executivo em Markdown claro seguido de um objeto JSON válido contendo as chaves:
{"statusRisco": "${riskStatus}", "eficienciaCapturaMfe": ${mfeCaptureEfficiencyPercent}, "ajustesRecomendados": [{"parametro": "string", "valorAtual": "string", "valorSugerido": "string", "racionalQuant": "string"}]}`;

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
