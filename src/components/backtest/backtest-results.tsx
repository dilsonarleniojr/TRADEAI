"use client";

import { formatPrice, formatDate } from "@/lib/format";
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  ArrowDownUp,
  Trophy,
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
}

interface BacktestResultsProps {
  results: BacktestResultData;
}

export function BacktestResults({ results }: BacktestResultsProps) {
  const isPositive = results.totalReturn >= 0;

  const summaryCards = [
    {
      label: "Initial Balance",
      value: `$${formatPrice(results.initialBalance)}`,
      icon: DollarSign,
      color: "text-muted-foreground",
      bgColor: "bg-secondary/30",
    },
    {
      label: "Final Balance",
      value: `$${formatPrice(results.finalBalance)}`,
      icon: DollarSign,
      color: isPositive ? "text-crypto-green" : "text-crypto-red",
      bgColor: isPositive ? "bg-crypto-green/10" : "bg-crypto-red/10",
    },
    {
      label: "Total Return",
      value: `${isPositive ? "+" : ""}${results.totalReturnPercent.toFixed(2)}%`,
      icon: isPositive ? TrendingUp : TrendingDown,
      color: isPositive ? "text-crypto-green" : "text-crypto-red",
      bgColor: isPositive ? "bg-crypto-green/10" : "bg-crypto-red/10",
    },
    {
      label: "Max Drawdown",
      value: `-${results.maxDrawdown.toFixed(2)}%`,
      icon: ArrowDownUp,
      color: "text-crypto-red",
      bgColor: "bg-crypto-red/10",
    },
    {
      label: "Win Rate",
      value: `${results.winRate.toFixed(1)}%`,
      icon: Target,
      color: results.winRate >= 50 ? "text-crypto-green" : "text-crypto-gold",
      bgColor: results.winRate >= 50 ? "bg-crypto-green/10" : "bg-crypto-gold/10",
    },
    {
      label: "Total Trades",
      value: results.totalTrades.toString(),
      icon: BarChart3,
      color: "text-crypto-cyan",
      bgColor: "bg-crypto-cyan/10",
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
            <Card className="bg-card border-border">
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
                <div className={`text-base font-bold ${card.color}`}>
                  {card.value}
                </div>
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
            Equity Curve
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
                      stopColor="#06b6d4"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="#06b6d4"
                      stopOpacity={0}
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
                    "Portfolio",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  fill="url(#equityGradient)"
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
            Backtest Trades ({results.trades.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[300px]">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-[11px] text-muted-foreground">
                    Date
                  </TableHead>
                  <TableHead className="text-[11px] text-muted-foreground">
                    Side
                  </TableHead>
                  <TableHead className="text-[11px] text-muted-foreground text-right">
                    Price
                  </TableHead>
                  <TableHead className="text-[11px] text-muted-foreground text-right">
                    Qty
                  </TableHead>
                  <TableHead className="text-[11px] text-muted-foreground text-right">
                    PnL
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
                      No trades generated during backtest.
                    </TableCell>
                  </TableRow>
                ) : (
                  results.trades.map((trade, i) => (
                    <TableRow key={i} className="border-border/50">
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {trade.date}
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
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </motion.div>
  );
}
