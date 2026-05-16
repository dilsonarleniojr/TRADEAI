"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatVolume, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Star, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

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

// SVG Sparkline component
function Sparkline({ data, color, width = 60, height = 20 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} className="shrink-0">
      <defs>
        <linearGradient id={`spark-${color.replace("#", "")}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon
        points={areaPoints}
        fill={`url(#spark-${color.replace("#", "")})`}
      />
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

export function MarketTable() {
  const { tickers, setSelectedSymbol, setActiveSection, watchlist, toggleWatchlist } = useCryptoStore();
  const [sparklineData, setSparklineData] = useState<Record<string, number[]>>({});
  const [loadingSparklines, setLoadingSparklines] = useState(true);

  const tickerList = Object.values(tickers).sort(
    (a, b) => b.quoteVolume - a.quoteVolume
  );

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
      // Use setTimeout to avoid calling setState directly in effect
      const timer = setTimeout(() => {
        fetchSparklines();
      }, 0);
      const interval = setInterval(fetchSparklines, 120000); // Refresh every 2 min
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
    return undefined;
  }, [fetchSparklines, tickers]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
    >
      <Card className="bg-card/60 backdrop-blur-md gradient-border overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-crypto-cyan" />
              Market Overview
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {tickerList.length} assets
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-xs font-medium text-muted-foreground h-8 w-8">
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground h-8">
                    Asset
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right h-8">
                    Price
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right h-8">
                    24h %
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right h-8 hidden sm:table-cell">
                    High/Low
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right h-8 hidden md:table-cell">
                    Volume
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right h-8 w-[70px] hidden lg:table-cell">
                    24h Trend
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickerList.map((ticker, idx) => {
                  const isPositive = ticker.priceChangePercent >= 0;
                  const color =
                    symbolColors[ticker.symbol] || "#06b6d4";
                  const isWatched = watchlist.includes(ticker.symbol);
                  const sparkData = sparklineData[ticker.symbol];
                  const sparkColor = isPositive ? "#22c55e" : "#ef4444";
                  const isAltRow = idx % 2 === 1;

                  return (
                    <TableRow
                      key={ticker.symbol}
                      className={cn(
                        "cursor-pointer transition-all duration-200 group",
                        "hover:bg-gradient-to-r hover:from-primary/5 hover:to-transparent hover:shadow-sm",
                        isWatched && "bg-crypto-gold/[0.03]",
                        isAltRow && !isWatched && "table-row-alt"
                      )}
                      style={{ borderLeft: `2px solid ${color}40` }}
                      onClick={() => {
                        setSelectedSymbol(ticker.symbol);
                        setActiveSection("chart");
                      }}
                    >
                      {/* Watchlist Star */}
                      <TableCell className="py-2.5 w-8 pr-0">
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
                            className={cn("w-3 h-3", isWatched && "fill-crypto-gold")}
                          />
                        </Button>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 shadow-sm"
                            style={{ backgroundColor: color }}
                          >
                            {ticker.symbol.replace("USDT", "").slice(0, 2)}
                          </div>
                          <div>
                            <span className="text-sm font-medium">
                              {ticker.symbol.replace("USDT", "")}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">
                              /USDT
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right py-2.5">
                        <span className="text-sm font-mono font-medium number-animate">
                          ${formatPrice(ticker.price)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right py-2.5">
                        <span
                          className={cn(
                            "text-sm font-mono font-semibold px-1.5 py-0.5 rounded",
                            isPositive ? "text-crypto-green bg-crypto-green/5" : "text-crypto-red bg-crypto-red/5"
                          )}
                        >
                          {formatPercent(ticker.priceChangePercent)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right py-2.5 hidden sm:table-cell">
                        <div className="text-xs text-muted-foreground font-mono">
                          <span>${formatPrice(ticker.high)}</span>
                          <span className="mx-1">/</span>
                          <span>${formatPrice(ticker.low)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right py-2.5 hidden md:table-cell">
                        <span className="text-xs font-mono text-muted-foreground">
                          {formatVolume(ticker.quoteVolume)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right py-2.5 hidden lg:table-cell">
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
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
