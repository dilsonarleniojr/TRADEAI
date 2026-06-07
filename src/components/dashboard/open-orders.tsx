"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Shield,
  Zap,
  Target,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { ALL_SYMBOLS } from "@/lib/crypto-meta";
import { useToast } from "@/hooks/use-toast";

export interface OpenOrder {
  id: string;
  symbol: string;
  type: "LIMIT" | "STOP_LOSS" | "TAKE_PROFIT" | "OCO";
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  total: number;
  stopPrice?: number;
  status: "OPEN" | "TRIGGERED" | "CANCELLED";
  timestamp: string;
  timeRemaining: string;
}

const executeTriggeredOrder = async (order: OpenOrder, fillPrice: number) => {
  const store = useCryptoStore.getState();
  try {
    const res = await fetch("/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: order.symbol,
        side: order.side,
        price: fillPrice,
        quantity: order.quantity,
        total: order.quantity * fillPrice,
        strategy: `${order.type} Order`,
        mode: store.tradingMode,
        pnl: 0,
      }),
    });
    const result = await res.json();
    if (result.success) {
      store.addTrade({
        id: result.data.id,
        symbol: result.data.symbol,
        side: result.data.side,
        price: result.data.price,
        quantity: result.data.quantity,
        total: result.data.total,
        strategy: result.data.strategy,
        mode: result.data.mode,
        pnl: result.data.pnl,
        timestamp: result.data.timestamp || new Date().toISOString(),
      });
      if (result.account) {
        store.setAccount(result.account);
      }
      return true;
    }
  } catch (err) {
    console.error("Failed to execute open order trade:", err);
  }
  return false;
};

export function OpenOrders() {
  const { tickers, tradingMode } = useCryptoStore();
  const { toast } = useToast();
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form states
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [orderType, setOrderType] = useState<"LIMIT" | "STOP_LOSS" | "TAKE_PROFIT" | "OCO">("LIMIT");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [price, setPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [quantity, setQuantity] = useState("");

  // Load orders from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("tradeai_open_orders");
    if (saved) {
      try {
        setOrders(JSON.parse(saved));
      } catch (e) {
        setOrders([]);
      }
    }
  }, []);

  // Monitor price changes and fill matching orders
  useEffect(() => {
    if (Object.keys(tickers).length === 0 || orders.length === 0) return;

    let updated = false;
    const nextOrders = orders.map((order) => {
      if (order.status !== "OPEN") return order;

      const ticker = tickers[order.symbol];
      if (!ticker || ticker.price <= 0) return order;

      const currentPrice = ticker.price;
      let shouldTrigger = false;

      if (order.type === "LIMIT") {
        if (order.side === "BUY" && currentPrice <= order.price) shouldTrigger = true;
        if (order.side === "SELL" && currentPrice >= order.price) shouldTrigger = true;
      } else if (order.type === "STOP_LOSS") {
        if (order.side === "BUY" && currentPrice >= order.price) shouldTrigger = true;
        if (order.side === "SELL" && currentPrice <= order.price) shouldTrigger = true;
      } else if (order.type === "TAKE_PROFIT") {
        if (order.side === "BUY" && currentPrice <= order.price) shouldTrigger = true;
        if (order.side === "SELL" && currentPrice >= order.price) shouldTrigger = true;
      } else if (order.type === "OCO") {
        const stopPr = order.stopPrice || 0;
        if (order.side === "BUY") {
          if (currentPrice <= order.price || (stopPr > 0 && currentPrice >= stopPr)) shouldTrigger = true;
        } else {
          if (currentPrice >= order.price || (stopPr > 0 && currentPrice <= stopPr)) shouldTrigger = true;
        }
      }

      if (shouldTrigger) {
        updated = true;
        // Trigger execution asynchronously
        executeTriggeredOrder(order, currentPrice).then((success) => {
          if (success) {
            toast({
              title: `Ordem ${order.type} Executada!`,
              description: `${order.side === "BUY" ? "Compra" : "Venda"} de ${order.quantity} ${order.symbol.replace("USDT", "")} a $${formatPrice(currentPrice)} preenchida.`,
            });
          }
        });
        return { ...order, status: "TRIGGERED" as const };
      }

      return order;
    });

    if (updated) {
      setOrders(nextOrders);
      localStorage.setItem("tradeai_open_orders", JSON.stringify(nextOrders));
    }
  }, [tickers, orders, toast]);

  const handleCreateOrder = () => {
    const priceVal = parseFloat(price);
    const qtyVal = parseFloat(quantity);
    const stopVal = parseFloat(stopPrice);

    if (isNaN(priceVal) || priceVal <= 0 || isNaN(qtyVal) || qtyVal <= 0) {
      toast({
        title: "Erro nos dados",
        description: "Insira um preço e quantidade válidos.",
        variant: "destructive",
      });
      return;
    }

    if (orderType === "OCO" && (isNaN(stopVal) || stopVal <= 0)) {
      toast({
        title: "Erro nos dados",
        description: "Insira um preço de Stop válido para a ordem OCO.",
        variant: "destructive",
      });
      return;
    }

    const newOrder: OpenOrder = {
      id: `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      symbol,
      type: orderType,
      side,
      price: priceVal,
      quantity: qtyVal,
      total: priceVal * qtyVal,
      stopPrice: orderType === "OCO" ? stopVal : undefined,
      status: "OPEN",
      timestamp: new Date().toISOString(),
      timeRemaining: "GTC",
    };

    const nextOrders = [newOrder, ...orders];
    setOrders(nextOrders);
    localStorage.setItem("tradeai_open_orders", JSON.stringify(nextOrders));
    setDialogOpen(false);
    setPrice("");
    setStopPrice("");
    setQuantity("");

    toast({
      title: "Ordem Enviada",
      description: `${newOrder.type} de ${side === "BUY" ? "Compra" : "Venda"} enviada para o livro: ${qtyVal} ${symbol.replace("USDT", "")} a $${formatPrice(priceVal)}.`,
    });
  };

  const handleCancelOrder = (id: string) => {
    const nextOrders = orders.map((o) => {
      if (o.id === id) {
        return { ...o, status: "CANCELLED" as const };
      }
      return o;
    });
    setOrders(nextOrders);
    localStorage.setItem("tradeai_open_orders", JSON.stringify(nextOrders));

    toast({
      title: "Ordem Cancelada",
      description: "A ordem foi removida do livro com sucesso.",
    });
  };

  const activeOrders = orders.filter((o) => o.status === "OPEN");
  const historyOrders = orders.filter((o) => o.status !== "OPEN");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
    >
      <Card className="glass-card gradient-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-crypto-cyan animate-pulse" />
            Ordens Abertas
            {activeOrders.length > 0 && (
              <Badge className="bg-crypto-cyan/20 text-crypto-cyan border-crypto-cyan/35 text-[9px] px-1.5 py-0">
                {activeOrders.length} Ativas
              </Badge>
            )}
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px] font-bold gap-1 border-crypto-cyan/30 text-crypto-cyan hover:bg-crypto-cyan/15 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                Nova Ordem
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-background border-border sm:max-w-md glass">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-crypto-cyan" />
                  Nova Ordem Condicional
                </DialogTitle>
                <DialogDescription>
                  Configure ordens pendentes que serão executadas automaticamente via triggers de preço da Binance.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2 text-xs">
                {/* Side Selector (BUY/SELL) */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => setSide("BUY")}
                    className={cn(
                      "flex-1 h-9 font-semibold text-xs transition-all duration-200",
                      side === "BUY"
                        ? "bg-crypto-green text-white btn-gradient-green glow-green-sm"
                        : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
                    )}
                  >
                    Compra (BUY)
                  </Button>
                  <Button
                    onClick={() => setSide("SELL")}
                    className={cn(
                      "flex-1 h-9 font-semibold text-xs transition-all duration-200",
                      side === "SELL"
                        ? "bg-crypto-red text-white btn-gradient-red glow-red-sm"
                        : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
                    )}
                  >
                    Venda (SELL)
                  </Button>
                </div>

                {/* Select Symbol */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground">Símbolo</label>
                  <Select value={symbol} onValueChange={(val) => {
                    setSymbol(val);
                    const t = tickers[val];
                    if (t) setPrice(t.price.toFixed(2));
                  }}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px] overflow-y-auto">
                      {ALL_SYMBOLS.map((sym) => (
                        <SelectItem key={sym} value={sym}>
                          {sym.replace("USDT", "")}/USDT
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Order Type */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground">Tipo de Ordem</label>
                  <Select value={orderType} onValueChange={(val) => setOrderType(val as any)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LIMIT">Limit</SelectItem>
                      <SelectItem value="STOP_LOSS">Stop Loss</SelectItem>
                      <SelectItem value="TAKE_PROFIT">Take Profit</SelectItem>
                      <SelectItem value="OCO">OCO (One-Cancels-the-Other)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Price and Quantity */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">Preço (USD)</label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">Quantidade</label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                {/* Stop Price for OCO */}
                {orderType === "OCO" && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">Preço de Stop (USD)</label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={stopPrice}
                      onChange={(e) => setStopPrice(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      O OCO cancela o limite original se o preço atingir o gatilho de stop.
                    </p>
                  </div>
                )}

                {tickers[symbol] && (
                  <p className="text-[10px] text-muted-foreground font-medium bg-secondary/15 p-2 rounded-md border border-border/30">
                    Preço de referência do mercado: <span className="font-mono text-foreground">${formatPrice(tickers[symbol].price)}</span>
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} className="cursor-pointer">
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateOrder}
                  className="bg-crypto-cyan text-black hover:bg-crypto-cyan/85 font-bold cursor-pointer"
                >
                  Confirmar Ordem
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {activeOrders.length === 0 ? (
            <div className="empty-state py-8">
              <div className="empty-state-icon bg-crypto-cyan/10">
                <Clock className="w-6 h-6 text-crypto-cyan/60" />
              </div>
              <p className="empty-state-title mt-2">Nenhuma ordem pendente</p>
              <p className="empty-state-desc max-w-xs text-center">
                Use o botão no topo para criar ordens condicionais Limit, Stop Loss ou OCO.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 cyan-scrollbar">
              <AnimatePresence>
                {activeOrders.map((order) => {
                  const cleanSym = order.symbol.replace("USDT", "");
                  return (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="flex flex-col p-3 rounded-lg border bg-secondary/20 border-border/40 hover:shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={cn(
                            "p-1.5 rounded-md shrink-0",
                            order.side === "BUY" ? "bg-crypto-green/10 text-crypto-green" : "bg-crypto-red/10 text-crypto-red"
                          )}>
                            {order.side === "BUY" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-foreground font-mono">{cleanSym}</span>
                              <Badge className={cn(
                                "text-[8px] uppercase font-semibold border-none px-1.5 py-0",
                                order.type === "LIMIT" ? "bg-crypto-cyan/20 text-crypto-cyan" :
                                order.type === "OCO" ? "bg-purple-500/20 text-purple-400" : "bg-amber-500/20 text-amber-400"
                              )}>
                                {order.type}
                              </Badge>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                              Qtd: <span className="font-semibold text-foreground">{order.quantity}</span> • Alvo: <span className="font-semibold text-foreground">${formatPrice(order.price)}</span>
                              {order.stopPrice && (
                                <> • Stop: <span className="font-semibold text-foreground">${formatPrice(order.stopPrice)}</span></>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-muted-foreground font-mono bg-secondary/80 px-1.5 py-0.5 rounded-full">
                            GTC
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-crypto-red hover:bg-crypto-red/10 hover:text-crypto-red rounded cursor-pointer"
                            onClick={() => handleCancelOrder(order.id)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}

          {/* Triggered / Cancelled History */}
          {historyOrders.length > 0 && (
            <div className="mt-4 border-t border-border/30 pt-3">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2 block">Histórico de Ordens</span>
              <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1 cyan-scrollbar">
                {historyOrders.slice(0, 5).map((order) => {
                  const cleanSym = order.symbol.replace("USDT", "");
                  return (
                    <div
                      key={order.id}
                      className="flex items-center justify-between text-[10px] p-2 rounded bg-secondary/10 border border-border/20 opacity-70"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "font-bold font-mono",
                          order.side === "BUY" ? "text-crypto-green" : "text-crypto-red"
                        )}>
                          {order.side}
                        </span>
                        <span className="font-mono">{cleanSym}</span>
                        <span className="text-muted-foreground">{order.type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">${formatPrice(order.price)}</span>
                        <Badge variant="outline" className={cn(
                          "text-[8px] border-none px-1.5 py-0",
                          order.status === "TRIGGERED" ? "bg-crypto-green/10 text-crypto-green" : "bg-muted text-muted-foreground"
                        )}>
                          {order.status === "TRIGGERED" ? "Preenchida" : "Cancelada"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
