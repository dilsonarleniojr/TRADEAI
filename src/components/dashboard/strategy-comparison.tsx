"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { GitCompare, Trophy, Sparkles, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type StrategyKey = "RSI" | "MACD" | "AI";

interface StrategyMetrics {
  winRate: number;
  avgReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  totalTrades: number;
  avgHoldTime: string;
}

const STRATEGY_DATA: Record<StrategyKey, StrategyMetrics> = {
  RSI:  { winRate: 58, avgReturn: 12, maxDrawdown: 15, sharpeRatio: 1.2, totalTrades: 156, avgHoldTime: "4.2h" },
  MACD: { winRate: 52, avgReturn: 8,  maxDrawdown: 22, sharpeRatio: 0.85, totalTrades: 98, avgHoldTime: "8.6h" },
  AI:   { winRate: 65, avgReturn: 18, maxDrawdown: 11, sharpeRatio: 1.75, totalTrades: 203, avgHoldTime: "2.8h" },
};

const STRATEGY_STYLES: Record<StrategyKey, { color: string; badge: string; dash: string }> = {
  RSI:  { color: "#06b6d4", badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30", dash: "5 5" },
  MACD: { color: "#f97316", badge: "bg-orange-500/15 text-orange-400 border-orange-500/30", dash: "" },
  AI:   { color: "#a855f7", badge: "bg-purple-500/15 text-purple-400 border-purple-500/30", dash: "2 4" },
};

const METRIC_ROWS: { key: keyof StrategyMetrics; label: string; higherBetter: boolean; fmt: (v: StrategyMetrics[keyof StrategyMetrics]) => string }[] = [
  { key: "winRate",      label: "Win Rate",       higherBetter: true,  fmt: (v) => `${v}%` },
  { key: "avgReturn",    label: "Avg Return",     higherBetter: true,  fmt: (v) => `+${v}%` },
  { key: "maxDrawdown",  label: "Max Drawdown",   higherBetter: false, fmt: (v) => `-${v}%` },
  { key: "sharpeRatio",  label: "Sharpe Ratio",   higherBetter: true,  fmt: (v) => String(v) },
  { key: "totalTrades",  label: "Total Trades",   higherBetter: true,  fmt: (v) => String(v) },
  { key: "avgHoldTime",  label: "Avg Hold Time",  higherBetter: false, fmt: (v) => String(v) },
];

function generateEquityCurve(strategy: StrategyKey, days: number) {
  const data: { day: string; RSI?: number; MACD?: number; AI?: number }[] = [];
  let rsiVal = 10000, macdVal = 10000, aiVal = 10000;
  const seed = strategy === "RSI" ? 42 : strategy === "MACD" ? 77 : 123;
  let rng = seed;
  const rand = () => { rng = (rng * 1664525 + 1013904223) & 0x7fffffff; return rng / 0x7fffffff; };

  for (let i = 0; i < days; i++) {
    rsiVal  *= 1 + (0.004 + rand() * 0.008 - 0.003);
    macdVal *= 1 + (0.003 + rand() * 0.007 - 0.004);
    aiVal   *= 1 + (0.006 + rand() * 0.009 - 0.002);
    data.push({ day: `D${i + 1}`, RSI: +rsiVal.toFixed(2), MACD: +macdVal.toFixed(2), AI: +aiVal.toFixed(2) });
  }
  return data;
}

export function StrategyComparison() {
  const strategies: StrategyKey[] = ["RSI", "MACD", "AI"];

  const equityData = useMemo(() => generateEquityCurve("AI", 30), []);

  const bestPerMetric = useMemo(() => {
    const result: Partial<Record<keyof StrategyMetrics, StrategyKey>> = {};
    for (const m of METRIC_ROWS) {
      let best: StrategyKey = "RSI";
      for (const s of strategies) {
        const a = STRATEGY_DATA[s][m.key];
        const b = STRATEGY_DATA[best][m.key];
        if (typeof a === "number" && typeof b === "number") {
          if (m.higherBetter ? a > b : a < b) best = s;
        }
      }
      result[m.key] = best;
    }
    return result;
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.22, duration: 0.4 }}
    >
      <Card className="glass-card card-accent-cyan">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-crypto-cyan" />
            Strategy Performance Comparison
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Metrics Table */}
          <div className="overflow-x-auto">
            <div className="grid grid-cols-4 gap-0 min-w-[400px]">
              {/* Header row */}
              <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider p-2">
                Metric
              </div>
              {strategies.map((s) => (
                <div key={s} className="flex items-center justify-center p-2">
                  <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5", STRATEGY_STYLES[s].badge)}>
                    {s}
                  </Badge>
                </div>
              ))}
              {/* Data rows */}
              {METRIC_ROWS.map((m) => (
                <div key={m.key} className="contents">
                  <div className="text-[11px] text-muted-foreground font-medium p-2 border-t border-border/30">
                    {m.label}
                  </div>
                  {strategies.map((s) => {
                    const val = STRATEGY_DATA[s][m.key];
                    const isBest = bestPerMetric[m.key] === s;
                    return (
                      <div
                        key={s}
                        className={cn(
                          "text-[11px] font-mono p-2 text-center border-t border-border/30 transition-colors",
                          isBest && "bg-crypto-green/10 text-crypto-green font-semibold"
                        )}
                      >
                        {m.fmt(val)}
                        {isBest && <span className="ml-0.5 text-[8px] text-crypto-green">★</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Equity Curve Comparison */}
          <Card className="bg-card/50 border-border">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium flex items-center gap-2">
                <Trophy className="w-3.5 h-3.5 text-crypto-cyan" />
                Equity Curve Comparison (30 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equityData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" />
                    <XAxis dataKey="day" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} interval={4} />
                    <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }}
                      tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`} />
                    <Tooltip contentStyle={{ backgroundColor: "var(--popover)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "11px" }}
                      formatter={(v: number, n: string) => [`$${v.toLocaleString()}`, n]} />
                    <Legend formatter={(v: string) => v} wrapperStyle={{ fontSize: "10px" }} />
                    {strategies.map((s) => (
                      <Line key={s} type="monotone" dataKey={s} stroke={STRATEGY_STYLES[s].color}
                        strokeWidth={2} strokeDasharray={STRATEGY_STYLES[s].dash || undefined}
                        dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Recommendation Card */}
          <div className="glass-card card-accent-cyan p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold">AI Strategy Recommended</span>
                <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-[9px] px-1.5 py-0">
                  Confidence: 87%
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The AI strategy outperforms both RSI and MACD across all key metrics — highest win rate (65%), 
                best average return (+18%), lowest max drawdown (-11%), and superior risk-adjusted returns (Sharpe 1.75).
                Recommended as the primary strategy for current market conditions.
              </p>
              <div className="flex items-center gap-1 mt-2 text-crypto-green">
                <CheckCircle2 className="w-3 h-3" />
                <span className="text-[10px] font-medium">Best overall performance</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
