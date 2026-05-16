"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useCryptoStore, type TradeData } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BotConfigForm } from "./bot-config-form";
import { BotActivityLog } from "./bot-activity-log";
import { BotPortfolio } from "./bot-portfolio";
import {
  Play,
  Square,
  Bot,
  Zap,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  FileText,
  Clock,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface TradeReport {
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  totalPnl: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  avgPnlPerTrade: number;
  bestTrade: number;
  worstTrade: number;
  duration: string;
}

export function BotSection() {
  const {
    botActive,
    setBotActive,
    botConfig,
    tradingMode,
    setPortfolio,
    addTrade,
    trades,
    portfolio,
    tickers,
    aiSignals,
  } = useCryptoStore();

  const { toast } = useToast();

  const [tradeReport, setTradeReport] = useState<TradeReport | null>(null);
  const tradeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const botStartTimeRef = useRef<Date | null>(null);

  const ticker = tickers[botConfig.symbol];
  const currentPrice = ticker?.price ?? 78000;

  const generateMockTrade = useCallback(() => {
    const side = Math.random() > 0.5 ? "BUY" : "SELL" as const;
    const quantity = parseFloat((0.001 + Math.random() * 0.05).toFixed(6));
    const priceVariation = currentPrice * (0.999 + Math.random() * 0.002);
    const price = parseFloat(priceVariation.toFixed(2));
    const total = parseFloat((price * quantity).toFixed(2));
    const pnl = side === "SELL" ? parseFloat(((Math.random() - 0.4) * 50).toFixed(2)) : 0;

    const trade: TradeData = {
      id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      symbol: botConfig.symbol,
      side,
      price,
      quantity,
      total,
      strategy: botConfig.strategy,
      mode: tradingMode,
      pnl,
      timestamp: new Date().toISOString(),
    };

    return trade;
  }, [currentPrice, botConfig.symbol, botConfig.strategy, tradingMode]);

  const updatePortfolioWithTrade = useCallback((trade: TradeData) => {
    const portfolio_ = useCryptoStore.getState().portfolio;
    const config = useCryptoStore.getState().botConfig;

    let newCash = portfolio_.cashBalance;
    let newAssetQty = portfolio_.assetQuantity;
    let newPnl = portfolio_.pnl;

    if (trade.side === "BUY") {
      newCash -= trade.total;
      newAssetQty += trade.quantity;
    } else {
      newCash += trade.total;
      newAssetQty -= trade.quantity;
      newPnl += trade.pnl;
    }

    // Ensure no negative values
    newCash = Math.max(0, newCash);
    newAssetQty = Math.max(0, newAssetQty);

    const currentTicker = useCryptoStore.getState().tickers[config.symbol];
    const assetPrice = currentTicker?.price ?? 0;
    const newAssetBalance = newAssetQty * assetPrice;
    const newTotalValue = newCash + newAssetBalance;
    const initialBalance = config.initialBalance;
    const newPnlPercent = ((newTotalValue - initialBalance) / initialBalance) * 100;

    useCryptoStore.getState().setPortfolio({
      totalValue: newTotalValue,
      cashBalance: newCash,
      assetBalance: newAssetBalance,
      assetQuantity: newAssetQty,
      pnl: newPnl,
      pnlPercent: newPnlPercent,
    });
  }, []);

  // Auto-trade from AI signals
  const processedSignalIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!botActive || !botConfig.autoTradeSignals) return;

    const threshold = botConfig.signalConfidenceThreshold / 100;

    for (const signal of aiSignals) {
      // Skip already processed signals
      if (processedSignalIdsRef.current.has(signal.id)) continue;

      // Skip HOLD signals
      if (signal.action === "HOLD") continue;

      // Check confidence threshold
      if (signal.confidence < threshold) continue;

      // Mark as processed
      processedSignalIdsRef.current.add(signal.id);

      // Generate trade from signal
      const signalTicker = tickers[signal.symbol];
      const price = signalTicker?.price ?? signal.priceAtSignal;
      const quantity = parseFloat((0.001 + Math.random() * 0.03).toFixed(6));
      const total = parseFloat((price * quantity).toFixed(2));
      const pnl = signal.action === "SELL" ? parseFloat(((Math.random() - 0.3) * 40).toFixed(2)) : 0;

      const trade: TradeData = {
        id: `signal-trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        symbol: signal.symbol,
        side: signal.action as "BUY" | "SELL",
        price,
        quantity,
        total,
        strategy: "AI-Signal",
        mode: tradingMode,
        pnl,
        timestamp: new Date().toISOString(),
      };

      addTrade(trade);
      updatePortfolioWithTrade(trade);

      // Show toast for signal auto-trade
      toast({
        title: `⚡ Auto-Trade: ${trade.side === "BUY" ? "Bought" : "Sold"} ${trade.symbol.replace("USDT", "")}`,
        description: `Signal confidence ${(signal.confidence * 100).toFixed(0)}% | ${quantity.toFixed(6)} @ $${formatPrice(price)}`,
        variant: "default",
      });

      // Persist trade to database
      fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trade),
      }).catch(() => {});
    }
  }, [aiSignals, botActive, botConfig.autoTradeSignals, botConfig.signalConfidenceThreshold, tickers, tradingMode, addTrade, updatePortfolioWithTrade, toast]);

  // Start/stop trade generation
  useEffect(() => {
    if (botActive) {
      botStartTimeRef.current = new Date();

      // Generate first trade after 5s, then every 10-15s
      const scheduleNextTrade = () => {
        const delay = 10000 + Math.random() * 5000;
        return setTimeout(() => {
          if (!useCryptoStore.getState().botActive) return;

          const trade = generateMockTrade();
          addTrade(trade);
          updatePortfolioWithTrade(trade);

          // Show toast for bot trade
          toast({
            title: `🤖 Bot ${trade.side === "BUY" ? "Bought" : "Sold"} ${trade.symbol.replace("USDT", "")}`,
            description: `${trade.quantity.toFixed(6)} @ $${formatPrice(trade.price)}`,
          });

          // Persist trade to database
          fetch("/api/trades", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(trade),
          }).catch(() => {});

          // Schedule next
          tradeIntervalRef.current = scheduleNextTrade() as unknown as ReturnType<typeof setInterval>;
        }, delay);
      };

      tradeIntervalRef.current = scheduleNextTrade() as unknown as ReturnType<typeof setInterval>;

      return () => {
        if (tradeIntervalRef.current) {
          clearTimeout(tradeIntervalRef.current as unknown as ReturnType<typeof setTimeout>);
        }
      };
    } else {
      // Bot stopped - generate trade report
      if (botStartTimeRef.current && trades.length > 0) {
        const botTrades = trades.filter(
          (t) => new Date(t.timestamp) >= botStartTimeRef.current!
        );
        const buyTrades = botTrades.filter((t) => t.side === "BUY");
        const sellTrades = botTrades.filter((t) => t.side === "SELL");
        const pnlTrades = botTrades.filter((t) => t.pnl !== 0);
        const winTrades = pnlTrades.filter((t) => t.pnl > 0);
        const lossTrades = pnlTrades.filter((t) => t.pnl < 0);
        const totalPnl = botTrades.reduce((sum, t) => sum + t.pnl, 0);
        const duration = botStartTimeRef.current
          ? Math.round((Date.now() - botStartTimeRef.current.getTime()) / 1000)
          : 0;

        setTradeReport({
          totalTrades: botTrades.length,
          buyTrades: buyTrades.length,
          sellTrades: sellTrades.length,
          totalPnl,
          winTrades: winTrades.length,
          lossTrades: lossTrades.length,
          winRate: pnlTrades.length > 0 ? (winTrades.length / pnlTrades.length) * 100 : 0,
          avgPnlPerTrade: botTrades.length > 0 ? totalPnl / botTrades.length : 0,
          bestTrade: pnlTrades.length > 0 ? Math.max(...pnlTrades.map((t) => t.pnl)) : 0,
          worstTrade: pnlTrades.length > 0 ? Math.min(...pnlTrades.map((t) => t.pnl)) : 0,
          duration:
            duration < 60
              ? `${duration}s`
              : duration < 3600
                ? `${Math.floor(duration / 60)}m ${duration % 60}s`
                : `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`,
        });
      }

      if (tradeIntervalRef.current) {
        clearTimeout(tradeIntervalRef.current as unknown as ReturnType<typeof setTimeout>);
      }
    }
  }, [botActive]);

  const toggleBot = () => {
    if (botActive) {
      setBotActive(false);
    } else {
      setBotActive(true);
      setTradeReport(null);
      // Reset portfolio when starting
      if (trades.length === 0) {
        setPortfolio({
          totalValue: botConfig.initialBalance,
          cashBalance: botConfig.initialBalance,
          assetBalance: 0,
          assetQuantity: 0,
          pnl: 0,
          pnlPercent: 0,
        });
      }
    }
  };

  return (
    <motion.div
      key="bot"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Bot Control Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 glass rounded-xl p-4 border border-border/50 relative overflow-hidden">
        {/* Gradient accent at top */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-crypto-cyan/40 to-transparent" />
        <Button
          onClick={toggleBot}
          size="lg"
          className={`relative overflow-hidden h-12 px-8 text-base font-semibold transition-all min-w-[160px] touch-target ${
            botActive
              ? "btn-gradient-red text-white shadow-lg shadow-crypto-red/20"
              : "btn-gradient-green text-white shadow-lg shadow-crypto-green/20"
          }`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={botActive ? "stop" : "start"}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2"
            >
              {botActive ? (
                <>
                  <Square className="w-5 h-5" />
                  STOP BOT
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  START BOT
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </Button>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Status indicator */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  botActive ? "bg-crypto-green glow-green-sm" : "bg-muted-foreground/50"
                }`}
                style={botActive ? { boxShadow: "0 0 8px #22c55e" } : undefined}
              />
              {botActive && (
                <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-crypto-green animate-ping" />
              )}
            </div>
            <span className="text-sm font-medium">
              {botActive ? "Active" : "Inactive"}
            </span>
          </div>

          {/* Strategy Badge */}
          <Badge
            variant="outline"
            className="border-crypto-cyan/30 text-crypto-cyan text-xs"
          >
            <Bot className="w-3 h-3 mr-1" />
            {botConfig.strategy}
          </Badge>

          {/* Trading Mode Badge */}
          <Badge
            className={`text-xs ${
              tradingMode === "paper"
                ? "bg-crypto-cyan/15 text-crypto-cyan border-crypto-cyan/30"
                : "bg-crypto-red/15 text-crypto-red border-crypto-red/30"
            }`}
          >
            <Zap className="w-3 h-3 mr-1" />
            {tradingMode === "paper" ? "Paper" : "Live"}
          </Badge>

          {/* Symbol Badge */}
          <Badge variant="outline" className="text-xs border-border">
            {botConfig.symbol}
          </Badge>
        </div>

        {/* Real-time PnL Counter */}
        {botActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="ml-auto flex items-center gap-2"
          >
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${
                portfolio.pnl >= 0
                  ? "bg-crypto-green/10 text-crypto-green"
                  : "bg-crypto-red/10 text-crypto-red"
              }`}
            >
              {portfolio.pnl >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span className="text-sm font-semibold">
                {portfolio.pnl >= 0 ? "+" : ""}
                ${formatPrice(Math.abs(portfolio.pnl))}
              </span>
              <span className="text-xs opacity-75">
                ({portfolio.pnl >= 0 ? "+" : ""}
                {portfolio.pnlPercent.toFixed(2)}%)
              </span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Trade Report (shown when bot is stopped) */}
      <AnimatePresence>
        {tradeReport && !botActive && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="bg-card/60 backdrop-blur-md border border-white/5 overflow-hidden relative">
              {/* Gradient border effect */}
              <div className="absolute inset-0 rounded-xl p-[1px] bg-gradient-to-r from-crypto-cyan/30 via-crypto-green/30 to-crypto-gold/30 pointer-events-none" />
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4 text-crypto-cyan" />
                  Trade Report
                  <Badge variant="outline" className="text-[10px] border-border ml-1">
                    <Clock className="w-2.5 h-2.5 mr-1" />
                    {tradeReport.duration}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Total Trades */}
                  <div className="bg-secondary/30 rounded-lg p-3 text-center">
                    <BarChart3 className="w-4 h-4 mx-auto mb-1 text-crypto-cyan" />
                    <div className="text-lg font-bold">{tradeReport.totalTrades}</div>
                    <div className="text-[10px] text-muted-foreground">Total Trades</div>
                  </div>

                  {/* Win Rate */}
                  <div className="bg-secondary/30 rounded-lg p-3 text-center">
                    <TrendingUp className="w-4 h-4 mx-auto mb-1 text-crypto-green" />
                    <div className="text-lg font-bold text-crypto-green">
                      {tradeReport.winRate.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Win Rate ({tradeReport.winTrades}W / {tradeReport.lossTrades}L)
                    </div>
                  </div>

                  {/* Total PnL */}
                  <div className="bg-secondary/30 rounded-lg p-3 text-center">
                    <DollarSign
                      className={`w-4 h-4 mx-auto mb-1 ${
                        tradeReport.totalPnl >= 0 ? "text-crypto-green" : "text-crypto-red"
                      }`}
                    />
                    <div
                      className={`text-lg font-bold ${
                        tradeReport.totalPnl >= 0 ? "text-crypto-green" : "text-crypto-red"
                      }`}
                    >
                      {tradeReport.totalPnl >= 0 ? "+" : ""}$
                      {formatPrice(Math.abs(tradeReport.totalPnl))}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Total PnL</div>
                  </div>

                  {/* Buy/Sell */}
                  <div className="bg-secondary/30 rounded-lg p-3 text-center">
                    <div className="flex justify-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-crypto-green" />
                      <TrendingDown className="w-4 h-4 text-crypto-red" />
                    </div>
                    <div className="text-lg font-bold">
                      <span className="text-crypto-green">{tradeReport.buyTrades}</span>
                      {" / "}
                      <span className="text-crypto-red">{tradeReport.sellTrades}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">Buy / Sell</div>
                  </div>
                </div>

                {/* Additional Stats */}
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Best Trade</div>
                    <div className="text-sm font-semibold text-crypto-green">
                      +${formatPrice(Math.abs(tradeReport.bestTrade))}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Worst Trade</div>
                    <div className="text-sm font-semibold text-crypto-red">
                      -${formatPrice(Math.abs(tradeReport.worstTrade))}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Avg PnL/Trade</div>
                    <div
                      className={`text-sm font-semibold ${
                        tradeReport.avgPnlPerTrade >= 0 ? "text-crypto-green" : "text-crypto-red"
                      }`}
                    >
                      {tradeReport.avgPnlPerTrade >= 0 ? "+" : ""}$
                      {formatPrice(Math.abs(tradeReport.avgPnlPerTrade))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Config Form */}
        <div className="lg:col-span-1">
          <BotConfigForm />
        </div>

        {/* Right: Activity Log + Portfolio */}
        <div className="lg:col-span-2 space-y-4">
          <BotActivityLog />
          <BotPortfolio />
        </div>
      </div>
    </motion.div>
  );
}
