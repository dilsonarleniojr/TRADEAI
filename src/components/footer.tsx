"use client";

import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatPercent } from "@/lib/format";
import { Wallet, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useMemo } from "react";

export function Footer() {
  const { portfolio } = useCryptoStore();
  const isPositive = portfolio.pnl >= 0;
  const pnlKey = useMemo(
    () => `${portfolio.pnl}-${portfolio.pnlPercent}`,
    [portfolio.pnl, portfolio.pnlPercent]
  );

  return (
    <motion.footer
      initial={{ y: 60 }}
      animate={{ y: 0 }}
      className="hidden md:flex sticky bottom-0 md:bottom-auto md:mt-auto z-40 h-12 items-center justify-between px-4 md:px-6 glass relative safe-bottom"
    >
      {/* Gradient top border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-crypto-cyan/40 to-transparent" />

      <div className="flex items-center gap-4 md:gap-6 text-xs md:text-sm">
        <span className="hidden md:inline text-xs font-semibold gradient-text-cyan">Crypto IA Pro</span>
        <div className="flex items-center gap-1.5">
          <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Valor:</span>
          <span className="font-semibold number-animate">
            ${formatPrice(portfolio.totalValue)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Caixa:</span>
          <span className="font-medium">
            ${formatPrice(portfolio.cashBalance)}
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="text-muted-foreground">Ativos:</span>
          <span className="font-medium">
            ${formatPrice(portfolio.assetBalance)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {isPositive ? (
          <TrendingUp className="w-3.5 h-3.5 text-crypto-green" />
        ) : (
          <TrendingDown className="w-3.5 h-3.5 text-crypto-red" />
        )}
        <span className="text-muted-foreground text-xs md:text-sm">L/P:</span>
        <div
          key={pnlKey}
          className={cn(
            "font-semibold text-xs md:text-sm number-animate px-2 py-0.5 rounded-md",
            isPositive
              ? "text-crypto-green bg-crypto-green/10"
              : "text-crypto-red bg-crypto-red/10"
          )}
        >
          {isPositive ? "+" : ""}
          {formatPrice(portfolio.pnl)} ({formatPercent(portfolio.pnlPercent)})
        </div>
      </div>
    </motion.footer>
  );
}
