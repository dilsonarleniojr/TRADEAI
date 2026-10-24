import { PreciseMath } from "../bot/pilot/precise-math";

export interface AssetHolding {
  symbol: string;
  quantity: number;
  currentPrice: number;
  currentValueUsd: number;
  currentWeight: number; // 0 to 1
}

export interface TargetWeight {
  symbol: string;
  targetWeight: number; // 0 to 1, soma deve ser 1.0
}

export interface RebalanceAction {
  symbol: string;
  action: "BUY" | "SELL" | "HOLD";
  deltaValueUsd: number;
  suggestedQuantity: number;
  currentWeight: number;
  targetWeight: number;
  driftPercent: number;
  estimatedFeeUsd: number;
}

export interface RebalancePlan {
  totalPortfolioValueUsd: number;
  isRebalanceNeeded: boolean;
  maxDriftPercent: number;
  actions: RebalanceAction[];
  totalTurnoverUsd: number;
  estimatedTotalFeesUsd: number;
}

export interface MonteCarloProjection {
  days: number;
  simulatedPaths: number;
  p10ValueUsd: number;
  p50ValueUsd: number;
  p90ValueUsd: number;
  expectedReturnPercent: number;
  probabilityOfProfitPercent: number;
}

/**
 * Motor Institucional de Smart Portfolio & Rebalanceamento Dinâmico
 */
export class SmartPortfolioEngine {
  private static readonly DEFAULT_FEE_RATE = 0.001; // 0.10% Binance Spot
  private static readonly MIN_NOTIONAL_USD = 10.0;  // Filtro minNotional da Binance

  /**
   * Avalia a distribuição atual de ativos e gera um plano de rebalanceamento
   * minimizando custos operacionais e turnover desnecessário.
   */
  public static evaluateRebalance(
    holdings: AssetHolding[],
    targetWeights: TargetWeight[],
    driftTolerance = 0.05 // 5% de tolerância
  ): RebalancePlan {
    const totalPortfolioValueUsd = holdings.reduce(
      (acc, h) => acc + (h.quantity * h.currentPrice),
      0
    );

    if (totalPortfolioValueUsd <= 0) {
      return {
        totalPortfolioValueUsd: 0,
        isRebalanceNeeded: false,
        maxDriftPercent: 0,
        actions: [],
        totalTurnoverUsd: 0,
        estimatedTotalFeesUsd: 0,
      };
    }

    const holdingMap = new Map<string, AssetHolding>();
    for (const h of holdings) {
      holdingMap.set(h.symbol, h);
    }

    const actions: RebalanceAction[] = [];
    let maxDrift = 0;
    let isRebalanceNeeded = false;
    let totalTurnoverUsd = 0;
    let estimatedTotalFeesUsd = 0;

    for (const target of targetWeights) {
      const holding = holdingMap.get(target.symbol);
      const currentQty = holding ? holding.quantity : 0;
      const price = holding ? holding.currentPrice : 0;
      const currentVal = currentQty * price;
      const currentWeight = currentVal / totalPortfolioValueUsd;

      const targetVal = totalPortfolioValueUsd * target.targetWeight;
      const deltaVal = targetVal - currentVal;
      const drift = Math.abs(currentWeight - target.targetWeight);

      if (drift > maxDrift) {
        maxDrift = drift;
      }

      const driftPercent = PreciseMath.round(drift * 100, 2);

      let actionType: "BUY" | "SELL" | "HOLD" = "HOLD";
      let suggestedQty = 0;
      let fee = 0;

      // Se o desvio relativo ultrapassar a tolerância configurada e o valor nocional for relevante
      if (drift >= driftTolerance && Math.abs(deltaVal) >= this.MIN_NOTIONAL_USD && price > 0) {
        isRebalanceNeeded = true;
        if (deltaVal > 0) {
          actionType = "BUY";
          suggestedQty = PreciseMath.roundDown(deltaVal / price, 6);
        } else {
          actionType = "SELL";
          suggestedQty = PreciseMath.roundDown(Math.abs(deltaVal) / price, 6);
        }

        const turnover = Math.abs(deltaVal);
        fee = turnover * this.DEFAULT_FEE_RATE;
        totalTurnoverUsd += turnover;
        estimatedTotalFeesUsd += fee;
      }

      actions.push({
        symbol: target.symbol,
        action: actionType,
        deltaValueUsd: PreciseMath.round(deltaVal, 2),
        suggestedQuantity: suggestedQty,
        currentWeight: PreciseMath.round(currentWeight, 4),
        targetWeight: PreciseMath.round(target.targetWeight, 4),
        driftPercent,
        estimatedFeeUsd: PreciseMath.round(fee, 2),
      });
    }

    return {
      totalPortfolioValueUsd: PreciseMath.round(totalPortfolioValueUsd, 2),
      isRebalanceNeeded,
      maxDriftPercent: PreciseMath.round(maxDrift * 100, 2),
      actions,
      totalTurnoverUsd: PreciseMath.round(totalTurnoverUsd, 2),
      estimatedTotalFeesUsd: PreciseMath.round(estimatedTotalFeesUsd, 2),
    };
  }

  /**
   * Simulação Monte Carlo para Projeção de Crescimento do Portfólio (ex: 30 dias).
   * Utiliza Movimento Browniano Geométrico com drift diário e volatilidade histórica.
   */
  public static projectGrowth(
    initialValueUsd: number,
    annualizedReturn = 0.25,     // 25% a.a. estimado
    annualizedVolatility = 0.45, // 45% a.a. de volatilidade cripto típica
    days = 30,
    paths = 500
  ): MonteCarloProjection {
    if (initialValueUsd <= 0) {
      return {
        days,
        simulatedPaths: paths,
        p10ValueUsd: 0,
        p50ValueUsd: 0,
        p90ValueUsd: 0,
        expectedReturnPercent: 0,
        probabilityOfProfitPercent: 0,
      };
    }

    const dt = 1 / 365;
    const dailyDrift = (annualizedReturn - 0.5 * annualizedVolatility ** 2) * dt;
    const dailyVol = annualizedVolatility * Math.sqrt(dt);

    const finalValues: number[] = [];
    let profitableCount = 0;

    for (let p = 0; p < paths; p++) {
      let currentVal = initialValueUsd;
      for (let d = 0; d < days; d++) {
        // Box-Muller transform para amostragem gaussiana N(0, 1)
        const u1 = Math.max(1e-10, Math.random());
        const u2 = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

        currentVal *= Math.exp(dailyDrift + dailyVol * z);
      }
      finalValues.push(currentVal);
      if (currentVal >= initialValueUsd) {
        profitableCount++;
      }
    }

    finalValues.sort((a, b) => a - b);

    const p10 = finalValues[Math.floor(paths * 0.10)];
    const p50 = finalValues[Math.floor(paths * 0.50)];
    const p90 = finalValues[Math.floor(paths * 0.90)];
    const expectedReturn = ((p50 - initialValueUsd) / initialValueUsd) * 100;
    const probProfit = (profitableCount / paths) * 100;

    return {
      days,
      simulatedPaths: paths,
      p10ValueUsd: PreciseMath.round(p10, 2),
      p50ValueUsd: PreciseMath.round(p50, 2),
      p90ValueUsd: PreciseMath.round(p90, 2),
      expectedReturnPercent: PreciseMath.round(expectedReturn, 2),
      probabilityOfProfitPercent: PreciseMath.round(probProfit, 1),
    };
  }
}
