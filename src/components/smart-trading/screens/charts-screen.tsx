'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CandlestickChart, type DrawingTool, type Drawing } from '@/components/chart/candlestick-chart';
import { OrderBook } from '@/components/chart/order-book';
import { RecentTradesTape } from '../trading/recent-trades-tape';
import { SmartOrderPanel } from '../trading/order-panel';
import { SmartAssetWatchlist } from '../trading/asset-watchlist';
import { SmartCard } from '../ui/card';
import { SmartButton } from '../ui/button';
import { SmartBadge } from '../ui/badge';
import { useCryptoStore } from '@/lib/store';
import { 
  TrendingUp, 
  Minus, 
  Ruler, 
  Trash2, 
  SlidersHorizontal, 
  Sparkles, 
  Layers, 
  BookOpen,
  Activity,
  Maximize2,
  Crosshair,
  Zap,
  BarChart2,
  ListFilter
} from 'lucide-react';

interface ChartsScreenProps {
  initialSymbol?: string;
  tradingMode?: 'live' | 'paper';
}

const INTERVALS = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '1d', label: '1D' },
];

export const ChartsScreen: React.FC<ChartsScreenProps> = ({ 
  initialSymbol = 'BTC/USDT',
  tradingMode = 'paper' 
}) => {
  const selectedStoreSymbol = useCryptoStore((s) => s.selectedSymbol);
  const setSelectedStoreSymbol = useCryptoStore((s) => s.setSelectedSymbol);

  const [symbol, setSymbol] = useState(selectedStoreSymbol || initialSymbol);
  const [chartInterval, setChartInterval] = useState<string>('15m');
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingTool>('crosshair');
  const [drawings, setDrawings] = useState<Drawing[]>([]);

  // Toggles de Indicadores Técnicos
  const [showSMA20, setShowSMA20] = useState(false);
  const [showSMA50, setShowSMA50] = useState(false);
  const [showBollinger, setShowBollinger] = useState(true);
  const [showEMA12, setShowEMA12] = useState(true);
  const [showEMA26, setShowEMA26] = useState(true);
  const [showEMARibbon, setShowEMARibbon] = useState(false);
  const [showVWAP, setShowVWAP] = useState(true);
  const [showVolumeProfile, setShowVolumeProfile] = useState(true);
  const [showIchimoku, setShowIchimoku] = useState(false);

  // Painéis laterais
  const [activeSidePanel, setActiveSidePanel] = useState<'orderbook' | 'tape' | 'order' | 'watchlist'>('orderbook');
  const [livePrice, setLivePrice] = useState<number>(80900.0);

  const cleanSymbol = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();

  // Sincronizar símbolo com store global
  const handleSelectSymbol = useCallback((newSym: string) => {
    setSymbol(newSym);
    const clean = newSym.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    setSelectedStoreSymbol(clean);
  }, [setSelectedStoreSymbol]);

  // Cotação em tempo real
  useEffect(() => {
    let isMounted = true;
    const fetchPrice = async () => {
      try {
        const res = await fetch(`/api/market/ticker?symbol=${cleanSymbol}`);
        if (res.ok) {
          const json = await res.json();
          const item = Array.isArray(json.data) 
            ? json.data.find((t: any) => t.symbol === cleanSymbol) 
            : json.data;
          if (item?.lastPrice && isMounted) {
            const p = parseFloat(item.lastPrice);
            if (p > 0) setLivePrice(p);
          }
        }
      } catch (e: any) {
        // Fallback silencioso
      }
    };
    fetchPrice();
    const timer = window.setInterval(fetchPrice, 4000);
    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [cleanSymbol]);

  const handleDrawingAdd = useCallback((drawing: Drawing) => {
    setDrawings((prev) => [...prev, drawing]);
  }, []);

  const handleClearDrawings = useCallback(() => {
    setDrawings([]);
    setActiveDrawingTool('crosshair');
  }, []);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Chart Top Quick Header & Indicators Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] backdrop-blur-md">
        {/* Left: Symbol & Interval selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-[var(--st-text-primary)] tracking-wide">{cleanSymbol.replace('USDT', '/USDT')}</span>
            <SmartBadge variant="success" isDot>WebGL 2.0 / Zero-Alloc</SmartBadge>
          </div>

          {/* Timeframe Buttons */}
          <div className="hidden sm:flex items-center gap-1 bg-[var(--st-bg-elevated)] p-1 rounded-lg border border-[var(--st-border)]">
            {INTERVALS.map((int) => (
              <button
                key={int.value}
                type="button"
                onClick={() => setChartInterval(int.value)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  chartInterval === int.value
                    ? 'bg-[var(--st-primary)] text-white shadow-sm'
                    : 'text-[var(--st-text-secondary)] hover:text-white'
                }`}
              >
                {int.label}
              </button>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-3 text-xs font-mono border-l border-[var(--st-border)] pl-3 text-[var(--st-text-secondary)]">
            <span>Preço: <strong className="text-[var(--st-text-primary)]">${livePrice >= 1000 ? livePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : livePrice.toFixed(4)}</strong></span>
          </div>
        </div>

        {/* Center: Technical Overlays Toggles */}
        <div className="hidden xl:flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setShowEMA12(!showEMA12)}
            className={`px-2 py-1 rounded text-[11px] font-bold border ${
              showEMA12 ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' : 'bg-transparent text-[var(--st-text-muted)] border-[var(--st-border)]'
            }`}
          >
            EMA 12/26
          </button>
          <button
            type="button"
            onClick={() => setShowBollinger(!showBollinger)}
            className={`px-2 py-1 rounded text-[11px] font-bold border ${
              showBollinger ? 'bg-purple-500/20 text-purple-400 border-purple-500/40' : 'bg-transparent text-[var(--st-text-muted)] border-[var(--st-border)]'
            }`}
          >
            Bollinger
          </button>
          <button
            type="button"
            onClick={() => setShowVWAP(!showVWAP)}
            className={`px-2 py-1 rounded text-[11px] font-bold border ${
              showVWAP ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-transparent text-[var(--st-text-muted)] border-[var(--st-border)]'
            }`}
          >
            VWAP
          </button>
          <button
            type="button"
            onClick={() => setShowVolumeProfile(!showVolumeProfile)}
            className={`px-2 py-1 rounded text-[11px] font-bold border ${
              showVolumeProfile ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' : 'bg-transparent text-[var(--st-text-muted)] border-[var(--st-border)]'
            }`}
          >
            Vol Profile
          </button>
        </div>

        {/* Right: Side Panel Selectors */}
        <div className="flex items-center gap-2">
          <SmartButton 
            variant={activeSidePanel === 'orderbook' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setActiveSidePanel('orderbook')}
            leftIcon={<BookOpen className="w-3.5 h-3.5" />}
          >
            Livro L2
          </SmartButton>

          <SmartButton 
            variant={activeSidePanel === 'tape' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setActiveSidePanel('tape')}
            leftIcon={<Activity className="w-3.5 h-3.5" />}
          >
            Trades (Tape)
          </SmartButton>

          <SmartButton 
            variant={activeSidePanel === 'order' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setActiveSidePanel('order')}
            leftIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
          >
            Boleta
          </SmartButton>

          <SmartButton 
            variant={activeSidePanel === 'watchlist' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setActiveSidePanel('watchlist')}
            leftIcon={<Layers className="w-3.5 h-3.5" />}
          >
            Ativos
          </SmartButton>
        </div>
      </div>

      {/* Main Workspace Layout: Chart + Side Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Central High-Performance Canvas/WebGL Chart Area (8 Colunas) */}
        <div className="lg:col-span-8 space-y-3">
          <div className="relative rounded-2xl overflow-hidden border border-[var(--st-border)] bg-[#0b0e14] shadow-2xl">
            {/* Minimalist Drawing Toolbar Floater */}
            <div className="absolute left-3 top-3 z-30 flex flex-col gap-1 p-1 rounded-lg border border-white/10 bg-[#0f141f]/90 backdrop-blur-md shadow-lg">
              <button
                type="button"
                title="Cursor Crosshair & Medições R:R"
                onClick={() => setActiveDrawingTool('crosshair')}
                className={`p-1.5 rounded transition-all ${
                  activeDrawingTool === 'crosshair'
                    ? 'bg-[var(--st-primary)] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                title="Linha de Tendência"
                onClick={() => setActiveDrawingTool(activeDrawingTool === 'trendline' ? 'crosshair' : 'trendline')}
                className={`p-1.5 rounded transition-all ${
                  activeDrawingTool === 'trendline'
                    ? 'bg-[var(--st-primary)] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                title="Suporte / Resistência Horizontal"
                onClick={() => setActiveDrawingTool(activeDrawingTool === 'horizontal' ? 'crosshair' : 'horizontal')}
                className={`p-1.5 rounded transition-all ${
                  activeDrawingTool === 'horizontal'
                    ? 'bg-[var(--st-primary)] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              {drawings.length > 0 && (
                <button
                  type="button"
                  title="Limpar Desenhos"
                  onClick={handleClearDrawings}
                  className="p-1.5 rounded text-red-400 hover:bg-red-500/20 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Canvas/WebGL High-Performance Candlestick Chart */}
            <CandlestickChart
              symbol={cleanSymbol}
              interval={chartInterval}
              showSMA20={showSMA20}
              showSMA50={showSMA50}
              showBollinger={showBollinger}
              showEMA12={showEMA12}
              showEMA26={showEMA26}
              showEMARibbon={showEMARibbon}
              showVWAP={showVWAP}
              showVolumeProfile={showVolumeProfile}
              showIchimoku={showIchimoku}
              drawingTool={activeDrawingTool}
              drawings={drawings}
              onDrawingAdd={handleDrawingAdd}
            />
          </div>

          {/* Quick AI Chart Vision Indicator Summary Bar */}
          <div className="p-3 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--st-secondary)] animate-pulse" />
              <span className="font-semibold text-[var(--st-text-primary)]">Interatividade no Gráfico:</span>
              <span className="text-[var(--st-text-secondary)]">Arraste as linhas de Stop-Loss e Take-Profit diretamente no gráfico para recalcular ordens. Crosshair magnético com R:R em tempo real.</span>
            </div>
            <div className="flex items-center gap-2">
              <SmartBadge variant="success">Overlay Ativo (+$$ / -$$)</SmartBadge>
              <SmartBadge variant="blue">Drag & Drop Ativo</SmartBadge>
            </div>
          </div>
        </div>

        {/* Side Panel: OrderBook L2 / Recent Trades Tape / Boleta / Watchlist (4 Colunas) */}
        <div className="lg:col-span-4 space-y-4">
          {activeSidePanel === 'orderbook' && (
            <div className="animate-in fade-in duration-200">
              <OrderBook
                mode="book"
                showInlineHistogram={true}
              />
            </div>
          )}

          {activeSidePanel === 'tape' && (
            <div className="animate-in fade-in duration-200">
              <RecentTradesTape
                symbol={cleanSymbol}
                maxRows={30}
              />
            </div>
          )}

          {activeSidePanel === 'order' && (
            <div className="animate-in fade-in duration-200">
              <SmartOrderPanel 
                symbol={cleanSymbol.replace('USDT', '/USDT')}
                currentPrice={livePrice}
                tradingMode={tradingMode}
              />
            </div>
          )}

          {activeSidePanel === 'watchlist' && (
            <div className="animate-in fade-in duration-200">
              <SmartAssetWatchlist 
                activeSymbol={symbol.replace('USDT', '/USDT')}
                onSelectPair={(pair) => {
                  handleSelectSymbol(pair);
                  setActiveSidePanel('orderbook');
                }} 
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
