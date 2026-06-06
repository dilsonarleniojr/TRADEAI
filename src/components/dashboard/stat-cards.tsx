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

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.4, ease: "easeOut" },
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
  const { portfolio, trades, botActive, tickers, connectionStatus } = useCryptoStore();

  // Connection status indicator config
  const statusConfig: Record<string, { color: string; label: string }> = {
    connected: { color: "bg-crypto-green", label: "WS" },
    "rest-api": { color: "bg-amber-400", label: "Polling" },
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

  // Calculate total volume
  const totalVolume = tickerValues.reduce((sum, t) => sum + t.quoteVolume, 0);

  const todayTrades = trades.length;

  const stats = [
    {
      title: "Valor da Carteira",
      tooltip: "Valor total da carteira incluindo caixa e ativos",
      value: portfolio.totalValue,
      displayValue: `$${formatPrice(portfolio.totalValue)}`,
      subValue: formatPercent(portfolio.pnlPercent),
      subPositive: portfolio.pnlPercent >= 0,
      icon: Wallet,
      iconColor: "text-crypto-cyan",
      iconBg: "bg-gradient-to-br from-crypto-cyan/20 to-crypto-cyan/5",
      accentClass: "card-accent-cyan",
      hoverGlow: "hover:glow-cyan-sm",
      animate: true,
      trendDir: portfolio.pnlPercent >= 0 ? "up" : portfolio.pnlPercent < 0 ? "down" : "neutral" as const,
    },
    {
      title: "Total de Trades Hoje",
      tooltip: "Número de trades executados hoje",
      value: todayTrades,
      displayValue: todayTrades.toString(),
      subValue: `${trades.filter((t) => t.pnl > 0).length} lucrativos`,
      subPositive: true,
      icon: ArrowUpDown,
      iconColor: "text-crypto-gold",
      iconBg: "bg-gradient-to-br from-crypto-gold/20 to-crypto-gold/5",
      accentClass: "card-accent-gold",
      hoverGlow: "",
      animate: false,
      trendDir: "neutral" as const,
    },
    {
      title: "Status do Bot",
      tooltip: "Status operacional atual do bot",
      value: botActive ? 1 : 0,
      displayValue: botActive ? "Ativo" : "Inativo",
      subValue: botActive ? "Executando estratégias" : "Pausado",
      subPositive: botActive,
      icon: Bot,
      iconColor: botActive ? "text-crypto-green" : "text-muted-foreground",
      iconBg: botActive
        ? "bg-gradient-to-br from-crypto-green/20 to-crypto-green/5"
        : "bg-secondary",
      accentClass: botActive ? "card-accent-green" : "",
      hoverGlow: botActive ? "hover:glow-green-sm" : "",
      animate: false,
      trendDir: botActive ? "up" : "neutral" as const,
    },
    {
      title: "Melhor Desempenho",
      tooltip: "Melhor ativo em desempenho nas últimas 24h",
      value: bestPerformer?.priceChangePercent ?? 0,
      displayValue: bestPerformer
        ? bestPerformer.symbol.replace("USDT", "")
        : "—",
      subValue: bestPerformer
        ? formatPercent(bestPerformer.priceChangePercent)
        : "Sem dados",
      subPositive: bestPerformer ? bestPerformer.priceChangePercent >= 0 : true,
      icon: TrendingUp,
      iconColor: bestPerformer?.priceChangePercent >= 0 ? "text-crypto-green" : "text-crypto-red",
      iconBg: bestPerformer?.priceChangePercent >= 0
        ? "bg-gradient-to-br from-crypto-green/20 to-crypto-green/5"
        : "bg-gradient-to-br from-crypto-red/20 to-crypto-red/5",
      accentClass: bestPerformer?.priceChangePercent >= 0 ? "card-accent-green" : "card-accent-red",
      hoverGlow: "hover:glow-green-sm",
      animate: true,
      trendDir: bestPerformer?.priceChangePercent >= 0 ? "up" : "down" as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.title}
          custom={i}
          initial="hidden"
          animate="visible"
          variants={cardVariants}
        >
          <Card
            className={cn(
              "bg-card/60 backdrop-blur-md gradient-border overflow-hidden cursor-default transition-all duration-200 hover:scale-[1.02] card-shimmer",
              stat.hoverGlow,
              stat.accentClass
            )}
          >
            <CardContent className="p-4 relative">
              <div className="flex items-start justify-between mb-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1 cursor-help">
                      {stat.title}
                      <Info className="w-3 h-3 opacity-40 hover:opacity-70 transition-opacity" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={4}>
                    <p className="text-xs">{stat.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center icon-breathe", stat.iconBg)}>
                  <stat.icon className={cn("w-5 h-5", stat.iconColor)} />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xl md:text-2xl font-bold tracking-tight leading-none number-animate">
                  {stat.animate && stat.title === "Valor da Carteira" ? (
                    <AnimatedValue value={stat.value} prefix="$" decimals={2} />
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      {stat.displayValue}
                      {stat.trendDir === "up" && <ArrowUpRight className="w-3.5 h-3.5 text-crypto-green" />}
                      {stat.trendDir === "down" && <ArrowDownRight className="w-3.5 h-3.5 text-crypto-red" />}
                      {stat.trendDir === "neutral" && stat.title !== "Status do Bot" && <Minus className="w-3 h-3 text-muted-foreground/50" />}
                    </span>
                  )}
                </p>
                <p
                  className={cn(
                    "text-xs font-semibold value-bounce flex items-center gap-1.5",
                    stat.subPositive ? "text-crypto-green" : "text-crypto-red"
                  )}
                >
                  {stat.subValue}
                  {stat.title === "Valor da Carteira" && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-medium text-muted-foreground">
                      <span className={cn("w-1.5 h-1.5 rounded-full", currentStatus.color)} />
                      {currentStatus.label}
                    </span>
                  )}
                </p>
              </div>
              {/* Subtle gradient line at bottom */}
              <div className="absolute bottom-0 left-2 right-2 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
