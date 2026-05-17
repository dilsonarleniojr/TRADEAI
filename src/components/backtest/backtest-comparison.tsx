"use client";

import { BacktestResultData } from "./backtest-results";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Legend,
} from "recharts";
import { formatPrice } from "@/lib/format";
import { GitCompare, Trophy } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type StrategyKey = "RSI" | "MACD" | "AI";

const STRATEGY_COLORS: Record<StrategyKey, string> = {
  RSI: "#facc15",
  MACD: "#a855f7",
  AI: "#22d3ee",
};

const STRATEGY_LABELS: Record<StrategyKey, string> = {
  RSI: "RSI",
  MACD: "MACD",
  AI: "AI",
};

interface BacktestComparisonProps {
  results: Record<StrategyKey, BacktestResultData>;
  strategies: StrategyKey[];
}

interface MetricRow {
  label: string;
  key: keyof BacktestResultData | string;
  format: (val: number | string | null, result: BacktestResultData) => string;
  higherIsBetter: boolean;
}

const METRICS: MetricRow[] = [
  {
    label: "Retorno Total",
    key: "totalReturnPercent",
    format: (val) => `${parseFloat(String(val)) >= 0 ? "+" : ""}${parseFloat(String(val)).toFixed(2)}%`,
    higherIsBetter: true,
  },
  {
    label: "Taxa de Acerto",
    key: "winRate",
    format: (val) => `${parseFloat(String(val)).toFixed(1)}%`,
    higherIsBetter: true,
  },
  {
    label: "Drawdown Máx.",
    key: "maxDrawdown",
    format: (val) => `-${parseFloat(String(val)).toFixed(2)}%`,
    higherIsBetter: false,
  },
  {
    label: "Sharpe Ratio",
    key: "sharpeRatio",
    format: (val) => parseFloat(String(val)).toFixed(2),
    higherIsBetter: true,
  },
  {
    label: "Sortino Ratio",
    key: "sortinoRatio",
    format: (val) => parseFloat(String(val)).toFixed(2),
    higherIsBetter: true,
  },
  {
    label: "Profit Factor",
    key: "profitFactor",
    format: (val) => val === null ? "∞" : parseFloat(String(val)).toFixed(2),
    higherIsBetter: true,
  },
  {
    label: "# Trades",
    key: "totalTrades",
    format: (val) => String(val),
    higherIsBetter: true,
  },
];

function getMetricValue(result: BacktestResultData, key: string): number | string | null {
  return (result as Record<string, unknown>)[key] as number | string | null;
}

export function BacktestComparison({ results, strategies }: BacktestComparisonProps) {
  // Build combined equity curve data
  const combinedEquityData = (() => {
    if (strategies.length === 0) return [];

    // Use the longest equity curve as the base for dates
    let longestCurve = results[strategies[0]].equityCurve;
    for (const key of strategies) {
      if (results[key].equityCurve.length > longestCurve.length) {
        longestCurve = results[key].equityCurve;
      }
    }

    return longestCurve.map((point, i) => {
      const entry: Record<string, string | number> = {
        date: point.date,
      };
      for (const key of strategies) {
        const curve = results[key].equityCurve;
        entry[key] = i < curve.length ? curve[i].value : curve[curve.length - 1]?.value ?? 0;
      }
      return entry;
    });
  })();

  // Determine best/worst for each metric
  const getMetricRanking = (metric: MetricRow) => {
    const values = strategies.map((key) => {
      const val = getMetricValue(results[key], metric.key);
      return { key, val };
    });

    // Parse numeric values for comparison
    const numericValues = values.map((v) => {
      if (v.val === null) return { ...v, numVal: metric.higherIsBetter ? Infinity : -Infinity };
      return { ...v, numVal: typeof v.val === "number" ? v.val : parseFloat(String(v.val)) || 0 };
    });

    // Sort by value
    const sorted = [...numericValues].sort((a, b) =>
      metric.higherIsBetter ? b.numVal - a.numVal : a.numVal - b.numVal
    );

    const best = sorted[0]?.key;
    const worst = sorted[sorted.length - 1]?.key;

    return { best, worst };
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Comparison Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-crypto-gold" />
            Comparação de Estratégias
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-xs font-medium text-muted-foreground h-9 min-w-[120px]">
                    Metric
                  </TableHead>
                  {strategies.map((key) => (
                    <TableHead
                      key={key}
                      className="text-xs font-semibold h-9 text-center"
                      style={{ color: STRATEGY_COLORS[key] }}
                    >
                      {STRATEGY_LABELS[key]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {METRICS.map((metric) => {
                  const { best, worst } = getMetricRanking(metric);
                  return (
                    <TableRow key={metric.key} className="border-border/50">
                      <TableCell className="text-xs font-medium text-muted-foreground py-2.5">
                        {metric.label}
                      </TableCell>
                      {strategies.map((key) => {
                        const val = getMetricValue(results[key], metric.key);
                        const formattedVal = metric.format(val, results[key]);
                        const isBest = best === key && strategies.length > 1;
                        const isWorst = worst === key && strategies.length > 1;

                        return (
                          <TableCell
                            key={key}
                            className={cn(
                              "text-xs font-mono text-center py-2.5",
                              isBest && "bg-crypto-green/10 text-crypto-green font-semibold",
                              isWorst && !isBest && "bg-crypto-red/10 text-crypto-red"
                            )}
                          >
                            {formattedVal}
                            {isBest && (
                              <span className="ml-1 text-[8px] text-crypto-green">★</span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Overlay Equity Curves */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Trophy className="w-4 h-4 text-crypto-cyan" />
            Equity Curve Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={combinedEquityData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
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
                  formatter={(value: number, name: string) => [
                    `$${formatPrice(value)}`,
                    STRATEGY_LABELS[name as StrategyKey] || name,
                  ]}
                />
                <Legend
                  formatter={(value: string) =>
                    STRATEGY_LABELS[value as StrategyKey] || value
                  }
                />
                {strategies.map((key) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={STRATEGY_COLORS[key]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
