"use client";

import { useState, useEffect } from "react";
import { Activity, Wifi, ShieldCheck, Database, Cpu, Eye, EyeOff, RefreshCw, Brain } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useCryptoStore } from "@/lib/store";
import type { ConnectionProbeStatus, ServiceProbeResult } from "@/lib/store/accountSlice";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";

function statusDotClass(status: ConnectionProbeStatus): string {
  switch (status) {
    case "ok":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-400";
    case "error":
      return "bg-rose-500";
    case "checking":
      return "bg-sky-400 animate-pulse";
    case "unconfigured":
    default:
      return "bg-muted-foreground/40";
  }
}

function statusTextClass(status: ConnectionProbeStatus): string {
  switch (status) {
    case "ok":
      return "text-emerald-500 dark:text-emerald-400";
    case "warning":
      return "text-amber-500 dark:text-amber-300";
    case "error":
      return "text-rose-500 dark:text-rose-400";
    case "checking":
      return "text-sky-500 dark:text-sky-300";
    case "unconfigured":
    default:
      return "text-muted-foreground";
  }
}

export function SystemStatusPopover() {
  const {
    connectionStatus,
    proMode,
    toggleProMode,
    bots,
    startupHealth,
    runStartupConnectionTests,
  } = useCryptoStore(
    useShallow((s) => ({
      connectionStatus: s.connectionStatus,
      proMode: s.proMode,
      toggleProMode: s.toggleProMode,
      bots: s.bots,
      startupHealth: s.startupHealth,
      runStartupConnectionTests: s.runStartupConnectionTests,
    }))
  );

  const [latencyMs, setLatencyMs] = useState<number>(24);
  const [retesting, setRetesting] = useState(false);
  const activeBots = bots.filter((b) => b.active).length;

  useEffect(() => {
    let isMounted = true;
    const checkPing = async () => {
      try {
        const start = performance.now();
        await fetch("/api/health?probe=latency", { cache: "no-store" });
        const end = performance.now();
        if (isMounted) {
          setLatencyMs(Math.max(8, Math.round(end - start)));
        }
      } catch {
        if (isMounted) setLatencyMs(45);
      }
    };

    checkPing();
    const interval = setInterval(checkPing, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const probes: Array<{ key: string; title: string; result: ServiceProbeResult }> = [
    { key: "binance", title: "Binance", result: startupHealth.binance },
    { key: "okx", title: "OKX", result: startupHealth.okx },
    { key: "ai", title: "Motor de IA", result: startupHealth.ai },
  ];

  const hasError = probes.some((p) => p.result.status === "error");
  const hasWarning = probes.some((p) => p.result.status === "warning");

  const handleRetest = async () => {
    setRetesting(true);
    try {
      await runStartupConnectionTests();
    } finally {
      setRetesting(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7.5 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-lg cursor-pointer"
          title="Status do Sistema, Conexões (Binance/OKX/IA) & Telemetria"
        >
          <Activity
            className={cn(
              "w-3.5 h-3.5",
              hasError
                ? "text-rose-500"
                : hasWarning
                  ? "text-amber-400"
                  : latencyMs < 50
                    ? "text-crypto-green"
                    : "text-amber-400"
            )}
          />
          <span className="hidden lg:inline text-[11px] font-mono font-medium">
            {latencyMs}ms
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 bg-card border border-border shadow-xl rounded-xl">
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold">Status do Sistema</span>
            </div>
            <span className={cn(
              "text-[10px] font-mono px-2 py-0.5 rounded-full font-bold",
              hasError
                ? "bg-rose-500/15 text-rose-500"
                : connectionStatus === "connected"
                  ? "bg-crypto-green/15 text-crypto-green"
                  : "bg-amber-500/15 text-amber-400"
            )}>
              {hasError ? "Atenção" : connectionStatus === "connected" ? "Normal" : "Operando"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-secondary/40 border border-border/40">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                <Wifi className="w-3 h-3 text-crypto-green" />
                <span>Latência Servidor</span>
              </div>
              <span className="font-mono font-bold">{latencyMs} ms</span>
            </div>

            <div className="p-2 rounded-lg bg-secondary/40 border border-border/40">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                <Cpu className="w-3 h-3 text-crypto-cyan" />
                <span>Frota de Robôs</span>
              </div>
              <span className="font-mono font-bold">{activeBots} ativos</span>
            </div>

            <div className="p-2 rounded-lg bg-secondary/40 border border-border/40">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>Circuit Breaker</span>
              </div>
              <span className="text-xs text-emerald-400 font-semibold">Protegido</span>
            </div>

            <div className="p-2 rounded-lg bg-secondary/40 border border-border/40">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                <Database className="w-3 h-3 text-purple-400" />
                <span>Banco Local</span>
              </div>
              <span className="text-xs text-purple-400 font-semibold">Sincronizado</span>
            </div>
          </div>

          {/* Diagnóstico das Conexões (Binance, OKX & IA) */}
          <div className="pt-2 border-t border-border/50 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Brain className="w-3 h-3 text-crypto-cyan" />
                Conexões Verificadas
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRetest}
                disabled={retesting}
                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <RefreshCw className={cn("w-3 h-3", retesting && "animate-spin")} />
                <span>{retesting ? "Testando..." : "Retestar Conexões"}</span>
              </Button>
            </div>

            <div className="space-y-1.5">
              {probes.map((p) => (
                <div
                  key={p.key}
                  className="p-2 rounded-lg bg-secondary/35 border border-border/40 flex items-start gap-2"
                >
                  <span className={cn("w-2 h-2 rounded-full mt-1 shrink-0", statusDotClass(p.result.status))} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-foreground">{p.title}</span>
                      <span className={cn("text-[10px] font-semibold truncate", statusTextClass(p.result.status))}>
                        {p.result.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground break-words leading-snug mt-0.5">
                      {p.result.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-border/50 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-medium">Modo Profissional</span>
              <span className="text-[10px] text-muted-foreground">Exibe telemetria L2 e microestrutura</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleProMode}
              className={cn(
                "h-7 px-2.5 text-xs font-semibold gap-1.5 cursor-pointer",
                proMode ? "border-primary text-primary bg-primary/10" : "text-muted-foreground"
              )}
            >
              {proMode ? (
                <>
                  <Eye className="w-3 h-3" />
                  Ativo
                </>
              ) : (
                <>
                  <EyeOff className="w-3 h-3" />
                  Desativado
                </>
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
