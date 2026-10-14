"use client";

import { useEffect } from "react";
import { useCryptoStore } from "@/lib/store";
import { useTheme } from "next-themes";
import { useShallow } from "zustand/react/shallow";

import type { ActiveSection } from "@/lib/store/types";

const SECTION_MAP: Record<string, ActiveSection> = {
  "1": "dashboard",
  "2": "chart",
  "3": "bot",
  "4": "ai",
  "5": "history",
  "6": "backtest",
  "7": "trade-hub",
  "8": "institutional",
  "9": "education",
};

const SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT",
  "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT",
  "DOTUSDT", "LINKUSDT", "MATICUSDT", "ATOMUSDT",
];

export function useKeyboardShortcuts() {
  const {
    setActiveSection,
    setBotActive,
    botActive,
    setSelectedSymbol,
    selectedSymbol,
    tradingMode,
    setTradingMode,
    setIsCommandSearchOpen,
  } = useCryptoStore(
    useShallow((s) => ({
      setActiveSection: s.setActiveSection,
      setBotActive: s.setBotActive,
      botActive: s.botActive,
      setSelectedSymbol: s.setSelectedSymbol,
      selectedSymbol: s.selectedSymbol,
      tradingMode: s.tradingMode,
      setTradingMode: s.setTradingMode,
      setIsCommandSearchOpen: s.setIsCommandSearchOpen,
    }))
  );
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Global Command Search: Ctrl+K / Cmd+K
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setIsCommandSearchOpen(true);
        return;
      }

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
        const nextMode = current === "paper" ? "live" : "paper";
        setTradingMode(nextMode);
        Promise.all([
          fetch(`/api/account?mode=${nextMode}`),
          fetch(`/api/trades?mode=${nextMode}`),
        ])
          .then(async ([accRes, tradesRes]) => {
            const accData = await accRes.json();
            const tradesData = await tradesRes.json();
            if (accData.success && accData.data) useCryptoStore.getState().setAccount(accData.data);
            if (tradesData.success && Array.isArray(tradesData.data)) useCryptoStore.getState().setTrades(tradesData.data);
          })
          .catch(() => {});
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
