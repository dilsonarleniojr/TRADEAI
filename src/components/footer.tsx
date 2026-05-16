"use client";

import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatPercent } from "@/lib/format";
import { Wallet, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export function Footer() {
  const { portfolio } = useCryptoStore();
  const isPositive = portfolio.pnl >= 0;

  return (
    <motion.footer
      initial={{ y: 60 }}
      animate={{ y: 0 }}
      className="sticky bottom-0 md:bottom-auto md:mt-auto z-40 h-12 flex items-center justify-between px-4 md:px-6 bg-card/80 backdrop-blur-md border-t border-border"
    >
      <div className="flex items-center gap-4 md:gap-6 text-xs md:text-sm">
        <div className="flex items-center gap-1.5">
          <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Value:</span>
          <span className="font-semibold">
            ${formatPrice(portfolio.totalValue)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Cash:</span>
          <span className="font-medium">
            ${formatPrice(portfolio.cashBalance)}
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="text-muted-foreground">Assets:</span>
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
        <span className="text-muted-foreground text-xs md:text-sm">PnL:</span>
        <span
          className={cn(
            "font-semibold text-xs md:text-sm",
            isPositive ? "text-crypto-green" : "text-crypto-red"
          )}
        >
          {isPositive ? "+" : ""}
          {formatPrice(portfolio.pnl)} ({formatPercent(portfolio.pnlPercent)})
        </span>
      </div>
    </motion.footer>
  );
}
