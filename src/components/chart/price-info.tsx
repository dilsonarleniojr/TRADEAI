'use client';

import { useEffect, useState, useRef } from 'react';
import { useCryptoStore } from '@/lib/store';
import { formatPrice, formatVolume, formatPercent } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface TickerInfo {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
  flash: 'up' | 'down' | null;
}

interface PriceInfoProps {
  symbol: string;
  interval: string;
  rsiValue?: number | null;
}

export function PriceInfo({ symbol, interval, rsiValue }: PriceInfoProps) {
  const { tickers } = useCryptoStore();
  const [tickerData, setTickerData] = useState<TickerInfo | null>(null);
  const prevPriceRef = useRef<number | null>(null);
  const clearFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch fresh ticker data
  useEffect(() => {
    const abortController = new AbortController();
    let cancelled = false;

    async function loadTicker() {
      try {
        const res = await fetch(
          `/api/market/ticker`,
          { signal: abortController.signal }
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (cancelled) return;
        const data = json.data || [];

        // Find our symbol
        const found = data.find(
          (t: Record<string, string>) => t.symbol === symbol
        );
        if (found && !cancelled) {
          const newPrice = parseFloat(found.lastPrice || found.price || '0');
          const prevPrice = prevPriceRef.current;
          prevPriceRef.current = newPrice;

          let flash: 'up' | 'down' | null = null;
          if (prevPrice !== null) {
            if (newPrice > prevPrice) flash = 'up';
            else if (newPrice < prevPrice) flash = 'down';
          }

          setTickerData({
            symbol: found.symbol,
            price: newPrice,
            priceChange: parseFloat(found.priceChange || '0'),
            priceChangePercent: parseFloat(found.priceChangePercent || '0'),
            high: parseFloat(found.highPrice || found.high || '0'),
            low: parseFloat(found.lowPrice || found.low || '0'),
            volume: parseFloat(found.volume || '0'),
            quoteVolume: parseFloat(found.quoteVolume || found.quoteVolume || '0'),
            flash,
          });

          // Clear flash after animation
          if (flash) {
            if (clearFlashTimerRef.current) clearTimeout(clearFlashTimerRef.current);
            clearFlashTimerRef.current = setTimeout(() => {
              if (!cancelled) {
                setTickerData((prev) => prev ? { ...prev, flash: null } : prev);
              }
            }, 600);
          }
        }
      } catch {
        // Fall back to store tickers
        if (!cancelled) {
          const storeTicker = tickers[symbol];
          if (storeTicker) {
            setTickerData({ ...storeTicker, flash: null });
          }
        }
      }
    }

    loadTicker();

    const intervalId = setInterval(() => {
      if (!cancelled) loadTicker();
    }, 10000);

    return () => {
      cancelled = true;
      abortController.abort();
      clearInterval(intervalId);
      if (clearFlashTimerRef.current) clearTimeout(clearFlashTimerRef.current);
    };
  }, [symbol, tickers]);

  // RSI info
  const getRSIInfo = (val: number | null | undefined) => {
    if (val === null || val === undefined) return { value: null, label: 'N/A' };
    if (val >= 70) return { value: val, label: 'Sobrecomprado' };
    if (val <= 30) return { value: val, label: 'Sobrevendido' };
    return { value: val, label: 'Neutro' };
  };

  const rsiInfo = getRSIInfo(rsiValue);

  if (!tickerData) {
    return (
      <div className="flex items-center gap-4 px-4 py-3 bg-card/50 rounded-lg border border-border">
        <div className="skeleton-shimmer h-8 w-32 rounded" />
        <div className="skeleton-shimmer h-6 w-20 rounded" />
        <div className="skeleton-shimmer h-6 w-16 rounded" />
      </div>
    );
  }

  const isPositive = tickerData.priceChangePercent >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-3 md:gap-5 px-4 py-3 glass rounded-lg border border-border/50 relative"
    >
      {/* Symbol + Price */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          {isPositive ? (
            <TrendingUp className="w-4 h-4 text-crypto-green" />
          ) : (
            <TrendingDown className="w-4 h-4 text-crypto-red" />
          )}
          <span className="text-sm font-medium text-muted-foreground">{tickerData.symbol}</span>
        </div>
        <motion.span
          key={tickerData.price}
          initial={
            tickerData.flash === 'up'
              ? { color: '#22c55e' }
              : tickerData.flash === 'down'
                ? { color: '#ef4444' }
                : {}
          }
          animate={{ color: 'oklch(0.95 0 0)' }}
          transition={{ duration: 0.6 }}
          className="text-xl md:text-2xl font-bold font-mono tabular-nums"
        >
          {formatPrice(tickerData.price)}
        </motion.span>
      </div>

      {/* 24h Change */}
      <div className="flex items-center gap-1.5">
        <Badge
          variant="outline"
          className={`text-xs font-mono ${
            isPositive
              ? 'bg-crypto-green/10 text-crypto-green border-crypto-green/30'
              : 'bg-crypto-red/10 text-crypto-red border-crypto-red/30'
          }`}
        >
          {formatPercent(tickerData.priceChangePercent)}
        </Badge>
        <span
          className={`text-xs font-mono ${
            isPositive ? 'text-crypto-green' : 'text-crypto-red'
          }`}
        >
          {isPositive ? '+' : ''}
          {formatPrice(Math.abs(tickerData.priceChange))}
        </span>
      </div>

      {/* Separator */}
      <div className="hidden md:block w-px h-6 bg-border" />

      {/* 24h High/Low */}
      <div className="flex items-center gap-3 text-xs">
        <div className="flex flex-col">
          <span className="text-muted-foreground">Máx. 24h</span>
          <span className="font-mono text-crypto-green">{formatPrice(tickerData.high)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground">Mín. 24h</span>
          <span className="font-mono text-crypto-red">{formatPrice(tickerData.low)}</span>
        </div>
      </div>

      {/* Separator */}
      <div className="hidden md:block w-px h-6 bg-border" />

      {/* 24h Volume */}
      <div className="flex flex-col text-xs">
        <span className="text-muted-foreground">Volume 24h</span>
        <span className="font-mono">{formatVolume(tickerData.quoteVolume)}</span>
      </div>

      {/* Separator */}
      <div className="hidden md:block w-px h-6 bg-border" />

      {/* RSI Badge */}
      {rsiInfo.value !== null && (
        <Badge
          variant="outline"
          className={`text-xs border-border ${
            rsiInfo.value >= 70
              ? 'text-crypto-red'
              : rsiInfo.value <= 30
                ? 'text-crypto-green'
                : 'text-crypto-cyan'
          }`}
        >
          <Activity className="w-3 h-3 mr-1" />
          RSI {rsiInfo.value.toFixed(1)} ({rsiInfo.label})
        </Badge>
      )}
    </motion.div>
  );
}
