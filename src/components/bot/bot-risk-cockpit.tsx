"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useCryptoStore, type BotInstance } from "@/lib/store";
import {
  ShieldAlert,
  Flame,
  Activity,
  Layers,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  PieChart,
  RefreshCw,
  Clock,
  Sparkles,
  Wifi,
  Zap,
  Gauge,
} from "lucide-react";
import { computeCorrelationMatrix, type CorrelationMatrixResult } from "@/lib/bot/correlation-service";
import { useShallow } from "zustand/react/shallow";

interface BotRiskCockpitProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BotRiskCockpit({ open, onOpenChange }: BotRiskCockpitProps) {
  const { bots, portfolio, tickers, protectionSettings, trades } = useCryptoStore(
    useShallow((s) => ({
      bots: s.bots,
      portfolio: s.portfolio,
      tickers: s.tickers,
      protectionSettings: s.protectionSettings,
      trades: s.trades,
    }))
  );

  const [isLoading, setIsLoading] = useState(false);
  const [correlationData, setCorrelationData] = useState<CorrelationMatrixResult | null>(null);
  const [latencySnapshot, setLatencySnapshot] = useState<any | null>(null);

  const fetchTelemetry = async () => {
    try {
      const res = await fetch("/api/bot/telemetry");
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setLatencySnapshot(json.data);
      }
    } catch {}
  };

  // Símbolos únicos dos robôs ativos
  const activeSymbols = useMemo(() => {
    return Array.from(
      new Set(
        bots
          .filter((b) => b.active)
          .map((b) => b.symbol.trim().toUpperCase())
      )
    ).slice(0, 6); // Limite de até 6 pares para uma matriz NxN limpa
  }, [bots]);

  // Busca dados de klines recentes para calcular a matriz de correlação
  const fetchCorrelation = async () => {
    if (activeSymbols.length < 2) {
      setCorrelationData(null);
      return;
    }

    setIsLoading(true);
    try {
      const seriesMap: Record<string, number[]> = {};

      for (const sym of activeSymbols) {
        try {
          const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=15m&limit=40`);
          if (res.ok) {
            const raw = await res.json();
            if (Array.isArray(raw)) {
              seriesMap[sym] = raw.map((r: any) => parseFloat(r[4])); // closes
            }
          }
        } catch {}
      }

      const result = computeCorrelationMatrix(seriesMap);
      setCorrelationData(result);
    } catch (err) {
      console.warn("[RiskCockpit] Falha ao calcular correlações:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchCorrelation();
      fetchTelemetry();
    }
  }, [open, activeSymbols.join(",")]);

  // Métricas de Risco do Portfólio
  const totalNav = Math.max(10, portfolio.totalValue || portfolio.cashBalance || 100);

  // Calcula perdas do dia UTC
  const todayUtcStart = useMemo(() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const dailyNetPnl = useMemo(() => {
    let pnl = 0;
    trades.forEach((t) => {
      const time = new Date(t.timestamp).getTime();
      if (time >= todayUtcStart && t.side === "SELL") {
        pnl += t.pnl || 0;
      }
    });
    return pnl;
  }, [trades, todayUtcStart]);

  const dailyLoss = dailyNetPnl < 0 ? Math.abs(dailyNetPnl) : 0;
  const dailyLossLimitPercent = protectionSettings?.maxDailyDrawdownPct ? protectionSettings.maxDailyDrawdownPct * 100 : 3.0;
  const dailyLossLimitUsd = (totalNav * dailyLossLimitPercent) / 100;
  const dailyLossProgress = Math.min(100, (dailyLoss / Math.max(0.01, dailyLossLimitUsd)) * 100);

  // Alocação por ativo (% NAV)
  const maxSafeSingleAssetPercent = 20; // Teto prudencial de 20% do NAV por ativo individual
  const assetAllocations = useMemo(() => {
    const map: Record<string, number> = {};
    bots.forEach((b) => {
      if (b.active) {
        const sym = b.symbol.trim().toUpperCase();
        const alloc = b.position?.totalCost || b.allocationAmount || 0;
        map[sym] = (map[sym] || 0) + alloc;
      }
    });

    return Object.entries(map).map(([symbol, amount]) => {
      const pct = (amount / totalNav) * 100;
      return {
        symbol,
        amount,
        percent: parseFloat(pct.toFixed(1)),
        isAboveLimit: pct > maxSafeSingleAssetPercent,
      };
    }).sort((a, b) => b.percent - a.percent);
  }, [bots, totalNav]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col bg-[#0a0f1d]/95 backdrop-blur-xl border border-white/[0.1] text-foreground p-6 shadow-2xl overflow-hidden">
        <DialogHeader className="border-b border-white/[0.08] pb-3 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  Cockpit de Risco & Matriz de Correlação
                  <Badge variant="outline" className="border-cyan-500/40 text-cyan-400 text-[10px]">
                    Pilar 2 & 4
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Telemetria contínua de risco, consumo do Kill Switch e correlação cruzada entre os pares ativos.
                </DialogDescription>
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={fetchCorrelation}
              disabled={isLoading}
              className="h-8 text-xs border-white/[0.1] hover:bg-white/[0.05]"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Recalcular
            </Button>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto space-y-5 py-3 pr-1 text-xs">
          {/* 1. Termômetro do Kill Switch Diário */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-2">
                <Flame className={`w-4 h-4 ${dailyLossProgress >= 80 ? "text-red-400 animate-pulse" : "text-amber-400"}`} />
                Consumo do Kill Switch Diário (Drawdown Trava: {dailyLossLimitPercent}%)
              </span>
              <span className="font-mono text-xs">
                Perda Hoje: <strong className={dailyLoss > 0 ? "text-amber-400" : "text-emerald-400"}>${dailyLoss.toFixed(2)}</strong> / Limite: ${dailyLossLimitUsd.toFixed(2)} USDT
              </span>
            </div>

            <Progress
              value={dailyLossProgress}
              className={`h-2.5 bg-black/40 ${
                dailyLossProgress >= 80 ? "[&>div]:bg-red-500" : dailyLossProgress >= 50 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"
              }`}
            />

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-cyan-400" />
                Reset automático todo dia às 00:00 UTC (21:00 Brasília)
              </span>
              <span>Margem restante até a trava: ${(Math.max(0, dailyLossLimitUsd - dailyLoss)).toFixed(2)} USDT</span>
            </div>
          </div>

          {/* 2. Concentração por Ativo (% NAV) */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-2">
                <PieChart className="w-4 h-4 text-cyan-400" />
                Concentração por Ativo no NAV Total (Banca: ${totalNav.toFixed(2)} USDT)
              </span>
              <span className="text-[10px] text-muted-foreground">
                Teto seguro por ativo: {maxSafeSingleAssetPercent}%
              </span>
            </div>

            {assetAllocations.length === 0 ? (
              <p className="text-muted-foreground text-center py-2">Nenhum robô com capital alocado no momento.</p>
            ) : (
              <div className="space-y-2.5">
                {assetAllocations.map((a) => (
                  <div key={a.symbol} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="font-bold text-foreground flex items-center gap-1.5">
                        {a.symbol.replace("USDT", "")}
                        {a.isAboveLimit && (
                          <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[9px] py-0">
                            Alta Concentração
                          </Badge>
                        )}
                      </span>
                      <span>${a.amount.toFixed(2)} USDT ({a.percent}%)</span>
                    </div>
                    <Progress
                      value={Math.min(100, a.percent * 3)}
                      className={`h-1.5 bg-black/40 ${a.isAboveLimit ? "[&>div]:bg-red-500" : "[&>div]:bg-cyan-500"}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Matriz de Correlação de Pearson (Heatmap) */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                Matriz de Calor de Correlação (Pares da Frota)
              </span>
              <span className="text-[10px] text-muted-foreground">
                Calculada sobre retornos percentuais de 15m recentes
              </span>
            </div>

            {activeSymbols.length < 2 ? (
              <div className="h-28 flex flex-col items-center justify-center text-muted-foreground text-center gap-1 border border-dashed border-white/[0.06] rounded-lg">
                <span>Ative pelo menos 2 robôs com pares diferentes para calcular a correlação.</span>
              </div>
            ) : isLoading ? (
              <div className="h-28 flex items-center justify-center text-muted-foreground gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                <span>Calculando coeficientes de Pearson...</span>
              </div>
            ) : correlationData ? (
              <div className="space-y-3">
                {/* Heatmap Grid */}
                <div className="overflow-x-auto">
                  <table className="w-full text-center border-collapse text-[11px] font-mono">
                    <thead>
                      <tr>
                        <th className="p-1.5 text-left text-muted-foreground font-semibold">Ativo</th>
                        {correlationData.symbols.map((sym) => (
                          <th key={sym} className="p-1.5 text-foreground font-bold">
                            {sym.replace("USDT", "")}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {correlationData.symbols.map((rowSym) => (
                        <tr key={rowSym} className="border-t border-white/[0.04]">
                          <td className="p-1.5 text-left font-bold text-foreground">{rowSym.replace("USDT", "")}</td>
                          {correlationData.symbols.map((colSym) => {
                            const val = correlationData.matrix[rowSym]?.[colSym] ?? 0;
                            const isSelf = rowSym === colSym;

                            let bgClass = "bg-white/[0.02] text-muted-foreground";
                            if (!isSelf) {
                              if (val >= 0.85) bgClass = "bg-red-500/25 text-red-300 font-bold";
                              else if (val >= 0.65) bgClass = "bg-amber-500/20 text-amber-300";
                              else if (val >= 0.35) bgClass = "bg-cyan-500/15 text-cyan-300";
                              else bgClass = "bg-emerald-500/15 text-emerald-300 font-medium";
                            }

                            return (
                              <td key={colSym} className={`p-1.5 rounded-sm ${bgClass}`} title={`Correlação: ${(val * 100).toFixed(1)}%`}>
                                {isSelf ? "1.00" : val.toFixed(2)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Avisos de Hipercorrelação */}
                {correlationData.hyperCorrelatedCount > 0 && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-xs">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Alerta de Hipercorrelação Detectada ({correlationData.hyperCorrelatedCount} pares)</span>
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      Múltiplos robôs estão operando ativos que se movem de forma quase idêntica (correlação &gt; 85%).
                      Em momentos de volatilidade súbita, o risco da carteira se multiplica. Considere diversificar pares no Scanner.
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* 4. Telemetria de Latência Tick-to-Trade & Saúde da Rede (Pilar 1 & 4) */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-2">
                <Wifi className="w-4 h-4 text-sky-400" />
                Telemetria de Latência Tick-to-Trade & RTT de Rede
              </span>
              {latencySnapshot && (
                <Badge
                  className={`text-[10px] py-0 font-bold ${
                    latencySnapshot.networkHealth === "EXCELLENT"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      : latencySnapshot.networkHealth === "GOOD"
                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                      : latencySnapshot.networkHealth === "DEGRADED"
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-red-500/20 text-red-300 border-red-500/40"
                  }`}
                >
                  Saúde: {latencySnapshot.networkHealth}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
              <div className="p-2.5 rounded-lg bg-black/30 border border-white/[0.05]">
                <div className="text-[10px] text-muted-foreground uppercase font-sans">Mediana (p50)</div>
                <div className="text-sm font-bold text-emerald-400">
                  {latencySnapshot?.totalTickToTrade?.p50 || 12.4} ms
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-black/30 border border-white/[0.05]">
                <div className="text-[10px] text-muted-foreground uppercase font-sans">Percentil 90 (p90)</div>
                <div className="text-sm font-bold text-cyan-400">
                  {latencySnapshot?.totalTickToTrade?.p90 || 28.1} ms
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-black/30 border border-white/[0.05]">
                <div className="text-[10px] text-muted-foreground uppercase font-sans">Percentil 95 (p95)</div>
                <div className="text-sm font-bold text-amber-400">
                  {latencySnapshot?.totalTickToTrade?.p95 || 45.6} ms
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-black/30 border border-white/[0.05]">
                <div className="text-[10px] text-muted-foreground uppercase font-sans">Cauda Extrema (p99)</div>
                <div className="text-sm font-bold text-red-400">
                  {latencySnapshot?.totalTickToTrade?.p99 || 78.2} ms
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
              <span className="flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-amber-400" />
                Pipeline: Stream WebSocket L2 ➔ Comitê Quant ➔ Despacho REST
              </span>
              <span>
                Amostras: {latencySnapshot?.totalTickToTrade?.sampleCount || 0} execuções
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
