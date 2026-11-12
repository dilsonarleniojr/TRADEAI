/**
 * In-Memory Stale-While-Revalidate (SWR) Cache
 * Provides high-speed responses (< 2ms) and resilient fault-tolerance
 * for external market and news endpoints (Binance REST, Alternative.me, RSS)
 * without ever resorting to mock or synthetic data.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const MAX_SWR_ENTRIES = 500;
const cacheStore = new Map<string, CacheEntry<any>>();

function setBoundedSWR(key: string, entry: CacheEntry<any>) {
  if (cacheStore.size >= MAX_SWR_ENTRIES && !cacheStore.has(key)) {
    const oldestKey = cacheStore.keys().next().value;
    if (oldestKey !== undefined) cacheStore.delete(oldestKey);
  }
  cacheStore.set(key, entry);
}

export async function fetchWithSWR<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = 30000 // 30 seconds default TTL
): Promise<{ data: T; cached: boolean }> {
  const existing = cacheStore.get(key);
  const now = Date.now();

  if (existing) {
    // Fresh cache hit
    if (now - existing.timestamp < ttlMs) {
      return { data: existing.data, cached: true };
    }

    // Stale cache hit: return existing data immediately and revalidate in background
    fetcher()
      .then((fresh) => {
        if (fresh !== undefined && fresh !== null) {
          setBoundedSWR(key, { data: fresh, timestamp: Date.now() });
        }
      })
      .catch((err) => {
        console.warn(`[SWR Cache] Background revalidation failed for ${key}:`, err?.message || err);
      });

    return { data: existing.data, cached: true };
  }

  // Initial fetch (cold cache)
  const fresh = await fetcher();
  setBoundedSWR(key, { data: fresh, timestamp: now });
  return { data: fresh, cached: false };
}

export function clearSWRCache(key?: string) {
  if (key) {
    cacheStore.delete(key);
  } else {
    cacheStore.clear();
  }
}
