"use client";

import { useCryptoStore } from "@/lib/store";
import {
  LayoutDashboard,
  BarChart3,
  Brain,
  Bot,
  History,
  FileText,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const navItems = [
  { id: "dashboard" as const, icon: LayoutDashboard, label: "Dashboard", shortLabel: "Home" },
  { id: "chart" as const, icon: BarChart3, label: "Chart & Analysis", shortLabel: "Chart" },
  { id: "ai" as const, icon: Brain, label: "AI Assistant", shortLabel: "AI" },
  { id: "bot" as const, icon: Bot, label: "Trading Bot", shortLabel: "Bot" },
  { id: "backtest" as const, icon: History, label: "Backtesting", shortLabel: "Test" },
  { id: "history" as const, icon: FileText, label: "Trade History", shortLabel: "History" },
];

export function Sidebar() {
  const { activeSection, setActiveSection } = useCryptoStore();

  return (
    <TooltipProvider delayDuration={0}>
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
          {navItems.map((item) => {
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

      {/* Mobile bottom nav - shows all 6 items with safe area + backdrop blur */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-border/50 flex items-center justify-around py-1.5 px-1 safe-bottom">
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg transition-all duration-200 min-w-0 touch-target",
                isActive
                  ? "text-primary scale-105"
                  : "text-muted-foreground"
              )}
            >
              <div className="relative">
                {isActive && (
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary shadow-[0_0_6px_#06b6d4]" />
                )}
                <item.icon className="w-4 h-4" />
              </div>
              <span className="text-[9px] leading-tight">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}
