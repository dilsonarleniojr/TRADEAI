"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CalendarCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Target,
  Sparkles,
  ShieldAlert,
  Flame,
  ListChecks,
} from "lucide-react";

interface DailyPlanData {
  planTitle: string;
  symbol: string;
  traderStyle: string;
  dailyTargets: {
    dailyProfitTarget: string;
    dailyMaxLossLimit: string;
    maxTradesAllowed: number;
    recommendedLeverage: string;
  };
  timestampedChecklist: Array<{
    timeWindow: string;
    phase: string;
    actions: string[];
    goNoGoCriteria: string;
  }>;
  contingencyRules: string[];
}

export function DailyPlanTab() {
  const [primarySymbol, setPrimarySymbol] = useState<string>("BTCUSDT");
  const [traderStyle, setTraderStyle] = useState<string>("Day Trader");
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<DailyPlanData | null>(null);
  const [completedItems, setCompletedItems] = useState<Record<string, boolean>>({});

  const generatePlan = async (sym = primarySymbol, style = traderStyle) => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/trade-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "daily_plan",
          params: { primarySymbol: sym, traderStyle: style },
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (e) {
      console.error("Erro ao gerar plano de trading diário:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generatePlan();
  }, []);

  const toggleCheck = (id: string) => {
    setCompletedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      {/* Configuration Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card/60 backdrop-blur-md p-4 rounded-xl border border-border/40">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-cyan-400" />
            Plano Estruturado com Checklist por Carimbo de Tempo
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Rotina profissional passo a passo do Pré-Mercado ao Fechamento
          </p>
        </div>

        <div className="flex items-center gap-2">
          {["Day Trader", "Scalper", "Swing Trader"].map((style) => (
            <Button
              key={style}
              variant={traderStyle === style ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setTraderStyle(style);
                generatePlan(primarySymbol, style);
              }}
              className={traderStyle === style ? "bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium" : "text-xs"}
            >
              {style}
            </Button>
          ))}

          <Button
            onClick={() => generatePlan()}
            disabled={loading}
            size="sm"
            className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium ml-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Gerando..." : "Regerar Plano"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-28 rounded-xl bg-card/40 border border-border/40 animate-pulse"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 rounded-xl bg-card/40 border border-border/40 animate-pulse"></div>
            ))}
          </div>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Daily Risk and Target Guardrails */}
          <Card className="border-border/50 bg-gradient-to-r from-card/90 via-card/60 to-card/90 backdrop-blur-md shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-foreground">
                    {data.planTitle}
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Perfil: <span className="text-cyan-400 font-semibold">{data.traderStyle}</span> | Par de Referência: <span className="font-mono text-foreground font-semibold">{data.symbol}</span>
                  </CardDescription>
                </div>
                <Badge className="bg-cyan-950 text-cyan-300 border-cyan-800/40 text-xs">
                  Horário Oficial de Brasília (UTC-3)
                </Badge>
              </div>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-background/50 border border-border/40 font-mono text-xs">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Meta de Lucro Diária</div>
                  <div className="text-base font-bold text-emerald-400">
                    {data.dailyTargets.dailyProfitTarget}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Limite Máximo de Perda</div>
                  <div className="text-base font-bold text-rose-400">
                    {data.dailyTargets.dailyMaxLossLimit}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Máximo de Trades</div>
                  <div className="text-base font-bold text-foreground">
                    {data.dailyTargets.maxTradesAllowed} operações
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Alavancagem Recomendada</div>
                  <div className="text-xs font-semibold text-cyan-300 mt-1">
                    {data.dailyTargets.recommendedLeverage}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Interactive Checklist Timeline */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-cyan-400" />
                Checklist com Carimbo de Data/Hora (Siga Passo a Passo):
              </h4>
              <span className="text-xs text-muted-foreground">
                Concluídos:{" "}
                <span className="text-cyan-400 font-bold">
                  {Object.values(completedItems).filter(Boolean).length}
                </span>{" "}
                etapas
              </span>
            </div>

            <div className="space-y-4">
              {data.timestampedChecklist.map((phase, pIdx) => (
                <Card
                  key={pIdx}
                  className="border-border/40 bg-card/60 backdrop-blur-md overflow-hidden"
                >
                  <CardHeader className="pb-3 bg-muted/20 border-b border-border/30">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-md bg-cyan-950/60 border border-cyan-800/40 text-cyan-400">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-mono font-bold text-cyan-300">
                            {phase.timeWindow}
                          </div>
                          <div className="text-sm font-bold text-foreground">
                            {phase.phase}
                          </div>
                        </div>
                      </div>

                      <Badge variant="outline" className="text-[11px] self-start sm:self-auto border-border/60">
                        Critério Go / No-Go
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-3 pb-4 space-y-3">
                    {/* Action Items with Checkboxes */}
                    <div className="space-y-2">
                      {phase.actions.map((action, aIdx) => {
                        const itemId = `phase-${pIdx}-item-${aIdx}`;
                        const isChecked = !!completedItems[itemId];
                        return (
                          <div
                            key={aIdx}
                            onClick={() => toggleCheck(itemId)}
                            className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-start gap-3 text-xs ${
                              isChecked
                                ? "bg-emerald-950/20 border-emerald-900/40 text-muted-foreground line-through"
                                : "bg-background/50 border-border/30 text-foreground hover:border-cyan-500/40"
                            }`}
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleCheck(itemId)}
                              className="mt-0.5 data-[state=checked]:bg-emerald-600"
                            />
                            <span className="leading-relaxed">{action}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Go / No-Go Filter */}
                    <div className="p-2.5 rounded bg-muted/20 border border-border/30 text-[11px] flex items-start gap-2">
                      <span className="font-bold text-amber-400 shrink-0">Critério de Bloqueio:</span>
                      <span className="text-muted-foreground">{phase.goNoGoCriteria}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Contingency Rules */}
          {data.contingencyRules && data.contingencyRules.length > 0 && (
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-rose-400 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  Regras de Contingência & Gestão de Crise
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {data.contingencyRules.map((rule, i) => (
                  <div key={i} className="p-2.5 rounded bg-background/50 border border-border/30 text-muted-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                    <span>{rule}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Proveniência / Fontes */}
          <div className="p-3 rounded-xl bg-card/40 border border-border/30 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Fontes: Binance Spot Live API v3 • Pivot Points Clássicos D1 • TradeAI Checklist Quant
            </span>
            <span className="font-mono text-[11px]">Fuso Horário: GMT-3 (Brasília)</span>
          </div>
        </div>
      ) : (
        <Card className="border-border/60 bg-card/40 backdrop-blur-md p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto border border-cyan-500/20">
            <CalendarCheck className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-foreground">Plano Diário Não Disponível</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
              Clique abaixo para estruturar sua rotina de negociação diária com análise pré-mercado e critérios de execução.
            </p>
          </div>
          <Button
            onClick={() => generatePlan()}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium mx-auto"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Gerar Plano Diário Agora
          </Button>
        </Card>
      )}
    </div>
  );
}
