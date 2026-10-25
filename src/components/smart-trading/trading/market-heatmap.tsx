"use client";

import * as React from "react";
import { TrendingUp, TrendingDown, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCryptoStore } from "@/lib/store";
import { CRYPTO_BY_SYMBOL } from "@/lib/crypto-meta";

export interface HeatmapAsset {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volumeQuoteM: number;
  weight: number;
}

const FALLBACK_HEATMAP_DATA: HeatmapAsset[] = [
  { symbol: "BTC", name: "Bitcoin", price: 68840.5, change24h: 3.42, volumeQuoteM: 38200, weight: 36 },
  { symbol: "ETH", name: "Ethereum", price: 3480.2, change24h: 2.15, volumeQuoteM: 18400, weight: 22 },
  { symbol: "SOL", name: "Solana", price: 182.4, change24h: 6.85, volumeQuoteM: 6100, weight: 14 },
  { symbol: "BNB", name: "BNB Chain", price: 595.1, change24h: 1.05, volumeQuoteM: 1800, weight: 10 },
  { symbol: "XRP", name: "Ripple", price: 0.58, change24h: -1.24, volumeQuoteM: 940, weight: 6 },
  { symbol: "DOGE", name: "Dogecoin", price: 0.142, change24h: 4.80, volumeQuoteM: 1200, weight: 5 },
  { symbol: "AVAX", name: "Avalanche", price: 29.8, change24h: -0.65, volumeQuoteM: 450, weight: 4 },
  { symbol: "SUI", name: "Sui Network", price: 2.15, change24h: 8.40, volumeQuoteM: 780, weight: 3 },
];

export function SmartMarketHeatmap({
  onSelectAsset,
}: {
  onSelectAsset?: (symbol: string) => void;
}) {
  const tickers = useCryptoStore((s) => s.tickers);
  const [activeFilter, setActiveFilter] = React.useState<"all" | "gainers" | "losers">("all");

  const dynamicData = React.useMemo<HeatmapAsset[]>(() => {
    const keys = Object.keys(tickers);
    if (keys.length === 0) return FALLBACK_HEATMAP_DATA;

    const list: HeatmapAsset[] = [];
    for (const rawSym of keys) {
      if (!rawSym.endsWith("USDT")) continue;
      const t = tickers[rawSym];
      if (!t) continue;

      const baseSym = rawSym.replace(/USDT$/, "");
      const meta = CRYPTO_BY_SYMBOL[rawSym];
      const name = meta?.name || baseSym;
      const volM = (t.quoteVolume || 0) / 1e6;

      list.push({
        symbol: baseSym,
        name,
        price: t.price,
        change24h: t.priceChangePercent,
        volumeQuoteM: volM,
        weight: Math.max(1, Math.min(40, Math.round(volM / 500))),
      });
    }

    if (list.length === 0) return FALLBACK_HEATMAP_DATA;

    // Filtrar e ordenar por volume relevante
    if (activeFilter === "gainers") {
      return list
        .filter((a) => a.change24h > 0)
        .sort((a, b) => b.change24h - a.change24h)
        .slice(0, 8);
    }
    if (activeFilter === "losers") {
      return list
        .filter((a) => a.change24h < 0)
        .sort((a, b) => a.change24h - b.change24h)
        .slice(0, 8);
    }

    // "all": Top por volume negociado na Binance
    return list.sort((a, b) => b.volumeQuoteM - a.volumeQuoteM).slice(0, 8);
  }, [tickers, activeFilter]);

  return (
    <div className="w-full bg-[#111111] border border-neutral-800 rounded-2xl p-5 shadow-xl select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-400" />
          <h3 className="text-base font-bold text-white tracking-tight">Heatmap Binance em Tempo Real</h3>
          <span className="text-xs text-neutral-400 font-mono">Volume Ponderado</span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            className={cn(
              "px-3 py-1 rounded-md font-semibold transition-colors",
              activeFilter === "all" ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white"
            )}
          >
            Maiores Volumes
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("gainers")}
            className={cn(
              "px-3 py-1 rounded-md font-semibold transition-colors",
              activeFilter === "gainers" ? "bg-emerald-600/30 text-emerald-400" : "text-neutral-400 hover:text-white"
            )}
          >
            Maiores Altas (+)
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("losers")}
            className={cn(
              "px-3 py-1 rounded-md font-semibold transition-colors",
              activeFilter === "losers" ? "bg-red-600/30 text-red-400" : "text-neutral-400 hover:text-white"
            )}
          >
            Maiores Baixas (-)
          </button>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 min-h-[280px]">
        {dynamicData.map((asset) => {
          const isUp = asset.change24h >= 0;
          const absChange = Math.abs(asset.change24h);

          // Color intensity
          const bgClass = isUp
            ? absChange > 5
              ? "bg-emerald-600/25 border-emerald-500/40 hover:bg-emerald-600/35"
              : "bg-emerald-600/15 border-emerald-500/25 hover:bg-emerald-600/25"
            : absChange > 3
            ? "bg-red-600/25 border-red-500/40 hover:bg-red-600/35"
            : "bg-red-600/15 border-red-500/25 hover:bg-red-600/25";

          return (
            <div
              key={asset.symbol}
              onClick={() => onSelectAsset?.(`${asset.symbol}/USDT`)}
              className={cn(
                "p-4 rounded-xl border flex flex-col justify-between cursor-pointer transition-all duration-200 select-none group hover:scale-[1.02]",
                bgClass
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-base text-white">{asset.symbol}</span>
                    <span className="text-[11px] text-neutral-400 truncate max-w-[70px]">
                      {asset.name}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-neutral-300">
                    ${asset.price < 1 ? asset.price.toFixed(4) : asset.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div
                  className={cn(
                    "flex items-center text-xs font-bold font-mono px-2 py-0.5 rounded-md",
                    isUp ? "text-emerald-400 bg-emerald-500/20" : "text-red-400 bg-red-500/20"
                  )}
                >
                  {isUp ? "+" : ""}
                  {asset.change24h.toFixed(2)}%
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-3 border-t border-white/5">
                <span>Vol: ${asset.volumeQuoteM >= 1000 ? `${(asset.volumeQuoteM / 1000).toFixed(1)}B` : `${asset.volumeQuoteM.toFixed(0)}M`}</span>
                <span className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  Ver Gráfico →
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
