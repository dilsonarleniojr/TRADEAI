"use client";

import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  ArrowDownUp,
  Trophy,
  Activity,
  Shield,
  Zap,
  Star,
  AlertTriangle,
  Gauge,
} from "lucide-react";
import { motion } from "framer-motion";

export interface BacktestTrade {
  date: string;
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  pnl: number;
}

export interface BacktestResultData {
  initialBalance: number;
  finalBalance: number;
  totalReturn: number;
  totalReturnPercent: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  equityCurve: { date: string; value: number }[];
  trades: BacktestTrade[];
  // New enhanced metrics
  sharpeRatio: number;
  sortinoRatio: number;
  profitFactor: number | null; // null means infinity (no losses)
  averageTradePnL: number;
  bestTrade: { pnl: number; date: string; side: "BUY" | "SELL" } | null;
  worstTrade: { pnl: number; date: string; side: "BUY" | "SELL" } | null;
  drawdownCurve: { date: string; drawdown: number }[];
}

interface BacktestResultsProps {
  results: BacktestResultData;
}

export function BacktestResults({ results }: BacktestResultsProps) {
  const isPositive = results.totalReturn >= 0;

  const summaryCards = [
    {
      label: "Capital Inicial",
      value: `$${formatPrice(results.initialBalance)}`,
      icon: DollarSign,
      color: "text-muted-foreground",
      bgColor: "bg-secondary/30",
    },
    {
      label: "Saldo Final",
      value: `$${formatPrice(results.finalBalance)}`,
      icon: DollarSign,
      color: isPositive ? "text-crypto-green" : "text-crypto-red",
      bgColor: isPositive ? "bg-crypto-green/10" : "bg-crypto-red/10",
    },
    {
      label: "Retorno Total",
      value: `${isPositive ? "+" : ""}${results.totalReturnPercent.toFixed(2)}%`,
      icon: isPositive ? TrendingUp : TrendingDown,
      color: isPositive ? "text-crypto-green" : "text-crypto-red",
      bgColor: isPositive ? "bg-crypto-green/10" : "bg-crypto-red/10",
    },
    {
      label: "Drawdown Máx.",
      value: `-${results.maxDrawdown.toFixed(2)}%`,
      icon: ArrowDownUp,
      color: "text-crypto-red",
      bgColor: "bg-crypto-red/10",
    },
    {
      label: "Taxa de Acerto",
      value: `${results.winRate.toFixed(1)}%`,
      icon: Target,
      color: results.winRate >= 50 ? "text-crypto-green" : "text-crypto-gold",
      bgColor: results.winRate >= 50 ? "bg-crypto-green/10" : "bg-crypto-gold/10",
    },
    {
      label: "Total de Trades",
      value: results.totalTrades.toString(),
      icon: BarChart3,
      color: "text-crypto-cyan",
      bgColor: "bg-crypto-cyan/10",
    },
  ];

  const advancedMetrics = [
    {
      label: "Índice Sharpe",
      value: isFinite(results.sharpeRatio) ? results.sharpeRatio.toFixed(2) : "N/A",
      icon: Gauge,
      color:
        results.sharpeRatio > 1
          ? "text-crypto-green"
          : results.sharpeRatio > 0
            ? "text-crypto-gold"
            : "text-crypto-red",
      bgColor:
        results.sharpeRatio > 1
          ? "bg-crypto-green/10"
          : results.sharpeRatio > 0
            ? "bg-crypto-gold/10"
            : "bg-crypto-red/10",
      description: "Retorno ajustado ao risco (anualizado)",
    },
    {
      label: "Índice Sortino",
      value: isFinite(results.sortinoRatio) ? results.sortinoRatio.toFixed(2) : "N/A",
      icon: Shield,
      color:
        results.sortinoRatio > 1
          ? "text-crypto-green"
          : results.sortinoRatio > 0
            ? "text-crypto-gold"
            : "text-crypto-red",
      bgColor:
        results.sortinoRatio > 1
          ? "bg-crypto-green/10"
          : results.sortinoRatio > 0
            ? "bg-crypto-gold/10"
            : "bg-crypto-red/10",
      description: "Retorno ajustado ao risco de baixa",
    },
    {
      label: "Fator de Lucro",
      value: results.profitFactor === null ? "∞" : results.profitFactor.toFixed(2),
      icon: Zap,
      color:
        results.profitFactor === null || results.profitFactor > 1.5
          ? "text-crypto-green"
          : results.profitFactor > 1
            ? "text-crypto-gold"
            : "text-crypto-red",
      bgColor:
        results.profitFactor === null || results.profitFactor > 1.5
          ? "bg-crypto-green/10"
          : results.profitFactor > 1
            ? "bg-crypto-gold/10"
            : "bg-crypto-red/10",
      description: "Lucros brutos / Perdas brutas",
    },
    {
      label: "L/P Médio/Trade",
      value: `$${formatPrice(results.averageTradePnL)}`,
      icon: Activity,
      color: results.averageTradePnL >= 0 ? "text-crypto-green" : "text-crypto-red",
      bgColor: results.averageTradePnL >= 0 ? "bg-crypto-green/10" : "bg-crypto-red/10",
      description: "Lucro/perda médio por trade",
    },
    {
      label: "Melhor Trade",
      value: results.bestTrade ? `$${formatPrice(results.bestTrade.pnl)}` : "N/A",
      icon: Star,
      color: "text-crypto-green",
      bgColor: "bg-crypto-green/10",
      description: results.bestTrade ? `${results.bestTrade.date}` : "",
    },
    {
      label: "Pior Trade",
      value: results.worstTrade ? `-$${formatPrice(Math.abs(results.worstTrade.pnl))}` : "N/A",
      icon: AlertTriangle,
      color: "text-crypto-red",
      bgColor: "bg-crypto-red/10",
      description: results.worstTrade ? `${results.worstTrade.date}` : "",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {summaryCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
          >
            <Card className="bg-card border-border hover:border-border/80 transition-all duration-200 hover:shadow-md cursor-default">
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div
                    className={`w-6 h-6 rounded-md ${card.bgColor} flex items-center justify-center`}
                  >
                    <card.icon className={`w-3 h-3 ${card.color}`} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {card.label}
                  </span>
                </div>
                <div className={`text-base font-bold ${card.color} number-animate`}>
                  {card.value}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Advanced Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {advancedMetrics.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: (i + 6) * 0.05 }}
          >
            <Card className="bg-card border-border hover:border-border/80 transition-all duration-200 hover:shadow-md cursor-default">
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div
                    className={`w-6 h-6 rounded-md ${card.bgColor} flex items-center justify-center`}
                  >
                    <card.icon className={`w-3 h-3 ${card.color}`} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {card.label}
                  </span>
                </div>
                <div className={`text-base font-bold ${card.color} number-animate`}>
                  {card.value}
                </div>
                {card.description && (
                  <div className="text-[9px] text-muted-foreground mt-0.5 truncate">
                    {card.description}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Equity Curve */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Trophy className="w-4 h-4 text-crypto-cyan" />
            Curva de Capital
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={results.equityCurve}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="equityGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={isPositive ? "#22c55e" : "#ef4444"}
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="95%"
                      stopColor={isPositive ? "#22c55e" : "#ef4444"}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickFormatter={(val: number) =>
                    `$${(val / 1000).toFixed(1)}k`
                  }
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(20, 20, 40, 0.95)",
                    border: "1px solid rgba(6, 182, 212, 0.3)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "#fff",
                  }}
                  formatter={(value: number) => [
                    `$${formatPrice(value)}`,
                    "Portfólio",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={isPositive ? "#22c55e" : "#ef4444"}
                  strokeWidth={2}
                  fill="url(#equityGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Drawdown Chart */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-crypto-red" />
            Drawdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[150px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={results.drawdownCurve}
                margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="drawdownGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="#ef4444"
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="95%"
                      stopColor="#ef4444"
                      stopOpacity={0.05}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickFormatter={(val: number) => `${val.toFixed(1)}%`}
                  domain={[0, "auto"]}
                  allowDataOverflow
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(20, 20, 40, 0.95)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "#fff",
                  }}
                  formatter={(value: number) => [
                    `${value.toFixed(2)}%`,
                    "Drawdown",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="drawdown"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  fill="url(#drawdownGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Trade List */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-crypto-cyan" />
            Trades do Backtest ({results.trades.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[300px]">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-[11px] text-muted-foreground">
                    Data
                  </TableHead>
                  <TableHead className="text-[11px] text-muted-foreground">
                    Lado
                  </TableHead>
                  <TableHead className="text-[11px] text-muted-foreground text-right">
                    Preço
                  </TableHead>
                  <TableHead className="text-[11px] text-muted-foreground text-right">
                    Qtd
                  </TableHead>
                  <TableHead className="text-[11px] text-muted-foreground text-right">
                    L/P
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.trades.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground text-xs py-8"
                    >
                      Nenhum trade gerado durante o backtest.
                    </TableCell>
                  </TableRow>
                ) : (
                  results.trades.map((trade, i) => {
                    const isBest = results.bestTrade && trade.pnl === results.bestTrade.pnl && trade.date === results.bestTrade.date;
                    const isWorst = results.worstTrade && trade.pnl === results.worstTrade.pnl && trade.date === results.worstTrade.date;
                    return (
                      <TableRow
                        key={i}
                        className={`border-border/50 transition-colors hover:bg-secondary/30 ${
                          isBest
                            ? "bg-crypto-green/5"
                            : isWorst
                              ? "bg-crypto-red/5"
                              : ""
                        }`}
                      >
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {trade.date}
                          {isBest && (
                            <Badge className="ml-1 text-[8px] px-1 py-0 bg-crypto-green/15 text-crypto-green border-crypto-green/30">
                              MELHOR
                            </Badge>
                          )}
                          {isWorst && (
                            <Badge className="ml-1 text-[8px] px-1 py-0 bg-crypto-red/15 text-crypto-red border-crypto-red/30">
                              PIOR
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-[10px] px-1.5 py-0 ${
                              trade.side === "BUY"
                                ? "bg-crypto-green/15 text-crypto-green border-crypto-green/30"
                                : "bg-crypto-red/15 text-crypto-red border-crypto-red/30"
                            }`}
                          >
                            {trade.side}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          ${formatPrice(trade.price)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {trade.quantity.toFixed(6)}
                        </TableCell>
                        <TableCell
                          className={`text-xs text-right font-mono font-medium ${
                            trade.pnl > 0
                              ? "text-crypto-green"
                              : trade.pnl < 0
                                ? "text-crypto-red"
                                : "text-muted-foreground"
                          }`}
                        >
                          {trade.pnl > 0 ? "+" : ""}
                          {trade.pnl !== 0
                            ? `$${formatPrice(Math.abs(trade.pnl))}`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </motion.div>
  );
}
