'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useCryptoStore } from '@/lib/store';
import { PriceInfo } from './price-info';
import { CandlestickChart } from './candlestick-chart';
import { IndicatorsPanel } from './indicators-panel';
import { QuickTrade } from './quick-trade';
import { OrderBook } from './order-book';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { MousePointer2, TrendingUp, Minus, Trash2 } from 'lucide-react';
import type { DrawingTool, Drawing } from './candlestick-chart';

const INTERVALS = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '1d', label: '1D' },
];

const SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT',
  'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT',
  'DOTUSDT', 'LINKUSDT', 'ATOMUSDT',
];

// RSI calculation for the badge
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
    if (avgLoss === 0) rsi.push(100);
    else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    }
  }
  return rsi;
}

export function ChartSection() {
  const { selectedSymbol, setSelectedSymbol } = useCryptoStore();
  const [interval, setInterval] = useState('1h');
  const [showSMA20, setShowSMA20] = useState(true);
  const [showSMA50, setShowSMA50] = useState(true);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showFibonacci, setShowFibonacci] = useState(false);
  const [showEMA12, setShowEMA12] = useState(false);
  const [showEMA26, setShowEMA26] = useState(false);
  const [showVolumeProfile, setShowVolumeProfile] = useState(false);
  const [showIchimoku, setShowIchimoku] = useState(false);
  const [rsiValue, setRsiValue] = useState<number | null>(null);
  const rsiAbortRef = useRef<AbortController | null>(null);

  // Drawing tools state
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('crosshair');
  const [drawings, setDrawings] = useState<Drawing[]>([]);

  const handleDrawingAdd = useCallback((drawing: Drawing) => {
    setDrawings((prev) => [...prev, drawing]);
  }, []);

  const handleClearDrawings = useCallback(() => {
    setDrawings([]);
  }, []);

  // Fetch RSI data - using a ref-based approach to avoid set-state-in-effect
  useEffect(() => {
    const abortController = new AbortController();
    rsiAbortRef.current = abortController;

    let cancelled = false;

    async function loadRSI() {
      try {
        const res = await fetch(
          `/api/market/klines?symbol=${selectedSymbol}&interval=${interval}&limit=100`,
          { signal: abortController.signal }
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (cancelled) return;
        const rawData = json.data || [];
        const closes = rawData.map((k: Record<string, string>) => parseFloat(k.close));
        const rsiVals = calculateRSI(closes);
        if (rsiVals.length > 0 && !cancelled) {
          setRsiValue(rsiVals[rsiVals.length - 1]);
        }
      } catch {
        // Silently fail - RSI is just for display
      }
    }

    loadRSI();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [selectedSymbol, interval]);

  return (
    <motion.div
      key="chart"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-3"
    >
      {/* Price Info Header */}
      <PriceInfo symbol={selectedSymbol} interval={interval} rsiValue={rsiValue} />

      {/* Drawing Tools Toolbar + Chart Controls */}
      <div className="flex flex-wrap items-center gap-2 glass rounded-xl p-3 border border-border/50">
        {/* Drawing Tools */}
        <div className="flex items-center gap-1 mr-2 pr-2 border-r border-border/50">
          <Button
            variant={drawingTool === 'crosshair' ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2 text-xs transition-all duration-200 ${
              drawingTool === 'crosshair'
                ? 'bg-crypto-cyan/20 text-crypto-cyan hover:bg-crypto-cyan/30 scale-[1.02] shadow-sm shadow-crypto-cyan/10 border border-crypto-cyan/40'
                : 'text-muted-foreground'
            }`}
            onClick={() => setDrawingTool('crosshair')}
            title="Crosshair (default)"
          >
            <MousePointer2 className="w-3.5 h-3.5 mr-1" />
            Pointer
          </Button>
          <Button
            variant={drawingTool === 'trendline' ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2 text-xs transition-all duration-200 ${
              drawingTool === 'trendline'
                ? 'bg-crypto-cyan/20 text-crypto-cyan hover:bg-crypto-cyan/30 scale-[1.02] shadow-sm shadow-crypto-cyan/10 border border-crypto-cyan/40'
                : 'text-muted-foreground'
            }`}
            onClick={() => setDrawingTool('trendline')}
            title="Trendline tool"
          >
            <TrendingUp className="w-3.5 h-3.5 mr-1" />
            Trendline
          </Button>
          <Button
            variant={drawingTool === 'horizontal' ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2 text-xs transition-all duration-200 ${
              drawingTool === 'horizontal'
                ? 'bg-crypto-cyan/20 text-crypto-cyan hover:bg-crypto-cyan/30 scale-[1.02] shadow-sm shadow-crypto-cyan/10 border border-crypto-cyan/40'
                : 'text-muted-foreground'
            }`}
            onClick={() => setDrawingTool('horizontal')}
            title="Horizontal line tool"
          >
            <Minus className="w-3.5 h-3.5 mr-1" />
            H-Line
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-red-400 transition-all duration-200"
            onClick={handleClearDrawings}
            title="Clear all drawings"
            disabled={drawings.length === 0}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Clear
          </Button>
          {drawings.length > 0 && (
            <span className="text-[10px] text-muted-foreground/60 ml-1">{drawings.length}</span>
          )}
        </div>

        {/* Symbol Selector */}
        <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
          <SelectTrigger className="w-[140px] h-8 text-xs bg-card/50 border-border">
            <SelectValue placeholder="Select symbol" />
          </SelectTrigger>
          <SelectContent>
            {SYMBOLS.map((sym) => (
              <SelectItem key={sym} value={sym} className="text-xs">
                {sym.replace('USDT', '/USDT')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Interval Buttons */}
        <div className="flex items-center gap-0.5 bg-secondary/30 rounded-lg p-0.5">
          {INTERVALS.map((int) => (
            <Button
              key={int.value}
              variant={interval === int.value ? 'default' : 'ghost'}
              size="sm"
              className={`h-7 px-2.5 text-xs transition-all duration-200 ${
                interval === int.value
                  ? 'bg-crypto-cyan/20 text-crypto-cyan hover:bg-crypto-cyan/30 scale-[1.02] shadow-sm shadow-crypto-cyan/10'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setInterval(int.value)}
            >
              {int.label}
            </Button>
          ))}
        </div>

        {/* Indicator toggles */}
        <div className="flex flex-wrap items-center gap-1 ml-auto">
          <Button
            variant={showSMA20 ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2 text-xs transition-all duration-200 ${
              showSMA20
                ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 scale-[1.02] shadow-sm shadow-yellow-500/10'
                : 'text-muted-foreground'
            }`}
            onClick={() => setShowSMA20(!showSMA20)}
          >
            SMA 20
          </Button>
          <Button
            variant={showSMA50 ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2 text-xs transition-all duration-200 ${
              showSMA50
                ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 scale-[1.02] shadow-sm shadow-purple-500/10'
                : 'text-muted-foreground'
            }`}
            onClick={() => setShowSMA50(!showSMA50)}
          >
            SMA 50
          </Button>
          <Button
            variant={showBollinger ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2 text-xs transition-all duration-200 ${
              showBollinger
                ? 'bg-crypto-cyan/20 text-crypto-cyan hover:bg-crypto-cyan/30 scale-[1.02] shadow-sm shadow-crypto-cyan/10'
                : 'text-muted-foreground'
            }`}
            onClick={() => setShowBollinger(!showBollinger)}
          >
            BB (20,2)
          </Button>
          <Button
            variant={showFibonacci ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2 text-xs transition-all duration-200 ${
              showFibonacci
                ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 scale-[1.02] shadow-sm shadow-amber-500/10'
                : 'text-muted-foreground'
            }`}
            onClick={() => setShowFibonacci(!showFibonacci)}
          >
            Fib
          </Button>
          <Button
            variant={showEMA12 ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2 text-xs transition-all duration-200 ${
              showEMA12
                ? 'bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 scale-[1.02] shadow-sm shadow-teal-500/10'
                : 'text-muted-foreground'
            }`}
            onClick={() => setShowEMA12(!showEMA12)}
          >
            EMA 12
          </Button>
          <Button
            variant={showEMA26 ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2 text-xs transition-all duration-200 ${
              showEMA26
                ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 scale-[1.02] shadow-sm shadow-orange-500/10'
                : 'text-muted-foreground'
            }`}
            onClick={() => setShowEMA26(!showEMA26)}
          >
            EMA 26
          </Button>
          <Button
            variant={showVolumeProfile ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2 text-xs transition-all duration-200 ${
              showVolumeProfile
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 scale-[1.02] shadow-sm shadow-emerald-500/10'
                : 'text-muted-foreground'
            }`}
            onClick={() => setShowVolumeProfile(!showVolumeProfile)}
          >
            Vol Profile
          </Button>
          <Button
            variant={showIchimoku ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2 text-xs transition-all duration-200 ${
              showIchimoku
                ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 scale-[1.02] shadow-sm shadow-rose-500/10'
                : 'text-muted-foreground'
            }`}
            onClick={() => setShowIchimoku(!showIchimoku)}
          >
            Ichimoku
          </Button>
        </div>
      </div>

      {/* Chart + Quick Trade Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-3 min-w-0">
          <Card className="bg-card/30 backdrop-blur-sm border-border/50 overflow-hidden">
            <CardContent className="p-0">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${selectedSymbol}-${interval}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <CandlestickChart
                    symbol={selectedSymbol}
                    interval={interval}
                    showSMA20={showSMA20}
                    showSMA50={showSMA50}
                    showBollinger={showBollinger}
                    showFibonacci={showFibonacci}
                    showEMA12={showEMA12}
                    showEMA26={showEMA26}
                    showVolumeProfile={showVolumeProfile}
                    showIchimoku={showIchimoku}
                    drawingTool={drawingTool}
                    drawings={drawings}
                    onDrawingAdd={handleDrawingAdd}
                  />
                </motion.div>
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-1 flex flex-col gap-3">
          <QuickTrade />
          <OrderBook />
        </div>
      </div>

      {/* Technical Indicators Panel */}
      <div className="mt-1">
        <IndicatorsPanel symbol={selectedSymbol} interval={interval} />
      </div>
    </motion.div>
  );
}
