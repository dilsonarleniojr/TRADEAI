"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCryptoStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
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
  Radio,
  Layers,
  Cpu,
  Info,
  AlertTriangle,
  Clock,
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
  horizon?: "RAPIDO" | "MEDIO_LONGO";
  horizonLabel?: string;
  holdingPeriod?: string;
  strategyType?: string;
  sources?: {
    exchange?: string;
    pricing?: string;
    indicators?: string;
    aiModel?: string;
  };
}

export function TradeIdeasTab() {
  const [category, setCategory] = useState<string>("all");
  const [horizon, setHorizon] = useState<string>("all");
  const [loading, setLoading] = useState<boolean>(false);
  const [ideas, setIdeas] = useState<TradeIdea[]>([]);
  const [copiedSymbol, setCopiedSymbol] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const setSelectedSymbol = useCryptoStore((state) => state.setSelectedSymbol);
  const setActiveSection = useCryptoStore((state) => state.setActiveSection);
  const setTradePrefill = useCryptoStore((state) => state.setTradePrefill);
  const bots = useCryptoStore((state) => state.bots);
  const addBot = useCryptoStore((state) => state.addBot);
  const updateBot = useCryptoStore((state) => state.updateBot);
  const setSelectedBotId = useCryptoStore((state) => state.setSelectedBotId);
  const addBotLog = useCryptoStore((state) => state.addBotLog);
  const tickers = useCryptoStore((state) => state.tickers);

  const { toast } = useToast();

  const fetchIdeas = async (cat = category, hor = horizon) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/ai/trade-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "trade_ideas", params: { category: cat, horizon: hor } }),
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        setIdeas(json.data);
      } else {
        setErrorMsg(json.error || "Nenhum setup gerado no momento.");
      }
    } catch (e: any) {
      console.error("Erro ao buscar ideias de trade:", e);
      setErrorMsg("Erro de conexão ao comunicar com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIdeas(category, horizon);
  }, [category, horizon]);

  const copySetup = (idea: TradeIdea) => {
    const isFast = idea.horizon === "RAPIDO";
    const horizonDesc = idea.horizonLabel || (isFast ? "Aplicação Rápida (Day / Scalp)" : "Médio/Longo Prazo (Swing Trade)");
    const text = `🎯 [TradeAI Setup - ${idea.symbol}]
Perfil: ${horizonDesc} (${idea.timeframe})
Estratégia: ${idea.strategyType || (isFast ? "Scalp / Rompimento" : "Swing Estrutural")} | Duração: ${idea.holdingPeriod || "Intraday"}
Tipo: ${idea.type}
Entrada: $${idea.entryPrice}
Alvo 1: $${idea.tp1}
Alvo 2: $${idea.tp2}
Stop Loss: $${idea.stopLoss}
Risco/Retorno: ${idea.riskReward}:1 | Probabilidade: ${idea.winProbability}%
Técnico: ${idea.technicalReason}
Fontes: Binance Spot Live API, Floor Trader Pivots, RSI 14, TradeAI Quant Engine`;
    navigator.clipboard.writeText(text);
    setCopiedSymbol(idea.symbol);
    setTimeout(() => setCopiedSymbol(null), 2000);
  };

  // Redireciona para o próximo passo (Boleta de Trading) com todos os campos pré-preenchidos
  const handleExecuteSetup = (idea: TradeIdea) => {
    const side = idea.type === "LONG" ? "BUY" : "SELL";
    const isFast = idea.horizon === "RAPIDO";
    const horizonTag = isFast ? "⚡ Rápida (Day/Scalp)" : "🏛️ Médio/Longo Prazo";

    // Governança Institucional de Margem e Alavancagem proporcional ao horizonte
    const marginMode = isFast ? "ISOLATED" : "SPOT";
    const suggestedLeverage = isFast ? 2 : 1;
    const timeStopHours = isFast ? 4 : 0;
    const timeStopEnabled = isFast;
    const riskAllocationPercent = isFast ? 3.5 : 5.0;
    const maxRiskPerTradePercent = isFast ? 1.2 : 3.5;

    setTradePrefill({
      symbol: idea.symbol,
      side,
      entryPrice: idea.entryPrice,
      stopLoss: idea.stopLoss,
      takeProfit: idea.tp1,
      tp1: idea.tp1,
      tp2: idea.tp2,
      riskReward: idea.riskReward,
      winProbability: idea.winProbability,
      source: `Estúdio Quant (${isFast ? 'Day Trade' : 'Swing'} - ${idea.type})`,
      reason: `[${horizonTag} | ${idea.timeframe} - ${idea.strategyType || 'Quant'}] ${idea.technicalReason}`,
      timestamp: Date.now(),
      horizon: isFast ? "RAPIDO" : "MEDIO_LONGO",
      horizonLabel: isFast ? "Aplicação Rápida (Day/Scalp)" : "Médio/Longo Prazo (Spot/Swing)",
      marginMode,
      suggestedLeverage,
      timeStopHours,
      timeStopEnabled,
      riskAllocationPercent,
      maxRiskPerTradePercent,
    });

    setSelectedSymbol(idea.symbol);
    setActiveSection("chart");

    toast({
      title: `🎯 Boleta Pronta: ${side === "BUY" ? "COMPRA" : "VENDA"} de ${idea.symbol}`,
      description: isFast
        ? `${horizonTag}: Entrada $${idea.entryPrice} | SL Curto: $${idea.stopLoss} (~1.2%) | Margem Isolada ${suggestedLeverage}x | Time-Stop: 4h`
        : `${horizonTag}: Entrada $${idea.entryPrice} | SL: $${idea.stopLoss} | Estritamente Spot 1x (Proteção Anti-Wicking)`,
    });
  };

  const handleOpenChart = (symbol: string) => {
    setSelectedSymbol(symbol);
    setActiveSection("chart");
  };

  // Cria e ativa o robô autônomo com os parâmetros quantitativos do setup
  const handleCreateBot = (idea: TradeIdea) => {
    const cleanSym = idea.symbol.toUpperCase();
    const baseSym = cleanSym.replace(/USDT$|BUSD$|USDC$/, "");
    const curPrice = (idea.entryPrice && idea.entryPrice > 0)
      ? idea.entryPrice
      : (tickers[cleanSym]?.price || 1);

    // Stop Loss percentual calibrado pelo preço sugerido
    let slPct = idea.stopLoss > 0 && curPrice > 0
      ? Math.abs(Number((((curPrice - idea.stopLoss) / curPrice) * 100).toFixed(2)))
      : (idea.horizon === "RAPIDO" ? 1.2 : 3.0);
    slPct = Math.max(0.8, Math.min(5.0, slPct));

    // Take Profit percentual calibrado pelo alvo 1
    let tpPct = idea.tp1 > 0 && curPrice > 0
      ? Math.abs(Number((((idea.tp1 - curPrice) / curPrice) * 100).toFixed(2)))
      : (idea.horizon === "RAPIDO" ? 2.5 : 6.0);
    if (tpPct < slPct * 1.5) {
      tpPct = Number((slPct * 2.0).toFixed(2));
    }

    const isFast = idea.horizon === "RAPIDO";
    const strategy = isFast ? "QUANT_ENSEMBLE" : "AI";
    const botName = isFast
      ? `Bot Scalp — ${baseSym} (${idea.timeframe})`
      : `Bot Swing — ${baseSym} (${idea.timeframe})`;

    const trailPct = Math.max(0.6, Number((slPct * 0.5).toFixed(2)));
    const beTrigger = Math.max(1.0, Number((tpPct * 0.4).toFixed(2)));
    const timeStopMins = isFast ? 240 : 1440; // 4 horas para scalp vs 24h para swing

    const existingBot = bots.find((b) => b.symbol === cleanSym);
    let targetBotId = "";

    const botConfigData = {
      name: botName,
      symbol: cleanSym,
      strategy,
      active: true,
      takeProfit: tpPct,
      stopLoss: slPct,
      trailingStop: true,
      trailingStopDistance: trailPct,
      allocationAmount: isFast ? 25 : 50,
      maxDailyTrades: isFast ? 20 : 5,
      buyThreshold: 30,
      sellThreshold: 70,
      rsiPeriod: 14,
      emaFast: 9,
      emaSlow: 21,
      autoBreakEven: true,
      breakEvenTrigger: beTrigger,
      breakEvenBuffer: 0.3,
      usePartialTp: true,
      partialTpTrigger: tpPct,
      partialTpPercent: 50,
      trailingTakeProfit: true,
      trailingTakeProfitDistance: trailPct,
      timeStopMinutes: timeStopMins,
      signalConfidenceThreshold: Math.min(95, Math.max(50, Math.round(idea.winProbability || 65))),
      autoTradeSignals: true,
      useMarketRegime: true,
      useMultiTimeframe: true,
      useEnsemble: isFast,
      algorithmVersion: "v2.6.0-quant-studio",
    };

    if (existingBot) {
      targetBotId = existingBot.id;
      updateBot(existingBot.id, {
        ...botConfigData,
        status: existingBot.position ? "in_position" : "scanning",
        stats: {
          ...existingBot.stats,
          lastAction: `Configurado via Estúdio Quant (${idea.type}): Alvo +${tpPct}%, Stop -${slPct}%`,
          lastActionTime: new Date().toISOString(),
        },
      });
    } else {
      targetBotId = addBot({
        ...botConfigData,
        status: "scanning",
      });
    }

    addBotLog({
      botId: targetBotId,
      botName,
      type: "info",
      message: `Robô ${baseSym} criado e ativado via Estúdio Quant: Entrada $${curPrice} | Alvo 1 $${idea.tp1} (+${tpPct}%) | Stop $${idea.stopLoss} (-${slPct}%) | Time-Stop: ${timeStopMins / 60}h`,
    });

    setSelectedBotId(targetBotId);
    setSelectedSymbol(cleanSym);
    setActiveSection("bot");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    toast({
      title: `🤖 Robô ${baseSym} Criado e Ativado!`,
      description: `Estratégia ${strategy} em execução: Alvo +${tpPct}% ($${idea.tp1}) | Stop -${slPct}% ($${idea.stopLoss}) | Time-Stop: ${timeStopMins / 60}h`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Category & Horizon Filters */}
      <div className="space-y-3 bg-card/60 backdrop-blur-md p-4 rounded-xl border border-border/40 shadow-sm">
        {/* Row 1: Horizon Selector (Aplicações Rápidas vs Médio/Longo Prazo) */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              Horizonte Operacional:
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {[
              { id: "all", label: "Todos os Prazos", icon: Sparkles, color: "default" },
              { id: "fast", label: "⚡ Aplicações Rápidas (Day / Scalp)", icon: Zap, color: "amber" },
              { id: "long", label: "🏛️ Médio / Longo Prazo (Swing & Position)", icon: Layers, color: "cyan" },
            ].map((h) => {
              const active = horizon === h.id;
              return (
                <Button
                  key={h.id}
                  variant={active ? "default" : "outline"}
                  size="sm"
                  onClick={() => setHorizon(h.id)}
                  className={`text-xs h-8 px-3 font-semibold transition-all ${
                    active
                      ? h.color === "amber"
                        ? "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20"
                        : h.color === "cyan"
                        ? "bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/20"
                        : "bg-slate-200 text-slate-900 dark:bg-slate-100 dark:text-slate-900"
                      : "text-muted-foreground hover:text-foreground border-border/60"
                  }`}
                >
                  <h.icon className={`w-3.5 h-3.5 mr-1.5 ${active && h.color === "amber" ? "text-slate-950" : "text-cyan-400"}`} />
                  {h.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Asset Categories & Refresh */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-1">
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
                className={`text-xs h-7 px-2.5 ${
                  category === cat.id
                    ? "bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow-sm"
                    : "text-muted-foreground border-border/40"
                }`}
              >
                {cat.label}
              </Button>
            ))}
          </div>

          <Button
            onClick={() => fetchIdeas(category, horizon)}
            disabled={loading}
            variant="outline"
            size="sm"
            className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-950/40 text-xs h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Escaneando Mercado..." : "Atualizar Oportunidades"}
          </Button>
        </div>
      </div>

      {/* Grid of Setups */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-96 rounded-xl bg-card/40 border border-border/40 animate-pulse p-6 space-y-4"
            >
              <div className="h-6 bg-muted/40 rounded w-1/2"></div>
              <div className="h-10 bg-muted/30 rounded"></div>
              <div className="h-24 bg-muted/20 rounded"></div>
              <div className="h-10 bg-muted/30 rounded"></div>
            </div>
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <Card className="border-border/60 bg-card/40 backdrop-blur-md p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto border border-cyan-500/20">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-foreground">
              {errorMsg ? "Falha ao Carregar Oportunidades" : "Nenhuma Oportunidade Identificada"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
              {errorMsg ||
                "O scanner quantitativo não encontrou operações que atendam aos critérios de Relação Risco-Retorno >= 2.0:1 no filtro selecionado."}
            </p>
          </div>
          <Button
            onClick={() => fetchIdeas(category, horizon)}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium mx-auto"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Escanear Novamente com IA & Quants
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {ideas.map((idea, index) => {
            const isLong = idea.type === "LONG";
            const isFast = idea.horizon === "RAPIDO";
            const cleanSym = idea.symbol.toUpperCase();
            const activeBot = bots.find((b) => b.symbol === cleanSym && b.active);
            const isBotInPosition = activeBot && (activeBot.status === "in_position" || (!!activeBot.position && activeBot.position.quantity > 0));

            // Cálculo de PnL Flutuante (Unrealized PnL) em tempo real
            let floatingPnlPct = 0;
            let hasFloatingPnl = false;
            if (isBotInPosition && activeBot.position) {
              const curPrice = tickers[cleanSym]?.price ?? (activeBot.position.currentPrice || 0);
              const entryPrice = activeBot.position.entryPrice || 0;
              if (curPrice > 0 && entryPrice > 0) {
                floatingPnlPct = ((curPrice - entryPrice) / entryPrice) * 100;
                hasFloatingPnl = true;
              } else if (typeof activeBot.position.unrealizedPnlPercent === "number") {
                floatingPnlPct = activeBot.position.unrealizedPnlPercent;
                hasFloatingPnl = true;
              }
            }
            const isFloatingProfit = floatingPnlPct >= 0;

            return (
              <Card
                key={`${idea.symbol}-${index}`}
                onClick={() => handleCreateBot(idea)}
                className={`group relative overflow-hidden border-border/50 bg-gradient-to-b from-card/95 via-card/60 to-card/40 backdrop-blur-md transition-all duration-300 shadow-md flex flex-col justify-between cursor-pointer hover:scale-[1.01] active:scale-[0.99] ${
                  activeBot
                    ? "border-emerald-500/50 hover:border-emerald-500/80 shadow-emerald-950/25"
                    : "hover:border-cyan-500/60 hover:shadow-cyan-950/30"
                }`}
              >
                {/* Header Strip Indicating Long/Short */}
                <div
                  className={`h-1.5 w-full ${
                    isLong
                      ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                      : "bg-gradient-to-r from-rose-500 to-amber-500"
                  }`}
                />
                <CardHeader className="pb-3">
                  {/* Top Badge: Horizon (Rápido vs Médio/Longo) & Holding Period */}
                  <div className="flex items-center justify-between gap-1 mb-2">
                    {isFast ? (
                      <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/40 text-[10px] font-bold flex items-center gap-1 px-2 py-0.5">
                        <Zap className="w-3 h-3 text-amber-400" />
                        {idea.horizonLabel || "Aplicação Rápida (Day / Scalp)"}
                      </Badge>
                    ) : (
                      <Badge className="bg-cyan-500/15 text-cyan-300 border-cyan-500/40 text-[10px] font-bold flex items-center gap-1 px-2 py-0.5">
                        <Layers className="w-3 h-3 text-cyan-400" />
                        {idea.horizonLabel || "Médio / Longo Prazo (Swing)"}
                      </Badge>
                    )}
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                      <Clock className="w-3 h-3 text-muted-foreground/60" />
                      {idea.holdingPeriod || (isFast ? "30m a 4h" : "2 a 7 dias")}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-black text-xl text-foreground tracking-tight">
                        {idea.symbol}
                      </div>
                      <Badge variant="outline" className="text-[11px] text-muted-foreground border-border/60 font-mono">
                        {idea.timeframe}
                      </Badge>

                      {/* Badge Dinâmico de Status do Robô com PnL Flutuante */}
                      {activeBot ? (
                        isBotInPosition ? (
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-bold px-2 py-0.5 flex items-center gap-1 shadow-sm font-mono ${
                              isFloatingProfit
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                                : "bg-amber-500/20 text-amber-300 border-amber-500/50"
                            }`}
                            title={`Robô em posição em ${idea.symbol}: Entrada $${activeBot.position?.entryPrice?.toFixed(2) || "0"}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full animate-ping shrink-0 ${isFloatingProfit ? "bg-emerald-400" : "bg-amber-400"}`} />
                            {isFloatingProfit ? "🟢" : "🟡"} Bot em Posição ({hasFloatingPnl ? `${isFloatingProfit ? "+" : ""}${floatingPnlPct.toFixed(2)}%` : "0.00%"})
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border-emerald-500/50 flex items-center gap-1 shadow-sm font-mono"
                            title={`Robô ativo em ${idea.symbol}: ${activeBot.name}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                            🟢 Bot em Execução
                          </Badge>
                        )
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-bold px-2 py-0.5 bg-cyan-500/10 text-cyan-300 border-cyan-500/30 flex items-center gap-1"
                        >
                          ⚡ Clique para Ativar
                        </Badge>
                      )}
                    </div>
                    <Badge
                      className={`${
                        isLong
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                          : "bg-rose-500/15 text-rose-400 border-rose-500/40"
                      } font-bold text-xs flex items-center gap-1.5 px-2.5 py-0.5 shrink-0`}
                    >
                      {isLong ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {isLong ? "LONG (COMPRA)" : "SHORT (VENDA)"}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs flex items-center justify-between pt-1 text-muted-foreground">
                    <span>{idea.name}</span>
                    <span className="font-semibold text-emerald-400/90 font-mono">
                      Probabilidade: {idea.winProbability}%
                    </span>
                  </CardDescription>

                  {idea.strategyType && (
                    <div className="text-[11px] text-cyan-400/90 font-medium flex items-center gap-1 pt-1 border-t border-border/20 mt-1">
                      <span className="opacity-70">Estratégia:</span>
                      <span className="text-foreground/90 font-normal">{idea.strategyType}</span>
                    </div>
                  )}
                </CardHeader>

                <CardContent className="space-y-4 text-xs flex-1 flex flex-col justify-between">
                  {/* Prices & Targets Matrix */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-background/60 border border-border/40 font-mono">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold">Entrada Sugerida</div>
                      <div className="font-black text-sm text-foreground">${idea.entryPrice}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold">Stop Loss</div>
                      <div className="font-black text-sm text-rose-400">${idea.stopLoss}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold">Alvo 1 (TP1)</div>
                      <div className="font-black text-sm text-emerald-400">${idea.tp1}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold">Alvo 2 (TP2)</div>
                      <div className="font-black text-sm text-cyan-400">${idea.tp2}</div>
                    </div>
                  </div>

                  {/* R:R Ratio Highlight */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-cyan-950/20 border border-cyan-800/30 text-cyan-300 font-medium">
                    <span className="flex items-center gap-1 text-[11px]">
                      <Target className="w-3.5 h-3.5 text-cyan-400" />
                      Relação Risco-Recompensa:
                    </span>
                    <span className="font-bold text-xs font-mono">{idea.riskReward}:1</span>
                  </div>

                  {/* Reasons */}
                  <div className="space-y-2 text-[11px] leading-relaxed">
                    <div className="p-2.5 rounded-lg bg-muted/20 border border-border/30">
                      <span className="font-bold text-foreground block mb-0.5 text-[10px] uppercase text-cyan-400">
                        Insights Técnicos:
                      </span>
                      <p className="text-muted-foreground text-[11px] leading-snug">{idea.technicalReason}</p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-muted/20 border border-border/30">
                      <span className="font-bold text-foreground block mb-0.5 text-[10px] uppercase text-amber-400">
                        Insights Fundamentais:
                      </span>
                      <p className="text-muted-foreground text-[11px] leading-snug">{idea.fundamentalReason}</p>
                    </div>
                  </div>

                  {/* Proveniência / Fontes de Informação */}
                  <div className="pt-2 border-t border-border/30 flex flex-wrap gap-1 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-background/50 border border-border/40 text-muted-foreground">
                      📡 {idea.sources?.exchange || "Binance Spot Live"}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-background/50 border border-border/40 text-muted-foreground">
                      📐 {idea.sources?.indicators || "Pivots Floor Trader & RSI 14"}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-background/50 border border-border/40 text-muted-foreground">
                      🧠 {idea.sources?.aiModel || "TradeAI Quant Engine v3"}
                    </span>
                  </div>

                  {/* Botão de Ação Primária: Executar Venda/Compra Direta com Boleta Preenchida */}
                  <div className="pt-2 space-y-2">
                    {isLong ? (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExecuteSetup(idea);
                        }}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-9 shadow-md shadow-emerald-950/30 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                      >
                        <TrendingUp className="w-4 h-4" />
                        Comprar {idea.symbol} ({isFast ? "⚡ Day Trade" : "🏛️ Swing Trade"})
                      </Button>
                    ) : (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExecuteSetup(idea);
                        }}
                        className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold h-9 shadow-md shadow-rose-950/30 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                      >
                        <TrendingDown className="w-4 h-4" />
                        Vender {idea.symbol} ({isFast ? "⚡ Day Trade" : "🏛️ Swing Trade"})
                      </Button>
                    )}

                    {/* Secondary Action Buttons */}
                    <div className="flex items-center justify-between gap-1 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          copySetup(idea);
                        }}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreateBot(idea);
                          }}
                          className={`text-xs h-8 px-2.5 transition-all cursor-pointer ${
                            activeBot
                              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                              : "border-border/60 hover:border-cyan-500/50"
                          }`}
                        >
                          <Bot className={`w-3.5 h-3.5 mr-1 ${activeBot ? "text-emerald-400" : "text-cyan-400"}`} />
                          {activeBot ? "Ver Bot Ativo" : "Criar Bot"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenChart(idea.symbol);
                          }}
                          className="text-xs h-8 px-2.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5 mr-1" />
                          Gráfico
                        </Button>
                      </div>
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
export default TradeIdeasTab;
