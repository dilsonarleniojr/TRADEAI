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
import { Bot, Sparkles, Target, ShieldAlert, ShieldCheck, DollarSign, Search, ChevronDown, Dna, Loader2, CheckCircle2, Rocket, TrendingUp, Zap, Shield, Clock } from "lucide-react";
import { STRATEGY_CATALOG, ENGINE_FILTERS, getStrategy } from "@/lib/bot/strategy-catalog";
import { runGeneticOptimization, type GeneticChromosome } from "@/lib/bot/quant-engine";
import { getSymbolKlines } from "@/lib/bot/kline-cache";
import { useToast } from "@/hooks/use-toast";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";

interface BotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botToEdit?: BotInstance | null;
}

export function BotDialog({ open, onOpenChange, botToEdit }: BotDialogProps) {
  const { addBot, updateBot, tickers } = useCryptoStore(
    useShallow((s) => ({ addBot: s.addBot, updateBot: s.updateBot, tickers: s.tickers }))
  );
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [strategy, setStrategy] = useState<BotStrategy>("QUANT_ENSEMBLE");
  const [takeProfit, setTakeProfit] = useState(2.2);
  const [stopLoss, setStopLoss] = useState(1.0);
  const [trailingStop, setTrailingStop] = useState(true);
  const [trailingStopDistance, setTrailingStopDistance] = useState(0.4);
  const [allocationAmount, setAllocationAmount] = useState(25);
  const [active, setActive] = useState(false);
  const [useMarketRegime, setUseMarketRegime] = useState(true);
  const [useQuantFunnel, setUseQuantFunnel] = useState(false);
  const [useEnsemble, setUseEnsemble] = useState(false);
  const [useMultiTimeframe, setUseMultiTimeframe] = useState(true);
  const [useAutoScreener, setUseAutoScreener] = useState(false);
  const [autoBreakEven, setAutoBreakEven] = useState(true);
  const [breakEvenTrigger, setBreakEvenTrigger] = useState(1.2);
  const [breakEvenBuffer, setBreakEvenBuffer] = useState(0.25);
  const [trailingTakeProfit, setTrailingTakeProfit] = useState(true);
  const [trailingTakeProfitDistance, setTrailingTakeProfitDistance] = useState(0.4);
  const [usePartialTp, setUsePartialTp] = useState(true);
  const [partialTpTrigger, setPartialTpTrigger] = useState(1.0);
  const [partialTpPercent, setPartialTpPercent] = useState(50);
  const [timeStopMinutes, setTimeStopMinutes] = useState(20);
  const [useBtcGatekeeper, setUseBtcGatekeeper] = useState(true);
  const [useSmartDca, setUseSmartDca] = useState(true);
  const [dcaDipThreshold, setDcaDipThreshold] = useState(1.5);
  const [maxDcaOrders, setMaxDcaOrders] = useState(1);
  const [useOrderBookFilter, setUseOrderBookFilter] = useState(true);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [buyThreshold, setBuyThreshold] = useState(30);
  const [sellThreshold, setSellThreshold] = useState(70);
  const [emaFast, setEmaFast] = useState(12);
  const [emaSlow, setEmaSlow] = useState(26);
  const [stopAfterProfit, setStopAfterProfit] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimized, setOptimized] = useState<GeneticChromosome | null>(null);
  const [isAutofilling, setIsAutofilling] = useState(false);
  const [aiUpdated, setAiUpdated] = useState(false);
  const [symbolSelectOpen, setSymbolSelectOpen] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState("");
  const [symbolCategory, setSymbolCategory] = useState<"gainers" | "volume" | "dips" | "all">("gainers");

  const cryptoMetaMap = useMemo(() => {
    const map = new Map<string, (typeof CRYPTO_LIST)[0]>();
    for (const c of CRYPTO_LIST) {
      map.set(c.symbol, c);
    }
    return map;
  }, []);

  const allAvailableSymbols = useMemo(() => {
    const tickerList = Object.values(tickers || {});
    if (tickerList.length === 0) {
      return CRYPTO_LIST.map((c) => ({
        symbol: c.symbol,
        name: c.name,
        short: c.short,
        price: 0,
        change24h: 0,
        volume: 0,
      }));
    }

    return tickerList
      .filter((t) => t.symbol.endsWith("USDT"))
      .map((t) => {
        const meta = cryptoMetaMap.get(t.symbol);
        const short = meta?.short || t.symbol.replace("USDT", "");
        const name = meta?.name || short;
        return {
          symbol: t.symbol,
          name,
          short,
          price: t.price,
          change24h: t.priceChangePercent,
          volume: t.quoteVolume,
        };
      });
  }, [tickers, cryptoMetaMap]);

  const filteredCryptoList = useMemo(() => {
    const q = symbolSearch.toLowerCase().trim();
    let list = allAvailableSymbols;

    if (q) {
      list = list.filter(
        (c) =>
          c.symbol.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.short.toLowerCase().includes(q)
      );
    }

    if (symbolCategory === "gainers") {
      list = [...list].sort((a, b) => b.change24h - a.change24h);
    } else if (symbolCategory === "volume") {
      list = [...list].sort((a, b) => b.volume - a.volume);
    } else if (symbolCategory === "dips") {
      list = [...list].sort((a, b) => a.change24h - b.change24h);
    } else {
      list = [...list].sort((a, b) => b.volume - a.volume);
    }

    return list.slice(0, 80);
  }, [allAvailableSymbols, symbolSearch, symbolCategory]);

  const handleAiAutofill = async () => {
    const parseNum = (val: unknown, fallback: number): number => {
      if (typeof val === "number" && !isNaN(val)) return val;
      if (typeof val === "string") {
        const cleaned = val.replace(/[^0-9.-]/g, "");
        const n = parseFloat(cleaned);
        if (!isNaN(n)) return n;
      }
      return fallback;
    };

    const parseBool = (val: unknown, fallback: boolean): boolean => {
      if (typeof val === "boolean") return val;
      if (typeof val === "string") {
        const s = val.toLowerCase().trim();
        if (s === "true" || s === "1" || s === "sim" || s === "yes") return true;
        if (s === "false" || s === "0" || s === "nao" || s === "não" || s === "no") return false;
      }
      return fallback;
    };

    try {
      setIsAutofilling(true);
      toast({
        title: "🤖 Analisando Mercado com IA...",
        description: `Calculando parâmetros ideais de lucro, filtros e risco para ${symbol.replace("USDT", "")}...`,
      });

      const res = await fetch("/api/ai/bot-autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          currentConfig: { name, strategy, takeProfit, stopLoss, allocationAmount, trailingStop, trailingStopDistance },
        }),
      });

      if (!res.ok) throw new Error("Erro na requisição da IA");
      const data = await res.json();

      if (data.success && data.config) {
        const cfg = data.config;
        if (!botToEdit && cfg.name && typeof cfg.name === "string") {
          setName(cfg.name);
        }
        if (cfg.strategy && typeof cfg.strategy === "string") {
          setStrategy(cfg.strategy as BotStrategy);
        }
        
        const newTp = parseNum(cfg.takeProfit, takeProfit);
        const newSl = parseNum(cfg.stopLoss, stopLoss);
        const newTs = parseBool(cfg.trailingStop, trailingStop);
        const newTsDist = parseNum(cfg.trailingStopDistance, trailingStopDistance);
        const newAlloc = parseNum(cfg.allocationAmount, allocationAmount);

        setTakeProfit(newTp);
        setStopLoss(newSl);
        setTrailingStop(newTs);
        setTrailingStopDistance(newTsDist);
        setAllocationAmount(newAlloc);

        if (cfg.useMarketRegime !== undefined) setUseMarketRegime(parseBool(cfg.useMarketRegime, useMarketRegime));
        if (cfg.useQuantFunnel !== undefined) setUseQuantFunnel(parseBool(cfg.useQuantFunnel, useQuantFunnel));
        if (cfg.useEnsemble !== undefined) setUseEnsemble(parseBool(cfg.useEnsemble, useEnsemble));
        if (cfg.useMultiTimeframe !== undefined) setUseMultiTimeframe(parseBool(cfg.useMultiTimeframe, useMultiTimeframe));
        if (cfg.autoBreakEven !== undefined) setAutoBreakEven(parseBool(cfg.autoBreakEven, autoBreakEven));
        if (cfg.breakEvenTrigger !== undefined) setBreakEvenTrigger(parseNum(cfg.breakEvenTrigger, breakEvenTrigger));
        if (cfg.breakEvenBuffer !== undefined) setBreakEvenBuffer(parseNum(cfg.breakEvenBuffer, breakEvenBuffer));
        
        if (cfg.buyThreshold !== undefined) setBuyThreshold(parseNum(cfg.buyThreshold, buyThreshold));
        if (cfg.sellThreshold !== undefined) setSellThreshold(parseNum(cfg.sellThreshold, sellThreshold));
        if (cfg.rsiPeriod !== undefined) setRsiPeriod(Math.round(parseNum(cfg.rsiPeriod, rsiPeriod)));
        if (cfg.emaFast !== undefined) setEmaFast(Math.round(parseNum(cfg.emaFast, emaFast)));
        if (cfg.emaSlow !== undefined) setEmaSlow(Math.round(parseNum(cfg.emaSlow, emaSlow)));

        setAiUpdated(true);
        setTimeout(() => setAiUpdated(false), 3500);

        toast({
          title: "✨ Parâmetros Otimizados pela IA!",
          description: `Alvo: +${newTp}% · Stop: -${newSl}% · Trailing: ${newTs ? `${newTsDist}%` : "Off"}. ${cfg.reasoning || ""}`,
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
      setUseMultiTimeframe(botToEdit.useMultiTimeframe ?? true);
      setUseAutoScreener(botToEdit.useAutoScreener ?? (botToEdit.symbol === "AUTO"));
      setAutoBreakEven(botToEdit.autoBreakEven ?? true);
      setBreakEvenTrigger(botToEdit.breakEvenTrigger ?? 0.8);
      setBreakEvenBuffer(botToEdit.breakEvenBuffer ?? 0.25);
      setTrailingTakeProfit(botToEdit.trailingTakeProfit ?? true);
      setTrailingTakeProfitDistance(botToEdit.trailingTakeProfitDistance ?? 0.5);
      setUsePartialTp(botToEdit.usePartialTp ?? true);
      setPartialTpTrigger(botToEdit.partialTpTrigger ?? 1.0);
      setPartialTpPercent(botToEdit.partialTpPercent ?? 50);
      setTimeStopMinutes(botToEdit.timeStopMinutes ?? 20);
      setUseBtcGatekeeper(botToEdit.useBtcGatekeeper ?? true);
      setUseSmartDca(botToEdit.useSmartDca ?? true);
      setDcaDipThreshold(botToEdit.dcaDipThreshold ?? 1.5);
      setMaxDcaOrders(botToEdit.maxDcaOrders ?? 1);
      setUseOrderBookFilter(botToEdit.useOrderBookFilter ?? true);
      setRsiPeriod(botToEdit.rsiPeriod ?? 14);
      setBuyThreshold(botToEdit.buyThreshold ?? 30);
      setSellThreshold(botToEdit.sellThreshold ?? 70);
      setEmaFast(botToEdit.emaFast ?? 12);
      setEmaSlow(botToEdit.emaSlow ?? 26);
      setStopAfterProfit(botToEdit.stopAfterProfit ?? false);
    } else {
      setName("Novo Robô de Lucro");
      setSymbol("SOLUSDT");
      setStrategy("QUANT_ENSEMBLE");
      setTakeProfit(2.2);
      setStopLoss(1.0);
      setTrailingStop(true);
      setTrailingStopDistance(0.4);
      setAllocationAmount(25);
      setActive(false);
      setUseMarketRegime(true);
      setUseQuantFunnel(false);
      setUseEnsemble(false);
      setUseMultiTimeframe(true);
      setUseAutoScreener(false);
      setAutoBreakEven(true);
      setBreakEvenTrigger(1.2);
      setBreakEvenBuffer(0.25);
      setTrailingTakeProfit(true);
      setTrailingTakeProfitDistance(0.4);
      setUsePartialTp(true);
      setPartialTpTrigger(1.0);
      setPartialTpPercent(50);
      setTimeStopMinutes(20);
      setUseBtcGatekeeper(true);
      setUseSmartDca(true);
      setDcaDipThreshold(1.5);
      setMaxDcaOrders(1);
      setUseOrderBookFilter(true);
      setStopAfterProfit(false);
      setRsiPeriod(14);
      setBuyThreshold(30);
      setSellThreshold(70);
      setEmaFast(12);
      setEmaSlow(26);
    }
    setOptimized(null);
  }, [botToEdit, open]);

  const handleApplyPreset = (preset: "scalp" | "swing" | "dips" | "screener") => {
    if (preset === "scalp") {
      setTakeProfit(2.2);
      setStopLoss(1.0);
      setTrailingStop(true);
      setTrailingStopDistance(0.4);
      setBreakEvenTrigger(1.2);
      setBreakEvenBuffer(0.25);
      setUsePartialTp(true);
      setPartialTpTrigger(1.0);
      setPartialTpPercent(50);
      setTimeStopMinutes(20);
      setUseBtcGatekeeper(true);
      setUseAutoScreener(false);
      setName(`Scalper ${symbol.replace("USDT", "")}`);
    } else if (preset === "swing") {
      setTakeProfit(5.0);
      setStopLoss(2.5);
      setTrailingStop(true);
      setTrailingStopDistance(1.2);
      setUseAutoScreener(false);
      setName(`Swing ${symbol.replace("USDT", "")} Trend`);
    } else if (preset === "dips") {
      setStrategy("RSI");
      setTakeProfit(3.8);
      setStopLoss(1.8);
      setTrailingStop(true);
      setTrailingStopDistance(0.8);
      setUseAutoScreener(false);
      setName(`Dip Hunter ${symbol.replace("USDT", "")}`);
    } else if (preset === "screener") {
      setSymbol("AUTO");
      setStrategy("BREAKOUT");
      setTakeProfit(3.8);
      setStopLoss(1.6);
      setTrailingStop(true);
      setTrailingStopDistance(0.8);
      setUseAutoScreener(true);
      setUseMultiTimeframe(true);
      setUseMarketRegime(true);
      setName("Auto-Screener Líderes de Alta");
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
        useMultiTimeframe,
        useAutoScreener: useAutoScreener || symbol === "AUTO",
        autoBreakEven,
        breakEvenTrigger,
        breakEvenBuffer,
        trailingTakeProfit,
        trailingTakeProfitDistance,
        usePartialTp,
        partialTpTrigger,
        partialTpPercent,
        timeStopMinutes,
        useBtcGatekeeper,
        useSmartDca,
        dcaDipThreshold,
        maxDcaOrders,
        useOrderBookFilter,
        rsiPeriod,
        buyThreshold,
        sellThreshold,
        emaFast,
        emaSlow,
        stopAfterProfit,
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
        useMultiTimeframe,
        useAutoScreener: useAutoScreener || symbol === "AUTO",
        autoBreakEven,
        breakEvenTrigger,
        breakEvenBuffer,
        trailingTakeProfit,
        trailingTakeProfitDistance,
        usePartialTp,
        partialTpTrigger,
        partialTpPercent,
        timeStopMinutes,
        useBtcGatekeeper,
        useSmartDca,
        dcaDipThreshold,
        maxDcaOrders,
        useOrderBookFilter,
        rsiPeriod,
        buyThreshold,
        sellThreshold,
        emaFast,
        emaSlow,
        stopAfterProfit,
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleApplyPreset("screener")}
              className="text-xs h-7 px-2.5 border-orange-500/50 text-orange-400 hover:bg-orange-500/10 cursor-pointer font-bold"
            >
              🔥 Auto-Screener de Altas
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
                    className={`w-full h-9 text-xs border-border justify-between px-2.5 font-bold ${
                      symbol === "AUTO" || useAutoScreener
                        ? "bg-orange-500/15 border-orange-500/40 text-orange-400 hover:bg-orange-500/25"
                        : "bg-secondary/30"
                    }`}
                  >
                    <span>{symbol === "AUTO" ? "🔥 AUTO (Screener de Altas)" : symbol.replace("USDT", "/USDT")}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] sm:w-[350px] p-0 glass border-border/50 bg-[#0d1424]/95 shadow-xl" align="start">
                  <div className="p-2 border-b border-border/30 space-y-1.5">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Buscar entre 500+ pares Binance..."
                        value={symbolSearch}
                        onChange={(e) => setSymbolSearch(e.target.value)}
                        className="h-7 pl-7 text-xs bg-secondary/30 border-border/50"
                        autoFocus
                      />
                    </div>
                    {/* Category tabs */}
                    <div className="flex items-center gap-1 justify-between pt-0.5">
                      {[
                        { id: "gainers", label: "🔥 Em Alta" },
                        { id: "volume", label: "📊 Volume" },
                        { id: "dips", label: "📉 Dips" },
                        { id: "all", label: "🌐 Todas (500+)" },
                      ].map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSymbolCategory(cat.id as any)}
                          className={cn(
                            "px-1.5 py-0.5 text-[10px] rounded font-semibold transition-colors flex-1 text-center cursor-pointer",
                            symbolCategory === cat.id
                              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                              : "text-muted-foreground hover:text-white hover:bg-white/[0.05]"
                          )}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="max-h-[250px] overflow-y-auto cyan-scrollbar p-1">
                    {/* AUTO SCREENER OPTION */}
                    <button
                      type="button"
                      onClick={() => {
                        setSymbol("AUTO");
                        setUseAutoScreener(true);
                        setSymbolSelectOpen(false);
                        setSymbolSearch("");
                      }}
                      className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-orange-500/20 flex items-center justify-between transition-colors border border-orange-500/30 mb-1 ${
                        symbol === "AUTO" ? "bg-orange-500/20 text-orange-400 font-bold" : "text-orange-400"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-bold">🔥 AUTO</span>
                        <span className="text-muted-foreground text-[10px] truncate">Auto-Screener de Altas</span>
                      </div>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-orange-500/40 text-orange-300">
                        Top 500+ Dinâmico
                      </Badge>
                    </button>

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
                          <span className="text-muted-foreground text-[10px] truncate">
                            {c.name !== c.short ? `(${c.name})` : ""}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                          {c.price > 0 && (
                            <span className="text-muted-foreground font-medium">
                              ${formatPrice(c.price)}
                            </span>
                          )}
                          <span
                            className={cn(
                              "text-[10px] font-bold px-1 rounded",
                              c.change24h >= 0
                                ? "text-emerald-400 bg-emerald-500/10"
                                : "text-red-400 bg-red-500/10"
                            )}
                          >
                            {c.change24h >= 0 ? "+" : ""}
                            {c.change24h.toFixed(1)}%
                          </span>
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
          <div className={`bg-secondary/25 p-3 rounded-xl border transition-all duration-300 space-y-3 ${
            aiUpdated
              ? "border-crypto-cyan/70 shadow-[0_0_15px_rgba(0,240,255,0.15)] ring-1 ring-crypto-cyan/50"
              : "border-border/40"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold">2. Filtros de segurança — quando o robô NÃO compra</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Filtros só bloqueiam compras; nunca forçam uma. Além deles, o robô sempre bloqueia compras com volatilidade (ATR) ≥ 5%.
                </p>
              </div>
              {aiUpdated && (
                <span className="text-[10px] font-bold text-crypto-cyan bg-crypto-cyan/15 px-2 py-0.5 rounded-full animate-pulse border border-crypto-cyan/30 shrink-0">
                  ✨ IA Otimizou
                </span>
              )}
            </div>
            {ENGINE_FILTERS.map((f) => {
              const checked =
                f.key === "useMarketRegime"
                  ? useMarketRegime
                  : f.key === "useQuantFunnel"
                  ? useQuantFunnel
                  : f.key === "useMultiTimeframe"
                  ? useMultiTimeframe
                  : f.key === "useAutoScreener"
                  ? useAutoScreener
                  : f.key === "autoBreakEven"
                  ? autoBreakEven
                  : f.key === "useOrderBookFilter"
                  ? useOrderBookFilter
                  : f.key === "useSmartDca"
                  ? useSmartDca
                  : useEnsemble;
              const set =
                f.key === "useMarketRegime"
                  ? setUseMarketRegime
                  : f.key === "useQuantFunnel"
                  ? setUseQuantFunnel
                  : f.key === "useMultiTimeframe"
                  ? setUseMultiTimeframe
                  : f.key === "useAutoScreener"
                  ? setUseAutoScreener
                  : f.key === "autoBreakEven"
                  ? setAutoBreakEven
                  : f.key === "useOrderBookFilter"
                  ? setUseOrderBookFilter
                  : f.key === "useSmartDca"
                  ? setUseSmartDca
                  : setUseEnsemble;
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
          <div className={`bg-secondary/25 p-3 rounded-xl border transition-all duration-300 space-y-3.5 ${
            aiUpdated
              ? "border-crypto-green/70 shadow-[0_0_15px_rgba(0,255,136,0.15)] ring-1 ring-crypto-green/50"
              : "border-border/40"
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-1.5 text-crypto-green">
                <Target className="w-3.5 h-3.5" />
                Meta de Lucro: Take Profit (+{takeProfit}%)
              </span>
              <div className="flex items-center gap-1.5">
                {aiUpdated && (
                  <span className="text-[10px] font-bold text-crypto-green bg-crypto-green/15 px-2 py-0.5 rounded-full animate-pulse border border-crypto-green/30">
                    ✨ IA Otimizou
                  </span>
                )}
                <span className="text-xs font-extrabold text-crypto-green">+{takeProfit}%</span>
              </div>
            </div>
            <Slider
              value={[takeProfit]}
              min={0.5}
              max={15.0}
              step={0.1}
              onValueChange={([val]) => setTakeProfit(parseFloat(val.toFixed(1)))}
              className="py-1"
            />
            <p className="text-[10px] text-muted-foreground">
              O robô venderá automaticamente 100% da posição quando o lucro atingir +{takeProfit}%.
            </p>

            {/* Trailing Take-Profit Dinâmico */}
            <div className="border-t border-border/30 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Rocket className="w-3.5 h-3.5 text-emerald-400" />
                    Trailing Take-Profit Dinâmico (Deixar Lucro Correr)
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    Ao atingir a meta de +{takeProfit}%, não encerra imediatamente: acompanha a alta e só realiza se recuar {trailingTakeProfitDistance}% do pico.
                  </p>
                </div>
                <Switch checked={trailingTakeProfit} onCheckedChange={setTrailingTakeProfit} />
              </div>

              {trailingTakeProfit && (
                <div className="space-y-1.5 pt-1 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] text-emerald-200">Distância de Saída do Topo:</span>
                    <span className="font-bold text-emerald-300">{trailingTakeProfitDistance}%</span>
                  </div>
                  <Slider
                    value={[trailingTakeProfitDistance]}
                    min={0.2}
                    max={2.0}
                    step={0.1}
                    onValueChange={([val]) => setTrailingTakeProfitDistance(parseFloat(val.toFixed(1)))}
                  />
                  <p className="text-[9px] text-muted-foreground">
                    Se a moeda continuar subindo após +{takeProfit}%, o robô surfa a alta até o topo e vende no primeiro recuo de {trailingTakeProfitDistance}%.
                  </p>
                </div>
              )}
            </div>

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

            {/* Break-Even Automático (Risco Zero Protegido) */}
            <div className="border-t border-border/30 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    Break-Even Automático (Risco Zero Protegido)
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    Quando o lucro atingir +{breakEvenTrigger}%, move o Stop para o preço de entrada +{breakEvenBuffer}% (cobrindo taxas). Zero risco de prejuízo no trade.
                  </p>
                </div>
                <Switch checked={autoBreakEven} onCheckedChange={setAutoBreakEven} />
              </div>

              {autoBreakEven && (
                <div className="space-y-3 pt-1 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] text-amber-200">Gatilho de Ativação do Break-Even:</span>
                      <span className="font-bold text-amber-300">+{breakEvenTrigger}%</span>
                    </div>
                    <Slider
                      value={[breakEvenTrigger]}
                      min={0.6}
                      max={4.0}
                      step={0.1}
                      onValueChange={([val]) => setBreakEvenTrigger(parseFloat(val.toFixed(1)))}
                    />
                    <p className="text-[9px] text-muted-foreground">
                      Ao atingir este ganho parcial, o Break-Even é armado permanentemente nesta posição.
                    </p>
                  </div>

                  <div className="space-y-1 pt-1 border-t border-amber-500/20">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] text-amber-200">Margem Acima da Entrada (Buffer Taxas Binance):</span>
                      <span className="font-bold text-amber-300">+{breakEvenBuffer}%</span>
                    </div>
                    <Slider
                      value={[breakEvenBuffer]}
                      min={0.1}
                      max={0.8}
                      step={0.05}
                      onValueChange={([val]) => setBreakEvenBuffer(parseFloat(val.toFixed(2)))}
                    />
                    <p className="text-[9px] text-muted-foreground">
                      Garante que a saída ocorra acima das taxas Spot da Binance (0.1% compra + 0.1% venda = 0.20%), saindo no verde.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* DCA Inteligente em Níveis de Suporte */}
            <div className="border-t border-border/30 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                    DCA Inteligente em Suporte (Preço Médio Estratégico)
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    Se a operação recuar até o suporte sem tocar no Stop Loss, executa 1 reentrada calculada para baratear o preço médio e lucrar no repique.
                  </p>
                </div>
                <Switch checked={useSmartDca} onCheckedChange={setUseSmartDca} />
              </div>

              {useSmartDca && (
                <div className="space-y-1.5 pt-1 bg-cyan-500/10 border border-cyan-500/20 p-2.5 rounded-lg">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] text-cyan-200">Recuo Mínimo para DCA em Suporte:</span>
                    <span className="font-bold text-cyan-300">-{dcaDipThreshold}%</span>
                  </div>
                  <Slider
                    value={[dcaDipThreshold]}
                    min={0.8}
                    max={3.5}
                    step={0.1}
                    onValueChange={([val]) => setDcaDipThreshold(parseFloat(val.toFixed(1)))}
                  />
                  <p className="text-[9px] text-muted-foreground">
                    Dispara reentrada apenas se o recuo atingir -{dcaDipThreshold}% E houver confirmação técnica de suporte/sobrevenda (RSI ≤ 38 ou rejeição de fundo).
                  </p>
                </div>
              )}
            </div>

            {/* Realização Parcial (Scale-Out 50% no 1º Alvo) */}
            <div className="border-t border-border/30 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-violet-400 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-violet-400" />
                    Realização Parcial (Scale-Out 50% no 1º Alvo)
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    Ao atingir +{partialTpTrigger}%, vende 50% da moeda garantindo lucro em caixa e trava os 50% restantes no Break-Even com risco ZERO.
                  </p>
                </div>
                <Switch checked={usePartialTp} onCheckedChange={setUsePartialTp} />
              </div>

              {usePartialTp && (
                <div className="space-y-1.5 pt-1 bg-violet-500/10 border border-violet-500/20 p-2.5 rounded-lg">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] text-violet-200">Gatilho do 1º Alvo Parcial:</span>
                    <span className="font-bold text-violet-300">+{partialTpTrigger}%</span>
                  </div>
                  <Slider
                    value={[partialTpTrigger]}
                    min={0.6}
                    max={2.5}
                    step={0.1}
                    onValueChange={([val]) => setPartialTpTrigger(parseFloat(val.toFixed(1)))}
                  />
                  <p className="text-[9px] text-muted-foreground">
                    Ao bater +{partialTpTrigger}%, o robô embolsa 50% do lucro líquido imediatamente e deixa o restante surfar a alta via Trailing Stop.
                  </p>
                </div>
              )}
            </div>

            {/* Filtro Direcional do Bitcoin (BTC Market Gatekeeper) */}
            <div className="border-t border-border/30 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-amber-400" />
                    Filtro Direcional do Bitcoin (BTC Gatekeeper)
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    Pausa novas ordens de compra se o Bitcoin estiver em queda intradiária rápida no gráfico de 5m/15m, evitando armadilhas de baixa do mercado geral.
                  </p>
                </div>
                <Switch checked={useBtcGatekeeper} onCheckedChange={setUseBtcGatekeeper} />
              </div>
            </div>

            {/* Time-Stop (Saída por Estagnação de Capital) */}
            <div className="border-t border-border/30 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-orange-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-orange-400" />
                    Time-Stop (Saída por Estagnação de Capital)
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    Se o trade durar mais de {timeStopMinutes} minutos sem evoluir (oscilando no zero a zero), encerra a operação para liberar o saldo para novas oportunidades.
                  </p>
                </div>
                <Switch checked={timeStopMinutes > 0} onCheckedChange={(chk) => setTimeStopMinutes(chk ? 20 : 0)} />
              </div>

              {timeStopMinutes > 0 && (
                <div className="space-y-1.5 pt-1 bg-orange-500/10 border border-orange-500/20 p-2.5 rounded-lg">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] text-orange-200">Tempo Máximo sem Rompimento:</span>
                    <span className="font-bold text-orange-300">{timeStopMinutes} minutos</span>
                  </div>
                  <Slider
                    value={[timeStopMinutes]}
                    min={5}
                    max={60}
                    step={5}
                    onValueChange={([val]) => setTimeStopMinutes(val)}
                  />
                  <p className="text-[9px] text-muted-foreground">
                    Evita que o robô fique com capital preso por horas em moedas dormentes.
                  </p>
                </div>
              )}
            </div>

            {/* Encerrar após Obter Lucro (Operação Única) */}
            <div className="border-t border-border/30 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="pr-3">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Encerrar Robô após Lucro (Operação Única)
                  </span>
                  <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                    Vende 100% da posição assim que obtiver lucro (+{takeProfit}% ou via Trailing Stop/encerramento) e desativa o robô automaticamente. Não abrirá novas compras.
                  </p>
                </div>
                <Switch checked={stopAfterProfit} onCheckedChange={setStopAfterProfit} />
              </div>

              {stopAfterProfit && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-lg text-[10px] text-emerald-300 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    Modo de Operação Única Ativado
                  </div>
                  <p className="opacity-90 leading-relaxed">
                    O robô realizará a compra, protegerá a operação e, no momento em que a venda for executada com lucro, encerrará a operação e desligará sem recomprar.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>

        <DialogFooter className="px-5 py-3 gap-2 border-t border-border/40 shrink-0 flex items-center justify-between sm:justify-between flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isAutofilling}
            onClick={handleAiAutofill}
            className={`text-xs h-9 px-3.5 border-crypto-cyan/50 text-crypto-cyan bg-crypto-cyan/10 hover:bg-crypto-cyan/20 font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5 ${
              aiUpdated ? "ring-2 ring-crypto-cyan bg-crypto-cyan/20" : ""
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 ${isAutofilling ? "animate-spin" : "text-amber-300"}`} />
            {isAutofilling ? "Analisando..." : "Autopreencher com IA"}
          </Button>

          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="text-xs h-9 cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              className="text-xs h-9 bg-gradient-to-r from-crypto-cyan to-blue-600 text-white font-semibold shadow-md cursor-pointer hover:opacity-95"
            >
              {botToEdit ? "Salvar Alterações" : "Criar Robô"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
