"use client";

import { useState, useMemo, useEffect } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatVolume } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Clock, ArrowUpDown, Info } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

interface FundingData {
  symbol: string;
  fundingRate: number;
  openInterest: number;
  lsRatio: number;
}

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];

const SYMBOL_OI: Record<string, number> = {
  BTCUSDT: 18.5,
  ETHUSDT: 12.3,
  SOLUSDT: 5.8,
  BNBUSDT: 4.2,
  XRPUSDT: 3.1,
  DOGEUSDT: 2.4,
};

// Seeded pseudo-random for deterministic funding rates
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateFundingData(tickers: Record<string, import("@/lib/store").TickerData>): FundingData[] {
  const daySeed = Math.floor(Date.now() / (8 * 3600 * 1000)); // changes every 8h

  return SYMBOLS.map((symbol, i) => {
    const ticker = tickers[symbol];
    const seed = daySeed + i * 137;

    // BTC usually near 0.01%, others can range wider
    let fundingRate: number;
    if (symbol === "BTCUSDT") {
      fundingRate = 0.005 + seededRandom(seed) * 0.02; // 0.005 to 0.025
    } else if (symbol === "ETHUSDT") {
      fundingRate = -0.01 + seededRandom(seed + 1) * 0.06; // -0.01 to 0.05
    } else {
      fundingRate = -0.05 + seededRandom(seed + 2) * 0.2; // -0.05 to 0.15
    }

    // Occasionally negative
    if (seededRandom(seed + 10) > 0.7) {
      fundingRate = -fundingRate * 0.3;
    }

    fundingRate = parseFloat(fundingRate.toFixed(4));

    // Open interest proportional to market cap, with slight variation
    const baseOI = SYMBOL_OI[symbol] || 2;
    const oiVariation = 0.9 + seededRandom(seed + 3) * 0.2;
    const openInterest = parseFloat((baseOI * oiVariation).toFixed(2));

    // L/S Ratio between 0.8 and 1.5
    const lsRatio = parseFloat((0.8 + seededRandom(seed + 4) * 0.7).toFixed(2));

    return {
      symbol,
      fundingRate,
      openInterest,
      lsRatio,
    };
  });
}

function FundingCountdown() {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    function updateCountdown() {
      const now = new Date();
      const utcH = now.getUTCHours();
      // Funding at 00:00, 08:00, 16:00 UTC
      const periods = [0, 8, 16];
      let nextPeriod = periods.find((h) => h > utcH);
      if (nextPeriod === undefined) nextPeriod = 24; // next day 00:00

      const nextFunding = new Date(now);
      nextFunding.setUTCHours(nextPeriod, 0, 0, 0);
      if (nextPeriod === 24) {
        nextFunding.setUTCDate(nextFunding.getUTCDate() + 1);
        nextFunding.setUTCHours(0, 0, 0, 0);
      }

      const diff = nextFunding.getTime() - now.getTime();
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="w-3.5 h-3.5 text-crypto-gold" />
      <span className="font-mono">{timeLeft}</span>
    </div>
  );
}

type SortField = "fundingRate" | "openInterest" | "lsRatio";
type SortDir = "asc" | "desc";

export function FundingRates() {
  const { tickers } = useCryptoStore(
  useShallow((s) => ({ tickers: s.tickers }))
);
  const [sortField, setSortField] = useState<SortField>("fundingRate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rawData = useMemo(() => generateFundingData(tickers), [tickers]);

  const sortedData = useMemo(() => {
    return [...rawData].sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      return (a[sortField] - b[sortField]) * mul;
    });
  }, [rawData, sortField, sortDir]);

  const maxOI = useMemo(() => Math.max(...rawData.map((d) => d.openInterest)), [rawData]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <Card className="glass-card card-accent-gold h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Flame className="w-4 h-4 text-crypto-gold" />
              Taxas de Financiamento &amp; Open Interest
            </CardTitle>
            <FundingCountdown />
          </div>
        </CardHeader>
        <CardContent>
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1fr_1fr_0.8fr] gap-2 mb-2 pb-2 border-b border-border/30">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Symbol</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => handleSort("fundingRate")} className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                  Funding <ArrowUpDown className="w-2.5 h-2.5" />
                  <Info className="w-2.5 h-2.5 opacity-40" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4} className="max-w-[220px]">
                <p className="text-xs leading-relaxed">Taxa de financiamento de futuros perpétuos. Positiva = longs pagam shorts, Negativa = shorts pagam longs</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => handleSort("openInterest")} className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                  OI <ArrowUpDown className="w-2.5 h-2.5" />
                  <Info className="w-2.5 h-2.5 opacity-40" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4} className="max-w-[220px]">
                <p className="text-xs leading-relaxed">Open Interest - valor total de contratos derivativos em aberto</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => handleSort("lsRatio")} className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                  L/S <ArrowUpDown className="w-2.5 h-2.5" />
                  <Info className="w-2.5 h-2.5 opacity-40" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                <p className="text-xs leading-relaxed">Proporção Long/Short mostrando o equilíbrio de posições</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Table rows */}
          <div className="space-y-1.5 max-h-64 overflow-y-auto cyan-scrollbar">
            <AnimatePresence mode="popLayout">
              {sortedData.map((item, i) => {
                const isPositive = item.fundingRate >= 0;
                const symbolName = item.symbol.replace("USDT", "");
                const oiPercent = (item.openInterest / maxOI) * 100;

                return (
                  <motion.div
                    key={item.symbol}
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ delay: i * 0.05, duration: 0.25 }}
                    className="grid grid-cols-[1fr_1fr_1fr_0.8fr] gap-2 items-center py-1.5 px-2 rounded-md hover:bg-secondary/30 transition-colors"
                  >
                    {/* Symbol */}
                    <span className="text-xs font-semibold">{symbolName}</span>

                    {/* Funding Rate */}
                    <span
                      className={`text-xs font-mono font-medium ${
                        isPositive ? "text-crypto-green" : "text-crypto-red"
                      }`}
                    >
                      {isPositive ? "+" : ""}{item.fundingRate.toFixed(4)}%
                    </span>

                    {/* Open Interest bar */}
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-secondary/50 rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${isPositive ? "bg-crypto-green/70" : "bg-crypto-red/70"}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${oiPercent}%` }}
                          transition={{ delay: i * 0.05 + 0.2, duration: 0.5 }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                        {formatVolume(item.openInterest * 1e9)}
                      </span>
                    </div>

                    {/* L/S Ratio */}
                    <div className="flex items-center gap-1">
                      <span
                        className={`text-[10px] font-mono font-medium ${
                          item.lsRatio > 1 ? "text-crypto-green" : "text-crypto-red"
                        }`}
                      >
                        {item.lsRatio.toFixed(2)}
                      </span>
                      <div className="w-8 h-1 bg-secondary/50 rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${item.lsRatio > 1 ? "bg-crypto-green" : "bg-crypto-red"}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min((item.lsRatio / 1.5) * 100, 100)}%` }}
                          transition={{ delay: i * 0.05 + 0.3, duration: 0.4 }}
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Legend */}
          <div className="mt-3 pt-2 border-t border-border/30 flex items-center gap-4 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-crypto-green" />
              <span>Longs pagam shorts</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-crypto-red" />
              <span>Shorts pagam longs</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
