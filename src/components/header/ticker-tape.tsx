"use client";

import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

const symbolColors: Record<string, string> = {
  BTCUSDT: "#f7931a",
  ETHUSDT: "#627eea",
  BNBUSDT: "#f3ba2f",
  SOLUSDT: "#9945ff",
  XRPUSDT: "#00aae4",
  ADAUSDT: "#0033ad",
  DOGEUSDT: "#c3a634",
  AVAXUSDT: "#e84142",
  DOTUSDT: "#e6007a",
  LINKUSDT: "#2a5ada",
  MATICUSDT: "#8247e5",
  ATOMUSDT: "#2e3148",
};

export function TickerTape() {
  const { tickers } = useCryptoStore();

  const tickerList = Object.values(tickers).sort(
    (a, b) => b.quoteVolume - a.quoteVolume
  );

  if (tickerList.length === 0) return null;

  // Duplicate items for seamless loop
  const items = [...tickerList, ...tickerList];

  return (
    <div className="w-full overflow-hidden bg-background/50 border-b border-border/50 h-7 flex items-center relative">
      {/* Gradient fade left edge */}
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-background/80 to-transparent z-10 pointer-events-none" />
      {/* Gradient fade right edge */}
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-background/80 to-transparent z-10 pointer-events-none" />

      <div className="ticker-tape flex items-center gap-6 whitespace-nowrap">
        {items.map((ticker, i) => {
          const isPositive = ticker.priceChangePercent >= 0;
          const color = symbolColors[ticker.symbol] || "#06b6d4";
          const key = `${ticker.symbol}-${i}`;

          return (
            <div key={key} className="flex items-center gap-1.5 text-xs shrink-0">
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="font-medium text-foreground/80">
                {ticker.symbol.replace("USDT", "")}
              </span>
              <span className="font-mono text-foreground/70">
                ${formatPrice(ticker.price)}
              </span>
              <span
                className={cn(
                  "font-mono font-medium flex items-center gap-0.5",
                  isPositive ? "text-crypto-green" : "text-crypto-red"
                )}
              >
                {isPositive ? (
                  <TrendingUp className="w-2.5 h-2.5" />
                ) : (
                  <TrendingDown className="w-2.5 h-2.5" />
                )}
                {formatPercent(ticker.priceChangePercent)}
              </span>
              {/* Subtle separator dot */}
              {i < items.length - 1 && (
                <span className="text-muted-foreground/30 ml-3">·</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
