import type { FetchLike } from "@/lib/binance/order-submit";

// Janela de validade das requisições assinadas. Doc oficial (General API Information → Timing security):
// padrão 5000 ms, máximo 60000 ms, recomendado 5000 ou menos. Usamos 10000 com relógio sincronizado.
export const BINANCE_RECV_WINDOW_MS = 10000;

const RESYNC_INTERVAL_MS = 30 * 60 * 1000;
const offsets = new Map<string, { offsetMs: number; syncedAt: number }>();

/** Limpa o offset salvo (todos os ambientes ou um), forçando nova sincronização. Útil após erro -1021. */
export function resetBinanceTimeSync(baseUrl?: string): void {
  if (baseUrl) offsets.delete(baseUrl);
  else offsets.clear();
}

/**
 * Timestamp para requisições assinadas, corrigido pelo offset em relação a GET /api/v3/time.
 * Sincroniza a cada 30 min por ambiente. Se a consulta falhar, mantém o último offset (ou 0).
 */
export async function getBinanceTimestamp(
  baseUrl: string,
  fetchImpl: FetchLike = fetch as FetchLike,
  now: () => number = Date.now
): Promise<number> {
  const cached = offsets.get(baseUrl);
  const start = now();

  if (!cached || start - cached.syncedAt > RESYNC_INTERVAL_MS) {
    try {
      const res = await fetchImpl(`${baseUrl}/api/v3/time`, { signal: AbortSignal.timeout(2500), cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.serverTime === "number") {
          offsets.set(baseUrl, { offsetMs: data.serverTime - start, syncedAt: start });
        }
      }
    } catch (e: any) {
      console.warn("[Binance Time Sync] Falha ao consultar o horário da Binance:", e?.message || e);
    }
  }

  return now() + (offsets.get(baseUrl)?.offsetMs ?? 0);
}
