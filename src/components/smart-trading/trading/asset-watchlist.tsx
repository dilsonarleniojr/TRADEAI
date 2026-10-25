"use client";

import * as React from "react";
import { Search, Star, ArrowUpRight, ArrowDownRight, RefreshCw, Filter, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { SmartBadge } from "../ui/badge";
import { useCryptoStore } from "@/lib/store";
import { useDataProvider } from "@/lib/data-provider";
import { useToast } from "@/hooks/use-toast";
import { 
  CRYPTO_LIST, 
  CRYPTO_BY_SYMBOL, 
  CATEGORY_META, 
  type CryptoCategory 
} from "@/lib/crypto-meta";

export interface WatchlistAsset {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: string;
  quoteVolume: number;
  category?: string;
  isStarred?: boolean;
}

const DEFAULT_WATCHLIST: WatchlistAsset[] = [
  { symbol: "BTC/USDT", name: "Bitcoin", price: 68840.5, change24h: 3.42, volume24h: "$38.2B", quoteVolume: 38200000000, category: "Layer 1", isStarred: true },
  { symbol: "ETH/USDT", name: "Ethereum", price: 3480.2, change24h: 2.15, volume24h: "$18.4B", quoteVolume: 18400000000, category: "Layer 1", isStarred: true },
  { symbol: "SOL/USDT", name: "Solana", price: 182.4, change24h: 6.85, volume24h: "$6.1B", quoteVolume: 6100000000, category: "Layer 1", isStarred: true },
  { symbol: "BNB/USDT", name: "BNB Chain", price: 595.1, change24h: 1.05, volume24h: "$1.8B", quoteVolume: 1800000000, category: "Layer 1", isStarred: false },
  { symbol: "XRP/USDT", name: "Ripple", price: 0.582, change24h: -1.24, volume24h: "$940M", quoteVolume: 940000000, category: "Exchange", isStarred: false },
  { symbol: "DOGE/USDT", name: "Dogecoin", price: 0.1425, change24h: 4.80, volume24h: "$1.2B", quoteVolume: 1200000000, category: "Meme", isStarred: false },
  { symbol: "SUI/USDT", name: "Sui Network", price: 2.15, change24h: 8.40, volume24h: "$780M", quoteVolume: 780000000, category: "Layer 1", isStarred: true },
  { symbol: "AVAX/USDT", name: "Avalanche", price: 29.8, change24h: -0.65, volume24h: "$450M", quoteVolume: 450000000, category: "Layer 1", isStarred: false },
  { symbol: "LINK/USDT", name: "Chainlink", price: 14.85, change24h: 1.95, volume24h: "$380M", quoteVolume: 380000000, category: "DeFi", isStarred: false },
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
  const { toast } = useToast();
  const tickers = useCryptoStore((s) => s.tickers);
  const { syncBinanceCoins } = useDataProvider();

  const [search, setSearch] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<string>("all");
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [starredSymbols, setStarredSymbols] = React.useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("tradeai_starred_pairs");
        if (saved) return new Set(JSON.parse(saved));
      } catch (e) {
        // fallback
      }
    }
    return new Set(["BTC/USDT", "ETH/USDT", "SOL/USDT"]);
  });

  const toggleStar = (e: React.MouseEvent, sym: string) => {
    e.stopPropagation();
    setStarredSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) {
        next.delete(sym);
      } else {
        next.add(sym);
      }
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("tradeai_starred_pairs", JSON.stringify(Array.from(next)));
        } catch (e) {}
      }
      return next;
    });
  };

  // Sincronizar todos os pares/binários da Binance
  const handleSyncBinance = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    toast({
      title: "🔄 Sincronizando com a Binance...",
      description: "Consultando todos os pares Spot USDT ativos e dados de book.",
    });

    try {
      const result = await syncBinanceCoins();
      if (result.success) {
        toast({
          title: "✅ Sincronização Concluída!",
          description: `${result.count} pares Spot USDT sincronizados diretamente da Binance.`,
        });
      } else {
        toast({
          title: "⚠️ Erro na Sincronização",
          description: "Não foi possível sincronizar agora. Exibindo dados locais.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Erro de Conexão",
        description: e.message || "Falha ao contatar API Binance",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Construir lista de ativos a partir dos tickers reais da Binance
  const allAssets = React.useMemo<WatchlistAsset[]>(() => {
    const tickerKeys = Object.keys(tickers);
    if (tickerKeys.length === 0) {
      return DEFAULT_WATCHLIST.map((item) => ({
        ...item,
        isStarred: starredSymbols.has(item.symbol),
      }));
    }

    const items: WatchlistAsset[] = [];
    const seen = new Set<string>();

    for (const rawSym of tickerKeys) {
      if (!rawSym.endsWith("USDT")) continue;
      const t = tickers[rawSym];
      if (!t) continue;

      const formattedSymbol = `${rawSym.replace(/USDT$/, "")}/USDT`;
      seen.add(formattedSymbol);

      const meta = CRYPTO_BY_SYMBOL[rawSym];
      const name = meta?.name || meta?.short || rawSym.replace(/USDT$/, "");
      const category = meta?.category || "Inovação";

      const qVol = t.quoteVolume || 0;
      let volumeStr = `$${(qVol / 1e6).toFixed(1)}M`;
      if (qVol >= 1e9) volumeStr = `$${(qVol / 1e9).toFixed(2)}B`;
      else if (qVol < 1e6) volumeStr = `$${(qVol / 1e3).toFixed(0)}K`;

      items.push({
        symbol: formattedSymbol,
        name,
        price: t.price,
        change24h: t.priceChangePercent,
        volume24h: volumeStr,
        quoteVolume: qVol,
        category,
        isStarred: starredSymbols.has(formattedSymbol),
      });
    }

    // Ordenar: primeiro favoritos, depois por volume financeiro (Quote Volume)
    return items.sort((a, b) => {
      if (a.isStarred && !b.isStarred) return -1;
      if (!a.isStarred && b.isStarred) return 1;
      return b.quoteVolume - a.quoteVolume;
    });
  }, [tickers, starredSymbols]);

  // Filtragem por busca e categoria
  const filteredAssets = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return allAssets.filter((a) => {
      const matchSearch =
        !q ||
        a.symbol.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q);
      const matchCat =
        selectedCategory === "all" ||
        (selectedCategory === "starred" ? a.isStarred : a.category === selectedCategory);
      return matchSearch && matchCat;
    });
  }, [allAssets, search, selectedCategory]);

  const categories = [
    { id: "all", label: "Todos" },
    { id: "starred", label: "⭐ Favoritos" },
    { id: "Layer 1", label: "L1" },
    { id: "Layer 2", label: "L2" },
    { id: "DeFi", label: "DeFi" },
    { id: "AI", label: "IA" },
    { id: "Meme", label: "Meme" },
    { id: "Inovação", label: "Inovação" },
  ];

  return (
    <div className="w-full bg-[#141414] border border-neutral-800 rounded-2xl p-4 shadow-xl flex flex-col h-full select-none">
      {/* Header com Título e Botão de Sincronização Binance */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-800/80">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-400" />
          <h3 className="text-xs font-bold text-white tracking-wide uppercase">
            Pares Binance Spot
          </h3>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
            {allAssets.length} pares
          </span>
        </div>

        <button
          type="button"
          onClick={handleSyncBinance}
          disabled={isSyncing}
          title="Sincronizar todos os binários e cotações da Binance"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-blue-500 hover:text-white text-[11px] font-semibold text-neutral-300 transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3 h-3 text-blue-400", isSyncing && "animate-spin")} />
          <span>{isSyncing ? "Sincronizando..." : "Sincronizar"}</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative mb-2">
        <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-500" />
        <input
          type="text"
          placeholder="Buscar entre todos os pares Binance..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-8 pl-8 pr-3 rounded-lg bg-neutral-900 border border-neutral-700/80 text-xs text-white placeholder-neutral-500 outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-2 st-scrollbar">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSelectedCategory(c.id)}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap transition-colors",
              selectedCategory === c.id
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-neutral-900 text-neutral-400 hover:text-neutral-200 border border-neutral-800"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 st-scrollbar">
        {filteredAssets.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-500">
            Nenhum par encontrado para a busca.
          </div>
        ) : (
          filteredAssets.slice(0, 150).map((asset) => {
            const isSelected = activeSymbol === asset.symbol;
            const isPositive = asset.change24h >= 0;

            return (
              <div
                key={asset.symbol}
                onClick={() => handleSelect?.(asset.symbol)}
                className={cn(
                  "p-2 rounded-xl border flex items-center justify-between cursor-pointer transition-all duration-150 select-none",
                  isSelected
                    ? "bg-blue-600/15 border-blue-500/40 text-white"
                    : "bg-neutral-900/40 border-transparent hover:bg-neutral-800/60 hover:border-neutral-700/60 text-neutral-200"
                )}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => toggleStar(e, asset.symbol)}
                    className="text-neutral-500 hover:text-amber-400 transition-colors p-0.5"
                  >
                    <Star
                      className={cn(
                        "w-3.5 h-3.5",
                        asset.isStarred ? "fill-amber-400 text-amber-400" : ""
                      )}
                    />
                  </button>
                  <div>
                    <div className="text-xs font-bold text-white tracking-tight flex items-center gap-1">
                      {asset.symbol}
                    </div>
                    <div className="text-[10px] text-neutral-400 truncate max-w-[100px]">
                      {asset.name}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-mono font-bold text-white">
                    ${asset.price < 1 ? asset.price.toFixed(4) : asset.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div
                    className={cn(
                      "flex items-center justify-end text-[10px] font-mono font-semibold",
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
          })
        )}
      </div>
    </div>
  );
}
