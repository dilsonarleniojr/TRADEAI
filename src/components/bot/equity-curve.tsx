"use client";

import { useMemo, useState } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import {
  TrendingUp,
  Activity,
  Award,
  AlertTriangle,
  Play,
  RotateCcw,
  Zap,
  Info,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useShallow } from "zustand/react/shallow";

export function EquityCurve() {
  const { trades, marginLedger } = useCryptoStore(
  useShallow((s) => ({ trades: s.trades, marginLedger: s.marginLedger }))
);
  const [selectedTradeIndex, setSelectedTradeIndex] = useState<number | null>(null);
  const [replaySpeed, setReplaySpeed] = useState<"1x" | "2x" | "4x">("1x");
  const [isPlaying, setIsPlaying] = useState(false);
  const [replayStep, setReplayStep] = useState(0);

  // Compute equity path
  const equityData = useMemo(() => {
    if (trades.length === 0) return [];
    
    // Sort chronologically (oldest first)
    const chronologicalTrades = [...trades].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let currentEquity = marginLedger.totalAccount - marginLedger.currentDrawdown;
    if (trades.length > 0) {
      // Start backward calculating from current total balance
      currentEquity = marginLedger.totalAccount;
    }

    const points: { index: number; timestamp: number; equity: number; pnl: number; symbol: string; side: string; tradeId?: string }[] = [];
    let initialBalance = currentEquity - trades.reduce((sum, t) => sum + t.pnl, 0);
    
    // Initial starting point
    points.push({
      index: 0,
      timestamp: Date.now() - 3600000 * 24, // yesterday placeholder
      equity: parseFloat(initialBalance.toFixed(2)),
      pnl: 0,
      symbol: "Start",
      side: "NONE"
    });

    let runningEquity = initialBalance;
    chronologicalTrades.forEach((trade, idx) => {
      runningEquity += trade.pnl;
      points.push({
        index: idx + 1,
        timestamp: new Date(trade.timestamp).getTime(),
        equity: parseFloat(runningEquity.toFixed(2)),
        pnl: trade.pnl,
        symbol: trade.symbol,
        side: trade.side,
        tradeId: trade.id
      });
    });

    return points;
  }, [trades, marginLedger]);

  // Performance calculations
  const stats = useMemo(() => {
    if (trades.length === 0) return null;

    const closed = trades.filter((t) => t.pnl !== 0);
    const wins = closed.filter((t) => t.pnl > 0);
    const losses = closed.filter((t) => t.pnl < 0);

    const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
    
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit;

    // Sharpe Ratio estimate (daily/trade level)
    const pnls = closed.map((t) => t.pnl);
    const meanPnl = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    const variance = pnls.reduce((s, p) => s + (p - meanPnl) ** 2, 0) / pnls.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (meanPnl / stdDev) * Math.sqrt(252) : 0; // annualized standard factor

    // Max Drawdown calculation from equity path
    let peak = -Infinity;
    let maxDd = 0;
    
    equityData.forEach((pt) => {
      if (pt.equity > peak) {
        peak = pt.equity;
      }
      const dd = peak > 0 ? (peak - pt.equity) / peak : 0;
      if (dd > maxDd) {
        maxDd = dd;
      }
    });

    return {
      winRate,
      profitFactor,
      sharpeRatio,
      maxDrawdown: maxDd * 100,
    };
  }, [trades, equityData]);

  // Replay animation step
  const handlePlayReplay = () => {
    if (equityData.length === 0) return;
    setIsPlaying(true);
    setReplayStep(0);

    const speedMs = replaySpeed === "1x" ? 800 : replaySpeed === "2x" ? 400 : 150;
    
    const run = (step: number) => {
      setTimeout(() => {
        setReplayStep(step);
        if (step < equityData.length - 1 && isPlaying) {
          run(step + 1);
        } else {
          setIsPlaying(false);
        }
      }, speedMs);
    };

    run(1);
  };

  const visibleData = isPlaying ? equityData.slice(0, replayStep + 1) : equityData;

  if (trades.length === 0) return null;

  return (
    <Card className="bg-zinc-900/80 border border-white/8 backdrop-blur-md relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
      <CardHeader className="pb-3 border-b border-white/5 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          Curva de Equity & Replay Tático
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] font-mono border-white/10">
            {trades.length} Ordens Executadas
          </Badge>
          <div className="flex gap-1">
            {(["1x", "2x", "4x"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setReplaySpeed(s)}
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                  replaySpeed === s
                    ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
                    : "text-muted-foreground border-white/5 hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px] gap-1 px-2 border-white/10 hover:bg-white/5"
            onClick={handlePlayReplay}
            disabled={isPlaying}
          >
            <Play className="w-3 h-3 text-cyan-400" /> Replay
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="pt-4 space-y-4">
        {/* Performance Cards Row */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Win Rate", val: `${stats.winRate.toFixed(1)}%`, icon: Award, color: "text-emerald-400" },
              { label: "Profit Factor", val: stats.profitFactor.toFixed(2), icon: TrendingUp, color: "text-cyan-400" },
              { label: "Sharpe Ratio (An.)", val: stats.sharpeRatio.toFixed(2), icon: Activity, color: "text-amber-400" },
              { label: "Max Drawdown", val: `${stats.maxDrawdown.toFixed(1)}%`, icon: AlertTriangle, color: "text-red-400" },
            ].map(({ label, val, icon: Icon, color }) => (
              <div key={label} className="p-3 rounded-xl bg-white/3 border border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase font-mono">{label}</p>
                  <p className={`text-base font-bold font-mono mt-0.5 ${color}`}>{val}</p>
                </div>
                <Icon className={`w-4 h-4 ${color} opacity-60`} />
              </div>
            ))}
          </div>
        )}

        {/* The Recharts Equity Path */}
        <div className="h-64 w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={visibleData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
              <XAxis
                dataKey="index"
                tick={{ fontSize: 9, fill: "#888888" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 9, fill: "#888888" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="bg-zinc-950/95 border border-white/10 rounded-xl p-3 shadow-xl space-y-1">
                      <p className="text-[10px] text-muted-foreground font-mono">Ponto #{data.index}</p>
                      <p className="text-xs font-bold text-foreground">Saldo: ${formatPrice(data.equity)}</p>
                      {data.pnl !== 0 && (
                        <p className={`text-[10px] font-mono ${data.pnl > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          PnL Trade: {data.pnl > 0 ? "+" : ""}${data.pnl.toFixed(2)} ({data.symbol})
                        </p>
                      )}
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke="#06b6d4"
                strokeWidth={2}
                fill="url(#equityGrad)"
              />

              {/* Pin indicator for trade highlights */}
              {selectedTradeIndex !== null && equityData[selectedTradeIndex] && (
                <ReferenceDot
                  x={selectedTradeIndex}
                  y={equityData[selectedTradeIndex].equity}
                  r={6}
                  fill="#06b6d4"
                  stroke="#ffffff"
                  strokeWidth={2}
                  className="animate-pulse"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Small Trade Ticker below chart for replay selection */}
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] text-muted-foreground uppercase font-mono">Listagem Rápida / Selecione para Pin no Gráfico</p>
          <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
            {trades.slice(0, 10).map((t, idx) => {
              const isWin = t.pnl > 0;
              const eqIdx = equityData.findIndex(pt => pt.tradeId === t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTradeIndex(eqIdx !== -1 ? eqIdx : null)}
                  className={`shrink-0 flex flex-col p-2 rounded-xl border text-left transition-all ${
                    selectedTradeIndex === eqIdx
                      ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400"
                      : "bg-white/3 border-white/5 hover:border-white/10 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-[9px] font-bold font-mono">{t.symbol.replace("USDT", "")}</span>
                  <span className={`text-xs font-bold font-mono mt-0.5 ${isWin ? "text-emerald-400" : "text-red-400"}`}>
                    {t.side} {t.pnl > 0 ? "+" : ""}${t.pnl.toFixed(1)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
