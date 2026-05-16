"use client";

import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatPercent, formatVolume } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

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

export function Watchlist() {
  const { tickers, watchlist, toggleWatchlist, setSelectedSymbol, setActiveSection } = useCryptoStore();

  const watchlistTickers = watchlist
    .map((symbol) => tickers[symbol])
    .filter(Boolean)
    .sort((a, b) => b.quoteVolume - a.quoteVolume);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
    >
      <Card className="bg-card/60 backdrop-blur-md border-white/5 h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Star className="w-4 h-4 text-crypto-gold" />
              Watchlist
              <span className="text-[10px] text-muted-foreground font-normal">
                ({watchlistTickers.length})
              </span>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {watchlistTickers.length === 0 ? (
            <div className="text-center py-6">
              <Star className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                No assets in watchlist
              </p>
              <p className="text-[10px] text-muted-foreground/70">
                Click the star icon in the market table to add assets
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
              <AnimatePresence>
                {watchlistTickers.map((ticker) => {
                  const isPositive = ticker.priceChangePercent >= 0;
                  const color = symbolColors[ticker.symbol] || "#06b6d4";

                  return (
                    <motion.div
                      key={ticker.symbol}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center justify-between p-2.5 rounded-lg hover:bg-secondary/50 transition-colors group cursor-pointer"
                      onClick={() => {
                        setSelectedSymbol(ticker.symbol);
                        setActiveSection("chart");
                      }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {ticker.symbol.replace("USDT", "").slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-medium">
                            {ticker.symbol.replace("USDT", "")}
                          </span>
                          <p className="text-[10px] text-muted-foreground truncate">
                            Vol: {formatVolume(ticker.quoteVolume)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-mono font-medium number-animate">
                            ${formatPrice(ticker.price)}
                          </p>
                          <div className="flex items-center justify-end gap-1">
                            {isPositive ? (
                              <TrendingUp className="w-3 h-3 text-crypto-green" />
                            ) : (
                              <TrendingDown className="w-3 h-3 text-crypto-red" />
                            )}
                            <span
                              className={cn(
                                "text-xs font-mono font-semibold",
                                isPositive ? "text-crypto-green" : "text-crypto-red"
                              )}
                            >
                              {formatPercent(ticker.priceChangePercent)}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-crypto-gold hover:text-crypto-gold shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWatchlist(ticker.symbol);
                          }}
                        >
                          <Star className="w-3.5 h-3.5 fill-crypto-gold" />
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
