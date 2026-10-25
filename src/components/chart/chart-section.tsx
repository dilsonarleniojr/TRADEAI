'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useCryptoStore } from '@/lib/store';
import { PriceInfo } from './price-info';
import { CandlestickChart } from './candlestick-chart';
import { IndicatorsPanel } from './indicators-panel';
import { QuickTrade } from './quick-trade';
import { OrderBook } from './order-book';
import { OrderBookImbalanceHistogram } from './order-book-imbalance-histogram';
import type { OrderBookImbalanceResult, SpoofingAlert } from '@/lib/order-book-imbalance';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { MousePointer2, TrendingUp, Minus, Trash2, Search, ChevronDown, Zap, Activity } from 'lucide-react';
import { ALL_SYMBOLS } from '@/lib/crypto-meta';
import { cn } from '@/lib/utils';
import type { DrawingTool, Drawing } from './candlestick-chart';

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

function SymbolDropdownList({
  selectedSymbol,
  onSelect,
  symbolSearch,
}: {
  selectedSymbol: string;
  onSelect: (sym: string) => void;
  symbolSearch: string;
}) {
  const tickers = useCryptoStore((s) => s.tickers);
  const filteredSymbols = useMemo(() => {
    const query = symbolSearch.toLowerCase().trim();
    if (!query) {
      return [...ALL_SYMBOLS]
        .sort((a, b) => (tickers[b]?.quoteVolume || 0) - (tickers[a]?.quoteVolume || 0))
        .slice(0, 50);
    }
    return ALL_SYMBOLS.filter((s) => s.toLowerCase().includes(query)).slice(0, 60);
  }, [symbolSearch, tickers]);

  return (
    <div className="max-h-[220px] overflow-y-auto cyan-scrollbar p-1">
      {filteredSymbols.map((sym) => {
        const t = tickers[sym];
        return (
          <button
            key={sym}
            onClick={() => onSelect(sym)}
            className={cn(
              "w-full text-left px-2 py-1.5 text-xs rounded hover:bg-secondary/40 flex items-center justify-between transition-colors",
              sym === selectedSymbol && "bg-crypto-cyan/15 text-crypto-cyan font-bold"
            )}
          >
            <span>{(sym || '').replace('USDT', '/USDT')}</span>
            {t && (
              <span className="text-[10px] font-mono text-muted-foreground">
                ${t.price < 1 ? t.price.toFixed(4) : t.price.toFixed(2)}
              </span>
            )}
          </button>
        );
      })}
      {filteredSymbols.length === 0 && (
        <div className="p-3 text-center text-xs text-muted-foreground">
          Nenhuma moeda encontrada
        </div>
      )}
    </div>
  );
}

export function ChartSection() {
  const rawSelectedSymbol = useCryptoStore((s) => s.selectedSymbol);
  const selectedSymbol = rawSelectedSymbol || 'BTCUSDT';
  const setSelectedSymbol = useCryptoStore((s) => s.setSelectedSymbol);
  const [interval, setInterval] = useState('1h');
  const [symbolSearch, setSymbolSearch] = useState('');
  const [symbolSelectOpen, setSymbolSelectOpen] = useState(false);
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

  // High-density terminal side view mode: both | trade | book
  const [sideView, setSideView] = useState<'both' | 'trade' | 'book'>('both');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('tradeai_chart_side_view');
      if (saved === 'both' || saved === 'trade' || saved === 'book') {
        setSideView(saved);
      }
    } catch {
      // LocalStorage access fallback
    }
  }, []);

  const handleSideViewChange = useCallback((mode: 'both' | 'trade' | 'book') => {
    setSideView(mode);
    try {
      localStorage.setItem('tradeai_chart_side_view', mode);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleDrawingAdd = useCallback((drawing: Drawing) => {
    setDrawings((prev) => [...prev, drawing]);
  }, []);

  const handleClearDrawings = useCallback(() => {
    setDrawings([]);
  }, []);

  // L2 Order Book Depth & Imbalance (OBI) State
  const [depthData, setDepthData] = useState<{ bids: { price: number; volume: number }[]; asks: { price: number; volume: number }[] } | null>(null);
  const [depthImbalance, setDepthImbalance] = useState<OrderBookImbalanceResult | null>(null);
  const [spoofingAlert, setSpoofingAlert] = useState<SpoofingAlert | null>(null);
  const spoofingMarkers = useCryptoStore((s) => s.spoofingMarkers[s.selectedSymbol] || []);
  const addSpoofingMarker = useCryptoStore((s) => s.addSpoofingMarker);
  const setSpoofingMarkers = useCryptoStore((s) => s.setSpoofingMarkers);
  const [showSpoofingMarkers, setShowSpoofingMarkers] = useState<boolean>(true);
  const setTradePrefill = useCryptoStore((s) => s.setTradePrefill);
  const currentPrice = useCryptoStore((s) => s.tickers[s.selectedSymbol]?.price ?? 0);
  const { toast } = useToast();

  useEffect(() => {
    setSpoofingAlert(null);
    let cancelled = false;

    // Carrega histórico de eventos de evasão de spoofing do robô / radar
    async function fetchSpoofingEvents() {
      try {
        const res = await fetch(`/api/bot/direct-operation/spoofing-events?symbol=${selectedSymbol}`);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled && json?.data?.events && Array.isArray(json.data.events)) {
            setSpoofingMarkers(selectedSymbol, json.data.events);
          }
        }
      } catch {
        // Fallback silencioso
      }
    }

    fetchSpoofingEvents();
    return () => {
      cancelled = true;
    };
  }, [selectedSymbol, setSpoofingMarkers]);

  const handleSpoofingAlert = useCallback((alert: SpoofingAlert | null) => {
    setSpoofingAlert(alert);
    if (alert && alert.isAlertActive && alert.dropPct >= 30.0) {
      addSpoofingMarker({
        id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        symbol: selectedSymbol,
        timestamp: alert.timestamp || Date.now(),
        dropPct: alert.dropPct,
        side: alert.side,
        severity: alert.severity,
        actionTaken: 'Despacho pausado por 3s para reavaliar profundidade real',
        message: alert.message,
      });
    }
  }, [selectedSymbol, addSpoofingMarker]);

  const handleQuickMarketOrderFromConfluence = useCallback((side: 'BUY' | 'SELL') => {
    const currentTickerPrice = useCryptoStore.getState().tickers[selectedSymbol]?.price || 0;
    const deltaStr = depthImbalance ? (depthImbalance.imbalancePct > 0 ? `+${depthImbalance.imbalancePct}%` : `${depthImbalance.imbalancePct}%`) : '';
    setTradePrefill({
      symbol: selectedSymbol,
      side,
      entryPrice: currentTickerPrice,
      horizon: 'RAPIDO',
      source: 'Confluência L2 (OBI)',
      reason: `Desbalanceamento de Liquidez L2 ${side === 'BUY' ? 'Comprador' : 'Vendedor'} Favorável (${deltaStr})`,
    });
    // Alterna suavemente para visualização dividida exibindo o trade com dados preenchidos
    handleSideViewChange('both');

    // Alerta defensivo de Spoofing se uma parede do mesmo lado tiver sido cancelada
    if (spoofingAlert?.isAlertActive) {
      const isAdverse =
        (side === 'BUY' && spoofingAlert.side === 'BID') ||
        (side === 'SELL' && spoofingAlert.side === 'ASK');

      if (isAdverse) {
        toast({
          variant: 'destructive',
          title: `🛡️ Alerta de Spoofing no Book (${spoofingAlert.side === 'BID' ? 'COMPRA' : 'VENDA'})`,
          description: `Parede de liquidez cancelada (-${spoofingAlert.dropPct}%) a ${spoofingAlert.timeDeltaMs}ms atrás. Risco elevado de derrapagem por liquidez fantasma.`,
        });
        return;
      }
    }

    toast({
      title: `⚡ Confluência L2 Aplicada: ${side === 'BUY' ? 'COMPRA' : 'VENDA'}`,
      description: `Parâmetros preenchidos no Painel de Trade para ${selectedSymbol.replace('USDT', '')} com base no book L2. Revise o lote antes da confirmação.`,
    });
  }, [selectedSymbol, depthImbalance, spoofingAlert, handleSideViewChange, setTradePrefill, toast]);

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
                <SymbolDropdownList
                  selectedSymbol={selectedSymbol}
                  symbolSearch={symbolSearch}
                  onSelect={(sym) => {
                    setSelectedSymbol(sym);
                    setSymbolSelectOpen(false);
                    setSymbolSearch('');
                  }}
                />
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

          {/* Toggle de Micro-Destaques de Spoofing nos Candles */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSpoofingMarkers(!showSpoofingMarkers)}
            className={cn(
              "h-7 px-2.5 text-xs transition-all duration-200 shrink-0 gap-1.5 border",
              showSpoofingMarkers
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25 shadow-sm shadow-emerald-500/10 font-semibold"
                : "border-border/40 text-muted-foreground hover:text-foreground opacity-60"
            )}
            title="Exibir ou ocultar micro-destaques de spoofing nos candles intradiários auditados"
          >
            <span>🛡️ Anti-Spoof</span>
            {spoofingMarkers.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                {spoofingMarkers.length}
              </span>
            )}
          </Button>
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
                    spoofingEvents={spoofingMarkers}
                    showSpoofingMarkers={showSpoofingMarkers}
                  />
                </motion.div>
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>

        {/* Right Side Trading & Orderbook Area (4 cols on lg, 3 on 2xl) */}
        <div className="lg:col-span-4 2xl:col-span-3 flex flex-col gap-2.5">
          {/* Institutional Side Panel Density Selector */}
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-secondary/15 rounded-lg border border-border/40 text-[11px] backdrop-blur-sm">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Terminal Lateral
            </span>
            <div className="flex items-center gap-1 bg-secondary/40 p-0.5 rounded-md border border-border/30">
              <button
                type="button"
                onClick={() => handleSideViewChange('both')}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer",
                  sideView === 'both'
                    ? "bg-crypto-cyan text-black font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Visualização dividida: Trade Rápido + Livro de Ofertas"
              >
                Divisão
              </button>
              <button
                type="button"
                onClick={() => handleSideViewChange('trade')}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer",
                  sideView === 'trade'
                    ? "bg-crypto-cyan text-black font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Foco exclusivo no Painel de Ordem / Trade Rápido"
              >
                Trade
              </button>
              <button
                type="button"
                onClick={() => handleSideViewChange('book')}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer flex items-center gap-1",
                  sideView === 'book'
                    ? "bg-crypto-cyan text-black font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Foco exclusivo no Livro de Ofertas (OrderBook L2) com mini-histograma OBI"
              >
                <span>Livro L2</span>
                {depthImbalance && (
                  <span
                    className={cn(
                      "text-[8px] font-mono px-1 py-0 rounded transition-all",
                      sideView === 'book'
                        ? "bg-black/20 text-black font-bold"
                        : depthImbalance.confluenceSignal === 'BULLISH'
                        ? "text-crypto-green bg-crypto-green/10 font-bold"
                        : depthImbalance.confluenceSignal === 'BEARISH'
                        ? "text-crypto-red bg-crypto-red/10 font-bold"
                        : "text-muted-foreground"
                    )}
                  >
                    {depthImbalance.imbalancePct > 0 ? `▲+${depthImbalance.imbalancePct}%` : `▼${depthImbalance.imbalancePct}%`}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Mini-Histograma de Desbalanceamento de Liquidez Bid/Ask (OBI) ativado no modo Livro L2 */}
          <AnimatePresence>
            {sideView === 'book' && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <OrderBookImbalanceHistogram
                  bids={depthData?.bids || []}
                  asks={depthData?.asks || []}
                  symbol={selectedSymbol}
                  currentPrice={currentPrice}
                  onExecuteMarketOrder={handleQuickMarketOrderFromConfluence}
                  spoofingAlert={spoofingAlert}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {(sideView === 'both' || sideView === 'trade') && <QuickTrade />}
          {(sideView === 'both' || sideView === 'book') && (
            <OrderBook
              mode={sideView}
              onDepthData={setDepthData}
              onImbalanceUpdate={setDepthImbalance}
              onExecuteMarketOrder={handleQuickMarketOrderFromConfluence}
              onSpoofingAlert={handleSpoofingAlert}
            />
          )}
        </div>
      </div>

      {/* Technical Indicators Panel */}
      <div className="mt-2">
        <IndicatorsPanel symbol={selectedSymbol} interval={interval} />
      </div>
    </motion.div>
  );
}
