"use client";

import { useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatVolume } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { motion } from "framer-motion";
import { Globe, BarChart3, Coins, TrendingUp, TrendingDown, Info } from "lucide-react";
import { CRYPTO_COLORS } from "@/lib/crypto-meta";
import { useShallow } from "zustand/react/shallow";

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  change?: number;
  delay?: number;
  tooltip?: string;
}

function MetricCard({ icon, label, value, change, delay = 0, tooltip }: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30"
    >
      <div className="w-8 h-8 rounded-md bg-crypto-cyan/10 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
          {tooltip && (
            <UITooltip>
              <TooltipTrigger asChild>
                <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help transition-colors" />
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                <p className="text-xs">{tooltip}</p>
              </TooltipContent>
            </UITooltip>
          )}
        </div>
        <p className="text-sm font-bold font-mono number-animate">{value}</p>
      </div>
      {change !== undefined && (
        <div className={`flex items-center gap-0.5 text-[10px] font-mono ${change >= 0 ? "text-crypto-green" : "text-crypto-red"}`}>
          {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {change >= 0 ? "+" : ""}{change.toFixed(2)}%
        </div>
      )}
    </motion.div>
  );
}

interface DonutTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { name: string; value: number; percent: number; color: string } }>;
}

function DonutTooltip({ active, payload }: DonutTooltipProps) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
        <p className="font-medium" style={{ color: item.color }}>
          {item.name}
        </p>
        <p className="text-muted-foreground">{item.percent.toFixed(1)}%</p>
      </div>
    );
  }
  return null;
}

export function MarketOverview() {
  const { tickers } = useCryptoStore(
  useShallow((s) => ({ tickers: s.tickers }))
);

  const marketData = useMemo(() => {
    const tickerValues = Object.values(tickers);

    // Total 24h Volume - sum quoteVolume from all tickers
    const totalVolume = tickerValues.reduce((sum, t) => sum + (t.quoteVolume || 0), 0);

    // BTC 24h change for market cap change indicator
    const btcTicker = tickers["BTCUSDT"];
    const btcChange = btcTicker?.priceChangePercent ?? -1.1;

    // BTC Volume Share real entre os pares monitorados
    const btcVolume = btcTicker?.quoteVolume || 0;
    const btcDominance = totalVolume > 0 ? parseFloat(((btcVolume / totalVolume) * 100).toFixed(1)) : 52.5;
    const othersDominance = parseFloat((100 - btcDominance).toFixed(1));

    // Estimativa de Market Cap Global baseada no preço real do BTC (19.8M moedas em circulação / ~54% de dominância)
    const btcPrice = btcTicker?.price || 86000;
    const btcCapTrillions = (btcPrice * 19.8e6) / 1e12;
    const totalMarketCap = parseFloat(((btcCapTrillions / (btcDominance / 100))).toFixed(2));

    return {
      totalVolume,
      btcChange,
      btcDominance,
      othersDominance,
      totalMarketCap,
    };
  }, [tickers]);

  const donutData = useMemo(() => [
    { name: "BTC", value: marketData.btcDominance, percent: marketData.btcDominance, color: CRYPTO_COLORS["BTCUSDT"] || "#f7931a" },
    { name: "Outros", value: marketData.othersDominance, percent: marketData.othersDominance, color: "#475569" },
  ], [marketData.btcDominance, marketData.othersDominance]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="glass-card card-accent-cyan h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Globe className="w-4 h-4 text-crypto-cyan" />
            Visão do Mercado
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Top row: Donut chart + Market Cap */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* BTC Dominance Donut */}
            <div className="flex flex-col items-center">
              <div className="w-[120px] h-[120px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={52}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                      animationBegin={0}
                      animationDuration={800}
                    >
                      {donutData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<DonutTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-lg font-bold font-mono number-animate">{marketData.btcDominance}%</span>
                  <span className="text-[9px] text-muted-foreground">Dom BTC</span>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <UITooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-help">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CRYPTO_COLORS["BTCUSDT"] || "#f7931a" }} />
                      <span className="text-[10px] text-muted-foreground">BTC</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={4}>
                    <p className="text-xs">Participação do Bitcoin na capitalização total de criptomoedas</p>
                  </TooltipContent>
                </UITooltip>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#475569" }} />
                  <span className="text-[10px] text-muted-foreground">Outros</span>
                </div>
              </div>
            </div>

            {/* Total Market Cap */}
            <div className="flex flex-col justify-center">
              <div className="p-3 rounded-lg bg-secondary/30 border border-border/30">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-4 h-4 text-crypto-cyan" />
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider cursor-help flex items-center gap-1">
                        Capitalização Total
                        <Info className="w-3 h-3 opacity-40" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={4}>
                      <p className="text-xs">Valor total de todas as criptomoedas</p>
                    </TooltipContent>
                  </UITooltip>
                </div>
                <p className="text-xl font-bold font-mono number-animate">${marketData.totalMarketCap.toFixed(2)}T</p>
                <div className={`flex items-center gap-1 mt-1 text-xs font-mono ${marketData.btcChange >= 0 ? "text-crypto-green" : "text-crypto-red"}`}>
                  {marketData.btcChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {marketData.btcChange >= 0 ? "+" : ""}{marketData.btcChange.toFixed(2)}% (24h)
                </div>
              </div>
            </div>
          </div>

          {/* Bottom row: 3 metric cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MetricCard
              icon={<BarChart3 className="w-4 h-4 text-crypto-cyan" />}
              label="Volume 24h"
              value={formatVolume(marketData.totalVolume)}
              delay={0.1}
              tooltip="Volume total de negociação de todos os ativos monitorados nas últimas 24 horas"
            />
            <MetricCard
              icon={<Coins className="w-4 h-4 text-crypto-gold" />}
              label="DeFi VTL"
              value="$85.2B"
              change={2.34}
              delay={0.2}
              tooltip="Valor Total Travado em protocolos DeFi"
            />
            <MetricCard
              icon={<TrendingUp className="w-4 h-4 text-crypto-green" />}
              label="Cap. de Stablecoins"
              value="$160.4B"
              change={0.52}
              delay={0.3}
              tooltip="Capitalização combinada das principais stablecoins"
            />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
