"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

function generateOrderBook(currentPrice: number, _seed?: number): OrderBookData {
  const seed = _seed ?? Date.now();
  // Simple seeded pseudo-random for reproducibility within a single call
  let rng = seed;
  const random = () => {
    rng = (rng * 1664525 + 1013904223) & 0x7fffffff;
    return rng / 0x7fffffff;
  };

  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];
  const levels = 15;

  // Determine tick size based on price magnitude
  let tickSize: number;
  if (currentPrice >= 10000) tickSize = currentPrice * 0.0002; // ~$2 for BTC
  else if (currentPrice >= 100) tickSize = currentPrice * 0.0003; // ~$0.03 for ETH
  else if (currentPrice >= 1) tickSize = currentPrice * 0.0005; // smaller
  else tickSize = currentPrice * 0.001;

  // Base volume scales with price (higher-priced assets tend to have lower volume in units)
  const baseVolume = Math.max(0.5, 100000 / currentPrice);

  let bidCumulative = 0;
  let askCumulative = 0;

  for (let i = 0; i < levels; i++) {
    // Bids (below current price)
    const bidPrice = currentPrice - tickSize * (i + 1);
    // Volume increases slightly further from the center with some randomness
    const bidBaseVol = baseVolume * (1 + i * 0.15 + random() * 0.8);
    bidCumulative += bidBaseVol;
    bids.push({
      price: bidPrice,
      volume: bidBaseVol,
      cumulative: bidCumulative,
    });

    // Asks (above current price)
    const askPrice = currentPrice + tickSize * (i + 1);
    const askBaseVol = baseVolume * (1 + i * 0.12 + random() * 0.7);
    askCumulative += askBaseVol;
    asks.push({
      price: askPrice,
      volume: askBaseVol,
      cumulative: askCumulative,
    });
  }

  // Sort bids descending by price (closest to center at top)
  bids.sort((a, b) => b.price - a.price);
  // Sort asks ascending by price (closest to center at top)
  asks.sort((a, b) => a.price - b.price);

  const bestBid = bids[0]?.price ?? currentPrice;
  const bestAsk = asks[0]?.price ?? currentPrice;
  const spread = bestAsk - bestBid;
  const spreadPercent = (spread / currentPrice) * 100;

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
  if (vol >= 1) return vol.toFixed(2);
  return vol.toFixed(4);
}

export function OrderBook() {
  const { selectedSymbol, tickers } = useCryptoStore();
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seedRef = useRef<number>(Date.now());

  const currentPrice = tickers[selectedSymbol]?.price ?? 0;

  const refreshOrderBook = useCallback(() => {
    if (currentPrice <= 0) return;

    setIsRefreshing(true);
    // Slightly vary the seed each refresh to simulate market activity
    seedRef.current += Math.floor(Math.random() * 10000) + 1;
    const data = generateOrderBook(currentPrice, seedRef.current);
    setOrderBook(data);

    // Brief visual feedback
    setTimeout(() => setIsRefreshing(false), 300);
  }, [currentPrice]);

  // Initial load and auto-refresh every 5 seconds
  useEffect(() => {
    if (currentPrice <= 0) return;

    // Generate initial data
    seedRef.current = Date.now();
    const data = generateOrderBook(currentPrice, seedRef.current);
    setOrderBook(data);

    // Auto-refresh every 5 seconds
    intervalRef.current = setInterval(() => {
      seedRef.current += Math.floor(Math.random() * 10000) + 1;
      const newData = generateOrderBook(currentPrice, seedRef.current);
      setOrderBook(newData);
    }, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [currentPrice, selectedSymbol]);

  if (!orderBook || currentPrice <= 0) {
    return (
      <Card className="bg-card/50 border-border backdrop-blur-sm">
        <CardContent className="p-6 text-center">
          <div className="w-10 h-10 rounded-xl bg-crypto-cyan/10 flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-5 h-5 text-crypto-cyan" />
          </div>
          <p className="text-xs text-muted-foreground">Loading order book...</p>
        </CardContent>
      </Card>
    );
  }

  const maxCumulative = Math.max(
    orderBook.bids[orderBook.bids.length - 1]?.cumulative ?? 0,
    orderBook.asks[orderBook.asks.length - 1]?.cumulative ?? 0
  );

  return (
    <Card className="bg-card/50 border-border backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-crypto-cyan" />
            Order Book
            <span className="text-[10px] text-muted-foreground font-normal">
              {selectedSymbol.replace("USDT", "/USDT")}
            </span>
          </div>
          <motion.div
            animate={{ rotate: isRefreshing ? 360 : 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          >
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
          </motion.div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {/* Spread Info */}
        <div className="flex items-center justify-between mb-3 px-1 py-1 rounded-md bg-gradient-to-r from-crypto-green/5 via-crypto-cyan/5 to-crypto-red/5">
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
              Bids: {formatBookVolume(orderBook.totalBidVolume)}
            </span>
            <span className="text-crypto-red">
              Asks: {formatBookVolume(orderBook.totalAskVolume)}
            </span>
          </div>
        </div>

        {/* Column Headers */}
        <div className="grid grid-cols-3 gap-1 text-[9px] text-muted-foreground uppercase tracking-wider mb-1 px-1">
          <span>Price</span>
          <span className="text-right">Size</span>
          <span className="text-right">Total</span>
        </div>

        {/* Asks (sells) - displayed top-to-bottom, closest to center at bottom */}
        <div className="space-y-0.5 mb-1">
          <AnimatePresence mode="popLayout">
            {[...orderBook.asks].reverse().map((level, i) => {
              const barWidth = maxCumulative > 0 ? (level.cumulative / maxCumulative) * 100 : 0;
              return (
                <motion.div
                  key={`ask-${i}`}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2, delay: i * 0.015 }}
                  className="relative grid grid-cols-3 gap-1 px-1 py-0.5 rounded-sm text-[11px] font-mono hover:bg-crypto-red/5 cursor-default"
                >
                  {/* Background bar */}
                  <div
                    className="absolute inset-y-0 right-0 rounded-sm"
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
        <div className="flex items-center gap-2 py-1.5 px-1 my-1 bg-crypto-cyan/5 border-y border-crypto-cyan/20 rounded-sm mid-price-pulse">
          <span className="text-sm font-bold text-crypto-cyan">
            ${formatBookPrice(currentPrice)}
          </span>
          <span className="text-[9px] text-muted-foreground">Current Price</span>
          <span className="ml-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-crypto-cyan animate-pulse" />
            <span className="text-[8px] text-crypto-cyan font-medium">LIVE</span>
          </span>
        </div>

        {/* Bids (buys) - closest to center at top */}
        <div className="space-y-0.5 mt-1">
          <AnimatePresence mode="popLayout">
            {orderBook.bids.map((level, i) => {
              const barWidth = maxCumulative > 0 ? (level.cumulative / maxCumulative) * 100 : 0;
              return (
                <motion.div
                  key={`bid-${i}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2, delay: i * 0.015 }}
                  className="relative grid grid-cols-3 gap-1 px-1 py-0.5 rounded-sm text-[11px] font-mono hover:bg-crypto-green/5 cursor-default"
                >
                  {/* Background bar */}
                  <div
                    className="absolute inset-y-0 right-0 rounded-sm"
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
            <span>Depth</span>
            <span className="ml-auto">
              Buy vs Sell Pressure
            </span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden flex bg-secondary/30 relative">
            <motion.div
              className="h-full rounded-l-full relative"
              style={{
                background: "linear-gradient(90deg, #10b981, #06b6d4)",
              }}
              animate={{
                width: `${(orderBook.totalBidVolume / (orderBook.totalBidVolume + orderBook.totalAskVolume)) * 100}%`,
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
                width: `${(orderBook.totalAskVolume / (orderBook.totalBidVolume + orderBook.totalAskVolume)) * 100}%`,
              }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
            </motion.div>
          </div>
          <div className="flex justify-between text-[9px] mt-0.5">
            <span className="text-crypto-green">
              {((orderBook.totalBidVolume / (orderBook.totalBidVolume + orderBook.totalAskVolume)) * 100).toFixed(1)}% Bids
            </span>
            <span className="text-crypto-red">
              {((orderBook.totalAskVolume / (orderBook.totalBidVolume + orderBook.totalAskVolume)) * 100).toFixed(1)}% Asks
            </span>
          </div>
        </div>

        {/* Auto-refresh indicator */}
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[9px] text-muted-foreground">
          <div className="w-1.5 h-1.5 rounded-full bg-crypto-green animate-pulse" />
          Auto-refreshing every 5s
        </div>
      </CardContent>
    </Card>
  );
}
