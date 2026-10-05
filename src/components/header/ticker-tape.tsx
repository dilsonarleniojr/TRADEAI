"use client";

import { useCryptoStore } from "@/lib/store";
import { CRYPTO_COLORS } from "@/lib/crypto-meta";
import { formatPrice, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

// Só os pares de maior volume entram na fita: com os ~500 pares da Binance ela rodava
// a milhares de pixels por segundo e ficava ilegível.
const MAX_TAPE_ITEMS = 40;
// Tempo que cada par leva para atravessar a fita (velocidade constante e legível)
const SECONDS_PER_ITEM = 4;

export function TickerTape() {
  const { tickers } = useCryptoStore(
  useShallow((s) => ({ tickers: s.tickers }))
);

  const tickerList = Object.values(tickers)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, MAX_TAPE_ITEMS);

  if (tickerList.length === 0) return null;

  // Duplicate items for seamless loop
  const items = [...tickerList, ...tickerList];

  return (
    <div aria-label="Cotações dos pares mais negociados (passe o mouse para pausar)" className="ticker-wrap w-full overflow-hidden bg-[#070a10] border-b border-white/[0.06] h-7.5 flex items-center relative select-none">
      {/* Gradient fade left edge */}
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[#070a10] to-transparent z-10 pointer-events-none" />
      {/* Gradient fade right edge */}
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#070a10] to-transparent z-10 pointer-events-none" />

      <div
        className="ticker-tape flex items-center gap-6 whitespace-nowrap"
        style={{ animationDuration: `${tickerList.length * SECONDS_PER_ITEM}s` }}
      >
        {items.map((ticker, i) => {
          const isPositive = ticker.priceChangePercent >= 0;
          const color = CRYPTO_COLORS[ticker.symbol] || "#06b6d4";
          const key = `${ticker.symbol}-${i}`;

          return (
            <div key={key} className="flex items-center gap-2 text-[11px] shrink-0 font-medium">
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="font-semibold text-slate-200 tracking-wide text-[11px]">
                {ticker.symbol.replace("USDT", "")}
              </span>
              <span className="font-mono text-slate-400 tabular-nums text-[11px]">
                ${formatPrice(ticker.price)}
              </span>
              <span
                className={cn(
                  "font-mono font-semibold flex items-center gap-0.5 tabular-nums text-[10px]",
                  isPositive ? "text-emerald-400" : "text-rose-400"
                )}
              >
                {isPositive ? (
                  <TrendingUp className="w-2.5 h-2.5" />
                ) : (
                  <TrendingDown className="w-2.5 h-2.5" />
                )}
                {formatPercent(ticker.priceChangePercent)}
              </span>
              {/* Separator dot */}
              {i < items.length - 1 && (
                <span className="text-white/10 ml-2">·</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
