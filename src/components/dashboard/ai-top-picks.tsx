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
  Newspaper,
  Sparkles,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { useToast } from "@/hooks/use-toast";
import { FastCloseBadge } from "@/components/bot/fast-close-badge";

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
  const { toast } = useToast();
  const {
    tickers,
    bots,
    addBot,
    updateBot,
    setSelectedBotId,
    addBotLog,
    setSelectedSymbol,
    setActiveSection,
  } = useCryptoStore(
    useShallow((s) => ({
      tickers: s.tickers,
      bots: s.bots,
      addBot: s.addBot,
      updateBot: s.updateBot,
      setSelectedBotId: s.setSelectedBotId,
      addBotLog: s.addBotLog,
      setSelectedSymbol: s.setSelectedSymbol,
      setActiveSection: s.setActiveSection,
    }))
  );
  const [picks, setPicks] = useState<TopPick[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [hasNews, setHasNews] = useState(false);
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
        setHasNews(!result.fallback && !result.cached);
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
    const clean = symbol.endsWith("USDT") ? symbol : `${symbol}USDT`;
    setSelectedSymbol(clean);
    setActiveSection("chart");
  };

  const handleCreateBotFromPick = (pick: TopPick) => {
    const cleanSym = pick.symbol.endsWith("USDT") ? pick.symbol : `${pick.symbol}USDT`;
    const baseSym = cleanSym.replace("USDT", "");
    const botId = `bot-ai-${baseSym.toLowerCase()}-${Date.now().toString(36)}`;

    const curPrice = pick.currentPrice > 0 ? pick.currentPrice : (tickers[cleanSym]?.price || 1);
    let slPct = pick.stopLoss > 0 && curPrice > 0
      ? Math.abs(Number((((curPrice - pick.stopLoss) / curPrice) * 100).toFixed(2)))
      : 2.2;
    // Piso de Stop Loss para não ser pego no ruído de livro da Binance (mínimo 1.8%, máximo 3.0%)
    slPct = Math.max(1.8, Math.min(3.0, slPct));

    let tpPct = pick.targetPrice > 0 && curPrice > 0
      ? Math.abs(Number((((pick.targetPrice - curPrice) / curPrice) * 100).toFixed(2)))
      : 5.5;

    // Trava de Assimetria Positiva: Take Profit DEVE ser no mínimo 2.2x o Stop Loss
    if (tpPct < slPct * 2.2) {
      tpPct = Number((slPct * 2.25).toFixed(2));
    }

    // Trailing stop calibrado para a volatilidade do ativo (mínimo 1.2% para não morrer por ruído branco)
    const trailPct = Math.max(1.2, Number((slPct * 0.55).toFixed(2)));
    // Break-even só arma quando houver avanço real (+2.0% ou 45% do alvo)
    const beTrigger = Math.max(2.0, Number((tpPct * 0.45).toFixed(2)));
    // Margem de Break-Even de +0.60% para cobrir taxas da Binance (0.20%) e garantir lucro líquido real
    const beBuffer = 0.60;

    const existingBot = bots.find((b) => b.symbol === cleanSym);
    let targetBotId = botId;

    const botConfigData = {
      name: `IA ${baseSym} (${pick.recommendation || "Top Pick"})`,
      symbol: cleanSym,
      strategy: "AI" as const,
      active: true,
      takeProfit: tpPct,
      stopLoss: slPct,
      trailingStop: true,
      trailingStopDistance: trailPct,
      allocationAmount: 25,
      autoBreakEven: true,
      breakEvenTrigger: beTrigger,
      breakEvenBuffer: beBuffer,
      usePartialTp: true,
      partialTpTrigger: tpPct,
      partialTpPercent: 50,
      trailingTakeProfit: true,
      trailingTakeProfitDistance: trailPct,
      signalConfidenceThreshold: Math.min(95, Math.max(50, Math.round(pick.score || 75))),
      aiEngine: "TopPicks-Claude",
      algorithmVersion: "v2.5.0-ai-picked",
      autoTradeSignals: true,
      useMarketRegime: true,
      useMultiTimeframe: true,
    };

    if (existingBot) {
      targetBotId = existingBot.id;
      updateBot(existingBot.id, {
        ...botConfigData,
        status: existingBot.position ? "in_position" : "scanning",
        stats: {
          ...existingBot.stats,
          lastAction: `Atualizado via Top 5 da IA: Alvo +${tpPct}%, Stop -${slPct}%`,
          lastActionTime: new Date().toISOString(),
        },
      });
    } else {
      targetBotId = addBot({
        ...botConfigData,
        status: "scanning",
      });
    }

    addBotLog({
      botId: targetBotId,
      botName: `IA ${baseSym}`,
      type: "info",
      message: `Robô ${baseSym} configurado e ativado via Top 5 da IA: Alvo $${formatPrice(pick.targetPrice)} (+${tpPct}%), Stop $${formatPrice(pick.stopLoss)} (-${slPct}%)`,
    });

    setSelectedBotId(targetBotId);
    setSelectedSymbol(cleanSym);
    setActiveSection("bot");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    toast({
      title: `Robô ${baseSym} Gerado e Ativado! 🤖`,
      description: `Alvo: +${tpPct}% ($${formatPrice(pick.targetPrice)}) | Stop: -${slPct}% ($${formatPrice(pick.stopLoss)})`,
    });
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
              {hasNews && (
                <Badge className="text-[8px] bg-crypto-green/10 text-crypto-green border-crypto-green/30 px-1">
                  <Newspaper className="w-2 h-2 mr-0.5" />
                  Notícias
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

                  const cleanSym = pick.symbol.toUpperCase();
                  const activeBot = bots.find((b) => b.symbol.toUpperCase() === cleanSym && b.active);
                  const isBotInPosition = activeBot && (activeBot.status === "in_position" || (!!activeBot.position && activeBot.position.quantity > 0));

                  let floatingPnlPct = 0;
                  let hasFloatingPnl = false;
                  if (isBotInPosition && activeBot.position) {
                    const curPrice = tickers[cleanSym]?.price ?? (activeBot.position.currentPrice || pick.currentPrice);
                    const entryPrice = activeBot.position.entryPrice || 0;
                    if (curPrice > 0 && entryPrice > 0) {
                      floatingPnlPct = ((curPrice - entryPrice) / entryPrice) * 100;
                      hasFloatingPnl = true;
                    } else if (typeof activeBot.position.unrealizedPnlPercent === "number") {
                      floatingPnlPct = activeBot.position.unrealizedPnlPercent;
                      hasFloatingPnl = true;
                    }
                  }
                  const isFloatingProfit = floatingPnlPct >= 0;

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
                          : activeBot
                            ? "bg-emerald-950/15 border-emerald-500/40 hover:border-emerald-500/60"
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
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="text-sm font-bold cursor-pointer hover:text-crypto-cyan hover:underline transition-colors"
                              title={`Abrir gráfico de ${pick.symbol}`}
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

                            {/* Badge Dinâmico de Status do Robô, PnL e Zeragem Rápida */}
                            <FastCloseBadge
                              symbol={pick.symbol}
                              size="xs"
                              showInactiveBadge={false}
                              onActivateClick={() => handleCreateBotFromPick(pick)}
                            />
                          </div>
                          <div
                            className="flex items-center gap-2 mt-0.5 cursor-pointer group/name"
                            title={`Abrir gráfico de ${pick.symbol}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSymbolClick(pick.symbol);
                            }}
                          >
                            <span className="text-[10px] text-muted-foreground group-hover/name:text-crypto-cyan truncate transition-colors">
                              {pick.name}
                            </span>
                            <span className="text-[9px] text-muted-foreground/60">
                              {pick.category}
                            </span>
                          </div>
                        </div>

                        {/* Direct Create Bot Button */}
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn(
                            "h-7 px-2 text-[10px] font-bold gap-1 shrink-0 cursor-pointer hidden sm:flex items-center transition-all hover:scale-105",
                            activeBot
                              ? isBotInPosition
                                ? "bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-sm"
                                : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 hover:text-emerald-300"
                          )}
                          title={activeBot ? `Robô ${pick.symbol} já ativo! Clique para gerenciar na frota.` : `Criar e ativar robô para ${pick.symbol} imediatamente`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreateBotFromPick(pick);
                          }}
                        >
                          <Zap className="w-3 h-3 text-emerald-400" />
                          <span>
                            {activeBot
                              ? isBotInPosition
                                ? `🟢 Em Posição`
                                : `🟢 Bot Ativo`
                              : `Criar Bot`}
                          </span>
                        </Button>

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
                        <div className="text-right shrink-0 hidden md:block">
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

                              {/* Action Buttons */}
                              <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                                <Button
                                  size="sm"
                                  className={cn(
                                    "w-full sm:flex-1 h-8 text-xs font-bold text-white shadow-md cursor-pointer transition-all",
                                    activeBot
                                      ? isBotInPosition
                                        ? "bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-600 hover:to-teal-600 shadow-emerald-950/40 border border-emerald-500/50"
                                        : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/20"
                                      : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/20"
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCreateBotFromPick(pick);
                                  }}
                                >
                                  <Sparkles className="w-3.5 h-3.5 mr-1 text-emerald-200" />
                                  {activeBot
                                    ? isBotInPosition
                                      ? `🟢 Gerenciar Robô em Posição (${pick.symbol.replace("USDT", "")})`
                                      : `🟢 Gerenciar Robô Ativo (${pick.symbol.replace("USDT", "")})`
                                    : `⚡ Criar Bot com Sugestão (${pick.symbol.replace("USDT", "")})`}
                                </Button>
                                {isBotInPosition && activeBot && (
                                  <FastCloseBadge
                                    symbol={pick.symbol}
                                    size="sm"
                                    showInactiveBadge={false}
                                  />
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full sm:w-auto h-8 text-xs gap-1.5 border-crypto-cyan/30 text-crypto-cyan hover:bg-crypto-cyan/10 hover:text-crypto-cyan cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSymbolClick(pick.symbol);
                                  }}
                                >
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                  Ver Gráfico
                                </Button>
                              </div>
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
