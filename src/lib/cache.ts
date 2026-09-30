/**
 * Intelligent cache with TTL (Time-To-Live) management.
 * Used for market data to avoid hammering the Binance API.
 *
 * TTL Defaults:
 * - Prices:    2 seconds  (real-time critical)
 * - Highlights: 15 seconds
 * - Sentiment:  60 seconds
 * - Heatmap:    60 seconds
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds
}

// Predefined TTL constants (ms)
export const CACHE_TTL = {
  PRICES: 2_000,
  KLINES: 5_000,
  HIGHLIGHTS: 15_000,
  TICKER_FULL: 30_000,
  SENTIMENT: 60_000,
  HEATMAP: 60_000,
  ORDER_BOOK: 3_000,
  NEWS: 120_000,
} as const;

const cacheStore = new Map<string, CacheEntry<any>>();

/**
 * Check if a cache entry is stale (past its TTL).
 */
export function isStale<T>(entry: CacheEntry<T> | undefined): boolean {
  if (!entry) return true;
  return Date.now() - entry.timestamp > entry.ttl;
}

/**
 * Get cached data or fetch fresh data using the provided fetcher.
 * Prevents duplicate concurrent fetches for the same key.
 */
const inflightRequests = new Map<string, Promise<any>>();

export async function getOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number
): Promise<T> {
  // Check cache first
  const cached = cacheStore.get(key);
  if (cached && !isStale(cached)) {
    return cached.data as T;
  }

  // Check if there's already an inflight request for this key
  const inflight = inflightRequests.get(key);
  if (inflight) {
    return inflight as Promise<T>;
  }

  // Fetch fresh data
  const promise = fetcher()
    .then((data) => {
      cacheStore.set(key, { data, timestamp: Date.now(), ttl });
      inflightRequests.delete(key);
      return data;
    })
    .catch((err) => {
      inflightRequests.delete(key);
      // Return stale data if available
      if (cached) {
        console.warn(`[Cache] Fetch failed for "${key}", returning stale data`);
        return cached.data as T;
      }
      throw err;
    });

  inflightRequests.set(key, promise);
  return promise;
}

/**
 * Manually set cache data (useful for WebSocket-pushed data).
 */
export function setCache<T>(key: string, data: T, ttl: number): void {
  cacheStore.set(key, { data, timestamp: Date.now(), ttl });
}

/**
 * Invalidate a specific cache key.
 */
export function invalidateCache(key: string): void {
  cacheStore.delete(key);
}

/**
 * Clear all cached data.
 */
export function clearAllCache(): void {
  cacheStore.clear();
}

/**
 * Get cache stats (for debugging).
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: cacheStore.size,
    keys: Array.from(cacheStore.keys()),
  };
}
