"use client";

import { useEffect } from "react";
import { useCryptoStore } from "@/lib/store";
import { useTheme } from "next-themes";

type SectionKey = "dashboard" | "chart" | "ai" | "bot" | "backtest" | "history";

const SECTION_MAP: Record<string, SectionKey> = {
  "1": "dashboard",
  "2": "chart",
  "3": "ai",
  "4": "bot",
  "5": "backtest",
  "6": "history",
};

const SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT",
  "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT",
  "DOTUSDT", "LINKUSDT", "MATICUSDT", "ATOMUSDT",
];

export function useKeyboardShortcuts() {
  const { setActiveSection, setBotActive, botActive, setSelectedSymbol, selectedSymbol, tradingMode, setTradingMode } = useCryptoStore();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      // Section navigation: 1-6
      if (SECTION_MAP[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setActiveSection(SECTION_MAP[e.key]);
        return;
      }

      // B: Toggle simultaneous bots fleet
      if (e.key === "b" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const state = useCryptoStore.getState();
        state.toggleAllBots(!state.botActive);
        return;
      }

      // T: Toggle theme
      if (e.key === "t" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setTheme(theme === "dark" ? "light" : "dark");
        return;
      }

      // M: Toggle trading mode
      if (e.key === "m" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const current = useCryptoStore.getState().tradingMode;
        setTradingMode(current === "paper" ? "live" : "paper");
        return;
      }

      // S: Cycle symbols
      if (e.key === "s" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const currentSymbol = useCryptoStore.getState().selectedSymbol;
        const idx = SYMBOLS.indexOf(currentSymbol);
        const nextIdx = (idx + 1) % SYMBOLS.length;
        setSelectedSymbol(SYMBOLS[nextIdx]);
        return;
      }

      // ?: Show shortcuts help (future - could trigger a modal)
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        // Could open a shortcuts modal in the future
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveSection, setBotActive, setSelectedSymbol, setTradingMode, theme, setTheme]);
}
