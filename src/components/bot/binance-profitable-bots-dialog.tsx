"use client";

import { useState, useEffect, useMemo } from "react";
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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Trophy,
  Sparkles,
  Zap,
  Clock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Activity,
  BarChart2,
  Sliders,
  AlertTriangle,
  Flame,
  Search,
  Plus,
  Play,
  ShieldCheck,
  Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useShallow } from "zustand/react/shallow";
import { motion, AnimatePresence } from "framer-motion";
import { formatPrice } from "@/lib/format";
import type { BinanceProfitableBotRecommendation } from "@/app/api/bot/binance-profitable-scanner/route";

interface BinanceProfitableBotsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BinanceProfitableBotsDialog({
  open,
  onOpenChange,
}: BinanceProfitableBotsDialogProps) {
  const { bots, portfolio, addBot, toggleBotActive } = useCryptoStore(
    useShallow((s) => ({
      bots: s.bots,
      portfolio: s.portfolio,
      addBot: s.addBot,
      toggleBotActive: s.toggleBotActive,
    }))
  );

  const { toast } = useToast();
  const [recommendations, setRecommendations] = useState<BinanceProfitableBotRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalPairs, setTotalPairs] = useState(764);
  const [qualifiedCount, setQualifiedCount] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [activateImmediately, setActivateImmediately] = useState(true);
  const [defaultAllocation, setDefaultAllocation] = useState<number>(25);
  const [editedAllocations, setEditedAllocations] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recentlyCreatedIds, setRecentlyCreatedIds] = useState<Set<string>>(new Set());
  const [isBatchCreating, setIsBatchCreating] = useState(false);

  // Conjunto de símbolos já cadastrados na frota do usuário
  const existingSymbols = useMemo(() => {
    return new Set(bots.map((b) => b.symbol.toUpperCase()));
  }, [bots]);

  const fetchProfitableBots = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/bot/binance-profitable-scanner?limit=60`);
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.recommendations)) {
        setRecommendations(data.recommendations);
        setTotalPairs(data.totalBinancePairs || 764);
        setQualifiedCount(data.qualifiedCount || data.recommendations.length);
        if (data.categories) {
          setCategoryCounts(data.categories);
        }

        const allocs: Record<string, number> = {};
        data.recommendations.forEach((r: BinanceProfitableBotRecommendation) => {
          allocs[r.id] = defaultAllocation;
        });
        setEditedAllocations(allocs);
      } else {
        throw new Error(data.error || "Falha ao escanear Binance");
      }
    } catch (err: any) {
      toast({
        title: "Erro ao escanear pares Binance",
        description: err.message || "Não foi possível carregar as opções de binários.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchProfitableBots();
    }
  }, [open]);

  // Filtra as recomendações por categoria e busca
  const filtered = useMemo(() => {
    return recommendations.filter((r) => {
      if (selectedCategory !== "ALL" && r.category !== selectedCategory) return false;
      if (search) {
        const query = search.trim().toUpperCase();
        if (!r.symbol.includes(query) && !r.baseAsset.includes(query) && !r.name.toUpperCase().includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [recommendations, selectedCategory, search]);

  const handleCreateSingleBot = (rec: BinanceProfitableBotRecommendation) => {
    try {
      if (existingSymbols.has(rec.symbol.trim().toUpperCase())) {
        toast({
          title: "Robô Já Existe na Frota",
          description: `O par ${rec.symbol} já possui um robô configurado na sua frota. Não são permitidos robôs repetidos para o mesmo par.`,
          variant: "destructive",
        });
        return;
      }

      const alloc = editedAllocations[rec.id] || defaultAllocation;
      const botId = addBot({
        name: rec.name,
        symbol: rec.symbol,
        strategy: rec.strategy as BotStrategy,
        allocationAmount: alloc,
        takeProfit: rec.takeProfit,
        stopLoss: rec.stopLoss, // Estrito <= 2.0%
        trailingStop: rec.trailingStop,
        trailingStopDistance: rec.trailingStopDistance,
        autoBreakEven: rec.autoBreakEven,
        breakEvenTrigger: rec.breakEvenTrigger,
        breakEvenBuffer: rec.breakEvenBuffer,
        active: activateImmediately,
        useEnsemble: rec.strategy === "QUANT_ENSEMBLE",
        useMarketRegime: true,
        useMultiTimeframe: true,
        aiEngine: `Scanner Quantitativo Binance (${rec.strategyLabel})`,
      });

      if (activateImmediately) {
        toggleBotActive(botId, true);
      }

      setRecentlyCreatedIds((prev) => new Set(prev).add(rec.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(rec.id);
        return next;
      });

      toast({
        title: activateImmediately ? "🚀 Robô Criado e Ativado!" : "✅ Robô Adicionado à Frota",
        description: `${rec.name} (${rec.symbol}) pronto para operar com $${alloc} USDT.`,
      });
    } catch (err: any) {
      toast({
        title: "Erro ao criar robô",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleCreateBatch = (candidatesToCreate: BinanceProfitableBotRecommendation[]) => {
    if (candidatesToCreate.length === 0) return;

    const candidatesToActuallyCreate = candidatesToCreate.filter(
      (r) => !existingSymbols.has(r.symbol.trim().toUpperCase())
    );

    if (candidatesToActuallyCreate.length === 0) {
      toast({
        title: "Nenhum Novo Robô para Adicionar",
        description: "Todos os robôs selecionados já possuem configuração na sua frota. Não são permitidos robôs repetidos.",
      });
      return;
    }

    const skippedCount = candidatesToCreate.length - candidatesToActuallyCreate.length;
    setIsBatchCreating(true);

    try {
      let createdCount = 0;
      const newCreated = new Set(recentlyCreatedIds);

      for (const rec of candidatesToActuallyCreate) {
        const alloc = editedAllocations[rec.id] || defaultAllocation;
        const botId = addBot({
          name: rec.name,
          symbol: rec.symbol,
          strategy: rec.strategy as BotStrategy,
          allocationAmount: alloc,
          takeProfit: rec.takeProfit,
          stopLoss: rec.stopLoss,
          trailingStop: rec.trailingStop,
          trailingStopDistance: rec.trailingStopDistance,
          autoBreakEven: rec.autoBreakEven,
          breakEvenTrigger: rec.breakEvenTrigger,
          breakEvenBuffer: rec.breakEvenBuffer,
          active: activateImmediately,
          useEnsemble: rec.strategy === "QUANT_ENSEMBLE",
          useMarketRegime: true,
          useMultiTimeframe: true,
          aiEngine: `Scanner Quantitativo Binance (${rec.strategyLabel})`,
        });

        if (activateImmediately) {
          toggleBotActive(botId, true);
        }

        newCreated.add(rec.id);
        createdCount++;
      }

      setRecentlyCreatedIds(newCreated);
      setSelectedIds(new Set());

      toast({
        title: activateImmediately ? `🚀 ${createdCount} Robôs Criados e Ativados!` : `✅ ${createdCount} Robôs Adicionados`,
        description: skippedCount > 0
          ? `${createdCount} novos robôs adicionados à frota (${skippedCount} ignorados por já existirem).`
          : `Os ${createdCount} robôs campeões da Binance foram integrados à sua frota com sucesso.`,
      });
    } catch (err: any) {
      toast({
        title: "Erro ao criar robôs em lote",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsBatchCreating(false);
    }
  };

  const handleCreateTop3 = () => {
    const top3 = recommendations.slice(0, 3);
    handleCreateBatch(top3);
  };

  const handleCreateSelected = () => {
    const selected = recommendations.filter((r) => selectedIds.has(r.id));
    handleCreateBatch(selected);
  };

  const toggleSelect = (rec: BinanceProfitableBotRecommendation) => {
    if (existingSymbols.has(rec.symbol.trim().toUpperCase())) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rec.id)) next.delete(rec.id);
      else next.add(rec.id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = filtered.filter((r) => !existingSymbols.has(r.symbol.trim().toUpperCase()));
    if (selectedIds.size >= selectable.length && selectable.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectable.map((r) => r.id)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border-border/60 shadow-2xl">
        {/* ========================================================================= */}
        {/* CABEÇALHO MODAL */}
        {/* ========================================================================= */}
        <DialogHeader className="p-4 sm:p-5 border-b border-border/40 bg-secondary/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-emerald-500/20 border border-amber-500/30 text-amber-300">
                  <Trophy className="w-5 h-5" />
                </div>
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                  Robôs Mais Lucrativos · Scanner Binance 360°
                  <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 font-mono text-[10px]">
                    {totalPairs}+ Pares Analisados
                  </Badge>
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-1 max-w-3xl">
                Algoritmo quantitativo varrendo todas as opções de binários USDT da Binance em tempo real.
                Classifica os ativos pelo Score Institucional de Lucratividade (Momentum, Volume, Amplitude ATR e Relação Risco:Retorno) e permite criá-los na sua frota com 1 clique.
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchProfitableBots}
                disabled={isLoading}
                className="h-8 px-2.5 text-xs border-border/60 hover:bg-secondary/60 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin text-amber-400" : ""}`} />
                Atualizar Scanner
              </Button>
            </div>
          </div>

          {/* BARRA DE GUARDRAILS E CONFIGURAÇÃO GLOBAL DE ENTRADA */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-3 pt-3 border-t border-border/30 bg-background/40 p-2.5 rounded-xl border border-border/40">
            <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" /> Stop-Loss ≤ 2.0%
              </span>
              <span>•</span>
              <span className="text-foreground font-semibold">Auto Break-Even Ativo</span>
              <span>•</span>
              <span className="text-foreground font-semibold">Anti-Martingale Ativo</span>
              <span>•</span>
              <span className="text-muted-foreground">Saldo Disponível: <strong className="text-foreground">${portfolio.cashBalance.toFixed(2)} USDT</strong></span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground font-medium">Alocação Padrão:</span>
                <div className="relative w-20">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min={10}
                    max={1000}
                    value={defaultAllocation}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 25;
                      setDefaultAllocation(val);
                      const updated: Record<string, number> = {};
                      recommendations.forEach((r) => {
                        updated[r.id] = val;
                      });
                      setEditedAllocations(updated);
                    }}
                    className="h-7 pl-5 text-xs font-mono font-bold bg-secondary/50 border-border/50 text-foreground"
                  />
                </div>
              </div>

              <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer select-none">
                <Checkbox
                  checked={activateImmediately}
                  onCheckedChange={(c) => setActivateImmediately(!!c)}
                />
                <span>Iniciar ao criar</span>
              </label>
            </div>
          </div>
        </DialogHeader>

        {/* ========================================================================= */}
        {/* BARRA DE FILTROS POR CATEGORIA E BUSCA */}
        {/* ========================================================================= */}
        <div className="p-3 border-b border-border/30 bg-secondary/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <Button
              size="sm"
              variant={selectedCategory === "ALL" ? "default" : "outline"}
              onClick={() => setSelectedCategory("ALL")}
              className={`h-7 px-2.5 text-xs cursor-pointer ${
                selectedCategory === "ALL" ? "bg-amber-500 text-slate-950 font-bold" : "text-muted-foreground"
              }`}
            >
              <Trophy className="w-3 h-3 mr-1" />
              Top Geral ({recommendations.length})
            </Button>
            <Button
              size="sm"
              variant={selectedCategory === "MOMENTUM" ? "default" : "outline"}
              onClick={() => setSelectedCategory("MOMENTUM")}
              className={`h-7 px-2.5 text-xs cursor-pointer ${
                selectedCategory === "MOMENTUM" ? "bg-emerald-500 text-white font-bold" : "text-muted-foreground"
              }`}
            >
              <Flame className="w-3 h-3 mr-1 text-amber-200" />
              Super Momentum ({categoryCounts.MOMENTUM || 0})
            </Button>
            <Button
              size="sm"
              variant={selectedCategory === "BLUE_CHIP" ? "default" : "outline"}
              onClick={() => setSelectedCategory("BLUE_CHIP")}
              className={`h-7 px-2.5 text-xs cursor-pointer ${
                selectedCategory === "BLUE_CHIP" ? "bg-crypto-cyan text-white font-bold" : "text-muted-foreground"
              }`}
            >
              <Zap className="w-3 h-3 mr-1" />
              Blue Chips ({categoryCounts.BLUE_CHIP || 0})
            </Button>
            <Button
              size="sm"
              variant={selectedCategory === "VOLATILITY" ? "default" : "outline"}
              onClick={() => setSelectedCategory("VOLATILITY")}
              className={`h-7 px-2.5 text-xs cursor-pointer ${
                selectedCategory === "VOLATILITY" ? "bg-purple-600 text-white font-bold" : "text-muted-foreground"
              }`}
            >
              <Activity className="w-3 h-3 mr-1" />
              Alta Volatilidade ({categoryCounts.VOLATILITY || 0})
            </Button>
            <Button
              size="sm"
              variant={selectedCategory === "PULLBACK" ? "default" : "outline"}
              onClick={() => setSelectedCategory("PULLBACK")}
              className={`h-7 px-2.5 text-xs cursor-pointer ${
                selectedCategory === "PULLBACK" ? "bg-blue-600 text-white font-bold" : "text-muted-foreground"
              }`}
            >
              <TrendingDown className="w-3 h-3 mr-1" />
              Pullback RSI ({categoryCounts.PULLBACK || 0})
            </Button>
          </div>

          <div className="relative w-full sm:w-56 shrink-0">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar moeda Binance (ex: SOL, NEAR)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-8 text-xs bg-secondary/40 border-border/50"
            />
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CORPO DA LISTAGEM DE ROBÔS MAIS LUCRATIVOS */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && recommendations.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
              <p className="text-sm font-semibold text-foreground">Varrendo todas as opções de binários da Binance...</p>
              <p className="text-xs text-muted-foreground">Calculando Score Quantitativo de Lucratividade, Momentum e ATR.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border/40 rounded-xl bg-secondary/10">
              <Trophy className="w-8 h-8 mx-auto text-muted-foreground opacity-50 mb-2" />
              <p className="text-sm font-semibold text-foreground">Nenhuma opção de robô encontrada</p>
              <p className="text-xs text-muted-foreground mt-0.5">Tente outro filtro ou termo de busca.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filtered.map((rec) => {
                const isSelected = selectedIds.has(rec.id);
                const isAlreadyInFleet = existingSymbols.has(rec.symbol.trim().toUpperCase());
                const isRecentlyCreated = recentlyCreatedIds.has(rec.id);
                const alloc = editedAllocations[rec.id] || defaultAllocation;

                return (
                  <div
                    key={rec.id}
                    className={`rounded-xl border p-3.5 transition-all duration-200 ${
                      rec.rank === 1
                        ? "border-amber-500/50 bg-gradient-to-r from-amber-500/10 via-background to-background shadow-md shadow-amber-500/10"
                        : rec.rank === 2
                        ? "border-slate-300/40 bg-gradient-to-r from-slate-400/10 via-background to-background"
                        : rec.rank === 3
                        ? "border-amber-700/40 bg-gradient-to-r from-amber-700/10 via-background to-background"
                        : "border-border/40 bg-card/70 hover:border-border/70"
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
                      {/* Lado Esquerdo: Identificação & Ranking */}
                      <div className="flex items-center gap-3 min-w-[260px]">
                        <Checkbox
                          checked={isSelected}
                          disabled={isAlreadyInFleet}
                          onCheckedChange={() => toggleSelect(rec)}
                          className="shrink-0"
                        />

                        <div className="shrink-0 font-mono font-bold text-xs px-2 py-1 rounded-lg bg-secondary/80 border border-border/60">
                          {rec.rank === 1 ? "🥇 #1" : rec.rank === 2 ? "🥈 #2" : rec.rank === 3 ? "🥉 #3" : `#${rec.rank}`}
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-sm font-bold text-foreground">{rec.name}</h4>
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono border-border/50 text-foreground">
                              {rec.symbol}
                            </Badge>
                            <Badge className="text-[9px] py-0 px-1.5 bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                              {rec.categoryLabel}
                            </Badge>
                            {isAlreadyInFleet && (
                              <Badge variant="secondary" className="text-[9px] py-0 px-1 bg-zinc-800 text-zinc-400">
                                Já na Frota
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                            {rec.technicalReasoning}
                          </p>
                        </div>
                      </div>

                      {/* Centro: Métricas Financeiras & Score de Lucratividade */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 w-full lg:w-auto items-center">
                        {/* Cotação & Variação */}
                        <div>
                          <span className="text-[9px] text-muted-foreground uppercase block font-semibold">Cotação 24h</span>
                          <div className="text-xs font-bold text-foreground font-mono">
                            ${formatPrice(rec.price)}
                          </div>
                          <span
                            className={`text-[10px] font-bold font-mono ${
                              rec.change24h >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {rec.change24h >= 0 ? "+" : ""}{rec.change24h.toFixed(2)}%
                          </span>
                        </div>

                        {/* Volume 24h */}
                        <div>
                          <span className="text-[9px] text-muted-foreground uppercase block font-semibold">Volume 24h</span>
                          <div className="text-xs font-bold text-foreground font-mono">
                            ${(rec.volume24h / 1e6).toFixed(1)}M
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Range: {rec.rangePct.toFixed(1)}%
                          </span>
                        </div>

                        {/* Score de Lucratividade */}
                        <div>
                          <span className="text-[9px] text-muted-foreground uppercase block font-semibold">Score Lucrativo</span>
                          <div className="text-xs sm:text-sm font-black text-amber-400 flex items-center gap-1 font-mono">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            {rec.profitScore}/100
                          </div>
                          <span className="text-[10px] text-emerald-400 font-semibold font-mono">
                            +{rec.estimatedProfitCycle}% / ciclo
                          </span>
                        </div>

                        {/* Parâmetros Recomendados */}
                        <div className="hidden sm:block">
                          <span className="text-[9px] text-muted-foreground uppercase block font-semibold">Configuração</span>
                          <div className="text-[11px] text-foreground font-mono font-medium">
                            TP <strong className="text-emerald-400">+{rec.takeProfit}%</strong> · SL <strong className="text-rose-400">-{rec.stopLoss}%</strong>
                          </div>
                          <span className="text-[10px] text-muted-foreground block truncate">
                            {rec.strategyLabel}
                          </span>
                        </div>
                      </div>

                      {/* Lado Direito: Alocação & Botão Criar Robô */}
                      <div className="flex items-center gap-2 self-end lg:self-center shrink-0 w-full sm:w-auto justify-end">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">$</span>
                          <Input
                            type="number"
                            min={10}
                            max={1000}
                            value={alloc}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 25;
                              setEditedAllocations((prev) => ({ ...prev, [rec.id]: val }));
                            }}
                            className="h-8 w-16 text-xs font-mono font-bold bg-secondary/50 border-border/50 text-foreground"
                            title="Valor alocado para este robô em USDT"
                          />
                        </div>

                        {isAlreadyInFleet ? (
                          <Button
                            size="sm"
                            disabled
                            className="h-8 px-3 text-xs font-semibold bg-secondary/40 text-muted-foreground border border-border/40 cursor-not-allowed opacity-75"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 mr-1 text-sky-400" />
                            Já na Frota
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleCreateSingleBot(rec)}
                            className={`h-8 px-3 text-xs font-bold cursor-pointer transition-all duration-200 ${
                              isRecentlyCreated
                                ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/40"
                                : rec.rank === 1
                                ? "bg-gradient-to-r from-amber-500 via-amber-600 to-emerald-600 hover:from-amber-400 hover:to-emerald-500 text-slate-950 font-black shadow-md shadow-amber-500/20"
                                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
                            }`}
                          >
                            {isRecentlyCreated ? (
                              <>
                                <Check className="w-3.5 h-3.5 mr-1" />
                                Criado
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5 mr-1" />
                                Criar Robô
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* RODAPÉ DO MODAL COM AÇÕES EM LOTE */}
        {/* ========================================================================= */}
        <div className="p-3.5 sm:p-4 border-t border-border/40 bg-secondary/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSelectAll}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {selectedIds.size === filtered.length && filtered.length > 0
                ? "Desmarcar Todos"
                : `Selecionar Todos (${filtered.length})`}
            </Button>
            <span>•</span>
            <span>
              {selectedIds.size} selecionado(s) de {filtered.length} opções
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateTop3}
              disabled={isBatchCreating || recommendations.length === 0}
              className="h-8 px-3 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10 font-bold cursor-pointer"
            >
              <Trophy className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              Criar Top 3 Campeões
            </Button>

            <Button
              size="sm"
              onClick={handleCreateSelected}
              disabled={isBatchCreating || selectedIds.size === 0}
              className="h-8 px-3.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-bold shadow-md shadow-emerald-500/20 cursor-pointer"
            >
              {isBatchCreating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5 text-emerald-200" />
                  Criar {selectedIds.size > 0 ? `${selectedIds.size} Selecionados` : "Selecionados"}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
