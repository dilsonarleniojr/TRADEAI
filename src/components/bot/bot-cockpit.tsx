"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { manualCloseBotPosition } from "@/lib/bot/multi-bot-engine";
import { formatPrice } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert,
  ShieldCheck,
  Flame,
  Zap,
  DollarSign,
  Activity,
  Layers,
  PowerOff,
} from "lucide-react";

export function BotCockpit() {
  const { bots, toggleAllBots, portfolio, tradingMode } = useCryptoStore();
  const { toast } = useToast();

  // 2-step confirmation states
  const [killSwitchConfirm, setKillSwitchConfirm] = useState(false);
  const [closePositionsConfirm, setClosePositionsConfirm] = useState(false);
  const [isClosingPositions, setIsClosingPositions] = useState(false);

  const killSwitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closePositionsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timeouts on unmount
  useEffect(() => {
    return () => {
      if (killSwitchTimeoutRef.current) clearTimeout(killSwitchTimeoutRef.current);
      if (closePositionsTimeoutRef.current) clearTimeout(closePositionsTimeoutRef.current);
    };
  }, []);

  // Compute fleet metrics
  const activeBots = useMemo(() => bots.filter((b) => b.active), [bots]);
  const inPositionBots = useMemo(
    () => bots.filter((b) => !!b.position && b.position.quantity > 0),
    [bots]
  );
  const stoppedBots = useMemo(() => bots.filter((b) => !b.active || b.status === "stopped"), [bots]);

  // Aggregate uPnL & Realized PnL
  const totalUnrealizedPnl = useMemo(() => {
    return bots.reduce((sum, b) => {
      if (b.position && typeof b.position.unrealizedPnl === "number") {
        return sum + b.position.unrealizedPnl;
      }
      return sum;
    }, 0);
  }, [bots]);

  const totalRealizedPnl = useMemo(() => {
    return bots.reduce((sum, b) => sum + (b.stats?.realizedPnl || 0), 0);
  }, [bots]);

  // Daily Circuit Breaker calculations (Max allowed loss = 3.0% of Total Balance / NAV)
  const totalBalance = Math.max(10, portfolio?.totalValue || 100);
  const maxLossLimit = totalBalance * 0.03; // 3.0%
  // Current daily loss: negative daily PnL
  const dailyPnl = portfolio?.pnl ?? totalRealizedPnl;
  const currentDailyLoss = dailyPnl < 0 ? Math.abs(dailyPnl) : 0;
  const circuitBreakerRatio = Math.min(100, (currentDailyLoss / maxLossLimit) * 100);
  const isCircuitBreakerWarning = circuitBreakerRatio >= 75 && circuitBreakerRatio < 100;
  const isCircuitBreakerBreached = circuitBreakerRatio >= 100;

  // Handle 2-step Kill Switch
  const handleKillSwitchClick = () => {
    if (!killSwitchConfirm) {
      setKillSwitchConfirm(true);
      if (killSwitchTimeoutRef.current) clearTimeout(killSwitchTimeoutRef.current);
      killSwitchTimeoutRef.current = setTimeout(() => {
        setKillSwitchConfirm(false);
      }, 3500);
    } else {
      if (killSwitchTimeoutRef.current) clearTimeout(killSwitchTimeoutRef.current);
      setKillSwitchConfirm(false);
      toggleAllBots(false);
      toast({
        title: "🚨 Kill-Switch Global Executado",
        description: `Todos os ${bots.length} robôs da frota foram pausados imediatamente.`,
        variant: "destructive",
      });
    }
  };

  // Handle 2-step Close All Positions
  const handleCloseAllPositionsClick = async () => {
    if (inPositionBots.length === 0) {
      toast({
        title: "Nenhuma Posição Aberta",
        description: "A frota não possui ordens ou posições abertas no momento.",
      });
      return;
    }

    if (!closePositionsConfirm) {
      setClosePositionsConfirm(true);
      if (closePositionsTimeoutRef.current) clearTimeout(closePositionsTimeoutRef.current);
      closePositionsTimeoutRef.current = setTimeout(() => {
        setClosePositionsConfirm(false);
      }, 3500);
    } else {
      if (closePositionsTimeoutRef.current) clearTimeout(closePositionsTimeoutRef.current);
      setClosePositionsConfirm(false);
      setIsClosingPositions(true);

      let closedCount = 0;
      for (const bot of inPositionBots) {
        try {
          await manualCloseBotPosition(bot.id);
          closedCount++;
        } catch (err) {
          console.error(`[BotCockpit] Erro ao fechar posição do bot ${bot.name}:`, err);
        }
      }

      setIsClosingPositions(false);
      toast({
        title: "⚡ Posições Fechadas a Mercado",
        description: `${closedCount} de ${inPositionBots.length} posições foram liquidadas a mercado com sucesso.`,
      });
    }
  };

  return (
    <Card className="bg-[#0f1622]/95 border-white/[0.08] backdrop-blur-md shadow-2xl rounded-2xl overflow-hidden mb-4">
      <CardContent className="p-3.5 space-y-3">
        {/* Top Header Strip: Fleet Health & Mode */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Activity className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-100 tracking-wide">
                  Cockpit Operacional HFT
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  {tradingMode === "live" ? "Live Real" : "Paper Trading"}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Monitoramento contínuo de latência, risco e estado operacional da frota
              </span>
            </div>
          </div>

          {/* Quick Emergency Actions */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Panic Liquidation Button */}
            <Button
              size="sm"
              variant="outline"
              disabled={inPositionBots.length === 0 || isClosingPositions}
              onClick={handleCloseAllPositionsClick}
              className={`h-8 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                closePositionsConfirm
                  ? "bg-amber-500/20 text-amber-300 border-amber-500 animate-pulse"
                  : "bg-slate-900/60 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/50"
              }`}
            >
              <Zap className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              {closePositionsConfirm
                ? `Confirmar Zeragem (${inPositionBots.length})?`
                : "Fechar a Mercado"}
            </Button>

            {/* Kill-Switch Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleKillSwitchClick}
              className={`h-8 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                killSwitchConfirm
                  ? "bg-rose-500/25 text-rose-200 border-rose-500 shadow-lg shadow-rose-500/20 animate-pulse"
                  : "bg-slate-900/60 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/50"
              }`}
            >
              <PowerOff className="w-3.5 h-3.5 mr-1.5 text-rose-400" />
              {killSwitchConfirm ? "Confirmar Parada Total?" : "Kill-Switch Frota"}
            </Button>
          </div>
        </div>

        {/* Fleet Status & PnL Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Status Distribution */}
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-white/[0.05] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
              <span>Status da Frota</span>
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="flex items-baseline gap-2 mt-1 tabular-nums">
              <span className="text-xl font-bold font-mono text-slate-100">
                {activeBots.length}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                / {bots.length} Ativos
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[9px] font-mono tabular-nums text-slate-400">
              <span className="text-emerald-400">{inPositionBots.length} em posição</span>
              <span>•</span>
              <span className="text-cyan-400">
                {Math.max(0, activeBots.length - inPositionBots.length)} buscando
              </span>
              <span>•</span>
              <span className="text-slate-500">{stoppedBots.length} off</span>
            </div>
          </div>

          {/* Unrealized PnL (uPnL) */}
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-white/[0.05] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
              <span>uPnL Flutuante</span>
              <Flame className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-1 mt-1 tabular-nums">
              <span
                className={`text-xl font-bold font-mono ${
                  totalUnrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {totalUnrealizedPnl >= 0 ? "+" : ""}${formatPrice(Math.abs(totalUnrealizedPnl))}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">USDT</span>
            </div>
            <span className="text-[9px] text-slate-400 mt-1">
              {inPositionBots.length === 0
                ? "Sem posições em aberto"
                : `${inPositionBots.length} ativo(s) oscilando`}
            </span>
          </div>

          {/* Realized PnL of the Day */}
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-white/[0.05] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
              <span>PnL Realizado Sessão</span>
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-1 mt-1 tabular-nums">
              <span
                className={`text-xl font-bold font-mono ${
                  totalRealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {totalRealizedPnl >= 0 ? "+" : ""}${formatPrice(Math.abs(totalRealizedPnl))}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">USDT</span>
            </div>
            <span className="text-[9px] text-slate-400 mt-1">
              Trades encerrados pela frota
            </span>
          </div>

          {/* Daily Circuit Breaker Gauge Card */}
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-white/[0.05] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
              <span className="flex items-center gap-1">
                {isCircuitBreakerBreached ? (
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                )}
                Trava Perda Diária (3.0%)
              </span>
              <span className="font-mono tabular-nums text-[9px] text-slate-400">
                ${formatPrice(currentDailyLoss)} / ${formatPrice(maxLossLimit)}
              </span>
            </div>

            {/* Gauge Bar */}
            <div className="my-1.5">
              <div className="h-2 rounded-full overflow-hidden bg-slate-800 relative">
                <div
                  className={`h-full transition-all duration-300 ease-out rounded-full ${
                    isCircuitBreakerBreached
                      ? "bg-rose-500 animate-pulse"
                      : isCircuitBreakerWarning
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.max(2, circuitBreakerRatio)}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[9px] font-mono tabular-nums">
              <span
                className={
                  isCircuitBreakerBreached
                    ? "text-rose-400 font-bold"
                    : isCircuitBreakerWarning
                    ? "text-amber-400 font-semibold"
                    : "text-emerald-400"
                }
              >
                {isCircuitBreakerBreached
                  ? "BLOQUEIO DE SEGURANÇA"
                  : isCircuitBreakerWarning
                  ? "ALERTA DE PROXIMIDADE"
                  : "MARGEM SEGURA"}
              </span>
              <span className="text-slate-400">{circuitBreakerRatio.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
