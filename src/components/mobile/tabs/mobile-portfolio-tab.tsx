"use client";

import React, { useState, useMemo } from "react";
import { useCryptoStore, type BotInstance } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import {
  clearAllRestingMakerOrdersForTests,
  getCircuitBreakerStatus,
  getRestingMakerOrders,
  liquidateWalletPosition,
  manualCloseBotPosition,
} from "@/lib/bot/multi-bot-engine";
import { structuredLogger } from "@/lib/telemetry/structured-logger";
import { ExchangeBadge } from "@/components/bot/exchange-badge";
import { useToast } from "@/hooks/use-toast";
import { cancelAllSlicedExecutions, formatMonoPrice, safeParseResponseJson } from "../mobile-helpers";
import {
  ArrowLeftRight,
  Ban,
  CheckCircle2,
  Clock,
  Lock,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function MobilePortfolioTab() {
  const { toast } = useToast();
  const {
    portfolio,
    bots,
    activeBots,
    tickers,
    scheduledOrders,
    removeScheduledOrder,
    updateBotPosition,
    selectedExchange,
    tradingMode,
    protectionSettings,
    addTrade,
    setAccount,
  } = useCryptoStore(
    useShallow((s) => ({
      portfolio: s.portfolio,
      bots: s.bots,
      activeBots: s.activeBots,
      tickers: s.tickers,
      scheduledOrders: s.scheduledOrders,
      removeScheduledOrder: s.removeScheduledOrder,
      updateBotPosition: s.updateBotPosition,
      selectedExchange: s.selectedExchange,
      tradingMode: s.tradingMode,
      protectionSettings: s.protectionSettings,
      addTrade: s.addTrade,
      setAccount: s.setAccount,
    }))
  );

  const [subTab, setSubTab] = useState<"positions" | "orders">("positions");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancellingAll, setCancellingAll] = useState(false);

  const openBotPositions = useMemo(
    () => bots.filter((b): b is BotInstance & { position: NonNullable<BotInstance["position"]> } => !!b.position && b.position.quantity > 0),
    [bots]
  );

  const walletPositions = useMemo(() => {
    const botSyms = new Set(openBotPositions.map((b) => b.position.symbol));
    return (portfolio?.positions || []).filter((p) => p.quantity > 0 && !botSyms.has(p.symbol));
  }, [portfolio?.positions, openBotPositions]);

  const totalUnrealized = useMemo(() => {
    const botUnrealized = openBotPositions.reduce((sum, b) => {
      const mark = tickers[b.position.symbol]?.price || b.position.currentPrice || b.position.entryPrice;
      const pnl = (mark - b.position.entryPrice) * b.position.quantity;
      return sum + pnl;
    }, 0);
    return openBotPositions.length > 0 ? botUnrealized : portfolio?.unrealizedPnl || 0;
  }, [openBotPositions, tickers, portfolio?.unrealizedPnl]);

  const navUsd = portfolio?.totalValue || portfolio?.cashBalance || 0;
  const freeMargin = portfolio?.cashBalance || 0;
  const dailyPnl = portfolio?.realizedPnl || 0;
  const unrealizedPct = navUsd > 0 ? (totalUnrealized / navUsd) * 100 : 0;

  const cbStatus = getCircuitBreakerStatus();
  const maxDailyLossPct = (protectionSettings?.maxDailyDrawdownPct ?? 0.03) * 100;
  const dailyLossLimitUsd = navUsd > 0 ? navUsd * (protectionSettings?.maxDailyDrawdownPct ?? 0.03) : cbStatus.dailyLossLimitUsd;
  const dailyDrawdownUsedUsd = Math.max(0, -dailyPnl, cbStatus.accumulatedDailyLossUsd || 0);
  const drawdownUsagePct = dailyLossLimitUsd > 0 ? Math.min(100, (dailyDrawdownUsedUsd / dailyLossLimitUsd) * 100) : 0;

  const restingOrders = getRestingMakerOrders();
  const activeSlicedJobs = useMemo(
    () => activeBots.filter((b) => !!b.executionProgress || b.strategy === "TWAP" || b.strategy === "VWAP"),
    [activeBots]
  );

  const totalOpenOrdersCount = restingOrders.length + scheduledOrders.length + activeSlicedJobs.filter((j) => j.status === "RUNNING").length;

  const handleCloseBotPos = async (botId: string) => {
    setBusyId(botId);
    try {
      await manualCloseBotPosition(botId, { onToast: (t) => toast(t) });
    } finally {
      setBusyId(null);
    }
  };

  const handleCloseWalletPos = async (symbol: string) => {
    setBusyId(`wallet-${symbol}`);
    try {
      await liquidateWalletPosition(symbol, { onToast: (t) => toast(t) });
    } finally {
      setBusyId(null);
    }
  };

  const handleSetBreakeven = (bot: BotInstance) => {
    const pos = bot.position;
    if (!pos) return;
    const bePrice = parseFloat((pos.entryPrice * 1.0015).toFixed(6));
    updateBotPosition(bot.id, {
      ...pos,
      isBreakEvenArmed: true,
      breakEvenPrice: bePrice,
    });
    structuredLogger.info(
      "RISK_ENGINE",
      `[Mobile Portfolio] Break-Even armado em $${formatMonoPrice(bePrice)} para ${bot.name} (${pos.symbol}).`,
      { botId: bot.id, symbol: pos.symbol }
    );
    toast({
      title: "Stop movido para o Breakeven",
      description: `${pos.symbol}: proteção armada em $${formatMonoPrice(bePrice)} (+0,15% taxas).`,
    });
  };

  const handleInvertPosition = async (
    symbol: string,
    qty: number,
    entryPrice: number,
    exchange: "binance" | "okx",
    botId?: string
  ) => {
    const key = botId || `wallet-${symbol}`;
    setBusyId(key);
    try {
      // 1. Fecha posição comprada atual
      if (botId) {
        await manualCloseBotPosition(botId, { onToast: (t) => toast(t) });
      } else {
        await liquidateWalletPosition(symbol, { onToast: (t) => toast(t) });
      }

      // 2. Despacha ordem oposta (SELL / reversão de exposição) mantendo rastreabilidade
      const mark = tickers[symbol]?.price || entryPrice || 0;
      if (mark > 0 && qty > 0) {
        const total = parseFloat((qty * mark).toFixed(2));
        if (tradingMode === "paper") {
          const res = await fetch("/api/trades", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              symbol,
              side: "SELL",
              price: mark,
              quantity: qty,
              total,
              strategy: "Mobile Reversão (Flip)",
              mode: "paper",
              exchange,
              orderType: "MARKET",
            }),
          });
          const json = await safeParseResponseJson(res);
          if (res.ok && json?.success) {
            if (json.data) addTrade(json.data);
            if (json.account) setAccount(json.account);
          }
        }
        structuredLogger.warn(
          "RISK_ENGINE",
          `[Mobile Reversão] Posição ${symbol} encerrada e fluxo invertido na ${exchange.toUpperCase()}.`
        );
        toast({
          title: `Posição ${symbol} revertida`,
          description:
            tradingMode === "live"
              ? "Posição Spot liquidada a mercado (short descoberto bloqueado em Spot pelos guardrails)."
              : `Posição encerrada e reversão registrada em modo simulado (${exchange.toUpperCase()}).`,
        });
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelAllOrders = async () => {
    if (cancellingAll) return;
    setCancellingAll(true);
    try {
      // 1. Tenta cancelar ordens resting reais na exchange (Binance/OKX)
      const currentResting = getRestingMakerOrders();
      await Promise.allSettled(
        currentResting
          .filter((o) => !String(o.orderId).startsWith("paper-"))
          .map((o) =>
            fetch(
              `/api/trades?action=cancelOrder&symbol=${encodeURIComponent(o.symbol)}&orderId=${encodeURIComponent(
                String(o.orderId)
              )}&exchange=${o.exchange || selectedExchange}`,
              { method: "DELETE" }
            )
          )
      );

      // 2. Limpa fila resting em memória, lotes TWAP/VWAP e ordens programadas
      clearAllRestingMakerOrdersForTests();
      const stoppedSlices = cancelAllSlicedExecutions();
      for (const ord of scheduledOrders) {
        removeScheduledOrder(ord.id);
      }

      structuredLogger.warn(
        "BINANCE_API",
        `[Mobile Portfolio] Cancelar Todas executado: ${currentResting.length} resting, ${stoppedSlices} TWAP/VWAP, ${scheduledOrders.length} agendadas.`
      );
      toast({
        title: "Ordens abertas canceladas",
        description: `Limpas ${currentResting.length} ordem(ns) resting, ${stoppedSlices} lote(s) TWAP/VWAP e ${scheduledOrders.length} agendada(s).`,
      });
    } finally {
      setCancellingAll(false);
    }
  };

  return (
    <div className="space-y-2 pb-10">
      {/* Resumo de Capital & Drawdown Control */}
      <div className="rounded-xl bg-[#111827] border border-white/10 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-[#6366F1]" />
            Resumo de Capital ({tradingMode === "live" ? "REAL" : "SIMULADO"})
          </span>
          <span className="text-[10px] font-mono text-slate-400 uppercase">{selectedExchange}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
          <div className="bg-[#090D16] border border-white/10 rounded-lg p-2">
            <span className="text-[10px] font-sans text-slate-400 block">Saldo Total (NAV)</span>
            <span className="text-base font-bold text-white">${navUsd.toFixed(2)}</span>
          </div>
          <div className="bg-[#090D16] border border-white/10 rounded-lg p-2">
            <span className="text-[10px] font-sans text-slate-400 block">Margem Livre (USDT)</span>
            <span className="text-base font-bold text-slate-200">${freeMargin.toFixed(2)}</span>
          </div>
          <div className="bg-[#090D16] border border-white/10 rounded-lg p-2">
            <span className="text-[10px] font-sans text-slate-400 block">PnL Diário Realizado</span>
            <span className={cn("font-bold", dailyPnl >= 0 ? "text-[#10B981]" : "text-[#F43F5E]")}>
              {dailyPnl >= 0 ? "+" : ""}${dailyPnl.toFixed(2)}
            </span>
          </div>
          <div className="bg-[#090D16] border border-white/10 rounded-lg p-2">
            <span className="text-[10px] font-sans text-slate-400 block">PnL Não-Realizado</span>
            <span className={cn("font-bold", totalUnrealized >= 0 ? "text-[#10B981]" : "text-[#F43F5E]")}>
              {totalUnrealized >= 0 ? "+" : ""}${totalUnrealized.toFixed(2)} ({unrealizedPct >= 0 ? "+" : ""}
              {unrealizedPct.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* Barra de controle estrito de Drawdown Diário */}
        <div className="space-y-1 pt-1">
          <div className="flex justify-between text-[10px] font-mono tabular-nums">
            <span className="text-slate-400 flex items-center gap-1">
              <ShieldAlert className="w-3 h-3 text-amber-400" />
              Drawdown Diário ({maxDailyLossPct.toFixed(1)}% teto)
            </span>
            <span className={drawdownUsagePct >= 75 ? "text-[#F43F5E] font-bold" : "text-slate-300"}>
              ${dailyDrawdownUsedUsd.toFixed(2)} / ${dailyLossLimitUsd.toFixed(2)}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className={cn(
                "h-full transition-all",
                drawdownUsagePct >= 80 ? "bg-[#F43F5E]" : drawdownUsagePct >= 50 ? "bg-amber-400" : "bg-[#10B981]"
              )}
              style={{ width: `${Math.max(2, drawdownUsagePct)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Sub-abas: Posições Abertas vs Ordens Abertas */}
      <div className="flex items-center justify-between gap-2 bg-[#111827] border border-white/10 rounded-xl p-1.5">
        <button
          type="button"
          onClick={() => setSubTab("positions")}
          className={cn(
            "flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors",
            subTab === "positions" ? "bg-[#6366F1] text-white" : "text-slate-400"
          )}
        >
          Posições ({openBotPositions.length + walletPositions.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab("orders")}
          className={cn(
            "flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors",
            subTab === "orders" ? "bg-[#6366F1] text-white" : "text-slate-400"
          )}
        >
          Ordens & TWAP ({totalOpenOrdersCount})
        </button>
      </div>

      {subTab === "positions" ? (
        <div className="space-y-2">
          {openBotPositions.length === 0 && walletPositions.length === 0 ? (
            <div className="rounded-xl bg-[#111827] border border-white/10 p-6 text-center text-xs text-slate-400">
              Nenhuma posição aberta no momento.
            </div>
          ) : (
            <>
              {openBotPositions.map((bot) => {
                const pos = bot.position;
                const mark = tickers[pos.symbol]?.price || pos.currentPrice || pos.entryPrice;
                const roe = pos.entryPrice > 0 ? ((mark - pos.entryPrice) / pos.entryPrice) * 100 : 0;
                const pnlUsd = (mark - pos.entryPrice) * pos.quantity;
                const slPct = pos.dynamicStopLoss ?? bot.stopLoss ?? 1.8;
                const stopPrice = pos.isBreakEvenArmed
                  ? pos.breakEvenPrice || pos.entryPrice * 1.0015
                  : pos.entryPrice * (1 - slPct / 100);
                const distToSl = mark > 0 ? ((mark - stopPrice) / mark) * 100 : 0;
                const isBusy = busyId === bot.id;

                return (
                  <div key={bot.id} className="rounded-xl bg-[#111827] border border-white/10 p-3 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-white font-mono">{pos.symbol}</span>
                          <ExchangeBadge exchange={bot.exchange} />
                          {pos.isBreakEvenArmed && (
                            <span className="px-1.5 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] text-[9px] font-bold">
                              BE ARMADO
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {bot.name} · Qtd {pos.quantity.toFixed(5)}
                        </span>
                      </div>

                      <div className="text-right font-mono tabular-nums">
                        <div
                          className={cn(
                            "text-sm font-bold inline-flex items-center gap-0.5",
                            roe >= 0 ? "text-[#10B981]" : "text-[#F43F5E]"
                          )}
                        >
                          {roe >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          {roe >= 0 ? "+" : ""}
                          {roe.toFixed(2)}%
                        </div>
                        <div className={cn("text-[10px]", pnlUsd >= 0 ? "text-[#10B981]" : "text-[#F43F5E]")}>
                          {pnlUsd >= 0 ? "+" : ""}${pnlUsd.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-[#090D16] border border-white/10 rounded-lg p-2 text-[10px] font-mono tabular-nums">
                      <div>
                        <span className="text-slate-400 block font-sans">Entrada</span>
                        <span className="text-slate-200 font-semibold">${formatMonoPrice(pos.entryPrice)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-sans">Mark Price</span>
                        <span className="text-white font-semibold">${formatMonoPrice(mark)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block font-sans">Dist. Stop</span>
                        <span className={distToSl <= 0.5 ? "text-[#F43F5E] font-bold" : "text-amber-300 font-semibold"}>
                          {distToSl.toFixed(2)}% (${formatMonoPrice(stopPrice)})
                        </span>
                      </div>
                    </div>

                    {/* Botões rápidos na Thumb-Zone do Card */}
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleCloseBotPos(bot.id)}
                        className="py-2 px-1.5 rounded-lg bg-[#F43F5E] text-white text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="w-3 h-3 shrink-0" />
                        <span>Fechar Mkt</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          handleInvertPosition(
                            pos.symbol,
                            pos.quantity,
                            pos.entryPrice,
                            bot.exchange === "okx" ? "okx" : "binance",
                            bot.id
                          )
                        }
                        className="py-2 px-1.5 rounded-lg bg-[#090D16] border border-white/15 text-slate-200 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <ArrowLeftRight className="w-3 h-3 shrink-0 text-[#6366F1]" />
                        <span>Inverter</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy || Boolean(pos.isBreakEvenArmed)}
                        onClick={() => handleSetBreakeven(bot)}
                        className="py-2 px-1.5 rounded-lg bg-[#10B981]/20 border border-[#10B981]/40 text-[#10B981] text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Lock className="w-3 h-3 shrink-0" />
                        <span>Breakeven</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {walletPositions.map((w) => {
                const mark = tickers[w.symbol]?.price || w.marketPrice || w.avgPrice;
                const roe = w.avgPrice > 0 ? ((mark - w.avgPrice) / w.avgPrice) * 100 : 0;
                const pnlUsd = (mark - w.avgPrice) * w.quantity;
                const key = `wallet-${w.symbol}`;
                const isBusy = busyId === key;

                return (
                  <div key={w.symbol} className="rounded-xl bg-[#111827] border border-white/10 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-white font-mono">{w.symbol}</span>
                        <ExchangeBadge exchange={selectedExchange} />
                      </div>
                      <span
                        className={cn(
                          "text-xs font-mono tabular-nums font-bold",
                          pnlUsd >= 0 ? "text-[#10B981]" : "text-[#F43F5E]"
                        )}
                      >
                        {roe >= 0 ? "+" : ""}
                        {roe.toFixed(2)}% ({pnlUsd >= 0 ? "+" : ""}${pnlUsd.toFixed(2)})
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-[#090D16] border border-white/10 rounded-lg p-2 text-[10px] font-mono tabular-nums">
                      <div>
                        <span className="text-slate-400 block font-sans">Entrada</span>
                        <span className="text-slate-200">${formatMonoPrice(w.avgPrice)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-sans">Mark Price</span>
                        <span className="text-white">${formatMonoPrice(mark)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block font-sans">Qtd</span>
                        <span className="text-slate-200">{w.quantity.toFixed(5)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleCloseWalletPos(w.symbol)}
                        className="py-2 rounded-lg bg-[#F43F5E] text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                      >
                        Fechar a Mercado
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleInvertPosition(w.symbol, w.quantity, w.avgPrice, selectedExchange)}
                        className="py-2 rounded-lg bg-[#090D16] border border-white/15 text-slate-200 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                      >
                        Inverter
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Botão Cancelar Todas */}
          <button
            type="button"
            disabled={cancellingAll || (restingOrders.length === 0 && scheduledOrders.length === 0 && activeSlicedJobs.length === 0)}
            onClick={handleCancelAllOrders}
            className="w-full py-2.5 rounded-xl bg-[#F43F5E]/20 border border-[#F43F5E]/50 text-[#F43F5E] font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
          >
            <Ban className="w-3.5 h-3.5" />
            {cancellingAll ? "Cancelando ordens..." : "Cancelar Todas as Ordens Abertas"}
          </button>

          {/* Lotes TWAP / VWAP em Execução */}
          {activeSlicedJobs.map((job) => {
            const prog = job.executionProgress;
            const pct = prog && prog.totalSlices > 0 ? (prog.slicesDone / prog.totalSlices) * 100 : 0;
            return (
              <div key={job.id} className="rounded-xl bg-[#111827] border border-[#6366F1]/40 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#6366F1]" />
                    {job.name} ({job.strategy})
                  </span>
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-mono font-bold",
                      job.status === "RUNNING" ? "bg-[#10B981]/20 text-[#10B981]" : "bg-white/10 text-slate-400"
                    )}
                  >
                    {job.status}
                  </span>
                </div>
                {prog && (
                  <div className="space-y-1 font-mono tabular-nums text-[10px] text-slate-300">
                    <div className="flex justify-between">
                      <span>
                        Fatias: {prog.slicesDone}/{prog.totalSlices}
                      </span>
                      <span>
                        Exec: ${prog.executedVolume.toFixed(2)} · Rest: ${prog.remainingVolume.toFixed(2)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-[#6366F1]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Ordens Limit Resting */}
          {restingOrders.map((ord) => (
            <div
              key={`${ord.botId}-${ord.orderId}`}
              className="rounded-xl bg-[#111827] border border-white/10 p-3 flex items-center justify-between text-xs font-mono tabular-nums"
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-white">{ord.symbol}</span>
                  <ExchangeBadge exchange={ord.exchange} />
                </div>
                <span className="text-[10px] text-slate-400">
                  LIMIT_MAKER · ${formatMonoPrice(ord.price)} · Qtd {ord.quantity}
                </span>
              </div>
              <span className="text-[10px] text-[#A5B4FC]">Ativa</span>
            </div>
          ))}

          {/* Ordens Programadas */}
          {scheduledOrders.map((ord) => (
            <div
              key={ord.id}
              className="rounded-xl bg-[#111827] border border-white/10 p-3 flex items-center justify-between text-xs font-mono tabular-nums"
            >
              <div>
                <span className="font-bold text-white block">
                  {ord.side} {ord.symbol} @ ${formatMonoPrice(ord.triggerPrice)}
                </span>
                <span className="text-[10px] text-slate-400">
                  Gatilho {ord.direction === "above" ? "acima" : "abaixo"} · Qtd {ord.quantity}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeScheduledOrder(ord.id)}
                className="px-2 py-1 rounded bg-[#F43F5E]/15 text-[#F43F5E] text-[10px] font-bold cursor-pointer"
              >
                Remover
              </button>
            </div>
          ))}

          {activeSlicedJobs.length === 0 && restingOrders.length === 0 && scheduledOrders.length === 0 && (
            <div className="rounded-xl bg-[#111827] border border-white/10 p-6 text-center text-xs text-slate-400 flex flex-col items-center gap-1.5">
              <CheckCircle2 className="w-5 h-5 text-[#10B981]" />
              Nenhuma ordem aberta ou lote TWAP/VWAP pendente.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
