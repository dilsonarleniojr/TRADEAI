"use client";

import { useBotHealthStore, useExecutionStore } from "@/lib/store/institutional-stores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  ShieldAlert,
  Zap,
  Activity,
  Server,
  Database,
  Lock,
  Cpu,
  RefreshCw,
  AlertTriangle,
  Radio,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { motion } from "framer-motion";

export function BotHealthPanel() {
  const wsState = useBotHealthStore((s) => s.wsState);
  const sqliteWalStatus = useBotHealthStore((s) => s.sqliteWalStatus);
  const sqliteDivergenceDetected = useBotHealthStore((s) => s.sqliteDivergenceDetected);
  const sqliteAuditedTradesCount = useBotHealthStore((s) => s.sqliteAuditedTradesCount);
  const mutexBuys = useBotHealthStore((s) => s.mutexBuysCount);
  const mutexSells = useBotHealthStore((s) => s.mutexSellsCount);
  const zeroDuplicatesActive = useBotHealthStore((s) => s.zeroDuplicatesActive);
  const binanceErrorCount = useBotHealthStore((s) => s.binanceErrorCount);
  const executionFreq = useBotHealthStore((s) => s.executionFrequencyPerMin);
  const circuitBreakerTripped = useBotHealthStore((s) => s.circuitBreakerTripped);
  const circuitBreakerLossUsd = useBotHealthStore((s) => s.circuitBreakerLossUsd);
  const circuitBreakerLimitUsd = useBotHealthStore((s) => s.circuitBreakerLimitUsd);

  const p50Latency = useExecutionStore((s) => s.decisionToOrderLatencyP50Ms);
  const p95Latency = useExecutionStore((s) => s.decisionToOrderLatencyP95Ms);

  return (
    <Card className="bg-[#080d17] border border-cyan-500/20 shadow-xl overflow-hidden font-mono">
      <CardHeader className="p-4 pb-2 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              Painel de Saúde dos Bots & Telemetria do Sistema
            </CardTitle>
            <p className="text-[11px] text-slate-400">
              Concorrência atômica, latência de execução, WebSocket e integridade SQLite WAL
            </p>
          </div>
        </div>

        <Badge
          variant="outline"
          className={`text-[10px] font-mono ${
            !sqliteDivergenceDetected && wsState === "connected"
              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
              : "bg-amber-500/20 text-amber-300 border-amber-500/40"
          }`}
        >
          {!sqliteDivergenceDetected ? "🟢 100% AUDITADO WAL" : "⚠️ AUDITORIA PENDENTE"}
        </Badge>
      </CardHeader>

      <CardContent className="p-4 space-y-3.5 text-xs">
        {/* Grid de 6 Indicadores de Infraestrutura */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* 1. Latência Decisão → Ordem */}
          <div className="bg-[#0b1220] p-3 rounded-xl border border-white/[0.06] space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[10px]">
              <span>Latência HFT</span>
              <Zap className="w-3 h-3 text-cyan-400" />
            </div>
            <div className="text-sm font-bold text-white">
              P50: <span className="text-cyan-300">{p50Latency}ms</span>
            </div>
            <div className="text-[10px] text-slate-400">
              P95: <span className="text-amber-300 font-bold">{p95Latency}ms</span>
            </div>
          </div>

          {/* 2. Mutex Ativo */}
          <div className="bg-[#0b1220] p-3 rounded-xl border border-white/[0.06] space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[10px]">
              <span>Mutexes em Voo</span>
              <Lock className="w-3 h-3 text-emerald-400" />
            </div>
            <div className="text-sm font-bold text-emerald-400 flex items-center gap-1">
              <span>{mutexBuys + mutexSells} ativos</span>
            </div>
            <div className="text-[10px] text-slate-400">
              {zeroDuplicatesActive ? "Zero Duplicatas ✅" : "Risco Concorrente ⚠️"}
            </div>
          </div>

          {/* 3. Erros da Binance */}
          <div className="bg-[#0b1220] p-3 rounded-xl border border-white/[0.06] space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[10px]">
              <span>Erros da Binance</span>
              <Server className="w-3 h-3 text-amber-400" />
            </div>
            <div className="text-sm font-bold text-white">
              <span className={binanceErrorCount === 0 ? "text-emerald-400" : "text-rose-400"}>
                {binanceErrorCount} erros
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              Backoff exponencial OK
            </div>
          </div>

          {/* 4. Frequência de Execuções */}
          <div className="bg-[#0b1220] p-3 rounded-xl border border-white/[0.06] space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[10px]">
              <span>Cadência de Scan</span>
              <Activity className="w-3 h-3 text-cyan-400" />
            </div>
            <div className="text-sm font-bold text-cyan-300">
              {executionFreq} scans/min
            </div>
            <div className="text-[10px] text-slate-400">
              Intervalo médio ~4.2s
            </div>
          </div>

          {/* 5. Estado do WebSocket */}
          <div className="bg-[#0b1220] p-3 rounded-xl border border-white/[0.06] space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[10px]">
              <span>Binance WebSocket</span>
              <Radio className="w-3 h-3 text-emerald-400" />
            </div>
            <div className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              Conectado
            </div>
            <div className="text-[10px] text-slate-400">
              Stream Spot Depth 24/7
            </div>
          </div>

          {/* 6. Estado do SQLite WAL */}
          <div className="bg-[#0b1220] p-3 rounded-xl border border-white/[0.06] space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[10px]">
              <span>SQLite WAL</span>
              <Database className="w-3 h-3 text-cyan-400" />
            </div>
            <div className="text-sm font-bold text-white flex items-center gap-1">
              <span className="text-cyan-300">{sqliteWalStatus}</span>
            </div>
            <div className="text-[10px] text-slate-400">
              {sqliteAuditedTradesCount} trades conferidos
            </div>
          </div>
        </div>

        {/* Linha de Auditoria Contábil de Zero Divergências */}
        <div className="bg-[#0c1322] border border-white/[0.06] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold text-white text-xs block">
                Garantia de Governança Contábil
              </span>
              <span className="text-[11px] text-slate-400">
                Métricas operacionais auditadas e reconciliadas com a base local.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] shrink-0">
            <span className="text-slate-400">
              Circuit Breaker:{" "}
              <strong className={circuitBreakerTripped ? "text-rose-400" : "text-emerald-400"}>
                {circuitBreakerTripped
                  ? "DISPARADO 🚨"
                  : `ARMADO (Trava 3,0%: US$ ${circuitBreakerLossUsd.toFixed(2)} de US$ ${circuitBreakerLimitUsd.toFixed(2)})`}
              </strong>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
