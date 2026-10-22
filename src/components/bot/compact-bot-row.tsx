"use client";

import { useState, memo } from "react";
import { type BotInstance } from "@/lib/store";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { manualCloseBotPosition } from "@/lib/bot/multi-bot-engine";
import { PauseBotDialog } from "./pause-bot-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  Trash2,
  Settings,
  TrendingUp,
  TrendingDown,
  RotateCcw,
  Zap,
  Activity,
  Brain,
  Grid,
  Layers,
  Sparkles,
  Flame,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useShallow } from "zustand/react/shallow";
import { strategyName } from "@/lib/bot/strategy-catalog";

interface CompactBotRowProps {
  bot: BotInstance;
  index: number;
  onEdit: (bot: BotInstance) => void;
}

export const CompactBotRow = memo(function CompactBotRow({
  bot,
  index,
  onEdit,
}: CompactBotRowProps) {
  const currentOverride =
    bot.overrideSymbol && bot.overrideSymbol !== "AUTO"
      ? bot.overrideSymbol
      : undefined;
  const activeSymbol =
    bot.position && bot.position.quantity > 0
      ? bot.position.symbol
      : currentOverride || bot.symbol;
  const cleanActiveSymbol = activeSymbol.endsWith("USDT")
    ? activeSymbol
    : `${activeSymbol}USDT`;

  const {
    toggleBotActive,
    removeBot,
    resetBotStats,
    ticker,
    selectedBotId,
    setSelectedSymbol,
    setActiveSection,
  } = useCryptoStore(
    useShallow((s) => ({
      toggleBotActive: s.toggleBotActive,
      removeBot: s.removeBot,
      resetBotStats: s.resetBotStats,
      ticker: s.tickers[activeSymbol] || s.tickers[cleanActiveSymbol],
      selectedBotId: s.selectedBotId,
      setSelectedSymbol: s.setSelectedSymbol,
      setActiveSection: s.setActiveSection,
    }))
  );

  const { toast } = useToast();
  const [isClosing, setIsClosing] = useState(false);
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);

  const currentPrice = ticker?.price ?? (bot.position?.currentPrice || 0);
  const hasPosition = !!bot.position && bot.position.quantity > 0;
  const entryPrice = bot.position?.entryPrice || 0;
  const gainPercent =
    hasPosition && entryPrice > 0
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : 0;
  const unrealizedPnlUsdt = hasPosition
    ? (currentPrice - entryPrice) * bot.position!.quantity
    : 0;
  const isProfit = gainPercent >= 0;

  const realizedPnl = bot.stats?.realizedPnl || 0;
  const totalTrades = bot.stats?.totalTrades || 0;
  const winTrades = bot.stats?.winTrades || 0;
  const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 100;

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

  const getStrategyIcon = (strategy: string) => {
    switch (strategy) {
      case "QUANT_ENSEMBLE":
      case "AI":
        return <Brain className="w-3 h-3 text-crypto-cyan shrink-0" />;
      case "MACD":
        return <Activity className="w-3 h-3 text-purple-400 shrink-0" />;
      case "RSI":
        return <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />;
      case "GRID":
        return <Grid className="w-3 h-3 text-amber-400 shrink-0" />;
      case "BREAKOUT":
        return <Zap className="w-3 h-3 text-yellow-400 shrink-0" />;
      default:
        return <Layers className="w-3 h-3 text-blue-400 shrink-0" />;
    }
  };

  const isSelected = selectedBotId === bot.id;

  return (
    <div
      className={`group relative flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl border transition-all duration-200 ${
        isSelected
          ? "border-emerald-500/70 bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
          : bot.active
          ? "border-border/60 bg-card/60 hover:bg-card/90 hover:border-border"
          : "border-border/30 bg-card/25 opacity-70 hover:opacity-90"
      }`}
    >
      {/* Coluna 1: Rank, Indicador, Identificação e Estratégia */}
      <div className="flex items-center gap-3 min-w-0 md:w-1/3">
        <span className="font-mono text-[11px] font-bold text-muted-foreground/60 w-5 text-right shrink-0">
          #{index + 1}
        </span>

        <div className="relative flex items-center justify-center shrink-0">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              bot.active
                ? hasPosition
                  ? "bg-crypto-gold animate-pulse shadow-[0_0_8px_#f59e0b]"
                  : "bg-crypto-green animate-pulse shadow-[0_0_8px_#22c55e]"
                : "bg-muted-foreground/40"
            }`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-xs text-foreground truncate max-w-[160px] sm:max-w-[200px]" title={bot.name}>
              {bot.name}
            </span>
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 border-border/50 bg-secondary/30 text-muted-foreground flex items-center gap-1 shrink-0"
            >
              {getStrategyIcon(bot.strategy)}
              <span className="truncate max-w-[90px]">{strategyName(bot.strategy)}</span>
            </Badge>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
            {/* Par operado */}
            <button
              type="button"
              onClick={() => {
                if (activeSymbol !== "AUTO") {
                  setSelectedSymbol(cleanActiveSymbol);
                  setActiveSection("chart");
                }
              }}
              className="font-mono font-semibold text-foreground/90 hover:text-crypto-cyan hover:underline cursor-pointer flex items-center gap-0.5"
              title={`Abrir gráfico de ${cleanActiveSymbol}`}
            >
              {activeSymbol === "AUTO" ? (
                <span className="text-orange-400 font-sans flex items-center gap-0.5">
                  <Flame className="w-2.5 h-2.5" /> AUTO-SCREENER
                </span>
              ) : (
                <>
                  <span>{activeSymbol.replace("USDT", "")}</span>
                  <span className="text-muted-foreground/60">/USDT</span>
                </>
              )}
            </button>

            <span>•</span>
            <span className="font-mono">${bot.allocationAmount} USDT</span>

            {bot.active && hasPosition && (
              <Badge
                variant="outline"
                className="text-[9px] px-1 py-0 border-amber-500/40 bg-amber-500/10 text-amber-300 font-semibold"
              >
                Em Posição
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Coluna 2: Posição Aberta & PnL Não Realizado */}
      <div className="flex items-center justify-between md:justify-center md:w-1/4 px-2 py-1 md:py-0 rounded-lg bg-secondary/20 md:bg-transparent">
        <div className="text-left md:text-center">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-semibold">
            Posição Atual
          </span>
          {hasPosition ? (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-bold text-foreground">
                ${formatPrice(bot.position!.quantity * currentPrice)}
              </span>
              <span
                className={`font-mono text-[11px] font-extrabold ${
                  isProfit ? "text-crypto-green" : "text-crypto-red"
                }`}
              >
                {isProfit ? "+" : ""}
                {gainPercent.toFixed(2)}%
                <span className="text-[9px] opacity-80 ml-0.5">
                  (${unrealizedPnlUsdt >= 0 ? "+" : ""}${unrealizedPnlUsdt.toFixed(2)})
                </span>
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/60 font-mono">
              {bot.active ? "Escaneando book..." : "Pausado"}
            </span>
          )}
        </div>

        {/* Botão rápido de Take Profit se estiver em posição */}
        {hasPosition && (
          <Button
            size="sm"
            variant="outline"
            disabled={isClosing}
            onClick={handleTakeProfitNow}
            className={`h-7 px-2 text-[10px] font-bold cursor-pointer md:hidden ${
              isProfit
                ? "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                : "border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
            }`}
          >
            Fechar (${unrealizedPnlUsdt >= 0 ? "+" : ""}${unrealizedPnlUsdt.toFixed(2)})
          </Button>
        )}
      </div>

      {/* Coluna 3: PnL Realizado & Performance Histórica */}
      <div className="flex items-center justify-between md:justify-center md:w-1/5">
        <div className="text-left md:text-right">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-semibold">
            Lucro Fechado
          </span>
          <div className="flex items-center md:justify-end gap-1.5">
            <span
              className={`font-mono text-xs font-bold ${
                realizedPnl >= 0 ? "text-crypto-green" : "text-crypto-red"
              }`}
            >
              {realizedPnl >= 0 ? "+" : ""}${formatPrice(Math.abs(realizedPnl))} USDT
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              ({winRate.toFixed(0)}% · {totalTrades}T)
            </span>
          </div>
        </div>
      </div>

      {/* Coluna 4: Controles e Ações Rápidas */}
      <div className="flex items-center justify-end gap-1 shrink-0 pt-2 md:pt-0 border-t border-border/20 md:border-none">
        {/* Botão de Fechar Posição em Desktop se tiver aberto */}
        {hasPosition && (
          <Button
            size="sm"
            variant="outline"
            disabled={isClosing}
            onClick={handleTakeProfitNow}
            className={`hidden md:inline-flex h-7 px-2.5 text-[10px] font-bold cursor-pointer transition-all ${
              isProfit
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                : "border-rose-500/50 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
            }`}
            title="Encerrar posição a mercado imediatamente"
          >
            Fechar {unrealizedPnlUsdt >= 0 ? "+" : ""}${unrealizedPnlUsdt.toFixed(2)}
          </Button>
        )}

        {/* Play / Pause Toggle */}
        <Button
          size="icon"
          variant={bot.active ? "outline" : "default"}
          className={`h-7 w-7 rounded-lg cursor-pointer ${
            bot.active
              ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
              : "bg-crypto-green hover:bg-crypto-green/90 text-white"
          }`}
          onClick={() => {
            if (bot.active && hasPosition) {
              setPauseDialogOpen(true);
            } else {
              toggleBotActive(bot.id);
            }
          }}
          title={bot.active ? "Pausar robô" : "Iniciar robô"}
        >
          {bot.active ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
        </Button>

        {/* Editar Parâmetros */}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-secondary/60 cursor-pointer"
          onClick={() => onEdit(bot)}
          title="Configurar parâmetros do robô"
        >
          <Settings className="w-3.5 h-3.5" />
        </Button>

        {/* Zerar Métricas */}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 cursor-pointer"
          onClick={() => {
            if (confirm(`Deseja zerar as estatísticas do ${bot.name}?`)) {
              resetBotStats(bot.id);
              toast({
                title: "Métricas Zeradas",
                description: `Estatísticas do ${bot.name} foram reiniciadas.`,
              });
            }
          }}
          title="Zerar métricas deste robô"
        >
          <RotateCcw className="w-3 h-3" />
        </Button>

        {/* Excluir Robô */}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-crypto-red hover:bg-crypto-red/10 cursor-pointer"
          onClick={() => {
            if (hasPosition) {
              if (
                confirm(
                  `⚠️ ATENÇÃO: O robô ${bot.name} possui posição aberta em ${cleanActiveSymbol}!\n\nDeseja remover o robô mantendo o ativo na carteira?`
                )
              ) {
                removeBot(bot.id);
              }
            } else if (confirm(`Deseja remover ${bot.name} da frota?`)) {
              removeBot(bot.id);
            }
          }}
          title="Excluir da frota"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>

      {/* Pause Confirmation Dialog */}
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
    </div>
  );
});
