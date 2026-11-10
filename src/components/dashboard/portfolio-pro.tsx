"use client";

import { useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { Briefcase, ArrowUpRight, ArrowDownRight, Percent, Database, PieChart as PieChartIcon } from "lucide-react";
import { CRYPTO_BY_SYMBOL, CRYPTO_CATEGORIES, CATEGORY_META } from "@/lib/crypto-meta";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";

interface Position {
  symbol: string;
  quantity: number;
  averageBuyPrice: number;
  totalCost: number;
  currentPrice: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  color: string;
  category: string;
}

interface SectorExposure {
  category: string;
  value: number;
  percent: number;
  color: string;
  emoji: string;
}

// Custom tooltip for Pie Chart
function AllocationCustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: any }> }) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="bg-card/90 backdrop-blur-md border border-border/80 rounded-lg px-3 py-2 text-xs shadow-lg font-sans">
        <p className="font-semibold text-foreground flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
          {item.name}
        </p>
        <div className="space-y-0.5 mt-1 text-muted-foreground">
          <p>Valor: <span className="font-mono text-foreground">${formatPrice(item.value)}</span></p>
          <p>Fatia: <span className="font-mono text-foreground">{item.percent.toFixed(1)}%</span></p>
        </div>
      </div>
    );
  }
  return null;
}

export function PortfolioPro() {
  const { portfolio, trades, tickers, selectedSymbol, botConfig } = useCryptoStore(
  useShallow((s) => ({ portfolio: s.portfolio, trades: s.trades, tickers: s.tickers, selectedSymbol: s.selectedSymbol, botConfig: s.botConfig }))
);

  // 1. Get positions directly from authoritative backend payload
  const positions = useMemo(() => {
    const list = portfolio.positions ?? [];
    return list.map((p) => {
      const meta = CRYPTO_BY_SYMBOL[p.symbol];
      const totalCost = p.quantity * p.avgPrice;
      const pnlPercent = totalCost > 0 ? (p.unrealizedPnl / totalCost) * 100 : 0;
      
      return {
        symbol: p.symbol,
        quantity: p.quantity,
        averageBuyPrice: p.avgPrice,
        totalCost,
        currentPrice: p.marketPrice,
        currentValue: p.marketValue,
        pnl: p.unrealizedPnl,
        pnlPercent,
        color: meta?.color || "#8b5cf6",
        category: meta?.category || "Other"
      };
    }).sort((a, b) => b.currentValue - a.currentValue);
  }, [portfolio.positions]);

  // 2. Format data for the Recharts Pie Chart
  const pieData = useMemo(() => {
    const total = portfolio.totalValue || 1;
    const items: Array<{ name: string; value: number; color: string; percent: number }> = [];

    // Cash portion
    if (portfolio.cashBalance > 0) {
      items.push({
        name: "Caixa",
        value: portfolio.cashBalance,
        color: "#06b6d4",
        percent: (portfolio.cashBalance / total) * 100,
      });
    }

    // Asset portions
    positions.forEach((pos) => {
      const cleanSym = pos.symbol.replace("USDT", "");
      items.push({
        name: cleanSym,
        value: pos.currentValue,
        color: pos.color,
        percent: (pos.currentValue / total) * 100,
      });
    });

    if (items.length === 0) {
      items.push({
        name: "Vazio",
        value: 100,
        color: "#334155",
        percent: 100,
      });
    }

    return items;
  }, [positions, portfolio.cashBalance, portfolio.totalValue]);

  // 3. Calculate sector exposure
  const sectorExposures = useMemo(() => {
    const total = portfolio.totalValue || 1;
    const sectors: Record<string, { value: number; color: string; emoji: string }> = {};

    // Cash is stablecoin/cash sector
    if (portfolio.cashBalance > 0) {
      sectors["Caixa/Stablecoin"] = {
        value: portfolio.cashBalance,
        color: "#06b6d4",
        emoji: "💵",
      };
    }

    positions.forEach((pos) => {
      const cat = pos.category;
      const meta = CATEGORY_META[cat as keyof typeof CATEGORY_META];
      if (!sectors[cat]) {
        sectors[cat] = {
          value: 0,
          color: meta?.color || "#a855f7",
          emoji: meta?.emoji || "🪙",
        };
      }
      sectors[cat].value += pos.currentValue;
    });

    return Object.entries(sectors)
      .map(([category, data]) => ({
        category,
        value: data.value,
        percent: (data.value / total) * 100,
        color: data.color,
        emoji: data.emoji,
      }))
      .sort((a, b) => b.value - a.value);
  }, [positions, portfolio.cashBalance, portfolio.totalValue]);

  return (
    <Card className="glass-card gradient-border h-full">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-crypto-cyan" />
          Portfólio Pro
        </CardTitle>
        <DataSourceBadge />
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Row 1: Pie Chart & Details */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Pie Chart container */}
          <div className="md:col-span-5 flex justify-center">
            <div className="relative w-[150px] h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                    animationBegin={0}
                    animationDuration={600}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<AllocationCustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Patrimônio</span>
                <span className="text-sm font-bold font-mono text-foreground">
                  ${formatPrice(portfolio.totalValue)}
                </span>
              </div>
            </div>
          </div>

          {/* Allocation Details */}
          <div className="md:col-span-7 space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Alocação de Ativos</h4>
            <div className="max-h-[160px] overflow-y-auto pr-1 space-y-2.5 cyan-scrollbar">
              {pieData.map((item) => (
                <div key={item.name} className="flex flex-col space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="font-semibold text-foreground truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="text-foreground">${formatPrice(item.value)}</span>
                      <span className="text-muted-foreground shrink-0 w-10 text-right">{item.percent.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-secondary/40 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: item.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${item.percent}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Asset Valuation & PnL List */}
        {positions.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Valuation & Performance</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AnimatePresence>
                {positions.map((pos) => {
                  const hasProfit = pos.pnl >= 0;
                  const cleanSym = pos.symbol.replace("USDT", "");
                  return (
                    <motion.div
                      key={pos.symbol}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="p-3 rounded-lg bg-secondary/20 border border-border/50 hover:bg-secondary/30 transition-colors flex flex-col justify-between space-y-2"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-bold text-xs text-foreground font-mono">{cleanSym}</span>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Qtd: <span className="font-mono text-foreground">{pos.quantity.toFixed(4)}</span>
                          </p>
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-medium uppercase tracking-wider bg-secondary/80 border border-border/80 text-muted-foreground">
                          {pos.category}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 border-t border-border/30 pt-2 text-[11px] font-mono">
                        <div>
                          <p className="text-[9px] text-muted-foreground font-sans">Preço Médio</p>
                          <p className="text-foreground font-semibold">${formatPrice(pos.averageBuyPrice)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground font-sans">Preço Atual</p>
                          <p className="text-foreground font-semibold">${formatPrice(pos.currentPrice)}</p>
                        </div>
                      </div>

                      <div className="flex justify-between items-center border-t border-border/30 pt-2">
                        <div>
                          <span className="text-[9px] text-muted-foreground font-sans block leading-none">Valuation</span>
                          <span className="text-xs font-bold font-mono text-foreground">${formatPrice(pos.currentValue)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] text-muted-foreground font-sans block leading-none">L/P Aberto</span>
                          <span className={cn(
                            "text-xs font-bold font-mono flex items-center justify-end gap-0.5",
                            hasProfit ? "text-crypto-green" : "text-crypto-red"
                          )}>
                            {hasProfit ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {formatPercent(pos.pnlPercent)}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Row 3: Sector Exposure */}
        <div className="space-y-3 border-t border-border/30 pt-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <PieChartIcon className="w-3.5 h-3.5 text-crypto-cyan" />
            Exposição Setorial
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {sectorExposures.map((sec) => (
              <div key={sec.category} className="p-2.5 rounded-lg bg-secondary/15 border border-border/30 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground truncate flex items-center gap-1">
                    <span className="text-sm shrink-0">{sec.emoji}</span>
                    {sec.category}
                  </span>
                  <span className="font-mono text-muted-foreground text-[10px]">{sec.percent.toFixed(1)}%</span>
                </div>
                <div className="w-full h-1 bg-secondary/40 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      backgroundColor: sec.color,
                      width: `${sec.percent}%`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
