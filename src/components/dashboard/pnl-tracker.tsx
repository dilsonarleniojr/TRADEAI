"use client";

import { useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatCurrency, formatPercent, formatPrice } from "@/lib/format";
import { selectPortfolioMetrics } from "@/lib/selectors/portfolioMetrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { TrendingUp, TrendingDown, Calendar, BarChart3, Trophy, Target, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useShallow } from "zustand/react/shallow";

// Generate 24 hourly P&L data points based on real trades or portfolio
function generatePnLTimeline(portfolioPnl: number, pnlPercent: number, trades: import("@/lib/store").TradeData[] = []) {
  const now = new Date();
  const data: { time: string; pnl: number; value: number }[] = [];
  const baseValue = 10000; // Starting portfolio value

  // If we have real trades, build timeline from trade history
  if (trades.length > 0) {
    // Group trades by hour bucket
    const hourBuckets: Record<string, number> = {};
    for (let i = 23; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 3600000);
      const hourKey = time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
      hourBuckets[hourKey] = 0;
    }

    // Accumulate P&L from trades into hour buckets
    for (const trade of trades) {
      const tradeTime = new Date(trade.timestamp);
      const hoursSinceNow = (now.getTime() - tradeTime.getTime()) / 3600000;
      if (hoursSinceNow >= 0 && hoursSinceNow < 24) {
        const hourLabel = tradeTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
        if (hourBuckets[hourLabel] !== undefined) {
          // For BUY trades, the P&L impact is the negative cost (invested)
          // For SELL trades with pnl, use the pnl value
          hourBuckets[hourLabel] += trade.pnl || 0;
        }
      }
    }

    // Build cumulative timeline
    let cumulativePnl = 0;
    const hourKeys = Object.keys(hourBuckets);
    for (const hourKey of hourKeys) {
      cumulativePnl += hourBuckets[hourKey];
      data.push({
        time: hourKey,
        pnl: parseFloat(cumulativePnl.toFixed(2)),
        value: parseFloat((baseValue + cumulativePnl).toFixed(2)),
      });
    }

    // Ensure last point matches current portfolio P&L
    if (data.length > 0) {
      data[data.length - 1].pnl = parseFloat(portfolioPnl.toFixed(2));
      data[data.length - 1].value = parseFloat((baseValue + portfolioPnl).toFixed(2));
    }

    return data;
  }

  // Real timeline when no trades exist yet: reflects current actual portfolio value without synthetic noise
  for (let i = 23; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 3600000);
    const hourLabel = time.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    data.push({
      time: hourLabel,
      pnl: parseFloat(portfolioPnl.toFixed(2)),
      value: parseFloat((baseValue + portfolioPnl).toFixed(2)),
    });
  }

  return data;
}

// Generate breakdown data from actual trade history and current unrealized PnL
function calculateActualBreakdown(portfolioPnl: number, unrealizedPnl: number, trades: import("@/lib/store").TradeData[] = []) {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const sevenDaysMs = 7 * oneDayMs;
  const thirtyDaysMs = 30 * oneDayMs;

  let todayRealized = 0;
  let weekRealized = 0;
  let monthRealized = 0;

  for (const trade of trades) {
    const tradeTime = new Date(trade.timestamp).getTime();
    const diff = now - tradeTime;
    if (diff >= 0) {
      if (diff <= oneDayMs) {
        todayRealized += trade.pnl || 0;
      }
      if (diff <= sevenDaysMs) {
        weekRealized += trade.pnl || 0;
      }
      if (diff <= thirtyDaysMs) {
        monthRealized += trade.pnl || 0;
      }
    }
  }

  // Net PnL in period = Realized PnL + current open position Unrealized PnL
  return {
    today: parseFloat((todayRealized + unrealizedPnl).toFixed(2)),
    week: parseFloat((weekRealized + unrealizedPnl).toFixed(2)),
    month: parseFloat((monthRealized + unrealizedPnl).toFixed(2)),
  };
}

// Generate asset performance data from tickers
function generateAssetPerformance(tickers: Record<string, import("@/lib/store").TickerData>) {
  const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "LINKUSDT"];
  return symbols
    .map((symbol) => {
      const ticker = tickers[symbol];
      if (!ticker) return null;
      return {
        symbol: symbol.replace("USDT", ""),
        performance: parseFloat(ticker.priceChangePercent.toFixed(2)),
      };
    })
    .filter(Boolean) as { symbol: string; performance: number }[];
}

// Custom tooltip for area chart
function PnLTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { pnl: number; value: number } }>;
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const isPositive = data.pnl >= 0;

  return (
    <div className="bg-card/95 backdrop-blur-md border border-border rounded-lg p-3 shadow-xl">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn("text-sm font-bold", isPositive ? "text-crypto-green" : "text-crypto-red")}>
              L/P: {isPositive ? "+" : ""}${formatPrice(Math.abs(data.pnl))}
      </p>
      <p className="text-xs text-muted-foreground">
        Valor: ${formatPrice(data.value)}
      </p>
    </div>
  );
}

export function PnlTracker() {
  const { portfolio, trades, tickers, tradingMode } = useCryptoStore(
    useShallow((s) => ({
      portfolio: s.portfolio,
      trades: s.trades,
      tickers: s.tickers,
      tradingMode: s.tradingMode,
    }))
  );

  const metrics = useMemo(() => {
    return selectPortfolioMetrics(
      {
        totalBalance: portfolio.totalValue,
        cashBalance: portfolio.cashBalance,
        positions: portfolio.positions,
        initialBalance: 10000,
      },
      trades,
      { mode: tradingMode }
    );
  }, [portfolio, trades, tradingMode]);

  const pnlTimeline = useMemo(
    () => generatePnLTimeline(metrics.netPnl, portfolio.pnlPercent, trades),
    [metrics.netPnl, portfolio.pnlPercent, trades]
  );

  const breakdown = useMemo(
    () => calculateActualBreakdown(metrics.netPnl, metrics.unrealizedPnl, trades),
    [metrics.netPnl, metrics.unrealizedPnl, trades]
  );

  const assetPerformance = useMemo(
    () => generateAssetPerformance(tickers),
    [tickers]
  );

  const winningTrades = metrics.winningTradesCount;
  const losingTrades = metrics.losingTradesCount;
  const totalPnlTrades = metrics.closedTradesCount;
  const winRate = metrics.winRate;

  const isOverallPositive = metrics.netPnl >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
      className="grid grid-cols-1 lg:grid-cols-3 gap-4"
    >
      {/* P&L Timeline Chart - 2 columns */}
      <div className="lg:col-span-2">
        <Card className="glass-card card-accent-cyan gradient-border h-full">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-crypto-cyan" />
                Rastreador de L/P
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">24h</span>
                <div
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-md",
                    isOverallPositive
                      ? "bg-crypto-green/10 text-crypto-green"
                      : "bg-crypto-red/10 text-crypto-red"
                  )}
                >
                  {isOverallPositive ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5" />
                  )}
                  <span className={cn(
                    "text-sm font-bold",
                    isOverallPositive ? "gradient-text-green" : "text-crypto-red"
                  )}>
                    {isOverallPositive ? "+" : ""}${formatPrice(Math.abs(portfolio.pnl))}
                  </span>
                  <span className="text-[10px] opacity-70">
                    ({formatPercent(portfolio.pnlPercent)})
                  </span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-2 relative">
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pnlTimeline} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pnlGradientPositive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="pnlGradientNegative" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--grid-line)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    interval={5}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <RechartsTooltip content={<PnLTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="pnl"
                    stroke={isOverallPositive ? "#22c55e" : "#ef4444"}
                    strokeWidth={2}
                    fill={isOverallPositive ? "url(#pnlGradientPositive)" : "url(#pnlGradientNegative)"}
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: isOverallPositive ? "#22c55e" : "#ef4444",
                      stroke: "var(--card)",
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              {/* Gradient overlay at bottom of chart */}
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[var(--glass-bg)] to-transparent pointer-events-none" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* P&L Breakdown - 1 column */}
      <div className="space-y-4">
        {/* Period Breakdown */}
        <Card className="glass-card card-accent-cyan">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-crypto-cyan" />
              Resumo de L/P
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Today's P&L */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30 border border-border/50 card-accent-cyan cursor-help">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-crypto-cyan/10">
                      <Target className="w-3.5 h-3.5 text-crypto-cyan" />
                    </div>
                    <span className="text-xs text-muted-foreground">Hoje</span>
                  </div>
                  <span
                    className={cn(
                      "text-sm font-bold",
                      breakdown.today >= 0 ? "gradient-text-green" : "text-crypto-red"
                    )}
                  >
                    {breakdown.today >= 0 ? "+" : ""}${formatPrice(Math.abs(breakdown.today))}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={4}>
                <p className="text-xs">Lucro ou prejuízo de trades executados hoje</p>
              </TooltipContent>
            </Tooltip>

            {/* 7-day P&L */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30 border border-border/50 card-accent-green cursor-help">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-crypto-cyan/10">
                      <TrendingUp className="w-3.5 h-3.5 text-crypto-cyan" />
                    </div>
                    <span className="text-xs text-muted-foreground">7 Dias</span>
                  </div>
                  <span
                    className={cn(
                      "text-sm font-bold",
                      breakdown.week >= 0 ? "gradient-text-green" : "text-crypto-red"
                    )}
                  >
                    {breakdown.week >= 0 ? "+" : ""}${formatPrice(Math.abs(breakdown.week))}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={4}>
                <p className="text-xs">L/P acumulado nos últimos 7 dias</p>
              </TooltipContent>
            </Tooltip>

            {/* 30-day P&L */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30 border border-border/50 card-accent-gold cursor-help">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-crypto-cyan/10">
                      <Calendar className="w-3.5 h-3.5 text-crypto-cyan" />
                    </div>
                    <span className="text-xs text-muted-foreground">30 Dias</span>
                  </div>
                  <span
                    className={cn(
                      "text-sm font-bold",
                      breakdown.month >= 0 ? "gradient-text-green" : "text-crypto-red"
                    )}
                  >
                    {breakdown.month >= 0 ? "+" : ""}${formatPrice(Math.abs(breakdown.month))}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={4}>
                <p className="text-xs">L/P acumulado nos últimos 30 dias</p>
              </TooltipContent>
            </Tooltip>

            {/* Win/Loss Ratio Bar */}
            <div className="p-2.5 rounded-lg bg-secondary/30 border border-border/50 card-accent-red">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-crypto-gold/10">
                    <Trophy className="w-3.5 h-3.5 text-crypto-gold" />
                  </div>
                  <span className="text-xs text-muted-foreground">Vitória / Derrota</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-crypto-green font-semibold">{winningTrades}W</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-crypto-red font-semibold">{losingTrades}L</span>
                </div>
              </div>
              {/* Win rate bar */}
              <div className="h-2 bg-crypto-red/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-crypto-green to-crypto-green/80 rounded-full transition-all duration-700"
                  style={{ width: `${winRate !== null ? winRate : 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-crypto-green">
                  {winRate !== null ? `${winRate.toFixed(0)}% vitórias` : "— vitórias"}
                </span>
                <span className="text-[10px] text-crypto-red">
                  {winRate !== null ? `${(100 - winRate).toFixed(0)}% derrotas` : "— derrotas"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Asset Performance */}
        <Card className="glass-card card-accent-cyan">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-crypto-cyan" />
              Desempenho dos Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[120px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={assetPerformance}
                  margin={{ top: 5, right: 5, left: -15, bottom: 0 }}
                >
                  <XAxis
                    dataKey="symbol"
                    tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                    width={35}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "11px",
                    }}
                    formatter={(value: number) => [`${value >= 0 ? "+" : ""}${value}%`, "Desempenho"]}
                  />
                  <Bar dataKey="performance" radius={[4, 4, 0, 0]} maxBarSize={30}>
                    {assetPerformance.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.performance >= 0 ? "#22c55e" : "#ef4444"}
                        fillOpacity={0.7}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
