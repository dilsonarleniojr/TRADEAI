"use client";

import React from "react";
import { useCryptoStore } from "@/lib/store";
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
    { id: "inicio" as V2NavigationArea, label: "Início", section: "dashboard" as const },
    { id: "mercado" as V2NavigationArea, label: "Mercado", section: "chart" as const },
    { id: "robos" as V2NavigationArea, label: "Robôs", section: "bot" as const },
    { id: "carteira" as V2NavigationArea, label: "Carteira", section: "history" as const },
    { id: "aprender" as V2NavigationArea, label: "Mais", section: "education" as const },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF] dark:bg-[#0f1622] border-t border-[#E7EBF0] dark:border-white/10 safe-area-bottom">
      <div className="flex items-center justify-around h-14 max-w-[420px] mx-auto">
        {navItems.map((item) => {
          const isActive = currentArea === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.section)}
              className={cn(
                "relative flex items-center justify-center flex-1 h-full font-instrument-sans text-[13px] transition-colors select-none",
                isActive
                  ? "text-[#0E1B2C] dark:text-white font-bold"
                  : "text-[#4A586A] dark:text-[#94a3b8]"
              )}
            >
              {isActive && (
                <span className="absolute top-0 left-6 right-6 h-[3px] bg-[#0E1B2C] dark:bg-white rounded-full" />
              )}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
