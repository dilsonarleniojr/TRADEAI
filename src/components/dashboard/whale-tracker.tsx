"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";
import { Fish, RefreshCw, TrendingUp, TrendingDown, Trophy, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatVolume } from "@/lib/format";
import { CRYPTO_COLORS } from "@/lib/crypto-meta";

interface WhaleTransaction {
  id: string;
  symbol: string;
  rawSymbol: string;
  side: "BUY" | "SELL";
  price: number;
  amountUSD: number;
  amountCoin: number;
  timestamp: number;
}

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${Math.max(1, diff)}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

export function WhaleTracker() {
  const [transactions, setTransactions] = useState<WhaleTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchRealWhales = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/api/market/whale-trades");
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setTransactions(json.data);
          setLastUpdated(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        }
      }
    } catch (err) {
      console.warn("[WhaleTracker] Erro ao sincronizar ordens institucionais:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRealWhales();
    const interval = setInterval(fetchRealWhales, 10000);
    return () => clearInterval(interval);
  }, [fetchRealWhales]);

  // Real Summary stats calculated from actual live trades
  const totalVolume = useMemo(
    () => transactions.reduce((sum, t) => sum + t.amountUSD, 0),
    [transactions]
  );

  const buyVolume = useMemo(
    () => transactions.filter((t) => t.side === "BUY").reduce((sum, t) => sum + t.amountUSD, 0),
    [transactions]
  );

  const buyRatio = useMemo(() => {
    if (totalVolume === 0) return 0.5;
    return buyVolume / totalVolume;
  }, [totalVolume, buyVolume]);

  const largestTx = useMemo(
    () => transactions.reduce((max, t) => (t.amountUSD > max ? t.amountUSD : max), 0),
    [transactions]
  );

  // Volume by symbol from real trades
  const volumeBySymbol = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of transactions) {
      map[t.symbol] = (map[t.symbol] || 0) + t.amountUSD;
    }
    return Object.entries(map)
      .map(([symbol, volume]) => ({ symbol, volume }))
      .sort((a, b) => b.volume - a.volume);
  }, [transactions]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
      className="space-y-4"
    >
      {/* Header com indicador de dados 100% reais */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-crypto-gold/10 text-crypto-gold">
            <Fish className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              Rastreador de Grandes Ordens (Whales)
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Binance Spot Real
              </span>
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Grandes ordens a mercado executadas (&gt; $10k USD) · Atualizado: {lastUpdated || "agora"}
            </p>
          </div>
        </div>
        <button
          onClick={fetchRealWhales}
          disabled={refreshing}
          className="p-1.5 rounded-md hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          title="Atualizar dados reais da Binance"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
        </button>
      </div>

      {/* Summary Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total Whale Volume */}
        <Card className="glass-card card-accent-gold">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-md bg-crypto-gold/10">
                <Fish className="w-3.5 h-3.5 text-crypto-gold" />
              </div>
              <span className="text-xs text-muted-foreground">Volume de Grandes Ordens</span>
            </div>
            <span className="text-lg font-bold gradient-text-gold number-animate">
              {formatVolume(totalVolume)}
            </span>
          </CardContent>
        </Card>

        {/* Buy/Sell Ratio */}
        <Card className="glass-card card-accent-gold">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-md bg-crypto-gold/10">
                <TrendingUp className="w-3.5 h-3.5 text-crypto-gold" />
              </div>
              <span className="text-xs text-muted-foreground">Pressão Institucional (Compra / Venda)</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-crypto-green font-semibold">{(buyRatio * 100).toFixed(0)}%</span>
              <div className="flex-1 h-2.5 bg-crypto-red/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-crypto-green to-crypto-green/80 rounded-full transition-all duration-700"
                  style={{ width: `${buyRatio * 100}%` }}
                />
              </div>
              <span className="text-xs text-crypto-red font-semibold">{((1 - buyRatio) * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-crypto-green">BUY (${formatVolume(buyVolume)})</span>
              <span className="text-[10px] text-crypto-red">SELL (${formatVolume(totalVolume - buyVolume)})</span>
            </div>
          </CardContent>
        </Card>

        {/* Largest Transaction */}
        <Card className="glass-card card-accent-gold">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-md bg-crypto-gold/10">
                <Trophy className="w-3.5 h-3.5 text-crypto-gold" />
              </div>
              <span className="text-xs text-muted-foreground">Maior Ordem Individual</span>
            </div>
            <span className="text-lg font-bold gradient-text-gold number-animate">
              {formatVolume(largestTx)}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Feed + Volume Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: Transaction Feed (3 cols) */}
        <Card className="glass-card lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Fluxo Recente de Execução em Tempo Real</span>
              <span className="text-xs text-muted-foreground font-normal">
                {transactions.length} ordens detectadas
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                <Activity className="w-5 h-5 mx-auto mb-2 animate-spin text-crypto-gold" />
                Carregando execuções reais da Binance...
              </div>
            ) : transactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Nenhuma ordem institucional &gt; $10k detectada nos últimos minutos.
              </div>
            ) : (
              <div className="divide-y divide-border/30 max-h-[380px] overflow-y-auto custom-scrollbar">
                <AnimatePresence initial={false}>
                  {transactions.map((tx) => {
                    const isBuy = tx.side === "BUY";
                    return (
                      <motion.div
                        key={tx.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-center justify-between px-4 py-2.5 hover:bg-secondary/20 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "text-[10px] font-bold px-1.5 py-0.5 rounded",
                              isBuy
                                ? "bg-crypto-green/10 text-crypto-green border border-crypto-green/30"
                                : "bg-crypto-red/10 text-crypto-red border border-crypto-red/30"
                            )}
                          >
                            {tx.side}
                          </span>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-foreground">
                                {tx.symbol}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                @ ${tx.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {tx.amountCoin.toFixed(4)} {tx.symbol} · {relativeTime(tx.timestamp)}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={cn(
                              "text-xs font-bold number-animate",
                              isBuy ? "text-crypto-green" : "text-crypto-red"
                            )}
                          >
                            {formatVolume(tx.amountUSD)}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Volume by Symbol Chart (2 cols) */}
        <Card className="glass-card lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Concentração por Ativo (USD)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {volumeBySymbol.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={volumeBySymbol} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="symbol"
                    type="category"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={45}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "rgba(15, 23, 42, 0.95)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(val: number) => [formatVolume(val), "Volume"]}
                  />
                  <Bar dataKey="volume" radius={[0, 4, 4, 0]}>
                    {volumeBySymbol.map((entry) => (
                      <Cell
                        key={entry.symbol}
                        fill={CRYPTO_COLORS[`${entry.symbol}USDT`] || "#f59e0b"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground">
                Aguardando dados de volume...
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
