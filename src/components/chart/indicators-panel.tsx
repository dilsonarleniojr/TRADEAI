'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { formatPrice } from '@/lib/format';

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

// ========================
// Technical Indicator Calculations
// ========================

function calculateEMA(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  const multiplier = 2 / (period + 1);
  const ema: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push((data[i] - ema[i - 1]) * multiplier + ema[i - 1]);
  }
  return ema;
}

function calculateRSI(closes: number[], period = 14): number[] {
  if (closes.length < period + 1) return [];

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  const rsi: number[] = [];
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i <= gains.length; i++) {
    if (i > period) {
      avgGain = (avgGain * (period - 1) + gains[i - 1]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period;
    }

    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    }
  }

  return rsi;
}

function calculateMACD(closes: number[]): {
  macd: number[];
  signal: number[];
  histogram: number[];
} {
  if (closes.length < 26) return { macd: [], signal: [], histogram: [] };

  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macd = ema12.map((v, i) => v - ema26[i]);
  const signal = calculateEMA(macd, 9);
  const histogram = macd.map((v, i) => v - signal[i]);

  return { macd, signal, histogram };
}

interface IndicatorsPanelProps {
  symbol: string;
  interval: string;
}

export function IndicatorsPanel({ symbol, interval }: IndicatorsPanelProps) {
  const [closes, setCloses] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'rsi' | 'macd'>('rsi');
  const rsiSvgRef = useRef<SVGSVGElement>(null);
  const macdSvgRef = useRef<SVGSVGElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);
  const [rsiDimensions, setRsiDimensions] = useState({ width: 800, height: 160 });
  const [macdDimensions, setMacdDimensions] = useState({ width: 800, height: 160 });

  // Resize observers
  useEffect(() => {
    const container = rsiContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setRsiDimensions({ width: Math.max(width, 300), height: Math.max(height, 100) });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = macdContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setMacdDimensions({ width: Math.max(width, 300), height: Math.max(height, 100) });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/market/klines?symbol=${symbol}&interval=${interval}&limit=100`
      );
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      const rawData: KlineRaw[] = json.data || [];
      const closePrices = rawData.map((k) => parseFloat(k.close));
      setCloses(closePrices);
    } catch (err) {
      console.error('Failed to fetch data for indicators:', err);
      setCloses([]);
    } finally {
      setLoading(false);
    }
  }, [symbol, interval]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate indicators
  const rsiValues = useMemo(() => calculateRSI(closes), [closes]);
  const macdData = useMemo(() => calculateMACD(closes), [closes]);

  // Current indicator values
  const currentRSI = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;
  const currentMACD = macdData.macd.length > 0 ? macdData.macd[macdData.macd.length - 1] : null;
  const currentSignal = macdData.signal.length > 0 ? macdData.signal[macdData.signal.length - 1] : null;
  const currentHistogram = macdData.histogram.length > 0 ? macdData.histogram[macdData.histogram.length - 1] : null;

  // RSI chart
  const renderRSIChart = () => {
    const pad = { top: 15, right: 60, bottom: 20, left: 10 };
    const chartW = rsiDimensions.width - pad.left - pad.right;
    const chartH = rsiDimensions.height - pad.top - pad.bottom;

    if (rsiValues.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Insufficient data for RSI calculation
        </div>
      );
    }

    const barWidth = chartW / rsiValues.length;

    const yScale = (val: number) => pad.top + chartH - (val / 100) * chartH;
    const xScale = (i: number) => pad.left + i * barWidth + barWidth / 2;

    // RSI path
    let pathD = '';
    rsiValues.forEach((val, i) => {
      const x = xScale(i);
      const y = yScale(val);
      pathD += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    });

    return (
      <svg width={rsiDimensions.width} height={rsiDimensions.height}>
        <rect x={0} y={0} width={rsiDimensions.width} height={rsiDimensions.height} fill="oklch(0.14 0.012 260)" rx={6} />

        {/* Overbought/Oversold zones */}
        <rect x={pad.left} y={yScale(100)} width={chartW} height={yScale(70) - yScale(100)} fill="oklch(0.65 0.22 25 / 8%)" />
        <rect x={pad.left} y={yScale(30)} width={chartW} height={yScale(0) - yScale(30)} fill="oklch(0.65 0.2 145 / 8%)" />

        {/* 70 and 30 lines */}
        <line x1={pad.left} y1={yScale(70)} x2={pad.left + chartW} y2={yScale(70)} stroke="oklch(0.65 0.22 25 / 40%)" strokeDasharray="4,4" />
        <line x1={pad.left} y1={yScale(30)} x2={pad.left + chartW} y2={yScale(30)} stroke="oklch(0.65 0.2 145 / 40%)" strokeDasharray="4,4" />
        <line x1={pad.left} y1={yScale(50)} x2={pad.left + chartW} y2={yScale(50)} stroke="oklch(1 0 0 / 5%)" strokeDasharray="2,2" />

        {/* Labels */}
        <text x={pad.left + chartW + 5} y={yScale(70) + 4} fill="oklch(0.55 0 0)" fontSize={9} fontFamily="monospace">70</text>
        <text x={pad.left + chartW + 5} y={yScale(30) + 4} fill="oklch(0.55 0 0)" fontSize={9} fontFamily="monospace">30</text>
        <text x={pad.left + chartW + 5} y={yScale(50) + 4} fill="oklch(0.45 0 0)" fontSize={9} fontFamily="monospace">50</text>

        {/* RSI line */}
        <path d={pathD} fill="none" stroke="#06b6d4" strokeWidth={1.8} />

        {/* Current RSI dot */}
        {rsiValues.length > 0 && (
          <circle
            cx={xScale(rsiValues.length - 1)}
            cy={yScale(rsiValues[rsiValues.length - 1])}
            r={3}
            fill="#06b6d4"
          />
        )}
      </svg>
    );
  };

  // MACD chart
  const renderMACDChart = () => {
    const pad = { top: 15, right: 60, bottom: 20, left: 10 };
    const chartW = macdDimensions.width - pad.left - pad.right;
    const chartH = macdDimensions.height - pad.top - pad.bottom;

    if (macdData.macd.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Insufficient data for MACD calculation
        </div>
      );
    }

    // Find min/max for scale
    const allValues = [...macdData.macd, ...macdData.signal, ...macdData.histogram];
    const minVal = Math.min(...allValues, 0);
    const maxVal = Math.max(...allValues, 0);
    const range = maxVal - minVal || 1;

    const barWidth = chartW / macdData.macd.length;
    const yScale = (val: number) => pad.top + chartH - ((val - minVal) / range) * chartH;
    const xScale = (i: number) => pad.left + i * barWidth + barWidth / 2;
    const zeroY = yScale(0);

    // MACD line path
    let macdPath = '';
    macdData.macd.forEach((val, i) => {
      const x = xScale(i);
      const y = yScale(val);
      macdPath += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    });

    // Signal line path
    let signalPath = '';
    macdData.signal.forEach((val, i) => {
      const x = xScale(i);
      const y = yScale(val);
      signalPath += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    });

    return (
      <svg width={macdDimensions.width} height={macdDimensions.height}>
        <rect x={0} y={0} width={macdDimensions.width} height={macdDimensions.height} fill="oklch(0.14 0.012 260)" rx={6} />

        {/* Zero line */}
        <line x1={pad.left} y1={zeroY} x2={pad.left + chartW} y2={zeroY} stroke="oklch(1 0 0 / 8%)" />

        {/* Histogram bars */}
        {macdData.histogram.map((val, i) => {
          const x = xScale(i);
          const barH = Math.abs(yScale(val) - zeroY);
          const barY = val >= 0 ? zeroY - barH : zeroY;
          const color = val >= 0 ? '#22c55e' : '#ef4444';
          return (
            <rect
              key={`hist-${i}`}
              x={x - barWidth * 0.3}
              y={barY}
              width={barWidth * 0.6}
              height={Math.max(0, barH)}
              fill={color}
              opacity={0.5}
              rx={1}
            />
          );
        })}

        {/* MACD line */}
        <path d={macdPath} fill="none" stroke="#06b6d4" strokeWidth={1.5} />

        {/* Signal line */}
        <path d={signalPath} fill="none" stroke="#f59e0b" strokeWidth={1.5} />

        {/* Legend */}
        <line x1={pad.left + 10} y1={pad.top + 5} x2={pad.left + 25} y2={pad.top + 5} stroke="#06b6d4" strokeWidth={2} />
        <text x={pad.left + 30} y={pad.top + 8} fill="oklch(0.65 0 0)" fontSize={9}>MACD</text>
        <line x1={pad.left + 70} y1={pad.top + 5} x2={pad.left + 85} y2={pad.top + 5} stroke="#f59e0b" strokeWidth={2} />
        <text x={pad.left + 90} y={pad.top + 8} fill="oklch(0.65 0 0)" fontSize={9}>Signal</text>

        {/* Current values */}
        {currentMACD !== null && (
          <text x={pad.left + chartW + 5} y={yScale(currentMACD) + 4} fill="#06b6d4" fontSize={9} fontFamily="monospace">
            {currentMACD.toFixed(2)}
          </text>
        )}
      </svg>
    );
  };

  const getRSILabel = (val: number | null) => {
    if (val === null) return { text: 'N/A', color: 'text-muted-foreground' };
    if (val >= 70) return { text: 'Overbought', color: 'text-crypto-red' };
    if (val <= 30) return { text: 'Oversold', color: 'text-crypto-green' };
    return { text: 'Neutral', color: 'text-crypto-cyan' };
  };

  const rsiLabel = getRSILabel(currentRSI);

  if (loading) {
    return (
      <Card className="bg-card/50 border-border">
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-[160px] w-full" />
          <Skeleton className="h-[160px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 border-border">
      <CardContent className="p-0">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-crypto-cyan" />
            <span className="text-sm font-medium">Technical Indicators</span>
          </div>
          <div className="flex items-center gap-3">
            {/* RSI badge */}
            <Badge
              variant="outline"
              className={`text-xs border-border ${rsiLabel.color}`}
            >
              RSI: {currentRSI !== null ? currentRSI.toFixed(1) : 'N/A'} ({rsiLabel.text})
            </Badge>
            {/* MACD badge */}
            {currentMACD !== null && currentSignal !== null && (
              <Badge
                variant="outline"
                className={`text-xs border-border ${
                  currentMACD > currentSignal ? 'text-crypto-green' : 'text-crypto-red'
                }`}
              >
                MACD: {currentMACD > currentSignal ? 'Bullish' : 'Bearish'}
              </Badge>
            )}
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {/* Tab switcher */}
              <div className="flex px-4 pb-2 gap-1">
                <Button
                  variant={activeTab === 'rsi' ? 'default' : 'ghost'}
                  size="sm"
                  className={`text-xs h-7 ${activeTab === 'rsi' ? 'bg-crypto-cyan/20 text-crypto-cyan hover:bg-crypto-cyan/30' : ''}`}
                  onClick={() => setActiveTab('rsi')}
                >
                  RSI (14)
                </Button>
                <Button
                  variant={activeTab === 'macd' ? 'default' : 'ghost'}
                  size="sm"
                  className={`text-xs h-7 ${activeTab === 'macd' ? 'bg-crypto-cyan/20 text-crypto-cyan hover:bg-crypto-cyan/30' : ''}`}
                  onClick={() => setActiveTab('macd')}
                >
                  MACD (12,26,9)
                </Button>
              </div>

              {/* Charts */}
              <AnimatePresence mode="wait">
                {activeTab === 'rsi' ? (
                  <motion.div
                    key="rsi"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.15 }}
                    ref={rsiContainerRef}
                    className="px-2 pb-2"
                  >
                    {renderRSIChart()}
                  </motion.div>
                ) : (
                  <motion.div
                    key="macd"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                    ref={macdContainerRef}
                    className="px-2 pb-2"
                  >
                    {renderMACDChart()}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
