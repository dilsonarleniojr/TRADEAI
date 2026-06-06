"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, RefreshCw, Minimize2, Maximize2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getOrFetch, CACHE_TTL, invalidateCache } from "@/lib/cache";

interface OrderBookLevel {
  price: number;
  volume: number;
  cumulative: number;
}

interface OrderBookData {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  spreadPercent: number;
  totalBidVolume: number;
  totalAskVolume: number;
}

async function fetchRealOrderBook(symbol: string, limit: number): Promise<OrderBookData> {
  const response = await fetch(`/api/market/depth?symbol=${symbol}&limit=${limit}`);
  if (!response.ok) throw new Error("Failed to fetch order book");

  const data = await response.json();

  // Build cumulative volumes
  let bidCumulative = 0;
  const bids: OrderBookLevel[] = (data.bids || []).map((b: { price: number; volume: number }) => {
    bidCumulative += b.volume;
    return { price: b.price, volume: b.volume, cumulative: bidCumulative };
  });

  let askCumulative = 0;
  const asks: OrderBookLevel[] = (data.asks || []).map((a: { price: number; volume: number }) => {
    askCumulative += a.volume;
    return { price: a.price, volume: a.volume, cumulative: askCumulative };
  });

  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asks[0]?.price ?? 0;
  const spread = bestAsk - bestBid;
  const midPrice = (bestAsk + bestBid) / 2;
  const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

  return {
    bids,
    asks,
    spread,
    spreadPercent,
    totalBidVolume: bidCumulative,
    totalAskVolume: askCumulative,
  };
}

function formatBookPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function formatBookVolume(vol: number): string {
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(2)}K`;
  if (vol >= 1) return vol.toFixed(4);
  return vol.toFixed(6);
}

export function OrderBook() {
  const { selectedSymbol, tickers } = useCryptoStore();
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const midPriceRef = useRef<HTMLDivElement | null>(null);

  const currentPrice = tickers[selectedSymbol]?.price ?? 0;
  const levels = isCompact ? 8 : 15;

  const refreshOrderBook = useCallback(async () => {
    if (!selectedSymbol) return;

    setIsRefreshing(true);
    setError(null);

    try {
      // Invalidate cache to force fresh data
      invalidateCache(`depth-${selectedSymbol}-${levels}`);

      const data = await getOrFetch(
        `depth-${selectedSymbol}-${levels}`,
        () => fetchRealOrderBook(selectedSymbol, levels),
        CACHE_TTL.ORDER_BOOK
      );
      setOrderBook(data);
    } catch (err) {
      console.error("[OrderBook] Fetch error:", err);
      setError("Dados indisponíveis");
    } finally {
      setTimeout(() => setIsRefreshing(false), 300);
    }
  }, [selectedSymbol, levels]);

  // Initial load and auto-refresh every 3 seconds
  useEffect(() => {
    refreshOrderBook();

    intervalRef.current = setInterval(refreshOrderBook, 3000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshOrderBook]);

  // Auto-scroll to mid-price on data load
  useEffect(() => {
    if (orderBook && midPriceRef.current) {
      midPriceRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [orderBook?.spread]);

  if (error && !orderBook) {
    return (
      <Card className="bg-card/50 border-border backdrop-blur-sm">
        <CardContent className="p-6 text-center">
          <div className="w-10 h-10 rounded-xl bg-crypto-red/10 flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-5 h-5 text-crypto-red" />
          </div>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshOrderBook}
            className="mt-2 text-xs text-crypto-cyan"
          >
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!orderBook) {
    return (
      <Card className="bg-card/50 border-border backdrop-blur-sm">
        <CardContent className="p-6 text-center">
          <div className="w-10 h-10 rounded-xl bg-crypto-cyan/10 flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-5 h-5 text-crypto-cyan" />
          </div>
          <p className="text-xs text-muted-foreground">Carregando livro de ofertas...</p>
        </CardContent>
      </Card>
    );
  }

  const maxCumulative = Math.max(
    orderBook.bids[orderBook.bids.length - 1]?.cumulative ?? 0,
    orderBook.asks[orderBook.asks.length - 1]?.cumulative ?? 0
  );

  const totalVolume = orderBook.totalBidVolume + orderBook.totalAskVolume;
  const bidPct = totalVolume > 0 ? (orderBook.totalBidVolume / totalVolume) * 100 : 50;
  const askPct = totalVolume > 0 ? (orderBook.totalAskVolume / totalVolume) * 100 : 50;

  return (
    <Card className="bg-card/50 border-border backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-crypto-cyan" />
            Livro de Ofertas
            <span className="text-[10px] text-muted-foreground font-normal">
              {selectedSymbol.replace("USDT", "/USDT")}
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] bg-crypto-green/10 text-crypto-green border border-crypto-green/20">
              Dados Reais
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setIsCompact(!isCompact)}
              aria-label={isCompact ? "Expandir" : "Compactar"}
            >
              {isCompact ? (
                <Maximize2 className="w-3 h-3 text-muted-foreground" />
              ) : (
                <Minimize2 className="w-3 h-3 text-muted-foreground" />
              )}
            </Button>
            <motion.div
              animate={{ rotate: isRefreshing ? 360 : 0 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            >
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
            </motion.div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {/* Spread Info */}
        <div className="flex items-center justify-between mb-3 px-1 py-1.5 rounded-md bg-gradient-to-r from-crypto-green/8 via-crypto-cyan/8 to-crypto-red/8 border border-border/30">
          <div className="text-[10px] text-muted-foreground">
            Spread:{" "}
            <span className="text-foreground font-medium">
              ${formatBookPrice(orderBook.spread)}
            </span>
            <span className="text-muted-foreground ml-1">
              ({orderBook.spreadPercent.toFixed(3)}%)
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-crypto-green">
              Compra: {formatBookVolume(orderBook.totalBidVolume)}
            </span>
            <span className="text-crypto-red">
              Venda: {formatBookVolume(orderBook.totalAskVolume)}
            </span>
          </div>
        </div>

        {/* Column Headers */}
        <div className="grid grid-cols-3 gap-1 text-[9px] text-muted-foreground uppercase tracking-wider mb-1 px-1">
          <span>Preço</span>
          <span className="text-right">Qtd</span>
          <span className="text-right">Total</span>
        </div>

        {/* Asks (sells) - displayed top-to-bottom, closest to center at bottom */}
        <div className="space-y-0.5 mb-1">
          <AnimatePresence mode="popLayout">
            {[...orderBook.asks].reverse().map((level, i) => {
              const barWidth = maxCumulative > 0 ? (level.cumulative / maxCumulative) * 100 : 0;
              return (
                <motion.div
                  key={`ask-${level.price}`}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2, delay: i * 0.015 }}
                  className="relative grid grid-cols-3 gap-1 px-1 py-0.5 rounded-sm text-[11px] font-mono hover:bg-crypto-red/5 cursor-default card-shimmer"
                >
                  {/* Background bar */}
                  <div
                    className="absolute inset-y-0 right-0 rounded-sm transition-all duration-500"
                    style={{
                      width: `${barWidth}%`,
                      background: "linear-gradient(90deg, transparent, rgba(239, 68, 68, 0.08))",
                    }}
                  />
                  <span className="relative text-crypto-red">
                    {formatBookPrice(level.price)}
                  </span>
                  <span className="relative text-right text-muted-foreground">
                    {formatBookVolume(level.volume)}
                  </span>
                  <span className="relative text-right text-muted-foreground">
                    {formatBookVolume(level.cumulative)}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Current Price Divider */}
        <div
          ref={midPriceRef}
          className="flex items-center gap-2 py-1.5 px-1 my-1 bg-crypto-cyan/5 border-y border-crypto-cyan/20 rounded-sm mid-price-pulse"
        >
          <span className="text-sm font-bold text-crypto-cyan">
            ${currentPrice > 0 ? formatBookPrice(currentPrice) : "—"}
          </span>
          <span className="text-[9px] text-muted-foreground">Preço Atual</span>
          <span className="ml-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-crypto-cyan animate-pulse" />
            <span className="text-[8px] text-crypto-cyan font-medium">AO VIVO</span>
          </span>
        </div>

        {/* Bids (buys) - closest to center at top */}
        <div className="space-y-0.5 mt-1">
          <AnimatePresence mode="popLayout">
            {orderBook.bids.map((level, i) => {
              const barWidth = maxCumulative > 0 ? (level.cumulative / maxCumulative) * 100 : 0;
              return (
                <motion.div
                  key={`bid-${level.price}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2, delay: i * 0.015 }}
                  className="relative grid grid-cols-3 gap-1 px-1 py-0.5 rounded-sm text-[11px] font-mono hover:bg-crypto-green/5 cursor-default card-shimmer"
                >
                  {/* Background bar */}
                  <div
                    className="absolute inset-y-0 right-0 rounded-sm transition-all duration-500"
                    style={{
                      width: `${barWidth}%`,
                      background: "linear-gradient(90deg, transparent, rgba(16, 185, 129, 0.08))",
                    }}
                  />
                  <span className="relative text-crypto-green">
                    {formatBookPrice(level.price)}
                  </span>
                  <span className="relative text-right text-muted-foreground">
                    {formatBookVolume(level.volume)}
                  </span>
                  <span className="relative text-right text-muted-foreground">
                    {formatBookVolume(level.cumulative)}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Depth Visual Bar */}
        <div className="mt-3 px-1">
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground mb-1">
            <span>Profundidade</span>
            <span className="ml-auto">
              Pressão Compra vs Venda
            </span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden flex bg-secondary/30 relative">
            <motion.div
              className="h-full rounded-l-full relative"
              style={{
                background: "linear-gradient(90deg, #10b981, #06b6d4)",
              }}
              animate={{
                width: `${bidPct}%`,
              }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
            </motion.div>
            <motion.div
              className="h-full rounded-r-full relative"
              style={{
                background: "linear-gradient(90deg, #06b6d4, #ef4444)",
              }}
              animate={{
                width: `${askPct}%`,
              }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
            </motion.div>
          </div>
          <div className="flex justify-between text-[9px] mt-0.5">
            <span className="text-crypto-green">
              {bidPct.toFixed(1)}% Compra
            </span>
            <span className="text-crypto-red">
              {askPct.toFixed(1)}% Venda
            </span>
          </div>
        </div>

        {/* Auto-refresh indicator */}
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[9px] text-muted-foreground">
          <div className="w-1.5 h-1.5 rounded-full bg-crypto-green animate-pulse" />
          Dados reais da Binance • Atualizando a cada 3s
        </div>
      </CardContent>
    </Card>
  );
}
