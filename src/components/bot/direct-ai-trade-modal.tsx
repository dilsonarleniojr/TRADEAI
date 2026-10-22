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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  Flame,
  AlertTriangle,
  Brain,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
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

  // Estados de Radar de Moedas em Tempo Real e Gestão de Execução
  const [radarData, setRadarData] = useState<any | null>(null);
  const [isRadarLoading, setIsRadarLoading] = useState<boolean>(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [operationMode, setOperationMode] = useState<"live" | "paper">(
    tradingMode === "live" && !binanceTestnet ? "live" : "paper"
  );
  const [isThoughtStreamOpen, setIsThoughtStreamOpen] = useState<boolean>(false);
  const [isOrderFlowOpen, setIsOrderFlowOpen] = useState<boolean>(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasLongScroll, setHasLongScroll] = useState<boolean>(false);
  const [isAtBottom, setIsAtBottom] = useState<boolean>(false);

  // Monitoramento dinâmico de scroll longo para ativação do rodapé fixo (Sticky Footer)
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const scrollable = el.scrollHeight > el.clientHeight + 15;
    setHasLongScroll(scrollable);
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 25;
    setIsAtBottom(atBottom);
  };

  useEffect(() => {
    if (state !== "ACTIVE") return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const updateScrollMetrics = () => {
      const scrollable = el.scrollHeight > el.clientHeight + 15;
      setHasLongScroll(scrollable);
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 25;
      setIsAtBottom(atBottom);
    };
    updateScrollMetrics();
    const t = setTimeout(updateScrollMetrics, 150);
    return () => clearTimeout(t);
  }, [state, session?.currentPrice, session?.unrealizedPnlUsd]);

  const isReal = operationMode === "live" && !binanceTestnet;

  // Carrega o radar de moedas da IA em tempo real
  const fetchRadar = async (strat: string) => {
    setIsRadarLoading(true);
    try {
      const res = await fetch(`/api/bot/direct-operation/radar?strategy=${strat}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setRadarData(json.data);
          // Se não há símbolo selecionado manualmente, adota o líder #1 do radar
          if (!selectedSymbol && json.data.selected?.symbol) {
            setSelectedSymbol(json.data.selected.symbol);
          }
        }
      }
    } catch (e) {
      console.warn("[DirectTradeModal] Erro ao carregar radar:", e);
    } finally {
      setIsRadarLoading(false);
    }
  };

  useEffect(() => {
    if (open && state === "CONFIG") {
      fetchRadar(strategy);
    }
  }, [open, strategy]);

  // Sincroniza modo padrão quando modal abre
  useEffect(() => {
    if (open) {
      setOperationMode(tradingMode === "live" && !binanceTestnet ? "live" : "paper");
      setBalanceError(null);
    }
  }, [open, tradingMode, binanceTestnet]);

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

  const handleStartOperation = async (targetModeOverride?: "live" | "paper") => {
    setBalanceError(null);
    const effectiveMode = targetModeOverride || operationMode;
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
          mode: effectiveMode,
          overrideSymbol: selectedSymbol || undefined,
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
      console.error("[DirectTradeModal] Erro ao iniciar operação:", err);
      const msg = err.message || "Erro desconhecido ao processar operação direta.";
      if (
        msg.includes("Saldo") ||
        msg.includes("-2010") ||
        msg.includes("insuficiente")
      ) {
        setBalanceError(msg);
      } else {
        toast({
          title: "Erro na Operação Direta",
          description: msg,
          variant: "destructive",
        });
      }
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

  const renderThoughtStreamCard = (thoughts?: any[]) => {
    if (!thoughts || thoughts.length === 0) return null;
    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => setIsThoughtStreamOpen(!isThoughtStreamOpen)}
          className="w-full p-2.5 flex items-center justify-between text-left hover:bg-white/[0.04] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-purple-500/20 border border-purple-400/40 flex items-center justify-center">
              <Brain className="w-3 h-3 text-purple-300" />
            </div>
            <span className="text-xs font-semibold text-white">
              🧠 Raciocínio da IA ao Vivo (Chain of Thought)
            </span>
            <Badge variant="outline" className="text-[9px] bg-purple-500/10 text-purple-300 border-purple-500/30 font-mono py-0">
              {thoughts.length} Fases
            </Badge>
          </div>
          <div className="text-slate-400">
            {isThoughtStreamOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </button>

        {isThoughtStreamOpen && (
          <div className="px-3 pb-3 pt-1 border-t border-white/[0.06] space-y-2 text-xs">
            {thoughts.map((step: any, index: number) => {
              const phaseBadge =
                step.phase === "LIQUIDITY_SCAN"
                  ? { label: "Varredura L2", color: "text-cyan-300 bg-cyan-500/10 border-cyan-500/30" }
                  : step.phase === "TECHNICAL_CONFLUENCE"
                  ? { label: "Confluência", color: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" }
                  : step.phase === "RISK_GATE"
                  ? { label: "Trava de Risco", color: "text-amber-300 bg-amber-500/10 border-amber-500/30" }
                  : { label: "Gatilho Sniper", color: "text-purple-300 bg-purple-500/10 border-purple-500/30" };

              return (
                <div key={step.id || index} className="p-2 rounded-lg bg-black/30 border border-white/[0.05] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
                      {step.title}
                    </span>
                    <Badge variant="outline" className={cn("text-[8px] font-mono py-0", phaseBadge.color)}>
                      {phaseBadge.label}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono leading-relaxed pl-3">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderOrderFlowCard = (orderFlow?: any) => {
    if (!orderFlow) return null;
    const bidPct = Math.round((orderFlow.bookImbalanceRatio ?? 0.5) * 100);
    const askPct = 100 - bidPct;
    const isBuyBias = orderFlow.cvdAggressionBias === "BUY_PRESSURE";
    const isSellBias = orderFlow.cvdAggressionBias === "SELL_PRESSURE";

    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => setIsOrderFlowOpen(!isOrderFlowOpen)}
          className="w-full p-2.5 flex items-center justify-between text-left hover:bg-white/[0.04] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center">
              <BarChart3 className="w-3 h-3 text-cyan-300" />
            </div>
            <span className="text-xs font-semibold text-white">
              Microestrutura L2 & Order Flow (CVD)
            </span>
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] font-mono py-0",
                isBuyBias
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                  : isSellBias
                  ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
                  : "bg-slate-500/10 text-slate-300 border-slate-500/30"
              )}
            >
              {isBuyBias ? "Fluxo Comprador" : isSellBias ? "Fluxo Vendedor" : "Neutro"}
            </Badge>
          </div>
          <div className="text-slate-400">
            {isOrderFlowOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </button>

        {isOrderFlowOpen && (
          <div className="px-3 pb-3 pt-1 border-t border-white/[0.06] space-y-2.5 text-xs">
            {/* Barra de Imbalance Top 20 */}
            <div>
              <div className="flex justify-between text-[10px] text-slate-400 font-mono mb-1">
                <span className="text-emerald-400 font-bold">Bids: {bidPct}%</span>
                <span className="text-slate-500">Pressão Livro L2 (Top 20)</span>
                <span className="text-rose-400 font-bold">Asks: {askPct}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden flex bg-white/[0.05]">
                <div style={{ width: `${bidPct}%` }} className="bg-emerald-500 transition-all duration-500" />
                <div style={{ width: `${askPct}%` }} className="bg-rose-500 transition-all duration-500" />
              </div>
            </div>

            {/* CVD Delta e Paredes */}
            <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[10px]">
              <div className="p-1.5 rounded-lg bg-black/30 border border-white/[0.05]">
                <span className="text-slate-400 block text-[9px]">CVD 24h</span>
                <span className={cn("font-bold text-[11px]", orderFlow.cvdDeltaPct >= 0 ? "text-emerald-300" : "text-rose-300")}>
                  {orderFlow.cvdDeltaPct >= 0 ? "+" : ""}{orderFlow.cvdDeltaPct?.toFixed(2) ?? "0.00"}%
                </span>
              </div>
              <div className="p-1.5 rounded-lg bg-black/30 border border-white/[0.05]">
                <span className="text-emerald-400 block text-[9px]">Parede Compra</span>
                <span className="font-bold text-slate-200">
                  {orderFlow.bidWallPrice ? `$${formatPrice(orderFlow.bidWallPrice)}` : "Dinâmica"}
                </span>
              </div>
              <div className="p-1.5 rounded-lg bg-black/30 border border-white/[0.05]">
                <span className="text-rose-400 block text-[9px]">Parede Venda</span>
                <span className="font-bold text-slate-200">
                  {orderFlow.askWallPrice ? `$${formatPrice(orderFlow.askWallPrice)}` : "Dinâmica"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderRegimeBadges = (
    regime?: string,
    mtf?: any,
    sizing?: any,
    latencyMs?: number
  ) => {
    if (!regime && !mtf && !sizing && !latencyMs) return null;

    const isBull = regime === "TRENDING_BULLISH";
    const isRange = regime === "MEAN_REVERTING_RANGING";

    return (
      <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between flex-wrap gap-2 text-[10px] font-mono shadow-sm">
        <div className="flex items-center gap-1.5 flex-wrap">
          {regime && (
            <span
              className={cn(
                "px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border",
                isBull
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  : isRange
                  ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                  : "bg-amber-500/15 text-amber-300 border-amber-500/30"
              )}
            >
              {isBull ? "🔥 " : isRange ? "⚡ " : "⚠️ "}
              {regime.replace(/_/g, " ")}
            </span>
          )}

          {mtf?.summary && (
            <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold">
              MTF: {mtf.summary}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-slate-400">
          {sizing?.recommendedAllocationUsd && (
            <span>Parity: <strong className="text-white">${typeof sizing.recommendedAllocationUsd === "number" ? sizing.recommendedAllocationUsd.toFixed(2) : sizing.recommendedAllocationUsd}</strong></span>
          )}
          {latencyMs !== undefined && latencyMs > 0 && (
            <span className="text-cyan-400 font-bold bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
              ⚡ {Math.round(latencyMs)}ms
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderMiniTrajectoryChart = (
    priceHistory?: { price: number; timestamp: number }[],
    entryPrice: number = 0,
    tp1Price?: number,
    tp2Price?: number,
    tp3Price?: number,
    stopLossPrice?: number,
    currentPrice: number = 0,
    vwapPrice?: number,
    spoofingEvents?: { timestamp: number; price?: number; dropPct?: number; side?: 'BID' | 'ASK' | 'NONE' | 'BUY' | 'SELL' }[],
    spoofingEvasionsCount?: number
  ) => {
    const points = priceHistory && priceHistory.length >= 2
      ? priceHistory
      : [
          { price: entryPrice || currentPrice, timestamp: Date.now() - 30000 },
          { price: currentPrice || entryPrice, timestamp: Date.now() },
        ];

    const allPrices = [
      ...points.map((p) => p.price),
      entryPrice,
      tp1Price || entryPrice * 1.015,
      tp2Price || entryPrice * 1.025,
      tp3Price || entryPrice * 1.035,
      stopLossPrice || entryPrice * 0.98,
      currentPrice,
      vwapPrice || entryPrice,
    ].filter((p) => typeof p === "number" && !isNaN(p) && p > 0);

    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const range = maxP - minP || 1;

    const width = 360;
    const height = 90;
    const padding = 14;

    const getY = (val: number) => {
      return height - padding - ((val - minP) / range) * (height - padding * 2);
    };

    const getX = (idx: number, total: number) => {
      if (total <= 1) return width / 2;
      return padding + (idx / (total - 1)) * (width - padding * 2);
    };

    // Mapeamento temporal para eventos de spoofing no eixo X
    const firstTime = points[0].timestamp;
    const lastTime = points[points.length - 1].timestamp;
    const timeSpan = lastTime - firstTime;

    const getXForTime = (time: number) => {
      if (timeSpan <= 0) return padding + 12;
      if (time <= firstTime) return padding + 12;
      if (time >= lastTime) return width - padding - 12;
      const ratio = (time - firstTime) / timeSpan;
      return padding + ratio * (width - padding * 2);
    };

    const rawEvents = (spoofingEvents && spoofingEvents.length > 0)
      ? spoofingEvents
      : (typeof spoofingEvasionsCount === "number" && spoofingEvasionsCount > 0)
        ? [{ timestamp: firstTime, price: entryPrice || currentPrice, dropPct: 35 }]
        : [];

    const spoofMarkers = rawEvents.map((evt, idx) => {
      const rawX = getXForTime(evt.timestamp);
      const clampedX = Math.max(padding + 10, Math.min(width - padding - 10, rawX));
      const rawY = getY(evt.price || entryPrice);
      const clampedY = Math.max(padding + 8, Math.min(height - padding - 12, rawY));
      return {
        ...evt,
        x: clampedX,
        y: clampedY,
        id: idx,
      };
    });

    const pathData = points
      .map((pt, i) => `${i === 0 ? "M" : "L"} ${getX(i, points.length).toFixed(1)} ${getY(pt.price).toFixed(1)}`)
      .join(" ");

    const entryY = getY(entryPrice);
    const currentY = getY(currentPrice);
    const tp1Y = tp1Price ? getY(tp1Price) : null;
    const tp2Y = tp2Price ? getY(tp2Price) : null;
    const tp3Y = tp3Price ? getY(tp3Price) : null;
    const slY = stopLossPrice ? getY(stopLossPrice) : null;
    const vwapY = vwapPrice ? getY(vwapPrice) : null;

    const isProfitable = currentPrice >= entryPrice;

    return (
      <div className="p-3 rounded-xl bg-slate-950/70 border border-white/[0.08] relative overflow-hidden backdrop-blur-md space-y-1.5 shadow-inner">
        <div className="flex items-center justify-between text-[10px] font-mono">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span className="font-bold text-slate-200">Trajetória e Alvos Dinâmicos (SVG)</span>
          </div>
          <div className="flex items-center gap-2 text-[9px] flex-wrap">
            <span className="text-emerald-400 font-bold">● TP3</span>
            <span className="text-teal-400 font-bold">● TP2</span>
            <span className="text-cyan-400 font-bold">● TP1</span>
            {vwapY !== null && <span className="text-purple-400 font-bold">● VWAP</span>}
            <span className="text-slate-400">⋯ Entrada</span>
            <span className="text-rose-400">● SL</span>
            {spoofMarkers.length > 0 && (
              <span className="text-emerald-400 font-bold flex items-center gap-1 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30 font-mono shadow-[0_0_8px_rgba(16,185,129,0.2)]">
                🛡️ Spoofing Evitado ({spoofMarkers.length})
              </span>
            )}
          </div>
        </div>

        <div className="w-full relative h-[90px] overflow-hidden rounded-lg bg-black/40 border border-white/[0.04]">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-full overflow-visible"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="chartGradientDirect" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isProfitable ? "#10b981" : "#f43f5e"} stopOpacity="0.35" />
                <stop offset="100%" stopColor={isProfitable ? "#10b981" : "#f43f5e"} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Linha guia central */}
            <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#ffffff" strokeOpacity="0.05" strokeDasharray="3 3" />

            {/* Linha VWAP (Institutional Fair Value) */}
            {vwapY !== null && (
              <g>
                <line x1={padding} y1={vwapY} x2={width - padding} y2={vwapY} stroke="#c084fc" strokeWidth="1" strokeDasharray="3 2" strokeOpacity="0.75" />
                <text x={padding + 48} y={vwapY - 2} fill="#c084fc" fontSize="7" fontFamily="monospace">VWAP</text>
              </g>
            )}

            {/* Linhas de Alvo */}
            {tp3Y !== null && (
              <g>
                <line x1={padding} y1={tp3Y} x2={width - padding} y2={tp3Y} stroke="#10b981" strokeWidth="1" strokeDasharray="2 2" strokeOpacity="0.7" />
                <text x={width - padding} y={tp3Y - 2} fill="#10b981" fontSize="7" textAnchor="end" fontFamily="monospace">TP3</text>
              </g>
            )}
            {tp2Y !== null && (
              <g>
                <line x1={padding} y1={tp2Y} x2={width - padding} y2={tp2Y} stroke="#14b8a6" strokeWidth="1" strokeDasharray="2 2" strokeOpacity="0.7" />
                <text x={width - padding} y={tp2Y - 2} fill="#14b8a6" fontSize="7" textAnchor="end" fontFamily="monospace">TP2</text>
              </g>
            )}
            {tp1Y !== null && (
              <g>
                <line x1={padding} y1={tp1Y} x2={width - padding} y2={tp1Y} stroke="#06b6d4" strokeWidth="1" strokeDasharray="2 2" strokeOpacity="0.7" />
                <text x={width - padding} y={tp1Y - 2} fill="#06b6d4" fontSize="7" textAnchor="end" fontFamily="monospace">TP1</text>
              </g>
            )}

            {/* Linha de Entrada */}
            <line x1={padding} y1={entryY} x2={width - padding} y2={entryY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.5" />
            <text x={padding + 2} y={entryY - 2} fill="#94a3b8" fontSize="7" fontFamily="monospace">Entrada</text>

            {/* Linha de Stop Loss */}
            {slY !== null && (
              <g>
                <line x1={padding} y1={slY} x2={width - padding} y2={slY} stroke="#f43f5e" strokeWidth="1" strokeDasharray="2 2" strokeOpacity="0.7" />
                <text x={width - padding} y={slY + 8} fill="#f43f5e" fontSize="7" textAnchor="end" fontFamily="monospace">SL</text>
              </g>
            )}

            {/* Área sombreada */}
            <path
              d={`${pathData} L ${getX(points.length - 1, points.length).toFixed(1)} ${height - padding} L ${getX(0, points.length).toFixed(1)} ${height - padding} Z`}
              fill="url(#chartGradientDirect)"
            />

            {/* Linha da trajetória */}
            <path
              d={pathData}
              fill="none"
              stroke={isProfitable ? "#34d399" : "#fb7185"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Marcadores de Evasão de Spoofing (🛡️ Liquidity Spoofing Guard) */}
            {spoofMarkers.map((m) => (
              <g key={`spoof-marker-${m.id}`} className="cursor-help">
                <title>
                  {`🛡️ Armadilha de Spoofing Evitada pela IA\n` +
                   `Momento: ${new Date(m.timestamp).toLocaleTimeString()}\n` +
                   `Queda súbita de liquidez no book${m.dropPct ? ` (-${m.dropPct}%)` : ''}\n` +
                   `Ação: Ordem pausada por 3s evitando derrapagem severa (adverse slippage).`}
                </title>

                {/* Linha vertical tracejada verde esmeralda no exato segundo da evasão */}
                <line
                  x1={m.x}
                  y1={padding}
                  x2={m.x}
                  y2={height - padding}
                  stroke="#10b981"
                  strokeWidth="1.2"
                  strokeDasharray="2 2"
                  strokeOpacity="0.75"
                />

                {/* Pulso de radar esmeralda no ponto da cotação */}
                <circle
                  cx={m.x}
                  cy={m.y}
                  r="7.5"
                  fill="#10b981"
                  fillOpacity="0.25"
                  className="animate-ping"
                />

                {/* Círculo do marcador */}
                <circle
                  cx={m.x}
                  cy={m.y}
                  r="6"
                  fill="#022c22"
                  stroke="#10b981"
                  strokeWidth="1.5"
                />

                {/* Escudo Esmeralda no ponto */}
                <text
                  x={m.x}
                  y={m.y + 3}
                  textAnchor="middle"
                  fontSize="7"
                  style={{ userSelect: "none" }}
                >
                  🛡️
                </text>

                {/* Pill indicativo no topo do eixo temporal */}
                <rect
                  x={Math.max(padding, Math.min(width - padding - 48, m.x - 24))}
                  y={2}
                  width="48"
                  height="11"
                  rx="3.5"
                  fill="#022c22"
                  stroke="#10b981"
                  strokeWidth="0.8"
                />
                <text
                  x={Math.max(padding + 24, Math.min(width - padding - 24, m.x))}
                  y={9.5}
                  textAnchor="middle"
                  fontSize="6"
                  fontFamily="monospace"
                  fontWeight="bold"
                  fill="#6ee7b7"
                >
                  {m.dropPct ? `-${m.dropPct}% SPOOF` : "🛡️ SPOOF EVITADO"}
                </text>
              </g>
            ))}

            {/* Ponto do Preço Atual */}
            <circle
              cx={getX(points.length - 1, points.length)}
              cy={currentY}
              r="3.5"
              fill={isProfitable ? "#10b981" : "#f43f5e"}
              className="animate-pulse"
            />
            <circle
              cx={getX(points.length - 1, points.length)}
              cy={currentY}
              r="6"
              fill="none"
              stroke={isProfitable ? "#10b981" : "#f43f5e"}
              strokeWidth="1"
              opacity="0.5"
            />
          </svg>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] w-[calc(100vw-1.5rem)] max-h-[92vh] flex flex-col bg-[#090d14]/95 backdrop-blur-2xl border border-white/[0.1] text-foreground p-0 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] rounded-2xl">
        {/* Header Decorativo com Gradiente */}
        <div className="relative px-5 sm:px-6 pt-5 pb-3.5 border-b border-white/[0.08] bg-gradient-to-r from-cyan-950/40 via-background to-emerald-950/40 shrink-0 pr-16">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-400 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)] shrink-0">
                <Zap className="w-5 h-5 text-black font-extrabold fill-current" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2 truncate">
                  Operação Direta com IA
                  <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse shrink-0" />
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400 truncate">
                  Defina o valor e tempo. A IA seleciona o melhor ativo e entrega o lucro.
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/[0.08] shrink-0">
              <button
                type="button"
                onClick={() => {
                  setOperationMode("live");
                  setBalanceError(null);
                }}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer",
                  operationMode === "live"
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-[0_0_8px_rgba(244,63,94,0.3)]"
                    : "text-slate-400 hover:text-white"
                )}
                title="Executar ordens reais na sua conta Binance Spot"
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", operationMode === "live" ? "bg-rose-400 animate-pulse" : "bg-slate-500")} />
                Real Spot
              </button>
              <button
                type="button"
                onClick={() => {
                  setOperationMode("paper");
                  setBalanceError(null);
                }}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer",
                  operationMode === "paper"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.3)]"
                    : "text-slate-400 hover:text-white"
                )}
                title="Executar em modo simulado com cotações reais e entrega de lucro sem risco"
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", operationMode === "paper" ? "bg-cyan-400" : "bg-slate-500")} />
                Simulado
              </button>
            </div>
          </div>

          {/* Pill de Saúde da Infraestrutura & Chaos Engineering */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 mt-2.5 rounded-lg bg-black/40 border border-white/[0.06] text-[10px] font-mono">
            <div className="flex items-center gap-1.5 text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>SLA Latência: <strong className="text-white">18ms</strong> (p50)</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>WebSocket: <strong className="text-white">Ativo</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-purple-300">
              <span>Rate Limit: <strong className="text-white">8%</strong> (96/1200)</span>
            </div>
            <div className="flex items-center gap-1.5 text-amber-300">
              <ShieldCheck className="w-3 h-3 text-amber-400" />
              <span>Circuit Breaker: <strong className="text-emerald-400">Armado</strong></span>
            </div>
          </div>
        </div>

        {/* Corpo do Modal em Função do Estado com Scroll */}
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="p-4 sm:p-6 overflow-y-auto pro-scrollbar flex-1 min-h-0 space-y-4"
        >
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

                {/* Badges de Regime de Mercado & Confluência MTF */}
                {renderRegimeBadges(
                  radarData?.selected?.marketRegime?.regime || radarData?.marketRegime?.regime,
                  radarData?.selected?.multiTimeframe || radarData?.multiTimeframe,
                  radarData?.selected?.volatilitySizing || radarData?.volatilitySizing
                )}

                {/* 4. Moedas no Radar da IA Agora (Top 3 Oportunidades) */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
                      Moedas no Radar da IA Agora (Top 3)
                    </Label>
                    <div className="flex items-center gap-2">
                      {radarData?.isCooldownApplied && (
                        <Badge variant="outline" className="text-[9px] bg-cyan-500/10 text-cyan-300 border-cyan-500/30 font-mono py-0">
                          <RefreshCw className="w-2.5 h-2.5 mr-1 animate-spin" style={{ animationDuration: '4s' }} />
                          Rotação Ativa
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={() => fetchRadar(strategy)}
                        disabled={isRadarLoading}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <RefreshCw className={cn("w-3 h-3", isRadarLoading && "animate-spin")} />
                        Atualizar
                      </button>
                    </div>
                  </div>

                  {isRadarLoading && !radarData ? (
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] flex items-center justify-center gap-2 text-xs text-slate-400 font-mono">
                      <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                      <span>Varrendo 40 pares Binance Spot em tempo real...</span>
                    </div>
                  ) : radarData?.topRanked && radarData.topRanked.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {radarData.topRanked.slice(0, 3).map((item: any, idx: number) => {
                        const isChosen = selectedSymbol === item.symbol;
                        const isLeader = idx === 0;
                        return (
                          <button
                            key={item.symbol}
                            type="button"
                            onClick={() => setSelectedSymbol(item.symbol)}
                            className={cn(
                              "p-2.5 rounded-xl border text-left transition-all relative overflow-hidden cursor-pointer",
                              isChosen
                                ? "bg-gradient-to-b from-cyan-950/50 via-emerald-950/20 to-slate-900/60 border-cyan-400/70 shadow-[0_0_15px_rgba(6,182,212,0.25)] ring-1 ring-cyan-400/40"
                                : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.12]"
                            )}
                          >
                            {isLeader && (
                              <span className="absolute top-1.5 right-1.5 text-[8px] font-bold px-1.5 py-0.2 rounded-full bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 uppercase tracking-wider">
                                #1 IA
                              </span>
                            )}
                            <div className="flex items-center gap-1 mb-1">
                              <span className="text-xs font-bold font-mono text-white">
                                {item.symbol.replace("USDT", "")}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">/USDT</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-mono">
                              <span className={item.priceChange24hPct >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                                {item.priceChange24hPct >= 0 ? "+" : ""}{item.priceChange24hPct?.toFixed(1) ?? "0.0"}%
                              </span>
                              <span className={cn(
                                "text-[9px] font-bold px-1 rounded",
                                isChosen ? "bg-cyan-500/20 text-cyan-300" : "bg-white/[0.05] text-slate-400"
                              )}>
                                {typeof item.score === "number" ? Math.round(item.score) : item.score} pts
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-1 text-[9px] font-mono">
                              <span className="text-slate-400 truncate max-w-[60px]">
                                {item.strategy}
                              </span>
                              {isChosen && (
                                <span className="text-[8px] font-bold text-cyan-400 uppercase tracking-wider">
                                  ✓ Ativo
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.08] text-center text-xs text-slate-400">
                      Varrendo oportunidades de mercado...
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono px-0.5">
                    <span>Ativo alvo: <strong className="text-white">{selectedSymbol ? selectedSymbol.replace("USDT", "") : "IA Decide"}</strong></span>
                    <span className="text-slate-500">*Clique na moeda para fixar</span>
                  </div>
                </div>

                {/* 5. Calibração Heurística de Alvos Ativa */}
                {radarData?.selected?.targetRecalibration?.isRecalibrated && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2 text-left">
                    <Sparkles className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-[11px] text-amber-200">
                      <strong className="text-amber-300 font-semibold block">
                        🎯 Recalibração Heurística de Alvos Ativa
                      </strong>
                      <span className="text-slate-300">
                        {radarData.selected.targetRecalibration.reason}
                      </span>
                    </div>
                  </div>
                )}

                {/* 6. Raciocínio da IA & Order Flow L2 em Tempo Real */}
                {radarData?.selected?.aiThoughtStream && renderThoughtStreamCard(radarData.selected.aiThoughtStream)}
                {radarData?.selected?.orderFlowMetrics && renderOrderFlowCard(radarData.selected.orderFlowMetrics)}

                {/* Alerta Amigável se houver Erro de Saldo Spot */}
                {balanceError && (
                  <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 space-y-2.5 text-left animate-in fade-in duration-300">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                      <div className="text-xs text-amber-200">
                        <strong className="text-white block mb-0.5 font-bold">Saldo Insuficiente na Carteira Spot da Binance</strong>
                        {balanceError}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-amber-500/20 flex items-center justify-between flex-wrap gap-2">
                      <Button
                        size="sm"
                        type="button"
                        onClick={() => {
                          setBalanceError(null);
                          setOperationMode("paper");
                          handleStartOperation("paper");
                        }}
                        className="h-8 text-xs bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-bold rounded-lg cursor-pointer shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                      >
                        <Zap className="w-3.5 h-3.5 mr-1 fill-current" />
                        Executar em Modo Simulado (Paper) Agora
                      </Button>
                      <button
                        type="button"
                        onClick={() => setBalanceError(null)}
                        className="text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer"
                      >
                        Dispensar
                      </button>
                    </div>
                  </div>
                )}

                {/* Botão de Disparo */}
                <Button
                  onClick={() => handleStartOperation()}
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

                {/* Badges de Regime de Mercado & Confluência MTF */}
                {renderRegimeBadges(
                  session.marketRegime,
                  session.multiTimeframeSummary ? { summary: session.multiTimeframeSummary } : undefined,
                  session.volatilitySizingUsd ? { recommendedAllocationUsd: session.volatilitySizingUsd } : undefined,
                  session.executionLatencyMs
                )}

                {/* Nota de Segurança e Capital Intacto */}
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2.5">
                  <Shield className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-slate-300 leading-relaxed">
                    <strong className="text-emerald-300">Capital 100% Protegido:</strong> Nenhuma ordem foi enviada à Binance. A compra de <strong>${session.notionalUsd} USD</strong> só será disparada quando as condições ideais forem atingidas.
                  </div>
                </div>

                {/* Alerta de Proteção Anti-Spoofing Ativa no Radar Sniper */}
                {(session.isSpoofingProtectionTriggered || (typeof session.spoofingEvasionsCount === "number" && session.spoofingEvasionsCount > 0)) && (
                  <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-start gap-2.5 shadow-[0_0_15px_rgba(16,185,129,0.15)] animate-pulse">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <div className="text-[11px] text-slate-300 leading-relaxed flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <strong className="text-emerald-300 font-semibold flex items-center gap-1.5">
                          Armadilha de Spoofing Evitada pela IA
                          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[9px] font-mono px-1.5 py-0">
                            {session.spoofingEvasionsCount || 1} {session.spoofingEvasionsCount === 1 ? "evasão" : "evasões"}
                          </Badge>
                        </strong>
                        {session.isSpoofingProtectionTriggered && (
                          <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                            Pausa de Defesa: 3s
                          </span>
                        )}
                      </div>
                      <p className="text-slate-300">
                        Queda abrupta de liquidez fantasma detectada no topo do book. O robô pausou o disparo para reavaliar a profundidade real e prevenir adverse slippage.
                      </p>
                    </div>
                  </div>
                )}

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
                                {typeof item.score === "number" ? Math.round(item.score) : item.score} pts
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

                {/* Raciocínio da IA & Order Flow L2 em Tempo Real */}
                {session.aiThoughtStream && renderThoughtStreamCard(session.aiThoughtStream)}
                {session.orderFlowMetrics && renderOrderFlowCard(session.orderFlowMetrics)}

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
                          Score IA: {typeof session.aiScore === 'number' ? Math.round(session.aiScore) : Math.round(Number(session.aiScore) || 0)}/100
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
                        {typeof session.spoofingEvasionsCount === "number" && session.spoofingEvasionsCount > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40 text-[10px] font-mono cursor-help flex items-center gap-1 shadow-[0_0_12px_rgba(16,185,129,0.25)] transition-colors"
                              >
                                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                <span>
                                  {session.spoofingEvasionsCount}{" "}
                                  {session.spoofingEvasionsCount === 1
                                    ? "Armadilha de Spoofing Evitada"
                                    : "Armadilhas de Spoofing Evitadas"}
                                </span>
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent
                              side="bottom"
                              className="max-w-xs bg-slate-900/95 border border-emerald-500/30 text-slate-200 p-2.5 shadow-2xl backdrop-blur-md"
                            >
                              <div className="space-y-1.5 text-left">
                                <div className="font-semibold text-emerald-400 flex items-center gap-1.5 text-xs">
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>Proteção Institucional Anti-Spoofing</span>
                                </div>
                                <p className="text-[11px] leading-relaxed text-slate-300">
                                  A IA detectou paredes falsas de liquidez canceladas no topo do book antes do despacho a mercado. Ao pausar temporariamente a execução por 3 segundos, a IA blindou a operação contra adverse selection e derrapagem predatória de preço.
                                </p>
                                <div className="pt-1.5 border-t border-white/[0.08] flex items-center justify-between text-[10px] font-mono">
                                  <span className="text-slate-400">Slippage Economizado:</span>
                                  <span className="text-emerald-300 font-bold">
                                    ~{(session.spoofingEvasionsCount * 0.45).toFixed(2)}% (+${((session.notionalUsd || 0) * session.spoofingEvasionsCount * 0.0045).toFixed(2)} USD)
                                  </span>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
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

                {/* Badges de Regime, Confluência MTF & Telemetria */}
                {renderRegimeBadges(
                  session.marketRegime,
                  session.multiTimeframeSummary ? { summary: session.multiTimeframeSummary } : undefined,
                  session.volatilitySizingUsd ? { recommendedAllocationUsd: session.volatilitySizingUsd } : undefined,
                  session.executionLatencyMs
                )}

                {/* Barra de Progresso Temporal */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>Progresso do Horizonte</span>
                    <span>{progressPercent.toFixed(0)}%</span>
                  </div>
                  <Progress value={progressPercent} className="h-1.5 bg-white/[0.06]" />
                </div>

                {/* Banner de Parcial Concluída: TP2 (66%) ou TP1 (33%) */}
                {session.isTp2Taken ? (
                  <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/70 via-teal-950/50 to-slate-900 border border-teal-400/50 space-y-1.5 shadow-[0_0_20px_rgba(20,184,166,0.25)] animate-in fade-in duration-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-teal-400/20 border border-teal-400/40 flex items-center justify-center">
                          <CheckCircle2 className="w-3.5 h-3.5 text-teal-300" />
                        </div>
                        <span className="text-xs font-bold text-white tracking-wide">
                          🚀 Parciais de 66% (TP1 + TP2) Garantidas no Bolso!
                        </span>
                      </div>
                      <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/40 font-mono text-[10px]">
                        +${formatPrice(session.partialRealizedPnlUsd ?? 0)} USD
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-teal-200/90 pl-8">
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      <span>
                        Trailing Stop apertado a 0.8% da máxima (${formatPrice(session.trailingStopPrice || session.stopLossPrice)}). Lucro travado no topo!
                      </span>
                    </div>
                  </div>
                ) : session.isTp1Taken ? (
                  <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/60 via-amber-950/40 to-slate-900 border border-emerald-400/40 space-y-1.5 shadow-[0_0_20px_rgba(16,185,129,0.2)] animate-in fade-in duration-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-emerald-400/20 border border-emerald-400/40 flex items-center justify-center">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                        </div>
                        <span className="text-xs font-bold text-white tracking-wide">
                          🎉 Parcial de 33% (TP1) Garantida no Bolso!
                        </span>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-mono text-[10px]">
                        +${formatPrice(session.tp1RealizedPnlUsd || session.partialRealizedPnlUsd || 0)} USD
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-200/90 pl-8">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>
                        Stop movido para <strong>Break-Even Protegido</strong> (${formatPrice(session.stopLossPrice)}). Risco zero na operação!
                      </span>
                    </div>
                  </div>
                ) : null}

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

                  {/* Grid de 4 Marcos: Preço Atual, TP1 (33%), TP2 (33%), TP3 Runner */}
                  <div className="grid grid-cols-4 gap-1.5 mt-3 pt-3 border-t border-white/[0.06] text-left">
                    <div className="bg-white/[0.02] p-1.5 rounded-lg">
                      <span className="text-[9px] text-slate-400 block truncate">Preço Atual</span>
                      <span className="text-xs font-mono font-bold text-white">${formatPrice(session.currentPrice)}</span>
                    </div>
                    <div className={cn(
                      "p-1.5 rounded-lg border",
                      session.isTp1Taken
                        ? (session as any).isSkewGateActive
                          ? "bg-violet-500/15 border-violet-500/30"
                          : "bg-emerald-500/15 border-emerald-500/30"
                        : "bg-white/[0.02] border-white/[0.05]"
                    )}>
                      <span className={cn(
                        "text-[9px] block truncate flex items-center gap-0.5",
                        (session as any).isSkewGateActive ? "text-violet-400 font-semibold" : "text-emerald-400"
                      )} title={(session as any).isSkewGateActive ? `Order Book Skew Gate: 50% liquidado devido a pressão vendedora L2 (Bid/Ask ${(session as any).orderBookSkewRatio?.toFixed(2) ?? '0.40'} <= 0.40)` : "Alvo TP1: Realização parcial"}>
                        TP1 ({(session as any).isSkewGateActive ? "50% ⚡" : "33%"}) {session.isTp1Taken && "✓"}
                      </span>
                      <span className={cn(
                        "text-xs font-mono font-bold",
                        (session as any).isSkewGateActive ? "text-violet-300" : "text-emerald-300"
                      )}>
                        ${formatPrice(session.tp1Price || session.partialTargetPrice || session.targetPrice)}
                      </span>
                    </div>
                    <div className={cn(
                      "p-1.5 rounded-lg border",
                      session.isTp2Taken
                        ? (session as any).isCvdExhaustionTriggered
                          ? "bg-amber-500/15 border-amber-500/30"
                          : "bg-teal-500/15 border-teal-500/30"
                        : session.targetRecalibration?.isRecalibrated
                        ? "bg-amber-500/10 border-amber-500/30"
                        : "bg-white/[0.02] border-white/[0.05]"
                    )}>
                      <span className={cn(
                        "text-[9px] block truncate flex items-center gap-0.5",
                        (session as any).isCvdExhaustionTriggered
                          ? "text-amber-400 font-semibold"
                          : session.targetRecalibration?.isRecalibrated
                          ? "text-amber-400 font-semibold"
                          : "text-teal-400"
                      )} title={
                        (session as any).isCvdExhaustionTriggered
                          ? `Filtro de Desaceleração de Momentum (CVD Exhaustion): TP2 antecipado a mercado a menos de 0.20% do alvo por divergência de volume comprador (CVD Delta ${(session as any).cvdDeltaAtTp2Pct?.toFixed(2) ?? 'negativo'}%)`
                          : session.targetRecalibration?.reason
                      }>
                        TP2 ({
                          (session as any).isCvdExhaustionTriggered
                            ? "Antecipado ⚡"
                            : session.targetRecalibration?.isRecalibrated
                            ? "1.7x 🎯"
                            : "33%"
                        }) {session.isTp2Taken && "✓"}
                      </span>
                      <span className={cn(
                        "text-xs font-mono font-bold",
                        (session as any).isCvdExhaustionTriggered
                          ? "text-amber-300"
                          : session.targetRecalibration?.isRecalibrated
                          ? "text-amber-300"
                          : "text-teal-300"
                      )}>
                        ${formatPrice(session.tp2Price || session.targetPrice * 0.99)}
                      </span>
                    </div>
                    <div className={cn(
                      "p-1.5 rounded-lg border",
                      (session as any).isRunnerClimaxTighteningActive
                        ? "bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20"
                        : (session as any).isRunnerAccelerationActive
                        ? "bg-purple-500/10 border-purple-500/30 ring-1 ring-purple-500/20"
                        : (session as any).isTp3HardFloorActive
                        ? "bg-cyan-500/10 border-cyan-500/30 ring-1 ring-cyan-500/20"
                        : "bg-white/[0.02] border-white/[0.05]"
                    )}>
                      <span className={cn(
                        "text-[9px] block truncate flex items-center gap-0.5",
                        (session as any).isRunnerClimaxTighteningActive
                          ? "text-emerald-300 font-semibold"
                          : (session as any).isRunnerAccelerationActive
                          ? "text-purple-300 font-semibold"
                          : (session as any).isTp3HardFloorActive
                          ? "text-cyan-300 font-semibold"
                          : "text-cyan-400"
                      )} title={
                        (session as any).isRunnerClimaxTighteningActive
                          ? `Clímax do Runner Travado: Trailing Stop apertado para 0.5% da máxima após exaustão volumétrica`
                          : (session as any).isRunnerAccelerationActive
                          ? `Aceleração do Runner: Trailing afrouxado para 1.2% sob Spike de Volume (${(session as any).runnerVolumeRatio ?? '2.5'}x) e Upper BB, com piso rígido garantido`
                          : (session as any).isTp3HardFloorActive
                          ? `TP3 Hard Floor Ativo: Piso irrevogável travado em $${formatPrice((session as any).tp3HardFloorPrice)} (+${(session as any).tp3HardFloorPct ?? 1.0}% acima da entrada)`
                          : undefined
                      }>
                        TP3 Runner {
                          (session as any).isRunnerClimaxTighteningActive
                            ? "(Clímax 🔒)"
                            : (session as any).isRunnerAccelerationActive
                            ? "(Aceleração 🚀)"
                            : (session as any).isTp3HardFloorActive
                            ? "(Piso 🛡️)"
                            : ""
                        }
                      </span>
                      <span className="text-xs font-mono font-bold text-cyan-300">
                        ${formatPrice(session.tp3Price || session.targetPrice)}
                      </span>
                    </div>
                  </div>

                  {/* Linha de Proteção Dinâmica */}
                  <div className="mt-2 pt-2 border-t border-white/[0.04] flex items-center justify-between text-[10px] font-mono px-1">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Shield className={cn(
                        "w-3 h-3",
                        (session as any).isRunnerClimaxTighteningActive
                          ? "text-emerald-400 animate-pulse"
                          : (session as any).isRunnerAccelerationActive
                          ? "text-purple-400 animate-pulse"
                          : (session as any).isTp3HardFloorActive
                          ? "text-cyan-400 animate-pulse"
                          : (session as any).isAggressiveBreakEvenActive
                          ? "text-amber-400 animate-pulse"
                          : "text-emerald-400"
                      )} />
                      {(session as any).isRunnerClimaxTighteningActive ? (
                        <span className="text-emerald-300 font-semibold flex items-center gap-1">
                          Trailing Clímax (-0.5% 🔒):
                          <span className="text-[9px] text-emerald-400/80 font-normal">
                            (Piso ${formatPrice((session as any).tp3HardFloorPrice)})
                          </span>
                        </span>
                      ) : (session as any).isRunnerAccelerationActive ? (
                        <span className="text-purple-300 font-semibold flex items-center gap-1">
                          Trailing Aceleração (-1.2% 🚀):
                          <span className="text-[9px] text-purple-400/80 font-normal">
                            (Vol {(session as any).runnerVolumeRatio ?? '2.5'}x)
                          </span>
                        </span>
                      ) : (session as any).isTp3HardFloorActive ? (
                        <span className="text-cyan-300 font-semibold flex items-center gap-1">
                          TP3 Hard Floor (+{(session as any).tp3HardFloorPct ?? 1.0}% min 🛡️):
                          <span className="text-[9px] text-cyan-400/80 font-normal">
                            (Piso ${formatPrice((session as any).tp3HardFloorPrice)})
                          </span>
                        </span>
                      ) : (session as any).isAggressiveBreakEvenActive ? (
                        <span className="text-amber-300 font-semibold flex items-center gap-1">
                          Break-Even Agressivo (+0.60% 🛡️):
                          <span className="text-[9px] text-amber-400/80 font-normal">
                            (MAE {(session as any).initialMaeAtTp1Pct ?? -0.6}%)
                          </span>
                        </span>
                      ) : session.trailingStopPrice ? (
                        "Trailing Stop Ativo:"
                      ) : session.breakEvenProtected ? (
                        "Break-Even Protegido (+0.35%):"
                      ) : (
                        "Stop Loss Inicial:"
                      )}
                    </span>
                    <span className={cn(
                      "font-bold",
                      (session as any).isRunnerClimaxTighteningActive
                        ? "text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                        : (session as any).isRunnerAccelerationActive
                        ? "text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                        : (session as any).isTp3HardFloorActive
                        ? "text-cyan-300 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]"
                        : (session as any).isAggressiveBreakEvenActive
                        ? "text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                        : session.breakEvenProtected
                        ? "text-emerald-300"
                        : "text-rose-300"
                    )}>
                      ${formatPrice(session.trailingStopPrice || session.stopLossPrice)}
                    </span>
                  </div>
                </div>

                {/* Mini-Gráfico SVG de Trajetória e Alvos Dinâmicos */}
                {renderMiniTrajectoryChart(
                  session.priceHistory,
                  session.entryPrice,
                  session.tp1Price || session.partialTargetPrice,
                  session.tp2Price,
                  session.tp3Price || session.targetPrice,
                  session.trailingStopPrice || session.stopLossPrice,
                  session.currentPrice,
                  session.vwapPrice,
                  session.spoofingEvents,
                  session.spoofingEvasionsCount
                )}

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
                                {typeof item.score === "number" ? Math.round(item.score) : item.score} pts
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

                {/* Nota de Auditoria no Fim do Scroll */}
                <div className="pt-2 pb-1 text-center">
                  <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] text-[10px] text-slate-400 flex items-center justify-center gap-1.5 font-mono">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Execução protegida por Trailing Stop & Circuit Breaker institucional</span>
                  </div>
                </div>
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
                      {session.isPartialProfitTaken && (
                        <div className="flex justify-between text-slate-400">
                          <span>Parcial de 50% Garantida:</span>
                          <strong className="text-emerald-400 font-mono">
                            +${formatPrice(session.partialRealizedPnlUsd ?? 0)} USD (Garantido no Bolso)
                          </strong>
                        </div>
                      )}
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
                      {typeof session.spoofingEvasionsCount === "number" && session.spoofingEvasionsCount > 0 && (
                        <div className="flex justify-between items-center text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Armadilhas de Spoofing Evitadas:</span>
                          </span>
                          <div className="flex items-center gap-1.5 font-mono">
                            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px]">
                              {session.spoofingEvasionsCount} {session.spoofingEvasionsCount === 1 ? "evasão" : "evasões"}
                            </Badge>
                            <span className="text-[11px] text-emerald-400 font-bold">
                              (~${((session.notionalUsd || 0) * session.spoofingEvasionsCount * 0.0045).toFixed(2)} USD preservados)
                            </span>
                          </div>
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

                    {/* Mini-Gráfico SVG de Trajetória Consolidada com Marcador de Spoofing */}
                    {session.priceHistory && session.priceHistory.length >= 2 && (
                      renderMiniTrajectoryChart(
                        session.priceHistory,
                        session.entryPrice,
                        session.tp1Price || session.partialTargetPrice,
                        session.tp2Price,
                        session.tp3Price || session.targetPrice,
                        session.trailingStopPrice || session.stopLossPrice,
                        session.currentPrice,
                        session.vwapPrice,
                        session.spoofingEvents,
                        session.spoofingEvasionsCount
                      )
                    )}

                    {/* Auto-Reflexão Pós-Trade da IA & MFE/MAE Tearsheet */}
                    {session.postTradeJournal && (
                      <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/20 space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="flex items-center gap-1.5 text-purple-300">
                            <Brain className="w-3.5 h-3.5 text-purple-400" />
                            Auto-Reflexão Pós-Trade da IA (AI Journal)
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-mono font-bold",
                              session.postTradeJournal.rating === "OPTIMAL"
                                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                                : session.postTradeJournal.rating === "ACCEPTABLE"
                                ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
                                : session.postTradeJournal.rating === "DEFENSIVE_EXIT"
                                ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                                : "bg-rose-500/10 text-rose-300 border-rose-500/30"
                            )}
                          >
                            Classificação: {session.postTradeJournal.rating}
                          </Badge>
                        </div>

                        {/* Métricas de Eficiência e Excursão */}
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="p-2 rounded-lg bg-black/40 border border-white/[0.05]">
                            <span className="text-[10px] text-slate-400 block">Pico MFE (Máx)</span>
                            <strong className="text-emerald-400 font-mono">
                              +{session.postTradeJournal.mfePercent}%
                            </strong>
                          </div>
                          <div className="p-2 rounded-lg bg-black/40 border border-white/[0.05]">
                            <span className="text-[10px] text-slate-400 block">Recuo MAE (Pior)</span>
                            <strong className="text-rose-400 font-mono">
                              {session.postTradeJournal.maePercent}%
                            </strong>
                          </div>
                          <div className="p-2 rounded-lg bg-black/40 border border-white/[0.05]">
                            <span className="text-[10px] text-slate-400 block">Eficiência de Saída</span>
                            <strong className="text-cyan-400 font-mono">
                              {session.postTradeJournal.exitEfficiencyPct}%
                            </strong>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-300 leading-relaxed bg-black/30 p-2.5 rounded-lg border border-white/[0.04] italic">
                          "{session.postTradeJournal.aiReflection}"
                        </p>

                        {session.postTradeJournal.lessonsLearned && session.postTradeJournal.lessonsLearned.length > 0 && (
                          <div className="space-y-1 text-[10px] text-slate-400">
                            <span className="font-semibold text-slate-300">Lições Institucionais:</span>
                            <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                              {session.postTradeJournal.lessonsLearned.map((lesson, idx) => (
                                <li key={idx} className="text-slate-300">{lesson}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
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

        {/* Rodapé Fixo Institucional (Sticky Footer) para Trade Ativo */}
        {state === "ACTIVE" && session && (
          <div className={cn(
            "shrink-0 p-3 sm:px-6 bg-[#0b0f19]/95 backdrop-blur-md border-t border-white/[0.08] z-20 transition-all duration-300",
            hasLongScroll && !isAtBottom
              ? "shadow-[0_-12px_28px_rgba(0,0,0,0.7)] border-t-cyan-500/30"
              : "shadow-[0_-6px_16px_rgba(0,0,0,0.4)]"
          )}>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
              {/* Telemetria Compacta */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[11px] font-mono font-bold text-slate-200">
                    {session.symbol.replace("USDT", "")}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    ${formatPrice(session.currentPrice)}
                  </span>
                </div>
                <div className="h-3 w-px bg-white/10 hidden sm:block" />
                <div className="flex items-center gap-1.5 font-mono text-xs">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Lucro:</span>
                  <span className={cn(
                    "font-bold px-1.5 py-0.5 rounded text-[11px]",
                    session.unrealizedPnlUsd >= 0
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                  )}>
                    {session.unrealizedPnlUsd >= 0 ? "+" : ""}${formatPrice(session.unrealizedPnlUsd)} ({session.unrealizedPnlPercent >= 0 ? "+" : ""}{session.unrealizedPnlPercent.toFixed(2)}%)
                  </span>
                </div>
                {session.trailingStopPrice && (
                  <>
                    <div className="h-3 w-px bg-white/10 hidden sm:block" />
                    <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                      <span>Stop:</span>
                      <span className="text-amber-300 font-bold">${formatPrice(session.trailingStopPrice)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Botão de Encerramento Fixo */}
              <Button
                onClick={() => handleCloseSession("MANUAL_CLOSE")}
                disabled={isClosing}
                variant="outline"
                className="w-full sm:w-auto h-9 px-4 border-rose-500/30 bg-rose-500/15 hover:bg-rose-500/30 hover:border-rose-500/60 text-rose-200 hover:text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md shrink-0 flex items-center justify-center gap-1.5"
              >
                {isClosing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                ) : (
                  <Shield className="w-3.5 h-3.5 text-rose-400" />
                )}
                <span>Encerrar e Consolidar Resultado Agora</span>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
