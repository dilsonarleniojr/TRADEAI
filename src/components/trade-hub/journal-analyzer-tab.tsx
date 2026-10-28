"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  tradeJournalEngine,
  type TradeJournalRecord,
  type BotExecutionEventPayload,
} from "@/lib/journal/trade-journal-engine";
import { buildPostTradeCoTPrompt } from "@/lib/journal/post-trade-copilot-prompt";
import {
  BookOpenCheck,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  RefreshCw,
  Award,
  Flame,
  Brain,
  History,
  Clock,
  Copy,
  Check,
} from "lucide-react";

interface JournalAnalyzerData {
  performanceOverview: {
    totalPnL: string;
    winRate: string;
    profitFactor: string;
    averageWin: string;
    averageLoss: string;
  };
  recurringMistakes: Array<{
    mistake: string;
    impact: string;
    diagnosis: string;
  }>;
  missedOpportunities: Array<{
    situation: string;
    lesson: string;
  }>;
  behavioralBiases: Array<{
    bias: string;
    evidence: string;
    mitigation: string;
  }>;
  threeGoldenRules: Array<{
    ruleNumber: number;
    ruleTitle: string;
    directive: string;
    application: string;
  }>;
}

export function JournalAnalyzerTab() {
  const [customTrades, setCustomTrades] = useState<string>("");
  const [showCustomInput, setShowCustomInput] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<JournalAnalyzerData | null>(null);
  const [liveRecords, setLiveRecords] = useState<TradeJournalRecord[]>(() =>
    tradeJournalEngine.getAllRecords()
  );
  const [lastLiveEvent, setLastLiveEvent] = useState<{
    record: TradeJournalRecord;
    event: BotExecutionEventPayload;
  } | null>(null);
  const [copiedCoT, setCopiedCoT] = useState<boolean>(false);

  const liveMetrics = useMemo(
    () => tradeJournalEngine.calculateMetrics(liveRecords, 1000),
    [liveRecords]
  );

  const cotBundle = useMemo(
    () =>
      buildPostTradeCoTPrompt({
        metrics: liveMetrics,
        horizonWindow: "LIVE",
        lastRecord: liveRecords[0] ?? null,
      }),
    [liveMetrics, liveRecords]
  );

  const handleCopyCoTPrompt = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(cotBundle.promptText).catch(() => {});
    }
    setCopiedCoT(true);
    setTimeout(() => setCopiedCoT(false), 2000);
  };

  const formatRecordsForAi = (records: TradeJournalRecord[]): string => {
    if (records.length === 0) return "";
    return records
      .slice(0, 20)
      .map(
        (r, idx) =>
          `${idx + 1}. ${r.symbol} ${r.side} $${r.entryPrice} -> $${r.exitPrice} (${
            r.netGainPercent >= 0 ? "+" : ""
          }${r.netGainPercent.toFixed(2)}%, PnL: $${r.netPnl.toFixed(2)}, Motivo: ${r.exitReason})`
      )
      .join("\n");
  };

  const runJournalAnalysis = async (tradesText = "") => {
    setLoading(true);
    try {
      const effectiveTradesText =
        tradesText || formatRecordsForAi(tradeJournalEngine.getAllRecords());
      const res = await fetch("/api/ai/trade-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "journal_analyzer",
          params: { customTrades: effectiveTradesText },
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (e) {
      console.error("Erro ao analisar diário de trading:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runJournalAnalysis();

    const unsubJournal = tradeJournalEngine.subscribe((updated) => {
      setLiveRecords(updated);
    });

    const unsubExecutions = tradeJournalEngine.subscribeExecutionEvents((record, event) => {
      setLastLiveEvent({ record, event });
      // Atualiza automaticamente a análise tática quando um TP/SL é acionado em tempo real
      runJournalAnalysis(formatRecordsForAi(tradeJournalEngine.getAllRecords()));
    });

    return () => {
      unsubJournal();
      unsubExecutions();
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card/60 backdrop-blur-md p-4 rounded-xl border border-border/40">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BookOpenCheck className="w-4 h-4 text-cyan-400" />
            Analisador Psicológico & Tático do Diário de Trades
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Diagnóstico das últimas 20 operações para identificar vieses emocionais e erros de execução
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCustomInput(!showCustomInput)}
            className="text-xs border-border/60"
          >
            {showCustomInput ? "Usar Trades do Banco" : "Colar Trades Manualmente"}
          </Button>

          <Button
            onClick={() => runJournalAnalysis(showCustomInput ? customTrades : "")}
            disabled={loading}
            size="sm"
            className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Auditando..." : "Analisar Diário"}
          </Button>
        </div>
      </div>

      {/* Curva de Patrimônio em Tempo Real (Event-Driven BroadcastChannel / CustomEvent) */}
      <Card className="border-emerald-500/30 bg-card/60 backdrop-blur-md">
        <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-xs font-semibold text-emerald-400 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Curva de Patrimônio Acumulada em Tempo Real (Direct AI Trade & Live Fleet)
              <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-300 bg-emerald-500/10 font-mono">
                BroadcastChannel + CustomEvent
              </Badge>
            </CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground mt-0.5">
              Acumula novos pontos automaticamente assim que um Take-Profit ou Stop-Loss é acionado pelo motor algorítmico
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {lastLiveEvent && (
              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-300 bg-amber-500/10 font-mono">
                ⚡ {lastLiveEvent.event.source === "DIRECT_AI_TRADE" ? "Direct AI" : "Live Fleet"} •{" "}
                {lastLiveEvent.record.symbol} ({lastLiveEvent.event.triggerType || lastLiveEvent.record.exitReason}){" "}
                {lastLiveEvent.record.netPnl >= 0 ? "+" : ""}${lastLiveEvent.record.netPnl.toFixed(2)}
              </Badge>
            )}
            <span className="text-xs font-mono text-muted-foreground">
              Pontos: {liveMetrics.equityCurve.length} | Eficiência MFE:{" "}
              <strong className="text-cyan-400">
                {cotBundle.mfeCaptureEfficiencyPercent.toFixed(1)}%
              </strong>{" "}
              | Net PnL:{" "}
              <strong className={liveMetrics.totalNetPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {liveMetrics.totalNetPnl >= 0 ? "+" : ""}${liveMetrics.totalNetPnl.toFixed(2)}
              </strong>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyCoTPrompt}
              className="h-7 text-xs border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/15 font-mono"
            >
              {copiedCoT ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                  Prompt CoT Copiado
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Copiar Prompt CoT
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="w-full h-36 relative bg-background/60 rounded-lg border border-border/50 p-2 flex items-center justify-center overflow-hidden">
            {liveMetrics.equityCurve.length <= 1 ? (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Aguardando eventos de execução (TP/SL) do Direct AI Trade ou Live Fleet...
              </div>
            ) : (
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 800 140">
                {(() => {
                  const points = liveMetrics.equityCurve;
                  const equities = points.map((p) => p.equity);
                  const minEq = Math.min(...equities) * 0.998;
                  const maxEq = Math.max(...equities) * 1.002;
                  const range = maxEq - minEq || 1;
                  const coords = points.map((p, idx) => {
                    const x = (idx / (points.length - 1)) * 780 + 10;
                    const y = 130 - ((p.equity - minEq) / range) * 120;
                    return `${x},${y}`;
                  });
                  const isPositive = points[points.length - 1].equity >= points[0].equity;
                  const strokeColor = isPositive ? "#10b981" : "#f43f5e";
                  return (
                    <polyline
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth="2.5"
                      points={coords.join(" ")}
                    />
                  );
                })()}
              </svg>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Optional Custom Trades Input */}
      {showCustomInput && (
        <Card className="border-cyan-500/30 bg-card/70 backdrop-blur-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-cyan-300">
              Cole suas últimas 20 operações com entrada, saída e resultado:
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={4}
              value={customTrades}
              onChange={(e) => setCustomTrades(e.target.value)}
              placeholder="Ex: 1. BTC Long $67000->$68500 (+2.2%), 2. ETH Long $2500->$2460 (-1.6%), 3. SOL Short $180->$172 (+4.4%)..."
              className="text-xs bg-background/60 font-mono"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => runJournalAnalysis(customTrades)}
                disabled={loading || !customTrades.trim()}
                className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
              >
                Processar Operações
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-card/40 border border-border/40 animate-pulse"></div>
            ))}
          </div>
          <div className="h-64 rounded-xl bg-card/40 border border-border/40 animate-pulse"></div>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Performance Overview Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <Card className="border-border/40 bg-card/60 backdrop-blur-md emerald-border-glow">
              <CardContent className="p-3 space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase">PnL Consolidado</div>
                <div className="text-lg font-bold font-mono text-emerald-400">
                  {data.performanceOverview.totalPnL}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/60 backdrop-blur-md cyan-border-glow">
              <CardContent className="p-3 space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase">Taxa de Acerto</div>
                <div className="text-lg font-bold font-mono text-cyan-400">
                  {data.performanceOverview.winRate}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/60 backdrop-blur-md cyan-glow-sm">
              <CardContent className="p-3 space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase">Fator de Lucro</div>
                <div className="text-lg font-bold font-mono text-foreground">
                  {data.performanceOverview.profitFactor}x
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/60 backdrop-blur-md emerald-border-glow">
              <CardContent className="p-3 space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase">Ganho Médio</div>
                <div className="text-lg font-bold font-mono text-emerald-400">
                  {data.performanceOverview.averageWin}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/60 backdrop-blur-md rose-border-glow">
              <CardContent className="p-3 space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase">Perda Média</div>
                <div className="text-lg font-bold font-mono text-rose-400">
                  {data.performanceOverview.averageLoss}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recurring Mistakes & Behavioral Biases */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Erros Recorrentes */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-rose-400">
                  <AlertTriangle className="w-4 h-4" />
                  Erros Recorrentes Identificados
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Padrões viciosos que sabotam a curva de capital
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {data.recurringMistakes.map((err, i) => (
                  <div key={i} className="p-3 rounded bg-background/50 border border-border/30 space-y-1">
                    <div className="font-bold text-foreground">{err.mistake}</div>
                    <div className="text-[11px] text-rose-300 font-medium">Impacto: {err.impact}</div>
                    <p className="text-muted-foreground text-[11px] leading-relaxed pt-0.5">{err.diagnosis}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Vieses Comportamentais */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-400">
                  <Brain className="w-4 h-4" />
                  Vieses Psicológicos & Comportamentais
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Gatilhos cognitivos que afetam a tomada de decisão
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {data.behavioralBiases.map((bias, i) => (
                  <div key={i} className="p-3 rounded bg-background/50 border border-border/30 space-y-1">
                    <div className="flex items-center justify-between font-bold text-foreground">
                      <span>{bias.bias}</span>
                      <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">
                        Detectado
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground">Evidência: {bias.evidence}</div>
                    <p className="text-cyan-300 text-[11px] font-medium pt-0.5">Mitigação: {bias.mitigation}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Oportunidades Perdidas */}
          {data.missedOpportunities && data.missedOpportunities.length > 0 && (
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-cyan-400 flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Oportunidades Perdidas & Dinheiro Deixado na Mesa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {data.missedOpportunities.map((op, i) => (
                  <div key={i} className="p-2.5 rounded bg-background/50 border border-border/30 flex items-start justify-between gap-3">
                    <div className="text-muted-foreground">{op.situation}</div>
                    <div className="font-semibold text-emerald-400 shrink-0 text-right">{op.lesson}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* 3 REGRAS PERSONALIZADAS DE OURO */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-400" />
              3 Regras Personalizadas de Ouro para Consistência Imediata:
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.threeGoldenRules.map((rule) => (
                <Card
                  key={rule.ruleNumber}
                  className="border-emerald-500/30 bg-gradient-to-b from-card/90 to-card/60 backdrop-blur-md shadow-md"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/50 flex items-center justify-center text-xs font-bold">
                        {rule.ruleNumber}
                      </div>
                      <CardTitle className="text-sm font-bold text-foreground">
                        {rule.ruleTitle}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2.5 text-xs">
                    <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-900/30 font-medium text-emerald-300">
                      {rule.directive}
                    </div>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      <span className="font-semibold text-foreground">Como aplicar amanhã: </span>
                      {rule.application}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
