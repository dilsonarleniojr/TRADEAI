"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";
import { Fish, RefreshCw, TrendingUp, TrendingDown, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatVolume } from "@/lib/format";
import { CRYPTO_SHORTS, CRYPTO_COLORS, CRYPTO_BY_SYMBOL } from "@/lib/crypto-meta";

// Seeded random for consistent mock data
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface WhaleTransaction {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  amountUSD: number;
  amountCoin: number;
  timestamp: number;
}

const SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "LINK", "AVAX", "DOGE"];
const SYMBOL_PRICES: Record<string, number> = {
  BTC: 78301, ETH: 2182, SOL: 86.6, BNB: 656,
  XRP: 1.41, LINK: 9.76, AVAX: 9.32, DOGE: 0.109,
};
const SYMBOL_FULL_NAMES: Record<string, string> = {
  BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", BNB: "BNB",
  XRP: "XRP", LINK: "Chainlink", AVAX: "Avalanche", DOGE: "Dogecoin",
};

function generateWhaleTransactions(seed: number): WhaleTransaction[] {
  const rng = seededRandom(seed);
  const txs: WhaleTransaction[] = [];
  const now = Date.now();

  for (let i = 0; i < 15; i++) {
    const symbol = SYMBOLS[Math.floor(rng() * SYMBOLS.length)];
    const side = rng() > 0.45 ? "BUY" : "SELL";
    const amountUSD = 500_000 + rng() * 50_000_000;
    const amountCoin = amountUSD / SYMBOL_PRICES[symbol];
    const minutesAgo = Math.floor(rng() * 1440);

    txs.push({
      id: `w-${seed}-${i}`,
      symbol,
      side,
      amountUSD,
      amountCoin,
      timestamp: now - minutesAgo * 60_000,
    });
  }

  return txs.sort((a, b) => b.timestamp - a.timestamp);
}

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function WhaleTracker() {
  const [seed, setSeed] = useState(42);
  const [refreshing, setRefreshing] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const transactions = useMemo(() => generateWhaleTransactions(seed), [seed]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setSeed((s) => s + 1);
    const newTxIds = new Set(transactions.slice(0, 2).map((t) => `w-${seed + 1}-${t.id.split("-").pop()}`));
    setNewIds(newTxIds);
    setTimeout(() => setRefreshing(false), 600);
    setTimeout(() => setNewIds(new Set()), 2000);
  }, [seed, transactions]);

  useEffect(() => {
    const interval = setInterval(refresh, 8000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Summary stats
  const totalVolume = 2.4e9;
  const buyRatio = 0.55;
  const largestTx = useMemo(
    () => transactions.reduce((max, t) => (t.amountUSD > max ? t.amountUSD : max), 0),
    [transactions]
  );

  // Volume by symbol
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
      {/* Summary Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total Whale Volume */}
        <Card className="glass-card card-accent-gold">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-md bg-crypto-gold/10">
                <Fish className="w-3.5 h-3.5 text-crypto-gold" />
              </div>
              <span className="text-xs text-muted-foreground">Volume de Baleias (24h)</span>
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
              <span className="text-xs text-muted-foreground">Proporção Compra / Venda</span>
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
              <span className="text-[10px] text-crypto-green">BUY</span>
              <span className="text-[10px] text-crypto-red">SELL</span>
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
              <span className="text-xs text-muted-foreground">Maior Tx (24h)</span>
            </div>
            <span className="text-lg font-bold gradient-text-gold number-animate">
              {formatVolume(largestTx)}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Feed + Volume Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Transaction Feed */}
        <Card className="glass-card card-accent-gold lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Fish className="w-4 h-4 text-crypto-gold" />
                Feed de Transações de Baleias
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">Atualização automática</span>
                <RefreshCw className={cn("w-3 h-3 text-crypto-gold", refreshing && "animate-spin")} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto cyan-scrollbar space-y-1.5 pr-1">
              <AnimatePresence mode="popLayout">
                {transactions.map((tx) => {
                  const isBuy = tx.side === "BUY";
                  const isMega = tx.amountUSD >= 5_000_000;
                  const isLarge = tx.amountUSD >= 1_000_000;
                  const isNew = newIds.has(tx.id);

                  return (
                    <motion.div
                      key={tx.id}
                      layout
                      initial={isNew ? { opacity: 0, x: 40 } : { opacity: 1, x: 0 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -40 }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      className={cn(
                        "flex items-center justify-between p-2.5 rounded-lg border transition-all duration-200 hover:scale-[1.01]",
                        isBuy
                          ? "bg-crypto-green/5 border-crypto-green/10"
                          : "bg-crypto-red/5 border-crypto-red/10"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider",
                            isBuy
                              ? "bg-crypto-green/15 text-crypto-green"
                              : "bg-crypto-red/15 text-crypto-red"
                          )}
                        >
                          {tx.side}
                        </div>
                        <span className="text-sm font-semibold whitespace-nowrap">{tx.symbol}</span>
                        <span className="text-[10px] text-muted-foreground">{SYMBOL_FULL_NAMES[tx.symbol] || tx.symbol}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-crypto-gold/15 text-crypto-gold font-medium whitespace-nowrap">
                          Alerta de Baleia
                        </span>
                        {isMega && <span className="text-xs" title="Mega whale ($5M+)">💎</span>}
                        {!isMega && isLarge && <span className="text-xs" title="Large whale ($1M+)">🔥</span>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className={cn(
                            "text-sm font-bold",
                            isBuy ? "text-crypto-green" : "text-crypto-red"
                          )}>
                            {formatVolume(tx.amountUSD)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {tx.amountCoin < 1 ? tx.amountCoin.toFixed(4) : tx.amountCoin.toFixed(2)} {tx.symbol}
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap w-14 text-right">
                          {relativeTime(tx.timestamp)}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </CardContent>
        </Card>

        {/* Volume by Symbol */}
        <Card className="glass-card card-accent-gold lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-crypto-gold" />
              Volume por Símbolo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={volumeBySymbol}
                  layout="vertical"
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatVolume(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="symbol"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)", fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "11px",
                    }}
                    formatter={(value: number) => [formatVolume(value), "Volume"]}
                  />
                  <Bar dataKey="volume" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {volumeBySymbol.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill="#f59e0b"
                        fillOpacity={0.6 + (index * 0.05)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
