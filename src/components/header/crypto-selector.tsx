"use client";

import { useState, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import {
  searchCrypto,
  CRYPTO_COLORS,
  CRYPTO_NAMES,
  CRYPTO_SHORTS,
  CATEGORY_META,
  ALL_SYMBOLS,
  type CryptoCategory,
} from "@/lib/crypto-meta";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, Search, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice, formatPercent } from "@/lib/format";
import { useDataProvider } from "@/lib/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useShallow } from "zustand/react/shallow";

export function CryptoSelector() {
  const { selectedSymbol, setSelectedSymbol, tickers } = useCryptoStore(
  useShallow((s) => ({ selectedSymbol: s.selectedSymbol, setSelectedSymbol: s.setSelectedSymbol, tickers: s.tickers }))
);
  const { syncBinanceCoins } = useDataProvider();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [isSyncing, setIsSyncing] = useState(false);

  // Filter and sort cryptos
  const filteredCryptos = useMemo(() => {
    let result = searchCrypto(searchQuery);
    if (activeCategory !== "all") {
      result = result.filter((c) => c.category === activeCategory);
    }

    // Sort by volume descending so most traded coins are at the top
    return result.sort((a, b) => {
      const volA = tickers[a.symbol]?.quoteVolume || 0;
      const volB = tickers[b.symbol]?.quoteVolume || 0;
      return volB - volA;
    });
  }, [searchQuery, activeCategory, tickers]);

  // Limit rendering when search is empty to maintain 60 FPS performance
  const displayedCryptos = useMemo(() => {
    if (searchQuery.trim()) {
      return filteredCryptos.slice(0, 100);
    }
    return filteredCryptos.slice(0, 45);
  }, [filteredCryptos, searchQuery]);

  const selectedTicker = tickers[selectedSymbol];
  const selectedColor = CRYPTO_COLORS[selectedSymbol] || "#06b6d4";
  const selectedShort =
    CRYPTO_SHORTS[selectedSymbol] || selectedSymbol.replace("USDT", "");

  const categories = [
    "all",
    ...Object.keys(CATEGORY_META),
  ] as string[];

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    toast({
      title: "🔄 Sincronizando com a Binance...",
      description: "Buscando todas as moedas e opções ativas em tempo real.",
    });

    const result = await syncBinanceCoins();
    setIsSyncing(false);

    if (result.success) {
      toast({
        title: "✅ Sincronização Concluída!",
        description: `${result.count} moedas e pares Spot USDT atualizados diretamente da Binance.`,
      });
    } else {
      toast({
        title: "⚠️ Erro na Sincronização",
        description: "Não foi possível sincronizar agora. Usando dados em cache.",
        variant: "destructive",
      });
    }
  };

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
        className="w-[320px] p-0 glass border-border/50"
        align="start"
        sideOffset={8}
      >
        {/* Search & Sync Header */}
        <div className="p-2 border-b border-border/30 flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder={`Buscar entre ${ALL_SYMBOLS.length} moedas...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-7 text-xs input-glow bg-secondary/30 border-border/50"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            className="h-8 px-2 text-xs border-border/50 hover:bg-crypto-cyan/10 hover:text-crypto-cyan cursor-pointer shrink-0"
            title="Sincronizar moedas com a Binance"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin text-crypto-cyan")} />
          </Button>
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
          {displayedCryptos.map((crypto) => {
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
              Nenhuma moeda encontrada para &ldquo;{searchQuery}&rdquo;
            </div>
          )}
          {filteredCryptos.length > displayedCryptos.length && (
            <div className="py-2 text-center text-[10px] text-muted-foreground/80 border-t border-border/20">
              Mostrando {displayedCryptos.length} de {filteredCryptos.length} moedas (digite para refinar)
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
