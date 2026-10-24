"use client";

import * as React from "react";
import { Search, Star, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SmartBadge } from "../ui/badge";

export interface WatchlistAsset {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: string;
  isStarred?: boolean;
}

const DEFAULT_WATCHLIST: WatchlistAsset[] = [
  { symbol: "BTC/USDT", name: "Bitcoin", price: 68840.5, change24h: 3.42, volume24h: "$38.2B", isStarred: true },
  { symbol: "ETH/USDT", name: "Ethereum", price: 3480.2, change24h: 2.15, volume24h: "$18.4B", isStarred: true },
  { symbol: "SOL/USDT", name: "Solana", price: 182.4, change24h: 6.85, volume24h: "$6.1B", isStarred: true },
  { symbol: "BNB/USDT", name: "BNB Chain", price: 595.1, change24h: 1.05, volume24h: "$1.8B", isStarred: false },
  { symbol: "XRP/USDT", name: "Ripple", price: 0.582, change24h: -1.24, volume24h: "$940M", isStarred: false },
  { symbol: "DOGE/USDT", name: "Dogecoin", price: 0.1425, change24h: 4.80, volume24h: "$1.2B", isStarred: false },
  { symbol: "SUI/USDT", name: "Sui Network", price: 2.15, change24h: 8.40, volume24h: "$780M", isStarred: true },
  { symbol: "AVAX/USDT", name: "Avalanche", price: 29.8, change24h: -0.65, volume24h: "$450M", isStarred: false },
  { symbol: "LINK/USDT", name: "Chainlink", price: 14.85, change24h: 1.95, volume24h: "$380M", isStarred: false },
];

export function SmartAssetWatchlist({
  activeSymbol = "BTC/USDT",
  onSelectSymbol,
  onSelectPair,
}: {
  activeSymbol?: string;
  onSelectSymbol?: (symbol: string) => void;
  onSelectPair?: (symbol: string) => void;
}) {
  const handleSelect = onSelectPair || onSelectSymbol;
  const [search, setSearch] = React.useState("");
  const [assets, setAssets] = React.useState<WatchlistAsset[]>(DEFAULT_WATCHLIST);

  const filtered = assets.filter(
    (a) =>
      a.symbol.toLowerCase().includes(search.toLowerCase()) ||
      a.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleStar = (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation();
    setAssets((prev) =>
      prev.map((a) => (a.symbol === symbol ? { ...a, isStarred: !a.isStarred } : a))
    );
  };

  return (
    <div className="w-full bg-[#141414] border border-neutral-800 rounded-2xl p-4 shadow-xl flex flex-col h-full">
      {/* Search Input */}
      <div className="relative mb-3">
        <Search className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
        <input
          type="text"
          placeholder="Buscar par ou ativo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-9 pl-9 pr-3 rounded-lg bg-neutral-900 border border-neutral-700/80 text-xs text-white placeholder-neutral-500 outline-none focus:border-blue-500"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 st-scrollbar">
        {filtered.map((asset) => {
          const isSelected = activeSymbol === asset.symbol;
          const isPositive = asset.change24h >= 0;

          return (
            <div
              key={asset.symbol}
              onClick={() => handleSelect?.(asset.symbol)}
              className={cn(
                "p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all duration-150 select-none",
                isSelected
                  ? "bg-blue-600/15 border-blue-500/40 text-white"
                  : "bg-neutral-900/40 border-transparent hover:bg-neutral-800/60 hover:border-neutral-700/60 text-neutral-200"
              )}
            >
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={(e) => toggleStar(e, asset.symbol)}
                  className="text-neutral-500 hover:text-amber-400 transition-colors"
                >
                  <Star
                    className={cn(
                      "w-3.5 h-3.5",
                      asset.isStarred ? "fill-amber-400 text-amber-400" : ""
                    )}
                  />
                </button>
                <div>
                  <div className="text-xs font-bold text-white tracking-tight">{asset.symbol}</div>
                  <div className="text-[10px] text-neutral-400">{asset.name}</div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs font-mono font-bold text-white">
                  ${asset.price < 1 ? asset.price.toFixed(4) : asset.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
                <div
                  className={cn(
                    "flex items-center justify-end text-[11px] font-mono font-semibold",
                    isPositive ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {isPositive ? "+" : ""}
                  {asset.change24h.toFixed(2)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
