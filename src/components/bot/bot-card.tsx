"use client";

import { useState, memo } from "react";
import { type BotInstance } from "@/lib/store";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { manualCloseBotPosition, manualOpenBotPosition } from "@/lib/bot/multi-bot-engine";
import { PauseBotDialog } from "./pause-bot-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Play,
  Pause,
  Trash2,
  Settings,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Zap,
  Target,
  ShieldAlert,
  ShieldCheck,
  Flame,
  Clock,
  Sparkles,
  ArrowUpRight,
  Brain,
  Layers,
  Activity,
  Grid,
  RotateCcw,
  CheckCircle2,
  FileText,
  Rocket,
  BookOpen,
  Pin,
  ChevronDown,
  Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { strategyName } from "@/lib/bot/strategy-catalog";

const OVERRIDE_PAIRS = [
  { symbol: "BTCUSDT", name: "Bitcoin", tag: "Major" },
  { symbol: "ETHUSDT", name: "Ethereum", tag: "Major" },
  { symbol: "SOLUSDT", name: "Solana", tag: "L1 Fast" },
  { symbol: "BNBUSDT", name: "BNB Chain", tag: "Major" },
  { symbol: "NEARUSDT", name: "NEAR Protocol", tag: "AI/L1" },
  { symbol: "RENDERUSDT", name: "Render", tag: "AI/GPU" },
  { symbol: "ONDOUSDT", name: "Ondo Finance", tag: "RWA" },
  { symbol: "SUIUSDT", name: "Sui Network", tag: "L1" },
  { symbol: "PEPEUSDT", name: "Pepe Meme", tag: "Meme" },
  { symbol: "DOGEUSDT", name: "Dogecoin", tag: "Meme" },
  { symbol: "AVAXUSDT", name: "Avalanche", tag: "L1" },
  { symbol: "FETUSDT", name: "Artificial Superintel.", tag: "AI" },
  { symbol: "LINKUSDT", name: "Chainlink", tag: "Oracle" },
  { symbol: "ADAUSDT", name: "Cardano", tag: "L1" },
  { symbol: "XRPUSDT", name: "Ripple", tag: "Pay" },
];

interface BotCardProps {
  bot: BotInstance;
  onEdit: (bot: BotInstance) => void;
}

export const BotCard = memo(function BotCard({ bot, onEdit }: BotCardProps) {
  const currentOverride = bot.overrideSymbol && bot.overrideSymbol !== "AUTO" ? bot.overrideSymbol : undefined;
  const activeSymbol = (bot.position && bot.position.quantity > 0)
    ? bot.position.symbol
    : (currentOverride || bot.symbol);
  const cleanActiveSymbol = activeSymbol.endsWith("USDT") ? activeSymbol : `${activeSymbol}USDT`;

  const {
    toggleBotActive,
    removeBot,
    resetBotStats,
    updateBot,
    tickers,
    ticker,
    tradingMode,
    setActiveExecutionReport,
    selectedBotId,
    setSelectedBotId,
    setSelectedSymbol,
    setActiveSection,
  } = useCryptoStore(
    useShallow((s) => ({
      toggleBotActive: s.toggleBotActive,
      removeBot: s.removeBot,
      resetBotStats: s.resetBotStats,
      updateBot: s.updateBot,
      tickers: s.tickers,
      ticker: s.tickers[activeSymbol] || s.tickers[cleanActiveSymbol],
      tradingMode: s.tradingMode,
      setActiveExecutionReport: s.setActiveExecutionReport,
      selectedBotId: s.selectedBotId,
      setSelectedBotId: s.setSelectedBotId,
      setSelectedSymbol: s.setSelectedSymbol,
      setActiveSection: s.setActiveSection,
    }))
  );
  const { toast } = useToast();
  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [customSearch, setCustomSearch] = useState("");
  const [overrideTtl, setOverrideTtl] = useState<"indefinite" | "single_trade" | "1h" | "4h">(
    bot.overrideMode || "1h"
  );

  const handleSetOverride = (newSymbol: string, ttlMode?: "indefinite" | "single_trade" | "1h" | "4h") => {
    const chosenTtl = ttlMode || overrideTtl;
    if (newSymbol === "AUTO" || !newSymbol) {
      updateBot(bot.id, {
        overrideSymbol: undefined,
        overrideMode: undefined,
        overrideExpiresAt: undefined,
        stats: {
          ...bot.stats,
          lastAction: "🔥 Auto-Screener restaurado para modo dinâmico (Binance)",
          lastActionTime: new Date().toISOString(),
        },
      });
      toast({
        title: `${bot.name}`,
        description: "Auto-Screener restaurado: varredura dinâmica de momentum reativada.",
      });
    } else {
      const symClean = newSymbol.trim().toUpperCase();
      const formatted = symClean.endsWith("USDT") ? symClean : `${symClean}USDT`;
      let expiresAt: number | undefined = undefined;
      let ttlDesc = "Até cancelamento manual";
      if (chosenTtl === "1h") {
        expiresAt = Date.now() + 60 * 60 * 1000;
        ttlDesc = "Expira em 1 hora (60m)";
      } else if (chosenTtl === "4h") {
        expiresAt = Date.now() + 4 * 60 * 60 * 1000;
        ttlDesc = "Expira em 4 horas (4h)";
      } else if (chosenTtl === "single_trade") {
        ttlDesc = "Apenas 1 trade (Auto-reset ao vender)";
      }

      updateBot(bot.id, {
        overrideSymbol: formatted,
        overrideMode: chosenTtl,
        overrideExpiresAt: expiresAt,
        stats: {
          ...bot.stats,
          lastAction: `📌 Override Manual ativo [${ttlDesc}]: fixado no par ${formatted.replace("USDT", "")}/USDT`,
          lastActionTime: new Date().toISOString(),
        },
      });
      toast({
        title: `📌 Fixação de Ativo: ${formatted.replace("USDT", "")}/USDT`,
        description: `${bot.name} agora rastreará exclusivamente ${formatted.replace("USDT", "")}/USDT · Modo: ${ttlDesc}.`,
      });
    }
  };

  const currentPrice = ticker?.price ?? (bot.position?.currentPrice || 0);

  // Position calculations
  const hasPosition = !!bot.position && bot.position.quantity > 0;
  const entryPrice = bot.position?.entryPrice || 0;
  const gainPercent = hasPosition && entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
  const unrealizedPnlUsdt = hasPosition ? (currentPrice - entryPrice) * bot.position!.quantity : 0;
  const isProfit = gainPercent >= 0;

  // Progress towards Take Profit (respeitando alvo adaptativo de ATR se configurado)
  const effectiveTakeProfit = bot.position?.dynamicTakeProfit || bot.takeProfit || 3.0;
  const tpProgress = hasPosition && effectiveTakeProfit > 0
    ? Math.min(100, Math.max(0, (gainPercent / effectiveTakeProfit) * 100))
    : 0;

  const handleTakeProfitNow = async () => {
    setIsClosing(true);
    try {
      await manualCloseBotPosition(bot.id, {
        onToast: (t) => toast(t),
      });
    } finally {
      setIsClosing(false);
    }
  };

  const handleTakeProfitAndStop = async () => {
    setIsClosing(true);
    try {
      await manualCloseBotPosition(bot.id, {
        onToast: (t) => toast(t),
        stopBotAfterClose: true,
      });
    } finally {
      setIsClosing(false);
    }
  };

  const handleOpenPositionNow = async () => {
    setIsOpening(true);
    try {
      await manualOpenBotPosition(bot.id, {
        onToast: (t) => toast(t),
      });
    } finally {
      setIsOpening(false);
    }
  };

  const getStrategyIcon = (strategy: string) => {
    switch (strategy) {
      case "QUANT_ENSEMBLE":
      case "AI":
        return <Brain className="w-3 h-3 text-crypto-cyan" />;
      case "MACD":
        return <Activity className="w-3 h-3 text-purple-400" />;
      case "RSI":
        return <TrendingUp className="w-3 h-3 text-emerald-400" />;
      case "GRID":
        return <Grid className="w-3 h-3 text-amber-400" />;
      case "BREAKOUT":
        return <Zap className="w-3 h-3 text-yellow-400" />;
      default:
        return <Layers className="w-3 h-3 text-blue-400" />;
    }
  };

  const isSelected = selectedBotId === bot.id;

  return (
    <Card
      className={`relative overflow-hidden transition-all duration-300 border ${
        isSelected
          ? "border-emerald-500/70 ring-2 ring-emerald-500/40 shadow-xl shadow-emerald-500/15 bg-card/90"
          : bot.active
          ? "bg-card/75 border-border/80 shadow-lg shadow-crypto-cyan/5"
          : "bg-card/40 border-border/40 opacity-75"
      }`}
    >
      {/* Top status indicator strip */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 ${
          !bot.active
            ? "bg-muted-foreground/30"
            : hasPosition
            ? isProfit
              ? "bg-gradient-to-r from-crypto-green to-emerald-400"
              : "bg-gradient-to-r from-crypto-red to-rose-400"
            : "bg-gradient-to-r from-crypto-cyan to-blue-500 animate-pulse"
        }`}
      />

      <CardContent className="p-4 space-y-3.5 pt-4">
        {/* Header: Name, Symbol, Strategy & Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm truncate text-foreground">{bot.name}</span>
              <div className="flex items-center gap-1 shrink-0">
                <span
                  className={`w-2 h-2 rounded-full ${
                    bot.active
                      ? "bg-crypto-green animate-pulse shadow-[0_0_8px_#22c55e]"
                      : "bg-muted-foreground/40"
                  }`}
                />
                <span className="text-[10px] text-muted-foreground font-medium">
                  {bot.active ? (hasPosition ? "Em Operação" : "Escaneando") : "Pausado"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Symbol Badge */}
              <Badge
                variant="outline"
                onClick={() => {
                  if (activeSymbol !== "AUTO") {
                    setSelectedSymbol(cleanActiveSymbol);
                    setActiveSection("chart");
                  }
                }}
                title={activeSymbol !== "AUTO" ? `Abrir gráfico de ${cleanActiveSymbol}` : undefined}
                className={`text-[11px] font-semibold px-2 py-0 border-border/70 ${
                  activeSymbol !== "AUTO" ? "cursor-pointer hover:border-crypto-cyan/60 hover:text-crypto-cyan transition-colors" : ""
                } ${
                  bot.symbol === "AUTO" || bot.useAutoScreener
                    ? currentOverride
                      ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                      : "bg-orange-500/15 border-orange-500/40 text-orange-400"
                    : "bg-secondary/30"
                }`}
              >
                {activeSymbol === "AUTO" ? "🔥 TOP ALTAS" : activeSymbol.replace("USDT", "")}
                <span className="text-[9px] text-muted-foreground ml-0.5">/USDT</span>
              </Badge>

              {/* Auto-Screener: Seletor Manual de Ativo Override */}
              {(bot.useAutoScreener || bot.symbol === "AUTO" || Boolean(bot.overrideSymbol)) && (
                <div className="flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      {currentOverride ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-5 px-2 py-0 text-[10px] font-semibold border-cyan-500/50 text-cyan-300 bg-cyan-500/15 hover:bg-cyan-500/25 hover:border-cyan-400 flex items-center gap-1 shadow-sm transition-all"
                          title={`Override Manual Ativo: ${currentOverride.replace("USDT", "")}/USDT (${
                            bot.overrideMode === "1h" || bot.overrideMode === "4h"
                              ? `${Math.max(0, Math.ceil(((bot.overrideExpiresAt || 0) - Date.now()) / 60000))}m restantes`
                              : bot.overrideMode === "single_trade"
                              ? "Auto-reset após 1 trade"
                              : "Até cancelamento manual"
                          }). Clique para alterar o par ou validade.`}
                        >
                          <Pin className="w-2.5 h-2.5 text-cyan-400 rotate-45 shrink-0" />
                          <span>
                            Fixado: {currentOverride.replace("USDT", "")}
                            {bot.overrideMode === "1h" || bot.overrideMode === "4h" ? (
                              <span className="ml-1 text-[9px] font-mono text-cyan-300/90 font-semibold">
                                [{Math.max(0, Math.ceil(((bot.overrideExpiresAt || 0) - Date.now()) / 60000))}m]
                              </span>
                            ) : bot.overrideMode === "single_trade" ? (
                              <span className="ml-1 text-[9px] font-mono text-amber-300/90 font-semibold">
                                [1 trade]
                              </span>
                            ) : null}
                          </span>
                          <ChevronDown className="w-2.5 h-2.5 text-cyan-400/70 ml-0.5 shrink-0" />
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-5 px-1.5 py-0 text-[10px] font-medium border-orange-500/40 text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 hover:border-orange-500/60 flex items-center gap-1 shadow-sm transition-all"
                          title="Auto-Screener Dinâmico. Clique para fixar um ativo manualmente (Override com validade opcional)."
                        >
                          <Flame className="w-2.5 h-2.5 text-orange-400 animate-pulse shrink-0" />
                          <span>Auto-Screener</span>
                          <ChevronDown className="w-2.5 h-2.5 text-orange-400/70 ml-0.5 shrink-0" />
                        </Button>
                      )}
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                      align="start"
                      className="w-[270px] max-h-[400px] overflow-y-auto bg-[#0d131f] border border-white/[0.12] shadow-2xl p-1.5 rounded-xl z-50 text-xs"
                    >
                      <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-semibold text-slate-200 flex flex-col gap-0.5">
                        <div className="flex items-center justify-between">
                          <span>Rastreio de Ativo</span>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-white/10 text-muted-foreground">
                            {currentOverride ? "Override Ativo" : "Dinâmico"}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-normal">
                          Fixe temporariamente um par ou mantenha o screener dinâmico da Binance.
                        </span>
                      </DropdownMenuLabel>

                      <DropdownMenuSeparator className="bg-white/10 my-1" />

                      {/* Opção 1: Modo Dinâmico */}
                      <DropdownMenuItem
                        onClick={() => handleSetOverride("AUTO")}
                        className={`px-2 py-1.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                          !currentOverride ? "bg-orange-500/20 text-orange-300 font-semibold" : "hover:bg-white/5 text-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Flame className="w-3.5 h-3.5 text-orange-400" />
                          <div className="flex flex-col">
                            <span className="text-[11px]">🔥 Modo Dinâmico (Top Altas)</span>
                            <span className="text-[9px] text-muted-foreground">Varre as maiores altas da Binance</span>
                          </div>
                        </div>
                        {!currentOverride && <Check className="w-3.5 h-3.5 text-orange-400" />}
                      </DropdownMenuItem>

                      {/* Seletor de Validade (TTL Auto-Reset) */}
                      <div className="px-2 py-1.5 flex flex-col gap-1 bg-black/40 rounded-lg border border-white/10 my-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-muted-foreground flex items-center gap-1 font-semibold">
                            <Clock className="w-3 h-3 text-cyan-400" />
                            Validade do Override
                          </span>
                          <span className="text-[9px] text-cyan-300 font-mono">
                            {overrideTtl === "1h" ? "1 hora" : overrideTtl === "4h" ? "4 horas" : overrideTtl === "single_trade" ? "1 trade" : "Indefinido"}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOverrideTtl("1h");
                              if (currentOverride) handleSetOverride(currentOverride, "1h");
                            }}
                            className={`px-1 py-1 rounded text-[9px] font-semibold border transition-all cursor-pointer ${
                              overrideTtl === "1h"
                                ? "border-cyan-400 bg-cyan-500/20 text-cyan-300 shadow-sm"
                                : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
                            }`}
                            title="Expira em 1 hora e volta automaticamente para o Auto-Screener"
                          >
                            ⏱️ 1h
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOverrideTtl("4h");
                              if (currentOverride) handleSetOverride(currentOverride, "4h");
                            }}
                            className={`px-1 py-1 rounded text-[9px] font-semibold border transition-all cursor-pointer ${
                              overrideTtl === "4h"
                                ? "border-cyan-400 bg-cyan-500/20 text-cyan-300 shadow-sm"
                                : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
                            }`}
                            title="Expira em 4 horas e volta automaticamente para o Auto-Screener"
                          >
                            ⏱️ 4h
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOverrideTtl("single_trade");
                              if (currentOverride) handleSetOverride(currentOverride, "single_trade");
                            }}
                            className={`px-1 py-1 rounded text-[9px] font-semibold border transition-all cursor-pointer ${
                              overrideTtl === "single_trade"
                                ? "border-amber-400 bg-amber-500/20 text-amber-300 shadow-sm"
                                : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
                            }`}
                            title="Volta sozinho ao Auto-Screener após fechar a posição deste trade"
                          >
                            🎯 1 Trade
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOverrideTtl("indefinite");
                              if (currentOverride) handleSetOverride(currentOverride, "indefinite");
                            }}
                            className={`px-1 py-1 rounded text-[9px] font-semibold border transition-all cursor-pointer ${
                              overrideTtl === "indefinite"
                                ? "border-slate-400 bg-slate-500/20 text-slate-200 shadow-sm"
                                : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
                            }`}
                            title="Fixado até cancelamento manual"
                          >
                            ♾️ Manual
                          </button>
                        </div>
                      </div>

                      <DropdownMenuSeparator className="bg-white/10 my-1" />

                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        <span>📌 Fixar Par Manual</span>
                      </div>

                      {/* Input de Busca/Par Customizado */}
                      <div className="px-2 py-1">
                        <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-md px-2 py-0.5">
                          <input
                            type="text"
                            placeholder="Digitar par (ex: INJ, TIA)..."
                            value={customSearch}
                            onChange={(e) => setCustomSearch(e.target.value.toUpperCase())}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && customSearch.trim()) {
                                handleSetOverride(customSearch);
                                setCustomSearch("");
                              }
                            }}
                            className="w-full bg-transparent text-[11px] text-slate-200 placeholder:text-muted-foreground outline-none uppercase font-mono"
                          />
                          {customSearch.trim() && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                handleSetOverride(customSearch);
                                setCustomSearch("");
                              }}
                              className="h-5 px-1.5 text-[10px] text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/20"
                            >
                              Fixar
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Lista de Pares Rápidos */}
                      <div className="mt-1 flex flex-col gap-0.5">
                        {OVERRIDE_PAIRS.filter((p) =>
                          !customSearch || p.symbol.includes(customSearch) || p.name.toUpperCase().includes(customSearch)
                        ).map((item) => {
                          const isSelected = currentOverride === item.symbol;
                          const itemTicker = tickers[item.symbol];
                          const change24h = itemTicker?.priceChangePercent;

                          return (
                            <DropdownMenuItem
                              key={item.symbol}
                              onClick={() => handleSetOverride(item.symbol)}
                              className={`px-2 py-1 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                                isSelected ? "bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/40" : "hover:bg-white/5 text-slate-300"
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[11px] font-semibold">{item.symbol.replace("USDT", "")}</span>
                                <span className="text-[9px] text-muted-foreground">· {item.tag}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px]">
                                {typeof change24h === "number" && (
                                  <span className={`font-mono text-[9px] ${change24h >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {change24h >= 0 ? "+" : ""}{change24h.toFixed(1)}%
                                  </span>
                                )}
                                {isSelected ? (
                                  <Check className="w-3 h-3 text-cyan-400" />
                                ) : (
                                  <Pin className="w-2.5 h-2.5 text-muted-foreground/60 opacity-0 group-hover:opacity-100" />
                                )}
                              </div>
                            </DropdownMenuItem>
                          );
                        })}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Botão rápido para remover override e voltar ao Auto-Screener */}
                  {currentOverride && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetOverride("AUTO");
                      }}
                      className="h-5 px-1 rounded border border-white/10 text-muted-foreground hover:text-orange-400 hover:border-orange-500/40 hover:bg-orange-500/10 transition-colors flex items-center justify-center cursor-pointer"
                      title="Remover fixação e restaurar modo dinâmico Auto-Screener"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              )}

              {/* Strategy Badge */}
              <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 border-border/60 bg-secondary/20 flex items-center gap-1">
                {getStrategyIcon(bot.strategy)}
                {strategyName(bot.strategy)}
              </Badge>

              {/* AI Engine Badge */}
              {bot.aiEngine && (
                <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 border-purple-500/30 text-purple-300 bg-purple-500/10 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                  {bot.aiEngine}
                </Badge>
              )}

              {/* Selected / Linked Bot Badge */}
              {isSelected && (
                <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0 border-emerald-500/60 bg-emerald-500/20 text-emerald-300 flex items-center gap-1 shadow-sm">
                  <Sparkles className="w-2.5 h-2.5 text-emerald-300 animate-pulse" />
                  Vinculado
                </Badge>
              )}

              {/* Allocation Amount */}
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-secondary/50 text-muted-foreground" title="Compounding Half-Kelly ativo: escala posições dinamicamente conforme os lucros crescem">
                ${bot.allocationAmount} USDT · Compounding
              </Badge>

              {/* Stop After Profit Mode Badge */}
              {bot.stopAfterProfit && (
                <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 border-emerald-500/40 text-emerald-400 bg-emerald-500/10 flex items-center gap-1" title="Pausará automaticamente após obter lucro">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                  Operação Única
                </Badge>
              )}

              {/* Break-Even Protection Badge */}
              {(bot.autoBreakEven ?? true) && (
                <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 border-amber-500/40 text-amber-400 bg-amber-500/10 flex items-center gap-1" title="Break-Even Automático ativo: move stop para risco zero ao valorizar">
                  <ShieldCheck className="w-2.5 h-2.5 text-amber-400" />
                  Break-Even
                </Badge>
              )}

              {/* Trailing Take-Profit Badge */}
              {(bot.trailingTakeProfit ?? true) && (
                <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 border-emerald-500/40 text-emerald-400 bg-emerald-500/10 flex items-center gap-1" title="Trailing Take-Profit ativo: deixa o lucro correr além da meta fixa">
                  <Rocket className="w-2.5 h-2.5 text-emerald-400" />
                  Trailing TP
                </Badge>
              )}

              {/* Smart DCA Badge */}
              {(bot.useSmartDca ?? true) && (
                <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 border-cyan-500/40 text-cyan-400 bg-cyan-500/10 flex items-center gap-1" title="DCA Inteligente ativo: reentrada estratégica em suporte se houver recuo">
                  <TrendingUp className="w-2.5 h-2.5 text-cyan-400" />
                  DCA Suporte
                </Badge>
              )}

              {/* Order Book & Spread Filter Badge */}
              {(bot.useOrderBookFilter ?? true) && (
                <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 border-blue-500/40 text-blue-400 bg-blue-500/10 flex items-center gap-1" title="Filtro de Livro e Spread ativo: barra compras com spread largo ou book desfavorável">
                  <BookOpen className="w-2.5 h-2.5 text-blue-400" />
                  Livro & Spread
                </Badge>
              )}

              {/* Time-Stop Badge */}
              {((bot.timeStopMinutes ?? 60) > 0) && (
                <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 border-orange-500/40 text-orange-400 bg-orange-500/10 flex items-center gap-1" title={`Time-Stop: ${bot.timeStopMinutes ?? 60}m base + 15m tolerância a prejuízo zero`}>
                  <Clock className="w-2.5 h-2.5 text-orange-400" />
                  Time-Stop {bot.timeStopMinutes ?? 60}m
                </Badge>
              )}

              {/* Position Mode Badge */}
              {hasPosition && (
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1.5 py-0 font-bold ${
                    bot.position?.mode === "live"
                      ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                      : "border-cyan-500/50 text-cyan-400 bg-cyan-500/10"
                  }`}
                >
                  {bot.position?.mode === "live" ? "REAL (BINANCE)" : "SIMULADO"}
                </Badge>
              )}
            </div>
          </div>

          {/* Quick Action Controls */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="icon"
              variant={bot.active ? "outline" : "default"}
              className={`h-8 w-8 rounded-lg cursor-pointer ${
                bot.active
                  ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                  : "bg-crypto-green hover:bg-crypto-green/90 text-white"
              }`}
              onClick={() => {
                if (bot.active && hasPosition) {
                  setPauseDialogOpen(true);
                } else {
                  toggleBotActive(bot.id);
                }
              }}
              title={bot.active ? "Pausar este bot" : "Iniciar este bot"}
            >
              {bot.active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary/50 cursor-pointer"
              onClick={() => onEdit(bot)}
              title="Configurar Parâmetros de Lucro"
            >
              <Settings className="w-3.5 h-3.5" />
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 cursor-pointer"
              onClick={() => {
                if (confirm(`Deseja zerar as métricas do ${bot.name}?`)) {
                  resetBotStats(bot.id);
                  toast({
                    title: "Métricas Zeradas",
                    description: `As métricas do ${bot.name} foram reiniciadas com sucesso.`,
                  });
                }
              }}
              title="Zerar métricas deste robô"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-crypto-red hover:bg-crypto-red/10 cursor-pointer"
              onClick={() => {
                if (hasPosition) {
                  if (confirm(`⚠️ ATENÇÃO: O robô ${bot.name} possui posição aberta de ${bot.position?.symbol.replace("USDT", "")}/USDT em carteira!\n\nDeseja remover o robô mantendo o ativo na carteira? (Caso queira liquidar antes, feche a posição pelo botão 'Fechar Posição' ou pause o robô para liquidar a mercado).`)) {
                    removeBot(bot.id);
                  }
                } else if (confirm(`Deseja remover o ${bot.name}?`)) {
                  removeBot(bot.id);
                }
              }}
              title="Excluir Bot"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Live Position Box or Idle Scanner Box */}
        <AnimatePresence mode="wait">
          {hasPosition ? (
            <motion.div
              key="in-position"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className={`rounded-xl p-3 border space-y-2.5 ${
                isProfit
                  ? "bg-crypto-green/5 border-crypto-green/25"
                  : "bg-crypto-red/5 border-crypto-red/25"
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <Flame className={`w-3.5 h-3.5 ${isProfit ? "text-crypto-green animate-pulse" : "text-crypto-red"}`} />
                  Posição Aberta ({bot.position!.quantity.toFixed(4)} {bot.symbol.replace("USDT", "")})
                </span>
                <div className={`flex items-center gap-1 font-bold ${isProfit ? "text-crypto-green" : "text-crypto-red"}`}>
                  {isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  <span>{isProfit ? "+" : ""}{gainPercent.toFixed(2)}%</span>
                  <span className="text-[10px] opacity-80">
                    ({isProfit ? "+" : "-"}${Math.abs(unrealizedPnlUsdt).toFixed(2)})
                  </span>
                </div>
              </div>

              {/* Break-Even Armed (Risco Zero Ativo) Banner */}
              {bot.position?.isBreakEvenArmed && (
                <div className="flex items-center justify-between text-[11px] bg-amber-500/15 border border-amber-500/40 px-2.5 py-1.5 rounded-lg text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
                  <span className="flex items-center gap-1.5 font-bold">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
                    Risco Zero Armado (Break-Even)
                  </span>
                  <span className="text-[10px] font-mono text-amber-200">
                    Stop: ${formatPrice(bot.position.breakEvenPrice || entryPrice * 1.0025)}
                  </span>
                </div>
              )}

              {/* Trailing Take-Profit Armed (Surfando Pump) Banner */}
              {bot.position?.isTakeProfitArmed && (
                <div className="flex items-center justify-between text-[11px] bg-emerald-500/15 border border-emerald-500/40 px-2.5 py-1.5 rounded-lg text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
                  <span className="flex items-center gap-1.5 font-bold">
                    <Rocket className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-bounce" />
                    Surfando Pump (Trailing Parabólico Ativo)
                  </span>
                  <span className="text-[10px] font-mono text-emerald-200">
                    Pico: ${formatPrice(bot.position.tpPeakPrice || currentPrice)}
                  </span>
                </div>
              )}

              {/* DCA Re-entry Applied Badge */}
              {Boolean(bot.position?.dcaCount && bot.position.dcaCount > 0) && (
                <div className="flex items-center justify-between text-[11px] bg-cyan-500/15 border border-cyan-500/40 px-2.5 py-1.5 rounded-lg text-cyan-300">
                  <span className="flex items-center gap-1.5 font-bold">
                    <TrendingUp className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    Preço Médio Estratégico (DCA Executado)
                  </span>
                  <span className="text-[10px] font-mono text-cyan-200">
                    {bot.position!.dcaCount} reentrada(s)
                  </span>
                </div>
              )}

              {/* Price comparison */}
              <div className="grid grid-cols-2 gap-2 text-[11px] bg-secondary/30 p-2 rounded-lg">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Preço de Entrada</span>
                  <span className="font-semibold">${formatPrice(entryPrice)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Preço Atual</span>
                  <span className={`font-semibold ${isProfit ? "text-crypto-green" : "text-crypto-red"}`}>
                    ${formatPrice(currentPrice)}
                  </span>
                </div>
              </div>

              {/* Progress towards Take Profit */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Target className="w-2.5 h-2.5 text-crypto-cyan" />
                    Meta de Lucro: +{effectiveTakeProfit}% {bot.position?.dynamicTakeProfit ? "(ATR Adaptativo)" : ""}
                  </span>
                  <span className="font-semibold text-crypto-cyan">{tpProgress.toFixed(0)}% do alvo</span>
                </div>
                <Progress value={tpProgress} className="h-1.5 bg-secondary/50" />
              </div>

              {/* Quick Close / Take Profit / Stop Loss Button */}
              <div className="space-y-1.5">
                <Button
                  size="sm"
                  onClick={handleTakeProfitNow}
                  disabled={isClosing}
                  className={`w-full h-7 text-xs font-semibold text-white shadow-sm cursor-pointer transition-colors ${
                    isProfit
                      ? "bg-gradient-to-r from-crypto-green to-emerald-500 hover:from-crypto-green/90 hover:to-emerald-500/90"
                      : "bg-gradient-to-r from-crypto-red to-rose-600 hover:from-crypto-red/90 hover:to-rose-600/90"
                  }`}
                >
                  {isProfit ? (
                    <Sparkles className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  )}
                  {isClosing
                    ? "Executando..."
                    : isProfit
                      ? `Realizar Lucro Agora (+$${Math.abs(unrealizedPnlUsdt).toFixed(2)})`
                      : `Realizar Prejuízo Agora (-$${Math.abs(unrealizedPnlUsdt).toFixed(2)})`}
                </Button>

                {isProfit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleTakeProfitAndStop}
                    disabled={isClosing}
                    className="w-full h-7 text-xs font-semibold border-emerald-500/50 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {isClosing ? "Executando..." : "Realizar Lucro e Encerrar Robô (Pausar)"}
                  </Button>
                )}
              </div>
            </motion.div>
          ) : bot.active ? (
            <motion.div
              key="scanning"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-secondary/20 rounded-xl p-3 border border-border/40 space-y-2.5 text-xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-crypto-cyan font-mono text-sm font-bold">${formatPrice(currentPrice)}</span>
                  <span className={`text-[10px] font-semibold ${(ticker?.priceChangePercent || 0) >= 0 ? "text-crypto-green" : "text-crypto-red"}`}>
                    {(ticker?.priceChangePercent || 0) >= 0 ? "+" : ""}{(ticker?.priceChangePercent || 0).toFixed(2)}%
                  </span>
                </div>
                <Badge variant="outline" className="border-crypto-cyan/40 text-crypto-cyan bg-crypto-cyan/10 text-[10px] py-0.5 px-2 font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-crypto-cyan animate-ping" />
                  Escaneando Mercado
                </Badge>
              </div>

              {/* Real-time status / lastAction feedback */}
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-secondary/35 px-2.5 py-1.5 rounded-lg border border-border/20">
                <Clock className="w-3.5 h-3.5 text-crypto-cyan shrink-0 animate-spin" style={{ animationDuration: "6s" }} />
                <span className="truncate">{bot.stats.lastAction || "Analisando volatilidade e ponto ideal de entrada..."}</span>
              </div>

              {/* Telemetria de Frequência de Disparo (Entry Frequency Telemetry) */}
              <div className="bg-secondary/35 rounded-lg p-2.5 border border-border/30 space-y-2">
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5 text-muted-foreground font-semibold">
                    <Activity className="w-3 h-3 text-crypto-cyan animate-pulse" />
                    <span className="text-foreground/90">Telemetria de Gatilho</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-crypto-cyan font-bold bg-crypto-cyan/10 px-1.5 py-0.5 rounded border border-crypto-cyan/25" title="Varreduras de mercado avaliadas por minuto (janela deslizante de 60s)">
                      ⚡ {bot.stats.scansPerMinute || 0} scans/min
                    </span>
                    <span className="text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded border border-border/30" title="Pares avaliados no ciclo atual">
                      🎯 {bot.stats.evaluatedPairsCount || 1} {bot.stats.evaluatedPairsCount === 1 ? "par" : "pares"}
                    </span>
                  </div>
                </div>

                {/* Trigger Proximity Gauge */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Target className="w-2.5 h-2.5 text-crypto-cyan" />
                      Proximidade do Disparo
                    </span>
                    <span className={`font-mono font-bold ${
                      (bot.stats.triggerProximityPercent ?? 0) >= 75
                        ? "text-amber-400 animate-pulse"
                        : (bot.stats.triggerProximityPercent ?? 0) >= 50
                        ? "text-crypto-cyan"
                        : "text-muted-foreground"
                    }`}>
                      {bot.stats.approvalsCount ?? 0}/{bot.stats.totalChecksCount ?? 4} aprovados ({bot.stats.triggerProximityPercent ?? 0}%)
                    </span>
                  </div>
                  <div className="w-full bg-secondary/60 h-1.5 rounded-full overflow-hidden border border-border/20">
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${
                        (bot.stats.triggerProximityPercent ?? 0) >= 75
                          ? "bg-gradient-to-r from-amber-500 to-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                          : (bot.stats.triggerProximityPercent ?? 0) >= 50
                          ? "bg-gradient-to-r from-blue-500 to-crypto-cyan"
                          : "bg-muted-foreground/30"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(5, bot.stats.triggerProximityPercent ?? 0))}%` }}
                    />
                  </div>

                  {/* Sparkline de Histórico Gráfico de Proximidade (10 Ticks) */}
                  {Array.isArray(bot.stats.proximityHistory) && bot.stats.proximityHistory.length >= 2 && (
                    <div className="pt-1 space-y-1">
                      <div className="flex items-center justify-between text-[8px] text-muted-foreground">
                        <span className="flex items-center gap-1 font-medium">
                          <Activity className="w-2.5 h-2.5 text-crypto-cyan/70" />
                          Linha de Tendência (10 ticks)
                        </span>
                        {(() => {
                          const history = bot.stats.proximityHistory!;
                          const currentVal = history[history.length - 1];
                          const prevVal = history[history.length - 2];
                          const delta = currentVal - prevVal;
                          if (delta > 0) {
                            return (
                              <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
                                ↗ Acelerando (+{delta}%)
                              </span>
                            );
                          }
                          if (delta < 0) {
                            return (
                              <span className="text-rose-400 font-semibold flex items-center gap-0.5">
                                ↘ Rejeição recente ({delta}%)
                              </span>
                            );
                          }
                          return (
                            <span className="text-muted-foreground font-mono">
                              → Estável ({currentVal}%)
                            </span>
                          );
                        })()}
                      </div>

                      {/* SVG Sparkline Gráfico */}
                      {(() => {
                        const history = bot.stats.proximityHistory!;
                        const n = history.length;
                        const points = history.map((val, idx) => {
                          const x = Number(((idx / Math.max(1, n - 1)) * 96 + 2).toFixed(1));
                          const y = Number((15 - (Math.min(100, Math.max(0, val)) / 100) * 12).toFixed(1));
                          return { x, y, val };
                        });
                        const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
                        const polygonPoints = `2,16 ${polylinePoints} 98,16`;
                        const lastPoint = points[points.length - 1];

                        const isAccelerating = history[history.length - 1] > history[history.length - 2];
                        const isRejection = history[history.length - 1] < history[history.length - 2];
                        const strokeColor = isAccelerating ? "#34d399" : isRejection ? "#f43f5e" : "#06b6d4";

                        return (
                          <div className="w-full h-[18px] bg-black/25 rounded px-1 py-0.5 border border-white/[0.06]">
                            <svg viewBox="0 0 100 16" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                              <defs>
                                <linearGradient id={`sparkGrad-${bot.id}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={strokeColor} stopOpacity="0.4" />
                                  <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
                                </linearGradient>
                              </defs>
                              {/* Filled Area */}
                              <polygon points={polygonPoints} fill={`url(#sparkGrad-${bot.id})`} />
                              {/* Trend Line */}
                              <polyline
                                fill="none"
                                stroke={strokeColor}
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                points={polylinePoints}
                              />
                              {/* Points */}
                              {points.map((p, i) => (
                                <circle
                                  key={i}
                                  cx={p.x}
                                  cy={p.y}
                                  r={i === points.length - 1 ? "2.2" : "1.2"}
                                  fill={i === points.length - 1 ? strokeColor : "#94a3b8"}
                                  className={i === points.length - 1 ? "animate-pulse" : ""}
                                />
                              ))}
                            </svg>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Indicador de Veto Mais Recente */}
                {bot.stats.lastVetoReason && (
                  <div className="flex items-start gap-1.5 text-[9px] bg-red-500/10 border border-red-500/20 px-2 py-1 rounded text-red-300/90">
                    <ShieldAlert className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-red-400 mr-1">
                        Veto [{bot.stats.lastVetoIndicator || "Filtro Técnico"}]:
                      </span>
                      <span className="text-red-200/80 truncate block">{bot.stats.lastVetoReason}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Por que o robô ainda não comprou: cada verificação do motor */}
              {bot.stats.entryChecks && bot.stats.entryChecks.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {bot.stats.entryChecks.map((c) => (
                    <span
                      key={c.label}
                      title={c.detail}
                      className={`text-[9px] px-1.5 py-0.5 rounded border ${
                        c.ok
                          ? "border-crypto-green/30 bg-crypto-green/10 text-crypto-green"
                          : "border-crypto-red/30 bg-crypto-red/10 text-crypto-red"
                      }`}
                    >
                      {c.ok ? "✓" : "✕"} {c.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Instant Manual Entry Trigger Button */}
              <Button
                size="sm"
                onClick={handleOpenPositionNow}
                disabled={isOpening}
                className="w-full h-7 text-xs font-semibold bg-gradient-to-r from-crypto-cyan to-blue-600 hover:from-crypto-cyan/90 text-white shadow-sm cursor-pointer"
              >
                <Zap className="w-3 h-3 mr-1 fill-current" />
                {isOpening ? "Executando Entrada..." : "Entrar a Mercado Agora (Comprar)"}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="paused"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-secondary/15 rounded-xl p-3 border border-border/30 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-mono text-sm font-semibold">${formatPrice(currentPrice)}</span>
                  <span className={`text-[10px] font-medium ${(ticker?.priceChangePercent || 0) >= 0 ? "text-crypto-green" : "text-crypto-red"}`}>
                    {(ticker?.priceChangePercent || 0) >= 0 ? "+" : ""}{(ticker?.priceChangePercent || 0).toFixed(2)}%
                  </span>
                </div>
                <Badge variant="outline" className="border-border text-muted-foreground bg-secondary/20 text-[10px] py-0.5 px-2">
                  Desligado
                </Badge>
              </div>

              <div className="flex items-center justify-between text-[11px] pt-0.5">
                <span className="text-muted-foreground flex items-center gap-1 truncate max-w-[200px]">
                  <Clock className="w-3 h-3 shrink-0" />
                  {bot.stats.lastAction || "Pronto para operar"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleBotActive(bot.id, true)}
                  className="h-6 px-2 text-[11px] text-crypto-green hover:bg-crypto-green/10 font-semibold cursor-pointer shrink-0"
                >
                  <Play className="w-3 h-3 mr-1 fill-current" /> Iniciar
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Profit & Risk Rules Badges */}
        <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
          <div className="bg-secondary/25 p-1.5 rounded-lg border border-border/20">
            <span className="text-muted-foreground block text-[9px] uppercase tracking-wider">Take Profit</span>
            <span className="font-bold text-crypto-green">+{bot.takeProfit}%</span>
          </div>

          <div className="bg-secondary/25 p-1.5 rounded-lg border border-border/20">
            <span className="text-muted-foreground block text-[9px] uppercase tracking-wider">Stop Loss</span>
            <span className="font-bold text-crypto-red">-{bot.stopLoss}%</span>
          </div>

          <div className="bg-secondary/25 p-1.5 rounded-lg border border-border/20">
            <span className="text-muted-foreground block text-[9px] uppercase tracking-wider">Trailing</span>
            <span className="font-bold text-crypto-cyan">{bot.trailingStop ? `${bot.trailingStopDistance}%` : "Off"}</span>
          </div>

          <div className="bg-secondary/25 p-1.5 rounded-lg border border-border/20">
            <span className="text-muted-foreground block text-[9px] uppercase tracking-wider">Break-Even</span>
            <span className="font-bold text-amber-400">{(bot.autoBreakEven ?? true) ? `+${bot.breakEvenTrigger ?? 1.2}%` : "Off"}</span>
          </div>
        </div>

        {/* Operação Única Indicator */}
        {bot.stopAfterProfit && (
          <div className="flex items-center justify-between text-[10px] bg-emerald-500/10 border border-emerald-500/25 px-2 py-1 rounded-lg text-emerald-300">
            <span className="flex items-center gap-1 font-semibold">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Operação Única
            </span>
            <span className="text-[9px] opacity-85">Pausará o robô logo após vender com lucro</span>
          </div>
        )}

        {/* Banner de Operação Finalizada e Relatório Pronto */}
        {bot.lastReport && (
          <div className="flex items-center justify-between text-[11px] bg-crypto-cyan/15 border border-crypto-cyan/40 px-2.5 py-1.5 rounded-lg text-crypto-cyan shadow-[0_0_12px_rgba(0,240,255,0.1)]">
            <span className="flex items-center gap-1.5 font-bold truncate">
              <FileText className="w-3.5 h-3.5 text-crypto-cyan shrink-0" />
              Relatório Pronto ({bot.lastReport.netPnl >= 0 ? "+" : ""}${bot.lastReport.netPnl.toFixed(2)} USDT)
            </span>
            <Button
              size="sm"
              variant="default"
              onClick={() => setActiveExecutionReport(bot.lastReport!)}
              className="h-6 px-2 text-[10px] bg-crypto-cyan text-black hover:bg-crypto-cyan/90 font-bold shrink-0 cursor-pointer shadow-sm"
            >
              Ver Relatório
            </Button>
          </div>
        )}

        {/* Stats Footer: Realized PnL & Win Rate */}
        <div className="flex items-center justify-between pt-1 border-t border-border/30 text-[11px]">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Lucro Realizado:</span>
            <span className={`font-bold ${bot.stats.realizedPnl >= 0 ? "text-crypto-green" : "text-crypto-red"}`}>
              {bot.stats.realizedPnl >= 0 ? "+" : ""}${formatPrice(Math.abs(bot.stats.realizedPnl))}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Acerto:</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-crypto-green/30 text-crypto-green bg-crypto-green/10 font-bold">
              {bot.stats.winRate.toFixed(0)}% ({bot.stats.winTrades}V/{bot.stats.lossTrades}D)
            </Badge>
          </div>
        </div>

        {/* Modal de confirmação ao desligar robô com posição aberta */}
        <PauseBotDialog
          open={pauseDialogOpen}
          onOpenChange={setPauseDialogOpen}
          bot={bot}
          onConfirmKeep={() => {
            toggleBotActive(bot.id, false);
            toast({
              title: `${bot.name} Pausado`,
              description: `Robô desligado. A posição de ${(bot.position?.symbol || bot.symbol).replace("USDT", "")} foi mantida intacta em sua carteira.`,
            });
          }}
          onConfirmLiquidate={async () => {
            await manualCloseBotPosition(bot.id, {
              stopBotAfterClose: true,
              onToast: (t) => toast(t),
            });
          }}
        />
      </CardContent>
    </Card>
  );
});
