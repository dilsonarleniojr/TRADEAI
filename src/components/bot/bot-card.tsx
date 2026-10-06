"use client";

import { useState } from "react";
import { type BotInstance } from "@/lib/store";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { manualCloseBotPosition, manualOpenBotPosition } from "@/lib/bot/multi-bot-engine";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { strategyName } from "@/lib/bot/strategy-catalog";

interface BotCardProps {
  bot: BotInstance;
  onEdit: (bot: BotInstance) => void;
}

export function BotCard({ bot, onEdit }: BotCardProps) {
  const { toggleBotActive, removeBot, resetBotStats, tickers, tradingMode, setActiveExecutionReport } = useCryptoStore(
    useShallow((s) => ({
      toggleBotActive: s.toggleBotActive,
      removeBot: s.removeBot,
      resetBotStats: s.resetBotStats,
      tickers: s.tickers,
      tradingMode: s.tradingMode,
      setActiveExecutionReport: s.setActiveExecutionReport,
    }))
  );
  const { toast } = useToast();
  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(false);

  const activeSymbol = (bot.position && bot.position.quantity > 0) ? bot.position.symbol : bot.symbol;
  const ticker = tickers[activeSymbol];
  const currentPrice = ticker?.price ?? (bot.position?.currentPrice || 0);

  // Position calculations
  const hasPosition = !!bot.position && bot.position.quantity > 0;
  const entryPrice = bot.position?.entryPrice || 0;
  const gainPercent = hasPosition && entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
  const unrealizedPnlUsdt = hasPosition ? (currentPrice - entryPrice) * bot.position!.quantity : 0;
  const isProfit = gainPercent >= 0;

  // Progress towards Take Profit
  const tpProgress = hasPosition && bot.takeProfit > 0
    ? Math.min(100, Math.max(0, (gainPercent / bot.takeProfit) * 100))
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

  return (
    <Card
      className={`relative overflow-hidden transition-all duration-300 border ${
        bot.active
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
              <Badge variant="outline" className={`text-[11px] font-semibold px-2 py-0 border-border/70 ${bot.symbol === "AUTO" || bot.useAutoScreener ? "bg-orange-500/15 border-orange-500/40 text-orange-400" : "bg-secondary/30"}`}>
                {bot.symbol === "AUTO" ? (hasPosition ? bot.position!.symbol.replace("USDT", "") : "🔥 TOP ALTAS") : bot.symbol.replace("USDT", "")}
                <span className="text-[9px] text-muted-foreground ml-0.5">/USDT</span>
              </Badge>

              {/* Auto-Screener Badge */}
              {(bot.useAutoScreener || bot.symbol === "AUTO") && (
                <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 border-orange-500/40 text-orange-400 bg-orange-500/10 flex items-center gap-1" title="Varre dinamicamente as moedas em maior alta na Binance">
                  <Flame className="w-2.5 h-2.5 text-orange-400" />
                  Auto-Screener
                </Badge>
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

              {/* Allocation Amount */}
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-secondary/50 text-muted-foreground">
                ${bot.allocationAmount} USDT
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
              onClick={() => toggleBotActive(bot.id)}
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
                if (confirm(`Deseja remover o ${bot.name}?`)) {
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
                    Surfando Pump (Alvo Superado!)
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
                    Meta de Lucro: +{bot.takeProfit}%
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
      </CardContent>
    </Card>
  );
}
