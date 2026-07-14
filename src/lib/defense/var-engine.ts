/**
 * Dynamic VaR (Value at Risk) Engine
 * Calcula VaR histórico e paramétrico para o portfólio de bots.
 */

export interface VaRInput {
  returns: number[];       // array de retornos diários (ex: [-0.02, 0.01, 0.03])
  confidence?: number;     // default 0.95
}

export interface VaRResult {
  historicalVaR: number;  // em $
  parametricVaR: number;  // em $
  portfolioValue: number;
  exceedancePct: number;  // quantas vezes retorno < -VaR (backtest quality)
}

/**
 * Historical VaR: percentil da distribuição de retornos
 */
export function historicalVaR(input: VaRInput, portfolioValue: number): number {
  const { returns, confidence = 0.95 } = input;
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.floor((1 - confidence) * sorted.length);
  const worstReturn = sorted[Math.max(0, idx)];
  return Math.abs(worstReturn) * portfolioValue;
}

/**
 * Parametric VaR: Z * σ * portfolioValue (assume distribuição normal)
 */
export function parametricVaR(
  input: VaRInput,
  portfolioValue: number
): number {
  const { returns, confidence = 0.95 } = input;
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  const z = confidence === 0.99 ? 2.326 : 1.645; // 99% ou 95%
  return z * std * portfolioValue;
}

/**
 * Calcula VaR consolidado para todos os bots ativos.
 * Assume correlação 0.5 entre bots (conservador mas realista).
 */
export function portfolioVaR(
  bots: Array<{ varContribution: number }>,
  correlation = 0.5
): number {
  if (bots.length === 0) return 0;
  const varSum = bots.reduce((s, b) => s + b.varContribution ** 2, 0);
  const crossTerms = bots.reduce((s1, b1) =>
    s1 + bots.reduce((s2, b2) => s2 + (b1 !== b2 ? correlation * b1.varContribution * b2.varContribution : 0), 0)
  , 0);
  return Math.sqrt(varSum + crossTerms);
}
