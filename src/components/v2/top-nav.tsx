"use client";

import React, { useState } from "react";
import { useCryptoStore } from "@/lib/store";
import { useTheme } from "next-themes";
import {
  Search,
  Moon,
  Sun,
  Settings,
  Wifi,
  Sparkles,
  Shield,
  Layers,
  ChevronDown,
  KeyRound,
  Brain,
  Sliders,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SystemStatusPopover } from "@/components/header/system-status-popover";
import { GlobalCommandSearch } from "@/components/header/global-command-search";
import { ApiSettingsDialog } from "@/components/header/api-settings-dialog";
import { AiSettingsDialog } from "@/components/header/ai-settings-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useShallow } from "zustand/react/shallow";
import type { ActiveSection } from "@/lib/store/types";

// As 5 áreas canônicas do TradeAI V2
export type V2NavigationArea = "inicio" | "mercado" | "robos" | "carteira" | "aprender";

export function TopNav() {
  const {
    activeSection,
    setActiveSection,
    tradingMode,
    setTradingMode,
    connectionStatus,
    setIsCommandSearchOpen,
    openApiSettingsModal,
    setOpenApiSettingsModal,
    openAiSettingsModal,
    setOpenAiSettingsModal,
    proMode,
    toggleProMode,
  } = useCryptoStore(
    useShallow((s) => ({
      activeSection: s.activeSection,
      setActiveSection: s.setActiveSection,
      tradingMode: s.tradingMode,
      setTradingMode: s.setTradingMode,
      connectionStatus: s.connectionStatus,
      setIsCommandSearchOpen: s.setIsCommandSearchOpen,
      openApiSettingsModal: s.openApiSettingsModal,
      setOpenApiSettingsModal: s.setOpenApiSettingsModal,
      openAiSettingsModal: s.openAiSettingsModal,
      setOpenAiSettingsModal: s.setOpenAiSettingsModal,
      proMode: s.proMode,
      toggleProMode: s.toggleProMode,
    }))
  );

  const { theme, setTheme } = useTheme();

  // Mapeamento entre activeSection do store e as 5 abas da TopNav
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

  const handleSelectArea = (area: V2NavigationArea) => {
    switch (area) {
      case "inicio":
        setActiveSection("dashboard");
        break;
      case "mercado":
        setActiveSection("chart");
        break;
      case "robos":
        setActiveSection("bot");
        break;
      case "carteira":
        setActiveSection("history");
        break;
      case "aprender":
        setActiveSection("education");
        break;
    }
  };

  const navItems: { id: V2NavigationArea; label: string; shortcut: string }[] = [
    { id: "inicio", label: "Início", shortcut: "1" },
    { id: "mercado", label: "Mercado", shortcut: "2" },
    { id: "robos", label: "Robôs", shortcut: "3" },
    { id: "carteira", label: "Carteira", shortcut: "5" },
    { id: "aprender", label: "Aprender", shortcut: "9" },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-[#FFFFFF]/90 dark:bg-[#0f1622]/90 backdrop-blur-md border-b border-[#E7EBF0] dark:border-white/10 transition-colors">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          {/* Esquerda: Logo + Status da Conexão */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            <button
              onClick={() => setActiveSection("dashboard")}
              className="flex items-center space-x-2 text-left focus:outline-none group"
            >
              <div className="w-8 h-8 rounded-full bg-[#0E1B2C] dark:bg-[#5BE3A8] text-white dark:text-[#0E1B2C] flex items-center justify-center font-instrument-serif text-lg font-bold shadow-sm">
                T
              </div>
              <div className="flex flex-col">
                <span className="font-instrument-serif text-[22px] tracking-tight leading-none text-[#0E1B2C] dark:text-[#f8fafc]">
                  TradeAI
                </span>
              </div>
            </button>

            {/* Status discreto da Binance / Simulação */}
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#EEF1F5] dark:bg-white/5 border border-[#E7EBF0] dark:border-white/10 text-[12px] font-instrument-sans font-medium text-[#4A586A] dark:text-[#94a3b8]">
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  connectionStatus === "connected"
                    ? "bg-[#0B8F6A] shadow-[0_0_6px_#0B8F6A]"
                    : "bg-amber-400"
                )}
              />
              <span>
                {connectionStatus === "connected" ? "Binance ao vivo" : "Conectando"}
              </span>
            </div>
          </div>

          {/* Centro: 5 Abas de Navegação (Desktop) */}
          <nav
            role="tablist"
            className="hidden md:flex items-center p-1 bg-[#EEF1F5] dark:bg-[#162032] rounded-full border border-[#E7EBF0] dark:border-white/10"
          >
            {navItems.map((item) => {
              const isActive = currentArea === item.id;
              return (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleSelectArea(item.id)}
                  className={cn(
                    "px-4 py-1.5 rounded-full font-instrument-sans text-[14px] font-medium transition-all duration-150 select-none flex items-center space-x-1",
                    isActive
                      ? "bg-[#FFFFFF] dark:bg-[#0f1622] text-[#0E1B2C] dark:text-[#f8fafc] shadow-[0_1px_2px_rgba(14,27,44,0.08)] font-semibold"
                      : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C] dark:hover:text-[#FFFFFF]"
                  )}
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] opacity-40 font-mono ml-0.5">
                    {item.shortcut}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Direita: Ações, Simulado/Real, Telemetria, Configurações */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Busca Rápida (Ctrl+K) */}
            <button
              onClick={() => setIsCommandSearchOpen(true)}
              className="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-[#EEF1F5] dark:bg-white/5 border border-[#E7EBF0] dark:border-white/10 text-[13px] text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C] transition-colors"
              title="Busca rápida e comandos (Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Buscar...</span>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-white/10 rounded border border-[#D3DAE3] dark:border-white/20">
                ⌘K
              </kbd>
            </button>

            {/* Alternador Simulado / Real */}
            <div className="inline-flex p-0.5 bg-[#E4E8ED] dark:bg-[#162032] rounded-full border border-[#D3DAE3]/50 dark:border-white/10">
              <button
                onClick={() => setTradingMode("paper")}
                className={cn(
                  "px-2.5 py-1 text-[12px] font-instrument-sans font-medium rounded-full transition-all",
                  tradingMode === "paper"
                    ? "bg-[#FFFFFF] dark:bg-[#0f1622] text-[#0E1B2C] dark:text-white shadow-sm font-semibold"
                    : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C]"
                )}
              >
                Simulado
              </button>
              <button
                onClick={() => setTradingMode("real")}
                className={cn(
                  "px-2.5 py-1 text-[12px] font-instrument-sans font-medium rounded-full transition-all",
                  tradingMode === "real"
                    ? "bg-[#0E1B2C] text-white shadow-sm font-semibold"
                    : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C]"
                )}
              >
                Real
              </button>
            </div>

            {/* Popover de Telemetria e Saúde */}
            <SystemStatusPopover />

            {/* Alternador de Tema */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#4A586A] dark:text-[#94a3b8] hover:bg-[#EEF1F5] dark:hover:bg-white/10 transition-colors"
              title="Alternar tema claro/escuro"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-[#4A586A]" />
              )}
            </button>

            {/* Menu de Configurações */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#4A586A] dark:text-[#94a3b8] hover:bg-[#EEF1F5] dark:hover:bg-white/10 transition-colors"
                  title="Configurações e Ajustes"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-[16px] p-2 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 shadow-lg">
                <DropdownMenuLabel className="text-xs text-[#4A586A] dark:text-[#94a3b8] font-instrument-sans">
                  Ajustes da Plataforma
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setOpenApiSettingsModal(true)}
                  className="cursor-pointer text-sm font-medium flex items-center gap-2 rounded-[10px]"
                >
                  <KeyRound className="w-4 h-4 text-[#1F5FD6]" />
                  <span>Chaves de API Binance</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setOpenAiSettingsModal(true)}
                  className="cursor-pointer text-sm font-medium flex items-center gap-2 rounded-[10px]"
                >
                  <Brain className="w-4 h-4 text-[#7C3AED]" />
                  <span>Provedores de IA</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={toggleProMode}
                  className="cursor-pointer text-sm font-medium flex items-center justify-between rounded-[10px]"
                >
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#0B8F6A]" />
                    <span>Modo Profissional</span>
                  </div>
                  <span className={cn("text-xs font-mono font-bold", proMode ? "text-[#0B8F6A]" : "text-[#4A586A]")}>
                    {proMode ? "ATIVO" : "DESL"}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Diálogos Globais integrados */}
      <GlobalCommandSearch />
      <ApiSettingsDialog
        open={openApiSettingsModal}
        onOpenChange={setOpenApiSettingsModal}
      />
      <AiSettingsDialog
        open={openAiSettingsModal}
        onOpenChange={setOpenAiSettingsModal}
      />
    </>
  );
}

