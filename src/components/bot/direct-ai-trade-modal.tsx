"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import {
  Zap,
  Clock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Sparkles,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Layers,
  ArrowUpRight,
  Target,
  Shield,
  Activity,
  Award,
  Radio,
  Crosshair,
  Ban,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";

export interface DirectAiTradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ModalState = "CONFIG" | "SCANNING" | "WAITING_TRIGGER" | "ACTIVE" | "RESULT";

const AMOUNT_PRESETS = [15, 25, 50, 70];
const DURATION_PRESETS = [
  { label: "1 min", value: 1, desc: "Turbo Scalp" },
  { label: "3 min", value: 3, desc: "Micro Scalp" },
  { label: "5 min", value: 5, desc: "Scalp Pro" },
  { label: "15 min", value: 15, desc: "Day Trade" },
  { label: "30 min", value: 30, desc: "Intraday" },
];

const STRATEGIES = [
  {
    id: "AUTO",
    name: "IA Autônoma (Recomendado)",
    desc: "A IA analisa o regime do ativo, escolhe a estratégia e espera o gatilho ótimo",
    icon: Sparkles,
  },
  {
    id: "CONFLUENCE",
    name: "Confluência Máxima",
    desc: "ADX > 20 + ATR Dinâmico + Livro de Ofertas L2",
    icon: Target,
  },
  {
    id: "MOMENTUM",
    name: "Momentum Breakout",
    desc: "Rompimento de volume e fluxo comprador agressivo",
    icon: Zap,
  },
  {
    id: "MEAN_REVERSION",
    name: "Reversão à Média",
    desc: "Exaustão estatística em Bollinger Bands + RSI",
    icon: Activity,
  },
];

export function DirectAiTradeModal({ open, onOpenChange }: DirectAiTradeModalProps) {
  const { toast } = useToast();
  const { tradingMode, binanceTestnet, portfolio, setAccount } = useCryptoStore(
    useShallow((s) => ({
      tradingMode: s.tradingMode,
      binanceTestnet: s.binanceTestnet,
      portfolio: s.portfolio,
      setAccount: s.setAccount,
    }))
  );

  const [state, setState] = useState<ModalState>("CONFIG");
  const [amount, setAmount] = useState<number>(25);
  const [durationMinutes, setDurationMinutes] = useState<number>(5);
  const [strategy, setStrategy] = useState<string>("AUTO");
  const [scanStep, setScanStep] = useState<string>("");
  const [session, setSession] = useState<any | null>(null);
  const [timeRemainingSec, setTimeRemainingSec] = useState<number>(0);
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [isActionPending, setIsActionPending] = useState<boolean>(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const isReal = tradingMode === "live" && !binanceTestnet;

  // Limpeza de timers ao desmontar ou fechar
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Polling e Timer reativos
  useEffect(() => {
    if (!session?.id) return;

    if (state === "WAITING_TRIGGER") {
      // Polling contínuo do Radar Sniper a cada 1.5s
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/bot/direct-operation?id=${session.id}`);
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) {
              setSession(json.data);
              if (json.data.status === "ACTIVE") {
                setState("ACTIVE");
                toast({
                  title: `⚡ Gatilho Atingido: ${json.data.symbol}!`,
                  description: `Ordem executada a $${json.data.entryPrice}. O cronômetro foi iniciado.`,
                });
              } else if (json.data.status === "CLOSED" || json.data.status === "CANCELLED") {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                setState("RESULT");
              }
            }
          }
        } catch (e) {
          console.warn("[DirectTradeModal] Polling radar error:", e);
        }
      }, 1500);

      return () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      };
    }

    if (state === "ACTIVE" && session?.endTime) {
      const updateTimer = () => {
        const remaining = Math.max(0, Math.floor((session.endTime - Date.now()) / 1000));
        setTimeRemainingSec(remaining);
        if (remaining <= 0) {
          handleCloseSession("TIME_EXPIRED");
        }
      };

      updateTimer();
      timerIntervalRef.current = setInterval(updateTimer, 1000);

      // Polling de preço ao vivo a cada 1.5s
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/bot/direct-operation?id=${session.id}`);
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) {
              setSession(json.data);
              if (json.data.status === "CLOSED") {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
                setState("RESULT");
              }
            }
          }
        } catch (e) {
          console.warn("[DirectTradeModal] Falha temporária no polling de status:", e);
        }
      }, 1500);

      return () => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      };
    }
  }, [state, session?.id, session?.endTime]);

  const handleStartOperation = async () => {
    setState("SCANNING");
    setScanStep("Sincronizando relógio com a Binance e resetando travas...");

    try {
      await new Promise((r) => setTimeout(r, 600));
      setScanStep("Analisando liquidez, spread bid-ask e regime de volatilidade (ATR)...");

      await new Promise((r) => setTimeout(r, 800));
      setScanStep("IA avaliando melhor estratégia e calculando gatilho ótimo de entrada...");

      const res = await fetch("/api/bot/direct-operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          durationMinutes,
          strategy,
          mode: tradingMode,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Erro ao iniciar operação direta com IA.");
      }

      const newSession = json.data.session;
      setSession(newSession);

      if (newSession.status === "WAITING_TRIGGER") {
        setScanStep(`Oportunidade selecionada: ${newSession.symbol}! Radar Sniper ativado.`);
        await new Promise((r) => setTimeout(r, 600));
        setState("WAITING_TRIGGER");
        toast({
          title: `🎯 Radar Sniper Armado: ${newSession.symbol}`,
          description: `Aguardando momento ideal de entrada (${newSession.triggerCondition?.distanceToTriggerPct || 0}% de distância).`,
        });
      } else {
        setScanStep(`Oportunidade selecionada: ${newSession.symbol}! Ordem executada com sucesso.`);
        await new Promise((r) => setTimeout(r, 600));
        setState("ACTIVE");
        const orderTag = newSession.binanceOrderId ? ` (Ordem #${newSession.binanceOrderId})` : '';
        toast({
          title: `🚀 Operação Iniciada: ${newSession.symbol}${orderTag}`,
          description: `IA alocou $${newSession.notionalUsd} na Binance Spot com alvo em $${newSession.targetPrice}.`,
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro na Operação Direta",
        description: err.message,
        variant: "destructive",
      });
      setState("CONFIG");
    }
  };

  const handleForceEntry = async () => {
    if (!session || isActionPending) return;
    setIsActionPending(true);

    try {
      const res = await fetch("/api/bot/direct-operation/force-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: session.id }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setSession(json.data);
        setState("ACTIVE");
        toast({
          title: `⚡ Entrada Imediata Executada: ${json.data.symbol}`,
          description: `Posição aberta a mercado a $${json.data.entryPrice}. Cronômetro iniciado!`,
        });
      } else {
        throw new Error(json.error || "Falha ao forçar disparo imediato.");
      }
    } catch (err: any) {
      toast({
        title: "Erro no Disparo",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsActionPending(false);
    }
  };

  const handleCancelRadar = async () => {
    if (!session || isActionPending) return;
    setIsActionPending(true);

    try {
      const res = await fetch(`/api/bot/direct-operation?id=${session.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success && json.data) {
        setSession(json.data);
        setState("RESULT");
        toast({
          title: "Radar Sniper Cancelado",
          description: "A espera pelo momento ideal foi cancelada. Nenhum valor foi gasto.",
        });
      }
    } catch (err: any) {
      toast({
        title: "Aviso",
        description: "Radar cancelado localmente.",
      });
      setState("CONFIG");
    } finally {
      setIsActionPending(false);
    }
  };

  const handleCloseSession = async (reason: string = "MANUAL_CLOSE") => {
    if (!session || isClosing) return;
    setIsClosing(true);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    try {
      const res = await fetch("/api/bot/direct-operation/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: session.id,
          reason,
          exitPrice: session.currentPrice,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setSession(json.data);
        setState("RESULT");

        // Atualizar saldo local
        if (portfolio) {
          const addedPnl = json.data.realizedPnlUsd ?? 0;
          setAccount({
            totalBalance: portfolio.totalValue + addedPnl,
            availableBalance: (portfolio.cashBalance ?? portfolio.totalValue) + addedPnl,
          } as any);
        }
      }
    } catch (err: any) {
      toast({
        title: "Aviso de Encerramento",
        description: "Operação finalizada localmente.",
      });
      setState("RESULT");
    } finally {
      setIsClosing(false);
    }
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const totalDurationSec = (session?.durationMinutes ?? durationMinutes) * 60;
  const progressPercent = totalDurationSec > 0 ? ((totalDurationSec - timeRemainingSec) / totalDurationSec) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] bg-[#090d14]/95 backdrop-blur-2xl border border-white/[0.1] text-foreground p-0 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] rounded-2xl">
        {/* Header Decorativo com Gradiente */}
        <div className="relative px-6 pt-6 pb-4 border-b border-white/[0.08] bg-gradient-to-r from-cyan-950/40 via-background to-emerald-950/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-400 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                <Zap className="w-5 h-5 text-black font-extrabold fill-current" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                  Operação Direta com IA
                  <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  Defina o valor e tempo. A IA seleciona o melhor ativo, opera e entrega o lucro.
                </DialogDescription>
              </div>
            </div>

            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-mono px-2 py-0.5 rounded-full border",
                isReal
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                  : "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5", isReal ? "bg-rose-500" : "bg-cyan-400")} />
              {isReal ? "Binance Spot Real" : "Simulado Paper"}
            </Badge>
          </div>
        </div>

        {/* Corpo do Modal em Função do Estado */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            {/* ETAPA 1: CONFIGURAÇÃO */}
            {state === "CONFIG" && (
              <motion.div
                key="config"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-5"
              >
                {/* 1. Seleção de Valor */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-cyan-400" />
                      Valor a Investir (USD)
                    </Label>
                    <span className="text-[11px] text-slate-400">
                      Saldo: <strong className="text-white">${portfolio?.totalValue ? formatPrice(portfolio.totalValue) : "70.00"}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {AMOUNT_PRESETS.map((p) => (
                      <Button
                        key={p}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAmount(p)}
                        className={cn(
                          "h-9 font-mono text-xs rounded-lg transition-all",
                          amount === p
                            ? "bg-cyan-500/20 text-cyan-300 border-cyan-400/50 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                            : "bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.06]"
                        )}
                      >
                        ${p}
                      </Button>
                    ))}
                  </div>

                  <div className="relative mt-2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-mono">$</span>
                    <Input
                      type="number"
                      min={11}
                      max={500}
                      step={1}
                      value={amount}
                      onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                      className="pl-7 h-9 text-xs font-mono bg-white/[0.03] border-white/[0.08] focus:border-cyan-400 text-white rounded-lg"
                      placeholder="Valor personalizado (mínimo $11)"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    *Mínimo $11.00 USD para garantia do filtro MIN_NOTIONAL da Binance.
                  </span>
                </div>

                {/* 2. Seleção de Tempo / Duração */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    Tempo da Operação (Horizonte)
                  </Label>

                  <div className="grid grid-cols-5 gap-1.5">
                    {DURATION_PRESETS.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => setDurationMinutes(d.value)}
                        className={cn(
                          "p-2 rounded-lg text-center flex flex-col items-center justify-center border transition-all cursor-pointer",
                          durationMinutes === d.value
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                            : "bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.06]"
                        )}
                      >
                        <span className="text-xs font-bold font-mono">{d.label}</span>
                        <span className="text-[9px] text-slate-400 truncate w-full">{d.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Seleção de Estratégia da IA */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      Critério de Seleção da IA
                    </Label>
                    <span className="text-[10px] text-cyan-400 font-medium">
                      IA decide regime e momento ideal
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {STRATEGIES.map((s) => {
                      const Icon = s.icon;
                      const isSelected = strategy === s.id;
                      const isAuto = s.id === "AUTO";
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setStrategy(s.id)}
                          className={cn(
                            "p-2.5 rounded-xl text-left flex flex-col gap-1 border transition-all cursor-pointer relative overflow-hidden",
                            isSelected
                              ? isAuto
                                ? "bg-cyan-500/15 text-cyan-200 border-cyan-400/60 shadow-[0_0_15px_rgba(6,182,212,0.25)]"
                                : "bg-purple-500/20 text-purple-200 border-purple-400/50 shadow-[0_0_12px_rgba(168,85,247,0.2)]"
                              : "bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.06]"
                          )}
                        >
                          {isAuto && (
                            <span className="absolute top-1.5 right-1.5 text-[8px] font-bold px-1.5 py-0.2 rounded-full bg-cyan-400/20 text-cyan-300 border border-cyan-400/30">
                              AUTO
                            </span>
                          )}
                          <div className="flex items-center gap-1.5 font-semibold text-xs text-white">
                            <Icon className={cn("w-3.5 h-3.5", isAuto ? "text-cyan-400" : "text-purple-400")} />
                            <span className="truncate pr-8">{s.name}</span>
                          </div>
                          <span className="text-[9px] text-slate-400 leading-tight line-clamp-2">
                            {s.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Botão de Disparo */}
                <Button
                  onClick={handleStartOperation}
                  disabled={amount < 11}
                  className="w-full h-11 bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-bold text-sm tracking-wide shadow-[0_0_20px_rgba(6,182,212,0.4)] rounded-xl transition-all cursor-pointer"
                >
                  <Zap className="w-4 h-4 mr-2 fill-current" />
                  Iniciar Operação Direta com IA (${amount.toFixed(2)})
                </Button>
              </motion.div>
            )}

            {/* ETAPA 2: SCANNING E SELEÇÃO PELA IA */}
            {state === "SCANNING" && (
              <motion.div
                key="scanning"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="py-10 flex flex-col items-center justify-center space-y-6 text-center"
              >
                <div className="relative">
                  <div className="w-20 h-20 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin flex items-center justify-center shadow-[0_0_30px_rgba(6,182,212,0.3)]">
                    <Loader2 className="w-8 h-8 text-cyan-400 animate-pulse" />
                  </div>
                  <Sparkles className="w-5 h-5 text-emerald-400 absolute -top-1 -right-1 animate-bounce" />
                </div>

                <div className="space-y-2 max-w-sm">
                  <h4 className="text-sm font-bold text-white tracking-wide">
                    IA Analisando Mercado em Tempo Real
                  </h4>
                  <p className="text-xs text-slate-400 font-mono animate-pulse min-h-[36px]">
                    {scanStep}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Badge variant="outline" className="text-[10px] bg-white/[0.04] border-white/[0.1] text-slate-300">
                    ADX & Volatilidade ATR
                  </Badge>
                  <Badge variant="outline" className="text-[10px] bg-white/[0.04] border-white/[0.1] text-slate-300">
                    Spreads &lt; 0.05%
                  </Badge>
                  <Badge variant="outline" className="text-[10px] bg-white/[0.04] border-white/[0.1] text-slate-300">
                    Radar Sniper L2
                  </Badge>
                </div>
              </motion.div>
            )}

            {/* ETAPA 2.5: RADAR SNIPER ATIVO (AGUARDANDO OPORTUNIDADE ÓTIMA) */}
            {state === "WAITING_TRIGGER" && session && (
              <motion.div
                key="waiting_trigger"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="space-y-4"
              >
                {/* Radar Visual Header */}
                <div className="relative p-5 rounded-2xl bg-gradient-to-b from-cyan-950/40 via-slate-900/60 to-background border border-cyan-500/30 overflow-hidden text-center shadow-[0_0_30px_rgba(6,182,212,0.15)]">
                  {/* Círculos concêntricos do Radar */}
                  <div className="relative w-24 h-24 mx-auto my-1 flex items-center justify-center">
                    <span className="absolute inset-0 rounded-full border border-cyan-400/20 animate-ping opacity-75" />
                    <span className="absolute inset-2 rounded-full border border-cyan-400/30 animate-pulse" />
                    <span className="absolute inset-4 rounded-full border border-cyan-500/40" />
                    <div className="w-12 h-12 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.6)]">
                      <Crosshair className="w-6 h-6 text-cyan-300 animate-spin" style={{ animationDuration: '6s' }} />
                    </div>
                    <Radio className="w-4 h-4 text-emerald-400 absolute top-1 right-1 animate-bounce" />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                        Radar Sniper Armado — {session.symbol}
                      </h4>
                    </div>
                    <p className="text-xs text-cyan-200/90 font-medium max-w-md mx-auto">
                      {session.triggerCondition?.conditionDescription || session.rationale}
                    </p>
                  </div>

                  {/* Informações de Preço e Gatilho */}
                  <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/[0.08] text-center">
                    <div className="bg-white/[0.02] p-2 rounded-xl">
                      <span className="text-[10px] text-slate-400 block font-mono">Preço Atual</span>
                      <span className="text-xs font-mono font-bold text-white">
                        ${formatPrice(session.currentPrice)}
                      </span>
                    </div>
                    <div className="bg-cyan-500/10 border border-cyan-500/30 p-2 rounded-xl">
                      <span className="text-[10px] text-cyan-300 block font-mono font-bold">Gatilho Alvo</span>
                      <span className="text-xs font-mono font-bold text-cyan-200">
                        ${formatPrice(session.targetEntryPrice || session.entryPrice)}
                      </span>
                    </div>
                    <div className="bg-white/[0.02] p-2 rounded-xl">
                      <span className="text-[10px] text-slate-400 block font-mono">Distância</span>
                      <span className="text-xs font-mono font-bold text-amber-300">
                        {session.triggerCondition?.distanceToTriggerPct ?? 0}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Nota de Segurança e Capital Intacto */}
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2.5">
                  <Shield className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-slate-300 leading-relaxed">
                    <strong className="text-emerald-300">Capital 100% Protegido:</strong> Nenhuma ordem foi enviada à Binance. A compra de <strong>${session.notionalUsd} USD</strong> só será disparada quando as condições ideais forem atingidas.
                  </div>
                </div>

                {/* Cockpit de Ranking: Top 3 Oportunidades no Radar da IA */}
                {session.topRanked && session.topRanked.length > 0 && (
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.08] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Top 3 Oportunidades no Radar da IA</span>
                      </div>
                      {session.isCooldownApplied && (
                        <Badge variant="outline" className="text-[9px] bg-cyan-500/10 text-cyan-300 border-cyan-500/30 font-mono py-0">
                          <RefreshCw className="w-2.5 h-2.5 mr-1 animate-spin" style={{ animationDuration: '4s' }} />
                          Rotação Ativa
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {session.topRanked.slice(0, 3).map((item: any, idx: number) => {
                        const isChosen = item.symbol === session.symbol;
                        return (
                          <div
                            key={item.symbol}
                            className={cn(
                              "p-2 rounded-lg border text-left transition-all relative overflow-hidden",
                              isChosen
                                ? "bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                                : "bg-white/[0.01] border-white/[0.05] opacity-75"
                            )}
                          >
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[10px] font-bold text-slate-200">
                                #{idx + 1} {item.symbol.replace("USDT", "")}
                              </span>
                              <span className={cn(
                                "text-[9px] font-mono font-bold px-1 rounded",
                                isChosen ? "bg-emerald-500/20 text-emerald-300" : "bg-white/[0.05] text-slate-400"
                              )}>
                                {item.score} pts
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
                              <span className="truncate max-w-[55px]">{item.strategy}</span>
                              <span className={item.priceChange24hPct >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                {item.priceChange24hPct >= 0 ? "+" : ""}{item.priceChange24hPct?.toFixed(1) ?? "0.0"}%
                              </span>
                            </div>
                            {isChosen && (
                              <span className="mt-1 block text-[8px] font-bold text-emerald-400 uppercase tracking-wider">
                                ✓ Selecionado
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Botões de Ação Rápida */}
                <div className="space-y-2">
                  <Button
                    onClick={handleForceEntry}
                    disabled={isActionPending}
                    className="w-full h-11 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-bold text-xs tracking-wide rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all cursor-pointer"
                  >
                    {isActionPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin text-black" />
                    ) : (
                      <Zap className="w-4 h-4 mr-2 fill-current" />
                    )}
                    Entrar a Mercado Agora (Disparo Imediato)
                  </Button>

                  <Button
                    onClick={handleCancelRadar}
                    disabled={isActionPending}
                    variant="ghost"
                    className="w-full h-9 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 text-xs rounded-xl transition-all cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5 mr-1.5" />
                    Cancelar Radar (Desarmar sem Custo)
                  </Button>
                </div>
              </motion.div>
            )}

            {/* ETAPA 3: OPERAÇÃO ATIVA AO VIVO */}
            {state === "ACTIVE" && session && (
              <motion.div
                key="active"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-5"
              >
                {/* Header da Sessão */}
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center font-mono font-bold text-cyan-400 text-sm">
                      {session.symbol.replace("USDT", "")}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm">{session.symbol}</span>
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-none text-[10px] font-mono">
                          Score IA: {session.aiScore}/100
                        </Badge>
                        {session.strategyChosen && (
                          <Badge variant="outline" className="bg-purple-500/10 text-purple-300 border-purple-500/30 text-[10px] font-mono">
                            {session.strategyChosen}
                          </Badge>
                        )}
                        {session.binanceOrderId && (
                          <Badge variant="outline" className="bg-cyan-500/10 text-cyan-300 border-cyan-500/30 text-[10px] font-mono">
                            Binance #{session.binanceOrderId}
                          </Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Entrada: ${formatPrice(session.entryPrice)} | Nocional: ${session.notionalUsd}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">Tempo Restante</span>
                    <span className="text-base font-bold font-mono text-cyan-300">
                      {formatCountdown(timeRemainingSec)}
                    </span>
                  </div>
                </div>

                {/* Barra de Progresso Temporal */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>Progresso do Horizonte</span>
                    <span>{progressPercent.toFixed(0)}%</span>
                  </div>
                  <Progress value={progressPercent} className="h-1.5 bg-white/[0.06]" />
                </div>

                {/* Card de PnL em Tempo Real */}
                <div className={cn(
                  "p-4 rounded-xl border text-center transition-all duration-300",
                  session.unrealizedPnlUsd >= 0
                    ? "bg-emerald-950/20 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                    : "bg-rose-950/20 border-rose-500/30 shadow-[0_0_20px_rgba(244,63,94,0.15)]"
                )}>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider block mb-1">
                    Lucro Flutuante em Tempo Real
                  </span>
                  <div className="flex items-center justify-center gap-2">
                    {session.unrealizedPnlUsd >= 0 ? (
                      <TrendingUp className="w-6 h-6 text-emerald-400" />
                    ) : (
                      <TrendingDown className="w-6 h-6 text-rose-400" />
                    )}
                    <span className={cn(
                      "text-2xl font-black font-mono tracking-tight",
                      session.unrealizedPnlUsd >= 0 ? "text-emerald-400" : "text-rose-400"
                    )}>
                      {session.unrealizedPnlUsd >= 0 ? "+" : ""}${formatPrice(session.unrealizedPnlUsd)}
                    </span>
                    <span className={cn(
                      "text-sm font-bold font-mono px-1.5 py-0.5 rounded",
                      session.unrealizedPnlPercent >= 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                    )}>
                      {session.unrealizedPnlPercent >= 0 ? "+" : ""}{session.unrealizedPnlPercent.toFixed(2)}%
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/[0.06] text-left">
                    <div>
                      <span className="text-[9px] text-slate-400 block">Preço Atual</span>
                      <span className="text-xs font-mono font-bold text-white">${formatPrice(session.currentPrice)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-emerald-400 block">Alvo (TP)</span>
                      <span className="text-xs font-mono font-bold text-emerald-300">${formatPrice(session.targetPrice)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-rose-400 block">Proteção (SL)</span>
                      <span className="text-xs font-mono font-bold text-rose-300">${formatPrice(session.stopLossPrice)}</span>
                    </div>
                  </div>
                </div>

                {/* Cockpit de Ranking: Top 3 Oportunidades no Radar da IA */}
                {session.topRanked && session.topRanked.length > 0 && (
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.08] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Top 3 Oportunidades no Radar da IA</span>
                      </div>
                      {session.isCooldownApplied && (
                        <Badge variant="outline" className="text-[9px] bg-cyan-500/10 text-cyan-300 border-cyan-500/30 font-mono py-0">
                          <RefreshCw className="w-2.5 h-2.5 mr-1 animate-spin" style={{ animationDuration: '4s' }} />
                          Rotação Ativa
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {session.topRanked.slice(0, 3).map((item: any, idx: number) => {
                        const isChosen = item.symbol === session.symbol;
                        return (
                          <div
                            key={item.symbol}
                            className={cn(
                              "p-2 rounded-lg border text-left transition-all relative overflow-hidden",
                              isChosen
                                ? "bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                                : "bg-white/[0.01] border-white/[0.05] opacity-75"
                            )}
                          >
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[10px] font-bold text-slate-200">
                                #{idx + 1} {item.symbol.replace("USDT", "")}
                              </span>
                              <span className={cn(
                                "text-[9px] font-mono font-bold px-1 rounded",
                                isChosen ? "bg-emerald-500/20 text-emerald-300" : "bg-white/[0.05] text-slate-400"
                              )}>
                                {item.score} pts
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
                              <span className="truncate max-w-[55px]">{item.strategy}</span>
                              <span className={item.priceChange24hPct >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                {item.priceChange24hPct >= 0 ? "+" : ""}{item.priceChange24hPct?.toFixed(1) ?? "0.0"}%
                              </span>
                            </div>
                            {isChosen && (
                              <span className="mt-1 block text-[8px] font-bold text-emerald-400 uppercase tracking-wider">
                                ✓ Selecionado
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Botão de Encerramento Antecipado */}
                <Button
                  onClick={() => handleCloseSession("MANUAL_CLOSE")}
                  disabled={isClosing}
                  variant="outline"
                  className="w-full h-10 border-white/[0.1] hover:bg-rose-500/20 hover:border-rose-500/40 text-slate-200 hover:text-rose-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  {isClosing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin text-rose-400" />
                  ) : (
                    <Shield className="w-4 h-4 mr-2 text-rose-400" />
                  )}
                  Encerrar e Consolidar Resultado Agora
                </Button>
              </motion.div>
            )}

            {/* ETAPA 4: ENTREGA DO LUCRO / RESULTADO FINAL */}
            {state === "RESULT" && session && (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-5"
              >
                {session.status === "CANCELLED" || session.closeReason === "RADAR_CANCELLED" ? (
                  <div className="text-center space-y-3 py-4">
                    <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                      <Ban className="w-6 h-6 text-cyan-300" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-bold text-white tracking-wide">
                        Radar Sniper Cancelado com Sucesso
                      </h3>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        O monitoramento foi desarmado antes de qualquer disparo. Nenhum capital foi comprometido e nenhuma taxa foi cobrada.
                      </p>
                    </div>
                    <div className="p-3 bg-white/[0.02] border border-white/[0.08] rounded-xl text-xs text-slate-300 font-mono">
                      Saldo Intacto: <strong className="text-emerald-400">$0.00 de custo operacional</strong>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-center space-y-1">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(16,185,129,0.4)]">
                        <Award className="w-7 h-7 text-black fill-current" />
                      </div>
                      <h3 className="text-base font-bold text-white tracking-wide pt-2">
                        Operação Finalizada — Entrega de Resultado
                      </h3>
                      <p className="text-xs text-slate-400">
                        O ciclo programado pela IA foi concluído e os valores foram consolidados na sua carteira.
                      </p>
                    </div>

                    {/* Card de Lucro Líquido Entregue */}
                    <div className={cn(
                      "p-5 rounded-2xl border text-center relative overflow-hidden",
                      (session.realizedPnlUsd ?? 0) >= 0
                        ? "bg-gradient-to-b from-emerald-950/40 to-background border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.2)]"
                        : "bg-gradient-to-b from-rose-950/40 to-background border-rose-500/40 shadow-[0_0_30px_rgba(244,63,94,0.2)]"
                    )}>
                      <span className="text-xs uppercase font-bold text-slate-300 tracking-wider block">
                        Lucro Líquido Realizado
                      </span>
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <span className={cn(
                          "text-3xl font-black font-mono",
                          (session.realizedPnlUsd ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                        )}>
                          {(session.realizedPnlUsd ?? 0) >= 0 ? "+" : ""}${formatPrice(session.realizedPnlUsd ?? 0)} USD
                        </span>
                      </div>
                      <span className={cn(
                        "inline-block mt-2 text-xs font-bold font-mono px-2 py-0.5 rounded-full",
                        (session.realizedPnlPercent ?? 0) >= 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                      )}>
                        ROI: {(session.realizedPnlPercent ?? 0) >= 0 ? "+" : ""}{(session.realizedPnlPercent ?? 0).toFixed(2)}%
                      </span>
                    </div>

                    {/* Breakdown de Execução */}
                    <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2 text-xs">
                      <div className="flex justify-between text-slate-400">
                        <span>Ativo Selecionado pela IA:</span>
                        <strong className="text-white font-mono">{session.symbol}</strong>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Capital Investido:</span>
                        <strong className="text-white font-mono">${session.notionalUsd} USD</strong>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Preço de Entrada / Saída:</span>
                        <strong className="text-white font-mono">
                          ${formatPrice(session.entryPrice)} → ${formatPrice(session.currentPrice)}
                        </strong>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Taxas de Corretagem Deduzidas:</span>
                        <strong className="text-amber-400 font-mono">-${session.feeDeductedUsd ?? "0.02"} USD</strong>
                      </div>
                      {session.binanceOrderId && (
                        <div className="flex justify-between text-slate-400">
                          <span>Ordem de Compra Binance:</span>
                          <strong className="text-cyan-400 font-mono">#{session.binanceOrderId}</strong>
                        </div>
                      )}
                      {session.closeBinanceOrderId && (
                        <div className="flex justify-between text-slate-400">
                          <span>Ordem de Venda Binance:</span>
                          <strong className="text-cyan-400 font-mono">#{session.closeBinanceOrderId}</strong>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-400">
                        <span>Motivo de Encerramento:</span>
                        <Badge variant="outline" className="text-[10px] border-white/[0.1] text-slate-300">
                          {session.closeReason === "TARGET_REACHED"
                            ? "🎯 Alvo de Lucro (TP) Atingido"
                            : session.closeReason === "TIME_EXPIRED"
                            ? "⏱️ Tempo Estipulado Concluído"
                            : session.closeReason === "STOP_LOSS"
                            ? "🛡️ Stop Loss de Proteção Acionado"
                            : "⏹️ Saída Antecipada Manual"}
                        </Badge>
                      </div>
                    </div>
                  </>
                )}

                {/* Ações Finais */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setState("CONFIG");
                      setSession(null);
                    }}
                    className="flex-1 h-10 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs rounded-xl cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Nova Operação Direta
                  </Button>
                  <Button
                    onClick={() => onOpenChange(false)}
                    variant="outline"
                    className="h-10 border-white/[0.1] hover:bg-white/[0.05] text-slate-300 text-xs rounded-xl cursor-pointer"
                  >
                    Fechar
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
