"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useCryptoStore } from "@/lib/store";
import {
  tradeJournalEngine,
  type TradeJournalRecord,
  type LongHorizonWindow,
} from "@/lib/journal/trade-journal-engine";
import {
  orderFlowAnomalyScanner,
  type AnomalyAlert,
} from "@/lib/order-flow/anomaly-scanner";
import {
  buildPostTradeCoTPrompt,
  calculateBipartiteExcursionWidths,
  computeInstitutionalRiskTelemetry,
} from "@/lib/journal/post-trade-copilot-prompt";
import {
  Brain,
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";

interface QuantAuditResponse {
  statusRisco: "SAUDAVEL" | "ATENCAO" | "CRITICO";
  eficienciaCapturaMfe: number;
  ajustesRecomendados: Array<{
    parametro: string;
    valorAtual: string;
    valorSugerido: string;
    racionalQuant: string;
  }>;
  source: "AI_ENGINE" | "DETERMINISTIC_CLEAR_BOX";
  auditedAtIso: string;
}

/**
 * Modal/Drawer Global de Auditoria Instantânea do Copiloto Quant Pós-Trade.
 * Acionado globalmente via atalho de teclado `Alt+J` ou `Cmd+Shift+C` (`Ctrl+Shift+C`)
 * a partir de qualquer tela (Gráfico, Central de Robôs, Dashboard) sem perder o contexto visual.
 */
export function QuantCopilotInstantModal() {
  const {
    openQuantCopilotModal,
    setOpenQuantCopilotModal,
    quantCopilotAutoAuditCount,
    setActiveSection,
  } = useCryptoStore(
    useShallow((s) => ({
      openQuantCopilotModal: s.openQuantCopilotModal,
      setOpenQuantCopilotModal: s.setOpenQuantCopilotModal,
      quantCopilotAutoAuditCount: s.quantCopilotAutoAuditCount,
      setActiveSection: s.setActiveSection,
    }))
  );

  const [records, setRecords] = useState<TradeJournalRecord[]>(() =>
    tradeJournalEngine.getAllRecords()
  );
  const [anomalies, setAnomalies] = useState<AnomalyAlert[]>(() =>
    orderFlowAnomalyScanner.getRecentAlerts(10)
  );
  const [horizonWindow, setHorizonWindow] = useState<LongHorizonWindow>("LIVE");
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [auditResult, setAuditResult] = useState<QuantAuditResponse | null>(null);

  useEffect(() => {
    const unsubJournal = tradeJournalEngine.subscribe((updated) => {
      setRecords(updated);
    });
    const unsubAnomalies = orderFlowAnomalyScanner.subscribe(() => {
      setAnomalies(orderFlowAnomalyScanner.getRecentAlerts(10));
    });
    return () => {
      unsubJournal();
      unsubAnomalies();
    };
  }, []);

  const metrics = useMemo(() => {
    if (horizonWindow === "LIVE") {
      return tradeJournalEngine.calculateMetrics(records, 1000);
    }
    return tradeJournalEngine.getLongHorizonMetricsO1(horizonWindow, "all", 1000);
  }, [records, horizonWindow]);

  const riskTelemetry = useMemo(
    () => computeInstitutionalRiskTelemetry(records, 1000),
    [records]
  );

  const copilotBundle = useMemo(
    () =>
      buildPostTradeCoTPrompt({
        metrics,
        horizonWindow,
        anomalies,
        lastRecord: records[0] ?? null,
      }),
    [metrics, horizonWindow, anomalies, records]
  );

  const avgBipartite = useMemo(
    () => calculateBipartiteExcursionWidths(metrics.avgMaePercent, metrics.avgMfePercent),
    [metrics.avgMaePercent, metrics.avgMfePercent]
  );

  const runInstantCoTAudit = useCallback(async () => {
    setIsAuditing(true);
    try {
      // Monta o diagnóstico determinístico Clear-Box imediato e consulta o motor IA em paralelo
      const deterministicAdjustments = [
        {
          parametro: "Trailing Stop / Realização Parcial TP1",
          valorAtual: "TP1 50% @ +1.2% | SL -2.0%",
          valorSugerido:
            copilotBundle.mfeCaptureEfficiencyPercent < 60
              ? "TP1 60% @ +1.0 ATR + Break-Even Imediato"
              : "Manter TP1 50% + Trailing Dinâmico 0.8 ATR",
          racionalQuant: `Captura MFE atual em ${copilotBundle.mfeCaptureEfficiencyPercent.toFixed(
            1
          )}% com MAE médio de ${metrics.avgMaePercent.toFixed(2)}%.`,
        },
        {
          parametro: "Filtro Pré-Trade de Amplitude ATR (Anti-Overtrading)",
          valorAtual: "ATR Mínimo >= 1.50% líquido",
          valorSugerido:
            metrics.totalFees > Math.abs(metrics.totalNetPnl) * 0.25
              ? "Elevar filtro ATR Mínimo para >= 1.85% líquido"
              : "Manter ATR Mínimo >= 1.50% líquido",
          racionalQuant: `Fricção acumulada de -$${metrics.totalFees.toFixed(
            2
          )} USD frente a Net PnL de $${metrics.totalNetPnl.toFixed(2)} USD.`,
        },
        {
          parametro: "Governança Daily Loss & Consecutive Loss Brake",
          valorAtual: `${riskTelemetry.dailyLossPercentOfNav.toFixed(2)}% NAV | ${riskTelemetry.consecutiveLosses
            }/3 Loss`,
          valorSugerido:
            riskTelemetry.consecutiveLosses >= 2
              ? "Reduzir tamanho de mão em 50% até próximo trade vencedor"
              : "Operação nominal dentro do limite <= 5% NAV por posição",
          racionalQuant: `Consumo de ${riskTelemetry.dailyLossUtilizationPercent.toFixed(
            1
          )}% da trava diária de -3.0% NAV.`,
        },
      ];

      setAuditResult({
        statusRisco: copilotBundle.riskStatus,
        eficienciaCapturaMfe: copilotBundle.mfeCaptureEfficiencyPercent,
        ajustesRecomendados: deterministicAdjustments,
        source: "DETERMINISTIC_CLEAR_BOX",
        auditedAtIso: new Date().toISOString().slice(11, 19) + " UTC",
      });

      // Tenta enriquecer assincronamente via endpoint /api/ai/trade-hub se disponível
      const res = await fetch("/api/ai/trade-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "journal_analyzer",
          params: { customTrades: copilotBundle.promptText },
        }),
      }).catch(() => null);

      if (res && res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.success && json?.data?.threeGoldenRules?.length) {
          setAuditResult((prev) =>
            prev
              ? {
                ...prev,
                source: "AI_ENGINE",
                ajustesRecomendados: json.data.threeGoldenRules
                  .slice(0, 3)
                  .map((r: any, i: number) => ({
                    parametro: r.ruleTitle || deterministicAdjustments[i]?.parametro || `Regra #${i + 1}`,
                    valorAtual: deterministicAdjustments[i]?.valorAtual || "Parâmetro Atual",
                    valorSugerido: r.directive || deterministicAdjustments[i]?.valorSugerido,
                    racionalQuant: r.application || deterministicAdjustments[i]?.racionalQuant,
                  })),
              }
              : prev
          );
        }
      }
    } finally {
      setIsAuditing(false);
    }
  }, [copilotBundle, metrics, riskTelemetry]);

  // Sempre que o modal abrir ou o atalho global Alt+J / Cmd+Shift+C for acionado, dispara a auditoria instantânea
  useEffect(() => {
    if (openQuantCopilotModal) {
      runInstantCoTAudit();
    }
  }, [openQuantCopilotModal, quantCopilotAutoAuditCount, runInstantCoTAudit]);

  const handleCopyPrompt = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(copilotBundle.promptText).catch(() => { });
    }
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  if (!openQuantCopilotModal) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-5 select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Auditoria Instantânea do Copiloto Quant Pós-Trade"
    >
      <div className="w-full max-w-4xl bg-[#0b0e14] border border-cyan-500/35 rounded-2xl shadow-2xl overflow-hidden text-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-[#111827] border-b border-[#1f2937]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/15 border border-cyan-500/35 text-cyan-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white">
                  Copiloto Quant Pós-Trade • Auditoria Instantânea CoT
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                  Alt+J / ⌘⇧C
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Auditoria em tempo real sobre excursão MAE/MFE, fricção de taxas e guardrails sem sair da tela gráfica
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Seletor Rápido de Horizonte O(1) */}
            <div className="flex items-center gap-0.5 bg-[#070a10] p-0.5 rounded-lg border border-[#1f2937]">
              {(["LIVE", "30D", "90D", "1Y", "ALL"] as LongHorizonWindow[]).map((win) => (
                <button
                  key={win}
                  type="button"
                  onClick={() => setHorizonWindow(win)}
                  className={`px-2 py-1 rounded text-xs font-mono transition-colors cursor-pointer ${horizonWindow === win
                      ? "bg-emerald-600 text-white font-bold"
                      : "text-slate-400 hover:text-slate-200"
                    }`}
                >
                  {win}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setOpenQuantCopilotModal(false)}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              aria-label="Fechar modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Corpo Rolável */}
        <div className="p-5 overflow-y-auto space-y-4 pro-scrollbar">
          {/* Linha 1: Guardrails Institucionais e Eficiência Bipartida MAE vs MFE */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-[#131b2a] border border-[#1f2937] space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Status Guardrails (Pilar 2)</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline justify-between font-mono">
                <span
                  className={`text-sm font-bold ${riskTelemetry.riskStatus === "CRITICO"
                      ? "text-rose-400"
                      : riskTelemetry.riskStatus === "ATENCAO"
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }`}
                >
                  {riskTelemetry.riskStatus}
                </span>
                <span className="text-xs text-slate-300">
                  Loss Diário: {riskTelemetry.dailyLossPercentOfNav.toFixed(2)}% / -3.0%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${riskTelemetry.dailyLossUtilizationPercent >= 80
                      ? "bg-rose-500"
                      : riskTelemetry.dailyLossUtilizationPercent >= 45
                        ? "bg-amber-400"
                        : "bg-emerald-500"
                    }`}
                  style={{ width: `${Math.max(6, riskTelemetry.dailyLossUtilizationPercent)}%` }}
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#131b2a] border border-[#1f2937] space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Eficiência de Captura MFE</span>
                <span className="font-mono text-cyan-300">
                  {copilotBundle.mfeCaptureEfficiencyPercent.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="text-rose-400">MAE {metrics.avgMaePercent.toFixed(2)}%</span>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden flex">
                  <div
                    className="bg-rose-500 h-full"
                    style={{ width: `${avgBipartite.maeWidthPercent}%` }}
                  />
                  <div
                    className="bg-emerald-500 h-full"
                    style={{ width: `${avgBipartite.mfeWidthPercent}%` }}
                  />
                </div>
                <span className="text-emerald-400">MFE +{metrics.avgMfePercent.toFixed(2)}%</span>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                Win Rate: {metrics.winRate.toFixed(1)}% • PF: {metrics.profitFactor.toFixed(2)} • Sharpe:{" "}
                {metrics.sharpeRatio.toFixed(2)}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#131b2a] border border-[#1f2937] flex flex-col justify-between">
              <div className="text-xs font-semibold text-emerald-300">
                {copilotBundle.clearBoxHeadline}
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {copilotBundle.clearBoxRecommendation}
              </p>
            </div>
          </div>

          {/* Linha 2: Recomendações Paramétricas Auditadas (Clear-Box + IA) */}
          {auditResult && (
            <div className="p-4 rounded-xl bg-[#111827] border border-[#1f2937] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    Plano de Ação Paramétrico ({auditResult.source === "AI_ENGINE" ? "IA Multimodal" : "Motor Clear-Box"})
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    Auditado às {auditResult.auditedAtIso}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={runInstantCoTAudit}
                  disabled={isAuditing}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-200 text-xs font-mono cursor-pointer transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? "animate-spin" : ""}`} />
                  {isAuditing ? "Re-auditando..." : "Re-auditar Agora"}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {auditResult.ajustesRecomendados.map((aj, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-[#0b0e14] border border-[#1f2937] space-y-1.5 text-xs"
                  >
                    <div className="font-bold text-cyan-300">{aj.parametro}</div>
                    <div className="text-slate-400 font-mono">Atual: {aj.valorAtual}</div>
                    <div className="text-emerald-300 font-mono font-semibold">
                      Sugerido: {aj.valorSugerido}
                    </div>
                    <p className="text-slate-300 pt-1 border-t border-[#1f2937]/80">
                      {aj.racionalQuant}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linha 3: Inspetor do Prompt Chain-of-Thought Completo */}
          <div className="p-4 rounded-xl bg-[#111827] border border-[#1f2937] space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                Prompt Chain-of-Thought Estruturado (Preenchido em Tempo Real)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-semibold transition-colors cursor-pointer"
                >
                  {copiedPrompt ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copiado para o Clipboard!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copiar Prompt CoT
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenQuantCopilotModal(false);
                    setActiveSection("journal");
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#1a2234] hover:bg-[#222d42] border border-[#2d3748] text-slate-200 text-xs font-mono transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                  Abrir Diário Completo
                </button>
              </div>
            </div>

            <pre className="p-3 rounded-lg bg-[#070a10] border border-[#1f2937] text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-48 leading-relaxed">
              {copilotBundle.promptText}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

