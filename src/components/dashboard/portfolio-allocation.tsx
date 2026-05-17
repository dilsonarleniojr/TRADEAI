"use client";

import { useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { motion } from "framer-motion";
import { PieChart as PieChartIcon } from "lucide-react";
import { CRYPTO_COLORS, CRYPTO_SHORTS } from "@/lib/crypto-meta";

interface AllocationItem {
  name: string;
  value: number;
  color: string;
  percent: number;
}

// CustomTooltip must be defined outside the component to avoid re-creation during render
function AllocationCustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: AllocationItem }> }) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
        <p className="font-medium" style={{ color: item.color }}>
          {item.name}
        </p>
        <p className="text-muted-foreground">
          ${formatPrice(item.value)} ({item.percent.toFixed(1)}%)
        </p>
      </div>
    );
  }
  return null;
}

export function PortfolioAllocation() {
  const { portfolio, selectedSymbol, tickers, botConfig } = useCryptoStore();

  const data = useMemo(() => {
    const items: AllocationItem[] = [];
    const total = portfolio.totalValue || 1;

    // Cash allocation
    if (portfolio.cashBalance > 0) {
      items.push({
        name: "Caixa",
        value: portfolio.cashBalance,
        color: "#06b6d4",
        percent: (portfolio.cashBalance / total) * 100,
      });
    }

    // Asset allocation
    if (portfolio.assetBalance > 0) {
      const symbol = selectedSymbol || botConfig.symbol;
      const assetName = CRYPTO_SHORTS[symbol] || symbol.replace("USDT", "");
      const assetColor = CRYPTO_COLORS[symbol] || "#8b5cf6";

      items.push({
        name: assetName,
        value: portfolio.assetBalance,
        color: assetColor,
        percent: (portfolio.assetBalance / total) * 100,
      });
    }

    // If nothing, show empty state
    if (items.length === 0) {
      items.push({
        name: "Sem Ativos",
        value: 100,
        color: "#334155",
        percent: 100,
      });
    }

    return items;
  }, [portfolio, selectedSymbol, botConfig.symbol]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.4 }}
    >
      <Card className="bg-card/60 backdrop-blur-md gradient-border h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-crypto-gold" />
            Alocação da Carteira
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {/* Pie Chart */}
            <div className="w-[140px] h-[140px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={60}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    animationBegin={0}
                    animationDuration={800}
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<AllocationCustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend & Details */}
            <div className="flex-1 space-y-2.5 min-w-0">
              {data.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate">{item.name}</span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {item.percent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-1 bg-secondary rounded-full mt-1 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: item.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${item.percent}%` }}
                        transition={{ delay: 0.5, duration: 0.8 }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Total Value */}
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Valor Total</span>
              <span className="text-sm font-bold font-mono pulse-soft">
                ${formatPrice(portfolio.totalValue)}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-muted-foreground">L/P</span>
              <span
                className={`text-xs font-mono font-semibold ${
                  portfolio.pnl >= 0 ? "text-crypto-green" : "text-crypto-red"
                }`}
              >
                {portfolio.pnl >= 0 ? "+" : ""}${formatPrice(Math.abs(portfolio.pnl))} ({formatPercent(portfolio.pnlPercent)})
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
