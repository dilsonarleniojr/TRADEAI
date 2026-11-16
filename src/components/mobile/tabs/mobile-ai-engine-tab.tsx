"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useCryptoStore, type BotStrategy } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { ensureFreshAiSignalForSymbol } from "@/lib/bot/multi-bot-engine";
import { getOrderBookAnalysis, type OrderBookAnalysis } from "@/lib/bot/order-book-cache";
import { structuredLogger } from "@/lib/telemetry/structured-logger";
import { ExchangeBadge } from "@/components/bot/exchange-badge";
import { useToast } from "@/hooks/use-toast";
import {
  computeMobileIndicators,
  computeMobileRegime,
  formatMonoPrice,
  safeParseResponseJson,
} from "../mobile-helpers";
import {
  Brain,
  Command,
  Pause,
  Play,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STRATEGIES: BotStrategy[] = ["QUANT_ENSEMBLE", "AI", "RSI", "MACD", "GRID", "BREAKOUT"];

export function MobileAiEngineTab() {
  const { toast } = useToast();
  const {
    selectedSymbol,
    tickers,
    klines,
    aiSignals,
    bots,
    protectionSettings,
    updateProtectionSettings,
    toggleAllBots,
    toggleBotActive,
    updateBot,
    pauseDeficitBots,
    runStartupConnectionTests,
    chatMessages,
    addChatMessage,
    botLogs,
  } = useCryptoStore(
    useShallow((s) => ({
      selectedSymbol: s.selectedSymbol,
      tickers: s.tickers,
      klines: s.klines,
      aiSignals: s.aiSignals,
      bots: s.bots,
      protectionSettings: s.protectionSettings,
      updateProtectionSettings: s.updateProtectionSettings,
      toggleAllBots: s.toggleAllBots,
      toggleBotActive: s.toggleBotActive,
      updateBot: s.updateBot,
      pauseDeficitBots: s.pauseDeficitBots,
      runStartupConnectionTests: s.runStartupConnectionTests,
      chatMessages: s.chatMessages,
      addChatMessage: s.addChatMessage,
      botLogs: s.botLogs,
    }))
  );

  const [refreshingSignal, setRefreshingSignal] = useState(false);
  const [bookAnalysis, setBookAnalysis] = useState<OrderBookAnalysis | null>(null);
  const [selectedBotId, setSelectedBotId] = useState<string>(bots[0]?.id || "");
  const [commandDrawerOpen, setCommandDrawerOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatSessionRef = useRef<string>(`mobile-ai-${Date.now()}`);

  useEffect(() => {
    let active = true;
    getOrderBookAnalysis(selectedSymbol)
      .then((res) => {
        if (active) setBookAnalysis(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedSymbol]);

  const indicators = useMemo(() => computeMobileIndicators(klines), [klines]);
  const regime = useMemo(() => computeMobileRegime(klines), [klines]);

  const currentSignal = useMemo(
    () => aiSignals.find((s) => s.symbol === selectedSymbol) || aiSignals[0] || null,
    [aiSignals, selectedSymbol]
  );

  const selectedBot = useMemo(
    () => bots.find((b) => b.id === selectedBotId) || bots[0] || null,
    [bots, selectedBotId]
  );

  const activeBotsCount = useMemo(() => bots.filter((b) => b.active).length, [bots]);
  const fleetRunning = activeBotsCount > 0;
  const drawdownPct = (protectionSettings?.maxDailyDrawdownPct ?? 0.03) * 100;

  // Score de confiança normalizado (0-100%)
  const confidencePct = useMemo(() => {
    if (!currentSignal) {
      // Fallback quantitativo baseado no alinhamento EMA + RSI quando IA ainda não consultada
      const aligned = indicators.ema9 >= indicators.ema21 ? 62 : 44;
      return aligned;
    }
    return Math.round(
      currentSignal.confidence <= 1 ? currentSignal.confidence * 100 : currentSignal.confidence
    );
  }, [currentSignal, indicators.ema9, indicators.ema21]);

  const recentAiLogs = useMemo(() => {
    const decisionLogs = botLogs.slice(0, 6).map((l) => ({
      id: l.id,
      time: new Date(l.timestamp).toLocaleTimeString("pt-BR"),
      text: l.message,
      type: l.type,
    }));
    if (decisionLogs.length > 0) return decisionLogs;
    return aiSignals.slice(0, 5).map((s) => ({
      id: s.id,
      time: new Date(s.createdAt).toLocaleTimeString("pt-BR"),
      text: `[IA ${s.symbol}] ${s.action} (${Math.round(s.confidence <= 1 ? s.confidence * 100 : s.confidence)}%) — ${s.reasoning}`,
      type: s.action === "BUY" ? "buy" : s.action === "SELL" ? "sell" : "info",
    }));
  }, [botLogs, aiSignals]);

  const handleRefreshAi = async () => {
    if (refreshingSignal) return;
    setRefreshingSignal(true);
    try {
      const sig = await ensureFreshAiSignalForSymbol(selectedSymbol, tickers[selectedSymbol], true);
      if (sig) {
        structuredLogger.info("SIGNALS", `[Mobile AI Brain] ${sig.symbol}: ${sig.action} (${confidencePct}%)`);
        toast({
          title: `Leitura IA: ${sig.symbol} → ${sig.action}`,
          description: sig.reasoning,
        });
      } else {
        toast({
          title: "IA sem resposta",
          description: "Verifique a chave de IA na aba Sistema ou em Ajustes.",
          variant: "destructive",
        });
      }
    } finally {
      setRefreshingSignal(false);
    }
  };

  const sendCommandOrChat = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || chatLoading) return;
    setChatInput("");
    addChatMessage({
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    });
    setChatLoading(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: chatSessionRef.current,
          message: `[Contexto TradeAI Mobile: par ${selectedSymbol}, preço $${formatMonoPrice(
            tickers[selectedSymbol]?.price ?? 0
          )}, regime ${regime.label}, RSI14=${indicators.rsi14.toFixed(1)}, frota=${activeBotsCount}/${bots.length} ativos] ${trimmed}`,
        }),
      });
      const json = await safeParseResponseJson(res);
      if (!res.ok || !json?.success) {
        throw new Error(json?.details || json?.error || `HTTP ${res.status}`);
      }
      addChatMessage({
        id: `a-${Date.now()}`,
        role: "assistant",
        content: json.response,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      addChatMessage({
        id: `e-${Date.now()}`,
        role: "assistant",
        content: `Erro ao consultar IA: ${err?.message || "Verifique sua chave API na aba Sistema."}`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setChatLoading(false);
    }
  };

  const handleQuickChip = async (chip: string) => {
    if (chip === "pausar_deficit") {
      const res = pauseDeficitBots();
      toast({
        title: "Filtro de Lucratividade",
        description:
          res.pausedCount > 0
            ? `${res.pausedCount} robô(s) deficitários pausados: ${res.pausedNames.join(", ")}`
            : "Nenhum robô deficitário ativo encontrado.",
      });
      return;
    }
    if (chip === "testar_conexoes") {
      const health = await runStartupConnectionTests();
      toast({
        title: "Conexões Verificadas",
        description: `Binance: ${health.binance.label} | OKX: ${health.okx.label} | ${health.ai.label}`,
      });
      return;
    }
    if (chip === "risco") {
      await sendCommandOrChat(
        `Faça um diagnóstico rápido de risco da minha carteira com ${bots.length} robôs e limite de drawdown de ${drawdownPct.toFixed(1)}%.`
      );
      return;
    }
    await sendCommandOrChat(
      `Analise agora o par ${selectedSymbol} com RSI=${indicators.rsi14.toFixed(1)} e diga se há setup viável com SL e TP.`
    );
  };

  return (
    <div className="space-y-2 pb-16">
      {/* Card Principal: AI Brain Widget Mobile */}
      <div className="rounded-xl bg-[#111827] border border-[#6366F1]/40 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#6366F1]/20 border border-[#6366F1]/40 flex items-center justify-center text-[#A5B4FC]">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">AI Brain · {selectedSymbol}</span>
              <span className="text-[10px] text-slate-400">
                Regime: <strong className="text-[#A5B4FC]">{regime.label}</strong>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRefreshAi}
            disabled={refreshingSignal}
            className="px-2.5 py-1.5 rounded-lg bg-[#6366F1] text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={cn("w-3 h-3", refreshingSignal && "animate-spin")} />
            <span>{refreshingSignal ? "Lendo..." : "Atualizar IA"}</span>
          </button>
        </div>

        {/* Score de Confiança + Ação */}
        <div className="grid grid-cols-12 gap-2 items-center bg-[#090D16] border border-white/10 rounded-lg p-2.5">
          <div className="col-span-5">
            <span className="text-[10px] text-slate-400 block">Confiança Modelo</span>
            <div className="text-xl font-bold font-mono tabular-nums text-white">{confidencePct}%</div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-1">
              <div className="h-full bg-[#6366F1]" style={{ width: `${Math.min(100, confidencePct)}%` }} />
            </div>
          </div>
          <div className="col-span-7 text-right space-y-0.5">
            <span
              className={cn(
                "inline-block px-2 py-0.5 rounded text-xs font-mono font-bold",
                currentSignal?.action === "BUY"
                  ? "bg-[#10B981]/20 text-[#10B981]"
                  : currentSignal?.action === "SELL"
                    ? "bg-[#F43F5E]/20 text-[#F43F5E]"
                    : "bg-[#6366F1]/20 text-[#A5B4FC]"
              )}
            >
              {currentSignal?.action || (indicators.ema9 >= indicators.ema21 ? "VIÉS COMPRA" : "NEUTRO")}
            </span>
            <p className="text-[10px] text-slate-400 line-clamp-2">
              {currentSignal?.reasoning || "Comitê quantitativo acompanhando RSI, EMAs e pressão L2 em tempo real."}
            </p>
          </div>
        </div>

        {/* Leitura Técnica Instantânea */}
        <div className="grid grid-cols-4 gap-1.5 text-[10px] font-mono tabular-nums">
          <div className="bg-[#090D16] border border-white/10 rounded-lg p-2">
            <span className="text-slate-400 block text-[9px]">RSI (14)</span>
            <span
              className={cn(
                "font-bold",
                indicators.rsi14 <= 35 ? "text-[#10B981]" : indicators.rsi14 >= 70 ? "text-[#F43F5E]" : "text-white"
              )}
            >
              {indicators.rsi14.toFixed(1)}
            </span>
          </div>
          <div className="bg-[#090D16] border border-white/10 rounded-lg p-2">
            <span className="text-slate-400 block text-[9px]">EMA 9/21</span>
            <span className={indicators.ema9 >= indicators.ema21 ? "text-[#10B981] font-bold" : "text-[#F43F5E] font-bold"}>
              {indicators.ema9 >= indicators.ema21 ? "ALTA" : "BAIXA"}
            </span>
          </div>
          <div className="bg-[#090D16] border border-white/10 rounded-lg p-2">
            <span className="text-slate-400 block text-[9px]">OFI Book</span>
            <span
              className={
                (bookAnalysis?.orderFlowImbalance ?? 0) >= 0 ? "text-[#10B981] font-bold" : "text-[#F43F5E] font-bold"
              }
            >
              {bookAnalysis ? `${bookAnalysis.buyerPercent}% C` : "—"}
            </span>
          </div>
          <div className="bg-[#090D16] border border-white/10 rounded-lg p-2">
            <span className="text-slate-400 block text-[9px]">Spread</span>
            <span className="text-white font-bold">
              {bookAnalysis ? `${bookAnalysis.spreadPercent.toFixed(2)}%` : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Controles de Risco & Estratégia */}
      <div className="rounded-xl bg-[#111827] border border-white/10 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-[#10B981]" />
            Parâmetros de Risco & Frota
          </span>
          <span className="text-[11px] font-mono tabular-nums text-slate-300">
            {activeBotsCount}/{bots.length} ativos
          </span>
        </div>

        {/* Max Drawdown Diário */}
        <div className="space-y-1 bg-[#090D16] border border-white/10 rounded-lg p-2.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-400">Max Drawdown Diário</span>
            <span className="font-mono tabular-nums font-bold text-[#F43F5E]">{drawdownPct.toFixed(1)}% NAV</span>
          </div>
          <input
            type="range"
            min="1.0"
            max="5.0"
            step="0.5"
            value={drawdownPct}
            onChange={(e) =>
              updateProtectionSettings({ maxDailyDrawdownPct: parseFloat(e.target.value) / 100 })
            }
            className="w-full accent-[#6366F1] cursor-pointer"
          />
        </div>

        {/* Ajuste rápido do Robô Selecionado */}
        {selectedBot ? (
          <div className="bg-[#090D16] border border-white/10 rounded-lg p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <select
                value={selectedBot.id}
                onChange={(e) => setSelectedBotId(e.target.value)}
                className="flex-1 bg-[#111827] border border-white/10 rounded px-2 py-1 text-xs font-semibold text-white truncate"
              >
                {bots.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({(b.exchange || "binance").toUpperCase()})
                  </option>
                ))}
              </select>
              <ExchangeBadge exchange={selectedBot.exchange} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Estratégia</label>
                <select
                  value={selectedBot.strategy}
                  onChange={(e) => updateBot(selectedBot.id, { strategy: e.target.value })}
                  className="w-full bg-[#111827] border border-white/10 rounded px-2 py-1 text-[11px] font-mono text-white"
                >
                  {STRATEGIES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Posição Máx (USDT)</label>
                <div className="flex items-center gap-1">
                  {[25, 50, 100].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => updateBot(selectedBot.id, { allocationAmount: val })}
                      className={cn(
                        "flex-1 py-1 rounded text-[10px] font-mono font-bold border cursor-pointer",
                        selectedBot.allocationAmount === val
                          ? "border-[#6366F1] bg-[#6366F1]/20 text-white"
                          : "border-white/10 bg-[#111827] text-slate-400"
                      )}
                    >
                      ${val}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 text-center py-2">
            Nenhum robô criado na frota ainda.
          </p>
        )}

        {/* Lista Compacta dos Robôs com Corretora */}
        {bots.length > 0 && (
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {bots.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#090D16] border border-white/10"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-white truncate">{b.name}</span>
                    <ExchangeBadge exchange={b.exchange} />
                  </div>
                  <span className="text-[10px] font-mono tabular-nums text-slate-400">
                    {b.symbol} · {b.strategy} · ${b.allocationAmount}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleBotActive(b.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase cursor-pointer shrink-0",
                    b.active ? "bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40" : "bg-white/5 text-slate-400 border border-white/10"
                  )}
                >
                  {b.active ? "Ativo" : "Pausado"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log de Decisões Recentes */}
      <div className="rounded-xl bg-[#111827] border border-white/10 p-3 space-y-1.5">
        <span className="text-xs font-bold text-white flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#6366F1]" />
          Decisões Recentes da IA & Motores
        </span>
        <div className="space-y-1 max-h-36 overflow-y-auto">
          {recentAiLogs.length === 0 ? (
            <p className="text-[11px] text-slate-500">Nenhuma decisão registrada ainda.</p>
          ) : (
            recentAiLogs.map((entry) => (
              <div key={entry.id} className="text-[11px] bg-[#090D16] border border-white/5 rounded px-2 py-1">
                <span className="font-mono text-[10px] text-slate-500 mr-1.5">{entry.time}</span>
                <span className="text-slate-300">{entry.text}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Thumb-Zone: Toggle Grande Bot (Espaço) + Comando Rápido IA (Ctrl+K) */}
      <div className="fixed bottom-16 left-0 right-0 z-30 px-3 pb-2 pointer-events-none">
        <div className="max-w-md mx-auto pointer-events-auto rounded-xl bg-[#111827]/95 backdrop-blur-md border border-white/15 p-2 shadow-2xl flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleAllBots(!fleetRunning)}
            className={cn(
              "flex-1 py-2.5 px-3 rounded-lg font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-transform",
              fleetRunning ? "bg-amber-500 text-black" : "bg-[#10B981] text-[#052E1E]"
            )}
          >
            {fleetRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {fleetRunning ? `Pausar Frota (${activeBotsCount})` : "Iniciar Frota"}
          </button>

          <button
            type="button"
            onClick={() => setCommandDrawerOpen(true)}
            className="px-3 py-2.5 rounded-lg bg-[#6366F1] text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform shrink-0"
          >
            <Command className="w-3.5 h-3.5" />
            <span>IA Chat</span>
          </button>
        </div>
      </div>

      {/* Gaveta Comando / Chat IA (Ctrl+K Mobile) */}
      {commandDrawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/75 backdrop-blur-xs">
          <div className="bg-[#111827] border-t border-white/15 rounded-t-2xl p-4 pb-6 safe-bottom max-w-md w-full mx-auto flex flex-col max-h-[82vh] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#6366F1]" />
                <span className="text-sm font-bold text-white">Comando & Chat IA (Ctrl+K)</span>
              </div>
              <button
                type="button"
                onClick={() => setCommandDrawerOpen(false)}
                className="p-1.5 rounded-lg bg-[#090D16] text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Comandos rápidos em pílulas */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "analise", label: `Analisar ${selectedSymbol}` },
                { id: "risco", label: "Diagnosticar Risco" },
                { id: "pausar_deficit", label: "Pausar Deficitários" },
                { id: "testar_conexoes", label: "Testar Binance/OKX/IA" },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleQuickChip(c.id)}
                  className="px-2.5 py-1 rounded-full bg-[#090D16] border border-white/10 text-[11px] font-medium text-[#A5B4FC] hover:border-[#6366F1] cursor-pointer"
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Histórico de mensagens */}
            <div className="flex-1 overflow-y-auto space-y-2 bg-[#090D16] border border-white/10 rounded-xl p-2.5 min-h-[180px]">
              {chatMessages.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">
                  Envie uma instrução ou selecione um comando rápido acima.
                </p>
              ) : (
                chatMessages.slice(-12).map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-lg p-2 text-xs whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-[#6366F1]/20 border border-[#6366F1]/40 text-white ml-6"
                        : "bg-[#111827] border border-white/10 text-slate-200 mr-4"
                    )}
                  >
                    {m.content}
                  </div>
                ))
              )}
              {chatLoading && (
                <div className="text-[11px] font-mono text-[#A5B4FC] animate-pulse">
                  Processando resposta da IA...
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendCommandOrChat(chatInput);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Pergunte sobre mercado, stop, ou estratégia..."
                className="flex-1 rounded-xl bg-[#090D16] border border-white/15 px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#6366F1]"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="p-2.5 rounded-xl bg-[#6366F1] text-white disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
