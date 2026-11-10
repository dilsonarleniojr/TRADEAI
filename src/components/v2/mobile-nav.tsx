"use client";

import React from "react";
import { useCryptoStore } from "@/lib/store";
import {
  Home,
  TrendingUp,
  Bot,
  Briefcase,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";
import type { V2NavigationArea } from "./top-nav";

export function MobileNavBar() {
  const { activeSection, setActiveSection } = useCryptoStore(
    useShallow((s) => ({
      activeSection: s.activeSection,
      setActiveSection: s.setActiveSection,
    }))
  );

  const getActiveArea = (): V2NavigationArea => {
    switch (activeSection) {
      case "dashboard":
        return "inicio";
      case "chart":
      case "trade-hub":
      case "ai":
        return "mercado";
      case "bot":
      case "institutional":
        return "robos";
      case "history":
      case "journal":
        return "carteira";
      case "education":
      case "backtest":
        return "aprender";
      default:
        return "inicio";
    }
  };

  const currentArea = getActiveArea();

  const navItems = [
    { id: "inicio" as V2NavigationArea, label: "Início", icon: Home, section: "dashboard" as const },
    { id: "mercado" as V2NavigationArea, label: "Mercado", icon: TrendingUp, section: "chart" as const },
    { id: "robos" as V2NavigationArea, label: "Robôs", icon: Bot, section: "bot" as const },
    { id: "carteira" as V2NavigationArea, label: "Carteira", icon: Briefcase, section: "history" as const },
    { id: "aprender" as V2NavigationArea, label: "Aprender", icon: GraduationCap, section: "education" as const },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF]/95 dark:bg-[#0f1622]/95 backdrop-blur-md border-t border-[#E7EBF0] dark:border-white/10 px-2 py-1 safe-area-bottom">
      <div className="flex items-center justify-around h-14 max-w-[420px] mx-auto">
        {navItems.map((item) => {
          const isActive = currentArea === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.section)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 py-1 min-h-[44px] transition-colors rounded-xl select-none",
                isActive
                  ? "text-[#0E1B2C] dark:text-[#5BE3A8] font-semibold"
                  : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C]"
              )}
            >
              <Icon className={cn("w-5 h-5", isActive ? "stroke-[2.2px]" : "stroke-[1.8px]")} />
              <span className="text-[11px] font-instrument-sans tracking-tight mt-0.5">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

