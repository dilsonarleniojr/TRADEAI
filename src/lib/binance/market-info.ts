import type { FetchLike } from "@/lib/binance/order-submit";

// Filtros e preço do símbolo para ordens reais. Falha fechada: sem dado real da Binance,
// a ordem não é montada (antes eram usados valores padrão, que geravam quantidade/preço errados).

export interface SymbolFilters {
  stepSize: number;
  minQty: number;
  tickSize: number;
  minNotional: number;
  quoteOrderQtyAllowed: boolean;
}

// Quando o símbolo não tem filtro NOTIONAL/MIN_NOTIONAL, mantém o piso usado antes desta mudança.
const DEFAULT_MIN_NOTIONAL = 5.0;

function fail(code: string, message: string): never {
  const err: any = new Error(message);
  err.code = code;
  throw err;
}

function positive(value: unknown): number | null {
  const n = parseFloat(String(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function fetchSymbolFilters(
  baseUrl: string,
  symbol: string,
  fetchImpl: FetchLike = fetch as FetchLike
): Promise<SymbolFilters> {
  const unavailable = (detail: string) =>
    fail(
      "FILTERS_UNAVAILABLE",
      `Não foi possível obter os filtros de negociação de ${symbol} na Binance (${detail}). Ordem não enviada; tente novamente.`
    );

  let info: any;
  try {
    const res = await fetchImpl(`${baseUrl}/api/v3/exchangeInfo?symbol=${symbol}`);
    if (!res.ok) unavailable(`HTTP ${res.status}`);
    info = await res.json();
  } catch (err: any) {
    if (err?.code === "FILTERS_UNAVAILABLE") throw err;
    unavailable(err?.message || "erro de rede");
  }

  const symbolInfo = info?.symbols?.[0];
  if (!symbolInfo) unavailable("símbolo não encontrado");

  const filters: any[] = symbolInfo.filters || [];
  const lot = filters.find((f) => f.filterType === "LOT_SIZE");
  const price = filters.find((f) => f.filterType === "PRICE_FILTER");
  const notional = filters.find((f) => f.filterType === "NOTIONAL" || f.filterType === "MIN_NOTIONAL");

  const stepSize = positive(lot?.stepSize);
  const tickSize = positive(price?.tickSize);
  if (stepSize === null) unavailable("LOT_SIZE ausente ou inválido");
  if (tickSize === null) unavailable("PRICE_FILTER ausente ou inválido");

  return {
    stepSize: stepSize as number,
    minQty: positive(lot.minQty) ?? (stepSize as number),
    tickSize: tickSize as number,
    minNotional: positive(notional?.minNotional) ?? DEFAULT_MIN_NOTIONAL,
    quoteOrderQtyAllowed: !!symbolInfo.quoteOrderQtyMarketAllowed,
  };
}

export async function fetchCurrentPrice(
  baseUrl: string,
  symbol: string,
  fetchImpl: FetchLike = fetch as FetchLike
): Promise<number> {
  const unavailable = (detail: string) =>
    fail(
      "PRICE_UNAVAILABLE",
      `Não foi possível obter o preço atual de ${symbol} na Binance (${detail}). Ordem não enviada; tente novamente.`
    );

  let data: any;
  try {
    const res = await fetchImpl(`${baseUrl}/api/v3/ticker/price?symbol=${symbol}`);
    if (!res.ok) unavailable(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err: any) {
    if (err?.code === "PRICE_UNAVAILABLE") throw err;
    unavailable(err?.message || "erro de rede");
  }

  const p = positive(data?.price);
  if (p === null) unavailable("preço inválido");
  return p as number;
}
