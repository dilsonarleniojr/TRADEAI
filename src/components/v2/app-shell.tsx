"use client";

import React, { useEffect, useState } from "react";
import { TopNav } from "./top-nav";
import { MobileNavBar } from "./mobile-nav";
import { AlertNotification } from "@/components/dashboard/alert-notification";
import { DataFreshnessBanner } from "@/components/dashboard/data-freshness-banner";
import { BotBackgroundRunner } from "@/components/bot/bot-background-runner";
import { HistoryBootstrap } from "@/components/bot/history-bootstrap";
import { BotReadinessWatcher } from "@/components/bot/bot-readiness";
import { BotExecutionReportDialog } from "@/components/bot/bot-execution-report-dialog";
import { QuantCopilotInstantModal } from "@/components/journal/quant-copilot-instant-modal";
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
import { useCryptoStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { activeExecutionReport, setActiveExecutionReport, setTradingMode, setAccount, setTrades } = useCryptoStore(
    useShallow((s) => ({
      activeExecutionReport: s.activeExecutionReport,
      setActiveExecutionReport: s.setActiveExecutionReport,
      setTradingMode: s.setTradingMode,
      setAccount: s.setAccount,
      setTrades: s.setTrades,
    }))
  );
  const [confirmLiveModalOpen, setConfirmLiveModalOpen] = useState(false);

  useEffect(() => {
    const onRequestLiveMode = () => setConfirmLiveModalOpen(true);
    window.addEventListener("tradeai:request-live-mode", onRequestLiveMode);
    return () => window.removeEventListener("tradeai:request-live-mode", onRequestLiveMode);
  }, []);

  const handleConfirmLiveMode = async () => {
    setConfirmLiveModalOpen(false);
    setTradingMode("live");
    try {
      const [accRes, tradesRes] = await Promise.all([
        fetch("/api/account?mode=live"),
        fetch("/api/trades?mode=live"),
      ]);
      const accData = await accRes.json();
      const tradesData = await tradesRes.json();
      if (accData.success && accData.data) setAccount(accData.data);
      if (tradesData.success && Array.isArray(tradesData.data)) setTrades(tradesData.data);
    } catch {
      // Silencioso: banner e estados da UI tratam falha de sincronização
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F4F7] dark:bg-[#090d14] text-[#0E1B2C] dark:text-[#f8fafc] font-sans flex flex-col antialiased selection:bg-[#E7EEFC] selection:text-[#1F4FB0]">
      {/* Background Services & Dialogs essenciais mantidos */}
      <AlertNotification />
      <BotBackgroundRunner />
      <HistoryBootstrap />
      <BotReadinessWatcher />
      <BotExecutionReportDialog
        report={activeExecutionReport}
        open={!!activeExecutionReport}
        onOpenChange={(open) => {
          if (!open) setActiveExecutionReport(null);
        }}
      />
      <QuantCopilotInstantModal />

      {/* TopNav Institucional V2 */}
      <TopNav />

      {/* Main Content Area - Max width 1240px centralizada, padding lateral 40px (16px no mobile) */}
      <main className="flex-1 w-full max-w-[1240px] mx-auto px-4 sm:px-8 md:px-10 py-6 sm:py-8 pb-24 md:pb-12 space-y-4">
        <DataFreshnessBanner />
        {children}
      </main>

      {/* Barra Inferior Mobile (390px) */}
      <MobileNavBar />

      {/* Confirmação explícita ao alternar de Paper para Modo Real via atalho */}
      <AlertDialog open={confirmLiveModalOpen} onOpenChange={setConfirmLiveModalOpen}>
        <AlertDialogContent className="rounded-[24px] max-w-md bg-white dark:bg-[#0f1622] border border-[#F1C9C5]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold text-[#0E1B2C] dark:text-white">
              Ativar Modo Real (Capital Real)?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[#4A586A] dark:text-[#94a3b8]">
              Você pressionou o atalho para sair do modo Simulado (Paper) e operar com saldo real na exchange. Confirme apenas se desejar enviar ordens reais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Continuar em Simulado</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmLiveMode}
              className="rounded-full bg-[#B42318] text-white hover:bg-[#911a10]"
            >
              Confirmar Modo Real
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

