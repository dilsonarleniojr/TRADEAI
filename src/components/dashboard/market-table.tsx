"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatVolume, formatPercent } from "@/lib/format";
import {
  CRYPTO_COLORS,
  CRYPTO_NAMES,
  CRYPTO_SHORTS,
  CRYPTO_CATEGORIES,
  CATEGORY_META,
  searchCrypto,
  CRYPTO_LIST,
  type CryptoCategory,
} from "@/lib/crypto-meta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Star, BarChart3, Search, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

// SVG Sparkline component
function Sparkline({
  data,
  color,
  width = 60,
  height = 20,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `0,${height} ${points} ${width},${height}`;
  const gradientId = `spark-${color.replace("#", "")}-${data.length}`;

  return (
    <svg width={width} height={height} className="shrink-0">
      <defs>
        <linearGradient
          id={gradientId}
          x1="0%"
          y1="0%"
          x2="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Category badge component
function CategoryBadge({ category }: { category: string }) {
  const meta = CATEGORY_META[category as CryptoCategory];
  if (!meta) return null;

  // Short label mapping for badges
  const shortLabels: Record<string, string> = {
    "Layer 1": "L1",
    "Layer 2": "L2",
    DeFi: "DeFi",
    Meme: "Meme",
    AI: "IA",
    Gaming: "Game",
    Infrastructure: "Infra",
    Exchange: "Exch",
    Stablecoin: "Stbl",
  };

  const label = shortLabels[category] || category;
  const hexColor = meta.color;

  return (
    <Badge
      className={cn(
        "text-[8px] px-1 py-0 border font-semibold leading-none",
        "bg-[var(--cat-bg)] text-[var(--cat-text)] border-[var(--cat-border)]"
      )}
      style={{
        // @ts-expect-error CSS custom properties
        "--cat-bg": `${hexColor}15`,
        "--cat-text": `${hexColor}cc`,
        "--cat-border": `${hexColor}30`,
      }}
    >
      {label}
    </Badge>
  );
}

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
  } = useCryptoStore();

  const [sparklineData, setSparklineData] = useState<Record<string, number[]>>(
    {}
  );
  const [loadingSparklines, setLoadingSparklines] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [localSearch, setLocalSearch] = useState(symbolSearchQuery);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const DEFAULT_SHOW_COUNT = 20;

  // Debounced search handler
  const handleSearchChange = useCallback(
    (value: string) => {
      setLocalSearch(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSymbolSearchQuery(value);
      }, 300);
    },
    [setSymbolSearchQuery]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Compute category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: CRYPTO_LIST.length };
    CRYPTO_LIST.forEach((c) => {
      counts[c.category] = (counts[c.category] || 0) + 1;
    });
    return counts;
  }, []);

  // Filter and sort ticker list
  const tickerList = useMemo(() => {
    let list = Object.values(tickers).sort(
      (a, b) => b.quoteVolume - a.quoteVolume
    );

    // Apply search filter
    if (symbolSearchQuery.trim()) {
      const searchResults = searchCrypto(symbolSearchQuery);
      const searchSymbols = new Set(searchResults.map((c) => c.symbol));
      list = list.filter((t) => searchSymbols.has(t.symbol));
    }

    // Apply category filter
    if (categoryFilter !== "all") {
      list = list.filter(
        (t) => CRYPTO_CATEGORIES[t.symbol] === categoryFilter
      );
    }

    return list;
  }, [tickers, symbolSearchQuery, categoryFilter]);

  const displayedList = useMemo(() => {
    return showAll ? tickerList : tickerList.slice(0, DEFAULT_SHOW_COUNT);
  }, [tickerList, showAll]);

  // Fetch sparkline data (24h of 1h klines)
  const fetchSparklines = useCallback(async () => {
    try {
      const symbols = Object.keys(tickers);
      const results: Record<string, number[]> = {};

      // Fetch in batches to avoid overwhelming the API
      const batchSize = 4;
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const promises = batch.map(async (symbol) => {
          try {
            const resp = await fetch(
              `/api/market/klines?symbol=${symbol}&interval=1h&limit=24`
            );
            if (!resp.ok) return;
            const result = await resp.json();
            if (result.data) {
              results[symbol] = result.data.map(
                (k: { close: string }) => parseFloat(k.close)
              );
            }
          } catch {
            // Skip on error
          }
        });
        await Promise.all(promises);
      }

      setSparklineData(results);
      setLoadingSparklines(false);
    } catch (err) {
      console.error("[MarketTable] Sparkline fetch error:", err);
      setLoadingSparklines(false);
    }
  }, [tickers]);

  useEffect(() => {
    if (Object.keys(tickers).length > 0) {
      const timer = setTimeout(() => {
        fetchSparklines();
      }, 0);
      const interval = setInterval(fetchSparklines, 120000);
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
    return undefined;
  }, [fetchSparklines, tickers]);

  // Get crypto meta for a symbol
  const getMeta = useCallback(
    (symbol: string) => {
      return {
        name: CRYPTO_NAMES[symbol] || symbol.replace("USDT", ""),
        short: CRYPTO_SHORTS[symbol] || symbol.replace("USDT", ""),
        color: CRYPTO_COLORS[symbol] || "#06b6d4",
        category: CRYPTO_CATEGORIES[symbol] || "",
        rank: CRYPTO_LIST.find((c) => c.symbol === symbol)?.rank,
      };
    },
    []
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
            <span className="text-xs text-muted-foreground">
              {tickerList.length} ativos
            </span>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
            <Input
              type="text"
              placeholder="Buscar por nome ou símbolo..."
              value={localSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="input-glow pl-8 h-8 text-xs bg-secondary/30 border-border/50 focus-visible:border-crypto-cyan/50 focus-visible:ring-crypto-cyan/20"
            />
            {localSearch && (
              <button
                onClick={() => handleSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground text-xs transition-colors"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Filter Tabs */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            <button
              onClick={() => setCategoryFilter("all")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap border transition-all duration-200 shrink-0",
                categoryFilter === "all"
                  ? "bg-crypto-cyan/20 text-crypto-cyan border-crypto-cyan/40 shadow-sm shadow-crypto-cyan/10"
                  : "bg-secondary/30 text-muted-foreground border-border/40 hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              <span>Todos</span>
              <span
                className={cn(
                  "text-[9px] px-1 rounded-full",
                  categoryFilter === "all"
                    ? "bg-crypto-cyan/20 text-crypto-cyan"
                    : "bg-secondary/50 text-muted-foreground/70"
                )}
              >
                {categoryCounts.all}
              </span>
            </button>
            {(Object.entries(CATEGORY_META) as [CryptoCategory, (typeof CATEGORY_META)[CryptoCategory]][]).map(
              ([cat, meta]) => (
                <button
                  key={cat}
                  onClick={() =>
                    setCategoryFilter(categoryFilter === cat ? "all" : cat)
                  }
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap border transition-all duration-200 shrink-0",
                    categoryFilter === cat
                      ? "bg-crypto-cyan/20 text-crypto-cyan border-crypto-cyan/40 shadow-sm shadow-crypto-cyan/10"
                      : "bg-secondary/30 text-muted-foreground border-border/40 hover:bg-secondary/50 hover:text-foreground"
                  )}
                >
                  <span>{meta.emoji}</span>
                  <span>{meta.label}</span>
                  <span
                    className={cn(
                      "text-[9px] px-1 rounded-full",
                      categoryFilter === cat
                        ? "bg-crypto-cyan/20 text-crypto-cyan"
                        : "bg-secondary/50 text-muted-foreground/70"
                    )}
                  >
                    {categoryCounts[cat] || 0}
                  </span>
                </button>
              )
            )}
          </div>

          {/* Table */}
          <div
            className={cn(
              "overflow-y-auto cyan-scrollbar relative transition-[max-height] duration-300",
              showAll ? "max-h-[600px]" : "max-h-[420px]"
            )}
          >
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-[10px] font-medium text-muted-foreground h-8 w-7" />
                  <TableHead className="text-[10px] font-medium text-muted-foreground h-8 w-6 text-center">
                    #
                  </TableHead>
                  <TableHead className="text-[10px] font-medium text-muted-foreground h-8">
                    Ativo
                  </TableHead>
                  <TableHead className="text-[10px] font-medium text-muted-foreground text-right h-8">
                    Preço
                  </TableHead>
                  <TableHead className="text-[10px] font-medium text-muted-foreground text-right h-8">
                    24h %
                  </TableHead>
                  <TableHead className="text-[10px] font-medium text-muted-foreground text-right h-8 hidden sm:table-cell">
                    Máx/Mín
                  </TableHead>
                  <TableHead className="text-[10px] font-medium text-muted-foreground text-right h-8 hidden md:table-cell">
                    Volume
                  </TableHead>
                  <TableHead className="text-[10px] font-medium text-muted-foreground text-right h-8 hidden lg:table-cell">
                    Rank
                  </TableHead>
                  <TableHead className="text-[10px] font-medium text-muted-foreground text-right h-8 hidden xl:table-cell">
                    Categoria
                  </TableHead>
                  <TableHead className="text-[10px] font-medium text-muted-foreground text-right h-8 w-[70px] hidden sm:table-cell">
                    Tendência
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {displayedList.map((ticker, idx) => {
                    const isPositive = ticker.priceChangePercent >= 0;
                    const meta = getMeta(ticker.symbol);
                    const color = meta.color;
                    const isWatched = watchlist.includes(ticker.symbol);
                    const sparkData = sparklineData[ticker.symbol];
                    const sparkColor = isPositive ? "#22c55e" : "#ef4444";
                    const isAltRow = idx % 2 === 1;

                    return (
                      <MotionTableRow
                        key={ticker.symbol}
                        idx={idx}
                        className={cn(
                          "cursor-pointer transition-all duration-200 group table-row-hover",
                          "hover:bg-gradient-to-r hover:from-primary/5 hover:to-transparent hover:shadow-sm",
                          isWatched && "bg-crypto-gold/[0.03]",
                          isAltRow && !isWatched && "table-row-alt"
                        )}
                        style={{
                          borderLeft: `2px solid ${color}40`,
                          borderBottom: "1px solid var(--border)",
                        }}
                        onClick={() => {
                          setSelectedSymbol(ticker.symbol);
                          setActiveSection("chart");
                        }}
                      >
                        {/* Watchlist Star */}
                        <TableCell className="py-2 w-7 pr-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-6 w-6 p-0 transition-colors",
                              isWatched
                                ? "text-crypto-gold hover:text-crypto-gold"
                                : "text-muted-foreground/30 hover:text-crypto-gold/60"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleWatchlist(ticker.symbol);
                            }}
                          >
                            <Star
                              className={cn(
                                "w-3 h-3",
                                isWatched && "fill-crypto-gold"
                              )}
                            />
                          </Button>
                        </TableCell>

                        {/* Rank Number */}
                        <TableCell className="py-2 w-6 pr-0 text-center">
                          <span className="text-[10px] font-mono text-muted-foreground/50 font-medium">
                            {idx + 1}
                          </span>
                        </TableCell>

                        {/* Asset */}
                        <TableCell className="py-2">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 shadow-sm"
                              style={{ backgroundColor: color }}
                            >
                              {meta.short.slice(0, 2)}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium truncate">
                                  {meta.name}
                                </span>
                                <CategoryBadge category={meta.category} />
                              </div>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {meta.short}/USDT
                              </span>
                            </div>
                          </div>
                        </TableCell>

                        {/* Price */}
                        <TableCell className="text-right py-2">
                          <span className="text-sm font-mono font-medium number-animate price-flash-up transition-colors duration-300">
                            ${formatPrice(ticker.price)}
                          </span>
                        </TableCell>

                        {/* 24h % with mini range bar */}
                        <TableCell className="text-right py-2">
                          <div className="flex items-center justify-end gap-1.5">
                            <span
                              className={cn(
                                "text-xs font-mono font-semibold px-1.5 py-0.5 rounded-md",
                                isPositive
                                  ? "text-crypto-green bg-crypto-green/10"
                                  : "text-crypto-red bg-crypto-red/10"
                              )}
                            >
                              {formatPercent(ticker.priceChangePercent)}
                            </span>
                            <div className="w-8 h-1.5 rounded-full bg-secondary/50 overflow-hidden hidden sm:block">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-500",
                                  isPositive
                                    ? "bg-crypto-green/60"
                                    : "bg-crypto-red/60"
                                )}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.abs(ticker.priceChangePercent) * 5
                                  )}%`,
                                  marginLeft: isPositive ? "auto" : "0",
                                }}
                              />
                            </div>
                          </div>
                        </TableCell>

                        {/* 24h High/Low */}
                        <TableCell className="text-right py-2 hidden sm:table-cell">
                          <div className="text-[10px] text-muted-foreground font-mono">
                            <span>${formatPrice(ticker.high)}</span>
                            <span className="mx-0.5">/</span>
                            <span>${formatPrice(ticker.low)}</span>
                          </div>
                        </TableCell>

                        {/* Volume */}
                        <TableCell className="text-right py-2 hidden md:table-cell">
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {formatVolume(ticker.quoteVolume)}
                          </span>
                        </TableCell>

                        {/* Market Cap Rank */}
                        <TableCell className="text-right py-2 hidden lg:table-cell">
                          {meta.rank ? (
                            <span className="text-[10px] font-mono text-muted-foreground bg-secondary/30 px-1.5 py-0.5 rounded">
                              #{meta.rank}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/30">
                              —
                            </span>
                          )}
                        </TableCell>

                        {/* Category Badge (visible xl+) */}
                        <TableCell className="text-right py-2 hidden xl:table-cell">
                          <div className="flex justify-end">
                            <CategoryBadge category={meta.category} />
                          </div>
                        </TableCell>

                        {/* 24h Trend Sparkline */}
                        <TableCell className="text-right py-2 hidden sm:table-cell">
                          {sparkData && sparkData.length > 1 ? (
                            <div className="flex justify-end">
                              <Sparkline
                                data={sparkData}
                                color={sparkColor}
                                width={60}
                                height={20}
                              />
                            </div>
                          ) : (
                            <div className="flex justify-end">
                              <div className="w-[60px] h-5 bg-secondary/30 rounded animate-pulse" />
                            </div>
                          )}
                        </TableCell>
                      </MotionTableRow>
                    );
                  })}
              </TableBody>
            </Table>

            {/* Empty state */}
            {displayedList.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Search className="w-8 h-8 mb-2 opacity-30" />
                <span className="text-xs">Nenhum ativo encontrado</span>
                <span className="text-[10px] opacity-60">
                  Tente ajustar os filtros
                </span>
              </div>
            )}
          </div>

          {/* Show More / Show Less */}
          {tickerList.length > DEFAULT_SHOW_COUNT && (
            <div className="flex justify-center pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll(!showAll)}
                className={cn(
                  "h-7 text-[10px] font-medium gap-1 transition-all duration-200",
                  "text-crypto-cyan/70 hover:text-crypto-cyan hover:bg-crypto-cyan/10"
                )}
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

// Motion-compatible TableRow wrapper (PascalCase to avoid hydration errors)
function MotionTableRow({
  children,
  className,
  style,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  idx: number;
}) {
  return (
    <TableRow
      className={className}
      style={style}
      onClick={onClick}
    >
      {children}
    </TableRow>
  );
}
