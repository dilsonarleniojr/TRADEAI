"use client";

import { useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Gauge, TrendingUp, TrendingDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

// Seeded pseudo-random number generator for deterministic values
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Generate Fear & Greed Index based on market data
function computeFearGreedIndex(tickers: Record<string, import("@/lib/store").TickerData>) {
  const tickerValues = Object.values(tickers);
  if (tickerValues.length === 0) return { value: 50, label: "Neutral", color: "#f59e0b" };

  const totalVolume = tickerValues.reduce((sum, t) => sum + t.quoteVolume, 0);
  let weightedScore = 0;

  for (const t of tickerValues) {
    const weight = totalVolume > 0 ? t.quoteVolume / totalVolume : 1 / tickerValues.length;
    // Map priceChangePercent to 0-100 range
    const normalized = Math.min(100, Math.max(0, 50 + t.priceChangePercent * 3));
    weightedScore += normalized * weight;
  }

  // Add a small seeded variation based on the day so it changes slowly
  const daySeed = Math.floor(Date.now() / 86400000);
  const dailyVariation = (seededRandom(daySeed) - 0.5) * 10;
  const score = Math.round(Math.min(100, Math.max(0, weightedScore + dailyVariation)));

  let label: string;
  let color: string;

  if (score >= 75) {
    label = "Extreme Greed";
    color = "#22c55e";
  } else if (score >= 55) {
    label = "Greed";
    color = "#4ade80";
  } else if (score >= 45) {
    label = "Neutral";
    color = "#f59e0b";
  } else if (score >= 25) {
    label = "Fear";
    color = "#fb923c";
  } else {
    label = "Extreme Fear";
    color = "#ef4444";
  }

  return { value: score, label, color };
}

// Generate 7-day history data
function generateHistory(currentValue: number) {
  const history = [];
  const daySeed = Math.floor(Date.now() / 86400000);

  for (let i = 6; i >= 0; i--) {
    const seed = daySeed - i;
    const variation = (seededRandom(seed * 7 + 3) - 0.5) * 20;
    const value = Math.round(Math.min(100, Math.max(0, currentValue + variation - (i * 0.5))));
    let histLabel: string;
    let histColor: string;

    if (value >= 75) { histLabel = "EG"; histColor = "#22c55e"; }
    else if (value >= 55) { histLabel = "G"; histColor = "#4ade80"; }
    else if (value >= 45) { histLabel = "N"; histColor = "#f59e0b"; }
    else if (value >= 25) { histLabel = "F"; histColor = "#fb923c"; }
    else { histLabel = "EF"; histColor = "#ef4444"; }

    const date = new Date(Date.now() - i * 86400000);
    const dayLabel = date.toLocaleDateString("en-US", { weekday: "short" });

    history.push({ day: dayLabel, value, label: histLabel, color: histColor });
  }

  return history;
}

// Get color for a given Fear & Greed value
function getFgColor(value: number): string {
  if (value >= 75) return "#22c55e";
  if (value >= 55) return "#4ade80";
  if (value >= 45) return "#f59e0b";
  if (value >= 25) return "#fb923c";
  return "#ef4444";
}

export function FearGreedIndex() {
  const { tickers } = useCryptoStore();

  const fearGreed = useMemo(() => computeFearGreedIndex(tickers), [tickers]);
  const history = useMemo(() => generateHistory(fearGreed.value), [fearGreed.value]);

  // SVG gauge parameters
  const cx = 120;
  const cy = 100;
  const radius = 85;
  const needleLength = 65;

  // Calculate needle angle (0 = left, 180 = right, 90 = top)
  const needleAngle = 180 - (fearGreed.value / 100) * 180;
  const needleRad = (needleAngle * Math.PI) / 180;
  const needleX = cx + needleLength * Math.cos(needleRad);
  const needleY = cy - needleLength * Math.sin(needleRad);

  // Tick marks for key positions
  const tickPositions = [0, 25, 45, 55, 75, 100];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.4 }}
    >
      <Card className="glass-card card-accent-cyan h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Gauge className="w-4 h-4 text-crypto-cyan" />
              Fear &amp; Greed Index
            </CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
                  <Info className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={4} className="max-w-[250px]">
                <p className="text-xs leading-relaxed">The Fear &amp; Greed Index measures market sentiment. Extreme Fear often signals buying opportunities, while Extreme Greed may indicate a market top.</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center pb-4">
          {/* Semi-circular Gauge */}
          <div className="relative w-[240px] h-[130px]">
            <svg viewBox="0 0 240 115" className="w-full h-full overflow-visible">
              {/* Gradient definition */}
              <defs>
                <linearGradient id="fgGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="20%" stopColor="#fb923c" />
                  <stop offset="40%" stopColor="#f59e0b" />
                  <stop offset="60%" stopColor="#86efac" />
                  <stop offset="80%" stopColor="#4ade80" />
                  <stop offset="100%" stopColor="#22c55e" />
                </linearGradient>
                <filter id="needleGlow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Background arc (gray) */}
              <path
                d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
                fill="none"
                stroke="oklch(1 0 0 / 6%)"
                strokeWidth={16}
                strokeLinecap="round"
              />

              {/* Colored arc - full gradient background */}
              <path
                d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
                fill="none"
                stroke="url(#fgGaugeGradient)"
                strokeWidth={16}
                strokeLinecap="round"
                opacity={0.3}
              />

              {/* Animated value arc */}
              <motion.path
                d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
                fill="none"
                stroke="url(#fgGaugeGradient)"
                strokeWidth={16}
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: fearGreed.value / 100 }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                style={{ pathLength: 1 }}
              />

              {/* Tick marks at key positions */}
              {tickPositions.map((pos) => {
                const tickAngle = 180 - (pos / 100) * 180;
                const tickRad = (tickAngle * Math.PI) / 180;
                const outerR = radius + 12;
                const innerR = radius + 6;
                const x1 = cx + innerR * Math.cos(tickRad);
                const y1 = cy - innerR * Math.sin(tickRad);
                const x2 = cx + outerR * Math.cos(tickRad);
                const y2 = cy - outerR * Math.sin(tickRad);
                return (
                  <line
                    key={pos}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="oklch(0.65 0 0 / 40%)"
                    strokeWidth={1.5}
                  />
                );
              })}

              {/* Zone labels on outer edge */}
              {[
                { pos: 12, label: "EF" },
                { pos: 35, label: "F" },
                { pos: 50, label: "N" },
                { pos: 65, label: "G" },
                { pos: 87, label: "EG" },
              ].map(({ pos, label }) => {
                const labelAngle = 180 - (pos / 100) * 180;
                const labelRad = (labelAngle * Math.PI) / 180;
                const labelR = radius + 24;
                const lx = cx + labelR * Math.cos(labelRad);
                const ly = cy - labelR * Math.sin(labelRad);
                return (
                  <text
                    key={label}
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="oklch(0.55 0 0)"
                    fontSize={8}
                    fontWeight={600}
                  >
                    {label}
                  </text>
                );
              })}

              {/* Needle */}
              <motion.g
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              >
                {/* Needle glow */}
                <line
                  x1={cx}
                  y1={cy}
                  x2={needleX}
                  y2={needleY}
                  stroke={fearGreed.color}
                  strokeWidth={4}
                  strokeLinecap="round"
                  filter="url(#needleGlow)"
                  opacity={0.4}
                />
                {/* Needle line */}
                <motion.line
                  x1={cx}
                  y1={cy}
                  x2={needleX}
                  y2={needleY}
                  stroke={fearGreed.color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  style={{ filter: "drop-shadow(0 0 6px rgba(6,182,212,0.5))" }}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 0.5, duration: 1, ease: "easeOut" }}
                />
                {/* Center dot */}
                <circle cx={cx} cy={cy} r={5} fill={fearGreed.color} opacity={0.3} />
                <circle cx={cx} cy={cy} r={3} fill={fearGreed.color} />
              </motion.g>
            </svg>

            {/* Center text overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
              <div className="flex items-center gap-2">
                <motion.span
                  className="text-4xl font-extrabold drop-shadow-sm"
                  style={{ color: fearGreed.color, textShadow: `0 0 20px ${fearGreed.color}40` }}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.8, duration: 0.4, type: "spring", stiffness: 200 }}
                >
                  {fearGreed.value}
                </motion.span>
              </div>
              <motion.span
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: fearGreed.color, textShadow: `0 0 12px ${fearGreed.color}30` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1, duration: 0.3 }}
              >
                {fearGreed.label}
              </motion.span>
            </div>
          </div>

          {/* Zone legend */}
          <div className="w-full mt-2 flex items-center justify-between px-1">
            {[
              { label: "Extreme Fear", range: "0-25", color: "#ef4444" },
              { label: "Fear", range: "25-45", color: "#fb923c" },
              { label: "Neutral", range: "45-55", color: "#f59e0b" },
              { label: "Greed", range: "55-75", color: "#4ade80" },
              { label: "Extreme Greed", range: "75-100", color: "#22c55e" },
            ].map((zone) => (
              <div key={zone.label} className="flex flex-col items-center gap-0.5">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: zone.color }}
                />
                <span className="text-[8px] text-muted-foreground font-medium hidden sm:block">
                  {zone.label}
                </span>
              </div>
            ))}
          </div>

          {/* 7-day History */}
          <div className="w-full mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                7-Day History
              </span>
              <div className="flex items-center gap-1">
                {fearGreed.value >= 55 ? (
                  <TrendingUp className="w-3 h-3 text-crypto-green" />
                ) : fearGreed.value <= 45 ? (
                  <TrendingDown className="w-3 h-3 text-crypto-red" />
                ) : (
                  <Gauge className="w-3 h-3 text-crypto-gold" />
                )}
                <span
                  className={cn(
                    "text-[10px] font-semibold",
                    fearGreed.value > history[0]?.value ? "text-crypto-green" :
                    fearGreed.value < history[0]?.value ? "text-crypto-red" : "text-muted-foreground"
                  )}
                >
                  {fearGreed.value > (history[0]?.value ?? 0) ? "↑" : fearGreed.value < (history[0]?.value ?? 0) ? "↓" : "→"}
                  {" "}vs yesterday
                </span>
              </div>
            </div>
            <div className="flex items-end gap-1.5 h-[48px]">
              {history.map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <motion.div
                    className="w-full rounded-t-sm min-h-[4px]"
                    style={{
                      backgroundColor: day.color,
                      opacity: 0.7,
                      height: `${Math.max(8, (day.value / 100) * 48)}px`,
                    }}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{
                      height: `${Math.max(8, (day.value / 100) * 48)}px`,
                      opacity: i === history.length - 1 ? 1 : 0.7,
                    }}
                    transition={{ delay: 0.1 * i, duration: 0.4, ease: "easeOut" }}
                  />
                  <span className="text-[7px] text-muted-foreground font-medium">{day.day}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
