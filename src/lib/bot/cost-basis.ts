import { useCryptoStore } from "@/lib/store";

export interface CostBasisResult {
  symbol: string;
  mode: string;
  costKnown: boolean;
  avgBuyPrice: number;
  openQuantity: number;
  totalCost: number;
  lastBuyPrice: number;
  lastBuyTime: string | null;
  tradesCount: number;
  buyTradesCount: number;
}

// Cache local em memória para evitar requisições repetitivas a cada tick
const costBasisCache = new Map<string, { data: CostBasisResult; at: number }>();
const CACHE_TTL_MS = 30_000; // 30 segundos

/**
 * Consulta a base de custo e o preço médio ponderado real de compra no banco de dados SQLite.
 * Se em modo live, sincroniza automaticamente com o histórico de execuções da Binance.
 */
export async function getCostBasisForSymbol(symbol: string, mode: "paper" | "live"): Promise<CostBasisResult | null> {
  const cleanSym = symbol.trim().toUpperCase();
  const fullSymbol = cleanSym.endsWith("USDT") ? cleanSym : `${cleanSym}USDT`;
  const cacheKey = `${fullSymbol}_${mode}`;

  const cached = costBasisCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const res = await fetch(`/api/trades/cost-basis?symbol=${fullSymbol}&mode=${mode}`, {
      cache: "no-store",
    });

    if (!res.ok) return null;
    const json = await res.json();
    if (json.success && json.data) {
      const data: CostBasisResult = json.data;
      costBasisCache.set(cacheKey, { data, at: Date.now() });
      return data;
    }
  } catch (err: any) {
    console.warn(`[CostBasis] Erro ao buscar base de custo para ${fullSymbol}:`, err.message);
  }

  return null;
}
