"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useCryptoStore } from "@/lib/store";
import {
  LineChart,
  Search,
  TrendingUp,
  TrendingDown,
  MinusCircle,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Bot,
  Layers,
  Activity,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

interface TechnicalAnalysisData {
  symbol: string;
  signal: "COMPRAR" | "MANTER" | "VENDER";
  signalStrength: string;
  confidence: number;
  summary: string;
  supportResistance: {
    keySupport1: number;
    keySupport2: number;
    keyResistance1: number;
    keyResistance2: number;
    zonesDescription: string;
  };
  trendAnalysis: {
    trendDirection: string;
    structure: string;
    movingAveragesVerdict: string;
  };
  momentumIndicators: {
    rsiStatus: string;
    macdStatus: string;
    volumeInterpretation: string;
  };
  stepByStepReasoning: string[];
  actionablePlan: {
    recommendedAction: string;
    entryZone: string;
    invalidationLevel: string;
  };
}

export function TechnicalAnalystTab() {
  const [symbolInput, setSymbolInput] = useState<string>("BTCUSDT");
  const [activeSymbol, setActiveSymbol] = useState<string>("BTCUSDT");
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<TechnicalAnalysisData | null>(null);

  const setSelectedSymbol = useCryptoStore((state) => state.setSelectedSymbol);
  const setActiveSection = useCryptoStore((state) => state.setActiveSection);

  const runAnalysis = async (sym = activeSymbol) => {
    const formatted = sym.trim().toUpperCase();
    if (!formatted) return;
    setLoading(true);
    setActiveSymbol(formatted);
    try {
      const res = await fetch("/api/ai/trade-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "technical_analyst", params: { symbol: formatted } }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (e) {
      console.error("Erro na análise técnica automatizada:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAnalysis("BTCUSDT");
  }, []);

  const quickPills = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "NEARUSDT", "AVAXUSDT"];

  const handleOpenChart = () => {
    if (data?.symbol) {
      setSelectedSymbol(data.symbol);
      setActiveSection("chart");
    }
  };

  const handleCreateBot = () => {
    if (data?.symbol) {
      setSelectedSymbol(data.symbol);
      setActiveSection("bot");
    }
  };

  return (
    <div className="space-y-6">
      {/* Ticker Selector & Search */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-card/60 backdrop-blur-md p-4 rounded-xl border border-border/40">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <span className="text-xs font-medium text-muted-foreground mr-1">Pares Rápidos:</span>
          {quickPills.map((sym) => (
            <Button
              key={sym}
              variant={activeSymbol === sym ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSymbolInput(sym);
                runAnalysis(sym);
              }}
              className={activeSymbol === sym ? "bg-cyan-600 hover:bg-cyan-500 text-white font-medium" : "text-xs h-8"}
            >
              {sym}
            </Button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            runAnalysis(symbolInput);
          }}
          className="flex items-center gap-2 w-full md:w-auto"
        >
          <div className="relative flex-1 md:w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              placeholder="Ex: SOLUSDT"
              className="pl-8 h-9 text-xs font-mono uppercase bg-background/60"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            size="sm"
            className="bg-cyan-600 hover:bg-cyan-500 text-white h-9 px-4 text-xs font-medium"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Analisando..." : "Avaliar Ticker"}
          </Button>
        </form>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-40 rounded-xl bg-card/40 border border-border/40 animate-pulse p-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-60 rounded-xl bg-card/40 border border-border/40 animate-pulse p-6"></div>
            <div className="h-60 rounded-xl bg-card/40 border border-border/40 animate-pulse p-6"></div>
          </div>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Main Verdict Card */}
          <Card className="overflow-hidden border-border/50 bg-gradient-to-r from-card/90 via-card/60 to-card/90 backdrop-blur-md shadow-lg">
            <div
              className={`h-1.5 w-full ${
                data.signal === "COMPRAR"
                  ? "bg-emerald-500"
                  : data.signal === "VENDER"
                  ? "bg-rose-500"
                  : "bg-amber-500"
              }`}
            />
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-800/40 text-cyan-400">
                    <Activity className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black tracking-tight">{data.symbol}</span>
                      <Badge variant="outline" className="text-xs border-border/60">
                        Diário (D1) & Semanal (W1)
                      </Badge>
                    </div>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      {data.summary}
                    </CardDescription>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-start sm:self-auto">
                  <div className="text-right">
                    <div className="text-[10px] text-muted-foreground uppercase font-mono">Grau de Confiança</div>
                    <div className="text-sm font-bold text-foreground font-mono">{data.confidence}%</div>
                  </div>
                  <Badge
                    className={`text-sm py-1.5 px-3.5 font-bold flex items-center gap-1.5 ${
                      data.signal === "COMPRAR"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                        : data.signal === "VENDER"
                        ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                    }`}
                  >
                    {data.signal === "COMPRAR" ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : data.signal === "VENDER" ? (
                      <TrendingDown className="w-4 h-4" />
                    ) : (
                      <MinusCircle className="w-4 h-4" />
                    )}
                    {data.signal} ({data.signalStrength})
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-2 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-background/50 border border-border/40">
                <div className="text-xs space-y-1">
                  <span className="font-semibold text-foreground">Plano Acionável Imediato: </span>
                  <span className="text-cyan-300 font-medium">{data.actionablePlan.recommendedAction}</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-muted-foreground">Zona de Entrada:</span>
                  <span className="font-bold text-foreground bg-muted/30 px-2 py-0.5 rounded">
                    {data.actionablePlan.entryZone}
                  </span>
                  <span className="text-muted-foreground ml-2">Invalidação:</span>
                  <span className="font-bold text-rose-400 bg-rose-950/20 px-2 py-0.5 rounded border border-rose-900/30">
                    {data.actionablePlan.invalidationLevel}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Indicators Matrix Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Suporte e Resistência */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-cyan-400">
                  <ShieldAlert className="w-4 h-4" />
                  Zonas de Suporte & Resistência
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div className="p-2 rounded bg-background/50 border border-border/30">
                    <div className="text-[10px] text-muted-foreground">Suporte 1 (S1)</div>
                    <div className="font-bold text-emerald-400">${data.supportResistance.keySupport1}</div>
                  </div>
                  <div className="p-2 rounded bg-background/50 border border-border/30">
                    <div className="text-[10px] text-muted-foreground">Suporte 2 (S2)</div>
                    <div className="font-bold text-emerald-500">${data.supportResistance.keySupport2}</div>
                  </div>
                  <div className="p-2 rounded bg-background/50 border border-border/30">
                    <div className="text-[10px] text-muted-foreground">Resistência 1 (R1)</div>
                    <div className="font-bold text-rose-400">${data.supportResistance.keyResistance1}</div>
                  </div>
                  <div className="p-2 rounded bg-background/50 border border-border/30">
                    <div className="text-[10px] text-muted-foreground">Resistência 2 (R2)</div>
                    <div className="font-bold text-rose-500">${data.supportResistance.keyResistance2}</div>
                  </div>
                </div>
                <p className="text-muted-foreground leading-relaxed text-[11px]">
                  {data.supportResistance.zonesDescription}
                </p>
              </CardContent>
            </Card>

            {/* Tendência & Médias Móveis */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-emerald-400">
                  <TrendingUp className="w-4 h-4" />
                  Tendência & Médias Móveis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-background/50 border border-border/30">
                  <span className="text-muted-foreground">Direção da Tendência:</span>
                  <Badge variant="outline" className="font-semibold text-foreground border-border/60">
                    {data.trendAnalysis.trendDirection}
                  </Badge>
                </div>
                <div className="p-2.5 rounded bg-muted/20 border border-border/30 text-[11px] leading-relaxed">
                  <span className="font-semibold text-foreground block mb-0.5">Estrutura de Topos e Fundos:</span>
                  <p className="text-muted-foreground">{data.trendAnalysis.structure}</p>
                </div>
                <div className="p-2.5 rounded bg-muted/20 border border-border/30 text-[11px] leading-relaxed">
                  <span className="font-semibold text-foreground block mb-0.5">Médias Móveis (EMA 9, 21 / SMA 50):</span>
                  <p className="text-muted-foreground">{data.trendAnalysis.movingAveragesVerdict}</p>
                </div>
              </CardContent>
            </Card>

            {/* Momentum & Osciladores */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-400">
                  <Layers className="w-4 h-4" />
                  Indicadores de Momentum
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="p-2 rounded bg-background/50 border border-border/30 flex items-center justify-between">
                  <span className="text-muted-foreground">RSI (14 Períodos):</span>
                  <span className="font-bold text-foreground">{data.momentumIndicators.rsiStatus}</span>
                </div>
                <div className="p-2 rounded bg-background/50 border border-border/30 flex items-center justify-between">
                  <span className="text-muted-foreground">MACD & Histograma:</span>
                  <span className="font-bold text-foreground">{data.momentumIndicators.macdStatus}</span>
                </div>
                <div className="p-2.5 rounded bg-muted/20 border border-border/30 text-[11px] leading-relaxed">
                  <span className="font-semibold text-foreground block mb-0.5">Fluxo de Volume Institucional:</span>
                  <p className="text-muted-foreground">{data.momentumIndicators.volumeInterpretation}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Step-by-Step Reasoning & Quick Actions */}
          <Card className="border-border/40 bg-card/70 backdrop-blur-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                Raciocínio Passo a Passo do Sinal
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Transmissão transparente das 4 etapas de validação quantitativa da TradeAI
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.stepByStepReasoning.map((step, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-background/60 border border-border/40 flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed"
                  >
                    <div className="w-5 h-5 rounded-full bg-cyan-950/60 border border-cyan-800/40 text-cyan-300 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <span>{step}</span>
                  </div>
                ))}
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-border/40">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreateBot}
                  className="text-xs border-cyan-500/30 hover:border-cyan-500/60 text-cyan-400"
                >
                  <Bot className="w-3.5 h-3.5 mr-1.5" />
                  Automatizar em Robô
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleOpenChart}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Visualizar no Gráfico Interativo
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
