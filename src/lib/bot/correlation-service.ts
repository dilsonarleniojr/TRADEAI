/**
 * Serviço de Cálculo de Correlação de Pearson & Governança de Risco Institucional
 * Fulfills Pilar 2 (Safety Nets & Single-Name Exposure) & Pilar 4 (Telemetria)
 */

export interface AssetCorrelationPair {
  symbolA: string;
  symbolB: string;
  correlation: number; // -1.0 a +1.0
  isHyperCorrelated: boolean; // >= 0.85
  riskWarning?: string;
}

export interface CorrelationMatrixResult {
  symbols: string[];
  matrix: Record<string, Record<string, number>>;
  pairs: AssetCorrelationPair[];
  hyperCorrelatedCount: number;
}

/**
 * Coeficiente de Correlação Linear de Pearson entre duas séries temporais:
 * r = cov(X, Y) / (std(X) * std(Y))
 */
export function calculatePearsonCorrelation(seriesA: number[], seriesB: number[]): number {
  const n = Math.min(seriesA.length, seriesB.length);
  if (n < 5) return 0;

  // Calcula retornos percentuais candle a candle em vez de preço bruto para estacionariedade
  const returnsA: number[] = [];
  const returnsB: number[] = [];

  for (let i = 1; i < n; i++) {
    const prevA = seriesA[i - 1] || 1;
    const prevB = seriesB[i - 1] || 1;
    returnsA.push((seriesA[i] - prevA) / prevA);
    returnsB.push((seriesB[i] - prevB) / prevB);
  }

  const m = returnsA.length;
  const meanA = returnsA.reduce((s, v) => s + v, 0) / m;
  const meanB = returnsB.reduce((s, v) => s + v, 0) / m;

  let num = 0;
  let denA = 0;
  let denB = 0;

  for (let i = 0; i < m; i++) {
    const diffA = returnsA[i] - meanA;
    const diffB = returnsB[i] - meanB;
    num += diffA * diffB;
    denA += diffA * diffA;
    denB += diffB * diffB;
  }

  const den = Math.sqrt(denA * denB);
  if (den === 0) return 0;

  const r = num / den;
  return parseFloat(Math.max(-1, Math.min(1, r)).toFixed(3));
}

/**
 * Constrói a Matriz NxN de Correlação entre os ativos fornecidos.
 */
export function computeCorrelationMatrix(
  seriesMap: Record<string, number[]>
): CorrelationMatrixResult {
  const symbols = Object.keys(seriesMap);
  const matrix: Record<string, Record<string, number>> = {};
  const pairs: AssetCorrelationPair[] = [];
  let hyperCorrelatedCount = 0;

  for (const sA of symbols) {
    matrix[sA] = {};
    for (const sB of symbols) {
      if (sA === sB) {
        matrix[sA][sB] = 1.0;
      } else {
        const corr = calculatePearsonCorrelation(seriesMap[sA] || [], seriesMap[sB] || []);
        matrix[sA][sB] = corr;
      }
    }
  }

  // Extrai pares únicos sem repetição (i < j)
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const symA = symbols[i];
      const symB = symbols[j];
      const corr = matrix[symA][symB];
      const isHyperCorrelated = corr >= 0.85;

      if (isHyperCorrelated) {
        hyperCorrelatedCount++;
      }

      pairs.push({
        symbolA: symA,
        symbolB: symB,
        correlation: corr,
        isHyperCorrelated,
        riskWarning: isHyperCorrelated
          ? `Alta dependência direcional (${(corr * 100).toFixed(0)}%). Quedas em ${symA.replace("USDT","")} arrastam ${symB.replace("USDT","")}.`
          : undefined,
      });
    }
  }

  return {
    symbols,
    matrix,
    pairs,
    hyperCorrelatedCount,
  };
}
