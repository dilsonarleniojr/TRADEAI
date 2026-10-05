"use client";

import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatPercent } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Wallet,
  ArrowUpDown,
  Bot,
  TrendingUp,
  TrendingDown,
  Info,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useCountUp } from "@/hooks/use-count-up";
import { useShallow } from "zustand/react/shallow";

const cardVariants: any = {
  hidden: { opacity: 0, y: 15 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.35 },
  }),
};

function AnimatedValue({ value, prefix = "", suffix = "", decimals = 2 }: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const animatedValue = useCountUp(value, 500, true);
  return (
    <span className="number-animate">
      {prefix}{decimals > 0 ? animatedValue.toFixed(decimals) : Math.round(animatedValue)}{suffix}
    </span>
  );
}

export function StatCards() {
  const { portfolio, trades, botActive, bots, tickers, connectionStatus, setSelectedSymbol } = useCryptoStore(
    useShallow((s) => ({
      portfolio: s.portfolio,
      trades: s.trades,
      botActive: s.botActive,
      bots: s.bots,
      tickers: s.tickers,
      connectionStatus: s.connectionStatus,
      setSelectedSymbol: s.setSelectedSymbol,
    }))
  );

  // Connection status indicator config
  const statusConfig: Record<string, { color: string; label: string }> = {
    connected: { color: "bg-crypto-green", label: "Binance WS" },
    "rest-api": { color: "bg-crypto-cyan", label: "REST Polling" },
    connecting: { color: "bg-amber-400 animate-pulse", label: "Conectando" },
    disconnected: { color: "bg-crypto-red", label: "Offline" },
  };
  const currentStatus = statusConfig[connectionStatus] || statusConfig["rest-api"];

  // Find best performer from tickers
  const tickerValues = Object.values(tickers);
  const bestPerformer = tickerValues.length > 0
    ? tickerValues.reduce((best, t) =>
        t.priceChangePercent > best.priceChangePercent ? t : best
      )
    : null;

  // Calculate total volume and win rate
  const totalVolume = tickerValues.reduce((sum, t) => sum + (t.quoteVolume || 0), 0);
  const todayTrades = trades.length;
  const profitableTrades = trades.filter((t) => t.pnl > 0).length;
  const winRate = todayTrades > 0 ? (profitableTrades / todayTrades) * 100 : 0;
  const activeBotsCount = bots ? bots.filter((b) => b.active).length : (botActive ? 1 : 0);
  const currentPnl = portfolio.realizedPnl ?? portfolio.pnl ?? 0;

  const stats = [
    {
      id: "balance",
      title: "Patrimônio Total",
      tooltip: "Valor consolidado da carteira (Saldo USDT + Criptoativos)",
      value: portfolio.totalValue,
      displayValue: `$${formatPrice(portfolio.totalValue)}`,
      subValue: `${portfolio.pnlPercent >= 0 ? "+" : ""}${formatPercent(portfolio.pnlPercent)} (24h)`,
      subPositive: portfolio.pnlPercent >= 0,
      icon: Wallet,
      iconColor: "text-crypto-cyan",
      iconBg: "bg-crypto-cyan/15",
      accentBorder: "border-l-2 border-l-crypto-cyan",
      hoverGlow: "hover:border-crypto-cyan/40",
      animate: true,
      trendDir: portfolio.pnlPercent >= 0 ? "up" : portfolio.pnlPercent < 0 ? "down" : "neutral" as const,
      badgeText: currentStatus.label,
      badgeDot: currentStatus.color,
    },
    {
      id: "pnl",
      title: "P&L & Win Rate",
      tooltip: "Lucro/Prejuízo acumulado e taxa de acerto das operações",
      value: currentPnl,
      displayValue: `${currentPnl >= 0 ? "+" : ""}$${formatPrice(Math.abs(currentPnl))}`,
      subValue: `${winRate.toFixed(1)}% Taxa de Acerto (${profitableTrades}/${todayTrades})`,
      subPositive: currentPnl >= 0,
      icon: TrendingUp,
      iconColor: currentPnl >= 0 ? "text-crypto-green" : "text-crypto-red",
      iconBg: currentPnl >= 0 ? "bg-crypto-green/15" : "bg-crypto-red/15",
      accentBorder: currentPnl >= 0 ? "border-l-2 border-l-crypto-green" : "border-l-2 border-l-crypto-red",
      hoverGlow: currentPnl >= 0 ? "hover:border-crypto-green/40" : "hover:border-crypto-red/40",
      animate: false,
      trendDir: currentPnl >= 0 ? "up" : "down" as const,
    },
    {
      id: "volume",
      title: "Volume Rastreado (24h)",
      tooltip: "Volume global somado das 503 moedas monitoradas na Binance Spot",
      value: totalVolume,
      displayValue: `$${(totalVolume / 1_000_000_000).toFixed(2)}B`,
      subValue: `${todayTrades} Ordens Executadas`,
      subPositive: true,
      icon: ArrowUpDown,
      iconColor: "text-crypto-gold",
      iconBg: "bg-crypto-gold/15",
      accentBorder: "border-l-2 border-l-crypto-gold",
      hoverGlow: "hover:border-crypto-gold/40",
      animate: false,
      trendDir: "neutral" as const,
    },
    {
      id: "bots",
      title: "Robôs & Automações",
      tooltip: "Status operacional dos robôs quantitativos simultâneos",
      value: activeBotsCount,
      displayValue: `${activeBotsCount} ${activeBotsCount === 1 ? "Ativo" : "Ativos"}`,
      subValue: activeBotsCount > 0 ? "Grid + Scalp + IA rodando" : "Nenhum robô ligado",
      subPositive: activeBotsCount > 0,
      icon: Bot,
      iconColor: activeBotsCount > 0 ? "text-crypto-green" : "text-muted-foreground",
      iconBg: activeBotsCount > 0 ? "bg-crypto-green/15" : "bg-secondary/40",
      accentBorder: activeBotsCount > 0 ? "border-l-2 border-l-crypto-green" : "border-l-2 border-l-muted",
      hoverGlow: activeBotsCount > 0 ? "hover:border-crypto-green/40" : "",
      animate: false,
      trendDir: activeBotsCount > 0 ? "up" : "neutral" as const,
    },
    {
      id: "best",
      title: "Top Gainer (24h)",
      tooltip: "Criptomoeda com a maior valorização percentual hoje. Clique para abrir no gráfico.",
      value: bestPerformer?.priceChangePercent ?? 0,
      displayValue: bestPerformer ? bestPerformer.symbol.replace("USDT", "") : "—",
      subValue: bestPerformer ? `${bestPerformer.priceChangePercent >= 0 ? "+" : ""}${formatPercent(bestPerformer.priceChangePercent)}` : "Sem dados",
      subPositive: bestPerformer ? bestPerformer.priceChangePercent >= 0 : true,
      icon: TrendingUp,
      iconColor: "text-crypto-green",
      iconBg: "bg-crypto-green/15",
      accentBorder: "border-l-2 border-l-crypto-green",
      hoverGlow: "hover:border-crypto-green/50 cursor-pointer",
      animate: false,
      trendDir: "up" as const,
      onClick: () => {
        if (bestPerformer) setSelectedSymbol(bestPerformer.symbol);
      },
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.id}
          custom={i}
          initial="hidden"
          animate="visible"
          variants={cardVariants}
        >
          <div
            onClick={stat.onClick}
            className={cn(
              "relative bg-[#0d131f]/80 backdrop-blur-xl border border-white/[0.07] hover:border-white/[0.14] rounded-xl p-3.5 transition-all duration-200 select-none group shadow-sm flex flex-col justify-between h-full",
              stat.onClick && "cursor-pointer"
            )}
          >
            {/* Top delicate accent highlight */}
            <div className={cn(
              "absolute top-0 left-3 right-3 h-[2px] rounded-full transition-opacity opacity-40 group-hover:opacity-100",
              stat.id === "balance" && "bg-cyan-500",
              stat.id === "pnl" && (currentPnl >= 0 ? "bg-emerald-500" : "bg-rose-500"),
              stat.id === "volume" && "bg-amber-500",
              stat.id === "bots" && (activeBotsCount > 0 ? "bg-emerald-500" : "bg-slate-500"),
              stat.id === "best" && "bg-emerald-500"
            )} />

            <div>
              <div className="flex items-center justify-between mb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1 cursor-help truncate">
                      {stat.title}
                      <Info className="w-2.5 h-2.5 opacity-40 group-hover:opacity-80 transition-opacity shrink-0" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={4} className="glass text-xs">
                    <p>{stat.tooltip}</p>
                  </TooltipContent>
                </Tooltip>

                <div className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-transform group-hover:scale-105", stat.iconBg)}>
                  <stat.icon className={cn("w-3.5 h-3.5", stat.iconColor)} />
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xl font-bold tracking-tight font-mono tabular-nums leading-tight flex items-center gap-1 text-slate-100">
                  {stat.animate && stat.id === "balance" ? (
                    <AnimatedValue value={stat.value} prefix="$" decimals={2} />
                  ) : (
                    <>
                      <span>{stat.displayValue}</span>
                      {stat.trendDir === "up" && <ArrowUpRight className="w-4 h-4 text-emerald-400 shrink-0" />}
                      {stat.trendDir === "down" && <ArrowDownRight className="w-4 h-4 text-rose-400 shrink-0" />}
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between gap-1 text-[11px] leading-tight pt-0.5">
                  <span
                    className={cn(
                      "font-semibold tabular-nums truncate",
                      stat.subPositive ? "text-emerald-400" : "text-rose-400"
                    )}
                  >
                    {stat.subValue}
                  </span>

                  {stat.badgeText && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-mono text-slate-400 shrink-0 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
                      <span className={cn("w-1.5 h-1.5 rounded-full", stat.badgeDot)} />
                      {stat.badgeText}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
