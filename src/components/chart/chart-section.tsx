'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useCryptoStore } from '@/lib/store';
import { PriceInfo } from './price-info';
import { CandlestickChart } from './candlestick-chart';
import { IndicatorsPanel } from './indicators-panel';
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
  const [rsiValue, setRsiValue] = useState<number | null>(null);
  const rsiAbortRef = useRef<AbortController | null>(null);

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

      {/* Chart Controls */}
      <div className="flex flex-wrap items-center gap-2">
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
              className={`h-7 px-2.5 text-xs ${
                interval === int.value
                  ? 'bg-crypto-cyan/20 text-crypto-cyan hover:bg-crypto-cyan/30'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setInterval(int.value)}
            >
              {int.label}
            </Button>
          ))}
        </div>

        {/* MA toggles */}
        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant={showSMA20 ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2 text-xs ${
              showSMA20
                ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                : 'text-muted-foreground'
            }`}
            onClick={() => setShowSMA20(!showSMA20)}
          >
            SMA 20
          </Button>
          <Button
            variant={showSMA50 ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2 text-xs ${
              showSMA50
                ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                : 'text-muted-foreground'
            }`}
            onClick={() => setShowSMA50(!showSMA50)}
          >
            SMA 50
          </Button>
        </div>
      </div>

      {/* Main Chart Area */}
      <Card className="bg-card/30 border-border overflow-hidden">
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
              />
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Technical Indicators Panel */}
      <IndicatorsPanel symbol={selectedSymbol} interval={interval} />
    </motion.div>
  );
}
