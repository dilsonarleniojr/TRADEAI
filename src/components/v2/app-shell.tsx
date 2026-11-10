"use client";

import React from "react";
import { TopNav } from "./top-nav";
import { MobileNavBar } from "./mobile-nav";
import { AlertNotification } from "@/components/dashboard/alert-notification";
import { BotBackgroundRunner } from "@/components/bot/bot-background-runner";
import { HistoryBootstrap } from "@/components/bot/history-bootstrap";
import { BotReadinessWatcher } from "@/components/bot/bot-readiness";
import { BotExecutionReportDialog } from "@/components/bot/bot-execution-report-dialog";
import { QuantCopilotInstantModal } from "@/components/journal/quant-copilot-instant-modal";
import { useCryptoStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { activeExecutionReport, setActiveExecutionReport } = useCryptoStore(
    useShallow((s) => ({
      activeExecutionReport: s.activeExecutionReport,
      setActiveExecutionReport: s.setActiveExecutionReport,
    }))
  );

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
      <main className="flex-1 w-full max-w-[1240px] mx-auto px-4 sm:px-8 md:px-10 py-6 sm:py-8 pb-24 md:pb-12">
        {children}
      </main>

      {/* Barra Inferior Mobile (390px) */}
      <MobileNavBar />
    </div>
  );
}

