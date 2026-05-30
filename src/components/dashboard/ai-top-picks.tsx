"use client";

import { useState, useCallback, useEffect } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Trophy,
  TrendingUp,
  Target,
  ShieldAlert,
  RefreshCw,
  Zap,
  Star,
  ArrowUpRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface TopPick {
  rank: number;
  symbol: string;
  name: string;
  currentPrice: number;
  priceChange24h: number;
  recommendation: string;
  reason: string;
  targetPrice: number;
  stopLoss: number;
  riskLevel: "Baixo" | "Médio" | "Alto";
  category: string;
  score: number;
}

const RISK_COLORS = {
  Baixo: { bg: "bg-crypto-green/10", text: "text-crypto-green", border: "border-crypto-green/30" },
  Médio: { bg: "bg-crypto-gold/10", text: "text-crypto-gold", border: "border-crypto-gold/30" },
  Alto: { bg: "bg-crypto-red/10", text: "text-crypto-red", border: "border-crypto-red/30" },
};

const REC_STYLES: Record<string, { bg: string; text: string; icon: typeof TrendingUp }> = {
  "COMPRA FORTE": { bg: "bg-crypto-green/15", text: "text-crypto-green", icon: Zap },
  COMPRA: { bg: "bg-crypto-green/10", text: "text-crypto-green", icon: TrendingUp },
  ACUMULAR: { bg: "bg-crypto-cyan/10", text: "text-crypto-cyan", icon: Star },
};

export function AITopPicks() {
  const { tickers, setSelectedSymbol, setActiveSection } = useCryptoStore();
  const [picks, setPicks] = useState<TopPick[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [expandedPick, setExpandedPick] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchPicks = useCallback(async () => {
    if (Object.keys(tickers).length === 0) return;
    setIsLoading(true);
    setIsFallback(false);

    try {
      const resp = await fetch("/api/ai/top-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketData: tickers }),
      });

      if (!resp.ok) throw new Error("Failed to fetch picks");

      const result = await resp.json();
      if (result.success && result.picks) {
        setPicks(result.picks);
        setIsCached(result.cached || false);
        setIsFallback(result.fallback || false);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error("Top picks fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [tickers]);

  // Auto-fetch on mount and when tickers change significantly
  useEffect(() => {
    if (Object.keys(tickers).length > 0 && picks.length === 0) {
      fetchPicks();
    }
  }, [tickers, picks.length, fetchPicks]);

  const handleSymbolClick = (symbol: string) => {
    setSelectedSymbol(symbol);
    setActiveSection("chart");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
    >
      <Card className="glass-card gradient-border overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-crypto-gold" />
              Top 5 da IA
              {isFallback && (
                <Badge className="text-[8px] bg-crypto-gold/10 text-crypto-gold border-crypto-gold/30 px-1">
                  Algoritmo
                </Badge>
              )}
              {isCached && (
                <Badge className="text-[8px] bg-crypto-cyan/10 text-crypto-cyan border-crypto-cyan/30 px-1">
                  Cache
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {lastUpdated && (
                <span className="text-[9px] text-muted-foreground">
                  {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchPicks}
                disabled={isLoading}
                className="h-7 w-7 p-0 hover:bg-crypto-cyan/10 transition-colors"
                aria-label="Atualizar picks"
              >
                <RefreshCw className={cn("w-3.5 h-3.5 text-crypto-cyan", isLoading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {isLoading && picks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="w-6 h-6 text-crypto-cyan animate-spin" />
              <span className="text-xs text-muted-foreground">Analisando mercado com IA...</span>
            </div>
          ) : picks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Trophy className="w-8 h-8 text-muted-foreground/30" />
              <span className="text-xs text-muted-foreground">Clique para analisar o mercado</span>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchPicks}
                className="text-xs gap-1.5 border-crypto-cyan/30 text-crypto-cyan hover:bg-crypto-cyan/10"
              >
                <Zap className="w-3 h-3" />
                Analisar Agora
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {picks.map((pick, idx) => {
                  const isPositive = pick.priceChange24h >= 0;
                  const riskStyle = RISK_COLORS[pick.riskLevel] || RISK_COLORS.Médio;
                  const recStyle = REC_STYLES[pick.recommendation] || REC_STYLES.COMPRA;
                  const RecIcon = recStyle.icon;
                  const isExpanded = expandedPick === idx;
                  const profitPotential = pick.targetPrice > 0
                    ? ((pick.targetPrice - pick.currentPrice) / pick.currentPrice) * 100
                    : 0;

                  return (
                    <motion.div
                      key={pick.symbol}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.08, duration: 0.3 }}
                      className={cn(
                        "rounded-xl border transition-all duration-200 cursor-pointer group",
                        "hover:shadow-md hover:shadow-crypto-cyan/5",
                        isExpanded
                          ? "bg-secondary/40 border-crypto-cyan/30"
                          : "bg-secondary/20 border-border/50 hover:border-crypto-cyan/20"
                      )}
                      onClick={() => setExpandedPick(isExpanded ? null : idx)}
                    >
                      {/* Main Row */}
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        {/* Rank Badge */}
                        <div
                          className={cn(
                            "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                            idx === 0
                              ? "bg-crypto-gold/20 text-crypto-gold"
                              : idx === 1
                                ? "bg-gray-400/20 text-gray-300"
                                : idx === 2
                                  ? "bg-amber-700/20 text-amber-600"
                                  : "bg-secondary/50 text-muted-foreground"
                          )}
                        >
                          #{pick.rank}
                        </div>

                        {/* Symbol + Name */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="text-sm font-semibold cursor-pointer hover:text-crypto-cyan transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSymbolClick(pick.symbol);
                              }}
                            >
                              {pick.symbol.replace("USDT", "")}
                            </span>
                            <Badge
                              className={cn(
                                "text-[7px] px-1 py-0 border font-semibold leading-none",
                                riskStyle.bg,
                                riskStyle.text,
                                riskStyle.border
                              )}
                            >
                              {pick.riskLevel}
                            </Badge>
                            <Badge
                              className={cn(
                                "text-[7px] px-1 py-0 border font-semibold leading-none",
                                recStyle.bg,
                                recStyle.text,
                                "border-current/30"
                              )}
                            >
                              <RecIcon className="w-2 h-2 mr-0.5" />
                              {pick.recommendation}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground truncate">
                              {pick.name}
                            </span>
                            <span className="text-[9px] text-muted-foreground/60">
                              {pick.category}
                            </span>
                          </div>
                        </div>

                        {/* Price + Change */}
                        <div className="text-right shrink-0">
                          <div className="text-sm font-mono font-medium">
                            ${formatPrice(pick.currentPrice)}
                          </div>
                          <div
                            className={cn(
                              "text-[10px] font-mono font-semibold",
                              isPositive ? "text-crypto-green" : "text-crypto-red"
                            )}
                          >
                            {isPositive ? "+" : ""}
                            {formatPercent(pick.priceChange24h)}
                          </div>
                        </div>

                        {/* Score */}
                        <div className="text-right shrink-0 hidden sm:block">
                          <div className="text-lg font-bold text-crypto-gold">
                            {Math.round(pick.score)}
                          </div>
                          <div className="text-[8px] text-muted-foreground">SCORE</div>
                        </div>

                        {/* Expand Arrow */}
                        <ArrowUpRight
                          className={cn(
                            "w-3.5 h-3.5 text-muted-foreground/50 shrink-0 transition-transform duration-200",
                            isExpanded && "rotate-90 text-crypto-cyan"
                          )}
                        />
                      </div>

                      {/* Expanded Detail */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <div className="px-3 pb-3 pt-1 border-t border-border/30 space-y-2.5">
                              {/* Reason */}
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {pick.reason}
                              </p>

                              {/* Target/SL/Profit */}
                              <div className="grid grid-cols-3 gap-2">
                                <div className="bg-secondary/30 rounded-lg p-2 text-center">
                                  <Target className="w-3 h-3 mx-auto mb-1 text-crypto-green" />
                                  <div className="text-[10px] text-muted-foreground">Alvo</div>
                                  <div className="text-xs font-mono font-semibold text-crypto-green">
                                    ${formatPrice(pick.targetPrice)}
                                  </div>
                                </div>
                                <div className="bg-secondary/30 rounded-lg p-2 text-center">
                                  <ShieldAlert className="w-3 h-3 mx-auto mb-1 text-crypto-red" />
                                  <div className="text-[10px] text-muted-foreground">Stop Loss</div>
                                  <div className="text-xs font-mono font-semibold text-crypto-red">
                                    ${formatPrice(pick.stopLoss)}
                                  </div>
                                </div>
                                <div className="bg-secondary/30 rounded-lg p-2 text-center">
                                  <TrendingUp className="w-3 h-3 mx-auto mb-1 text-crypto-gold" />
                                  <div className="text-[10px] text-muted-foreground">Potencial</div>
                                  <div
                                    className={cn(
                                      "text-xs font-mono font-semibold",
                                      profitPotential >= 0 ? "text-crypto-green" : "text-crypto-red"
                                    )}
                                  >
                                    {profitPotential >= 0 ? "+" : ""}
                                    {profitPotential.toFixed(1)}%
                                  </div>
                                </div>
                              </div>

                              {/* Action Button */}
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full h-7 text-[10px] gap-1.5 border-crypto-cyan/30 text-crypto-cyan hover:bg-crypto-cyan/10 hover:text-crypto-cyan"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSymbolClick(pick.symbol);
                                }}
                              >
                                <ArrowUpRight className="w-3 h-3" />
                                Ver Gráfico de {pick.symbol.replace("USDT", "")}
                              </Button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
