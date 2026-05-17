"use client";

import { useCryptoStore } from "@/lib/store";
import {
  LayoutDashboard,
  BarChart3,
  Brain,
  Bot,
  History,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

// Desktop: all 6 items including backtest
const desktopNavItems = [
  { id: "dashboard" as const, icon: LayoutDashboard, label: "Painel" },
  { id: "chart" as const, icon: BarChart3, label: "Gráfico & Análise" },
  { id: "ai" as const, icon: Brain, label: "Assistente IA" },
  { id: "bot" as const, icon: Bot, label: "Robô de Trading" },
  { id: "backtest" as const, icon: History, label: "Backtesting" },
  { id: "history" as const, icon: History, label: "Histórico" },
];

// Mobile: 5 items (combined backtest + history into "Histórico")
const mobileNavItems = [
  { id: "dashboard" as const, icon: LayoutDashboard, label: "Painel" },
  { id: "chart" as const, icon: BarChart3, label: "Gráfico" },
  { id: "ai" as const, icon: Brain, label: "IA" },
  { id: "bot" as const, icon: Bot, label: "Bot" },
  { id: "history" as const, icon: History, label: "Histórico" },
];

export function Sidebar() {
  const { activeSection, setActiveSection } = useCryptoStore();

  return (
    <TooltipProvider delayDuration={0}>
      {/* Desktop Sidebar */}
      <motion.aside
        initial={{ x: -80 }}
        animate={{ x: 0 }}
        className="hidden md:flex flex-col items-center w-16 min-w-16 glass border-r border-border/50 py-4 gap-1 relative"
      >
        {/* Logo with subtle animation */}
        <motion.div
          whileHover={{ scale: 1.08, rotate: 2 }}
          whileTap={{ scale: 0.95 }}
          className="w-10 h-10 rounded-lg bg-gradient-to-br from-crypto-cyan to-crypto-green flex items-center justify-center mb-2 shadow-[0_0_16px_oklch(0.75_0.15_195/20%)] cursor-pointer"
        >
          <span className="text-white font-bold text-sm">IA</span>
        </motion.div>

        {/* Gradient line separator */}
        <div className="w-8 h-px bg-gradient-to-r from-transparent via-crypto-cyan/40 to-transparent mb-4" />

        {/* Nav Items */}
        <nav className="flex flex-col gap-1 flex-1">
          {desktopNavItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setActiveSection(item.id)}
                    className={cn(
                      "relative w-11 h-11 rounded-lg flex items-center justify-center transition-all duration-300",
                      "hover:bg-accent hover:text-accent-foreground hover:scale-105",
                      isActive
                        ? "bg-primary/15 text-primary glow-cyan-sm border-l-2 border-crypto-cyan"
                        : "text-muted-foreground"
                    )}
                  >
                    {/* Active background glow */}
                    {isActive && (
                      <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/10 to-transparent" />
                    )}
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active"
                        className="absolute w-2 h-2 rounded-full bg-primary left-1.5 glow-cyan-sm"
                        style={{ boxShadow: "0 0 8px #06b6d4" }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    )}
                    <item.icon className="w-5 h-5 relative z-10" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  <p>{item.label}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Bottom indicator with glow */}
        <div className="mt-auto">
          <div className="w-2 h-2 rounded-full bg-crypto-green animate-pulse shadow-[0_0_8px_#22c55e]" />
        </div>
      </motion.aside>

      {/* Mobile Bottom Nav - Modern redesign with pill indicator */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 safe-bottom">
        {/* Gradient top border line */}
        <div className="h-px bg-gradient-to-r from-crypto-cyan/30 via-transparent to-crypto-cyan/30" />

        <div className="glass backdrop-blur-xl py-2 px-2">
          <div className="flex items-center justify-around">
            {mobileNavItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    "relative flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all duration-200 touch-target",
                  )}
                >
                  {/* Active pill background with layout animation */}
                  {isActive && (
                    <motion.div
                      layoutId="mobile-nav-pill"
                      className="absolute inset-0 bg-crypto-cyan/15 rounded-full"
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                      }}
                    />
                  )}

                  {/* Icon */}
                  <motion.div
                    whileTap={{ scale: 0.85 }}
                    transition={{ duration: 0.1 }}
                  >
                    <item.icon
                      className={cn(
                        "relative z-10 transition-all duration-200",
                        isActive
                          ? "w-5 h-5 text-crypto-cyan scale-110"
                          : "w-4.5 h-4.5 text-muted-foreground"
                      )}
                      style={{
                        transform: isActive ? "scale(1.1)" : "scale(1)",
                      }}
                    />
                  </motion.div>

                  {/* Label */}
                  <span
                    className={cn(
                      "relative z-10 leading-tight mt-0.5 transition-all duration-200",
                      isActive
                        ? "text-[10px] font-medium text-crypto-cyan"
                        : "text-[9px] text-muted-foreground"
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
