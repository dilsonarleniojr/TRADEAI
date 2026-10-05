"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatPercent } from "@/lib/format";
import { Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useShallow } from "zustand/react/shallow";

export function MobilePortfolioBar() {
  const { portfolio } = useCryptoStore(
  useShallow((s) => ({ portfolio: s.portfolio }))
);
  const isPositive = portfolio.pnl >= 0;
  const [isVisible, setIsVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 5000);
  }, []);

  const handleInteraction = useCallback(() => {
    setIsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  // Start auto-hide timer on mount
  useEffect(() => {
    scheduleHide();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [scheduleHide]);

  // Show on scroll
  useEffect(() => {
    const handleScroll = () => {
      handleInteraction();
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleInteraction]);

  return (
    <div className="md:hidden fixed left-0 right-0 z-[45]" style={{ bottom: "60px" }}>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="mx-2 glass rounded-lg px-3 py-1.5 flex items-center justify-between relative"
          >
            {/* Gradient top border */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-crypto-cyan/50 to-transparent" />

            {/* Portfolio Value */}
            <div className="flex items-center gap-1.5">
              <Wallet className="w-3 h-3 text-crypto-cyan" />
              <span className="text-[10px] text-muted-foreground">Valor:</span>
              <span className="text-[11px] font-semibold number-animate">
                ${formatPrice(portfolio.totalValue)}
              </span>
            </div>

            {/* P&L */}
            <div className="flex items-center gap-1">
              {isPositive ? (
                <TrendingUp className="w-3 h-3 text-crypto-green" />
              ) : (
                <TrendingDown className="w-3 h-3 text-crypto-red" />
              )}
              <span className="text-[10px] text-muted-foreground">L/P:</span>
              <span
                className={`text-[11px] font-semibold ${
                  isPositive ? "text-crypto-green" : "text-crypto-red"
                }`}
              >
                {isPositive ? "+" : ""}
                {formatPrice(portfolio.pnl)} ({formatPercent(portfolio.pnlPercent)})
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
