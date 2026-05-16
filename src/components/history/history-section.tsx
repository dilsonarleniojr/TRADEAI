"use client";

import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { TradeTable } from "./trade-table";
import { TradeReport } from "./trade-report";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Target,
} from "lucide-react";
import { motion } from "framer-motion";

export function HistorySection() {
  const { trades } = useCryptoStore();

  // Compute summary stats
  const closedTrades = trades.filter((t) => t.pnl !== 0);
  const wins = closedTrades.filter((t) => t.pnl > 0);
  const totalPnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
  const avgPnl =
    closedTrades.length > 0 ? totalPnl / closedTrades.length : 0;
  const winRate =
    closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;

  const summaryCards = [
    {
      label: "Total Trades",
      value: trades.length.toString(),
      icon: BarChart3,
      color: "text-crypto-cyan",
      bgColor: "bg-crypto-cyan/10",
    },
    {
      label: "Win Rate",
      value: `${winRate.toFixed(1)}%`,
      icon: Target,
      color: winRate >= 50 ? "text-crypto-green" : "text-crypto-red",
      bgColor: winRate >= 50 ? "bg-crypto-green/10" : "bg-crypto-red/10",
    },
    {
      label: "Total PnL",
      value: `${totalPnl >= 0 ? "+" : ""}$${formatPrice(Math.abs(totalPnl))}`,
      icon: DollarSign,
      color: totalPnl >= 0 ? "text-crypto-green" : "text-crypto-red",
      bgColor: totalPnl >= 0 ? "bg-crypto-green/10" : "bg-crypto-red/10",
    },
    {
      label: "Avg PnL/Trade",
      value: `${avgPnl >= 0 ? "+" : ""}$${formatPrice(Math.abs(avgPnl))}`,
      icon: TrendingUp,
      color: avgPnl >= 0 ? "text-crypto-green" : "text-crypto-red",
      bgColor: avgPnl >= 0 ? "bg-crypto-green/10" : "bg-crypto-red/10",
    },
  ];

  return (
    <motion.div
      key="history"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          >
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={`w-7 h-7 rounded-lg ${card.bgColor} flex items-center justify-center`}
                  >
                    <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {card.label}
                  </span>
                </div>
                <div className={`text-lg font-bold ${card.color}`}>
                  {card.value}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Trade Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <h3 className="text-sm font-medium mb-3">All Trades</h3>
          <TradeTable trades={trades} />
        </CardContent>
      </Card>

      {/* Trade Report */}
      <TradeReport />
    </motion.div>
  );
}
