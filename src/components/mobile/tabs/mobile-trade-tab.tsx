"use client";

import React, { useState, useEffect, useMemo, memo, useCallback } from "react";
import { useCryptoStore, type KlineData, type TradeData, type TickerData } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { getOrderBookSnapshot, estimateDepthSlippage, type OrderBookSnapshot } from "@/lib/bot/order-book-cache";
import { OrderBookFetchError } from "@/lib/performance/binance-worker-manager";
import { structuredLogger } from "@/lib/telemetry/structured-logger";
import { validateQuickTradeExecution } from "@/components/chart/quick-trade-guard";
import { useToast } from "@/hooks/use-toast";
import {
  MOBILE_PAIRS,
  computeMobileIndicators,
  formatMonoPrice,
  safeParseResponseJson,
  startSlicedOrderExecution,
} from "../mobile-helpers";
import {
  ArrowDownUp,
  ChevronDown,
  ChevronUp,
  Layers,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CHART_INTERVALS = ["1m", "5m", "15m", "1h", "4h"] as const;
type OrderAlgoType = "MARKET" | "LIMIT" | "TWAP" | "VWAP";

interface PairHeaderProps {
  symbol: string;
  ticker?: TickerData;
  selectedExchange: "binance" | "okx";
  onSelectSymbol: (sym: string) => void;
  onSelectExchange: (ex: "binance" | "okx") => void;
}

const PairHeaderCard = memo(function PairHeaderCard({
  symbol,
  ticker,
  selectedExchange,
  onSelectSymbol,
  onSelectExchange,
}: PairHeaderProps) {
  const price = ticker?.price ?? 0;
  const pct = ticker?.priceChangePercent ?? 0;
  const isUp = pct >= 0;

  return (
    <div className="rounded-xl bg-[#111827] border border-white/10 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <select
            aria-label="Selecionar par"
            value={MOBILE_PAIRS.includes(symbol as any) ? symbol : "BTCUSDT"}
            onChange={(e) => onSelectSymbol(e.target.value)}
            className="bg-[#090D16] border border-white/10 rounded-lg px-2.5 py-1.5 text-sm font-bold text-white font-mono focus:outline-none focus:border-[#6366F1]"
          >
            {MOBILE_PAIRS.map((p) => (
              <option key={p} value={p} className="bg-[#111827] text-white">
                {p.replace("USDT", "/USDT")}
              </option>
            ))}
          </select>

          <div className="inline-flex p-0.5 rounded-lg bg-[#090D16] border border-white/10 text-[10px] font-semibold">
            {(["binance", "okx"] as const).map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => onSelectExchange(ex)}
                className={cn(
                  "px-2 py-1 rounded-md transition-colors cursor-pointer uppercase",
                  selectedExchange === ex
                    ? ex === "okx"
                      ? "bg-[#6366F1] text-white"
                      : "bg-amber-500 text-black"
                    : "text-slate-400 hover:text-white"
                )}
              >
                {ex === "okx" ? "OKX" : "Binance"}
              </button>
            ))}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-base font-bold text-white font-mono tabular-nums leading-none">
            ${formatMonoPrice(price)}
          </div>
          <div
            className={cn(
              "text-[11px] font-mono tabular-nums font-semibold mt-0.5 inline-flex items-center gap-0.5",
              isUp ? "text-[#10B981]" : "text-[#F43F5E]"
            )}
          >
            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isUp ? "+" : ""}
            {pct.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-white/10 text-[10px]">
        <div>
          <span className="text-slate-400 block">Máxima 24h</span>
          <span className="text-slate-200 font-mono tabular-nums font-semibold">
            ${formatMonoPrice(ticker?.high ?? 0)}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block">Mínima 24h</span>
          <span className="text-slate-200 font-mono tabular-nums font-semibold">
            ${formatMonoPrice(ticker?.low ?? 0)}
          </span>
        </div>
        <div className="text-right">
          <span className="text-slate-400 block">Vol 24h (USDT)</span>
          <span className="text-slate-200 font-mono tabular-nums font-semibold">
            ${((ticker?.quoteVolume ?? 0) / 1e6).toFixed(1)}M
          </span>
        </div>
      </div>
    </div>
  );
});

interface VerticalChartProps {
  klines: KlineData[];
  currentPrice: number;
  interval: string;
  onIntervalChange: (iv: string) => void;
  botEntryPrice?: number | null;
  aiAction?: "BUY" | "SELL" | "HOLD" | null;
}

const MobileVerticalChart = memo(function MobileVerticalChart({
  klines,
  currentPrice,
  interval,
  onIntervalChange,
  botEntryPrice,
  aiAction,
}: VerticalChartProps) {
  const [showEma, setShowEma] = useState(true);
  const [showVwap, setShowVwap] = useState(true);
  const [showBotSignals, setShowBotSignals] = useState(true);

  const visibleCandles = useMemo(() => klines.slice(-46), [klines]);
  const indicators = useMemo(() => computeMobileIndicators(klines), [klines]);

  const offset = Math.max(0, klines.length - visibleCandles.length);
  const visibleEma9 = useMemo(() => indicators.ema9Series.slice(offset), [indicators.ema9Series, offset]);
  const visibleEma21 = useMemo(() => indicators.ema21Series.slice(offset), [indicators.ema21Series, offset]);
  const visibleVwap = useMemo(() => indicators.vwapSeries.slice(offset), [indicators.vwapSeries, offset]);

  const { minP, maxP } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of visibleCandles) {
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    if (showBotSignals && botEntryPrice && botEntryPrice > 0) {
      if (botEntryPrice < lo) lo = botEntryPrice;
      if (botEntryPrice > hi) hi = botEntryPrice;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
      const ref = currentPrice || 100;
      return { minP: ref * 0.99, maxP: ref * 1.01 };
    }
    const pad = (hi - lo) * 0.08;
    return { minP: lo - pad, maxP: hi + pad };
  }, [visibleCandles, showBotSignals, botEntryPrice, currentPrice]);

  const svgW = 360;
  const svgH = 175;
  const plotW = 308;
  const padTop = 10;
  const plotH = svgH - 22;

  const toY = (p: number) => {
    const span = maxP - minP || 1;
    return padTop + ((maxP - p) / span) * plotH;
  };

  const buildPolyline = (series: number[]) => {
    if (series.length < 2 || visibleCandles.length < 2) return "";
    const step = plotW / visibleCandles.length;
    return series
      .map((val, i) => `${(i * step + step * 0.5).toFixed(1)},${toY(val).toFixed(1)}`)
      .join(" ");
  };

  const stepW = visibleCandles.length > 0 ? plotW / visibleCandles.length : 8;
  const candleW = Math.max(2.5, stepW * 0.62);

  return (
    <div className="rounded-xl bg-[#111827] border border-white/10 p-2.5 flex flex-col justify-between h-[38vh] min-h-[220px] max-h-[300px]">
      {/* Controles superiores: Intervalo + Toggles de Overlays */}
      <div className="flex items-center justify-between gap-1.5 pb-1.5 border-b border-white/10">
        <div className="flex items-center gap-1">
          {CHART_INTERVALS.map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => onIntervalChange(iv)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-mono font-semibold cursor-pointer transition-colors",
                interval === iv ? "bg-[#6366F1] text-white" : "text-slate-400 hover:text-white bg-[#090D16]"
              )}
            >
              {iv}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowEma((v) => !v)}
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-semibold border cursor-pointer",
              showEma
                ? "border-[#6366F1]/50 bg-[#6366F1]/15 text-[#A5B4FC]"
                : "border-white/10 text-slate-500"
            )}
          >
            EMA
          </button>
          <button
            type="button"
            onClick={() => setShowVwap((v) => !v)}
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-semibold border cursor-pointer",
              showVwap
                ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300"
                : "border-white/10 text-slate-500"
            )}
          >
            VWAP
          </button>
          <button
            type="button"
            onClick={() => setShowBotSignals((v) => !v)}
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-semibold border cursor-pointer",
              showBotSignals
                ? "border-[#10B981]/50 bg-[#10B981]/15 text-[#10B981]"
                : "border-white/10 text-slate-500"
            )}
          >
            Bot
          </button>
        </div>
      </div>

      {/* Canvas/SVG de Candles Verticais */}
      <div className="flex-1 w-full relative overflow-hidden pt-1">
        {visibleCandles.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-400 font-mono">
            Carregando velas ({interval})...
          </div>
        ) : (
          <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full">
            {[0.2, 0.5, 0.8].map((ratio) => {
              const y = padTop + plotH * ratio;
              const labelPrice = maxP - (maxP - minP) * ratio;
              return (
                <g key={ratio}>
                  <line x1={0} y1={y} x2={plotW} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 2" />
                  <text x={plotW + 4} y={y + 3} fill="#64748B" fontSize="8" fontFamily="monospace">
                    {formatMonoPrice(labelPrice)}
                  </text>
                </g>
              );
            })}

            {visibleCandles.map((c, idx) => {
              const cx = idx * stepW + stepW * 0.5;
              const isGreen = c.close >= c.open;
              const color = isGreen ? "#10B981" : "#F43F5E";
              const yHigh = toY(c.high);
              const yLow = toY(c.low);
              const yOpen = toY(c.open);
              const yClose = toY(c.close);
              const bodyTop = Math.min(yOpen, yClose);
              const bodyHeight = Math.max(1.5, Math.abs(yClose - yOpen));
              return (
                <g key={c.time ?? idx}>
                  <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={color} strokeWidth={1} />
                  <rect
                    x={cx - candleW / 2}
                    y={bodyTop}
                    width={candleW}
                    height={bodyHeight}
                    fill={color}
                    rx={0.5}
                  />
                </g>
              );
            })}

            {showEma && visibleEma9.length > 1 && (
              <polyline fill="none" stroke="#6366F1" strokeWidth="1.25" points={buildPolyline(visibleEma9)} />
            )}
            {showEma && visibleEma21.length > 1 && (
              <polyline fill="none" stroke="#F59E0B" strokeWidth="1.2" points={buildPolyline(visibleEma21)} />
            )}
            {showVwap && visibleVwap.length > 1 && (
              <polyline
                fill="none"
                stroke="#06B6D4"
                strokeWidth="1.15"
                strokeDasharray="3 2"
                points={buildPolyline(visibleVwap)}
              />
            )}

            {showBotSignals && botEntryPrice && botEntryPrice > 0 && (
              <g>
                <line
                  x1={0}
                  y1={toY(botEntryPrice)}
                  x2={plotW}
                  y2={toY(botEntryPrice)}
                  stroke="#10B981"
                  strokeWidth="1"
                  strokeDasharray="4 2"
                />
                <text x={4} y={Math.max(10, toY(botEntryPrice) - 3)} fill="#10B981" fontSize="8" fontFamily="monospace">
                  ENTRADA BOT ${formatMonoPrice(botEntryPrice)}
                </text>
              </g>
            )}

            {currentPrice > 0 && (
              <g>
                <line
                  x1={0}
                  y1={toY(currentPrice)}
                  x2={plotW}
                  y2={toY(currentPrice)}
                  stroke="rgba(255,255,255,0.4)"
                  strokeDasharray="2 2"
                />
                <rect x={plotW + 1} y={toY(currentPrice) - 6} width={50} height={12} rx={2} fill="#6366F1" />
                <text x={plotW + 4} y={toY(currentPrice) + 3} fill="#FFFFFF" fontSize="7.5" fontFamily="monospace">
                  {formatMonoPrice(currentPrice)}
                </text>
              </g>
            )}
          </svg>
        )}

        {showBotSignals && aiAction && aiAction !== "HOLD" && (
          <span
            className={cn(
              "absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono",
              aiAction === "BUY" ? "bg-[#10B981]/20 text-[#10B981]" : "bg-[#F43F5E]/20 text-[#F43F5E]"
            )}
          >
            SINAL IA: {aiAction}
          </span>
        )}
      </div>

      {/* Rodapé compacto de leitura rápida */}
      <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400 pt-1">
        <span>RSI14: {indicators.rsi14.toFixed(1)}</span>
        <span className="text-[#A5B4FC]">EMA9: {formatMonoPrice(indicators.ema9)}</span>
        <span className="text-amber-300">EMA21: {formatMonoPrice(indicators.ema21)}</span>
      </div>
    </div>
  );
});

const OrderBookRow = memo(function OrderBookRow({
  price,
  volume,
  maxVol,
  side,
  onPickPrice,
}: {
  price: number;
  volume: number;
  maxVol: number;
  side: "bid" | "ask";
  onPickPrice: (p: number) => void;
}) {
  const pct = maxVol > 0 ? Math.min(100, (volume / maxVol) * 100) : 0;
  return (
    <button
      type="button"
      onClick={() => onPickPrice(price)}
      className="relative w-full flex items-center justify-between px-2 py-0.5 text-[11px] font-mono tabular-nums overflow-hidden rounded hover:bg-white/5 cursor-pointer"
    >
      <div
        className={cn(
          "absolute inset-y-0 right-0 opacity-20",
          side === "bid" ? "bg-[#10B981]" : "bg-[#F43F5E]"
        )}
        style={{ width: `${pct}%` }}
      />
      <span className={cn("relative z-10 font-semibold", side === "bid" ? "text-[#10B981]" : "text-[#F43F5E]")}>
        {formatMonoPrice(price)}
      </span>
      <span className="relative z-10 text-slate-300">{volume.toFixed(volume >= 1 ? 3 : 5)}</span>
    </button>
  );
});

export function MobileTradeTab() {
  const { toast } = useToast();
  const {
    selectedSymbol,
    setSelectedSymbol,
    selectedExchange,
    setSelectedExchange,
    tickers,
    klines,
    loadKlinesForSymbol,
    portfolio,
    trades,
    bots,
    aiSignals,
    tradingMode,
    addTrade,
    setAccount,
  } = useCryptoStore(
    useShallow((s) => ({
      selectedSymbol: s.selectedSymbol,
      setSelectedSymbol: s.setSelectedSymbol,
      selectedExchange: s.selectedExchange,
      setSelectedExchange: s.setSelectedExchange,
      tickers: s.tickers,
      klines: s.klines,
      loadKlinesForSymbol: s.loadKlinesForSymbol,
      portfolio: s.portfolio,
      trades: s.trades,
      bots: s.bots,
      aiSignals: s.aiSignals,
      tradingMode: s.tradingMode,
      addTrade: s.addTrade,
      setAccount: s.setAccount,
    }))
  );

  const [interval, setIntervalState] = useState<string>("1m");
  const [innerTab, setInnerTab] = useState<"book" | "trades">("book");
  const [snapshot, setSnapshot] = useState<OrderBookSnapshot | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);

  // Boleta retrátil (Bottom Sheet)
  const [sheetOpen, setSheetOpen] = useState(false);
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL">("BUY");
  const [orderAlgo, setOrderAlgo] = useState<OrderAlgoType>("MARKET");
  const [amountUsdt, setAmountUsdt] = useState<string>("25");
  const [limitPriceInput, setLimitPriceInput] = useState<string>("");
  const [sliceCount, setSliceCount] = useState<number>(4);
  const [submitting, setSubmitting] = useState(false);

  const ticker = tickers[selectedSymbol];
  const currentPrice = ticker?.price ?? 0;

  useEffect(() => {
    loadKlinesForSymbol(selectedSymbol, interval);
  }, [selectedSymbol, interval, loadKlinesForSymbol]);

  useEffect(() => {
    let active = true;
    const refreshDepth = async () => {
      try {
        const snap = await getOrderBookSnapshot(selectedSymbol);
        if (!active) return;
        setSnapshot(snap);
        setBookError(null);
      } catch (err: any) {
        if (!active) return;
        const typedErr =
          err instanceof OrderBookFetchError
            ? err
            : new OrderBookFetchError(err?.message || "Erro ao consultar Order Book L2", selectedSymbol);
        setBookError(typedErr.message);
        structuredLogger.error("MARKET_DATA", `[OrderBookFetchError] ${typedErr.message}`, {
          symbol: selectedSymbol,
        });
      }
    };
    refreshDepth();
    const timer = setInterval(refreshDepth, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selectedSymbol]);

  const topAsks = useMemo(() => (snapshot?.asks || []).slice(0, 8).reverse(), [snapshot]);
  const topBids = useMemo(() => (snapshot?.bids || []).slice(0, 8), [snapshot]);
  const maxBookVol = useMemo(() => {
    let m = 0;
    for (const a of topAsks) if (a.volume > m) m = a.volume;
    for (const b of topBids) if (b.volume > m) m = b.volume;
    return m || 1;
  }, [topAsks, topBids]);

  const activeBotOnPair = useMemo(
    () => bots.find((b) => b.position && b.position.quantity > 0 && b.position.symbol === selectedSymbol),
    [bots, selectedSymbol]
  );
  const aiSignal = useMemo(
    () => aiSignals.find((s) => s.symbol === selectedSymbol) || null,
    [aiSignals, selectedSymbol]
  );

  const recentTradesForPair = useMemo(() => {
    const filtered = trades.filter((t) => t.symbol === selectedSymbol);
    return (filtered.length > 0 ? filtered : trades).slice(0, 14);
  }, [trades, selectedSymbol]);

  const numericAmount = Math.max(0, parseFloat(amountUsdt.replace(",", ".")) || 0);
  const effectivePrice =
    orderAlgo === "LIMIT" && parseFloat(limitPriceInput) > 0 ? parseFloat(limitPriceInput) : currentPrice;
  const estSlippagePct = useMemo(
    () => estimateDepthSlippage(selectedSymbol, numericAmount, orderSide),
    [selectedSymbol, numericAmount, orderSide, snapshot]
  );

  // Guardrail obrigatório: SL <= 2.0% e TP >= 1.5x risco
  const slPercent = 1.8;
  const tpPercent = 3.5;
  const slPrice =
    effectivePrice > 0
      ? orderSide === "BUY"
        ? effectivePrice * (1 - slPercent / 100)
        : effectivePrice * (1 + slPercent / 100)
      : 0;
  const tpPrice =
    effectivePrice > 0
      ? orderSide === "BUY"
        ? effectivePrice * (1 + tpPercent / 100)
        : effectivePrice * (1 - tpPercent / 100)
      : 0;

  const freeCash = portfolio?.cashBalance ?? 0;
  const maxSafeNav5Pct = Math.max(10, parseFloat(((portfolio?.totalValue || freeCash || 100) * 0.05).toFixed(2)));

  const handleOpenBoleta = useCallback(
    (side: "BUY" | "SELL") => {
      setOrderSide(side);
      if (currentPrice > 0 && !limitPriceInput) {
        setLimitPriceInput(String(currentPrice));
      }
      setSheetOpen(true);
    },
    [currentPrice, limitPriceInput]
  );

  const handlePickPrice = useCallback((p: number) => {
    setLimitPriceInput(String(p));
    setOrderAlgo("LIMIT");
    setSheetOpen(true);
  }, []);

  const handleExecuteOrder = async () => {
    if (submitting) return;
    if (effectivePrice <= 0) {
      toast({
        title: "Sem cotação ativa",
        description: "Aguarde a sincronização do preço antes de enviar a ordem.",
        variant: "destructive",
      });
      return;
    }

    const quantity = parseFloat((numericAmount / effectivePrice).toFixed(6));
    const validation = validateQuickTradeExecution({
      isSubmitting: submitting,
      quantity,
      currentPrice: effectivePrice,
      tradingMode,
    });
    if (!validation.canExecute) {
      toast({
        title: "Ordem bloqueada pelo guardrail",
        description: validation.reason || "Ordem rejeitada pelos guardrails.",
        variant: "destructive",
      });
      return;
    }

    if (orderAlgo === "TWAP" || orderAlgo === "VWAP") {
      const id = startSlicedOrderExecution({
        symbol: selectedSymbol,
        side: orderSide,
        totalUsd: numericAmount,
        slices: sliceCount,
        algo: orderAlgo,
        exchange: selectedExchange,
        tradingMode,
      });
      toast({
        title: `${orderAlgo} iniciado (${sliceCount} fatias)`,
        description: `${orderSide} $${numericAmount.toFixed(2)} USDT em ${selectedSymbol} na ${selectedExchange.toUpperCase()} (ID ${id.slice(-6)}).`,
      });
      setSheetOpen(false);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selectedSymbol,
          side: orderSide,
          price: effectivePrice,
          quantity,
          total: parseFloat(numericAmount.toFixed(2)),
          strategy: `Mobile ${orderAlgo}`,
          mode: tradingMode,
          exchange: selectedExchange,
          orderType: orderAlgo === "LIMIT" ? "LIMIT" : "MARKET",
          limitPrice: orderAlgo === "LIMIT" ? effectivePrice : undefined,
        }),
      });
      const json = await safeParseResponseJson(res);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Falha HTTP ${res.status} ao executar ordem`);
      }

      if (json.data) addTrade(json.data);
      if (json.account) setAccount(json.account);
      structuredLogger.info(
        "BINANCE_API",
        `[Mobile ${orderAlgo}] ${orderSide} ${quantity} ${selectedSymbol} ($${numericAmount.toFixed(2)}) na ${selectedExchange.toUpperCase()}.`
      );
      toast({
        title: `✅ ${orderSide} executada (${orderAlgo})`,
        description: `${selectedSymbol} · $${numericAmount.toFixed(2)} USDT (${selectedExchange.toUpperCase()})`,
      });
      setSheetOpen(false);
    } catch (err: any) {
      structuredLogger.error("BINANCE_API", `[Mobile Ordem] Erro: ${err?.message}`);
      toast({
        title: "Erro na execução",
        description: err?.message || "Não foi possível enviar a ordem.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2 pb-16">
      <PairHeaderCard
        symbol={selectedSymbol}
        ticker={ticker}
        selectedExchange={selectedExchange}
        onSelectSymbol={setSelectedSymbol}
        onSelectExchange={setSelectedExchange}
      />

      <MobileVerticalChart
        klines={klines}
        currentPrice={currentPrice}
        interval={interval}
        onIntervalChange={setIntervalState}
        botEntryPrice={activeBotOnPair?.position?.entryPrice}
        aiAction={aiSignal?.action}
      />

      {/* Abas internas: Order Book L2 (Top 8 Bids/Asks) vs Trades Recentes */}
      <div className="rounded-xl bg-[#111827] border border-white/10 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex p-0.5 rounded-lg bg-[#090D16] border border-white/10 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setInnerTab("book")}
              className={cn(
                "px-2.5 py-1 rounded-md cursor-pointer transition-colors",
                innerTab === "book" ? "bg-[#6366F1] text-white" : "text-slate-400"
              )}
            >
              Order Book L2
            </button>
            <button
              type="button"
              onClick={() => setInnerTab("trades")}
              className={cn(
                "px-2.5 py-1 rounded-md cursor-pointer transition-colors",
                innerTab === "trades" ? "bg-[#6366F1] text-white" : "text-slate-400"
              )}
            >
              Trades Recentes
            </button>
          </div>

          {snapshot?.analysis && (
            <span className="text-[10px] font-mono tabular-nums text-slate-400">
              Spread {snapshot.analysis.spreadPercent.toFixed(3)}%
            </span>
          )}
        </div>

        {innerTab === "book" ? (
          bookError ? (
            <div className="p-2 rounded-lg bg-[#F43F5E]/10 border border-[#F43F5E]/30 text-[11px] text-[#F43F5E] font-mono">
              OrderBookFetchError: {bookError}
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Barra de Liquidez OFI */}
              {snapshot?.analysis && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono tabular-nums">
                    <span className="text-[#10B981]">Compra {snapshot.analysis.buyerPercent}%</span>
                    <span className="text-slate-400">
                      OFI {snapshot.analysis.orderFlowImbalance >= 0 ? "+" : ""}
                      {snapshot.analysis.orderFlowImbalance.toFixed(2)}
                    </span>
                    <span className="text-[#F43F5E]">Venda {snapshot.analysis.sellerPercent}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#F43F5E]/40 overflow-hidden flex">
                    <div
                      className="h-full bg-[#10B981] transition-all"
                      style={{ width: `${snapshot.analysis.buyerPercent}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <div className="flex justify-between px-2 text-[9px] uppercase text-slate-500 font-semibold mb-0.5">
                    <span>Bid (Compra)</span>
                    <span>Qtd</span>
                  </div>
                  {topBids.length === 0 ? (
                    <div className="text-[10px] text-slate-500 px-2 py-3 font-mono">Sincronizando L2...</div>
                  ) : (
                    topBids.map((b, i) => (
                      <OrderBookRow
                        key={`b-${i}`}
                        price={b.price}
                        volume={b.volume}
                        maxVol={maxBookVol}
                        side="bid"
                        onPickPrice={handlePickPrice}
                      />
                    ))
                  )}
                </div>

                <div>
                  <div className="flex justify-between px-2 text-[9px] uppercase text-slate-500 font-semibold mb-0.5">
                    <span>Ask (Venda)</span>
                    <span>Qtd</span>
                  </div>
                  {topAsks.length === 0 ? (
                    <div className="text-[10px] text-slate-500 px-2 py-3 font-mono">Sincronizando L2...</div>
                  ) : (
                    topAsks.map((a, i) => (
                      <OrderBookRow
                        key={`a-${i}`}
                        price={a.price}
                        volume={a.volume}
                        maxVol={maxBookVol}
                        side="ask"
                        onPickPrice={handlePickPrice}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-1 max-h-44 overflow-y-auto">
            {recentTradesForPair.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">Nenhum trade executado ainda.</p>
            ) : (
              recentTradesForPair.map((t: TradeData) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between text-[11px] font-mono tabular-nums py-1 border-b border-white/5 last:border-0"
                >
                  <span className={t.side === "BUY" ? "text-[#10B981] font-bold" : "text-[#F43F5E] font-bold"}>
                    {t.side} {t.symbol.replace("USDT", "")}
                  </span>
                  <span className="text-slate-200">${formatMonoPrice(t.price)}</span>
                  <span className="text-slate-400">${t.total.toFixed(2)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Faixa fixa na Thumb-Zone para expandir a Boleta Rápida */}
      <div className="fixed bottom-16 left-0 right-0 z-30 px-3 pb-2 pointer-events-none">
        <div className="max-w-md mx-auto pointer-events-auto rounded-xl bg-[#111827]/95 backdrop-blur-md border border-white/15 p-2 shadow-2xl flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleOpenBoleta("BUY")}
            className="flex-1 py-2.5 rounded-lg bg-[#10B981] text-[#052E1E] font-bold text-xs uppercase tracking-wide active:scale-95 transition-transform cursor-pointer"
          >
            Comprar / Long
          </button>
          <button
            type="button"
            onClick={() => setSheetOpen((v) => !v)}
            className="px-2.5 py-2.5 rounded-lg bg-[#090D16] border border-white/10 text-slate-300 text-[11px] font-mono cursor-pointer flex items-center gap-1"
            title="Expandir boleta completa"
          >
            <ArrowDownUp className="w-3.5 h-3.5 text-[#6366F1]" />
            {sheetOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => handleOpenBoleta("SELL")}
            className="flex-1 py-2.5 rounded-lg bg-[#F43F5E] text-white font-bold text-xs uppercase tracking-wide active:scale-95 transition-transform cursor-pointer"
          >
            Vender / Short
          </button>
        </div>
      </div>

      {/* Bottom Sheet Retrátil: Boleta Completa */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-xs">
          <div className="bg-[#111827] border-t border-white/15 rounded-t-2xl p-4 pb-6 safe-bottom space-y-3 max-w-md w-full mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#6366F1]" />
                <span className="text-sm font-bold text-white">
                  Boleta Rápida · {selectedSymbol.replace("USDT", "/USDT")}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 font-mono text-slate-300 uppercase">
                  {selectedExchange} · {tradingMode === "live" ? "REAL" : "SIM"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="p-1.5 rounded-lg bg-[#090D16] text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lado Buy / Sell */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrderSide("BUY")}
                className={cn(
                  "py-2 rounded-lg text-xs font-bold border cursor-pointer",
                  orderSide === "BUY"
                    ? "bg-[#10B981]/20 border-[#10B981] text-[#10B981]"
                    : "bg-[#090D16] border-white/10 text-slate-400"
                )}
              >
                COMPRAR / LONG
              </button>
              <button
                type="button"
                onClick={() => setOrderSide("SELL")}
                className={cn(
                  "py-2 rounded-lg text-xs font-bold border cursor-pointer",
                  orderSide === "SELL"
                    ? "bg-[#F43F5E]/20 border-[#F43F5E] text-[#F43F5E]"
                    : "bg-[#090D16] border-white/10 text-slate-400"
                )}
              >
                VENDER / SHORT
              </button>
            </div>

            {/* Tipo de Ordem: MARKET | LIMIT | TWAP | VWAP */}
            <div className="grid grid-cols-4 gap-1.5">
              {(["MARKET", "LIMIT", "TWAP", "VWAP"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOrderAlgo(t)}
                  className={cn(
                    "py-1.5 rounded-lg text-[11px] font-mono font-bold border cursor-pointer",
                    orderAlgo === t
                      ? "bg-[#6366F1] border-[#6366F1] text-white"
                      : "bg-[#090D16] border-white/10 text-slate-400"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Campos condicionais LIMIT ou TWAP/VWAP */}
            {orderAlgo === "LIMIT" && (
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 flex justify-between">
                  <span>Preço Limite (USDT)</span>
                  <span className="font-mono">Atual: ${formatMonoPrice(currentPrice)}</span>
                </label>
                <input
                  type="number"
                  step="any"
                  value={limitPriceInput}
                  onChange={(e) => setLimitPriceInput(e.target.value)}
                  className="w-full rounded-lg bg-[#090D16] border border-white/15 px-3 py-2 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-[#6366F1]"
                />
              </div>
            )}

            {(orderAlgo === "TWAP" || orderAlgo === "VWAP") && (
              <div className="flex items-center justify-between bg-[#090D16] border border-white/10 rounded-lg p-2">
                <span className="text-xs text-slate-300">Fatias ({orderAlgo}):</span>
                <div className="flex gap-1">
                  {[3, 4, 6, 8].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSliceCount(n)}
                      className={cn(
                        "px-2.5 py-1 rounded text-xs font-mono font-bold cursor-pointer",
                        sliceCount === n ? "bg-[#6366F1] text-white" : "bg-[#111827] text-slate-400"
                      )}
                    >
                      {n}x
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Lote & Gestão de Risco */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Valor (USDT) · Caixa: ${freeCash.toFixed(2)}</span>
                <span className="font-mono text-slate-300">
                  Slippage est.: {estSlippagePct.toFixed(3)}%
                </span>
              </div>
              <input
                type="number"
                step="any"
                value={amountUsdt}
                onChange={(e) => setAmountUsdt(e.target.value)}
                className="w-full rounded-lg bg-[#090D16] border border-white/15 px-3 py-2 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-[#6366F1]"
              />
              <div className="grid grid-cols-4 gap-1.5 text-[10px] font-mono">
                {[
                  { label: "25% Cx", val: Math.max(10, freeCash * 0.25) },
                  { label: "50% Cx", val: Math.max(10, freeCash * 0.5) },
                  { label: "75% Cx", val: Math.max(10, freeCash * 0.75) },
                  { label: "5% NAV", val: maxSafeNav5Pct },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setAmountUsdt(preset.val.toFixed(2))}
                    className="py-1 rounded bg-[#090D16] border border-white/10 text-slate-300 hover:border-[#6366F1] cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cálculo Automático SL / TP conforme Guardrails */}
            <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-[#090D16] border border-white/10 text-[11px] font-mono tabular-nums">
              <div>
                <span className="text-slate-400 block text-[10px]">Stop-Loss (−{slPercent}%)</span>
                <span className="text-[#F43F5E] font-bold">${formatMonoPrice(slPrice)}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-[10px]">Take-Profit (+{tpPercent}%)</span>
                <span className="text-[#10B981] font-bold">${formatMonoPrice(tpPrice)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleExecuteOrder}
              className={cn(
                "w-full py-3 rounded-xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60",
                orderSide === "BUY" ? "bg-[#10B981] text-[#052E1E]" : "bg-[#F43F5E] text-white"
              )}
            >
              <ShieldCheck className="w-4 h-4" />
              {submitting
                ? "Enviando ordem..."
                : `Confirmar ${orderSide} (${orderAlgo}) · $${numericAmount.toFixed(2)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
