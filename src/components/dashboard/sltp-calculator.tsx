"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Target,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldAlert,
  ShieldCheck,
  BarChart3,
  Layers,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface SLTPData {
  symbol: string;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  slPercent: number;
  tpPercent: number;
  riskRewardRatio: number;
  atr: number;
  support: number;
  resistance: number;
  rsi: number;
  bollingerLower: number;
  bollingerUpper: number;
  recommendation: "COMPRA" | "VENDA" | "NEUTRO";
  reasoning: string;
}

export function SLTPCalculator() {
  const { selectedSymbol, tickers } = useCryptoStore();
  const [data, setData] = useState<SLTPData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ticker = tickers[selectedSymbol];
  const currentPrice = ticker?.price ?? 0;

  const fetchSLTP = useCallback(async (showRefresh = false) => {
    if (!ticker) return;
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/sltp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selectedSymbol,
          price: ticker.price,
          high24h: ticker.high,
          low24h: ticker.low,
          volume: ticker.quoteVolume,
          priceChange24h: ticker.priceChangePercent,
        }),
      });

      if (!res.ok) throw new Error("Falha ao buscar dados");

      const result = await res.json();
      if (result.success && result.data) {
        setData(result.data);
      } else {
        throw new Error(result.error || "Erro desconhecido");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao calcular SL/TP");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedSymbol, ticker]);

  // Fetch on mount and when symbol changes
  useEffect(() => {
    fetchSLTP();

    // Auto-refresh every 60s
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchSLTP(true), 60000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchSLTP]);

  const getRecommendationStyle = (rec: SLTPData["recommendation"]) => {
    switch (rec) {
      case "COMPRA":
        return "bg-crypto-green/15 text-crypto-green border-crypto-green/30";
      case "VENDA":
        return "bg-crypto-red/15 text-crypto-red border-crypto-red/30";
      case "NEUTRO":
        return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    }
  };

  const getRecommendationIcon = (rec: SLTPData["recommendation"]) => {
    switch (rec) {
      case "COMPRA":
        return <TrendingUp className="w-3.5 h-3.5" />;
      case "VENDA":
        return <TrendingDown className="w-3.5 h-3.5" />;
      case "NEUTRO":
        return <Minus className="w-3.5 h-3.5" />;
    }
  };

  // Price level bar visualization
  const renderPriceLevelBar = () => {
    if (!data) return null;

    const allPrices = [data.stopLoss, data.support, data.currentPrice, data.resistance, data.takeProfit];
    const minPrice = Math.min(...allPrices) * 0.998;
    const maxPrice = Math.max(...allPrices) * 1.002;
    const range = maxPrice - minPrice || 1;

    const getPercent = (price: number) => ((price - minPrice) / range) * 100;

    return (
      <div className="relative h-32 mt-2 mb-1">
        {/* Background bar */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-secondary/50 overflow-hidden">
          {/* SL zone (red) */}
          <div
            className="absolute top-0 h-full bg-crypto-red/30 rounded-l-full"
            style={{ left: 0, width: `${getPercent(data.currentPrice)}%` }}
          />
          {/* TP zone (green) */}
          <div
            className="absolute top-0 h-full bg-crypto-green/30 rounded-r-full"
            style={{ left: `${getPercent(data.currentPrice)}%`, right: 0 }}
          />
        </div>

        {/* Level markers */}
        {/* Stop Loss */}
        <div
          className="absolute flex flex-col items-center"
          style={{ left: `${getPercent(data.stopLoss)}%`, top: 0, transform: "translateX(-50%)" }}
        >
          <div className="w-0.5 h-8 bg-crypto-red" />
          <div className="bg-crypto-red/10 border border-crypto-red/30 rounded px-1.5 py-0.5 mt-0.5">
            <span className="text-[9px] font-mono text-crypto-red font-medium">
              SL ${formatPrice(data.stopLoss)}
            </span>
          </div>
        </div>

        {/* Support */}
        {data.support !== data.stopLoss && (
          <div
            className="absolute flex flex-col items-center"
            style={{ left: `${getPercent(data.support)}%`, top: "55%", transform: "translateX(-50%)" }}
          >
            <div className="w-0.5 h-3 bg-amber-400/60" />
            <span className="text-[8px] text-amber-400/80 font-mono mt-0.5">
              S ${formatPrice(data.support)}
            </span>
          </div>
        )}

        {/* Current Price (center marker) */}
        <div
          className="absolute flex flex-col items-center z-10"
          style={{ left: `${getPercent(data.currentPrice)}%`, top: "-5%", transform: "translateX(-50%)" }}
        >
          <div className="bg-crypto-cyan/10 border border-crypto-cyan/40 rounded px-2 py-0.5 mb-0.5">
            <span className="text-[9px] font-mono text-crypto-cyan font-bold">
              ${formatPrice(data.currentPrice)}
            </span>
          </div>
          <div className="w-0.5 h-10 bg-crypto-cyan" />
        </div>

        {/* Resistance */}
        {data.resistance !== data.takeProfit && (
          <div
            className="absolute flex flex-col items-center"
            style={{ left: `${getPercent(data.resistance)}%`, top: "55%", transform: "translateX(-50%)" }}
          >
            <div className="w-0.5 h-3 bg-amber-400/60" />
            <span className="text-[8px] text-amber-400/80 font-mono mt-0.5">
              R ${formatPrice(data.resistance)}
            </span>
          </div>
        )}

        {/* Take Profit */}
        <div
          className="absolute flex flex-col items-center"
          style={{ left: `${getPercent(data.takeProfit)}%`, top: 0, transform: "translateX(-50%)" }}
        >
          <div className="w-0.5 h-8 bg-crypto-green" />
          <div className="bg-crypto-green/10 border border-crypto-green/30 rounded px-1.5 py-0.5 mt-0.5">
            <span className="text-[9px] font-mono text-crypto-green font-medium">
              TP ${formatPrice(data.takeProfit)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // R:R ratio bar
  const renderRRBar = () => {
    if (!data) return null;
    const total = data.riskRewardRatio + 1;
    const riskPct = (1 / total) * 100;
    const rewardPct = (data.riskRewardRatio / total) * 100;
    const isGood = data.riskRewardRatio >= 2;

    return (
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-crypto-red font-medium">Risco (1)</span>
          <span className={cn(
            "text-[10px] font-bold",
            isGood ? "text-crypto-green" : "text-amber-400"
          )}>
            R:R 1:{data.riskRewardRatio.toFixed(1)}
            {isGood ? " ✓" : " ⚠"}
          </span>
          <span className="text-[10px] text-crypto-green font-medium">Recompensa ({data.riskRewardRatio.toFixed(1)})</span>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-secondary/50">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${riskPct}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="bg-crypto-red/60"
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${rewardPct}%` }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            className="bg-crypto-green/60"
          />
        </div>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="glass-card card-accent-cyan">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="w-4 h-4 text-crypto-cyan" />
              Calculadora de SL/TP por IA
              <Badge variant="outline" className="text-[10px] border-crypto-cyan/30 text-crypto-cyan ml-1">
                {selectedSymbol.replace("USDT", "")}
              </Badge>
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-crypto-cyan"
              onClick={() => fetchSLTP(true)}
              disabled={refreshing}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <div className="flex justify-center gap-8">
                <Skeleton className="h-16 w-28 rounded-lg" />
                <Skeleton className="h-16 w-28 rounded-lg" />
              </div>
              <Skeleton className="h-20 w-full rounded-lg" />
              <div className="flex gap-3">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-6 text-muted-foreground">
              <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-xs"
                onClick={() => fetchSLTP()}
              >
                Tentar Novamente
              </Button>
            </div>
          ) : data ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${selectedSymbol}-${data.stopLoss}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {/* Recommendation Badge */}
                <div className="flex items-center justify-center gap-2">
                  <Badge className={cn("text-xs font-bold px-3 py-1 border", getRecommendationStyle(data.recommendation))}>
                    {getRecommendationIcon(data.recommendation)}
                    <span className="ml-1">{data.recommendation}</span>
                  </Badge>
                  {data.riskRewardRatio >= 2 && (
                    <Badge className="text-[10px] bg-crypto-green/10 text-crypto-green border-crypto-green/30 gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Boa entrada
                    </Badge>
                  )}
                </div>

                {/* SL / TP Values */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-crypto-red/5 border border-crypto-red/20 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-crypto-red" />
                      <span className="text-[10px] text-crypto-red font-semibold uppercase tracking-wider">Stop Loss</span>
                    </div>
                    <p className="text-lg font-bold font-mono text-crypto-red number-animate">
                      ${formatPrice(data.stopLoss)}
                    </p>
                    <p className="text-[10px] text-crypto-red/70 font-mono">
                      {data.slPercent.toFixed(1)}% abaixo
                    </p>
                  </div>
                  <div className="bg-crypto-green/5 border border-crypto-green/20 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-crypto-green" />
                      <span className="text-[10px] text-crypto-green font-semibold uppercase tracking-wider">Take Profit</span>
                    </div>
                    <p className="text-lg font-bold font-mono text-crypto-green number-animate">
                      ${formatPrice(data.takeProfit)}
                    </p>
                    <p className="text-[10px] text-crypto-green/70 font-mono">
                      +{data.tpPercent.toFixed(1)}% acima
                    </p>
                  </div>
                </div>

                {/* Price Level Visualization */}
                {renderPriceLevelBar()}

                {/* Risk/Reward Bar */}
                {renderRRBar()}

                {/* Technical Metrics */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="bg-secondary/30 rounded-lg p-2 text-center">
                    <Activity className="w-3 h-3 mx-auto mb-0.5 text-crypto-cyan" />
                    <p className="text-[9px] text-muted-foreground">ATR(14)</p>
                    <p className="text-xs font-mono font-bold">${formatPrice(data.atr)}</p>
                  </div>
                  <div className="bg-secondary/30 rounded-lg p-2 text-center">
                    <Layers className="w-3 h-3 mx-auto mb-0.5 text-amber-400" />
                    <p className="text-[9px] text-muted-foreground">Suporte</p>
                    <p className="text-xs font-mono font-bold">${formatPrice(data.support)}</p>
                  </div>
                  <div className="bg-secondary/30 rounded-lg p-2 text-center">
                    <BarChart3 className="w-3 h-3 mx-auto mb-0.5 text-amber-400" />
                    <p className="text-[9px] text-muted-foreground">Resistência</p>
                    <p className="text-xs font-mono font-bold">${formatPrice(data.resistance)}</p>
                  </div>
                </div>

                {/* Extra indicators row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-secondary/20 rounded-lg p-1.5 text-center">
                    <p className="text-[8px] text-muted-foreground">RSI(14)</p>
                    <p className={cn(
                      "text-[11px] font-mono font-bold",
                      data.rsi > 70 ? "text-crypto-red" : data.rsi < 30 ? "text-crypto-green" : "text-crypto-cyan"
                    )}>
                      {data.rsi.toFixed(1)}
                    </p>
                  </div>
                  <div className="bg-secondary/20 rounded-lg p-1.5 text-center">
                    <p className="text-[8px] text-muted-foreground">BB Inferior</p>
                    <p className="text-[11px] font-mono font-bold">${formatPrice(data.bollingerLower)}</p>
                  </div>
                  <div className="bg-secondary/20 rounded-lg p-1.5 text-center">
                    <p className="text-[8px] text-muted-foreground">BB Superior</p>
                    <p className="text-[11px] font-mono font-bold">${formatPrice(data.bollingerUpper)}</p>
                  </div>
                </div>

                {/* AI Reasoning */}
                {data.reasoning && (
                  <div className="bg-crypto-cyan/5 border border-crypto-cyan/15 rounded-lg p-2.5 mt-1">
                    <div className="flex items-start gap-1.5">
                      <Target className="w-3 h-3 text-crypto-cyan mt-0.5 shrink-0" />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {data.reasoning}
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}
