"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  ShoppingCart, 
  Target, 
  RefreshCw, 
  Trash2, 
  Clock, 
  Wallet, 
  DollarSign,
  Shield,
  ShieldCheck,
  Lock,
  Timer,
  Scale,
  AlertTriangle,
  Layers,
  Loader2
} from "lucide-react";
import {
  validateQuickTradeExecution,
  stripQuoteAsset,
  formatQuantityByPrice,
} from "./quick-trade-guard";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useShallow } from "zustand/react/shallow";

export function QuickTrade() {
  const { 
    selectedSymbol, 
    ticker, 
    tradingMode, 
    portfolio, 
    scheduledOrders,
    addScheduledOrder,
    removeScheduledOrder,
    triggerScheduledOrder,
    tradePrefill,
    clearTradePrefill,
  } = useCryptoStore(
    useShallow((s) => {
      const sym = s.selectedSymbol || "BTCUSDT";
      return {
        selectedSymbol: sym,
        ticker: s.tickers[sym],
        tradingMode: s.tradingMode,
        portfolio: s.portfolio,
        scheduledOrders: s.scheduledOrders,
        addScheduledOrder: s.addScheduledOrder,
        removeScheduledOrder: s.removeScheduledOrder,
        triggerScheduledOrder: s.triggerScheduledOrder,
        tradePrefill: s.tradePrefill,
        clearTradePrefill: s.clearTradePrefill,
      };
    })
  );
  const [tradeSide, setTradeSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState("");
  const [usdtAmount, setUsdtAmount] = useState("");
  const [isMaxSell, setIsMaxSell] = useState(false);
  const [lastTrade, setLastTrade] = useState<{ side: "BUY" | "SELL"; qty: number; price: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sltpData, setSltpData] = useState<{ stopLoss: number; takeProfit: number; riskRewardRatio: number; recommendation: string } | null>(null);
  const [sltpLoading, setSltpLoading] = useState(false);
  const { toast } = useToast();

  // Locks síncronos em O(1) para impedir race conditions antes do re-render do React
  const submittingRef = useRef(false);
  const triggeredIdsRef = useRef<Set<string>>(new Set());
  const lastTradeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sltpAbortRef = useRef<AbortController | null>(null);

  // Gerenciador de Margem e Alavancagem Proporcional ao Horizonte
  const [marginMode, setMarginMode] = useState<"SPOT" | "ISOLATED" | "CROSS">("SPOT");
  const [leverage, setLeverage] = useState<number>(1);
  const [timeStopHours, setTimeStopHours] = useState<number>(0);
  const [timeStopActive, setTimeStopActive] = useState<boolean>(false);

  // Scheduled orders state
  const [scheduledSide, setScheduledSide] = useState<"BUY" | "SELL">("BUY");
  const [triggerPrice, setTriggerPrice] = useState("");
  const [scheduledQty, setScheduledQty] = useState("");
  const [scheduledUsdt, setScheduledUsdt] = useState("");
  const [scheduledIsMaxSell, setScheduledIsMaxSell] = useState(false);

  const currentPrice = ticker?.price ?? 0;
  const isPositive = (ticker?.priceChangePercent ?? 0) >= 0;

  const cleanSym = useMemo(() => stripQuoteAsset(selectedSymbol), [selectedSymbol]);

  // Memoiza a busca da posição na carteira para evitar .find() em cada render
  const currentPosition = useMemo(
    () =>
      portfolio.positions?.find(
        (p) => p.symbol === selectedSymbol || p.symbol === cleanSym || p.symbol === `${cleanSym}USDT`
      ),
    [portfolio.positions, selectedSymbol, cleanSym]
  );

  const availableHoldingQty = useMemo(
    () => currentPosition?.quantity ?? 0,
    [currentPosition?.quantity]
  );

  const availableHoldingValueUsd = availableHoldingQty * currentPrice;
  const availableCashUsdt = portfolio.cashBalance ?? 0;

  // Filtra agendamentos ativos uma única vez por mudança de lista/símbolo
  const activeScheduledOrders = useMemo(
    () => scheduledOrders.filter((o) => !o.isTriggered && o.symbol === selectedSymbol),
    [scheduledOrders, selectedSymbol]
  );

  // Cleanup de timers e AbortController ao desmontar
  useEffect(() => {
    return () => {
      if (lastTradeTimerRef.current) clearTimeout(lastTradeTimerRef.current);
      if (sltpAbortRef.current) sltpAbortRef.current.abort();
    };
  }, []);

  // Reset inputs when symbol changes (exceto se houver tradePrefill para este símbolo)
  useEffect(() => {
    if (tradePrefill && (tradePrefill.symbol === selectedSymbol || stripQuoteAsset(tradePrefill.symbol) === cleanSym)) {
      return;
    }
    setQuantity("");
    setUsdtAmount("");
    setIsMaxSell(false);
    setScheduledQty("");
    setScheduledUsdt("");
    setScheduledIsMaxSell(false);
  }, [selectedSymbol, tradePrefill, cleanSym]);

  const appliedPrefillRef = useRef<any>(null);

  // Pre-fill inputs when tradePrefill is set
  useEffect(() => {
    if (!tradePrefill) {
      appliedPrefillRef.current = null;
      return;
    }
    const matches = tradePrefill.symbol === selectedSymbol || stripQuoteAsset(tradePrefill.symbol) === cleanSym;
    if (!matches) return;

    if (appliedPrefillRef.current === tradePrefill) {
      return;
    }
    appliedPrefillRef.current = tradePrefill;

    setTradeSide(tradePrefill.side);

    const isFast = tradePrefill.horizon === "RAPIDO";
    if (isFast) {
      setMarginMode(tradePrefill.marginMode || "ISOLATED");
      setLeverage(tradePrefill.suggestedLeverage || 2);
      setTimeStopHours(tradePrefill.timeStopHours || 4);
      setTimeStopActive(tradePrefill.timeStopEnabled ?? true);
    } else {
      setMarginMode("SPOT");
      setLeverage(1);
      setTimeStopHours(0);
      setTimeStopActive(false);
    }

    if (tradePrefill.stopLoss || tradePrefill.takeProfit || tradePrefill.tp1) {
      setSltpData({
        stopLoss: tradePrefill.stopLoss || 0,
        takeProfit: tradePrefill.takeProfit || tradePrefill.tp1 || 0,
        riskRewardRatio: tradePrefill.riskReward || 2.5,
        recommendation: tradePrefill.reason || `Setup ${tradePrefill.side} do Estúdio Quant & IA`,
      });
    }

    const effPrice = currentPrice > 0 ? currentPrice : (tradePrefill.entryPrice || 0);
    if (effPrice > 0) {
      if (tradePrefill.side === "BUY") {
        let cash = 25;
        if (availableCashUsdt > 10) {
          if (tradePrefill.riskAllocationPercent) {
            const alloc = (availableCashUsdt * tradePrefill.riskAllocationPercent) / 100;
            cash = Math.max(10, Math.min(alloc, 500));
          } else {
            cash = Math.min(availableCashUsdt * 0.25, 250);
          }
        }
        setUsdtAmount(cash.toFixed(2));
        setQuantity(formatQuantityByPrice(cash / effPrice, effPrice));
      } else {
        if (availableHoldingQty > 0) {
          setQuantity(availableHoldingQty.toString());
          setUsdtAmount((availableHoldingQty * effPrice).toFixed(2));
        } else {
          const defaultUsd = 25;
          setUsdtAmount(defaultUsd.toFixed(2));
          setQuantity(formatQuantityByPrice(defaultUsd / effPrice, effPrice));
        }
      }
    }

    if (tradePrefill.entryPrice) {
      setTriggerPrice(tradePrefill.entryPrice.toString());
    }
  }, [tradePrefill, selectedSymbol, currentPrice, availableCashUsdt, availableHoldingQty, cleanSym]);

  const handleUsdtChange = useCallback((val: string) => {
    setUsdtAmount(val);
    setIsMaxSell(false);
    const parsed = parseFloat(val);
    if (Number.isFinite(parsed) && parsed > 0 && currentPrice > 0) {
      setQuantity(formatQuantityByPrice(parsed / currentPrice, currentPrice));
    } else if (!val) {
      setQuantity("");
    }
  }, [currentPrice]);

  const handleQuantityChange = useCallback((val: string) => {
    setQuantity(val);
    setIsMaxSell(false);
    const parsed = parseFloat(val);
    if (Number.isFinite(parsed) && parsed > 0 && currentPrice > 0) {
      setUsdtAmount((parsed * currentPrice).toFixed(2));
    } else if (!val) {
      setUsdtAmount("");
    }
  }, [currentPrice]);

  const applyBuyCashPct = useCallback((pct: number) => {
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
    setQuantity(formatQuantityByPrice(targetUsdt / currentPrice, currentPrice));
    setIsMaxSell(false);
  }, [availableCashUsdt, currentPrice, toast]);

  const applyBuyUsdtFixed = useCallback((amount: number) => {
    if (currentPrice <= 0) return;
    setUsdtAmount(amount.toString());
    setQuantity(formatQuantityByPrice(amount / currentPrice, currentPrice));
    setIsMaxSell(false);
  }, [currentPrice]);

  const applySellHoldingPct = useCallback((pct: number) => {
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
      setQuantity(formatQuantityByPrice(targetQty, currentPrice));
      setUsdtAmount((targetQty * currentPrice).toFixed(2));
    }
  }, [availableHoldingQty, cleanSym, currentPrice, toast]);

  const handleScheduledUsdtChange = useCallback((val: string) => {
    setScheduledUsdt(val);
    setScheduledIsMaxSell(false);
    const parsed = parseFloat(val);
    const refPrice = parseFloat(triggerPrice) || currentPrice;
    if (Number.isFinite(parsed) && parsed > 0 && refPrice > 0) {
      setScheduledQty(formatQuantityByPrice(parsed / refPrice, refPrice));
    } else if (!val) {
      setScheduledQty("");
    }
  }, [triggerPrice, currentPrice]);

  const handleScheduledQtyChange = useCallback((val: string) => {
    setScheduledQty(val);
    setScheduledIsMaxSell(false);
    const parsed = parseFloat(val);
    const refPrice = parseFloat(triggerPrice) || currentPrice;
    if (Number.isFinite(parsed) && parsed > 0 && refPrice > 0) {
      setScheduledUsdt((parsed * refPrice).toFixed(2));
    } else if (!val) {
      setScheduledUsdt("");
    }
  }, [triggerPrice, currentPrice]);

  const applyScheduledBuyPct = useCallback((pct: number) => {
    const refPrice = parseFloat(triggerPrice) || currentPrice;
    if (availableCashUsdt <= 0 || refPrice <= 0) return;
    const targetUsdt = availableCashUsdt * pct;
    setScheduledUsdt(targetUsdt.toFixed(2));
    setScheduledQty(formatQuantityByPrice(targetUsdt / refPrice, refPrice));
    setScheduledIsMaxSell(false);
  }, [triggerPrice, currentPrice, availableCashUsdt]);

  const applyScheduledSellPct = useCallback((pct: number) => {
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
      setScheduledQty(formatQuantityByPrice(targetQty, refPrice));
      setScheduledUsdt((targetQty * refPrice).toFixed(2));
    }
  }, [triggerPrice, currentPrice, availableHoldingQty, cleanSym, toast]);

  // Scheduled trigger validation hook com guarda em Set O(1) contra disparos duplicados
  useEffect(() => {
    if (activeScheduledOrders.length === 0 || currentPrice <= 0) return;

    for (const order of activeScheduledOrders) {
      if (triggeredIdsRef.current.has(order.id)) continue;

      const isTriggered =
        (order.direction === "above" && currentPrice >= order.triggerPrice) ||
        (order.direction === "below" && currentPrice <= order.triggerPrice);

      if (!isTriggered) continue;

      triggeredIdsRef.current.add(order.id);
      triggerScheduledOrder(order.id);

      const total = order.quantity * currentPrice;
      const orderCleanSym = stripQuoteAsset(order.symbol || selectedSymbol);

      void (async () => {
        try {
          const res = await fetch("/api/trades", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
              title: "⏰ Compra/Venda Programada Executada",
              description: `${order.side === "BUY" ? "🟢 Compra" : "🔴 Venda"} programada de ${order.quantity} ${orderCleanSym} disparada @ $${formatPrice(currentPrice)}`,
            });

            try {
              const { telemetry } = await import("@/lib/telemetry");
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
      })();
    }
  }, [activeScheduledOrders, currentPrice, selectedSymbol, triggerScheduledOrder, tradingMode, toast]);

  const handleScheduleOrder = useCallback((side: "BUY" | "SELL") => {
    if (submittingRef.current || isSubmitting) return;
    const trigger = parseFloat(triggerPrice);
    const qty = parseFloat(scheduledQty);
    if (!trigger || trigger <= 0 || !qty || qty <= 0 || currentPrice <= 0) return;

    const direction = trigger > currentPrice ? "above" : "below";
    const horizon = tradePrefill?.horizon || (marginMode === "SPOT" ? "MEDIO_LONGO" : "RAPIDO");

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      addScheduledOrder({
        id: `sched_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        symbol: selectedSymbol,
        side,
        triggerPrice: trigger,
        quantity: qty,
        direction,
        isTriggered: false,
        createdAt: new Date().toISOString(),
        marginMode,
        leverage,
        timeStopHours: timeStopActive ? timeStopHours : 0,
        horizon,
      });

      setTriggerPrice("");
      setScheduledQty("");
      setScheduledUsdt("");
      setScheduledIsMaxSell(false);

      toast({
        title: "Ordem Programada Salva",
        description: `${side === "BUY" ? "Compra" : "Venda"} programada de ${qty} ${cleanSym} salva @ gatilho $${formatPrice(trigger)} [${marginMode} ${leverage}x${timeStopActive ? ` | Time-Stop: ${timeStopHours}h` : ""}]`,
      });
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [isSubmitting, triggerPrice, scheduledQty, currentPrice, selectedSymbol, cleanSym, addScheduledOrder, toast, marginMode, leverage, timeStopActive, timeStopHours, tradePrefill]);

  const handleTrade = useCallback(async (side: "BUY" | "SELL") => {
    if (submittingRef.current || isSubmitting) return;

    const qty = parseFloat(quantity);
    const guard = validateQuickTradeExecution({
      isSubmitting: false,
      quantity: qty,
      currentPrice,
      tradingMode,
    });

    if (!guard.canExecute) {
      if (guard.reason) {
        toast({
          title: "Não foi possível enviar a ordem",
          description: guard.reason,
          variant: "destructive",
        });
      }
      return;
    }

    const total = guard.totalUsdt;
    const isSellAll = side === "SELL" && (isMaxSell || qty >= (availableHoldingQty > 0 ? availableHoldingQty * 0.99 : 0));
    const horizon = tradePrefill?.horizon || (marginMode === "SPOT" ? "MEDIO_LONGO" : "RAPIDO");

    submittingRef.current = true;
    setIsSubmitting(true);
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
          strategy: tradePrefill?.source || "Manual",
          mode: tradingMode,
          pnl: 0,
          sellAll: isSellAll,
          marginMode,
          leverage,
          timeStopHours: timeStopActive ? timeStopHours : 0,
          horizon,
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
          strategy: result.data.strategy || (tradePrefill?.source || "Manual"),
          mode: result.data.mode || tradingMode,
          pnl: result.data.pnl || 0,
          timestamp: result.data.timestamp || new Date().toISOString(),
        });

        if (result.account) {
          store.setAccount(result.account);
        }

        setLastTrade({ side, qty, price: currentPrice });
        setQuantity("");
        setUsdtAmount("");
        setIsMaxSell(false);

        const horizonTag = marginMode === "SPOT" ? "Spot 1x (Anti-Wicking)" : `Margem Isolada ${leverage}x`;
        toast({
          title: `${side === "BUY" ? "🟢 Compra" : "🔴 Venda"} Executada [${horizonTag}]`,
          description: `${qty} ${cleanSym} @ $${formatPrice(currentPrice)} — Total: $${formatPrice(total)}${timeStopActive ? ` | Time-Stop: ${timeStopHours}h` : ""}`,
        });

        try {
          const { telemetry } = await import("@/lib/telemetry");
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

        if (lastTradeTimerRef.current) clearTimeout(lastTradeTimerRef.current);
        lastTradeTimerRef.current = setTimeout(() => setLastTrade(null), 3000);
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
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [isSubmitting, quantity, currentPrice, selectedSymbol, cleanSym, tradingMode, toast, isMaxSell, availableHoldingQty, marginMode, leverage, timeStopActive, timeStopHours, tradePrefill]);

  // Fetch AI SL/TP suggestions com AbortController contra race conditions
  const fetchSLTP = useCallback(async () => {
    const currentTicker = useCryptoStore.getState().tickers[selectedSymbol];
    if (!currentTicker || currentTicker.price <= 0) return;

    if (sltpAbortRef.current) {
      sltpAbortRef.current.abort();
    }
    const controller = new AbortController();
    sltpAbortRef.current = controller;

    setSltpLoading(true);
    try {
      const res = await fetch("/api/ai/sltp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          symbol: selectedSymbol,
          price: currentTicker.price,
          high24h: currentTicker.high,
          low24h: currentTicker.low,
          volume: currentTicker.quoteVolume,
          priceChange24h: currentTicker.priceChangePercent,
        }),
      });
      if (res.ok && !controller.signal.aborted) {
        const result = await res.json();
        if (result.success && result.data) {
          setSltpData(result.data);
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        // Silently ignore network errors on background AI suggestion
      }
    } finally {
      if (!controller.signal.aborted) {
        setSltpLoading(false);
      }
    }
  }, [selectedSymbol]);

  useEffect(() => {
    fetchSLTP();
  }, [fetchSLTP]);

  return (
    <Card className="bg-card border border-border/50 shadow-sm">
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
              <span className="text-lg font-bold font-mono tabular-nums number-animate">
                ${formatPrice(currentPrice)}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">{selectedSymbol}</span>
            <span className={cn(
              "text-xs font-mono tabular-nums font-medium",
              isPositive ? "text-crypto-green" : "text-crypto-red"
            )}>
              {ticker ? `${isPositive ? "+" : ""}${ticker.priceChangePercent.toFixed(2)}%` : ""}
            </span>
          </div>
        </div>

        {/* Banner de Setup Pré-Carregado do Estúdio Quant */}
        {tradePrefill && (tradePrefill.symbol === selectedSymbol || stripQuoteAsset(tradePrefill.symbol) === cleanSym) && (() => {
          const isPrefillFast = tradePrefill.horizon === "RAPIDO";
          const slDistancePct = tradePrefill.entryPrice && tradePrefill.stopLoss
            ? Math.abs(((tradePrefill.stopLoss - tradePrefill.entryPrice) / tradePrefill.entryPrice) * 100).toFixed(1)
            : "1.2";

          return (
            <div className="mb-3 p-3 rounded-xl border border-cyan-500/40 bg-gradient-to-r from-cyan-950/40 via-card/80 to-cyan-950/20 backdrop-blur-md shadow-lg shadow-cyan-950/20 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${tradePrefill.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    <Zap className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs text-foreground">Setup Estúdio Quant</span>
                      <Badge
                        className={`${
                          tradePrefill.side === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        } text-[10px] font-bold px-2 py-0`}
                      >
                        {tradePrefill.side === 'BUY' ? 'ORDEM COMPRA (LONG)' : 'ORDEM VENDA (SHORT)'}
                      </Badge>
                      {tradePrefill.horizon && (
                        <Badge
                          className={cn(
                            "text-[10px] font-bold px-2 py-0",
                            isPrefillFast
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                              : "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                          )}
                        >
                          {isPrefillFast ? "⚡ Day/Scalp (Rápida)" : "🏛️ Médio/Longo Prazo"}
                        </Badge>
                      )}
                      {tradePrefill.winProbability && (
                        <span className="text-[10px] text-emerald-400 font-mono">
                          {tradePrefill.winProbability}% Prob.
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono">
                      <span>Entrada: <strong className="text-foreground">${tradePrefill.entryPrice || formatPrice(currentPrice)}</strong></span>
                      <span>•</span>
                      <span>Alvo: <strong className="text-emerald-400">${tradePrefill.takeProfit || tradePrefill.tp1}</strong></span>
                      <span>•</span>
                      <span>Stop: <strong className="text-rose-400">${tradePrefill.stopLoss}</strong></span>
                      {tradePrefill.riskReward && (
                        <>
                          <span>•</span>
                          <span className="text-cyan-300 font-bold">R:R {tradePrefill.riskReward}:1</span>
                        </>
                      )}
                    </div>

                    {/* Racional de Risco e Alavancagem Proporcional ao Horizonte */}
                    <div className="pt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                      {isPrefillFast ? (
                        <div className="flex items-center gap-1.5 text-amber-300/90 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded-md">
                          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>Stop curto (~{slDistancePct}%): Alocação dinâmica calculada com Margem Isolada e trava Time-Stop de 4h.</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-emerald-300/90 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                          <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span>Operação estritamente em Spot 1x para eliminar risco de liquidação em caudas de volatilidade (wicking).</span>
                        </div>
                      )}
                    </div>

                    {tradePrefill.source && (
                      <div className="text-[10px] text-cyan-400/80 flex items-center gap-1 pt-0.5">
                        <span>Fonte: {tradePrefill.source}</span>
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => clearTradePrefill()}
                  className="text-[11px] text-muted-foreground hover:text-foreground h-6 px-2 shrink-0"
                  title="Limpar configuração automática"
                >
                  Limpar
                </Button>
              </div>
            </div>
          );
        })()}

        {/* Gerenciador de Margem e Alavancagem Proporcional ao Horizonte */}
        <div className="mb-3 p-2.5 rounded-xl border border-border/60 bg-secondary/30 backdrop-blur-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-bold text-foreground">Gerenciador de Margem & Alavancagem</span>
            </div>
            {tradePrefill?.horizon ? (
              <Badge variant="outline" className={cn(
                "text-[9px] font-semibold",
                tradePrefill.horizon === "RAPIDO" ? "border-amber-500/50 text-amber-400 bg-amber-500/10" : "border-indigo-500/50 text-indigo-400 bg-indigo-500/10"
              )}>
                {tradePrefill.horizon === "RAPIDO" ? "⚡ Day/Scalp" : "🏛️ Médio/Longo"}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[9px] text-muted-foreground border-border/50">
                Padrão
              </Badge>
            )}
          </div>

          {/* Modo de Margem: Spot vs Isolada vs Cruzada */}
          <div className="grid grid-cols-3 gap-1 p-0.5 bg-background/80 rounded-lg border border-border/40">
            <button
              type="button"
              onClick={() => {
                setMarginMode("SPOT");
                setLeverage(1);
              }}
              className={cn(
                "py-1 text-[11px] font-bold rounded-md transition-all flex items-center justify-center gap-1",
                marginMode === "SPOT"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ShieldCheck className="w-3 h-3" />
              Spot (1x)
            </button>
            <button
              type="button"
              disabled={tradePrefill?.horizon === "MEDIO_LONGO"}
              onClick={() => {
                if (tradePrefill?.horizon === "MEDIO_LONGO") return;
                setMarginMode("ISOLATED");
                if (leverage === 1) setLeverage(2);
              }}
              title={tradePrefill?.horizon === "MEDIO_LONGO" ? "Médio/Longo Prazo exige Spot para proteção contra liquidação" : "Margem Isolada"}
              className={cn(
                "py-1 text-[11px] font-bold rounded-md transition-all flex items-center justify-center gap-1",
                tradePrefill?.horizon === "MEDIO_LONGO"
                  ? "opacity-40 cursor-not-allowed text-muted-foreground"
                  : marginMode === "ISOLATED"
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tradePrefill?.horizon === "MEDIO_LONGO" ? <Lock className="w-3 h-3" /> : <Shield className="w-3 h-3 text-cyan-400" />}
              Isolada
            </button>
            <button
              type="button"
              disabled={tradePrefill?.horizon === "MEDIO_LONGO"}
              onClick={() => {
                if (tradePrefill?.horizon === "MEDIO_LONGO") return;
                setMarginMode("CROSS");
                if (leverage === 1) setLeverage(2);
              }}
              title={tradePrefill?.horizon === "MEDIO_LONGO" ? "Médio/Longo Prazo exige Spot para proteção contra liquidação" : "Margem Cruzada"}
              className={cn(
                "py-1 text-[11px] font-bold rounded-md transition-all flex items-center justify-center gap-1",
                tradePrefill?.horizon === "MEDIO_LONGO"
                  ? "opacity-40 cursor-not-allowed text-muted-foreground"
                  : marginMode === "CROSS"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tradePrefill?.horizon === "MEDIO_LONGO" ? <Lock className="w-3 h-3" /> : <Layers className="w-3 h-3 text-purple-400" />}
              Cruzada
            </button>
          </div>

          {/* Alavancagem e Trava Time-Stop */}
          {tradePrefill?.horizon === "MEDIO_LONGO" ? (
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-[10px] text-emerald-300">
              <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                <strong>Spot 1x Mandatório</strong>: Proteção institucional ativada para impedir liquidações em caudas de volatilidade (wicking de mercado).
              </span>
            </div>
          ) : (
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground flex items-center gap-1">
                  Alavancagem:
                  <strong className="text-foreground font-mono">{leverage}x</strong>
                </span>
                {/* Seletor rápido de Alavancagem */}
                <div className="flex items-center gap-1">
                  {[1, 2, 3].map((lvl) => (
                    <Button
                      key={lvl}
                      type="button"
                      variant={leverage === lvl ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setLeverage(lvl);
                        if (lvl === 1) setMarginMode("SPOT");
                        else if (marginMode === "SPOT") setMarginMode("ISOLATED");
                      }}
                      className={cn(
                        "h-5 text-[10px] px-2",
                        leverage === lvl ? "bg-cyan-600 hover:bg-cyan-700 text-white" : "border-border/60"
                      )}
                    >
                      {lvl}x
                    </Button>
                  ))}
                </div>
              </div>

              {/* Trava Automática de Tempo (Time-Stop) para Day/Scalp */}
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-secondary/50 border border-border/50 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <Timer className={cn("w-3.5 h-3.5 shrink-0", timeStopActive ? "text-amber-400" : "text-muted-foreground")} />
                  <div>
                    <span className="font-semibold text-foreground">Trava Automática de Tempo (Time-Stop)</span>
                    <p className="text-muted-foreground text-[9px]">Cancela/desarma a ordem se não evoluir em 4 horas</p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={timeStopActive ? "default" : "outline"}
                  onClick={() => {
                    setTimeStopActive(!timeStopActive);
                    if (!timeStopActive && timeStopHours === 0) setTimeStopHours(4);
                  }}
                  className={cn(
                    "h-6 text-[10px] px-2 font-bold shrink-0",
                    timeStopActive ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30" : "text-muted-foreground"
                  )}
                >
                  {timeStopActive ? "4h ATIVO" : "INATIVO"}
                </Button>
              </div>

              {leverage > 1 && parseFloat(usdtAmount || "0") > 0 && (
                <div className="text-[10px] text-cyan-300/90 font-mono flex items-center justify-between px-1">
                  <span>Poder Efetivo de Compra:</span>
                  <strong>${(parseFloat(usdtAmount || "0") * leverage).toFixed(2)} USDT ({leverage}x alavancado)</strong>
                </div>
              )}
            </div>
          )}
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
                  disabled={isSubmitting || !quantity || parseFloat(quantity) <= 0}
                  className="w-full bg-crypto-green hover:bg-crypto-green/90 text-white font-bold h-10 gap-1.5 touch-target shadow-sm"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>Processando Ordem...</span>
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-4 h-4" />
                      <span>Comprar {cleanSym} {usdtAmount && parseFloat(usdtAmount) > 0 ? `(~$${parseFloat(usdtAmount).toFixed(2)})` : ""}</span>
                    </>
                  )}
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
                  disabled={isSubmitting || !quantity || parseFloat(quantity) <= 0}
                  className="w-full bg-crypto-red hover:bg-crypto-red/90 text-white font-bold h-10 gap-1.5 touch-target shadow-sm"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>Processando Ordem...</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-4 h-4" />
                      <span>
                        {isMaxSell
                          ? `Vender Tudo (${quantity} ${cleanSym})`
                          : `Vender ${cleanSym} ${usdtAmount && parseFloat(usdtAmount) > 0 ? `(~$${parseFloat(usdtAmount).toFixed(2)})` : ""}`}
                      </span>
                    </>
                  )}
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
                  disabled={isSubmitting || !triggerPrice || !scheduledQty || parseFloat(scheduledQty) <= 0 || parseFloat(triggerPrice) <= 0}
                  size="sm"
                  className="w-full bg-crypto-green hover:bg-crypto-green/90 text-white font-semibold text-xs h-9 shadow-sm"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    "Programar Compra"
                  )}
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
                  disabled={isSubmitting || !triggerPrice || !scheduledQty || parseFloat(scheduledQty) <= 0 || parseFloat(triggerPrice) <= 0}
                  size="sm"
                  className="w-full bg-crypto-red hover:bg-crypto-red/90 text-white font-semibold text-xs h-9 shadow-sm"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    `Programar Venda ${scheduledIsMaxSell ? "(Tudo)" : ""}`
                  )}
                </Button>
              </div>
            )}

            {/* Scheduled Orders List */}
            <div className="space-y-1.5 pt-2">
              <span className="text-[10px] font-semibold text-muted-foreground block">Agendamentos Ativos</span>
              <ScrollArea className="h-[120px] w-full border border-border/30 rounded-lg p-2 bg-secondary/10">
                <div className="space-y-1.5">
                  {activeScheduledOrders.map((order) => (
                    <div key={order.id} className="flex items-center justify-between bg-card/40 border border-border/20 rounded px-2 py-1.5 text-[10px]">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1">
                          <Badge variant={order.side === "BUY" ? "default" : "secondary"} className={cn(
                            "text-[8px] px-1 py-0 h-4 border-none",
                            order.side === "BUY" ? "bg-crypto-green/10 text-crypto-green" : "bg-crypto-red/10 text-crypto-red"
                          )}>
                            {order.side === "BUY" ? "COMPRA" : "VENDA"}
                          </Badge>
                          <span className="font-mono tabular-nums text-muted-foreground text-[9px]">{stripQuoteAsset(order.symbol)}</span>
                        </div>
                        <span className="text-muted-foreground block font-mono tabular-nums">
                          Gatilho: {order.direction === "above" ? "≥" : "≤"} ${formatPrice(order.triggerPrice)}
                        </span>
                        <span className="text-muted-foreground block font-mono tabular-nums text-[9px]">Qtd: {order.quantity}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Excluir ordem programada de ${stripQuoteAsset(order.symbol)}`}
                        className="h-5 w-5 text-muted-foreground hover:text-crypto-red hover:bg-crypto-red/10"
                        onClick={() => removeScheduledOrder(order.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  {activeScheduledOrders.length === 0 && (
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
              <span className="text-xs font-medium font-mono tabular-nums">
                {lastTrade.side} {lastTrade.qty} {cleanSym} @ ${formatPrice(lastTrade.price)}
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
              aria-label="Atualizar SL e TP sugeridos pela IA"
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
