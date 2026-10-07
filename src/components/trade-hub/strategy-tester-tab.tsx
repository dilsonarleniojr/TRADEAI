"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  FlaskConical,
  TrendingUp,
  Percent,
  Activity,
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  RefreshCw,
  Sliders,
  Sparkles,
} from "lucide-react";

interface StrategyTesterData {
  strategyName: string;
  symbol: string;
  period: string;
  metrics: {
    winRate: number;
    profitFactor: number;
    maxDrawdown: number;
    totalTrades: number;
    expectedValue: number;
    sharpeRatio: number;
  };
  performanceVerdict: string;
  detailedAnalysis: string;
  weaknessesIdentified: string[];
  suggestedImprovements: Array<{
    improvement: string;
    expectedImpact: string;
    implementation: string;
  }>;
}

export function StrategyTesterTab() {
  const [strategyName, setStrategyName] = useState<string>("Crossover de Média Móvel (EMA 9/21)");
  const [symbol, setSymbol] = useState<string>("BTCUSDT");
  const [period, setPeriod] = useState<string>("Últimos 90 dias");
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<StrategyTesterData | null>(null);

  const predefinedStrategies = [
    "Crossover de Média Móvel (EMA 9/21)",
    "Divergência de RSI + Suporte Institucional",
    "Rompimento de Bandas de Bollinger com Volume",
    "Reversão à Média Quant (Z-Score)",
  ];

  const runBacktest = async (strat = strategyName, sym = symbol, per = period) => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/trade-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "strategy_tester",
          params: { strategyName: strat, symbol: sym, period: per },
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (e) {
      console.error("Erro no teste de estratégia:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runBacktest();
  }, []);

  return (
    <div className="space-y-6">
      {/* Strategy Selector Panel */}
      <div className="bg-card/60 backdrop-blur-md p-4 rounded-xl border border-border/40 space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-cyan-400" />
              Laboratório de Backtesting Quantitativo
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Avaliação de métricas de performance e diagnóstico de melhorias algorítmicas
            </p>
          </div>

          <Button
            onClick={() => runBacktest()}
            disabled={loading}
            size="sm"
            className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium self-end md:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Calculando..." : "Executar Backtest"}
          </Button>
        </div>

        {/* Quick Strategy Pills */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-border/30">
          {predefinedStrategies.map((strat) => (
            <Button
              key={strat}
              variant={strategyName === strat ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setStrategyName(strat);
                runBacktest(strat, symbol, period);
              }}
              className={strategyName === strat ? "bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium" : "text-xs"}
            >
              {strat}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-card/40 border border-border/40 animate-pulse"></div>
            ))}
          </div>
          <div className="h-60 rounded-xl bg-card/40 border border-border/40 animate-pulse"></div>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Taxa de Vitória */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardContent className="p-4 space-y-1">
                <div className="text-[11px] text-muted-foreground uppercase flex items-center justify-between">
                  <span>Taxa de Vitória</span>
                  <Percent className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div className="text-2xl font-bold font-mono text-emerald-400">
                  {data.metrics.winRate}%
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {data.metrics.totalTrades} operações simuladas
                </div>
              </CardContent>
            </Card>

            {/* Fator de Lucro */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardContent className="p-4 space-y-1">
                <div className="text-[11px] text-muted-foreground uppercase flex items-center justify-between">
                  <span>Fator Lucro (PF)</span>
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold font-mono text-cyan-400">
                  {data.metrics.profitFactor}x
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Ganhos brutos / Perdas brutas
                </div>
              </CardContent>
            </Card>

            {/* Redução Máxima */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardContent className="p-4 space-y-1">
                <div className="text-[11px] text-muted-foreground uppercase flex items-center justify-between">
                  <span>Redução Máxima</span>
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                </div>
                <div className="text-2xl font-bold font-mono text-rose-400">
                  -{data.metrics.maxDrawdown}%
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Pico até o vale na curva de capital
                </div>
              </CardContent>
            </Card>

            {/* Sharpe Ratio */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardContent className="p-4 space-y-1">
                <div className="text-[11px] text-muted-foreground uppercase flex items-center justify-between">
                  <span>Sharpe Ratio</span>
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-2xl font-bold font-mono text-amber-300">
                  {data.metrics.sharpeRatio}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Retorno ajustado à volatilidade
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Diagnosis */}
          <Card className="border-border/40 bg-card/60 backdrop-blur-md">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground">
                  Diagnóstico de Desempenho & Gargalos
                </CardTitle>
                <Badge className="bg-cyan-950/60 border border-cyan-800/40 text-cyan-300 text-xs">
                  {data.performanceVerdict}
                </Badge>
              </div>
              <CardDescription className="text-xs text-muted-foreground pt-1">
                {data.detailedAnalysis}
              </CardDescription>
            </CardHeader>

            {data.weaknessesIdentified && data.weaknessesIdentified.length > 0 && (
              <CardContent className="pt-2 pb-4">
                <div className="space-y-2 border-t border-border/30 pt-3">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase">
                    Vulnerabilidades Mapeadas Durante o Teste:
                  </div>
                  {data.weaknessesIdentified.map((weak, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded bg-rose-950/15 border border-rose-900/30 text-rose-300 text-xs flex items-center gap-2"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{weak}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          {/* 3 Suggested Improvements */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              3 Melhorias Sugeridas para Elevar o Desempenho Imediatamente:
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.suggestedImprovements.map((imp, idx) => (
                <Card key={idx} className="border-border/40 bg-card/70 backdrop-blur-md">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/50 flex items-center justify-center text-[10px] font-bold">
                        {idx + 1}
                      </div>
                      <CardTitle className="text-xs font-bold text-foreground leading-snug">
                        {imp.improvement}
                      </CardTitle>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 mt-1 self-start">
                      Impacto: {imp.expectedImpact}
                    </Badge>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground leading-relaxed">
                    <p className="p-2.5 rounded bg-background/50 border border-border/30">
                      {imp.implementation}
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
