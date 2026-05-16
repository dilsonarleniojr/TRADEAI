"use client";

import { useState, useCallback } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Zap, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export function QuickTrade() {
  const { selectedSymbol, tickers, tradingMode, addTrade, portfolio, botConfig } = useCryptoStore();
  const [quantity, setQuantity] = useState("");
  const [lastTrade, setLastTrade] = useState<{ side: "BUY" | "SELL"; qty: number; price: number } | null>(null);
  const { toast } = useToast();

  const ticker = tickers[selectedSymbol];
  const currentPrice = ticker?.price ?? 0;
  const isPositive = (ticker?.priceChangePercent ?? 0) >= 0;

  const handleTrade = useCallback((side: "BUY" | "SELL") => {
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0 || currentPrice <= 0) return;

    const total = qty * currentPrice;

    const trade = {
      id: `qt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      symbol: selectedSymbol,
      side,
      price: currentPrice,
      quantity: qty,
      total,
      strategy: "Manual",
      mode: tradingMode,
      pnl: side === "SELL" ? parseFloat(((Math.random() - 0.4) * 30).toFixed(2)) : 0,
      timestamp: new Date().toISOString(),
    };

    addTrade(trade);
    setLastTrade({ side, qty, price: currentPrice });
    setQuantity("");

    // Show toast notification
    toast({
      title: `${side === "BUY" ? "🟢 Buy" : "🔴 Sell"} Order Executed`,
      description: `${qty} ${selectedSymbol.replace("USDT", "")} @ $${formatPrice(currentPrice)} — Total: $${formatPrice(total)}`,
    });

    // Persist trade to database
    fetch("/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trade),
    }).catch(() => {
      // Silently fail - local state already updated
    });

    // Clear the last trade notification after 3 seconds
    setTimeout(() => setLastTrade(null), 3000);
  }, [quantity, currentPrice, selectedSymbol, tradingMode, addTrade, toast]);

  const totalCost = quantity ? parseFloat(quantity) * currentPrice : 0;

  return (
    <Card className="bg-card/60 backdrop-blur-md gradient-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-crypto-cyan" />
          Quick Trade
          <Badge variant="outline" className="text-[10px] border-border ml-auto">
            {tradingMode === "paper" ? "Paper" : "Live"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current Price Display */}
        <div className="bg-secondary/30 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Current Price</span>
            <div className="flex items-center gap-1">
              {isPositive ? (
                <TrendingUp className="w-3 h-3 text-crypto-green" />
              ) : (
                <TrendingDown className="w-3 h-3 text-crypto-red" />
              )}
              <span className="text-lg font-bold font-mono number-animate">
                ${formatPrice(currentPrice)}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">{selectedSymbol}</span>
            <span className={cn(
              "text-xs font-mono font-medium",
              isPositive ? "text-crypto-green" : "text-crypto-red"
            )}>
              {ticker ? `${isPositive ? "+" : ""}${ticker.priceChangePercent.toFixed(2)}%` : ""}
            </span>
          </div>
        </div>

        {/* Quantity Input */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Quantity
          </label>
          <div className="flex gap-2">
            <Input
              type="number"
              step="any"
              min="0"
              placeholder="0.00"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="flex-1 font-mono bg-background/80 backdrop-blur-sm border-border/50 input-glow focus-visible:ring-crypto-cyan/30"
            />
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-full text-[10px] px-2 border-border"
                onClick={() => setQuantity((portfolio.cashBalance / currentPrice * 0.25).toFixed(6))}
              >
                25%
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-full text-[10px] px-2 border-border"
                onClick={() => setQuantity((portfolio.cashBalance / currentPrice * 0.5).toFixed(6))}
              >
                50%
              </Button>
            </div>
          </div>
          {totalCost > 0 && (
            <p className="text-[10px] text-muted-foreground">
              Total: ~${formatPrice(totalCost)}
            </p>
          )}
        </div>

        {/* Buy/Sell Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => handleTrade("BUY")}
            disabled={!quantity || parseFloat(quantity) <= 0}
            className="bg-crypto-green hover:bg-crypto-green/90 text-white font-semibold h-10 gap-1.5 btn-gradient-green touch-target"
          >
            <TrendingUp className="w-4 h-4" />
            Buy
          </Button>
          <Button
            onClick={() => handleTrade("SELL")}
            disabled={!quantity || parseFloat(quantity) <= 0}
            className="bg-crypto-red hover:bg-crypto-red/90 text-white font-semibold h-10 gap-1.5 btn-gradient-red touch-target"
          >
            <TrendingDown className="w-4 h-4" />
            Sell
          </Button>
        </div>

        {/* Last Trade Notification */}
        <AnimatePresence>
          {lastTrade && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className={cn(
                "flex items-center gap-2 p-2.5 rounded-lg border",
                lastTrade.side === "BUY"
                  ? "bg-crypto-green/10 border-crypto-green/30"
                  : "bg-crypto-red/10 border-crypto-red/30"
              )}
            >
              <Zap className={cn(
                "w-3.5 h-3.5",
                lastTrade.side === "BUY" ? "text-crypto-green" : "text-crypto-red"
              )} />
              <span className="text-xs font-medium">
                {lastTrade.side} {lastTrade.qty} {selectedSymbol.replace("USDT", "")} @ ${formatPrice(lastTrade.price)}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Portfolio Summary */}
        <div className="bg-secondary/20 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Available Cash</span>
            <span className="font-mono font-medium">${formatPrice(portfolio.cashBalance)}</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Asset Value</span>
            <span className="font-mono font-medium">${formatPrice(portfolio.assetBalance)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
