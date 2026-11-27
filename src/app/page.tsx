"use client";

import { useState, useEffect } from "react";
import { useCryptoStore } from "@/lib/store";
import { DataProvider, useDataProvider } from "@/lib/data-provider";
import { useBinanceData } from "@/hooks/use-binance-data";
import { useBinanceStream } from "@/hooks/use-binance-stream";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import dynamic from "next/dynamic";
import { AppShell } from "@/components/v2/app-shell";
import { HomeView } from "@/components/v2/home-view";
import { ViewSkeleton } from "@/components/v2/view-skeleton";

const MarketView = dynamic(() => import("@/components/v2/market-view").then((m) => m.MarketView), {
  loading: () => <ViewSkeleton label="Gráfico e Mercado" />,
});
const BotView = dynamic(() => import("@/components/v2/bot-view").then((m) => m.BotView), {
  loading: () => <ViewSkeleton label="Frota de Robôs" />,
});
const PortfolioView = dynamic(() => import("@/components/v2/portfolio-view").then((m) => m.PortfolioView), {
  loading: () => <ViewSkeleton label="Carteira e Diário" />,
});
const LearnView = dynamic(() => import("@/components/v2/learn-view").then((m) => m.LearnView), {
  loading: () => <ViewSkeleton label="Academia e Backtesting" />,
});
const CockpitView = dynamic(() => import("@/components/v2/cockpit-view").then((m) => m.CockpitView), {
  loading: () => <ViewSkeleton label="Cockpit Institucional" />,
});
import { ShortcutsHint } from "@/components/dashboard/shortcuts-hint";
import { MobileLayout } from "@/components/mobile/mobile-layout";
import { AlertNotification } from "@/components/dashboard/alert-notification";
import { BotBackgroundRunner } from "@/components/bot/bot-background-runner";
import { HistoryBootstrap } from "@/components/bot/history-bootstrap";
import { BotReadinessWatcher } from "@/components/bot/bot-readiness";
import { Loader2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

const VIEW_MODE_STORAGE_KEY = "tradeai_view_mode_override";

// Loading skeleton limpo e elegante no estilo Instrumento Calmo
function DashboardSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <div className="w-14 h-14 rounded-2xl bg-[#0E1B2C] text-white flex items-center justify-center shadow-lg">
        <Loader2 className="w-7 h-7 text-[#5BE3A8] animate-spin" />
      </div>
      <p className="text-sm font-instrument-sans font-medium text-[#4A586A] animate-pulse">
        Sincronizando com a Binance...
      </p>
    </div>
  );
}

function HomePageContent() {
  const { activeSection } = useCryptoStore(
    useShallow((s) => ({
      activeSection: s.activeSection,
    }))
  );
  const { dataReady } = useDataProvider();
  const [useMobileView, setUseMobileView] = useState(false);

  // Conexões e atalhos em tempo real (mantidos no root para zero reinicialização de WebSocket)
  useBinanceData();
  useBinanceStream();
  useKeyboardShortcuts();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const evaluateViewport = () => {
      let override: string | null = null;
      try {
        override = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      } catch { }

      if (override === "mobile") {
        setUseMobileView(true);
        return;
      }
      if (override === "desktop") {
        setUseMobileView(false);
        return;
      }
      setUseMobileView(window.innerWidth < 768);
    };

    evaluateViewport();
    window.addEventListener("resize", evaluateViewport);
    window.addEventListener("tradeai:viewmode", evaluateViewport);
    return () => {
      window.removeEventListener("resize", evaluateViewport);
      window.removeEventListener("tradeai:viewmode", evaluateViewport);
    };
  }, []);

  const handleSwitchToDesktop = () => {
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, "desktop");
    } catch { }
    setUseMobileView(false);
  };

  if (useMobileView) {
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

  const renderContent = () => {
    if (!dataReady && activeSection === "dashboard") {
      return <DashboardSkeleton />;
    }

    switch (activeSection) {
      case "dashboard":
        return <HomeView />;
      case "chart":
      case "trade-hub":
      case "ai":
        return <MarketView />;
      case "bot":
        return <BotView />;
      case "institutional":
        return <CockpitView />;
      case "history":
      case "journal":
        return <PortfolioView />;
      case "education":
      case "backtest":
        return <LearnView />;
      default:
        return <HomeView />;
    }
  };

  return (
    <AppShell>
      {renderContent()}
      <ShortcutsHint />
    </AppShell>
  );
}

export default function HomePage() {
  return (
    <DataProvider>
      <HomePageContent />
    </DataProvider>
  );
}
