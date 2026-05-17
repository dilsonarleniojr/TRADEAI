"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Activity, Zap } from "lucide-react";

interface HighlightItem {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
}

interface HighlightsData {
  topGainers: HighlightItem[];
  topLosers: HighlightItem[];
  mostActive: HighlightItem[];
}

const symbolColors: Record<string, string> = {
  BTCUSDT: "#f7931a",
  ETHUSDT: "#627eea",
  BNBUSDT: "#f3ba2f",
  SOLUSDT: "#9945ff",
  XRPUSDT: "#00aae4",
  ADAUSDT: "#0033ad",
  DOGEUSDT: "#c3a634",
  AVAXUSDT: "#e84142",
  DOTUSDT: "#e6007a",
  LINKUSDT: "#2a5ada",
  MATICUSDT: "#8247e5",
  ATOMUSDT: "#2e3148",
};

export function MarketHighlights() {
  const [data, setData] = useState<HighlightsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHighlights = useCallback(async () => {
    try {
      const response = await fetch("/api/market/highlights");
      if (!response.ok) return;
      const result = await response.json();
      if (result.data) {
        setData(result.data);
      }
    } catch (err) {
      console.error("[MarketHighlights] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHighlights();
    const interval = setInterval(fetchHighlights, 30000);
    return () => clearInterval(interval);
  }, [fetchHighlights]);

  const sections = [
    {
      title: "Em Alta",
      icon: TrendingUp,
      iconColor: "text-crypto-green",
      iconBg: "bg-crypto-green/10",
      accentGradient: "from-crypto-green/5 to-transparent",
      items: data?.topGainers ?? [],
      positive: true,
    },
    {
      title: "Em Baixa",
      icon: TrendingDown,
      iconColor: "text-crypto-red",
      iconBg: "bg-crypto-red/10",
      accentGradient: "from-crypto-red/5 to-transparent",
      items: data?.topLosers ?? [],
      positive: false,
    },
    {
      title: "Mais Ativos",
      icon: Activity,
      iconColor: "text-crypto-cyan",
      iconBg: "bg-crypto-cyan/10",
      accentGradient: "from-crypto-cyan/5 to-transparent",
      items: data?.mostActive ?? [],
      positive: null,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
    >
      <Card className="bg-card/60 backdrop-blur-md gradient-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-crypto-gold" />
              Destaques do Mercado
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              Atualiza a cada 30s
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {sections.map((section, sIdx) => (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, x: sIdx === 0 ? -20 : sIdx === 2 ? 20 : 0 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + sIdx * 0.1, duration: 0.4 }}
                className={cn(
                  "rounded-lg border border-border/50 bg-gradient-to-r p-3 relative overflow-hidden",
                  section.accentGradient
                )}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn("p-1.5 rounded-md", section.iconBg)}>
                    <section.icon
                      className={cn("w-3.5 h-3.5", section.iconColor)}
                    />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {section.title}
                  </span>
                </div>
                {/* Accent line on left */}
                <div className={cn(
                  "absolute left-0 top-3 bottom-3 w-0.5 rounded-full",
                  section.positive === true ? "bg-crypto-green/40" : section.positive === false ? "bg-crypto-red/40" : "bg-crypto-cyan/40"
                )} />

                {loading ? (
                  <div className="space-y-2.5">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-10 bg-secondary/50 rounded animate-pulse"
                      />
                    ))}
                  </div>
                ) : section.items.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-4 text-center">
                    Sem dados disponíveis
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {section.items.slice(0, 3).map((item, idx) => {
                      const priceNum = parseFloat(item.lastPrice || '0');
                      const changeNum = parseFloat(item.priceChangePercent || '0');
                      const isPositive = changeNum >= 0;
                      const color =
                        symbolColors[item.symbol] || "#06b6d4";
                      const trendColor =
                        section.positive === true
                          ? "text-crypto-green"
                          : section.positive === false
                            ? "text-crypto-red"
                            : isPositive
                              ? "text-crypto-green"
                              : "text-crypto-red";

                      return (
                        <motion.div
                          key={item.symbol}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.4 + idx * 0.05, duration: 0.3 }}
                          className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-secondary/50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="text-sm font-medium">
                              {item.symbol.replace("USDT", "")}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-muted-foreground">
                              ${formatPrice(priceNum)}
                            </span>
                            <div className="flex items-center gap-1">
                              {isPositive ? (
                                <TrendingUp className="w-3 h-3 text-crypto-green" />
                              ) : (
                                <TrendingDown className="w-3 h-3 text-crypto-red" />
                              )}
                              <span
                                className={cn(
                                  "text-xs font-mono font-semibold",
                                  trendColor
                                )}
                              >
                                {formatPercent(changeNum)}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
