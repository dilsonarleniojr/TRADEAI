"use client";

import * as React from "react";
import { ArrowUpRight, ArrowDownRight, ShieldCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { SmartButton } from "../ui/button";
import { SmartInput } from "../ui/input";
import { SmartBadge } from "../ui/badge";

export function SmartOrderPanel({
  symbol = "BTC/USDT",
  currentPrice: propPrice,
  tradingMode = "paper",
  availableBalance: propBalance,
  onOrderPlaced,
}: {
  symbol?: string;
  currentPrice?: number;
  tradingMode?: "live" | "paper";
  availableBalance?: number;
  onOrderPlaced?: (order: {
    side: "BUY" | "SELL";
    type: "MARKET" | "LIMIT" | "STOP";
    price: number;
    amountUsd: number;
    result?: any;
  }) => void;
}) {
  const [side, setSide] = React.useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = React.useState<"MARKET" | "LIMIT" | "STOP">("MARKET");
  const [livePrice, setLivePrice] = React.useState<number>(propPrice || 80900.0);
  const [priceInput, setPriceInput] = React.useState<string>(String(propPrice || 80900.0));
  const [amountUsd, setAmountUsd] = React.useState<number>(10);
  const [leverage, setLeverage] = React.useState<number>(1);
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [successToast, setSuccessToast] = React.useState<string | null>(null);
  const [errorToast, setErrorToast] = React.useState<string | null>(null);

  // Saldos reais da conta
  const [cashBalance, setCashBalance] = React.useState<number>(propBalance ?? (tradingMode === "live" ? 0.85 : 10000.0));
  const [assetHoldings, setAssetHoldings] = React.useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = React.useState<boolean>(false);

  const cleanSymbol = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const assetBase = symbol.split("/")[0] || "BTC";

  // Buscar saldo real e preço atualizado
  const refreshAccountAndPrice = React.useCallback(async () => {
    setIsLoadingBalance(true);
    try {
      // 1. Preço de mercado real
      const tickerRes = await fetch(`/api/market/ticker?symbol=${cleanSymbol}`);
      if (tickerRes.ok) {
        const tickerJson = await tickerRes.json();
        const found = Array.isArray(tickerJson.data)
          ? tickerJson.data.find((t: any) => t.symbol === cleanSymbol)
          : tickerJson.data;
        if (found?.lastPrice) {
          const p = parseFloat(found.lastPrice);
          if (p > 0) {
            setLivePrice(p);
            if (orderType === "MARKET") {
              setPriceInput(p.toString());
            }
          }
        }
      }

      // 2. Saldo da conta (Paper ou Live)
      const accRes = await fetch(`/api/account?mode=${tradingMode}`);
      if (accRes.ok) {
        const accJson = await accRes.json();
        if (accJson.success && accJson.data) {
          const free = typeof accJson.data.cashFree === "number" ? accJson.data.cashFree : accJson.data.cashBalance;
          setCashBalance(free || 0);

          // Verificar se temos o ativo em posições
          const pos = accJson.data.positions?.find((p: any) => p.symbol === cleanSymbol);
          if (pos) {
            setAssetHoldings(pos.quantity || 0);
          } else if (accJson.data.symbol === cleanSymbol) {
            setAssetHoldings(accJson.data.assetQuantity || 0);
          } else {
            setAssetHoldings(0);
          }
        }
      }
    } catch (err: any) {
      console.warn("[SmartOrderPanel] Erro ao sincronizar mercado/saldo:", err.message);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [cleanSymbol, tradingMode, orderType]);

  React.useEffect(() => {
    refreshAccountAndPrice();
    const interval = setInterval(refreshAccountAndPrice, 8000);
    return () => clearInterval(interval);
  }, [refreshAccountAndPrice]);

  React.useEffect(() => {
    if (propPrice && propPrice > 0) {
      setLivePrice(propPrice);
      setPriceInput(propPrice.toString());
    }
  }, [propPrice]);

  const effectivePrice = orderType === "MARKET" ? livePrice : parseFloat(priceInput) || livePrice;
  const cryptoAmount = effectivePrice > 0 ? (amountUsd * leverage) / effectivePrice : 0;
  const tradingFee = amountUsd * 0.001; // 0.1%

  const handlePercentage = (pct: number) => {
    if (side === "BUY") {
      const target = Math.max(5.0, parseFloat((cashBalance * pct).toFixed(2)));
      setAmountUsd(target);
    } else {
      // Para venda, calcula o equivalente em USD da quantidade mantida
      if (assetHoldings > 0 && effectivePrice > 0) {
        const holdingUsd = assetHoldings * effectivePrice;
        const target = parseFloat((holdingUsd * pct).toFixed(2));
        setAmountUsd(target);
      }
    }
  };

  const handleSubmit = async () => {
    setErrorToast(null);
    setSuccessToast(null);

    // Validações locais pré-trade
    if (amountUsd < 5.0) {
      setErrorToast("O valor mínimo exigido pela Binance para negociação Spot é de $5.00 USDT (minNotional).");
      return;
    }

    if (side === "BUY" && amountUsd > cashBalance) {
      setErrorToast(
        `Saldo livre insuficiente. Sua carteira possui $${cashBalance.toFixed(2)} USDT livres, mas a ordem requer $${amountUsd.toFixed(2)} USDT.`
      );
      return;
    }

    if (side === "SELL" && assetHoldings > 0 && effectivePrice > 0) {
      const maxSellUsd = assetHoldings * effectivePrice * 1.02;
      if (amountUsd > maxSellUsd) {
        setErrorToast(
          `Você possui ${assetHoldings.toFixed(6)} ${assetBase} em custódia (~$${(assetHoldings * effectivePrice).toFixed(2)} USD). O valor da ordem excede o saldo da moeda.`
        );
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const payload = {
        symbol: cleanSymbol,
        side,
        price: effectivePrice,
        quantity: cryptoAmount,
        total: amountUsd,
        strategy: `Smart Trading (${tradingMode === "live" ? "Real" : "Paper"})`,
        mode: tradingMode,
        orderType: orderType === "STOP" ? "LIMIT" : orderType,
        limitPrice: orderType !== "MARKET" ? effectivePrice : undefined,
      };

      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        const errorMsg = json.error || "Falha na execução da ordem pela Binance.";
        setErrorToast(errorMsg);
      } else {
        const execQty = json.data?.quantity || cryptoAmount;
        const execPrice = json.data?.price || effectivePrice;
        const orderId = json.binanceOrder?.orderId || json.data?.id;

        const modeLabel = tradingMode === "live" ? "🟢 DINHEIRO REAL (Binance)" : "🧪 SIMULADO (Paper)";
        setSuccessToast(
          `[${modeLabel}] Ordem ${side} de ${execQty.toFixed(6)} ${assetBase} executada a $${execPrice.toFixed(2)}! ${
            orderId ? `(ID: ${orderId})` : ""
          }`
        );

        onOrderPlaced?.({
          side,
          type: orderType,
          price: execPrice,
          amountUsd,
          result: json,
        });

        // Recarrega saldos imediatamente
        refreshAccountAndPrice();
      }
    } catch (err: any) {
      setErrorToast(`Erro de comunicação com o servidor: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full bg-[var(--st-bg-surface)] border border-[var(--st-border)] rounded-2xl p-5 shadow-2xl flex flex-col justify-between">
      <div>
        {/* Header: Available Balance & Safe Badge */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--st-border)]">
          <div className="flex flex-col text-xs">
            <div className="flex items-center gap-1.5 text-[var(--st-text-secondary)]">
              <span>Saldo Livre:</span>
              <span className="font-mono font-bold text-[var(--st-text-primary)]">
                ${cashBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
              </span>
            </div>
            {assetHoldings > 0 && (
              <span className="text-[10px] font-mono text-[var(--st-primary)] font-medium">
                Em custódia: {assetHoldings.toFixed(6)} {assetBase}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {tradingMode === "live" ? (
              <SmartBadge variant="danger" size="sm" isDot>
                Binance Spot Real (1x)
              </SmartBadge>
            ) : (
              <SmartBadge variant="success" size="sm" isDot>
                Paper Trading (1x)
              </SmartBadge>
            )}
          </div>
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
                : "bg-[var(--st-bg-elevated)] text-[var(--st-text-secondary)] hover:text-[var(--st-text-primary)] border border-[var(--st-border)]"
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
                : "bg-[var(--st-bg-elevated)] text-[var(--st-text-secondary)] hover:text-[var(--st-text-primary)] border border-[var(--st-border)]"
            )}
          >
            <ArrowDownRight className="w-4 h-4" /> Vender (Short)
          </button>
        </div>

        {/* Order Type Toggle */}
        <div className="flex items-center gap-1 p-1 bg-[var(--st-bg-elevated)] rounded-lg border border-[var(--st-border)] mb-4 text-xs font-semibold">
          {(["MARKET", "LIMIT", "STOP"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setOrderType(t)}
              className={cn(
                "flex-1 py-1.5 rounded-md transition-colors text-center",
                orderType === t
                  ? "bg-[var(--st-primary)] text-white shadow-sm font-bold"
                  : "text-[var(--st-text-secondary)] hover:text-[var(--st-text-primary)]"
              )}
            >
              {t === "MARKET" ? "A Mercado" : t === "LIMIT" ? "Limite" : "Stop Loss"}
            </button>
          ))}
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          {orderType !== "MARKET" && (
            <SmartInput
              label="Preço Limite de Execução"
              type="number"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              rightSuffix="USDT"
              isNumeric
            />
          )}

          <SmartInput
            label="Valor Total da Operação (USD)"
            type="number"
            value={amountUsd}
            onChange={(e) => setAmountUsd(Number(e.target.value))}
            rightSuffix="USDT"
            isNumeric
            helperText="Mínimo de $5.00 USDT exigido pelo livro Binance"
          />

          {/* Quick Percentages */}
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {[0.25, 0.5, 0.75, 1.0].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => handlePercentage(pct)}
                className="py-1 rounded-md bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-[11px] font-mono text-[var(--st-text-secondary)] hover:text-[var(--st-text-primary)] hover:border-[var(--st-primary)] transition-colors"
              >
                {pct * 100}%
              </button>
            ))}
          </div>

          {/* Calculated Output */}
          <div className="p-3 bg-[var(--st-bg-elevated)] border border-[var(--st-border)] rounded-xl space-y-1.5 text-xs font-mono text-[var(--st-text-secondary)]">
            <div className="flex items-center justify-between">
              <span>Cotação Binance Atual:</span>
              <span className="text-[var(--st-text-primary)] font-bold">
                ${livePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Quantidade Estimada:</span>
              <span className="text-[var(--st-text-primary)] font-bold">
                {cryptoAmount.toFixed(6)} {assetBase}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Taxa Spot Taker (0.1%):</span>
              <span className="text-[var(--st-text-muted)]">${tradingFee.toFixed(3)} USDT</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Trava de Stop Loss (2.0%):</span>
              <span className="text-amber-500 font-semibold">-${(amountUsd * 0.02).toFixed(2)} USDT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Button & Toast */}
      <div className="pt-4 mt-4 border-t border-[var(--st-border)] space-y-2">
        {errorToast && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium space-y-1 animate-in fade-in">
            <div className="font-bold flex items-center gap-1.5">
              <span>⚠️ Bloqueio de Segurança / Rejeição:</span>
            </div>
            <p className="leading-relaxed">{errorToast}</p>
          </div>
        )}

        {successToast && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs font-medium space-y-1 animate-in fade-in">
            <div className="font-bold">✓ Execução Concluída com Sucesso:</div>
            <p className="leading-relaxed font-mono">{successToast}</p>
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
          {tradingMode === "live"
            ? side === "BUY"
              ? `Comprar ${assetBase} (Dinheiro Real)`
              : `Vender ${assetBase} (Dinheiro Real)`
            : side === "BUY"
            ? `Comprar ${assetBase} (Simulado)`
            : `Vender ${assetBase} (Simulado)`}
        </SmartButton>
      </div>
    </div>
  );
}
