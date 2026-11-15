"use client";

import React, { useState, useMemo } from "react";
import { useCryptoStore, type BotInstance } from "@/lib/store";
import { AppSwitch } from "./atoms";
import { BotDrawer } from "./bot-drawer";
import { BotDialog } from "@/components/bot/bot-dialog";
import { AIBotRecommendationsDialog } from "@/components/bot/ai-bot-recommendations-dialog";
import { BinanceProfitableBotsDialog } from "@/components/bot/binance-profitable-bots-dialog";
import { HistoryPanel } from "@/components/bot/history-panel";
import { ProtectionSettingsDialog } from "@/components/bot/protection-settings-dialog";
import { NotificationSettingsDialog } from "@/components/bot/notification-settings-dialog";
import { OrphanOrdersDialog } from "@/components/bot/orphan-orders-dialog";
import { BotBacktestDialog } from "@/components/bot/bot-backtest-dialog";
import { BotRiskCockpit } from "@/components/bot/bot-risk-cockpit";
import { BotCockpit } from "@/components/bot/bot-cockpit";
import { ExchangeConnection } from "@/components/bot/exchange-connection";
import { EnginePanel } from "@/components/bot/engine-panel";
import { BotReadinessBar } from "@/components/bot/bot-readiness";
import { BotActivityLog } from "@/components/bot/bot-activity-log";
import { BotPortfolio } from "@/components/bot/bot-portfolio";
import { BotPerformanceChart } from "@/components/bot/bot-performance-chart";
import { RealtimeNetPnlPanel } from "@/components/bot/realtime-net-pnl-panel";
import { BotPnLRegistry } from "@/components/bot/bot-pnl-registry";
import { calculateRiskMetrics } from "@/lib/bot/risk-metrics";
import {
  ensureFreshAiSignalForSymbol,
  getCircuitBreakerStatus,
  resetGlobalCircuitBreaker,
  syncCustodyPositionsWithBots,
} from "@/lib/bot/multi-bot-engine";
import {
  useBackgroundSettings,
  MIN_BACKGROUND_MINUTES,
  MAX_BACKGROUND_MINUTES,
} from "@/lib/bot/background-settings";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Activity,
  BarChart3,
  Bell,
  Brain,
  CheckCircle2,
  ChevronDown,
  FlaskConical,
  Gauge,
  Layers,
  Loader2,
  Pencil,
  Plug,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";

type ConfirmActionType =
  | null
  | "emergency"
  | "delete_all"
  | "reset_stats"
  | "clear_sim"
  | { type: "delete_one"; bot: BotInstance };

export function BotView() {
  const { toast } = useToast();
  const {
    bots,
    portfolio,
    trades,
    tickers,
    toggleBotActive,
    toggleAllBots,
    updateBot,
    removeBot,
    removeAllBots,
    resetAllBotStats,
    clearSimulatedData,
    setActiveSection,
    tradingMode,
    openBotCreateModal,
    setOpenBotCreateModal,
    openProtectionModal,
    setOpenProtectionModal,
    setOpenApiSettingsModal,
    selectedExchange,
    setSelectedExchange,
    okxConnected,
    okxSimulated,
    binanceConnected,
    protectionSettings,
    updateProtectionSettings,
    resetConsecutiveLossBrake,
    activateTopProfitableBots,
  } = useCryptoStore(
    useShallow((s) => ({
      bots: s.bots,
      portfolio: s.portfolio,
      trades: s.trades,
      tickers: s.tickers,
      toggleBotActive: s.toggleBotActive,
      toggleAllBots: s.toggleAllBots,
      updateBot: s.updateBot,
      removeBot: s.removeBot,
      removeAllBots: s.removeAllBots,
      resetAllBotStats: s.resetAllBotStats,
      clearSimulatedData: s.clearSimulatedData,
      setActiveSection: s.setActiveSection,
      tradingMode: s.tradingMode,
      openBotCreateModal: s.openBotCreateModal,
      setOpenBotCreateModal: s.setOpenBotCreateModal,
      openProtectionModal: s.openProtectionModal,
      setOpenProtectionModal: s.setOpenProtectionModal,
      setOpenApiSettingsModal: s.setOpenApiSettingsModal,
      selectedExchange: s.selectedExchange,
      setSelectedExchange: s.setSelectedExchange,
      okxConnected: s.okxConnected,
      okxSimulated: s.okxSimulated,
      binanceConnected: s.binanceConnected,
      protectionSettings: s.protectionSettings,
      updateProtectionSettings: s.updateProtectionSettings,
      resetConsecutiveLossBrake: s.resetConsecutiveLossBrake,
      activateTopProfitableBots: s.activateTopProfitableBots,
    }))
  );

  const bgEnabled = useBackgroundSettings((s) => s.enabled);
  const bgLimit = useBackgroundSettings((s) => s.limitMinutes);
  const setBgEnabled = useBackgroundSettings((s) => s.setEnabled);
  const setBgLimit = useBackgroundSettings((s) => s.setLimitMinutes);

  const [viewTab, setViewTab] = useState<"fleet" | "engines" | "pnl" | "risk">("fleet");
  const [filter, setFilter] = useState<"todos" | "ligados" | "pausados">("todos");
  const [selectedBotId, setSelectedBotId] = useState<string>(bots[0]?.id || "");
  const [confirmAction, setConfirmAction] = useState<ConfirmActionType>(null);
  const [editingBot, setEditingBot] = useState<BotInstance | null>(null);
  const [drawerBot, setDrawerBot] = useState<BotInstance | null>(null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [binanceBotsDialogOpen, setBinanceBotsDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [notificationDialogOpen, setNotificationDialogOpen] = useState(false);
  const [orphanOrdersDialogOpen, setOrphanOrdersDialogOpen] = useState(false);
  const [backtestDialogOpen, setBacktestDialogOpen] = useState(false);
  const [backtestSeed, setBacktestSeed] = useState<{ symbol?: string; strategy?: BotInstance["strategy"] }>({});
  const [riskCockpitOpen, setRiskCockpitOpen] = useState(false);
  const [refreshingAiSymbol, setRefreshingAiSymbol] = useState<string | null>(null);

  const activeCount = bots.filter((b) => b.active).length;
  const pausedCount = bots.filter((b) => !b.active).length;
  const openPositionsCount = bots.filter((b) => b.position && b.position.quantity > 0).length;

  const totalRealizedPnl = useMemo(
    () => bots.reduce((sum, b) => sum + (b.stats?.realizedPnl ?? 0), 0),
    [bots]
  );

  const dailyLossLimit = useMemo(() => {
    const equity = portfolio?.totalValue || portfolio?.cashBalance || 0;
    const pct = protectionSettings?.maxDailyDrawdownPct ?? 0.03;
    return equity > 0 ? equity * pct : 0;
  }, [portfolio, protectionSettings]);

  const riskMetrics = useMemo(
    () => calculateRiskMetrics(trades, portfolio?.totalValue || 100),
    [trades, portfolio?.totalValue]
  );

  const circuitBreakerStatus = getCircuitBreakerStatus();
  const circuitBreakerBots = useMemo(
    () =>
      bots.filter(
        (b) =>
          !b.active &&
          (b.stats?.lastAction?.includes("3 perdas seguidas") ||
            b.stats?.lastAction?.includes("Circuit Breaker") ||
            b.stats?.lastAction?.includes("Kill Switch") ||
            b.stats?.lastAction?.includes("Quarentena"))
      ),
    [bots]
  );

  const activeProtectionsCount = useMemo(
    () =>
      Object.values(protectionSettings || {}).filter(
        (v) => typeof v === "boolean" && v === true
      ).length,
    [protectionSettings]
  );

  const filteredBots = useMemo(() => {
    if (filter === "ligados") return bots.filter((b) => b.active);
    if (filter === "pausados") return bots.filter((b) => !b.active);
    return bots;
  }, [bots, filter]);

  const selectedBot = bots.find((b) => b.id === selectedBotId) || filteredBots[0] || bots[0] || null;

  const handleOpenNewBot = () => {
    setEditingBot(null);
    setOpenBotCreateModal(true);
  };

  const handleOpenEditBot = (bot: BotInstance) => {
    setEditingBot(bot);
    setOpenBotCreateModal(true);
  };

  const handleBotDialogChange = (open: boolean) => {
    setOpenBotCreateModal(open);
    if (!open) {
      setEditingBot(null);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    if (confirmAction === "emergency") {
      toggleAllBots(false);
      toast({ title: "Parada de emergência executada", description: "Todos os robôs foram pausados." });
    } else if (confirmAction === "delete_all") {
      removeAllBots();
      toast({ title: "Robôs removidos", description: "Todos os robôs foram excluídos da frota." });
    } else if (confirmAction === "reset_stats") {
      resetAllBotStats();
      toast({ title: "Métricas zeradas", description: "As estatísticas acumuladas dos robôs foram reiniciadas." });
    } else if (confirmAction === "clear_sim") {
      await clearSimulatedData();
      toast({ title: "Simulação limpa", description: "Dados e posições simuladas foram limpos." });
    } else if (typeof confirmAction === "object" && confirmAction.type === "delete_one") {
      removeBot(confirmAction.bot.id);
      toast({ title: "Robô excluído", description: `${confirmAction.bot.name} foi removido.` });
    }
    setConfirmAction(null);
  };

  const confirmDialogCopy = useMemo(() => {
    if (confirmAction === "emergency") {
      return {
        title: "Parada de Emergência",
        desc: "Esta ação pausa imediatamente todos os robôs e interrompe novas entradas. Posições já preenchidas continuarão ativas até que sejam encerradas manualmente.",
        cta: "Executar parada",
        destructive: true,
      };
    }
    if (confirmAction === "delete_all") {
      return {
        title: "Excluir todos os robôs",
        desc: "Todos os robôs configurados serão removidos permanentemente da sua lista. Essa ação não pode ser desfeita.",
        cta: "Excluir todos",
        destructive: true,
      };
    }
    if (confirmAction === "reset_stats") {
      return {
        title: "Zerar métricas dos robôs",
        desc: "Os contadores de trades, taxa de acerto e PnL acumulado de todos os robôs serão zerados.",
        cta: "Zerar métricas",
        destructive: false,
      };
    }
    if (confirmAction === "clear_sim") {
      return {
        title: "Limpar dados simulados",
        desc: "As posições simuladas e o histórico de simulação serão limpos.",
        cta: "Limpar simulação",
        destructive: false,
      };
    }
    if (confirmAction && typeof confirmAction === "object" && confirmAction.type === "delete_one") {
      return {
        title: `Excluir ${confirmAction.bot.name}`,
        desc: `O robô ${confirmAction.bot.name} (${confirmAction.bot.symbol}) será removido permanentemente.`,
        cta: "Excluir robô",
        destructive: true,
      };
    }
    return null;
  }, [confirmAction]);

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn font-instrument-sans">
      {/* 1. CABEÇALHO */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-instrument-serif text-[40px] sm:text-[48px] text-[#0E1B2C] dark:text-white leading-tight">
            Robôs
          </h1>
          <p className="text-[14px] text-[#4A586A] dark:text-[#94a3b8]">
            {bots.length} {bots.length === 1 ? "robô configurado" : "robôs configurados"},{" "}
            {bots.length === 0
              ? "crie o primeiro para começar"
              : activeCount === 0
                ? "todos pausados"
                : `${activeCount} em operação`}
            . Modo {tradingMode === "paper" ? "simulado" : "real"}.
          </p>
        </div>

        {/* Ações da direita: Exchange (Binance/OKX), Proteções, Sugestões IA, Novo robô, Ligar todos, Menu Mais */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <button
            onClick={() => {
              setSelectedExchange("okx");
              setViewTab("risk");
              setOpenApiSettingsModal(true);
            }}
            className={`px-3.5 py-2 rounded-full border text-[13px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
              selectedExchange === "okx"
                ? "border-[#0E1B2C] bg-[#0E1B2C] text-white dark:border-white dark:bg-white dark:text-[#0E1B2C]"
                : "border-[#D3DAE3] dark:border-white/20 text-[#0E1B2C] dark:text-white hover:bg-[#EEF1F5] dark:hover:bg-white/5"
            }`}
            title="Configurar e alternar para OKX V5 Unified ou Binance Spot"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                selectedExchange === "okx"
                  ? okxConnected
                    ? "bg-[#5BE3A8]"
                    : "bg-amber-400"
                  : binanceConnected
                    ? "bg-[#0A7A59]"
                    : "bg-amber-400"
              }`}
            />
            <span>{selectedExchange === "okx" ? "OKX Ativa" : "Abrir OKX / Exchange"}</span>
          </button>

          <button
            onClick={() => setOpenProtectionModal(true)}
            className={`px-3.5 py-2 rounded-full border text-[13px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
              circuitBreakerStatus.tripped || circuitBreakerBots.length > 0
                ? "border-[#F1C9C5] bg-[#FDF4F3] text-[#B42318]"
                : "border-[#D3DAE3] dark:border-white/20 text-[#0E1B2C] dark:text-white hover:bg-[#EEF1F5] dark:hover:bg-white/5"
            }`}
            title="Configurar travas globais de proteção, drawdown diário e filtros institucionais"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#0A7A59]" />
            <span>Proteções ({activeProtectionsCount}/10)</span>
          </button>

          <button
            onClick={() => setAiDialogOpen(true)}
            className="px-4 py-2 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[14px] font-semibold text-[#0E1B2C] dark:text-white hover:bg-[#EEF1F5] dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#1F5FD6]" />
            <span>Sugestões da IA</span>
          </button>

          <button
            onClick={handleOpenNewBot}
            className="px-4 py-2 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[14px] font-semibold text-[#0E1B2C] dark:text-white hover:bg-[#EEF1F5] dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            Novo robô
          </button>

          <button
            onClick={() => toggleAllBots(activeCount === 0)}
            disabled={bots.length === 0}
            className="px-5 py-2 rounded-full bg-[#0E1B2C] dark:bg-white text-white dark:text-[#0E1B2C] text-[14px] font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {activeCount === 0 ? `Ligar todos (${bots.length})` : "Pausar todos"}
          </button>

          {/* Menu Mais */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="px-4 py-2 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[14px] font-semibold text-[#0E1B2C] dark:text-white hover:bg-[#EEF1F5] dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center space-x-1">
                <span>Mais</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-64 p-2 rounded-[18px] bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 shadow-xl font-instrument-sans"
            >
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-[#4A586A] px-2 py-1">
                Estratégia & Dados
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => setAiDialogOpen(true)}
                className="cursor-pointer text-sm font-medium rounded-[10px]"
              >
                Recomendações de robôs (IA)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setBinanceBotsDialogOpen(true)}
                className="cursor-pointer text-sm font-medium rounded-[10px]"
              >
                Scanner de pares Binance
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const limit = protectionSettings?.maxSimultaneousPositions || 5;
                  const res = activateTopProfitableBots(limit);
                  toast({
                    title: `Frota otimizada (Top ${limit})`,
                    description:
                      res.activated.length > 0
                        ? `${res.activated.length} robô(s) priorizados por lucratividade.`
                        : "Os robôs mais lucrativos já estão ativos.",
                  });
                }}
                disabled={bots.length === 0}
                className="cursor-pointer text-sm font-medium rounded-[10px]"
              >
                Priorizar Top lucrativos
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setHistoryDialogOpen(true)}
                className="cursor-pointer text-sm font-medium rounded-[10px]"
              >
                Baixar candles (Histórico Binance)
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-[#4A586A] px-2 py-1">
                Gestão, Risco & Ferramentas
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => setOpenProtectionModal(true)}
                className="cursor-pointer text-sm font-medium rounded-[10px]"
              >
                Modos de proteção global
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setRiskCockpitOpen(true)}
                className="cursor-pointer text-sm font-medium rounded-[10px]"
              >
                Cockpit de risco & correlação
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setActiveSection("institutional")}
                className="cursor-pointer text-sm font-medium rounded-[10px]"
              >
                Cockpit Pro (Tela completa)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setBacktestSeed({ symbol: selectedBot?.symbol, strategy: selectedBot?.strategy });
                  setBacktestDialogOpen(true);
                }}
                className="cursor-pointer text-sm font-medium rounded-[10px]"
              >
                Backtest Express
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setOrphanOrdersDialogOpen(true)}
                className="cursor-pointer text-sm font-medium rounded-[10px]"
              >
                Ordens órfãs Binance
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setNotificationDialogOpen(true)}
                className="cursor-pointer text-sm font-medium rounded-[10px]"
              >
                Notificações (Telegram / Discord)
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-[#4A586A] px-2 py-1">
                Manutenção
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  syncCustodyPositionsWithBots();
                  toast({
                    title: "Frota reconciliada",
                    description: "As posições dos robôs foram sincronizadas com a carteira.",
                  });
                }}
                className="cursor-pointer text-sm font-medium rounded-[10px]"
              >
                Reconciliar com portfólio
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  resetGlobalCircuitBreaker();
                  resetConsecutiveLossBrake();
                  toast({
                    title: "Travas destravadas",
                    description: "Circuit Breaker e freio de perdas consecutivas foram resetados.",
                  });
                }}
                className="cursor-pointer text-sm font-medium rounded-[10px]"
              >
                Destravar Circuit Breaker / 3 perdas
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => toggleAllBots(false)}
                disabled={bots.length === 0}
                className="cursor-pointer text-sm font-medium rounded-[10px]"
              >
                Pausar todos
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setConfirmAction("reset_stats")}
                disabled={bots.length === 0}
                className="cursor-pointer text-sm font-medium rounded-[10px]"
              >
                Zerar métricas
              </DropdownMenuItem>
              {tradingMode === "paper" && (
                <DropdownMenuItem
                  onClick={() => setConfirmAction("clear_sim")}
                  className="cursor-pointer text-sm font-medium rounded-[10px]"
                >
                  Limpar simulação
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setConfirmAction("delete_all")}
                disabled={bots.length === 0}
                className="cursor-pointer text-sm font-medium text-[#B42318] hover:bg-[#FDF4F3] rounded-[10px]"
              >
                Excluir todos os robôs
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setConfirmAction("emergency")}
                className="cursor-pointer text-sm font-medium text-[#B42318] hover:bg-[#FDF4F3] rounded-[10px] font-semibold"
              >
                Parada de emergência
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Sub-navegação de V2: Frota | Motores & Logs | PnL & Portfólio | Risco & Conexão */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap p-1 bg-[#EEF1F5] dark:bg-[#162032] rounded-full border border-[#E7EBF0] dark:border-white/10 text-[13px]">
          {[
            { id: "fleet", label: "Visão da Frota", icon: Layers },
            { id: "engines", label: "Motores & Logs", icon: Activity },
            { id: "pnl", label: "PnL & Portfólio", icon: BarChart3 },
            { id: "risk", label: "Risco & Conexão", icon: ShieldCheck },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = viewTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setViewTab(tab.id as "fleet" | "engines" | "pnl" | "risk")}
                className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? "bg-[#0E1B2C] dark:bg-white text-white dark:text-[#0E1B2C] font-semibold shadow-xs"
                    : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Teto de execução simultânea + execução em segundo plano */}
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10">
            <span className="text-[#4A586A] dark:text-[#94a3b8] font-medium">Posições simultâneas:</span>
            <button
              type="button"
              onClick={() => {
                const cur = protectionSettings?.maxSimultaneousPositions || 5;
                updateProtectionSettings({ maxSimultaneousPositions: Math.max(1, cur - 1) });
              }}
              disabled={(protectionSettings?.maxSimultaneousPositions || 5) <= 1}
              className="w-5 h-5 rounded-full bg-[#EEF1F5] dark:bg-white/10 font-bold text-[#0E1B2C] dark:text-white disabled:opacity-40 cursor-pointer"
            >
              -
            </button>
            <span className="font-mono font-bold text-[#0E1B2C] dark:text-white tabular-nums">
              {protectionSettings?.maxSimultaneousPositions || 5}
            </span>
            <button
              type="button"
              onClick={() => {
                const cur = protectionSettings?.maxSimultaneousPositions || 5;
                updateProtectionSettings({
                  maxSimultaneousPositions: Math.min(Math.max(20, bots.length), cur + 1),
                });
              }}
              className="w-5 h-5 rounded-full bg-[#EEF1F5] dark:bg-white/10 font-bold text-[#0E1B2C] dark:text-white cursor-pointer"
            >
              +
            </button>
          </div>

          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 cursor-pointer">
            <input
              type="checkbox"
              checked={bgEnabled}
              onChange={(e) => setBgEnabled(e.target.checked)}
              className="accent-[#0E1B2C]"
            />
            <span className="text-[#4A586A] dark:text-[#94a3b8]">2º plano:</span>
            <input
              type="number"
              min={MIN_BACKGROUND_MINUTES}
              max={MAX_BACKGROUND_MINUTES}
              value={bgLimit}
              disabled={!bgEnabled}
              onChange={(e) => setBgLimit(Number(e.target.value))}
              className="w-12 bg-transparent font-mono font-semibold text-[#0E1B2C] dark:text-white text-center outline-none disabled:opacity-40"
            />
            <span className="text-[#4A586A] dark:text-[#94a3b8]">min</span>
          </label>
        </div>
      </div>

      {/* Seletor Institucional de Corretora de Investimento (Binance vs OKX) */}
      <div className="rounded-[20px] border border-[#E7EBF0] dark:border-white/10 bg-white/80 dark:bg-[#0f1622]/80 backdrop-blur-md p-3 sm:p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[11px] font-semibold tracking-wider text-[#4A586A] dark:text-[#94a3b8] uppercase">
            Corretora Ativa:
          </span>

          <div className="inline-flex p-1 bg-[#EEF1F5] dark:bg-[#162032] rounded-full border border-[#E7EBF0] dark:border-white/10">
            <button
              type="button"
              onClick={() => setSelectedExchange("binance")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-instrument-sans font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                selectedExchange === "binance"
                  ? "bg-white dark:bg-[#0E1B2C] text-[#0E1B2C] dark:text-white shadow-xs"
                  : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C] dark:hover:text-white"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${binanceConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-400"}`} />
              <span>Binance Spot</span>
              {binanceConnected ? (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                  Conectada
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">Configurar</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setSelectedExchange("okx")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-instrument-sans font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                selectedExchange === "okx"
                  ? "bg-white dark:bg-[#0E1B2C] text-[#0E1B2C] dark:text-white shadow-xs"
                  : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C] dark:hover:text-white"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${okxConnected ? "bg-emerald-500 animate-pulse" : "bg-sky-400"}`} />
              <span>OKX V5 Unified</span>
              {okxConnected ? (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                  {okxSimulated ? "Demo" : "Conectada"}
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">Configurar</span>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenApiSettingsModal(true)}
            className="h-8 rounded-full border-[#D3DAE3] dark:border-white/20 text-xs font-semibold cursor-pointer gap-1.5"
          >
            <Plug className="w-3.5 h-3.5 text-crypto-cyan" />
            <span>Gerenciar Chaves {selectedExchange === "okx" ? "OKX" : "Binance"}</span>
          </Button>
        </div>
      </div>

      {/* Prontidão de Cotações, Candles e Saldo */}
      {bots.length > 0 && <BotReadinessBar />}

      {/* Banner Global de Circuit Breaker / Trava de Perdas Consecutivas */}
      {(circuitBreakerStatus.tripped || circuitBreakerBots.length > 0) && (
        <div className="rounded-[20px] border border-[#F1C9C5] bg-[#FDF4F3] dark:bg-rose-500/10 dark:border-rose-500/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-[#B42318] dark:text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-[14px] font-bold text-[#B42318] dark:text-rose-300">
                {circuitBreakerStatus.tripped
                  ? "Circuit Breaker Global Ativo"
                  : `Trava de Proteção Ativa (${circuitBreakerBots.length} robô(s))`}
              </h4>
              <p className="text-[12px] text-[#4A586A] dark:text-rose-200/80 mt-0.5">
                {circuitBreakerStatus.reason ||
                  "Os robôs atingiram a trava de perdas consecutivas/quarentena para preservar capital."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                resetGlobalCircuitBreaker();
                resetConsecutiveLossBrake();
                toggleAllBots(true);
                toast({
                  title: "Travas removidas",
                  description: "Circuit Breaker e freios resetados; frota reativada.",
                });
              }}
              className="px-4 py-2 rounded-full bg-[#0A7A59] text-white text-[13px] font-semibold hover:opacity-90 cursor-pointer"
            >
              Retirar travas e iniciar
            </button>
            <button
              onClick={() => setOpenProtectionModal(true)}
              className="px-4 py-2 rounded-full border border-[#D3DAE3] bg-white dark:bg-transparent text-[13px] font-semibold text-[#0E1B2C] dark:text-white cursor-pointer"
            >
              Ajustar proteção
            </button>
          </div>
        </div>
      )}

      {/* 2. METRICSTRIP EM CARTÃO BRANCO + MÉTRICAS QUANTITATIVAS */}
      <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 space-y-5 shadow-xs">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E7EBF0] dark:divide-white/10">
          <div className="pb-3 sm:pb-0 sm:pr-6">
            <span className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] block">Ligados</span>
            <span className="font-instrument-serif text-[34px] sm:text-[40px] text-[#0E1B2C] dark:text-white tabular-nums font-bold">
              {activeCount} <span className="text-[20px] font-normal text-[#4A586A]">de {bots.length}</span>
            </span>
          </div>

          <div className="py-3 sm:py-0 sm:px-6">
            <span className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] block">Resultado realizado</span>
            <span
              className={`font-instrument-serif text-[34px] sm:text-[40px] tabular-nums font-bold ${
                totalRealizedPnl > 0
                  ? "text-[#0A7A59] dark:text-[#5BE3A8]"
                  : totalRealizedPnl < 0
                    ? "text-[#B42318] dark:text-[#FF8A80]"
                    : "text-[#0E1B2C] dark:text-white"
              }`}
            >
              {formatCurrency(totalRealizedPnl)}
            </span>
          </div>

          <div className="py-3 sm:py-0 sm:px-6">
            <span className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] block">Posições abertas</span>
            <span className="font-instrument-serif text-[34px] sm:text-[40px] text-[#0E1B2C] dark:text-white tabular-nums font-bold">
              {openPositionsCount}
            </span>
          </div>

          <div className="pt-3 sm:pt-0 sm:pl-6">
            <span className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] block">Limite de perda diária</span>
            <span className="font-instrument-serif text-[34px] sm:text-[40px] text-[#0E1B2C] dark:text-white tabular-nums font-bold">
              {dailyLossLimit > 0 ? formatCurrency(dailyLossLimit) : "—"}
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-[#E7EBF0] dark:border-white/10 grid grid-cols-2 sm:grid-cols-5 gap-3 text-[12px]">
          <div>
            <span className="text-[#4A586A] dark:text-[#94a3b8] block">Sharpe anualizado</span>
            <span className="font-semibold text-[#0E1B2C] dark:text-white tabular-nums">
              {riskMetrics.closedTradesCount >= 2 ? riskMetrics.sharpeRatio.toFixed(2) : "—"}
            </span>
          </div>
          <div>
            <span className="text-[#4A586A] dark:text-[#94a3b8] block">Sortino</span>
            <span className="font-semibold text-[#0E1B2C] dark:text-white tabular-nums">
              {riskMetrics.closedTradesCount >= 2 ? riskMetrics.sortinoRatio.toFixed(2) : "—"}
            </span>
          </div>
          <div>
            <span className="text-[#4A586A] dark:text-[#94a3b8] block">Fator de lucro</span>
            <span className="font-semibold text-[#0E1B2C] dark:text-white tabular-nums">
              {riskMetrics.closedTradesCount >= 1 ? `${riskMetrics.profitFactor.toFixed(2)}x` : "—"}
            </span>
          </div>
          <div>
            <span className="text-[#4A586A] dark:text-[#94a3b8] block">Expectativa / trade</span>
            <span
              className={`font-semibold tabular-nums ${
                riskMetrics.expectancy >= 0 ? "text-[#0A7A59]" : "text-[#B42318]"
              }`}
            >
              {riskMetrics.closedTradesCount >= 1
                ? formatCurrency(riskMetrics.expectancy, { showSign: true })
                : "—"}
            </span>
          </div>
          <div>
            <span className="text-[#4A586A] dark:text-[#94a3b8] block">Queda máxima</span>
            <span className="font-semibold text-[#B42318] dark:text-[#FF8A80] tabular-nums">
              {riskMetrics.closedTradesCount >= 1
                ? formatPercent(-Math.abs(riskMetrics.maxDrawdownPercent))
                : "—"}
            </span>
          </div>
        </div>
      </div>

      {viewTab === "fleet" && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: Filtros e Lista */}
        <div className="lg:col-span-8 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 shadow-xs space-y-4">
          {/* Pílulas de Filtro */}
          <div className="inline-flex p-1 bg-[#EEF1F5] dark:bg-[#162032] rounded-full border border-[#E7EBF0] dark:border-white/10 text-[13px]">
            {[
              { id: "todos", label: `Todos (${bots.length})` },
              { id: "ligados", label: `Ligados (${activeCount})` },
              { id: "pausados", label: `Pausados (${pausedCount})` },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as "todos" | "ligados" | "pausados")}
                className={`px-3.5 py-1 rounded-full transition-all cursor-pointer ${
                  filter === f.id
                    ? "bg-[#0E1B2C] text-white font-semibold shadow-xs"
                    : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Linhas da Lista de Robôs ou Estado Vazio */}
          {filteredBots.length > 0 ? (
            <div className="space-y-2 pt-2">
              {filteredBots.map((bot) => {
                const isSelected = selectedBot?.id === bot.id;
                const botResult = (bot.stats?.realizedPnl ?? 0) + (bot.position?.unrealizedPnl ?? 0);
                const displaySymbol =
                  bot.position?.symbol ||
                  (bot.overrideSymbol && bot.overrideSymbol !== "AUTO" ? bot.overrideSymbol : bot.symbol);
                return (
                  <div
                    key={bot.id}
                    onClick={() => setSelectedBotId(bot.id)}
                    className={`p-4 rounded-[18px] transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 border ${
                      isSelected
                        ? "bg-[#EEF1F5] dark:bg-white/10 border-transparent"
                        : "bg-transparent border-transparent hover:bg-[#F8FAFC] dark:hover:bg-white/5"
                    }`}
                  >
                    <div className="space-y-0.5 min-w-[200px]">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-[15px] text-[#0E1B2C] dark:text-white">
                          {bot.name}
                        </span>
                        <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] uppercase font-mono">
                          {displaySymbol === "AUTO" ? "Auto" : displaySymbol}
                        </span>
                        {bot.position && bot.position.quantity > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-[#E6F4EF] text-[#0A7A59] text-[11px] font-semibold">
                            Em posição
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] truncate max-w-[340px]">
                        {bot.strategy}
                        {bot.stats?.lastAction ? ` · ${bot.stats.lastAction}` : ""}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-left sm:text-right shrink-0 text-[13px]">
                      <div>
                        <span className="text-[11px] text-[#4A586A] dark:text-[#94a3b8] block">Alocação</span>
                        <span className="font-medium text-[#0E1B2C] dark:text-white tabular-nums">
                          {formatCurrency(bot.allocationAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-[#4A586A] dark:text-[#94a3b8] block">Alvo / Stop</span>
                        <span className="font-medium text-[#0E1B2C] dark:text-white tabular-nums">
                          +{bot.takeProfit.toFixed(1).replace(".", ",")}% / −{bot.stopLoss.toFixed(1).replace(".", ",")}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-[#4A586A] dark:text-[#94a3b8] block">Resultado</span>
                        <span
                          className={`font-medium tabular-nums ${
                            botResult > 0
                              ? "text-[#0A7A59] dark:text-[#5BE3A8]"
                              : botResult < 0
                                ? "text-[#B42318] dark:text-[#FF8A80]"
                                : "text-[#0E1B2C] dark:text-white"
                          }`}
                        >
                          {formatCurrency(botResult)}
                        </span>
                      </div>
                    </div>

                    <div onClick={(e) => e.stopPropagation()} className="shrink-0 self-end sm:self-center">
                      <AppSwitch
                        checked={bot.active}
                        onCheckedChange={() => toggleBotActive(bot.id)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-[#F8FAFC] dark:bg-white/5 border border-[#E7EBF0] dark:border-white/10 rounded-[18px] p-6 space-y-3 text-center sm:text-left">
              <h3 className="font-bold text-[15px] text-[#0E1B2C] dark:text-white">
                {bots.length === 0 ? "Nenhum robô configurado ainda" : "Nenhum robô neste filtro"}
              </h3>
              <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8]">
                {bots.length === 0
                  ? "Crie um robô manualmente com seus parâmetros de risco ou gere recomendações prontas com a IA."
                  : "Alterne o filtro acima para visualizar seus robôs."}
              </p>
              {bots.length === 0 && (
                <div className="flex flex-wrap gap-2.5 pt-1">
                  <button
                    onClick={handleOpenNewBot}
                    className="px-5 py-2.5 rounded-full bg-[#0E1B2C] dark:bg-white text-white dark:text-[#0E1B2C] font-semibold text-[14px] hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    Criar primeiro robô
                  </button>
                  <button
                    onClick={() => setAiDialogOpen(true)}
                    className="px-5 py-2.5 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[#0E1B2C] dark:text-white font-semibold text-[14px] hover:bg-[#EEF1F5] dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Gerar com IA
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Coluna Direita: Painel Detalhes */}
        {selectedBot && (
          <div className="lg:col-span-4 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] uppercase tracking-wider block font-medium">
                  Detalhes
                </span>
                <h2 className="font-instrument-serif text-[32px] text-[#0E1B2C] dark:text-white leading-tight pt-0.5">
                  {selectedBot.name}
                </h2>
                <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8]">
                  {selectedBot.symbol === "AUTO" ? "Auto-Screener" : selectedBot.symbol} · {selectedBot.strategy}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setDrawerBot(selectedBot)}
                  title="Ajuste rápido"
                  className="p-2 rounded-full border border-[#E7EBF0] dark:border-white/10 text-[#4A586A] hover:text-[#0E1B2C] hover:bg-[#EEF1F5] transition-colors cursor-pointer"
                >
                  <Sliders className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleOpenEditBot(selectedBot)}
                  title="Editar configuração completa"
                  className="p-2 rounded-full border border-[#E7EBF0] dark:border-white/10 text-[#4A586A] hover:text-[#0E1B2C] hover:bg-[#EEF1F5] transition-colors cursor-pointer"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            </div>

            {selectedBot.position && selectedBot.position.quantity > 0 && (
              <div className="p-3.5 rounded-[14px] bg-[#EEF1F5] dark:bg-white/5 text-[13px] flex items-center justify-between">
                <div>
                  <span className="text-[#4A586A] dark:text-[#94a3b8] block text-[11px]">
                    Posição aberta ({selectedBot.position.symbol})
                  </span>
                  <span className="font-semibold text-[#0E1B2C] dark:text-white tabular-nums">
                    Entrada {formatCurrency(selectedBot.position.entryPrice)}
                  </span>
                </div>
                <span
                  className={`font-bold tabular-nums ${
                    selectedBot.position.unrealizedPnl >= 0 ? "text-[#0A7A59]" : "text-[#B42318]"
                  }`}
                >
                  {formatPercent(selectedBot.position.unrealizedPnlPercent)}
                </span>
              </div>
            )}

            {/* Linhas Chave / Valor */}
            <div className="divide-y divide-[#E7EBF0] dark:divide-white/5 text-[14px]">
              <div className="py-2.5 flex justify-between">
                <span className="text-[#4A586A] dark:text-[#94a3b8]">Alocação</span>
                <span className="font-medium text-[#0E1B2C] dark:text-white tabular-nums">
                  {formatCurrency(selectedBot.allocationAmount)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#4A586A] dark:text-[#94a3b8]">Alvo de lucro</span>
                <span className="font-medium text-[#0A7A59] dark:text-[#5BE3A8] tabular-nums">
                  +{selectedBot.takeProfit.toFixed(2).replace(".", ",")}%
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#4A586A] dark:text-[#94a3b8]">Stop loss</span>
                <span className="font-medium text-[#B42318] dark:text-[#FF8A80] tabular-nums">
                  −{selectedBot.stopLoss.toFixed(2).replace(".", ",")}%
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#4A586A] dark:text-[#94a3b8]">Trailing</span>
                <span className="font-medium text-[#0E1B2C] dark:text-white tabular-nums">
                  {selectedBot.trailingStop
                    ? `${(selectedBot.trailingStopDistance ?? 0.6).toFixed(2).replace(".", ",")}%`
                    : "Desativado"}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#4A586A] dark:text-[#94a3b8]">Break-even a partir de</span>
                <span className="font-medium text-[#0E1B2C] dark:text-white tabular-nums">
                  {selectedBot.autoBreakEven
                    ? `+${(selectedBot.breakEvenTrigger ?? 2.0).toFixed(1).replace(".", ",")}%`
                    : "Desativado"}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#4A586A] dark:text-[#94a3b8]">Encerrar após</span>
                <span className="font-medium text-[#0E1B2C] dark:text-white">
                  {selectedBot.timeStopMinutes || selectedBot.maxHoldingMinutes
                    ? `${selectedBot.timeStopMinutes ?? selectedBot.maxHoldingMinutes} min`
                    : "Sem limite"}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#4A586A] dark:text-[#94a3b8]">Auto-Screener</span>
                <span className="font-medium text-[#0E1B2C] dark:text-white">
                  {selectedBot.useAutoScreener || selectedBot.symbol === "AUTO" ? "Sim" : "Par fixo"}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#4A586A] dark:text-[#94a3b8]">Risco por operação</span>
                <span className="font-medium text-[#0E1B2C] dark:text-white tabular-nums">
                  {selectedBot.riskPerTradePercent
                    ? `${selectedBot.riskPerTradePercent.toFixed(1).replace(".", ",")}%`
                    : "Padrão (1,0%)"}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#4A586A] dark:text-[#94a3b8]">BTC Gatekeeper / Livro L2</span>
                <span className="font-medium text-[#0E1B2C] dark:text-white">
                  {selectedBot.useBtcGatekeeper !== false ? "BTC ✓" : "BTC Off"} ·{" "}
                  {selectedBot.useOrderBookFilter !== false ? "L2 ✓" : "L2 Off"}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#4A586A] dark:text-[#94a3b8]">TP Parcial / Freio 3 perdas</span>
                <span className="font-medium text-[#0E1B2C] dark:text-white">
                  {selectedBot.usePartialTp !== false ? "Parcial ✓" : "Parcial Off"} ·{" "}
                  {selectedBot.disableConsecutiveLossBrake ? "Freio livre" : "Freio ativo"}
                </span>
              </div>
            </div>

            {selectedBot.strategy === "AI" && selectedBot.symbol !== "AUTO" && (
              <button
                type="button"
                disabled={refreshingAiSymbol === selectedBot.symbol}
                onClick={async () => {
                  setRefreshingAiSymbol(selectedBot.symbol);
                  try {
                    const sig = await ensureFreshAiSignalForSymbol(
                      selectedBot.symbol,
                      tickers[selectedBot.symbol],
                      true
                    );
                    if (sig) {
                      toast({
                        title: `Sinal IA atualizado (${selectedBot.symbol})`,
                        description: `${sig.action} (${Math.round((sig.confidence <= 1 ? sig.confidence * 100 : sig.confidence))}%): ${sig.reasoning}`,
                      });
                    } else {
                      toast({
                        title: "Sem retorno válido da IA",
                        description: "Verifique a chave de IA em Ajustes ou a conexão com o mercado.",
                        variant: "destructive",
                      });
                    }
                  } finally {
                    setRefreshingAiSymbol(null);
                  }
                }}
                className="w-full py-2 px-3 rounded-full border border-[#1F5FD6]/30 bg-[#EEF4FF] dark:bg-blue-500/10 text-[#1F5FD6] dark:text-blue-300 text-[13px] font-semibold hover:bg-[#E1ECFF] transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {refreshingAiSymbol === selectedBot.symbol ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Brain className="w-3.5 h-3.5" />
                )}
                <span>
                  {refreshingAiSymbol === selectedBot.symbol
                    ? "Consultando IA..."
                    : "Atualizar sinal IA agora"}
                </span>
              </button>
            )}

            {Array.isArray(selectedBot.stats?.entryChecks) && selectedBot.stats.entryChecks.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4A586A] dark:text-[#94a3b8] block">
                  Diagnóstico ao vivo do motor
                </span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {selectedBot.stats.entryChecks.map((chk, i) => (
                    <div
                      key={`${chk.label}-${i}`}
                      className={`p-2 rounded-[10px] text-[11px] border flex items-start gap-2 ${
                        chk.ok
                          ? "bg-[#E6F4EF]/50 border-[#BCE3D4] text-[#0A7A59] dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300"
                          : "bg-[#FDF4F3] border-[#F1C9C5] text-[#B42318] dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300"
                      }`}
                    >
                      {chk.ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-semibold">{chk.label}:</span> {chk.detail}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedBot.stats?.lastAction && (
              <p className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] leading-snug bg-[#F8FAFC] dark:bg-white/5 rounded-[12px] p-3">
                {selectedBot.stats.lastAction}
              </p>
            )}

            {/* Botões do Rodapé do Painel */}
            <div className="space-y-2.5 pt-2">
              <button
                onClick={() => toggleBotActive(selectedBot.id)}
                className="w-full py-2.5 rounded-full bg-[#0E1B2C] dark:bg-white text-white dark:text-[#0E1B2C] font-semibold text-[14px] hover:opacity-90 transition-opacity cursor-pointer"
              >
                {selectedBot.active ? `Pausar ${selectedBot.name}` : `Ligar ${selectedBot.name}`}
              </button>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setActiveSection("history")}
                  className="py-2 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[#0E1B2C] dark:text-white font-semibold text-[12px] hover:bg-[#EEF1F5] dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Trades ({selectedBot.stats?.totalTrades ?? 0})
                </button>
                <button
                  onClick={() => {
                    setBacktestSeed({ symbol: selectedBot.symbol, strategy: selectedBot.strategy });
                    setBacktestDialogOpen(true);
                  }}
                  className="py-2 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[#0E1B2C] dark:text-white font-semibold text-[12px] hover:bg-[#EEF1F5] dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  <FlaskConical className="w-3 h-3" />
                  <span>Backtest</span>
                </button>
                <button
                  onClick={() => setConfirmAction({ type: "delete_one", bot: selectedBot })}
                  className="py-2 rounded-full border border-[#F1C9C5] text-[#B42318] font-semibold text-[12px] hover:bg-[#FDF4F3] transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Excluir</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {viewTab === "engines" && (
        <div className="space-y-6">
          <EnginePanel />
          <BotActivityLog />
        </div>
      )}

      {viewTab === "pnl" && (
        <div className="space-y-6">
          <RealtimeNetPnlPanel />
          <BotPnLRegistry />
          <BotPortfolio />
          <BotPerformanceChart />
        </div>
      )}

      {viewTab === "risk" && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => setOpenProtectionModal(true)}
              className="px-4 py-2 rounded-full bg-[#0E1B2C] dark:bg-white text-white dark:text-[#0E1B2C] text-[13px] font-semibold cursor-pointer flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Modos de proteção ({activeProtectionsCount}/10)</span>
            </button>
            <button
              onClick={() => setRiskCockpitOpen(true)}
              className="px-4 py-2 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[13px] font-semibold text-[#0E1B2C] dark:text-white cursor-pointer flex items-center gap-1.5"
            >
              <Gauge className="w-3.5 h-3.5" />
              <span>Correlação & Cockpit de Risco</span>
            </button>
            <button
              onClick={() => setOrphanOrdersDialogOpen(true)}
              className="px-4 py-2 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[13px] font-semibold text-[#0E1B2C] dark:text-white cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Ordens órfãs Binance</span>
            </button>
            <button
              onClick={() => setNotificationDialogOpen(true)}
              className="px-4 py-2 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[13px] font-semibold text-[#0E1B2C] dark:text-white cursor-pointer flex items-center gap-1.5"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Alertas Telegram / Discord</span>
            </button>
          </div>
          <BotCockpit />
          <ExchangeConnection />
        </div>
      )}

      {/* Diálogos e Drawers Reais de Criação/Edição/Sugestões */}
      <BotDialog
        open={openBotCreateModal}
        onOpenChange={handleBotDialogChange}
        botToEdit={editingBot}
      />

      <BotDrawer
        bot={drawerBot}
        open={!!drawerBot}
        onClose={() => setDrawerBot(null)}
        onSave={(botId, updates) => {
          updateBot(botId, updates);
          toast({ title: "Parâmetros atualizados", description: "As metas do robô foram salvas." });
        }}
      />

      <AIBotRecommendationsDialog
        open={aiDialogOpen}
        onOpenChange={setAiDialogOpen}
        onCustomEdit={(bot) => {
          setAiDialogOpen(false);
          setEditingBot(bot);
          setOpenBotCreateModal(true);
        }}
      />

      <BinanceProfitableBotsDialog
        open={binanceBotsDialogOpen}
        onOpenChange={setBinanceBotsDialogOpen}
      />

      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="sm:max-w-2xl rounded-[24px] p-6 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 max-h-[88vh] overflow-y-auto font-instrument-sans">
          <DialogHeader>
            <DialogTitle className="font-instrument-serif text-2xl text-[#0E1B2C] dark:text-white">
              Histórico de candles para os robôs
            </DialogTitle>
          </DialogHeader>
          <HistoryPanel />
        </DialogContent>
      </Dialog>

      <ProtectionSettingsDialog
        open={openProtectionModal}
        onOpenChange={setOpenProtectionModal}
      />

      <NotificationSettingsDialog
        open={notificationDialogOpen}
        onOpenChange={setNotificationDialogOpen}
      />

      <OrphanOrdersDialog
        open={orphanOrdersDialogOpen}
        onOpenChange={setOrphanOrdersDialogOpen}
      />

      <BotBacktestDialog
        open={backtestDialogOpen}
        onOpenChange={setBacktestDialogOpen}
        initialSymbol={backtestSeed.symbol === "AUTO" ? "BTCUSDT" : backtestSeed.symbol}
        initialStrategy={backtestSeed.strategy}
      />

      <BotRiskCockpit
        open={riskCockpitOpen}
        onOpenChange={setRiskCockpitOpen}
      />

      {/* Confirmação de Ações Críticas / Destrutivas */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="rounded-[24px] max-w-md p-6 bg-white dark:bg-[#0f1622] border border-[#F1C9C5] font-instrument-sans">
          <AlertDialogHeader>
            <AlertDialogTitle
              className={`font-instrument-serif text-2xl flex items-center gap-2 ${
                confirmDialogCopy?.destructive ? "text-[#B42318]" : "text-[#0E1B2C] dark:text-white"
              }`}
            >
              <ShieldAlert
                className={`w-5 h-5 ${confirmDialogCopy?.destructive ? "text-[#B42318]" : "text-[#0E1B2C]"}`}
              />
              {confirmDialogCopy?.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[#4A586A] pt-2">
              {confirmDialogCopy?.desc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-4">
            <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              className={`rounded-full font-semibold ${
                confirmDialogCopy?.destructive
                  ? "bg-[#B42318] text-white hover:bg-[#911a10]"
                  : "bg-[#0E1B2C] text-white hover:opacity-90"
              }`}
            >
              {confirmDialogCopy?.cta}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
