"use client";

import { useCryptoStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import {
  ChevronRight,
  LayoutDashboard,
  LineChart,
  Bot,
  Brain,
  History,
  TrendingUp,
  GraduationCap,
  Sparkles,
  Command,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveSection } from "@/lib/store/types";

interface SectionMeta {
  title: string;
  category: string;
  icon: typeof LayoutDashboard;
}

const SECTION_METAS: Record<ActiveSection, SectionMeta> = {
  dashboard: {
    title: "Painel Principal",
    category: "Visão Geral",
    icon: LayoutDashboard,
  },
  institutional: {
    title: "Cockpit L2 Institucional",
    category: "Análise Profunda",
    icon: TrendingUp,
  },
  chart: {
    title: "Gráfico & TradingView",
    category: "Análise Técnica",
    icon: LineChart,
  },
  bot: {
    title: "Robôs de Lucro (Grid & IA)",
    category: "Automação",
    icon: Bot,
  },
  "trade-hub": {
    title: "Estúdio Quant",
    category: "Ferramentas",
    icon: Sparkles,
  },
  ai: {
    title: "TradeAI Copilot",
    category: "Inteligência Artificial",
    icon: Brain,
  },
  history: {
    title: "Histórico de Ordens",
    category: "Auditoria",
    icon: History,
  },
  backtest: {
    title: "Backtesting & Estratégias",
    category: "Simulação",
    icon: History,
  },
  education: {
    title: "Central Educacional",
    category: "Conhecimento",
    icon: GraduationCap,
  },
  journal: {
    title: "Diário de Trades & Analytics",
    category: "Pós-Operação & Risco",
    icon: LineChart,
  },
};

const TRADE_HUB_TAB_NAMES: Record<string, string> = {
  overview: "Visão Geral",
  ideas: "Ideias de Trade",
  scanner: "Scanner de Mercado",
  analyst: "Analista Técnico IA",
  whale: "Rastreador de Baleias",
  divergence: "Divergências RSI",
  news: "Notícias & Sentimento",
};

export function NavigationBreadcrumb() {
  const {
    activeSection,
    setActiveSection,
    selectedSymbol,
    tradeHubActiveTab,
    setIsCommandSearchOpen,
    activeBotsCount,
  } = useCryptoStore(
    useShallow((s) => ({
      activeSection: s.activeSection,
      setActiveSection: s.setActiveSection,
      selectedSymbol: s.selectedSymbol,
      tradeHubActiveTab: s.tradeHubActiveTab,
      setIsCommandSearchOpen: s.setIsCommandSearchOpen,
      activeBotsCount: s.bots.filter((b) => b.active).length,
    }))
  );

  const meta = SECTION_METAS[activeSection] || SECTION_METAS.dashboard;
  const Icon = meta.icon;

  return (
    <nav
      aria-label="Trilha de navegação"
      className="flex items-center justify-between mb-3 px-3 py-1.5 rounded-lg bg-card/40 border border-white/[0.05] backdrop-blur-sm text-xs text-muted-foreground shadow-sm"
    >
      {/* Left: Interactive breadcrumbs */}
      <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar font-medium">
        <button
          onClick={() => setActiveSection("dashboard")}
          className="flex items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer shrink-0"
        >
          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            TRADEAI
          </span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

        <button
          onClick={() => setActiveSection(activeSection)}
          className={cn(
            "flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-colors cursor-pointer shrink-0",
            "hover:bg-white/[0.04] text-slate-300 hover:text-white"
          )}
        >
          <Icon className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold text-slate-200">{meta.title}</span>
        </button>

        {/* Sub-context depending on active section */}
        {activeSection === "chart" && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <span className="font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 shrink-0">
              {selectedSymbol}
            </span>
          </>
        )}

        {activeSection === "trade-hub" && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <span className="font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0">
              {TRADE_HUB_TAB_NAMES[tradeHubActiveTab] || "Ferramentas Quant"}
            </span>
          </>
        )}

        {activeSection === "bot" && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <span className="text-[11px] font-mono text-slate-400 shrink-0">
              {activeBotsCount} {activeBotsCount === 1 ? "robô ativo" : "robôs ativos"}
            </span>
          </>
        )}
      </div>

      {/* Right: Quick shortcut prompt to open command search */}
      <button
        onClick={() => setIsCommandSearchOpen(true)}
        className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-400 hover:text-slate-200 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] transition-all cursor-pointer shrink-0 ml-2"
        title="Pressione Ctrl+K para buscar rapidamente qualquer recurso ou ativo"
      >
        <Search className="w-3 h-3 text-cyan-400" />
        <span className="text-slate-300">Ir para...</span>
        <kbd className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-black/40 border border-white/10 font-mono text-[9px] text-slate-400">
          <Command className="w-2.5 h-2.5" /> K
        </kbd>
      </button>
    </nav>
  );
}
