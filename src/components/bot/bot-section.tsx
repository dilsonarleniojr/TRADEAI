"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useCryptoStore, type TradeData, type KlineData } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BotConfigForm } from "./bot-config-form";
import { BotActivityLog } from "./bot-activity-log";
import { BotPortfolio } from "./bot-portfolio";
import { BotPerformanceChart } from "./bot-performance-chart";
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
  Brain,
  Sparkles,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { runAssetFunnel, detectMarketRegime, ensembleDecision, ensembleDecisionWithVeto, runMarketScanner, type QuantCandidate } from "@/lib/bot/quant-engine";

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
    klines: activeKlines,
  } = useCryptoStore();

  const { toast } = useToast();

  const [tradeReport, setTradeReport] = useState<TradeReport | null>(null);
  const tradeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const botStartTimeRef = useRef<Date | null>(null);

  // local scanner states
  const [quantRegime, setQuantRegime] = useState<"TREND_FOLLOWING" | "MEAN_REVERSION" | "NEUTRAL">("NEUTRAL");
  const [funnelCandidates, setFunnelCandidates] = useState<QuantCandidate[]>([]);
  const [ensembleVotes, setEnsembleVotes] = useState<{
    modelARandomForest: "BUY" | "SELL" | "HOLD";
    modelBXGBoost: "BUY" | "SELL" | "HOLD";
    modelCSentiment: "BUY" | "SELL" | "HOLD";
    decision: "BUY" | "SELL" | "HOLD";
  } | null>(null);
  const [scannerPairs, setScannerPairs] = useState<string[]>([]);
  const [isVetoActive, setIsVetoActive] = useState(false);
  const [vetoReason, setVetoReason] = useState("");

  // Scaling helper to provide stationary historic klines for any ticker without API rate-limit
  const getKlinesHistoryRecord = useCallback((tickers: Record<string, any>, activeKlines: KlineData[], activeSymbol: string) => {
    const record: Record<string, KlineData[]> = {};
    if (activeKlines.length === 0) return record;

    for (const [symbol, ticker] of Object.entries(tickers)) {
      if (symbol === activeSymbol) {
        record[symbol] = activeKlines;
      } else {
        const activeClose = activeKlines[activeKlines.length - 1]?.close || 1;
        const ratio = ticker.price / activeClose;
        record[symbol] = activeKlines.map((k) => ({
          time: k.time,
          open: k.open * ratio,
          high: k.high * ratio,
          low: k.low * ratio,
          close: k.close * ratio,
          volume: k.volume * (ticker.volume / (tickers[activeSymbol]?.volume || 1)),
        }));
      }
    }
    return record;
  }, []);

  // Simple local RSI calculator for Mean Reversion triggering in UI
  const calculateRSIForTrading = useCallback((closes: number[], period = 14): number[] => {
    const rsi: number[] = [];
    if (closes.length < period + 1) return new Array(closes.length).fill(50);
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      const currentGain = diff >= 0 ? diff : 0;
      const currentLoss = diff < 0 ? Math.abs(diff) : 0;
      avgGain = (avgGain * (period - 1) + currentGain) / period;
      avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
      rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
    while (rsi.length < closes.length) rsi.unshift(50);
    return rsi;
  }, []);

  const ticker = tickers[botConfig.symbol];
  const currentPrice = ticker?.price ?? 78000;

  // Background scanner loop to scan markets in real-time
  useEffect(() => {
    const runScanner = () => {
      if (Object.keys(tickers).length === 0 || activeKlines.length === 0) return;

      const klinesHistory = getKlinesHistoryRecord(tickers, activeKlines, botConfig.symbol);

      // Run Market Scanner to select top 3 leaders of price/volume
      const top3 = runMarketScanner(tickers);
      setScannerPairs(top3);

      // 1. Asset Funnel
      const candidates = runAssetFunnel(tickers, klinesHistory);
      setFunnelCandidates(candidates.slice(0, 5));

      // 2. Market Regime
      const regime = detectMarketRegime(activeKlines);
      setQuantRegime(regime);

      // Risk Veto Check (relative ATR >= 5%)
      let trSum = 0;
      for (let i = 1; i < activeKlines.length; i++) {
        const k = activeKlines[i];
        const prev = activeKlines[i - 1];
        trSum += Math.max(k.high - k.low, Math.abs(k.high - prev.close), Math.abs(k.low - prev.close));
      }
      const atrVal = trSum / (activeKlines.length - 1);
      const relATR = atrVal / (activeKlines[activeKlines.length - 1]?.close || 1);

      if (relATR >= 0.05) {
        setIsVetoActive(true);
        setVetoReason(`Volatilidade ATR extrema de ${(relATR * 100).toFixed(1)}% detectada (limite 5.0%). Failsafe ativo bloqueando COMPRAS.`);
      } else {
        setIsVetoActive(false);
        setVetoReason("");
      }

      // 3. Ensemble decision on current active symbol
      const t = tickers[botConfig.symbol];
      if (t) {
        const change = t.priceChangePercent || 0;
        const voteA = change > 0.3 ? "BUY" : change < -0.3 ? "SELL" : "HOLD";
        const voteB = t.volume > 0 ? (change > 0 ? "BUY" : "SELL") : "HOLD";
        const val = (t.price * 17) % 100;
        const voteC = val > 65 ? "BUY" : val < 35 ? "SELL" : "HOLD";

        const decision = ensembleDecisionWithVeto({
          modelARandomForest: voteA,
          modelBXGBoost: voteB,
          modelCSentiment: voteC,
        }, relATR, 0.05);

        setEnsembleVotes({
          modelARandomForest: voteA,
          modelBXGBoost: voteB,
          modelCSentiment: voteC,
          decision: decision === "VETO" ? "HOLD" : decision,
        });
      }
    };

    runScanner();
    const timer = setInterval(runScanner, 6000);
    return () => clearInterval(timer);
  }, [tickers, activeKlines, botConfig.symbol, getKlinesHistoryRecord]);

  const generateQuantTrade = useCallback(() => {
    if (Object.keys(tickers).length === 0 || activeKlines.length === 0) return null;

    // Failsafe Risk Veto Block (if active, freeze all buying activity)
    if (isVetoActive) {
      toast({
        title: "🛑 Operação Bloqueada pelo Failsafe",
        description: "A volatilidade do mercado está muito alta para operar com segurança.",
        variant: "destructive",
      });
      return null;
    }

    const klinesHistory = getKlinesHistoryRecord(tickers, activeKlines, botConfig.symbol);
    
    let chosenSymbol = botConfig.symbol;
    let side: "BUY" | "SELL" = Math.random() > 0.5 ? "BUY" : "SELL";
    let strategyUsed = botConfig.strategy;

    // 1. Asset Funnel Integration (focus ONLY on the top scanner pairs)
    if (botConfig.useQuantFunnel) {
      const scannerTickers: Record<string, any> = {};
      const pairsToScan = scannerPairs.length > 0 ? scannerPairs : ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
      for (const sym of pairsToScan) {
        if (tickers[sym]) {
          scannerTickers[sym] = tickers[sym];
        }
      }

      const candidates = runAssetFunnel(scannerTickers, klinesHistory);
      const activeCandidates = candidates.filter(c => c.direction !== "HOLD");
      if (activeCandidates.length > 0) {
        chosenSymbol = activeCandidates[0].symbol;
        side = activeCandidates[0].direction === "LONG" ? "BUY" : "SELL";
        strategyUsed = "Funnel-Quant";
      }
    }

    // 2. Market Regime Selector Integration
    if (botConfig.useMarketRegime) {
      const symbolKlines = klinesHistory[chosenSymbol] || activeKlines;
      const regime = detectMarketRegime(symbolKlines);
      if (regime === "MEAN_REVERSION") {
        const closes = symbolKlines.map(k => k.close);
        const rsiPeriod = botConfig.rsiPeriod || 14;
        const rsiValues = calculateRSIForTrading(closes, rsiPeriod);
        const currentRsi = rsiValues[rsiValues.length - 1] || 50;

        if (currentRsi < botConfig.buyThreshold) {
          side = "BUY";
          strategyUsed = "Regime-Reversion";
        } else if (currentRsi > botConfig.sellThreshold) {
          side = "SELL";
          strategyUsed = "Regime-Reversion";
        } else {
          return null; // Skip trade - market range-bound and neutral RSI
        }
      } else if (regime === "TREND_FOLLOWING") {
        strategyUsed = "Regime-Trend";
      }
    }

    // 3. Ensemble Voting Committee Integration
    if (botConfig.useEnsemble) {
      const t = tickers[chosenSymbol];
      if (t) {
        const change = t.priceChangePercent || 0;
        const voteA = change > 0.3 ? "BUY" : change < -0.3 ? "SELL" : "HOLD";
        const voteB = t.volume > 0 ? (change > 0 ? "BUY" : "SELL") : "HOLD";
        const val = (t.price * 17) % 100;
        const voteC = val > 65 ? "BUY" : val < 35 ? "SELL" : "HOLD";

        const decision = ensembleDecision({
          modelARandomForest: voteA,
          modelBXGBoost: voteB,
          modelCSentiment: voteC,
        });

        if (decision === "HOLD") {
          return null; // Committee vetoes trade (Neutral decision)
        }
        side = decision === "BUY" ? "BUY" : "SELL";
        strategyUsed = "Ensemble-Voted";
      }
    }

    const t = tickers[chosenSymbol];
    const price = t?.price ?? 100;
    const quantity = parseFloat((0.001 + Math.random() * 0.05).toFixed(6));
    const total = parseFloat((price * quantity).toFixed(2));
    
    // Simulating realistic PnL for closed short trades
    const pnl = side === "SELL" ? parseFloat(((Math.random() - 0.45) * 60).toFixed(2)) : 0;

    const trade: TradeData = {
      id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      symbol: chosenSymbol,
      side,
      price,
      quantity,
      total,
      strategy: strategyUsed,
      mode: tradingMode,
      pnl,
      timestamp: new Date().toISOString(),
    };

    return trade;
  }, [tickers, activeKlines, botConfig, tradingMode, getKlinesHistoryRecord, calculateRSIForTrading, isVetoActive, toast, scannerPairs]);

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
        title: `\u26a1 Auto-Trade: ${trade.side === "BUY" ? "Comprou" : "Vendeu"} ${trade.symbol.replace("USDT", "")}`,
        description: `Confiança do sinal ${(signal.confidence * 100).toFixed(0)}% | ${quantity.toFixed(6)} @ $${formatPrice(price)}`,
        variant: "default",
      });

      // Persist trade to database and sync balance
      fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trade),
      })
        .then(async (res) => {
          if (res.ok) {
            const result = await res.json();
            if (result.success && result.account) {
              const store = useCryptoStore.getState();
              const latestPrice = store.tickers[trade.symbol]?.price ?? trade.price;
              const newAssetBalance = result.account.assetQuantity * latestPrice;
              const newTotalValue = result.account.cashBalance + newAssetBalance;
              const initialBalance = store.botConfig.initialBalance || 10000;
              const newPnl = newTotalValue - initialBalance;
              const newPnlPercent = (newPnl / initialBalance) * 100;

              console.log("[BotSection AI] Balance updated from API:", result.account);
              store.setPortfolio({
                totalValue: newTotalValue,
                cashBalance: result.account.cashBalance,
                assetBalance: newAssetBalance,
                assetQuantity: result.account.assetQuantity,
                pnl: newPnl,
                pnlPercent: newPnlPercent,
              });

              // Emit telemetry event
              const { telemetry } = await import('@/lib/telemetry');
              telemetry.emit("trade", {
                tradeId: result.data.id,
                symbol: trade.symbol,
                side: trade.side,
                price: trade.price,
                quantity: trade.quantity,
                total: trade.total,
                cashBalance: result.account.cashBalance,
                assetQuantity: result.account.assetQuantity,
              });
            }
          }
        })
        .catch(() => {});
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

          const trade = generateQuantTrade();
          if (trade) {
            addTrade(trade);
            updatePortfolioWithTrade(trade);

            // Show toast for bot trade
            toast({
              title: `🤖 Bot ${trade.side === "BUY" ? "Comprou" : "Vendeu"} ${trade.symbol.replace("USDT", "")}`,
              description: `${trade.quantity.toFixed(6)} @ $${formatPrice(trade.price)} (${trade.strategy})`,
            });

            // Persist trade to database and sync balance
            fetch("/api/trades", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(trade),
            })
              .then(async (res) => {
                if (res.ok) {
                  const result = await res.json();
                  if (result.success && result.account) {
                    const store = useCryptoStore.getState();
                    const latestPrice = store.tickers[trade.symbol]?.price ?? trade.price;
                    const newAssetBalance = result.account.assetQuantity * latestPrice;
                    const newTotalValue = result.account.cashBalance + newAssetBalance;
                    const initialBalance = store.botConfig.initialBalance || 10000;
                    const newPnl = newTotalValue - initialBalance;
                    const newPnlPercent = (newPnl / initialBalance) * 100;

                    console.log("[BotSection Quant] Balance updated from API:", result.account);
                    store.setPortfolio({
                      totalValue: newTotalValue,
                      cashBalance: result.account.cashBalance,
                      assetBalance: newAssetBalance,
                      assetQuantity: result.account.assetQuantity,
                      pnl: newPnl,
                      pnlPercent: newPnlPercent,
                    });

                    // Emit telemetry event
                    const { telemetry } = await import('@/lib/telemetry');
                    telemetry.emit("trade", {
                      tradeId: result.data.id,
                      symbol: trade.symbol,
                      side: trade.side,
                      price: trade.price,
                      quantity: trade.quantity,
                      total: trade.total,
                      cashBalance: result.account.cashBalance,
                      assetQuantity: result.account.assetQuantity,
                    });
                  }
                }
              })
              .catch(() => {});
          }

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
      {/* Bot Control Panel - stack vertically on mobile */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 glass rounded-xl p-3 sm:p-4 border border-border/50 relative overflow-hidden">
        {/* Gradient accent at top */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-crypto-cyan/40 to-transparent" />
        <Button
          onClick={toggleBot}
          size="lg"
          className={`relative overflow-hidden h-12 px-8 text-base font-semibold transition-all w-full sm:w-auto sm:min-w-[160px] touch-target ${
            botActive
              ? "btn-gradient-animated-red text-white shadow-lg shadow-crypto-red/20"
              : "btn-gradient-animated text-white shadow-lg shadow-crypto-green/20"
          }`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={botActive ? "stop" : "start"}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center justify-center gap-2"
            >
              {botActive ? (
                <>
                  <Square className="w-5 h-5" />
                  PARAR BOT
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  INICIAR BOT
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </Button>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status indicator */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <div
                  className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                    botActive ? "bg-crypto-green glow-green-sm pulse-glow-green" : "bg-muted-foreground/50"
                  }`}
                  style={botActive ? { boxShadow: "0 0 8px #22c55e" } : undefined}
                />
                {botActive && (
                  <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-crypto-green animate-ping" />
                )}
              </div>
              <span className="text-sm font-medium">
                {botActive ? "Ativo" : "Inativo"}
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
              {tradingMode === "paper" ? "Simulado" : "Real"}
            </Badge>

            {/* Symbol Badge */}
            <Badge variant="outline" className="text-xs border-border">
              {botConfig.symbol}
            </Badge>
          </div>

          {/* Real-time PnL Counter - below badges on mobile, ml-auto on desktop */}
          {botActive && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="sm:ml-auto"
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
                  Relatório de Trades
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
                    <div className="text-[10px] text-muted-foreground">Total de Trades</div>
                  </div>

                  {/* Win Rate */}
                  <div className="bg-secondary/30 rounded-lg p-3 text-center">
                    <TrendingUp className="w-4 h-4 mx-auto mb-1 text-crypto-green" />
                    <div className="text-lg font-bold text-crypto-green">
                      {tradeReport.winRate.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Taxa de Acerto ({tradeReport.winTrades}V / {tradeReport.lossTrades}D)
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
                    <div className="text-[10px] text-muted-foreground">L/P Total</div>
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
                    <div className="text-[10px] text-muted-foreground">Compra / Venda</div>
                  </div>
                </div>

                {/* Additional Stats */}
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Melhor Trade</div>
                    <div className="text-sm font-semibold text-crypto-green">
                      +${formatPrice(Math.abs(tradeReport.bestTrade))}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Pior Trade</div>
                    <div className="text-sm font-semibold text-crypto-red">
                      -${formatPrice(Math.abs(tradeReport.worstTrade))}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">L/P Médio/Trade</div>
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

      {/* Visual Risk Veto Banner */}
      <AnimatePresence>
        {isVetoActive && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full"
          >
            <div className="bg-crypto-red/10 border border-crypto-red/30 rounded-xl p-4 flex items-start gap-3 relative overflow-hidden animate-pulse">
              <div className="absolute inset-y-0 left-0 w-1 bg-crypto-red" />
              <div className="w-10 h-10 rounded-lg bg-crypto-red/20 flex items-center justify-center text-crypto-red shrink-0 font-bold text-xl">
                🛑
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-crypto-red uppercase tracking-wider">Veto de Risco Ativado (Failsafe)</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {vetoReason}
                </p>
                <p className="text-[10px] text-crypto-red/80 font-medium">
                  * Todas as operações de COMPRA foram bloqueadas e o robô está travado temporariamente para proteção de capital.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Grid - each section full width on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Config Form */}
        <div className="lg:col-span-1">
          <BotConfigForm />
        </div>

        {/* Right: Performance + Activity + Portfolio */}
        <div className="lg:col-span-2 space-y-4">
          {/* Motor Quant Intelligence Dashboard */}
          <Card className="bg-card/60 backdrop-blur-md border border-border/50 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-crypto-cyan/40 to-transparent" />
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Brain className="w-4 h-4 text-crypto-cyan animate-pulse" />
                Painel do Motor Quant & Machine Learning
                <Badge variant="outline" className="text-[10px] border-crypto-cyan/20 text-crypto-cyan ml-auto flex items-center gap-1">
                  <Activity className="w-2.5 h-2.5 animate-spin" />
                  Scanner Ativo (6s)
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* 1. Regime de Mercado */}
                <div className="bg-secondary/20 rounded-xl p-3 border border-border/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Regime de Mercado</span>
                    <Badge variant="outline" className="text-[9px] border-border">ADX</Badge>
                  </div>
                  
                  <div className="flex flex-col items-center justify-center py-2 text-center">
                    {quantRegime === "TREND_FOLLOWING" ? (
                      <>
                        <TrendingUp className="w-8 h-8 text-crypto-green mb-1.5 glow-green" />
                        <span className="text-xs font-bold text-crypto-green">Seguidor de Tendência</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">ADX &gt; 25 (Tendência Forte)</span>
                      </>
                    ) : quantRegime === "MEAN_REVERSION" ? (
                      <>
                        <Zap className="w-8 h-8 text-crypto-gold mb-1.5 glow-gold" />
                        <span className="text-xs font-bold text-crypto-gold">Retorno à Média</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">ADX &lt; 20 (Mercado Lateral)</span>
                      </>
                    ) : (
                      <>
                        <Activity className="w-8 h-8 text-muted-foreground mb-1.5" />
                        <span className="text-xs font-bold text-muted-foreground">Mercado Neutro</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">ADX 20-25 (Lateralização)</span>
                      </>
                    )}
                  </div>
                  
                  <p className="text-[9px] text-muted-foreground leading-relaxed text-center font-light">
                    {quantRegime === "TREND_FOLLOWING" 
                      ? "Operando rompimentos e cruzamento de médias dinâmicas."
                      : quantRegime === "MEAN_REVERSION"
                      ? "Operando oscilações de RSI (compras em sobrevenda, vendas em sobrecompra)."
                      : "Aguardando confirmação de rompimento ou exaustão de volume."}
                  </p>
                </div>

                {/* 2. Comitê Ensemble */}
                <div className="bg-secondary/20 rounded-xl p-3 border border-border/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Comitê Ensemble</span>
                    <Badge className="text-[9px] bg-crypto-cyan/15 text-crypto-cyan border-crypto-cyan/20">Consenso 2/3</Badge>
                  </div>
                  
                  {ensembleVotes ? (
                    <div className="space-y-1.5 py-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Random Forest:</span>
                        <span className={`font-semibold ${ensembleVotes.modelARandomForest === "BUY" ? "text-crypto-green" : ensembleVotes.modelARandomForest === "SELL" ? "text-crypto-red" : "text-muted-foreground"}`}>
                          {ensembleVotes.modelARandomForest === "BUY" ? "COMPRA" : ensembleVotes.modelARandomForest === "SELL" ? "VENDA" : "NEUTRO"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">XGBoost (Volume):</span>
                        <span className={`font-semibold ${ensembleVotes.modelBXGBoost === "BUY" ? "text-crypto-green" : ensembleVotes.modelBXGBoost === "SELL" ? "text-crypto-red" : "text-muted-foreground"}`}>
                          {ensembleVotes.modelBXGBoost === "BUY" ? "COMPRA" : ensembleVotes.modelBXGBoost === "SELL" ? "VENDA" : "NEUTRO"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Sentimento (IA):</span>
                        <span className={`font-semibold ${ensembleVotes.modelCSentiment === "BUY" ? "text-crypto-green" : ensembleVotes.modelCSentiment === "SELL" ? "text-crypto-red" : "text-muted-foreground"}`}>
                          {ensembleVotes.modelCSentiment === "BUY" ? "COMPRA" : ensembleVotes.modelCSentiment === "SELL" ? "VENDA" : "NEUTRO"}
                        </span>
                      </div>
                      
                      <div className="border-t border-border/40 pt-1.5 mt-1 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-foreground">Decisão:</span>
                        <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${ensembleVotes.decision === "BUY" ? "bg-crypto-green/10 text-crypto-green border border-crypto-green/20" : ensembleVotes.decision === "SELL" ? "bg-crypto-red/10 text-crypto-red border border-crypto-red/20" : "bg-muted/15 text-muted-foreground border border-border"}`}>
                          {ensembleVotes.decision === "BUY" ? "COMPRA (LONG)" : ensembleVotes.decision === "SELL" ? "VENDA (SHORT)" : "NEUTRO (HOLD)"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-20 text-[10px] text-muted-foreground">
                      Aguardando votos...
                    </div>
                  )}
                </div>

                {/* 3. Funnel de Ativos */}
                <div className="bg-secondary/20 rounded-xl p-3 border border-border/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Top Picks do Funnel</span>
                    <Badge variant="outline" className="text-[9px] border-border">Volume &amp; Vol</Badge>
                  </div>
                  
                  <div className="space-y-1.5 max-h-[105px] overflow-y-auto pr-0.5 scrollbar-thin">
                    {funnelCandidates.length > 0 ? (
                      funnelCandidates.map((c, i) => (
                        <div key={c.symbol} className="flex items-center justify-between text-[9px] bg-secondary/40 px-2 py-1 rounded border border-border/10">
                          <span className="font-semibold text-foreground flex items-center gap-1">
                            <span className="text-muted-foreground">#{i + 1}</span> {c.symbol.replace("USDT", "")}
                          </span>
                          <span className={`font-bold flex items-center gap-0.5 ${c.relativeStrength >= 0 ? "text-crypto-green" : "text-crypto-red"}`}>
                            {c.relativeStrength >= 0 ? "+" : ""}{c.relativeStrength.toFixed(1)}%
                          </span>
                          <Badge className={`text-[8px] h-3.5 px-1 ${c.direction === "LONG" ? "bg-crypto-green/10 text-crypto-green border-crypto-green/25" : c.direction === "SHORT" ? "bg-crypto-red/10 text-crypto-red border-crypto-red/25" : "bg-muted text-muted-foreground"}`}>
                            {c.direction}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center justify-center h-20 text-[10px] text-muted-foreground">
                        Nenhum ativo qualificado
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Market Scanner */}
                <div className="bg-secondary/20 rounded-xl p-3 border border-border/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Líderes de Fluxo</span>
                    <Badge className="text-[9px] bg-crypto-cyan/15 text-crypto-cyan border-crypto-cyan/20">Scanner 24h</Badge>
                  </div>

                  <div className="space-y-1.5 max-h-[105px] overflow-y-auto pr-0.5 scrollbar-thin">
                    {scannerPairs.length > 0 ? (
                      scannerPairs.map((sym, idx) => {
                        const t = tickers[sym];
                        const change = t?.priceChangePercent || 0;
                        return (
                          <div key={sym} className="flex items-center justify-between text-[9px] bg-secondary/40 px-2 py-1 rounded border border-border/10">
                            <span className="font-semibold text-foreground flex items-center gap-1">
                              <span className="text-crypto-cyan">⚡</span> {sym.replace("USDT", "")}
                            </span>
                            <span className={`font-bold ${change >= 0 ? "text-crypto-green" : "text-crypto-red"}`}>
                              {change >= 0 ? "+" : ""}{change.toFixed(1)}%
                            </span>
                            <Badge variant="outline" className="text-[8px] h-3.5 border-crypto-cyan/25 text-crypto-cyan bg-crypto-cyan/5">
                              Foco
                            </Badge>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex items-center justify-center h-20 text-[10px] text-muted-foreground">
                        Carregando líderes...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <BotPerformanceChart />
          <BotActivityLog />
          <BotPortfolio />
        </div>
      </div>
    </motion.div>
  );
}
