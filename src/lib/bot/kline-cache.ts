// Cache de candles por ativo para o motor dos robôs com suporte Multi-Timeframe (1m e 15m).
// Cada robô opera um símbolo diferente, então o motor precisa dos candles do PRÓPRIO símbolo.

import type { KlineData } from "@/lib/store";

const TTL_1M = 5_000;   // 5 segundos para refletir candles de 1m em tempo real
const TTL_15M = 30_000; // 30 segundos para candles de 15m (macro trend)
const LIMIT = 500;

const cache = new Map<string, { at: number; data: KlineData[] }>();
const inflight = new Map<string, Promise<KlineData[]>>();

export function invalidateKlineCache() {
  cache.clear();
}

function toKlines(raw: any[]): KlineData[] {
  return raw.map((k: any) => ({
    time: k.openTime,
    open: parseFloat(k.open),
    high: parseFloat(k.high),
    low: parseFloat(k.low),
    close: parseFloat(k.close),
    volume: parseFloat(k.volume),
  }));
}

async function loadHistory(symbol: string): Promise<{ data: KlineData[]; stored: number }> {
  const res = await fetch(`/api/market/history?symbol=${symbol}&interval=1m&limit=${LIMIT}`);
  if (!res.ok) throw new Error(`history ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json?.data)) throw new Error("history inválido");
  return { data: toKlines(json.data), stored: Number(json.stored ?? 0) };
}

async function loadRecent(symbol: string, interval: string = "1m"): Promise<KlineData[]> {
  const res = await fetch(`/api/market/klines?symbol=${symbol}&interval=${interval}&limit=100`);
  if (!res.ok) throw new Error(`klines ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json?.data)) throw new Error("klines inválido");
  return toKlines(json.data);
}

export async function getSymbolKlines(symbol: string, interval: string = "1m"): Promise<KlineData[]> {
  const cacheKey = `${symbol}_${interval}`;
  const ttl = interval === "15m" ? TTL_15M : TTL_1M;

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < ttl) return hit.data;

  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    try {
      let data: KlineData[] = [];
      try {
        const recent = await loadRecent(symbol, interval);
        if (recent.length >= 20) {
          data = recent;
        }
      } catch {
        // Fallback para histórico se loadRecent falhar
      }

      if (data.length < 20 && interval === "1m") {
        try {
          const h = await loadHistory(symbol);
          data = h.data;
        } catch {
          data = [];
        }
      }

      cache.set(cacheKey, { at: Date.now(), data });
      return data;
    } catch {
      // Em falha, usa o último dado conhecido (mesmo vencido) em vez de bloquear o robô.
      return cache.get(cacheKey)?.data ?? [];
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, request);
  return request;
}
