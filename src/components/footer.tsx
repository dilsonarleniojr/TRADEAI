"use client";

import { useCryptoStore } from "@/lib/store";
import { formatCurrency, formatPercent } from "@/lib/format";
import { selectPortfolioMetrics } from "@/lib/selectors/portfolioMetrics";
import { Wallet, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

export function Footer() {
  const { portfolio, trades, tradingMode } = useCryptoStore(
    useShallow((s) => ({
      portfolio: s.portfolio,
      trades: s.trades,
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

  const isPositive = metrics.netPnl >= 0;

  return (
    <motion.footer
      initial={{ y: 60 }}
      animate={{ y: 0 }}
      className="hidden md:flex sticky bottom-0 md:bottom-auto md:mt-auto z-40 h-9 items-center justify-between px-4 md:px-5 bg-card/90 backdrop-blur-xl border-t border-border relative safe-bottom select-none text-xs"
    >
      <div className="flex items-center gap-4 md:gap-6">
        <span className="hidden md:inline font-mono font-bold text-[11px] text-primary">TRADEAI TERMINAL</span>
        <div className="flex items-center gap-1.5">
          <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground text-[11px]">Patrimônio:</span>
          <span className="font-semibold font-mono text-foreground tabular-nums">
            {formatCurrency(metrics.totalBalance)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground text-[11px]">Caixa:</span>
          <span className="font-medium font-mono text-foreground tabular-nums">
            {formatCurrency(metrics.cashBalance)}
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="text-muted-foreground text-[11px]">Em Ativos:</span>
          <span className="font-medium font-mono text-foreground tabular-nums">
            {formatCurrency(metrics.allocatedBalance)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {isPositive ? (
          <TrendingUp className="w-3.5 h-3.5 text-crypto-green" />
        ) : (
          <TrendingDown className="w-3.5 h-3.5 text-crypto-red" />
        )}
        <span className="text-muted-foreground text-[11px]">L/P Realizado:</span>
        <div
          className={cn(
            "font-semibold font-mono text-[11px] px-2 py-0.5 rounded-md tabular-nums",
            isPositive
              ? "text-crypto-green bg-crypto-green/10 border border-crypto-green/20"
              : "text-crypto-red bg-crypto-red/10 border border-crypto-red/20"
          )}
        >
          {formatCurrency(metrics.netPnl, { showSign: true })} ({formatPercent(portfolio.pnlPercent)})
        </div>
      </div>
    </motion.footer>
  );
}

