"use client";

import { useState, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calculator, Target, Layers, DollarSign, Percent, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Position Size Tab ─── */
function PositionSizeTab() {
  const { tickers, selectedSymbol } = useCryptoStore();
  const currentPrice = tickers[selectedSymbol]?.price ?? 0;

  const [balance, setBalance] = useState<string>("10000");
  const [riskPct, setRiskPct] = useState<string>("2");
  const [entryPrice, setEntryPrice] = useState<string>(currentPrice ? String(currentPrice) : "0");
  const [stopLoss, setStopLoss] = useState<string>(currentPrice ? String(currentPrice * 0.97) : "0");

  const results = useMemo(() => {
    const bal = parseFloat(balance) || 0;
    const risk = parseFloat(riskPct) || 0;
    const entry = parseFloat(entryPrice) || 0;
    const sl = parseFloat(stopLoss) || 0;
    const diff = Math.abs(entry - sl);

    const riskAmount = bal * (risk / 100);
    const positionSize = diff > 0 ? riskAmount / diff : 0;
    const positionValue = positionSize * entry;

    return { riskAmount, positionSize, positionValue, diff, entry, sl };
  }, [balance, riskPct, entryPrice, stopLoss]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <DollarSign className="w-3 h-3 text-crypto-cyan" />
            Saldo da Conta
          </label>
          <Input
            type="number"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder="10000"
            className="input-glow h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Percent className="w-3 h-3 text-crypto-cyan" />
            Risco %
          </label>
          <Input
            type="number"
            value={riskPct}
            onChange={(e) => setRiskPct(e.target.value)}
            placeholder="2"
            step="0.5"
            className="input-glow h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-crypto-green" />
            Preço de Entrada
          </label>
          <Input
            type="number"
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            placeholder="0"
            className="input-glow h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <TrendingDown className="w-3 h-3 text-crypto-red" />
            Stop Loss
          </label>
          <Input
            type="number"
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            placeholder="0"
            className="input-glow h-8 text-sm"
          />
        </div>
      </div>

      {/* Results */}
      <div className="grid grid-cols-3 gap-2">
        <div className="glass-card p-3 text-center card-accent-cyan">
          <p className="text-[10px] text-muted-foreground mb-1">Tamanho da Posição</p>
          <p className="text-sm font-bold gradient-text-cyan">
            {results.positionSize > 0 ? formatPrice(results.positionSize) : "0.00"}
          </p>
          <p className="text-[10px] text-muted-foreground">unidades</p>
        </div>
        <div className="glass-card p-3 text-center card-accent-green">
          <p className="text-[10px] text-muted-foreground mb-1">Valor da Posição</p>
          <p className="text-sm font-bold gradient-text-green">
            ${results.positionValue > 0 ? formatPrice(results.positionValue) : "0.00"}
          </p>
          <p className="text-[10px] text-muted-foreground">total</p>
        </div>
        <div className="glass-card p-3 text-center card-accent-red">
          <p className="text-[10px] text-muted-foreground mb-1">Valor em Risco</p>
          <p className="text-sm font-bold text-crypto-red">
            ${results.riskAmount > 0 ? formatPrice(results.riskAmount) : "0.00"}
          </p>
          <p className="text-[10px] text-muted-foreground">em risco</p>
        </div>
      </div>

      {results.diff === 0 && parseFloat(entryPrice) > 0 && (
        <p className="text-[10px] text-crypto-gold flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Preço de entrada e Stop Loss devem ser diferentes para calcular o tamanho da posição.
        </p>
      )}
    </div>
  );
}

/* ─── Risk/Reward Tab ─── */
function RiskRewardTab() {
  const { tickers, selectedSymbol } = useCryptoStore();
  const currentPrice = tickers[selectedSymbol]?.price ?? 0;

  const [entryPrice, setEntryPrice] = useState<string>(currentPrice ? String(currentPrice) : "0");
  const [takeProfit, setTakeProfit] = useState<string>(currentPrice ? String(currentPrice * 1.05) : "0");
  const [stopLoss, setStopLoss] = useState<string>(currentPrice ? String(currentPrice * 0.97) : "0");

  const results = useMemo(() => {
    const entry = parseFloat(entryPrice) || 0;
    const tp = parseFloat(takeProfit) || 0;
    const sl = parseFloat(stopLoss) || 0;

    const risk = Math.abs(entry - sl);
    const reward = Math.abs(tp - entry);
    const ratio = risk > 0 ? reward / risk : 0;
    const riskPct = entry > 0 ? (risk / entry) * 100 : 0;
    const rewardPct = entry > 0 ? (reward / entry) * 100 : 0;

    let assessment = "";
    let assessmentColor = "";
    if (ratio >= 3) {
      assessment = "Excelente configuração de trade";
      assessmentColor = "text-crypto-green";
    } else if (ratio >= 2) {
      assessment = "Bom trade — R:R favorável";
      assessmentColor = "text-crypto-green";
    } else if (ratio >= 1) {
      assessment = "Aceitável — considere apertar o stop";
      assessmentColor = "text-crypto-gold";
    } else if (ratio > 0) {
      assessment = "Considere ajustar — risco excede retorno";
      assessmentColor = "text-crypto-red";
    } else {
      assessment = "Insira preços para calcular";
      assessmentColor = "text-muted-foreground";
    }

    return { risk, reward, ratio, riskPct, rewardPct, assessment, assessmentColor };
  }, [entryPrice, takeProfit, stopLoss]);

  // Bar proportions
  const total = results.risk + results.reward;
  const riskWidth = total > 0 ? (results.risk / total) * 100 : 50;
  const rewardWidth = total > 0 ? (results.reward / total) * 100 : 50;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-crypto-cyan" />
            Preço de Entrada
          </label>
          <Input
            type="number"
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            placeholder="0"
            className="input-glow h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-crypto-green" />
            Take Profit
          </label>
          <Input
            type="number"
            value={takeProfit}
            onChange={(e) => setTakeProfit(e.target.value)}
            placeholder="0"
            className="input-glow h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <TrendingDown className="w-3 h-3 text-crypto-red" />
            Stop Loss
          </label>
          <Input
            type="number"
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            placeholder="0"
            className="input-glow h-8 text-sm"
          />
        </div>
      </div>

      {/* Risk/Reward Visual Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Risco ({riskWidth.toFixed(1)}%)</span>
          <span>Retorno ({rewardWidth.toFixed(1)}%)</span>
        </div>
        <div className="h-6 rounded-full overflow-hidden flex bg-secondary">
          <motion.div
            className="bg-gradient-to-r from-crypto-red/80 to-crypto-red/50 h-full flex items-center justify-center"
            initial={{ width: 0 }}
            animate={{ width: `${riskWidth}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {riskWidth > 15 && (
              <span className="text-[9px] font-bold text-white">
                {formatPrice(results.risk)}
              </span>
            )}
          </motion.div>
          <motion.div
            className="bg-gradient-to-r from-crypto-green/50 to-crypto-green/80 h-full flex items-center justify-center"
            initial={{ width: 0 }}
            animate={{ width: `${rewardWidth}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {rewardWidth > 15 && (
              <span className="text-[9px] font-bold text-white">
                {formatPrice(results.reward)}
              </span>
            )}
          </motion.div>
        </div>
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="glass-card p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground">Risco</p>
          <p className="text-xs font-bold text-crypto-red">${formatPrice(results.risk)}</p>
        </div>
        <div className="glass-card p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground">Retorno</p>
          <p className="text-xs font-bold text-crypto-green">${formatPrice(results.reward)}</p>
        </div>
        <div className="glass-card p-2.5 text-center card-accent-cyan">
          <p className="text-[10px] text-muted-foreground">R:R Ratio</p>
          <p className="text-xs font-bold gradient-text-cyan">
            {results.ratio > 0 ? `1:${results.ratio.toFixed(2)}` : "—"}
          </p>
        </div>
        <div className="glass-card p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground">Risk %</p>
          <p className="text-xs font-bold text-crypto-red">{results.riskPct.toFixed(2)}%</p>
        </div>
        <div className="glass-card p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground">Reward %</p>
          <p className="text-xs font-bold text-crypto-green">{results.rewardPct.toFixed(2)}%</p>
        </div>
      </div>

      {/* Assessment */}
      <div className={cn("text-xs font-medium flex items-center gap-1.5", results.assessmentColor)}>
        {results.ratio >= 2 ? (
          <CheckCircle2 className="w-3.5 h-3.5" />
        ) : results.ratio > 0 ? (
          <AlertTriangle className="w-3.5 h-3.5" />
        ) : null}
        {results.assessment}
      </div>
    </div>
  );
}

/* ─── DCA Calculator Tab ─── */
interface DCAOrder {
  order: number;
  price: number;
  quantity: number;
  investment: number;
  cumulativeInvestment: number;
  cumulativeUnits: number;
  avgPrice: number;
}

function DCACalculatorTab() {
  const { tickers, selectedSymbol } = useCryptoStore();
  const currentPrice = tickers[selectedSymbol]?.price ?? 0;

  const [investmentAmount, setInvestmentAmount] = useState<string>("500");
  const [numOrders, setNumOrders] = useState<string>("5");
  const [priceDropPct, setPriceDropPct] = useState<string>("5");

  const orders = useMemo((): DCAOrder[] => {
    const invest = parseFloat(investmentAmount) || 0;
    const n = parseInt(numOrders) || 0;
    const drop = parseFloat(priceDropPct) || 0;

    if (invest <= 0 || n <= 0 || drop <= 0 || currentPrice <= 0) return [];

    const result: DCAOrder[] = [];
    let cumulativeInvestment = 0;
    let cumulativeUnits = 0;

    for (let i = 0; i < n; i++) {
      const price = currentPrice * Math.pow(1 - drop / 100, i);
      const quantity = invest / price;
      cumulativeInvestment += invest;
      cumulativeUnits += quantity;
      const avgPrice = cumulativeUnits > 0 ? cumulativeInvestment / cumulativeUnits : 0;

      result.push({
        order: i + 1,
        price,
        quantity,
        investment: invest,
        cumulativeInvestment,
        cumulativeUnits,
        avgPrice,
      });
    }

    return result;
  }, [investmentAmount, numOrders, priceDropPct, currentPrice]);

  const summary = useMemo(() => {
    if (orders.length === 0) return null;
    const last = orders[orders.length - 1];
    const totalInvested = last.cumulativeInvestment;
    const totalUnits = last.cumulativeUnits;
    const avgPrice = last.avgPrice;
    const currentValue = totalUnits * currentPrice;
    const pnl = currentValue - totalInvested;
    const pnlPct = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

    return { totalInvested, totalUnits, avgPrice, currentValue, pnl, pnlPct };
  }, [orders, currentPrice]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <DollarSign className="w-3 h-3 text-crypto-cyan" />
            Investimento / Ordem
          </label>
          <Input
            type="number"
            value={investmentAmount}
            onChange={(e) => setInvestmentAmount(e.target.value)}
            placeholder="500"
            className="input-glow h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-crypto-cyan" />
            Número de Ordens
          </label>
          <Input
            type="number"
            value={numOrders}
            onChange={(e) => setNumOrders(e.target.value)}
            placeholder="5"
            min="2"
            max="20"
            className="input-glow h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <TrendingDown className="w-3 h-3 text-crypto-red" />
            Queda de Preço % / Ordem
          </label>
          <Input
            type="number"
            value={priceDropPct}
            onChange={(e) => setPriceDropPct(e.target.value)}
            placeholder="5"
            step="0.5"
            className="input-glow h-8 text-sm"
          />
        </div>
      </div>

      {/* DCA Table */}
      {orders.length > 0 && (
        <div className="overflow-x-auto max-h-52 overflow-y-auto cyan-scrollbar mobile-scroll-x">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">#</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Preço</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Qty</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Investido</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Inv. Acum.</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Preço Médio</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {orders.map((o) => (
                  <motion.tr
                    key={o.order}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: o.order * 0.04 }}
                    className="border-b border-border/20 table-row-hover"
                  >
                    <td className="py-1.5 px-2 font-medium text-crypto-cyan">{o.order}</td>
                    <td className="py-1.5 px-2 text-right">${formatPrice(o.price)}</td>
                    <td className="py-1.5 px-2 text-right">{o.quantity.toFixed(6)}</td>
                    <td className="py-1.5 px-2 text-right">${formatPrice(o.investment)}</td>
                    <td className="py-1.5 px-2 text-right">${formatPrice(o.cumulativeInvestment)}</td>
                    <td className="py-1.5 px-2 text-right font-medium">${formatPrice(o.avgPrice)}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="glass-card p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">Total Investido</p>
            <p className="text-xs font-bold">${formatPrice(summary.totalInvested)}</p>
          </div>
          <div className="glass-card p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">Total de Unidades</p>
            <p className="text-xs font-bold gradient-text-cyan">{summary.totalUnits.toFixed(6)}</p>
          </div>
          <div className="glass-card p-2.5 text-center card-accent-cyan">
            <p className="text-[10px] text-muted-foreground">Entrada Média</p>
            <p className="text-xs font-bold gradient-text-cyan">${formatPrice(summary.avgPrice)}</p>
          </div>
          <div className="glass-card p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">Valor Atual</p>
            <p className="text-xs font-bold">${formatPrice(summary.currentValue)}</p>
          </div>
          <div className={cn("glass-card p-2.5 text-center", summary.pnl >= 0 ? "card-accent-green" : "card-accent-red")}>
            <p className="text-[10px] text-muted-foreground">L/P</p>
            <p className={cn("text-xs font-bold", summary.pnl >= 0 ? "text-crypto-green" : "text-crypto-red")}>
              {summary.pnl >= 0 ? "+" : ""}{formatPrice(summary.pnl)} ({summary.pnlPct.toFixed(2)}%)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ─── */
export function TradingCalculator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
    >
      <Card className="glass-card card-accent-cyan h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calculator className="w-4 h-4 text-crypto-cyan" />
            Calculadora de Trading
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="position" className="w-full">
            <TabsList className="w-full h-8 mb-3">
              <TabsTrigger value="position" className="text-[11px] gap-1 h-6">
                <Target className="w-3 h-3" />
                Posição
              </TabsTrigger>
              <TabsTrigger value="riskreward" className="text-[11px] gap-1 h-6">
                <Layers className="w-3 h-3" />
                Risco/Retorno
              </TabsTrigger>
              <TabsTrigger value="dca" className="text-[11px] gap-1 h-6">
                <DollarSign className="w-3 h-3" />
                Calculadora DCA
              </TabsTrigger>
            </TabsList>
            <TabsContent value="position">
              <PositionSizeTab />
            </TabsContent>
            <TabsContent value="riskreward">
              <RiskRewardTab />
            </TabsContent>
            <TabsContent value="dca">
              <DCACalculatorTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
}
