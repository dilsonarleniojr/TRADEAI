'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useCryptoStore } from '@/lib/store';
import { PriceInfo } from './price-info';
import { CandlestickChart } from './candlestick-chart';
import { IndicatorsPanel } from './indicators-panel';
import { QuickTrade } from './quick-trade';
import { OrderBook } from './order-book';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { MousePointer2, TrendingUp, Minus, Trash2, Search, ChevronDown } from 'lucide-react';
import { ALL_SYMBOLS } from '@/lib/crypto-meta';
import { cn } from '@/lib/utils';
import type { DrawingTool, Drawing } from './candlestick-chart';
import { useShallow } from "zustand/react/shallow";

const INTERVALS = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1M', label: '1M' },
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
  const { selectedSymbol, setSelectedSymbol, tickers } = useCryptoStore(
  useShallow((s) => ({ selectedSymbol: s.selectedSymbol, setSelectedSymbol: s.setSelectedSymbol, tickers: s.tickers }))
);
  const [interval, setInterval] = useState('1h');
  const [symbolSearch, setSymbolSearch] = useState('');
  const [symbolSelectOpen, setSymbolSelectOpen] = useState(false);

  const filteredSymbols = useMemo(() => {
    const query = symbolSearch.toLowerCase().trim();
    if (!query) {
      // Sort by volume if available
      return [...ALL_SYMBOLS]
        .sort((a, b) => (tickers[b]?.quoteVolume || 0) - (tickers[a]?.quoteVolume || 0))
        .slice(0, 50);
    }
    return ALL_SYMBOLS.filter((s) => s.toLowerCase().includes(query)).slice(0, 60);
  }, [symbolSearch, ALL_SYMBOLS.length, tickers]);
  const [showSMA20, setShowSMA20] = useState(true);
  const [showSMA50, setShowSMA50] = useState(true);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showFibonacci, setShowFibonacci] = useState(false);
  const [showEMA12, setShowEMA12] = useState(false);
  const [showEMA26, setShowEMA26] = useState(false);
  const [showVolumeProfile, setShowVolumeProfile] = useState(false);
  const [showIchimoku, setShowIchimoku] = useState(false);
  const [showVWAP, setShowVWAP] = useState(false);
  const [showEMARibbon, setShowEMARibbon] = useState(false);
  const hasActiveOverlay = showSMA20 || showSMA50 || showBollinger || showFibonacci || showEMA12 || showEMA26 || showVolumeProfile || showIchimoku || showVWAP || showEMARibbon;
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

      {/* Drawing Tools Toolbar + Chart Controls - Mobile: 2 scrollable rows */}
      <div className="glass rounded-xl p-2 sm:p-3 border border-border/50 space-y-2">
        {/* Row 1: Drawing Tools + Symbol + Intervals - horizontally scrollable on mobile */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          {/* Drawing Tools */}
          <div className="flex items-center gap-1 shrink-0 pr-2 border-r border-border/50">
            <Button
              variant={drawingTool === 'crosshair' ? 'default' : 'ghost'}
              size="sm"
              className={`h-9 sm:h-7 px-2 text-xs transition-all duration-200 ${
                drawingTool === 'crosshair'
                  ? 'bg-crypto-cyan/20 text-crypto-cyan hover:bg-crypto-cyan/30 scale-[1.02] shadow-sm shadow-crypto-cyan/10 border border-crypto-cyan/40'
                  : 'text-muted-foreground'
              }`}
              onClick={() => setDrawingTool('crosshair')}
              title="Crosshair (padrão)"
            >
              <MousePointer2 className="w-3.5 h-3.5 mr-1" />
              <span className="hidden sm:inline">Ponteiro</span>
            </Button>
            <Button
              variant={drawingTool === 'trendline' ? 'default' : 'ghost'}
              size="sm"
              className={`h-9 sm:h-7 px-2 text-xs transition-all duration-200 ${
                drawingTool === 'trendline'
                  ? 'bg-crypto-cyan/20 text-crypto-cyan hover:bg-crypto-cyan/30 scale-[1.02] shadow-sm shadow-crypto-cyan/10 border border-crypto-cyan/40'
                  : 'text-muted-foreground'
              }`}
              onClick={() => setDrawingTool('trendline')}
              title="Ferramenta de tendência"
            >
              <TrendingUp className="w-3.5 h-3.5 mr-1" />
              <span className="hidden sm:inline">Tendência</span>
            </Button>
            <Button
              variant={drawingTool === 'horizontal' ? 'default' : 'ghost'}
              size="sm"
              className={`h-9 sm:h-7 px-2 text-xs transition-all duration-200 ${
                drawingTool === 'horizontal'
                  ? 'bg-crypto-cyan/20 text-crypto-cyan hover:bg-crypto-cyan/30 scale-[1.02] shadow-sm shadow-crypto-cyan/10 border border-crypto-cyan/40'
                  : 'text-muted-foreground'
              }`}
              onClick={() => setDrawingTool('horizontal')}
              title="Linha horizontal"
            >
              <Minus className="w-3.5 h-3.5 mr-1" />
              <span className="hidden sm:inline">Linha-H</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 sm:h-7 px-2 text-xs text-muted-foreground hover:text-red-400 transition-all duration-200 "
              onClick={handleClearDrawings}
              title="Limpar todos os desenhos"
              disabled={drawings.length === 0}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Limpar
            </Button>
            {drawings.length > 0 && (
              <span className="text-[10px] text-muted-foreground/60 ml-1">{drawings.length}</span>
            )}
          </div>

          {/* Searchable Symbol Selector */}
          <div className="shrink-0">
            <Popover open={symbolSelectOpen} onOpenChange={setSymbolSelectOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-[130px] sm:w-[145px] h-9 sm:h-8 text-xs bg-card/50 border-border justify-between px-2.5 font-bold"
                >
                  <span className="truncate">{selectedSymbol.replace('USDT', '/USDT')}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-1" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-0 glass border-border/50" align="start">
                <div className="p-2 border-b border-border/30">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar moeda..."
                      value={symbolSearch}
                      onChange={(e) => setSymbolSearch(e.target.value)}
                      className="h-7 pl-7 text-xs bg-secondary/30 border-border/50"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-[220px] overflow-y-auto cyan-scrollbar p-1">
                  {filteredSymbols.map((sym) => (
                    <button
                      key={sym}
                      onClick={() => {
                        setSelectedSymbol(sym);
                        setSymbolSelectOpen(false);
                        setSymbolSearch('');
                      }}
                      className={cn(
                        "w-full text-left px-2 py-1.5 text-xs rounded hover:bg-secondary/40 flex items-center justify-between transition-colors",
                        sym === selectedSymbol && "bg-crypto-cyan/15 text-crypto-cyan font-bold"
                      )}
                    >
                      <span>{sym.replace('USDT', '/USDT')}</span>
                      {tickers[sym] && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          ${tickers[sym].price < 1 ? tickers[sym].price.toFixed(4) : tickers[sym].price.toFixed(2)}
                        </span>
                      )}
                    </button>
                  ))}
                  {filteredSymbols.length === 0 && (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      Nenhuma moeda encontrada
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Interval Buttons */}
          <div className="flex items-center gap-0.5 bg-secondary/30 rounded-lg p-0.5 shrink-0">
            {INTERVALS.map((int) => (
              <Button
                key={int.value}
                variant={interval === int.value ? 'default' : 'ghost'}
                size="sm"
                className={`h-9 sm:h-7 px-2.5 text-xs transition-all duration-200 ${
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
        </div>

        {/* Row 2: Streamlined indicator toggles + More Indicators popover */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-wrap">
          <Button
            variant={showSMA20 ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2.5 text-xs transition-all duration-200 shrink-0 ${
              showSMA20
                ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 scale-[1.02] shadow-sm shadow-yellow-500/10 border border-yellow-500/30 font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setShowSMA20(!showSMA20)}
          >
            SMA 20
          </Button>

          <Button
            variant={showSMA50 ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2.5 text-xs transition-all duration-200 shrink-0 ${
              showSMA50
                ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 scale-[1.02] shadow-sm shadow-purple-500/10 border border-purple-500/30 font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setShowSMA50(!showSMA50)}
          >
            SMA 50
          </Button>

          <Button
            variant={showBollinger ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2.5 text-xs transition-all duration-200 shrink-0 ${
              showBollinger
                ? 'bg-crypto-cyan/20 text-crypto-cyan hover:bg-crypto-cyan/30 scale-[1.02] shadow-sm shadow-crypto-cyan/10 border border-crypto-cyan/30 font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setShowBollinger(!showBollinger)}
          >
            BB (20,2)
          </Button>

          <Button
            variant={showEMA12 ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2.5 text-xs transition-all duration-200 shrink-0 ${
              showEMA12
                ? 'bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 scale-[1.02] shadow-sm shadow-teal-500/10 border border-teal-500/30 font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setShowEMA12(!showEMA12)}
          >
            EMA 12
          </Button>

          {/* More Indicators Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs bg-secondary/30 border-border/50 hover:bg-secondary/60 text-muted-foreground hover:text-foreground gap-1.5 shrink-0"
              >
                <span>Mais Indicadores</span>
                {(showFibonacci || showEMA26 || showVolumeProfile || showIchimoku || showVWAP || showEMARibbon) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-crypto-cyan" />
                )}
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[230px] p-2 glass border-border/50" align="start">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                Indicadores Avançados
              </div>
              <div className="space-y-1">
                <button
                  onClick={() => setShowFibonacci(!showFibonacci)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-xs rounded-md flex items-center justify-between transition-colors",
                    showFibonacci ? "bg-amber-500/15 text-amber-400 font-semibold" : "hover:bg-secondary/40 text-muted-foreground"
                  )}
                >
                  <span>Retrações Fibonacci</span>
                  <span className="text-[10px] font-mono">Fib</span>
                </button>
                <button
                  onClick={() => setShowEMA26(!showEMA26)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-xs rounded-md flex items-center justify-between transition-colors",
                    showEMA26 ? "bg-orange-500/15 text-orange-400 font-semibold" : "hover:bg-secondary/40 text-muted-foreground"
                  )}
                >
                  <span>Média Exponencial 26</span>
                  <span className="text-[10px] font-mono">EMA 26</span>
                </button>
                <button
                  onClick={() => setShowVolumeProfile(!showVolumeProfile)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-xs rounded-md flex items-center justify-between transition-colors",
                    showVolumeProfile ? "bg-emerald-500/15 text-emerald-400 font-semibold" : "hover:bg-secondary/40 text-muted-foreground"
                  )}
                >
                  <span>Perfil de Volume (VPVR)</span>
                  <span className="text-[10px] font-mono">Vol</span>
                </button>
                <button
                  onClick={() => setShowVWAP(!showVWAP)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-xs rounded-md flex items-center justify-between transition-colors",
                    showVWAP ? "bg-cyan-500/15 text-cyan-400 font-semibold" : "hover:bg-secondary/40 text-muted-foreground"
                  )}
                >
                  <span>Preço Ponderado por Volume</span>
                  <span className="text-[10px] font-mono">VWAP</span>
                </button>
                <button
                  onClick={() => setShowIchimoku(!showIchimoku)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-xs rounded-md flex items-center justify-between transition-colors",
                    showIchimoku ? "bg-rose-500/15 text-rose-400 font-semibold" : "hover:bg-secondary/40 text-muted-foreground"
                  )}
                >
                  <span>Nuvem Ichimoku</span>
                  <span className="text-[10px] font-mono">Cloud</span>
                </button>
                <button
                  onClick={() => setShowEMARibbon(!showEMARibbon)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-xs rounded-md flex items-center justify-between transition-colors",
                    showEMARibbon ? "bg-indigo-500/15 text-indigo-400 font-semibold" : "hover:bg-secondary/40 text-muted-foreground"
                  )}
                >
                  <span>Fita de Médias (Ribbon)</span>
                  <span className="text-[10px] font-mono">Ribbon</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Pro Terminal Chart + Order Book + Quick Trade Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* Main Candlestick Chart Area (8 cols on lg, 9 on 2xl) */}
        <div className="lg:col-span-8 2xl:col-span-9 min-w-0">
          <Card className="bg-[#0b1019]/90 backdrop-blur-xl border border-white/[0.08] overflow-hidden rounded-xl shadow-lg">
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
                    showVWAP={showVWAP}
                    showEMARibbon={showEMARibbon}
                    drawingTool={drawingTool}
                    drawings={drawings}
                    onDrawingAdd={handleDrawingAdd}
                  />
                </motion.div>
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>

        {/* Right Side Trading & Orderbook Area (4 cols on lg, 3 on 2xl) */}
        <div className="lg:col-span-4 2xl:col-span-3 flex flex-col gap-3">
          <QuickTrade />
          <OrderBook />
        </div>
      </div>

      {/* Technical Indicators Panel */}
      <div className="mt-2">
        <IndicatorsPanel symbol={selectedSymbol} interval={interval} />
      </div>
    </motion.div>
  );
}
