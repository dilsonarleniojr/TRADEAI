"use client";

import { useMemo } from "react";
import { useMicrostructureStore } from "@/lib/store/institutional-stores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Layers,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Zap,
  ArrowRight,
  ShieldAlert,
  Gauge,
  Activity,
  Flame,
  Radio,
} from "lucide-react";
import { motion } from "framer-motion";

export function MicrostructurePanel() {
  const pairs = useMicrostructureStore((s) => s.pairs);
  const activeSymbol = useMicrostructureStore((s) => s.activeSymbol);
  const setActiveSymbol = useMicrostructureStore((s) => s.setActiveSymbol);

  const availableSymbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "RENDERUSDT"];

  const currentData = pairs[activeSymbol] || {
    symbol: activeSymbol,
    bestBid: 68150.2,
    bestAsk: 68152.0,
    spreadPercent: 0.0026,
    orderFlowImbalance: 0.22,
    bidVolumeUsd: 145000,
    askVolumeUsd: 110000,
    aggressiveBuyVolumeUsd: 82000,
    aggressiveSellVolumeUsd: 55000,
    estimatedSlippagePercent: 0.045,
    depthBids: [
      { price: 68150, amount: 45000, total: 45000 },
      { price: 68140, amount: 35000, total: 80000 },
      { price: 68130, amount: 35000, total: 115000 },
      { price: 68120, amount: 30000, total: 145000 },
    ],
    depthAsks: [
      { price: 68152, amount: 40000, total: 40000 },
      { price: 68160, amount: 30000, total: 70000 },
      { price: 68170, amount: 25000, total: 95000 },
      { price: 68180, amount: 15000, total: 110000 },
    ],
    predictiveAlert: "ROMPIMENTO" as const,
    predictiveConfidence: 84,
    lastUpdate: Date.now(),
  };

  const ofi = currentData.orderFlowImbalance;
  const spread = currentData.spreadPercent;

  // Determinar status do alerta preditivo da microestrutura
  const predBadge = useMemo(() => {
    switch (currentData.predictiveAlert) {
      case "ROMPIMENTO":
        return {
          title: "⚡ Rompimento Iminente (Alta)",
          desc: "Pressão compradora acelerando no livro L2 com esgotamento dos asks.",
          color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50",
          icon: TrendingUp,
        };
      case "REVERSAO":
        return {
          title: "🔄 Reversão de Fluxo (Baixa)",
          desc: "Bids absorvidos por volume agressor vendedor. Cautela recomendada.",
          color: "bg-rose-500/20 text-rose-300 border-rose-500/50",
          icon: TrendingDown,
        };
      case "COLAPSO_LIQUIDEZ":
        return {
          title: "⚠️ Colapso de Liquidez",
          desc: "Spread alargado e profundidade rarefeita. Alto risco de slippage.",
          color: "bg-amber-500/20 text-amber-300 border-amber-500/50",
          icon: AlertTriangle,
        };
      default:
        return {
          title: "🟢 Microestrutura Estável",
          desc: "Equilíbrio entre compradores e vendedores com liquidez saudável.",
          color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
          icon: Activity,
        };
    }
  }, [currentData.predictiveAlert]);

  const IconComp = predBadge.icon;

  // Normalização do OFI para barra visual (-1 a +1 mapeado para 0% a 100%)
  const ofiPercent = Math.max(0, Math.min(100, Math.round(((ofi + 1) / 2) * 100)));

  return (
    <Card className="bg-[#080d17] border border-cyan-500/20 shadow-xl overflow-hidden font-mono">
      <CardHeader className="p-4 pb-2 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center">
            <Layers className="w-4 h-4 text-teal-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              Microestrutura & Livro L2 Binance
              <Badge variant="outline" className="text-[10px] bg-slate-900 border-white/10 text-cyan-300 font-mono">
                Top 20 Depth
              </Badge>
            </CardTitle>
            <p className="text-[11px] text-slate-400">
              Order Flow Imbalance (OFI), Profundidade e Volume Agressor
            </p>
          </div>
        </div>

        {/* Seletor de Par */}
        <div className="flex items-center gap-1 bg-[#0d1424] p-1 rounded-xl border border-white/[0.08]">
          {availableSymbols.map((sym) => (
            <button
              key={sym}
              onClick={() => setActiveSymbol(sym)}
              className={`text-[11px] px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                activeSymbol === sym
                  ? "bg-teal-500 text-black shadow-[0_0_12px_rgba(20,184,166,0.4)]"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.06]"
              }`}
            >
              {sym.replace("USDT", "")}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4 text-xs">
        {/* Banner do Alerta Preditivo da Microestrutura */}
        <div className={`p-3 rounded-xl border ${predBadge.color} flex items-center justify-between gap-3`}>
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5">
              <IconComp className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-xs block">{predBadge.title}</span>
              <span className="text-[11px] opacity-90">{predBadge.desc}</span>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] bg-black/40 border-white/20 text-white shrink-0">
            {currentData.predictiveConfidence}% Confiança IA
          </Badge>
        </div>

        {/* Métricas de OFI, Spread e Volume Agressor */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* OFI Gauge */}
          <div className="bg-[#0b1220] p-3 rounded-xl border border-white/[0.06] space-y-1.5">
            <div className="flex items-center justify-between text-slate-400 text-[10px]">
              <span>Order Flow Imbalance (OFI)</span>
              <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-base font-bold text-white flex items-center justify-between">
              <span className={ofi >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {ofi >= 0 ? "+" : ""}
                {ofi.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400">
                {ofi > 0.15 ? "Pressão Compradora" : ofi < -0.15 ? "Pressão Vendedora" : "Neutro"}
              </span>
            </div>
            {/* Barra Visual de Pressão */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500 transition-all duration-300"
                style={{ width: `${ofiPercent}%` }}
              />
            </div>
          </div>

          {/* Spread Bid-Ask */}
          <div className="bg-[#0b1220] p-3 rounded-xl border border-white/[0.06] space-y-1.5">
            <div className="flex items-center justify-between text-slate-400 text-[10px]">
              <span>Spread Bid-Ask Real</span>
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-base font-bold text-white">
              <span className={spread <= 0.05 ? "text-emerald-400" : "text-amber-400"}>
                {spread.toFixed(4)}%
              </span>
            </div>
            <span className="text-[10px] text-slate-400 block truncate">
              {currentData.bestBid.toFixed(2)} / {currentData.bestAsk.toFixed(2)}
            </span>
          </div>

          {/* Volume Agressor Comprador */}
          <div className="bg-[#0b1220] p-3 rounded-xl border border-white/[0.06] space-y-1.5">
            <div className="flex items-center justify-between text-slate-400 text-[10px]">
              <span>Volume Agressor Compra</span>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-base font-bold text-emerald-400">
              ${(currentData.aggressiveBuyVolumeUsd / 1000).toFixed(1)}k
            </div>
            <span className="text-[10px] text-slate-400 block">Taker Buy Volume (5m)</span>
          </div>

          {/* Volume Agressor Vendedor */}
          <div className="bg-[#0b1220] p-3 rounded-xl border border-white/[0.06] space-y-1.5">
            <div className="flex items-center justify-between text-slate-400 text-[10px]">
              <span>Volume Agressor Venda</span>
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="text-base font-bold text-rose-400">
              ${(currentData.aggressiveSellVolumeUsd / 1000).toFixed(1)}k
            </div>
            <span className="text-[10px] text-slate-400 block">Taker Sell Volume (5m)</span>
          </div>
        </div>

        {/* Gráfico de Profundidade L2 Visual (Bids vs Asks) */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
            <span className="text-emerald-400">L2 Bids (Compradores) - ${(currentData.bidVolumeUsd / 1000).toFixed(0)}k</span>
            <span className="text-slate-500">Mid: ${((currentData.bestBid + currentData.bestAsk) / 2).toFixed(2)}</span>
            <span className="text-rose-400">L2 Asks (Vendedores) - ${(currentData.askVolumeUsd / 1000).toFixed(0)}k</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Lado Bids (Verde) */}
            <div className="space-y-1">
              {currentData.depthBids.map((b, idx) => {
                const pct = Math.min(100, (b.amount / (currentData.bidVolumeUsd || 1)) * 250);
                return (
                  <div key={idx} className="relative h-6 bg-[#09141c] rounded flex items-center justify-between px-2 overflow-hidden border border-emerald-500/10">
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-emerald-500/20 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                    <span className="relative text-[10px] font-bold text-emerald-300">${b.price.toFixed(1)}</span>
                    <span className="relative text-[10px] text-slate-400">${(b.amount / 1000).toFixed(1)}k</span>
                  </div>
                );
              })}
            </div>

            {/* Lado Asks (Vermelho) */}
            <div className="space-y-1">
              {currentData.depthAsks.map((a, idx) => {
                const pct = Math.min(100, (a.amount / (currentData.askVolumeUsd || 1)) * 250);
                return (
                  <div key={idx} className="relative h-6 bg-[#170a12] rounded flex items-center justify-between px-2 overflow-hidden border border-rose-500/10">
                    <div
                      className="absolute right-0 top-0 bottom-0 bg-rose-500/20 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                    <span className="relative text-[10px] text-slate-400">${(a.amount / 1000).toFixed(1)}k</span>
                    <span className="relative text-[10px] font-bold text-rose-300">${a.price.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
