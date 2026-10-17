import { PreciseMath } from "./precise-math";

export interface SymbolFilters {
  symbol: string;
  minQty: number;
  maxQty: number;
  stepSize: number;
  minPrice: number;
  maxPrice: number;
  tickSize: number;
  minNotional: number;
  baseAsset: string;
  quoteAsset: string;
  status: string;
}

export class ExchangeMetadataService {
  private static instance: ExchangeMetadataService;
  private cache: Map<string, SymbolFilters> = new Map();
  private lastFetchTime: number = 0;
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora de TTL

  private constructor() {}

  public static getInstance(): ExchangeMetadataService {
    if (!ExchangeMetadataService.instance) {
      ExchangeMetadataService.instance = new ExchangeMetadataService();
    }
    return ExchangeMetadataService.instance;
  }

  /**
   * Fornece filtros pré-carregados para testes locais ou offline
   */
  public setMockFilters(symbol: string, filters: SymbolFilters): void {
    this.cache.set(symbol.toUpperCase(), filters);
  }

  /**
   * Obtém filtros para um símbolo, buscando da Binance se necessário
   */
  public async getSymbolFilters(symbol: string, baseUrl = "https://api.binance.com"): Promise<SymbolFilters> {
    const sym = symbol.toUpperCase();
    const now = Date.now();

    if (this.cache.has(sym) && now - this.lastFetchTime < this.CACHE_TTL_MS) {
      return this.cache.get(sym)!;
    }

    try {
      const res = await fetch(`${baseUrl}/api/v3/exchangeInfo?symbol=${sym}`, {
        signal: AbortSignal.timeout(5000),
        headers: { "Cache-Control": "no-cache" },
      });

      if (!res.ok) {
        throw new Error(`Falha HTTP ${res.status} ao consultar exchangeInfo para ${sym}`);
      }

      const data = await res.json();
      const symbolData = data.symbols?.find((s: any) => s.symbol === sym) || data.symbols?.[0];

      if (!symbolData) {
        throw new Error(`Símbolo ${sym} não encontrado no exchangeInfo retornado`);
      }

      const lotFilter = symbolData.filters.find((f: any) => f.filterType === "LOT_SIZE") || {};
      const priceFilter = symbolData.filters.find((f: any) => f.filterType === "PRICE_FILTER") || {};
      const notionalFilter =
        symbolData.filters.find((f: any) => f.filterType === "NOTIONAL" || f.filterType === "MIN_NOTIONAL") || {};

      const parsedFilters: SymbolFilters = {
        symbol: sym,
        minQty: parseFloat(lotFilter.minQty || "0.00001"),
        maxQty: parseFloat(lotFilter.maxQty || "9000"),
        stepSize: parseFloat(lotFilter.stepSize || "0.00001"),
        minPrice: parseFloat(priceFilter.minPrice || "0.01"),
        maxPrice: parseFloat(priceFilter.maxPrice || "1000000"),
        tickSize: parseFloat(priceFilter.tickSize || "0.01"),
        minNotional: parseFloat(notionalFilter.minNotional || "5.0"),
        baseAsset: symbolData.baseAsset,
        quoteAsset: symbolData.quoteAsset,
        status: symbolData.status,
      };

      this.cache.set(sym, parsedFilters);
      this.lastFetchTime = now;
      return parsedFilters;
    } catch (err: any) {
      // Se falhar e tivermos em cache, usa cache
      if (this.cache.has(sym)) {
        console.warn(`[ExchangeMetadataService] Erro ao atualizar exchangeInfo. Usando cache para ${sym}:`, err.message);
        return this.cache.get(sym)!;
      }

      // Fallbacks institucionais padrão para pares do piloto
      const defaultFilters = this.getDefaultFallbackFilters(sym);
      this.cache.set(sym, defaultFilters);
      return defaultFilters;
    }
  }

  /**
   * Sanitiza e trunca quantidade para conformidade absoluta com o LOT_SIZE
   */
  public quantizeQuantity(quantity: number, filters: SymbolFilters): number {
    const truncated = PreciseMath.quantizeLotDown(quantity, filters.stepSize);
    return Math.max(filters.minQty, Math.min(filters.maxQty, truncated));
  }

  /**
   * Trunca preço para conformidade absoluta com o PRICE_FILTER
   */
  public quantizePrice(price: number, filters: SymbolFilters): number {
    return PreciseMath.quantizePriceDown(price, filters.tickSize);
  }

  /**
   * Fallback institucional caso a exchange esteja temporariamente inacessível
   */
  private getDefaultFallbackFilters(symbol: string): SymbolFilters {
    if (symbol === "BTCUSDT") {
      return {
        symbol: "BTCUSDT",
        minQty: 0.00001,
        maxQty: 9000,
        stepSize: 0.00001,
        minPrice: 0.01,
        maxPrice: 1000000,
        tickSize: 0.01,
        minNotional: 5.0,
        baseAsset: "BTC",
        quoteAsset: "USDT",
        status: "TRADING",
      };
    }
    if (symbol === "SOLUSDT") {
      return {
        symbol: "SOLUSDT",
        minQty: 0.01,
        maxQty: 90000,
        stepSize: 0.01,
        minPrice: 0.01,
        maxPrice: 100000,
        tickSize: 0.01,
        minNotional: 5.0,
        baseAsset: "SOL",
        quoteAsset: "USDT",
        status: "TRADING",
      };
    }
    return {
      symbol,
      minQty: 0.001,
      maxQty: 1000000,
      stepSize: 0.001,
      minPrice: 0.0001,
      maxPrice: 100000,
      tickSize: 0.0001,
      minNotional: 5.0,
      baseAsset: symbol.replace("USDT", ""),
      quoteAsset: "USDT",
      status: "TRADING",
    };
  }
}
