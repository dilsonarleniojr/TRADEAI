"use client";

import { useState, useEffect } from "react";
import { useCryptoStore, type BotInstance, type BotStrategy } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Brain,
  Sparkles,
  Zap,
  Clock,
  DollarSign,
  TrendingUp,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Activity,
  Grid,
  BarChart2,
  Sliders,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useShallow } from "zustand/react/shallow";
import { motion, AnimatePresence } from "framer-motion";
import { formatPrice } from "@/lib/format";

interface AIBotRecommendation {
  id: string;
  name: string;
  symbol: string;
  strategy: string;
  allocationAmount: number;
  allocationPct: number;
  operationalTimeframe: string;
  estimatedDuration: string;
  timeHorizonType: "SCALPING" | "DAY_TRADE" | "SWING_TRADE";
  takeProfit: number;
  stopLoss: number;
  trailingStop: boolean;
  trailingStopDistance: number;
  confidenceScore: number;
  marketRegime: string;
  technicalReasoning: string;
  riskRewardRatio: string;
}

interface AIBotRecommendationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCustomEdit?: (bot: BotInstance) => void;
}

export function AIBotRecommendationsDialog({
  open,
  onOpenChange,
  onCustomEdit,
}: AIBotRecommendationsDialogProps) {
  const { tickers, portfolio, tradingMode, addBot, toggleBotActive } = useCryptoStore(
    useShallow((s) => ({
      tickers: s.tickers,
      portfolio: s.portfolio,
      tradingMode: s.tradingMode,
      addBot: s.addBot,
      toggleBotActive: s.toggleBotActive,
    }))
  );

  const { toast } = useToast();
  const [recommendations, setRecommendations] = useState<AIBotRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedHorizon, setSelectedHorizon] = useState<"ALL" | "SCALPING" | "DAY_TRADE" | "SWING_TRADE">("ALL");
  const [editedAmounts, setEditedAmounts] = useState<Record<string, number>>({});
  const [addingId, setAddingId] = useState<string | null>(null);

  const fetchRecommendations = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/ai/bot-recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketData: tickers,
          cashBalance: portfolio.cashBalance,
          tradingMode,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.recommendations)) {
        setRecommendations(data.recommendations);
        const amounts: Record<string, number> = {};
        data.recommendations.forEach((r: AIBotRecommendation) => {
          amounts[r.id] = r.allocationAmount;
        });
        setEditedAmounts(amounts);
      } else {
        throw new Error(data.error || "Falha ao obter sugestões");
      }
    } catch (err: any) {
      toast({
        title: "Erro ao consultar IA",
        description: err.message || "Não foi possível carregar as sugestões.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchRecommendations();
    }
  }, [open]);

  const handleAmountChange = (recId: string, val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setEditedAmounts((prev) => ({ ...prev, [recId]: num }));
    }
  };

  const handleApplyBot = (rec: AIBotRecommendation, activateImmediately: boolean) => {
    setAddingId(rec.id);
    try {
      const finalAmount = editedAmounts[rec.id] || rec.allocationAmount;

      const newBotId = addBot({
        name: rec.name,
        symbol: rec.symbol,
        strategy: rec.strategy as BotStrategy,
        allocationAmount: finalAmount,
        takeProfit: rec.takeProfit,
        stopLoss: rec.stopLoss,
        trailingStop: rec.trailingStop,
        trailingStopDistance: rec.trailingStopDistance,
        active: activateImmediately,
        useEnsemble: rec.strategy === "QUANT_ENSEMBLE",
        useMarketRegime: true,
      });

      if (activateImmediately) {
        toggleBotActive(newBotId, true);
      }

      toast({
        title: activateImmediately ? "🚀 Robô IA Ativado!" : "✅ Robô Adicionado à Frota",
        description: `${rec.name} (${rec.symbol.replace("USDT", "")}) criado com montante de $${finalAmount} USDT e tempo ${rec.estimatedDuration}.`,
      });

      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Erro ao criar robô",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setAddingId(null);
    }
  };

  const filtered = recommendations.filter((r) => {
    if (selectedHorizon === "ALL") return true;
    return r.timeHorizonType === selectedHorizon;
  });

  const getStrategyIcon = (strat: string) => {
    switch (strat) {
      case "QUANT_ENSEMBLE":
        return <Brain className="w-4 h-4 text-crypto-cyan" />;
      case "MACD":
        return <Activity className="w-4 h-4 text-purple-400" />;
      case "RSI":
        return <TrendingUp className="w-4 h-4 text-emerald-400" />;
      case "GRID":
        return <Grid className="w-4 h-4 text-amber-400" />;
      case "BREAKOUT":
        return <Zap className="w-4 h-4 text-yellow-400" />;
      default:
        return <BarChart2 className="w-4 h-4 text-blue-400" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-4xl lg:max-w-5xl h-[88vh] max-h-[92vh] flex flex-col p-6 bg-[#0a0f1d]/95 backdrop-blur-2xl border-white/[0.1] text-foreground shadow-2xl overflow-hidden">
        <DialogHeader className="shrink-0 space-y-2.5 pb-2.5 border-b border-white/[0.06] pr-16">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)] shrink-0">
                <Brain className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2 flex-wrap">
                  <span>Sugestões de IA Especialista</span>
                  <Badge variant="outline" className="border-cyan-500/40 text-cyan-400 bg-cyan-500/10 text-[10px] font-semibold">
                    <Sparkles className="w-2.5 h-2.5 mr-1" />
                    Montante & Tempo Otimizados
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  A IA analisa volume, momentum e volatilidade do mercado atual para recomendar estratégias, capital de entrada ideal e duração estimada.
                </DialogDescription>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchRecommendations}
              disabled={isLoading}
              className="h-8 gap-1.5 border-white/[0.1] hover:bg-white/[0.05] text-xs font-medium cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Recalcular com IA
            </Button>
          </div>

          {/* Quick Context Bar */}
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-muted-foreground">Saldo Disponível:</span>
              <span className="font-mono font-bold text-emerald-400">
                ${formatPrice(portfolio.cashBalance)} USDT
              </span>
              <span className="text-muted-foreground/40">|</span>
              <span className="text-muted-foreground">Modo:</span>
              <Badge
                variant="outline"
                className={`text-[10px] font-semibold ${
                  tradingMode === "live"
                    ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                    : "border-cyan-500/40 text-cyan-400 bg-cyan-500/10"
                }`}
              >
                {tradingMode === "live" ? "Real (Binance)" : "Simulado (Paper)"}
              </Badge>
            </div>

            {/* Time Horizon Filter */}
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={selectedHorizon === "ALL" ? "secondary" : "ghost"}
                className="h-6 text-[10px] px-2"
                onClick={() => setSelectedHorizon("ALL")}
              >
                Todos
              </Button>
              <Button
                size="sm"
                variant={selectedHorizon === "SCALPING" ? "secondary" : "ghost"}
                className="h-6 text-[10px] px-2 text-cyan-400"
                onClick={() => setSelectedHorizon("SCALPING")}
              >
                ⚡ Scalping (15m)
              </Button>
              <Button
                size="sm"
                variant={selectedHorizon === "DAY_TRADE" ? "secondary" : "ghost"}
                className="h-6 text-[10px] px-2 text-purple-400"
                onClick={() => setSelectedHorizon("DAY_TRADE")}
              >
                📈 Day Trade (1h-4h)
              </Button>
              <Button
                size="sm"
                variant={selectedHorizon === "SWING_TRADE" ? "secondary" : "ghost"}
                className="h-6 text-[10px] px-2 text-amber-400"
                onClick={() => setSelectedHorizon("SWING_TRADE")}
              >
                🌊 Swing (1d+)
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1.5 space-y-4 pt-3">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-sm font-medium text-foreground">
                Analisando livros de ofertas, ATR e momentos de reversão...
              </p>
              <p className="text-xs text-muted-foreground">
                Calculando tamanho de posição e horizonte temporal ideal para cada ativo.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-xs">
              Nenhuma recomendação disponível para este filtro no momento. Clique em Recalcular.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
              {filtered.map((rec) => {
                const currentVal = editedAmounts[rec.id] !== undefined ? editedAmounts[rec.id] : rec.allocationAmount;
                const isAdding = addingId === rec.id;

                return (
                  <Card
                    key={rec.id}
                    className="relative overflow-hidden bg-card/50 border border-white/[0.08] hover:border-cyan-500/40 transition-all duration-200 shadow-md group"
                  >
                    {/* Top Confidence Bar */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-emerald-400" />

                    <CardContent className="p-4 space-y-3.5 pt-4">
                      {/* Title & Symbol */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-foreground group-hover:text-cyan-400 transition-colors">
                              {rec.name}
                            </span>
                            <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 bg-cyan-500/10 text-[10px] font-semibold">
                              {rec.symbol.replace("USDT", "")}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 flex items-center gap-1 bg-white/[0.05]">
                              {getStrategyIcon(rec.strategy)}
                              {rec.strategy}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-bold">
                              {rec.confidenceScore}% Confiança
                            </Badge>
                          </div>
                        </div>

                        {/* Time Horizon Pill */}
                        <div className="text-right shrink-0">
                          <Badge className="bg-purple-500/15 border-purple-500/30 text-purple-300 text-[10px] flex items-center gap-1">
                            <Clock className="w-3 h-3 text-purple-400" />
                            {rec.operationalTimeframe}
                          </Badge>
                        </div>
                      </div>

                      {/* Montante & Tempo — Destaque Principal Solicitado */}
                      <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-black/30 border border-white/[0.06]">
                        {/* 1. Montante de Entrada */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
                            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                              <DollarSign className="w-3 h-3" />
                              Montante de Entrada
                            </span>
                            <span className="text-[9px] text-muted-foreground">{rec.allocationPct}% da banca</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground font-mono">$</span>
                            <Input
                              type="number"
                              min="10"
                              max={Math.max(100, portfolio.cashBalance)}
                              value={currentVal}
                              onChange={(e) => handleAmountChange(rec.id, e.target.value)}
                              className="h-7 text-xs font-mono font-bold bg-white/[0.05] border-white/[0.1] text-emerald-400 px-2 w-24"
                            />
                            <span className="text-[10px] text-muted-foreground font-mono">USDT</span>
                          </div>
                        </div>

                        {/* 2. Tempo de Operação */}
                        <div className="space-y-1 border-l border-white/[0.07] pl-2.5">
                          <span className="text-[10px] text-purple-400 font-semibold flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Tempo Estimado
                          </span>
                          <p className="text-xs font-semibold text-foreground truncate" title={rec.estimatedDuration}>
                            {rec.estimatedDuration}
                          </p>
                          <span className="text-[9px] text-muted-foreground block">
                            Gráfico base: {rec.operationalTimeframe}
                          </span>
                        </div>
                      </div>

                      {/* Parâmetros de Lucro e Proteção */}
                      <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                        <div className="bg-white/[0.02] p-1.5 rounded-md border border-white/[0.05]">
                          <span className="text-muted-foreground text-[9px] block">Take Profit</span>
                          <span className="font-bold text-emerald-400 font-mono">+{rec.takeProfit}%</span>
                        </div>
                        <div className="bg-white/[0.02] p-1.5 rounded-md border border-white/[0.05]">
                          <span className="text-muted-foreground text-[9px] block">Stop Loss</span>
                          <span className="font-bold text-rose-400 font-mono">-{rec.stopLoss}%</span>
                        </div>
                        <div className="bg-white/[0.02] p-1.5 rounded-md border border-white/[0.05]">
                          <span className="text-muted-foreground text-[9px] block">Risco/Retorno</span>
                          <span className="font-bold text-cyan-400 font-mono">{rec.riskRewardRatio}</span>
                        </div>
                      </div>

                      {/* Racional Técnico da IA */}
                      <p className="text-[11px] text-muted-foreground/90 line-clamp-2 leading-relaxed bg-white/[0.02] p-2 rounded-md border border-white/[0.04]">
                        🧠 <span className="font-medium text-foreground/90">Análise IA:</span> {rec.technicalReasoning}
                      </p>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={() => handleApplyBot(rec, true)}
                          disabled={isAdding}
                          className="flex-1 h-8 text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-sm shadow-emerald-500/20 cursor-pointer min-w-0"
                        >
                          <Zap className="w-3.5 h-3.5 mr-1 shrink-0 fill-current" />
                          <span className="truncate">Ativar Robô Agora</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApplyBot(rec, false)}
                          disabled={isAdding}
                          className="h-8 text-xs font-semibold border-white/[0.1] hover:bg-white/[0.05] cursor-pointer shrink-0 whitespace-nowrap"
                          title="Adicionar à frota pausado para revisar antes"
                        >
                          Salvar Pausado
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
