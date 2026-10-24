"use client";

import * as React from "react";
import { ArrowUpRight, ArrowDownRight, ShieldCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { SmartButton } from "../ui/button";
import { SmartInput } from "../ui/input";
import { SmartBadge } from "../ui/badge";

export function SmartOrderPanel({
  symbol = "BTC/USDT",
  currentPrice = 68840.5,
  onOrderPlaced,
}: {
  symbol?: string;
  currentPrice?: number;
  onOrderPlaced?: (order: {
    side: "BUY" | "SELL";
    type: "MARKET" | "LIMIT" | "STOP";
    price: number;
    amountUsd: number;
  }) => void;
}) {
  const [side, setSide] = React.useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = React.useState<"MARKET" | "LIMIT" | "STOP">("MARKET");
  const [priceInput, setPriceInput] = React.useState<string>(currentPrice.toString());
  const [amountUsd, setAmountUsd] = React.useState<number>(1000);
  const [leverage, setLeverage] = React.useState<number>(1);
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [successToast, setSuccessToast] = React.useState<string | null>(null);

  const availableBalance = 24500.0;
  const assetBase = symbol.split("/")[0] || "BTC";

  const effectivePrice = orderType === "MARKET" ? currentPrice : parseFloat(priceInput) || currentPrice;
  const cryptoAmount = effectivePrice > 0 ? (amountUsd * leverage) / effectivePrice : 0;
  const tradingFee = amountUsd * 0.001; // 0.1%

  const handlePercentage = (pct: number) => {
    setAmountUsd(Math.round(availableBalance * pct));
  };

  const handleSubmit = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      onOrderPlaced?.({
        side,
        type: orderType,
        price: effectivePrice,
        amountUsd,
      });
      setSuccessToast(`Ordem ${side} de $${amountUsd} em ${symbol} executada!`);
      setTimeout(() => setSuccessToast(null), 3000);
    }, 600);
  };

  return (
    <div className="w-full bg-[#141414] border border-neutral-800 rounded-2xl p-5 shadow-2xl flex flex-col justify-between">
      <div>
        {/* Header: Available Balance & Safe Badge */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <span>Saldo Livre:</span>
            <span className="font-mono font-bold text-white">
              ${availableBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDT
            </span>
          </div>
          <SmartBadge variant="success" size="sm" hasDot>
            Conta Protegida (1x Spot)
          </SmartBadge>
        </div>

        {/* Side Tabs: BUY / SELL */}
        <div className="grid grid-cols-2 gap-2 my-4">
          <button
            type="button"
            onClick={() => setSide("BUY")}
            className={cn(
              "py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all select-none",
              side === "BUY"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 border border-emerald-500"
                : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
            )}
          >
            <ArrowUpRight className="w-4 h-4" /> Comprar (Long)
          </button>
          <button
            type="button"
            onClick={() => setSide("SELL")}
            className={cn(
              "py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all select-none",
              side === "SELL"
                ? "bg-red-600 text-white shadow-lg shadow-red-600/30 border border-red-500"
                : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
            )}
          >
            <ArrowDownRight className="w-4 h-4" /> Vender (Short)
          </button>
        </div>

        {/* Order Type Toggle */}
        <div className="flex items-center gap-1 p-1 bg-neutral-900 rounded-lg border border-neutral-800 mb-4 text-xs font-semibold">
          {(["MARKET", "LIMIT", "STOP"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setOrderType(t)}
              className={cn(
                "flex-1 py-1.5 rounded-md transition-colors text-center",
                orderType === t ? "bg-neutral-800 text-white shadow-sm" : "text-neutral-400 hover:text-white"
              )}
            >
              {t === "MARKET" ? "Mercado" : t === "LIMIT" ? "Limite" : "Stop Loss"}
            </button>
          ))}
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          {orderType !== "MARKET" && (
            <SmartInput
              label="Preço de Execução"
              type="number"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              rightSuffix="USDT"
              isNumeric
            />
          )}

          <SmartInput
            label="Valor Nocional (USD)"
            type="number"
            value={amountUsd}
            onChange={(e) => setAmountUsd(Number(e.target.value))}
            rightSuffix="USDT"
            isNumeric
          />

          {/* Quick Percentages */}
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {[0.25, 0.5, 0.75, 1.0].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => handlePercentage(pct)}
                className="py-1 rounded-md bg-neutral-900 border border-neutral-800 text-[11px] font-mono text-neutral-400 hover:text-white hover:border-neutral-700 transition-colors"
              >
                {pct * 100}%
              </button>
            ))}
          </div>

          {/* Calculated Output */}
          <div className="p-3 bg-neutral-900/80 border border-neutral-800 rounded-xl space-y-1.5 text-xs font-mono text-neutral-400">
            <div className="flex items-center justify-between">
              <span>Quantidade Estimada:</span>
              <span className="text-white font-bold">
                {cryptoAmount.toFixed(5)} {assetBase}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Taxa de Corretagem (0.1%):</span>
              <span className="text-neutral-300">${tradingFee.toFixed(2)} USDT</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Risco Estimado (SL 1.5%):</span>
              <span className="text-amber-400">-${(amountUsd * 0.015).toFixed(2)} USDT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Button & Toast */}
      <div className="pt-4 mt-4 border-t border-neutral-800">
        {successToast && (
          <div className="mb-2 p-2 px-3 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-medium text-center animate-fadeIn">
            ✓ {successToast}
          </div>
        )}

        <SmartButton
          variant={side === "BUY" ? "success" : "danger"}
          size="lg"
          className="w-full font-bold"
          isLoading={isSubmitting}
          onClick={handleSubmit}
          leftIcon={<Zap className="w-4 h-4" />}
        >
          {side === "BUY" ? `Comprar ${assetBase}` : `Vender ${assetBase}`}
        </SmartButton>
      </div>
    </div>
  );
}
