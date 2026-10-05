// Cache de candles por ativo para o motor dos robôs.
// Cada robô opera um símbolo diferente, então o motor precisa dos candles do PRÓPRIO símbolo
// (antes o painel "escalava" os candles de outro ativo, o que gerava indicadores falsos).
// Os candles vêm do histórico local (/api/market/history), que o usuário baixa retroativamente
// da Binance; se o histórico ainda é curto, baixa 30 dias sozinho uma vez por sessão.

import type { KlineData } from "@/lib/store";

const TTL_MS = 5_000; // 5 segundos para refletir candles de 1m em tempo real
const INTERVAL = "1m"; // Estratégia dos robôs opera no tempo gráfico de 1 minuto
const LIMIT = 500;
const MIN_HISTORY = 100;
const AUTO_BACKFILL_DAYS = 2;

const cache = new Map<string, { at: number; data: KlineData[] }>();
const inflight = new Map<string, Promise<KlineData[]>>();
const autoBackfilled = new Set<string>();

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
  const res = await fetch(`/api/market/history?symbol=${symbol}&interval=${INTERVAL}&limit=${LIMIT}`);
  if (!res.ok) throw new Error(`history ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json?.data)) throw new Error("history inválido");
  return { data: toKlines(json.data), stored: Number(json.stored ?? 0) };
}

async function loadRecent(symbol: string): Promise<KlineData[]> {
  const res = await fetch(`/api/market/klines?symbol=${symbol}&interval=${INTERVAL}&limit=100`);
  if (!res.ok) throw new Error(`klines ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json?.data)) throw new Error("klines inválido");
  return toKlines(json.data);
}

export async function getSymbolKlines(symbol: string): Promise<KlineData[]> {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const pending = inflight.get(symbol);
  if (pending) return pending;

  const request = (async () => {
    try {
      let data: KlineData[] = [];
      try {
        const recent = await loadRecent(symbol);
        if (recent.length >= 25) {
          data = recent;
        }
      } catch {
        // Fallback para histórico se loadRecent falhar
      }

      if (data.length < 25) {
        try {
          const h = await loadHistory(symbol);
          data = h.data;
        } catch {
          data = [];
        }
      }

      cache.set(symbol, { at: Date.now(), data });
      return data;
    } catch {
      // Em falha, usa o último dado conhecido (mesmo vencido) em vez de bloquear o robô.
      return cache.get(symbol)?.data ?? [];
    } finally {
      inflight.delete(symbol);
    }
  })();

  inflight.set(symbol, request);
  return request;
}
