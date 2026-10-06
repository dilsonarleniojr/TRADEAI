"use client";

import { useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Trophy,
  AlertTriangle,
  Activity,
  ShieldCheck,
  Receipt,
  Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useShallow } from "zustand/react/shallow";

// Custom tooltip for P&L chart
function PnLTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { cumulativePnl: number; tradeIndex: number } }>;
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const isPositive = data.cumulativePnl >= 0;

  return (
    <div className="bg-card/95 backdrop-blur-md border border-border rounded-lg p-3 shadow-xl">
      <p className="text-xs text-muted-foreground mb-1">Trade #{data.tradeIndex}</p>
      <p className={cn("text-sm font-bold", isPositive ? "text-crypto-green" : "text-crypto-red")}>
        P&L: {isPositive ? "+" : ""}${formatPrice(Math.abs(data.cumulativePnl))}
      </p>
    </div>
  );
}

// Custom tooltip for bar chart
function VolumeTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-card/95 backdrop-blur-md border border-border rounded-lg p-3 shadow-xl">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-bold text-crypto-cyan">
        {payload[0].value} trades
      </p>
    </div>
  );
}

export function BotPerformanceChart() {
  const { trades } = useCryptoStore(
  useShallow((s) => ({ trades: s.trades }))
);

  // Calculate data from trades
  const { pnlOverTime, winLossData, volumeByHour, stats } = useMemo(() => {
    if (trades.length === 0) {
      return {
        pnlOverTime: [],
        winLossData: [],
        volumeByHour: [],
        stats: null,
      };
    }

    // P&L Over Time - last 20 data points
    const last20Trades = trades.slice(0, 20).reverse();
    let cumulativePnl = 0;
    const pnlData = last20Trades.map((trade, index) => {
      cumulativePnl += trade.pnl;
      return {
        tradeIndex: index + 1,
        cumulativePnl: parseFloat(cumulativePnl.toFixed(2)),
        label: `#${index + 1}`,
      };
    });

    // Win/Loss Distribution
    const wins = trades.filter((t) => t.pnl > 0).length;
    const losses = trades.filter((t) => t.pnl < 0).length;
    const neutral = trades.filter((t) => t.pnl === 0).length;
    const winLossArr = [
      { name: "Vitórias", value: wins, color: "#22c55e" },
      { name: "Derrotas", value: losses, color: "#ef4444" },
    ];
    // Only add neutral if there are any
    if (neutral > 0) {
      winLossArr.push({ name: "Neutro", value: neutral, color: "#6b7280" });
    }

    // Trade Volume by Hour
    const hourBuckets: Record<number, number> = {};
    for (let h = 0; h < 24; h++) {
      hourBuckets[h] = 0;
    }
    trades.forEach((trade) => {
      const hour = new Date(trade.timestamp).getHours();
      hourBuckets[hour] = (hourBuckets[hour] || 0) + 1;
    });
    const volumeData = Object.entries(hourBuckets)
      .filter(([, count]) => count > 0)
      .map(([hour, count]) => ({
        hour: `${hour.padStart(2, "0")}:00`,
        trades: count,
        hourNum: parseInt(hour),
      }))
      .sort((a, b) => a.hourNum - b.hourNum);

    // Summary stats
    const closedTrades = trades.filter((t) => t.pnl !== 0);
    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const winTrades = closedTrades.filter((t) => t.pnl > 0);
    const lossTrades = closedTrades.filter((t) => t.pnl < 0);
    const winRate = closedTrades.length > 0 ? (winTrades.length / closedTrades.length) * 100 : 0;
    const avgPnl = trades.length > 0 ? totalPnl / trades.length : 0;
    const bestTrade = closedTrades.length > 0 ? Math.max(...closedTrades.map((t) => t.pnl)) : 0;
    const worstTrade = closedTrades.length > 0 ? Math.min(...closedTrades.map((t) => t.pnl)) : 0;

    const grossProfit = winTrades.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(lossTrades.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99.9 : 1.0);
    const avgWin = winTrades.length > 0 ? grossProfit / winTrades.length : 0;
    const avgLoss = lossTrades.length > 0 ? grossLoss / lossTrades.length : 0;
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : 1.0;
    const estimatedFees = trades.reduce((sum, t) => sum + (t.total || 0) * 0.001, 0);
    const netPnl = totalPnl - estimatedFees;

    return {
      pnlOverTime: pnlData,
      winLossData: winLossArr,
      volumeByHour: volumeData,
      stats: {
        totalPnl,
        winRate,
        avgPnl,
        bestTrade,
        worstTrade,
        totalTrades: trades.length,
        wins: winTrades.length,
        losses: lossTrades.length,
        grossProfit,
        grossLoss,
        profitFactor,
        payoffRatio,
        estimatedFees,
        netPnl,
      },
    };
  }, [trades]);

  // Empty state
  if (trades.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="glass-card gradient-border overflow-hidden">
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-crypto-cyan/10 flex items-center justify-center mb-4">
                <BarChart3 className="w-7 h-7 text-crypto-cyan" />
              </div>
              <h3 className="text-sm font-semibold mb-1">Nenhum Dado de Performance</h3>
              <p className="text-xs text-muted-foreground max-w-[260px]">
                Inicie o bot para gerar dados de performance. Gráficos e análises aparecerão aqui conforme trades forem executados.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const isOverallPositive = stats && stats.totalPnl >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <Card className="glass-card gradient-border overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-crypto-cyan" />
              Análise de Performance
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {trades.length} trades
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary Stats Row */}
          {stats && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-secondary/30 border border-border/50 card-accent-cyan">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-crypto-cyan" />
                  <span className="text-[10px] text-muted-foreground font-medium">L/P Total</span>
                </div>
                <div className={cn(
                  "text-lg font-bold number-animate",
                  stats.totalPnl >= 0 ? "gradient-text-green" : "text-crypto-red"
                )}>
                  {stats.totalPnl >= 0 ? "+" : ""}${formatPrice(Math.abs(stats.totalPnl))}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-secondary/30 border border-border/50 card-accent-green">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Target className="w-3.5 h-3.5 text-crypto-green" />
                  <span className="text-[10px] text-muted-foreground font-medium">Taxa de Acerto</span>
                </div>
                <div className={cn(
                  "text-lg font-bold number-animate",
                  stats.winRate >= 50 ? "text-crypto-green" : "text-crypto-red"
                )}>
                  {stats.winRate.toFixed(1)}%
                </div>
              </div>

              <div className="p-3 rounded-lg bg-secondary/30 border border-border/50 card-accent-gold">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Activity className="w-3.5 h-3.5 text-crypto-gold" />
                  <span className="text-[10px] text-muted-foreground font-medium">L/P Médio/Trade</span>
                </div>
                <div className={cn(
                  "text-lg font-bold number-animate",
                  stats.avgPnl >= 0 ? "text-crypto-green" : "text-crypto-red"
                )}>
                  {stats.avgPnl >= 0 ? "+" : ""}${formatPrice(Math.abs(stats.avgPnl))}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-secondary/30 border border-border/50 card-accent-red">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Trophy className="w-3.5 h-3.5 text-crypto-gold" />
                  <span className="text-[10px] text-muted-foreground font-medium">Melhor / Pior</span>
                </div>
                <div className="text-sm font-bold">
                  <span className="text-crypto-green number-animate">+${formatPrice(Math.abs(stats.bestTrade))}</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  <span className="text-crypto-red number-animate">-${formatPrice(Math.abs(stats.worstTrade))}</span>
                </div>
              </div>
            </div>

            {/* Quantitative Diagnostics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-secondary/20 border border-border/40">
                <div className="flex items-center gap-1.5 mb-1">
                  <Scale className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] text-muted-foreground font-medium">Fator de Lucro</span>
                </div>
                <div className={cn(
                  "text-base font-bold font-mono",
                  stats.profitFactor >= 1.5 ? "text-crypto-green" : stats.profitFactor >= 1.0 ? "text-amber-400" : "text-crypto-red"
                )}>
                  {stats.profitFactor.toFixed(2)}
                </div>
                <span className="text-[9px] text-muted-foreground block mt-0.5">
                  {stats.profitFactor >= 1.5 ? "Excelente (>1.5)" : stats.profitFactor >= 1.0 ? "Equilibrado (≥1.0)" : "Abaixo do ideal (<1.0)"}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-secondary/20 border border-border/40">
                <div className="flex items-center gap-1.5 mb-1">
                  <Target className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-[10px] text-muted-foreground font-medium">Razão Ganho/Perda</span>
                </div>
                <div className={cn(
                  "text-base font-bold font-mono",
                  stats.payoffRatio >= 1.2 ? "text-crypto-green" : "text-crypto-red"
                )}>
                  {stats.payoffRatio.toFixed(2)}x
                </div>
                <span className="text-[9px] text-muted-foreground block mt-0.5">
                  Média Vitórias vs Derrotas
                </span>
              </div>

              <div className="p-3 rounded-lg bg-secondary/20 border border-border/40">
                <div className="flex items-center gap-1.5 mb-1">
                  <Receipt className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] text-muted-foreground font-medium">Taxas Pagas (Est.)</span>
                </div>
                <div className="text-base font-bold font-mono text-amber-400">
                  -${stats.estimatedFees.toFixed(2)}
                </div>
                <span className="text-[9px] text-muted-foreground block mt-0.5">
                  0.10% Binance Spot por trade
                </span>
              </div>

              <div className="p-3 rounded-lg bg-secondary/20 border border-border/40">
                <div className="flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-crypto-cyan" />
                  <span className="text-[10px] text-muted-foreground font-medium">L/P Líquido Real</span>
                </div>
                <div className={cn(
                  "text-base font-bold font-mono",
                  stats.netPnl >= 0 ? "text-crypto-green" : "text-crypto-red"
                )}>
                  {stats.netPnl >= 0 ? "+" : ""}${stats.netPnl.toFixed(2)}
                </div>
                <span className="text-[9px] text-muted-foreground block mt-0.5">
                  Após desconto de todas as taxas
                </span>
              </div>
            </div>

            {/* Proteções Ativas Banner */}
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-emerald-300">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold text-foreground">
                  Proteções Quantitativas Ativadas:
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px]">
                <span className="bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                  🛡️ Veto Contra-Tendência (EMA9 &gt; EMA21)
                </span>
                <span className="bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                  ⏱️ Cooldown Anti-Cascata de 10m
                </span>
                <span className="bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                  🔒 Trava de Breakeven pós +0.75%
                </span>
              </div>
            </div>
          </>)}

          {/* Charts Grid: 2 columns on desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* P&L Over Time */}
            <div className="p-3 rounded-lg bg-secondary/20 border border-border/50">
              <h4 className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-crypto-cyan" />
                L/P ao Longo do Tempo
              </h4>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={pnlOverTime} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="botPnlGradientPositive" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="botPnlGradientNegative" x1="0" y1="0" x2="0" y2="1">
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
                      dataKey="label"
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip content={<PnLTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="cumulativePnl"
                      stroke={isOverallPositive ? "#22c55e" : "#ef4444"}
                      strokeWidth={2}
                      fill={isOverallPositive ? "url(#botPnlGradientPositive)" : "url(#botPnlGradientNegative)"}
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
              </div>
            </div>

            {/* Win/Loss Distribution - PieChart donut */}
            <div className="p-3 rounded-lg bg-secondary/20 border border-border/50">
              <h4 className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-crypto-green" />
                Distribuição Vitória/Derrota
              </h4>
              <div className="h-[200px] w-full flex items-center justify-center">
                {winLossData.length > 0 && winLossData.some((d) => d.value > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={winLossData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                        animationBegin={0}
                        animationDuration={800}
                      >
                        {winLossData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          fontSize: "11px",
                        }}
                        formatter={(value: number, name: string) => [`${value} trades`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <AlertTriangle className="w-8 h-8 opacity-40" />
                    <span className="text-xs">Nenhum trade fechado ainda</span>
                  </div>
                )}
              </div>
              {/* Win/Loss Legend */}
              {stats && (stats.wins > 0 || stats.losses > 0) && (
                <div className="flex items-center justify-center gap-4 mt-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-crypto-green" />
                    <span className="text-[10px] text-muted-foreground">
                      Vitórias: {stats.wins} ({stats.winRate.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-crypto-red" />
                    <span className="text-[10px] text-muted-foreground">
                      Derrotas: {stats.losses} ({(100 - stats.winRate).toFixed(0)}%)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Trade Volume by Hour - full width */}
          {volumeByHour.length > 0 && (
            <div className="p-3 rounded-lg bg-secondary/20 border border-border/50">
              <h4 className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-crypto-gold" />
                Volume de Trades por Hora
              </h4>
              <div className="h-[140px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeByHour} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--grid-line)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<VolumeTooltip />} />
                    <Bar dataKey="trades" radius={[4, 4, 0, 0]} maxBarSize={40}>
                      {volumeByHour.map((entry, index) => (
                        <Cell
                          key={`bar-${index}`}
                          fill="#06b6d4"
                          fillOpacity={0.6}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
