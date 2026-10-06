"use client";

import { useState, useCallback, useEffect } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Zap, ShoppingCart, Target, RefreshCw, Trash2, Clock, Wallet, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useShallow } from "zustand/react/shallow";

export function QuickTrade() {
  const { 
    selectedSymbol, 
    tickers, 
    tradingMode, 
    portfolio, 
    botConfig, 
    binanceTestnet,
    scheduledOrders,
    addScheduledOrder,
    removeScheduledOrder,
    triggerScheduledOrder
  } = useCryptoStore(
  useShallow((s) => ({ selectedSymbol: s.selectedSymbol, tickers: s.tickers, tradingMode: s.tradingMode, portfolio: s.portfolio, botConfig: s.botConfig, binanceTestnet: s.binanceTestnet, scheduledOrders: s.scheduledOrders, addScheduledOrder: s.addScheduledOrder, removeScheduledOrder: s.removeScheduledOrder, triggerScheduledOrder: s.triggerScheduledOrder }))
);
  const [tradeSide, setTradeSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState("");
  const [usdtAmount, setUsdtAmount] = useState("");
  const [isMaxSell, setIsMaxSell] = useState(false);
  const [lastTrade, setLastTrade] = useState<{ side: "BUY" | "SELL"; qty: number; price: number } | null>(null);
  const [sltpData, setSltpData] = useState<{ stopLoss: number; takeProfit: number; riskRewardRatio: number; recommendation: string } | null>(null);
  const [sltpLoading, setSltpLoading] = useState(false);
  const { toast } = useToast();

  // Scheduled orders state
  const [scheduledSide, setScheduledSide] = useState<"BUY" | "SELL">("BUY");
  const [triggerPrice, setTriggerPrice] = useState("");
  const [scheduledQty, setScheduledQty] = useState("");
  const [scheduledUsdt, setScheduledUsdt] = useState("");
  const [scheduledIsMaxSell, setScheduledIsMaxSell] = useState(false);

  const ticker = tickers[selectedSymbol];
  const currentPrice = ticker?.price ?? 0;
  const isPositive = (ticker?.priceChangePercent ?? 0) >= 0;

  const cleanSym = selectedSymbol.replace(/USDT$|BUSD$|USDC$/, "");

  // Find position in portfolio
  const currentPosition = portfolio.positions?.find(
    (p) => p.symbol === selectedSymbol || p.symbol === cleanSym || p.symbol === `${cleanSym}USDT`
  );

  const availableHoldingQty = Math.max(
    currentPosition?.quantity ?? 0,
    (selectedSymbol === "BTCUSDT" || (portfolio.positions?.length ?? 0) === 0) ? (portfolio.assetQuantity ?? 0) : 0
  );
  const availableHoldingValueUsd = availableHoldingQty * currentPrice;
  const availableCashUsdt = portfolio.cashBalance ?? 0;

  // Reset inputs when symbol changes
  useEffect(() => {
    setQuantity("");
    setUsdtAmount("");
    setIsMaxSell(false);
    setScheduledQty("");
    setScheduledUsdt("");
    setScheduledIsMaxSell(false);
  }, [selectedSymbol]);

  const handleUsdtChange = (val: string) => {
    setUsdtAmount(val);
    setIsMaxSell(false);
    const parsed = parseFloat(val);
    if (Number.isFinite(parsed) && parsed > 0 && currentPrice > 0) {
      const rawQty = parsed / currentPrice;
      const decimals = currentPrice > 1000 ? 6 : currentPrice > 1 ? 4 : (currentPrice < 0.01 ? 2 : 4);
      setQuantity(Number(rawQty.toFixed(decimals)).toString());
    } else if (!val) {
      setQuantity("");
    }
  };

  const handleQuantityChange = (val: string) => {
    setQuantity(val);
    setIsMaxSell(false);
    const parsed = parseFloat(val);
    if (Number.isFinite(parsed) && parsed > 0 && currentPrice > 0) {
      setUsdtAmount((parsed * currentPrice).toFixed(2));
    } else if (!val) {
      setUsdtAmount("");
    }
  };

  // Preset buttons for BUY
  const applyBuyCashPct = (pct: number) => {
    if (availableCashUsdt <= 0 || currentPrice <= 0) {
      toast({
        title: "Sem saldo em caixa",
        description: "Você não possui saldo USDT disponível para compras.",
        variant: "destructive",
      });
      return;
    }
    const targetUsdt = availableCashUsdt * pct;
    setUsdtAmount(targetUsdt.toFixed(2));
    const rawQty = targetUsdt / currentPrice;
    const decimals = currentPrice > 1000 ? 6 : currentPrice > 1 ? 4 : (currentPrice < 0.01 ? 2 : 4);
    setQuantity(Number(rawQty.toFixed(decimals)).toString());
    setIsMaxSell(false);
  };

  const applyBuyUsdtFixed = (amount: number) => {
    if (currentPrice <= 0) return;
    setUsdtAmount(amount.toString());
    const rawQty = amount / currentPrice;
    const decimals = currentPrice > 1000 ? 6 : currentPrice > 1 ? 4 : (currentPrice < 0.01 ? 2 : 4);
    setQuantity(Number(rawQty.toFixed(decimals)).toString());
    setIsMaxSell(false);
  };

  // Preset buttons for SELL (including MAX PORTFOLIO)
  const applySellHoldingPct = (pct: number) => {
    if (availableHoldingQty <= 0) {
      toast({
        title: "Sem saldo em carteira",
        description: `Você não possui saldo de ${cleanSym} disponível no portfólio para vender.`,
        variant: "destructive",
      });
      return;
    }
    const isAll = pct >= 0.999;
    setIsMaxSell(isAll);
    if (isAll) {
      setQuantity(availableHoldingQty.toString());
      setUsdtAmount((availableHoldingQty * currentPrice).toFixed(2));
    } else {
      const targetQty = availableHoldingQty * pct;
      const decimals = currentPrice > 1000 ? 6 : currentPrice > 1 ? 4 : (currentPrice < 0.01 ? 2 : 4);
      setQuantity(Number(targetQty.toFixed(decimals)).toString());
      setUsdtAmount((targetQty * currentPrice).toFixed(2));
    }
  };

  // Scheduled order input synchronizers
  const handleScheduledUsdtChange = (val: string) => {
    setScheduledUsdt(val);
    setScheduledIsMaxSell(false);
    const parsed = parseFloat(val);
    const refPrice = parseFloat(triggerPrice) || currentPrice;
    if (Number.isFinite(parsed) && parsed > 0 && refPrice > 0) {
      const rawQty = parsed / refPrice;
      const decimals = refPrice > 1000 ? 6 : refPrice > 1 ? 4 : 2;
      setScheduledQty(Number(rawQty.toFixed(decimals)).toString());
    } else if (!val) {
      setScheduledQty("");
    }
  };

  const handleScheduledQtyChange = (val: string) => {
    setScheduledQty(val);
    setScheduledIsMaxSell(false);
    const parsed = parseFloat(val);
    const refPrice = parseFloat(triggerPrice) || currentPrice;
    if (Number.isFinite(parsed) && parsed > 0 && refPrice > 0) {
      setScheduledUsdt((parsed * refPrice).toFixed(2));
    } else if (!val) {
      setScheduledUsdt("");
    }
  };

  const applyScheduledBuyPct = (pct: number) => {
    const refPrice = parseFloat(triggerPrice) || currentPrice;
    if (availableCashUsdt <= 0 || refPrice <= 0) return;
    const targetUsdt = availableCashUsdt * pct;
    setScheduledUsdt(targetUsdt.toFixed(2));
    const rawQty = targetUsdt / refPrice;
    const decimals = refPrice > 1000 ? 6 : refPrice > 1 ? 4 : 2;
    setScheduledQty(Number(rawQty.toFixed(decimals)).toString());
    setScheduledIsMaxSell(false);
  };

  const applyScheduledSellPct = (pct: number) => {
    const refPrice = parseFloat(triggerPrice) || currentPrice;
    if (availableHoldingQty <= 0) {
      toast({
        title: "Sem saldo em carteira",
        description: `Você não possui saldo de ${cleanSym} disponível no portfólio.`,
        variant: "destructive",
      });
      return;
    }
    const isAll = pct >= 0.999;
    setScheduledIsMaxSell(isAll);
    if (isAll) {
      setScheduledQty(availableHoldingQty.toString());
      setScheduledUsdt((availableHoldingQty * refPrice).toFixed(2));
    } else {
      const targetQty = availableHoldingQty * pct;
      const decimals = refPrice > 1000 ? 6 : refPrice > 1 ? 4 : 2;
      setScheduledQty(Number(targetQty.toFixed(decimals)).toString());
      setScheduledUsdt((targetQty * refPrice).toFixed(2));
    }
  };

  // Scheduled trigger validation hook
  useEffect(() => {
    const activeOrders = scheduledOrders.filter((o) => !o.isTriggered && o.symbol === selectedSymbol);
    if (activeOrders.length === 0 || !ticker || currentPrice <= 0) return;

    activeOrders.forEach(async (order) => {
      let triggered = false;
      if (order.direction === "above" && currentPrice >= order.triggerPrice) {
        triggered = true;
      } else if (order.direction === "below" && currentPrice <= order.triggerPrice) {
        triggered = true;
      }

      if (triggered) {
        // Mark immediately to avoid duplicate dispatch
        triggerScheduledOrder(order.id);

        try {
          const total = order.quantity * currentPrice;
          const res = await fetch("/api/trades", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              symbol: order.symbol,
              side: order.side,
              price: currentPrice,
              quantity: order.quantity,
              total,
              strategy: "Trigger Programado",
              mode: tradingMode,
              pnl: 0,
            }),
          });

          const result = await res.json();
          if (result.success) {
            const store = useCryptoStore.getState();
            store.addTrade({
              id: result.data.id,
              symbol: result.data.symbol,
              side: result.data.side,
              price: result.data.price,
              quantity: result.data.quantity,
              total: result.data.total,
              strategy: result.data.strategy || "Trigger Programado",
              mode: result.data.mode || tradingMode,
              pnl: result.data.pnl || 0,
              timestamp: result.data.timestamp || new Date().toISOString(),
            });

            if (result.account) {
              store.setAccount(result.account);
            }

            toast({
              title: `⏰ Compra/Venda Programada Executada`,
              description: `${order.side === "BUY" ? "🟢 Compra" : "🔴 Venda"} programada de ${order.quantity} ${order.symbol.replace("USDT", "")} disparada @ $${formatPrice(currentPrice)}`,
            });
            
            // Emit telemetry
            try {
              const { telemetry } = await import('@/lib/telemetry');
              telemetry.emit("trade", {
                tradeId: result.data.id,
                symbol: order.symbol,
                side: order.side,
                price: currentPrice,
                quantity: order.quantity,
                total,
                cashBalance: result.account?.cashBalance,
                assetQuantity: result.account?.assetQuantity,
              });
            } catch {}
          } else {
            toast({
              title: "Falha na Ordem Programada",
              description: result.error || "Erro ao executar ordem programada",
              variant: "destructive",
            });
          }
        } catch (err: any) {
          console.error("[ScheduledOrder] Trigger failed:", err.message);
        }
      }
    });
  }, [tickers, selectedSymbol, scheduledOrders, triggerScheduledOrder, tradingMode, toast, ticker, currentPrice]);

  const handleScheduleOrder = useCallback((side: "BUY" | "SELL") => {
    const trigger = parseFloat(triggerPrice);
    const qty = parseFloat(scheduledQty);
    if (!trigger || trigger <= 0 || !qty || qty <= 0 || currentPrice <= 0) return;

    const direction = trigger > currentPrice ? "above" : "below";

    addScheduledOrder({
      id: `sched_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      symbol: selectedSymbol,
      side,
      triggerPrice: trigger,
      quantity: qty,
      direction,
      isTriggered: false,
      createdAt: new Date().toISOString()
    });

    setTriggerPrice("");
    setScheduledQty("");
    setScheduledUsdt("");
    setScheduledIsMaxSell(false);

    toast({
      title: "Ordem Programada Salva",
      description: `${side === "BUY" ? "Compra" : "Venda"} programada de ${qty} ${selectedSymbol.replace("USDT", "")} salva @ gatilho $${formatPrice(trigger)}`,
    });
  }, [triggerPrice, scheduledQty, currentPrice, selectedSymbol, addScheduledOrder, toast]);

  const handleTrade = useCallback(async (side: "BUY" | "SELL") => {
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0 || currentPrice <= 0) return;

    const total = qty * currentPrice;

    if (tradingMode === "live" && total < 5.0) {
      toast({
        title: "Valor Mínimo da Ordem",
        description: `A Binance exige um valor mínimo de $5.00 USDT por ordem no mercado Spot. O valor atual é $${total.toFixed(2)} USDT.`,
        variant: "destructive",
      });
      return;
    }

    const isSellAll = side === "SELL" && (isMaxSell || qty >= (availableHoldingQty > 0 ? availableHoldingQty * 0.99 : 0));

    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol: selectedSymbol,
          side,
          price: currentPrice,
          quantity: qty,
          total,
          strategy: "Manual",
          mode: tradingMode,
          pnl: 0,
          sellAll: isSellAll,
        }),
      });

      const result = await res.json();
      if (result.success) {
        const store = useCryptoStore.getState();

        // Add server-generated trade to store
        store.addTrade({
          id: result.data.id,
          symbol: result.data.symbol,
          side: result.data.side,
          price: result.data.price,
          quantity: result.data.quantity,
          total: result.data.total,
          strategy: result.data.strategy || "Manual",
          mode: result.data.mode || tradingMode,
          pnl: result.data.pnl || 0,
          timestamp: result.data.timestamp || new Date().toISOString(),
        });

        // Update account from backend payload
        if (result.account) {
          store.setAccount(result.account);
        }

        setLastTrade({ side, qty, price: currentPrice });
        setQuantity("");
        setUsdtAmount("");
        setIsMaxSell(false);

        // Show toast notification
        toast({
          title: `${side === "BUY" ? "🟢 Compra" : "🔴 Venda"} Executada`,
          description: `${qty} ${selectedSymbol.replace("USDT", "")} @ $${formatPrice(currentPrice)} — Total: $${formatPrice(total)}`,
        });

        // Emit telemetry event
        try {
          const { telemetry } = await import('@/lib/telemetry');
          telemetry.emit("trade", {
            tradeId: result.data.id,
            symbol: selectedSymbol,
            side,
            price: currentPrice,
            quantity: qty,
            total,
            cashBalance: result.account?.cashBalance,
            assetQuantity: result.account?.assetQuantity,
          });
        } catch {}

        // Clear the last trade notification after 3 seconds
        setTimeout(() => setLastTrade(null), 3000);
      } else {
        toast({
          title: "Erro na execução",
          description: result.error || "Falha ao executar trade",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error("[QuickTrade] Failed to execute trade:", err.message);
      toast({
        title: "Erro de conexão",
        description: "Falha ao comunicar com o servidor. Tente novamente.",
        variant: "destructive",
      });
    }
  }, [quantity, currentPrice, selectedSymbol, tradingMode, toast, isMaxSell, availableHoldingQty]);

  // Fetch AI SL/TP suggestions
  const fetchSLTP = useCallback(async () => {
    const currentTicker = useCryptoStore.getState().tickers[selectedSymbol];
    if (!currentTicker || currentTicker.price <= 0) return;
    setSltpLoading(true);
    try {
      const res = await fetch("/api/ai/sltp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selectedSymbol,
          price: currentTicker.price,
          high24h: currentTicker.high,
          low24h: currentTicker.low,
          volume: currentTicker.quoteVolume,
          priceChange24h: currentTicker.priceChangePercent,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success && result.data) {
          setSltpData(result.data);
        }
      }
    } catch {
      // Silently fail
    } finally {
      setSltpLoading(false);
    }
  }, [selectedSymbol]);

  useEffect(() => {
    fetchSLTP();
  }, [fetchSLTP]);

  const totalCost = quantity ? parseFloat(quantity) * currentPrice : 0;

  return (
    <Card className="bg-card/60 backdrop-blur-md gradient-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-crypto-cyan" />
          Trade Rápido
          <Badge variant="outline" className="text-[10px] border-border ml-auto">
            {tradingMode === "paper" ? "Simulado" : "Real"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current Price Display */}
        <div className="bg-secondary/30 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Preço Atual</span>
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

        <Tabs defaultValue="instant" className="w-full">
          <TabsList className="bg-background/80 border border-border/40 grid grid-cols-2 w-full mb-3 h-8 p-[2px]">
            <TabsTrigger value="instant" className="text-[11px] font-semibold py-1">Instantâneo</TabsTrigger>
            <TabsTrigger value="scheduled" className="text-[11px] font-semibold py-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Programado
            </TabsTrigger>
          </TabsList>

          <TabsContent value="instant" className="space-y-3 outline-none">
            {/* Compra / Venda Mode Selector */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-secondary/40 rounded-lg border border-border/40">
              <button
                type="button"
                onClick={() => {
                  setTradeSide("BUY");
                  setIsMaxSell(false);
                }}
                className={cn(
                  "py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5",
                  tradeSide === "BUY"
                    ? "bg-crypto-green text-white shadow-sm shadow-crypto-green/20"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                Comprar
              </button>
              <button
                type="button"
                onClick={() => setTradeSide("SELL")}
                className={cn(
                  "py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5",
                  tradeSide === "SELL"
                    ? "bg-crypto-red text-white shadow-sm shadow-crypto-red/20"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                Vender
              </button>
            </div>

            {tradeSide === "BUY" ? (
              <div className="space-y-3">
                {/* Available Cash Banner */}
                <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-md bg-crypto-green/5 border border-crypto-green/20">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Wallet className="w-3 h-3 text-crypto-green" />
                    Caixa Disponível:
                  </span>
                  <span className="font-mono font-semibold text-crypto-green">
                    ${formatPrice(availableCashUsdt)} USDT
                  </span>
                </div>

                {/* Input: Desired Buy Amount in USDT */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-foreground flex items-center gap-1">
                      <DollarSign className="w-3 h-3 text-crypto-cyan" />
                      Valor de Compra (USDT)
                    </label>
                    <span className="text-[10px] text-muted-foreground font-mono">Desejado</span>
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Ex: 50.00"
                      value={usdtAmount}
                      onChange={(e) => handleUsdtChange(e.target.value)}
                      className="font-mono bg-background/80 backdrop-blur-sm border-border/50 text-sm h-9 pr-14 focus-visible:ring-crypto-green/40"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                      USDT
                    </span>
                  </div>
                  {/* Presets */}
                  <div className="grid grid-cols-4 gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-1 border-border/60 hover:border-crypto-green/50 hover:text-crypto-green"
                      onClick={() => applyBuyUsdtFixed(25)}
                    >
                      $25
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-1 border-border/60 hover:border-crypto-green/50 hover:text-crypto-green"
                      onClick={() => applyBuyUsdtFixed(50)}
                    >
                      $50
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-1 border-border/60 hover:border-crypto-green/50 hover:text-crypto-green"
                      onClick={() => applyBuyCashPct(0.5)}
                    >
                      50% Caixa
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-1 border-crypto-green/40 text-crypto-green hover:bg-crypto-green/10 font-bold"
                      onClick={() => applyBuyCashPct(1.0)}
                    >
                      100% Caixa
                    </Button>
                  </div>
                </div>

                {/* Input: Coin Quantity */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-foreground">
                      Quantidade a Comprar ({cleanSym})
                    </label>
                    {quantity && currentPrice > 0 && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        ~${formatPrice(parseFloat(quantity) * currentPrice)}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      value={quantity}
                      onChange={(e) => handleQuantityChange(e.target.value)}
                      className="font-mono bg-background/80 backdrop-blur-sm border-border/50 text-sm h-9 pr-16 focus-visible:ring-crypto-green/40"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                      {cleanSym}
                    </span>
                  </div>
                </div>

                {/* Buy Button */}
                <Button
                  onClick={() => handleTrade("BUY")}
                  disabled={!quantity || parseFloat(quantity) <= 0}
                  className="w-full bg-crypto-green hover:bg-crypto-green/90 text-white font-bold h-10 gap-1.5 btn-gradient-green touch-target shadow-md shadow-crypto-green/20"
                >
                  <TrendingUp className="w-4 h-4" />
                  Comprar {cleanSym} {usdtAmount && parseFloat(usdtAmount) > 0 ? `(~$${parseFloat(usdtAmount).toFixed(2)})` : ""}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Available Portfolio Banner */}
                <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-md bg-crypto-red/5 border border-crypto-red/20">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Wallet className="w-3 h-3 text-crypto-red" />
                    No Portfólio:
                  </span>
                  <span className="font-mono font-semibold text-foreground">
                    {availableHoldingQty > 0 ? availableHoldingQty.toLocaleString('en-US', { maximumFractionDigits: 6 }) : "0"} {cleanSym}
                    {availableHoldingQty > 0 && currentPrice > 0 && (
                      <span className="text-muted-foreground text-[10px] ml-1">
                        (~${formatPrice(availableHoldingValueUsd)})
                      </span>
                    )}
                  </span>
                </div>

                {/* Input: Coin Quantity to Sell with Máx Portfólio */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-foreground">
                      Quantidade para Vender ({cleanSym})
                    </label>
                    {isMaxSell && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-crypto-red text-crypto-red bg-crypto-red/10 font-bold">
                        100% PORTFÓLIO
                      </Badge>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      value={quantity}
                      onChange={(e) => handleQuantityChange(e.target.value)}
                      className="font-mono bg-background/80 backdrop-blur-sm border-border/50 text-sm h-9 pr-16 focus-visible:ring-crypto-red/40"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                      {cleanSym}
                    </span>
                  </div>
                  {/* Presets including Max Portfolio */}
                  <div className="grid grid-cols-4 gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-1 border-border/60 hover:border-crypto-red/50 hover:text-crypto-red"
                      onClick={() => applySellHoldingPct(0.25)}
                    >
                      25%
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-1 border-border/60 hover:border-crypto-red/50 hover:text-crypto-red"
                      onClick={() => applySellHoldingPct(0.5)}
                    >
                      50%
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-1 border-border/60 hover:border-crypto-red/50 hover:text-crypto-red"
                      onClick={() => applySellHoldingPct(0.75)}
                    >
                      75%
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-6 text-[10px] px-1 border-crypto-red font-bold transition-all",
                        isMaxSell
                          ? "bg-crypto-red text-white shadow-sm"
                          : "text-crypto-red hover:bg-crypto-red/10"
                      )}
                      onClick={() => applySellHoldingPct(1.0)}
                      title="Colocar o máximo disponível no portfólio"
                    >
                      🎯 Máx Portfólio
                    </Button>
                  </div>
                </div>

                {/* Input: Estimated USDT Received */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-foreground flex items-center gap-1">
                      <DollarSign className="w-3 h-3 text-crypto-cyan" />
                      Valor Estimado a Receber (USDT)
                    </label>
                    <span className="text-[10px] text-muted-foreground font-mono">Estimado</span>
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      value={usdtAmount}
                      onChange={(e) => handleUsdtChange(e.target.value)}
                      className="font-mono bg-background/80 backdrop-blur-sm border-border/50 text-sm h-9 pr-14 focus-visible:ring-crypto-red/40"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                      USDT
                    </span>
                  </div>
                </div>

                {/* Sell Button */}
                <Button
                  onClick={() => handleTrade("SELL")}
                  disabled={!quantity || parseFloat(quantity) <= 0}
                  className="w-full bg-crypto-red hover:bg-crypto-red/90 text-white font-bold h-10 gap-1.5 btn-gradient-red touch-target shadow-md shadow-crypto-red/20"
                >
                  <TrendingDown className="w-4 h-4" />
                  {isMaxSell
                    ? `Vender Tudo (${quantity} ${cleanSym})`
                    : `Vender ${cleanSym} ${usdtAmount && parseFloat(usdtAmount) > 0 ? `(~$${parseFloat(usdtAmount).toFixed(2)})` : ""}`}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="scheduled" className="space-y-3 outline-none">
            {/* Scheduled Mode Selector */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-secondary/40 rounded-lg border border-border/40">
              <button
                type="button"
                onClick={() => {
                  setScheduledSide("BUY");
                  setScheduledIsMaxSell(false);
                }}
                className={cn(
                  "py-1 text-[11px] font-semibold rounded-md transition-all flex items-center justify-center gap-1",
                  scheduledSide === "BUY"
                    ? "bg-crypto-green text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <TrendingUp className="w-3 h-3" />
                Programar Compra
              </button>
              <button
                type="button"
                onClick={() => setScheduledSide("SELL")}
                className={cn(
                  "py-1 text-[11px] font-semibold rounded-md transition-all flex items-center justify-center gap-1",
                  scheduledSide === "SELL"
                    ? "bg-crypto-red text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <TrendingDown className="w-3 h-3" />
                Programar Venda
              </button>
            </div>

            {/* Trigger Price input */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-medium text-muted-foreground">Preço Gatilho (USD)</label>
                <button
                  type="button"
                  onClick={() => setTriggerPrice(currentPrice.toString())}
                  className="text-[9px] text-crypto-cyan hover:underline cursor-pointer"
                >
                  Preço Atual (${formatPrice(currentPrice)})
                </button>
              </div>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder={`Meta Ex: $${formatPrice(currentPrice * (scheduledSide === "BUY" ? 0.95 : 1.05))}`}
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(e.target.value)}
                className="font-mono bg-background/80 backdrop-blur-sm border-border/50 text-xs h-8 focus-visible:ring-crypto-cyan/30"
              />
            </div>

            {scheduledSide === "BUY" ? (
              <div className="space-y-2">
                {/* Desired USDT input */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-medium text-muted-foreground">Valor Desejado (USDT)</label>
                    <span className="text-[9px] text-muted-foreground font-mono">Caixa: ${formatPrice(availableCashUsdt)}</span>
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Ex: 50.00"
                      value={scheduledUsdt}
                      onChange={(e) => handleScheduledUsdtChange(e.target.value)}
                      className="font-mono bg-background/80 backdrop-blur-sm border-border/50 text-xs h-8 pr-12 focus-visible:ring-crypto-green/30"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground font-bold">
                      USDT
                    </span>
                  </div>
                </div>

                {/* Quantity input */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-medium text-muted-foreground">Quantidade ({cleanSym})</label>
                    <div className="flex gap-1 text-[9px]">
                      <button
                        type="button"
                        onClick={() => applyScheduledBuyPct(0.25)}
                        className="text-crypto-cyan hover:underline cursor-pointer"
                      >
                        25%
                      </button>
                      <button
                        type="button"
                        onClick={() => applyScheduledBuyPct(0.50)}
                        className="text-crypto-cyan hover:underline cursor-pointer"
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        onClick={() => applyScheduledBuyPct(1.00)}
                        className="text-crypto-cyan hover:underline cursor-pointer font-bold"
                      >
                        MAX
                      </button>
                    </div>
                  </div>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0.00"
                    value={scheduledQty}
                    onChange={(e) => handleScheduledQtyChange(e.target.value)}
                    className="font-mono bg-background/80 backdrop-blur-sm border-border/50 text-xs h-8 focus-visible:ring-crypto-green/30"
                  />
                </div>

                <Button
                  onClick={() => handleScheduleOrder("BUY")}
                  disabled={!triggerPrice || !scheduledQty || parseFloat(scheduledQty) <= 0 || parseFloat(triggerPrice) <= 0}
                  size="sm"
                  className="w-full bg-crypto-green hover:bg-crypto-green/90 text-white font-semibold text-xs h-9 btn-gradient-green"
                >
                  Programar Compra
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Available holding info */}
                <div className="flex justify-between items-center text-[10px] px-2 py-1 rounded bg-crypto-red/5 border border-crypto-red/20">
                  <span className="text-muted-foreground">No Portfólio:</span>
                  <span className="font-mono font-semibold">
                    {availableHoldingQty > 0 ? availableHoldingQty.toLocaleString('en-US', { maximumFractionDigits: 6 }) : "0"} {cleanSym}
                  </span>
                </div>

                {/* Quantity input with MAX PORTFOLIO */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-medium text-muted-foreground">Quantidade ({cleanSym})</label>
                    <div className="flex gap-1 text-[9px]">
                      <button
                        type="button"
                        onClick={() => applyScheduledSellPct(0.50)}
                        className="text-crypto-red hover:underline cursor-pointer"
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        onClick={() => applyScheduledSellPct(1.00)}
                        className="text-crypto-red hover:underline cursor-pointer font-bold"
                        title="Colocar o máximo disponível no portfólio"
                      >
                        🎯 Máx
                      </button>
                    </div>
                  </div>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0.00"
                    value={scheduledQty}
                    onChange={(e) => handleScheduledQtyChange(e.target.value)}
                    className="font-mono bg-background/80 backdrop-blur-sm border-border/50 text-xs h-8 focus-visible:ring-crypto-red/30"
                  />
                </div>

                {/* Estimated USDT value */}
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">Valor Estimado (USDT)</label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      value={scheduledUsdt}
                      onChange={(e) => handleScheduledUsdtChange(e.target.value)}
                      className="font-mono bg-background/80 backdrop-blur-sm border-border/50 text-xs h-8 pr-12 focus-visible:ring-crypto-red/30"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground font-bold">
                      USDT
                    </span>
                  </div>
                </div>

                <Button
                  onClick={() => handleScheduleOrder("SELL")}
                  disabled={!triggerPrice || !scheduledQty || parseFloat(scheduledQty) <= 0 || parseFloat(triggerPrice) <= 0}
                  size="sm"
                  className="w-full bg-crypto-red hover:bg-crypto-red/90 text-white font-semibold text-xs h-9 btn-gradient-red"
                >
                  Programar Venda {scheduledIsMaxSell ? "(Tudo)" : ""}
                </Button>
              </div>
            )}

            {/* Scheduled Orders List */}
            <div className="space-y-1.5 pt-2">
              <span className="text-[10px] font-semibold text-muted-foreground block">Agendamentos Ativos</span>
              <ScrollArea className="h-[120px] w-full border border-border/30 rounded-lg p-2 bg-secondary/10">
                <div className="space-y-1.5">
                  {scheduledOrders.filter(o => !o.isTriggered && o.symbol === selectedSymbol).map(order => (
                    <div key={order.id} className="flex items-center justify-between bg-card/40 border border-border/20 rounded px-2 py-1.5 text-[10px]">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1">
                          <Badge variant={order.side === "BUY" ? "default" : "secondary"} className={cn(
                            "text-[8px] px-1 py-0 h-4 border-none",
                            order.side === "BUY" ? "bg-crypto-green/10 text-crypto-green" : "bg-crypto-red/10 text-crypto-red"
                          )}>
                            {order.side === "BUY" ? "COMPRA" : "VENDA"}
                          </Badge>
                          <span className="font-mono text-muted-foreground text-[9px]">{order.symbol.replace("USDT", "")}</span>
                        </div>
                        <span className="text-muted-foreground block">
                          Gatilho: {order.direction === "above" ? "≥" : "≤"} ${formatPrice(order.triggerPrice)}
                        </span>
                        <span className="text-muted-foreground block font-mono text-[9px]">Qtd: {order.quantity}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-muted-foreground hover:text-crypto-red hover:bg-crypto-red/10"
                        onClick={() => removeScheduledOrder(order.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  {scheduledOrders.filter(o => !o.isTriggered && o.symbol === selectedSymbol).length === 0 && (
                    <span className="text-[10px] text-muted-foreground text-center block py-4">Nenhuma ordem programada ativa.</span>
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>

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

        {/* AI SL/TP Suggestion */}
        <div className="bg-secondary/20 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Target className="w-3 h-3 text-crypto-cyan" />
              SL/TP sugerido pela IA
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-muted-foreground hover:text-crypto-cyan"
              onClick={fetchSLTP}
              disabled={sltpLoading}
            >
              <RefreshCw className={cn("w-2.5 h-2.5", sltpLoading && "animate-spin")} />
            </Button>
          </div>
          {sltpData ? (
            <>
              <div className="flex items-center justify-between text-[10px]">
                <button
                  type="button"
                  onClick={() => setTriggerPrice(sltpData.stopLoss.toString())}
                  className="text-crypto-red hover:underline flex items-center gap-0.5 cursor-pointer font-semibold"
                  title="Preencher Stop Loss no Gatilho"
                >
                  🛑 SL: ${formatPrice(sltpData.stopLoss)}
                </button>
                <button
                  type="button"
                  onClick={() => setTriggerPrice(sltpData.takeProfit.toString())}
                  className="text-crypto-green hover:underline flex items-center gap-0.5 cursor-pointer font-semibold"
                  title="Preencher Take Profit no Gatilho"
                >
                  ✅ TP: ${formatPrice(sltpData.takeProfit)}
                </button>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className={cn(
                  "font-mono font-bold",
                  sltpData.recommendation === "COMPRA" ? "text-crypto-green" : sltpData.recommendation === "VENDA" ? "text-crypto-red" : "text-amber-400"
                )}>
                  {sltpData.recommendation}
                </span>
                <span className="text-muted-foreground font-mono">
                  R:R 1:{sltpData.riskRewardRatio.toFixed(1)}
                </span>
              </div>
            </>
          ) : sltpLoading ? (
            <div className="flex items-center justify-center py-1">
              <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <span className="text-[9px] text-muted-foreground">Carregando...</span>
          )}
        </div>

        {/* Portfolio Summary */}
        <div className="bg-secondary/20 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Caixa Disponível</span>
            <span className="font-mono font-medium">${formatPrice(portfolio.cashBalance)}</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Valor em Ativos</span>
            <span className="font-mono font-medium">${formatPrice(portfolio.assetBalance)}</span>
          </div>
          {availableHoldingQty > 0 && (
            <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-border/20">
              <span className="text-crypto-cyan font-semibold flex items-center gap-1">
                <Wallet className="w-2.5 h-2.5" />
                Saldo {cleanSym}
              </span>
              <span className="font-mono font-bold text-crypto-cyan">
                {availableHoldingQty.toLocaleString('en-US', { maximumFractionDigits: 6 })} {cleanSym}
                {currentPrice > 0 && (
                  <span className="text-muted-foreground font-normal ml-1">
                    (~${formatPrice(availableHoldingValueUsd)})
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
