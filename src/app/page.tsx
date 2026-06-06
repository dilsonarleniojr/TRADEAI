"use client";

import { useEffect, useState } from "react";
import { useCryptoStore } from "@/lib/store";
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

// Fallback mock data (used when Binance API is not available)
const FALLBACK_TICKERS: Record<string, import("@/lib/store").TickerData> = {
  BTCUSDT: { symbol: "BTCUSDT", price: 78301.49, priceChange: -869.23, priceChangePercent: -1.1, high: 79227.77, low: 77640.0, volume: 13235.56, quoteVolume: 1037425290.0 },
  ETHUSDT: { symbol: "ETHUSDT", price: 2182.68, priceChange: -40.59, priceChangePercent: -1.83, high: 2231.51, low: 2162.55, volume: 206024.52, quoteVolume: 450871463.0 },
  BNBUSDT: { symbol: "BNBUSDT", price: 656.82, priceChange: -17.33, priceChangePercent: -2.57, high: 674.92, low: 650.70, volume: 135588.09, quoteVolume: 89486202.0 },
  SOLUSDT: { symbol: "SOLUSDT", price: 86.69, priceChange: -2.67, priceChangePercent: -2.99, high: 89.44, low: 85.52, volume: 2005002.23, quoteVolume: 175107198.0 },
  XRPUSDT: { symbol: "XRPUSDT", price: 1.4157, priceChange: -0.0203, priceChangePercent: -1.41, high: 1.4396, low: 1.394, volume: 72732577.6, quoteVolume: 102997513.0 },
  ADAUSDT: { symbol: "ADAUSDT", price: 0.2554, priceChange: -0.0057, priceChangePercent: -2.18, high: 0.2625, low: 0.2521, volume: 72884018.3, quoteVolume: 18685647.0 },
  DOGEUSDT: { symbol: "DOGEUSDT", price: 0.10962, priceChange: -0.00352, priceChangePercent: -3.11, high: 0.11382, low: 0.10775, volume: 777127652.0, quoteVolume: 85709243.0 },
  AVAXUSDT: { symbol: "AVAXUSDT", price: 9.32, priceChange: -0.22, priceChangePercent: -2.31, high: 9.58, low: 9.19, volume: 1274901.32, quoteVolume: 11915396.0 },
  DOTUSDT: { symbol: "DOTUSDT", price: 1.273, priceChange: -0.038, priceChangePercent: -2.9, high: 1.321, low: 1.247, volume: 4065578.07, quoteVolume: 5185683.0 },
  MATICUSDT: { symbol: "MATICUSDT", price: 0.3794, priceChange: -0.0011, priceChangePercent: -0.29, high: 0.3806, low: 0.3774, volume: 2834467.3, quoteVolume: 1074370.0 },
  LINKUSDT: { symbol: "LINKUSDT", price: 9.76, priceChange: -0.29, priceChangePercent: -2.89, high: 10.1, low: 9.61, volume: 2545188.75, quoteVolume: 24850582.0 },
  ATOMUSDT: { symbol: "ATOMUSDT", price: 2.043, priceChange: 0.103, priceChangePercent: 5.31, high: 2.044, low: 1.91, volume: 2295228.07, quoteVolume: 4533359.0 },
  NEARUSDT: { symbol: "NEARUSDT", price: 3.85, priceChange: 0.12, priceChangePercent: 3.21, high: 3.98, low: 3.71, volume: 12500000, quoteVolume: 47800000 },
  ALGOUSDT: { symbol: "ALGOUSDT", price: 0.182, priceChange: -0.004, priceChangePercent: -2.15, high: 0.188, low: 0.178, volume: 35000000, quoteVolume: 6400000 },
  SUIUSDT: { symbol: "SUIUSDT", price: 1.45, priceChange: 0.08, priceChangePercent: 5.84, high: 1.52, low: 1.36, volume: 28000000, quoteVolume: 40600000 },
  APTUSDT: { symbol: "APTUSDT", price: 8.92, priceChange: -0.31, priceChangePercent: -3.36, high: 9.28, low: 8.75, volume: 8500000, quoteVolume: 75800000 },
  SEIUSDT: { symbol: "SEIUSDT", price: 0.42, priceChange: 0.015, priceChangePercent: 3.7, high: 0.44, low: 0.40, volume: 18000000, quoteVolume: 7560000 },
  TIAUSDT: { symbol: "TIAUSDT", price: 8.15, priceChange: -0.42, priceChangePercent: -4.9, high: 8.65, low: 7.95, volume: 6200000, quoteVolume: 50500000 },
  INJUSDT: { symbol: "INJUSDT", price: 24.5, priceChange: 1.2, priceChangePercent: 5.14, high: 25.2, low: 23.1, volume: 4500000, quoteVolume: 110000000 },
  ARBUSDT: { symbol: "ARBUSDT", price: 0.95, priceChange: -0.03, priceChangePercent: -3.06, high: 0.99, low: 0.92, volume: 12000000, quoteVolume: 11400000 },
  OPUSDT: { symbol: "OPUSDT", price: 1.82, priceChange: 0.04, priceChangePercent: 2.25, high: 1.88, low: 1.76, volume: 9500000, quoteVolume: 17300000 },
  UNIUSDT: { symbol: "UNIUSDT", price: 6.35, priceChange: -0.12, priceChangePercent: -1.85, high: 6.52, low: 6.21, volume: 5200000, quoteVolume: 33000000 },
  AAVEUSDT: { symbol: "AAVEUSDT", price: 92.5, priceChange: 2.8, priceChangePercent: 3.12, high: 95.0, low: 89.2, volume: 850000, quoteVolume: 78600000 },
  MKRUSDT: { symbol: "MKRUSDT", price: 1520, priceChange: -45, priceChangePercent: -2.87, high: 1580, low: 1505, volume: 1200, quoteVolume: 1824000 },
  SHIBUSDT: { symbol: "SHIBUSDT", price: 0.00001182, priceChange: -0.00000045, priceChangePercent: -3.67, high: 0.00001235, low: 0.00001155, volume: 450000000000, quoteVolume: 53200000 },
  PEPEUSDT: { symbol: "PEPEUSDT", price: 0.00000842, priceChange: 0.00000065, priceChangePercent: 8.37, high: 0.00000885, low: 0.00000765, volume: 620000000000, quoteVolume: 52200000 },
  FETUSDT: { symbol: "FETUSDT", price: 1.58, priceChange: 0.12, priceChangePercent: 8.22, high: 1.65, low: 1.44, volume: 15000000, quoteVolume: 23700000 },
  RENDERUSDT: { symbol: "RENDERUSDT", price: 5.82, priceChange: 0.35, priceChangePercent: 6.4, high: 6.05, low: 5.42, volume: 8200000, quoteVolume: 47700000 },
  FILUSDT: { symbol: "FILUSDT", price: 3.25, priceChange: -0.08, priceChangePercent: -2.4, high: 3.38, low: 3.15, volume: 9800000, quoteVolume: 31850000 },
  LTCUSDT: { symbol: "LTCUSDT", price: 68.4, priceChange: -1.2, priceChangePercent: -1.72, high: 70.1, low: 67.5, volume: 5400000, quoteVolume: 369600000 },
  TRXUSDT: { symbol: "TRXUSDT", price: 0.1245, priceChange: 0.0018, priceChangePercent: 1.47, high: 0.1262, low: 0.1221, volume: 82000000, quoteVolume: 10200000 },
};



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
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

export default function HomePage() {
  const {
    activeSection,
    setTickers,
    setTrades,
    setAiSignals,
    setBotActive,
  } = useCryptoStore();

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Connect to real Binance data
  useBinanceData(); // Fetches initial data + periodic refresh (60s fallback)
  useBinanceStream(); // Real-time Socket.IO updates
  useKeyboardShortcuts(); // Global keyboard shortcuts

  // Initialize with fallback data on mount, then real data will replace it
  useEffect(() => {
    setTickers(FALLBACK_TICKERS);
    setAiSignals([]);
    setBotActive(false);

    // Fetch initial account/portfolio balance from database
    fetch("/api/account")
      .then(async (res) => {
        if (res.ok) {
          const result = await res.json();
          if (result.success && result.data) {
            const acc = result.data;
            console.log("[Page] Initial account loaded:", acc);
            useCryptoStore.getState().setAccount({
              cashBalance: acc.cashBalance,
              assetQuantity: acc.assetQuantity,
              symbol: acc.symbol,
            });
          }
        }
      })
      .catch((err) => {
        console.error("[Page] Initial account fetch error:", err);
        useCryptoStore.getState().setAccount({
          cashBalance: 10000,
          assetQuantity: 0,
          symbol: "BTCUSDT",
        });
      });

    // Fetch initial trades
    fetch("/api/trades")
      .then(async (res) => {
        if (res.ok) {
          const result = await res.json();
          if (result.success && Array.isArray(result.data)) {
            console.log("[Page] Initial trades loaded:", result.data.length);
            setTrades(result.data);
          }
        }
      })
      .catch((err) => {
        console.error("[Page] Initial trades fetch error:", err);
        setTrades([]);
      });

  }, [setTickers, setTrades, setAiSignals, setBotActive]);

  const renderContent = () => {
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
