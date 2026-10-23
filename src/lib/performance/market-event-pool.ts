/**
 * MarketEventPool - Pool de Objetos Pré-alocados para Eventos de Mercado
 * 
 * - Evita alocação contínua de objetos no Heap a cada tick do WebSocket.
 * - Reduz drasticamente pausas de Garbage Collector (GC pauses) durante surtos de volatilidade.
 * - Oferece reciclagem garantida via acquire() e release().
 */

export interface PooledTickerEvent {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
  timestamp: number;
  _inUse: boolean;
}

export interface PooledTradeEvent {
  id: string;
  symbol: string;
  price: number;
  quantity: number;
  side: "BUY" | "SELL";
  timestamp: number;
  _inUse: boolean;
}

export class MarketEventPool {
  private tickerPool: PooledTickerEvent[] = [];
  private tradePool: PooledTradeEvent[] = [];

  private totalAllocatedTickers = 0;
  private totalAllocatedTrades = 0;

  constructor(initialTickerCapacity = 200, initialTradeCapacity = 200) {
    this.expandTickerPool(initialTickerCapacity);
    this.expandTradePool(initialTradeCapacity);
  }

  private expandTickerPool(size: number): void {
    for (let i = 0; i < size; i++) {
      this.tickerPool.push({
        symbol: "",
        price: 0,
        priceChange: 0,
        priceChangePercent: 0,
        high: 0,
        low: 0,
        volume: 0,
        quoteVolume: 0,
        timestamp: 0,
        _inUse: false,
      });
      this.totalAllocatedTickers++;
    }
  }

  private expandTradePool(size: number): void {
    for (let i = 0; i < size; i++) {
      this.tradePool.push({
        id: "",
        symbol: "",
        price: 0,
        quantity: 0,
        side: "BUY",
        timestamp: 0,
        _inUse: false,
      });
      this.totalAllocatedTrades++;
    }
  }

  /**
   * Obtém uma instância limpa de TickerEvent reutilizando um nó existente da memória.
   */
  acquireTicker(
    symbol: string,
    price: number,
    priceChange: number,
    priceChangePercent: number,
    high: number,
    low: number,
    volume: number,
    quoteVolume: number,
    timestamp: number
  ): PooledTickerEvent {
    let item = this.tickerPool.pop();
    if (!item) {
      this.expandTickerPool(50);
      item = this.tickerPool.pop()!;
    }

    item.symbol = symbol;
    item.price = price;
    item.priceChange = priceChange;
    item.priceChangePercent = priceChangePercent;
    item.high = high;
    item.low = low;
    item.volume = volume;
    item.quoteVolume = quoteVolume;
    item.timestamp = timestamp;
    item._inUse = true;

    return item;
  }

  /**
   * Devolve a instância do TickerEvent para o pool de reciclagem.
   */
  releaseTicker(event: PooledTickerEvent): void {
    if (!event._inUse) return;
    event._inUse = false;
    event.symbol = "";
    this.tickerPool.push(event);
  }

  /**
   * Obtém uma instância limpa de TradeEvent.
   */
  acquireTrade(
    id: string,
    symbol: string,
    price: number,
    quantity: number,
    side: "BUY" | "SELL",
    timestamp: number
  ): PooledTradeEvent {
    let item = this.tradePool.pop();
    if (!item) {
      this.expandTradePool(50);
      item = this.tradePool.pop()!;
    }

    item.id = id;
    item.symbol = symbol;
    item.price = price;
    item.quantity = quantity;
    item.side = side;
    item.timestamp = timestamp;
    item._inUse = true;

    return item;
  }

  /**
   * Devolve a instância do TradeEvent para o pool.
   */
  releaseTrade(event: PooledTradeEvent): void {
    if (!event._inUse) return;
    event._inUse = false;
    event.id = "";
    event.symbol = "";
    this.tradePool.push(event);
  }

  /**
   * Métricas de uso de memória do pool.
   */
  getMetrics() {
    return {
      availableTickers: this.tickerPool.length,
      totalAllocatedTickers: this.totalAllocatedTickers,
      inUseTickers: this.totalAllocatedTickers - this.tickerPool.length,
      availableTrades: this.tradePool.length,
      totalAllocatedTrades: this.totalAllocatedTrades,
      inUseTrades: this.totalAllocatedTrades - this.tradePool.length,
    };
  }

  /**
   * Limpa referências retidas.
   */
  reset(): void {
    this.tickerPool.length = 0;
    this.tradePool.length = 0;
    this.totalAllocatedTickers = 0;
    this.totalAllocatedTrades = 0;
  }
}

// Instância global única compartilhada
export const globalMarketEventPool = new MarketEventPool(250, 250);
