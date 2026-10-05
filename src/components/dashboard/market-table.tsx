"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { motion } from "framer-motion";
import { BarChart3, ChevronDown, ChevronUp, Search } from "lucide-react";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CategoryFilters } from "./market-table/category-filters";
import { MarketRow } from "./market-table/market-row";
import { useMarketList } from "./market-table/use-market-list";
import { useSparklines } from "./market-table/use-sparklines";

const DEFAULT_SHOW_COUNT = 20;

const headClass = "text-[10px] font-medium text-muted-foreground h-8";

export function MarketTable() {
  const {
    tickers,
    setSelectedSymbol,
    setActiveSection,
    watchlist,
    toggleWatchlist,
    categoryFilter,
    setCategoryFilter,
    symbolSearchQuery,
    setSymbolSearchQuery,
  } = useCryptoStore(
    useShallow((s) => ({
      tickers: s.tickers,
      setSelectedSymbol: s.setSelectedSymbol,
      setActiveSection: s.setActiveSection,
      watchlist: s.watchlist,
      toggleWatchlist: s.toggleWatchlist,
      categoryFilter: s.categoryFilter,
      setCategoryFilter: s.setCategoryFilter,
      symbolSearchQuery: s.symbolSearchQuery,
      setSymbolSearchQuery: s.setSymbolSearchQuery,
    }))
  );

  const [showAll, setShowAll] = useState(false);
  const [localSearch, setLocalSearch] = useState(symbolSearchQuery);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Busca com debounce de 300 ms
  const handleSearchChange = useCallback(
    (value: string) => {
      setLocalSearch(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setSymbolSearchQuery(value), 300);
    },
    [setSymbolSearchQuery]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const { tickerList, categoryCounts } = useMarketList(tickers, symbolSearchQuery, categoryFilter);

  const displayedList = useMemo(
    () => (showAll ? tickerList : tickerList.slice(0, DEFAULT_SHOW_COUNT)),
    [tickerList, showAll]
  );

  const sparklineData = useSparklines(
    useMemo(() => displayedList.map((t) => t.symbol), [displayedList]),
    Object.keys(tickers).length > 0
  );

  const watchedSet = useMemo(() => new Set(watchlist), [watchlist]);

  // Handlers estáveis para que o memo das linhas funcione
  const openChart = useCallback(
    (symbol: string) => {
      setSelectedSymbol(symbol);
      setActiveSection("chart");
    },
    [setSelectedSymbol, setActiveSection]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
    >
      <Card className="glass-card gradient-border overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-crypto-cyan" />
              Visão do Mercado
            </CardTitle>
            <span className="text-xs text-muted-foreground">{tickerList.length} ativos</span>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
            <Input
              type="text"
              aria-label="Buscar ativo por nome ou símbolo"
              placeholder="Buscar por nome ou símbolo..."
              value={localSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="input-glow pl-8 h-8 text-xs bg-secondary/30 border-border/50 focus-visible:border-crypto-cyan/50 focus-visible:ring-crypto-cyan/20"
            />
            {localSearch && (
              <button
                type="button"
                aria-label="Limpar busca"
                onClick={() => handleSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground text-xs transition-colors"
              >
                ✕
              </button>
            )}
          </div>

          <CategoryFilters active={categoryFilter} counts={categoryCounts} onChange={setCategoryFilter} />

          {/* Tabela */}
          <div
            className={cn(
              "overflow-y-auto cyan-scrollbar relative transition-[max-height] duration-300",
              showAll ? "max-h-[600px]" : "max-h-[420px]"
            )}
          >
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className={cn(headClass, "w-7")} />
                  <TableHead className={cn(headClass, "w-6 text-center")}>#</TableHead>
                  <TableHead className={headClass}>Ativo</TableHead>
                  <TableHead className={cn(headClass, "text-right")}>Preço</TableHead>
                  <TableHead className={cn(headClass, "text-right")}>24h %</TableHead>
                  <TableHead className={cn(headClass, "text-right hidden sm:table-cell")}>Máx/Mín</TableHead>
                  <TableHead className={cn(headClass, "text-right hidden md:table-cell")}>Volume</TableHead>
                  <TableHead className={cn(headClass, "text-right hidden lg:table-cell")}>Rank</TableHead>
                  <TableHead className={cn(headClass, "text-right hidden xl:table-cell")}>Categoria</TableHead>
                  <TableHead className={cn(headClass, "text-right w-[70px] hidden sm:table-cell")}>Tendência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedList.map((ticker, idx) => (
                  <MarketRow
                    key={ticker.symbol}
                    ticker={ticker}
                    index={idx}
                    isWatched={watchedSet.has(ticker.symbol)}
                    sparkData={sparklineData[ticker.symbol]}
                    onOpen={openChart}
                    onToggleWatch={toggleWatchlist}
                  />
                ))}
              </TableBody>
            </Table>

            {displayedList.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Search className="w-8 h-8 mb-2 opacity-30" />
                <span className="text-xs">Nenhum ativo encontrado</span>
                <span className="text-[10px] opacity-60">Tente ajustar os filtros</span>
              </div>
            )}
          </div>

          {tickerList.length > DEFAULT_SHOW_COUNT && (
            <div className="flex justify-center pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll(!showAll)}
                className="h-7 text-[10px] font-medium gap-1 transition-all duration-200 text-crypto-cyan/70 hover:text-crypto-cyan hover:bg-crypto-cyan/10"
              >
                {showAll ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Ver Menos
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Ver Mais ({tickerList.length - DEFAULT_SHOW_COUNT} ativos)
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
