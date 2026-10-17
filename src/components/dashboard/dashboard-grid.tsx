"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useCryptoStore } from "@/lib/store";
import { useDataProvider } from "@/lib/data-provider";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BarChart3,
  Brain,
  Wallet,
  Activity,
  Sliders,
  RotateCcw,
  Zap,
  Bot,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Core summary & navigation
import { StatCards } from "@/components/dashboard/stat-cards";
import { WidgetBoundary } from "@/components/dashboard/widget-boundary";
import { DataFreshnessBanner } from "@/components/dashboard/data-freshness-banner";

import { MarketHighlights } from "@/components/dashboard/market-highlights";
import { DirectAiTradeModal } from "@/components/bot/direct-ai-trade-modal";

// AI & Signals components
import { AIEntries } from "@/components/dashboard/ai-entries";

// Portfolio & Risk components

// Analytics & On-chain components

// Mobile compact components
import { MiniPortfolio } from "@/components/mobile/mini-portfolio";
import { MiniPnl } from "@/components/mobile/mini-pnl";
import { MiniBook } from "@/components/mobile/mini-book";
import { MiniHeatmap } from "@/components/mobile/mini-heatmap";
import { useShallow } from "zustand/react/shallow";

// Widgets abaixo da dobra são carregados sob demanda para reduzir o JavaScript inicial
function WidgetSkeleton() {
  return <div className="h-64 rounded-xl bg-secondary/30 animate-pulse" aria-busy="true" aria-label="Carregando widget" />;
}

const MarketSentiment = dynamic(() => import("@/components/dashboard/market-sentiment").then((m) => m.MarketSentiment), { ssr: false, loading: () => <WidgetSkeleton /> });
const FearGreedIndex = dynamic(() => import("@/components/dashboard/fear-greed-index").then((m) => m.FearGreedIndex), { ssr: false, loading: () => <WidgetSkeleton /> });
const CryptoNews = dynamic(() => import("@/components/dashboard/crypto-news").then((m) => m.CryptoNews), { ssr: false, loading: () => <WidgetSkeleton /> });
const MarketTable = dynamic(() => import("@/components/dashboard/market-table").then((m) => m.MarketTable), { ssr: false, loading: () => <WidgetSkeleton /> });
const Watchlist = dynamic(() => import("@/components/dashboard/watchlist").then((m) => m.Watchlist), { ssr: false, loading: () => <WidgetSkeleton /> });
const PriceAlerts = dynamic(() => import("@/components/dashboard/price-alerts").then((m) => m.PriceAlerts), { ssr: false, loading: () => <WidgetSkeleton /> });
const AITopPicks = dynamic(() => import("@/components/dashboard/ai-top-picks").then((m) => m.AITopPicks), { ssr: false, loading: () => <WidgetSkeleton /> });
const AISignals = dynamic(() => import("@/components/dashboard/ai-signals").then((m) => m.AISignals), { ssr: false, loading: () => <WidgetSkeleton /> });
const RecentTrades = dynamic(() => import("@/components/dashboard/recent-trades").then((m) => m.RecentTrades), { ssr: false, loading: () => <WidgetSkeleton /> });
const InsightsPanel = dynamic(() => import("@/components/dashboard/insights-panel").then((m) => m.InsightsPanel), { ssr: false, loading: () => <WidgetSkeleton /> });
const StrategyComparison = dynamic(() => import("@/components/dashboard/strategy-comparison").then((m) => m.StrategyComparison), { ssr: false, loading: () => <WidgetSkeleton /> });
const MLPipeline = dynamic(() => import("@/components/dashboard/ml-pipeline").then((m) => m.MLPipeline), { ssr: false, loading: () => <WidgetSkeleton /> });
const PortfolioPro = dynamic(() => import("@/components/dashboard/portfolio-pro").then((m) => m.PortfolioPro), { ssr: false, loading: () => <WidgetSkeleton /> });
const PnlTracker = dynamic(() => import("@/components/dashboard/pnl-tracker").then((m) => m.PnlTracker), { ssr: false, loading: () => <WidgetSkeleton /> });
const OpenOrders = dynamic(() => import("@/components/dashboard/open-orders").then((m) => m.OpenOrders), { ssr: false, loading: () => <WidgetSkeleton /> });
const RiskModule = dynamic(() => import("@/components/dashboard/risk-module").then((m) => m.RiskModule), { ssr: false, loading: () => <WidgetSkeleton /> });
const PortfolioRebalancing = dynamic(() => import("@/components/dashboard/portfolio-rebalancing").then((m) => m.PortfolioRebalancing), { ssr: false, loading: () => <WidgetSkeleton /> });
const FinancialHub = dynamic(() => import("@/components/dashboard/financial-hub").then((m) => m.FinancialHub), { ssr: false, loading: () => <WidgetSkeleton /> });
const WhaleTracker = dynamic(() => import("@/components/dashboard/whale-tracker").then((m) => m.WhaleTracker), { ssr: false, loading: () => <WidgetSkeleton /> });
const LiquidationHeatmap = dynamic(() => import("@/components/dashboard/liquidation-heatmap").then((m) => m.LiquidationHeatmap), { ssr: false, loading: () => <WidgetSkeleton /> });
const CorrelationHeatmap = dynamic(() => import("@/components/dashboard/correlation-heatmap").then((m) => m.CorrelationHeatmap), { ssr: false, loading: () => <WidgetSkeleton /> });
const MultiTimeframeAnalysis = dynamic(() => import("@/components/dashboard/multi-timeframe").then((m) => m.MultiTimeframeAnalysis), { ssr: false, loading: () => <WidgetSkeleton /> });
const FundingRates = dynamic(() => import("@/components/dashboard/funding-rates").then((m) => m.FundingRates), { ssr: false, loading: () => <WidgetSkeleton /> });
const SocialSentiment = dynamic(() => import("@/components/dashboard/social-sentiment").then((m) => m.SocialSentiment), { ssr: false, loading: () => <WidgetSkeleton /> });
const OnChainAnalytics = dynamic(() => import("@/components/dashboard/on-chain-analytics").then((m) => m.OnChainAnalytics), { ssr: false, loading: () => <WidgetSkeleton /> });
const SLTPCalculator = dynamic(() => import("@/components/dashboard/sltp-calculator").then((m) => m.SLTPCalculator), { ssr: false, loading: () => <WidgetSkeleton /> });
const TradingCalculator = dynamic(() => import("@/components/dashboard/trading-calculator").then((m) => m.TradingCalculator), { ssr: false, loading: () => <WidgetSkeleton /> });

const WIDGET_TITLES: Record<string, string> = {
  "market-highlights": "Destaques do Mercado",
  "fear-greed": "Índice Fear & Greed",
  "market-sentiment": "Sentimento do Mercado",
  "crypto-news": "Notícias Cripto",
  "market-table": "Tabela de Moedas (500+)",
  "watchlist-alerts": "Favoritos e Alertas",
  "ai-top-picks": "Destaques da IA",
  "ai-signals": "Sinais Neurais",
  "ai-entries": "Entradas Sugeridas pela IA",
  "insights-panel": "Diagnósticos & Insights",
  "strategy-comparison": "Comparador de Estratégias",
  "ml-pipeline": "Pipeline Machine Learning",
  "portfolio-pro": "Portfólio Pro",
  "pnl-tracker": "Rastreador de P&L",
  "open-orders": "Ordens Abertas",
  "risk-module": "Módulo de Risco",
  "portfolio-rebalancing": "Rebalanceamento",
  "financial-hub": "Hub Financeiro",
  "whale-tracker": "Rastreador de Baleias",
  "liquidation-heatmap": "Mapa de Liquidação",
  "correlation-heatmap": "Mapa de Correlação",
  "multi-timeframe": "Análise Multi-Timeframe",
  "funding-rates": "Taxas de Financiamento",
  "social-onchain": "Sentimento Social & On-Chain",
  "calculators": "Calculadoras de Trading",
};

type Preset = "trader" | "analise" | "portfolio" | "ia" | "all";

const PRESET_OPTIONS: { id: Preset; label: string }[] = [
  { id: "trader", label: "Trader" },
  { id: "analise", label: "Análise" },
  { id: "portfolio", label: "Portfólio" },
  { id: "ia", label: "Sugerido pela IA" },
  { id: "all", label: "Completo" },
];

// Widgets de cada preset, na ordem em que aparecem
const PRESET_WIDGETS: Record<Exclude<Preset, "all" | "ia">, string[]> = {
  trader: ["ai-entries", "market-highlights", "ai-signals", "open-orders", "watchlist-alerts", "multi-timeframe", "recent-trades", "market-table"],
  analise: ["fear-greed", "market-sentiment", "funding-rates", "correlation-heatmap", "liquidation-heatmap", "whale-tracker", "crypto-news"],
  portfolio: ["portfolio-pro", "pnl-tracker", "risk-module", "portfolio-rebalancing", "financial-hub", "open-orders"],
};

const WIDE_WIDGETS = new Set(["market-table", "crypto-news", "market-highlights", "ai-entries"]);
const PRESET_TITLES: Record<string, string> = { "recent-trades": "Negociações Recentes" };

export function DashboardGrid() {
  const { setActiveSection } = useCryptoStore(
  useShallow((s) => ({ setActiveSection: s.setActiveSection }))
);
  const { syncBinanceCoins } = useDataProvider();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<string>("market");
  const [isSyncing, setIsSyncing] = useState(false);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [isClient, setIsClient] = useState(false);
  const [preset, setPreset] = useState<Preset>("trader");
  const [aiPreset, setAiPreset] = useState<{ ids: string[]; reason: string; source: string } | null>(null);
  const [aiPresetLoading, setAiPresetLoading] = useState(false);
  const [directTradeOpen, setDirectTradeOpen] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const savedPreset = localStorage.getItem("tradeai_dashboard_preset");
    if (savedPreset && PRESET_OPTIONS.some((o) => o.id === savedPreset)) setPreset(savedPreset as Preset);

    try {
      const savedAi = localStorage.getItem("tradeai_dashboard_ai_preset");
      if (savedAi) setAiPreset(JSON.parse(savedAi));
    } catch {
      // preset salvo corrompido: ignora
    }

    const savedTab = localStorage.getItem("tradeai_active_dashboard_tab");
    if (savedTab) setActiveTab(savedTab);

    const savedVis = localStorage.getItem("tradeai_dashboard_visibility");
    if (savedVis) {
      try {
        setVisibility(JSON.parse(savedVis));
      } catch {
        setVisibility({});
      }
    }
  }, []);

  const generateAiPreset = async () => {
    if (aiPresetLoading) return;
    setAiPresetLoading(true);
    try {
      const st = useCryptoStore.getState();
      const list = Object.values(st.tickers);
      const advancers = list.filter((t) => t.priceChangePercent > 0).length;
      const avgChange24h = list.length ? list.reduce((a, t) => a + t.priceChangePercent, 0) / list.length : 0;
      const widgets = [...Object.entries(WIDGET_TITLES), ["recent-trades", PRESET_TITLES["recent-trades"]]]
        .filter(([id]) => renderPresetWidget(id) !== null)
        .map(([id, title]) => ({ id, title }));
      const res = await fetch("/api/ai/dashboard-preset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widgets,
          market: {
            avgChange24h,
            advancers,
            decliners: list.length - advancers,
            tradingMode: st.tradingMode,
            botsActive: st.bots ? st.bots.filter((b) => b.active).length : 0,
            hasOpenPosition: (st.portfolio?.positions?.length ?? 0) > 0,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Falha ao montar o painel.");
      const next = { ids: data.ids, reason: data.reason, source: data.source };
      setAiPreset(next);
      localStorage.setItem("tradeai_dashboard_ai_preset", JSON.stringify(next));
    } catch (e: any) {
      toast({ title: "Não foi possível montar o painel", description: e.message, variant: "destructive" });
    } finally {
      setAiPresetLoading(false);
    }
  };

  const handlePresetChange = (next: Preset) => {
    setPreset(next);
    localStorage.setItem("tradeai_dashboard_preset", next);
    if (next === "ia" && !aiPreset) void generateAiPreset();
  };

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    localStorage.setItem("tradeai_active_dashboard_tab", val);
  };

  const toggleVisibility = (id: string) => {
    const newVis = { ...visibility, [id]: visibility[id] === false ? true : false };
    setVisibility(newVis);
    localStorage.setItem("tradeai_dashboard_visibility", JSON.stringify(newVis));
  };

  const handleResetVisibility = () => {
    setVisibility({});
    localStorage.removeItem("tradeai_dashboard_visibility");
    toast({ title: "Visualização Redefinida", description: "Todos os widgets estão visíveis." });
  };

  const handleSyncMarket = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    toast({
      title: "🔄 Sincronizando Binance...",
      description: "Atualizando cotações e moedas em tempo real...",
    });
    const res = await syncBinanceCoins();
    setIsSyncing(false);
    if (res.success) {
      toast({
        title: "✅ Sincronizado!",
        description: `${res.count} moedas e pares atualizados com sucesso.`,
      });
    }
  };

  const isVisible = (id: string) => visibility[id] !== false;

  const renderPresetWidget = (id: string): ReactNode => {
    switch (id) {
      case "market-highlights": return <MarketHighlights />;
      case "market-sentiment": return <MarketSentiment />;
      case "fear-greed": return <FearGreedIndex />;
      case "crypto-news": return <CryptoNews />;
      case "market-table": return <MarketTable />;
      case "watchlist-alerts": return <Watchlist />;
      case "ai-signals": return <AISignals />;
      case "ai-entries": return <AIEntries />;
      case "recent-trades": return <RecentTrades />;
      case "portfolio-pro": return <PortfolioPro />;
      case "pnl-tracker": return <PnlTracker />;
      case "open-orders": return <OpenOrders />;
      case "risk-module": return <RiskModule />;
      case "portfolio-rebalancing": return <PortfolioRebalancing />;
      case "financial-hub": return <FinancialHub />;
      case "whale-tracker": return <WhaleTracker />;
      case "liquidation-heatmap": return <LiquidationHeatmap />;
      case "correlation-heatmap": return <CorrelationHeatmap />;
      case "multi-timeframe": return <MultiTimeframeAnalysis />;
      case "funding-rates": return <FundingRates />;
      default: return null;
    }
  };

  // Menu para mostrar/ocultar widgets (compartilhado entre a visão por preset e a completa)
  const presetWidgetIds: string[] =
    preset === "ia" ? aiPreset?.ids ?? [] : preset === "all" ? [] : PRESET_WIDGETS[preset];

  const customizer = (
    <div className="flex items-center gap-2 self-end sm:self-auto">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs bg-black/40 border-white/[0.08] hover:bg-white/[0.06] text-slate-300 hover:text-white cursor-pointer rounded-lg"
          >
            <Sliders className="w-3 h-3 mr-1.5 text-slate-400" />
            <span>Módulos</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[230px] max-h-[320px] overflow-y-auto bg-[#0d131f] border border-white/[0.1] shadow-2xl p-1.5 rounded-xl">
          <DropdownMenuLabel className="text-xs font-semibold text-slate-200 px-2 py-1">Exibição de Módulos</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-white/[0.06] my-1" />
          {Object.entries(WIDGET_TITLES).map(([id, title]) => (
            <DropdownMenuCheckboxItem
              key={id}
              checked={visibility[id] !== false}
              onCheckedChange={() => toggleVisibility(id)}
              className="text-xs py-1.5 px-2 cursor-pointer font-medium text-slate-300 focus:bg-white/[0.06] focus:text-white rounded-md"
            >
              {title}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator className="bg-white/[0.06] my-1" />
          <DropdownMenuCheckboxItem
            onClick={handleResetVisibility}
            className="text-xs text-rose-400 focus:text-rose-300 focus:bg-rose-500/10 py-1.5 px-2 cursor-pointer font-medium flex items-center gap-1.5 rounded-md"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Resetar Padrão
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  if (!isClient) return null;

  return (
    <div className="space-y-4">
      {/* Mobile Compact Overview */}
      <div className="grid grid-cols-2 gap-2.5 md:hidden">
        <MiniPortfolio />
        <MiniPnl />
        <MiniBook />
        <MiniHeatmap />
      </div>

      {/* Aviso quando os dados de mercado estão atrasados ou offline */}
      <DataFreshnessBanner />

      {/* Top Hero: StatCards */}
      <StatCards />

      {/* Streamlined Terminal Control & View Modes Bar */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2 px-3 rounded-xl bg-[#0d131f]/80 backdrop-blur-xl border border-white/[0.07] shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-xs font-bold text-slate-200 tracking-wider uppercase font-mono">Terminal Pro</span>
          </div>
          <span className="text-white/10 font-thin">|</span>
          <div
            role="tablist"
            aria-label="Presets do painel"
            className="flex gap-1 p-0.5 rounded-lg bg-black/40 border border-white/[0.06] overflow-x-auto scrollbar-none"
          >
            {PRESET_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                role="tab"
                type="button"
                aria-selected={preset === opt.id}
                onClick={() => handlePresetChange(opt.id)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer transition-all duration-150",
                  preset === opt.id
                    ? "bg-cyan-500/20 text-cyan-400 font-semibold border border-cyan-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            size="sm"
            onClick={() => setDirectTradeOpen(true)}
            className="h-7 px-2.5 text-xs text-black font-extrabold bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 gap-1.5 cursor-pointer rounded-lg shadow-[0_0_12px_rgba(6,182,212,0.3)] transition-all font-mono"
            title="Abrir Operação Direta com IA"
          >
            <Zap className="w-3.5 h-3.5 fill-current text-black" />
            <span className="font-bold">Operação Direta IA</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveSection("institutional")}
            className="h-7 px-2.5 text-xs text-cyan-300 bg-cyan-950/50 border-cyan-500/40 hover:bg-cyan-500/20 gap-1.5 cursor-pointer font-medium rounded-lg shadow-[0_0_12px_rgba(6,182,212,0.2)] font-mono"
            title="Abrir Cockpit Institucional (PnL Real-Time, OFI, Livro L2 e IA)"
          >
            <Zap className="w-3 h-3 text-cyan-400" />
            <span className="font-semibold">Cockpit Institucional</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleSyncMarket}
            disabled={isSyncing}
            className="h-7 px-2.5 text-xs text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 gap-1.5 cursor-pointer font-medium border border-transparent hover:border-cyan-500/20 rounded-lg"
            title="Sincronizar moedas com a Binance"
          >
            <RefreshCw className={cn("w-3 h-3", isSyncing && "animate-spin text-cyan-400")} />
            <span className="hidden sm:inline font-mono">503 Moedas Binance</span>
          </Button>

          {customizer}
        </div>
      </motion.div>

      {preset === "all" ? (
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-secondary/25 border border-border/40 p-2 rounded-xl backdrop-blur-sm">
          <TabsList className="bg-secondary/40 p-1 border border-border/40 grid grid-cols-2 sm:flex sm:flex-row h-auto gap-1">
            <TabsTrigger
              value="market"
              className="text-xs px-3 py-1.5 data-[state=active]:bg-crypto-cyan/20 data-[state=active]:text-crypto-cyan font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Mercado & Cotações</span>
            </TabsTrigger>

            <TabsTrigger
              value="ai"
              className="text-xs px-3 py-1.5 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Brain className="w-3.5 h-3.5 text-purple-400" />
              <span>IA & Sinais</span>
            </TabsTrigger>

            <TabsTrigger
              value="portfolio"
              className="text-xs px-3 py-1.5 data-[state=active]:bg-crypto-gold/20 data-[state=active]:text-crypto-gold font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Wallet className="w-3.5 h-3.5 text-crypto-gold" />
              <span>Portfólio & Gestão</span>
            </TabsTrigger>

            <TabsTrigger
              value="analytics"
              className="text-xs px-3 py-1.5 data-[state=active]:bg-crypto-green/20 data-[state=active]:text-crypto-green font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-crypto-green" />
              <span>Análise Avançada</span>
            </TabsTrigger>
          </TabsList>

          {customizer}
        </div>

        {/* ======================================================== */}
        {/* TAB 1: MERCADO & COTAÇÕES */}
        {/* ======================================================== */}
        <TabsContent value="market" className="space-y-4 m-0 focus-visible:outline-none">
          {/* Top highlights row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {isVisible("market-highlights") && (
              <div className="col-span-1 lg:col-span-2">
                <WidgetBoundary name="Destaques do Mercado"><MarketHighlights /></WidgetBoundary>
              </div>
            )}
            {isVisible("fear-greed") && (
              <div className="col-span-1">
                <WidgetBoundary name="Índice Fear & Greed"><FearGreedIndex /></WidgetBoundary>
              </div>
            )}
          </div>

          {/* Sentiment & News row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {isVisible("market-sentiment") && (
              <div className="col-span-1">
                <WidgetBoundary name="Sentimento do Mercado"><MarketSentiment /></WidgetBoundary>
              </div>
            )}
            {isVisible("crypto-news") && (
              <div className="col-span-1 lg:col-span-2">
                <WidgetBoundary name="Notícias Cripto"><CryptoNews /></WidgetBoundary>
              </div>
            )}
          </div>

          {/* Complete 503-coins Table */}
          {isVisible("market-table") && (
            <div className="w-full">
              <WidgetBoundary name="Tabela de Moedas (500+)"><MarketTable /></WidgetBoundary>
            </div>
          )}

          {/* Watchlist & Price Alerts */}
          {isVisible("watchlist-alerts") && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <WidgetBoundary name="Favoritos e Alertas"><Watchlist /></WidgetBoundary>
              <WidgetBoundary name="Favoritos e Alertas"><PriceAlerts /></WidgetBoundary>
            </div>
          )}
        </TabsContent>

        {/* ======================================================== */}
        {/* TAB 2: IA & SINAIS */}
        {/* ======================================================== */}
        <TabsContent value="ai" className="space-y-4 m-0 focus-visible:outline-none">
          {isVisible("ai-entries") && (
            <WidgetBoundary name="Entradas Sugeridas pela IA"><AIEntries /></WidgetBoundary>
          )}

          {isVisible("ai-top-picks") && (
            <div className="w-full">
              <WidgetBoundary name="Destaques da IA"><AITopPicks /></WidgetBoundary>
            </div>
          )}

          {isVisible("ai-signals") && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <WidgetBoundary name="Sinais Neurais"><AISignals /></WidgetBoundary>
              </div>
              <div>
                <WidgetBoundary name="Negociações Recentes"><RecentTrades /></WidgetBoundary>
              </div>
            </div>
          )}

          {isVisible("insights-panel") && (
            <div className="w-full">
              <WidgetBoundary name="Diagnósticos & Insights"><InsightsPanel /></WidgetBoundary>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {isVisible("strategy-comparison") && <WidgetBoundary name="Comparador de Estratégias"><StrategyComparison /></WidgetBoundary>}
            {isVisible("ml-pipeline") && <WidgetBoundary name="Pipeline Machine Learning"><MLPipeline /></WidgetBoundary>}
          </div>
        </TabsContent>

        {/* ======================================================== */}
        {/* TAB 3: PORTFÓLIO & GESTÃO */}
        {/* ======================================================== */}
        <TabsContent value="portfolio" className="space-y-4 m-0 focus-visible:outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {isVisible("portfolio-pro") && <WidgetBoundary name="Portfólio Pro"><PortfolioPro /></WidgetBoundary>}
            {isVisible("pnl-tracker") && <WidgetBoundary name="Rastreador de P&L"><PnlTracker /></WidgetBoundary>}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {isVisible("open-orders") && <WidgetBoundary name="Ordens Abertas"><OpenOrders /></WidgetBoundary>}
            {isVisible("risk-module") && <WidgetBoundary name="Módulo de Risco"><RiskModule /></WidgetBoundary>}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {isVisible("portfolio-rebalancing") && <WidgetBoundary name="Rebalanceamento"><PortfolioRebalancing /></WidgetBoundary>}
            {isVisible("financial-hub") && <WidgetBoundary name="Hub Financeiro"><FinancialHub /></WidgetBoundary>}
          </div>
        </TabsContent>

        {/* ======================================================== */}
        {/* TAB 4: ANÁLISE AVANÇADA */}
        {/* ======================================================== */}
        <TabsContent value="analytics" className="space-y-4 m-0 focus-visible:outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {isVisible("whale-tracker") && <WidgetBoundary name="Rastreador de Baleias"><WhaleTracker /></WidgetBoundary>}
            {isVisible("liquidation-heatmap") && <WidgetBoundary name="Mapa de Liquidação"><LiquidationHeatmap /></WidgetBoundary>}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {isVisible("correlation-heatmap") && <WidgetBoundary name="Mapa de Correlação"><CorrelationHeatmap /></WidgetBoundary>}
            {isVisible("multi-timeframe") && <WidgetBoundary name="Análise Multi-Timeframe"><MultiTimeframeAnalysis /></WidgetBoundary>}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {isVisible("funding-rates") && <WidgetBoundary name="Taxas de Financiamento"><FundingRates /></WidgetBoundary>}
            {isVisible("social-onchain") && (
              <div className="space-y-4">
                <WidgetBoundary name="Sentimento Social & On-Chain"><SocialSentiment /></WidgetBoundary>
                <WidgetBoundary name="Sentimento Social & On-Chain"><OnChainAnalytics /></WidgetBoundary>
              </div>
            )}
          </div>

          {isVisible("calculators") && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <WidgetBoundary name="Calculadoras de Trading"><SLTPCalculator /></WidgetBoundary>
              <WidgetBoundary name="Calculadoras de Trading"><TradingCalculator /></WidgetBoundary>
            </div>
          )}
        </TabsContent>
      </Tabs>
      ) : preset === "trader" ? (
        <div id="dashboard-preset-panel" role="tabpanel" className="space-y-4">
          {/* Pro Trading Terminal 3-Column Grid for Desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
            {/* Left Column: Market Highlights & Watchlist (4 cols) */}
            <div className="lg:col-span-4 space-y-3.5">
              {isVisible("market-highlights") && (
                <WidgetBoundary name="Destaques do Mercado">
                  <MarketHighlights />
                </WidgetBoundary>
              )}
              {isVisible("watchlist-alerts") && (
                <WidgetBoundary name="Favoritos e Alertas">
                  <Watchlist />
                </WidgetBoundary>
              )}
              {isVisible("multi-timeframe") && (
                <WidgetBoundary name="Análise Multi-Timeframe">
                  <MultiTimeframeAnalysis />
                </WidgetBoundary>
              )}
            </div>

            {/* Center Column: AI Entries & Neural Signals (5 cols) */}
            <div className="lg:col-span-5 space-y-3.5">
              {isVisible("ai-entries") && (
                <WidgetBoundary name="Entradas Sugeridas pela IA">
                  <AIEntries />
                </WidgetBoundary>
              )}
              {isVisible("ai-signals") && (
                <WidgetBoundary name="Sinais Neurais em Tempo Real">
                  <AISignals />
                </WidgetBoundary>
              )}
            </div>

            {/* Right Column: Open Orders & Portfolio Tracking (3 cols) */}
            <div className="lg:col-span-3 space-y-3.5">
              {isVisible("open-orders") && (
                <WidgetBoundary name="Ordens em Aberto">
                  <OpenOrders />
                </WidgetBoundary>
              )}
              {isVisible("pnl-tracker") && (
                <WidgetBoundary name="Rastreador de P&L">
                  <PnlTracker />
                </WidgetBoundary>
              )}
              {isVisible("recent-trades") && (
                <WidgetBoundary name="Negociações Recentes">
                  <RecentTrades />
                </WidgetBoundary>
              )}
            </div>
          </div>

          {/* Bottom Section: Full Market Table with 503 Binance Coins */}
          {isVisible("market-table") && (
            <div className="w-full">
              <WidgetBoundary name="Tabela de Moedas (500+)">
                <MarketTable />
              </WidgetBoundary>
            </div>
          )}
        </div>
      ) : (
        <div id="dashboard-preset-panel" role="tabpanel" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {preset === "ia" && (
              <>
                <p className="flex-1 min-w-[200px] text-xs text-muted-foreground">
                  {aiPresetLoading ? "A IA está montando o painel…" : aiPreset?.reason ?? "Gere um painel com a IA para o momento atual."}
                  {aiPreset?.source === "regras" && !aiPresetLoading && " (por regras)"}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={generateAiPreset}
                  disabled={aiPresetLoading}
                  className="h-9 gap-1.5 text-xs cursor-pointer"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", aiPresetLoading && "animate-spin")} />
                  {aiPreset ? "Gerar de novo" : "Gerar painel"}
                </Button>
              </>
            )}
            <div className="ml-auto">{customizer}</div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {presetWidgetIds
              .filter((id) => isVisible(id))
              .map((id) => (
                <div key={id} className={WIDE_WIDGETS.has(id) ? "xl:col-span-2" : undefined}>
                  <WidgetBoundary name={PRESET_TITLES[id] ?? WIDGET_TITLES[id] ?? id}>
                    {renderPresetWidget(id)}
                  </WidgetBoundary>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Modal de Operação Direta com IA */}
      <DirectAiTradeModal
        open={directTradeOpen}
        onOpenChange={setDirectTradeOpen}
      />
    </div>
  );
}
