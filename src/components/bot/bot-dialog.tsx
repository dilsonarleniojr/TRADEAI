"use client";

import { useState, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Bot, Sparkles, Target, ShieldAlert, DollarSign, Brain, Layers, Activity, TrendingUp, Grid, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botToEdit?: BotInstance | null;
}

const STRATEGIES: { id: BotStrategy; name: string; desc: string; icon: any }[] = [
  { id: "QUANT_ENSEMBLE", name: "Quant Ensemble (AI)", desc: "Comitê neural com consenso de múltiplos modelos e sentimento", icon: Brain },
  { id: "RSI", name: "RSI Dip Hunter", desc: "Compre em sobrevenda (<30) e venda em alvos de lucro calculados", icon: TrendingUp },
  { id: "MACD", name: "MACD Momentum", desc: "Siga tendências fortes com confirmação de cruzamento e volume", icon: Activity },
  { id: "GRID", name: "Grid Scalper", desc: "Captura oscilações em faixas de preço no mercado lateral", icon: Grid },
  { id: "BREAKOUT", name: "Volume Breakout", desc: "Rompimento de resistências chave com volume institucional", icon: Zap },
  { id: "MEAN_REVERSION", name: "Bollinger Reversion", desc: "Retorno à média com compras na banda inferior", icon: Layers },
];

export function BotDialog({ open, onOpenChange, botToEdit }: BotDialogProps) {
  const { addBot, updateBot } = useCryptoStore();
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
  const [isAutofilling, setIsAutofilling] = useState(false);

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
    }
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
      <DialogContent className="sm:max-w-[550px] bg-card/95 backdrop-blur-xl border border-border/80 text-foreground max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Bot className="w-5 h-5 text-crypto-cyan" />
            {botToEdit ? `Editar ${botToEdit.name}` : "Criar Novo Robô de Lucro Simultâneo"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Configure o ativo, estratégia e parâmetros de lucro automatizado para operar em conjunto com os outros robôs.
          </DialogDescription>
        </DialogHeader>

        {/* Quick Presets & AI Autofill */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
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
          <div className="flex gap-2 pt-0.5">
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

        <div className="space-y-4 py-2">
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
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger className="h-9 text-xs bg-secondary/30">
                  <SelectValue placeholder="Selecione a moeda" />
                </SelectTrigger>
                <SelectContent className="max-h-[220px]">
                  {CRYPTO_LIST.map((c) => (
                    <SelectItem key={c.symbol} value={c.symbol} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{c.short}</span>
                        <span className="text-muted-foreground text-[10px]">({c.name})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          {/* Strategy Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Estratégia de Entrada Lucrativa</Label>
            <div className="grid grid-cols-2 gap-2">
              {STRATEGIES.map((strat) => {
                const Icon = strat.icon;
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
                    <div className="flex items-center gap-1.5">
                      <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-crypto-cyan" : "text-muted-foreground"}`} />
                      <span className={`text-xs font-bold ${isSelected ? "text-crypto-cyan" : "text-foreground"}`}>
                        {strat.name}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-1 leading-snug">
                      {strat.desc}
                    </p>
                  </div>
                );
              })}
            </div>
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

        <DialogFooter className="pt-2 gap-2">
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
