"use client";

import { useRouter } from "next/navigation";
import { DataProvider } from "@/lib/data-provider";
import { useBinanceData } from "@/hooks/use-binance-data";
import { useBinanceStream } from "@/hooks/use-binance-stream";
import { AlertNotification } from "@/components/dashboard/alert-notification";
import { BotBackgroundRunner } from "@/components/bot/bot-background-runner";
import { HistoryBootstrap } from "@/components/bot/history-bootstrap";
import { BotReadinessWatcher } from "@/components/bot/bot-readiness";
import { MobileLayout } from "@/components/mobile/mobile-layout";

function MobilePageContent() {
  const router = useRouter();
  useBinanceData();
  useBinanceStream();

  const handleSwitchToDesktop = () => {
    try {
      localStorage.setItem("tradeai_view_mode_override", "desktop");
    } catch {}
    router.push("/");
  };

  return (
    <>
      <AlertNotification />
      <BotBackgroundRunner />
      <HistoryBootstrap />
      <BotReadinessWatcher />
      <MobileLayout onSwitchToDesktop={handleSwitchToDesktop} />
    </>
  );
}

export default function MobilePage() {
  return (
    <DataProvider>
      <MobilePageContent />
    </DataProvider>
  );
}
