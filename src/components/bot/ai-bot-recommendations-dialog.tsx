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
import { Checkbox } from "@/components/ui/checkbox";
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
  Cpu,
  Layers,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useShallow } from "zustand/react/shallow";
import { motion, AnimatePresence } from "framer-motion";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  aiProvider: string;
  aiProviderName: string;
  aiModel: string;
}

interface ProviderSummaryItem {
  id: string;
  name: string;
  model: string;
  count: number;
  error?: string;
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
  const [providersSummary, setProvidersSummary] = useState<ProviderSummaryItem[]>([]);
  const [isMultiAi, setIsMultiAi] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedHorizon, setSelectedHorizon] = useState<"ALL" | "SCALPING" | "DAY_TRADE" | "SWING_TRADE">("ALL");
  const [selectedAiFilter, setSelectedAiFilter] = useState<string>("ALL");
  const [editedAmounts, setEditedAmounts] = useState<Record<string, number>>({});
  const [addingId, setAddingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [isApplyingBatch, setIsApplyingBatch] = useState(false);

  const fetchRecommendations = async () => {
    setIsLoading(true);
    setSelectedIds(new Set());
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
        setProvidersSummary(data.providers || []);
        setIsMultiAi(!!data.multiAi);

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

  // Mantém as recomendações já carregadas na sessão ao reabrir, buscando apenas se vazio
  useEffect(() => {
    if (open && recommendations.length === 0) {
      fetchRecommendations();
    }
  }, [open]);

  const handleAmountChange = (recId: string, val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setEditedAmounts((prev) => ({ ...prev, [recId]: num }));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (filteredItems: AIBotRecommendation[]) => {
    const unaddedFiltered = filteredItems.filter((r) => !addedIds.has(r.id)).map((r) => r.id);
    const allSelected = unaddedFiltered.length > 0 && unaddedFiltered.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unaddedFiltered));
    }
  };

  const handleApplySelected = (activateImmediately: boolean, itemsToApply: AIBotRecommendation[]) => {
    const targets = itemsToApply.filter((r) => selectedIds.has(r.id) && !addedIds.has(r.id));
    if (targets.length === 0) return;

    setIsApplyingBatch(true);
    let count = 0;
    const newAdded = new Set(addedIds);

    try {
      for (const rec of targets) {
        const finalAmount = editedAmounts[rec.id] !== undefined ? editedAmounts[rec.id] : rec.allocationAmount;
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
          aiEngine: `${rec.aiProviderName} (${rec.aiModel})`,
        });

        if (activateImmediately) {
          toggleBotActive(newBotId, true);
        }

        newAdded.add(rec.id);
        count++;
      }

      setAddedIds(newAdded);
      setSelectedIds(new Set());

      toast({
        title: activateImmediately ? `🚀 ${count} Robôs IA Ativados!` : `✅ ${count} Robôs Adicionados à Frota`,
        description: `${count} sugestões foram criadas com sucesso. O pop-up continua aberto para você conferir outras opções.`,
      });
    } catch (err: any) {
      toast({
        title: "Erro ao criar robôs",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsApplyingBatch(false);
    }
  };

  const handleApplyBot = (rec: AIBotRecommendation, activateImmediately: boolean) => {
    setAddingId(rec.id);
    try {
      const finalAmount = editedAmounts[rec.id] !== undefined ? editedAmounts[rec.id] : rec.allocationAmount;

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
        aiEngine: `${rec.aiProviderName} (${rec.aiModel})`,
      });

      if (activateImmediately) {
        toggleBotActive(newBotId, true);
      }

      setAddedIds((prev) => new Set(prev).add(rec.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(rec.id);
        return next;
      });

      toast({
        title: activateImmediately ? "🚀 Robô IA Ativado!" : "✅ Robô Adicionado à Frota",
        description: `${rec.name} (${rec.symbol.replace("USDT", "")}) criado com $${finalAmount} USDT. O pop-up permanece aberto para você escolher outras sugestões.`,
      });
      // Mantém o pop-up aberto para o usuário poder selecionar mais sugestões!
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

  // Filtragem combinada por horizonte de tempo E por motor de IA
  const filtered = recommendations.filter((r) => {
    if (selectedHorizon !== "ALL" && r.timeHorizonType !== selectedHorizon) return false;
    if (selectedAiFilter !== "ALL" && r.aiProvider !== selectedAiFilter) return false;
    return true;
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

  const getAiBadgeColor = (provider: string) => {
    switch (provider) {
      case "claude":
        return "border-purple-500/40 text-purple-300 bg-purple-500/15";
      case "gemini":
        return "border-blue-500/40 text-blue-300 bg-blue-500/15";
      case "openai":
        return "border-emerald-500/40 text-emerald-300 bg-emerald-500/15";
      case "qwen":
        return "border-orange-500/40 text-orange-300 bg-orange-500/15";
      default:
        return "border-cyan-500/40 text-cyan-300 bg-cyan-500/15";
    }
  };

  const getAiBorderAccent = (provider: string) => {
    switch (provider) {
      case "claude":
        return "hover:border-purple-500/50";
      case "gemini":
        return "hover:border-blue-500/50";
      case "openai":
        return "hover:border-emerald-500/50";
      case "qwen":
        return "hover:border-orange-500/50";
      default:
        return "hover:border-cyan-500/50";
    }
  };

  // Contagem por provedor
  const countsByProvider: Record<string, number> = {};
  recommendations.forEach((r) => {
    countsByProvider[r.aiProvider] = (countsByProvider[r.aiProvider] || 0) + 1;
  });

  const availableProviders = Array.from(new Set(recommendations.map((r) => r.aiProvider)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] sm:max-w-4xl lg:max-w-5xl h-[90vh] max-h-[94vh] flex flex-col p-6 bg-[#0a0f1d]/95 backdrop-blur-2xl border-white/[0.1] text-foreground shadow-2xl overflow-hidden">
        <DialogHeader className="shrink-0 space-y-3 pb-3 border-b border-white/[0.06] pr-16">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 via-purple-600/20 to-blue-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)] shrink-0">
                <Brain className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2 flex-wrap">
                  <span>Recomendações de IA Especialista</span>
                  {isMultiAi && (
                    <Badge variant="outline" className="border-purple-500/40 text-purple-300 bg-purple-500/15 text-[10px] font-semibold">
                      <Sparkles className="w-2.5 h-2.5 mr-1 text-purple-400" />
                      Multi-IA Simultâneo
                    </Badge>
                  )}
                  <Badge variant="outline" className="border-cyan-500/40 text-cyan-400 bg-cyan-500/10 text-[10px] font-semibold">
                    Montante & Tempo Otimizados
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Compare as sugestões geradas por cada IA em paralelo. Escolha o robô da sua preferência para ativar.
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

          {/* Quick Context & Balance Bar */}
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
              <span className="text-[10px] text-muted-foreground mr-1 hidden sm:inline">Horizonte:</span>
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

          {/* AI Providers Selection Bar (Multi-IA Selector) */}
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-black/40 border border-white/[0.08] text-xs flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 mr-1">
                <Cpu className="w-3.5 h-3.5 text-crypto-cyan" />
                Filtrar por IA:
              </span>

              {/* All AIs Tab */}
              <button
                type="button"
                onClick={() => setSelectedAiFilter("ALL")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5",
                  selectedAiFilter === "ALL"
                    ? "bg-white/[0.12] text-white border border-white/[0.2] shadow-sm"
                    : "text-muted-foreground hover:text-white hover:bg-white/[0.04]"
                )}
              >
                <Layers className="w-3 h-3 text-cyan-400" />
                <span>Todas as IAs</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-white/[0.1] text-cyan-300 font-mono">
                  {recommendations.length}
                </span>
              </button>

              {/* Specific Providers Tabs */}
              {availableProviders.map((provId) => {
                const sampleRec = recommendations.find((r) => r.aiProvider === provId);
                const count = countsByProvider[provId] || 0;
                const isSelected = selectedAiFilter === provId;

                return (
                  <button
                    type="button"
                    key={provId}
                    onClick={() => setSelectedAiFilter(provId)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 border",
                      isSelected
                        ? cn(getAiBadgeColor(provId), "shadow-sm scale-[1.02]")
                        : "border-transparent text-muted-foreground hover:text-white hover:bg-white/[0.04]"
                    )}
                  >
                    <Sparkles className="w-3 h-3 shrink-0" />
                    <span>{sampleRec?.aiProviderName || provId}</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-black/40 font-mono font-bold">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Provider Errors / Warnings (if any) */}
            {providersSummary.some((p) => p.error) && (
              <div className="flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>
                  {providersSummary
                    .filter((p) => p.error)
                    .map((p) => `${p.name}: erro`)
                    .join(", ")}
                </span>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1.5 space-y-3 pt-2">
          {/* Multi-Selection Control Bar */}
          {!isLoading && filtered.length > 0 && (
            <div className="sticky top-0 z-20 flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[#0e1628]/95 backdrop-blur-md border border-white/[0.1] text-xs shadow-lg flex-wrap">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all-filtered"
                  checked={
                    filtered.filter((r) => !addedIds.has(r.id)).length > 0 &&
                    filtered
                      .filter((r) => !addedIds.has(r.id))
                      .every((r) => selectedIds.has(r.id))
                  }
                  onCheckedChange={() => toggleSelectAll(filtered)}
                  className="border-white/30 data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500 cursor-pointer"
                />
                <label
                  htmlFor="select-all-filtered"
                  className="text-xs font-semibold text-foreground/90 cursor-pointer select-none flex items-center gap-1.5"
                >
                  <span>
                    Selecionar todas ({filtered.filter((r) => !addedIds.has(r.id)).length} disponíveis)
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-2 flex-wrap ml-auto">
                {selectedIds.size > 0 ? (
                  <>
                    <span className="text-[11px] text-cyan-300 font-mono font-semibold">
                      {selectedIds.size} selecionada(s) · Total: $
                      {Array.from(selectedIds)
                        .reduce((sum, id) => {
                          const r = filtered.find((x) => x.id === id);
                          return sum + (editedAmounts[id] ?? r?.allocationAmount ?? 0);
                        }, 0)
                        .toFixed(2)}{" "}
                      USDT
                    </span>
                    <Button
                      size="sm"
                      onClick={() => handleApplySelected(true, filtered)}
                      disabled={isApplyingBatch}
                      className="h-7 text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white cursor-pointer shadow-sm"
                    >
                      <Zap className="w-3 h-3 mr-1 fill-current" />
                      Ativar Selecionadas ({selectedIds.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleApplySelected(false, filtered)}
                      disabled={isApplyingBatch}
                      className="h-7 text-xs font-semibold border-white/[0.15] hover:bg-white/[0.08] cursor-pointer"
                    >
                      Salvar Pausadas ({selectedIds.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedIds(new Set())}
                      className="h-7 text-xs text-muted-foreground hover:text-white px-2 cursor-pointer"
                    >
                      Desmarcar
                    </Button>
                  </>
                ) : (
                  <span className="text-[11px] text-muted-foreground hidden sm:inline">
                    Marque as caixas para adicionar múltiplas sugestões de uma só vez.
                  </span>
                )}
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-sm font-medium text-foreground">
                Consultando motores de IA simultaneamente em paralelo...
              </p>
              <p className="text-xs text-muted-foreground">
                Calculando estratégias quantitativas, montante ideal e horizonte temporal para cada ativo.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-xs space-y-2">
              <p>Nenhuma recomendação encontrada para os filtros selecionados.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedHorizon("ALL");
                  setSelectedAiFilter("ALL");
                }}
                className="text-xs border-white/[0.1]"
              >
                Limpar Filtros
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
              {filtered.map((rec) => {
                const currentVal = editedAmounts[rec.id] !== undefined ? editedAmounts[rec.id] : rec.allocationAmount;
                const isAdding = addingId === rec.id;
                const isAdded = addedIds.has(rec.id);
                const isSelected = selectedIds.has(rec.id);

                return (
                  <Card
                    key={rec.id}
                    className={cn(
                      "relative overflow-hidden bg-card/50 border transition-all duration-200 shadow-md group",
                      isAdded
                        ? "border-emerald-500/40 bg-emerald-950/10"
                        : isSelected
                          ? "border-cyan-500/60 bg-cyan-950/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                          : "border-white/[0.08]",
                      getAiBorderAccent(rec.aiProvider)
                    )}
                  >
                    {/* Top Confidence Bar with Origin AI Gradient */}
                    <div
                      className={cn(
                        "absolute top-0 left-0 right-0 h-1",
                        isAdded
                          ? "bg-emerald-500"
                          : "bg-gradient-to-r from-cyan-500 via-purple-500 to-emerald-400"
                      )}
                    />

                    <CardContent className="p-4 space-y-3 pt-4">
                      {/* Selection Checkbox + Origin AI Badge & Operational Timeframe */}
                      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={isSelected || isAdded}
                            disabled={isAdded}
                            onCheckedChange={() => toggleSelect(rec.id)}
                            className="border-white/30 data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500 cursor-pointer"
                          />
                          {/* IA Badge Identificadora */}
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-bold px-2 py-0.5 flex items-center gap-1.5 shadow-sm",
                              getAiBadgeColor(rec.aiProvider)
                            )}
                          >
                            <Sparkles className="w-2.5 h-2.5 shrink-0" />
                            <span>{rec.aiProviderName}</span>
                            <span className="font-mono text-[9px] opacity-75 font-normal">
                              ({rec.aiModel})
                            </span>
                          </Badge>
                        </div>

                        {/* Status / Time Horizon Pill */}
                        <div className="flex items-center gap-1.5">
                          {isAdded && (
                            <Badge className="bg-emerald-500/20 border-emerald-500/40 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Já Adicionado
                            </Badge>
                          )}
                          <Badge className="bg-purple-500/15 border-purple-500/30 text-purple-300 text-[10px] flex items-center gap-1">
                            <Clock className="w-3 h-3 text-purple-400" />
                            {rec.operationalTimeframe}
                          </Badge>
                        </div>
                      </div>

                      {/* Title & Strategy */}
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
                      </div>

                      {/* Montante & Tempo — Destaque Principal */}
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
                              disabled={isAdded}
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

                      {/* Racional Técnico da IA de Origem */}
                      <p className="text-[11px] text-muted-foreground/90 line-clamp-2 leading-relaxed bg-white/[0.02] p-2 rounded-md border border-white/[0.04]">
                        🧠 <span className="font-medium text-foreground/90">Análise {rec.aiProviderName}:</span> {rec.technicalReasoning}
                      </p>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 pt-1">
                        {isAdded ? (
                          <div className="w-full h-8 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Robô Adicionado à Frota ✓</span>
                          </div>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleApplyBot(rec, true)}
                              disabled={isAdding}
                              className="flex-1 h-8 text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-sm shadow-emerald-500/20 cursor-pointer min-w-0"
                            >
                              <Zap className="w-3.5 h-3.5 mr-1 shrink-0 fill-current" />
                              <span className="truncate">Ativar Esta Sugestão</span>
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
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Persistent Dialog Footer */}
        <div className="shrink-0 pt-3 border-t border-white/[0.08] flex items-center justify-between gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-2 text-muted-foreground">
            {addedIds.size > 0 ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                {addedIds.size} robô(s) adicionado(s) à sua frota nesta sessão.
              </span>
            ) : (
              <span>Selecione uma ou mais sugestões para compor sua frota de robôs.</span>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 px-4 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 cursor-pointer"
          >
            {addedIds.size > 0 ? "Concluir e Fechar" : "Fechar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
