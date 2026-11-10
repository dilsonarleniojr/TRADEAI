"use client";

import { useCryptoStore } from "@/lib/store";
import { DataProvider, useDataProvider } from "@/lib/data-provider";
import { useBinanceData } from "@/hooks/use-binance-data";
import { useBinanceStream } from "@/hooks/use-binance-stream";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { AppShell } from "@/components/v2/app-shell";
import { HomeView } from "@/components/v2/home-view";
import { MarketView } from "@/components/v2/market-view";
import { BotView } from "@/components/v2/bot-view";
import { PortfolioView } from "@/components/v2/portfolio-view";
import { LearnView } from "@/components/v2/learn-view";
import { ShortcutsHint } from "@/components/dashboard/shortcuts-hint";
import { Loader2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

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

  // Conexões e atalhos em tempo real
  useBinanceData();
  useBinanceStream();
  useKeyboardShortcuts();

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
      case "institutional":
        return <BotView />;
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
