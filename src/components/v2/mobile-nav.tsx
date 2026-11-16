"use client";

import React from "react";
import { useCryptoStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";
import type { V2NavigationArea } from "./top-nav";
import {
  LayoutDashboard,
  CandlestickChart,
  Bot,
  Wallet,
  GraduationCap,
} from "lucide-react";

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
    {
      id: "inicio" as V2NavigationArea,
      label: "Início",
      section: "dashboard" as const,
      icon: LayoutDashboard,
    },
    {
      id: "mercado" as V2NavigationArea,
      label: "Mercado",
      section: "chart" as const,
      icon: CandlestickChart,
    },
    {
      id: "robos" as V2NavigationArea,
      label: "Robôs",
      section: "bot" as const,
      icon: Bot,
    },
    {
      id: "carteira" as V2NavigationArea,
      label: "Carteira",
      section: "history" as const,
      icon: Wallet,
    },
    {
      id: "aprender" as V2NavigationArea,
      label: "Aprender",
      section: "education" as const,
      icon: GraduationCap,
    },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0f1622]/95 backdrop-blur-md border-t border-[#E7EBF0] dark:border-white/10 safe-bottom">
      <div className="flex items-center justify-around h-16 max-w-[480px] mx-auto px-1">
        {navItems.map((item) => {
          const isActive = currentArea === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.section)}
              className={cn(
                "relative flex flex-col items-center justify-center flex-1 h-full font-instrument-sans select-none transition-all py-1 min-h-[48px]",
                isActive
                  ? "text-[#0E1B2C] dark:text-[#5BE3A8] font-bold"
                  : "text-[#64748B] dark:text-[#94a3b8] hover:text-[#0E1B2C] dark:hover:text-white"
              )}
            >
              {isActive && (
                <span className="absolute top-0 w-8 h-[3px] bg-[#0E1B2C] dark:bg-[#5BE3A8] rounded-full" />
              )}
              <Icon
                className={cn(
                  "w-5 h-5 mb-0.5 transition-transform",
                  isActive ? "scale-110" : "scale-100 opacity-80"
                )}
              />
              <span className="text-[11px] leading-tight tracking-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
