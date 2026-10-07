"use client";

import { useState } from "react";
import { useCryptoStore, AISignalData, BotStrategy } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Brain,
  Sparkles,
  Zap,
  CheckCircle2,
  XCircle,
  Bot,
  ShieldAlert,
  Target,
  ArrowRight,
  Loader2,
  DollarSign,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { AIBrainActivityWidget } from "@/components/ai/ai-brain-activity-widget";

function getActionColor(action: AISignalData["action"]) {
  switch (action) {
    case "BUY":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "SELL":
      return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    case "HOLD":
      return "bg-zinc-500/15 text-zinc-300 border-zinc-500/30";
  }
}

function getConfidenceBarColor(action: AISignalData["action"]) {
  switch (action) {
    case "BUY":
      return "bg-emerald-500";
    case "SELL":
      return "bg-rose-500";
    case "HOLD":
      return "bg-zinc-500";
  }
}

function getConfidenceBars(confidence: number) {
  const filled = Math.round(confidence * 5);
  return Array.from({ length: 5 }, (_, i) => i < filled);
}

function isExecutableSignal(signal: AISignalData): boolean {
  return (signal.action === "BUY" || signal.action === "SELL") && !signal.vetoed && !signal.agent_error;
}

function getQuantityDecimals(price: number): number {
  if (price > 1000) return 6;
  if (price > 1) return 4;
  if (price < 0.01) return 0;
  return 2;
}

export function AISignals() {
  const {
    aiSignals,
    botConfig,
    botActive,
    trades,
    tickers,
    tradingMode,
    portfolio,
    addTrade,
    setAccount,
    addBot,
    updateBot,
    addBotLog,
    bots,
    setSelectedBotId,
    setSelectedSymbol,
    setActiveSection,
  } = useCryptoStore(
    useShallow((s) => ({
      aiSignals: s.aiSignals,
      botConfig: s.botConfig,
      botActive: s.botActive,
      trades: s.trades,
      tickers: s.tickers,
      tradingMode: s.tradingMode,
      portfolio: s.portfolio,
      addTrade: s.addTrade,
      setAccount: s.setAccount,
      addBot: s.addBot,
      updateBot: s.updateBot,
      addBotLog: s.addBotLog,
      bots: s.bots,
      setSelectedBotId: s.setSelectedBotId,
      setSelectedSymbol: s.setSelectedSymbol,
      setActiveSection: s.setActiveSection,
    }))
  );

  const { toast } = useToast();

  // Modal / Signal execution state
  const [selectedSignal, setSelectedSignal] = useState<AISignalData | null>(null);
  const [usdtAmount, setUsdtAmount] = useState<string>("25");
  const [quantity, setQuantity] = useState<string>("");
  const [linkBot, setLinkBot] = useState<boolean>(true);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);

  // Determine which signals have had trades executed via auto-trade
  const executedSignalSymbols = new Set<string>();
  if (botActive && botConfig.autoTradeSignals) {
    const threshold = botConfig.signalConfidenceThreshold / 100;
    for (const signal of aiSignals) {
      if (signal.action === "HOLD") continue;
      if (signal.confidence < threshold) continue;
      const hasTrade = trades.some(
        (t) =>
          t.strategy === "AI-Signal" &&
          t.symbol === signal.symbol &&
          Math.abs(new Date(t.timestamp).getTime() - new Date(signal.createdAt).getTime()) < 120000
      );
      if (hasTrade) {
        executedSignalSymbols.add(signal.id);
      }
    }
  }

  // Abre o sinal selecionado com valores automaticamente preenchidos
  const handleOpenSignal = (signal: AISignalData) => {
    setSelectedSignal(signal);
    const cleanSym = signal.symbol.endsWith("USDT") ? signal.symbol : `${signal.symbol}USDT`;
    const curPrice =
      tickers[cleanSym]?.price ||
      tickers[signal.symbol]?.price ||
      signal.priceAtSignal ||
      1;

    const defaultUsdt = "25";
    setUsdtAmount(defaultUsdt);
    const decimals = getQuantityDecimals(curPrice);
    setQuantity((parseFloat(defaultUsdt) / curPrice).toFixed(decimals));
    setLinkBot(true);
  };

  const handleUsdtChange = (val: string) => {
    setUsdtAmount(val);
    const num = parseFloat(val);
    if (!selectedSignal) return;
    const cleanSym = selectedSignal.symbol.endsWith("USDT")
      ? selectedSignal.symbol
      : `${selectedSignal.symbol}USDT`;
    const curPrice =
      tickers[cleanSym]?.price ||
      tickers[selectedSignal.symbol]?.price ||
      selectedSignal.priceAtSignal ||
      1;

    if (!isNaN(num) && num > 0 && curPrice > 0) {
      const decimals = getQuantityDecimals(curPrice);
      setQuantity((num / curPrice).toFixed(decimals));
    } else {
      setQuantity("");
    }
  };

  const handlePresetUsdt = (val: number) => {
    handleUsdtChange(val.toString());
  };

  // Executa o sinal preenchido quando o usuário clica em OK
  const handleConfirmTrade = async () => {
    if (!selectedSignal) return;
    // HOLD, vetos e falhas do agente nunca viram ordem (antes, HOLD caía no lado BUY).
    if (!isExecutableSignal(selectedSignal)) {
      toast({
        title: "Sinal não executável",
        description: selectedSignal.agent_error
          ? "O motor de IA falhou e o sinal foi bloqueado."
          : "Sinais HOLD ou vetados pelo gatekeeper não geram ordens.",
        variant: "destructive",
      });
      return;
    }
    setIsExecuting(true);

    const cleanSym = selectedSignal.symbol.endsWith("USDT")
      ? selectedSignal.symbol
      : `${selectedSignal.symbol}USDT`;
    const baseSym = cleanSym.replace("USDT", "");
    const curPrice =
      tickers[cleanSym]?.price ||
      tickers[selectedSignal.symbol]?.price ||
      selectedSignal.priceAtSignal ||
      1;

    const total = parseFloat(usdtAmount) || 25;
    const qty = parseFloat(quantity) || (curPrice > 0 ? total / curPrice : 0);

    if (tradingMode === "live" && total < 5.0) {
      toast({
        title: "Valor Mínimo da Ordem",
        description: `A Binance exige um valor mínimo de $5.00 USDT por ordem no mercado Spot. O valor atual é $${total.toFixed(2)} USDT.`,
        variant: "destructive",
      });
      setIsExecuting(false);
      return;
    }

    try {
      const side = selectedSignal.action === "SELL" ? "SELL" : "BUY";
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: cleanSym,
          side,
          price: curPrice,
          quantity: qty,
          total,
          strategy: "AI-Signal",
          mode: tradingMode,
          slippageTolerance: 2.0,
          pnl: 0,
        }),
      });

      const result = await res.json();
      if (result.success) {
        addTrade({
          id: result.data.id,
          symbol: result.data.symbol,
          side: result.data.side,
          price: result.data.price,
          quantity: result.data.quantity,
          total: result.data.total,
          strategy: result.data.strategy || "AI-Signal",
          mode: result.data.mode || tradingMode,
          pnl: result.data.pnl || 0,
          timestamp: result.data.timestamp || new Date().toISOString(),
        });

        if (result.account) {
          setAccount(result.account);
        }

        // Calcula percentuais de TP e SL para o robô com Assimetria Positiva Estrita
        let slPct =
          selectedSignal.stopLoss > 0
            ? Math.abs(((curPrice - selectedSignal.stopLoss) / curPrice) * 100)
            : 2.0;
        // Piso de proteção contra ruído de book da Binance (mínimo 1.8%, máximo 3.0%)
        slPct = Math.max(1.8, Math.min(3.0, slPct));

        let tpPct =
          selectedSignal.takeProfit > 0
            ? Math.abs(((selectedSignal.takeProfit - curPrice) / curPrice) * 100)
            : 5.0;
        // Risco/Retorno mínimo de 2.2:1
        if (tpPct < slPct * 2.2) {
          tpPct = Number((slPct * 2.25).toFixed(2));
        }

        const trailDist = Math.max(1.2, Number((slPct * 0.55).toFixed(1)));
        const beTrigger = Math.max(2.0, Number((tpPct * 0.45).toFixed(1)));

        if (linkBot) {
          const existingBot = bots.find(
            (b) => b.symbol === cleanSym || b.symbol === baseSym
          );
          const botName = `Bot ${baseSym} (Sinal IA)`;
          const commonParams = {
            name: botName,
            symbol: cleanSym,
            strategy: "AI" as BotStrategy,
            active: true,
            takeProfit: parseFloat(tpPct.toFixed(1)),
            stopLoss: parseFloat(slPct.toFixed(1)),
            trailingStop: true,
            trailingStopDistance: trailDist,
            autoBreakEven: true,
            breakEvenTrigger: beTrigger,
            breakEvenBuffer: 0.60,
            allocationAmount: total,
            autoTradeSignals: true,
            useMarketRegime: true,
            useMultiTimeframe: true,
          };

          let targetBotId: string;
          if (existingBot) {
            targetBotId = existingBot.id;
            updateBot(existingBot.id, {
              ...commonParams,
              status: "in_position",
              stats: {
                ...existingBot.stats,
                lastAction: `Vinculado via Sinal Rápido IA: Alvo +${tpPct.toFixed(1)}%, Stop -${slPct.toFixed(1)}%`,
                lastActionTime: new Date().toISOString(),
              },
            });
          } else {
            targetBotId = addBot({
              ...commonParams,
              status: "in_position",
            });
          }

          addBotLog({
            botId: targetBotId,
            botName,
            message: `Robô ${baseSym} ativado pelo sinal IA (${selectedSignal.action}): Alvo +${tpPct.toFixed(1)}%, Stop -${slPct.toFixed(1)}%, Posição $${total.toFixed(2)} USDT`,
            type: selectedSignal.action === "BUY" ? "buy" : "sell",
          });

          setSelectedBotId(targetBotId);
        }

        toast({
          title: "✅ Ordem Executada com Sucesso!",
          description: `${side === "BUY" ? "Compra" : "Venda"} de ${qty.toFixed(4)} ${baseSym} por $${total.toFixed(2)} USDT realizada com sucesso via Sinal de IA.`,
        });

        setSelectedSignal(null);
      } else {
        toast({
          title: "Falha na Execução",
          description: result.error || "Não foi possível executar a ordem do sinal.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de Conexão",
        description: err.message || "Erro ao comunicar com o servidor.",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // Cálculos dinâmicos para a modal do sinal selecionado
  const selectedCleanSym = selectedSignal
    ? selectedSignal.symbol.endsWith("USDT")
      ? selectedSignal.symbol
      : `${selectedSignal.symbol}USDT`
    : "";
  const selectedBaseSym = selectedCleanSym.replace("USDT", "");
  const selectedCurPrice = selectedSignal
    ? tickers[selectedCleanSym]?.price ||
      tickers[selectedSignal.symbol]?.price ||
      selectedSignal.priceAtSignal ||
      1
    : 1;

  const currentSlPct =
    selectedSignal && selectedSignal.stopLoss > 0 && selectedCurPrice > 0
      ? Math.abs(((selectedCurPrice - selectedSignal.stopLoss) / selectedCurPrice) * 100)
      : 0;

  const currentTpPct =
    selectedSignal && selectedSignal.takeProfit > 0 && selectedCurPrice > 0
      ? Math.abs(((selectedSignal.takeProfit - selectedCurPrice) / selectedCurPrice) * 100)
      : 0;

  const riskRewardRatio =
    currentSlPct > 0 ? (currentTpPct / currentSlPct).toFixed(1) : "2.0";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.4 }}
    >
      <Card className="bg-card/60 backdrop-blur-md gradient-border h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-crypto-cyan" />
              Sinais Rápidos da IA
            </span>
            <span className="text-[10px] text-muted-foreground font-normal">
              Clique no sinal para preencher e executar
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {aiSignals.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon bg-crypto-cyan/10">
                <Sparkles className="w-6 h-6 text-crypto-cyan/60" />
              </div>
              <p className="empty-state-title">Nenhum sinal ainda</p>
              <p className="empty-state-desc">
                Sinais da IA aparecerão aqui conforme padrões de mercado são detectados
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
              {aiSignals.slice(0, 8).map((signal) => {
                const isPositive = signal.action === "BUY";
                const isNegative = signal.action === "SELL";
                const borderColor = isPositive
                  ? "border-l-crypto-green"
                  : isNegative
                  ? "border-l-crypto-red"
                  : "border-l-amber-400";

                return (
                  <div
                    key={signal.id}
                    onClick={() => handleOpenSignal(signal)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        handleOpenSignal(signal);
                      }
                    }}
                    className={cn(
                      "group flex items-center justify-between p-2.5 rounded-lg border-l-2 transition-all cursor-pointer hover:bg-secondary/60 hover:border-crypto-cyan/60 hover:shadow-md active:scale-[0.99] focus:outline-none focus:ring-1 focus:ring-crypto-cyan",
                      borderColor,
                      executedSignalSymbols.has(signal.id) && "ring-1 ring-crypto-cyan/30"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 shrink-0",
                          getActionColor(signal.action)
                        )}
                      >
                        {signal.action}
                      </Badge>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-xs font-semibold cursor-pointer hover:text-crypto-cyan hover:underline transition-colors"
                            title={`Abrir gráfico de ${signal.symbol}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const clean = signal.symbol.endsWith("USDT") ? signal.symbol : `${signal.symbol}USDT`;
                              setSelectedSymbol(clean);
                              setActiveSection("chart");
                            }}
                          >
                            {signal.symbol.replace("USDT", "")}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            @ ${formatPrice(signal.priceAtSignal)}
                          </span>
                          {signal.risk_reward_ratio !== undefined && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[9px] font-mono px-1 py-0",
                                (signal.risk_reward_ratio ?? 0) >= 2.0
                                  ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                                  : "border-rose-500/30 text-rose-400 bg-rose-500/10"
                              )}
                            >
                              {signal.risk_reward_ratio.toFixed(1)}:1 R:R
                            </Badge>
                          )}
                          {signal.vetoed && (
                            <Badge variant="outline" className="text-[9px] font-bold px-1 py-0 border-rose-500/40 text-rose-400 bg-rose-500/15">
                              VETADO
                            </Badge>
                          )}
                        </div>
                        {(signal.key_driver || signal.reasoning) && (
                          <p className="text-[10px] text-muted-foreground/90 font-medium truncate max-w-[240px] mt-0.5">
                            🎯 {signal.key_driver || signal.reasoning}
                          </p>
                        )}
                        {(signal.stopLoss > 0 || signal.takeProfit > 0) && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-rose-400 flex items-center gap-0.5 font-mono">
                              🛑 SL: ${formatPrice(signal.stopLoss)}
                            </span>
                            <span className="text-[9px] text-emerald-400 flex items-center gap-0.5 font-mono">
                              ✅ TP: ${formatPrice(signal.takeProfit)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {executedSignalSymbols.has(signal.id) && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 25 }}
                        >
                          <Badge className="text-[8px] px-1 py-0 bg-crypto-cyan/20 text-crypto-cyan border-crypto-cyan/30 gap-0.5">
                            <Zap className="w-2.5 h-2.5" />
                            Executado
                          </Badge>
                        </motion.div>
                      )}
                      <div className="flex items-center gap-0.5">
                        {getConfidenceBars(signal.confidence).map((filled, i) => (
                          <div
                            key={i}
                            className={cn(
                              "w-1 h-3 rounded-full relative overflow-hidden",
                              filled
                                ? getConfidenceBarColor(signal.action)
                               : "bg-secondary"
                            )}
                          >
                            {filled && i === Math.round(signal.confidence * 5) - 1 && (
                              <div className="absolute inset-0 shimmer" />
                            )}
                          </div>
                        ))}
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-crypto-cyan group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal / Dialog de Confirmação do Sinal Preenchido */}
      <Dialog
        open={!!selectedSignal}
        onOpenChange={(open) => {
          if (!open) setSelectedSignal(null);
        }}
      >
        <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border border-border/60 shadow-2xl">
          {selectedSignal && (
            <>
              <DialogHeader className="pb-2 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-crypto-cyan/15 text-crypto-cyan">
                      <Brain className="w-5 h-5" />
                    </div>
                    <div>
                      <DialogTitle className="text-base font-bold flex items-center gap-2">
                        <span>Sinal da IA Preenchido</span>
                        <Badge
                          className={cn(
                            "text-[10px] font-bold px-1.5 py-0",
                            getActionColor(selectedSignal.action)
                          )}
                        >
                          {selectedSignal.action}
                        </Badge>
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground">
                        {selectedBaseSym}/USDT &bull; Revise os valores preenchidos e clique em OK.
                      </DialogDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono border-crypto-cyan/30 text-crypto-cyan">
                    {Math.round(selectedSignal.confidence * 100)}% Confiança
                  </Badge>
                </div>
              </DialogHeader>

              <div className="space-y-3.5 py-2 text-xs">
                {/* Banner de Travamento Sistêmico (Risk Gatekeeper) */}
                {selectedSignal.vetoed && (
                  <div className="rounded-lg border border-rose-500/40 bg-rose-500/15 p-3 flex items-start gap-2.5">
                    <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-rose-300">
                        Operação vetada pela matriz de risco: Assimetria desfavorável
                      </p>
                      <p className="text-[11px] text-rose-200/80 mt-0.5">
                        Relação R:R ({selectedSignal.risk_reward_ratio?.toFixed(2) ?? riskRewardRatio}) inferior ao limite de 2.0. Status forçado autonomamente para HOLD.
                      </p>
                    </div>
                  </div>
                )}

                {/* Parâmetros do Sinal Calculados */}
                <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-secondary/30 border border-border/40">
                  <div>
                    <span className="text-[10px] text-muted-foreground block font-medium">Preço Atual (Mercado)</span>
                    <span className="text-sm font-bold text-foreground font-mono">
                      ${formatPrice(selectedCurPrice)}
                    </span>
                    {selectedSignal.priceAtSignal !== selectedCurPrice && (
                      <span className="text-[9px] text-muted-foreground block">
                        Sinal a ${formatPrice(selectedSignal.priceAtSignal)}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block font-medium">Relação Risco / Retorno (R:R)</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-black text-foreground font-mono">
                        {selectedSignal.risk_reward_ratio ? selectedSignal.risk_reward_ratio.toFixed(2) : riskRewardRatio}:1
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] font-bold px-1 py-0",
                          (selectedSignal.risk_reward_ratio ?? parseFloat(riskRewardRatio)) >= 2.0
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                        )}
                      >
                        {(selectedSignal.risk_reward_ratio ?? parseFloat(riskRewardRatio)) >= 2.0 ? "≥ 2.0 OK" : "< 2.0 Veto"}
                      </Badge>
                    </div>
                  </div>
                  <div className="pt-1.5 border-t border-border/30">
                    <span className="text-[10px] text-rose-400 flex items-center gap-1 font-bold uppercase tracking-wider">
                      <ShieldAlert className="w-3 h-3" /> Stop Loss
                    </span>
                    <span className="text-xs font-bold text-rose-400 font-mono">
                      ${formatPrice(selectedSignal.stopLoss)}
                      {currentSlPct > 0 && (
                        <span className="text-[10px] ml-1 opacity-80">
                          (-{currentSlPct.toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="pt-1.5 border-t border-border/30">
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-bold uppercase tracking-wider">
                      <Target className="w-3 h-3" /> Take Profit
                    </span>
                    <span className="text-xs font-bold text-emerald-400 font-mono">
                      ${formatPrice(selectedSignal.takeProfit)}
                      {currentTpPct > 0 && (
                        <span className="text-[10px] ml-1 opacity-80">
                          (+{currentTpPct.toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Telemetria do agente: ferramentas usadas e status de cada uma */}
                <AIBrainActivityWidget
                  action={selectedSignal.action}
                  vetoed={selectedSignal.vetoed}
                  agent_error={selectedSignal.agent_error}
                  error_reason={selectedSignal.error_reason}
                  agent_telemetry={selectedSignal.agent_telemetry}
                />

                {/* Gatilho e Ameaça (Pills Rápidos - Sem Textos Livres) */}
                <div className="grid grid-cols-1 gap-1.5">
                  <div className="p-2 rounded-md bg-crypto-cyan/10 border border-crypto-cyan/20 flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-crypto-cyan shrink-0" />
                    <span className="text-[10px] text-crypto-cyan font-bold uppercase tracking-wider shrink-0">
                      Gatilho:
                    </span>
                    <span className="text-xs font-semibold text-foreground truncate">
                      {selectedSignal.key_driver || selectedSignal.reasoning}
                    </span>
                  </div>

                  {selectedSignal.risk_warning && (
                    <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider shrink-0">
                        Ameaça:
                      </span>
                      <span className="text-xs font-semibold text-foreground truncate">
                        {selectedSignal.risk_warning}
                      </span>
                    </div>
                  )}
                </div>

                {/* Métricas de Microestrutura e Fluxo Injetadas */}
                {selectedSignal.flow_context && (
                  <div className="flex flex-wrap items-center justify-between gap-1.5 p-2 rounded-md bg-secondary/30 border border-border/30 text-[10px] font-mono text-muted-foreground">
                    {selectedSignal.flow_context.vwap !== undefined && (
                      <span>VWAP: ${formatPrice(selectedSignal.flow_context.vwap)} ({selectedSignal.flow_context.vwap_distance_percent ? (selectedSignal.flow_context.vwap_distance_percent >= 0 ? `+${selectedSignal.flow_context.vwap_distance_percent}%` : `${selectedSignal.flow_context.vwap_distance_percent}%`) : '0%'})</span>
                    )}
                    {selectedSignal.flow_context.order_flow_imbalance !== undefined && (
                      <span>OFI: {selectedSignal.flow_context.order_flow_imbalance >= 0 ? `+${selectedSignal.flow_context.order_flow_imbalance}` : selectedSignal.flow_context.order_flow_imbalance}</span>
                    )}
                    {selectedSignal.flow_context.funding_rate_percent !== undefined && (
                      <span>Funding: {selectedSignal.flow_context.funding_rate_percent >= 0 ? `+${selectedSignal.flow_context.funding_rate_percent}%` : `${selectedSignal.flow_context.funding_rate_percent}%`}</span>
                    )}
                  </div>
                )}

                {/* Campos da Ordem (Preenchidos Automaticamente) */}
                <div className="space-y-2.5 p-3 rounded-lg bg-card border border-border/50">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="signal-usdt" className="text-xs font-semibold flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-crypto-cyan" />
                      Valor da Ordem (USDT)
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      Disponível: ${(portfolio?.cashBalance || 0).toFixed(2)} USDT
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="signal-usdt"
                      type="number"
                      step="any"
                      min="5"
                      value={usdtAmount}
                      onChange={(e) => handleUsdtChange(e.target.value)}
                      className="font-mono text-sm bg-secondary/50 h-9"
                      placeholder="25"
                    />
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handlePresetUsdt(25)}
                        className="h-9 px-2 text-[10px]"
                      >
                        $25
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handlePresetUsdt(50)}
                        className="h-9 px-2 text-[10px]"
                      >
                        $50
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handlePresetUsdt(100)}
                        className="h-9 px-2 text-[10px]"
                      >
                        $100
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-muted-foreground">Quantidade Calculada:</span>
                    <span className="text-xs font-mono font-bold text-foreground">
                      {quantity || "0"} {selectedBaseSym}
                    </span>
                  </div>
                </div>

                {/* Opção de vincular ao Robô */}
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-secondary/20 border border-border/30">
                  <Checkbox
                    id="link-bot-check"
                    checked={linkBot}
                    onCheckedChange={(checked) => setLinkBot(Boolean(checked))}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5 leading-none cursor-pointer" onClick={() => setLinkBot(!linkBot)}>
                    <Label
                      htmlFor="link-bot-check"
                      className="text-xs font-semibold cursor-pointer flex items-center gap-1 text-foreground"
                    >
                      <Bot className="w-3.5 h-3.5 text-crypto-cyan" />
                      Vincular e monitorar com Robô Automático
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      O robô acompanhará esta posição e executará o Take Profit (+{currentTpPct.toFixed(1)}%) ou Stop Loss (-{currentSlPct.toFixed(1)}%) automaticamente.
                    </p>
                  </div>
                </div>
              </div>

              {/* Botões CANCELAR e OK */}
              <DialogFooter className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedSignal(null)}
                  disabled={isExecuting}
                  className="px-4 text-xs h-9 flex items-center gap-1 hover:bg-secondary/60"
                >
                  <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                  CANCELAR
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmTrade}
                  disabled={isExecuting || !quantity || parseFloat(usdtAmount) <= 0 || !isExecutableSignal(selectedSignal)}
                  className={cn(
                    "px-5 text-xs h-9 font-semibold flex items-center gap-1.5 shadow-lg",
                    selectedSignal.action === "SELL"
                      ? "bg-crypto-red hover:bg-crypto-red/90 text-white"
                      : "bg-crypto-green hover:bg-crypto-green/90 text-black"
                  )}
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Executando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      OK
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
