"use client";

import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Settings, AlertTriangle, Brain, TrendingUp, BarChart3, Zap, Sparkles, Loader2 } from "lucide-react";
import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

const SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
  "DOTUSDT",
  "LINKUSDT",
  "MATICUSDT",
  "ATOMUSDT",
];

const STRATEGY_ICONS: Record<string, React.ElementType> = {
  RSI: TrendingUp,
  MACD: BarChart3,
  AI: Brain,
};

export function BotConfigForm() {
  const { botConfig, setBotConfig, tradingMode, botActive, tickers, selectedSymbol } = useCryptoStore();
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const { toast } = useToast();

  const updateConfig = (key: string, value: number | string | boolean) => {
    setBotConfig({ ...botConfig, [key]: value });
  };

  const handleAISuggest = useCallback(async () => {
    const ticker = tickers[botConfig.symbol];
    if (!ticker) return;
    setAiSuggesting(true);
    try {
      const res = await fetch("/api/ai/sltp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: botConfig.symbol,
          price: ticker.price,
          high24h: ticker.high,
          low24h: ticker.low,
          volume: ticker.quoteVolume,
          priceChange24h: ticker.priceChangePercent,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success && result.data) {
          const slPct = Math.abs(result.data.slPercent);
          const tpPct = Math.abs(result.data.tpPercent);
          setBotConfig({
            ...botConfig,
            stopLoss: Math.min(10, Math.max(0.5, parseFloat(slPct.toFixed(1)))),
            takeProfit: Math.min(20, Math.max(1, parseFloat(tpPct.toFixed(1)))),
          });
          toast({
            title: "🎯 SL/TP Ajustado pela IA",
            description: `SL: ${slPct.toFixed(1)}% | TP: ${tpPct.toFixed(1)}% | R:R 1:${result.data.riskRewardRatio.toFixed(1)}`,
          });
        }
      }
    } catch {
      toast({
        title: "Erro",
        description: "Não foi possível obter sugestão da IA",
        variant: "destructive",
      });
    } finally {
      setAiSuggesting(false);
    }
  }, [botConfig, tickers, setBotConfig, toast]);

  return (
    <Card className="bg-card border-border gradient-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Settings className="w-4 h-4 text-crypto-cyan" />
          Configuração do Bot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Strategy Select */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Estratégia</Label>
          <RadioGroup
            value={botConfig.strategy}
            onValueChange={(val) => {
              const strategy = val as "RSI" | "MACD" | "AI";
              const updates: Partial<typeof botConfig> = { strategy };
              if (strategy === "RSI") {
                updates.buyThreshold = 30;
                updates.sellThreshold = 70;
              } else if (strategy === "MACD") {
                updates.buyThreshold = 0;
                updates.sellThreshold = 0;
              }
              setBotConfig({ ...botConfig, ...updates });
            }}
            className="flex gap-2"
            disabled={botActive}
          >
            {(["RSI", "MACD", "AI"] as const).map((s) => {
              const Icon = STRATEGY_ICONS[s];
              return (
                <Label
                  key={s}
                  htmlFor={`strategy-${s}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-xs ${
                    botConfig.strategy === s
                      ? "border-crypto-cyan bg-crypto-cyan/10 text-crypto-cyan"
                      : "border-border bg-secondary/30 text-muted-foreground hover:border-muted-foreground/30"
                  } ${botActive ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <RadioGroupItem
                    value={s}
                    id={`strategy-${s}`}
                    className="sr-only"
                  />
                  <Icon className="w-3.5 h-3.5" />
                  {s}
                </Label>
              );
            })}
          </RadioGroup>
        </div>

        {/* Strategy-specific info */}
        {botConfig.strategy === "AI" && (
          <div className="text-xs text-crypto-cyan bg-crypto-cyan/5 border border-crypto-cyan/20 rounded-md p-2.5">
            A estratégia de IA analisará condições de mercado usando reconhecimento avançado de padrões e análise de sentimento.
          </div>
        )}
        {botConfig.strategy === "RSI" && (
          <div className="text-xs text-muted-foreground bg-secondary/30 rounded-md p-2.5">
            A estratégia RSI compra quando RSI cai abaixo de {botConfig.buyThreshold} e vende quando RSI sobe acima de {botConfig.sellThreshold}.
          </div>
        )}
        {botConfig.strategy === "MACD" && (
          <div className="text-xs text-muted-foreground bg-secondary/30 rounded-md p-2.5">
            A estratégia MACD compra no cruzamento de alta e vende no cruzamento de baixa da linha de sinal.
          </div>
        )}

        {/* Symbol Select */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Símbolo</Label>
          <Select
            value={botConfig.symbol}
            onValueChange={(val) => updateConfig("symbol", val)}
            disabled={botActive}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecionar símbolo" />
            </SelectTrigger>
            <SelectContent>
              {SYMBOLS.map((sym) => (
                <SelectItem key={sym} value={sym}>
                  {sym.replace("USDT", "/USDT")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stop Loss */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Stop Loss</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[9px] text-crypto-cyan hover:text-crypto-cyan hover:bg-crypto-cyan/10 gap-0.5"
                onClick={handleAISuggest}
                disabled={botActive || aiSuggesting}
                title="Sugerir pela IA"
              >
                {aiSuggesting ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />}
                IA
              </Button>
              <span className="text-xs font-medium text-crypto-red">
                {botConfig.stopLoss}%
              </span>
            </div>
          </div>
          <Slider
            value={[botConfig.stopLoss]}
            onValueChange={([val]) => updateConfig("stopLoss", val)}
            min={0.5}
            max={10}
            step={0.5}
            disabled={botActive}
            className="[&_[data-slot=slider-range]]:bg-crypto-red"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0.5%</span>
            <span>10%</span>
          </div>
        </div>

        {/* Take Profit */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Take Profit</Label>
            <span className="text-xs font-medium text-crypto-green">
              {botConfig.takeProfit}%
            </span>
          </div>
          <Slider
            value={[botConfig.takeProfit]}
            onValueChange={([val]) => updateConfig("takeProfit", val)}
            min={1}
            max={20}
            step={0.5}
            disabled={botActive}
            className="[&_[data-slot=slider-range]]:bg-crypto-green"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>1%</span>
            <span>20%</span>
          </div>
        </div>

        {/* Max Daily Trades */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Máx. Trades Diários</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={botConfig.maxDailyTrades}
            onChange={(e) =>
              updateConfig("maxDailyTrades", Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))
            }
            disabled={botActive}
            className="h-8 text-xs"
          />
        </div>

        {/* Buy Threshold */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            {botConfig.strategy === "RSI"
              ? "Limiar de Compra (RSI abaixo)"
              : botConfig.strategy === "MACD"
                ? "Sinal de Compra (Cruzamento)"
                : "Limiar de Compra"}
          </Label>
          <Input
            type="number"
            value={botConfig.buyThreshold}
            onChange={(e) =>
              updateConfig("buyThreshold", parseFloat(e.target.value) || 0)
            }
            disabled={botActive || botConfig.strategy === "MACD"}
            className="h-8 text-xs"
            placeholder={
              botConfig.strategy === "RSI"
                ? "Abaixo de 30"
                : botConfig.strategy === "MACD"
                  ? "Cruzamento de sinal"
                  : "Limiar"
            }
          />
        </div>

        {/* Sell Threshold */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            {botConfig.strategy === "RSI"
              ? "Limiar de Venda (RSI acima)"
              : botConfig.strategy === "MACD"
                ? "Sinal de Venda (Cruzamento)"
                : "Limiar de Venda"}
          </Label>
          <Input
            type="number"
            value={botConfig.sellThreshold}
            onChange={(e) =>
              updateConfig("sellThreshold", parseFloat(e.target.value) || 0)
            }
            disabled={botActive || botConfig.strategy === "MACD"}
            className="h-8 text-xs"
            placeholder={
              botConfig.strategy === "RSI"
                ? "Acima de 70"
                : botConfig.strategy === "MACD"
                  ? "Cruzamento de sinal"
                  : "Limiar"
            }
          />
        </div>

        {/* Initial Balance */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Saldo Inicial (Simulado)</Label>
          <Input
            type="number"
            min={100}
            step={1000}
            value={botConfig.initialBalance}
            onChange={(e) =>
              updateConfig("initialBalance", Math.max(100, parseFloat(e.target.value) || 100))
            }
            disabled={botActive}
            className="h-8 text-xs"
          />
        </div>

        {/* Auto-Trade from Signals */}
        <div className="space-y-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-crypto-cyan" />
              <Label className="text-xs text-muted-foreground">Auto-trade de Sinais</Label>
            </div>
            <Switch
              checked={botConfig.autoTradeSignals}
              onCheckedChange={(checked) =>
                updateConfig("autoTradeSignals", checked)
              }
              disabled={botActive}
              className="data-[state=checked]:bg-crypto-cyan"
            />
          </div>
          {botConfig.autoTradeSignals && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  Limiar de Confiança
                </Label>
                <span className="text-xs font-medium text-crypto-cyan">
                  {botConfig.signalConfidenceThreshold}%
                </span>
              </div>
              <Slider
                value={[botConfig.signalConfidenceThreshold]}
                onValueChange={([val]) => updateConfig("signalConfidenceThreshold", val)}
                min={50}
                max={100}
                step={5}
                disabled={botActive}
                className="[&_[data-slot=slider-range]]:bg-crypto-cyan"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>50%</span>
                <span>100%</span>
              </div>
              <div className="text-[10px] text-crypto-cyan/70 bg-crypto-cyan/5 border border-crypto-cyan/10 rounded-md p-2">
                Sinais com confiança ≥ {botConfig.signalConfidenceThreshold}% acionarão automaticamente trades quando o bot estiver ativo.
              </div>
            </div>
          )}
        </div>

        {/* Live Trading API Keys */}
        {tradingMode === "live" && (
          <div className="space-y-3 pt-2 border-t border-border">
            <Alert className="border-crypto-red/30 bg-crypto-red/5">
              <AlertTriangle className="w-4 h-4 text-crypto-red" />
              <AlertTitle className="text-crypto-red text-xs font-medium">
                Aviso de Risco - Trading Real
              </AlertTitle>
              <AlertDescription className="text-xs text-crypto-red/80">
                Trading real usa fundos reais. Certifique-se de que suas chaves API têm permissões corretas e nunca as compartilhe.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Chave API</Label>
              <Input
                type="password"
                placeholder="Insira sua chave API"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Segredo API</Label>
              <Input
                type="password"
                placeholder="Insira seu segredo API"
                className="h-8 text-xs"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
