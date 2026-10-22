"use client";

import { useMemo } from "react";
import { 
  calculateOrderBookImbalance, 
  DepthLevel, 
  OrderBookImbalanceResult,
  SpoofingAlert 
} from "@/lib/order-book-imbalance";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { 
  TrendingUp, 
  TrendingDown, 
  Scale, 
  Zap, 
  Info,
  ShieldCheck,
  ShieldAlert,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface OrderBookImbalanceHistogramProps {
  bids: DepthLevel[];
  asks: DepthLevel[];
  symbol: string;
  currentPrice?: number;
  compact?: boolean;
  spoofingAlert?: SpoofingAlert | null;
  onExecuteMarketOrder?: (side: "BUY" | "SELL") => void;
  className?: string;
}

export function OrderBookImbalanceHistogram({
  bids,
  asks,
  symbol,
  currentPrice,
  compact = false,
  spoofingAlert,
  onExecuteMarketOrder,
  className,
}: OrderBookImbalanceHistogramProps) {
  const result: OrderBookImbalanceResult = useMemo(() => {
    return calculateOrderBookImbalance(bids, asks, 8);
  }, [bids, asks]);

  const cleanSymbol = symbol.replace("USDT", "");

  return (
    <div
      className={cn(
        "rounded-lg border bg-gradient-to-b from-secondary/40 via-secondary/20 to-background/60 backdrop-blur-md p-2.5 transition-all shadow-sm",
        result.confluenceSignal === "BULLISH"
          ? "border-crypto-green/30 shadow-crypto-green/5"
          : result.confluenceSignal === "BEARISH"
          ? "border-crypto-red/30 shadow-crypto-red/5"
          : "border-border/40",
        className
      )}
    >
      {/* Header com Diagnóstico em Tempo Real */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            className={cn(
              "p-1 rounded-md shrink-0",
              result.confluenceSignal === "BULLISH"
                ? "bg-crypto-green/15 text-crypto-green"
                : result.confluenceSignal === "BEARISH"
                ? "bg-crypto-red/15 text-crypto-red"
                : "bg-secondary/60 text-muted-foreground"
            )}
          >
            {result.confluenceSignal === "BULLISH" ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : result.confluenceSignal === "BEARISH" ? (
              <TrendingDown className="w-3.5 h-3.5" />
            ) : (
              <Scale className="w-3.5 h-3.5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Desbalanceamento L2 (OBI)
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-crypto-cyan animate-pulse shrink-0" />
            </div>
            <p className="text-[11px] font-semibold text-foreground truncate">
              {result.confluenceBadge}
            </p>
          </div>
        </div>

        {/* Badge Numérico de Pressão Líquida */}
        <div className="text-right shrink-0">
          <div className="flex items-center justify-end gap-1">
            <span
              className={cn(
                "text-xs font-mono font-bold px-1.5 py-0.5 rounded border text-[11px]",
                result.confluenceSignal === "BULLISH"
                  ? "bg-crypto-green/15 text-crypto-green border-crypto-green/30"
                  : result.confluenceSignal === "BEARISH"
                  ? "bg-crypto-red/15 text-crypto-red border-crypto-red/30"
                  : "bg-secondary/40 text-muted-foreground border-border/30"
              )}
            >
              {result.imbalancePct > 0 ? `+${result.imbalancePct}%` : `${result.imbalancePct}%`}
            </span>
          </div>
          <span className="text-[9px] font-mono text-muted-foreground block mt-0.5">
            Skew: {result.skewRatio}x • Bid {result.bidPct}% vs Ask {result.askPct}%
          </span>
        </div>
      </div>

      {/* Alerta de Inversão Repentina de Liquidez (Liquidity Spoofing Guard) */}
      <AnimatePresence>
        {spoofingAlert?.isAlertActive && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "mb-2 p-2 rounded-md border flex items-start gap-2 text-[10px] backdrop-blur-md shadow-sm",
              spoofingAlert.severity === "CRITICAL"
                ? "bg-rose-500/15 border-rose-500/40 text-rose-300 shadow-rose-500/10"
                : "bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-amber-500/10"
            )}
          >
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 animate-pulse text-amber-400" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold uppercase tracking-wider text-[9px] flex items-center gap-1.5">
                  Liquidity Spoofing Guard
                  <span className="px-1 py-0 rounded text-[8px] bg-amber-400/20 text-amber-300 font-mono">
                    {spoofingAlert.timeDeltaMs}ms atrás
                  </span>
                </span>
                <span className="text-[9px] font-bold font-mono text-rose-400">
                  -{spoofingAlert.dropPct}% Volume
                </span>
              </div>
              <p className="font-semibold mt-0.5 text-foreground leading-tight">
                {spoofingAlert.message}
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">
                {spoofingAlert.advice}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mini-Histograma Bipolar por Níveis (L1 a L8) */}
      <div className="bg-background/40 rounded-md p-2 border border-border/30 my-2">
        <div className="flex items-center justify-between text-[9px] text-muted-foreground font-mono mb-1.5">
          <span className="text-crypto-green flex items-center gap-1">
            ▲ Demanda (Bid)
          </span>
          <span className="text-[8px] uppercase tracking-wider text-muted-foreground">
            Profundidade Top 8 Níveis
          </span>
          <span className="text-crypto-red flex items-center gap-1">
            ▼ Oferta (Ask)
          </span>
        </div>

        {/* Eixo central com barras verticais */}
        <div className="grid grid-cols-8 gap-1.5 h-14 items-center relative px-0.5">
          {/* Linha horizontal zero de referência */}
          <div className="absolute inset-x-0 top-1/2 h-px bg-border/60 -translate-y-1/2 z-0" />

          {result.levelImbalances.map((lvl) => {
            const isBull = lvl.imbalance >= 0;
            const barHeightPct = Math.max(Math.min(Math.abs(lvl.imbalance) * 100, 100), 12);

            return (
              <div
                key={`lvl-${lvl.level}`}
                className="group relative flex flex-col items-center justify-center h-full z-10 cursor-pointer"
                title={`Nível L${lvl.level}: Bid ${lvl.bidVol.toFixed(2)} vs Ask ${lvl.askVol.toFixed(2)} (${lvl.imbalancePct > 0 ? '+' : ''}${lvl.imbalancePct}%)`}
              >
                {/* Metade Superior (Bid / Compra) */}
                <div className="w-full flex-1 flex items-end justify-center">
                  {isBull && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${barHeightPct}%` }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      className="w-full max-w-[12px] rounded-t-sm bg-gradient-to-t from-crypto-cyan/70 to-crypto-green shadow-xs shadow-crypto-green/20 group-hover:brightness-125 transition-all"
                    />
                  )}
                </div>

                {/* Marcador do nível central */}
                <span className="text-[8px] font-mono text-muted-foreground/70 py-0.5 group-hover:text-foreground font-bold">
                  {lvl.level}
                </span>

                {/* Metade Inferior (Ask / Venda) */}
                <div className="w-full flex-1 flex items-start justify-center">
                  {!isBull && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${barHeightPct}%` }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      className="w-full max-w-[12px] rounded-b-sm bg-gradient-to-b from-crypto-red/70 to-rose-600 shadow-xs shadow-crypto-red/20 group-hover:brightness-125 transition-all"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rodapé de Confluência & Ações Rápidas Pré-Ordem */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1 border-t border-border/30">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 text-crypto-cyan shrink-0" />
          <span className="truncate max-w-[200px]" title={result.confluenceDescription}>
            {result.confluenceDescription}
          </span>
        </div>

        {/* Botões de Ação Imediata para Ordem a Mercado com Confluência */}
        {onExecuteMarketOrder && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onExecuteMarketOrder("BUY")}
              className={cn(
                "h-6 px-2 text-[10px] font-bold rounded cursor-pointer border transition-all flex items-center gap-1",
                result.confluenceSignal === "BULLISH"
                  ? "bg-crypto-green/20 hover:bg-crypto-green/30 text-crypto-green border-crypto-green/40 shadow-xs shadow-crypto-green/10"
                  : "hover:bg-crypto-green/10 text-crypto-green/80 border-crypto-green/20"
              )}
              title={`Disparar ordem rápida a mercado de Compra em ${cleanSymbol}`}
            >
              <Zap className="w-2.5 h-2.5" />
              Comprar Mercado
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onExecuteMarketOrder("SELL")}
              className={cn(
                "h-6 px-2 text-[10px] font-bold rounded cursor-pointer border transition-all flex items-center gap-1",
                result.confluenceSignal === "BEARISH"
                  ? "bg-crypto-red/20 hover:bg-crypto-red/30 text-crypto-red border-crypto-red/40 shadow-xs shadow-crypto-red/10"
                  : "hover:bg-crypto-red/10 text-crypto-red/80 border-crypto-red/20"
              )}
              title={`Disparar ordem rápida a mercado de Venda em ${cleanSymbol}`}
            >
              <Zap className="w-2.5 h-2.5" />
              Vender Mercado
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
