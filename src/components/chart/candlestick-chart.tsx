'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useCryptoStore } from '@/lib/store';
import { formatPrice, formatVolume, formatTime } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
}

interface TooltipData {
  candle: ProcessedCandle;
  x: number;
  y: number;
}

interface CandlestickChartProps {
  symbol: string;
  interval: string;
  showSMA20?: boolean;
  showSMA50?: boolean;
  showBollinger?: boolean;
}

const CHART_PADDING = { top: 20, right: 70, bottom: 30, left: 10 };
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

export function CandlestickChart({ symbol, interval, showSMA20 = true, showSMA50 = true, showBollinger = false }: CandlestickChartProps) {
  const [candles, setCandles] = useState<ProcessedCandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width: Math.max(width, 300), height: Math.max(height, 200) });
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
      const sma20 = calculateSMA(closes, 20);
      const sma50 = calculateSMA(closes, 50);

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

      processed.forEach((c, i) => {
        c.sma20 = sma20[i];
        c.sma50 = sma50[i];
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
    }

    const padding = (maxPrice - minPrice) * 0.05;
    minPrice -= padding;
    maxPrice += padding;
    const priceRange = maxPrice - minPrice || 1;

    return { minPrice, maxPrice, maxVolume, priceRange };
  }, [visibleCandles]);

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

  // Mouse handlers
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (visibleCandles.length === 0) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const candleIndex = Math.floor((mouseX - CHART_PADDING.left) / candleWidth);

      if (candleIndex >= 0 && candleIndex < visibleCandles.length) {
        const candle = visibleCandles[candleIndex];
        setTooltip({
          candle,
          x: indexToX(candleIndex),
          y: priceToY(candle.close),
        });
      } else {
        setTooltip(null);
      }
    },
    [visibleCandles, candleWidth, indexToX, priceToY]
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

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

          <svg
            ref={svgRef}
            width={dimensions.width}
            height={dimensions.height}
            className="select-none"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {/* Background */}
            <rect
              x={0}
              y={0}
              width={dimensions.width}
              height={dimensions.height}
              fill="oklch(0.14 0.012 260)"
              rx={8}
            />

            {/* Price grid lines */}
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

            {/* Candlesticks */}
            {visibleCandles.map((candle, i) => {
              const x = indexToX(i);
              const bodyTop = priceToY(Math.max(candle.open, candle.close));
              const bodyBottom = priceToY(Math.min(candle.open, candle.close));
              const bodyH = Math.max(1, bodyBottom - bodyTop);
              const color = candle.isBullish ? '#22c55e' : '#ef4444';
              const wickColor = candle.isBullish ? 'oklch(0.65 0.2 145 / 70%)' : 'oklch(0.65 0.22 25 / 70%)';

              return (
                <g key={`candle-${i}`}>
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
                  fill="#06b6d4"
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
                  {formatPrice(tooltip.candle.close)}
                </text>

                {/* Tooltip info box */}
                <g>
                  <rect
                    x={tooltip.x + 15}
                    y={CHART_PADDING.top + 5}
                    width={150}
                    height={100}
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
                </g>
              </>
            )}

            {/* Legend for moving averages */}
            {showSMA20 && (
              <g>
                <line
                  x1={CHART_PADDING.left + 10}
                  y1={CHART_PADDING.top + 8}
                  x2={CHART_PADDING.left + 30}
                  y2={CHART_PADDING.top + 8}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  opacity={0.7}
                />
                <text
                  x={CHART_PADDING.left + 34}
                  y={CHART_PADDING.top + 11}
                  fill="oklch(0.65 0 0)"
                  fontSize={9}
                >
                  SMA 20
                </text>
              </g>
            )}
            {showSMA50 && (
              <g>
                <line
                  x1={CHART_PADDING.left + 80}
                  y1={CHART_PADDING.top + 8}
                  x2={CHART_PADDING.left + 100}
                  y2={CHART_PADDING.top + 8}
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  opacity={0.7}
                />
                <text
                  x={CHART_PADDING.left + 104}
                  y={CHART_PADDING.top + 11}
                  fill="oklch(0.65 0 0)"
                  fontSize={9}
                >
                  SMA 50
                </text>
              </g>
            )}
          </svg>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
