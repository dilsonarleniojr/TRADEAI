/**
 * Smart Grid Trading Engine com Trailing Grid automático.
 * Range: posiciona ordens em malha entre upperBound e lowerBound.
 * Trailing: quando price > upperBound, arrasta toda a malha para cima.
 */

export interface GridConfig {
  upperBound: number;
  lowerBound: number;
  gridLevels: number;
  trailingEnabled: boolean;
  shadowMode: boolean;
}

export interface GridLevel {
  price: number;
  side: "BUY" | "SELL";
  filled: boolean;
  orderId?: string;
}

export interface GridState {
  config: GridConfig;
  levels: GridLevel[];
  lastShift: number;      // timestamp da última reconfiguração
  totalPnl: number;
  cyclesCompleted: number;
}

export class SmartGridEngine {
  private state: GridState;

  constructor(config: GridConfig) {
    this.state = {
      config,
      levels: this.buildLevels(config),
      lastShift: Date.now(),
      totalPnl: 0,
      cyclesCompleted: 0,
    };
  }

  private buildLevels(config: GridConfig): GridLevel[] {
    const { upperBound, lowerBound, gridLevels } = config;
    const step = (upperBound - lowerBound) / gridLevels;
    const levels: GridLevel[] = [];
    for (let i = 0; i <= gridLevels; i++) {
      const price = lowerBound + step * i;
      levels.push({
        price: Math.round(price * 100) / 100,
        side: i < gridLevels / 2 ? "BUY" : "SELL",
        filled: false,
      });
    }
    return levels;
  }

  /** Chamado a cada tick: processa preço atual e detecta fills */
  tick(currentPrice: number): { filled: GridLevel[]; shifted: boolean; state: GridState } {
    const filled: GridLevel[] = [];
    let shifted = false;

    // Trailing Grid: se preço romper o teto, arrasta a malha inteira
    if (this.state.config.trailingEnabled && currentPrice > this.state.config.upperBound) {
      const range = this.state.config.upperBound - this.state.config.lowerBound;
      this.state.config.upperBound = currentPrice + range * 0.1;
      this.state.config.lowerBound = currentPrice - range * 0.9;
      this.state.levels = this.buildLevels(this.state.config);
      this.state.lastShift = Date.now();
      shifted = true;
    }

    // Simula preenchimentos
    for (const level of this.state.levels) {
      if (level.filled) continue;
      if (level.side === "BUY" && currentPrice <= level.price) {
        level.filled = true;
        filled.push(level);
      } else if (level.side === "SELL" && currentPrice >= level.price) {
        level.filled = true;
        filled.push(level);
        this.state.cyclesCompleted++;
      }
    }

    return { filled, shifted, state: this.state };
  }

  getState(): GridState {
    return this.state;
  }

  /** Recalcula malha em novo range (ex: regime mudou) */
  reconfigure(newConfig: Partial<GridConfig>): void {
    this.state.config = { ...this.state.config, ...newConfig };
    this.state.levels = this.buildLevels(this.state.config);
    this.state.lastShift = Date.now();
  }
}
