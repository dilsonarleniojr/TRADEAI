'use client';

import React, { useState, useEffect, useMemo, memo } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

/**
 * Interface estrita para o payload de trades agregados da Binance (REST /api/v3/aggTrades).
 */
export interface BinanceAggTradeRaw {
  a: number;   // Aggregate tradeId
  p: string;   // Preço
  q: string;   // Quantidade
  f?: number;  // Primeiro tradeId
  l?: number;  // Último tradeId
  T: number;   // Timestamp (ms)
  m: boolean;  // Buyer is maker (m = true => seller é taker/vendedor ativo => SELL)
  M?: boolean; // Best price match
}

export interface MarketTapeTrade {
  id: string;
  price: number;
  amount: number;
  amountUsd: number;
  side: 'BUY' | 'SELL';
  timestamp: number;
  formattedPrice: string;
  formattedAmount: string;
  formattedTime: string;
}

interface RecentTradesTapeProps {
  symbol: string;
  maxRows?: number;
}

/**
 * Formatação de timestamp com resolução de milissegundos sem overhead excessivo.
 */
export function formatMsTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

/**
 * Parser de trades agregados com varredura reversa em passagem única (Single-Pass O(N)).
 * Elimina .map().sort().slice() e precalcula strings na ingestão para manter o hot-path da UI Zero-Alloc.
 */
export function parseBinanceAggTrades(raw: unknown, maxRows: number): MarketTapeTrade[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }

  const rawLength = raw.length;
  const count = Math.min(rawLength, maxRows);
  const result: MarketTapeTrade[] = new Array(count);

  // Binance retorna trades cronologicamente (T ascendente).
  // Percorrendo de trás para frente pegamos os mais recentes primeiro sem sort()
  let outIdx = 0;
  for (let i = rawLength - 1; i >= 0 && outIdx < count; i--) {
    const item = raw[i] as Partial<BinanceAggTradeRaw> | null;
    if (!item || typeof item !== 'object') continue;

    const price = typeof item.p === 'string' ? parseFloat(item.p) : (Number(item.p) || 0);
    const amount = typeof item.q === 'string' ? parseFloat(item.q) : (Number(item.q) || 0);
    const timestamp = typeof item.T === 'number' ? item.T : Date.now();
    const id = item.a != null ? String(item.a) : `${timestamp}-${outIdx}`;
    const side: 'BUY' | 'SELL' = item.m ? 'SELL' : 'BUY';
    const amountUsd = price * amount;

    // Pré-formatação imutável para eliminar alocações no loop de renderização (60Hz+)
    const formattedPrice = price >= 1000
      ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : price.toFixed(4);
    const formattedAmount = amount.toFixed(4);
    const formattedTime = formatMsTime(timestamp);

    result[outIdx++] = {
      id,
      price,
      amount,
      amountUsd,
      side,
      timestamp,
      formattedPrice,
      formattedAmount,
      formattedTime,
    };
  }

  // Ajusta o tamanho caso algum item tenha sido pulado
  if (outIdx < count) {
    result.length = outIdx;
  }

  return result;
}

const FILTER_THRESHOLDS = [0, 1000, 10000] as const;

export const RecentTradesTape: React.FC<RecentTradesTapeProps> = memo(({
  symbol,
  maxRows = 30,
}) => {
  const [trades, setTrades] = useState<MarketTapeTrade[]>([]);
  const [filterMinUsd, setFilterMinUsd] = useState<number>(0);
  const cleanSymbol = useMemo(() => symbol.toUpperCase().replace('/', ''), [symbol]);

  useEffect(() => {
    let isMounted = true;

    const fetchTrades = async () => {
      try {
        const res = await fetch(`https://api.binance.com/api/v3/aggTrades?symbol=${cleanSymbol}&limit=${maxRows}`);
        if (res.ok) {
          const raw: unknown = await res.json();
          if (isMounted) {
            const parsed = parseBinanceAggTrades(raw, maxRows);
            setTrades(parsed);
          }
        }
      } catch {
        // Falhas de rede transitórias são absorvidas pelo próximo ciclo de polling
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
          {FILTER_THRESHOLDS.map((threshold) => (
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
                  <ArrowUpRight className="w-3 h-3 text-emerald-400 shrink-0" />
                ) : (
                  <ArrowDownRight className="w-3 h-3 text-red-400 shrink-0" />
                )}
                <span>${t.formattedPrice}</span>
              </div>

              <div className="text-right text-neutral-300">
                {t.formattedAmount}
              </div>

              <div className="text-right text-neutral-500 text-[10px]">
                {t.formattedTime}
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
});

RecentTradesTape.displayName = 'RecentTradesTape';
