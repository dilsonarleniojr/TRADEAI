"use client";

import { useState } from "react";
import { useCryptoStore } from "@/lib/store";
import { DataProvider, useDataProvider } from "@/lib/data-provider";
import { useBinanceData } from "@/hooks/use-binance-data";
import { useBinanceStream } from "@/hooks/use-binance-stream";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { TickerTape } from "@/components/header/ticker-tape";
import { DashboardGrid } from "@/components/dashboard/dashboard-grid";
import { ChatSection } from "@/components/ai/chat-section";
import { ChartSection } from "@/components/chart/chart-section";
import { BotSection } from "@/components/bot/bot-section";
import { HistorySection } from "@/components/history/history-section";
import { BacktestSection } from "@/components/backtest/backtest-section";
import { EducationSection } from "@/components/education/education-section";
import { MobilePortfolioBar } from "@/components/mobile/mobile-portfolio-bar";
import { MobileDrawer } from "@/components/mobile/mobile-drawer";
import { AlertNotification } from "@/components/dashboard/alert-notification";
import { ShortcutsHint } from "@/components/dashboard/shortcuts-hint";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

// Stagger animation container for dashboard cards
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

// Loading skeleton shown while real data loads
function DashboardSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-3"
      >
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-crypto-cyan to-crypto-green flex items-center justify-center shadow-[0_0_24px_oklch(0.75_0.15_195/30%)]">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">
          Conectando à Binance...
        </p>
        <div className="flex gap-2 mt-2">
          <div className="w-2 h-2 rounded-full bg-crypto-cyan animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 rounded-full bg-crypto-cyan animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2 h-2 rounded-full bg-crypto-cyan animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </motion.div>
    </div>
  );
}

function HomePageContent() {
  const { activeSection } = useCryptoStore();
  const { dataReady } = useDataProvider();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Connect to real Binance data
  useBinanceData();
  useBinanceStream();
  useKeyboardShortcuts();

  const renderContent = () => {
    // Show skeleton only on dashboard while data loads
    if (!dataReady && activeSection === "dashboard") {
      return <DashboardSkeleton />;
    }

    switch (activeSection) {
      case "dashboard":
        return (
          <motion.div
            key="dashboard"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-4"
          >
            <DashboardGrid />
          </motion.div>
        );
      case "chart":
        return (
          <motion.div
            key="chart"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <ChartSection />
          </motion.div>
        );
      case "ai":
        return (
          <motion.div
            key="ai"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <ChatSection />
          </motion.div>
        );
      case "bot":
        return (
          <motion.div
            key="bot"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <BotSection />
          </motion.div>
        );
      case "backtest":
        return (
          <motion.div
            key="backtest"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <BacktestSection />
          </motion.div>
        );
      case "history":
        return (
          <motion.div
            key="history"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <HistorySection />
          </motion.div>
        );
      case "education":
        return (
          <motion.div
            key="education"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <EducationSection />
          </motion.div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background crypto-dot-grid">
      <AlertNotification />
      <div className="flex flex-1">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header onOpenMobileDrawer={() => setMobileDrawerOpen(true)} />
          <TickerTape />
          <main className="flex-1 p-3 md:p-5 overflow-y-auto pb-24 md:pb-5 cyan-scrollbar scroll-smooth">
            <AnimatePresence mode="wait">
              {renderContent()}
            </AnimatePresence>
          </main>
          <Footer />
        </div>
      </div>
      <ShortcutsHint />
      <MobilePortfolioBar />
      <MobileDrawer open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen} />
    </div>
  );
}

export default function HomePage() {
  return (
    <DataProvider>
      <HomePageContent />
    </DataProvider>
  );
}
