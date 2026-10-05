"use client";

import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatPercent } from "@/lib/format";
import { Wallet, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

export function Footer() {
  const { portfolio } = useCryptoStore(
  useShallow((s) => ({ portfolio: s.portfolio }))
);
  const isPositive = portfolio.pnl >= 0;
  const pnlKey = useMemo(
    () => `${portfolio.pnl}-${portfolio.pnlPercent}`,
    [portfolio.pnl, portfolio.pnlPercent]
  );

  return (
    <motion.footer
      initial={{ y: 60 }}
      animate={{ y: 0 }}
      className="hidden md:flex sticky bottom-0 md:bottom-auto md:mt-auto z-40 h-10 items-center justify-between px-4 md:px-5 bg-[#090d14]/90 backdrop-blur-xl border-t border-white/[0.07] relative safe-bottom select-none text-xs"
    >
      <div className="flex items-center gap-4 md:gap-6">
        <span className="hidden md:inline font-mono font-bold text-[11px] text-cyan-400">TRADEAI TERMINAL</span>
        <div className="flex items-center gap-1.5">
          <Wallet className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 text-[11px]">Valor:</span>
          <span className="font-semibold font-mono text-slate-100 tabular-nums">
            ${formatPrice(portfolio.totalValue)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 text-[11px]">Caixa:</span>
          <span className="font-medium font-mono text-slate-300 tabular-nums">
            ${formatPrice(portfolio.cashBalance)}
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="text-slate-400 text-[11px]">Ativos:</span>
          <span className="font-medium font-mono text-slate-300 tabular-nums">
            ${formatPrice(portfolio.assetBalance)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {isPositive ? (
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
        )}
        <span className="text-slate-400 text-[11px]">L/P:</span>
        <div
          key={pnlKey}
          className={cn(
            "font-semibold font-mono text-[11px] px-2 py-0.5 rounded-md tabular-nums",
            isPositive
              ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
              : "text-rose-400 bg-rose-500/10 border border-rose-500/20"
          )}
        >
          {isPositive ? "+" : ""}
          {formatPrice(portfolio.pnl)} ({formatPercent(portfolio.pnlPercent)})
        </div>
      </div>
    </motion.footer>
  );
}
