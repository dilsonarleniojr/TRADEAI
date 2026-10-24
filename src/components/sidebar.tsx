"use client";

import { useState, useEffect } from "react";
import { useCryptoStore } from "@/lib/store";
import {
  LayoutDashboard,
  BarChart3,
  Brain,
  Bot,
  History,
  BookOpen,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Sparkles,
  LineChart,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import Link from "next/link";

// Desktop items with descriptive labels, subtitles and shortcut indicators
const desktopNavItems = [
  { id: "dashboard" as const, icon: LayoutDashboard, label: "Painel Principal", desc: "Visão geral e mercado", shortcut: "1" },
  { id: "institutional" as const, icon: Gauge, label: "Cockpit Institucional", desc: "PnL Real-Time, OFI & IA", shortcut: "8" },
  { id: "journal" as const, icon: LineChart, label: "Diário & Analytics", desc: "MAE/MFE, Telegram & Order Flow", shortcut: "0" },
  { id: "chart" as const, icon: BarChart3, label: "Gráfico & Trading", desc: "Candles e livro de ofertas", shortcut: "2" },
  { id: "bot" as const, icon: Bot, label: "Robôs de Lucro", desc: "Automação simultânea", shortcut: "3" },
  { id: "trade-hub" as const, icon: Sparkles, label: "Estúdio Quant & IA", desc: "7 Módulos de Inteligência", shortcut: "9" },
  { id: "ai" as const, icon: Brain, label: "Assistente IA", desc: "Análise e previsões", shortcut: "4" },
  { id: "history" as const, icon: History, label: "Histórico & Ordens", desc: "Operações e relatórios", shortcut: "5" },
  { id: "backtest" as const, icon: SlidersHorizontal, label: "Backtesting", desc: "Simulação de estratégias", shortcut: "6" },
  { id: "education" as const, icon: BookOpen, label: "Academia Cripto", desc: "Guias e tutoriais", shortcut: "7" },
];

// Mobile: 7 core items
const mobileNavItems = [
  { id: "dashboard" as const, icon: LayoutDashboard, label: "Painel" },
  { id: "journal" as const, icon: LineChart, label: "Diário" },
  { id: "chart" as const, icon: BarChart3, label: "Gráfico" },
  { id: "trade-hub" as const, icon: Sparkles, label: "Estúdio" },
  { id: "bot" as const, icon: Bot, label: "Robôs" },
  { id: "ai" as const, icon: Brain, label: "IA" },
  { id: "history" as const, icon: History, label: "Histórico" },
];

export function Sidebar() {
  const { activeSection, setActiveSection, alerts, tradingMode, binanceConnected, binanceTestnet, connectionStatus } = useCryptoStore(
  useShallow((s) => ({ activeSection: s.activeSection, setActiveSection: s.setActiveSection, alerts: s.alerts, tradingMode: s.tradingMode, binanceConnected: s.binanceConnected, binanceTestnet: s.binanceTestnet, connectionStatus: s.connectionStatus }))
);
  const [isExpanded, setIsExpanded] = useState(false);

  // Restore sidebar state from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("tradeai_sidebar_expanded");
      if (saved !== null) {
        setIsExpanded(saved === "true");
      }
    }
  }, []);

  const toggleExpand = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      localStorage.setItem("tradeai_sidebar_expanded", String(next));
      return next;
    });
  };

  const triggeredCount = alerts.filter((a) => a.isTriggered).length;

  // Status real da conexão
  const binanceStatus =
    tradingMode === "live" && binanceConnected
      ? { label: binanceTestnet ? "Binance Testnet" : "Binance Spot Live", dot: binanceTestnet ? "bg-crypto-gold" : "bg-crypto-green", ping: "24ms" }
      : connectionStatus === "disconnected"
        ? { label: "Offline", dot: "bg-crypto-red", ping: "--" }
        : connectionStatus === "connecting"
          ? { label: "Conectando...", dot: "bg-crypto-gold", ping: "..." }
          : { label: "Modo Simulado", dot: "bg-crypto-cyan", ping: "Local" };

  return (
    <TooltipProvider delayDuration={150}>
      {/* Desktop Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: isExpanded ? 230 : 64 }}
        transition={{ duration: 0.22, ease: "easeInOut" }}
        className={cn(
          "hidden md:flex flex-col bg-[#090d14] border-r border-white/[0.07] py-3 relative z-30 select-none overflow-hidden",
          isExpanded ? "px-3 items-stretch" : "items-center px-2"
        )}
      >
        {/* Header / Logo */}
        <div className={cn("flex items-center gap-2 mb-3.5", isExpanded ? "px-1 justify-between" : "justify-center")}>
          <div
            onClick={() => setActiveSection("dashboard")}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 via-teal-500 to-emerald-500 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform shrink-0 ring-1 ring-white/10">
              <span className="text-white font-black text-[11px] tracking-wider font-mono">AI</span>
            </div>
            {isExpanded && (
              <div className="flex flex-col truncate">
                <span className="text-xs font-bold text-slate-100 tracking-tight leading-tight flex items-center gap-1.5">
                  TRADEAI
                  <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-semibold font-mono">PRO</span>
                </span>
                <span className="text-[9px] text-slate-400 uppercase font-medium">Terminal V3.8</span>
              </div>
            )}
          </div>

          {/* Toggle expand/collapse button */}
          <button
            onClick={toggleExpand}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
            title={isExpanded ? "Recolher menu lateral" : "Expandir menu lateral"}
            aria-label={isExpanded ? "Recolher menu" : "Expandir menu"}
          >
            {isExpanded ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Separator */}
        <div className="w-full h-px bg-white/[0.07] mb-2.5" />

        {/* Nav Items */}
        <nav className="flex flex-col gap-1 flex-1">
          {desktopNavItems.map((item) => {
            const isActive = activeSection === item.id;

            const buttonContent = (
              <button
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "relative rounded-lg flex items-center transition-all duration-150 text-left w-full group cursor-pointer",
                  isExpanded ? "px-2.5 py-2 gap-2.5" : "w-10 h-10 justify-center mx-auto",
                  isActive
                    ? "bg-cyan-500/15 text-cyan-400 font-semibold border border-cyan-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                )}
              >
                <item.icon className={cn("w-4 h-4 shrink-0 transition-transform group-hover:scale-105", isActive ? "text-cyan-400" : "text-slate-400")} />

                {isExpanded && (
                  <div className="flex flex-col min-w-0 leading-tight flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate">{item.label}</span>
                      <span className="text-[9px] font-mono text-slate-400 bg-white/[0.04] px-1 rounded border border-white/[0.06]">[{item.shortcut}]</span>
                    </div>
                    <span className="text-[9px] text-slate-500 truncate">{item.desc}</span>
                  </div>
                )}

                {item.id === "history" && triggeredCount > 0 && (
                  <span className={cn("flex h-1.5 w-1.5 rounded-full bg-rose-500", isExpanded ? "ml-auto" : "absolute top-1.5 right-1.5")} />
                )}
              </button>
            );

            if (isExpanded) {
              return <div key={item.id}>{buttonContent}</div>;
            }

            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={12} className="glass border-border/60 py-1.5 px-2.5">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-foreground">{item.label}</span>
                      <span className="text-[9px] font-mono text-crypto-cyan bg-crypto-cyan/10 px-1 rounded border border-crypto-cyan/20">[{item.shortcut}]</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{item.desc}</span>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Smart Trading Suite Quick Access */}
        <div className="my-2">
          <Link
            href="/smart-trading"
            className={cn(
              "flex items-center gap-2 rounded-xl p-2 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 hover:border-blue-400 text-blue-400 transition-all group shadow-sm",
              isExpanded ? "justify-between" : "justify-center w-10 h-10 mx-auto"
            )}
            title="Abrir Smart Trading UI (Nova Interface Fintech com IA)"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform shrink-0" />
              {isExpanded && (
                <div className="flex flex-col text-left leading-tight">
                  <span className="text-xs font-bold text-white tracking-wide">Smart Trading</span>
                  <span className="text-[9px] text-blue-300">Nova UI Fintech & IA</span>
                </div>
              )}
            </div>
            {isExpanded && (
              <span className="text-[9px] font-mono font-bold bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/30">
                NOVO
              </span>
            )}
          </Link>
        </div>

        {/* Bottom system status */}
        <div className={cn("mt-auto pt-2.5 border-t border-white/[0.07] flex items-center gap-2", isExpanded ? "px-1 justify-between" : "justify-center")}>
          <div className="flex items-center gap-2">
            <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", binanceStatus.dot)} role="img" aria-label={binanceStatus.label} title={binanceStatus.label} />
            {isExpanded && (
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-300 font-medium leading-none">{binanceStatus.label}</span>
                <span className="text-[9px] text-slate-500 font-mono mt-0.5">{binanceStatus.ping}</span>
              </div>
            )}
          </div>
          {isExpanded && (
            <button
              onClick={toggleExpand}
              className="text-[10px] text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
              title="Recolher"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </motion.aside>

      {/* Mobile Bottom Nav */}
      <nav aria-label="Navegação principal" className="md:hidden fixed bottom-0 left-0 right-0 z-50 safe-bottom">
        <div className="h-px bg-white/[0.08]" />
        <div className="bg-[#090d14]/95 backdrop-blur-2xl py-1 px-1 pb-3 shadow-2xl">
          <div className="flex items-center justify-around">
            {mobileNavItems.map((item) => {
              const isActive = activeSection === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  className="relative flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all select-none min-w-[56px] min-h-[48px] focus-visible:outline-2 focus-visible:outline-cyan-400 cursor-pointer"
                >
                  {item.id === "history" && triggeredCount > 0 && (
                    <span className="absolute top-1.5 right-3 z-10 h-1.5 w-1.5 rounded-full bg-rose-500" aria-label="Alertas disparados" />
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="mobile-nav-pill"
                      className="absolute inset-0 bg-cyan-500/15 rounded-xl border border-cyan-500/30"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <item.icon
                    className={cn(
                      "relative z-10 transition-all",
                      isActive ? "w-5 h-5 text-cyan-400 scale-110" : "w-4 h-4 text-slate-400"
                    )}
                  />
                  <span
                    className={cn(
                      "relative z-10 mt-1 transition-all",
                      isActive ? "text-[11px] font-bold text-cyan-400" : "text-[10px] text-slate-400"
                    )}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </TooltipProvider>
  );
}
