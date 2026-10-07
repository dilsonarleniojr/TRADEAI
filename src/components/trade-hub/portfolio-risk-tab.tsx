"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  Scale,
  Percent,
  CheckCircle2,
  PieChart,
} from "lucide-react";

interface PortfolioRiskData {
  portfolioSummary: {
    totalValueUsd: number;
    riskScore: number;
    herfindahlIndex: string;
    effectiveLeverage: string;
  };
  overexposureAreas: Array<{
    asset: string;
    currentWeight: string;
    recommendedWeight: string;
    riskReason: string;
  }>;
  weakPositions: Array<{
    asset: string;
    vulnerability: string;
  }>;
  hiddenCorrelations: Array<{
    pair: string;
    correlationCoefficient: number;
    explanation: string;
  }>;
  stressTestSimulation: {
    scenario: string;
    estimatedLossUsd: number;
    estimatedLossPercent: number;
    mostImpactedAsset: string;
    safeHavenAsset: string;
  };
  rebalancingAndHedgingPlan: Array<{
    action: string;
    detail: string;
  }>;
}

export function PortfolioRiskTab() {
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<PortfolioRiskData | null>(null);

  const runRiskAudit = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/trade-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "portfolio_risk", params: {} }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (e) {
      console.error("Erro na avaliação de risco do portfólio:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runRiskAudit();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card/60 backdrop-blur-md p-4 rounded-xl border border-border/40">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            Auditoria Quantitativa de Risco & Stress Test
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Diagnóstico de superexposição, correlações sistêmicas e simulação de choque de mercado
          </p>
        </div>

        <Button
          onClick={() => runRiskAudit()}
          disabled={loading}
          size="sm"
          className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Auditando..." : "Reavaliar Carteira"}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-card/40 border border-border/40 animate-pulse"></div>
            ))}
          </div>
          <div className="h-64 rounded-xl bg-card/40 border border-border/40 animate-pulse"></div>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Top Risk Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardContent className="p-4 space-y-1">
                <div className="text-[11px] text-muted-foreground uppercase">Índice de Risco Global</div>
                <div className="text-2xl font-bold font-mono text-amber-400">
                  {data.portfolioSummary.riskScore}/100
                </div>
                <div className="text-[10px] text-muted-foreground">Classificação Moderada/Alta</div>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardContent className="p-4 space-y-1">
                <div className="text-[11px] text-muted-foreground uppercase">Concentração (Herfindahl)</div>
                <div className="text-sm font-bold text-foreground">
                  {data.portfolioSummary.herfindahlIndex}
                </div>
                <div className="text-[10px] text-muted-foreground">Distribuição ponderada de ativos</div>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardContent className="p-4 space-y-1">
                <div className="text-[11px] text-muted-foreground uppercase">Alavancagem Efetiva</div>
                <div className="text-sm font-bold text-emerald-400">
                  {data.portfolioSummary.effectiveLeverage}
                </div>
                <div className="text-[10px] text-muted-foreground">Exposição controlada em spot</div>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardContent className="p-4 space-y-1">
                <div className="text-[11px] text-muted-foreground uppercase">Valor Auditado</div>
                <div className="text-2xl font-bold font-mono text-cyan-400">
                  ${data.portfolioSummary.totalValueUsd.toLocaleString()}
                </div>
                <div className="text-[10px] text-muted-foreground">Base consolidada da carteira</div>
              </CardContent>
            </Card>
          </div>

          {/* Stress Test Simulation Card (-20% Market Crash) */}
          <Card className="border-rose-500/40 bg-gradient-to-r from-rose-950/20 via-card/70 to-card/70 backdrop-blur-md shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-rose-950/50 border border-rose-800/40 text-rose-400">
                    <TrendingDown className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-rose-300">
                      Simulação de Choque de Mercado (Stress Test: -20%)
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Projeção algorítmica de perda sob cenário de venda em massa e liquidações em cascata
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="destructive" className="font-mono text-xs">
                  {data.stressTestSimulation.estimatedLossPercent}% Queda Estimada
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-background/50 border border-border/40 font-mono">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Perda Financeira Projetada</div>
                  <div className="text-lg font-bold text-rose-400">
                    ${data.stressTestSimulation.estimatedLossUsd.toLocaleString()} USD
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Ativo / Setor Mais Prejudicado</div>
                  <div className="text-xs font-semibold text-foreground mt-1">
                    {data.stressTestSimulation.mostImpactedAsset}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Colchão de Proteção Seguro</div>
                  <div className="text-xs font-semibold text-emerald-400 mt-1">
                    {data.stressTestSimulation.safeHavenAsset}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Overexposure & Weak Positions & Hidden Correlations */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Superexposição */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Áreas de Superexposição
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {data.overexposureAreas.map((area, i) => (
                  <div key={i} className="p-2.5 rounded bg-background/50 border border-border/30 space-y-1">
                    <div className="flex items-center justify-between font-semibold text-foreground">
                      <span>{area.asset}</span>
                      <span className="text-amber-400 font-mono">{area.currentWeight} → {area.recommendedWeight}</span>
                    </div>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">{area.riskReason}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Posições Fracas */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-rose-400 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  Posições Fracas / Vulneráveis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {data.weakPositions.map((pos, i) => (
                  <div key={i} className="p-2.5 rounded bg-background/50 border border-border/30 space-y-1">
                    <div className="font-semibold text-foreground">{pos.asset}</div>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">{pos.vulnerability}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Correlações Ocultas */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-cyan-400 flex items-center gap-2">
                  <Scale className="w-4 h-4" />
                  Correlações Ocultas Detectadas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {data.hiddenCorrelations.map((corr, i) => (
                  <div key={i} className="p-2.5 rounded bg-background/50 border border-border/30 space-y-1">
                    <div className="flex items-center justify-between font-semibold text-foreground">
                      <span>{corr.pair}</span>
                      <Badge variant="outline" className="text-[10px] font-mono text-cyan-300">
                        {corr.correlationCoefficient}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">{corr.explanation}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Rebalancing & Hedging Plan */}
          <Card className="border-border/40 bg-card/70 backdrop-blur-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Estratégia de Rebalanceamento & Cobertura Recomendada
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Ações concretas projetadas para resistir à volatilidade e preservar o patrimônio líquido
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {data.rebalancingAndHedgingPlan.map((plan, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg bg-background/60 border border-border/40 space-y-1.5 text-xs"
                  >
                    <div className="font-bold text-foreground text-cyan-300 flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-cyan-950 text-cyan-400 flex items-center justify-center text-[10px]">
                        {i + 1}
                      </span>
                      {plan.action}
                    </div>
                    <p className="text-muted-foreground leading-relaxed text-[11px]">{plan.detail}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
