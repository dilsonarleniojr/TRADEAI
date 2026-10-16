/**
 * TradeAI Mathematical Expectancy Gate (Portão de Valor Esperado e Dimensionamento de Kelly)
 * 
 * Inspirado nos princípios da teoria de probabilidades e derivativos financeiros:
 * 1. Cada oportunidade é avaliada como um evento probabilístico de Bernoulli com probabilidade p de vitória.
 * 2. O Valor Esperado (EV) líquido de custos operacionais (Maker/Taker fees + slippage) DEVE ser positivo:
 *    EV = (p * NetTP) - ((1 - p) * NetSL) >= MIN_EV_THRESHOLD (ex: +0.40%)
 * 3. Dimensionamento de Posição baseado no Critério de Kelly Fracionário (Quarter Kelly = 0.25 * Kelly):
 *    f* = (p * b - (1 - p)) / b, onde b = NetTP / NetSL
 *    Restrito rigorosamente entre 1.0% e 5.0% do NAV total da conta (conforme trading_guardrails.md).
 */

export interface MathematicalExpectancyParams {
  /** Probabilidade estimada de sucesso com base na confluência de sinais (0.0 a 1.0) */
  winProbability: number;
  /** Take Profit projetado bruto em percentual (ex: 3.5 para +3.5%) */
  projectedTpPercent: number;
  /** Stop Loss projetado bruto em percentual (ex: 1.8 para -1.8%) */
  projectedSlPercent: number;
  /** Se a ordem executará como Post-Only Maker (taxa 0.05% x 2 = 0.10%) ou Taker (0.10% x 2 = 0.20%) */
  isMaker?: boolean;
  /** Estimativa de slippage na execução em percentual (ex: 0.05%) */
  estimatedSlippagePercent?: number;
}

export interface MathematicalExpectancyResult {
  /** Se o trade possui expectativa matemática positiva e atende aos critérios institucionais */
  viable: boolean;
  /** Valor Esperado líquido percentual por trade */
  expectedValuePercent: number;
  /** Relação Payoff líquida (NetTP / NetSL) */
  netPayoffRatio: number;
  /** Ganho líquido projetado deduzindo taxas e slippage */
  netTpPercent: number;
  /** Perda líquida projetada somando taxas e slippage */
  netSlPercent: number;
  /** Total de atrito operacional estimado (taxas ida/volta + slippage) */
  totalFrictionPercent: number;
  /** Fração ótima de Kelly recomendada (Quarter Kelly) */
  recommendedKellyFraction: number;
  /** Tamanho percentual sugerido da banca (entre 1.0% e 5.0%) */
  suggestedNavPercent: number;
  /** Justificativa detalhada do comitê quantitativo */
  reason: string;
}

export class MathematicalExpectancyGate {
  /** Piso mínimo de Valor Esperado líquido exigido para aprovação pré-ordem (+0.40%) */
  public static readonly MIN_EXPECTED_VALUE_PCT = 0.40;

  /** Taxa de corretagem estimada ida e volta (Roundtrip) */
  public static readonly MAKER_ROUNDTRIP_FEE_PCT = 0.10; // 0.05% entrada + 0.05% saída
  public static readonly TAKER_ROUNDTRIP_FEE_PCT = 0.20; // 0.10% entrada + 0.10% saída

  /** Derrapagem média estimada */
  public static readonly DEFAULT_SLIPPAGE_PCT = 0.05;

  /** Multiplicador de segurança de Kelly (Quarter Kelly para minimizar drawdown) */
  public static readonly KELLY_SAFETY_FACTOR = 0.25;

  /** Limites institucionais de exposição por posição */
  public static readonly MIN_NAV_EXPOSURE_PCT = 1.0;
  public static readonly MAX_NAV_EXPOSURE_PCT = 5.0; // Teto do Pilar 2 de Trading Guardrails

  /**
   * Avalia a viabilidade matemática de uma entrada com base na probabilidade de confluência
   * e assimetria risco:retorno.
   */
  public static evaluate(params: MathematicalExpectancyParams): MathematicalExpectancyResult {
    const {
      winProbability,
      projectedTpPercent,
      projectedSlPercent,
      isMaker = true,
      estimatedSlippagePercent = isMaker ? 0.02 : MathematicalExpectancyGate.DEFAULT_SLIPPAGE_PCT,
    } = params;

    // 1. Sanitização de entradas numéricas (Anti-NaN / Guardrails)
    const p = Math.max(0.01, Math.min(0.99, Number.isFinite(winProbability) ? winProbability : 0.50));
    const rawTp = Math.max(0.1, Number.isFinite(projectedTpPercent) ? projectedTpPercent : 2.5);
    const rawSl = Math.max(0.1, Number.isFinite(projectedSlPercent) ? projectedSlPercent : 1.8);

    // 2. Fricção operacional total
    const roundtripFee = isMaker
      ? MathematicalExpectancyGate.MAKER_ROUNDTRIP_FEE_PCT
      : MathematicalExpectancyGate.TAKER_ROUNDTRIP_FEE_PCT;
    const totalFrictionPercent = parseFloat((roundtripFee + estimatedSlippagePercent).toFixed(3));

    // 3. Payouts líquidos
    const netTpPercent = Math.max(0, parseFloat((rawTp - totalFrictionPercent).toFixed(3)));
    const netSlPercent = parseFloat((rawSl + totalFrictionPercent).toFixed(3));

    // 4. Payoff Ratio líquida (b)
    const netPayoffRatio = netSlPercent > 0 ? parseFloat((netTpPercent / netSlPercent).toFixed(2)) : 0;

    // 5. Cálculo do Valor Esperado (EV)
    // EV = (p * NetTP) - ((1 - p) * NetSL)
    const expectedValuePercent = parseFloat(((p * netTpPercent) - ((1 - p) * netSlPercent)).toFixed(3));

    // 6. Cálculo do Critério de Kelly Fracionário
    // f* = (p * b - (1 - p)) / b
    let fullKelly = 0;
    if (netPayoffRatio > 0) {
      fullKelly = ((p * netPayoffRatio) - (1 - p)) / netPayoffRatio;
    }
    const safeKellyFraction = Math.max(0, fullKelly * MathematicalExpectancyGate.KELLY_SAFETY_FACTOR);

    // Mapeamento para limites operacionais da conta (1.0% a 5.0% NAV)
    let suggestedNavPercent = MathematicalExpectancyGate.MIN_NAV_EXPOSURE_PCT;
    if (safeKellyFraction > 0) {
      suggestedNavPercent = Math.min(
        MathematicalExpectancyGate.MAX_NAV_EXPOSURE_PCT,
        Math.max(
          MathematicalExpectancyGate.MIN_NAV_EXPOSURE_PCT,
          parseFloat((safeKellyFraction * 20).toFixed(2)) // Escala 0.05..0.25 -> 1.0%..5.0%
        )
      );
    }

    // 7. Decisão Institucional de Aprovação
    const isEvPositive = expectedValuePercent >= MathematicalExpectancyGate.MIN_EXPECTED_VALUE_PCT;
    const isPayoffSufficient = netPayoffRatio >= 1.50; // Piso de 1.5x
    const isNetTpViable = netTpPercent >= 1.50; // Regra 6 de Trading Guardrails (Anti-Overtrading)

    const viable = isEvPositive && isPayoffSufficient && isNetTpViable;

    let reason = "";
    if (!viable) {
      if (!isNetTpViable) {
        reason = `Alvo líquido (+${netTpPercent.toFixed(2)}%) abaixo do piso de 1.50% líquido de taxas.`;
      } else if (!isPayoffSufficient) {
        reason = `Relação R:R líquida (${netPayoffRatio}x) insuficiente (mínimo exigido: 1.50x).`;
      } else {
        reason = `Valor Esperado (EV: +${expectedValuePercent.toFixed(2)}%) abaixo do piso institucional de +${MathematicalExpectancyGate.MIN_EXPECTED_VALUE_PCT.toFixed(2)}% por trade.`;
      }
    } else {
      reason = `Expectativa Matemática Positiva (EV: +${expectedValuePercent.toFixed(2)}% | R:R líq: ${netPayoffRatio}x | P(win): ${(p * 100).toFixed(0)}%).`;
    }

    return {
      viable,
      expectedValuePercent,
      netPayoffRatio,
      netTpPercent,
      netSlPercent,
      totalFrictionPercent,
      recommendedKellyFraction: parseFloat(safeKellyFraction.toFixed(4)),
      suggestedNavPercent,
      reason,
    };
  }

  /**
   * Estima a probabilidade empírica de vitória de um sinal com base no comitê de confluência técnica.
   */
  public static estimateConfluenceProbability(params: {
    hasTrendAlignment: boolean;
    hasMomentumAlignment: boolean;
    hasOrderBookSupport: boolean;
    hasMultiTimeframe15m: boolean;
    adxStrength: number; // 0 a 100
  }): number {
    let score = 0.45; // Probabilidade base de mercado aleatório / ruído

    // Confluência de tendência (EMA 9 > EMA 21)
    if (params.hasTrendAlignment) score += 0.08;

    // Momentum positivo (MACD / RSI no ponto doce)
    if (params.hasMomentumAlignment) score += 0.08;

    // Livro de ofertas com Order Flow Imbalance comprador
    if (params.hasOrderBookSupport) score += 0.07;

    // Tendência macro alinhada no gráfico de 15m
    if (params.hasMultiTimeframe15m) score += 0.07;

    // Força da tendência medida pelo ADX
    if (params.adxStrength >= 25) {
      score += 0.05;
    } else if (params.adxStrength < 15) {
      score -= 0.05; // Mercado lateral fraco diminui convicção
    }

    return parseFloat(Math.min(0.85, Math.max(0.35, score)).toFixed(2));
  }
}
