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
import { AIBotRecommendationsDialog } from "./ai-bot-recommendations-dialog";
import { BotExecutionReportDialog } from "./bot-execution-report-dialog";
import { BinanceConnection } from "./binance-connection";
import { EnginePanel } from "./engine-panel";
import { BotReadinessBar } from "./bot-readiness";
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
  Trash2,
  RotateCcw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useShallow } from "zustand/react/shallow";
import { useBackgroundSettings, MIN_BACKGROUND_MINUTES, MAX_BACKGROUND_MINUTES } from "@/lib/bot/background-settings";

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
    removeAllBots,
    botConfig,
    tradingMode,
    portfolio,
    tickers,
    trades,
    klines: activeKlines,
    addBotLog,
    clearSimulatedData,
    resetAllBotStats,
    activeExecutionReport,
    setActiveExecutionReport,
  } = useCryptoStore(
  useShallow((s) => ({
    bots: s.bots,
    botActive: s.botActive,
    setBotActive: s.setBotActive,
    toggleAllBots: s.toggleAllBots,
    removeAllBots: s.removeAllBots,
    botConfig: s.botConfig,
    tradingMode: s.tradingMode,
    portfolio: s.portfolio,
    tickers: s.tickers,
    trades: s.trades,
    klines: s.klines,
    addBotLog: s.addBotLog,
    clearSimulatedData: s.clearSimulatedData,
    resetAllBotStats: s.resetAllBotStats,
    activeExecutionReport: s.activeExecutionReport,
    setActiveExecutionReport: s.setActiveExecutionReport,
  }))
);

  const bgEnabled = useBackgroundSettings((s) => s.enabled);
  const bgLimit = useBackgroundSettings((s) => s.limitMinutes);
  const setBgEnabled = useBackgroundSettings((s) => s.setEnabled);
  const setBgLimit = useBackgroundSettings((s) => s.setLimitMinutes);
  const { toast } = useToast();

  // Multi-bot modal state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAiRecommendationsOpen, setIsAiRecommendationsOpen] = useState(false);
  const [botToEdit, setBotToEdit] = useState<BotInstance | null>(null);
  const [botFilter, setBotFilter] = useState<"all" | "active" | "in_position" | "stopped">("all");

  const [tradeReport, setTradeReport] = useState<TradeReport | null>(null);
  const botStartTimeRef = useRef<Date | null>(null);

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

  // Fleet execution loop lives in <BotBackgroundRunner /> (mounted globally in page.tsx)
  const isAnyActive = useMemo(() => bots.some((b) => b.active), [bots]);
  useEffect(() => {
    if (isAnyActive && !botStartTimeRef.current) botStartTimeRef.current = new Date();
  }, [isAnyActive]);

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
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold px-2 py-0.5 ${
                      tradingMode === "live"
                        ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                        : "border-cyan-500/40 text-cyan-400 bg-cyan-500/10"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                        tradingMode === "live" ? "bg-emerald-400 animate-pulse" : "bg-cyan-400"
                      }`}
                    />
                    {tradingMode === "live" ? "Modo Real (Binance)" : "Modo Simulado (Paper)"}
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
            <Button
              size="sm"
              onClick={() => {
                toggleAllBots(true);
                toast({
                  title: "Frota Iniciada",
                  description: `Todos os ${bots.length} robôs foram ativados.`,
                });
              }}
              disabled={bots.length === 0 || activeBots.length === bots.length}
              className="h-9 px-3.5 bg-gradient-to-r from-crypto-green to-emerald-600 hover:from-crypto-green/90 text-white text-xs font-semibold shadow-md shadow-crypto-green/20 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
              Iniciar Todos ({bots.length})
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                toggleAllBots(false);
                toast({
                  title: "Frota Pausada",
                  description: "Todos os robôs foram pausados.",
                });
              }}
              disabled={bots.length === 0 || activeBots.length === 0}
              className="h-9 px-3.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs font-semibold cursor-pointer disabled:opacity-50"
              title="Pausar todos os robôs em execução"
            >
              <Pause className="w-3.5 h-3.5 mr-1.5" />
              Pausar Todos {activeBots.length > 0 ? `(${activeBots.length})` : ""}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (bots.length === 0) return;
                const inPositionCount = inPositionBots.length;
                const warnMsg =
                  inPositionCount > 0
                    ? `⚠️ ATENÇÃO: Existem ${inPositionCount} robô(s) com posições abertas!\n\nDeseja realmente excluir TODOS os ${bots.length} robôs da frota? As ordens ativas não serão mais gerenciadas automaticamente por eles.`
                    : `Deseja realmente excluir TODOS os ${bots.length} robôs da frota? Esta ação removerá permanentemente as configurações dos robôs.`;

                if (window.confirm(warnMsg)) {
                  removeAllBots();
                  toast({
                    title: "Frota Excluída",
                    description: "Todos os robôs foram removidos.",
                    variant: "destructive",
                  });
                }
              }}
              disabled={bots.length === 0}
              className="h-9 px-3.5 border-crypto-red/40 text-crypto-red hover:bg-crypto-red/10 text-xs font-semibold cursor-pointer disabled:opacity-50"
              title="Excluir todos os robôs da frota"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Excluir Todos
            </Button>

            {tradingMode === "paper" && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (confirm("Deseja limpar todos os dados da simulação (histórico, métricas de robôs, posições e saldo virtual)?")) {
                    await clearSimulatedData();
                    toast({
                      title: "Simulação Limpa",
                      description: "Estatísticas da frota, posições e saldo foram redefinidos para $10.000 USDT.",
                    });
                  }
                }}
                className="h-9 px-3 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-xs font-semibold cursor-pointer"
                title="Limpar todos os dados e métricas do modo simulado"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Limpar Simulação
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm("Deseja zerar as métricas e estatísticas de todos os robôs?")) {
                  resetAllBotStats();
                  toast({
                    title: "Métricas Redefinidas",
                    description: "Total de trades, acertos e PnL dos robôs foram zerados.",
                  });
                }
              }}
              className="h-9 px-3 border-border/60 hover:bg-secondary/60 text-muted-foreground hover:text-foreground text-xs font-medium cursor-pointer"
              title="Zerar métricas de trades dos robôs"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Zerar Métricas
            </Button>

            <Button
              size="sm"
              onClick={() => setIsAiRecommendationsOpen(true)}
              className="h-9 px-3.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white text-xs font-bold shadow-md shadow-purple-500/25 border border-purple-400/30 cursor-pointer transition-all duration-200 hover:scale-[1.02]"
              title="Obter recomendações inteligentes da IA com melhores estratégias, montante de entrada e tempo de operação"
            >
              <Brain className="w-3.5 h-3.5 mr-1.5 text-cyan-200 animate-pulse" />
              Sugestões de IA
            </Button>

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

        {/* Prontidão: avisa quando cotações, candles e saldo estão prontos */}
        <BotReadinessBar />

        {/* Background execution */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/30 bg-secondary/30 p-3 text-xs">
          <label className="flex items-center gap-2 font-semibold cursor-pointer">
            <input type="checkbox" checked={bgEnabled} onChange={(e) => setBgEnabled(e.target.checked)} />
            Executar em segundo plano
          </label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Tempo limite:</span>
            <input
              type="number"
              min={MIN_BACKGROUND_MINUTES}
              max={MAX_BACKGROUND_MINUTES}
              value={bgLimit}
              disabled={!bgEnabled}
              onChange={(e) => setBgLimit(Number(e.target.value))}
              className="h-7 w-20 rounded-md border border-border bg-background px-2 disabled:opacity-50"
            />
            <span className="text-muted-foreground">min</span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {bgEnabled
              ? "Com a aba/navegador em segundo plano, os robôs são pausados ao atingir o limite."
              : "Desativado: os robôs só operam com a aba visível."}
          </span>
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

        {/* Grid of Simultaneous Bot Cards or Empty State */}
        {bots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card/40 p-8 text-center flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Nenhum robô na frota</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md">
                Você pode obter sugestões automáticas inteligentes geradas pela IA ou criar novos robôs manualmente para operar em simultâneo.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Button
                size="sm"
                onClick={() => setIsAiRecommendationsOpen(true)}
                className="bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white text-xs font-semibold cursor-pointer"
              >
                <Brain className="w-3.5 h-3.5 mr-1.5" />
                Obter Sugestões de IA
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenCreateDialog}
                className="text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Criar Robô Manual
              </Button>
            </div>
          </div>
        ) : (
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
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. TABS: QUANT ENGINE, ACTIVITY LOGS, PORTFOLIO & CONFIGURATION */}
      {/* ========================================================================= */}
      <Tabs defaultValue="engines" className="space-y-4 pt-2">
        <TabsList className="bg-secondary/40 border border-border/40 p-1 h-auto flex flex-wrap gap-1 rounded-xl">
          <TabsTrigger value="engines" className="text-xs py-1.5 px-3 data-[state=active]:bg-crypto-cyan/15 data-[state=active]:text-crypto-cyan">
            <Brain className="w-3.5 h-3.5 mr-1.5" />
            Motores
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
          <TabsTrigger value="config" className="text-xs py-1.5 px-3 data-[state=active]:bg-crypto-cyan/15 data-[state=active]:text-crypto-cyan">
            <Bot className="w-3.5 h-3.5 mr-1.5" />
            Conexão Binance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="engines">
          <EnginePanel />
        </TabsContent>

        <TabsContent value="logs">
          <BotActivityLog />
        </TabsContent>

        <TabsContent value="portfolio">
          <BotPortfolio />
        </TabsContent>

        <TabsContent value="performance">
          <BotPerformanceChart />
        </TabsContent>

        <TabsContent value="config">
          <BinanceConnection />
        </TabsContent>
      </Tabs>

      {/* Dialog for Adding or Editing Bots */}
      <BotDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        botToEdit={botToEdit}
      />

      {/* Dialog for AI Bot Recommendations */}
      <AIBotRecommendationsDialog
        open={isAiRecommendationsOpen}
        onOpenChange={setIsAiRecommendationsOpen}
        onCustomEdit={(bot) => {
          setBotToEdit(bot);
          setIsDialogOpen(true);
        }}
      />

    </motion.div>
  );
}
