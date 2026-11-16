"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useCryptoStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { clearAllRestingMakerOrdersForTests } from "@/lib/bot/multi-bot-engine";
import { flightRecorder } from "@/lib/telemetry/flight-recorder";
import { structuredLogger } from "@/lib/telemetry/structured-logger";
import { playStopLossOrKillSwitchSound } from "@/lib/sound/sound-effects";
import { useToast } from "@/hooks/use-toast";
import { cancelAllSlicedExecutions, computeMobileRegime } from "./mobile-helpers";
import { MobileTradeTab } from "./tabs/mobile-trade-tab";
import { MobileAiEngineTab } from "./tabs/mobile-ai-engine-tab";
import { MobilePortfolioTab } from "./tabs/mobile-portfolio-tab";
import { MobileSystemTab } from "./tabs/mobile-system-tab";
import {
  Activity,
  Brain,
  CandlestickChart,
  Monitor,
  OctagonAlert,
  ShieldAlert,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileTabId = "trade" | "ai-engine" | "portfolio" | "system";

interface MobileLayoutProps {
  onSwitchToDesktop?: () => void;
}

const HOLD_DURATION_MS = 1500;

export function MobileLayout({ onSwitchToDesktop }: MobileLayoutProps) {
  const { toast } = useToast();
  const {
    connectionStatus,
    syncMode,
    klines,
    selectedSymbol,
    startupHealth,
    bots,
    toggleAllBots,
    killAllBots,
  } = useCryptoStore(
    useShallow((s) => ({
      connectionStatus: s.connectionStatus,
      syncMode: s.syncMode,
      klines: s.klines,
      selectedSymbol: s.selectedSymbol,
      startupHealth: s.startupHealth,
      bots: s.bots,
      toggleAllBots: s.toggleAllBots,
      killAllBots: s.killAllBots,
    }))
  );

  const [activeTab, setActiveTab] = useState<MobileTabId>("trade");
  const [panicOpen, setPanicOpen] = useState(false);
  const [slideValue, setSlideValue] = useState(0);
  const [holdProgress, setHoldProgress] = useState(0);

  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef<number>(0);

  const regime = useMemo(() => computeMobileRegime(klines), [klines]);
  const activeBotsCount = useMemo(() => bots.filter((b) => b.active).length, [bots]);
  const aiOnline = startupHealth.ai.status === "ok" || bots.some((b) => b.active);

  const stopHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldProgress(0);
  }, []);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    };
  }, []);

  const executeKillSwitch = useCallback(() => {
    stopHoldTimer();
    setSlideValue(0);
    setPanicOpen(false);

    toggleAllBots(false);
    killAllBots();
    cancelAllSlicedExecutions();
    try {
      clearAllRestingMakerOrdersForTests();
    } catch {}
    playStopLossOrKillSwitchSound();

    const sym = selectedSymbol || "BTCUSDT";
    flightRecorder.captureSnapshot(
      "MANUAL_OPERATOR_TRIGGER",
      sym,
      "Kill-Switch acionado pelo operador no Mobile (Slide-to-Kill / Long-Press 1.5s)"
    );
    structuredLogger.critical(
      "RISK_ENGINE",
      "🚨 [MOBILE KILL-SWITCH] PARADA DE EMERGÊNCIA EXECUTADA! Frota pausada e ordens resting/TWAP limpas."
    );
    toast({
      variant: "destructive",
      title: "🚨 KILL-SWITCH EXECUTADO",
      description: "Todos os robôs pausados e ordens passivas/TWAP canceladas imediatamente.",
    });
  }, [stopHoldTimer, toggleAllBots, killAllBots, selectedSymbol, toast]);

  const startHoldTimer = () => {
    if (holdTimerRef.current) return;
    holdStartRef.current = Date.now();
    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      const pct = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setHoldProgress(pct);
      if (elapsed >= HOLD_DURATION_MS) {
        executeKillSwitch();
      }
    }, 30);
  };

  const handleSlideChange = (val: number) => {
    setSlideValue(val);
    if (val >= 96) {
      executeKillSwitch();
    }
  };

  const handleSlideRelease = () => {
    if (slideValue < 96) {
      setSlideValue(0);
    }
  };

  const regimeBadgeClass =
    regime.tone === "bull"
      ? "bg-[#10B981]/15 border-[#10B981]/40 text-[#10B981]"
      : regime.tone === "bear"
        ? "bg-[#F43F5E]/15 border-[#F43F5E]/40 text-[#F43F5E]"
        : regime.tone === "volatility"
          ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
          : "bg-[#6366F1]/15 border-[#6366F1]/40 text-[#A5B4FC]";

  const wsHealthy = connectionStatus === "connected" || (syncMode !== "offline" && connectionStatus !== "disconnected");

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col font-instrument-sans antialiased selection:bg-[#6366F1]/30">
      {/* Top Bar Persistente Compacta */}
      <header className="sticky top-0 z-40 bg-[#090D16]/95 backdrop-blur-md border-b border-white/10 px-3 py-2">
        <div className="max-w-md mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              title={`Stream: ${connectionStatus} (${syncMode})`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#111827] border border-white/10 text-[10px] font-mono tabular-nums shrink-0"
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  connectionStatus === "connected"
                    ? "bg-[#10B981]"
                    : wsHealthy
                      ? "bg-amber-400 animate-pulse"
                      : "bg-[#F43F5E]"
                )}
              />
              <span className="text-slate-200">
                {connectionStatus === "connected" ? "WS" : syncMode === "offline" ? "OFF" : "RECON"}
              </span>
            </span>

            <span
              className={cn(
                "px-2 py-1 rounded-md border text-[10px] font-mono font-bold shrink-0",
                aiOnline
                  ? "bg-[#6366F1]/20 border-[#6366F1]/40 text-[#A5B4FC]"
                  : "bg-[#111827] border-white/10 text-slate-400"
              )}
            >
              IA {activeBotsCount > 0 ? `ON (${activeBotsCount})` : aiOnline ? "ON" : "PAUS"}
            </span>

            <span className={cn("px-2 py-1 rounded-md border text-[10px] font-semibold truncate", regimeBadgeClass)}>
              {regime.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onSwitchToDesktop && (
              <button
                type="button"
                onClick={onSwitchToDesktop}
                title="Alternar para interface Desktop"
                className="p-1.5 rounded-lg bg-[#111827] border border-white/10 text-slate-300 hover:text-white cursor-pointer"
              >
                <Monitor className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setPanicOpen(true)}
              aria-label="Kill Switch de Emergência"
              className="px-2.5 py-1.5 rounded-lg bg-[#F43F5E] text-white font-bold text-[11px] flex items-center gap-1 shadow-lg shadow-[#F43F5E]/25 active:scale-95 transition-transform cursor-pointer"
            >
              <OctagonAlert className="w-3.5 h-3.5" />
              <span>STOP</span>
            </button>
          </div>
        </div>
      </header>

      {/* Conteúdo da Aba Ativa */}
      <main className="flex-1 w-full max-w-md mx-auto px-3 pt-2.5 pb-20">
        {activeTab === "trade" && <MobileTradeTab />}
        {activeTab === "ai-engine" && <MobileAiEngineTab />}
        {activeTab === "portfolio" && <MobilePortfolioTab />}
        {activeTab === "system" && <MobileSystemTab />}
      </main>

      {/* Bottom Tab Navigation Fixa (h-16 + safe-bottom) */}
      <nav
        aria-label="Navegação Mobile TradeAI"
        className="fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#111827]/95 backdrop-blur-md border-t border-white/10 safe-bottom"
      >
        <div className="max-w-md mx-auto h-full grid grid-cols-4 px-1">
          {(
            [
              { id: "trade", label: "Trade", icon: CandlestickChart },
              { id: "ai-engine", label: "AI Engine", icon: Brain },
              { id: "portfolio", label: "Portfolio", icon: Wallet },
              { id: "system", label: "System", icon: Activity },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 cursor-pointer select-none transition-colors",
                  isActive ? "text-[#10B981]" : "text-slate-400 hover:text-slate-200"
                )}
              >
                {isActive && <span className="absolute top-0 w-9 h-0.5 rounded-full bg-[#6366F1]" />}
                <Icon className={cn("w-5 h-5", isActive && "text-[#6366F1]")} />
                <span className="text-[11px] font-semibold tracking-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Gaveta de Pânico (Slide-to-Kill & Long Press 1.5s — equivale ao Duplo Esc) */}
      {panicOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/80 backdrop-blur-xs">
          <div className="bg-[#111827] border-t-2 border-[#F43F5E] rounded-t-2xl p-4 pb-8 safe-bottom max-w-md w-full mx-auto space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-[#F43F5E]">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold text-white">Kill Switch de Emergência</h3>
                  <p className="text-[11px] text-slate-400">
                    Pausa todos os robôs ({activeBotsCount} ativo(s)), cancela lotes TWAP/VWAP e limpa ordens passivas.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopHoldTimer();
                  setSlideValue(0);
                  setPanicOpen(false);
                }}
                className="p-1.5 rounded-lg bg-[#090D16] text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mecanismo 1: Slide-to-Kill */}
            <div className="bg-[#090D16] border border-[#F43F5E]/40 rounded-xl p-3 space-y-2">
              <div className="flex justify-between text-[11px] font-mono">
                <span className="text-[#F43F5E] font-bold">DESLIZE PARA PARAR TUDO →</span>
                <span className="text-slate-400 tabular-nums">{slideValue}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={slideValue}
                onChange={(e) => handleSlideChange(Number(e.target.value))}
                onPointerUp={handleSlideRelease}
                onTouchEnd={handleSlideRelease}
                aria-label="Deslize para confirmar parada de emergência"
                className="w-full h-10 accent-[#F43F5E] cursor-pointer"
              />
            </div>

            {/* Mecanismo 2: Long-Press 1,5s */}
            <button
              type="button"
              onPointerDown={startHoldTimer}
              onPointerUp={stopHoldTimer}
              onPointerLeave={stopHoldTimer}
              onPointerCancel={stopHoldTimer}
              className="relative w-full py-3.5 rounded-xl bg-[#090D16] border border-[#F43F5E]/60 overflow-hidden text-white font-bold text-xs uppercase tracking-wider select-none cursor-pointer"
            >
              <span
                className="absolute inset-y-0 left-0 bg-[#F43F5E]/80 transition-none"
                style={{ width: `${holdProgress}%` }}
              />
              <span className="relative z-10">
                {holdProgress > 0
                  ? `Segurando (${Math.round(holdProgress)}%)...`
                  : "Ou SEGURE por 1,5s para Acionar Kill Switch"}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
