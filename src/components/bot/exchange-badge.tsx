"use client";

import { cn } from "@/lib/utils";
import type { SupportedExchange } from "@/lib/store";

interface ExchangeBadgeProps {
  exchange?: SupportedExchange | string | null;
  long?: boolean;
  className?: string;
}

/** Selo compacto indicando em qual corretora (Binance ou OKX) o robô opera. */
export function ExchangeBadge({ exchange, long = false, className }: ExchangeBadgeProps) {
  const isOkx = exchange === "okx";

  return (
    <span
      title={isOkx ? "Este robô executa ordens na OKX V5" : "Este robô executa ordens na Binance Spot"}
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider shrink-0 select-none",
        isOkx
          ? "border-sky-500/35 bg-sky-500/12 text-sky-700 dark:text-sky-300"
          : "border-amber-500/35 bg-amber-500/12 text-amber-700 dark:text-amber-300",
        className
      )}
    >
      {isOkx ? (long ? "OKX V5 Unified" : "OKX") : (long ? "Binance Spot" : "Binance")}
    </span>
  );
}
