"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, RefreshCw, Minimize2, Maximize2 } from "lucide-react";
import { motion } from "framer-motion";
import { getOrFetch, CACHE_TTL, invalidateCache } from "@/lib/cache";
import { calculateOrderBookImbalance, detectLiquiditySpoofing, OrderBookImbalanceResult, DepthSnapshot, SpoofingAlert } from "@/lib/order-book-imbalance";

export interface OrderBookLevel {
  price: number;
  volume: number;
  cumulative: number;
}

export interface OrderBookData {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  spreadPercent: number;
  totalBidVolume: number;
  totalAskVolume: number;
}

export interface OrderBookProps {
  mode?: "both" | "trade" | "book";
  onDepthData?: (depth: { bids: OrderBookLevel[]; asks: OrderBookLevel[] }) => void;
  onImbalanceUpdate?: (result: OrderBookImbalanceResult) => void;
  onExecuteMarketOrder?: (side: "BUY" | "SELL") => void;
  onSpoofingAlert?: (alert: SpoofingAlert | null) => void;
  showInlineHistogram?: boolean;
}

import { OrderBookFetchError } from "@/lib/performance/binance-worker-manager";
export { OrderBookFetchError };

/**
 * Converte payload bruto da exchange em OrderBookData estruturado em passada única (Single-Pass),
 * evitando encadeamento de .map() e alocações desnecessárias no caminho de atualização da UI.
 */
export function parseOrderBookDepthResponse(data: {
  bids?: Array<{ price: number; volume: number }>;
  asks?: Array<{ price: number; volume: number }>;
}): OrderBookData {
  const rawBids = data.bids || [];
  const rawAsks = data.asks || [];
  const bidLen = rawBids.length;
  const askLen = rawAsks.length;

  const bids: OrderBookLevel[] = new Array(bidLen);
  let bidCumulative = 0;
  for (let i = 0; i < bidLen; i++) {
    const b = rawBids[i];
    bidCumulative += b.volume;
    bids[i] = { price: b.price, volume: b.volume, cumulative: bidCumulative };
  }

  const asks: OrderBookLevel[] = new Array(askLen);
  let askCumulative = 0;
  for (let i = 0; i < askLen; i++) {
    const a = rawAsks[i];
    askCumulative += a.volume;
    asks[i] = { price: a.price, volume: a.volume, cumulative: askCumulative };
  }

  const bestBid = bidLen > 0 ? bids[0].price : 0;
  const bestAsk = askLen > 0 ? asks[0].price : 0;
  const spread = bestAsk - bestBid;
  const midPrice = (bestAsk + bestBid) / 2;
  const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

  return {
    bids,
    asks,
    spread,
    spreadPercent,
    totalBidVolume: bidCumulative,
    totalAskVolume: askCumulative,
  };
}

async function fetchRealOrderBook(symbol: string, limit: number): Promise<OrderBookData> {
  const response = await fetch(`/api/market/depth?symbol=${symbol}&limit=${limit}`);
  if (!response.ok) {
    throw new OrderBookFetchError(
      `Falha ao obter livro de ofertas para ${symbol} (HTTP ${response.status})`,
      symbol,
      response.status
    );
  }

  const data = await response.json();
  return parseOrderBookDepthResponse(data);
}

function formatBookPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function formatBookVolume(vol: number): string {
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(2)}K`;
  if (vol >= 1) return vol.toFixed(4);
  return vol.toFixed(6);
}

export function OrderBook({
  mode = "both",
  onDepthData,
  onImbalanceUpdate,
  onExecuteMarketOrder,
  onSpoofingAlert,
  showInlineHistogram = false,
}: OrderBookProps = {}) {
  const selectedSymbol = useCryptoStore((s) => s.selectedSymbol);
  const currentPrice = useCryptoStore((s) => s.tickers[s.selectedSymbol]?.price ?? 0);
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flashedLevels, setFlashedLevels] = useState<Record<number, "bid" | "ask">>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousSnapshotRef = useRef<DepthSnapshot | null>(null);
  const prevVolumesRef = useRef<Map<number, number>>(new Map());
  const spoofingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Armazena callbacks externos em refs para isolar o ciclo de renderização e evitar loops React #185
  const onDepthDataRef = useRef(onDepthData);
  onDepthDataRef.current = onDepthData;
  const onImbalanceUpdateRef = useRef(onImbalanceUpdate);
  onImbalanceUpdateRef.current = onImbalanceUpdate;
  const onSpoofingAlertRef = useRef(onSpoofingAlert);
  onSpoofingAlertRef.current = onSpoofingAlert;
  const lastOrderBookWarnTimeRef = useRef<number>(0);

  // Expande a profundidade para 22 níveis no modo analítico exclusivo L2
  const levels = isCompact ? 8 : (mode === "book" ? 22 : 14);

  // Reseta histórico de snapshots ao trocar de símbolo (sem disparar loop de callback)
  useEffect(() => {
    previousSnapshotRef.current = null;
    prevVolumesRef.current.clear();
    setFlashedLevels({});
    onSpoofingAlertRef.current?.(null);
  }, [selectedSymbol]);

  const refreshOrderBook = useCallback(async () => {
    if (!selectedSymbol) return;

    setIsRefreshing(true);
    setError(null);

    try {
      // Invalidate cache to force fresh data
      invalidateCache(`depth-${selectedSymbol}-${levels}`);

      const data = await getOrFetch(
        `depth-${selectedSymbol}-${levels}`,
        () => fetchRealOrderBook(selectedSymbol, levels),
        CACHE_TTL.ORDER_BOOK
      );

      // Micro-tick flash detection: compare volume shifts
      const newFlashes: Record<number, "bid" | "ask"> = {};
      const nextVolumes = new Map<number, number>();

      data.bids.forEach((b) => {
        nextVolumes.set(b.price, b.volume);
        const prev = prevVolumesRef.current.get(b.price);
        if (prev !== undefined && prev !== b.volume) {
          newFlashes[b.price] = "bid";
        }
      });

      data.asks.forEach((a) => {
        nextVolumes.set(a.price, a.volume);
        const prev = prevVolumesRef.current.get(a.price);
        if (prev !== undefined && prev !== a.volume) {
          newFlashes[a.price] = "ask";
        }
      });

      prevVolumesRef.current = nextVolumes;
      if (Object.keys(newFlashes).length > 0) {
        setFlashedLevels(newFlashes);
        setTimeout(() => setFlashedLevels({}), 450);
      }

      setOrderBook(data);
      onDepthDataRef.current?.({ bids: data.bids, asks: data.asks });

      // Detecção de Liquidity Spoofing (quedas abruptas >= 30% em menos de 3.5s)
      const currentSnapshot: DepthSnapshot = {
        totalBidVol: data.totalBidVolume,
        totalAskVol: data.totalAskVolume,
        timestamp: Date.now(),
      };

      if (previousSnapshotRef.current) {
        const spoofAlert = detectLiquiditySpoofing(currentSnapshot, previousSnapshotRef.current, 30.0, 3500);
        if (spoofAlert) {
          onSpoofingAlertRef.current?.(spoofAlert);
          if (spoofingTimeoutRef.current) clearTimeout(spoofingTimeoutRef.current);
          spoofingTimeoutRef.current = setTimeout(() => {
            onSpoofingAlertRef.current?.(null);
          }, 4500);
        }
      }
      previousSnapshotRef.current = currentSnapshot;

      if (onImbalanceUpdateRef.current) {
        const imb = calculateOrderBookImbalance(data.bids, data.asks, 8);
        onImbalanceUpdateRef.current(imb);
      }
    } catch (err: unknown) {
      const now = Date.now();
      if (!lastOrderBookWarnTimeRef.current || now - lastOrderBookWarnTimeRef.current > 30000) {
        console.warn("[OrderBook] Falha transitória ao obter livro de ofertas:", (err as any)?.message || err);
        lastOrderBookWarnTimeRef.current = now;
      }
      if (err instanceof OrderBookFetchError) {
        setError(err.isRateLimit ? "Limite de requisições atingido (HTTP 429)" : "Livro de ofertas indisponível no momento");
      } else {
        setError("Livro de ofertas indisponível");
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 300);
    }
  }, [selectedSymbol, levels]);

  // Initial load and auto-refresh every 3 seconds
  useEffect(() => {
    refreshOrderBook();

    intervalRef.current = setInterval(refreshOrderBook, 3000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (spoofingTimeoutRef.current) clearTimeout(spoofingTimeoutRef.current);
    };
  }, [refreshOrderBook]);

  if (error && !orderBook) {
    return (
      <Card className="bg-[#0f1622]/90 border-white/[0.08] backdrop-blur-md shadow-lg">
        <CardContent className="p-6 text-center">
          <div className="w-10 h-10 rounded-xl bg-crypto-red/10 flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-5 h-5 text-crypto-red" />
          </div>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshOrderBook}
            className="mt-2 text-xs text-crypto-cyan hover:bg-crypto-cyan/10"
          >
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!orderBook) {
    return (
      <Card className="bg-[#0f1622]/90 border-white/[0.08] backdrop-blur-md shadow-lg">
        <CardContent className="p-6 text-center">
          <div className="w-10 h-10 rounded-xl bg-crypto-cyan/10 flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-5 h-5 text-crypto-cyan" />
          </div>
          <p className="text-xs text-muted-foreground">Carregando livro de ofertas L2...</p>
        </CardContent>
      </Card>
    );
  }

  const maxCumulative = Math.max(
    orderBook.bids[orderBook.bids.length - 1]?.cumulative ?? 0,
    orderBook.asks[orderBook.asks.length - 1]?.cumulative ?? 0,
    0.0001
  );

  const totalVolume = orderBook.totalBidVolume + orderBook.totalAskVolume;
  const bidPct = totalVolume > 0 ? (orderBook.totalBidVolume / totalVolume) * 100 : 50;
  const askPct = totalVolume > 0 ? (orderBook.totalAskVolume / totalVolume) * 100 : 50;

  return (
    <Card className="bg-[#0f1622]/95 border-white/[0.08] backdrop-blur-md shadow-xl overflow-hidden rounded-xl">
      <CardHeader className="py-2.5 px-3 border-b border-white/[0.06] bg-slate-900/40">
        <CardTitle className="text-xs font-semibold flex items-center justify-between text-slate-200">
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-crypto-cyan" />
            <span className="tracking-wide">Livro de Ofertas L2</span>
            <span className="text-[10px] text-slate-400 font-mono font-normal">
              {selectedSymbol.replace("USDT", "/USDT")}
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[8px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
              TEMPO REAL
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]"
              onClick={() => setIsCompact(!isCompact)}
              aria-label={isCompact ? "Expandir" : "Compactar"}
            >
              {isCompact ? (
                <Maximize2 className="w-3 h-3" />
              ) : (
                <Minimize2 className="w-3 h-3" />
              )}
            </Button>
            <motion.div
              animate={{ rotate: isRefreshing ? 360 : 0 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="p-1"
            >
              <RefreshCw className="w-3 h-3 text-slate-400" />
            </motion.div>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-2.5 pt-2">
        {/* Spread Info Bar */}
        <div className="flex items-center justify-between mb-2 px-2 py-1 rounded bg-slate-950/60 border border-white/[0.05] text-[10px] tabular-nums">
          <div className="text-slate-400 flex items-center gap-1">
            <span className="text-slate-500 uppercase tracking-wider text-[9px]">Spread:</span>
            <span className="text-slate-200 font-mono font-semibold">
              ${formatBookPrice(orderBook.spread)}
            </span>
            <span className="text-slate-400 font-mono">
              ({orderBook.spreadPercent.toFixed(3)}%)
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[9px]">
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-emerald-500" />
              Bid: {formatBookVolume(orderBook.totalBidVolume)}
            </span>
            <span className="text-rose-400 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-rose-500" />
              Ask: {formatBookVolume(orderBook.totalAskVolume)}
            </span>
          </div>
        </div>

        {/* Column Headers */}
        <div className="grid grid-cols-3 gap-1 text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1 px-1.5 py-0.5 border-b border-white/[0.04]">
          <span>Preço (USDT)</span>
          <span className="text-right">Tamanho</span>
          <span className="text-right">Acumulado</span>
        </div>

        {/* Asks (sells) - reversed so highest ask is on top and lowest ask is nearest to center */}
        {/* Virtualização com nós fixos (in-place slot recycling) para Zero-DOM overhead */}
        <div className="space-y-[1px] mb-1">
          {[...orderBook.asks].reverse().map((level, index) => {
            const barWidth = Math.min(100, Math.max(1, (level.cumulative / maxCumulative) * 100));
            const isFlashed = flashedLevels[level.price] === "ask";

            return (
              <div
                key={`ask-slot-${index}`}
                onClick={() => onExecuteMarketOrder?.("BUY")}
                title={`Clique para preencher compra no preço $${formatBookPrice(level.price)}`}
                className={`relative grid grid-cols-3 gap-1 px-1.5 py-[2px] rounded text-[11px] font-mono tabular-nums cursor-pointer transition-colors select-none group hover:bg-rose-500/10 ${
                  isFlashed ? "flash-ask" : ""
                }`}
              >
                {/* Horizontal Depth Heatmap Bar */}
                <div
                  className="absolute inset-y-0 right-0 rounded pointer-events-none transition-[width] duration-150 ease-out will-change-[width]"
                  style={{
                    width: `${barWidth}%`,
                    background: "linear-gradient(90deg, transparent, rgba(244, 63, 94, 0.16))",
                    borderLeft: "1px solid rgba(244, 63, 94, 0.35)",
                  }}
                />
                <span className="relative text-rose-400 font-semibold group-hover:text-rose-300">
                  {formatBookPrice(level.price)}
                </span>
                <span className="relative text-right text-slate-300 group-hover:text-white">
                  {formatBookVolume(level.volume)}
                </span>
                <span className="relative text-right text-slate-400 group-hover:text-slate-200">
                  {formatBookVolume(level.cumulative)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Current Mid-Price Anchor */}
        <div className="flex items-center justify-between py-1 px-2 my-1.5 bg-cyan-950/40 border-y border-cyan-500/30 rounded text-xs tabular-nums select-none">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold font-mono text-cyan-300 tracking-tight">
              ${currentPrice > 0 ? formatBookPrice(currentPrice) : "—"}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-cyan-400/80 font-medium">
              Último Preço
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[8px] font-mono text-cyan-400 uppercase tracking-widest font-semibold">
              SPREAD {orderBook.spreadPercent.toFixed(3)}%
            </span>
          </div>
        </div>

        {/* Bids (buys) - closest to center at top */}
        {/* Virtualização com nós fixos (in-place slot recycling) para Zero-DOM overhead */}
        <div className="space-y-[1px] mt-1">
          {orderBook.bids.map((level, index) => {
            const barWidth = Math.min(100, Math.max(1, (level.cumulative / maxCumulative) * 100));
            const isFlashed = flashedLevels[level.price] === "bid";

            return (
              <div
                key={`bid-slot-${index}`}
                onClick={() => onExecuteMarketOrder?.("SELL")}
                title={`Clique para preencher venda no preço $${formatBookPrice(level.price)}`}
                className={`relative grid grid-cols-3 gap-1 px-1.5 py-[2px] rounded text-[11px] font-mono tabular-nums cursor-pointer transition-colors select-none group hover:bg-emerald-500/10 ${
                  isFlashed ? "flash-bid" : ""
                }`}
              >
                {/* Horizontal Depth Heatmap Bar */}
                <div
                  className="absolute inset-y-0 right-0 rounded pointer-events-none transition-[width] duration-150 ease-out will-change-[width]"
                  style={{
                    width: `${barWidth}%`,
                    background: "linear-gradient(90deg, transparent, rgba(16, 185, 129, 0.16))",
                    borderLeft: "1px solid rgba(16, 185, 129, 0.35)",
                  }}
                />
                <span className="relative text-emerald-400 font-semibold group-hover:text-emerald-300">
                  {formatBookPrice(level.price)}
                </span>
                <span className="relative text-right text-slate-300 group-hover:text-white">
                  {formatBookVolume(level.volume)}
                </span>
                <span className="relative text-right text-slate-400 group-hover:text-slate-200">
                  {formatBookVolume(level.cumulative)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Depth Pressure Gauge */}
        <div className="mt-2.5 pt-2 border-t border-white/[0.05] px-1">
          <div className="flex items-center justify-between text-[9px] text-slate-400 font-medium mb-1">
            <span>Pressão do Book</span>
            <span className="font-mono tabular-nums text-slate-300">
              {bidPct.toFixed(1)}% vs {askPct.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden flex bg-slate-800 relative">
            <div
              className="h-full bg-emerald-500 transition-all duration-300 ease-out"
              style={{ width: `${bidPct}%` }}
            />
            <div
              className="h-full bg-rose-500 transition-all duration-300 ease-out"
              style={{ width: `${askPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[8px] font-mono mt-0.5 text-slate-400">
            <span className="text-emerald-400 font-semibold">COMPRA</span>
            <span className="text-rose-400 font-semibold">VENDA</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

