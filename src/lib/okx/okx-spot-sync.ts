/**
 * Sincronizador Central de Pares e Cotações OKX Spot (V5 Public API)
 * Garante que todos os seletores, Auto-Screener e robôs na OKX operem
 * apenas pares Spot USDT ativos (`state === "live"`), excluindo stablecoins/fiat.
 */

import { fromOkxInstrument } from "./okx-client";
import { STABLE_PEGGED_AND_WRAPPED_BASES } from "@/lib/binance-spot-sync";
import type { TickerData } from "@/lib/store";

export interface OkxSpotSymbolMeta {
  symbol: string; // Formato canônico: "BTCUSDT"
  instId: string; // Formato OKX: "BTC-USDT"
  baseAsset: string;
  quoteAsset: string;
  state: string;
  lotSz: number;
  minSz: number;
  tickSz: number;
  maxMktAmt: number;
  category: string;
}

const REGISTRY_TTL_MS = 15 * 60 * 1000;
let cachedOkxRegistry: Map<string, OkxSpotSymbolMeta> | null = null;
let cachedAt = 0;

/**
 * Consulta GET /api/v5/public/instruments?instType=SPOT na OKX e constrói
 * o registro em memória dos pares Spot USDT ativos.
 */
export async function getVerifiedOkxSpotRegistry(
  forceRefresh = false
): Promise<Map<string, OkxSpotSymbolMeta>> {
  const now = Date.now();
  if (!forceRefresh && cachedOkxRegistry && now - cachedAt < REGISTRY_TTL_MS) {
    return cachedOkxRegistry;
  }

  const res = await fetch("https://www.okx.com/api/v5/public/instruments?instType=SPOT", {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`OKX instruments retornou HTTP ${res.status}`);
  }

  const json = await res.json();
  if (String(json?.code) !== "0" || !Array.isArray(json?.data)) {
    throw new Error(`Resposta inválida da OKX instruments: ${json?.msg || "formato inesperado"}`);
  }

  const nextMap = new Map<string, OkxSpotSymbolMeta>();
  for (const item of json.data) {
    const instId = String(item?.instId || "").toUpperCase();
    const baseAsset = String(item?.baseCcy || "").toUpperCase();
    const quoteAsset = String(item?.quoteCcy || "").toUpperCase();
    const state = String(item?.state || "").toLowerCase();

    if (quoteAsset !== "USDT" || state !== "live" || !baseAsset) continue;
    if (STABLE_PEGGED_AND_WRAPPED_BASES.has(baseAsset)) continue;

    const canonical = fromOkxInstrument(instId);
    if (!canonical.endsWith("USDT")) continue;

    nextMap.set(canonical, {
      symbol: canonical,
      instId,
      baseAsset,
      quoteAsset,
      state,
      lotSz: parseFloat(item?.lotSz || "0.000001") || 0.000001,
      minSz: parseFloat(item?.minSz || "0.00001") || 0.00001,
      tickSz: parseFloat(item?.tickSz || "0.0001") || 0.0001,
      maxMktAmt: parseFloat(item?.maxMktAmt || "0") || 0,
      category: String(item?.category || "1"),
    });
  }

  cachedOkxRegistry = nextMap;
  cachedAt = now;
  return nextMap;
}

/**
 * Busca todos os tickers Spot 24h da OKX (`GET /api/v5/market/tickers?instType=SPOT`)
 * normalizados para o formato canônico `TickerData` do TradeAI.
 */
export async function fetchOkxSpotTickers(): Promise<Record<string, TickerData>> {
  const res = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT", {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`OKX tickers retornou HTTP ${res.status}`);
  }

  const json = await res.json();
  if (String(json?.code) !== "0" || !Array.isArray(json?.data)) {
    throw new Error(`Resposta inválida da OKX tickers: ${json?.msg || "formato inesperado"}`);
  }

  const out: Record<string, TickerData> = {};
  for (const item of json.data) {
    const instId = String(item?.instId || "").toUpperCase();
    if (!instId.endsWith("-USDT")) continue;

    const base = instId.slice(0, -5);
    if (!base || STABLE_PEGGED_AND_WRAPPED_BASES.has(base)) continue;

    const symbol = fromOkxInstrument(instId);
    const last = parseFloat(item?.last || "0") || 0;
    const open24h = parseFloat(item?.open24h || "0") || 0;
    const high = parseFloat(item?.high24h || "0") || last;
    const low = parseFloat(item?.low24h || "0") || last;
    const volume = parseFloat(item?.vol24h || "0") || 0;
    const quoteVolume = parseFloat(item?.volCcy24h || "0") || 0;
    const priceChange = open24h > 0 ? last - open24h : 0;
    const priceChangePercent = open24h > 0 ? (priceChange / open24h) * 100 : 0;

    if (last <= 0) continue;

    out[symbol] = {
      symbol,
      price: last,
      priceChange,
      priceChangePercent,
      high,
      low,
      volume,
      quoteVolume,
    };
  }

  return out;
}

/** Verifica se o par existe ativo no mercado Spot USDT da OKX. */
export function isTradableOkxSpotSymbol(
  symbol: string,
  registry: Map<string, OkxSpotSymbolMeta> | null
): boolean {
  if (!registry || registry.size === 0) return true;
  const clean = symbol.trim().toUpperCase();
  const canonical = clean.includes("-") ? fromOkxInstrument(clean) : clean;
  return registry.has(canonical);
}
