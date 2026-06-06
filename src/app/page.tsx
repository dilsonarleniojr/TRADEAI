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
import { StatCards } from "@/components/dashboard/stat-cards";
import { MarketHighlights } from "@/components/dashboard/market-highlights";
import { MarketSentiment } from "@/components/dashboard/market-sentiment";
import { PortfolioAllocation } from "@/components/dashboard/portfolio-allocation";
import { Watchlist } from "@/components/dashboard/watchlist";
import { PriceAlerts } from "@/components/dashboard/price-alerts";
import { MarketTable } from "@/components/dashboard/market-table";
import { AISignals } from "@/components/dashboard/ai-signals";
import { RecentTrades } from "@/components/dashboard/recent-trades";
import { PnlTracker } from "@/components/dashboard/pnl-tracker";
import { FearGreedIndex } from "@/components/dashboard/fear-greed-index";
import { MultiTimeframeAnalysis } from "@/components/dashboard/multi-timeframe";
import { AlertNotification } from "@/components/dashboard/alert-notification";
import { CorrelationHeatmap } from "@/components/dashboard/correlation-heatmap";
import { WhaleTracker } from "@/components/dashboard/whale-tracker";
import { LiquidationHeatmap } from "@/components/dashboard/liquidation-heatmap";
import { TradingCalculator } from "@/components/dashboard/trading-calculator";
import { CryptoNews } from "@/components/dashboard/crypto-news";
import { MarketOverview } from "@/components/dashboard/market-overview";
import { FundingRates } from "@/components/dashboard/funding-rates";
import { ShortcutsHint } from "@/components/dashboard/shortcuts-hint";
import { PortfolioRebalancing } from "@/components/dashboard/portfolio-rebalancing";
import { StrategyComparison } from "@/components/dashboard/strategy-comparison";
import { SocialSentiment } from "@/components/dashboard/social-sentiment";
import { OnChainAnalytics } from "@/components/dashboard/on-chain-analytics";
import { SLTPCalculator } from "@/components/dashboard/sltp-calculator";
import { MLPipeline } from "@/components/dashboard/ml-pipeline";
import { MobileSection } from "@/components/dashboard/mobile-section";
import { ChatSection } from "@/components/ai/chat-section";
import { ChartSection } from "@/components/chart/chart-section";
import { BotSection } from "@/components/bot/bot-section";
import { HistorySection } from "@/components/history/history-section";
import { BacktestSection } from "@/components/backtest/backtest-section";
import { MobilePortfolioBar } from "@/components/mobile/mobile-portfolio-bar";
import { MobileDrawer } from "@/components/mobile/mobile-drawer";
import { AITopPicks } from "@/components/dashboard/ai-top-picks";
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
            className="space-y-6 md:space-y-4"
          >
            {/* Section: Visão Geral (expanded by default) */}
            <MobileSection title="Visão Geral" icon="📊" itemCount={4} defaultOpen={true}>
              <motion.div variants={itemVariants}>
                <StatCards />
              </motion.div>
              <motion.div variants={itemVariants}>
                <AITopPicks />
              </motion.div>
              <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
                <FearGreedIndex />
                <MultiTimeframeAnalysis />
              </motion.div>
            </MobileSection>

            {/* Section: Portfólio (collapsed by default) */}
            <MobileSection title="Portfólio" icon="💰" itemCount={4} defaultOpen={false}>
              <motion.div variants={itemVariants}>
                <SLTPCalculator />
              </motion.div>
              <motion.div variants={itemVariants}>
                <PnlTracker />
              </motion.div>
              <motion.div variants={itemVariants}>
                <PortfolioRebalancing />
              </motion.div>
              <motion.div variants={itemVariants}>
                <PortfolioAllocation />
              </motion.div>
            </MobileSection>

            {/* Section: Mercado (collapsed by default) */}
            <MobileSection title="Mercado" icon="📈" itemCount={7} defaultOpen={false}>
              <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
                <MarketOverview />
                <FundingRates />
              </motion.div>
              <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
                <MarketSentiment />
                <MarketHighlights />
              </motion.div>
              <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
                <div className="lg:col-span-2">
                  <MarketTable />
                </div>
                <div className="space-y-3 md:space-y-4">
                  <Watchlist />
                  <PriceAlerts />
                </div>
              </motion.div>
            </MobileSection>

            {/* Section: Análise Avançada (collapsed by default) */}
            <MobileSection title="Análise Avançada" icon="🔬" itemCount={5} defaultOpen={false}>
              <motion.div variants={itemVariants}>
                <CorrelationHeatmap />
              </motion.div>
              <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
                <WhaleTracker />
                <LiquidationHeatmap />
              </motion.div>
              <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
                <SocialSentiment />
                <OnChainAnalytics />
              </motion.div>
            </MobileSection>

            {/* Section: ML Pipeline (collapsed by default) */}
            <MobileSection title="Machine Learning" icon="🧠" itemCount={1} defaultOpen={false}>
              <motion.div variants={itemVariants}>
                <MLPipeline />
              </motion.div>
            </MobileSection>

            {/* Section: Sinais & Notícias (collapsed by default) */}
            <MobileSection title="Sinais & Notícias" icon="🤖" itemCount={5} defaultOpen={false}>
              <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
                <div className="lg:col-span-2">
                  <AISignals />
                </div>
                <RecentTrades />
              </motion.div>
              <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
                <TradingCalculator />
                <CryptoNews />
              </motion.div>
              <motion.div variants={itemVariants}>
                <StrategyComparison />
              </motion.div>
            </MobileSection>
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
