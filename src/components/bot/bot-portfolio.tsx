"use client";

import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  Wallet,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from "lucide-react";
import { motion } from "framer-motion";

export function BotPortfolio() {
  const { portfolio, botConfig, trades } = useCryptoStore();

  const todayTrades = trades.filter((t) => {
    const tradeDate = new Date(t.timestamp).toDateString();
    const today = new Date().toDateString();
    return tradeDate === today;
  });

  const pnlIsPositive = portfolio.pnl >= 0;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Wallet className="w-4 h-4 text-crypto-cyan" />
          Portfolio Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total Balance */}
        <div className="bg-secondary/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Current Balance</span>
          </div>
          <motion.div
            key={portfolio.totalValue}
            initial={{ scale: 1.02 }}
            animate={{ scale: 1 }}
            className="text-2xl font-bold tracking-tight"
          >
            ${formatPrice(portfolio.totalValue)}
          </motion.div>
        </div>

        {/* Cash & Assets */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Cash
            </span>
            <div className="text-sm font-medium">
              ${formatPrice(portfolio.cashBalance)}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Assets
            </span>
            <div className="text-sm font-medium">
              ${formatPrice(portfolio.assetBalance)}
            </div>
          </div>
        </div>

        {/* Unrealized PnL */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {pnlIsPositive ? (
              <TrendingUp className="w-4 h-4 text-crypto-green" />
            ) : (
              <TrendingDown className="w-4 h-4 text-crypto-red" />
            )}
            <span className="text-xs text-muted-foreground">Unrealized PnL</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-semibold ${
                pnlIsPositive ? "text-crypto-green" : "text-crypto-red"
              }`}
            >
              {pnlIsPositive ? "+" : ""}${formatPrice(Math.abs(portfolio.pnl))}
            </span>
            <Badge
              className={`text-[10px] ${
                pnlIsPositive
                  ? "bg-crypto-green/15 text-crypto-green border-crypto-green/30"
                  : "bg-crypto-red/15 text-crypto-red border-crypto-red/30"
              }`}
            >
              {pnlIsPositive ? "+" : ""}
              {portfolio.pnlPercent.toFixed(2)}%
            </Badge>
          </div>
        </div>

        {/* Daily Trades */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Daily Trades</span>
            </div>
            <span className="text-xs font-medium">
              {todayTrades.length}/{botConfig.maxDailyTrades}
            </span>
          </div>
          <Progress
            value={(todayTrades.length / botConfig.maxDailyTrades) * 100}
            className="h-1.5"
          />
        </div>

        {/* Asset Holdings */}
        {portfolio.assetQuantity > 0 && (
          <div className="bg-secondary/30 rounded-lg p-3 space-y-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Asset Holdings
            </span>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {botConfig.symbol.replace("USDT", "")}
              </span>
              <span className="text-sm text-muted-foreground">
                {portfolio.assetQuantity.toFixed(6)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
