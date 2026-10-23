/**
 * TradeAI - Motor de Reversão / DCA Adaptativo com Filtro de Regime
 *
 * Características Institucionais:
 * 1. Grade Dinâmica Baseada em Volatilidade (Dynamic ATR Grid):
 *    - Níveis de preço calculados em múltiplos dinâmicos do ATR (Average True Range), adaptando-se
 *      à expansão e contração de volatilidade do mercado em vez de percentuais fixos.
 * 2. Trava de Tendência Contrária (Trend Brake - Anti-Martingale / Fim do DCA Cego):
 *    - Suspensão imediata de ordens de grade contra a tendência se a EMA 200 (1h/macro)
 *      apresentar rompimento direcional violento com volume (RVOL > 2.0), evitando
 *      comprar facas caindo ("falling knives").
 */

export interface DcaGridLevel {
  levelIndex: number;
  targetPrice: number;
  allocationAmountUsd: number;
  quantity: number;
  distanceFromBasePercent: number;
  atrMultiple: number;
  status: "PENDING" | "FILLED" | "CANCELLED" | "VETOED_BY_TREND_BRAKE";
}

export interface DcaPlan {
  symbol: string;
  basePrice: number;
  currentAtr: number;
  levels: DcaGridLevel[];
  totalAllocatedUsd: number;
  maxNavExposurePercent: number;
  trendBrakeActive: boolean;
  trendBrakeReason?: string;
  createdAt: number;
}

export interface AdaptiveDcaConfig {
  maxLevels: number;                 // Máximo de ordens de reforço DCA (padrão: 3 a 5)
  atrMultiplierStep: number;         // Passo multiplicador do ATR por nível (ex: 1.2x, 1.5x)
  baseAllocationUsd: number;         // Valor base por nível em USD
  maxExposurePercent: number;        // Teto máximo de exposição em % do NAV total (padrão: 5.0%)
  useTrendBrake: boolean;            // Ativar trava de tendência macro
  emaMacroPeriod: number;            // Período da EMA macro para filtro direcional (padrão: 200)
  breakoutRvolThreshold: number;     // Volume relativo que confirma rompimento adverso (padrão: 2.0)
}

export interface MacroRegimeContext {
  symbol: string;
  currentPrice: number;
  ema200Macro: number;
  priceSlopePercent: number;         // Inclinação do preço nas últimas velas (%)
  macroRvol: number;                 // Volume relativo no timeframe macro
  isBearishBreakout: boolean;        // Se o preço cruzou com força abaixo da EMA 200 com volume
}

export class AdaptiveDcaEngine {
  private static instance: AdaptiveDcaEngine | null = null;
  private config: AdaptiveDcaConfig = {
    maxLevels: 4,
    atrMultiplierStep: 1.25,
    baseAllocationUsd: 50,
    maxExposurePercent: 5.0,
    useTrendBrake: true,
    emaMacroPeriod: 200,
    breakoutRvolThreshold: 2.0,
  };

  private constructor() {}

  public static getInstance(): AdaptiveDcaEngine {
    if (!AdaptiveDcaEngine.instance) {
      AdaptiveDcaEngine.instance = new AdaptiveDcaEngine();
    }
    return AdaptiveDcaEngine.instance;
  }

  public updateConfig(newConfig: Partial<AdaptiveDcaConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): AdaptiveDcaConfig {
    return { ...this.config };
  }

  /**
   * Avalia a Trava de Tendência Contrária (Trend Brake).
   * Retorna true se houver rompimento adverso violento que deve travar ordens de compra em grade.
   */
  public evaluateTrendBrake(context: MacroRegimeContext): {
    shouldBrake: boolean;
    reason?: string;
  } {
    if (!this.config.useTrendBrake) {
      return { shouldBrake: false };
    }

    const { currentPrice, ema200Macro, macroRvol, isBearishBreakout, priceSlopePercent } = context;

    // Condição 1: Rompimento explícito abaixo da EMA 200 com volume elevado
    if (isBearishBreakout && macroRvol >= this.config.breakoutRvolThreshold) {
      return {
        shouldBrake: true,
        reason: `Rompimento baixista violento abaixo da EMA ${this.config.emaMacroPeriod} com RVOL de ${macroRvol.toFixed(2)}x. Grade DCA suspensa para evitar faca caindo.`,
      };
    }

    // Condição 2: Preço muito afastado abaixo da EMA 200 com inclinação negativa acentuada
    if (currentPrice < ema200Macro) {
      const distanceUnderEma = ((ema200Macro - currentPrice) / ema200Macro) * 100;
      if (distanceUnderEma > 1.5 && priceSlopePercent < -1.0 && macroRvol > 1.5) {
        return {
          shouldBrake: true,
          reason: `Forte tendência macro de baixa (Preço -${distanceUnderEma.toFixed(2)}% abaixo da EMA 200 com inclinação de ${priceSlopePercent.toFixed(2)}%). Entradas contra-tendência vetadas.`,
        };
      }
    }

    return { shouldBrake: false };
  }

  /**
   * Constrói uma Grade Dinâmica de DCA baseada em múltiplos de ATR com proteção de risco.
   */
  public generateDynamicGrid(params: {
    symbol: string;
    entryPrice: number;
    atrValue: number;
    accountNavUsd: number;
    macroContext?: MacroRegimeContext;
    tickSize?: number;
    stepSize?: number;
  }): DcaPlan {
    const { symbol, entryPrice, atrValue, accountNavUsd, macroContext, tickSize = 0.01, stepSize = 0.001 } = params;

    // 1. Checagem do Trend Brake
    let trendBrakeActive = false;
    let trendBrakeReason: string | undefined;

    if (macroContext) {
      const brakeCheck = this.evaluateTrendBrake(macroContext);
      if (brakeCheck.shouldBrake) {
        trendBrakeActive = true;
        trendBrakeReason = brakeCheck.reason;
      }
    }

    // 2. Cálculo dos níveis de preço e dimensionamento
    const levels: DcaGridLevel[] = [];
    const maxExposureUsd = (this.config.maxExposurePercent / 100) * accountNavUsd;
    let totalAllocated = 0;

    // Se ATR não for fornecido ou inválido, utiliza 1.5% do preço como fallback
    const effectiveAtr = (atrValue && atrValue > 0) ? atrValue : entryPrice * 0.015;

    for (let k = 1; k <= this.config.maxLevels; k++) {
      // Espaçamento dinâmico exponencial ponderado por ATR
      const atrMultiple = k * this.config.atrMultiplierStep;
      const priceDrop = atrMultiple * effectiveAtr;
      let targetPrice = entryPrice - priceDrop;

      // Sanitização por tickSize
      if (tickSize > 0) {
        targetPrice = Math.floor(targetPrice / tickSize) * tickSize;
      }

      if (targetPrice <= 0) break;

      const distanceFromBasePercent = parseFloat((((entryPrice - targetPrice) / entryPrice) * 100).toFixed(2));

      // Alocação proporcional com limite rígido pelo NAV da banca
      let allocationAmountUsd = this.config.baseAllocationUsd * (1 + (k - 1) * 0.2); // Leve incremento proporcional institucional
      if (totalAllocated + allocationAmountUsd > maxExposureUsd) {
        allocationAmountUsd = Math.max(0, maxExposureUsd - totalAllocated);
      }

      if (allocationAmountUsd < 10) {
        // Abaixo de minNotional típico de 10 USDT
        break;
      }

      // Quantidade sanitizada por stepSize
      let rawQty = allocationAmountUsd / targetPrice;
      if (stepSize > 0) {
        rawQty = Math.floor(rawQty / stepSize) * stepSize;
      }

      const status = trendBrakeActive ? "VETOED_BY_TREND_BRAKE" : "PENDING";

      levels.push({
        levelIndex: k,
        targetPrice: parseFloat(targetPrice.toFixed(4)),
        allocationAmountUsd: parseFloat(allocationAmountUsd.toFixed(2)),
        quantity: parseFloat(rawQty.toFixed(6)),
        distanceFromBasePercent,
        atrMultiple: parseFloat(atrMultiple.toFixed(2)),
        status,
      });

      totalAllocated += allocationAmountUsd;
      if (totalAllocated >= maxExposureUsd) break;
    }

    return {
      symbol: symbol.toUpperCase(),
      basePrice: entryPrice,
      currentAtr: parseFloat(effectiveAtr.toFixed(4)),
      levels,
      totalAllocatedUsd: parseFloat(totalAllocated.toFixed(2)),
      maxNavExposurePercent: this.config.maxExposurePercent,
      trendBrakeActive,
      trendBrakeReason,
      createdAt: Date.now(),
    };
  }
}

export const adaptiveDcaEngine = AdaptiveDcaEngine.getInstance();
