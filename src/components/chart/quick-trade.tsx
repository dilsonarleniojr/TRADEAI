"use client";

import { useState, useCallback, useEffect } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Zap, ShoppingCart, Target, RefreshCw, Trash2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

export function QuickTrade() {
  const { 
    selectedSymbol, 
    tickers, 
    tradingMode, 
    portfolio, 
    botConfig, 
    binanceApiKey, 
    binanceApiSecret, 
    binanceTestnet,
    scheduledOrders,
    addScheduledOrder,
    removeScheduledOrder,
    triggerScheduledOrder
  } = useCryptoStore();
  const [quantity, setQuantity] = useState("");
  const [lastTrade, setLastTrade] = useState<{ side: "BUY" | "SELL"; qty: number; price: number } | null>(null);
  const [sltpData, setSltpData] = useState<{ stopLoss: number; takeProfit: number; riskRewardRatio: number; recommendation: string } | null>(null);
  const [sltpLoading, setSltpLoading] = useState(false);
  const { toast } = useToast();

  // Scheduled orders state
  const [triggerPrice, setTriggerPrice] = useState("");
  const [scheduledQty, setScheduledQty] = useState("");

  const ticker = tickers[selectedSymbol];
  const currentPrice = ticker?.price ?? 0;
  const isPositive = (ticker?.priceChangePercent ?? 0) >= 0;

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
              "x-binance-api-key": binanceApiKey || "",
              "x-binance-api-secret": binanceApiSecret || "",
              "x-binance-testnet": binanceTestnet ? "true" : "false"
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
  }, [tickers, selectedSymbol, scheduledOrders, triggerScheduledOrder, binanceApiKey, binanceApiSecret, binanceTestnet, tradingMode, toast, ticker, currentPrice]);

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

    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-binance-api-key": binanceApiKey || "",
          "x-binance-api-secret": binanceApiSecret || "",
          "x-binance-testnet": binanceTestnet ? "true" : "false"
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
  }, [quantity, currentPrice, selectedSymbol, tradingMode, toast]);

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
            {/* Quantity Input */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Quantidade
              </label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="flex-1 font-mono bg-background/80 backdrop-blur-sm border-border/50 input-glow focus-visible:ring-crypto-cyan/30 text-sm"
                />
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-full text-[10px] px-2 border-border"
                    onClick={() => setQuantity((portfolio.cashBalance / (currentPrice || 1) * 0.25).toFixed(6))}
                  >
                    25%
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-full text-[10px] px-2 border-border"
                    onClick={() => setQuantity((portfolio.cashBalance / (currentPrice || 1) * 0.5).toFixed(6))}
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
                Comprar
              </Button>
              <Button
                onClick={() => handleTrade("SELL")}
                disabled={!quantity || parseFloat(quantity) <= 0}
                className="bg-crypto-red hover:bg-crypto-red/90 text-white font-semibold h-10 gap-1.5 btn-gradient-red touch-target"
              >
                <TrendingDown className="w-4 h-4" />
                Vender
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="scheduled" className="space-y-3 outline-none">
            {/* Trigger Price input */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">Preço Gatilho (USD)</label>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder={`Meta Ex: $${formatPrice(currentPrice * 1.05)}`}
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(e.target.value)}
                className="font-mono bg-background/80 backdrop-blur-sm border-border/50 text-xs h-8 focus-visible:ring-crypto-cyan/30"
              />
            </div>

            {/* Quantity input */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">Quantidade</label>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                value={scheduledQty}
                onChange={(e) => setScheduledQty(e.target.value)}
                className="font-mono bg-background/80 backdrop-blur-sm border-border/50 text-xs h-8 focus-visible:ring-crypto-cyan/30"
              />
            </div>

            {/* Schedule Buy / Sell buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => handleScheduleOrder("BUY")}
                disabled={!triggerPrice || !scheduledQty || parseFloat(scheduledQty) <= 0 || parseFloat(triggerPrice) <= 0}
                size="sm"
                className="bg-crypto-green hover:bg-crypto-green/90 text-white font-semibold text-xs h-9 btn-gradient-green"
              >
                Programar Compra
              </Button>
              <Button
                onClick={() => handleScheduleOrder("SELL")}
                disabled={!triggerPrice || !scheduledQty || parseFloat(scheduledQty) <= 0 || parseFloat(triggerPrice) <= 0}
                size="sm"
                className="bg-crypto-red hover:bg-crypto-red/90 text-white font-semibold text-xs h-9 btn-gradient-red"
              >
                Programar Venda
              </Button>
            </div>

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
                <span className="text-crypto-red flex items-center gap-0.5">🛑 SL: ${formatPrice(sltpData.stopLoss)}</span>
                <span className="text-crypto-green flex items-center gap-0.5">✅ TP: ${formatPrice(sltpData.takeProfit)}</span>
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
        </div>
      </CardContent>
    </Card>
  );
}
