"use client";

import { useBotHealthStore, usePnLStore, useExecutionStore, useMicrostructureStore } from "@/lib/store/institutional-stores";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Pause,
  Play,
  RotateCcw,
  Zap,
  TrendingUp,
  TrendingDown,
  Gauge,
  Activity,
  Layers,
  Cpu,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export function InstitutionalHeader() {
  const { toast } = useToast();
  const globalBotState = useBotHealthStore((s) => s.globalBotState);
  const activeBotsCount = useBotHealthStore((s) => s.activeBotsCount);
  const pausedBotsCount = useBotHealthStore((s) => s.pausedBotsCount);
  const setGlobalFleetState = useBotHealthStore((s) => s.setGlobalFleetState);

  const totalNetPnl = usePnLStore((s) => s.totalNetPnl);
  const intradayChangePercent = usePnLStore((s) => s.intradayChangePercent);

  const avgSlippage = useExecutionStore((s) => s.avgSlippageLast10Percent);
  const p95Latency = useExecutionStore((s) => s.decisionToOrderLatencyP95Ms);

  const activeSymbol = useMicrostructureStore((s) => s.activeSymbol);
  const activeMicro = useMicrostructureStore((s) => s.pairs[activeSymbol]);
  const ofi = activeMicro ? activeMicro.orderFlowImbalance : 0.08;

  const tradingMode = useCryptoStore((s) => s.tradingMode);
  const setTradingMode = useCryptoStore((s) => s.setTradingMode);
  const toggleAllBots = useCryptoStore((s) => s.toggleAllBots);
  const resetAllBotStats = useCryptoStore((s) => s.resetAllBotStats);

  const [isActing, setIsActing] = useState(false);

  const handlePauseFleet = async () => {
    setIsActing(true);
    try {
      toggleAllBots(false);
      setGlobalFleetState("paused");
      toast({
        title: "🛑 Frota Institucional Pausada",
        description: "Todas as execuções de ordens foram congeladas para proteção de capital.",
      });
    } finally {
      setIsActing(false);
    }
  };

  const handleResumeFleet = async () => {
    setIsActing(true);
    try {
      toggleAllBots(true);
      setGlobalFleetState("active");
      toast({
        title: "🟢 Frota Institucional Reativada",
        description: "Bots retomaram o monitoramento de livro L2 e execução quantitativa.",
      });
    } finally {
      setIsActing(false);
    }
  };

  const handleRestartBots = async () => {
    setIsActing(true);
    try {
      await resetAllBotStats();
      toast({
        title: "🔄 Bots Reinicializados",
        description: "Contadores de ordens sincronizados diretamente com o SQLite WAL.",
      });
    } finally {
      setIsActing(false);
    }
  };

  const handleToggleMode = () => {
    const nextMode = tradingMode === "live" ? "paper" : "live";
    setTradingMode(nextMode);
    toast({
      title: nextMode === "live" ? "🔴 Modo REAL Ativado" : "🟡 Modo PAPER (Simulado) Ativado",
      description:
        nextMode === "live"
          ? "Ordens reais serão enviadas à Binance Spot sob governança institucional."
          : "Execuções simuladas em espelho com o livro L2 da Binance.",
    });
  };

  const isPositivePnl = totalNetPnl >= 0;

  return (
    <div className="bg-[#080d17] border border-cyan-500/20 rounded-2xl p-4 shadow-[0_4px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl space-y-4">
      {/* Linha 1: Identidade Institucional, Estado dos Bots e Ações Rápidas */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Identidade e Status da Frota */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-teal-500 to-emerald-500 p-[2px] shadow-[0_0_20px_rgba(6,182,212,0.35)]">
              <div className="w-full h-full bg-[#070b14] rounded-[10px] flex items-center justify-center">
                <Cpu className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white font-mono uppercase">
                  TradeAI <span className="text-cyan-400 text-xs px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30">INSTITUCIONAL</span>
                </h1>
                <Badge variant="outline" className="text-[10px] bg-slate-900 border-white/10 text-slate-300 font-mono">
                  v2.5.0-WAL
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Telemetria Contínua Binance L2 + Base Local
              </p>
            </div>
          </div>

          <div className="h-6 w-[1px] bg-white/10 hidden sm:block" />

          {/* Badges de Estado Global dos Bots */}
          <div className="flex items-center gap-1.5 bg-[#0d1424] border border-white/[0.08] p-1 rounded-xl">
            <span
              className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg transition-all ${
                globalBotState === "active"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              🟢 Ativos ({activeBotsCount})
            </span>

            <span
              className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg transition-all ${
                globalBotState === "observation"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🟡 Observação ({pausedBotsCount > 0 ? 1 : 0})
            </span>

            <span
              className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg transition-all ${
                globalBotState === "paused"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.2)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🔴 Pausados ({pausedBotsCount})
            </span>
          </div>
        </div>

        {/* Botões de Comando e Governança */}
        <div className="flex flex-wrap items-center gap-2">
          {globalBotState === "active" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handlePauseFleet}
              disabled={isActing}
              className="h-8 text-xs bg-rose-950/40 border-rose-500/40 text-rose-300 hover:bg-rose-900/60 hover:text-white gap-1.5 cursor-pointer rounded-lg font-mono"
            >
              <Pause className="w-3.5 h-3.5" />
              Pausar Frota
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleResumeFleet}
              disabled={isActing}
              className="h-8 text-xs bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60 hover:text-white gap-1.5 cursor-pointer rounded-lg font-mono"
            >
              <Play className="w-3.5 h-3.5" />
              Reativar Frota
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={handleRestartBots}
            disabled={isActing}
            className="h-8 text-xs bg-[#10182b] border-white/10 text-slate-300 hover:bg-white/10 hover:text-white gap-1.5 cursor-pointer rounded-lg font-mono"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reiniciar Bots
          </Button>

          <Button
            size="sm"
            onClick={handleToggleMode}
            className={`h-8 text-xs font-mono font-bold px-3 gap-1.5 cursor-pointer rounded-lg border transition-all ${
              tradingMode === "live"
                ? "bg-rose-600 text-white border-rose-400 hover:bg-rose-500 shadow-[0_0_15px_rgba(225,29,72,0.4)]"
                : "bg-cyan-600 text-white border-cyan-400 hover:bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            {tradingMode === "live" ? "MODO REAL (SPOT)" : "MODO PAPER"}
          </Button>
        </div>
      </div>

      {/* Linha 2: Indicadores Rápidos (KPI Banner Institucional) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
        {/* KPI 1: PnL Líquido Global */}
        <div className="bg-[#0b1220] border border-white/[0.08] rounded-xl p-3 flex flex-col justify-between hover:border-cyan-500/30 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>PnL Líquido Global</span>
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-lg sm:text-xl font-bold font-mono ${
                isPositivePnl ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {isPositivePnl ? "+" : ""}
              ${totalNetPnl.toFixed(2)}
            </span>
            <span
              className={`text-[11px] font-mono font-semibold flex items-center ${
                intradayChangePercent >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {intradayChangePercent >= 0 ? (
                <TrendingUp className="w-3 h-3 mr-0.5 inline" />
              ) : (
                <TrendingDown className="w-3 h-3 mr-0.5 inline" />
              )}
              {intradayChangePercent >= 0 ? "+" : ""}
              {intradayChangePercent.toFixed(2)}%
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-0.5">Após taxas e slippage deduzidos</span>
        </div>

        {/* KPI 2: Slippage Médio Real */}
        <div className="bg-[#0b1220] border border-white/[0.08] rounded-xl p-3 flex flex-col justify-between hover:border-cyan-500/30 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>Slippage Médio (L2)</span>
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-lg sm:text-xl font-bold font-mono ${
                avgSlippage <= 0.15 ? "text-emerald-400" : avgSlippage <= 0.35 ? "text-amber-400" : "text-rose-400"
              }`}
            >
              {avgSlippage.toFixed(3)}%
            </span>
            <Badge
              variant="outline"
              className={`text-[9px] px-1.5 py-0 h-4 border ${
                avgSlippage <= 0.15
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-300 border-amber-500/30"
              }`}
            >
              {avgSlippage <= 0.15 ? "ÓTIMO" : "MODERADO"}
            </Badge>
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-0.5">Tolerância Máx: 0.350%</span>
        </div>

        {/* KPI 3: Latência P95 Decisão→Ordem */}
        <div className="bg-[#0b1220] border border-white/[0.08] rounded-xl p-3 flex flex-col justify-between hover:border-cyan-500/30 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>Latência P95 (HFT)</span>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg sm:text-xl font-bold font-mono text-cyan-300">{p95Latency}ms</span>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-cyan-950/40 text-cyan-300 border-cyan-500/30">
              ULTRA FAST
            </Badge>
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-0.5">Ciclo Decisão → REST Binance</span>
        </div>

        {/* KPI 4: OFI Global do Mercado */}
        <div className="bg-[#0b1220] border border-white/[0.08] rounded-xl p-3 flex flex-col justify-between hover:border-cyan-500/30 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>OFI Global ({activeSymbol})</span>
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-lg sm:text-xl font-bold font-mono ${
                ofi > 0.15 ? "text-emerald-400" : ofi < -0.15 ? "text-rose-400" : "text-amber-400"
              }`}
            >
              {ofi > 0 ? "+" : ""}
              {ofi.toFixed(2)}
            </span>
            <Badge
              variant="outline"
              className={`text-[9px] px-1.5 py-0 h-4 border ${
                ofi > 0.15
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                  : ofi < -0.15
                  ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
                  : "bg-slate-800 text-slate-300 border-white/10"
              }`}
            >
              {ofi > 0.15 ? "PRESSÃO COMPRA" : ofi < -0.15 ? "PRESSÃO VENDA" : "EQUILIBRADO"}
            </Badge>
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-0.5">Order Flow Imbalance L2</span>
        </div>
      </div>
    </div>
  );
}
