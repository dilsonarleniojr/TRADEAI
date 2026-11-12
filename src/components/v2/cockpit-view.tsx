"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { AppSwitch } from "./atoms";
import { formatCurrency } from "@/lib/format";
import { ResponsiveContainer, LineChart, Line, XAxis, Tooltip } from "recharts";
import { useShallow } from "zustand/react/shallow";
import { BotCockpit } from "@/components/bot/bot-cockpit";
import { EnginePanel } from "@/components/bot/engine-panel";
import { ProtectionSettingsDialog } from "@/components/bot/protection-settings-dialog";
import { BotRiskCockpit } from "@/components/bot/bot-risk-cockpit";
import { OrphanOrdersDialog } from "@/components/bot/orphan-orders-dialog";
import { getCircuitBreakerStatus } from "@/lib/bot/multi-bot-engine";
import { calculateRiskMetrics } from "@/lib/bot/risk-metrics";
import type { SystemLatencySnapshot } from "@/lib/bot/latency-telemetry";
import { ArrowLeft, Gauge, RefreshCw, ShieldCheck } from "lucide-react";

export function CockpitView() {
  const {
    proMode,
    toggleProMode,
    bots,
    trades,
    portfolio,
    botLogs,
    connectionStatus,
    isMarketDataStale,
    setActiveSection,
    openProtectionModal,
    setOpenProtectionModal,
  } = useCryptoStore(
    useShallow((s) => ({
      proMode: s.proMode,
      toggleProMode: s.toggleProMode,
      bots: s.bots,
      trades: s.trades,
      portfolio: s.portfolio,
      botLogs: s.botLogs,
      connectionStatus: s.connectionStatus,
      isMarketDataStale: s.isMarketDataStale,
      setActiveSection: s.setActiveSection,
      openProtectionModal: s.openProtectionModal,
      setOpenProtectionModal: s.setOpenProtectionModal,
    }))
  );

  const [timeframe, setTimeframe] = useState<"5m" | "1h" | "24h" | "7d">("24h");
  const [latencySnapshot, setLatencySnapshot] = useState<SystemLatencySnapshot | null>(null);
  const [riskCockpitOpen, setRiskCockpitOpen] = useState(false);
  const [orphanDialogOpen, setOrphanDialogOpen] = useState(false);

  const fetchTelemetry = async () => {
    try {
      const res = await fetch("/api/bot/telemetry", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json?.success && json.data) {
        setLatencySnapshot(json.data);
      }
    } catch {
      // Silencioso em background
    }
  };

  useEffect(() => {
    fetchTelemetry();
    const id = setInterval(fetchTelemetry, 10_000);
    return () => clearInterval(id);
  }, []);

  const riskMetrics = useMemo(
    () => calculateRiskMetrics(trades, portfolio?.totalValue || 100),
    [trades, portfolio?.totalValue]
  );

  const cbStatus = getCircuitBreakerStatus();

  const totalRealizedPnl = useMemo(
    () => bots.reduce((sum, b) => sum + (b.stats?.realizedPnl ?? 0), 0),
    [bots]
  );
  const totalUnrealizedPnl = useMemo(
    () => bots.reduce((sum, b) => sum + (b.position?.unrealizedPnl ?? 0), 0),
    [bots]
  );
  const netPnl = totalRealizedPnl + totalUnrealizedPnl;

  const estimatedFees = useMemo(
    () =>
      trades.reduce(
        (sum, t) =>
          sum +
          (typeof t.netPnl === "number" && typeof t.pnl === "number" && t.pnl !== t.netPnl
            ? Math.abs(t.pnl - t.netPnl)
            : t.total * 0.001),
        0
      ),
    [trades]
  );

  const totalScansPerMin = useMemo(
    () => bots.reduce((sum, b) => sum + (b.stats?.scansPerMinute ?? 0), 0),
    [bots]
  );

  const chartData = useMemo(() => {
    const windowMs =
      timeframe === "5m"
        ? 5 * 60_000
        : timeframe === "1h"
          ? 60 * 60_000
          : timeframe === "24h"
            ? 24 * 60 * 60_000
            : 7 * 24 * 60 * 60_000;
    const cutoff = Date.now() - windowMs;
    const filtered = trades.filter((t) => new Date(t.timestamp).getTime() >= cutoff);
    if (filtered.length === 0) {
      return [
        { t: "Início", val: 0 },
        { t: "Agora", val: Number(netPnl.toFixed(2)) },
      ];
    }
    let acc = 0;
    return filtered.slice(-30).map((t) => {
      acc += Number(t.netPnl ?? t.pnl ?? 0);
      return {
        t: new Date(t.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        val: Number(acc.toFixed(2)),
      };
    });
  }, [trades, timeframe, netPnl]);

  const strategiesSummary = useMemo(() => {
    const grouped = new Map<string, { nome: string; trades: number; wins: number; losses: number; resultado: number; activeCount: number }>();
    for (const b of bots) {
      const key = b.strategy || "QUANT_ENSEMBLE";
      const cur = grouped.get(key) || {
        nome: key,
        trades: 0,
        wins: 0,
        losses: 0,
        resultado: 0,
        activeCount: 0,
      };
      cur.trades += b.stats?.totalTrades ?? 0;
      cur.wins += b.stats?.winTrades ?? 0;
      cur.losses += b.stats?.lossTrades ?? 0;
      cur.resultado += b.stats?.realizedPnl ?? 0;
      if (b.active) cur.activeCount += 1;
      grouped.set(key, cur);
    }
    return Array.from(grouped.values());
  }, [bots]);

  const errorAlerts = useMemo(
    () => botLogs.filter((l) => l.type === "error" || l.type === "warning").slice(0, 4),
    [botLogs]
  );

  const latencyP95 = latencySnapshot?.totalTickToTrade?.p95 ?? 0;

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn font-instrument-sans">
      {/* 1. CABEÇALHO COM INTERRUPTOR DE MODO PROFISSIONAL */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <button
            onClick={() => setActiveSection("bot")}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#4A586A] hover:text-[#0E1B2C] dark:text-[#94a3b8] dark:hover:text-white mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar para Robôs</span>
          </button>
          <h1 className="font-instrument-serif text-[40px] sm:text-[48px] text-[#0E1B2C] dark:text-white leading-tight">
            Cockpit Institucional
          </h1>
          <p className="text-[14px] text-[#4A586A] dark:text-[#94a3b8]">
            Telemetria em tempo real da frota, disjuntores de risco, latência e matriz de estratégias.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setOpenProtectionModal(true)}
            className="px-4 py-2 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[13px] font-semibold text-[#0E1B2C] dark:text-white hover:bg-[#EEF1F5] dark:hover:bg-white/5 cursor-pointer flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#0A7A59]" />
            <span>Modos de proteção</span>
          </button>
          <button
            onClick={() => setRiskCockpitOpen(true)}
            className="px-4 py-2 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[13px] font-semibold text-[#0E1B2C] dark:text-white hover:bg-[#EEF1F5] dark:hover:bg-white/5 cursor-pointer flex items-center gap-1.5"
          >
            <Gauge className="w-3.5 h-3.5 text-[#1F5FD6]" />
            <span>Correlação</span>
          </button>
          <button
            onClick={() => setOrphanDialogOpen(true)}
            className="px-4 py-2 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[13px] font-semibold text-[#0E1B2C] dark:text-white hover:bg-[#EEF1F5] dark:hover:bg-white/5 cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Ordens órfãs</span>
          </button>
          <div className="flex items-center space-x-2.5 pl-2">
            <span className="text-[13px] font-medium text-[#0E1B2C] dark:text-white">
              Modo pro
            </span>
            <AppSwitch checked={proMode} onCheckedChange={toggleProMode} />
          </div>
        </div>
      </div>

      {/* 2. METRICSTRIP COM DADOS REAIS */}
      <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E7EBF0] dark:divide-white/10 shadow-xs">
        <div className="pb-3 sm:pb-0 sm:pr-6">
          <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] block">Resultado acumulado</span>
          <span
            className={`font-instrument-serif text-[34px] sm:text-[40px] tabular-nums font-bold ${
              netPnl > 0 ? "text-[#0A7A59]" : netPnl < 0 ? "text-[#B42318]" : "text-[#0E1B2C] dark:text-white"
            }`}
          >
            {formatCurrency(netPnl)}
          </span>
          <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] block">Realizado + em aberto</span>
        </div>

        <div className="py-3 sm:py-0 sm:px-6">
          <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] block">Fator de lucro</span>
          <span className="font-instrument-serif text-[34px] sm:text-[40px] text-[#0E1B2C] dark:text-white tabular-nums font-bold">
            {riskMetrics.closedTradesCount >= 1 ? `${riskMetrics.profitFactor.toFixed(2)}x` : "—"}
          </span>
          <span className="text-[12px] text-[#0A7A59] dark:text-[#5BE3A8] block font-medium">
            Sharpe: {riskMetrics.closedTradesCount >= 2 ? riskMetrics.sharpeRatio.toFixed(2) : "—"}
          </span>
        </div>

        <div className="py-3 sm:py-0 sm:px-6">
          <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] block">Latência (P95)</span>
          <span className="font-instrument-serif text-[34px] sm:text-[40px] text-[#0E1B2C] dark:text-white tabular-nums font-bold">
            {latencyP95 > 0 ? `${Math.round(latencyP95)} ms` : "—"}
          </span>
          <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] block">
            Saúde: {latencySnapshot?.networkHealth ?? "Aguardando"}
          </span>
        </div>

        <div className="pt-3 sm:pt-0 sm:pl-6">
          <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] block">Disjuntor diário</span>
          <span
            className={`font-instrument-serif text-[34px] sm:text-[40px] tabular-nums font-bold ${
              cbStatus.tripped ? "text-[#B42318]" : "text-[#0A7A59]"
            }`}
          >
            {cbStatus.tripped ? "Travado" : "Armado"}
          </span>
          <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] block">
            Limite: {formatCurrency(cbStatus.dailyLossLimitUsd)}
          </span>
        </div>
      </div>

      {/* Cockpit HFT de Kill-Switch & Disjuntor */}
      <BotCockpit />

      {/* 3. GRID: RESULTADO AO LONGO DO TEMPO + SAÚDE DO SISTEMA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4">
              <h3 className="font-bold text-[16px] text-[#0E1B2C] dark:text-white">
                Resultado ao longo do tempo
              </h3>
              <div className="inline-flex p-0.5 bg-[#EEF1F5] dark:bg-[#162032] rounded-full border border-[#E7EBF0] text-[12px]">
                {(["5m", "1h", "24h", "7d"] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                      timeframe === tf
                        ? "bg-[#0E1B2C] text-white font-semibold"
                        : "text-[#4A586A] hover:text-[#0E1B2C]"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full h-36 bg-[#F8FAFC] dark:bg-white/5 rounded-[16px] p-4 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="t" hide />
                  <Tooltip />
                  <Line type="stepAfter" dataKey="val" stroke="#0E1B2C" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-3 pt-6 border-t border-[#E7EBF0] dark:border-white/10 text-[13px]">
            <div>
              <span className="text-[#4A586A] block text-[11px]">Resultado realizado</span>
              <span className="font-bold text-[#0E1B2C] dark:text-white">{formatCurrency(totalRealizedPnl)}</span>
            </div>
            <div>
              <span className="text-[#4A586A] block text-[11px]">Taxas acumuladas</span>
              <span className="font-bold text-[#0E1B2C] dark:text-white">{formatCurrency(-Math.abs(estimatedFees))}</span>
            </div>
            <div>
              <span className="text-[#4A586A] block text-[11px]">Trades executados</span>
              <span className="font-bold text-[#0E1B2C] dark:text-white">{trades.length}</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-4">
          <h3 className="font-bold text-[16px] text-[#0E1B2C] dark:text-white pb-2 border-b border-[#E7EBF0] dark:border-white/10">
            Saúde do sistema
          </h3>

          <div className="divide-y divide-[#E7EBF0] dark:divide-white/5 text-[13px]">
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#4A586A]">Conexão em tempo real</span>
              <span className="font-semibold text-[#0E1B2C] dark:text-white flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    connectionStatus === "connected" ? "bg-[#0B8F6A]" : "bg-amber-500"
                  }`}
                />
                {connectionStatus === "connected" ? "Conectada" : "Reconectando"}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#4A586A]">Dados de mercado</span>
              <span className="font-semibold text-[#0E1B2C] dark:text-white flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isMarketDataStale ? "bg-amber-500" : "bg-[#0B8F6A]"}`} />
                {isMarketDataStale ? "Atraso (>3s)" : "Em tempo real"}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#4A586A]">Alertas recentes</span>
              <span className="font-semibold text-[#0E1B2C] dark:text-white">{errorAlerts.length}</span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#4A586A]">Varreduras por minuto</span>
              <span className="font-semibold text-[#0E1B2C] dark:text-white">{totalScansPerMin}</span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#4A586A]">Disjuntor de perda</span>
              <span className="font-semibold text-[#0E1B2C] dark:text-white flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${cbStatus.tripped ? "bg-[#B42318]" : "bg-[#0B8F6A]"}`} />
                {cbStatus.tripped ? "Acionado" : "Armado"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. ALERTAS REAIS DOS ROBÔS */}
      <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-3">
        <h3 className="font-bold text-[16px] text-[#0E1B2C] dark:text-white">
          Alertas operacionais recentes ({errorAlerts.length})
        </h3>
        {errorAlerts.length === 0 ? (
          <div className="p-4 rounded-[18px] bg-[#F8FAFC] dark:bg-white/5 border border-[#E7EBF0] dark:border-white/10 text-[#4A586A] dark:text-[#94a3b8] text-[13px]">
            Nenhum alerta crítico ou falha registrada na sessão atual.
          </div>
        ) : (
          <div className="space-y-2">
            {errorAlerts.map((log, i) => (
              <div
                key={log.id || i}
                className="p-3.5 rounded-[14px] bg-[#FFF4DC] dark:bg-amber-500/10 border border-[#FFE7A8] dark:border-amber-500/30 text-[#6B4300] dark:text-amber-200 text-[13px]"
              >
                {log.message}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. TABELA DE ESTRATÉGIAS REAIS */}
      <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-4">
        <h3 className="font-bold text-[16px] text-[#0E1B2C] dark:text-white">
          Estratégias da frota
        </h3>

        {strategiesSummary.length === 0 ? (
          <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8]">
            Nenhum robô configurado ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[14px]">
              <thead>
                <tr className="border-b border-[#E7EBF0] dark:border-white/10 text-[12px] text-[#4A586A] font-medium">
                  <th className="pb-3 pr-4">Estratégia</th>
                  <th className="pb-3 px-4">Trades</th>
                  <th className="pb-3 px-4">Resultado</th>
                  <th className="pb-3 pl-4">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7EBF0] dark:divide-white/5">
                {strategiesSummary.map((st) => (
                  <tr key={st.nome} className="hover:bg-[#F8FAFC] dark:hover:bg-white/5 transition-colors">
                    <td className="py-3.5 pr-4 font-bold text-[#0E1B2C] dark:text-white">{st.nome}</td>
                    <td className="py-3.5 px-4 text-[#4A586A] dark:text-[#94a3b8] tabular-nums">
                      {st.trades} ({st.wins}V / {st.losses}D)
                    </td>
                    <td className="py-3.5 px-4 font-bold text-[#0E1B2C] dark:text-white tabular-nums">
                      {formatCurrency(st.resultado)}
                    </td>
                    <td className="py-3.5 pl-4">
                      <span className="px-2.5 py-1 rounded-full bg-[#EEF1F5] dark:bg-white/10 text-[#4A586A] dark:text-white text-[12px] font-medium">
                        {st.activeCount > 0 ? `${st.activeCount} ativo(s)` : "Pausada"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Painel de Motores ao Vivo */}
      <EnginePanel />

      <ProtectionSettingsDialog open={openProtectionModal} onOpenChange={setOpenProtectionModal} />
      <BotRiskCockpit open={riskCockpitOpen} onOpenChange={setRiskCockpitOpen} />
      <OrphanOrdersDialog open={orphanDialogOpen} onOpenChange={setOrphanDialogOpen} />
    </div>
  );
}
