"use client";

import { useMemo, useState } from "react";
import { usePnLStore, type PnLEventType } from "@/lib/store/institutional-stores";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Layers,
  Activity,
  ShieldAlert,
  ShieldCheck,
  Brain,
  AlertCircle,
  Clock,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";

export function RealtimeNetPnlChart() {
  const pnlSeries = usePnLStore((s) => s.pnlSeries);
  const totalNetPnl = usePnLStore((s) => s.totalNetPnl);
  const totalGrossPnl = usePnLStore((s) => s.totalGrossPnl);
  const totalFees = usePnLStore((s) => s.totalFees);
  const totalSlippage = usePnLStore((s) => s.totalSlippage);
  const zoom = usePnLStore((s) => s.zoom);
  const setZoom = usePnLStore((s) => s.setZoom);

  const [activeFilterEvent, setActiveFilterEvent] = useState<PnLEventType | "ALL">("ALL");

  // Filtrar pontos de acordo com o zoom selecionado
  const filteredData = useMemo(() => {
    if (!pnlSeries || pnlSeries.length === 0) {
      return [
        { timeFormatted: "00:00", netPnl: 0, grossPnl: 0, timestamp: Date.now() },
        { timeFormatted: "Agora", netPnl: totalNetPnl, grossPnl: totalGrossPnl, timestamp: Date.now() },
      ];
    }

    const now = Date.now();
    let windowMs = 60 * 60 * 1000; // 1h default
    if (zoom === "5m") windowMs = 5 * 60 * 1000;
    else if (zoom === "1h") windowMs = 60 * 60 * 1000;
    else if (zoom === "24h") windowMs = 24 * 60 * 60 * 1000;
    else if (zoom === "7d") windowMs = 7 * 24 * 60 * 60 * 1000;

    const sliced = pnlSeries.filter((pt) => now - pt.timestamp <= windowMs);
    return sliced.length > 0 ? sliced : pnlSeries.slice(-30);
  }, [pnlSeries, zoom, totalNetPnl, totalGrossPnl]);

  // Lista de eventos identificados para a timeline inferior
  const recentEvents = useMemo(() => {
    return pnlSeries
      .filter((pt) => pt.eventMarker && (activeFilterEvent === "ALL" || pt.eventMarker === activeFilterEvent))
      .slice(-6)
      .reverse();
  }, [pnlSeries, activeFilterEvent]);

  const isNetPositive = totalNetPnl >= 0;
  const gradientColor = isNetPositive ? "#10b981" : "#f43f5e";

  return (
    <Card className="bg-[#080d17] border border-cyan-500/20 shadow-xl overflow-hidden">
      <CardHeader className="p-4 pb-2 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2 font-mono">
              Curva de PnL Líquido Real-Time
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </CardTitle>
            <p className="text-[11px] text-slate-400">
              Taxas Binance Spot (0.10%) + Slippage L2 deduzidos em cada tick
            </p>
          </div>
        </div>

        {/* Seletores de Zoom */}
        <div className="flex items-center gap-1.5 bg-[#0d1424] p-1 rounded-xl border border-white/[0.08] self-start sm:self-auto">
          {(["5m", "1h", "24h", "7d"] as const).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`text-[11px] font-mono px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                zoom === z
                  ? "bg-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.06]"
              }`}
            >
              {z}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Banner de Composição Contábil: Líquido vs Bruto vs Custos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#0c1322] border border-white/[0.05] p-2.5 rounded-xl text-xs font-mono">
          <div>
            <span className="text-slate-400 text-[10px] block">PnL Líquido (Real):</span>
            <span className={`text-base font-bold ${isNetPositive ? "text-emerald-400" : "text-rose-400"}`}>
              {isNetPositive ? "+" : ""}${totalNetPnl.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-slate-400 text-[10px] block">PnL Bruto (Antes Taxas):</span>
            <span className="text-base font-bold text-slate-200">${totalGrossPnl.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-slate-400 text-[10px] block">Taxas Binance Spot:</span>
            <span className="text-base font-bold text-amber-400">-${totalFees.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-slate-400 text-[10px] block">Slippage L2 Estimado:</span>
            <span className="text-base font-bold text-indigo-400">-${totalSlippage.toFixed(2)}</span>
          </div>
        </div>

        {/* Gráfico Contínuo */}
        <div className="h-[260px] w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="institutionalPnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={gradientColor} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={gradientColor} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f293d" vertical={false} />
              <XAxis
                dataKey="timeFormatted"
                stroke="#64748b"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={{ stroke: "#1e293b" }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={{ stroke: "#1e293b" }}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload;
                  return (
                    <div className="bg-[#0b1220]/95 backdrop-blur-md border border-cyan-500/30 p-2.5 rounded-xl shadow-2xl text-xs font-mono">
                      <div className="text-slate-400 flex items-center gap-1.5 mb-1">
                        <Clock className="w-3 h-3 text-cyan-400" />
                        <span>{item.timeFormatted}</span>
                      </div>
                      <div className="text-white font-bold text-sm">
                        PnL Líquido:{" "}
                        <span className={item.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {item.netPnl >= 0 ? "+" : ""}${item.netPnl.toFixed(2)}
                        </span>
                      </div>
                      {item.grossPnl !== undefined && (
                        <div className="text-slate-400 text-[10px]">
                          PnL Bruto: ${item.grossPnl.toFixed(2)}
                        </div>
                      )}
                      {item.eventMarker && (
                        <div className="mt-1.5 pt-1.5 border-t border-white/10 text-cyan-300 font-semibold flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-400" />
                          <span>{item.eventLabel || item.eventMarker}</span>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="2 2" />
              <Area
                type="monotone"
                dataKey="netPnl"
                stroke={gradientColor}
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#institutionalPnlGrad)"
                isAnimationActive={false} // Desativar animação do recharts para zero jitter em streaming
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Legenda de Marcadores de Eventos */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-slate-400 font-semibold mr-1">Marcadores de Eventos:</span>

            <button
              onClick={() => setActiveFilterEvent("ALL")}
              className={`text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer border ${
                activeFilterEvent === "ALL"
                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50"
                  : "bg-slate-900 text-slate-400 border-white/10"
              }`}
            >
              Todos
            </button>

            <button
              onClick={() => setActiveFilterEvent("BUY")}
              className={`text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer flex items-center gap-1 border ${
                activeFilterEvent === "BUY"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                  : "bg-slate-900 text-slate-400 border-white/10"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              🟢 BUY
            </button>

            <button
              onClick={() => setActiveFilterEvent("SELL")}
              className={`text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer flex items-center gap-1 border ${
                activeFilterEvent === "SELL"
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/50"
                  : "bg-slate-900 text-slate-400 border-white/10"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              🔴 SELL
            </button>

            <button
              onClick={() => setActiveFilterEvent("BREAK_EVEN")}
              className={`text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer flex items-center gap-1 border ${
                activeFilterEvent === "BREAK_EVEN"
                  ? "bg-blue-500/20 text-blue-300 border-blue-500/50"
                  : "bg-slate-900 text-slate-400 border-white/10"
              }`}
            >
              <ShieldCheck className="w-3 h-3 text-blue-400" />
              🛡️ Break-Even
            </button>

            <button
              onClick={() => setActiveFilterEvent("CIRCUIT_BREAKER")}
              className={`text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer flex items-center gap-1 border ${
                activeFilterEvent === "CIRCUIT_BREAKER"
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                  : "bg-slate-900 text-slate-400 border-white/10"
              }`}
            >
              <AlertCircle className="w-3 h-3 text-amber-400" />
              ⚠️ Circuit Breaker
            </button>

            <button
              onClick={() => setActiveFilterEvent("AI_ALERT")}
              className={`text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer flex items-center gap-1 border ${
                activeFilterEvent === "AI_ALERT"
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/50"
                  : "bg-slate-900 text-slate-400 border-white/10"
              }`}
            >
              <Brain className="w-3 h-3 text-purple-400" />
              🧠 Alertas IA
            </button>
          </div>
        </div>

        {/* Linha de Eventos Recentes na Linha do Tempo */}
        {recentEvents.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider block">
              Auditoria de Eventos na Curva de PnL:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {recentEvents.map((evt, idx) => (
                <div
                  key={idx}
                  className="bg-[#0b1220] border border-white/[0.06] rounded-lg p-2 text-[11px] font-mono flex items-center justify-between"
                >
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="text-slate-500">{evt.timeFormatted}</span>
                    <span className="text-slate-200 truncate">{evt.eventLabel || evt.eventMarker}</span>
                  </div>
                  <span className={`font-bold shrink-0 ${evt.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {evt.netPnl >= 0 ? "+" : ""}${evt.netPnl.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
