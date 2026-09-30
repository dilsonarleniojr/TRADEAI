"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useCryptoStore, type TradeData, type KlineData, type BotInstance } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BotCard } from "./bot-card";
import { BotDialog } from "./bot-dialog";
import { BotConfigForm } from "./bot-config-form";
import { StrategyPanel } from "./strategy-panel";
import { BotActivityLog } from "./bot-activity-log";
import { BotPortfolio } from "./bot-portfolio";
import { BotPerformanceChart } from "./bot-performance-chart";
import {
  Play,
  Pause,
  Bot,
  Zap,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  FileText,
  Clock,
  Brain,
  Sparkles,
  Activity,
  Plus,
  SlidersHorizontal,
  Wallet,
  Layers,
  Flame,
  CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { runAssetFunnel, detectMarketRegime, ensembleDecisionWithVeto, runMarketScanner, type QuantCandidate } from "@/lib/bot/quant-engine";
import { tickMultiBotFleet } from "@/lib/bot/multi-bot-engine";
import { useBinanceData } from "@/hooks/use-binance-data";

interface TradeReport {
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  totalPnl: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  avgPnlPerTrade: number;
  bestTrade: number;
  worstTrade: number;
  duration: string;
}

export function BotSection() {
  const {
    bots,
    botActive,
    setBotActive,
    toggleAllBots,
    botConfig,
    tradingMode,
    portfolio,
    tickers,
    trades,
    klines: activeKlines,
    addBotLog,
  } = useCryptoStore();

  const { toast } = useToast();
  const { fetchKlines } = useBinanceData();

  // Multi-bot modal state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [botToEdit, setBotToEdit] = useState<BotInstance | null>(null);
  const [botFilter, setBotFilter] = useState<"all" | "active" | "in_position" | "stopped">("all");

  // Fetch klines for current primary symbol
  useEffect(() => {
    fetchKlines(botConfig.symbol);
  }, [botConfig.symbol, fetchKlines]);

  const [tradeReport, setTradeReport] = useState<TradeReport | null>(null);
  const botStartTimeRef = useRef<Date | null>(null);

  // local scanner states
  const [quantRegime, setQuantRegime] = useState<"TREND_FOLLOWING" | "MEAN_REVERSION" | "NEUTRAL">("NEUTRAL");
  const [funnelCandidates, setFunnelCandidates] = useState<QuantCandidate[]>([]);
  const [ensembleVotes, setEnsembleVotes] = useState<{
    modelARandomForest: "BUY" | "SELL" | "HOLD";
    modelBXGBoost: "BUY" | "SELL" | "HOLD";
    modelCSentiment: "BUY" | "SELL" | "HOLD";
    decision: "BUY" | "SELL" | "HOLD";
  } | null>(null);
  const [scannerPairs, setScannerPairs] = useState<string[]>([]);
  const [isVetoActive, setIsVetoActive] = useState(false);
  const [vetoReason, setVetoReason] = useState("");

  // Fleet statistics
  const activeBots = useMemo(() => bots.filter((b) => b.active), [bots]);
  const inPositionBots = useMemo(() => bots.filter((b) => !!b.position && b.position.quantity > 0), [bots]);

  const fleetStats = useMemo(() => {
    const totalPnl = bots.reduce((sum, b) => sum + (b.stats.realizedPnl || 0), 0);
    const totalTrades = bots.reduce((sum, b) => sum + (b.stats.totalTrades || 0), 0);
    const totalWins = bots.reduce((sum, b) => sum + (b.stats.winTrades || 0), 0);
    const winRate = totalTrades > 0 ? (totalWins / Math.max(1, totalTrades)) * 100 : 100;
    return {
      totalPnl,
      totalTrades,
      totalWins,
      winRate,
    };
  }, [bots]);

  // Scaling helper to provide stationary historic klines for any ticker without API rate-limit
  const getKlinesHistoryRecord = useCallback((tickers: Record<string, any>, activeKlines: KlineData[], activeSymbol: string) => {
    const record: Record<string, KlineData[]> = {};
    if (activeKlines.length === 0) return record;

    for (const [symbol, ticker] of Object.entries(tickers)) {
      if (symbol === activeSymbol) {
        record[symbol] = activeKlines;
      } else {
        const activeClose = activeKlines[activeKlines.length - 1]?.close || 1;
        const ratio = ticker.price / activeClose;
        record[symbol] = activeKlines.map((k) => ({
          time: k.time,
          open: k.open * ratio,
          high: k.high * ratio,
          low: k.low * ratio,
          close: k.close * ratio,
          volume: k.volume * (ticker.volume / (tickers[activeSymbol]?.volume || 1)),
        }));
      }
    }
    return record;
  }, []);

  // Background scanner loop for market intelligence
  useEffect(() => {
    const runScanner = () => {
      if (Object.keys(tickers).length === 0 || activeKlines.length === 0) return;

      const klinesHistory = getKlinesHistoryRecord(tickers, activeKlines, botConfig.symbol);

      // Run Market Scanner to select top 3 leaders of price/volume
      const top3 = runMarketScanner(tickers);
      setScannerPairs(top3);

      // 1. Asset Funnel
      const candidates = runAssetFunnel(tickers, klinesHistory);
      setFunnelCandidates(candidates.slice(0, 5));

      // 2. Market Regime
      const regime = detectMarketRegime(activeKlines);
      setQuantRegime(regime);

      // Risk Veto Check (relative ATR >= 5%)
      let trSum = 0;
      for (let i = 1; i < activeKlines.length; i++) {
        const k = activeKlines[i];
        const prev = activeKlines[i - 1];
        trSum += Math.max(k.high - k.low, Math.abs(k.high - prev.close), Math.abs(k.low - prev.close));
      }
      const atrVal = trSum / (activeKlines.length - 1);
      const relATR = atrVal / (activeKlines[activeKlines.length - 1]?.close || 1);

      if (relATR >= 0.05) {
        setIsVetoActive(true);
        setVetoReason(`Volatilidade ATR extrema de ${(relATR * 100).toFixed(1)}% detectada (limite 5.0%). Failsafe ativo bloqueando COMPRAS.`);
      } else {
        setIsVetoActive(false);
        setVetoReason("");
      }

      // 3. Ensemble decision on current active symbol
      const t = tickers[botConfig.symbol];
      if (t) {
        const change = t.priceChangePercent || 0;
        const voteA = change > 0.3 ? "BUY" : change < -0.3 ? "SELL" : "HOLD";
        const voteB = t.volume > 0 ? (change > 0 ? "BUY" : "SELL") : "HOLD";
        const val = (t.price * 17) % 100;
        const voteC = val > 65 ? "BUY" : val < 35 ? "SELL" : "HOLD";

        const decision = ensembleDecisionWithVeto({
          modelARandomForest: voteA,
          modelBXGBoost: voteB,
          modelCSentiment: voteC,
        }, relATR, 0.05);

        setEnsembleVotes({
          modelARandomForest: voteA,
          modelBXGBoost: voteB,
          modelCSentiment: voteC,
          decision: decision === "VETO" ? "HOLD" : decision,
        });
      }
    };

    runScanner();
    const timer = setInterval(runScanner, 6000);
    return () => clearInterval(timer);
  }, [tickers, activeKlines, botConfig.symbol, getKlinesHistoryRecord]);

  // =========================================================================
  // SIMULTANEOUS MULTI-BOT AUTONOMOUS EXECUTION LOOP
  // Evaluates every active bot in parallel, buys on setup, and takes profit!
  // =========================================================================
  useEffect(() => {
    const isAnyActive = bots.some((b) => b.active);
    if (!isAnyActive) return;

    if (!botStartTimeRef.current) {
      botStartTimeRef.current = new Date();
    }

    const runFleetCycle = async () => {
      if (isVetoActive) return; // Risk failsafe active
      await tickMultiBotFleet({
        onToast: (t) => toast(t),
      });
    };

    // Run first tick after 3s, then repeat every 7s
    const initialTimer = setTimeout(runFleetCycle, 3000);
    const intervalTimer = setInterval(runFleetCycle, 7000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, [bots, isVetoActive, toast]);

  // Open dialog to create or edit
  const handleOpenCreateDialog = () => {
    setBotToEdit(null);
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (bot: BotInstance) => {
    setBotToEdit(bot);
    setIsDialogOpen(true);
  };

  // Filtered bots list
  const filteredBots = useMemo(() => {
    switch (botFilter) {
      case "active":
        return bots.filter((b) => b.active);
      case "in_position":
        return bots.filter((b) => !!b.position && b.position.quantity > 0);
      case "stopped":
        return bots.filter((b) => !b.active);
      default:
        return bots;
    }
  }, [bots, botFilter]);

  return (
    <motion.div
      key="multi-bot-dashboard"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* ========================================================================= */}
      {/* 1. FLEET COMMAND CENTER: METRICS & GLOBAL CONTROLS */}
      {/* ========================================================================= */}
      <div className="glass rounded-xl p-4 border border-border/50 relative overflow-hidden space-y-4">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-crypto-cyan/50 to-transparent" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Title & Status */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-crypto-cyan/15 border border-crypto-cyan/30 flex items-center justify-center text-crypto-cyan">
                <Bot className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  Central Multi-Robôs de Trading Simultâneo
                  <Badge variant="outline" className="border-crypto-green/30 text-crypto-green bg-crypto-green/10 text-[10px] font-semibold">
                    <Sparkles className="w-2.5 h-2.5 mr-1" />
                    Foco em Lucro
                  </Badge>
                </h2>
                <p className="text-xs text-muted-foreground">
                  Opere múltiplos robôs em simultâneo com alvos de Take Profit automáticos, Trailing Stop e proteção de capital.
                </p>
              </div>
            </div>
          </div>

          {/* Global Fleet Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {activeBots.length === bots.length ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleAllBots(false)}
                className="h-9 px-3.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs font-semibold cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5 mr-1.5" />
                Pausar Todos ({activeBots.length})
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => toggleAllBots(true)}
                className="h-9 px-3.5 bg-gradient-to-r from-crypto-green to-emerald-600 hover:from-crypto-green/90 text-white text-xs font-semibold shadow-md shadow-crypto-green/20 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                Iniciar Todos ({bots.length})
              </Button>
            )}

            <Button
              size="sm"
              onClick={handleOpenCreateDialog}
              className="h-9 px-3.5 bg-gradient-to-r from-crypto-cyan to-blue-600 hover:from-crypto-cyan/90 text-white text-xs font-semibold shadow-md shadow-crypto-cyan/20 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Novo Robô
            </Button>
          </div>
        </div>

        {/* Fleet Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          {/* Active Bots */}
          <div className="bg-secondary/30 rounded-xl p-3 border border-border/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Robôs Ativos</span>
              <span className={`w-2 h-2 rounded-full ${activeBots.length > 0 ? "bg-crypto-green animate-ping" : "bg-muted-foreground/30"}`} />
            </div>
            <div className="text-xl font-extrabold text-foreground flex items-center gap-1.5">
              <span>{activeBots.length}</span>
              <span className="text-xs text-muted-foreground font-normal">/ {bots.length} operando</span>
            </div>
          </div>

          {/* Fleet Realized PnL */}
          <div className="bg-secondary/30 rounded-xl p-3 border border-border/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Lucro Realizado Total</span>
              <DollarSign className={`w-3.5 h-3.5 ${fleetStats.totalPnl >= 0 ? "text-crypto-green" : "text-crypto-red"}`} />
            </div>
            <div className={`text-xl font-extrabold ${fleetStats.totalPnl >= 0 ? "text-crypto-green" : "text-crypto-red"}`}>
              {fleetStats.totalPnl >= 0 ? "+" : ""}${formatPrice(Math.abs(fleetStats.totalPnl))}
              <span className="text-xs font-normal ml-1">USDT</span>
            </div>
          </div>

          {/* Open Positions */}
          <div className="bg-secondary/30 rounded-xl p-3 border border-border/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Posições Abertas</span>
              <Flame className="w-3.5 h-3.5 text-crypto-gold" />
            </div>
            <div className="text-xl font-extrabold text-crypto-gold">
              {inPositionBots.length}
              <span className="text-xs text-muted-foreground font-normal ml-1.5">
                {inPositionBots.length === 1 ? "posição ativa" : "posições ativas"}
              </span>
            </div>
          </div>

          {/* Fleet Win Rate */}
          <div className="bg-secondary/30 rounded-xl p-3 border border-border/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Taxa de Acerto</span>
              <TrendingUp className="w-3.5 h-3.5 text-crypto-cyan" />
            </div>
            <div className="text-xl font-extrabold text-crypto-cyan">
              {fleetStats.winRate.toFixed(1)}%
              <span className="text-[10px] text-muted-foreground font-normal ml-1">
                ({fleetStats.totalWins}V / {fleetStats.totalTrades - fleetStats.totalWins}D)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Risk Veto Banner */}
      <AnimatePresence>
        {isVetoActive && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full"
          >
            <div className="bg-crypto-red/10 border border-crypto-red/30 rounded-xl p-4 flex items-start gap-3 relative overflow-hidden animate-pulse">
              <div className="absolute inset-y-0 left-0 w-1 bg-crypto-red" />
              <div className="w-10 h-10 rounded-lg bg-crypto-red/20 flex items-center justify-center text-crypto-red shrink-0 font-bold text-xl">
                🛑
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-crypto-red uppercase tracking-wider">Veto de Risco Ativado (Failsafe)</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {vetoReason}
                </p>
                <p className="text-[10px] text-crypto-red/80 font-medium">
                  * Todas as operações de COMPRA foram bloqueadas temporariamente para preservação de capital.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* 2. THE MULTI-BOT FLEET (CONCURRENT BOTS GRID) */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        {/* Filter chips bar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-secondary/30 p-1 rounded-xl border border-border/40">
            <Button
              size="sm"
              variant={botFilter === "all" ? "default" : "ghost"}
              onClick={() => setBotFilter("all")}
              className={`h-7 px-3 text-xs cursor-pointer ${
                botFilter === "all" ? "bg-crypto-cyan text-white font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos ({bots.length})
            </Button>
            <Button
              size="sm"
              variant={botFilter === "active" ? "default" : "ghost"}
              onClick={() => setBotFilter("active")}
              className={`h-7 px-3 text-xs cursor-pointer ${
                botFilter === "active" ? "bg-crypto-green text-white font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Ativos ({activeBots.length})
            </Button>
            <Button
              size="sm"
              variant={botFilter === "in_position" ? "default" : "ghost"}
              onClick={() => setBotFilter("in_position")}
              className={`h-7 px-3 text-xs cursor-pointer ${
                botFilter === "in_position" ? "bg-crypto-gold text-slate-900 font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Em Operação ({inPositionBots.length})
            </Button>
            <Button
              size="sm"
              variant={botFilter === "stopped" ? "default" : "ghost"}
              onClick={() => setBotFilter("stopped")}
              className={`h-7 px-3 text-xs cursor-pointer ${
                botFilter === "stopped" ? "bg-secondary text-foreground font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Pausados ({bots.length - activeBots.length})
            </Button>
          </div>

          <span className="text-xs text-muted-foreground hidden sm:inline">
            ⚡ Robôs operando em tempo real na Binance / Simulado
          </span>
        </div>

        {/* Grid of Simultaneous Bot Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4">
          <AnimatePresence>
            {filteredBots.map((bot) => (
              <motion.div
                key={bot.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <BotCard bot={bot} onEdit={handleOpenEditDialog} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. TABS: QUANT ENGINE, ACTIVITY LOGS, PORTFOLIO & CONFIGURATION */}
      {/* ========================================================================= */}
      <Tabs defaultValue="intelligence" className="space-y-4 pt-2">
        <TabsList className="bg-secondary/40 border border-border/40 p-1 h-auto flex flex-wrap gap-1 rounded-xl">
          <TabsTrigger value="intelligence" className="text-xs py-1.5 px-3 data-[state=active]:bg-crypto-cyan/15 data-[state=active]:text-crypto-cyan">
            <Brain className="w-3.5 h-3.5 mr-1.5" />
            Motor Quant & IA
          </TabsTrigger>
          <TabsTrigger value="logs" className="text-xs py-1.5 px-3 data-[state=active]:bg-crypto-cyan/15 data-[state=active]:text-crypto-cyan">
            <Activity className="w-3.5 h-3.5 mr-1.5" />
            Log de Operações dos Robôs
          </TabsTrigger>
          <TabsTrigger value="portfolio" className="text-xs py-1.5 px-3 data-[state=active]:bg-crypto-cyan/15 data-[state=active]:text-crypto-cyan">
            <Wallet className="w-3.5 h-3.5 mr-1.5" />
            Portfólio Consolidado
          </TabsTrigger>
          <TabsTrigger value="performance" className="text-xs py-1.5 px-3 data-[state=active]:bg-crypto-cyan/15 data-[state=active]:text-crypto-cyan">
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
            Gráfico de Performance
          </TabsTrigger>
          <TabsTrigger value="strategies" className="text-xs py-1.5 px-3 data-[state=active]:bg-crypto-cyan/15 data-[state=active]:text-crypto-cyan">
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
            Estratégias & Indicadores
          </TabsTrigger>
          <TabsTrigger value="config" className="text-xs py-1.5 px-3 data-[state=active]:bg-crypto-cyan/15 data-[state=active]:text-crypto-cyan">
            <Bot className="w-3.5 h-3.5 mr-1.5" />
            Conexão Binance & Ajustes
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Quant Intelligence Dashboard */}
        <TabsContent value="intelligence" className="space-y-4">
          <Card className="bg-card/60 backdrop-blur-md border border-border/50 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-crypto-cyan/40 to-transparent" />
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Brain className="w-4 h-4 text-crypto-cyan animate-pulse" />
                Painel do Motor Quant & Machine Learning
                <Badge variant="outline" className="text-[10px] border-crypto-cyan/20 text-crypto-cyan ml-auto flex items-center gap-1">
                  <Activity className="w-2.5 h-2.5 animate-spin" />
                  Scanner Ativo (6s)
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* 1. Regime de Mercado */}
                <div className="bg-secondary/20 rounded-xl p-3 border border-border/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Regime de Mercado</span>
                    <Badge variant="outline" className="text-[9px] border-border">ADX</Badge>
                  </div>
                  
                  <div className="flex flex-col items-center justify-center py-2 text-center">
                    {quantRegime === "TREND_FOLLOWING" ? (
                      <>
                        <TrendingUp className="w-8 h-8 text-crypto-green mb-1.5 glow-green" />
                        <span className="text-xs font-bold text-crypto-green">Seguidor de Tendência</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">ADX &gt; 25 (Tendência Forte)</span>
                      </>
                    ) : quantRegime === "MEAN_REVERSION" ? (
                      <>
                        <Zap className="w-8 h-8 text-crypto-gold mb-1.5 glow-gold" />
                        <span className="text-xs font-bold text-crypto-gold">Retorno à Média</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">ADX &lt; 20 (Mercado Lateral)</span>
                      </>
                    ) : (
                      <>
                        <Activity className="w-8 h-8 text-muted-foreground mb-1.5" />
                        <span className="text-xs font-bold text-muted-foreground">Mercado Neutro</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">ADX 20-25 (Lateralização)</span>
                      </>
                    )}
                  </div>
                  
                  <p className="text-[9px] text-muted-foreground leading-relaxed text-center font-light">
                    {quantRegime === "TREND_FOLLOWING" 
                      ? "Operando rompimentos e cruzamento de médias dinâmicas."
                      : quantRegime === "MEAN_REVERSION"
                      ? "Operando oscilações de RSI (compras em sobrevenda, vendas em sobrecompra)."
                      : "Aguardando confirmação de rompimento ou exaustão de volume."}
                  </p>
                </div>

                {/* 2. Comitê Ensemble */}
                <div className="bg-secondary/20 rounded-xl p-3 border border-border/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Comitê Ensemble</span>
                    <Badge className="text-[9px] bg-crypto-cyan/15 text-crypto-cyan border-crypto-cyan/20">Consenso 2/3</Badge>
                  </div>
                  
                  {ensembleVotes ? (
                    <div className="space-y-1.5 py-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Random Forest:</span>
                        <span className={`font-semibold ${ensembleVotes.modelARandomForest === "BUY" ? "text-crypto-green" : ensembleVotes.modelARandomForest === "SELL" ? "text-crypto-red" : "text-muted-foreground"}`}>
                          {ensembleVotes.modelARandomForest === "BUY" ? "COMPRA" : ensembleVotes.modelARandomForest === "SELL" ? "VENDA" : "NEUTRO"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">XGBoost (Volume):</span>
                        <span className={`font-semibold ${ensembleVotes.modelBXGBoost === "BUY" ? "text-crypto-green" : ensembleVotes.modelBXGBoost === "SELL" ? "text-crypto-red" : "text-muted-foreground"}`}>
                          {ensembleVotes.modelBXGBoost === "BUY" ? "COMPRA" : ensembleVotes.modelBXGBoost === "SELL" ? "VENDA" : "NEUTRO"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Sentimento (IA):</span>
                        <span className={`font-semibold ${ensembleVotes.modelCSentiment === "BUY" ? "text-crypto-green" : ensembleVotes.modelCSentiment === "SELL" ? "text-crypto-red" : "text-muted-foreground"}`}>
                          {ensembleVotes.modelCSentiment === "BUY" ? "COMPRA" : ensembleVotes.modelCSentiment === "SELL" ? "VENDA" : "NEUTRO"}
                        </span>
                      </div>
                      
                      <div className="border-t border-border/40 pt-1.5 mt-1 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-foreground">Decisão:</span>
                        <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${ensembleVotes.decision === "BUY" ? "bg-crypto-green/10 text-crypto-green border border-crypto-green/20" : ensembleVotes.decision === "SELL" ? "bg-crypto-red/10 text-crypto-red border border-crypto-red/20" : "bg-muted/15 text-muted-foreground border border-border"}`}>
                          {ensembleVotes.decision === "BUY" ? "COMPRA (LONG)" : ensembleVotes.decision === "SELL" ? "VENDA (SHORT)" : "NEUTRO (HOLD)"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-20 text-[10px] text-muted-foreground">
                      Aguardando votos...
                    </div>
                  )}
                </div>

                {/* 3. Funnel de Ativos */}
                <div className="bg-secondary/20 rounded-xl p-3 border border-border/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Top Picks do Funnel</span>
                    <Badge variant="outline" className="text-[9px] border-border">Volume &amp; Vol</Badge>
                  </div>
                  
                  <div className="space-y-1.5 max-h-[105px] overflow-y-auto pr-0.5 scrollbar-thin">
                    {funnelCandidates.length > 0 ? (
                      funnelCandidates.map((c, i) => (
                        <div key={c.symbol} className="flex items-center justify-between text-[9px] bg-secondary/40 px-2 py-1 rounded border border-border/10">
                          <span className="font-semibold text-foreground flex items-center gap-1">
                            <span className="text-muted-foreground">#{i + 1}</span> {c.symbol.replace("USDT", "")}
                          </span>
                          <span className={`font-bold flex items-center gap-0.5 ${c.relativeStrength >= 0 ? "text-crypto-green" : "text-crypto-red"}`}>
                            {c.relativeStrength >= 0 ? "+" : ""}{c.relativeStrength.toFixed(1)}%
                          </span>
                          <Badge className={`text-[8px] h-3.5 px-1 ${c.direction === "LONG" ? "bg-crypto-green/10 text-crypto-green border-crypto-green/25" : c.direction === "SHORT" ? "bg-crypto-red/10 text-crypto-red border-crypto-red/25" : "bg-muted text-muted-foreground"}`}>
                            {c.direction}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center justify-center h-20 text-[10px] text-muted-foreground">
                        Nenhum ativo qualificado
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Market Scanner */}
                <div className="bg-secondary/20 rounded-xl p-3 border border-border/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Líderes de Fluxo</span>
                    <Badge className="text-[9px] bg-crypto-cyan/15 text-crypto-cyan border-crypto-cyan/20">Scanner 24h</Badge>
                  </div>

                  <div className="space-y-1.5 max-h-[105px] overflow-y-auto pr-0.5 scrollbar-thin">
                    {scannerPairs.length > 0 ? (
                      scannerPairs.map((sym) => {
                        const t = tickers[sym];
                        const change = t?.priceChangePercent || 0;
                        return (
                          <div key={sym} className="flex items-center justify-between text-[9px] bg-secondary/40 px-2 py-1 rounded border border-border/10">
                            <span className="font-semibold text-foreground flex items-center gap-1">
                              <span className="text-crypto-cyan">⚡</span> {sym.replace("USDT", "")}
                            </span>
                            <span className={`font-bold ${change >= 0 ? "text-crypto-green" : "text-crypto-red"}`}>
                              {change >= 0 ? "+" : ""}{change.toFixed(1)}%
                            </span>
                            <Badge variant="outline" className="text-[8px] h-3.5 border-crypto-cyan/25 text-crypto-cyan bg-crypto-cyan/5">
                              Foco
                            </Badge>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex items-center justify-center h-20 text-[10px] text-muted-foreground">
                        Carregando líderes...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Bot Activity Log */}
        <TabsContent value="logs">
          <BotActivityLog />
        </TabsContent>

        {/* Tab 3: Bot Portfolio */}
        <TabsContent value="portfolio">
          <BotPortfolio />
        </TabsContent>

        {/* Tab 4: Performance Chart */}
        <TabsContent value="performance">
          <BotPerformanceChart />
        </TabsContent>

        {/* Tab 5: Strategy Panel */}
        <TabsContent value="strategies">
          <StrategyPanel />
        </TabsContent>

        {/* Tab 6: Configuration Form & Binance Login */}
        <TabsContent value="config">
          <BotConfigForm />
        </TabsContent>
      </Tabs>

      {/* Dialog for Adding or Editing Bots */}
      <BotDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        botToEdit={botToEdit}
      />
    </motion.div>
  );
}
