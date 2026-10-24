'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SmartBadge } from '../ui/badge';
import { Activity, ArrowUpRight, ArrowDownRight, Clock, Zap } from 'lucide-react';

export interface MarketTapeTrade {
  id: string;
  price: number;
  amount: number;
  amountUsd: number;
  side: 'BUY' | 'SELL';
  timestamp: number;
}

interface RecentTradesTapeProps {
  symbol: string;
  maxRows?: number;
}

function formatMsTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export const RecentTradesTape: React.FC<RecentTradesTapeProps> = ({
  symbol,
  maxRows = 30,
}) => {
  const [trades, setTrades] = useState<MarketTapeTrade[]>([]);
  const [filterMinUsd, setFilterMinUsd] = useState<number>(0);
  const cleanSymbol = symbol.toUpperCase().replace('/', '');

  useEffect(() => {
    let isMounted = true;

    const fetchTrades = async () => {
      try {
        const res = await fetch(`https://api.binance.com/api/v3/aggTrades?symbol=${cleanSymbol}&limit=${maxRows}`);
        if (res.ok) {
          const raw = await res.json();
          if (Array.isArray(raw) && isMounted) {
            const parsed: MarketTapeTrade[] = raw
              .map((t: any) => {
                const price = parseFloat(t.p);
                const amount = parseFloat(t.q);
                return {
                  id: String(t.a),
                  price,
                  amount,
                  amountUsd: price * amount,
                  side: t.m ? ('SELL' as const) : ('BUY' as const), // m = buyer is maker => seller is taker
                  timestamp: t.T,
                };
              })
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, maxRows);

            setTrades(parsed);
          }
        }
      } catch (err) {
        // Ignora erros transitórios de rede
      }
    };

    fetchTrades();
    const interval = setInterval(fetchTrades, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cleanSymbol, maxRows]);

  const filteredTrades = useMemo(() => {
    if (filterMinUsd <= 0) return trades;
    return trades.filter((t) => t.amountUsd >= filterMinUsd);
  }, [trades, filterMinUsd]);

  return (
    <div className="w-full bg-[#111111] border border-neutral-800 rounded-2xl overflow-hidden flex flex-col h-[520px]">
      {/* Tape Header */}
      <div className="p-3 bg-neutral-900/90 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold text-white tracking-wide">Fita de Negócios (Tape)</span>
          <span className="text-[10px] text-neutral-400 font-mono">{cleanSymbol}</span>
        </div>

        <div className="flex items-center gap-1.5 text-[10px]">
          {[0, 1000, 10000].map((threshold) => (
            <button
              key={threshold}
              type="button"
              onClick={() => setFilterMinUsd(threshold)}
              className={`px-1.5 py-0.5 rounded font-mono font-bold transition-all ${
                filterMinUsd === threshold
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {threshold === 0 ? 'Todos' : `>${threshold / 1000}k`}
            </button>
          ))}
        </div>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 px-3 py-1.5 bg-neutral-900/40 text-[10px] font-mono text-neutral-500 uppercase border-b border-neutral-800/60">
        <span>Preço (USDT)</span>
        <span className="text-right">Qtd ({cleanSymbol.replace('USDT', '')})</span>
        <span className="text-right">Horário (ms)</span>
      </div>

      {/* Trades List */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-1.5 space-y-0.5 font-mono text-[11px]">
        {filteredTrades.map((t) => {
          const isBuy = t.side === 'BUY';
          return (
            <div
              key={t.id}
              className={`grid grid-cols-3 px-2 py-1 rounded transition-colors ${
                isBuy ? 'hover:bg-emerald-500/10 text-emerald-400' : 'hover:bg-red-500/10 text-red-400'
              }`}
            >
              <div className="flex items-center gap-1 font-bold">
                {isBuy ? (
                  <ArrowUpRight className="w-3 h-3 text-emerald-400" />
                ) : (
                  <ArrowDownRight className="w-3 h-3 text-red-400" />
                )}
                <span>${t.price >= 1000 ? t.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : t.price.toFixed(4)}</span>
              </div>

              <div className="text-right text-neutral-300">
                {t.amount.toFixed(4)}
              </div>

              <div className="text-right text-neutral-500 text-[10px]">
                {formatMsTime(t.timestamp)}
              </div>
            </div>
          );
        })}

        {filteredTrades.length === 0 && (
          <div className="py-12 text-center text-xs text-neutral-500">
            Aguardando trades da exchange...
          </div>
        )}
      </div>
    </div>
  );
};
