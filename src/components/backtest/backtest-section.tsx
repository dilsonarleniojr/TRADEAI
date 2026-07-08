"use client";

import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BacktestConfig, BacktestConfig as BacktestConfigType, StrategyKey } from "./backtest-config";
import { BacktestResults, BacktestResultData } from "./backtest-results";
import { BacktestComparison } from "./backtest-comparison";
import { motion } from "framer-motion";
import { History, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OptimizerSection } from "./optimizer-section";

const DEFAULT_CONFIG: BacktestConfigType = {
  symbol: "BTCUSDT",
  strategy: "RSI",
  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0],
  endDate: new Date().toISOString().split("T")[0],
  initialBalance: 10000,
  rsiPeriod: 14,
  rsiBuyThreshold: 30,
  rsiSellThreshold: 70,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
};

interface KlinePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Calculate RSI from close prices
function calculateRSI(closes: number[], period: number): number[] {
  const rsi: number[] = [];
  if (closes.length < period + 1) {
    return new Array(closes.length).fill(50);
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      gains += diff;
    } else {
      losses += Math.abs(diff);
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  rsi.push(
    avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  );

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const currentGain = diff >= 0 ? diff : 0;
    const currentLoss = diff < 0 ? Math.abs(diff) : 0;

    const newAvgGain = (avgGain * (period - 1) + currentGain) / period;
    const newAvgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    rsi.push(
      newAvgLoss === 0
        ? 100
        : 100 - 100 / (1 + newAvgGain / newAvgLoss)
    );
  }

  // Pad the beginning with 50s
  while (rsi.length < closes.length) {
    rsi.unshift(50);
  }

  return rsi;
}

// Calculate EMA
function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  if (data.length === 0) return ema;

  // First EMA value is the simple average
  let sum = 0;
  for (let i = 0; i < Math.min(period, data.length); i++) {
    sum += data[i];
  }
  ema.push(sum / Math.min(period, data.length));

  for (let i = 1; i < data.length; i++) {
    const prevEma = ema[ema.length - 1];
    ema.push((data[i] - prevEma) * multiplier + prevEma);
  }

  return ema;
}

// Calculate MACD
function calculateMACD(
  closes: number[],
  fast: number,
  slow: number,
  signal: number
): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const emaFast = calculateEMA(closes, fast);
  const emaSlow = calculateEMA(closes, slow);

  const macdLine = emaFast.map((val, i) => val - emaSlow[i]);
  const signalLine = calculateEMA(macdLine, signal);
  const histogram = macdLine.map((val, i) => val - signalLine[i]);

  return { macdLine, signalLine, histogram };
}

function runStrategy(
  klines: KlinePoint[],
  strategy: "RSI" | "MACD" | "AI",
  config: BacktestConfigType
): BacktestResultData {
  const closes = klines.map((k) => k.close);
  const initialBalance = config.initialBalance;
  let cash = initialBalance;
  let assetQuantity = 0;
  let balance = initialBalance;
  const equityCurve: { date: string; value: number }[] = [];
  const drawdownCurve: { date: string; drawdown: number }[] = [];
  const trades: BacktestResultData["trades"] = [];
  let maxBalance = initialBalance;
  let maxDrawdown = 0;
  let positionOpen = false;
  let entryPrice = 0;
  let entryDate = "";
  let wins = 0;
  let totalClosedTrades = 0;

  // Track per-trade PnLs for profit factor, best/worst trade
  const tradePnls: number[] = [];
  let bestTradePnl = -Infinity;
  let bestTradeDate = "";
  let bestTradeSide: "BUY" | "SELL" = "BUY";
  let worstTradePnl = Infinity;
  let worstTradeDate = "";
  let worstTradeSide: "BUY" | "SELL" = "SELL";

  // Pre-calculate indicators
  const rsiValues =
    strategy === "RSI" ? calculateRSI(closes, config.rsiPeriod) : [];
  const macdResult =
    strategy === "MACD"
      ? calculateMACD(closes, config.macdFast, config.macdSlow, config.macdSignal)
      : null;

  // For AI strategy, pre-generate deterministic signals
  const aiSignals: ("BUY" | "SELL" | "HOLD")[] = [];
  if (strategy === "AI") {
    // Simple pseudo-random based on price movements
    for (let i = 0; i < closes.length; i++) {
      if (i < 5) {
        aiSignals.push("HOLD");
        continue;
      }
      const momentum =
        (closes[i] - closes[i - 5]) / closes[i - 5];
      const shortMomentum =
        (closes[i] - closes[i - 2]) / closes[i - 2];

      if (momentum < -0.03 && shortMomentum < -0.01) {
        aiSignals.push("BUY");
      } else if (momentum > 0.03 && shortMomentum > 0.01) {
        aiSignals.push("SELL");
      } else {
        aiSignals.push("HOLD");
      }
    }
  }

  for (let i = 0; i < klines.length; i++) {
    const kline = klines[i];
    const date = new Date(kline.time).toISOString().split("T")[0];

    let signal: "BUY" | "SELL" | "HOLD" = "HOLD";

    if (strategy === "RSI" && i > 0 && rsiValues[i] !== undefined && rsiValues[i - 1] !== undefined) {
      const rsi = rsiValues[i];
      const prevRsi = rsiValues[i - 1];
      if (rsi < config.rsiBuyThreshold && prevRsi >= config.rsiBuyThreshold) {
        signal = "BUY";
      } else if (
        rsi > config.rsiSellThreshold &&
        prevRsi <= config.rsiSellThreshold
      ) {
        signal = "SELL";
      }
    } else if (strategy === "MACD" && i > 0 && macdResult && macdResult.histogram[i] !== undefined && macdResult.histogram[i - 1] !== undefined) {
      const histogram = macdResult.histogram[i];
      const prevHistogram = macdResult.histogram[i - 1];
      if (histogram > 0 && prevHistogram <= 0) {
        signal = "BUY";
      } else if (histogram < 0 && prevHistogram >= 0) {
        signal = "SELL";
      }
    } else if (strategy === "AI" && aiSignals[i]) {
      signal = aiSignals[i];
    }

    // Execute trades
    if (signal === "BUY" && !positionOpen && cash > 0) {
      // Buy with 95% of cash
      const buyAmount = cash * 0.95;
      const qty = buyAmount / kline.close;
      assetQuantity = qty;
      entryPrice = kline.close;
      entryDate = date;
      cash -= buyAmount;
      positionOpen = true;
      trades.push({
        date,
        side: "BUY",
        price: kline.close,
        quantity: qty,
        pnl: 0,
      });
    } else if (signal === "SELL" && positionOpen) {
      // Sell all
      const sellValue = assetQuantity * kline.close;
      const pnl = sellValue - assetQuantity * entryPrice;
      cash += sellValue;

      totalClosedTrades++;
      if (pnl > 0) wins++;

      tradePnls.push(pnl);

      // Track best/worst trade
      if (pnl > bestTradePnl) {
        bestTradePnl = pnl;
        bestTradeDate = date;
        bestTradeSide = "SELL";
      }
      if (pnl < worstTradePnl) {
        worstTradePnl = pnl;
        worstTradeDate = date;
        worstTradeSide = "SELL";
      }

      trades.push({
        date,
        side: "SELL",
        price: kline.close,
        quantity: assetQuantity,
        pnl,
      });

      assetQuantity = 0;
      positionOpen = false;
    }

    // Calculate current balance
    balance = cash + assetQuantity * kline.close;
    equityCurve.push({
      date: new Date(kline.time).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      value: Math.round(balance * 100) / 100,
    });

    // Track max drawdown
    if (balance > maxBalance) maxBalance = balance;
    const dd = ((maxBalance - balance) / maxBalance) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;

    // Drawdown curve (store as positive percentages for easier charting)
    drawdownCurve.push({
      date: new Date(kline.time).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      drawdown: Math.round(dd * 100) / 100,
    });
  }

  // Close any open position at the end
  if (positionOpen && klines.length > 0) {
    const lastPrice = klines[klines.length - 1].close;
    const sellValue = assetQuantity * lastPrice;
    const pnl = sellValue - assetQuantity * entryPrice;
    cash += sellValue;
    balance = cash;
    totalClosedTrades++;
    if (pnl > 0) wins++;

    tradePnls.push(pnl);

    if (pnl > bestTradePnl) {
      bestTradePnl = pnl;
      bestTradeDate = equityCurve[equityCurve.length - 1]?.date || "";
      bestTradeSide = "SELL";
    }
    if (pnl < worstTradePnl) {
      worstTradePnl = pnl;
      worstTradeDate = equityCurve[equityCurve.length - 1]?.date || "";
      worstTradeSide = "SELL";
    }

    trades.push({
      date: equityCurve[equityCurve.length - 1]?.date || "",
      side: "SELL",
      price: lastPrice,
      quantity: assetQuantity,
      pnl,
    });
  }

  const totalReturn = balance - initialBalance;
  const totalReturnPercent =
    ((balance - initialBalance) / initialBalance) * 100;

  // ---- Calculate Enhanced Metrics ----

  // Calculate daily returns from equity curve
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prevVal = equityCurve[i - 1].value;
    if (prevVal > 0) {
      dailyReturns.push((equityCurve[i].value - prevVal) / prevVal);
    }
  }

  // Sharpe Ratio: (avgReturn - riskFreeRate) / stdDev
  // Annual risk-free rate = 2% → daily risk-free rate ≈ 0.02/252
  const annualRiskFreeRate = 0.02;
  const dailyRiskFreeRate = annualRiskFreeRate / 252;

  let sharpeRatio = 0;
  if (dailyReturns.length > 1) {
    const avgReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / dailyReturns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev > 0) {
      sharpeRatio = ((avgReturn - dailyRiskFreeRate) / stdDev) * Math.sqrt(252);
    }
  }

  // Sortino Ratio: (avgReturn - riskFreeRate) / downsideDeviation
  let sortinoRatio = 0;
  if (dailyReturns.length > 1) {
    const avgReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
    const downsideReturns = dailyReturns.filter((r) => r < 0);
    if (downsideReturns.length > 0) {
      const downsideVariance = downsideReturns.reduce((sum, r) => sum + r ** 2, 0) / downsideReturns.length;
      const downsideDeviation = Math.sqrt(downsideVariance);
      if (downsideDeviation > 0) {
        sortinoRatio = ((avgReturn - dailyRiskFreeRate) / downsideDeviation) * Math.sqrt(252);
      }
    } else {
      // No negative returns - Sortino is infinite
      sortinoRatio = Infinity;
    }
  }

  // Profit Factor: gross profits / gross losses
  let profitFactor: number | null = null;
  if (tradePnls.length > 0) {
    const grossProfit = tradePnls.filter((p) => p > 0).reduce((sum, p) => sum + p, 0);
    const grossLoss = tradePnls.filter((p) => p < 0).reduce((sum, p) => sum + Math.abs(p), 0);
    if (grossLoss === 0) {
      profitFactor = null; // Infinity - no losses
    } else {
      profitFactor = grossProfit / grossLoss;
    }
  }

  // Average Trade P&L
  let averageTradePnL = 0;
  if (tradePnls.length > 0) {
    averageTradePnL = tradePnls.reduce((sum, p) => sum + p, 0) / tradePnls.length;
  }

  // Best / Worst Trade
  const bestTrade = bestTradePnl !== -Infinity
    ? { pnl: bestTradePnl, date: bestTradeDate, side: bestTradeSide }
    : null;
  const worstTrade = worstTradePnl !== Infinity
    ? { pnl: worstTradePnl, date: worstTradeDate, side: worstTradeSide }
    : null;

  return {
    initialBalance,
    finalBalance: Math.round(balance * 100) / 100,
    totalReturn: Math.round(totalReturn * 100) / 100,
    totalReturnPercent: Math.round(totalReturnPercent * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    winRate: totalClosedTrades > 0 ? (wins / totalClosedTrades) * 100 : 0,
    totalTrades: trades.length,
    equityCurve,
    trades,
    // Enhanced metrics
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    sortinoRatio: isFinite(sortinoRatio) ? Math.round(sortinoRatio * 100) / 100 : 999.99,
    profitFactor,
    averageTradePnL: Math.round(averageTradePnL * 100) / 100,
    bestTrade,
    worstTrade,
    drawdownCurve,
  };
}

export function BacktestSection() {
  const [config, setConfig] = useState<BacktestConfigType>(DEFAULT_CONFIG);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<BacktestResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedStrategies, setSelectedStrategies] = useState<StrategyKey[]>(["RSI", "MACD"]);
  const [comparisonResults, setComparisonResults] = useState<Record<StrategyKey, BacktestResultData> | null>(null);

  const runBacktest = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    setResults(null);
    setComparisonResults(null);

    try {
      // Fetch historical klines from Binance API
      const response = await fetch(
        `/api/market/klines?symbol=${config.symbol}&interval=1d&limit=365`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch historical data");
      }

      const apiResult = await response.json();

      const klinesRaw = apiResult.data || [];
      if (!Array.isArray(klinesRaw) || klinesRaw.length === 0) {
        throw new Error("No historical data available");
      }

      // Parse klines - API returns strings
      const klines: KlinePoint[] = klinesRaw.map(
        (k: { openTime: number; open: string; high: string; low: string; close: string; volume: string }) => ({
          time: k.openTime,
          open: parseFloat(k.open),
          high: parseFloat(k.high),
          low: parseFloat(k.low),
          close: parseFloat(k.close),
          volume: parseFloat(k.volume),
        })
      );

      // Filter by date range
      const startTime = new Date(config.startDate).getTime();
      const endTime = new Date(config.endDate).getTime();
      const filteredKlines = klines.filter(
        (k) => k.time >= startTime && k.time <= endTime
      );

      if (filteredKlines.length < 30) {
        throw new Error(
          "Dados históricos insuficientes para o intervalo selecionado. Escolha um intervalo maior."
        );
      }

      if (compareMode) {
        // Run comparison - run each selected strategy
        const compResults: Partial<Record<StrategyKey, BacktestResultData>> = {};
        for (const strategy of selectedStrategies) {
          compResults[strategy] = runStrategy(filteredKlines, strategy, config);
        }
        setComparisonResults(compResults as Record<StrategyKey, BacktestResultData>);
      } else {
        // Single strategy mode
        const strategyResult = runStrategy(filteredKlines, config.strategy, config);
        setResults(strategyResult);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred"
      );
    } finally {
      setIsRunning(false);
    }
  }, [config, compareMode, selectedStrategies]);

  return (
    <motion.div
      key="backtest"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-crypto-cyan/10 flex items-center justify-center">
            <History className="w-5 h-5 text-crypto-cyan" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Backtesting de Estratégias</h2>
            <p className="text-xs text-muted-foreground">
              Teste e otimize suas estratégias de trading contra dados históricos no motor Antigravity
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="backtest" className="w-full">
        <TabsList className="bg-card border border-border/40 grid grid-cols-2 w-full max-w-[400px] mb-4">
          <TabsTrigger value="backtest" className="text-xs font-semibold">Backtest Simples</TabsTrigger>
          <TabsTrigger value="optimizer" className="text-xs font-semibold">Otimização de Hiperparâmetros</TabsTrigger>
        </TabsList>

        <TabsContent value="backtest" className="mt-2 outline-none">
          {/* Config + Results: stack on mobile, side-by-side on desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Config Panel */}
            <div className="lg:col-span-1">
              <BacktestConfig
                config={config}
                setConfig={setConfig}
                onRun={runBacktest}
                isRunning={isRunning}
                compareMode={compareMode}
                setCompareMode={setCompareMode}
                selectedStrategies={selectedStrategies}
                setSelectedStrategies={setSelectedStrategies}
              />
            </div>

            {/* Results - full width on mobile */}
            <div className="lg:col-span-2">
              {error && (
                <Card className="bg-crypto-red/5 border-crypto-red/20 mb-4">
                  <CardContent className="p-4 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-crypto-red shrink-0" />
                    <span className="text-sm text-crypto-red">{error}</span>
                  </CardContent>
                </Card>
              )}

              {compareMode && comparisonResults ? (
                <BacktestComparison
                  results={comparisonResults}
                  strategies={selectedStrategies}
                />
              ) : !compareMode && results ? (
                <BacktestResults results={results} />
              ) : (
                <Card className="bg-card border-border">
                  <CardContent className="p-6 sm:p-8 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-crypto-cyan/10 flex items-center justify-center mx-auto mb-4">
                      <History className="w-7 h-7 text-crypto-cyan" />
                    </div>
                    <h3 className="text-sm font-medium mb-1">Sem Resultados Ainda</h3>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      {compareMode
                        ? "Selecione 2-3 estratégias e clique em \"Comparar Estratégias\" para ver resultados lado a lado."
                        : "Configure os parâmetros do backtest e clique em \"Executar Backtest\" para ver os resultados de performance da estratégia."
                      }
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="optimizer" className="mt-2 outline-none">
          <OptimizerSection />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
