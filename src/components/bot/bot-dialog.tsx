"use client";

import { useState, useEffect, useMemo } from "react";
import { type BotInstance, type BotStrategy, useCryptoStore } from "@/lib/store";
import { CRYPTO_LIST } from "@/lib/crypto-meta";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Bot, Sparkles, Target, ShieldAlert, DollarSign, Search, ChevronDown, Dna, Loader2 } from "lucide-react";
import { STRATEGY_CATALOG, ENGINE_FILTERS, getStrategy } from "@/lib/bot/strategy-catalog";
import { runGeneticOptimization, type GeneticChromosome } from "@/lib/bot/quant-engine";
import { getSymbolKlines } from "@/lib/bot/kline-cache";
import { useToast } from "@/hooks/use-toast";
import { useShallow } from "zustand/react/shallow";

interface BotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botToEdit?: BotInstance | null;
}

export function BotDialog({ open, onOpenChange, botToEdit }: BotDialogProps) {
  const { addBot, updateBot } = useCryptoStore(
  useShallow((s) => ({ addBot: s.addBot, updateBot: s.updateBot }))
);
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [strategy, setStrategy] = useState<BotStrategy>("QUANT_ENSEMBLE");
  const [takeProfit, setTakeProfit] = useState(3.0);
  const [stopLoss, setStopLoss] = useState(1.8);
  const [trailingStop, setTrailingStop] = useState(true);
  const [trailingStopDistance, setTrailingStopDistance] = useState(0.8);
  const [allocationAmount, setAllocationAmount] = useState(100);
  const [active, setActive] = useState(false);
  const [useMarketRegime, setUseMarketRegime] = useState(true);
  const [useQuantFunnel, setUseQuantFunnel] = useState(false);
  const [useEnsemble, setUseEnsemble] = useState(false);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [buyThreshold, setBuyThreshold] = useState(30);
  const [sellThreshold, setSellThreshold] = useState(70);
  const [emaFast, setEmaFast] = useState(12);
  const [emaSlow, setEmaSlow] = useState(26);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimized, setOptimized] = useState<GeneticChromosome | null>(null);
  const [isAutofilling, setIsAutofilling] = useState(false);
  const [symbolSelectOpen, setSymbolSelectOpen] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState("");

  const filteredCryptoList = useMemo(() => {
    const q = symbolSearch.toLowerCase().trim();
    if (!q) return CRYPTO_LIST.slice(0, 50);
    return CRYPTO_LIST.filter((c) =>
      c.symbol.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.short.toLowerCase().includes(q)
    ).slice(0, 60);
  }, [symbolSearch, CRYPTO_LIST.length]);

  const handleAiAutofill = async () => {
    try {
      setIsAutofilling(true);
      toast({
        title: "🤖 Analisando Mercado com IA...",
        description: `Calculando parâmetros ideais de lucro e risco para ${symbol}...`,
      });

      const res = await fetch("/api/ai/bot-autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          currentConfig: { name, strategy, takeProfit, stopLoss, allocationAmount },
        }),
      });

      if (!res.ok) throw new Error("Erro na requisição da IA");
      const data = await res.json();

      if (data.success && data.config) {
        const cfg = data.config;
        if (cfg.name) setName(cfg.name);
        if (cfg.strategy) setStrategy(cfg.strategy as BotStrategy);
        if (typeof cfg.takeProfit === "number") setTakeProfit(cfg.takeProfit);
        if (typeof cfg.stopLoss === "number") setStopLoss(cfg.stopLoss);
        if (typeof cfg.trailingStop === "boolean") setTrailingStop(cfg.trailingStop);
        if (typeof cfg.trailingStopDistance === "number") setTrailingStopDistance(cfg.trailingStopDistance);
        if (typeof cfg.allocationAmount === "number") setAllocationAmount(cfg.allocationAmount);

        toast({
          title: "✨ Parâmetros Otimizados pela IA!",
          description: cfg.reasoning || "Robô configurado com sucesso com base nas métricas atuais.",
        });
      }
    } catch (err: any) {
      toast({
        title: "Falha na Análise IA",
        description: "Não foi possível autopreencher no momento. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsAutofilling(false);
    }
  };

  useEffect(() => {
    if (botToEdit) {
      setName(botToEdit.name);
      setSymbol(botToEdit.symbol);
      setStrategy(botToEdit.strategy);
      setTakeProfit(botToEdit.takeProfit);
      setStopLoss(botToEdit.stopLoss);
      setTrailingStop(botToEdit.trailingStop);
      setTrailingStopDistance(botToEdit.trailingStopDistance);
      setAllocationAmount(botToEdit.allocationAmount);
      setActive(botToEdit.active);
      setUseMarketRegime(botToEdit.useMarketRegime ?? false);
      setUseQuantFunnel(botToEdit.useQuantFunnel ?? false);
      setUseEnsemble(botToEdit.useEnsemble ?? false);
      setRsiPeriod(botToEdit.rsiPeriod ?? 14);
      setBuyThreshold(botToEdit.buyThreshold ?? 30);
      setSellThreshold(botToEdit.sellThreshold ?? 70);
      setEmaFast(botToEdit.emaFast ?? 12);
      setEmaSlow(botToEdit.emaSlow ?? 26);
    } else {
      setName("Novo Robô de Lucro");
      setSymbol("SOLUSDT");
      setStrategy("RSI");
      setTakeProfit(3.5);
      setStopLoss(1.8);
      setTrailingStop(true);
      setTrailingStopDistance(0.8);
      setAllocationAmount(80);
      setActive(false);
      setUseMarketRegime(true);
      setUseQuantFunnel(false);
      setUseEnsemble(false);
      setRsiPeriod(14);
      setBuyThreshold(30);
      setSellThreshold(70);
      setEmaFast(12);
      setEmaSlow(26);
    }
    setOptimized(null);
  }, [botToEdit, open]);

  const handleApplyPreset = (preset: "scalp" | "swing" | "dips") => {
    if (preset === "scalp") {
      setTakeProfit(1.8);
      setStopLoss(1.2);
      setTrailingStop(true);
      setTrailingStopDistance(0.5);
      setName(`Scalper ${symbol.replace("USDT", "")}`);
    } else if (preset === "swing") {
      setTakeProfit(5.0);
      setStopLoss(2.5);
      setTrailingStop(true);
      setTrailingStopDistance(1.2);
      setName(`Swing ${symbol.replace("USDT", "")} Trend`);
    } else if (preset === "dips") {
      setStrategy("RSI");
      setTakeProfit(3.8);
      setStopLoss(1.8);
      setTrailingStop(true);
      setTrailingStopDistance(0.8);
      setName(`Dip Hunter ${symbol.replace("USDT", "")}`);
    }
  };

  const gaMode = strategy === "RSI" ? "RSI" : strategy === "MACD" ? "MACD" : null;

  const handleOptimize = async () => {
    if (!gaMode) return;
    setIsOptimizing(true);
    try {
      const klines = await getSymbolKlines(symbol);
      if (klines.length < 40) {
        toast({
          title: "Dados insuficientes",
          description: `Só há ${klines.length} candles de ${symbol}; o otimizador precisa de pelo menos 40.`,
          variant: "destructive",
        });
        return;
      }
      // Roda fora do clique para a interface atualizar o estado "otimizando" antes do cálculo.
      await new Promise((r) => setTimeout(r, 30));
      const best = runGeneticOptimization(klines, gaMode);
      if ((best.fitness ?? -999) <= -999) {
        toast({
          title: "Sem resultado confiável",
          description: "Nenhuma combinação gerou operações suficientes no histórico recente. Mantive seus parâmetros.",
        });
        return;
      }
      setOptimized(best);
    } finally {
      setIsOptimizing(false);
    }
  };

  const applyOptimized = () => {
    if (!optimized) return;
    if (gaMode === "RSI") {
      setRsiPeriod(optimized.rsiPeriod);
      setBuyThreshold(optimized.rsiBuyThreshold);
      setSellThreshold(optimized.rsiSellThreshold);
    } else {
      setEmaFast(optimized.emaFast);
      setEmaSlow(optimized.emaSlow);
    }
    setOptimized(null);
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast({
        title: "Nome Obrigatório",
        description: "Por favor insira um nome para o robô.",
        variant: "destructive",
      });
      return;
    }

    if (botToEdit) {
      updateBot(botToEdit.id, {
        name,
        symbol,
        strategy,
        takeProfit,
        stopLoss,
        trailingStop,
        trailingStopDistance,
        allocationAmount,
        active,
        useMarketRegime,
        useQuantFunnel,
        useEnsemble,
        rsiPeriod,
        buyThreshold,
        sellThreshold,
        emaFast,
        emaSlow,
      });
      toast({
        title: "Robô Atualizado!",
        description: `As configurações do robô ${name} foram salvas com sucesso.`,
      });
    } else {
      addBot({
        name,
        symbol,
        strategy,
        takeProfit,
        stopLoss,
        trailingStop,
        trailingStopDistance,
        allocationAmount,
        active,
        useMarketRegime,
        useQuantFunnel,
        useEnsemble,
        rsiPeriod,
        buyThreshold,
        sellThreshold,
        emaFast,
        emaSlow,
      });
      toast({
        title: "🎉 Robô Criado com Sucesso!",
        description: `${name} foi adicionado à frota (desligado) e está pronto para ser ativado.`,
      });
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-[720px] max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden bg-card/95 backdrop-blur-xl border border-border/80 text-foreground">
        <DialogHeader className="px-5 pt-5 pb-3 pr-10 border-b border-border/40 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Bot className="w-5 h-5 text-crypto-cyan" />
            {botToEdit ? `Editar ${botToEdit.name}` : "Criar Novo Robô de Lucro Simultâneo"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Configure o ativo, estratégia e parâmetros de lucro automatizado para operar em conjunto com os outros robôs.
          </DialogDescription>
        </DialogHeader>

        {/* Corpo rolável: só esta parte rola, cabeçalho e botões ficam fixos */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-5 py-4 space-y-4">
        {/* Quick Presets & AI Autofill */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Predefinições & Otimização por IA
            </span>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isAutofilling}
              onClick={handleAiAutofill}
              className="text-xs h-7 px-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-crypto-cyan text-white font-bold shadow-md hover:opacity-90 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isAutofilling ? "animate-spin" : "text-amber-300"}`} />
              {isAutofilling ? "Analisando..." : "Autopreencher com IA"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-0.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleApplyPreset("scalp")}
              className="text-xs h-7 px-2.5 border-border/60 hover:border-crypto-cyan/40 hover:bg-secondary/40 cursor-pointer"
            >
              ⚡ Scalper Rápido (+1.8%)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleApplyPreset("dips")}
              className="text-xs h-7 px-2.5 border-border/60 hover:border-crypto-green/40 hover:bg-secondary/40 cursor-pointer"
            >
              🎯 Caçador de Dips (+3.8%)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleApplyPreset("swing")}
              className="text-xs h-7 px-2.5 border-border/60 hover:border-crypto-gold/40 hover:bg-secondary/40 cursor-pointer"
            >
              🚀 Swing Lucro Alto (+5.0%)
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {/* Bot Name & Active Toggle */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="bot-name" className="text-xs font-semibold">Nome do Robô</Label>
              <Input
                id="bot-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Bot Alpha BTC"
                className="h-9 text-xs bg-secondary/30"
              />
            </div>
            <div className="space-y-1.5 flex flex-col justify-end">
              <Label className="text-xs font-semibold">Status Inicial</Label>
              <div className="flex items-center gap-2 h-9 px-2 bg-secondary/20 rounded-md border border-border/40">
                <Switch checked={active} onCheckedChange={setActive} />
                <span className="text-xs font-medium">{active ? "Ativo" : "Pausado"}</span>
              </div>
            </div>
          </div>

          {/* Symbol & Allocation */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Par de Moeda (Ativo)</Label>
              <Popover open={symbolSelectOpen} onOpenChange={setSymbolSelectOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-9 text-xs bg-secondary/30 border-border justify-between px-2.5 font-bold"
                  >
                    <span>{symbol.replace("USDT", "/USDT")}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-0 glass border-border/50" align="start">
                  <div className="p-2 border-b border-border/30">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Buscar moeda Binance..."
                        value={symbolSearch}
                        onChange={(e) => setSymbolSearch(e.target.value)}
                        className="h-7 pl-7 text-xs bg-secondary/30 border-border/50"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-[220px] overflow-y-auto cyan-scrollbar p-1">
                    {filteredCryptoList.map((c) => (
                      <button
                        type="button"
                        key={c.symbol}
                        onClick={() => {
                          setSymbol(c.symbol);
                          setSymbolSelectOpen(false);
                          setSymbolSearch("");
                        }}
                        className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-secondary/40 flex items-center justify-between transition-colors ${
                          c.symbol === symbol ? "bg-crypto-cyan/15 text-crypto-cyan font-bold" : ""
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-bold">{c.short}</span>
                          <span className="text-muted-foreground text-[10px] truncate">({c.name})</span>
                        </div>
                      </button>
                    ))}
                    {filteredCryptoList.length === 0 && (
                      <div className="p-3 text-center text-xs text-muted-foreground">
                        Nenhuma moeda encontrada
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bot-alloc" className="text-xs font-semibold">Alocação por Operação (USDT)</Label>
              <div className="relative">
                <DollarSign className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  id="bot-alloc"
                  type="number"
                  min="10"
                  step="10"
                  value={allocationAmount}
                  onChange={(e) => setAllocationAmount(Math.max(10, parseFloat(e.target.value) || 10))}
                  className="h-9 pl-8 text-xs bg-secondary/30 font-semibold"
                />
              </div>
            </div>
          </div>

          {/* 1. Estratégia: quando o robô compra */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">1. Estratégia — quando o robô compra</Label>
            <div className="grid grid-cols-2 gap-2">
              {STRATEGY_CATALOG.map((strat) => {
                const isSelected = strategy === strat.id;
                return (
                  <div
                    key={strat.id}
                    onClick={() => setStrategy(strat.id)}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-all text-left space-y-1 ${
                      isSelected
                        ? "bg-crypto-cyan/10 border-crypto-cyan/50 shadow-sm"
                        : "bg-secondary/20 border-border/30 hover:bg-secondary/40"
                    }`}
                  >
                    <span className={`text-xs font-bold ${isSelected ? "text-crypto-cyan" : "text-foreground"}`}>
                      {strat.name}
                    </span>
                    <p className="text-[10px] text-muted-foreground leading-snug">{strat.summary}</p>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground bg-secondary/20 rounded-md p-2 border border-border/30">
              <strong className="text-foreground">Regra exata:</strong> {getStrategy(strategy)?.rule}
            </p>
          </div>

          {/* Parâmetros da estratégia (só os que ela realmente usa) */}
          {gaMode && (
            <div className="bg-secondary/25 p-3 rounded-xl border border-border/40 space-y-3">
              <span className="text-xs font-bold">Parâmetros de {gaMode === "RSI" ? "RSI" : "MACD"}</span>
              {gaMode === "RSI" ? (
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Período</Label>
                    <Input type="number" min={5} max={30} value={rsiPeriod} onChange={(e) => setRsiPeriod(Math.min(30, Math.max(5, parseInt(e.target.value) || 14)))} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Compra se RSI ≤</Label>
                    <Input type="number" min={10} max={50} value={buyThreshold} onChange={(e) => setBuyThreshold(Math.min(50, Math.max(10, parseFloat(e.target.value) || 30)))} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Realiza lucro se RSI ≥</Label>
                    <Input type="number" min={55} max={95} value={sellThreshold} onChange={(e) => setSellThreshold(Math.min(95, Math.max(55, parseFloat(e.target.value) || 70)))} className="h-8 text-xs" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">EMA rápida</Label>
                    <Input type="number" min={3} max={30} value={emaFast} onChange={(e) => setEmaFast(Math.min(30, Math.max(3, parseInt(e.target.value) || 12)))} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">EMA lenta</Label>
                    <Input type="number" min={10} max={80} value={emaSlow} onChange={(e) => setEmaSlow(Math.min(80, Math.max(10, parseInt(e.target.value) || 26)))} className="h-8 text-xs" />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/30">
                <p className="text-[10px] text-muted-foreground">
                  Otimizador genético: testa combinações no histórico de 1h de {symbol.replace("USDT", "")} e sugere os melhores valores.
                </p>
                <Button type="button" size="sm" variant="outline" onClick={handleOptimize} disabled={isOptimizing} className="h-7 text-xs shrink-0 border-crypto-gold/40 text-crypto-gold hover:bg-crypto-gold/10">
                  {isOptimizing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Dna className="w-3 h-3 mr-1" />}
                  {isOptimizing ? "Otimizando..." : "Otimizar"}
                </Button>
              </div>

              {optimized && (
                <div className="bg-crypto-gold/5 border border-crypto-gold/20 rounded-lg p-2.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]">
                    {gaMode === "RSI"
                      ? `Período ${optimized.rsiPeriod} · compra ≤ ${optimized.rsiBuyThreshold} · lucro ≥ ${optimized.rsiSellThreshold}`
                      : `EMA ${optimized.emaFast} / ${optimized.emaSlow}`}
                    <span className="text-muted-foreground"> (pontuação {(optimized.fitness ?? 0).toFixed(1)})</span>
                  </span>
                  <Button type="button" size="sm" onClick={applyOptimized} className="h-7 text-xs bg-crypto-gold text-black hover:bg-crypto-gold/80 font-bold">
                    Aplicar
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* 2. Filtros do motor: quando o robô NÃO compra */}
          <div className="bg-secondary/25 p-3 rounded-xl border border-border/40 space-y-3">
            <div>
              <span className="text-xs font-bold">2. Filtros de segurança — quando o robô NÃO compra</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Filtros só bloqueiam compras; nunca forçam uma. Além deles, o robô sempre bloqueia compras com volatilidade (ATR) ≥ 5%.
              </p>
            </div>
            {ENGINE_FILTERS.map((f) => {
              const checked = f.key === "useMarketRegime" ? useMarketRegime : f.key === "useQuantFunnel" ? useQuantFunnel : useEnsemble;
              const set = f.key === "useMarketRegime" ? setUseMarketRegime : f.key === "useQuantFunnel" ? setUseQuantFunnel : setUseEnsemble;
              const moot = f.key === "useEnsemble" && strategy === "QUANT_ENSEMBLE";
              return (
                <div key={f.key} className={`flex items-start justify-between gap-3 ${moot ? "opacity-50" : ""}`}>
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium">{f.name}</Label>
                    <p className="text-[10px] text-muted-foreground leading-snug">{f.description}</p>
                  </div>
                  <Switch checked={moot ? true : checked} disabled={moot} onCheckedChange={set} className="mt-0.5" />
                </div>
              );
            })}
          </div>

          {/* Profit & Risk Rules */}
          <div className="bg-secondary/25 p-3 rounded-xl border border-border/40 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-1.5 text-crypto-green">
                <Target className="w-3.5 h-3.5" />
                Meta de Lucro: Take Profit (+{takeProfit}%)
              </span>
              <span className="text-xs font-extrabold text-crypto-green">+{takeProfit}%</span>
            </div>
            <Slider
              value={[takeProfit]}
              min={1.0}
              max={15.0}
              step={0.1}
              onValueChange={([val]) => setTakeProfit(parseFloat(val.toFixed(1)))}
              className="py-1"
            />
            <p className="text-[10px] text-muted-foreground">
              O robô venderá automaticamente 100% da posição quando o lucro atingir +{takeProfit}%.
            </p>

            <div className="border-t border-border/30 pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold flex items-center gap-1.5 text-crypto-red">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Proteção: Stop Loss (-{stopLoss}%)
                </span>
                <span className="text-xs font-extrabold text-crypto-red">-{stopLoss}%</span>
              </div>
              <Slider
                value={[stopLoss]}
                min={0.5}
                max={8.0}
                step={0.1}
                onValueChange={([val]) => setStopLoss(parseFloat(val.toFixed(1)))}
                className="py-1"
              />
              <p className="text-[10px] text-muted-foreground">
                Corta a perda se o mercado reverter -{stopLoss}%, protegendo o capital para a próxima oportunidade.
              </p>
            </div>

            {/* Trailing Stop Profit Lock */}
            <div className="border-t border-border/30 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-crypto-cyan flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    Trailing Stop (Trava de Lucro Dinâmica)
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    Protege o lucro conquistado se o preço bater máxima e começar a recuar.
                  </p>
                </div>
                <Switch checked={trailingStop} onCheckedChange={setTrailingStop} />
              </div>

              {trailingStop && (
                <div className="space-y-1.5 pt-1 bg-secondary/30 p-2 rounded-lg">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] text-muted-foreground">Distância de Recuo:</span>
                    <span className="font-bold text-crypto-cyan">{trailingStopDistance}%</span>
                  </div>
                  <Slider
                    value={[trailingStopDistance]}
                    min={0.3}
                    max={3.0}
                    step={0.1}
                    onValueChange={([val]) => setTrailingStopDistance(parseFloat(val.toFixed(1)))}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        </div>

        <DialogFooter className="px-5 py-3 gap-2 border-t border-border/40 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="text-xs h-9"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="text-xs h-9 bg-gradient-to-r from-crypto-cyan to-blue-600 text-white font-semibold shadow-md cursor-pointer"
          >
            {botToEdit ? "Salvar Alterações" : "Criar Robô"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
