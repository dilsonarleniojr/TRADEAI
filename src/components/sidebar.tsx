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
  { id: "dashboard" as const, icon: LayoutDashboard, label: "Dashboard" },
  {
    id: "chart" as const,
    icon: BarChart3,
    label: "Chart & Analysis",
  },
  { id: "ai" as const, icon: Brain, label: "AI Assistant" },
  { id: "bot" as const, icon: Bot, label: "Trading Bot" },
  { id: "backtest" as const, icon: History, label: "Backtesting" },
  { id: "history" as const, icon: FileText, label: "Trade History" },
];

export function Sidebar() {
  const { activeSection, setActiveSection } = useCryptoStore();

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        initial={{ x: -80 }}
        animate={{ x: 0 }}
        className="hidden md:flex flex-col items-center w-16 min-w-16 bg-card border-r border-border py-4 gap-1"
      >
        {/* Logo */}
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-crypto-cyan to-crypto-green flex items-center justify-center mb-6">
          <span className="text-white font-bold text-sm">IA</span>
        </div>

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
                      "relative w-11 h-11 rounded-lg flex items-center justify-center transition-all duration-200",
                      "hover:bg-accent hover:text-accent-foreground",
                      isActive
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active"
                        className="absolute left-0 w-0.5 h-6 bg-primary rounded-r-full"
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    )}
                    <item.icon className="w-5 h-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  <p>{item.label}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Bottom indicator */}
        <div className="mt-auto">
          <div className="w-2 h-2 rounded-full bg-crypto-green animate-pulse" />
        </div>
      </motion.aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex items-center justify-around py-2 px-1">
        {navItems.slice(0, 5).map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              <span className="text-[10px]">{item.label.split(" ")[0]}</span>
            </button>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}
