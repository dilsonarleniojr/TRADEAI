"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Play, Square, Bot, Zap, TrendingUp, TrendingDown, DollarSign,
  BarChart3, Clock, Brain, Sparkles, Activity, CheckCircle2,
  AlertOctagon, Percent, Plus, Trash2, Shield, Eye, Sliders,
  Grid3x3, Crosshair, GitMerge, Repeat, Layers, Radio,
  ChevronRight, SkipForward, AlertTriangle, BookOpen, Pause
} from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { useBinanceData } from "@/hooks/use-binance-data";
import { useBinanceStream } from "@/hooks/use-binance-stream";
import type { BotInstance, BotStrategy, MarketRegime, AISuggestion } from "@/lib/store/tradeSlice";
import { DrawdownMeter } from "./drawdown-meter";
import { ExecutionQueue } from "./execution-queue";
import { SurgicalPanel } from "./surgical-panel";
import { DecisionGate } from "./decision-gate";
import { TelemetryRibbon } from "./telemetry-ribbon";
import { isStrategyAllowed } from "@/lib/defense/market-regime";

// ─── Strategy Catalog ──────────────────────────────────────────────────────────
const STRATEGIES: Array<{
  id: BotStrategy;
  label: string;
  icon: React.ReactNode;
  desc: string;
  risk: "low" | "medium" | "high";
  category: string;
  minTime: string;
  winRate: number;
  regimes: MarketRegime[];
}> = [
  { id: "AI", label: "AI Confluence", icon: <Brain className="w-4 h-4" />, desc: "Multi-factor ML + OBI + Sentimento", risk: "medium", category: "Execução", minTime: "15m", winRate: 68, regimes: ["TREND", "RANGE", "UNKNOWN"] },
  { id: "TWAP", label: "TWAP", icon: <Clock className="w-4 h-4" />, desc: "Fatia ordem no tempo com jitter ±20%", risk: "low", category: "Institucional", minTime: "1h", winRate: 72, regimes: ["TREND", "RANGE"] },
  { id: "VWAP", label: "VWAP", icon: <Activity className="w-4 h-4" />, desc: "Executa somente acima do volume médio", risk: "low", category: "Institucional", minTime: "4h", winRate: 70, regimes: ["TREND"] },
  { id: "Sniper", label: "Sniper", icon: <Crosshair className="w-4 h-4" />, desc: "Maker-only 1 tick à frente do spread", risk: "high", category: "Institucional", minTime: "1m", winRate: 61, regimes: ["TREND"] },
  { id: "Grid", label: "Smart Grid", icon: <Grid3x3 className="w-4 h-4" />, desc: "Malha de compra/venda com trailing automático", risk: "medium", category: "Neutra", minTime: "1h", winRate: 75, regimes: ["RANGE"] },
  { id: "PairsTrading", label: "Pairs Trading", icon: <GitMerge className="w-4 h-4" />, desc: "Arbitragem estatística via Z-Score de cointegração", risk: "low", category: "Neutra", minTime: "4h", winRate: 65, regimes: ["RANGE"] },
  { id: "OBI", label: "OBI Scalp", icon: <Layers className="w-4 h-4" />, desc: "Scalp por desequilíbrio do Order Book (3:1)", risk: "high", category: "Alta Frequência", minTime: "1m", winRate: 58, regimes: ["TREND"] },
  { id: "MeanReversion", label: "Mean Reversion", icon: <Repeat className="w-4 h-4" />, desc: "Flash crash detector — reverte >3σ Bollinger", risk: "high", category: "Alta Frequência", minTime: "5m", winRate: 62, regimes: ["CHAOS", "RANGE"] },
  { id: "DCA", label: "Smart DCA", icon: <SkipForward className="w-4 h-4" />, desc: "Aportes semanais condicionais ao RSI D1", risk: "low", category: "Portfólio", minTime: "1W", winRate: 82, regimes: ["RANGE", "UNKNOWN"] },
  { id: "Kelly", label: "Kelly Sizing", icon: <Percent className="w-4 h-4" />, desc: "Posicionamento ótimo pelo critério de Kelly", risk: "medium", category: "Portfólio", minTime: "1h", winRate: 70, regimes: ["TREND", "RANGE"] },
  { id: "RSI", label: "RSI Classic", icon: <BarChart3 className="w-4 h-4" />, desc: "Sobrecompra / sobrevenda RSI com stop dinâmico", risk: "medium", category: "Técnica", minTime: "15m", winRate: 63, regimes: ["RANGE", "UNKNOWN"] },
  { id: "MACD", label: "MACD Cross", icon: <TrendingUp className="w-4 h-4" />, desc: "Cruzamento de EMAs com filtro de histograma", risk: "medium", category: "Técnica", minTime: "1h", winRate: 60, regimes: ["TREND"] },
];

const RISK_COLORS = { low: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", medium: "text-amber-400 border-amber-500/30 bg-amber-500/10", high: "text-red-400 border-red-500/30 bg-red-500/10" };
const REGIME_COLORS: Record<MarketRegime, string> = { TREND: "text-emerald-400", RANGE: "text-violet-400", CHAOS: "text-red-400", UNKNOWN: "text-muted-foreground" };
const REGIME_EMOJI: Record<MarketRegime, string> = { TREND: "📈", RANGE: "↔️", CHAOS: "⚡", UNKNOWN: "?" };

type BotTab = "fleet" | "configure" | "decisions" | "log";

// ─── Kill Switch with double-confirm + drag ────────────────────────────────────
function KillSwitch({ onKill, botCount }: { onKill: () => void; botCount: number }) {
  const [step, setStep] = useState<"idle" | "confirm">("idle");
  const [swiped, setSwiped] = useState(false);
  const x = useMotionValue(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const bg = useTransform(x, [0, 200], ["#ef444430", "#ef4444"]);

  function handleDragEnd(_: unknown, info: { offset: { x: number } }) {
    const trackW = trackRef.current?.offsetWidth ?? 260;
    if (info.offset.x > trackW * 0.75) {
      setSwiped(true);
      onKill();
      setTimeout(() => { setStep("idle"); setSwiped(false); animate(x, 0, {}); }, 1500);
    } else {
      animate(x, 0, { type: "spring", stiffness: 500 });
    }
  }

  if (step === "idle") {
    return (
      <motion.button
        className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-red-500/40 text-red-400 text-xs font-bold uppercase tracking-wider bg-red-500/10 hover:bg-red-500/20 transition-all"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setStep("confirm")}
        disabled={botCount === 0}
      >
        <Zap className="w-4 h-4" />
        Kill Switch — Parar Tudo ({botCount} bots)
      </motion.button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-center text-xs text-red-400 font-mono animate-pulse">⚠️ Arraste para confirmar parada de emergência</p>
      <div ref={trackRef} className="relative h-12 rounded-xl bg-red-500/10 border border-red-500/40 overflow-hidden flex items-center">
        <motion.div className="absolute inset-0 rounded-xl" style={{ backgroundColor: bg }} />
        <motion.div
          className="absolute left-1 top-1 bottom-1 w-20 rounded-lg bg-red-500 flex items-center justify-center gap-1 text-white text-xs font-bold shadow-lg cursor-grab active:cursor-grabbing z-10"
          style={{ x }}
          drag="x"
          dragConstraints={{ left: 0, right: 1000 }}
          dragElastic={0}
          onDragEnd={handleDragEnd}
        >
          {swiped ? <CheckCircle2 className="w-4 h-4" /> : <><Zap className="w-3 h-3" /> KILL</>}
        </motion.div>
        <p className="w-full text-center text-xs text-red-400/60 font-mono select-none pl-24">PARAR TODOS OS BOTS →</p>
      </div>
      <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setStep("idle")}>
        Cancelar
      </Button>
    </div>
  );
}

// ─── Bot Card ─────────────────────────────────────────────────────────────────
function BotCard({
  bot,
  onToggle,
  onRemove,
  onSurgical,
}: {
  bot: BotInstance;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onSurgical: (bot: BotInstance) => void;
}) {
  const isPnlPos = bot.pnl >= 0;
  const isRunning = bot.status === "RUNNING";
  const heartbeatStale = Date.now() - bot.heartbeatAt > 15000;

  const statusGlow = {
    RUNNING: isPnlPos ? "shadow-[0_0_16px_#22c55e20]" : "shadow-[0_0_16px_#f59e0b20]",
    PAUSED: "opacity-70",
    ERROR: "shadow-[0_0_16px_#ef444430]",
  }[bot.status];

  const accentColor = {
    RUNNING: isPnlPos ? "bg-emerald-400" : "bg-amber-400",
    PAUSED: "bg-amber-500",
    ERROR: "bg-red-500",
  }[bot.status];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`relative rounded-2xl p-4 border bg-zinc-900/80 backdrop-blur-sm cursor-pointer select-none group transition-all
        ${bot.status === "ERROR" ? "border-red-500/30" : "border-white/8 hover:border-white/15"}
        ${statusGlow}
      `}
      onClick={() => onSurgical(bot)}
    >
      {/* Left accent strip */}
      <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-r ${accentColor} ${isRunning && isPnlPos ? "animate-pulse" : ""}`} />

      {/* Watchdog dead indicator */}
      {heartbeatStale && isRunning && (
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-ping" title="Heartbeat expirado" />
      )}

      {/* Shadow mode badge */}
      {bot.shadowMode && (
        <div className="absolute top-2 right-2">
          <Badge className="text-[8px] bg-violet-500/20 text-violet-400 border border-violet-500/30 font-mono">SHADOW</Badge>
        </div>
      )}

      <div className="pl-3 space-y-3">
        {/* Row 1: Name + strategy */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-foreground">{bot.name}</span>
              <Badge variant="outline" className="text-[9px] border-cyan-500/30 text-cyan-400 px-1">{bot.strategy}</Badge>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">{bot.symbol}</p>
          </div>
          <Badge className={`text-[9px] ${
            bot.status === "RUNNING" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
            bot.status === "PAUSED" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
            "bg-red-500/10 text-red-400 border-red-500/20"
          }`}>
            {bot.status === "ERROR" ? "⚠️ ERRO" : bot.status}
          </Badge>
        </div>

        {/* Row 2: Market regime + VaR */}
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className={`${REGIME_COLORS[bot.regime]}`}>
            {REGIME_EMOJI[bot.regime]} {bot.regime}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">VaR: <span className="text-foreground">${bot.varContribution.toFixed(1)}</span></span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">Margem: <span className="text-amber-400">${bot.allocatedMargin}</span></span>
        </div>

        {/* Row 3: TWAP/VWAP progress (if applicable) */}
        {bot.executionProgress && (
          <div onClick={(e) => e.stopPropagation()}>
            <ExecutionQueue botName={bot.name} strategy={bot.strategy as string} progress={bot.executionProgress} />
          </div>
        )}

        {/* Row 4: PNL + controls */}
        <div className="flex items-center justify-between border-t border-white/5 pt-2">
          <div className={`text-base font-bold font-mono tabular-nums ${isPnlPos ? "text-emerald-400" : "text-red-400"}`}>
            {isPnlPos ? "+" : ""}{bot.pnl.toFixed(2)} USDT
          </div>
          <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="outline" className="h-7 w-7 p-0 border-white/10 hover:border-white/20" onClick={() => onToggle(bot.id)}>
              {isRunning ? <Pause className="w-3 h-3 text-amber-400" /> : <Play className="w-3 h-3 text-emerald-400" />}
            </Button>
            <Button size="sm" variant="outline" className="h-7 w-7 p-0 border-white/10 hover:border-red-500/30" onClick={() => onRemove(bot.id)}>
              <Trash2 className="w-3 h-3 text-red-400" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Strategy Card in Vault ───────────────────────────────────────────────────
function StrategyCard({
  strategy,
  selected,
  currentRegime,
  onClick,
}: {
  strategy: typeof STRATEGIES[number];
  selected: boolean;
  currentRegime: MarketRegime;
  onClick: () => void;
}) {
  const allowed = isStrategyAllowed(strategy.id, currentRegime);

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className={`text-left p-3 rounded-xl border transition-all space-y-1.5 relative ${
        selected
          ? "border-cyan-500/60 bg-cyan-500/10 shadow-[0_0_12px_#22d3ee20]"
          : allowed
          ? "border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5"
          : "border-white/5 bg-white/2 opacity-50"
      }`}
    >
      {!allowed && (
        <div className="absolute top-2 right-2 text-[8px] font-mono text-muted-foreground">
          inativo no {currentRegime}
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${selected ? "bg-cyan-500/20 text-cyan-400" : "bg-white/5 text-muted-foreground"}`}>
          {strategy.icon}
        </div>
        <div>
          <p className={`text-xs font-bold ${selected ? "text-cyan-400" : "text-foreground"}`}>{strategy.label}</p>
          <p className="text-[8px] text-muted-foreground font-mono">{strategy.minTime} · {strategy.winRate}% win</p>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">{strategy.desc}</p>
      <div className="flex items-center justify-between">
        <Badge variant="outline" className={`text-[8px] ${RISK_COLORS[strategy.risk]}`}>
          {strategy.risk.toUpperCase()}
        </Badge>
        <span className="text-[8px] text-muted-foreground font-mono">{strategy.category}</span>
      </div>
    </motion.button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function BotSection() {
  const {
    activeBots, marginLedger, addBotInstance, toggleBotInstance, removeBotInstance,
    tickers, tradingMode, setTradingMode, botLogs, addBotLog,
    aiSuggestions, resolveAiSuggestion, killAllBots
  } = useCryptoStore();

  const { toast } = useToast();
  const { fetchKlines } = useBinanceData();
  useBinanceStream();

  const [activeTab, setActiveTab] = useState<BotTab>("fleet");
  const [selectedStrategy, setSelectedStrategy] = useState<BotStrategy>("AI");
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
  const [botName, setBotName] = useState("");
  const [marginPct, setMarginPct] = useState([20]); // % of free margin
  const [shadowMode, setShadowMode] = useState(false);
  const [spoofingDetector, setSpoofingDetector] = useState(true);
  const [icebergTracker, setIcebergTracker] = useState(true);
  const [spoofAlerts, setSpoofAlerts] = useState<string[]>([]);
  const [icebergAlerts, setIcebergAlerts] = useState<string[]>([]);
  const [surgicalBot, setSurgicalBot] = useState<BotInstance | null>(null);

  // Current simulated regime (would come from MarketRegimeDetector in production)
  const [globalRegime, setGlobalRegime] = useState<MarketRegime>("TREND");

  // Strategy-specific params
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [rsiBuy, setRsiBuy] = useState(30);
  const [rsiSell, setRsiSell] = useState(70);
  const [emaFast, setEmaFast] = useState(9);
  const [emaSlow, setEmaSlow] = useState(21);
  const [aiConfidence, setAiConfidence] = useState(75);
  const [useKelly, setUseKelly] = useState(true);
  const [gridLevels, setGridLevels] = useState(20);
  const [twapSlices, setTwapSlices] = useState(10);
  const [twapInterval, setTwapInterval] = useState(12);

  useEffect(() => { fetchKlines(selectedSymbol); }, [selectedSymbol, fetchKlines]);

  // Simulate microstructure events
  useEffect(() => {
    const iv = setInterval(() => {
      if (spoofingDetector && Math.random() > 0.7) {
        const size = Math.floor(50 + Math.random() * 200);
        const msg = `[SPOOFING] Cancelamento em massa: ${size} BTC removidos a $${(Math.random() * 5).toFixed(2)} do spread.`;
        setSpoofAlerts((p) => [msg, ...p].slice(0, 5));
        addBotLog({ message: msg, type: "warning" });
      }
      if (icebergTracker && Math.random() > 0.8) {
        const size = Math.floor(100 + Math.random() * 500);
        const msg = `[ICEBERG] Baleia acumulando: ${size} ETH executados no bid oculto.`;
        setIcebergAlerts((p) => [msg, ...p].slice(0, 5));
        addBotLog({ message: msg, type: "info" });
      }
    }, 4000);
    return () => clearInterval(iv);
  }, [spoofingDetector, icebergTracker, addBotLog]);

  // Rotate regime simulation
  useEffect(() => {
    const regimes: MarketRegime[] = ["TREND", "RANGE", "CHAOS", "TREND", "TREND"];
    let i = 0;
    const iv = setInterval(() => { setGlobalRegime(regimes[i % regimes.length]); i++; }, 45000);
    return () => clearInterval(iv);
  }, []);

  const allocatedMargin = Math.round((marginPct[0] / 100) * marginLedger.freeMargin);
  const totalVaR = marginLedger.totalAccount * 0.024 * 1.65;
  const isVaRAlert = totalVaR > marginLedger.totalAccount * 0.1;

  const handleCreateBot = useCallback(() => {
    if (allocatedMargin <= 0 || marginLedger.freeMargin < allocatedMargin) {
      toast({ title: "Margem Insuficiente", description: "Margem livre insuficiente para alocar este bot.", variant: "destructive" });
      return;
    }
    const name = botName.trim() || `${selectedStrategy}_${selectedSymbol.replace("USDT", "")}`;
    const parameters: Record<string, string> = {};
    if (selectedStrategy === "RSI") { parameters.rsiPeriod = String(rsiPeriod); parameters.buyThreshold = String(rsiBuy); parameters.sellThreshold = String(rsiSell); }
    else if (selectedStrategy === "MACD") { parameters.emaFast = String(emaFast); parameters.emaSlow = String(emaSlow); }
    else if (selectedStrategy === "Grid") { parameters.gridLevels = String(gridLevels); }
    else if (selectedStrategy === "TWAP" || selectedStrategy === "VWAP") { parameters.totalSlices = String(twapSlices); parameters.intervalMinutes = String(twapInterval); }
    else if (selectedStrategy === "AI") { parameters.confidence = String(aiConfidence); parameters.useKelly = String(useKelly); }
    addBotInstance({ name, symbol: selectedSymbol, strategy: selectedStrategy, parameters, allocatedMargin, shadowMode });
    setBotName("");
    toast({ title: "🤖 Bot Inicializado!", description: `${name} operando ${selectedSymbol} em ${shadowMode ? "Shadow" : "Live"} mode.` });
    setActiveTab("fleet");
  }, [allocatedMargin, botName, selectedStrategy, selectedSymbol, shadowMode, marginLedger, addBotInstance, toast, rsiPeriod, rsiBuy, rsiSell, emaFast, emaSlow, gridLevels, twapSlices, twapInterval, aiConfidence, useKelly]);

  const handleKillAll = () => {
    killAllBots();
    addBotLog({ message: `[KILL SWITCH] Todos os ${activeBots.length} bots pausados de emergência.`, type: "warning" });
    toast({ title: "🔴 Kill Switch Ativado", description: "Todos os bots foram pausados.", variant: "destructive" });
  };

  const handleAutofillBotParams = useCallback(() => {
    const randSuffix = Math.floor(100 + Math.random() * 900);
    const cleanSym = selectedSymbol.replace("USDT", "");
    setBotName(`${selectedStrategy}_${cleanSym}_${randSuffix}`);
    setMarginPct([30]);

    if (selectedStrategy === "RSI") {
      setRsiPeriod(14);
      setRsiBuy(30);
      setRsiSell(70);
    } else if (selectedStrategy === "MACD") {
      setEmaFast(12);
      setEmaSlow(26);
    } else if (selectedStrategy === "Grid") {
      setGridLevels(20);
    } else if (selectedStrategy === "TWAP" || selectedStrategy === "VWAP") {
      setTwapSlices(15);
      setTwapInterval(5);
    } else if (selectedStrategy === "AI") {
      setAiConfidence(80);
      setUseKelly(true);
    }

    toast({
      title: "⚡ Parâmetros Otimizados",
      description: `Parâmetros do bot preenchidos com os melhores padrões para ${selectedStrategy}.`,
    });
  }, [selectedStrategy, selectedSymbol, toast]);

  const TABS: Array<{ id: BotTab; label: string; badge?: number }> = [
    { id: "fleet", label: "🤖 Frota" },
    { id: "configure", label: "⚙️ Configurar" },
    { id: "decisions", label: "⚡ IA", badge: aiSuggestions.filter(s => s.status === "PENDING").length },
    { id: "log", label: "📋 Log" },
  ];

  return (
    <div className="space-y-4">
      {/* Telemetry Ribbon */}
      <TelemetryRibbon />

      {/* Header — Risk Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Global Margin Ledger */}
        <Card className="lg:col-span-3 bg-zinc-900/80 border border-white/8 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-400" />
              Global Margin Ledger
              <Badge variant="outline" className={`text-[9px] ml-auto ${REGIME_COLORS[globalRegime]} border-current/30`}>
                {REGIME_EMOJI[globalRegime]} Regime: {globalRegime}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-start">
              {[
                { label: "Saldo Total", val: `$${formatPrice(marginLedger.totalAccount)}`, color: "text-foreground" },
                { label: "Margem Alocada", val: `$${formatPrice(marginLedger.allocatedMargin)}`, color: "text-amber-400" },
                { label: "Margem Livre", val: `$${formatPrice(marginLedger.freeMargin)}`, color: "text-emerald-400" },
                { label: "VaR 95%", val: `$${formatPrice(totalVaR)}`, color: isVaRAlert ? "text-red-400" : "text-cyan-400" },
              ].map(({ label, val, color }) => (
                <div key={label} className="space-y-0.5">
                  <p className="text-[10px] text-muted-foreground uppercase font-mono">{label}</p>
                  <p className={`text-lg font-bold font-mono tabular-nums ${color}`}>{val}</p>
                </div>
              ))}
            </div>
            {/* Balance bar */}
            <div className="mt-4 w-full h-2 bg-white/5 rounded-full overflow-hidden flex">
              <motion.div className="bg-amber-500 h-full rounded-l-full" style={{ width: `${(marginLedger.allocatedMargin / marginLedger.totalAccount) * 100}%` }} />
              <motion.div className="bg-emerald-500 h-full rounded-r-full" style={{ width: `${(marginLedger.freeMargin / marginLedger.totalAccount) * 100}%` }} />
            </div>
            <div className="flex justify-between text-[9px] font-mono text-muted-foreground mt-1">
              <span>Alocado {((marginLedger.allocatedMargin / marginLedger.totalAccount) * 100).toFixed(0)}%</span>
              <span>Drawdown: ${marginLedger.currentDrawdown.toFixed(0)} / Limite ${marginLedger.drawdownLimit.toFixed(0)}</span>
              <span>Livre {((marginLedger.freeMargin / marginLedger.totalAccount) * 100).toFixed(0)}%</span>
            </div>
          </CardContent>
        </Card>

        {/* Drawdown Meter + Controls */}
        <Card className="bg-zinc-900/80 border border-white/8 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
          <CardContent className="pt-4 space-y-3">
            <DrawdownMeter
              currentEquity={marginLedger.totalAccount - marginLedger.currentDrawdown}
              drawdownLimit={marginLedger.drawdownLimit}
              peakEquity={marginLedger.peakEquity}
              totalAccount={marginLedger.totalAccount}
            />
            <div className="space-y-2 pt-1 border-t border-white/5">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-muted-foreground uppercase">Modo Global</Label>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-mono ${tradingMode === "paper" ? "text-violet-400" : "text-emerald-400"}`}>
                    {tradingMode === "paper" ? "Paper" : "Live"}
                  </span>
                  <Switch id="global-mode" checked={tradingMode === "live"} onCheckedChange={(v) => setTradingMode(v ? "live" : "paper")} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-muted-foreground uppercase">Spoofing Det.</Label>
                <Switch checked={spoofingDetector} onCheckedChange={setSpoofingDetector} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-muted-foreground uppercase">Iceberg Track.</Label>
                <Switch checked={icebergTracker} onCheckedChange={setIcebergTracker} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/3 border border-white/8 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab.id
                ? "bg-cyan-500/20 text-cyan-400 shadow-[0_0_12px_#22d3ee20]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyan-500 text-black text-[9px] font-bold flex items-center justify-center">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === "fleet" && (
          <motion.div key="fleet" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
            {/* Kill Switch */}
            <KillSwitch onKill={handleKillAll} botCount={activeBots.filter(b => b.status === "RUNNING").length} />

            {/* Bot grid */}
            {activeBots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center">
                  <Bot className="w-8 h-8 text-muted-foreground/40 animate-pulse" />
                </div>
                <p className="text-sm text-muted-foreground">Nenhum bot rodando na frota.</p>
                <p className="text-xs text-muted-foreground/60">Vá para ⚙️ Configurar para iniciar um novo bot.</p>
                <Button size="sm" className="mt-2 gap-1.5 text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30" onClick={() => setActiveTab("configure")}>
                  <Plus className="w-3.5 h-3.5" /> Configurar Primeiro Bot
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <AnimatePresence>
                  {activeBots.map((bot) => (
                    <BotCard key={bot.id} bot={bot} onToggle={toggleBotInstance} onRemove={removeBotInstance} onSurgical={setSurgicalBot} />
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Microstructure panel */}
            {(spoofAlerts.length > 0 || icebergAlerts.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-zinc-900/80 border border-red-500/20">
                  <CardHeader className="pb-2"><CardTitle className="text-xs text-red-400 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 animate-pulse" />SPOOFING DETECTOR</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {spoofAlerts.map((a, i) => <div key={i} className="text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1 border border-red-500/20">{a}</div>)}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-900/80 border border-cyan-500/20">
                  <CardHeader className="pb-2"><CardTitle className="text-xs text-cyan-400 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />ICEBERG TRACKER</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {icebergAlerts.map((a, i) => <div key={i} className="text-[10px] text-cyan-400 bg-cyan-500/10 rounded px-2 py-1 border border-cyan-500/20">{a}</div>)}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "configure" && (
          <motion.div key="configure" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
            {/* Strategy Vault */}
            <Card className="bg-zinc-900/80 border border-white/8">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-cyan-400" />
                  Cofre de Estratégias
                  <Badge variant="outline" className={`ml-auto text-[9px] ${REGIME_COLORS[globalRegime]} border-current/30`}>
                    Regime atual: {REGIME_EMOJI[globalRegime]} {globalRegime}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                  {STRATEGIES.map((s) => (
                    <StrategyCard
                      key={s.id}
                      strategy={s}
                      selected={selectedStrategy === s.id}
                      currentRegime={globalRegime}
                      onClick={() => setSelectedStrategy(s.id)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Bot Config */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-zinc-900/80 border border-white/8">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    Configuração do Bot
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] gap-1 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 cursor-pointer"
                    onClick={handleAutofillBotParams}
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Autopreencher
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Name + Symbol */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground uppercase">Nome</Label>
                      <Input value={botName} onChange={(e) => setBotName(e.target.value)} placeholder="Auto" className="h-8 text-xs bg-white/5 border-white/10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground uppercase">Par</Label>
                      <select
                        value={selectedSymbol}
                        onChange={(e) => setSelectedSymbol(e.target.value)}
                        className="flex h-8 w-full rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                      >
                        {(Object.keys(tickers).length > 0 ? Object.keys(tickers).sort() : ["BTCUSDT", "ETHUSDT", "SOLUSDT", "NEARUSDT", "AVAXUSDT", "BNBUSDT", "DOGEUSDT"]).map((s) => (
                          <option key={s} value={s}>{s.replace("USDT", "/USDT")}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Margin allocation */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <Label className="text-muted-foreground uppercase">Alocação de Margem</Label>
                      <span className="font-bold font-mono text-cyan-400">{marginPct[0]}% = ${allocatedMargin}</span>
                    </div>
                    <Slider min={5} max={100} step={5} value={marginPct} onValueChange={setMarginPct} />
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {marginPct[0]}% de ${formatPrice(marginLedger.freeMargin)} livre = <strong className="text-foreground">${allocatedMargin}</strong>
                    </p>
                  </div>

                  {/* Shadow Mode */}
                  <div className="flex items-center justify-between p-3 rounded-xl border border-violet-500/20 bg-violet-500/5">
                    <div>
                      <p className="text-xs font-semibold">{shadowMode ? "🌑 Shadow (Paper) Mode" : "💰 Live Trading"}</p>
                      <p className="text-[10px] text-muted-foreground">{shadowMode ? "Simula ordens sem capital real" : "Executa ordens reais na Binance"}</p>
                    </div>
                    <Switch checked={shadowMode} onCheckedChange={setShadowMode} />
                  </div>

                  {/* Dynamic params */}
                  <div className="border-t border-white/5 pt-3 space-y-3">
                    <p className="text-[10px] font-bold text-cyan-400 uppercase flex items-center gap-1">
                      <Sliders className="w-3 h-3" /> Parâmetros — {selectedStrategy}
                    </p>
                    {selectedStrategy === "RSI" && (
                      <div className="space-y-3">
                        {[["Período RSI", rsiPeriod, setRsiPeriod, 5, 30], ["Compra RSI", rsiBuy, setRsiBuy, 15, 45], ["Venda RSI", rsiSell, setRsiSell, 55, 85]].map(([label, val, setter, min, max]) => (
                          <div key={label as string} className="space-y-1">
                            <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">{label as string}</span><span className="font-bold font-mono">{val as number}</span></div>
                            <Slider min={min as number} max={max as number} step={1} value={[val as number]} onValueChange={(v) => (setter as (v: number) => void)(v[0])} />
                          </div>
                        ))}
                      </div>
                    )}
                    {selectedStrategy === "MACD" && (
                      <div className="space-y-3">
                        {[["EMA Rápida", emaFast, setEmaFast, 3, 20], ["EMA Lenta", emaSlow, setEmaSlow, 20, 60]].map(([label, val, setter, min, max]) => (
                          <div key={label as string} className="space-y-1">
                            <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">{label as string}</span><span className="font-bold font-mono">{val as number}</span></div>
                            <Slider min={min as number} max={max as number} step={1} value={[val as number]} onValueChange={(v) => (setter as (v: number) => void)(v[0])} />
                          </div>
                        ))}
                      </div>
                    )}
                    {selectedStrategy === "Grid" && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">Níveis do Grid</span><span className="font-bold font-mono">{gridLevels}</span></div>
                        <Slider min={5} max={50} step={5} value={[gridLevels]} onValueChange={(v) => setGridLevels(v[0])} />
                      </div>
                    )}
                    {(selectedStrategy === "TWAP" || selectedStrategy === "VWAP") && (
                      <div className="space-y-3">
                        {[["Nº de Fatias", twapSlices, setTwapSlices, 2, 50], ["Intervalo (min)", twapInterval, setTwapInterval, 1, 60]].map(([label, val, setter, min, max]) => (
                          <div key={label as string} className="space-y-1">
                            <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">{label as string}</span><span className="font-bold font-mono">{val as number}</span></div>
                            <Slider min={min as number} max={max as number} step={1} value={[val as number]} onValueChange={(v) => (setter as (v: number) => void)(v[0])} />
                          </div>
                        ))}
                        <p className="text-[10px] text-muted-foreground font-mono">Tempo total: ~{(twapSlices * twapInterval).toFixed(0)} minutos</p>
                      </div>
                    )}
                    {selectedStrategy === "AI" && (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">Limiar de Confiança ML</span><span className="font-bold font-mono">{aiConfidence}%</span></div>
                          <Slider min={50} max={95} step={5} value={[aiConfidence]} onValueChange={(v) => setAiConfidence(v[0])} />
                        </div>
                        <div className="flex items-center justify-between">
                          <div><p className="text-[10px] text-muted-foreground">Kelly Sizing</p><p className="text-[9px] text-muted-foreground/60">f* = p - (1-p)/b</p></div>
                          <Switch checked={useKelly} onCheckedChange={setUseKelly} />
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={handleCreateBot}
                    disabled={allocatedMargin <= 0}
                    className="w-full h-10 text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-cyan-400 text-black hover:brightness-110 shadow-[0_0_20px_#22d3ee30] transition-all gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {shadowMode ? "🌑 Iniciar em Shadow Mode" : "💰 Iniciar Bot Live"}
                  </Button>
                </CardContent>
              </Card>

              {/* Multi-Factor Confluence */}
              <Card className="bg-zinc-900/80 border border-white/8">
                <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Brain className="w-4 h-4 text-cyan-400" />Multi-Factor Confluence</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: "ONNX Trend Score", value: "0.865", sub: "ALTA CONFIANÇA", color: "text-emerald-400" },
                    { label: "OBI (Order Book Imbalance)", value: "0.68 Comprador", sub: "3:1 buy pressure", color: "text-emerald-400" },
                    { label: "Z-Score Cointegração", value: "-2.15 Sobrevenda", sub: "Pairs Trading signal", color: "text-emerald-400" },
                    { label: "Sentimento LLM", value: "82% Bullish", sub: "Social + news aggregate", color: "text-emerald-400" },
                    { label: "ADX Regime", value: "28.4 TREND", sub: `Regime: ${globalRegime}`, color: REGIME_COLORS[globalRegime] },
                  ].map(({ label, value, sub, color }) => (
                    <div key={label} className="flex items-center justify-between p-2.5 rounded-xl bg-white/3 border border-white/5">
                      <div>
                        <p className="text-[10px] text-muted-foreground">{label}</p>
                        <p className="text-[9px] text-muted-foreground/60">{sub}</p>
                      </div>
                      <span className={`text-xs font-bold font-mono ${color}`}>{value}</span>
                    </div>
                  ))}
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                    <p className="text-xs font-bold text-emerald-400 flex items-center justify-center gap-2">
                      <Sparkles className="w-4 h-4 animate-pulse" /> COMPRA RECOMENDADA
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-1">3/3 fatores convergentes</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}

        {activeTab === "decisions" && (
          <motion.div key="decisions" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Card className="bg-zinc-900/80 border border-white/8">
              <CardContent className="pt-5">
                <DecisionGate
                  suggestions={aiSuggestions}
                  onAccept={(id) => {
                    resolveAiSuggestion(id, true);
                    toast({ title: "✅ Sugestão Aceita", description: "Parâmetros aplicados ao próximo bot criado." });
                  }}
                  onReject={(id) => {
                    resolveAiSuggestion(id, false);
                    toast({ title: "✗ Sugestão Rejeitada", description: "Sugestão descartada." });
                  }}
                />
              </CardContent>
            </Card>
          </motion.div>
        )}

        {activeTab === "log" && (
          <motion.div key="log" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Card className="bg-zinc-900/80 border border-white/8">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                  Decision Log Console
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{botLogs.length} eventos</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-[10px] space-y-1 max-h-96 overflow-y-auto">
                  {botLogs.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground/60">Aguardando eventos do sistema...</p>
                  ) : (
                    [...botLogs].map((log) => (
                      <div key={log.id} className={`px-2 py-1 rounded flex items-start gap-2 ${
                        log.type === "warning" ? "bg-amber-500/10 text-amber-400" :
                        log.type === "buy" ? "bg-emerald-500/10 text-emerald-400" :
                        log.type === "sell" ? "bg-red-500/10 text-red-400" :
                        log.type === "profit" ? "bg-emerald-500/10 text-emerald-400" :
                        log.type === "loss" ? "bg-red-500/10 text-red-400" :
                        "bg-white/3 text-muted-foreground"
                      }`}>
                        <span className="text-muted-foreground/50 shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                        <span className="leading-relaxed">{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Surgical Panel Modal */}
      {surgicalBot && (
        <SurgicalPanel
          bot={surgicalBot}
          onClose={() => setSurgicalBot(null)}
          onToggle={(id) => { toggleBotInstance(id); setSurgicalBot(null); }}
          onRemove={(id) => { removeBotInstance(id); setSurgicalBot(null); }}
          onAddMargin={() => setSurgicalBot(null)}
        />
      )}
    </div>
  );
}
