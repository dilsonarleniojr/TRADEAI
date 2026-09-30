"use client";

import { useState, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import {
  searchCrypto,
  CRYPTO_COLORS,
  CRYPTO_NAMES,
  CRYPTO_SHORTS,
  CATEGORY_META,
  type CryptoCategory,
} from "@/lib/crypto-meta";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice, formatPercent } from "@/lib/format";

export function CryptoSelector() {
  const { selectedSymbol, setSelectedSymbol, tickers } = useCryptoStore();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const filteredCryptos = useMemo(() => {
    let result = searchCrypto(searchQuery);
    if (activeCategory !== "all") {
      result = result.filter((c) => c.category === activeCategory);
    }
    return result;
  }, [searchQuery, activeCategory]);

  const selectedTicker = tickers[selectedSymbol];
  const selectedColor = CRYPTO_COLORS[selectedSymbol] || "#06b6d4";
  const selectedShort =
    CRYPTO_SHORTS[selectedSymbol] || selectedSymbol.replace("USDT", "");

  const categories = [
    "all",
    ...Object.keys(CATEGORY_META),
  ] as string[];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-crypto-cyan/20 bg-crypto-cyan/5 hover:bg-crypto-cyan/10 transition-all duration-200">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: selectedColor }}
          />
          <span className="text-xs font-semibold text-foreground">
            {selectedShort}
          </span>
          {selectedTicker && (
            <span className="text-[10px] font-mono text-muted-foreground">
              ${formatPrice(selectedTicker.price)}
            </span>
          )}
          <ChevronDown
            className={cn(
              "w-3 h-3 text-muted-foreground transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[280px] p-0 glass border-border/50"
        align="start"
        sideOffset={8}
      >
        {/* Search */}
        <div className="p-2 border-b border-border/30">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar cripto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-7 text-xs input-glow bg-secondary/30 border-border/50"
            />
          </div>
        </div>

        {/* Category filter */}
        <div className="flex gap-1 p-2 overflow-x-auto scrollbar-none border-b border-border/30">
          {categories.map((cat) => {
            const meta = CATEGORY_META[cat as CryptoCategory];
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "shrink-0 text-[10px] px-2 py-0.5 rounded-full border transition-all duration-200",
                  isActive
                    ? "bg-crypto-cyan/20 text-crypto-cyan border-crypto-cyan/40"
                    : "text-muted-foreground border-border/50 hover:border-border"
                )}
              >
                {cat === "all"
                  ? "Todos"
                  : `${meta?.emoji || ""} ${meta?.label || cat}`}
              </button>
            );
          })}
        </div>

        {/* Symbol list */}
        <div className="max-h-[300px] overflow-y-auto cyan-scrollbar">
          {filteredCryptos.map((crypto) => {
            const ticker = tickers[crypto.symbol];
            const isSelected = crypto.symbol === selectedSymbol;
            const isPositive = ticker ? ticker.priceChangePercent >= 0 : true;

            return (
              <button
                key={crypto.symbol}
                onClick={() => {
                  setSelectedSymbol(crypto.symbol);
                  setOpen(false);
                  setSearchQuery("");
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-left transition-all duration-150 hover:bg-secondary/40",
                  isSelected && "bg-crypto-cyan/10"
                )}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
                  style={{ backgroundColor: crypto.color }}
                >
                  {crypto.short.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium truncate">
                      {crypto.short}
                    </span>
                    <span className="text-[8px] text-muted-foreground truncate">
                      {crypto.name}
                    </span>
                  </div>
                </div>
                {ticker && (
                  <div className="text-right shrink-0">
                    <div className="text-[10px] font-mono font-medium">
                      ${formatPrice(ticker.price)}
                    </div>
                    <div
                      className={cn(
                        "text-[9px] font-mono",
                        isPositive ? "text-crypto-green" : "text-crypto-red"
                      )}
                    >
                      {formatPercent(ticker.priceChangePercent)}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
          {filteredCryptos.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Nenhum resultado encontrado
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
