"use client";

import { useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatCurrency, formatPercent } from "@/lib/format";
import { selectPortfolioMetrics } from "@/lib/selectors/portfolioMetrics";
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
  const { portfolio, trades, botActive, activeBotsCount, tickers, connectionStatus, setSelectedSymbol, tradingMode } = useCryptoStore(
    useShallow((s) => ({
      portfolio: s.portfolio,
      trades: s.trades,
      botActive: s.botActive,
      activeBotsCount: s.bots ? s.bots.filter((b) => b.active).length : 0,
      tickers: s.tickers,
      connectionStatus: s.connectionStatus,
      setSelectedSymbol: s.setSelectedSymbol,
      tradingMode: s.tradingMode,
    }))
  );

  const metrics = useMemo(() => {
    return selectPortfolioMetrics(
      {
        totalBalance: portfolio.totalValue,
        cashBalance: portfolio.cashBalance,
        positions: portfolio.positions,
        initialBalance: 10000,
      },
      trades,
      { mode: tradingMode }
    );
  }, [portfolio, trades, tradingMode]);

  // Connection status indicator config
  const statusConfig: Record<string, { color: string; label: string }> = {
    connected: { color: "bg-crypto-green", label: "Binance WS" },
    "rest-api": { color: "bg-crypto-cyan", label: "REST Polling" },
    connecting: { color: "bg-amber-400 animate-pulse", label: "Conectando" },
    disconnected: { color: "bg-crypto-red", label: "Offline" },
  };
  const currentStatus = statusConfig[connectionStatus] || statusConfig["rest-api"];

  // Find best performer from tickers in a single memoized pass
  const { bestPerformer, totalVolume } = useMemo(() => {
    const values = Object.values(tickers);
    if (values.length === 0) return { bestPerformer: null, totalVolume: 0 };
    let best = values[0];
    let vol = 0;
    for (let i = 0; i < values.length; i++) {
      const t = values[i];
      vol += t.quoteVolume || 0;
      if (t.priceChangePercent > best.priceChangePercent) {
        best = t;
      }
    }
    return { bestPerformer: best, totalVolume: vol };
  }, [tickers]);

  const effectiveActiveBots = activeBotsCount > 0 ? activeBotsCount : (botActive ? 1 : 0);

  const stats = [
    {
      id: "balance",
      title: "Patrimônio Total",
      tooltip: "Valor consolidado da carteira (Saldo USDT + Criptoativos)",
      value: metrics.totalBalance,
      displayValue: formatCurrency(metrics.totalBalance),
      subValue: `${formatPercent(portfolio.pnlPercent)} (24h)`,
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
      title: "L/P Realizado & Acerto",
      tooltip: "Lucro ou prejuízo apurado em ordens fechadas e taxa de acerto real",
      value: metrics.netPnl,
      displayValue: formatCurrency(metrics.netPnl, { showSign: true }),
      subValue: metrics.closedTradesCount > 0
        ? `${metrics.winRate.toFixed(1)}% Taxa de Acerto (${metrics.winningTradesCount}V / ${metrics.losingTradesCount}D)`
        : "Aguardando ordens fechadas",
      subPositive: metrics.netPnl >= 0,
      icon: metrics.netPnl >= 0 ? TrendingUp : TrendingDown,
      iconColor: metrics.netPnl >= 0 ? "text-crypto-green" : "text-crypto-red",
      iconBg: metrics.netPnl >= 0 ? "bg-crypto-green/15" : "bg-crypto-red/15",
      accentBorder: metrics.netPnl >= 0 ? "border-l-2 border-l-crypto-green" : "border-l-2 border-l-crypto-red",
      hoverGlow: metrics.netPnl >= 0 ? "hover:border-crypto-green/40" : "hover:border-crypto-red/40",
      animate: false,
      trendDir: metrics.netPnl >= 0 ? "up" : "down" as const,
    },
    {
      id: "volume",
      title: "Volume Rastreado (24h)",
      tooltip: "Volume somado das moedas monitoradas e ordens executadas",
      value: totalVolume,
      displayValue: totalVolume > 0 ? formatCurrency(totalVolume, { compact: true }) : "US$ 0,00",
      subValue: `${metrics.totalOrders} ${metrics.totalOrders === 1 ? "Ordem Executada" : "Ordens Executadas"}`,
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
      title: "Robôs em Operação",
      tooltip: "Status operacional dos robôs quantitativos simultâneos",
      value: effectiveActiveBots,
      displayValue: `${effectiveActiveBots} ${effectiveActiveBots === 1 ? "Ativo" : "Ativos"}`,
      subValue: effectiveActiveBots > 0 ? "Estratégias rodando" : "Nenhum robô ligado",
      subPositive: effectiveActiveBots > 0,
      icon: Bot,
      iconColor: effectiveActiveBots > 0 ? "text-crypto-green" : "text-muted-foreground",
      iconBg: effectiveActiveBots > 0 ? "bg-crypto-green/15" : "bg-secondary/40",
      accentBorder: effectiveActiveBots > 0 ? "border-l-2 border-l-crypto-green" : "border-l-2 border-l-muted",
      hoverGlow: effectiveActiveBots > 0 ? "hover:border-crypto-green/40" : "",
      animate: false,
      trendDir: effectiveActiveBots > 0 ? "up" : "neutral" as const,
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
              stat.id === "pnl" && (metrics.netPnl >= 0 ? "bg-emerald-500" : "bg-rose-500"),
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
