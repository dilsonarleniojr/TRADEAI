'use client';

import React, { useState, useEffect } from 'react';
import { SmartCandleChart } from '../trading/candle-chart';
import { SmartOrderPanel } from '../trading/order-panel';
import { SmartAssetWatchlist } from '../trading/asset-watchlist';
import { SmartCard } from '../ui/card';
import { SmartButton } from '../ui/button';
import { SmartBadge } from '../ui/badge';
import { 
  TrendingUp, 
  Minus, 
  Ruler, 
  Type, 
  Trash2, 
  SlidersHorizontal, 
  Sparkles, 
  Layers, 
  ChevronRight, 
  ChevronLeft,
  Maximize2
} from 'lucide-react';

interface ChartsScreenProps {
  initialSymbol?: string;
  tradingMode?: 'live' | 'paper';
}

export const ChartsScreen: React.FC<ChartsScreenProps> = ({ 
  initialSymbol = 'BTC/USDT',
  tradingMode = 'paper' 
}) => {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [activeDrawingTool, setActiveDrawingTool] = useState<string | null>('trendline');
  const [isOrderPanelOpen, setIsOrderPanelOpen] = useState(true);
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const [livePrice, setLivePrice] = useState<number>(80900.0);

  const cleanSymbol = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();

  // Buscar cotação em tempo real da Binance
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
        console.warn('[ChartsScreen] Erro ao obter ticker:', e.message);
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cleanSymbol]);

  const currentPrice = livePrice;

  const drawingTools = [
    { id: 'trendline', icon: <TrendingUp className="w-4 h-4" />, name: 'Linha de Tendência' },
    { id: 'horizontal', icon: <Minus className="w-4 h-4" />, name: 'Suporte / Resistência' },
    { id: 'fib', icon: <SlidersHorizontal className="w-4 h-4" />, name: 'Retração de Fibonacci' },
    { id: 'ruler', icon: <Ruler className="w-4 h-4" />, name: 'Régua de Variação' },
    { id: 'text', icon: <Type className="w-4 h-4" />, name: 'Anotação de Texto' },
    { id: 'clear', icon: <Trash2 className="w-4 h-4" />, name: 'Limpar Desenhos' },
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Chart Top Quick Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-[var(--st-text-primary)] tracking-wide">{symbol}</span>
            <SmartBadge variant="success" isDot>Mercado Spot L2</SmartBadge>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-xs font-mono border-l border-[var(--st-border)] pl-3 text-[var(--st-text-secondary)]">
            <span>24h Max: <strong className="text-[var(--st-text-primary)]">{(currentPrice * 1.035).toFixed(2)}</strong></span>
            <span>24h Min: <strong className="text-[var(--st-text-primary)]">{(currentPrice * 0.972).toFixed(2)}</strong></span>
            <span>Vol 24h: <strong className="text-[var(--st-text-primary)]">32,490 BTC</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SmartButton 
            variant={isWatchlistOpen ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setIsWatchlistOpen(!isWatchlistOpen)}
            leftIcon={<Layers className="w-3.5 h-3.5" />}
          >
            Ativos
          </SmartButton>
          <SmartButton 
            variant={isOrderPanelOpen ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setIsOrderPanelOpen(!isOrderPanelOpen)}
            leftIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
          >
            Boleta de Ordens
          </SmartButton>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Watchlist Flyout (if open) */}
        {isWatchlistOpen && (
          <div className="lg:col-span-3 transition-all animate-in slide-in-from-left duration-200">
            <SmartAssetWatchlist onSelectPair={(pair) => {
              setSymbol(pair);
              setIsWatchlistOpen(false);
            }} />
          </div>
        )}

        {/* Central Chart Area */}
        <div className={`${isOrderPanelOpen && isWatchlistOpen ? 'lg:col-span-6' : isOrderPanelOpen || isWatchlistOpen ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-3`}>
          <div className="relative">
            {/* Minimalist Drawing Toolbar Floater */}
            <div className="absolute left-3 top-14 z-20 hidden sm:flex flex-col gap-1 p-1.5 rounded-lg border border-[var(--st-border)] bg-[var(--st-bg-surface)]/90 backdrop-blur-md shadow-lg">
              {drawingTools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  title={tool.name}
                  onClick={() => {
                    if (tool.id === 'clear') {
                      setActiveDrawingTool(null);
                    } else {
                      setActiveDrawingTool(activeDrawingTool === tool.id ? null : tool.id);
                    }
                  }}
                  className={`p-2 rounded-md transition-all ${
                    activeDrawingTool === tool.id
                      ? 'bg-[var(--st-primary)] text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]'
                      : 'text-[var(--st-text-secondary)] hover:text-[var(--st-text-primary)] hover:bg-[var(--st-bg-elevated)]'
                  }`}
                >
                  {tool.icon}
                </button>
              ))}
            </div>

            <SmartCandleChart 
              symbol={symbol}
              basePrice={currentPrice}
              height={520}
              onSelectPair={setSymbol}
            />
          </div>

          {/* Quick AI Chart Vision Indicator Summary Bar */}
          <div className="p-3 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--st-secondary)] animate-pulse" />
              <span className="font-semibold text-[var(--st-text-primary)]">Gemini Multi-Modal Vision:</span>
              <span className="text-[var(--st-text-secondary)]">Padrão de Fundo Duplo em 15m com rejeição de mínimas. Força compradora em aceleração.</span>
            </div>
            <div className="flex items-center gap-2">
              <SmartBadge variant="success">RSI (14): 54.2 Neutro-Altista</SmartBadge>
              <SmartBadge variant="blue">EMA 20 &gt; EMA 50</SmartBadge>
            </div>
          </div>
        </div>

        {/* Order Panel Sidebar */}
        {isOrderPanelOpen && (
          <div className={`${isWatchlistOpen ? 'lg:col-span-3' : 'lg:col-span-4'} transition-all animate-in slide-in-from-right duration-200`}>
            <SmartOrderPanel 
              symbol={symbol}
              currentPrice={currentPrice}
              tradingMode={tradingMode}
            />
          </div>
        )}
      </div>
    </div>
  );
};
