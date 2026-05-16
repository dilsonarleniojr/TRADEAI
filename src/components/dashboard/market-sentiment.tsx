"use client";

import { useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Gauge, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function MarketSentiment() {
  const { tickers } = useCryptoStore();

  const sentiment = useMemo(() => {
    const tickerValues = Object.values(tickers);
    if (tickerValues.length === 0) return { score: 50, label: "Neutral", color: "#f59e0b" };

    // Calculate weighted sentiment based on price changes
    const totalVolume = tickerValues.reduce((sum, t) => sum + t.quoteVolume, 0);
    let weightedScore = 0;

    for (const t of tickerValues) {
      const weight = totalVolume > 0 ? t.quoteVolume / totalVolume : 1 / tickerValues.length;
      // Convert priceChangePercent (-10 to +10) to score (0 to 100)
      const normalized = Math.min(100, Math.max(0, 50 + t.priceChangePercent * 3));
      weightedScore += normalized * weight;
    }

    const score = Math.round(weightedScore);
    let label: string;
    let color: string;

    if (score >= 75) {
      label = "Extreme Greed";
      color = "#22c55e";
    } else if (score >= 60) {
      label = "Greed";
      color = "#4ade80";
    } else if (score >= 45) {
      label = "Neutral";
      color = "#f59e0b";
    } else if (score >= 30) {
      label = "Fear";
      color = "#fb923c";
    } else {
      label = "Extreme Fear";
      color = "#ef4444";
    }

    return { score, label, color };
  }, [tickers]);

  // Gauge arc SVG parameters
  const gaugeRadius = 60;
  const gaugeStroke = 10;
  const circumference = Math.PI * gaugeRadius; // half circle
  const dashOffset = circumference - (sentiment.score / 100) * circumference;

  // Counts
  const tickerValues = Object.values(tickers);
  const gainers = tickerValues.filter(t => t.priceChangePercent > 0).length;
  const losers = tickerValues.filter(t => t.priceChangePercent < 0).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
    >
      <Card className="bg-card/60 backdrop-blur-md border-white/5 h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Gauge className="w-4 h-4 text-crypto-cyan" />
            Market Sentiment
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center pb-4">
          {/* SVG Gauge */}
          <div className="relative w-[180px] h-[110px]">
            <svg viewBox="0 0 160 95" className="w-full h-full">
              {/* Background arc */}
              <path
                d="M 20 85 A 60 60 0 0 1 140 85"
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={gaugeStroke}
                strokeLinecap="round"
              />
              {/* Gradient definitions */}
              <defs>
                <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="25%" stopColor="#fb923c" />
                  <stop offset="50%" stopColor="#f59e0b" />
                  <stop offset="75%" stopColor="#4ade80" />
                  <stop offset="100%" stopColor="#22c55e" />
                </linearGradient>
              </defs>
              {/* Value arc */}
              <motion.path
                d="M 20 85 A 60 60 0 0 1 140 85"
                fill="none"
                stroke="url(#gaugeGradient)"
                strokeWidth={gaugeStroke}
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: sentiment.score / 100 }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                style={{ pathLength: 1 }}
              />
              {/* Needle indicator */}
              <motion.circle
                cx={80 + 55 * Math.cos(Math.PI - (sentiment.score / 100) * Math.PI)}
                cy={85 - 55 * Math.sin(Math.PI - (sentiment.score / 100) * Math.PI)}
                r={5}
                fill={sentiment.color}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              />
              <motion.circle
                cx={80 + 55 * Math.cos(Math.PI - (sentiment.score / 100) * Math.PI)}
                cy={85 - 55 * Math.sin(Math.PI - (sentiment.score / 100) * Math.PI)}
                r={10}
                fill={sentiment.color}
                opacity={0.2}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.2 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              />
            </svg>
            {/* Center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
              <motion.span
                className="text-2xl font-bold"
                style={{ color: sentiment.color }}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8, duration: 0.4 }}
              >
                {sentiment.score}
              </motion.span>
              <span
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: sentiment.color }}
              >
                {sentiment.label}
              </span>
            </div>
          </div>

          {/* Gainers vs Losers bar */}
          <div className="w-full mt-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3 text-crypto-green" />
                <span className="text-crypto-green font-medium">{gainers} Gainers</span>
              </div>
              <div className="flex items-center gap-1.5">
                <TrendingDown className="w-3 h-3 text-crypto-red" />
                <span className="text-crypto-red font-medium">{losers} Losers</span>
              </div>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden flex">
              <motion.div
                className="h-full bg-crypto-green"
                initial={{ width: 0 }}
                animate={{ width: tickerValues.length > 0 ? `${(gainers / tickerValues.length) * 100}%` : "50%" }}
                transition={{ delay: 1, duration: 0.8 }}
              />
              <motion.div
                className="h-full bg-crypto-red"
                initial={{ width: 0 }}
                animate={{ width: tickerValues.length > 0 ? `${(losers / tickerValues.length) * 100}%` : "50%" }}
                transition={{ delay: 1, duration: 0.8 }}
              />
            </div>
            {/* Labels */}
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>Extreme Fear</span>
              <span>Neutral</span>
              <span>Extreme Greed</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
