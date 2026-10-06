"use client";

import { useState } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  TrendingUp,
  TrendingDown,
  Trophy,
  Skull,
  Clock,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useShallow } from "zustand/react/shallow";

interface ReportData {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  totalPnlPercent: number;
  bestTrade: { symbol: string; pnl: number } | null;
  worstTrade: { symbol: string; pnl: number } | null;
  avgHoldTime: string;
  strategyBreakdown: Record<string, { trades: number; wins: number; pnl: number }>;
}

export function TradeReport() {
  const { trades, botActive, portfolio } = useCryptoStore(
  useShallow((s) => ({ trades: s.trades, botActive: s.botActive, portfolio: s.portfolio }))
);
  const [showReport, setShowReport] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);

  const generateReport = () => {
    const closedTrades = trades.filter((t) => t.pnl !== 0);
    const wins = closedTrades.filter((t) => t.pnl > 0);
    const losses = closedTrades.filter((t) => t.pnl < 0);

    const totalPnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalPnlPercent =
      portfolio.totalValue > 0
        ? (totalPnl / (portfolio.totalValue - totalPnl)) * 100
        : 0;

    const sortedByPnl = [...closedTrades].sort((a, b) => b.pnl - a.pnl);
    const bestTrade =
      sortedByPnl.length > 0
        ? { symbol: sortedByPnl[0].symbol, pnl: sortedByPnl[0].pnl }
        : null;
    const worstTrade =
      sortedByPnl.length > 0
        ? {
            symbol: sortedByPnl[sortedByPnl.length - 1].symbol,
            pnl: sortedByPnl[sortedByPnl.length - 1].pnl,
          }
        : null;

    // Strategy breakdown
    const strategyBreakdown: Record<
      string,
      { trades: number; wins: number; pnl: number }
    > = {};
    for (const t of trades) {
      if (!strategyBreakdown[t.strategy]) {
        strategyBreakdown[t.strategy] = { trades: 0, wins: 0, pnl: 0 };
      }
      strategyBreakdown[t.strategy].trades++;
      if (t.pnl > 0) strategyBreakdown[t.strategy].wins++;
      strategyBreakdown[t.strategy].pnl += t.pnl;
    }

    // Real average hold time calculated from trade timestamps
    let totalHoldMs = 0;
    let holdCount = 0;
    const buyTimesBySymbol: Record<string, number[]> = {};
    for (const t of trades) {
      const timeMs = new Date(t.timestamp).getTime();
      if (t.side === "BUY") {
        if (!buyTimesBySymbol[t.symbol]) buyTimesBySymbol[t.symbol] = [];
        buyTimesBySymbol[t.symbol].push(timeMs);
      } else if (t.side === "SELL" && buyTimesBySymbol[t.symbol]?.length > 0) {
        const buyTime = buyTimesBySymbol[t.symbol].shift()!;
        const duration = Math.max(0, timeMs - buyTime);
        totalHoldMs += duration;
        holdCount++;
      }
    }

    let avgHoldTime = "N/A";
    if (holdCount > 0) {
      const avgSec = Math.floor((totalHoldMs / holdCount) / 1000);
      const hours = Math.floor(avgSec / 3600);
      const minutes = Math.floor((avgSec % 3600) / 60);
      const seconds = avgSec % 60;
      if (hours > 0) avgHoldTime = `${hours}h ${minutes}m`;
      else if (minutes > 0) avgHoldTime = `${minutes}m ${seconds}s`;
      else avgHoldTime = `${seconds}s`;
    }

    setReport({
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate:
        closedTrades.length > 0
          ? (wins.length / closedTrades.length) * 100
          : 0,
      totalPnl,
      totalPnlPercent,
      bestTrade,
      worstTrade,
      avgHoldTime,
      strategyBreakdown,
    });
    setShowReport(true);
  };

  return (
    <Card className="bg-card/60 backdrop-blur-md gradient-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileText className="w-4 h-4 text-crypto-cyan" />
          Trade Report
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!showReport ? (
          <div className="text-center py-6">
            {botActive ? (
              <p className="text-xs text-muted-foreground mb-3">
                Stop the bot to generate a trade report.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-3">
                  Generate a detailed report of all trading activity.
                </p>
                <Button
                  onClick={generateReport}
                  variant="outline"
                  size="sm"
                  className="border-crypto-cyan/30 text-crypto-cyan hover:bg-crypto-cyan/10"
                  disabled={trades.length === 0}
                >
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  Generate Report
                </Button>
              </>
            )}
          </div>
        ) : (
          report && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-crypto-cyan">
                  Report Generated
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setShowReport(false)}
                >
                  <ChevronUp className="w-3 h-3 mr-1" />
                  Close
                </Button>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/30 rounded-lg p-2.5">
                  <div className="text-[10px] text-muted-foreground mb-0.5">
                    Total Trades
                  </div>
                  <div className="text-lg font-bold">{report.totalTrades}</div>
                </div>
                <div className="bg-secondary/30 rounded-lg p-2.5">
                  <div className="text-[10px] text-muted-foreground mb-0.5">
                    Win/Loss
                  </div>
                  <div className="text-lg font-bold">
                    <span className="text-crypto-green">{report.wins}</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span className="text-crypto-red">{report.losses}</span>
                  </div>
                </div>
              </div>

              {/* PnL Summary */}
              <div className="bg-secondary/30 rounded-lg p-2.5">
                <div className="text-[10px] text-muted-foreground mb-1">
                  Total PnL
                </div>
                <div
                  className={`text-xl font-bold ${
                    report.totalPnl >= 0
                      ? "text-crypto-green"
                      : "text-crypto-red"
                  }`}
                >
                  {report.totalPnl >= 0 ? "+" : ""}$
                  {formatPrice(Math.abs(report.totalPnl))}
                </div>
                <div
                  className={`text-xs ${
                    report.totalPnlPercent >= 0
                      ? "text-crypto-green"
                      : "text-crypto-red"
                  }`}
                >
                  {report.totalPnlPercent >= 0 ? "+" : ""}
                  {report.totalPnlPercent.toFixed(2)}%
                </div>
              </div>

              {/* Best & Worst */}
              <div className="grid grid-cols-2 gap-3">
                {report.bestTrade && (
                  <div className="bg-crypto-green/5 border border-crypto-green/20 rounded-lg p-2.5">
                    <div className="flex items-center gap-1 text-[10px] text-crypto-green mb-1">
                      <Trophy className="w-3 h-3" />
                      Best Trade
                    </div>
                    <div className="text-xs font-medium">
                      {report.bestTrade.symbol.replace("USDT", "")}
                    </div>
                    <div className="text-sm font-bold text-crypto-green">
                      +${formatPrice(report.bestTrade.pnl)}
                    </div>
                  </div>
                )}
                {report.worstTrade && (
                  <div className="bg-crypto-red/5 border border-crypto-red/20 rounded-lg p-2.5">
                    <div className="flex items-center gap-1 text-[10px] text-crypto-red mb-1">
                      <Skull className="w-3 h-3" />
                      Worst Trade
                    </div>
                    <div className="text-xs font-medium">
                      {report.worstTrade.symbol.replace("USDT", "")}
                    </div>
                    <div className="text-sm font-bold text-crypto-red">
                      -${formatPrice(Math.abs(report.worstTrade.pnl))}
                    </div>
                  </div>
                )}
              </div>

              {/* Avg Hold Time */}
              <div className="flex items-center justify-between bg-secondary/30 rounded-lg p-2.5">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Avg Hold Time
                  </span>
                </div>
                <span className="text-xs font-medium">{report.avgHoldTime}</span>
              </div>

              {/* Strategy Breakdown */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Strategy Breakdown
                  </span>
                </div>
                {Object.entries(report.strategyBreakdown).map(
                  ([strategy, data]) => (
                    <div
                      key={strategy}
                      className="flex items-center justify-between bg-secondary/20 rounded-md p-2"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="text-[10px] border-border"
                        >
                          {strategy}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {data.trades} trades
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          Win: {((data.wins / data.trades) * 100).toFixed(0)}%
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            data.pnl >= 0
                              ? "text-crypto-green"
                              : "text-crypto-red"
                          }`}
                        >
                          {data.pnl >= 0 ? "+" : ""}$
                          {formatPrice(Math.abs(data.pnl))}
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>
            </motion.div>
          )
        )}
      </CardContent>
    </Card>
  );
}
