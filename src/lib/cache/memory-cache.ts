/**
 * Utilitário de Cache em Memória com TTL e Singleflight (Promise Coalescing)
 * 
 * Evita repetição de consultas pesadas de banco (SQLite/Prisma) e previne
 * o problema de Cache Stampede / Thundering Herd quando múltiplos componentes
 * disparam polling quase simultaneamente.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private inflight = new Map<string, Promise<any>>();

  /**
   * Obtém um item do cache se ainda for válido.
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data as T;
  }

  /**
   * Armazena um item no cache com TTL em milissegundos.
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Invalida uma chave exata ou todas que casem com um padrão.
   */
  invalidate(keyOrPattern: string | RegExp): void {
    if (typeof keyOrPattern === 'string') {
      if (keyOrPattern.endsWith('*')) {
        const prefix = keyOrPattern.slice(0, -1);
        for (const k of this.cache.keys()) {
          if (k.startsWith(prefix)) {
            this.cache.delete(k);
          }
        }
      } else {
        this.cache.delete(keyOrPattern);
      }
    } else {
      for (const k of this.cache.keys()) {
        if (keyOrPattern.test(k)) {
          this.cache.delete(k);
        }
      }
    }
  }

  /**
   * Limpa todo o cache em memória.
   */
  clear(): void {
    this.cache.clear();
    this.inflight.clear();
  }

  /**
   * Obtém do cache ou executa o fetcher com Promise Coalescing (Singleflight).
   * Se múltiplas requisições chegarem simultaneamente para a mesma chave,
   * apenas UMA execução do fetcher ocorrerá, compartilhando o mesmo resultado.
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number
  ): Promise<{ data: T; isHit: boolean; durationMs: number }> {
    const start = performance.now();

    // 1. Tenta recuperar do cache válido
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return {
        data: cached,
        isHit: true,
        durationMs: Math.round(performance.now() - start),
      };
    }

    // 2. Se já existe uma Promise em andamento para esta chave, reutiliza-a (Singleflight)
    if (this.inflight.has(key)) {
      try {
        const data = await this.inflight.get(key)!;
        return {
          data,
          isHit: true, // Aproveitou o resultado da requisição concorrente
          durationMs: Math.round(performance.now() - start),
        };
      } catch (err) {
        // Se a inflight falhou, tenta executar individualmente
      }
    }

    // 3. Executa o fetcher e registra no inflight
    const fetchPromise = (async () => {
      try {
        const result = await fetcher();
        this.set(key, result, ttlMs);
        return result;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, fetchPromise);

    const data = await fetchPromise;
    return {
      data,
      isHit: false,
      durationMs: Math.round(performance.now() - start),
    };
  }
}

// Instância singleton global do cache em memória do backend
const globalCache = globalThis as unknown as {
  tradeAiMemoryCache: MemoryCache | undefined;
};

export const memoryCache = globalCache.tradeAiMemoryCache ?? new MemoryCache();

if (process.env.NODE_ENV !== 'production') {
  globalCache.tradeAiMemoryCache = memoryCache;
}
