"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { OrderBook } from "@/components/chart/order-book";
import { BookOpen, ChevronRight, BarChart2 } from "lucide-react";
import { motion } from "framer-motion";
import { getOrFetch, CACHE_TTL } from "@/lib/cache";
import { useShallow } from "zustand/react/shallow";

interface OrderBookLevel {
  price: number;
  volume: number;
}

interface MiniBookData {
  spread: number;
  spreadPercent: number;
  bidPct: number;
  askPct: number;
}

async function fetchMiniBookData(symbol: string): Promise<MiniBookData> {
  const response = await fetch(`/api/market/depth?symbol=${symbol}&limit=5`);
  if (!response.ok) throw new Error("Failed to fetch mini book");

  const data = await response.json();
  const bids: OrderBookLevel[] = data.bids || [];
  const asks: OrderBookLevel[] = data.asks || [];

  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asks[0]?.price ?? 0;
  const spread = bestAsk - bestBid;
  const midPrice = (bestAsk + bestBid) / 2;
  const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

  const totalBidVolume = bids.reduce((acc, curr) => acc + curr.volume, 0);
  const totalAskVolume = asks.reduce((acc, curr) => acc + curr.volume, 0);
  const totalVolume = totalBidVolume + totalAskVolume;

  const bidPct = totalVolume > 0 ? (totalBidVolume / totalVolume) * 100 : 50;
  const askPct = totalVolume > 0 ? (totalAskVolume / totalVolume) * 100 : 50;

  return {
    spread,
    spreadPercent,
    bidPct,
    askPct,
  };
}

export function MiniBook() {
  const { selectedSymbol, tickers } = useCryptoStore(
  useShallow((s) => ({ selectedSymbol: s.selectedSymbol, tickers: s.tickers }))
);
  const [open, setOpen] = useState(false);
  const [bookData, setBookData] = useState<MiniBookData | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentPrice = tickers[selectedSymbol]?.price ?? 0;

  const updateData = useCallback(async () => {
    if (!selectedSymbol) return;
    try {
      const data = await getOrFetch(
        `mini-depth-${selectedSymbol}`,
        () => fetchMiniBookData(selectedSymbol),
        CACHE_TTL.ORDER_BOOK
      );
      setBookData(data);
    } catch (err) {
      console.error("[MiniBook] Error fetching data:", err);
    }
  }, [selectedSymbol]);

  useEffect(() => {
    updateData();
    intervalRef.current = setInterval(updateData, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [updateData]);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <motion.div
          whileTap={{ scale: 0.98 }}
          className="cursor-pointer block md:hidden"
        >
          <Card className="glass-card gradient-border h-[120px] relative overflow-hidden flex flex-col justify-between p-3.5 hover:bg-secondary/10 transition-colors">
            {/* Top row */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-crypto-cyan" />
                Book de Ofertas
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-60" />
            </div>

            {/* Content row */}
            <div className="flex items-end justify-between mt-1">
              <div>
                <p className="text-[10px] text-muted-foreground">Preço Médio ({selectedSymbol.replace("USDT", "")})</p>
                <h3 className="text-xl font-bold font-mono tracking-tight leading-none text-foreground mt-1">
                  ${currentPrice > 0 ? formatPrice(currentPrice) : "—"}
                </h3>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Spread (Bid/Ask)</p>
                <span className="text-xs font-bold font-mono px-1.5 py-0.5 rounded mt-1 inline-block bg-crypto-cyan/10 text-crypto-cyan">
                  {bookData ? `${bookData.spreadPercent.toFixed(3)}%` : "—"}
                </span>
              </div>
            </div>

            {/* Bottom pressure bar */}
            <div className="text-[9px] text-muted-foreground mt-2 border-t border-border/30 pt-1.5 space-y-1">
              <div className="flex justify-between items-center text-[8px] font-mono">
                <span className="text-crypto-green font-semibold">C: {bookData ? `${bookData.bidPct.toFixed(0)}%` : "50%"}</span>
                <span className="text-crypto-red font-semibold">V: {bookData ? `${bookData.askPct.toFixed(0)}%` : "50%"}</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden flex bg-secondary/35">
                <div
                  className="h-full bg-crypto-green transition-all duration-500"
                  style={{ width: `${bookData ? bookData.bidPct : 50}%` }}
                />
                <div
                  className="h-full bg-crypto-red transition-all duration-500"
                  style={{ width: `${bookData ? bookData.askPct : 50}%` }}
                />
              </div>
            </div>
          </Card>
        </motion.div>
      </DrawerTrigger>

      <DrawerContent className="bg-background/95 backdrop-blur-xl border-t border-border/50 max-h-[85vh] z-[100] pb-6">
        <div className="w-12 h-1 rounded-full bg-border mx-auto mt-3 mb-2" />
        <div className="px-4 overflow-y-auto cyan-scrollbar">
          <OrderBook />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
