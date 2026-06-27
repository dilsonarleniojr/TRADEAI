"use client";

import { useCryptoStore } from "@/lib/store";
import { ALL_SYMBOLS } from "@/lib/crypto-meta";
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
import { Settings, AlertTriangle, Brain, TrendingUp, BarChart3, Zap, Sparkles, Loader2, Dna } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { runGeneticOptimization, type GeneticChromosome } from "@/lib/bot/quant-engine";
import { motion } from "framer-motion";



const STRATEGY_ICONS: Record<string, React.ElementType> = {
  RSI: TrendingUp,
  MACD: BarChart3,
  AI: Brain,
};

export function BotConfigForm() {
  const {
    botConfig,
    setBotConfig,
    tradingMode,
    botActive,
    tickers,
    selectedSymbol,
    klines,
    binanceApiKey,
    binanceApiSecret,
    binanceConnected,
    binanceTestnet,
    setBinanceCredentials,
    setBinanceConnected,
    setBinanceTestnet,
  } = useCryptoStore();

  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizedParams, setOptimizedParams] = useState<GeneticChromosome | null>(null);
  const { toast } = useToast();

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [localKey, setLocalKey] = useState("");
  const [localSecret, setLocalSecret] = useState("");

  useEffect(() => {
    const key = localStorage.getItem("binance_api_key") || "";
    const secret = localStorage.getItem("binance_api_secret") || "";
    const connected = localStorage.getItem("binance_connected") === "true";
    const testnet = localStorage.getItem("binance_testnet") !== "false";
    setBinanceCredentials(key, secret);
    setBinanceConnected(connected);
    setBinanceTestnet(testnet);
    setLocalKey(key);
    setLocalSecret(secret);
  }, [setBinanceCredentials, setBinanceConnected, setBinanceTestnet]);

  const handleBinanceLogin = async () => {
    if (!localKey || !localSecret) {
      toast({
        title: "Campos Obrigatórios",
        description: "Por favor, insira a Chave API e o Segredo API.",
        variant: "destructive",
      });
      return;
    }

    setIsLoggingIn(true);
    try {
      const res = await fetch("/api/binance/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: localKey,
          apiSecret: localSecret,
          testnet: binanceTestnet,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setBinanceCredentials(localKey, localSecret);
        setBinanceConnected(true);
        setBinanceTestnet(binanceTestnet);
        localStorage.setItem("binance_api_key", localKey);
        localStorage.setItem("binance_api_secret", localSecret);
        localStorage.setItem("binance_connected", "true");
        localStorage.setItem("binance_testnet", binanceTestnet ? "true" : "false");
        
        // Auto-switch to live mode and sync balance
        const state = useCryptoStore.getState();
        state.setTradingMode("live");
        try {
          const accRes = await fetch("/api/account?mode=live", {
            headers: {
              'x-binance-api-key': localKey,
              'x-binance-api-secret': localSecret,
              'x-binance-testnet': binanceTestnet ? 'true' : 'false'
            }
          });
          if (accRes.ok) {
            const accResult = await accRes.json();
            if (accResult.success && accResult.data) {
              state.setAccount(accResult.data);
            }
          }
        } catch (e) {
          console.error("Failed to auto-sync account after login:", e);
        }

        toast({
          title: "🎉 Conectado à Binance!",
          description: `Login realizado com sucesso em modo ${binanceTestnet ? "Testnet" : "Produção"}.`,
        });
      } else {
        toast({
          title: "Falha na Autenticação",
          description: data.error || "Chaves inválidas ou erro de rede.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Erro de Conexão",
        description: "Não foi possível comunicar com o servidor de validação.",
        variant: "destructive",
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleBinanceDisconnect = () => {
    setBinanceCredentials("", "");
    setBinanceConnected(false);
    setLocalKey("");
    setLocalSecret("");
    localStorage.removeItem("binance_api_key");
    localStorage.removeItem("binance_api_secret");
    localStorage.setItem("binance_connected", "false");
    
    toast({
      title: "Desconectado",
      description: "Suas chaves API foram removidas da sessão local.",
    });
  };

  const handleGeneticOptimize = () => {
    if (klines.length < 15) {
      toast({
        title: "Dados Insuficientes",
        description: "Aguardando mais dados históricos de klines para otimização.",
        variant: "destructive",
      });
      return;
    }
    setIsOptimizing(true);
    setTimeout(() => {
      try {
        const result = runGeneticOptimization(klines, 8, 45);
        setOptimizedParams(result);
        toast({
          title: "🧬 Otimização Concluída!",
          description: `Os melhores parâmetros para ${botConfig.symbol} foram gerados com sucesso.`,
        });
      } catch (err) {
        toast({
          title: "Erro na Otimização",
          description: "Não foi possível rodar o algoritmo genético.",
          variant: "destructive",
        });
      } finally {
        setIsOptimizing(false);
      }
    }, 1200);
  };

  const applyOptimizedParams = () => {
    if (!optimizedParams) return;
    setBotConfig({
      ...botConfig,
      buyThreshold: optimizedParams.rsiBuyThreshold,
      sellThreshold: optimizedParams.rsiSellThreshold,
      rsiPeriod: optimizedParams.rsiPeriod,
      emaFast: optimizedParams.emaFast,
      emaSlow: optimizedParams.emaSlow,
    });
    toast({
      title: "✅ Parâmetros Aplicados",
      description: `RSI: ${optimizedParams.rsiPeriod} (${optimizedParams.rsiBuyThreshold}/${optimizedParams.rsiSellThreshold}) | Médias: ${optimizedParams.emaFast}/${optimizedParams.emaSlow}`,
    });
    setOptimizedParams(null);
  };

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
              {ALL_SYMBOLS.map((sym) => (
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

        {/* Configurações Quant Avançadas */}
        <div className="space-y-3 pt-3 border-t border-border">
          <Label className="text-xs font-semibold text-crypto-cyan flex items-center gap-1.5 uppercase tracking-wider">
            <Brain className="w-3.5 h-3.5 text-crypto-cyan" /> Motor Quant Avançado
          </Label>

          {/* Triagem de Ativos (The Funnel) */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Triagem de Ativos (Funnel)</Label>
              <p className="text-[10px] text-muted-foreground">Opera moedas fortes (Long) e fracas (Short) vs BTC</p>
            </div>
            <Switch
              checked={botConfig.useQuantFunnel}
              onCheckedChange={(checked) => updateConfig("useQuantFunnel", checked)}
              disabled={botActive}
              className="data-[state=checked]:bg-crypto-cyan"
            />
          </div>

          {/* Seleção de Regime de Mercado */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Regime de Mercado Dinâmico</Label>
              <p className="text-[10px] text-muted-foreground">ADX: Trend Following (&gt;25) vs Mean Reversion (&lt;20)</p>
            </div>
            <Switch
              checked={botConfig.useMarketRegime}
              onCheckedChange={(checked) => updateConfig("useMarketRegime", checked)}
              disabled={botActive}
              className="data-[state=checked]:bg-crypto-cyan"
            />
          </div>

          {/* Tomada de Decisão por Ensemble */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Votação por Ensemble (Comitê)</Label>
              <p className="text-[10px] text-muted-foreground">Combina Random Forest, XGBoost e Sentimento (2/3)</p>
            </div>
            <Switch
              checked={botConfig.useEnsemble}
              onCheckedChange={(checked) => updateConfig("useEnsemble", checked)}
              disabled={botActive}
              className="data-[state=checked]:bg-crypto-cyan"
            />
          </div>
        </div>

        {/* Otimização por Algoritmo Genético */}
        <div className="space-y-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-crypto-gold flex items-center gap-1.5 uppercase tracking-wider">
              <Dna className="w-3.5 h-3.5 text-crypto-gold" /> Algoritmo Genético (AG)
            </Label>
          </div>
          <p className="text-[10px] text-muted-foreground font-light leading-normal">
            Otimiza os limiares de RSI e períodos de médias históricas rodando uma simulação evolutiva sobre o histórico de klines.
          </p>

          <Button
            type="button"
            onClick={handleGeneticOptimize}
            disabled={botActive || isOptimizing || klines.length < 15}
            className="w-full h-8 text-xs btn-gradient-animated text-white flex items-center justify-center gap-2"
          >
            {isOptimizing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Evoluindo População (GA)...
              </>
            ) : (
              <>
                <Dna className="w-3.5 h-3.5" />
                Otimizar Parâmetros
              </>
            )}
          </Button>

          {klines.length < 15 && (
            <p className="text-[9px] text-crypto-red text-center">
              * Necessário pelo menos 15 candles históricos para rodar o GA (atual: {klines.length})
            </p>
          )}

          {/* Optimized Parameters Result Display */}
          {optimizedParams && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-crypto-gold/5 border border-crypto-gold/20 rounded-lg p-2.5 space-y-2 mt-2"
            >
              <div className="flex items-center justify-between border-b border-crypto-gold/10 pb-1.5">
                <span className="text-xs font-bold text-crypto-gold">🧬 Cromossomo Elite</span>
                <span className="text-[10px] bg-crypto-gold/20 text-crypto-gold px-1.5 py-0.5 rounded font-mono font-semibold">
                  Sharpe: {(optimizedParams.fitness ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-muted-foreground">RSI Período:</span>{" "}
                  <span className="font-semibold">{optimizedParams.rsiPeriod}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">RSI Compra:</span>{" "}
                  <span className="font-semibold text-crypto-green">{optimizedParams.rsiBuyThreshold}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">RSI Venda:</span>{" "}
                  <span className="font-semibold text-crypto-red">{optimizedParams.rsiSellThreshold}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Médias:</span>{" "}
                  <span className="font-semibold">{optimizedParams.emaFast} / {optimizedParams.emaSlow}</span>
                </div>
              </div>
              <Button
                type="button"
                onClick={applyOptimizedParams}
                className="w-full h-7 text-[10px] bg-crypto-gold text-black hover:bg-crypto-gold/80 font-bold"
              >
                Aplicar Parâmetros Otimizados
              </Button>
            </motion.div>
          )}
        </div>

        {/* Live Trading API Keys & Login (Sempre Visível) */}
        <div className="space-y-3 pt-3 border-t border-border">
          <Alert className="border-crypto-red/30 bg-crypto-red/5">
            <AlertTriangle className="w-4 h-4 text-crypto-red" />
            <AlertTitle className="text-crypto-red text-xs font-medium">
              Aviso de Risco - Trading Real
            </AlertTitle>
            <AlertDescription className="text-[10px] text-crypto-red/80">
              O modo real executa ordens na corretora. Certifique-se de que suas chaves têm apenas permissão de TRADE e LEITURA, nunca de SAQUE.
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-crypto-cyan flex items-center gap-1.5 uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5 text-crypto-cyan" /> Autenticação Binance
            </Label>
            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
              binanceConnected 
                ? "bg-crypto-green/20 text-crypto-green" 
                : "bg-secondary text-muted-foreground"
            }`}>
              {binanceConnected ? "CONECTADO" : "DESCONECTADO"}
            </span>
          </div>

          <div className="flex items-center justify-between py-1 bg-secondary/10 px-2 rounded border border-border/40">
            <Label className="text-[10px] text-muted-foreground cursor-pointer" htmlFor="binance-testnet-switch">Usar Testnet (Sandbox)</Label>
            <Switch
              id="binance-testnet-switch"
              checked={binanceTestnet}
              onCheckedChange={(checked) => {
                setBinanceTestnet(checked);
                localStorage.setItem("binance_testnet", checked ? "true" : "false");
              }}
              disabled={binanceConnected}
              className="h-4 w-7 data-[state=checked]:bg-crypto-cyan"
            />
          </div>

          {!binanceConnected ? (
            <>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Chave API (API Key)</Label>
                <Input
                  type="password"
                  placeholder="Chave Pública da API"
                  value={localKey}
                  onChange={(e) => setLocalKey(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Segredo API (Secret Key)</Label>
                <Input
                  type="password"
                  placeholder="Chave Secreta da API"
                  value={localSecret}
                  onChange={(e) => setLocalSecret(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <Button
                type="button"
                onClick={handleBinanceLogin}
                disabled={isLoggingIn}
                className="w-full h-8 text-xs bg-crypto-cyan text-black hover:bg-crypto-cyan/80 font-bold flex items-center justify-center gap-1.5"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Autenticando na Binance...
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    Conectar Conta
                  </>
                )}
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              <div className="text-[10px] bg-crypto-green/5 border border-crypto-green/20 text-crypto-green p-2 rounded-lg leading-relaxed">
                ✓ Conectado com sucesso em modo <strong>{binanceTestnet ? "Testnet (Simulado)" : "Produção (Spot)"}</strong>. Suas chaves estão ativas na sessão.
              </div>
              <Button
                type="button"
                onClick={handleBinanceDisconnect}
                variant="destructive"
                className="w-full h-8 text-xs font-bold"
              >
                Desconectar API
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
