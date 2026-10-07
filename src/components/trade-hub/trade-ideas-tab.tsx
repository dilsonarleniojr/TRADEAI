"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCryptoStore } from "@/lib/store";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ShieldAlert,
  Target,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Bot,
  Zap,
} from "lucide-react";

interface TradeIdea {
  symbol: string;
  name: string;
  type: "LONG" | "SHORT";
  entryPrice: number;
  tp1: number;
  tp2: number;
  stopLoss: number;
  riskReward: number;
  winProbability: number;
  technicalReason: string;
  fundamentalReason: string;
  timeframe: string;
}

export function TradeIdeasTab() {
  const [category, setCategory] = useState<string>("all");
  const [loading, setLoading] = useState<boolean>(false);
  const [ideas, setIdeas] = useState<TradeIdea[]>([]);
  const [copiedSymbol, setCopiedSymbol] = useState<string | null>(null);

  const setSelectedSymbol = useCryptoStore((state) => state.setSelectedSymbol);
  const setActiveSection = useCryptoStore((state) => state.setActiveSection);

  const fetchIdeas = async (cat = category) => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/trade-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "trade_ideas", params: { category: cat } }),
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setIdeas(json.data);
      }
    } catch (e) {
      console.error("Erro ao buscar ideias de trade:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIdeas(category);
  }, [category]);

  const copySetup = (idea: TradeIdea) => {
    const text = `🎯 [TradeAI Setup - ${idea.symbol}]
Tipo: ${idea.type} (${idea.timeframe})
Entrada: $${idea.entryPrice}
Alvo 1: $${idea.tp1}
Alvo 2: $${idea.tp2}
Stop Loss: $${idea.stopLoss}
Risco/Retorno: ${idea.riskReward}:1 | Probabilidade: ${idea.winProbability}%
Técnico: ${idea.technicalReason}`;
    navigator.clipboard.writeText(text);
    setCopiedSymbol(idea.symbol);
    setTimeout(() => setCopiedSymbol(null), 2000);
  };

  const handleOpenChart = (symbol: string) => {
    setSelectedSymbol(symbol);
    setActiveSection("chart");
  };

  const handleCreateBot = (symbol: string) => {
    setSelectedSymbol(symbol);
    setActiveSection("bot");
  };

  return (
    <div className="space-y-6">
      {/* Category Filter & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card/60 backdrop-blur-md p-4 rounded-xl border border-border/40">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "all", label: "Todas as Oportunidades" },
            { id: "layer1", label: "Layer 1s & Majors" },
            { id: "defi", label: "DeFi Institucional" },
            { id: "ai", label: "IA & Big Data" },
          ].map((cat) => (
            <Button
              key={cat.id}
              variant={category === cat.id ? "default" : "outline"}
              size="sm"
              onClick={() => setCategory(cat.id)}
              className={category === cat.id ? "bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow-sm" : "text-muted-foreground"}
            >
              {cat.label}
            </Button>
          ))}
        </div>

        <Button
          onClick={() => fetchIdeas(category)}
          disabled={loading}
          variant="outline"
          size="sm"
          className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-950/40"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Escaneando Mercado..." : "Atualizar Oportunidades"}
        </Button>
      </div>

      {/* Grid of Setups */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-80 rounded-xl bg-card/40 border border-border/40 animate-pulse p-6 space-y-4">
              <div className="h-6 bg-muted/40 rounded w-1/2"></div>
              <div className="h-10 bg-muted/30 rounded"></div>
              <div className="h-24 bg-muted/20 rounded"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {ideas.map((idea, index) => {
            const isLong = idea.type === "LONG";
            return (
              <Card
                key={`${idea.symbol}-${index}`}
                className="group relative overflow-hidden border-border/50 bg-gradient-to-b from-card/90 to-card/40 backdrop-blur-md hover:border-cyan-500/50 transition-all duration-300 shadow-md hover:shadow-cyan-950/20"
              >
                {/* Header Strip */}
                <div
                  className={`h-1 w-full ${
                    isLong ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-lg text-foreground tracking-tight">{idea.symbol}</div>
                      <Badge variant="outline" className="text-xs text-muted-foreground border-border/60">
                        {idea.timeframe}
                      </Badge>
                    </div>
                    <Badge
                      className={`${
                        isLong
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                      } font-semibold flex items-center gap-1`}
                    >
                      {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {idea.type}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs flex items-center justify-between pt-1 text-muted-foreground">
                    <span>{idea.name}</span>
                    <span className="font-medium text-emerald-400/90">
                      Probabilidade: {idea.winProbability}%
                    </span>
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 text-xs">
                  {/* Prices & Targets Matrix */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-background/60 border border-border/40 font-mono">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">Entrada Sugerida</div>
                      <div className="font-bold text-sm text-foreground">${idea.entryPrice}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">Stop Loss</div>
                      <div className="font-bold text-sm text-rose-400">${idea.stopLoss}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">Alvo 1 (TP1)</div>
                      <div className="font-bold text-sm text-emerald-400">${idea.tp1}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">Alvo 2 (TP2)</div>
                      <div className="font-bold text-sm text-cyan-400">${idea.tp2}</div>
                    </div>
                  </div>

                  {/* R:R Ratio Highlight */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-cyan-950/20 border border-cyan-800/30 text-cyan-300 font-medium">
                    <span className="flex items-center gap-1 text-[11px]">
                      <Target className="w-3.5 h-3.5" />
                      Relação Risco-Recompensa:
                    </span>
                    <span className="font-bold text-xs font-mono">{idea.riskReward}:1</span>
                  </div>

                  {/* Reasons */}
                  <div className="space-y-2 text-[11px] leading-relaxed">
                    <div className="p-2 rounded bg-muted/20 border border-border/30">
                      <span className="font-semibold text-foreground block mb-0.5 text-[10px] uppercase text-cyan-400">
                        Insights Técnicos:
                      </span>
                      <p className="text-muted-foreground">{idea.technicalReason}</p>
                    </div>

                    <div className="p-2 rounded bg-muted/20 border border-border/30">
                      <span className="font-semibold text-foreground block mb-0.5 text-[10px] uppercase text-amber-400">
                        Insights Fundamentais:
                      </span>
                      <p className="text-muted-foreground">{idea.fundamentalReason}</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 flex items-center justify-between gap-2 border-t border-border/40">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copySetup(idea)}
                      className="text-xs text-muted-foreground hover:text-foreground h-8 px-2"
                      title="Copiar configuração"
                    >
                      {copiedSymbol === idea.symbol ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400 mr-1" />
                          Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 mr-1" />
                          Copiar
                        </>
                      )}
                    </Button>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCreateBot(idea.symbol)}
                        className="text-xs h-8 px-2.5 border-border/60 hover:border-cyan-500/50"
                      >
                        <Bot className="w-3.5 h-3.5 mr-1 text-cyan-400" />
                        Criar Bot
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleOpenChart(idea.symbol)}
                        className="text-xs h-8 px-2.5 bg-cyan-600 hover:bg-cyan-500 text-white"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1" />
                        Gráfico
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
