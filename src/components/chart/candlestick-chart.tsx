'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useCryptoStore, type SpoofingChartMarker } from '@/lib/store';
import { formatPrice, formatVolume, formatTime } from '@/lib/format';
import { calculateWickPenetration, type WickRejectionMetrics, type OrderFlowConfluence } from '@/lib/order-book-imbalance';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { ZoomIn, ZoomOut, Maximize2, Zap, X, Activity, Sparkles, Gauge, Clock, Shield, Flame, Layers, AlertTriangle } from 'lucide-react';
import { structuredLogger } from '@/lib/telemetry/structured-logger';
import { vSyncCoalescer } from '@/hooks/use-binance-stream';
import { playTakeProfitHitSound } from '@/lib/sound/sound-effects';
import { RenderTelemetryHUD } from '@/components/telemetry/render-telemetry-hud';

const EMPTY_SPOOFING_MARKERS: SpoofingChartMarker[] = [];

export type DrawingTool = 'crosshair' | 'trendline' | 'horizontal';

export interface Drawing {
  id: string;
  type: 'trendline' | 'horizontal';
  // Trendline points
  startTime?: number;
  startPrice?: number;
  endTime?: number;
  endPrice?: number;
  // Horizontal line price
  price?: number;
  color: string;
}

interface KlineRaw {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteVolume: string;
  trades: number;
}

interface ProcessedCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isBullish: boolean;
  sma20?: number;
  sma50?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  ema12?: number;
  ema26?: number;
  tenkanSen?: number;
  kijunSen?: number;
  senkouSpanA?: number;
  senkouSpanB?: number;
  vwap?: number;
  ema20?: number;
  ema25?: number;
  ema30?: number;
  ema35?: number;
  ema40?: number;
  ema45?: number;
  ema50?: number;
  ema55?: number;
}

interface TooltipData {
  candle: ProcessedCandle;
  x: number;
  y: number;
  snappedPrice?: number;
  snappedField?: 'open' | 'high' | 'low' | 'close';
  snappedY?: number;
}

interface MeasureAnchor {
  candle: ProcessedCandle;
  price: number;
  x: number;
  y: number;
}

interface CandlestickChartProps {
  symbol: string;
  interval: string;
  showSMA20?: boolean;
  showSMA50?: boolean;
  showBollinger?: boolean;
  showFibonacci?: boolean;
  showEMA12?: boolean;
  showEMA26?: boolean;
  showVolumeProfile?: boolean;
  showIchimoku?: boolean;
  showVWAP?: boolean;
  showEMARibbon?: boolean;
  drawingTool?: DrawingTool;
  drawings?: Drawing[];
  onDrawingAdd?: (drawing: Drawing) => void;
  spoofingEvents?: SpoofingChartMarker[];
  showSpoofingMarkers?: boolean;
}

const CHART_PADDING = { top: 20, right: 90, bottom: 30, left: 10 };
const VOLUME_RATIO = 0.2; // Volume section takes 20% of chart height

function calculateSMA(closes: number[], period: number): (number | undefined)[] {
  const sma: (number | undefined)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      sma.push(undefined);
    } else {
      const sum = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
  }
  return sma;
}

function calculateEMA(closes: number[], period: number): (number | undefined)[] {
  const ema: (number | undefined)[] = [];
  const multiplier = 2 / (period + 1);

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      ema.push(undefined);
    } else if (i === period - 1) {
      // First EMA value is SMA of the period
      const sum = closes.slice(0, period).reduce((a, b) => a + b, 0);
      ema.push(sum / period);
    } else {
      const prevEMA = ema[i - 1];
      if (prevEMA !== undefined) {
        ema.push((closes[i] - prevEMA) * multiplier + prevEMA);
      } else {
        ema.push(undefined);
      }
    }
  }
  return ema;
}

// Ichimoku helper: calculate the midpoint of (period-high + period-low) / 2
function calculateMidpointHL(highs: number[], lows: number[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = [];
  for (let i = 0; i < highs.length; i++) {
    if (i < period - 1) {
      result.push(undefined);
    } else {
      const highSlice = highs.slice(i - period + 1, i + 1);
      const lowSlice = lows.slice(i - period + 1, i + 1);
      const periodHigh = Math.max(...highSlice);
      const periodLow = Math.min(...lowSlice);
      result.push((periodHigh + periodLow) / 2);
    }
  }
  return result;
}

const calculateVWAPWithWorker = (klines: any[]): Promise<number[]> => {
  return new Promise((resolve) => {
    try {
      const worker = new Worker(new URL("../../workers/indicators.worker.ts", import.meta.url));
      worker.onmessage = (e) => {
        if (e.data.success) resolve(e.data.result);
        else resolve([]);
        worker.terminate();
      };
      worker.onerror = () => {
        resolve([]);
        worker.terminate();
      };
      worker.postMessage({ id: "vwap", type: "vwap", payload: { klines } });
    } catch {
      resolve([]);
    }
  });
};

const calculateEMARibbonWithWorker = (prices: number[]): Promise<Record<number, number[]>> => {
  return new Promise((resolve) => {
    try {
      const worker = new Worker(new URL("../../workers/indicators.worker.ts", import.meta.url));
      worker.onmessage = (e) => {
        if (e.data.success) resolve(e.data.result);
        else resolve({});
        worker.terminate();
      };
      worker.onerror = () => {
        resolve({});
        worker.terminate();
      };
      worker.postMessage({ id: "ribbon", type: "ema_ribbon", payload: { prices } });
    } catch {
      resolve({});
    }
  });
};

export function CandlestickChart({
  symbol,
  interval,
  showSMA20 = true,
  showSMA50 = true,
  showBollinger = false,
  showFibonacci = false,
  showEMA12 = false,
  showEMA26 = false,
  showVolumeProfile = false,
  showIchimoku = false,
  showVWAP = false,
  showEMARibbon = false,
  drawingTool = 'crosshair',
  drawings = [],
  onDrawingAdd,
  spoofingEvents,
  showSpoofingMarkers = true,
}: CandlestickChartProps) {
  const trades = useCryptoStore((s) => s.trades);
  const bots = useCryptoStore((s) => s.bots);
  const updateBotPosition = useCryptoStore((s) => s.updateBotPosition);
  const addBotLog = useCryptoStore((s) => s.addBotLog);
  const isMarketDataStale = useCryptoStore((s) => s.isMarketDataStale);

  // Bot com posição aberta no par atual
  const activeBotWithPosition = useMemo(() => {
    return bots.find((b) => b.position && b.position.symbol === symbol && b.position.quantity > 0);
  }, [bots, symbol]);

  // Estado de Drag-and-Drop interativo de Stop-Loss e Take-Profit
  const [draggedOrderLine, setDraggedOrderLine] = useState<{
    botId: string;
    type: 'TP' | 'SL';
    currentPrice: number;
    initialPrice: number;
    entryPrice: number;
    quantity: number;
  } | null>(null);

  const storeSpoofingMarkers = useCryptoStore((s) => s.spoofingMarkers[symbol] ?? EMPTY_SPOOFING_MARKERS);
  const activeSpoofingEvents = spoofingEvents ?? storeSpoofingMarkers;
  const [candles, setCandles] = useState<ProcessedCandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  // Drawing state
  const [pendingDrawPoint, setPendingDrawPoint] = useState<{ time: number; price: number } | null>(null);
  const [drawMousePos, setDrawMousePos] = useState<{ x: number; y: number } | null>(null);
  const [measureAnchor, setMeasureAnchor] = useState<MeasureAnchor | null>(null);

  const currentTicker = useCryptoStore((s) => s.tickers[symbol]);
  const lastMarketUpdate = useCryptoStore((s) => s.lastMarketUpdate);
  const [renderMetrics, setRenderMetrics] = useState({ fps: 60, lastFrameDurationMs: 16.6 });

  useEffect(() => {
    const timer = setInterval(() => {
      setRenderMetrics(vSyncCoalescer.getMetrics());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMeasureAnchor(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const e2eLatencyMs = useMemo(() => {
    return Math.max(1, Date.now() - (lastMarketUpdate || Date.now()));
  }, [lastMarketUpdate]);

  // Stop Hunt Popover state (Velocidade de Rejeição do Pavio & Order Flow)
  const [activeStopHuntPopover, setActiveStopHuntPopover] = useState<{
    id: string;
    x: number;
    y: number;
    rejection: WickRejectionMetrics;
    orderFlow: OrderFlowConfluence;
    candle: ProcessedCandle;
    eventPrice: number;
    stopLossPrice: number;
    savedLossUsd: number;
    narrative: string;
    side: 'BID' | 'ASK';
  } | null>(null);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const newW = Math.max(Math.round(width), 300);
        const newH = Math.max(Math.round(height), 200);
        setDimensions((prev) => (prev.width === newW && prev.height === newH ? prev : { width: newW, height: newH }));
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Fetch klines data
  const fetchKlines = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/market/klines?symbol=${symbol}&interval=${interval}&limit=100`
      );
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      const rawData: KlineRaw[] = json.data || [];

      const processed: ProcessedCandle[] = rawData.map((k) => ({
        time: k.openTime,
        open: parseFloat(k.open),
        high: parseFloat(k.high),
        low: parseFloat(k.low),
        close: parseFloat(k.close),
        volume: parseFloat(k.volume),
        isBullish: parseFloat(k.close) >= parseFloat(k.open),
      }));

      // Calculate moving averages
      const closes = processed.map((c) => c.close);
      const highs = processed.map((c) => c.high);
      const lows = processed.map((c) => c.low);
      const sma20 = calculateSMA(closes, 20);
      const sma50 = calculateSMA(closes, 50);

      // Calculate EMA
      const ema12 = calculateEMA(closes, 12);
      const ema26 = calculateEMA(closes, 26);

      // Calculate Bollinger Bands (20-period SMA + 2 standard deviations)
      const bbPeriod = 20;
      const bbMultiplier = 2;
      for (let i = 0; i < processed.length; i++) {
        if (i >= bbPeriod - 1) {
          const slice = closes.slice(i - bbPeriod + 1, i + 1);
          const mean = slice.reduce((a, b) => a + b, 0) / bbPeriod;
          const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / bbPeriod;
          const stdDev = Math.sqrt(variance);
          processed[i].bbUpper = mean + bbMultiplier * stdDev;
          processed[i].bbMiddle = mean;
          processed[i].bbLower = mean - bbMultiplier * stdDev;
        }
      }

      // Calculate Ichimoku Cloud
      const tenkanSen = calculateMidpointHL(highs, lows, 9);   // Conversion Line
      const kijunSen = calculateMidpointHL(highs, lows, 26);   // Base Line
      const senkouSpanB = calculateMidpointHL(highs, lows, 52); // Leading Span B

      for (let i = 0; i < processed.length; i++) {
        processed[i].tenkanSen = tenkanSen[i];
        processed[i].kijunSen = kijunSen[i];

        // Senkou Span A = (Tenkan + Kijun) / 2, plotted 26 periods ahead
        if (tenkanSen[i] !== undefined && kijunSen[i] !== undefined) {
          processed[i].senkouSpanA = (tenkanSen[i]! + kijunSen[i]!) / 2;
        }

        // Senkou Span B = (52-period high + 52-period low) / 2, plotted 26 periods ahead
        processed[i].senkouSpanB = senkouSpanB[i];
      }

      const [vwapData, ribbonData] = await Promise.all([
        calculateVWAPWithWorker(processed),
        calculateEMARibbonWithWorker(closes),
      ]);

      processed.forEach((c, i) => {
        c.sma20 = sma20[i];
        c.sma50 = sma50[i];
        c.ema12 = ema12[i];
        c.ema26 = ema26[i];
        if (vwapData && vwapData[i] !== undefined) {
          c.vwap = vwapData[i];
        }
        if (ribbonData) {
          c.ema20 = ribbonData[20]?.[i];
          c.ema25 = ribbonData[25]?.[i];
          c.ema30 = ribbonData[30]?.[i];
          c.ema35 = ribbonData[35]?.[i];
          c.ema40 = ribbonData[40]?.[i];
          c.ema45 = ribbonData[45]?.[i];
          c.ema50 = ribbonData[50]?.[i];
          c.ema55 = ribbonData[55]?.[i];
        }
      });

      setCandles(processed);
    } catch (err) {
      console.error('Failed to fetch klines:', err);
      setCandles([]);
    } finally {
      setLoading(false);
    }
  }, [symbol, interval]);

  useEffect(() => {
    fetchKlines();
  }, [fetchKlines]);

  // Chart calculations
  const visibleCandles = useMemo(() => {
    const zoomedCount = Math.max(20, Math.floor(candles.length / zoom));
    return candles.slice(-zoomedCount);
  }, [candles, zoom]);

  const chartMetrics = useMemo(() => {
    if (visibleCandles.length === 0) {
      return { minPrice: 0, maxPrice: 100, maxVolume: 0, priceRange: 100 };
    }

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVolume = 0;

    for (const c of visibleCandles) {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVolume) maxVolume = c.volume;
      if (c.sma20 !== undefined && c.sma20 < minPrice) minPrice = c.sma20;
      if (c.sma20 !== undefined && c.sma20 > maxPrice) maxPrice = c.sma20;
      if (c.sma50 !== undefined && c.sma50 < minPrice) minPrice = c.sma50;
      if (c.sma50 !== undefined && c.sma50 > maxPrice) maxPrice = c.sma50;
      if (c.bbUpper !== undefined && c.bbUpper > maxPrice) maxPrice = c.bbUpper;
      if (c.bbLower !== undefined && c.bbLower < minPrice) minPrice = c.bbLower;
      if (c.ema12 !== undefined && c.ema12 < minPrice) minPrice = c.ema12;
      if (c.ema12 !== undefined && c.ema12 > maxPrice) maxPrice = c.ema12;
      if (c.ema26 !== undefined && c.ema26 < minPrice) minPrice = c.ema26;
      if (c.ema26 !== undefined && c.ema26 > maxPrice) maxPrice = c.ema26;

      if (showVWAP && c.vwap !== undefined) {
        if (c.vwap < minPrice) minPrice = c.vwap;
        if (c.vwap > maxPrice) maxPrice = c.vwap;
      }
      if (showEMARibbon) {
        const ribbonVals = [c.ema20, c.ema25, c.ema30, c.ema35, c.ema40, c.ema45, c.ema50, c.ema55];
        for (const v of ribbonVals) {
          if (v !== undefined) {
            if (v < minPrice) minPrice = v;
            if (v > maxPrice) maxPrice = v;
          }
        }
      }
    }

    // Include Ichimoku Senkou Span values in price range (shifted: at position i, cloud comes from candle[i-26])
    if (showIchimoku) {
      for (let i = 0; i < visibleCandles.length; i++) {
        const srcIdx = i - 26;
        if (srcIdx >= 0 && srcIdx < visibleCandles.length) {
          const srcCandle = visibleCandles[srcIdx];
          if (srcCandle.senkouSpanA !== undefined) {
            if (srcCandle.senkouSpanA < minPrice) minPrice = srcCandle.senkouSpanA;
            if (srcCandle.senkouSpanA > maxPrice) maxPrice = srcCandle.senkouSpanA;
          }
          if (srcCandle.senkouSpanB !== undefined) {
            if (srcCandle.senkouSpanB < minPrice) minPrice = srcCandle.senkouSpanB;
            if (srcCandle.senkouSpanB > maxPrice) maxPrice = srcCandle.senkouSpanB;
          }
        }
      }
    }

    const padding = (maxPrice - minPrice) * 0.05;
    minPrice -= padding;
    maxPrice += padding;
    const priceRange = maxPrice - minPrice || 1;

    return { minPrice, maxPrice, maxVolume, priceRange };
  }, [visibleCandles, showIchimoku]);

  const { minPrice, maxPrice, maxVolume, priceRange } = chartMetrics;

  // Layout calculations
  const chartWidth = dimensions.width - CHART_PADDING.left - CHART_PADDING.right;
  const chartHeight = dimensions.height - CHART_PADDING.top - CHART_PADDING.bottom;
  const priceChartHeight = chartHeight * (1 - VOLUME_RATIO);
  const volumeChartHeight = chartHeight * VOLUME_RATIO;
  const candleWidth = Math.max(2, chartWidth / visibleCandles.length);
  const bodyWidth = Math.max(1, candleWidth * 0.65);

  // Helper functions
  const priceToY = useCallback(
    (price: number) =>
      CHART_PADDING.top + priceChartHeight - ((price - minPrice) / priceRange) * priceChartHeight,
    [minPrice, priceRange, priceChartHeight]
  );

  const volumeToY = useCallback(
    (vol: number) =>
      CHART_PADDING.top + priceChartHeight + volumeChartHeight - (maxVolume > 0 ? (vol / maxVolume) * volumeChartHeight : 0),
    [maxVolume, volumeChartHeight, priceChartHeight]
  );

  const indexToX = useCallback(
    (index: number) => CHART_PADDING.left + index * candleWidth + candleWidth / 2,
    [candleWidth]
  );

  // Convert candle time to X position (works even for off-screen candles)
  const timeToX = useCallback(
    (time: number) => {
      const startOfVisible = candles.length - visibleCandles.length;
      const fullIndex = candles.findIndex((c) => c.time === time);
      if (fullIndex === -1) return -100; // Off-screen
      const relIndex = fullIndex - startOfVisible;
      return CHART_PADDING.left + relIndex * candleWidth + candleWidth / 2;
    },
    [candles, visibleCandles, candleWidth]
  );

  // Convert pixel Y to price
  const yToPrice = useCallback(
    (y: number) => {
      const price = minPrice + ((CHART_PADDING.top + priceChartHeight - y) / priceChartHeight) * priceRange;
      return price;
    },
    [minPrice, priceRange, priceChartHeight]
  );

  // Chart click handler for drawing and R:R measurement
  const handleChartClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (visibleCandles.length === 0) return;

      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const candleIndex = Math.floor((mouseX - CHART_PADDING.left) / candleWidth);

      if (candleIndex < 0 || candleIndex >= visibleCandles.length) return;

      const clickedPrice = yToPrice(mouseY);
      const clickedTime = visibleCandles[candleIndex].time;
      const candle = visibleCandles[candleIndex];

      if (drawingTool === 'crosshair') {
        if (!measureAnchor) {
          const ohlc = [
            { level: 'open' as const, price: candle.open },
            { level: 'high' as const, price: candle.high },
            { level: 'low' as const, price: candle.low },
            { level: 'close' as const, price: candle.close },
          ];
          let nearest = ohlc[0];
          let minDiff = Math.abs(clickedPrice - ohlc[0].price);
          for (let i = 1; i < ohlc.length; i++) {
            const diff = Math.abs(clickedPrice - ohlc[i].price);
            if (diff < minDiff) {
              minDiff = diff;
              nearest = ohlc[i];
            }
          }
          const snappedPrice = minDiff < (priceRange * 0.08) ? nearest.price : clickedPrice;
          setMeasureAnchor({
            candle,
            price: snappedPrice,
            x: indexToX(candleIndex),
            y: priceToY(snappedPrice),
          });
        } else {
          setMeasureAnchor(null);
        }
        return;
      }

      if (!onDrawingAdd) return;

      if (drawingTool === 'horizontal') {
        onDrawingAdd({
          id: `hline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'horizontal',
          price: clickedPrice,
          color: '#fbbf24',
        });
        setPendingDrawPoint(null);
      } else if (drawingTool === 'trendline') {
        if (!pendingDrawPoint) {
          setPendingDrawPoint({ time: clickedTime, price: clickedPrice });
        } else {
          onDrawingAdd({
            id: `trend-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: 'trendline',
            startTime: pendingDrawPoint.time,
            startPrice: pendingDrawPoint.price,
            endTime: clickedTime,
            endPrice: clickedPrice,
            color: '#06b6d4',
          });
          setPendingDrawPoint(null);
        }
      }
    },
    [drawingTool, onDrawingAdd, visibleCandles, candleWidth, yToPrice, pendingDrawPoint, measureAnchor, priceRange, indexToX, priceToY]
  );

  // Mouse handlers with magnetic crosshair snapping to OHLC
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (visibleCandles.length === 0) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Track mouse position for drawing preview
      if (drawingTool !== 'crosshair') {
        setDrawMousePos({ x: mouseX, y: mouseY });
      }

      // Se estiver arrastando linha de SL ou TP, recalcula preço em tempo real
      if (draggedOrderLine) {
        const newPrice = yToPrice(mouseY);
        setDraggedOrderLine((prev) => (prev ? { ...prev, currentPrice: newPrice } : null));
        return;
      }

      const candleIndex = Math.floor((mouseX - CHART_PADDING.left) / candleWidth);

      if (candleIndex >= 0 && candleIndex < visibleCandles.length) {
        const candle = visibleCandles[candleIndex];
        const mousePrice = yToPrice(mouseY);
        const ohlc = [
          { level: 'open' as const, price: candle.open },
          { level: 'high' as const, price: candle.high },
          { level: 'low' as const, price: candle.low },
          { level: 'close' as const, price: candle.close },
        ];
        let nearest = ohlc[0];
        let minDiff = Math.abs(mousePrice - ohlc[0].price);
        for (let i = 1; i < ohlc.length; i++) {
          const diff = Math.abs(mousePrice - ohlc[i].price);
          if (diff < minDiff) {
            minDiff = diff;
            nearest = ohlc[i];
          }
        }
        const nearestY = priceToY(nearest.price);
        const shouldSnap = Math.abs(nearestY - mouseY) < 30;
        const finalY = shouldSnap ? nearestY : mouseY;
        const snappedPrice = shouldSnap ? nearest.price : mousePrice;
        const snappedField = shouldSnap ? nearest.level : undefined;

        setTooltip({
          candle,
          x: indexToX(candleIndex),
          y: finalY,
          snappedPrice,
          snappedField,
          snappedY: nearestY,
        });
      } else {
        setTooltip(null);
      }
    },
    [visibleCandles, candleWidth, indexToX, priceToY, drawingTool, draggedOrderLine, yToPrice]
  );

  const handleMouseUp = useCallback(() => {
    if (draggedOrderLine) {
      const { botId, type, currentPrice, entryPrice } = draggedOrderLine;
      const targetBot = bots.find((b) => b.id === botId);
      if (targetBot && targetBot.position) {
        if (type === 'TP') {
          updateBotPosition(botId, {
            ...targetBot.position,
            dynamicTakeProfit: currentPrice,
          });
          const gainUsd = (currentPrice - entryPrice) * targetBot.position.quantity;
          structuredLogger.info(
            "RISK_ENGINE",
            `🎯 [DRAG_DROP] Take-Profit de ${symbol} ajustado para $${currentPrice.toFixed(4)} (+$$${gainUsd.toFixed(2)} USD).`,
            { symbol, botId }
          );
        } else {
          updateBotPosition(botId, {
            ...targetBot.position,
            dynamicStopLoss: currentPrice,
          });
          const lossUsd = (currentPrice - entryPrice) * targetBot.position.quantity;
          structuredLogger.warn(
            "RISK_ENGINE",
            `🛡️ [DRAG_DROP] Stop-Loss de ${symbol} ajustado para $${currentPrice.toFixed(4)} ($${lossUsd.toFixed(2)} USD).`,
            { symbol, botId }
          );
        }
      }
      setDraggedOrderLine(null);
    }
  }, [draggedOrderLine, bots, updateBotPosition, symbol]);

  // Ativação do Breakeven Automático Interativo (BE Anchor) por Duplo Clique
  const handleActivateBreakevenAnchor = useCallback((targetBot: any) => {
    if (!targetBot || !targetBot.position) return;
    const entryPrice = targetBot.position.entryPrice;
    const qty = targetBot.position.quantity;

    // Custo estimado de taxas round-trip: 0.10% compra Maker/Taker + 0.10% venda Maker/Taker + 0.05% slippage/buffer = 0.25% líquido
    const roundTripFeePercent = 0.25;
    const bePrice = parseFloat((entryPrice * (1 + roundTripFeePercent / 100)).toFixed(4));
    const estimatedFeesUsd = (entryPrice * qty + bePrice * qty) * 0.001;

    updateBotPosition(targetBot.id, {
      ...targetBot.position,
      dynamicStopLoss: bePrice,
      isBreakEvenArmed: true,
      breakEvenPrice: bePrice,
    });

    try {
      playTakeProfitHitSound();
    } catch {}

    structuredLogger.info(
      "RISK_ENGINE",
      `🛡️ [BE ANCHOR] Stop Loss travado em Breakeven Líquido com Risco Zero para ${symbol} em $${bePrice.toFixed(4)} (+${roundTripFeePercent}% cobrindo ~$${estimatedFeesUsd.toFixed(2)} em taxas).`,
      { symbol, botId: targetBot.id, metadata: { entryPrice, bePrice, roundTripFeePercent, estimatedFeesUsd } }
    );

    addBotLog({
      message: `🛡️ [BE Anchor Ativado] Stop Loss de ${symbol} travado em $${bePrice.toFixed(4)} com Risco Zero (cobrindo taxas round-trip de 0.25%).`,
      type: "info",
      botId: targetBot.id,
      botName: targetBot.name,
    });
  }, [symbol, updateBotPosition, addBotLog]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    setDrawMousePos(null);
    if (draggedOrderLine) {
      handleMouseUp();
    }
  }, [draggedOrderLine, handleMouseUp]);

  // Clear pending drawing when tool changes
  useEffect(() => {
    setPendingDrawPoint(null);
    setDrawMousePos(null);
  }, [drawingTool]);

  // Price grid lines
  const priceGridLines = useMemo(() => {
    const lines: number[] = [];
    const step = priceRange / 6;
    for (let i = 0; i <= 6; i++) {
      lines.push(minPrice + step * i);
    }
    return lines;
  }, [minPrice, priceRange]);

  // Time labels
  const timeLabels = useMemo(() => {
    if (visibleCandles.length === 0) return [];
    const labels: { x: number; label: string }[] = [];
    const step = Math.max(1, Math.floor(visibleCandles.length / 8));
    for (let i = 0; i < visibleCandles.length; i += step) {
      labels.push({
        x: indexToX(i),
        label: formatTime(visibleCandles[i].time),
      });
    }
    return labels;
  }, [visibleCandles, indexToX]);

  // Fibonacci levels
  const fibonacciLevels = useMemo(() => {
    if (!showFibonacci || visibleCandles.length === 0) return [];

    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    for (const c of visibleCandles) {
      if (c.high > highestHigh) highestHigh = c.high;
      if (c.low < lowestLow) lowestLow = c.low;
    }

    const diff = highestHigh - lowestLow;
    const levels = [
      { pct: 0, price: highestHigh, color: '#fbbf24', label: '0%' },
      { pct: 23.6, price: highestHigh - diff * 0.236, color: '#f59e0b', label: '23.6%' },
      { pct: 38.2, price: highestHigh - diff * 0.382, color: '#d97706', label: '38.2%' },
      { pct: 50, price: highestHigh - diff * 0.5, color: '#b45309', label: '50%' },
      { pct: 61.8, price: highestHigh - diff * 0.618, color: '#d97706', label: '61.8%' },
      { pct: 78.6, price: highestHigh - diff * 0.786, color: '#f59e0b', label: '78.6%' },
      { pct: 100, price: lowestLow, color: '#fbbf24', label: '100%' },
    ];

    return levels;
  }, [showFibonacci, visibleCandles]);

  // Volume profile data
  const volumeProfileData = useMemo(() => {
    if (!showVolumeProfile || visibleCandles.length === 0) return [];

    const numZones = 12;
    const zoneHeight = priceRange / numZones;
    const zones: { priceLow: number; priceHigh: number; buyVol: number; sellVol: number; totalVol: number }[] = [];

    for (let i = 0; i < numZones; i++) {
      const priceLow = minPrice + i * zoneHeight;
      const priceHigh = priceLow + zoneHeight;
      let buyVol = 0;
      let sellVol = 0;

      for (const c of visibleCandles) {
        // Check if candle overlaps this zone
        if (c.high >= priceLow && c.low <= priceHigh) {
          // Proportional allocation based on overlap
          const overlapLow = Math.max(c.low, priceLow);
          const overlapHigh = Math.min(c.high, priceHigh);
          const overlapRatio = (overlapHigh - overlapLow) / (c.high - c.low || 1);

          if (c.isBullish) {
            buyVol += c.volume * overlapRatio;
          } else {
            sellVol += c.volume * overlapRatio;
          }
        }
      }

      zones.push({
        priceLow,
        priceHigh,
        buyVol,
        sellVol,
        totalVol: buyVol + sellVol,
      });
    }

    return zones;
  }, [showVolumeProfile, visibleCandles, minPrice, priceRange]);

  // Find POC (Point of Control) - zone with highest volume
  const volumeProfileMaxVol = useMemo(() => {
    if (volumeProfileData.length === 0) return 0;
    return Math.max(...volumeProfileData.map((z) => z.totalVol));
  }, [volumeProfileData]);

  if (loading) {
    return (
      <Card className="bg-card/50 border-border">
        <CardContent className="p-4">
          <div className="space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-[300px] w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (visibleCandles.length === 0) {
    return (
      <Card className="bg-card/50 border-border">
        <CardContent className="p-8 text-center text-muted-foreground">
          No candlestick data available for {symbol}
        </CardContent>
      </Card>
    );
  }

  // Compute legend items with sequential x positioning
  const legendItems: { label: string; color: string; opacity: number; dashArray?: string }[] = [];
  if (showSMA20) legendItems.push({ label: 'SMA 20', color: '#f59e0b', opacity: 0.7 });
  if (showSMA50) legendItems.push({ label: 'SMA 50', color: '#8b5cf6', opacity: 0.7 });
  if (showBollinger) legendItems.push({ label: 'BB (20,2)', color: '#06b6d4', opacity: 0.4, dashArray: '4,2' });
  if (showEMA12) legendItems.push({ label: 'EMA 12', color: '#06b6d4', opacity: 0.7 });
  if (showEMA26) legendItems.push({ label: 'EMA 26', color: '#f97316', opacity: 0.7 });
  if (showIchimoku) {
    legendItems.push({ label: 'Tenkan', color: '#3b82f6', opacity: 0.8 });
    legendItems.push({ label: 'Kijun', color: '#dc2626', opacity: 0.8 });
    legendItems.push({ label: 'Cloud A', color: '#22c55e', opacity: 0.5 });
    legendItems.push({ label: 'Cloud B', color: '#ef4444', opacity: 0.5 });
  }
  if (showVWAP) legendItems.push({ label: 'VWAP', color: '#06b6d4', opacity: 0.8 });
  if (showEMARibbon) legendItems.push({ label: 'Ribbon (20-55)', color: '#6366f1', opacity: 0.6 });

  return (
    <div ref={containerRef} className="w-full h-full min-h-[350px] relative">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${symbol}-${interval}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full h-full"
        >
          {/* Indicador Numérico de Latência E2E e Telemetria de Render V-Sync (µs e Jank) */}
          <div className="absolute top-2 left-2 z-10 flex items-center gap-2 select-none">
            <div className="flex items-center gap-2 bg-background/85 backdrop-blur-md px-2.5 py-1 rounded-md border border-border/50 text-[10px] font-mono shadow-sm">
              <div className={`w-2 h-2 rounded-full ${e2eLatencyMs < 40 ? 'bg-emerald-500 animate-pulse' : e2eLatencyMs < 120 ? 'bg-amber-500' : 'bg-rose-500'}`} />
              <span className="text-muted-foreground font-semibold">TICK E2E:</span>
              <span className={`font-bold ${e2eLatencyMs < 40 ? 'text-emerald-400' : e2eLatencyMs < 120 ? 'text-amber-400' : 'text-rose-400'}`}>
                {e2eLatencyMs.toFixed(0)}ms
              </span>
              {measureAnchor && (
                <>
                  <span className="text-muted-foreground/40">|</span>
                  <span className="text-amber-400 font-bold bg-amber-500/10 px-1 rounded border border-amber-500/20">
                    RÉGUA R:R ATIVA
                  </span>
                </>
              )}
            </div>

            {/* HUD de Telemetria de Frametime e CPU */}
            <RenderTelemetryHUD />
          </div>

          {/* Zoom controls */}
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setZoom((z) => Math.min(z * 1.5, 5))}
              aria-label="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setZoom((z) => Math.max(z / 1.5, 0.5))}
              aria-label="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setZoom(1)}
              aria-label="Reset zoom"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Banner de alerta de dados de mercado obsoletos (FeedWatchdog) */}
          {isMarketDataStale && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold flex items-center gap-1.5 backdrop-blur-md shadow-lg animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>MARKET DATA STALE (&gt;3s) - ENTRADAS AUTOMÁTICAS SUSPENSAS</span>
            </div>
          )}

          <svg
            ref={svgRef}
            width={dimensions.width}
            height={dimensions.height}
            className="select-none"
            style={{ cursor: draggedOrderLine ? 'ns-resize' : drawingTool !== 'crosshair' ? 'crosshair' : 'default' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onMouseUp={handleMouseUp}
            onClick={handleChartClick}
          >
            {/* Glow filter for drawing lines */}
            <defs>
              <filter id="drawing-glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feFlood floodColor="#06b6d4" floodOpacity="0.6" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="drawing-glow-gold" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feFlood floodColor="#fbbf24" floodOpacity="0.6" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* Spoofing Evasion highlight filters */}
              <linearGradient id="spoof-column-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                <stop offset="35%" stopColor="#10b981" stopOpacity="0.12" />
                <stop offset="70%" stopColor="#10b981" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
              </linearGradient>
              <filter id="spoof-glow-emerald" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feFlood floodColor="#10b981" floodOpacity="0.65" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* Liquidation Hunt Zone Gradient */}
              <linearGradient id="hunt-zone-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0.12" />
              </linearGradient>
            </defs>
            {/* Background */}
            <rect
              x={0}
              y={0}
              width={dimensions.width}
              height={dimensions.height}
              fill="oklch(0.14 0.012 260)"
              rx={8}
            />

            {/* Static Price grid lines layer (Zero-DOM reflow) */}
            <g className="static-grid-layer" style={{ pointerEvents: 'none' }}>
              {priceGridLines.map((price, i) => {
                const y = priceToY(price);
                return (
                  <g key={`grid-${i}`}>
                    <line
                      x1={CHART_PADDING.left}
                      y1={y}
                      x2={dimensions.width - CHART_PADDING.right}
                      y2={y}
                      stroke="oklch(1 0 0 / 5%)"
                      strokeDasharray="3,3"
                    />
                    <text
                      x={dimensions.width - CHART_PADDING.right + 5}
                      y={y + 3}
                      fill="oklch(0.55 0 0)"
                      fontSize={10}
                      fontFamily="monospace"
                    >
                      {formatPrice(price)}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* Ichimoku Cloud - rendered FIRST (behind everything else) */}
            {showIchimoku && (
              <>
                {/* Cloud fill - rendered as individual polygon segments for proper color */}
                {(() => {
                  const segments: React.ReactNode[] = [];
                  for (let i = 1; i < visibleCandles.length; i++) {
                    // At position i, the cloud values come from candle[i-26] (shifted forward 26 periods)
                    const srcIdxA = i - 26;
                    const srcIdxPrevA = (i - 1) - 26;
                    
                    if (srcIdxA < 0 || srcIdxPrevA < 0) continue;
                    if (srcIdxA >= visibleCandles.length || srcIdxPrevA >= visibleCandles.length) continue;
                    
                    const srcA = visibleCandles[srcIdxA];
                    const srcPrevA = visibleCandles[srcIdxPrevA];
                    
                    if (srcA.senkouSpanA === undefined || srcA.senkouSpanB === undefined) continue;
                    if (srcPrevA.senkouSpanA === undefined || srcPrevA.senkouSpanB === undefined) continue;
                    
                    const spanA = srcA.senkouSpanA;
                    const spanB = srcA.senkouSpanB;
                    const prevSpanA = srcPrevA.senkouSpanA;
                    const prevSpanB = srcPrevA.senkouSpanB;
                    
                    const isBullish = spanA >= spanB;
                    const fillColor = isBullish ? '#22c55e' : '#ef4444';
                    
                    const x1 = indexToX(i - 1);
                    const x2 = indexToX(i);
                    
                    segments.push(
                      <polygon
                        key={`ichimoku-cloud-${i}`}
                        points={`${x1},${priceToY(prevSpanA)} ${x2},${priceToY(spanA)} ${x2},${priceToY(spanB)} ${x1},${priceToY(prevSpanB)}`}
                        fill={fillColor}
                        opacity={0.1}
                      />
                    );
                  }
                  return segments;
                })()}

                {/* Senkou Span A line (green border) */}
                {visibleCandles.map((_, i) => {
                  const srcIdx = i - 26;
                  if (srcIdx < 0 || srcIdx >= visibleCandles.length) return null;
                  const src = visibleCandles[srcIdx];
                  if (src.senkouSpanA === undefined || i === 0) return null;
                  
                  const prevSrcIdx = (i - 1) - 26;
                  if (prevSrcIdx < 0 || prevSrcIdx >= visibleCandles.length) return null;
                  const prevSrc = visibleCandles[prevSrcIdx];
                  if (prevSrc.senkouSpanA === undefined) return null;
                  
                  return (
                    <line
                      key={`senkou-a-${i}`}
                      x1={indexToX(i - 1)}
                      y1={priceToY(prevSrc.senkouSpanA)}
                      x2={indexToX(i)}
                      y2={priceToY(src.senkouSpanA)}
                      stroke="#22c55e"
                      strokeWidth={1}
                      opacity={0.5}
                    />
                  );
                })}

                {/* Senkou Span B line (red border) */}
                {visibleCandles.map((_, i) => {
                  const srcIdx = i - 26;
                  if (srcIdx < 0 || srcIdx >= visibleCandles.length) return null;
                  const src = visibleCandles[srcIdx];
                  if (src.senkouSpanB === undefined || i === 0) return null;
                  
                  const prevSrcIdx = (i - 1) - 26;
                  if (prevSrcIdx < 0 || prevSrcIdx >= visibleCandles.length) return null;
                  const prevSrc = visibleCandles[prevSrcIdx];
                  if (prevSrc.senkouSpanB === undefined) return null;
                  
                  return (
                    <line
                      key={`senkou-b-${i}`}
                      x1={indexToX(i - 1)}
                      y1={priceToY(prevSrc.senkouSpanB)}
                      x2={indexToX(i)}
                      y2={priceToY(src.senkouSpanB)}
                      stroke="#ef4444"
                      strokeWidth={1}
                      opacity={0.5}
                    />
                  );
                })}

                {/* Tenkan-sen (Conversion Line) - blue */}
                {visibleCandles.map((candle, i) => {
                  if (candle.tenkanSen === undefined || i === 0) return null;
                  const prev = visibleCandles[i - 1];
                  if (prev.tenkanSen === undefined) return null;
                  return (
                    <line
                      key={`tenkan-${i}`}
                      x1={indexToX(i - 1)}
                      y1={priceToY(prev.tenkanSen)}
                      x2={indexToX(i)}
                      y2={priceToY(candle.tenkanSen)}
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      opacity={0.8}
                    />
                  );
                })}

                {/* Kijun-sen (Base Line) - red/maroon */}
                {visibleCandles.map((candle, i) => {
                  if (candle.kijunSen === undefined || i === 0) return null;
                  const prev = visibleCandles[i - 1];
                  if (prev.kijunSen === undefined) return null;
                  return (
                    <line
                      key={`kijun-${i}`}
                      x1={indexToX(i - 1)}
                      y1={priceToY(prev.kijunSen)}
                      x2={indexToX(i)}
                      y2={priceToY(candle.kijunSen)}
                      stroke="#dc2626"
                      strokeWidth={1.5}
                      opacity={0.8}
                    />
                  );
                })}
              </>
            )}

            {/* Fibonacci Retracement Overlay */}
            {showFibonacci && fibonacciLevels.length > 0 && (
              <>
                {/* Golden zone fill between 38.2% and 61.8% */}
                <rect
                  x={CHART_PADDING.left}
                  y={priceToY(fibonacciLevels[2].price)}
                  width={chartWidth}
                  height={Math.max(0, priceToY(fibonacciLevels[4].price) - priceToY(fibonacciLevels[2].price))}
                  fill="#fbbf24"
                  opacity={0.04}
                />
                {/* Fib level lines */}
                {fibonacciLevels.map((level, i) => {
                  const y = priceToY(level.price);
                  const isPOC = level.pct === 38.2 || level.pct === 61.8;
                  return (
                    <g key={`fib-${i}`}>
                      <line
                        x1={CHART_PADDING.left}
                        y1={y}
                        x2={dimensions.width - CHART_PADDING.right}
                        y2={y}
                        stroke={level.color}
                        strokeWidth={isPOC ? 1.2 : 0.8}
                        strokeDasharray={isPOC ? '6,3' : '4,4'}
                        opacity={isPOC ? 0.5 : 0.3}
                      />
                      <text
                        x={dimensions.width - CHART_PADDING.right + 5}
                        y={y - 3}
                        fill={level.color}
                        fontSize={8}
                        fontFamily="monospace"
                        opacity={0.8}
                      >
                        {level.label}
                      </text>
                      <text
                        x={dimensions.width - CHART_PADDING.right + 5}
                        y={y + 8}
                        fill={level.color}
                        fontSize={8}
                        fontFamily="monospace"
                        opacity={0.6}
                      >
                        {formatPrice(level.price)}
                      </text>
                    </g>
                  );
                })}
              </>
            )}

            {/* Volume Profile Overlay (on right side) */}
            {showVolumeProfile && volumeProfileData.length > 0 && (
              <>
                {volumeProfileData.map((zone, i) => {
                  const yTop = priceToY(zone.priceHigh);
                  const yBottom = priceToY(zone.priceLow);
                  const barHeight = Math.max(1, yBottom - yTop - 1);
                  const maxBarWidth = 55;
                  const isPOC = zone.totalVol === volumeProfileMaxVol && volumeProfileMaxVol > 0;
                  const barWidth = volumeProfileMaxVol > 0 ? (zone.totalVol / volumeProfileMaxVol) * maxBarWidth : 0;
                  const barX = dimensions.width - CHART_PADDING.right + 2;

                  const buyWidth = zone.totalVol > 0 ? (zone.buyVol / zone.totalVol) * barWidth : 0;
                  const sellWidth = barWidth - buyWidth;

                  return (
                    <g key={`vprof-${i}`}>
                      {/* Buy volume bar (green) */}
                      <rect
                        x={barX}
                        y={yTop + 0.5}
                        width={buyWidth}
                        height={barHeight}
                        fill={isPOC ? '#22c55e' : '#22c55e'}
                        opacity={isPOC ? 0.5 : 0.25}
                        rx={1}
                      />
                      {/* Sell volume bar (red) */}
                      <rect
                        x={barX + buyWidth}
                        y={yTop + 0.5}
                        width={sellWidth}
                        height={barHeight}
                        fill={isPOC ? '#ef4444' : '#ef4444'}
                        opacity={isPOC ? 0.5 : 0.25}
                        rx={1}
                      />
                      {/* POC indicator */}
                      {isPOC && (
                        <>
                          <rect
                            x={barX - 2}
                            y={yTop + 0.5}
                            width={barWidth + 4}
                            height={barHeight}
                            fill="none"
                            stroke="#fbbf24"
                            strokeWidth={1}
                            opacity={0.6}
                            rx={1}
                          />
                          <text
                            x={barX + barWidth + 4}
                            y={yTop + barHeight / 2 + 3}
                            fill="#fbbf24"
                            fontSize={7}
                            fontFamily="monospace"
                            opacity={0.8}
                          >
                            POC
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}
              </>
            )}

            {/* Volume / Price separator line */}
            <line
              x1={CHART_PADDING.left}
              y1={CHART_PADDING.top + priceChartHeight}
              x2={dimensions.width - CHART_PADDING.right}
              y2={CHART_PADDING.top + priceChartHeight}
              stroke="oklch(1 0 0 / 8%)"
            />

            {/* Volume bars */}
            {visibleCandles.map((candle, i) => {
              const x = indexToX(i);
              const volY = volumeToY(candle.volume);
              const volHeight = maxVolume > 0 ? (candle.volume / maxVolume) * volumeChartHeight : 0;
              const volBottom = CHART_PADDING.top + priceChartHeight + volumeChartHeight;

              return (
                <rect
                  key={`vol-${i}`}
                  x={x - bodyWidth / 2}
                  y={volY}
                  width={bodyWidth}
                  height={Math.max(0, volHeight)}
                  fill={candle.isBullish ? 'oklch(0.65 0.2 145 / 25%)' : 'oklch(0.65 0.22 25 / 25%)'}
                  rx={1}
                />
              );
            })}

            {/* Candlesticks: Separação de Camadas (Histórico Estático vs Dirty Rect Ativo) */}
            <g key="layer-historical-candles">
              {visibleCandles.slice(0, -1).map((candle, i) => {
                const x = indexToX(i);
                const bodyTop = priceToY(Math.max(candle.open, candle.close));
                const bodyBottom = priceToY(Math.min(candle.open, candle.close));
                const bodyH = Math.max(1, bodyBottom - bodyTop);
                const color = candle.isBullish ? '#22c55e' : '#ef4444';
                const wickColor = candle.isBullish ? 'oklch(0.65 0.2 145 / 70%)' : 'oklch(0.65 0.22 25 / 70%)';

                return (
                  <g key={`candle-hist-${i}`}>
                    {/* Wick */}
                    <line
                      x1={x}
                      y1={priceToY(candle.high)}
                      x2={x}
                      y2={priceToY(candle.low)}
                      stroke={wickColor}
                      strokeWidth={1}
                    />
                    {/* Body */}
                    <rect
                      x={x - bodyWidth / 2}
                      y={bodyTop}
                      width={bodyWidth}
                      height={bodyH}
                      fill={color}
                      rx={1}
                      opacity={0.9}
                    />
                  </g>
                );
              })}
            </g>

            {/* Camada Dinâmica de Alta Frequência (Active Dirty Rect Candle) */}
            {visibleCandles.length > 0 && (() => {
              const activeIndex = visibleCandles.length - 1;
              const candle = visibleCandles[activeIndex];
              const x = indexToX(activeIndex);
              const bodyTop = priceToY(Math.max(candle.open, candle.close));
              const bodyBottom = priceToY(Math.min(candle.open, candle.close));
              const bodyH = Math.max(1, bodyBottom - bodyTop);
              const color = candle.isBullish ? '#22c55e' : '#ef4444';
              const wickColor = candle.isBullish ? 'oklch(0.65 0.2 145 / 80%)' : 'oklch(0.65 0.22 25 / 80%)';

              return (
                <g key="layer-active-dirty-candle">
                  {/* Wick */}
                  <line
                    x1={x}
                    y1={priceToY(candle.high)}
                    x2={x}
                    y2={priceToY(candle.low)}
                    stroke={wickColor}
                    strokeWidth={1.5}
                  />
                  {/* Body com contorno de alta definição */}
                  <rect
                    x={x - bodyWidth / 2}
                    y={bodyTop}
                    width={bodyWidth}
                    height={bodyH}
                    fill={color}
                    stroke={candle.isBullish ? '#86efac' : '#fca5a5'}
                    strokeWidth={0.75}
                    rx={1}
                    opacity={0.95}
                  />
                </g>
              );
            })()}

            {/* SMA 20 line */}
            {showSMA20 &&
              visibleCandles.map((candle, i) => {
                if (candle.sma20 === undefined || i === 0) return null;
                const prev = visibleCandles[i - 1];
                if (prev.sma20 === undefined) return null;
                return (
                  <line
                    key={`sma20-${i}`}
                    x1={indexToX(i - 1)}
                    y1={priceToY(prev.sma20)}
                    x2={indexToX(i)}
                    y2={priceToY(candle.sma20)}
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    opacity={0.7}
                  />
                );
              })}

            {/* SMA 50 line */}
            {showSMA50 &&
              visibleCandles.map((candle, i) => {
                if (candle.sma50 === undefined || i === 0) return null;
                const prev = visibleCandles[i - 1];
                if (prev.sma50 === undefined) return null;
                return (
                  <line
                    key={`sma50-${i}`}
                    x1={indexToX(i - 1)}
                    y1={priceToY(prev.sma50)}
                    x2={indexToX(i)}
                    y2={priceToY(candle.sma50)}
                    stroke="#8b5cf6"
                    strokeWidth={1.5}
                    opacity={0.7}
                  />
                );
              })}

            {/* EMA 12 line */}
            {showEMA12 &&
              visibleCandles.map((candle, i) => {
                if (candle.ema12 === undefined || i === 0) return null;
                const prev = visibleCandles[i - 1];
                if (prev.ema12 === undefined) return null;
                return (
                  <line
                    key={`ema12-${i}`}
                    x1={indexToX(i - 1)}
                    y1={priceToY(prev.ema12)}
                    x2={indexToX(i)}
                    y2={priceToY(candle.ema12)}
                    stroke="#06b6d4"
                    strokeWidth={1.5}
                    opacity={0.7}
                  />
                );
              })}

            {/* EMA 26 line */}
            {showEMA26 &&
              visibleCandles.map((candle, i) => {
                if (candle.ema26 === undefined || i === 0) return null;
                const prev = visibleCandles[i - 1];
                if (prev.ema26 === undefined) return null;
                return (
                  <line
                    key={`ema26-${i}`}
                    x1={indexToX(i - 1)}
                    y1={priceToY(prev.ema26)}
                    x2={indexToX(i)}
                    y2={priceToY(candle.ema26)}
                    stroke="#f97316"
                    strokeWidth={1.5}
                    opacity={0.7}
                  />
                );
              })}

            {/* Bollinger Bands */}
            {showBollinger && (
              <>
                {/* Fill area between bands */}
                <path
                  d={(() => {
                    const upperPoints: string[] = [];
                    const lowerPoints: string[] = []
                    for (let i = 0; i < visibleCandles.length; i++) {
                      const c = visibleCandles[i];
                      if (c.bbUpper === undefined || c.bbLower === undefined) continue;
                      const x = indexToX(i);
                      upperPoints.push(`${x},${priceToY(c.bbUpper)}`);
                      lowerPoints.push(`${x},${priceToY(c.bbLower)}`);
                    }
                    if (upperPoints.length < 2) return '';
                    return `M ${upperPoints.join(' L ')} L ${lowerPoints.reverse().join(' L ')} Z`;
                  })()}
                  fill="oklch(0.75 0.15 195 / 5%)"
                  stroke="none"
                />
                {/* Upper band */}
                {visibleCandles.map((candle, i) => {
                  if (candle.bbUpper === undefined || i === 0) return null;
                  const prev = visibleCandles[i - 1];
                  if (prev.bbUpper === undefined) return null;
                  return (
                    <line
                      key={`bb-upper-${i}`}
                      x1={indexToX(i - 1)}
                      y1={priceToY(prev.bbUpper)}
                      x2={indexToX(i)}
                      y2={priceToY(candle.bbUpper)}
                      stroke="#06b6d4"
                      strokeWidth={1}
                      opacity={0.4}
                      strokeDasharray="4,2"
                    />
                  );
                })}
                {/* Lower band */}
                {visibleCandles.map((candle, i) => {
                  if (candle.bbLower === undefined || i === 0) return null;
                  const prev = visibleCandles[i - 1];
                  if (prev.bbLower === undefined) return null;
                  return (
                    <line
                      key={`bb-lower-${i}`}
                      x1={indexToX(i - 1)}
                      y1={priceToY(prev.bbLower)}
                      x2={indexToX(i)}
                      y2={priceToY(candle.bbLower)}
                      stroke="#06b6d4"
                      strokeWidth={1}
                      opacity={0.4}
                      strokeDasharray="4,2"
                    />
                  );
                })}
              </>
            )}

            {/* VWAP line */}
            {showVWAP &&
              visibleCandles.map((candle, i) => {
                if (candle.vwap === undefined || i === 0) return null;
                const prev = visibleCandles[i - 1];
                if (prev.vwap === undefined) return null;
                return (
                  <line
                    key={`vwap-${i}`}
                    x1={indexToX(i - 1)}
                    y1={priceToY(prev.vwap)}
                    x2={indexToX(i)}
                    y2={priceToY(candle.vwap)}
                    stroke="#22d3ee"
                    strokeWidth={1.5}
                    opacity={0.8}
                  />
                );
              })}

            {/* EMA Ribbon */}
            {showEMARibbon &&
              (() => {
                const ribbonPeriods = [20, 25, 30, 35, 40, 45, 50, 55];
                const ribbonColors = [
                  '#818cf8', '#6366f1', '#4f46e5', '#4338ca',
                  '#3730a3', '#312e81', '#2e1065', '#1e1b4b'
                ];
                return ribbonPeriods.map((period, ribbonIdx) => {
                  const propName = `ema${period}` as keyof ProcessedCandle;
                  return visibleCandles.map((candle, i) => {
                    if (i === 0) return null;
                    const val = candle[propName] as number | undefined;
                    const prevVal = visibleCandles[i - 1][propName] as number | undefined;
                    if (val === undefined || prevVal === undefined) return null;
                    return (
                      <line
                        key={`ribbon-${period}-${i}`}
                        x1={indexToX(i - 1)}
                        y1={priceToY(prevVal)}
                        x2={indexToX(i)}
                        y2={priceToY(val)}
                        stroke={ribbonColors[ribbonIdx]}
                        strokeWidth={1}
                        opacity={0.4}
                      />
                    );
                  });
                });
              })()}

            {/* Trade execution markers */}
            {(() => {
              const activeTrades = trades.filter((t) => t.symbol === symbol);
              return activeTrades.map((trade) => {
                const tradeTime = new Date(trade.timestamp).getTime();
                
                // Find the closest candle
                if (candles.length === 0) return null;
                let closestIdx = 0;
                let minDiff = Infinity;
                for (let j = 0; j < candles.length; j++) {
                  const diff = Math.abs(candles[j].time - tradeTime);
                  if (diff < minDiff) {
                    minDiff = diff;
                    closestIdx = j;
                  }
                }
                
                // Check if in visible window
                const startOfVisible = candles.length - visibleCandles.length;
                const relIndex = closestIdx - startOfVisible;
                if (relIndex < 0 || relIndex >= visibleCandles.length) return null;
                
                const x = indexToX(relIndex);
                const y = priceToY(trade.price);
                const isBuy = trade.side === "BUY";
                const color = isBuy ? "#10b981" : "#ef4444";
                
                    const pnlStr = typeof trade.pnl === 'number' && Number.isFinite(trade.pnl)
                      ? `${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)} USD`
                      : 'N/A';
                    const modeStr = (trade.mode || 'LIVE').toUpperCase();
                    const symStr = (trade.symbol || symbol || '').replace("USDT", "");
                    
                    return (
                      <g key={`marker-${trade.id}`} className="cursor-help">
                        {isBuy ? (
                          // Upward pointing green caret/triangle
                          <polygon
                            points={`${x},${y - 12} ${x - 6},${y - 4} ${x + 6},${y - 4}`}
                            fill="#22c55e"
                            stroke="#10b981"
                            strokeWidth={1}
                          />
                        ) : (
                          // Downward pointing red caret/triangle
                          <polygon
                            points={`${x},${y + 12} ${x - 6},${y + 4} ${x + 6},${y + 4}`}
                            fill="#ef4444"
                            stroke="#f43f5e"
                            strokeWidth={1}
                          />
                        )}
                        {/* Vertical line connecting to trade price */}
                        <line
                          x1={x}
                          y1={y}
                          x2={x}
                          y2={isBuy ? y - 4 : y + 4}
                          stroke={color}
                          strokeWidth={1}
                          strokeDasharray="2,2"
                          opacity={0.6}
                        />
                        <title>{`Execução ${trade.side === 'BUY' ? 'Compra' : 'Venda'}\nQtd: ${trade.quantity} ${symStr}\nPreço: ${formatPrice(trade.price)}\nPnL: ${pnlStr}\nEstratégia: ${trade.strategy || 'AI'}\nModo: ${modeStr}`}</title>
                      </g>
                    );
                  });
                })()}

            {/* Liquidity Spoofing Evasion Markers & Candle Highlighting */}
            {showSpoofingMarkers && (() => {
              if (activeSpoofingEvents.length === 0 || candles.length === 0) return null;
              const startOfVisible = candles.length - visibleCandles.length;

              return activeSpoofingEvents.map((event) => {
                const eventTime = event.timestamp;

                // Encontra o candle mais próximo temporalmente
                let closestIdx = 0;
                let minDiff = Infinity;
                for (let j = 0; j < candles.length; j++) {
                  const diff = Math.abs(candles[j].time - eventTime);
                  if (diff < minDiff) {
                    minDiff = diff;
                    closestIdx = j;
                  }
                }

                const relIndex = closestIdx - startOfVisible;
                if (relIndex < 0 || relIndex >= visibleCandles.length) return null;

                const candle = visibleCandles[relIndex];
                const x = indexToX(relIndex);
                const colWidth = Math.max(bodyWidth + 12, candleWidth * 0.95);
                const colX = x - colWidth / 2;
                const colY = CHART_PADDING.top;
                const colHeight = priceChartHeight;

                const candleHighY = priceToY(candle.high);
                const candleLowY = priceToY(candle.low);

                // Posicionamento do marcador de escudo (por padrão acima do topo do candle)
                const placeAbove = candleHighY - 26 >= CHART_PADDING.top + 10;
                const badgeY = placeAbove ? candleHighY - 24 : candleLowY + 24;
                const pillY = placeAbove ? badgeY - 14 : badgeY + 14;

                const isRecent = Date.now() - event.timestamp < 180000;
                const isBidSpoof = event.side === 'BID';
                const dropPctFormatted = event.dropPct ? event.dropPct.toFixed(1) : '30.0';
                const eventRefPrice = event.price ?? candle.close;
                const wickCalc = calculateWickPenetration({
                  entryPrice: eventRefPrice,
                  candleHigh: candle.high,
                  candleLow: candle.low,
                  candleOpen: candle.open,
                  candleClose: candle.close,
                  candleVolume: candle.volume,
                  side: event.side,
                  stopLossPct: 1.8,
                  timeDeltaMs: event.timeDeltaMs,
                });

                const stopLossY = priceToY(wickCalc.theoreticalStopPrice);
                const wickTipY = priceToY(wickCalc.manipulatedWickPrice);
                const huntTopY = Math.min(stopLossY, wickTipY);
                const huntHeight = Math.max(Math.abs(stopLossY - wickTipY), 4);
                const huntWidth = Math.max(colWidth * 1.3, 14);
                const huntX = x - huntWidth / 2;

                return (
                  <g key={`spoof-marker-${event.id}`} className="cursor-pointer">
                    {/* 1. Faixa Vertical Translúcida de Fundo Destacando o Candle */}
                    <rect
                      x={colX}
                      y={colY}
                      width={colWidth}
                      height={colHeight}
                      fill="url(#spoof-column-gradient)"
                      rx={3}
                      stroke="#10b981"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      strokeOpacity={0.4}
                    />

                    {/* 1.1 Zona de Liquidação Evitada (Hunt Zone): Sombreado vermelho translúcido entre o Stop Teórico e o Pavio */}
                    {wickCalc.didBreachStop && (
                      <g
                        className="cursor-pointer transition-transform hover:scale-105"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveStopHuntPopover((curr) =>
                            curr?.id === event.id
                              ? null
                              : {
                                  id: event.id,
                                  x: huntX + huntWidth / 2,
                                  y: huntTopY,
                                  rejection: wickCalc.rejection,
                                  orderFlow: wickCalc.orderFlow,
                                  candle,
                                  eventPrice: eventRefPrice,
                                  stopLossPrice: wickCalc.theoreticalStopPrice,
                                  savedLossUsd: wickCalc.savedLossUsd,
                                  narrative: wickCalc.narrative,
                                  side: wickCalc.side,
                                }
                          );
                        }}
                        onMouseEnter={() => {
                          setActiveStopHuntPopover({
                            id: event.id,
                            x: huntX + huntWidth / 2,
                            y: huntTopY,
                            rejection: wickCalc.rejection,
                            orderFlow: wickCalc.orderFlow,
                            candle,
                            eventPrice: eventRefPrice,
                            stopLossPrice: wickCalc.theoreticalStopPrice,
                            savedLossUsd: wickCalc.savedLossUsd,
                            narrative: wickCalc.narrative,
                            side: wickCalc.side,
                          });
                        }}
                      >
                        <title>{`⚡ VELOCIDADE DE REJEIÇÃO DO PAVIO (STOP HUNT)
Classificação: ${wickCalc.rejection.label}
Tempo de Rejeição: ${wickCalc.rejection.rejectionTimeMs}ms
Velocidade de Absorção: $${wickCalc.rejection.rejectionVelocityUsdPerSec}/s
Absorção do Pavio: ${wickCalc.rejection.absorptionPct}% (~${wickCalc.rejection.estimatedTicks} ticks)

Order Flow & Delta Agressor (Pé do Pavio):
 • Driver: ${wickCalc.orderFlow.driverTitle}
 • Razão Delta Agressivo: ${wickCalc.orderFlow.aggressiveDeltaRatio}x (${wickCalc.orderFlow.volumeDeltaPct >= 0 ? '+' : ''}${wickCalc.orderFlow.volumeDeltaPct}% Delta)
 • Taker Buy vs Sell: ${wickCalc.orderFlow.buyPressurePct}% Comprador / ${wickCalc.orderFlow.sellPressurePct}% Vendedor
 • Diagnóstico: ${wickCalc.orderFlow.driverDescription}

${wickCalc.rejection.summary}

Clique para fixar o mini-popover de telemetria.`}</title>
                        <rect
                          x={huntX}
                          y={huntTopY}
                          width={huntWidth}
                          height={huntHeight}
                          fill="url(#hunt-zone-gradient)"
                          rx={3}
                          stroke="#f43f5e"
                          strokeWidth={1}
                          strokeDasharray="2 2"
                          strokeOpacity={0.85}
                        />
                        {/* Nível do Stop Loss Teórico */}
                        <line
                          x1={huntX - 4}
                          y1={stopLossY}
                          x2={huntX + huntWidth + 4}
                          y2={stopLossY}
                          stroke="#f43f5e"
                          strokeWidth={1.5}
                          strokeDasharray="2 2"
                        />
                        {/* Micro-etiqueta STOP HUNT com fundo sólido para clique */}
                        <rect
                          x={huntX + huntWidth / 2 - 25}
                          y={huntTopY + huntHeight / 2 - 6}
                          width={50}
                          height={12}
                          rx={2.5}
                          fill="#881337"
                          fillOpacity={0.9}
                          stroke="#f43f5e"
                          strokeWidth={0.8}
                        />
                        <text
                          x={huntX + huntWidth / 2}
                          y={huntTopY + huntHeight / 2 + 2.5}
                          textAnchor="middle"
                          fontSize="7"
                          fontFamily="monospace"
                          fontWeight="bold"
                          fill="#fecdd3"
                          opacity={0.95}
                          className="select-none pointer-events-none"
                        >
                          STOP HUNT
                        </text>
                      </g>
                    )}

                    {/* 2. Destaque Especial no Pavio / Absorção da Vela */}
                    <line
                      x1={x}
                      y1={candleHighY}
                      x2={x}
                      y2={candleLowY}
                      stroke="#10b981"
                      strokeWidth={3}
                      opacity={0.8}
                      strokeLinecap="round"
                    />
                    {/* Ticks nas extremidades do pavio (Máxima e Mínima) */}
                    <line
                      x1={x - 4}
                      y1={candleHighY}
                      x2={x + 4}
                      y2={candleHighY}
                      stroke="#34d399"
                      strokeWidth={2}
                    />
                    <line
                      x1={x - 4}
                      y1={candleLowY}
                      x2={x + 4}
                      y2={candleLowY}
                      stroke="#34d399"
                      strokeWidth={2}
                    />

                    {/* 3. Linha Conectora Tracejada entre o Pavio e o Escudo */}
                    <line
                      x1={x}
                      y1={placeAbove ? candleHighY : candleLowY}
                      x2={x}
                      y2={badgeY}
                      stroke="#10b981"
                      strokeWidth={1.5}
                      strokeDasharray="2 2"
                      opacity={0.85}
                    />

                    {/* 4. Anel Pulsante de Radar (ativo se recente) */}
                    {isRecent && (
                      <circle
                        cx={x}
                        cy={badgeY}
                        r={14}
                        fill="#10b981"
                        className="animate-ping"
                        opacity={0.35}
                      />
                    )}

                    {/* 5. Círculo Escudo Esmeralda com Ícone */}
                    <circle
                      cx={x}
                      cy={badgeY}
                      r={11}
                      fill="#022c22"
                      stroke="#10b981"
                      strokeWidth={1.5}
                      filter="url(#spoof-glow-emerald)"
                    />
                    <text
                      x={x}
                      y={badgeY + 4}
                      textAnchor="middle"
                      fontSize="12"
                      className="select-none pointer-events-none"
                    >
                      🛡️
                    </text>

                    {/* 6. Pill Tag Superior Informativa */}
                    <g transform={`translate(${x}, ${pillY})`}>
                      <rect
                        x={-30}
                        y={-8}
                        width={60}
                        height={16}
                        rx={4}
                        fill="#064e3b"
                        stroke="#10b981"
                        strokeWidth={1}
                        opacity={0.95}
                      />
                      <text
                        x={0}
                        y={3.5}
                        textAnchor="middle"
                        fontSize="9"
                        fontWeight="bold"
                        fontFamily="monospace"
                        fill="#a7f3d0"
                      >
                        -{dropPctFormatted}% SPOOF
                      </text>
                    </g>

                    {/* 7. Tooltip Nativo SVG com Dados de Auditoria e Filtro de Pavio */}
                    <title>{`🛡️ EVASÃO DE SPOOFING (IA DEFENSE)
Horário: ${new Date(event.timestamp).toLocaleTimeString()}
Lado Manipulado: ${isBidSpoof ? 'BID (Suporte Falso Cancelado)' : 'ASK (Resistência Falsa Cancelada)'}
Parede Retirada: -${dropPctFormatted}% do Book L2
Preço no Evento: ${formatPrice(eventRefPrice)}

Candle Auditado:
 • Máxima: ${formatPrice(candle.high)}
 • Mínima: ${formatPrice(candle.low)}
 • Abertura: ${formatPrice(candle.open)} | Fechamento: ${formatPrice(candle.close)}
 • Volume: ${formatVolume(candle.volume)}
 • Amplitude do Pavio: ${( ((candle.high - candle.low) / (candle.low || 1)) * 100 ).toFixed(2)}%

Filtro de Liquidação de Pavio:
 • Stop Loss Teórico: ${formatPrice(wickCalc.theoreticalStopPrice)} (-${wickCalc.stopLossPct.toFixed(1)}%)
 • Pavio Manipulado (${isBidSpoof ? 'Mínima' : 'Máxima'}): ${formatPrice(wickCalc.manipulatedWickPrice)}
 • Distância Pavio vs Stop: $${wickCalc.distanceToStopUsd.toFixed(2)} (${wickCalc.distanceToStopPct.toFixed(2)}%) ${wickCalc.didBreachStop ? '[Pavio Perfurou Stop]' : '[Pavio Próximo ao Stop]'}
 • ${wickCalc.narrative}

Ação da IA: Disparo a mercado retido por 3s. Evitou falso rompimento e adverse slippage.`}</title>
                  </g>
                );
              });
            })()}

            {/* Time labels */}
            {timeLabels.map((label, i) => (
              <text
                key={`time-${i}`}
                x={label.x}
                y={dimensions.height - 5}
                fill="oklch(0.55 0 0)"
                fontSize={10}
                fontFamily="monospace"
                textAnchor="middle"
              >
                {label.label}
              </text>
            ))}

            {/* R:R Measurement Box & Projection Overlay */}
            {measureAnchor && tooltip && (() => {
              const currentPrice = tooltip.snappedPrice ?? tooltip.candle.close;
              const deltaPrice = currentPrice - measureAnchor.price;
              const pctChange = (deltaPrice / measureAnchor.price) * 100;
              const isGain = deltaPrice >= 0;

              const riskDist = Math.abs(measureAnchor.price - (isGain ? tooltip.candle.low : tooltip.candle.high));
              const safeRisk = riskDist > 0 ? riskDist : (measureAnchor.price * 0.005);
              const rewardDist = Math.abs(deltaPrice);
              const rrRatio = (rewardDist / safeRisk).toFixed(2);

              const boxX = Math.min(measureAnchor.x, tooltip.x);
              const boxW = Math.max(Math.abs(tooltip.x - measureAnchor.x), 2);
              const boxY = Math.min(measureAnchor.y, tooltip.y);
              const boxH = Math.max(Math.abs(tooltip.y - measureAnchor.y), 2);

              return (
                <g key="rr-measurement-overlay">
                  {/* Projection fill area */}
                  <rect
                    x={boxX}
                    y={boxY}
                    width={boxW}
                    height={boxH}
                    fill={isGain ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'}
                    stroke={isGain ? '#22c55e' : '#ef4444'}
                    strokeWidth={1}
                    strokeDasharray="4,4"
                  />
                  {/* Anchor connection line */}
                  <line
                    x1={measureAnchor.x}
                    y1={measureAnchor.y}
                    x2={tooltip.x}
                    y2={tooltip.y}
                    stroke={isGain ? '#22c55e' : '#ef4444'}
                    strokeWidth={1.5}
                  />
                  <circle cx={measureAnchor.x} cy={measureAnchor.y} r={4} fill="#fbbf24" stroke="#ffffff" strokeWidth={1} />
                  {/* Measurement Badge */}
                  <g transform={`translate(${Math.max(CHART_PADDING.left + 5, Math.min(dimensions.width - 240, tooltip.x + 10))}, ${Math.max(CHART_PADDING.top + 5, tooltip.y - 45)})`}>
                    <rect
                      width={185}
                      height={42}
                      fill="oklch(0.12 0.015 260 / 95%)"
                      stroke={isGain ? '#22c55e' : '#ef4444'}
                      strokeWidth={1}
                      rx={4}
                    />
                    <text x={8} y={16} fill="white" fontSize={10} fontWeight={600} fontFamily="monospace">
                      Δ: {deltaPrice >= 0 ? '+' : ''}{deltaPrice.toFixed(2)} ({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(2)}%)
                    </text>
                    <text x={8} y={32} fill="#38bdf8" fontSize={9} fontFamily="monospace">
                      R:R EST: <tspan fill="#facc15" fontWeight={700}>1 : {rrRatio}</tspan> | [ESC] limpa
                    </text>
                  </g>
                </g>
              );
            })()}

            {/* Crosshair + Tooltip */}
            {tooltip && (
              <>
                {/* Horizontal crosshair */}
                <line
                  x1={CHART_PADDING.left}
                  y1={tooltip.y}
                  x2={dimensions.width - CHART_PADDING.right}
                  y2={tooltip.y}
                  stroke="oklch(0.75 0.15 195 / 30%)"
                  strokeDasharray="4,4"
                  strokeWidth={1}
                />
                {/* Vertical crosshair */}
                <line
                  x1={tooltip.x}
                  y1={CHART_PADDING.top}
                  x2={tooltip.x}
                  y2={CHART_PADDING.top + chartHeight}
                  stroke="oklch(0.75 0.15 195 / 30%)"
                  strokeDasharray="4,4"
                  strokeWidth={1}
                />
                {/* Price label on Y axis */}
                <rect
                  x={dimensions.width - CHART_PADDING.right}
                  y={tooltip.y - 10}
                  width={CHART_PADDING.right}
                  height={20}
                  fill={tooltip.snappedField ? "#0284c7" : "#06b6d4"}
                  rx={3}
                />
                <text
                  x={dimensions.width - CHART_PADDING.right + 4}
                  y={tooltip.y + 4}
                  fill="white"
                  fontSize={10}
                  fontFamily="monospace"
                  fontWeight={600}
                >
                  {formatPrice(tooltip.snappedPrice ?? tooltip.candle.close)}
                </text>

                {/* Magnetic Snap Marker */}
                {tooltip.snappedField && (
                  <g>
                    <circle
                      cx={tooltip.x}
                      cy={tooltip.y}
                      r={4}
                      fill="#06b6d4"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                    <rect
                      x={tooltip.x + 6}
                      y={tooltip.y - 8}
                      width={24}
                      height={15}
                      fill="#0284c7"
                      rx={3}
                    />
                    <text
                      x={tooltip.x + 18}
                      y={tooltip.y + 3}
                      fill="white"
                      fontSize={8}
                      fontWeight={700}
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      {tooltip.snappedField.toUpperCase()}
                    </text>
                  </g>
                )}

                {/* Tooltip info box */}
                <g>
                  <rect
                    x={tooltip.x + 15}
                    y={CHART_PADDING.top + 5}
                    width={150}
                    height={tooltip.snappedField ? 116 : 100}
                    fill="oklch(0.17 0.015 260 / 95%)"
                    stroke="oklch(1 0 0 / 10%)"
                    rx={6}
                  />
                  <text x={tooltip.x + 25} y={CHART_PADDING.top + 22} fill="oklch(0.55 0 0)" fontSize={9}>
                    O: <tspan fill="oklch(0.95 0 0)">{formatPrice(tooltip.candle.open)}</tspan>
                  </text>
                  <text x={tooltip.x + 25} y={CHART_PADDING.top + 38} fill="oklch(0.55 0 0)" fontSize={9}>
                    H: <tspan fill="oklch(0.95 0 0)">{formatPrice(tooltip.candle.high)}</tspan>
                  </text>
                  <text x={tooltip.x + 25} y={CHART_PADDING.top + 54} fill="oklch(0.55 0 0)" fontSize={9}>
                    L: <tspan fill="oklch(0.95 0 0)">{formatPrice(tooltip.candle.low)}</tspan>
                  </text>
                  <text x={tooltip.x + 25} y={CHART_PADDING.top + 70} fill="oklch(0.55 0 0)" fontSize={9}>
                    C:{' '}
                    <tspan fill={tooltip.candle.isBullish ? '#22c55e' : '#ef4444'}>
                      {formatPrice(tooltip.candle.close)}
                    </tspan>
                  </text>
                  <text x={tooltip.x + 25} y={CHART_PADDING.top + 86} fill="oklch(0.55 0 0)" fontSize={9}>
                    Vol: <tspan fill="oklch(0.95 0 0)">{formatVolume(tooltip.candle.volume)}</tspan>
                  </text>
                  {tooltip.snappedField && (
                    <text x={tooltip.x + 25} y={CHART_PADDING.top + 102} fill="#38bdf8" fontSize={9} fontWeight={600}>
                      SNAP: {tooltip.snappedField.toUpperCase()} ({formatPrice(tooltip.snappedPrice!)})
                    </text>
                  )}
                </g>
              </>
            )}

            {/* Legend for indicators */}
            {legendItems.map((item, i) => {
              const xBase = CHART_PADDING.left + 10 + i * 70;
              return (
                <g key={`legend-${i}`}>
                  <line
                    x1={xBase}
                    y1={CHART_PADDING.top + 8}
                    x2={xBase + 20}
                    y2={CHART_PADDING.top + 8}
                    stroke={item.color}
                    strokeWidth={2}
                    opacity={item.opacity}
                    strokeDasharray={item.dashArray}
                  />
                  <text
                    x={xBase + 24}
                    y={CHART_PADDING.top + 11}
                    fill="oklch(0.65 0 0)"
                    fontSize={9}
                  >
                    {item.label}
                  </text>
                </g>
              );
            })}

            {/* Drawing: Horizontal Lines */}
            {drawings.filter((d) => d.type === 'horizontal' && d.price !== undefined).map((drawing) => {
              const y = priceToY(drawing.price!);
              return (
                <g key={drawing.id}>
                  <line
                    x1={CHART_PADDING.left}
                    y1={y}
                    x2={dimensions.width - CHART_PADDING.right}
                    y2={y}
                    stroke="#fbbf24"
                    strokeWidth={1.5}
                    strokeDasharray="8,4"
                    opacity={0.8}
                    filter="url(#drawing-glow-gold)"
                  />
                  {/* Price label on right side */}
                  <rect
                    x={dimensions.width - CHART_PADDING.right + 1}
                    y={y - 8}
                    width={CHART_PADDING.right - 2}
                    height={16}
                    fill="#fbbf24"
                    opacity={0.2}
                    rx={3}
                  />
                  <text
                    x={dimensions.width - CHART_PADDING.right + 5}
                    y={y + 3}
                    fill="#fbbf24"
                    fontSize={9}
                    fontFamily="monospace"
                    fontWeight={600}
                  >
                    {formatPrice(drawing.price!)}
                  </text>
                </g>
              );
            })}

            {/* Drawing: Trendlines */}
            {drawings.filter((d) => d.type === 'trendline' && d.startTime !== undefined && d.endTime !== undefined).map((drawing) => {
              const x1 = timeToX(drawing.startTime!);
              const y1 = priceToY(drawing.startPrice!);
              const x2 = timeToX(drawing.endTime!);
              const y2 = priceToY(drawing.endPrice!);
              return (
                <g key={drawing.id}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#06b6d4"
                    strokeWidth={1.5}
                    strokeDasharray="6,3"
                    opacity={0.8}
                    filter="url(#drawing-glow-cyan)"
                  />
                  {/* Start point dot */}
                  <circle cx={x1} cy={y1} r={3} fill="#06b6d4" opacity={0.8} />
                  {/* End point dot */}
                  <circle cx={x2} cy={y2} r={3} fill="#06b6d4" opacity={0.8} />
                </g>
              );
            })}

            {/* Drawing Preview: Pending trendline */}
            {pendingDrawPoint && drawingTool === 'trendline' && drawMousePos && (
              <line
                x1={timeToX(pendingDrawPoint.time)}
                y1={priceToY(pendingDrawPoint.price)}
                x2={drawMousePos.x}
                y2={drawMousePos.y}
                stroke="#06b6d4"
                strokeWidth={1.5}
                strokeDasharray="6,3"
                opacity={0.5}
              />
            )}

            {/* Drawing Preview: Pending start point indicator */}
            {pendingDrawPoint && drawingTool === 'trendline' && (
              <circle
                cx={timeToX(pendingDrawPoint.time)}
                cy={priceToY(pendingDrawPoint.price)}
                r={4}
                fill="#06b6d4"
                opacity={0.6}
                stroke="#06b6d4"
                strokeWidth={1}
              />
            )}

            {/* Drawing Preview: Horizontal line preview */}
            {drawingTool === 'horizontal' && drawMousePos && (
              <line
                x1={CHART_PADDING.left}
                y1={drawMousePos.y}
                x2={dimensions.width - CHART_PADDING.right}
                y2={drawMousePos.y}
                stroke="#fbbf24"
                strokeWidth={1}
                strokeDasharray="8,4"
                opacity={0.4}
              />
            )}

            {/* Linhas Interativas de Execução e Drag-and-Drop de SL / TP (Módulo 3) */}
            {activeBotWithPosition && activeBotWithPosition.position && (() => {
              const pos = activeBotWithPosition.position;
              const entryPrice = pos.entryPrice;
              const qty = pos.quantity;

              const currentTp = draggedOrderLine?.type === 'TP'
                ? draggedOrderLine.currentPrice
                : (pos.dynamicTakeProfit || entryPrice * (1 + (activeBotWithPosition.takeProfit || 3) / 100));

              const currentSl = draggedOrderLine?.type === 'SL'
                ? draggedOrderLine.currentPrice
                : (pos.dynamicStopLoss || entryPrice * (1 - (activeBotWithPosition.stopLoss || 2) / 100));

              const entryY = priceToY(entryPrice);
              const tpY = priceToY(currentTp);
              const slY = priceToY(currentSl);

              const tpGainUsd = (currentTp - entryPrice) * qty;
              const tpGainPct = ((currentTp - entryPrice) / entryPrice) * 100;
              const slLossUsd = (currentSl - entryPrice) * qty;
              const slLossPct = ((currentSl - entryPrice) / entryPrice) * 100;

              // Breakeven Automático Interativo (BE Anchor) com Custo Total de Taxas (0.25% líquido)
              const roundTripFeePercent = 0.25;
              const bePrice = pos.breakEvenPrice || parseFloat((entryPrice * (1 + roundTripFeePercent / 100)).toFixed(4));
              const beY = priceToY(bePrice);
              const isStopAtBreakeven = Boolean(
                (pos.isBreakEvenArmed && currentSl >= entryPrice) ||
                Math.abs(currentSl - bePrice) / entryPrice < 0.0008
              );

              const slBadgeWidth = isStopAtBreakeven ? 215 : 180;
              const slBadgeX = dimensions.width - CHART_PADDING.right - slBadgeWidth - 22;

              return (
                <g key="interactive-position-overlay">
                  {/* 1. LINHA DE PREÇO MÉDIO DE ENTRADA (Azul / Cyan) */}
                  <line
                    x1={CHART_PADDING.left}
                    y1={entryY}
                    x2={dimensions.width - CHART_PADDING.right}
                    y2={entryY}
                    stroke="#06b6d4"
                    strokeWidth={1.5}
                    strokeDasharray="4,2"
                    opacity={0.85}
                  />
                  {/* Badge de Entrada */}
                  <rect
                    x={CHART_PADDING.left + 8}
                    y={entryY - 10}
                    width={130}
                    height={20}
                    fill="#083344"
                    stroke="#06b6d4"
                    strokeWidth={1}
                    rx={4}
                  />
                  <text
                    x={CHART_PADDING.left + 14}
                    y={entryY + 4}
                    fill="#22d3ee"
                    fontSize={10}
                    fontFamily="monospace"
                    fontWeight={700}
                  >
                    ENTRADA: {qty} @ ${formatPrice(entryPrice)}
                  </text>

                  {/* 1.1 LINHA DE ÂNCORA DE BREAKEVEN (BE Anchor Reference Line - Dourado / Âmbar) */}
                  {!isStopAtBreakeven && (
                    <g
                      className="cursor-pointer group"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleActivateBreakevenAnchor(activeBotWithPosition);
                      }}
                    >
                      <line
                        x1={CHART_PADDING.left + 142}
                        y1={beY}
                        x2={dimensions.width - CHART_PADDING.right}
                        y2={beY}
                        stroke="#f59e0b"
                        strokeWidth={1.2}
                        strokeDasharray="3,3"
                        opacity={0.65}
                      />
                      {/* Badge da Âncora BE */}
                      <rect
                        x={CHART_PADDING.left + 142}
                        y={beY - 9}
                        width={132}
                        height={18}
                        fill="#451a03"
                        stroke="#f59e0b"
                        strokeWidth={1}
                        rx={3}
                        className="group-hover:fill-amber-900 transition-colors"
                      />
                      <text
                        x={CHART_PADDING.left + 148}
                        y={beY + 3.5}
                        fill="#fbbf24"
                        fontSize={9}
                        fontFamily="monospace"
                        fontWeight={700}
                      >
                        ⚓ BE ANCHOR: ${formatPrice(bePrice)}
                      </text>
                      <title>
                        Âncora de Breakeven Líquido (+0.25% para cobrir taxas Maker/Taker + slippage). Dê duplo clique no Stop Loss ou clique aqui para travar risco zero instantaneamente.
                      </title>
                    </g>
                  )}

                  {/* 2. LINHA DE TAKE-PROFIT (Verde / Emerald) */}
                  <line
                    x1={CHART_PADDING.left}
                    y1={tpY}
                    x2={dimensions.width - CHART_PADDING.right}
                    y2={tpY}
                    stroke="#10b981"
                    strokeWidth={draggedOrderLine?.type === 'TP' ? 2.5 : 1.5}
                    strokeDasharray="6,3"
                    opacity={0.9}
                  />
                  {/* Handle de Drag TP */}
                  <circle
                    cx={dimensions.width - CHART_PADDING.right - 14}
                    cy={tpY}
                    r={7}
                    fill="#065f46"
                    stroke="#34d399"
                    strokeWidth={2}
                    className="cursor-ns-resize hover:scale-125 transition-transform"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDraggedOrderLine({
                        botId: activeBotWithPosition.id,
                        type: 'TP',
                        currentPrice: currentTp,
                        initialPrice: currentTp,
                        entryPrice,
                        quantity: qty,
                      });
                    }}
                  />
                  {/* Badge TP */}
                  <rect
                    x={dimensions.width - CHART_PADDING.right - 180}
                    y={tpY - 10}
                    width={160}
                    height={20}
                    fill="#064e3b"
                    stroke="#10b981"
                    strokeWidth={1}
                    rx={4}
                  />
                  <text
                    x={dimensions.width - CHART_PADDING.right - 174}
                    y={tpY + 4}
                    fill="#6ee7b7"
                    fontSize={10}
                    fontFamily="monospace"
                    fontWeight={700}
                  >
                    TP: ${formatPrice(currentTp)} (+${(Number.isFinite(tpGainUsd) ? tpGainUsd : 0).toFixed(2)} | +${(Number.isFinite(tpGainPct) ? tpGainPct : 0).toFixed(1)}%)
                  </text>

                  {/* 3. LINHA DE STOP-LOSS (Vermelha / Rose OU Dourada se Breakeven Armado) */}
                  <line
                    x1={CHART_PADDING.left}
                    y1={slY}
                    x2={dimensions.width - CHART_PADDING.right}
                    y2={slY}
                    stroke={isStopAtBreakeven ? "#eab308" : "#f43f5e"}
                    strokeWidth={draggedOrderLine?.type === 'SL' ? 2.5 : (isStopAtBreakeven ? 2 : 1.5)}
                    strokeDasharray={isStopAtBreakeven ? "4,2" : "6,3"}
                    opacity={0.95}
                    className="cursor-ns-resize hover:opacity-100"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleActivateBreakevenAnchor(activeBotWithPosition);
                    }}
                  >
                    <title>
                      {isStopAtBreakeven
                        ? "Stop Loss travado em Breakeven Protegido (Risco Zero com taxas cobertas). Arraste para mover."
                        : "Stop Loss. DUPLO CLIQUE para travar instantaneamente no Breakeven Líquido (+0.25% taxas). Arraste para reposicionar."}
                    </title>
                  </line>

                  {/* Handle de Drag SL com suporte a duplo clique para BE Anchor */}
                  <circle
                    cx={dimensions.width - CHART_PADDING.right - 14}
                    cy={slY}
                    r={7}
                    fill={isStopAtBreakeven ? "#713f12" : "#881337"}
                    stroke={isStopAtBreakeven ? "#facc15" : "#fb7185"}
                    strokeWidth={2}
                    className="cursor-ns-resize hover:scale-125 transition-transform"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDraggedOrderLine({
                        botId: activeBotWithPosition.id,
                        type: 'SL',
                        currentPrice: currentSl,
                        initialPrice: currentSl,
                        entryPrice,
                        quantity: qty,
                      });
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleActivateBreakevenAnchor(activeBotWithPosition);
                    }}
                  >
                    <title>
                      {isStopAtBreakeven
                        ? "Stop Loss em BE (Protegido). Arraste para ajustar ou duplo clique para rearmar."
                        : "DUPLO CLIQUE para travar no Breakeven Líquido (Risco Zero). Arraste para mover."}
                    </title>
                  </circle>

                  {/* Botão de Atalho Rápido Pill: Fixar BE Anchor com 1 Clique ou Duplo Clique */}
                  {!isStopAtBreakeven && (
                    <g
                      className="cursor-pointer group"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleActivateBreakevenAnchor(activeBotWithPosition);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleActivateBreakevenAnchor(activeBotWithPosition);
                      }}
                    >
                      <rect
                        x={slBadgeX - 68}
                        y={slY - 10}
                        width={62}
                        height={20}
                        fill="#713f12"
                        stroke="#eab308"
                        strokeWidth={1}
                        rx={4}
                        className="group-hover:fill-amber-700 transition-colors"
                      />
                      <text
                        x={slBadgeX - 63}
                        y={slY + 4}
                        fill="#fef08a"
                        fontSize={9}
                        fontFamily="monospace"
                        fontWeight={700}
                      >
                        ⚡ FIXAR BE
                      </text>
                      <title>Clique ou Duplo clique para travar o Stop Loss no Breakeven Líquido (+0.25% taxas)</title>
                    </g>
                  )}

                  {/* Badge SL com suporte a duplo clique */}
                  <g
                    className="cursor-pointer"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleActivateBreakevenAnchor(activeBotWithPosition);
                    }}
                  >
                    <rect
                      x={slBadgeX}
                      y={slY - 10}
                      width={slBadgeWidth}
                      height={20}
                      fill={isStopAtBreakeven ? "#422006" : "#4c0519"}
                      stroke={isStopAtBreakeven ? "#eab308" : "#f43f5e"}
                      strokeWidth={1}
                      rx={4}
                    />
                    <text
                      x={slBadgeX + 6}
                      y={slY + 4}
                      fill={isStopAtBreakeven ? "#fde047" : "#fda4af"}
                      fontSize={10}
                      fontFamily="monospace"
                      fontWeight={700}
                    >
                      {isStopAtBreakeven
                        ? `🛡️ SL (BE PROTEGIDO): $${formatPrice(currentSl)}`
                        : `SL: $${formatPrice(currentSl)} (-$${Math.abs(Number.isFinite(slLossUsd) ? slLossUsd : 0).toFixed(2)} | ${(Number.isFinite(slLossPct) ? slLossPct : 0).toFixed(1)}%)`}
                    </text>
                    <title>
                      {isStopAtBreakeven
                        ? "Stop Loss protegido em Breakeven. Duplo clique para recalcular."
                        : "DUPLO CLIQUE para travar no Breakeven Líquido (+0.25% taxas)."}
                    </title>
                  </g>
                </g>
              );
            })()}
          </svg>

          {/* Mini-Popover Flutuante: Velocidade de Rejeição do Pavio (Stop Hunt) & Order Flow */}
          <AnimatePresence>
            {activeStopHuntPopover && (() => {
              const popWidth = 320;
              const popHeight = 330;
              const popLeft = Math.max(12, Math.min(dimensions.width - popWidth - 12, activeStopHuntPopover.x - popWidth / 2));
              const popTop = activeStopHuntPopover.y - popHeight - 12 < 12
                ? Math.min(dimensions.height - popHeight - 12, activeStopHuntPopover.y + 16)
                : activeStopHuntPopover.y - popHeight - 12;
              const rej = activeStopHuntPopover.rejection;
              const of = activeStopHuntPopover.orderFlow ?? rej.orderFlow;

              return (
                <motion.div
                  key="stop-hunt-popover"
                  initial={{ opacity: 0, scale: 0.92, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: 6 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute z-50 p-3.5 rounded-xl bg-slate-950/95 border border-rose-500/40 shadow-2xl backdrop-blur-xl pointer-events-auto"
                  style={{
                    left: `${popLeft}px`,
                    top: `${popTop}px`,
                    width: `${popWidth}px`,
                    boxShadow: "0 10px 25px -5px rgba(244, 63, 94, 0.3), 0 0 15px rgba(244, 63, 94, 0.15)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-rose-500/20">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-300">
                      <Zap className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                      <span>Velocidade de Rejeição do Pavio</span>
                    </div>
                    <button
                      onClick={() => setActiveStopHuntPopover(null)}
                      className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                      aria-label="Fechar popover"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="mt-2 space-y-2 text-[10px] font-mono">
                    {/* Badge de Classificação */}
                    <div className="flex items-center justify-between px-2 py-1 rounded bg-rose-950/60 border border-rose-500/30 text-[9px] font-semibold text-rose-200">
                      <span>{rej.label}</span>
                      <span className="text-emerald-400 font-bold">
                        {activeStopHuntPopover.savedLossUsd > 0 ? `-$${activeStopHuntPopover.savedLossUsd.toFixed(2)}` : '-1.8%'} EVITADO
                      </span>
                    </div>

                    {/* Grid 2x2 com Métricas Quantitativas de Rejeição */}
                    <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                      <div className="p-1.5 rounded-lg bg-slate-900/80 border border-white/5 space-y-0.5">
                        <span className="text-[9px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 text-cyan-400" />
                          Tempo de Rejeição
                        </span>
                        <div className="font-bold text-cyan-300 text-xs">
                          {rej.rejectionTimeMs} ms
                        </div>
                      </div>

                      <div className="p-1.5 rounded-lg bg-slate-900/80 border border-white/5 space-y-0.5">
                        <span className="text-[9px] text-slate-400 flex items-center gap-1">
                          <Activity className="w-2.5 h-2.5 text-emerald-400" />
                          Velocidade
                        </span>
                        <div className="font-bold text-emerald-300 text-xs">
                          ${rej.rejectionVelocityUsdPerSec} /s
                        </div>
                      </div>

                      <div className="p-1.5 rounded-lg bg-slate-900/80 border border-white/5 space-y-0.5">
                        <span className="text-[9px] text-slate-400 flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                          Absorção do Pavio
                        </span>
                        <div className="font-bold text-amber-300 text-xs">
                          {rej.absorptionPct}%
                        </div>
                      </div>

                      <div className="p-1.5 rounded-lg bg-slate-900/80 border border-white/5 space-y-0.5">
                        <span className="text-[9px] text-slate-400 flex items-center gap-1">
                          <Gauge className="w-2.5 h-2.5 text-purple-400" />
                          Ticks de Absorção
                        </span>
                        <div className="font-bold text-purple-300 text-xs">
                          ~{rej.estimatedTicks} ticks
                        </div>
                      </div>
                    </div>

                    {/* Calibração de Reversão por Volume Delta (Order Flow Confluence) */}
                    {of && (
                      <div className="p-2 rounded-lg bg-slate-900/90 border border-white/10 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-semibold text-slate-300 flex items-center gap-1">
                            {of.driver === 'AGGRESSIVE_MARKET_SWEEP' ? (
                              <Flame className="w-2.5 h-2.5 text-amber-400" />
                            ) : (
                              <Shield className="w-2.5 h-2.5 text-cyan-400" />
                            )}
                            Order Flow & Delta Agressor
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold ${
                            of.volumeDeltaPct >= 0 
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40' 
                              : 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                          }`}>
                            {of.aggressiveDeltaRatio}x ({of.volumeDeltaPct >= 0 ? '+' : ''}{of.volumeDeltaPct}% Delta)
                          </span>
                        </div>

                        {/* Driver Banner */}
                        <div className={`p-1.5 rounded border text-[9px] font-medium leading-tight flex items-start gap-1.5 ${
                          of.driver === 'AGGRESSIVE_MARKET_SWEEP'
                            ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-200'
                            : 'bg-cyan-950/50 border-cyan-500/30 text-cyan-200'
                        }`}>
                          <div className="mt-0.5">
                            {of.driver === 'AGGRESSIVE_MARKET_SWEEP' ? (
                              <Zap className="w-3 h-3 text-emerald-400 shrink-0" />
                            ) : (
                              <Shield className="w-3 h-3 text-cyan-400 shrink-0" />
                            )}
                          </div>
                          <div>
                            <div className="font-bold">{of.driverTitle}</div>
                            <div className="text-[8px] text-slate-300 mt-0.5">{of.driverDescription}</div>
                          </div>
                        </div>

                        {/* Split Bar: Taker Buy vs Taker Sell */}
                        <div className="space-y-1 pt-0.5">
                          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                            <div
                              className="h-full bg-emerald-500 transition-all duration-300"
                              style={{ width: `${Math.max(of.buyPressurePct, 5)}%` }}
                              title={`Taker Buy: ${of.buyPressurePct}%`}
                            />
                            <div
                              className="h-full bg-rose-500 transition-all duration-300"
                              style={{ width: `${Math.max(of.sellPressurePct, 5)}%` }}
                              title={`Taker Sell: ${of.sellPressurePct}%`}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[8px] text-slate-400">
                            <span className="text-emerald-400 font-semibold">Taker Buy: {of.buyPressurePct}%</span>
                            <span className="text-rose-400 font-semibold">Taker Sell: {of.sellPressurePct}%</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Resumo Institucional */}
                    <p className="text-[8.5px] text-slate-400 leading-tight bg-white/[0.02] p-1.5 rounded border border-white/5">
                      {rej.summary}
                    </p>
                  </div>
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
