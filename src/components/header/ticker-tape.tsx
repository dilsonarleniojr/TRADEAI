"use client";

import { useCryptoStore } from "@/lib/store";
import { CRYPTO_COLORS } from "@/lib/crypto-meta";
import { formatPrice, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

export function TickerTape() {
  const { tickers } = useCryptoStore();

  const tickerList = Object.values(tickers).sort(
    (a, b) => b.quoteVolume - a.quoteVolume
  );

  if (tickerList.length === 0) return null;

  // Duplicate items for seamless loop
  const items = [...tickerList, ...tickerList];

  return (
    <div className="w-full overflow-hidden bg-background/50 border-b border-border/50 h-8 flex items-center relative">
      {/* Gradient fade left edge */}
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-background/80 to-transparent z-10 pointer-events-none" />
      {/* Gradient fade right edge */}
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-background/80 to-transparent z-10 pointer-events-none" />

      <div className="ticker-tape flex items-center gap-8 whitespace-nowrap">
        {items.map((ticker, i) => {
          const isPositive = ticker.priceChangePercent >= 0;
          const color = CRYPTO_COLORS[ticker.symbol] || "#06b6d4";
          const key = `${ticker.symbol}-${i}`;

          return (
            <div key={key} className="flex items-center gap-2 text-[11px] shrink-0">
              <div
                className="w-2 h-2 rounded-full shrink-0 ring-1 ring-white/10"
                style={{ backgroundColor: color }}
              />
              <span className="font-semibold text-foreground/90 tracking-wide">
                {ticker.symbol.replace("USDT", "")}
              </span>
              <span className="font-mono text-foreground/60 tabular-nums">
                ${formatPrice(ticker.price)}
              </span>
              <span
                className={cn(
                  "font-mono font-semibold flex items-center gap-0.5 tabular-nums",
                  isPositive ? "text-crypto-green" : "text-crypto-red"
                )}
              >
                {isPositive ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {formatPercent(ticker.priceChangePercent)}
              </span>
              {/* Separator bar */}
              {i < items.length - 1 && (
                <span className="text-muted-foreground/20 ml-2">│</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
