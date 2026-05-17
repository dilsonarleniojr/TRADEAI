"use client";

import { useEffect } from "react";
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
import { ChatSection } from "@/components/ai/chat-section";
import { ChartSection } from "@/components/chart/chart-section";
import { BotSection } from "@/components/bot/bot-section";
import { HistorySection } from "@/components/history/history-section";
import { BacktestSection } from "@/components/backtest/backtest-section";
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
};

const MOCK_TRADES: import("@/lib/store").TradeData[] = [
  { id: "t1", symbol: "BTCUSDT", side: "BUY", price: 78150.5, quantity: 0.02, total: 1563.01, strategy: "AI", mode: "paper", pnl: 0, timestamp: new Date(Date.now() - 120000).toISOString() },
  { id: "t2", symbol: "ETHUSDT", side: "SELL", price: 2195.2, quantity: 0.5, total: 1097.6, strategy: "RSI", mode: "paper", pnl: 45.8, timestamp: new Date(Date.now() - 300000).toISOString() },
  { id: "t3", symbol: "SOLUSDT", side: "BUY", price: 87.3, quantity: 10, total: 873.0, strategy: "MACD", mode: "paper", pnl: 0, timestamp: new Date(Date.now() - 600000).toISOString() },
  { id: "t4", symbol: "BNBUSDT", side: "SELL", price: 659.8, quantity: 0.3, total: 197.94, strategy: "AI", mode: "paper", pnl: -12.3, timestamp: new Date(Date.now() - 900000).toISOString() },
  { id: "t5", symbol: "LINKUSDT", side: "BUY", price: 9.82, quantity: 100, total: 982.0, strategy: "AI", mode: "paper", pnl: 0, timestamp: new Date(Date.now() - 1200000).toISOString() },
];

const MOCK_AI_SIGNALS: import("@/lib/store").AISignalData[] = [
  { id: "s1", symbol: "BTCUSDT", action: "BUY", confidence: 0.85, reasoning: "Forte momento de alta com recuperação do RSI em sobrevenda. Volume crescente.", priceAtSignal: 78301.49, stopLoss: 76735, takeProfit: 82216, createdAt: new Date(Date.now() - 60000).toISOString() },
  { id: "s2", symbol: "ETHUSDT", action: "HOLD", confidence: 0.6, reasoning: "Consolidando próximo ao suporte. Aguardar confirmação de rompimento.", priceAtSignal: 2182.68, stopLoss: 21391, takeProfit: 22918, createdAt: new Date(Date.now() - 180000).toISOString() },
  { id: "s3", symbol: "SOLUSDT", action: "BUY", confidence: 0.72, reasoning: "Aproximando-se de suporte chave com volume de compra crescente.", priceAtSignal: 86.69, stopLoss: 84.96, takeProfit: 91.02, createdAt: new Date(Date.now() - 300000).toISOString() },
  { id: "s4", symbol: "BNBUSDT", action: "SELL", confidence: 0.7, reasoning: "Divergência baixista no RSI. Nível de suporte em risco.", priceAtSignal: 656.82, stopLoss: 669.96, takeProfit: 623.98, createdAt: new Date(Date.now() - 420000).toISOString() },
  { id: "s5", symbol: "ADAUSDT", action: "SELL", confidence: 0.65, reasoning: "Falhou em manter suporte. Momento baixista aumentando.", priceAtSignal: 0.2554, stopLoss: 0.2605, takeProfit: 0.2426, createdAt: new Date(Date.now() - 540000).toISOString() },
  { id: "s6", symbol: "ATOMUSDT", action: "BUY", confidence: 0.88, reasoning: "Forte rompimento acima da resistência com confirmação de volume.", priceAtSignal: 2.043, stopLoss: 2.002, takeProfit: 2.145, createdAt: new Date(Date.now() - 660000).toISOString() },
];

const MOCK_PORTFOLIO: import("@/lib/store").PortfolioData = {
  totalValue: 10412.50,
  cashBalance: 6234.5,
  assetBalance: 4178.0,
  assetQuantity: 0.0534,
  pnl: 412.50,
  pnlPercent: 4.13,
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
    setPortfolio,
    setBotActive,
  } = useCryptoStore();

  // Connect to real Binance data
  useBinanceData(); // Fetches initial data + periodic refresh (60s fallback)
  useBinanceStream(); // Real-time Socket.IO updates
  useKeyboardShortcuts(); // Global keyboard shortcuts

  // Initialize with fallback data, then real data will replace it
  useEffect(() => {
    setTickers(FALLBACK_TICKERS);
    setTrades(MOCK_TRADES);
    setAiSignals(MOCK_AI_SIGNALS);
    setPortfolio(MOCK_PORTFOLIO);
    setBotActive(true);
  }, [setTickers, setTrades, setAiSignals, setPortfolio, setBotActive]);

  const renderContent = () => {
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
            <motion.div variants={itemVariants}>
              <StatCards />
            </motion.div>
            <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <FearGreedIndex />
              <MultiTimeframeAnalysis />
            </motion.div>
            <motion.div variants={itemVariants}>
              <SLTPCalculator />
            </motion.div>
            <motion.div variants={itemVariants}>
              <PnlTracker />
            </motion.div>
            <motion.div variants={itemVariants}>
              <PortfolioRebalancing />
            </motion.div>
            <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <MarketOverview />
              <FundingRates />
            </motion.div>
            <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <MarketSentiment />
              <MarketHighlights />
              <PortfolioAllocation />
            </motion.div>
            <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <MarketTable />
              </div>
              <div className="space-y-4">
                <Watchlist />
                <PriceAlerts />
              </div>
            </motion.div>
            <motion.div variants={itemVariants}>
              <CorrelationHeatmap />
            </motion.div>
            <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <WhaleTracker />
              <LiquidationHeatmap />
            </motion.div>
            <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SocialSentiment />
              <OnChainAnalytics />
            </motion.div>
            <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <AISignals />
              </div>
              <RecentTrades />
            </motion.div>
            <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TradingCalculator />
              <CryptoNews />
            </motion.div>
            <motion.div variants={itemVariants}>
              <StrategyComparison />
            </motion.div>
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
          <Header />
          <TickerTape />
          <main className="flex-1 p-3 md:p-5 overflow-y-auto pb-20 md:pb-5 cyan-scrollbar scroll-smooth">
            <AnimatePresence mode="wait">
              {renderContent()}
            </AnimatePresence>
          </main>
          <Footer />
        </div>
      </div>
      <ShortcutsHint />
    </div>
  );
}
