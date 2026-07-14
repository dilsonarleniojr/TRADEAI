/**
 * Sniper Engine (Maker-Only Mode)
 * Posta limite 1 tick à frente do best bid/ask.
 * Cancela e reposiciona se ultrapassado pela concorrência.
 */

export interface SniperConfig {
  symbol: string;
  side: "BUY" | "SELL";
  targetVolume: number;
  shadowMode: boolean;
  maxRepositions: number;
}

export interface BookTop {
  bestBid: number;
  bestAsk: number;
  tickSize: number; // min price increment
}

export interface SniperState {
  postPrice: number;
  repositions: number;
  executed: number;
  totalVolume: number;
  status: "WAITING" | "POSTED" | "FILLED" | "CANCELLED";
}

export class SniperEngine {
  private state: SniperState;
  private config: SniperConfig;

  constructor(config: SniperConfig) {
    this.config = config;
    this.state = {
      postPrice: 0,
      repositions: 0,
      executed: 0,
      totalVolume: 0,
      status: "WAITING",
    };
  }

  /**
   * Tick chamado a cada update do book.
   * Retorna nova postPrice se precisa reposicionar.
   */
  tick(book: BookTop): { action: "POST" | "REPOST" | "HOLD" | "DONE"; price: number } {
    const { side } = this.config;

    // Target: 1 tick à frente do best price
    const targetPrice =
      side === "BUY"
        ? book.bestBid + book.tickSize   // 1 tick acima do best bid (mais competitivo)
        : book.bestAsk - book.tickSize;  // 1 tick abaixo do best ask

    // Se preço atual coincide com target → manter (HOLD)
    if (Math.abs(this.state.postPrice - targetPrice) < book.tickSize * 0.5) {
      return { action: "HOLD", price: this.state.postPrice };
    }

    // Se superado pela concorrência → reposicionar
    if (this.state.status === "POSTED" && this.state.repositions < this.config.maxRepositions) {
      this.state.repositions++;
      this.state.postPrice = targetPrice;
      return { action: "REPOST", price: targetPrice };
    }

    // Post inicial
    if (this.state.status === "WAITING") {
      this.state.postPrice = targetPrice;
      this.state.status = "POSTED";
      return { action: "POST", price: targetPrice };
    }

    return { action: "HOLD", price: this.state.postPrice };
  }

  /** Simulação de fill (chamado quando exchange confirma execução) */
  onFill(filledVolume: number, price: number): void {
    this.state.executed++;
    this.state.totalVolume += filledVolume;
    if (this.state.totalVolume >= this.config.targetVolume) {
      this.state.status = "FILLED";
    }
  }

  getState(): SniperState { return this.state; }
}
