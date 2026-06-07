"use client";

import { useEffect, useState, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useWorker } from "@/hooks/use-worker";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { motion } from "framer-motion";
import {
  ShieldAlert,
  Percent,
  TrendingDown,
  Activity,
  Award,
  AlertTriangle,
  HelpCircle,
  TrendingUp,
} from "lucide-react";
import { CRYPTO_BY_SYMBOL } from "@/lib/crypto-meta";
import { cn } from "@/lib/utils";

interface SharpeSortinoResult {
  sharpe: number;
  sortino: number;
  rawSharpe: number;
  rawSortino: number;
  meanReturn: number;
  stdDev: number;
  downsideDev: number;
}

const workerCreator = () =>
  new Worker(new URL("../../workers/indicators.worker.ts", import.meta.url));

export function RiskModule() {
  const { portfolio, trades, tickers } = useCryptoStore();
  const [metrics, setMetrics] = useState<SharpeSortinoResult | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);

  // Instantiating indicators worker
  const { execute, isRunning } = useWorker<any, SharpeSortinoResult>(workerCreator);

  const tradePnls = useMemo(() => {
    // Reverse trades list to make it chronological
    return [...trades].reverse().map((t) => t.pnl);
  }, [trades]);

  // Compute Sharpe/Sortino via Worker when trades change
  useEffect(() => {
    if (tradePnls.length < 2) {
      setMetrics(null);
      return;
    }

    execute("sharpe_sortino", { pnls: tradePnls, initialBalance: 10000 })
      .then((res) => {
        setMetrics(res);
        setWorkerError(null);
      })
      .catch((err) => {
        console.error("[RiskModule] Worker error:", err);
        setWorkerError(err.message);
      });
  }, [tradePnls, execute]);

  // Calculate Max Drawdown from trade history
  const maxDrawdown = useMemo(() => {
    let balance = 10000;
    let peak = 10000;
    let maxDD = 0;

    for (const pnl of tradePnls) {
      balance += pnl;
      if (balance > peak) {
        peak = balance;
      }
      const dd = peak > 0 ? (peak - balance) / peak : 0;
      if (dd > maxDD) {
        maxDD = dd;
      }
    }

    return maxDD * 100;
  }, [tradePnls]);

  // Calculate concentration HHI (Herfindahl-Hirschman Index)
  const hhi = useMemo(() => {
    const total = portfolio.totalValue || 1;
    let sumSq = 0;

    // Cash portion
    if (portfolio.cashBalance > 0) {
      const share = (portfolio.cashBalance / total) * 100;
      sumSq += share * share;
    }

    // Asset portions
    const assetShares: Record<string, number> = {};
    trades.forEach((t) => {
      if (!assetShares[t.symbol]) {
        assetShares[t.symbol] = 0;
      }
    });

    // Estimate active quantities
    Object.keys(assetShares).forEach((sym) => {
      const ticker = tickers[sym];
      if (ticker) {
        // Fallback value estimate
        const val = tickers[sym].price * (portfolio.assetQuantity || 0);
        const share = (val / total) * 100;
        sumSq += share * share;
      }
    });

    return sumSq;
  }, [portfolio, tickers, trades]);

  // Map HHI to Risk Category
  const hhiRating = useMemo(() => {
    if (hhi < 1500) return { label: "Baixa Concentração (Seguro)", color: "text-crypto-green", bg: "bg-crypto-green/10" };
    if (hhi <= 2500) return { label: "Concentração Moderada", color: "text-crypto-gold", bg: "bg-crypto-gold/10" };
    return { label: "Alta Concentração (Risco Alto)", color: "text-crypto-red", bg: "bg-crypto-red/10" };
  }, [hhi]);

  // Sector Exposure calculations
  const sectorExposures = useMemo(() => {
    const total = portfolio.totalValue || 1;
    const sectors: Record<string, number> = {};

    if (portfolio.cashBalance > 0) {
      sectors["Stablecoins/Cash"] = portfolio.cashBalance;
    }

    // Accumulate other assets
    const activeSymbols = new Set(trades.map((t) => t.symbol));
    activeSymbols.forEach((sym) => {
      const ticker = tickers[sym];
      if (ticker) {
        const val = ticker.price * (portfolio.assetQuantity || 0);
        if (val > 0.01) {
          const meta = CRYPTO_BY_SYMBOL[sym];
          const category = meta?.category || "Outros";
          sectors[category] = (sectors[category] || 0) + val;
        }
      }
    });

    return Object.entries(sectors).map(([category, value]) => ({
      category,
      value,
      percent: (value / total) * 100,
    })).sort((a, b) => b.value - a.value);
  }, [portfolio, tickers, trades]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.4 }}
    >
      <Card className="glass-card gradient-border h-full">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-crypto-red" />
            Módulo de Gestão de Risco
          </CardTitle>
          <DataSourceBadge />
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Main Risk Ratios */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-secondary/20 border border-border/40 space-y-1.5">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-crypto-gold" />
                Sharpe Ratio
              </span>
              <div className="flex items-baseline gap-2">
                <h3 className={cn(
                  "text-xl font-bold font-mono tracking-tight",
                  metrics && metrics.sharpe >= 1 ? "text-crypto-green" : "text-muted-foreground"
                )}>
                  {metrics ? metrics.sharpe.toFixed(2) : "—"}
                </h3>
                {metrics && (
                  <span className="text-[9px] text-muted-foreground">
                    (Anualizado)
                  </span>
                )}
              </div>
              <p className="text-[9px] text-muted-foreground leading-snug">
                Retorno excedente por unidade de volatilidade. &gt;1.0 é excelente.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-secondary/20 border border-border/40 space-y-1.5">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-crypto-cyan" />
                Sortino Ratio
              </span>
              <div className="flex items-baseline gap-2">
                <h3 className={cn(
                  "text-xl font-bold font-mono tracking-tight",
                  metrics && metrics.sortino >= 1 ? "text-crypto-green" : "text-muted-foreground"
                )}>
                  {metrics ? metrics.sortino.toFixed(2) : "—"}
                </h3>
              </div>
              <p className="text-[9px] text-muted-foreground leading-snug">
                Retorno excedente por volatilidade negativa (downside).
              </p>
            </div>
          </div>

          {/* Drawdown & Concentration Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-secondary/20 border border-border/40 space-y-1.5">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5 text-crypto-red" />
                Max Drawdown
              </span>
              <h3 className={cn(
                "text-xl font-bold font-mono tracking-tight",
                maxDrawdown > 15 ? "text-crypto-red" : "text-foreground"
              )}>
                {maxDrawdown > 0 ? `-${maxDrawdown.toFixed(2)}%` : "0.00%"}
              </h3>
              <p className="text-[9px] text-muted-foreground leading-snug">
                Maior queda de pico a vale registrada no saldo da conta.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-secondary/20 border border-border/40 space-y-1.5">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1">
                <Percent className="w-3.5 h-3.5 text-crypto-cyan" />
                Índice HHI
              </span>
              <h3 className="text-xl font-bold font-mono tracking-tight text-foreground">
                {hhi.toFixed(0)}
              </h3>
              <Badge className={cn("text-[8px] py-0 px-1.5 border-none", hhiRating.bg, hhiRating.color)}>
                {hhiRating.label}
              </Badge>
            </div>
          </div>

          {/* Warnings or disclaimers */}
          {tradePnls.length < 2 && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-crypto-gold/10 border border-crypto-gold/25 text-[10px] text-crypto-gold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Cálculos estatísticos do Sharpe & Sortino requerem pelo menos 2 trades registrados no histórico.
              </span>
            </div>
          )}

          {/* Sector Concentrations bar stack */}
          {sectorExposures.length > 0 && (
            <div className="space-y-2.5 border-t border-border/30 pt-3.5">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                Exposição Setorial do Portfólio
              </span>
              <div className="space-y-2">
                {sectorExposures.map((sec) => (
                  <div key={sec.category} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-foreground">{sec.category}</span>
                      <span className="font-mono text-muted-foreground text-[10px]">
                        ${formatPrice(sec.value)} ({sec.percent.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-secondary/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-crypto-cyan rounded-full"
                        style={{ width: `${sec.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
