/**
 * Smart DCA Engine — Dollar Cost Averaging Dinâmico
 * Só executa o aporte semanal se RSI no D1 estiver sobrevendido (<40).
 * Guarda aportes em fila se mercado sobrecomprado (RSI >60).
 */

export interface DCAConfig {
  symbol: string;
  weeklyAmount: number;          // $ por semana
  rsiBuyThreshold: number;       // default 40 (sobrevendido)
  rsiHoldThreshold: number;      // default 60 (sobrecomprado = guardar)
  shadowMode: boolean;
}

export interface DCAState {
  pendingAmount: number;         // acumulado aguardando janela
  totalDeployed: number;
  totalSkipped: number;
  lastExecutionAt: number;
  avgCostBasis: number;
  totalUnits: number;
}

export class SmartDCAEngine {
  private config: DCAConfig;
  private state: DCAState;

  constructor(config: DCAConfig) {
    this.config = config;
    this.state = {
      pendingAmount: 0,
      totalDeployed: 0,
      totalSkipped: 0,
      lastExecutionAt: 0,
      avgCostBasis: 0,
      totalUnits: 0,
    };
  }

  /**
   * Chamado semanalmente para verificar se deve aportar.
   * @returns "EXECUTE" | "HOLD" | "QUEUE"
   */
  weeklyCheck(
    currentRSI: number,
    currentPrice: number
  ): { action: "EXECUTE" | "HOLD" | "QUEUE"; amount: number; reason: string } {
    const amount = this.config.weeklyAmount + this.state.pendingAmount;

    if (currentRSI < this.config.rsiBuyThreshold) {
      // Condição favorável: executa aporte acumulado
      const units = amount / currentPrice;
      const newTotal = this.state.totalUnits + units;
      this.state.avgCostBasis =
        (this.state.avgCostBasis * this.state.totalUnits + currentPrice * units) / newTotal;
      this.state.totalUnits = newTotal;
      this.state.totalDeployed += amount;
      this.state.pendingAmount = 0;
      this.state.lastExecutionAt = Date.now();

      return {
        action: "EXECUTE",
        amount,
        reason: `RSI ${currentRSI.toFixed(1)} < ${this.config.rsiBuyThreshold} — sobrevendido. Aportando $${amount.toFixed(2)}`,
      };
    }

    if (currentRSI > this.config.rsiHoldThreshold) {
      // Mercado esticado: guardar o aporte desta semana
      this.state.pendingAmount += this.config.weeklyAmount;
      this.state.totalSkipped += this.config.weeklyAmount;

      return {
        action: "QUEUE",
        amount: this.config.weeklyAmount,
        reason: `RSI ${currentRSI.toFixed(1)} > ${this.config.rsiHoldThreshold} — sobrecomprado. Guardando $${this.config.weeklyAmount}`,
      };
    }

    // RSI neutro: aporta apenas o valor da semana (sem acumulado)
    const units = this.config.weeklyAmount / currentPrice;
    this.state.totalUnits += units;
    this.state.totalDeployed += this.config.weeklyAmount;
    this.state.lastExecutionAt = Date.now();

    return {
      action: "EXECUTE",
      amount: this.config.weeklyAmount,
      reason: `RSI ${currentRSI.toFixed(1)} — neutro. Aporte semanal normal.`,
    };
  }

  getState(): DCAState { return this.state; }
}
