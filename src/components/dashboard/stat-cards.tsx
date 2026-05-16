"use client";

import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatPercent } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import {
  Wallet,
  ArrowUpDown,
  Bot,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.4 },
  }),
};

export function StatCards() {
  const { portfolio, trades, botActive, tickers } = useCryptoStore();

  // Find best performer from tickers
  const tickerValues = Object.values(tickers);
  const bestPerformer = tickerValues.length > 0
    ? tickerValues.reduce((best, t) =>
        t.priceChangePercent > best.priceChangePercent ? t : best
      )
    : null;

  const todayTrades = trades.length;

  const stats = [
    {
      title: "Portfolio Value",
      value: `$${formatPrice(portfolio.totalValue)}`,
      subValue: formatPercent(portfolio.pnlPercent),
      subPositive: portfolio.pnlPercent >= 0,
      icon: Wallet,
      iconColor: "text-crypto-cyan",
      iconBg: "bg-crypto-cyan/10",
    },
    {
      title: "Total Trades Today",
      value: todayTrades.toString(),
      subValue: `${trades.filter((t) => t.pnl > 0).length} profitable`,
      subPositive: true,
      icon: ArrowUpDown,
      iconColor: "text-crypto-gold",
      iconBg: "bg-crypto-gold/10",
    },
    {
      title: "Bot Status",
      value: botActive ? "Active" : "Inactive",
      subValue: botActive ? "Running strategies" : "Paused",
      subPositive: botActive,
      icon: Bot,
      iconColor: botActive ? "text-crypto-green" : "text-muted-foreground",
      iconBg: botActive ? "bg-crypto-green/10" : "bg-secondary",
    },
    {
      title: "Best Performer",
      value: bestPerformer
        ? bestPerformer.symbol.replace("USDT", "")
        : "—",
      subValue: bestPerformer
        ? formatPercent(bestPerformer.priceChangePercent)
        : "No data",
      subPositive: bestPerformer ? bestPerformer.priceChangePercent >= 0 : true,
      icon: TrendingUp,
      iconColor: "text-crypto-green",
      iconBg: "bg-crypto-green/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.title}
          custom={i}
          initial="hidden"
          animate="visible"
          variants={cardVariants}
        >
          <Card className="bg-card border-border hover:border-primary/30 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs text-muted-foreground font-medium">
                  {stat.title}
                </span>
                <div className={cn("p-1.5 rounded-md", stat.iconBg)}>
                  <stat.icon className={cn("w-3.5 h-3.5", stat.iconColor)} />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-lg md:text-xl font-bold tracking-tight">
                  {stat.value}
                </p>
                <p
                  className={cn(
                    "text-xs font-medium",
                    stat.subPositive ? "text-crypto-green" : "text-crypto-red"
                  )}
                >
                  {stat.subValue}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
