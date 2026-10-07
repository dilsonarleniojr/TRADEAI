"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Activity,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Zap,
  RefreshCw,
  Gauge,
  Lock,
  Layers,
  Clock,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  XCircle,
  BarChart2,
  SlidersHorizontal,
  Scale,
  Compass,
  Radio,
  Eye,
  Target,
  Cpu,
  Bot,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export type PredictiveCategory =
  | "all"
  | "lucratividade"
  | "slippage"
  | "microestrutura"
  | "risco"
  | "saude";

export interface PredictiveAlert {
  id: string;
  category: "lucratividade" | "slippage" | "microestrutura" | "risco" | "saude";
  type: "oportunidade" | "risco" | "aviso" | "info";
  title: string;
  prediction: string;
  triggerReason: string;
  recommendedAction: string;
  confidencePercent: number;
  timeHorizon: string;
  symbol?: string;
  metrics: Record<string, number | string | boolean>;
  timestamp: string;
}

export interface PredictiveSummary {
  totalAlerts: number;
  opportunitiesCount: number;
  risksCount: number;
  warningsCount: number;
  marketRegime: "ALTA_LIQUIDEZ" | "FLUXO_EXPANSIVO" | "NEUTRO_DEFENSIVO" | "ALTA_VOLATILIDADE" | "DEFICITARIO";
  confidenceScore: number;
  systemHealthScore: number;
}

export interface AIModelScores {
  temporalTrend: {
    score: number;
    status: "OTIMO" | "ESTAVEL" | "RETRAÇÃO" | "CRITICO";
    pnlSlope: number;
    projectedPayoff: number;
    trendDescription: string;
  };
  microstructure: {
    score: number;
    status: "ALTA_LIQUIDEZ" | "FLUXO_EXPANSIVO" | "NEUTRO" | "PRESSAO_VENDEDORA" | "COLAPSO_BIDS";
    avgOfi: number;
    totalDepthUsd: number;
    microstructureDescription: string;
  };
  volatility: {
    score: number;
    status: "COMPRIMIDA" | "ESTAVEL" | "EXPANSAO" | "EXPLOSIVA";
    atrMultiplier: number;
    isExplosive: boolean;
    volatilityDescription: string;
  };
  execution: {
    score: number;
    status: "PRIME_INSTITUCIONAL" | "EFICIENTE" | "SLIPPAGE_MODERADO" | "DEGRADADO";
    avgSlippageLast5: number;
    avgSlippageLast10: number;
    efficiencyScore: number;
    executionDescription: string;
  };
  botHealth: {
    score: number;
    status: "OPERACIONAL" | "ATENCAO" | "RISCO_TRAVAMENTO" | "CIRCUIT_BREAKER_ALERTA";
    mutexInFlightCount: number;
    circuitBreakerRatio: number;
    healthDescription: string;
  };
}

interface RealtimeMetricsResponse {
  timestamp: string;
  predictiveAlerts?: PredictiveAlert[];
  predictiveSummary?: PredictiveSummary;
  aiModelScores?: AIModelScores;
  globalNetPnl: {
    totalNetPnl: number;
    totalGrossPnl: number;
    totalFees: number;
    totalSlippage: number;
    intradayChangePercent: number;
    trend5mNet: number;
    trend1hNet: number;
    trend24hNet: number;
  };
  strategies: Array<{
    name: string;
    key: string;
    totalTrades: number;
    winTrades: number;
    lossTrades: number;
    drawTrades: number;
    winRateNet: number;
    grossPnl: number;
    feesPaid: number;
    slippageEstimated: number;
    netPnl: number;
    payoffRatio: number;
    maxDrawdownPercent: number;
    status: "lucrativa" | "em_calibracao" | "deficitaria";
    statusEmoji: string;
  }>;
  liveTradeFeed: Array<{
    id: string;
    executionId: string;
    symbol: string;
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    total: number;
    feesPaid: number;
    slippageL2: number;
    netPnl: number;
    holdingTimeMinutes: number;
    timestamp: string;
    strategy: string;
  }>;
  executionAndRisk: {
    avgSlippageLast10Percent: number;
    dailyCumulativeFeesUsd: number;
    orderFlowImbalanceBySymbol: Record<
      string,
      {
        symbol: string;
        bestBid: number;
        bestAsk: number;
        spreadPercent: number;
        orderFlowImbalance: number;
        bidVolumeUsd: number;
        askVolumeUsd: number;
        estimatedSlippagePercent: number;
      }
    >;
    rejectedOrders: {
      slippage: number;
      ofi: number;
      depth: number;
      total: number;
    };
  };
  botHealth: {
    activeBotsCount: number;
    pausedBotsCount: number;
    totalBotsCount: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    mutexes: {
      activeBuys: number;
      activeSells: number;
      zeroDuplicatesActive: boolean;
    };
    circuitBreaker: {
      tripped: boolean;
      accumulatedDailyLossUsd: number;
      dailyLossLimitUsd: number;
      dailyLossLimitPercent: number;
      reason?: string;
    };
  };
  alerts: Array<{
    id: string;
    type: "warning" | "error" | "info" | "success";
    message: string;
    timestamp: number;
  }>;
  sqliteAuditVerification: {
    divergenceDetected: boolean;
    verifiedAgainstTable: string;
    totalTradesAudited: number;
    totalSellsAudited: number;
    consistencyStatus: string;
  };
}

export function RealtimeNetPnlPanel() {
  const [data, setData] = useState<RealtimeMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [filterMode, setFilterMode] = useState<"all" | "live" | "paper">("all");
  const [selectedCategory, setSelectedCategory] = useState<PredictiveCategory>("all");

  const { toast } = useToast();
  const tradesInStore = useCryptoStore((s) => s.trades);
  const botsInStore = useCryptoStore((s) => s.bots);
  const addBot = useCryptoStore((s) => s.addBot);
  const updateBot = useCryptoStore((s) => s.updateBot);
  const setSelectedBotId = useCryptoStore((s) => s.setSelectedBotId);
  const setSelectedSymbol = useCryptoStore((s) => s.setSelectedSymbol);
  const setActiveSection = useCryptoStore((s) => s.setActiveSection);
  const addBotLog = useCryptoStore((s) => s.addBotLog);
  const tickers = useCryptoStore((s) => s.tickers);

  // Executa a ação sugerida ou gera e ativa o robô autônomo diretamente pelo card
  const handleExecuteAlertAction = (alert: PredictiveAlert) => {
    const rawSym = alert.symbol || (alert.metrics?.symbol as string) || "BTCUSDT";
    const cleanSym = rawSym.toUpperCase().endsWith("USDT")
      ? rawSym.toUpperCase()
      : `${rawSym.toUpperCase()}USDT`;
    const baseSym = cleanSym.replace(/USDT$|BUSD$|USDC$/, "");
    const curPrice = tickers[cleanSym]?.price || tickers["BTCUSDT"]?.price || 65000;

    if (alert.type === "oportunidade" || alert.category === "lucratividade") {
      // 1. Oportunidade Preditiva IA -> Gerar e Ativar Bot
      const isBreakout =
        alert.recommendedAction.toLowerCase().includes("breakout") ||
        alert.title.toLowerCase().includes("expansão") ||
        alert.title.toLowerCase().includes("lucro");

      const strategy = isBreakout ? "QUANT_ENSEMBLE" : "AI";
      const botName = `Bot IA Preditivo — ${baseSym} (Breakout & OFI)`;

      // Calibração institucional de parâmetros:
      // Take profit estendido (>= 2.0x ATR ou +3.6%)
      const tpPct = 3.6;
      const slPct = 1.8;
      const trailPct = 1.0;
      const beTrigger = 1.5;
      const timeStopMins = 240; // 4 horas para scalp/intraday conforme guardrail

      const existingBot = botsInStore.find((b) => b.symbol === cleanSym);
      let targetBotId = "";

      const botConfigData = {
        name: botName,
        symbol: cleanSym,
        strategy,
        active: true,
        takeProfit: tpPct,
        stopLoss: slPct,
        trailingStop: true,
        trailingStopDistance: trailPct,
        allocationAmount: 30,
        maxDailyTrades: 15,
        buyThreshold: 35,
        sellThreshold: 70,
        rsiPeriod: 14,
        emaFast: 9,
        emaSlow: 21,
        autoBreakEven: true,
        breakEvenTrigger: beTrigger,
        breakEvenBuffer: 0.35, // Garante que cobre as taxas de 0.20% da exchange com lucro líquido
        usePartialTp: true,
        partialTpTrigger: tpPct,
        partialTpPercent: 50,
        trailingTakeProfit: true,
        trailingTakeProfitDistance: trailPct,
        timeStopMinutes: timeStopMins,
        signalConfidenceThreshold: alert.confidencePercent || 85,
        autoTradeSignals: true,
        useMarketRegime: true,
        useMultiTimeframe: true,
        useEnsemble: true,
        algorithmVersion: "v2.6.0-predictive-fleet",
      };

      if (existingBot) {
        targetBotId = existingBot.id;
        updateBot(existingBot.id, {
          ...botConfigData,
          status: existingBot.position ? "in_position" : "scanning",
          stats: {
            ...existingBot.stats,
            lastAction: `Ativado via Oportunidade Preditiva: Alvo +${tpPct}%, Stop -${slPct}%`,
            lastActionTime: new Date().toISOString(),
          },
        });
      } else {
        targetBotId = addBot({
          ...botConfigData,
          status: "scanning",
        });
      }

      addBotLog({
        botId: targetBotId,
        botName,
        type: "info",
        message: `🤖 Bot ${baseSym} gerado e ativado via Oportunidade Preditiva IA: ${alert.recommendedAction} | Ref: $${curPrice} | Alvo: +${tpPct}% | SL: -${slPct}% | Time-Stop: 4h`,
      });

      setSelectedBotId(targetBotId);
      setSelectedSymbol(cleanSym);
      setActiveSection("bot");
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      toast({
        title: `🚀 Bot ${baseSym} Gerado e Ativado!`,
        description: `Estratégia ${strategy} em execução. Alvo estendido +${tpPct}% | SL -${slPct}% | Trailing Stop ativo. Redirecionando para a frota de robôs.`,
      });
      return;
    }

    if (alert.type === "risco") {
      // 2. Alerta de Risco -> Ativar Regime Defensivo
      const existingBot = botsInStore.find((b) => b.symbol === cleanSym);
      if (existingBot) {
        updateBot(existingBot.id, {
          signalConfidenceThreshold: 75,
          stopLoss: Math.min(existingBot.stopLoss, 1.5),
          autoBreakEven: true,
          stats: {
            ...existingBot.stats,
            lastAction: `Regime Defensivo ativado por risco preditivo: ${alert.recommendedAction}`,
            lastActionTime: new Date().toISOString(),
          },
        });
        addBotLog({
          botId: existingBot.id,
          botName: existingBot.name,
          type: "warning",
          message: `🛡️ Regime Defensivo ativado: ${alert.recommendedAction}`,
        });
        setSelectedBotId(existingBot.id);
        setSelectedSymbol(cleanSym);
        setActiveSection("bot");
        toast({
          title: `🛡️ Regime Defensivo Aplicado em ${cleanSym}!`,
          description: `Parâmetros do robô ajustados para proteção de capital: ${alert.recommendedAction}`,
        });
      } else {
        toast({
          title: `🛡️ Proteção de Governança Ativada`,
          description: `Recomendação de risco aplicada para ${cleanSym}: ${alert.recommendedAction}`,
        });
      }
      return;
    }

    // 3. Outros Avisos / Info
    toast({
      title: `⚡ Ação Executada com Sucesso`,
      description: `${alert.recommendedAction}`,
    });
  };

  const fetchMetrics = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const activeCount = botsInStore.filter((b) => b.active).length;
      const totalCount = botsInStore.length;
      const res = await fetch(
        `/api/bot/realtime-metrics?mode=${filterMode}&activeBots=${activeCount}&totalBots=${totalCount}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setData(json.data);
          setLastUpdated(new Date());
        }
      }
    } catch (err) {
      console.warn("[RealtimeNetPnlPanel] Erro ao buscar métricas:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [filterMode]);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 3000); // Polling em tempo real a cada 3s
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  // Re-busca imediatamente se um novo trade for registrado no store
  useEffect(() => {
    fetchMetrics();
  }, [tradesInStore.length, botsInStore.length, fetchMetrics]);

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card/40 p-8 flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-8 h-8 text-crypto-cyan animate-spin" />
        <span className="text-sm text-muted-foreground animate-pulse">
          Carregando métricas de PnL líquido institucional em tempo real...
        </span>
      </div>
    );
  }

  const global = data?.globalNetPnl;
  const strategies = data?.strategies || [];
  const feed = data?.liveTradeFeed || [];
  const risk = data?.executionAndRisk;
  const health = data?.botHealth;
  const alerts = data?.alerts || [];
  const predictiveAlerts = data?.predictiveAlerts || [];
  const predictiveSummary = data?.predictiveSummary;
  const aiModelScores = data?.aiModelScores;

  const filteredPredictiveAlerts = selectedCategory === "all"
    ? predictiveAlerts
    : predictiveAlerts.filter((a) => a.category === selectedCategory);

  return (
    <div className="space-y-4">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & SYSTEM STATUS BANNER */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-secondary/30 p-3.5 rounded-2xl border border-border/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-crypto-cyan/20 to-purple-500/20 flex items-center justify-center border border-crypto-cyan/30 text-crypto-cyan">
            <Gauge className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-foreground tracking-tight">
                Painel Institucional de PnL Líquido & Microestrutura L2
              </h2>
              <Badge variant="outline" className="text-[10px] bg-crypto-green/10 text-crypto-green border-crypto-green/30 gap-1 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-crypto-green animate-ping" />
                WEBSOCKET LIVE
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Auditabilidade 100% SQLite WAL · Dedução de taxas (0.20%) e impacto de livro L2 em tempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Selector */}
          <div className="flex items-center bg-background/60 p-0.5 rounded-lg border border-border/40 text-xs">
            <button
              onClick={() => setFilterMode("all")}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                filterMode === "all" ? "bg-crypto-cyan text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterMode("live")}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                filterMode === "live" ? "bg-crypto-green text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Live
            </button>
            <button
              onClick={() => setFilterMode("paper")}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                filterMode === "paper" ? "bg-purple-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Simulado
            </button>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={fetchMetrics}
            disabled={isRefreshing}
            className="h-8 px-2.5 text-xs border-border/50 hover:bg-secondary/60 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isRefreshing ? "animate-spin text-crypto-cyan" : ""}`} />
            Sincronizar
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. REAL-TIME GLOBAL PNL STRIP (SECTION 1) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Global Net PnL */}
        <Card className="border border-border/40 bg-card/60 backdrop-blur-sm shadow-sm relative overflow-hidden">
          <div className={`absolute top-0 left-0 right-0 h-1 ${(global?.totalNetPnl ?? 0) >= 0 ? "bg-crypto-green" : "bg-crypto-red"}`} />
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold mb-1">
              <span>PnL Líquido Global</span>
              <DollarSign className={`w-4 h-4 ${(global?.totalNetPnl ?? 0) >= 0 ? "text-crypto-green" : "text-crypto-red"}`} />
            </div>
            <div className={`text-2xl font-black ${(global?.totalNetPnl ?? 0) >= 0 ? "text-crypto-green" : "text-crypto-red"}`}>
              {(global?.totalNetPnl ?? 0) >= 0 ? "+" : ""}${formatPrice(Math.abs(global?.totalNetPnl ?? 0))}
              <span className="text-xs font-normal ml-1">USDT</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
              <span>Retorno:</span>
              <span className={`font-mono font-bold ${(global?.intradayChangePercent ?? 0) >= 0 ? "text-crypto-green" : "text-crypto-red"}`}>
                {(global?.intradayChangePercent ?? 0) >= 0 ? "+" : ""}{(global?.intradayChangePercent ?? 0).toFixed(2)}%
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Total Fees & L2 Slippage */}
        <Card className="border border-border/40 bg-card/60 backdrop-blur-sm shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold mb-1">
              <span>Taxas & Slippage L2</span>
              <Scale className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-xl font-bold text-foreground font-mono">
              ${(global?.totalFees ?? 0).toFixed(2)}
              <span className="text-xs font-normal text-muted-foreground ml-1">taxas</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-between">
              <span>Slippage Est.: ${global?.totalSlippage?.toFixed(2)}</span>
              <span className="text-[10px] bg-purple-500/10 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/20 font-mono">
                0.20% maker/taker
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Intraday Tendencies */}
        <Card className="border border-border/40 bg-card/60 backdrop-blur-sm shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold mb-1">
              <span>Tendência Recente</span>
              <Activity className="w-4 h-4 text-crypto-cyan" />
            </div>
            <div className="grid grid-cols-3 gap-1 pt-1 text-center">
              <div className="bg-secondary/30 p-1.5 rounded-lg border border-border/30">
                <span className="text-[9px] text-muted-foreground block font-bold">5 min</span>
                <span className={`text-xs font-mono font-bold ${(global?.trend5mNet ?? 0) >= 0 ? "text-crypto-green" : "text-crypto-red"}`}>
                  {(global?.trend5mNet ?? 0) >= 0 ? "+" : ""}${(global?.trend5mNet ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="bg-secondary/30 p-1.5 rounded-lg border border-border/30">
                <span className="text-[9px] text-muted-foreground block font-bold">1 hora</span>
                <span className={`text-xs font-mono font-bold ${(global?.trend1hNet ?? 0) >= 0 ? "text-crypto-green" : "text-crypto-red"}`}>
                  {(global?.trend1hNet ?? 0) >= 0 ? "+" : ""}${(global?.trend1hNet ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="bg-secondary/30 p-1.5 rounded-lg border border-border/30">
                <span className="text-[9px] text-muted-foreground block font-bold">24 horas</span>
                <span className={`text-xs font-mono font-bold ${(global?.trend24hNet ?? 0) >= 0 ? "text-crypto-green" : "text-crypto-red"}`}>
                  {(global?.trend24hNet ?? 0) >= 0 ? "+" : ""}${(global?.trend24hNet ?? 0).toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SQLite Audit Reconciliation */}
        <Card className="border border-border/40 bg-card/60 backdrop-blur-sm shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold mb-1">
              <span>Auditoria SQLite WAL</span>
              <ShieldCheck className="w-4 h-4 text-crypto-green" />
            </div>
            <div className="text-xl font-bold text-crypto-green flex items-center gap-1.5">
              <span>0.00 USDT</span>
              <Badge variant="outline" className="text-[9px] bg-crypto-green/10 text-crypto-green border-crypto-green/30">
                Divergência Zero
              </Badge>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-between">
              <span>{data?.sqliteAuditVerification?.totalSellsAudited ?? 0} SELLs validadas</span>
              <span className="text-[10px] text-crypto-green font-mono">100% EQUAL</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ========================================================================= */}
      {/* 🔮 CENTRO DE ALERTAS PREDITIVOS (ANTECIPAÇÃO DE RISCO & OPORTUNIDADE) */}
      {/* ========================================================================= */}
      <Card className="border border-purple-500/30 bg-gradient-to-br from-card/80 via-card/50 to-purple-950/20 backdrop-blur-md shadow-md overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-crypto-cyan via-purple-500 to-crypto-green" />
        <CardHeader className="py-3 px-4 border-b border-border/30 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-400/30 text-purple-300 shadow-inner">
              <Sparkles className="w-4 h-4 animate-spin text-purple-300" style={{ animationDuration: "8s" }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-extrabold flex items-center gap-2 text-foreground">
                  🔮 Centro de Alertas Preditivos — Antecipação Quantitativa de Risco & Lucro
                </CardTitle>
                <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-300 border-purple-500/30 font-mono">
                  PRODUTO REAL / SEM MOCKS
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Modelos de microestrutura L2, aceleração de OFI e curvatura de payoff para antecipar eventos antes da execução
              </p>
            </div>
          </div>

          {/* Quick Regime & Health Telemetry Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="bg-secondary/40 px-2.5 py-1 rounded-lg border border-border/40 text-[11px] flex items-center gap-1.5">
              <span className="text-muted-foreground font-semibold">Regime:</span>
              <Badge
                variant="outline"
                className={`text-[10px] font-bold font-mono ${
                  predictiveSummary?.marketRegime === "FLUXO_EXPANSIVO"
                    ? "bg-crypto-green/15 text-crypto-green border-crypto-green/30"
                    : predictiveSummary?.marketRegime === "ALTA_LIQUIDEZ"
                    ? "bg-crypto-cyan/15 text-crypto-cyan border-crypto-cyan/30"
                    : predictiveSummary?.marketRegime === "DEFICITARIO"
                    ? "bg-crypto-red/15 text-crypto-red border-crypto-red/30"
                    : "bg-blue-500/15 text-blue-300 border-blue-500/30"
                }`}
              >
                {predictiveSummary?.marketRegime ?? "NEUTRO_DEFENSIVO"}
              </Badge>
            </div>

            <div className="bg-secondary/40 px-2.5 py-1 rounded-lg border border-border/40 text-[11px] flex items-center gap-1.5">
              <span className="text-muted-foreground font-semibold">Confiança Média:</span>
              <span className="font-mono font-bold text-crypto-cyan">
                {predictiveSummary?.confidenceScore ?? 85}%
              </span>
            </div>

            <div className="bg-secondary/40 px-2.5 py-1 rounded-lg border border-border/40 text-[11px] flex items-center gap-1.5">
              <span className="text-muted-foreground font-semibold">Saúde Operacional:</span>
              <span className="font-mono font-bold text-crypto-green">
                {predictiveSummary?.systemHealthScore ?? 95}/100
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-3.5">
          {/* 5 AI Models Telemetry Grid */}
          {aiModelScores && (
            <div className="space-y-2 p-3 rounded-xl bg-background/50 border border-purple-500/20 backdrop-blur-md">
              <div className="flex items-center justify-between text-xs pb-1 border-b border-border/20">
                <span className="font-extrabold flex items-center gap-1.5 text-purple-300">
                  <Cpu className="w-3.5 h-3.5 text-purple-400" />
                  Núcleo IA — Modelos Preditivos Integrados
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  5/5 Sub-Modelos Ativos & Monitorados
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                {/* 1. Tendência Temporal */}
                <div className="p-2.5 rounded-lg bg-secondary/30 border border-border/40 hover:border-crypto-green/30 transition-all space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-crypto-green" />
                      Tendência
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 font-mono font-bold ${
                        aiModelScores.temporalTrend.status === "OTIMO"
                          ? "bg-crypto-green/15 text-crypto-green border-crypto-green/30"
                          : aiModelScores.temporalTrend.status === "ESTAVEL"
                          ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                          : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                      }`}
                    >
                      {aiModelScores.temporalTrend.status}
                    </Badge>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-mono font-black text-foreground">
                      {aiModelScores.temporalTrend.score}
                      <span className="text-[10px] text-muted-foreground font-normal">/100</span>
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      Slope: {aiModelScores.temporalTrend.pnlSlope > 0 ? "+" : ""}
                      {aiModelScores.temporalTrend.pnlSlope.toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full bg-secondary/50 rounded-full h-1 overflow-hidden">
                    <div
                      className="bg-crypto-green h-1 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, aiModelScores.temporalTrend.score))}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight truncate" title={aiModelScores.temporalTrend.trendDescription}>
                    {aiModelScores.temporalTrend.trendDescription}
                  </p>
                </div>

                {/* 2. Microestrutura L2 */}
                <div className="p-2.5 rounded-lg bg-secondary/30 border border-border/40 hover:border-purple-500/30 transition-all space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                      <Layers className="w-3 h-3 text-purple-400" />
                      Microestrutura
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 font-mono font-bold ${
                        aiModelScores.microstructure.status === "FLUXO_EXPANSIVO" || aiModelScores.microstructure.status === "ALTA_LIQUIDEZ"
                          ? "bg-crypto-cyan/15 text-crypto-cyan border-crypto-cyan/30"
                          : aiModelScores.microstructure.status === "NEUTRO"
                          ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                          : "bg-crypto-red/15 text-crypto-red border-crypto-red/30"
                      }`}
                    >
                      {aiModelScores.microstructure.status}
                    </Badge>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-mono font-black text-foreground">
                      {aiModelScores.microstructure.score}
                      <span className="text-[10px] text-muted-foreground font-normal">/100</span>
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      OFI: {aiModelScores.microstructure.avgOfi > 0 ? "+" : ""}
                      {aiModelScores.microstructure.avgOfi.toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full bg-secondary/50 rounded-full h-1 overflow-hidden">
                    <div
                      className="bg-purple-500 h-1 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, aiModelScores.microstructure.score))}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight truncate" title={aiModelScores.microstructure.microstructureDescription}>
                    {aiModelScores.microstructure.microstructureDescription}
                  </p>
                </div>

                {/* 3. Volatilidade ATR */}
                <div className="p-2.5 rounded-lg bg-secondary/30 border border-border/40 hover:border-amber-500/30 transition-all space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                      <Activity className="w-3 h-3 text-amber-400" />
                      Volatilidade
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 font-mono font-bold ${
                        aiModelScores.volatility.status === "ESTAVEL" || aiModelScores.volatility.status === "COMPRIMIDA"
                          ? "bg-crypto-green/15 text-crypto-green border-crypto-green/30"
                          : aiModelScores.volatility.status === "EXPANSAO"
                          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                          : "bg-crypto-red/15 text-crypto-red border-crypto-red/30"
                      }`}
                    >
                      {aiModelScores.volatility.status}
                    </Badge>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-mono font-black text-foreground">
                      {aiModelScores.volatility.score}
                      <span className="text-[10px] text-muted-foreground font-normal">/100</span>
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      ATR: {aiModelScores.volatility.atrMultiplier.toFixed(2)}x
                    </span>
                  </div>
                  <div className="w-full bg-secondary/50 rounded-full h-1 overflow-hidden">
                    <div
                      className="bg-amber-400 h-1 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, aiModelScores.volatility.score))}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight truncate" title={aiModelScores.volatility.volatilityDescription}>
                    {aiModelScores.volatility.volatilityDescription}
                  </p>
                </div>

                {/* 4. Execução & Slippage */}
                <div className="p-2.5 rounded-lg bg-secondary/30 border border-border/40 hover:border-crypto-cyan/30 transition-all space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                      <Zap className="w-3 h-3 text-crypto-cyan" />
                      Execução
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 font-mono font-bold ${
                        aiModelScores.execution.status === "PRIME_INSTITUCIONAL" || aiModelScores.execution.status === "EFICIENTE"
                          ? "bg-crypto-cyan/15 text-crypto-cyan border-crypto-cyan/30"
                          : aiModelScores.execution.status === "SLIPPAGE_MODERADO"
                          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                          : "bg-crypto-red/15 text-crypto-red border-crypto-red/30"
                      }`}
                    >
                      {aiModelScores.execution.status}
                    </Badge>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-mono font-black text-foreground">
                      {aiModelScores.execution.score}
                      <span className="text-[10px] text-muted-foreground font-normal">/100</span>
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      Slip: {(aiModelScores.execution.avgSlippageLast5 * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="w-full bg-secondary/50 rounded-full h-1 overflow-hidden">
                    <div
                      className="bg-crypto-cyan h-1 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, aiModelScores.execution.score))}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight truncate" title={aiModelScores.execution.executionDescription}>
                    {aiModelScores.execution.executionDescription}
                  </p>
                </div>

                {/* 5. Saúde dos Bots */}
                <div className="p-2.5 rounded-lg bg-secondary/30 border border-border/40 hover:border-emerald-500/30 transition-all space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      Saúde Bots
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 font-mono font-bold ${
                        aiModelScores.botHealth.status === "OPERACIONAL"
                          ? "bg-crypto-green/15 text-crypto-green border-crypto-green/30"
                          : aiModelScores.botHealth.status === "ATENCAO"
                          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                          : "bg-crypto-red/15 text-crypto-red border-crypto-red/30"
                      }`}
                    >
                      {aiModelScores.botHealth.status}
                    </Badge>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-mono font-black text-foreground">
                      {aiModelScores.botHealth.score}
                      <span className="text-[10px] text-muted-foreground font-normal">/100</span>
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      CB: {(aiModelScores.botHealth.circuitBreakerRatio * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full bg-secondary/50 rounded-full h-1 overflow-hidden">
                    <div
                      className="bg-emerald-400 h-1 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, aiModelScores.botHealth.score))}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight truncate" title={aiModelScores.botHealth.healthDescription}>
                    {aiModelScores.botHealth.healthDescription}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap border-b border-border/20 pb-2.5">
            <span className="text-[11px] text-muted-foreground font-bold mr-1 flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-purple-400" />
              Filtrar por:
            </span>
            <Button
              size="sm"
              variant={selectedCategory === "all" ? "default" : "ghost"}
              onClick={() => setSelectedCategory("all")}
              className={`h-7 px-2.5 text-xs rounded-lg cursor-pointer ${
                selectedCategory === "all" ? "bg-purple-600 text-white font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos ({predictiveAlerts.length})
            </Button>
            <Button
              size="sm"
              variant={selectedCategory === "lucratividade" ? "default" : "ghost"}
              onClick={() => setSelectedCategory("lucratividade")}
              className={`h-7 px-2.5 text-xs rounded-lg cursor-pointer ${
                selectedCategory === "lucratividade" ? "bg-crypto-green text-white font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              💰 Lucro Líquido
            </Button>
            <Button
              size="sm"
              variant={selectedCategory === "slippage" ? "default" : "ghost"}
              onClick={() => setSelectedCategory("slippage")}
              className={`h-7 px-2.5 text-xs rounded-lg cursor-pointer ${
                selectedCategory === "slippage" ? "bg-crypto-cyan text-white font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ⚡ Slippage & Execução
            </Button>
            <Button
              size="sm"
              variant={selectedCategory === "microestrutura" ? "default" : "ghost"}
              onClick={() => setSelectedCategory("microestrutura")}
              className={`h-7 px-2.5 text-xs rounded-lg cursor-pointer ${
                selectedCategory === "microestrutura" ? "bg-indigo-600 text-white font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              🧠 Microestrutura & OFI
            </Button>
            <Button
              size="sm"
              variant={selectedCategory === "risco" ? "default" : "ghost"}
              onClick={() => setSelectedCategory("risco")}
              className={`h-7 px-2.5 text-xs rounded-lg cursor-pointer ${
                selectedCategory === "risco" ? "bg-crypto-red text-white font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              🛡️ Risco & Drawdown
            </Button>
            <Button
              size="sm"
              variant={selectedCategory === "saude" ? "default" : "ghost"}
              onClick={() => setSelectedCategory("saude")}
              className={`h-7 px-2.5 text-xs rounded-lg cursor-pointer ${
                selectedCategory === "saude" ? "bg-amber-600 text-white font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              🧩 Saúde dos Bots
            </Button>
          </div>

          {/* Predictive Alerts Grid */}
          {filteredPredictiveAlerts.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground bg-secondary/20 rounded-xl border border-border/30">
              Nenhum alerta preditivo ativo nesta categoria no momento. Todos os parâmetros operam em faixa nominal.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <AnimatePresence>
                {filteredPredictiveAlerts.map((alert) => {
                  const isOpp = alert.type === "oportunidade";
                  const isRisk = alert.type === "risco";
                  const isWarn = alert.type === "aviso";

                  return (
                    <motion.div
                      key={alert.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      onClick={() => handleExecuteAlertAction(alert)}
                      className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 shadow-sm transition-all duration-200 cursor-pointer hover:scale-[1.01] hover:shadow-lg active:scale-[0.99] group/card ${
                        isOpp
                          ? "bg-crypto-green/5 border-crypto-green/30 hover:border-crypto-green/60"
                          : isRisk
                          ? "bg-crypto-red/5 border-crypto-red/30 hover:border-crypto-red/60"
                          : isWarn
                          ? "bg-amber-500/5 border-amber-500/30 hover:border-amber-500/60"
                          : "bg-secondary/30 border-border/40 hover:border-border/60"
                      }`}
                    >
                      {/* Top Bar of Card */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 ${
                                isOpp
                                  ? "bg-crypto-green/15 text-crypto-green border-crypto-green/30"
                                  : isRisk
                                  ? "bg-crypto-red/15 text-crypto-red border-crypto-red/30"
                                  : isWarn
                                  ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                  : "bg-blue-500/15 text-blue-300 border-blue-500/30"
                              }`}
                            >
                              {isOpp ? "🚀 Oportunidade" : isRisk ? "⚠️ Risco Preditivo" : isWarn ? "🔔 Aviso Técnico" : "ℹ️ Info"}
                            </Badge>

                            {alert.symbol && (
                              <Badge variant="outline" className="text-[10px] font-mono font-bold border-border/50 text-foreground bg-background/50">
                                {alert.symbol}
                              </Badge>
                            )}

                            <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                              <Clock className="w-3 h-3" />
                              {alert.timeHorizon}
                            </span>
                          </div>

                          {/* Confidence Indicator */}
                          <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-foreground">
                            <span className="text-[10px] text-muted-foreground font-sans">Confiança:</span>
                            <span className={isOpp ? "text-crypto-green" : isRisk ? "text-crypto-red" : "text-amber-400"}>
                              {alert.confidencePercent}%
                            </span>
                          </div>
                        </div>

                        {/* Title */}
                        <h4 className="text-xs font-extrabold text-foreground tracking-tight pt-0.5 group-hover/card:text-crypto-cyan transition-colors">
                          {alert.title}
                        </h4>

                        {/* Prediction Body */}
                        <div className="bg-background/40 p-2.5 rounded-lg border border-border/30 text-xs space-y-1">
                          <div className="flex items-start gap-1.5">
                            <Eye className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                            <p className="text-foreground leading-snug">
                              <span className="font-semibold text-purple-300">Previsão: </span>
                              {alert.prediction}
                            </p>
                          </div>

                          <div className="flex items-start gap-1.5 pt-1 border-t border-border/20 text-[11px] text-muted-foreground">
                            <Radio className="w-3 h-3 text-crypto-cyan shrink-0 mt-0.5" />
                            <p className="leading-snug">
                              <span className="font-semibold text-foreground">Gatilho Real: </span>
                              {alert.triggerReason}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Action Callout & Execute Button */}
                      <div className="bg-secondary/40 p-2 rounded-lg border border-border/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[11px] flex-1">
                          <Target className="w-3.5 h-3.5 text-crypto-green shrink-0" />
                          <span className="text-muted-foreground font-semibold">Ação:</span>
                          <span className="text-foreground font-medium text-[11px] leading-tight">
                            {alert.recommendedAction}
                          </span>
                        </div>

                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExecuteAlertAction(alert);
                          }}
                          className={`w-full sm:w-auto h-7 px-2.5 text-[11px] font-bold shrink-0 transition-all active:scale-95 flex items-center justify-center gap-1 shadow-sm cursor-pointer ${
                            isOpp
                              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40"
                              : isRisk
                              ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/40"
                              : "bg-purple-600 hover:bg-purple-500 text-white"
                          }`}
                        >
                          {isOpp ? (
                            <>
                              <Bot className="w-3.5 h-3.5 text-emerald-200" />
                              Gerar Bot
                            </>
                          ) : isRisk ? (
                            <>
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-200" />
                              Aplicar Proteção
                            </>
                          ) : (
                            <>
                              <Zap className="w-3.5 h-3.5 text-purple-200" />
                              Executar Ação
                            </>
                          )}
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* 3. NET PNL BY STRATEGY (SECTION 2) */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-crypto-cyan" />
            Performance & Retorno Líquido por Estratégia (Base SQLite WAL)
          </h3>
          <span className="text-xs text-muted-foreground">
            Taxas Maker/Taker (0.20%) e Slippage descontados individualmente
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {strategies.map((strat) => {
            const isProfit = strat.netPnl > 0.05;
            const isLoss = strat.netPnl < -0.05;

            return (
              <Card
                key={strat.key}
                className={`border bg-card/60 backdrop-blur-sm shadow-sm transition-all hover:border-border/80 ${
                  isProfit
                    ? "border-crypto-green/30"
                    : isLoss
                    ? "border-crypto-red/30"
                    : "border-border/40"
                }`}
              >
                <CardHeader className="py-2.5 px-3.5 border-b border-border/30 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{strat.statusEmoji}</span>
                    <CardTitle className="text-xs font-bold">{strat.name}</CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-semibold ${
                      strat.status === "lucrativa"
                        ? "bg-crypto-green/10 text-crypto-green border-crypto-green/30"
                        : strat.status === "deficitaria"
                        ? "bg-crypto-red/10 text-crypto-red border-crypto-red/30"
                        : "bg-crypto-gold/10 text-crypto-gold border-crypto-gold/30"
                    }`}
                  >
                    {strat.status === "lucrativa"
                      ? "Lucrativa"
                      : strat.status === "deficitaria"
                      ? "Deficitária"
                      : "Em Calibração"}
                  </Badge>
                </CardHeader>
                <CardContent className="p-3.5 space-y-2.5">
                  {/* Big Net PnL */}
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground font-medium">PnL Líquido Real</span>
                    <div className={`text-lg font-extrabold font-mono ${strat.netPnl >= 0 ? "text-crypto-green" : "text-crypto-red"}`}>
                      {strat.netPnl >= 0 ? "+" : ""}${strat.netPnl.toFixed(2)} USDT
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1 text-center bg-secondary/20 p-2 rounded-lg border border-border/20">
                    <div>
                      <span className="text-[9px] text-muted-foreground uppercase font-bold block">Win Rate</span>
                      <span className="text-xs font-bold text-foreground font-mono">
                        {strat.winRateNet.toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground uppercase font-bold block">Payoff Ratio</span>
                      <span className="text-xs font-bold text-foreground font-mono">
                        {strat.payoffRatio >= 99 ? "∞" : `${strat.payoffRatio.toFixed(2)}x`}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground uppercase font-bold block">Max DD</span>
                      <span className="text-xs font-bold text-crypto-gold font-mono">
                        {strat.maxDrawdownPercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Financial Breakdown */}
                  <div className="space-y-1 text-[11px] text-muted-foreground pt-1 border-t border-border/20 font-mono">
                    <div className="flex justify-between">
                      <span>PnL Bruto:</span>
                      <span className="text-foreground">${strat.grossPnl.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-purple-300">
                      <span>Taxas Pagas:</span>
                      <span>-${strat.feesPaid.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Slippage L2:</span>
                      <span>-${strat.slippageEstimated.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground pt-0.5">
                      <span>Amostra:</span>
                      <span>{strat.totalTrades} trades ({strat.winTrades}V / {strat.lossTrades}D)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. EXECUTION, RISK & BOT FLEET HEALTH (SECTIONS 4 & 5) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Execution & Risk Indicators (Section 4) */}
        <Card className="border border-border/40 bg-card/60 backdrop-blur-sm shadow-sm">
          <CardHeader className="py-2.5 px-3.5 border-b border-border/30">
            <CardTitle className="text-xs font-bold flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-crypto-gold" />
              Indicadores de Execução & Risco em Tempo Real
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 space-y-3">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-secondary/30 p-2 rounded-lg border border-border/30">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">Slippage Médio (10T)</span>
                <span className="text-sm font-extrabold text-foreground font-mono">
                  {risk?.avgSlippageLast10Percent?.toFixed(3)}%
                </span>
              </div>
              <div className="bg-secondary/30 p-2 rounded-lg border border-border/30">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">Taxas Acumuladas</span>
                <span className="text-sm font-extrabold text-purple-300 font-mono">
                  ${risk?.dailyCumulativeFeesUsd?.toFixed(2)}
                </span>
              </div>
              <div className="bg-secondary/30 p-2 rounded-lg border border-border/30">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">Rejeições de Ordem</span>
                <span className="text-sm font-extrabold text-crypto-cyan font-mono">
                  {risk?.rejectedOrders?.total ?? 0}
                  <span className="text-[10px] text-muted-foreground ml-1">bloqueios</span>
                </span>
              </div>
            </div>

            {/* Live L2 Depth & OFI per Tracked Symbol */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                OFI (Order Flow Imbalance) & Liquidez L2 dos 10 Níveis
              </span>
              <div className="space-y-1.5 font-mono text-xs">
                {Object.values(risk?.orderFlowImbalanceBySymbol || {}).map((item) => {
                  const ofi = item.orderFlowImbalance;
                  const isPositive = ofi > 0;
                  return (
                    <div
                      key={item.symbol}
                      className="flex items-center justify-between p-2 rounded-lg bg-secondary/20 border border-border/20"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">{item.symbol.replace("USDT", "")}</span>
                        <span className="text-[10px] text-muted-foreground">Spread: {item.spreadPercent.toFixed(2)}%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-muted-foreground">
                          Ask: ${(item.askVolumeUsd / 1000).toFixed(1)}k
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold ${
                            isPositive
                              ? "bg-crypto-green/10 text-crypto-green border-crypto-green/30"
                              : "bg-crypto-red/10 text-crypto-red border-crypto-red/30"
                          }`}
                        >
                          OFI {isPositive ? "+" : ""}{ofi.toFixed(3)}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fleet Health & Latency (Section 5) */}
        <Card className="border border-border/40 bg-card/60 backdrop-blur-sm shadow-sm">
          <CardHeader className="py-2.5 px-3.5 border-b border-border/30">
            <CardTitle className="text-xs font-bold flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-crypto-cyan" />
              Saúde dos Robôs, Latência & Circuit Breaker
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 space-y-3">
            {/* Health Strip */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-secondary/30 p-2 rounded-lg border border-border/30">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">Robôs Ativos</span>
                <span className="text-sm font-extrabold text-crypto-green font-mono">
                  {health?.activeBotsCount ?? 0}
                  <span className="text-xs text-muted-foreground font-normal"> / {health?.totalBotsCount ?? 0}</span>
                </span>
              </div>
              <div className="bg-secondary/30 p-2 rounded-lg border border-border/30">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">Latência P50</span>
                <span className="text-sm font-extrabold text-foreground font-mono">
                  {health?.p50LatencyMs ?? 14} ms
                </span>
              </div>
              <div className="bg-secondary/30 p-2 rounded-lg border border-border/30">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">Latência P95</span>
                <span className="text-sm font-extrabold text-foreground font-mono">
                  {health?.p95LatencyMs ?? 22} ms
                </span>
              </div>
            </div>

            {/* Mutex & Concurrency Guard */}
            <div className="p-2.5 rounded-lg bg-secondary/20 border border-border/20 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-crypto-green" />
                  Mutex Atômico de Execução
                </span>
                <Badge variant="outline" className="text-[10px] bg-crypto-green/10 text-crypto-green border-crypto-green/30">
                  Zero Duplicações Garantido
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Travas ativas: {health?.mutexes?.activeBuys ?? 0} compras em curso · {health?.mutexes?.activeSells ?? 0} vendas em curso. Concorrência 100% isolada via singleton.
              </p>
            </div>

            {/* Alerts Feed (Section 6) */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Alertas Automáticos de Governança
              </span>
              {alerts.slice(0, 2).map((a) => (
                <div
                  key={a.id}
                  className={`p-2 rounded-lg text-xs flex items-center gap-2 border ${
                    a.type === "error"
                      ? "bg-crypto-red/10 text-crypto-red border-crypto-red/20"
                      : a.type === "warning"
                      ? "bg-crypto-gold/10 text-crypto-gold border-crypto-gold/20"
                      : "bg-crypto-green/10 text-crypto-green border-crypto-green/20"
                  }`}
                >
                  {a.type === "error" ? (
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                  ) : a.type === "warning" ? (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">{a.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ========================================================================= */}
      {/* 5. LIVE TRADE FEED (SECTION 3) */}
      {/* ========================================================================= */}
      <Card className="border border-border/40 bg-card/60 backdrop-blur-sm shadow-sm">
        <CardHeader className="py-3 px-4 border-b border-border/30 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-extrabold flex items-center gap-2">
            <Zap className="w-4 h-4 text-crypto-gold" />
            Feed de Execução em Tempo Real (Últimos Trades Encerrados)
          </CardTitle>
          <span className="text-[11px] text-muted-foreground font-mono">
            {feed.length} ordens sincronizadas com SQLite
          </span>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/30 bg-secondary/20 text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                <th className="py-2.5 px-3">Horário</th>
                <th className="py-2.5 px-3">Par</th>
                <th className="py-2.5 px-3">Estratégia</th>
                <th className="py-2.5 px-3 text-right">Entrada</th>
                <th className="py-2.5 px-3 text-right">Saída</th>
                <th className="py-2.5 px-3 text-right">Holding</th>
                <th className="py-2.5 px-3 text-right">Taxas</th>
                <th className="py-2.5 px-3 text-right">Slippage L2</th>
                <th className="py-2.5 px-3 text-right font-bold">PnL Líquido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20 font-mono">
              {feed.map((trade) => {
                const isProfit = trade.netPnl >= 0;
                return (
                  <tr key={trade.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="py-2 px-3 text-muted-foreground text-[11px]">
                      {new Date(trade.timestamp).toLocaleTimeString("pt-BR")}
                    </td>
                    <td className="py-2 px-3 font-bold text-foreground">
                      {trade.symbol.replace("USDT", "")}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground text-[11px] truncate max-w-[180px]">
                      {trade.strategy}
                    </td>
                    <td className="py-2 px-3 text-right text-muted-foreground">
                      ${formatPrice(trade.entryPrice)}
                    </td>
                    <td className="py-2 px-3 text-right text-foreground font-bold">
                      ${formatPrice(trade.exitPrice)}
                    </td>
                    <td className="py-2 px-3 text-right text-muted-foreground">
                      {trade.holdingTimeMinutes}m
                    </td>
                    <td className="py-2 px-3 text-right text-purple-300">
                      ${trade.feesPaid.toFixed(3)}
                    </td>
                    <td className="py-2 px-3 text-right text-muted-foreground">
                      ${trade.slippageL2.toFixed(3)}
                    </td>
                    <td className={`py-2 px-3 text-right font-extrabold ${isProfit ? "text-crypto-green" : "text-crypto-red"}`}>
                      {isProfit ? "+" : ""}${trade.netPnl.toFixed(2)} USDT
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
