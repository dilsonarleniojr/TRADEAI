"use client";

import { useMemo, useState } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scale, Shield, AlertTriangle, TrendingUp, ArrowRight, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const MARKET_CAP_WEIGHTS: Record<string, number> = {
  BTCUSDT: 0.52, ETHUSDT: 0.18, BNBUSDT: 0.05, SOLUSDT: 0.04,
  XRPUSDT: 0.03, ADAUSDT: 0.02, DOGEUSDT: 0.03, AVAXUSDT: 0.02,
  DOTUSDT: 0.01, LINKUSDT: 0.02, ATOMUSDT: 0.01, MATICUSDT: 0.01,
};

interface RebalanceAction {
  symbol: string; action: "BUY" | "SELL" | "INVEST" | "HOLD";
  currentPercent: number; targetPercent: number;
  diffPercent: number; estimatedAmount: number;
}

interface RiskAssessment {
  riskScore: number; diversificationScore: number;
  riskLabel: string; riskColor: string;
}

type PD = import("@/lib/store").PortfolioData;
type TD = Record<string, import("@/lib/store").TickerData>;

function computeRisk(portfolio: PD, tickers: TD): RiskAssessment {
  const total = portfolio.totalValue || 1;
  const assetRatio = portfolio.assetBalance / total;
  const cashRatio = portfolio.cashBalance / total;
  let concentrationRisk = assetRatio > 0.7 ? 60 + (assetRatio - 0.7) * 130 :
    assetRatio > 0.5 ? 30 + (assetRatio - 0.5) * 150 : assetRatio * 60;
  const cashDrag = cashRatio > 0.8 ? 20 : cashRatio > 0.6 ? 10 : 0;
  const tv = Object.values(tickers);
  const avgChange = tv.length > 0 ? tv.reduce((s, t) => s + Math.abs(t.priceChangePercent), 0) / tv.length : 0;
  const riskScore = Math.round(Math.min(100, Math.max(0, concentrationRisk + cashDrag + Math.min(15, avgChange * 1.5))));
  let diversificationScore = assetRatio > 0
    ? Math.round(Math.max(10, 100 - assetRatio * 80 - (assetRatio > 0.6 ? 20 : 0))) : 100;
  if (cashRatio > 0.5) diversificationScore = Math.round(Math.max(15, diversificationScore - 15));
  const riskLabel = riskScore >= 75 ? "High Risk" : riskScore >= 50 ? "Moderate" : riskScore >= 30 ? "Low Risk" : "Very Low";
  const riskColor = riskScore >= 75 ? "#ef4444" : riskScore >= 50 ? "#f59e0b" : riskScore >= 30 ? "#4ade80" : "#22c55e";
  return { riskScore, diversificationScore, riskLabel, riskColor };
}

function computeActions(portfolio: PD, _tickers: TD, selectedSymbol: string): RebalanceAction[] {
  const total = portfolio.totalValue || 1;
  const actions: RebalanceAction[] = [];
  const cashPercent = (portfolio.cashBalance / total) * 100;
  const assetPercent = (portfolio.assetBalance / total) * 100;
  const targetCash = 25, targetAsset = 75;
  const mcWeight = MARKET_CAP_WEIGHTS[selectedSymbol] ?? 0.03;
  const targetForCurrent = targetAsset * mcWeight;
  if (assetPercent > 1) {
    const diff = assetPercent - targetForCurrent;
    actions.push({
      symbol: selectedSymbol.replace("USDT", ""),
      action: diff > 2 ? "SELL" : "BUY",
      currentPercent: +assetPercent.toFixed(1), targetPercent: +targetForCurrent.toFixed(1),
      diffPercent: +diff.toFixed(1), estimatedAmount: +((Math.abs(diff) / 100) * total).toFixed(2),
    });
  }
  for (const sym of ["BTCUSDT", "ETHUSDT", "SOLUSDT"]) {
    if (sym === selectedSymbol) continue;
    const tw = targetAsset * (MARKET_CAP_WEIGHTS[sym] ?? 0.03);
    if (tw > 3) actions.push({
      symbol: sym.replace("USDT", ""), action: "BUY",
      currentPercent: 0, targetPercent: +tw.toFixed(1), diffPercent: -tw,
      estimatedAmount: +((tw / 100) * total).toFixed(2),
    });
  }
  const cashDiff = cashPercent - targetCash;
  if (Math.abs(cashDiff) > 3) actions.push({
    symbol: "CASH", action: cashDiff > 0 ? "INVEST" : "HOLD",
    currentPercent: +cashPercent.toFixed(1), targetPercent: targetCash,
    diffPercent: +cashDiff.toFixed(1), estimatedAmount: +((Math.abs(cashDiff) / 100) * total).toFixed(2),
  });
  return actions.slice(0, 5);
}

const actionColor = (a: string) =>
  a === "BUY" || a === "INVEST" ? "bg-crypto-green/10 text-crypto-green" :
  a === "SELL" ? "bg-crypto-red/10 text-crypto-red" : "bg-secondary text-muted-foreground";

export function PortfolioRebalancing() {
  const { portfolio, tickers, selectedSymbol } = useCryptoStore();
  const [showConfirm, setShowConfirm] = useState(false);
  const [applied, setApplied] = useState(false);
  const risk = useMemo(() => computeRisk(portfolio, tickers), [portfolio, tickers]);
  const actions = useMemo(() => computeActions(portfolio, tickers, selectedSymbol), [portfolio, tickers, selectedSymbol]);

  const cx = 90, cy = 80, radius = 65, needleLen = 50;
  const needleAngle = 180 - (risk.riskScore / 100) * 180;
  const needleRad = (needleAngle * Math.PI) / 180;
  const nX = cx + needleLen * Math.cos(needleRad), nY = cy - needleLen * Math.sin(needleRad);
  const total = portfolio.totalValue || 1;
  const cashPct = ((portfolio.cashBalance / total) * 100).toFixed(1);
  const assetPct = ((portfolio.assetBalance / total) * 100).toFixed(1);

  const handleApply = () => { setApplied(true); setShowConfirm(false); setTimeout(() => setApplied(false), 3000); };
  const divColor = risk.diversificationScore >= 60 ? "#22c55e" : risk.diversificationScore >= 35 ? "#f59e0b" : "#ef4444";
  const divDash = `${(risk.diversificationScore / 100) * 213.6} 213.6`;
  const arcPath = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.4 }}>
      <Card className="glass-card card-accent-cyan">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Scale className="w-4 h-4 text-crypto-cyan" /> Portfolio Rebalancing
            </CardTitle>
            <div className="flex items-center gap-1.5 text-[10px]">
              <Shield className="w-3 h-3 text-crypto-cyan" />
              <span className="text-muted-foreground">AI-Powered</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Top: Risk Gauge + Diversification + Current Allocation */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Risk Meter Gauge */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Risk Level</span>
              <div className="relative w-[180px] h-[100px]">
                <svg viewBox="0 0 180 90" className="w-full h-full overflow-visible">
                  <defs>
                    <linearGradient id="riskGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#22c55e" /><stop offset="40%" stopColor="#f59e0b" />
                      <stop offset="70%" stopColor="#fb923c" /><stop offset="100%" stopColor="#ef4444" />
                    </linearGradient>
                    <filter id="riskGlow"><feGaussianBlur stdDeviation="2" result="b" />
                      <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>
                  <path d={arcPath} fill="none" stroke="oklch(1 0 0 / 6%)" strokeWidth={12} strokeLinecap="round" />
                  <path d={arcPath} fill="none" stroke="url(#riskGrad)" strokeWidth={12} strokeLinecap="round" opacity={0.25} />
                  <motion.path d={arcPath} fill="none" stroke="url(#riskGrad)" strokeWidth={12} strokeLinecap="round"
                    initial={{ pathLength: 0 }} animate={{ pathLength: risk.riskScore / 100 }}
                    transition={{ duration: 1.2, ease: "easeOut" }} style={{ pathLength: 1 }} />
                  <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
                    <line x1={cx} y1={cy} x2={nX} y2={nY} stroke={risk.riskColor} strokeWidth={2}
                      strokeLinecap="round" filter="url(#riskGlow)" opacity={0.4} />
                    <motion.line x1={cx} y1={cy} x2={nX} y2={nY} stroke={risk.riskColor} strokeWidth={2}
                      strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                      transition={{ delay: 0.4, duration: 0.8, ease: "easeOut" }} />
                    <circle cx={cx} cy={cy} r={3} fill={risk.riskColor} />
                  </motion.g>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-0.5">
                  <motion.span className="text-xl font-bold number-animate" style={{ color: risk.riskColor }}
                    initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.7, type: "spring", stiffness: 200 }}>
                    {risk.riskScore}
                  </motion.span>
                  <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: risk.riskColor }}>
                    {risk.riskLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Diversification Score */}
            <div className="flex flex-col items-center justify-center">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Diversification</span>
              <div className="relative w-20 h-20">
                <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="oklch(1 0 0 / 6%)" strokeWidth={6} />
                  <motion.circle cx="40" cy="40" r="34" fill="none" stroke={divColor} strokeWidth={6}
                    strokeLinecap="round" initial={{ strokeDasharray: "0 213.6" }} animate={{ strokeDasharray: divDash }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="pulse-soft" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold number-animate gradient-text-cyan">{risk.diversificationScore}%</span>
                </div>
              </div>
              <span className={cn("text-[10px] font-semibold mt-1",
                risk.diversificationScore >= 60 ? "text-crypto-green" :
                risk.diversificationScore >= 35 ? "text-crypto-gold" : "text-crypto-red")}>
                {risk.diversificationScore >= 60 ? "Well Diversified" :
                 risk.diversificationScore >= 35 ? "Needs Improvement" : "Poorly Diversified"}
              </span>
            </div>

            {/* Current Allocation */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Current Allocation</span>
              {[
                { label: "Cash", pct: cashPct, color: "bg-crypto-cyan", textCls: "gradient-text-cyan", value: portfolio.cashBalance },
                { label: selectedSymbol.replace("USDT", ""), pct: assetPct, color: "bg-crypto-gold", textCls: "text-crypto-gold", value: portfolio.assetBalance },
              ].map((item) => (
                <div key={item.label} className="p-2 rounded-lg bg-secondary/30 border border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", item.color)} />
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                    </div>
                    <span className={cn("text-xs font-bold number-animate", item.textCls)}>{item.pct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-secondary rounded-full mt-1.5 overflow-hidden">
                    <motion.div className={cn("h-full rounded-full", item.color)}
                      initial={{ width: 0 }} animate={{ width: `${item.pct}%` }} transition={{ duration: 0.8 }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">${formatPrice(item.value)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rebalancing Actions */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-crypto-cyan" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Suggested Actions</span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto cyan-scrollbar">
              {actions.map((a, i) => (
                <motion.div key={a.symbol}
                  className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 border border-border/50 transition-colors hover:bg-secondary/50"
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * i, duration: 0.3 }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", actionColor(a.action))}>{a.action}</span>
                    <span className="text-xs font-medium truncate">{a.symbol}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span>{a.currentPercent}%</span>
                      <motion.div
                        initial={{ x: -4, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.15 * i + 0.3 }}
                      >
                        <ArrowRight className="w-3 h-3 text-crypto-cyan" />
                      </motion.div>
                      <span className="text-foreground font-semibold">{a.targetPercent}%</span>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={cn("text-xs font-bold min-w-[70px] text-right cursor-help",
                          a.action === "BUY" || a.action === "INVEST" ? "text-crypto-green" : "text-crypto-red")}>
                          ${formatPrice(a.estimatedAmount)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={4}>
                        <p className="text-xs">
                          {a.action === "BUY" ? `Buy $${formatPrice(a.estimatedAmount)} of ${a.symbol}` :
                           a.action === "SELL" ? `Sell $${formatPrice(a.estimatedAmount)} of ${a.symbol}` :
                           a.action === "INVEST" ? `Invest $${formatPrice(a.estimatedAmount)} from cash` :
                           `Hold current ${a.symbol} position`}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Apply Button + Confirmation Dialog */}
          <div className="pt-1">
            <AnimatePresence mode="wait">
              {applied ? (
                <motion.div key="applied"
                  className="flex items-center justify-center gap-2 p-2.5 rounded-lg bg-crypto-green/10 border border-crypto-green/30 text-crypto-green"
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs font-semibold">Suggestions Applied (Mock)</span>
                </motion.div>
              ) : (
                <motion.button key="apply"
                  className="w-full p-2.5 rounded-lg btn-gradient-cyan text-white text-xs font-semibold flex items-center justify-center gap-2 touch-target"
                  onClick={() => setShowConfirm(true)} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                  <Scale className="w-3.5 h-3.5" /> Apply Rebalancing Suggestions
                </motion.button>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {showConfirm && (
                <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowConfirm(false)}>
                  <motion.div className="glass-card card-accent-cyan p-5 max-w-sm mx-4 w-full"
                    initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-crypto-gold" />
                        <span className="text-sm font-bold">Confirm Rebalancing</span>
                      </div>
                      <button className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-secondary/60 transition-colors"
                        onClick={() => setShowConfirm(false)}><X className="w-3.5 h-3.5" /></button>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                      This will adjust your portfolio allocation. This is a <strong>mock operation</strong> — no real trades will be executed.
                    </p>
                    <div className="space-y-1.5 mb-4 max-h-32 overflow-y-auto cyan-scrollbar">
                      {actions.map((a) => (
                        <div key={a.symbol} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className={cn("px-1 py-0.5 rounded text-[9px] font-bold", actionColor(a.action))}>{a.action}</span>
                            {a.symbol}
                          </span>
                          <span className="font-mono">${formatPrice(a.estimatedAmount)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button className="flex-1 p-2 rounded-lg bg-secondary/60 border border-border/50 text-xs font-medium hover:bg-secondary/80 transition-colors touch-target"
                        onClick={() => setShowConfirm(false)}>Cancel</button>
                      <button className="flex-1 p-2 rounded-lg btn-gradient-cyan text-white text-xs font-semibold touch-target"
                        onClick={handleApply}>Apply (Mock)</button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
