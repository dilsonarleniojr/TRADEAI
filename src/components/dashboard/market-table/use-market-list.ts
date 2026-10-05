import { useMemo } from "react";
import { CRYPTO_CATEGORIES, CRYPTO_LIST, searchCrypto } from "@/lib/crypto-meta";
import type { TickerData } from "@/lib/store";

// Ordena por volume e aplica a busca e o filtro de categoria; também conta ativos por categoria.
export function useMarketList(
  tickers: Record<string, TickerData>,
  searchQuery: string,
  categoryFilter: string
) {
  const categoryCounts = useMemo(() => {
    const symbols = Object.keys(tickers);
    const counts: Record<string, number> = { all: symbols.length || CRYPTO_LIST.length };
    if (symbols.length > 0) {
      symbols.forEach((sym) => {
        const cat = CRYPTO_CATEGORIES[sym] || "Inovação";
        counts[cat] = (counts[cat] || 0) + 1;
      });
    } else {
      CRYPTO_LIST.forEach((c) => {
        counts[c.category] = (counts[c.category] || 0) + 1;
      });
    }
    return counts;
  }, [tickers]);

  const tickerList = useMemo(() => {
    let list = Object.values(tickers).sort((a, b) => b.quoteVolume - a.quoteVolume);

    if (searchQuery.trim()) {
      const matches = new Set(searchCrypto(searchQuery).map((c) => c.symbol));
      list = list.filter((t) => matches.has(t.symbol));
    }
    if (categoryFilter !== "all") {
      list = list.filter((t) => (CRYPTO_CATEGORIES[t.symbol] || "Inovação") === categoryFilter);
    }
    return list;
  }, [tickers, searchQuery, categoryFilter]);

  return { tickerList, categoryCounts };
}
