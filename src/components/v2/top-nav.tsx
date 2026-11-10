"use client";

import React, { useState } from "react";
import { useCryptoStore } from "@/lib/store";
import { useTheme } from "next-themes";
import {
  Activity,
  Plus,
  Search,
  Settings,
  ChevronDown,
  KeyRound,
  Brain,
  Sliders,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SystemStatusPopover } from "@/components/header/system-status-popover";
import { GlobalCommandSearch } from "@/components/header/global-command-search";
import { ApiSettingsDialog } from "@/components/header/api-settings-dialog";
import { AiSettingsDialog } from "@/components/header/ai-settings-dialog";
import { DirectAiTradeModal } from "@/components/bot/direct-ai-trade-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useShallow } from "zustand/react/shallow";

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

  const [confirmRealModalOpen, setConfirmRealModalOpen] = useState(false);
  const [directTradeModalOpen, setDirectTradeModalOpen] = useState(false);

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

  const navItems: { id: V2NavigationArea; label: string }[] = [
    { id: "inicio", label: "Início" },
    { id: "mercado", label: "Mercado" },
    { id: "robos", label: "Robôs" },
    { id: "carteira", label: "Carteira" },
    { id: "aprender", label: "Aprender" },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-[#FFFFFF]/95 dark:bg-[#0f1622]/95 backdrop-blur-md border-b border-[#E7EBF0] dark:border-white/10 transition-colors">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-8 h-18 flex items-center justify-between">
          {/* Esquerda: Marca "TradeAI" + Menu 5 Abas */}
          <div className="flex items-center space-x-6 lg:space-x-8">
            <button
              onClick={() => setActiveSection("dashboard")}
              className="font-instrument-serif text-[28px] tracking-[-0.02em] text-[#0E1B2C] dark:text-[#f8fafc] focus:outline-none select-none"
            >
              TradeAI
            </button>

            {/* Menu Desktop */}
            <nav role="tablist" className="hidden md:flex items-center space-x-1">
              {navItems.map((item) => {
                const isActive = currentArea === item.id;
                return (
                  <button
                    key={item.id}
                    role="tab"
                    aria-current={isActive ? "page" : undefined}
                    aria-selected={isActive}
                    onClick={() => handleSelectArea(item.id)}
                    className={cn(
                      "px-4 py-1.5 rounded-full font-instrument-sans text-[15px] font-medium transition-all duration-150 select-none",
                      isActive
                        ? "bg-[#FFFFFF] dark:bg-[#162032] text-[#0E1B2C] dark:text-[#f8fafc] shadow-[0_1px_2px_rgba(14,27,44,0.08)] font-semibold border border-[#E7EBF0]/80 dark:border-white/10"
                        : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C] dark:hover:text-[#FFFFFF]"
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Direita: Status, Simulado/Real, Botão Nova Ordem */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Status da Binance */}
            <div className="hidden lg:flex items-center space-x-2 text-[13px] font-instrument-sans text-[#4A586A] dark:text-[#94a3b8]">
              <span
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  connectionStatus === "connected" ? "bg-[#0B8F6A]" : "bg-amber-500"
                )}
              />
              <span>
                {connectionStatus === "connected" ? "Binance conectada" : "Conectando"}
              </span>
            </div>

            {/* Alternador Simulado / Real */}
            <div className="inline-flex p-1 bg-[#EEF1F5] dark:bg-[#162032] rounded-full border border-[#E7EBF0] dark:border-white/10">
              <button
                onClick={() => setTradingMode("paper")}
                className={cn(
                  "px-3.5 py-1 text-[13px] font-instrument-sans rounded-full transition-all select-none",
                  tradingMode === "paper"
                    ? "bg-[#FFFFFF] dark:bg-[#0f1622] text-[#0E1B2C] dark:text-white shadow-[0_1px_2px_rgba(14,27,44,0.08)] font-semibold"
                    : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C]"
                )}
              >
                Simulado
              </button>
              <button
                onClick={() => {
                  if (tradingMode === "paper") {
                    setConfirmRealModalOpen(true);
                  }
                }}
                className={cn(
                  "px-3.5 py-1 text-[13px] font-instrument-sans rounded-full transition-all select-none",
                  tradingMode === "real"
                    ? "bg-[#0E1B2C] text-white shadow-sm font-semibold"
                    : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C]"
                )}
              >
                Real
              </button>
            </div>

            {/* Popover de Telemetria e Pulso Técnico */}
            <SystemStatusPopover />

            {/* Botão Primário: Nova Ordem */}
            <button
              onClick={() => {
                setActiveSection("chart");
              }}
              className="hidden sm:inline-flex items-center justify-center px-5 py-2 rounded-full bg-[#0E1B2C] dark:bg-[#f8fafc] text-[#FFFFFF] dark:text-[#0E1B2C] text-[14px] font-instrument-sans font-semibold hover:opacity-95 transition-opacity shadow-[0_1px_2px_rgba(14,27,44,0.1)] select-none"
            >
              Nova ordem
            </button>
          </div>
        </div>
      </header>

      {/* Modal de Confirmação para Modo Real */}
      <AlertDialog open={confirmRealModalOpen} onOpenChange={setConfirmRealModalOpen}>
        <AlertDialogContent className="rounded-[24px] max-w-md p-6 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 font-instrument-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-instrument-serif text-2xl text-[#0E1B2C] dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Ativar Modo Real
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[#4A586A] dark:text-[#94a3b8] pt-2">
              No Modo Real, ordens serão enviadas para sua conta da Binance com capital real. Certifique-se de que suas chaves de API estão configuradas com restrição a IP fixo e sem permissão de saque.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-4">
            <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setTradingMode("real")}
              className="rounded-full bg-[#0E1B2C] text-white font-semibold"
            >
              Entendido, ativar Real
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
      <DirectAiTradeModal
        open={directTradeModalOpen}
        onOpenChange={setDirectTradeModalOpen}
      />
    </>
  );
}
