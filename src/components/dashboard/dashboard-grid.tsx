"use client";

import { useState, useEffect, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sliders,
  GripVertical,
  Layout,
  RotateCcw,
  Eye,
  EyeOff,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Import components directly
import { FinancialHub } from "@/components/dashboard/financial-hub";
import { PortfolioPro } from "@/components/dashboard/portfolio-pro";
import { PnlTracker } from "@/components/dashboard/pnl-tracker";
import { FearGreedIndex } from "@/components/dashboard/fear-greed-index";
import { MultiTimeframeAnalysis } from "@/components/dashboard/multi-timeframe";
import { MarketOverview } from "@/components/dashboard/market-overview";
import { Watchlist } from "@/components/dashboard/watchlist";
import { PriceAlerts } from "@/components/dashboard/price-alerts";
import { CorrelationHeatmap } from "@/components/dashboard/correlation-heatmap";
import { WhaleTracker } from "@/components/dashboard/whale-tracker";
import { LiquidationHeatmap } from "@/components/dashboard/liquidation-heatmap";
import { AISignals } from "@/components/dashboard/ai-signals";
import { RecentTrades } from "@/components/dashboard/recent-trades";
import { AITopPicks } from "@/components/dashboard/ai-top-picks";
import { SLTPCalculator } from "@/components/dashboard/sltp-calculator";
import { PortfolioRebalancing } from "@/components/dashboard/portfolio-rebalancing";
import { MLPipeline } from "@/components/dashboard/ml-pipeline";
import { TradingCalculator } from "@/components/dashboard/trading-calculator";
import { CryptoNews } from "@/components/dashboard/crypto-news";
import { StrategyComparison } from "@/components/dashboard/strategy-comparison";
import { MarketSentiment } from "@/components/dashboard/market-sentiment";
import { MarketHighlights } from "@/components/dashboard/market-highlights";
import { MarketTable } from "@/components/dashboard/market-table";
import { FundingRates } from "@/components/dashboard/funding-rates";
import { SocialSentiment } from "@/components/dashboard/social-sentiment";
import { OnChainAnalytics } from "@/components/dashboard/on-chain-analytics";
import { InsightsPanel } from "@/components/dashboard/insights-panel";
import { OpenOrders } from "@/components/dashboard/open-orders";
import { RiskModule } from "@/components/dashboard/risk-module";
import { TelemetryPanel } from "@/components/dashboard/telemetry-panel";
import { MiniPortfolio } from "@/components/mobile/mini-portfolio";
import { MiniPnl } from "@/components/mobile/mini-pnl";
import { MiniBook } from "@/components/mobile/mini-book";
import { MiniHeatmap } from "@/components/mobile/mini-heatmap";

const DEFAULT_ORDER = [
  "trading-news",
  "market-sentiment-highlights",
  "fear-greed",
  "financial-hub",
  "ai-top-picks",
  "insights-panel",
  "portfolio-pro",
  "pnl-tracker",
  "open-orders",
  "risk-module",
  "telemetry-panel",
  "sltp-calculator",
  "portfolio-rebalancing",
  "multi-timeframe",
  "market-overview",
  "watchlist-alerts",
  "market-table",
  "funding-rates",
  "correlation-heatmap",
  "whale-tracker",
  "liquidation-heatmap",
  "social-onchain",
  "ai-signals",
  "strategy-comparison",
  "ml-pipeline"
];

const WIDGETS_CONFIG: Record<string, {
  title: string;
  component: React.ComponentType;
  className: string;
}> = {
  "financial-hub": {
    title: "💳 Financial Hub",
    component: FinancialHub,
    className: "col-span-1 lg:col-span-2",
  },
  "ai-top-picks": {
    title: "🎯 Destaques da IA",
    component: AITopPicks,
    className: "col-span-1 lg:col-span-2",
  },
  "insights-panel": {
    title: "💡 Diagnósticos & Insights",
    component: InsightsPanel,
    className: "col-span-1 lg:col-span-2",
  },
  "portfolio-pro": {
    title: "💰 Portfólio Pro",
    component: PortfolioPro,
    className: "col-span-1",
  },
  "pnl-tracker": {
    title: "📈 Rastreador de P&L",
    component: PnlTracker,
    className: "col-span-1",
  },
  "open-orders": {
    title: "⏳ Ordens Abertas",
    component: OpenOrders,
    className: "col-span-1",
  },
  "risk-module": {
    title: "🛡️ Módulo de Risco",
    component: RiskModule,
    className: "col-span-1",
  },
  "telemetry-panel": {
    title: "⚡ Telemetria & Conectividade",
    component: TelemetryPanel,
    className: "col-span-1",
  },
  "sltp-calculator": {
    title: "🧮 Calculadora SL/TP",
    component: SLTPCalculator,
    className: "col-span-1",
  },
  "portfolio-rebalancing": {
    title: "⚖️ Rebalanceamento de Portfólio",
    component: PortfolioRebalancing,
    className: "col-span-1 lg:col-span-2",
  },
  "fear-greed": {
    title: "📊 Medidor de Sentimento (Fear & Greed)",
    component: FearGreedIndex,
    className: "col-span-1",
  },
  "multi-timeframe": {
    title: "⚡ Análise Multi-Timeframe",
    component: MultiTimeframeAnalysis,
    className: "col-span-1",
  },
  "market-overview": {
    title: "🏛️ Visão Geral de Mercado",
    component: MarketOverview,
    className: "col-span-1 lg:col-span-2",
  },
  "watchlist-alerts": {
    title: "👀 Favoritos e Alertas",
    component: function WatchlistAlertsGroup() {
      return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <Watchlist />
          </div>
          <div>
            <PriceAlerts />
          </div>
        </div>
      );
    },
    className: "col-span-1 lg:col-span-2",
  },
  "market-sentiment-highlights": {
    title: "🔥 Sentimento & Destaques de Mercado",
    component: function MarketSentimentHighlightsGroup() {
      return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MarketSentiment />
          <MarketHighlights />
        </div>
      );
    },
    className: "col-span-1 lg:col-span-2",
  },
  "market-table": {
    title: "📊 Tabela de Mercado",
    component: MarketTable,
    className: "col-span-1 lg:col-span-2",
  },
  "funding-rates": {
    title: "💸 Taxas de Financiamento",
    component: FundingRates,
    className: "col-span-1",
  },
  "correlation-heatmap": {
    title: "🧮 Correlação de Ativos",
    component: CorrelationHeatmap,
    className: "col-span-1 lg:col-span-2",
  },
  "whale-tracker": {
    title: "🐋 Whale Tracker",
    component: WhaleTracker,
    className: "col-span-1",
  },
  "liquidation-heatmap": {
    title: "🔥 Heatmap de Liquidação",
    component: LiquidationHeatmap,
    className: "col-span-1",
  },
  "social-onchain": {
    title: "🌐 Social Sentiment & On-Chain",
    component: function SocialOnChainGroup() {
      return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SocialSentiment />
          <OnChainAnalytics />
        </div>
      );
    },
    className: "col-span-1 lg:col-span-2",
  },
  "ai-signals": {
    title: "🤖 Sinais e Atividade Recente",
    component: function AISignalsGroup() {
      return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <AISignals />
          </div>
          <div>
            <RecentTrades />
          </div>
        </div>
      );
    },
    className: "col-span-1 lg:col-span-2",
  },
  "trading-news": {
    title: "📰 Calculadora & Notícias",
    component: function TradingNewsGroup() {
      return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TradingCalculator />
          <CryptoNews />
        </div>
      );
    },
    className: "col-span-1 lg:col-span-2",
  },
  "strategy-comparison": {
    title: "📊 Comparador de Estratégias",
    component: StrategyComparison,
    className: "col-span-1 lg:col-span-2",
  },
  "ml-pipeline": {
    title: "🧠 Pipeline de Aprendizado de Máquina",
    component: MLPipeline,
    className: "col-span-1 lg:col-span-2",
  },
};

function SortableItem({ id, children, className, visible }: {
  id: string;
  children: React.ReactNode;
  className: string;
  visible: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  };

  if (!visible) return null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${className} relative group transition-all duration-200`}
    >
      {/* Drag handle button overlay */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-3 right-3 z-30 opacity-0 group-hover:opacity-100 p-1.5 rounded bg-secondary/85 border border-border/60 hover:bg-secondary cursor-grab active:cursor-grabbing hover:border-crypto-cyan/40 transition-all duration-200"
        title="Arraste para reordenar"
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground hover:text-crypto-cyan" />
      </div>
      {children}
    </div>
  );
}

export function DashboardGrid() {
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [isClient, setIsClient] = useState(false);

  // Load configuration on client mount
  useEffect(() => {
    setIsClient(true);
    const savedOrder = localStorage.getItem("tradeai_dashboard_order_v3");
    const savedVisibility = localStorage.getItem("tradeai_dashboard_visibility");

    if (savedOrder) {
      try {
        setOrder(JSON.parse(savedOrder));
      } catch (e) {
        setOrder(DEFAULT_ORDER);
      }
    }

    if (savedVisibility) {
      try {
        setVisibility(JSON.parse(savedVisibility));
      } catch (e) {
        const initialVis: Record<string, boolean> = {};
        DEFAULT_ORDER.forEach((id) => (initialVis[id] = true));
        setVisibility(initialVis);
      }
    } else {
      const initialVis: Record<string, boolean> = {};
      DEFAULT_ORDER.forEach((id) => (initialVis[id] = true));
      setVisibility(initialVis);
    }
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // prevent dragging on simple clicks
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = order.indexOf(active.id as string);
      const newIndex = order.indexOf(over.id as string);
      const newOrder = arrayMove(order, oldIndex, newIndex);
      setOrder(newOrder);
      localStorage.setItem("tradeai_dashboard_order_v3", JSON.stringify(newOrder));
    }
  };

  const toggleVisibility = (id: string) => {
    const newVis = { ...visibility, [id]: !visibility[id] };
    setVisibility(newVis);
    localStorage.setItem("tradeai_dashboard_visibility", JSON.stringify(newVis));
  };

  const handleReset = () => {
    setOrder(DEFAULT_ORDER);
    const resetVis: Record<string, boolean> = {};
    DEFAULT_ORDER.forEach((id) => (resetVis[id] = true));
    setVisibility(resetVis);
    localStorage.removeItem("tradeai_dashboard_order_v3");
    localStorage.removeItem("tradeai_dashboard_visibility");
  };

  if (!isClient) return null;

  return (
    <div className="space-y-4">
      {/* Mobile Compact Widgets Grid */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        <MiniPortfolio />
        <MiniPnl />
        <MiniBook />
        <MiniHeatmap />
      </div>

      {/* Configuration Header controls */}
      <div className="flex items-center justify-between bg-secondary/25 border border-border/40 p-3 rounded-xl backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Layout className="w-4 h-4 text-crypto-cyan animate-pulse" />
          <span className="text-xs font-semibold text-foreground">Layout Customizável</span>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs bg-secondary/40 border-border/50 hover:bg-secondary/60 cursor-pointer shadow-sm"
              >
                <Sliders className="w-3.5 h-3.5" />
                Configurar Painel
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[220px] glass-card gradient-border p-1">
              <DropdownMenuLabel className="text-xs font-bold text-foreground">Mostrar/Ocultar Widgets</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border/40" />
              {DEFAULT_ORDER.map((id) => (
                <DropdownMenuCheckboxItem
                  key={id}
                  checked={visibility[id] !== false}
                  onCheckedChange={() => toggleVisibility(id)}
                  className="text-xs py-1.5 px-2 cursor-pointer font-medium"
                >
                  {WIDGETS_CONFIG[id]?.title || id}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator className="bg-border/40" />
              <DropdownMenuCheckboxItem
                onClick={handleReset}
                className="text-xs text-crypto-red focus:text-crypto-red py-1.5 px-2 cursor-pointer font-bold flex items-center gap-1.5 focus:bg-crypto-red/10"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Resetar Padrão
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Sortable Grid Dashboard */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AnimatePresence>
              {order.map((id) => {
                const conf = WIDGETS_CONFIG[id];
                if (!conf) return null;
                const Component = conf.component;

                // Hide large desktop components on mobile if they have compact mobile counterparts
                const hasMiniCounterpart = id === "portfolio-pro" || id === "pnl-tracker" || id === "correlation-heatmap";
                const itemClassName = hasMiniCounterpart
                  ? `${conf.className} hidden md:block`
                  : conf.className;

                return (
                  <SortableItem
                    key={id}
                    id={id}
                    className={itemClassName}
                    visible={visibility[id] !== false}
                  >
                    <Component />
                  </SortableItem>
                );
              })}
            </AnimatePresence>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
