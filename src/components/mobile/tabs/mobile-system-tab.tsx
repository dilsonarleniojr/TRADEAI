"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useCryptoStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { structuredLogger } from "@/lib/telemetry/structured-logger";
import type { StructuredLogEntry } from "@/lib/telemetry/structured-logger";
import type { ConnectionProbeStatus } from "@/lib/store/accountSlice";
import { getExecutionTelemetry } from "@/lib/bot/multi-bot-engine";
import { useToast } from "@/hooks/use-toast";
import {
  Activity,
  Cpu,
  KeyRound,
  Pause,
  Play,
  RefreshCw,
  Terminal,
  Trash2,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";

type LogFilterTab = "all" | "exec" | "risk" | "errors";

function probeColor(status: ConnectionProbeStatus): string {
  switch (status) {
    case "ok":
      return "text-[#10B981]";
    case "warning":
      return "text-amber-400";
    case "error":
      return "text-[#F43F5E]";
    case "checking":
      return "text-[#A5B4FC]";
    default:
      return "text-slate-400";
  }
}

export function MobileSystemTab() {
  const { toast } = useToast();
  const {
    connectionStatus,
    syncMode,
    lastMarketUpdate,
    startupHealth,
    runStartupConnectionTests,
    isLogAutoScrollPaused,
    toggleLogAutoScroll,
  } = useCryptoStore(
    useShallow((s) => ({
      connectionStatus: s.connectionStatus,
      syncMode: s.syncMode,
      lastMarketUpdate: s.lastMarketUpdate,
      startupHealth: s.startupHealth,
      runStartupConnectionTests: s.runStartupConnectionTests,
      isLogAutoScrollPaused: s.isLogAutoScrollPaused,
      toggleLogAutoScroll: s.toggleLogAutoScroll,
    }))
  );

  const [latencyMs, setLatencyMs] = useState<number>(22);
  const [wsMsgsPerSec, setWsMsgsPerSec] = useState<number>(0);
  const [heapMb, setHeapMb] = useState<string>("—");
  const [retesting, setRetesting] = useState(false);
  const [logFilter, setLogFilter] = useState<LogFilterTab>("all");
  const [entries, setEntries] = useState<StructuredLogEntry[]>(() => structuredLogger.getEntries().slice(0, 120));

  const msgCounterRef = useRef<number>(0);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Subscreve ao structuredLogger com cleanup estrito no unmount (zero leak ao trocar abas)
  useEffect(() => {
    setEntries(structuredLogger.getEntries().slice(0, 120));
    const unsubscribe = structuredLogger.subscribe(() => {
      setEntries(structuredLogger.getEntries().slice(0, 120));
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Conta atualizações de feed por segundo sem alocar listeners extras no store
  useEffect(() => {
    msgCounterRef.current += 1;
  }, [lastMarketUpdate]);

  useEffect(() => {
    let active = true;

    const sampleHealth = async () => {
      const rate = msgCounterRef.current;
      msgCounterRef.current = 0;
      if (active) setWsMsgsPerSec(rate);

      const perfMem = (typeof performance !== "undefined" ? (performance as any).memory : null);
      if (perfMem && Number.isFinite(perfMem.usedJSHeapSize)) {
        if (active) setHeapMb(`${(perfMem.usedJSHeapSize / (1024 * 1024)).toFixed(1)} MB`);
      }

      try {
        const t0 = performance.now();
        await fetch("/api/health?probe=latency", { cache: "no-store", signal: AbortSignal.timeout(4000) });
        const dt = Math.max(4, Math.round(performance.now() - t0));
        if (active) setLatencyMs(dt);
      } catch {
        if (active) setLatencyMs(999);
      }
    };

    sampleHealth();
    const timer = setInterval(sampleHealth, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!isLogAutoScrollPaused && logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [entries, isLogAutoScrollPaused]);

  const filteredLogs = useMemo(() => {
    return entries.filter((e) => {
      if (logFilter === "exec") return e.channel === "SIGNALS" || e.channel === "BINANCE_API";
      if (logFilter === "risk") return e.channel === "RISK_ENGINE";
      if (logFilter === "errors") {
        return (
          e.severity === "ERROR" ||
          e.severity === "CRITICAL" ||
          e.message.includes("OrderBookFetchError")
        );
      }
      return true;
    });
  }, [entries, logFilter]);

  const telemetry = getExecutionTelemetry();
  const feedAgeMs = lastMarketUpdate > 0 ? Math.max(0, Date.now() - lastMarketUpdate) : 0;

  const handleRetest = async () => {
    setRetesting(true);
    try {
      const res = await runStartupConnectionTests();
      toast({
        title: "Conexões Verificadas",
        description: `Binance: ${res.binance.label} · OKX: ${res.okx.label} · ${res.ai.label}`,
      });
    } finally {
      setRetesting(false);
    }
  };

  return (
    <div className="space-y-2 pb-10">
      {/* Grid de Saúde em Tempo Real */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-[#111827] border border-white/10 p-3 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Stream WebSocket</span>
            <Wifi className={cn("w-3.5 h-3.5", connectionStatus === "connected" ? "text-[#10B981]" : "text-amber-400")} />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-white">
            {wsMsgsPerSec} <span className="text-[11px] font-normal text-slate-400">msg/s</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 block">
            Modo: {syncMode} · Idade: {feedAgeMs < 60000 ? `${feedAgeMs}ms` : ">60s"}
          </span>
        </div>

        <div className="rounded-xl bg-[#111827] border border-white/10 p-3 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Latência API / Exec</span>
            <Activity className={cn("w-3.5 h-3.5", latencyMs < 150 ? "text-[#10B981]" : "text-[#F43F5E]")} />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-white">
            {latencyMs} <span className="text-[11px] font-normal text-slate-400">ms</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 block">
            Exec p50/p95: {telemetry.p50LatencyMs} / {telemetry.p95LatencyMs}ms
          </span>
        </div>

        <div className="rounded-xl bg-[#111827] border border-white/10 p-3 space-y-1 col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-[#6366F1]" />
              Runtime / Memória / Pipeline
            </span>
            <span className="text-[10px] font-mono tabular-nums text-[#A5B4FC]">
              V-Sync 60 FPS · Heap: {heapMb}
            </span>
          </div>
        </div>
      </div>

      {/* Status das Chaves API (Binance, OKX & Motor de IA) */}
      <div className="rounded-xl bg-[#111827] border border-white/10 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-[#6366F1]" />
            Chaves API & Conectividade
          </span>
          <button
            type="button"
            disabled={retesting}
            onClick={handleRetest}
            className="px-2 py-1 rounded-lg bg-[#090D16] border border-white/15 text-[10px] font-semibold text-slate-200 flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3 h-3", retesting && "animate-spin")} />
            <span>{retesting ? "Testando..." : "Retestar"}</span>
          </button>
        </div>

        <div className="space-y-1.5">
          {[
            { name: "Binance", probe: startupHealth.binance },
            { name: "OKX V5", probe: startupHealth.okx },
            { name: "Motor IA", probe: startupHealth.ai },
          ].map((item) => (
            <div
              key={item.name}
              className="rounded-lg bg-[#090D16] border border-white/10 px-2.5 py-2 flex items-start justify-between gap-2 text-[11px]"
            >
              <div className="min-w-0">
                <span className="font-bold text-white block">{item.name}</span>
                <span className="text-[10px] text-slate-400 break-words">{item.probe.detail}</span>
              </div>
              <span className={cn("font-mono font-bold text-[10px] shrink-0", probeColor(item.probe.status))}>
                {item.probe.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Console de Logs Filtrável */}
      <div className="rounded-xl bg-[#111827] border border-white/10 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-[#10B981]" />
            Console de Eventos ({filteredLogs.length})
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggleLogAutoScroll()}
              className={cn(
                "px-2 py-1 rounded text-[10px] font-mono flex items-center gap-1 border cursor-pointer",
                !isLogAutoScrollPaused
                  ? "border-[#10B981]/40 bg-[#10B981]/15 text-[#10B981]"
                  : "border-white/10 bg-[#090D16] text-slate-400"
              )}
            >
              {isLogAutoScrollPaused ? <Play className="w-2.5 h-2.5" /> : <Pause className="w-2.5 h-2.5" />}
              <span>{isLogAutoScrollPaused ? "Pausado" : "Ao vivo"}</span>
            </button>
            <button
              type="button"
              onClick={() => structuredLogger.clear()}
              className="p-1.5 rounded border border-white/10 bg-[#090D16] text-slate-400 hover:text-white cursor-pointer"
              title="Limpar logs"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1 bg-[#090D16] p-1 rounded-lg border border-white/10 text-[10px] font-semibold">
          {(
            [
              { id: "all", label: "Todos" },
              { id: "exec", label: "Execuções" },
              { id: "risk", label: "Risco" },
              { id: "errors", label: "Erros / L2" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setLogFilter(f.id)}
              className={cn(
                "py-1 rounded-md cursor-pointer transition-colors",
                logFilter === f.id ? "bg-[#6366F1] text-white" : "text-slate-400"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div
          ref={logContainerRef}
          className="bg-[#090D16] border border-white/10 rounded-lg p-2 space-y-1 max-h-60 overflow-y-auto font-mono text-[10px]"
        >
          {filteredLogs.length === 0 ? (
            <p className="text-slate-500 text-center py-6">Sem eventos para o filtro selecionado.</p>
          ) : (
            filteredLogs.map((e) => (
              <div key={e.id} className="border-b border-white/5 pb-1 last:border-0 leading-snug">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 tabular-nums">{e.formattedTime}</span>
                  <span className="px-1 rounded bg-white/5 text-slate-300 text-[9px]">{e.channel}</span>
                  <span
                    className={cn(
                      "px-1 rounded text-[9px] font-bold",
                      e.severity === "CRITICAL" || e.severity === "ERROR"
                        ? "bg-[#F43F5E]/20 text-[#F43F5E]"
                        : e.severity === "WARN"
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-[#10B981]/15 text-[#10B981]"
                    )}
                  >
                    {e.severity}
                  </span>
                </div>
                <p className="text-slate-200 break-words mt-0.5">{e.message}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
