import { PreciseMath } from "./precise-math";
import { ExchangeMetadataService, SymbolFilters } from "./exchange-metadata-service";

export interface TradeSignal {
  symbol: string;
  side: "BUY";
  suggestedPrice: number;
  stopLoss: number;
  takeProfit: number;
  timestamp?: number;
}

export interface ValidatedPilotOrder {
  symbol: string;
  side: "BUY";
  type: "LIMIT_MAKER";
  timeInForce: "GTX";
  quantity: number;
  price: number;
  notionalUsd: number;
  stopLoss: number;
  takeProfit: number;
  riskAmountUsd: number;
  riskPercentOfCapital: number;
  netRewardRiskRatio: number;
  recvWindow: number;
}

export interface ValidationResult {
  valid: boolean;
  order?: ValidatedPilotOrder;
  rejectionReason?: string;
  details?: Record<string, any>;
}

export class PilotTradeValidator {
  private static instance: PilotTradeValidator;
  private metadataService = ExchangeMetadataService.getInstance();

  // Limites rígidos de governança para a banca piloto de $70 USD
  public static readonly TARGET_NOTIONAL_MIN_USD = 11.0; // Margem acima dos $5-$10 da Binance
  public static readonly TARGET_NOTIONAL_MAX_USD = 15.0; // Teto de segurança operacional
  public static readonly MAX_RISK_PERCENT = 0.02; // Máximo 2.0% ($1.40 USD para $70 USD)
  public static readonly MIN_REWARD_RISK_RATIO = 1.50; // R:R líquido mínimo de 1:1.5
  public static readonly MAKER_FEE_RATE = 0.001; // 0.10% Binance Spot Maker
  public static readonly TAKER_FEE_RATE = 0.001; // 0.10% Binance Spot Taker

  private constructor() {}

  public static getInstance(): PilotTradeValidator {
    if (!PilotTradeValidator.instance) {
      PilotTradeValidator.instance = new PilotTradeValidator();
    }
    return PilotTradeValidator.instance;
  }

  /**
   * Calcula analiticamente o Take-Profit mínimo necessário para atingir
   * uma relação Risco:Retorno líquida garantida (default: 1.80x),
   * compensando comissões Maker/Taker e quantização de tickSize para cima.
   */
  public static calculateTargetTakeProfit(
    entryPrice: number,
    stopLossPrice: number,
    targetNetRR = 1.80,
    filters?: SymbolFilters
  ): number {
    const cleanEntry = filters && filters.tickSize > 0 
      ? PreciseMath.quantizePrice(entryPrice, filters.tickSize) 
      : entryPrice;
    const cleanSl = filters && filters.tickSize > 0 
      ? PreciseMath.quantizePrice(stopLossPrice, filters.tickSize) 
      : stopLossPrice;

    const grossRisk = PreciseMath.subtract(cleanEntry, cleanSl);
    const entryFee = PreciseMath.multiply(cleanEntry, PilotTradeValidator.MAKER_FEE_RATE);
    const exitSlFee = PreciseMath.multiply(cleanSl, PilotTradeValidator.TAKER_FEE_RATE);
    const netRisk = PreciseMath.add(grossRisk, PreciseMath.add(entryFee, exitSlFee));

    const targetNetReward = netRisk * targetNetRR;
    const makerFee = PilotTradeValidator.MAKER_FEE_RATE;

    // netReward = (TP - entry) - (entry * makerFee + TP * makerFee)
    // TP * (1 - makerFee) = entry * (1 + makerFee) + targetNetReward
    const rawTp = (cleanEntry * (1 + makerFee) + targetNetReward) / (1 - makerFee);

    if (filters && filters.tickSize > 0) {
      // Arredonda para cima (ceil) no tickSize para assegurar que R:R líquido nunca caia abaixo do alvo
      const ticks = Math.ceil(rawTp / filters.tickSize);
      return PreciseMath.round(ticks * filters.tickSize, 8);
    }

    return PreciseMath.round(rawTp, 8);
  }

  /**
   * Validação pura e determinística de sinal para a banca piloto
   */
  public async validateSignal(
    signal: TradeSignal,
    currentBalanceUsd: number,
    hasActivePosition: boolean,
    customFilters?: SymbolFilters
  ): Promise<ValidationResult> {
    // 1. Single Active Position Policy: Estritamente 1 posição aberta por vez com $70 USD
    if (hasActivePosition) {
      return {
        valid: false,
        rejectionReason: "SINGLE_ACTIVE_POSITION_POLICY_VIOLATION: Já existe uma posição ativa em custódia. Bloqueado para evitar esgotamento de margem (-2010).",
      };
    }

    if (currentBalanceUsd < PilotTradeValidator.TARGET_NOTIONAL_MIN_USD) {
      return {
        valid: false,
        rejectionReason: `INSUFFICIENT_BALANCE: Saldo disponível ($${currentBalanceUsd.toFixed(2)}) abaixo do mínimo nocional operacional ($${PilotTradeValidator.TARGET_NOTIONAL_MIN_USD.toFixed(2)}).`,
      };
    }

    const filters = customFilters || (await this.metadataService.getSymbolFilters(signal.symbol));

    // Sanitiza preços por tickSize
    const cleanEntry = this.metadataService.quantizePrice(signal.suggestedPrice, filters);
    const cleanSl = this.metadataService.quantizePrice(signal.stopLoss, filters);
    const cleanTp = this.metadataService.quantizePrice(signal.takeProfit, filters);

    if (cleanEntry <= 0 || cleanSl <= 0 || cleanTp <= 0) {
      return {
        valid: false,
        rejectionReason: "INVALID_PRICE_LEVELS: Níveis de preço, Stop Loss ou Take Profit inválidos.",
      };
    }

    // Valida direção lógica (para BUY, SL deve ser menor que Entry e TP deve ser maior que Entry)
    if (cleanSl >= cleanEntry) {
      return {
        valid: false,
        rejectionReason: `INVALID_STOP_LOSS: Stop Loss ($${cleanSl}) deve ser estritamente inferior ao preço de compra ($${cleanEntry}).`,
      };
    }

    if (cleanTp <= cleanEntry) {
      return {
        valid: false,
        rejectionReason: `INVALID_TAKE_PROFIT: Take Profit ($${cleanTp}) deve ser estritamente superior ao preço de compra ($${cleanEntry}).`,
      };
    }

    // 2. Cálculo da Assimetria Relação Risco:Retorno (R:R) Líquida de Taxas
    const grossRiskPerUnit = PreciseMath.subtract(cleanEntry, cleanSl);
    const grossRewardPerUnit = PreciseMath.subtract(cleanTp, cleanEntry);

    // Estimativa de taxas Maker na entrada e Taker no SL (pior cenário)
    const entryFeePerUnit = PreciseMath.multiply(cleanEntry, PilotTradeValidator.MAKER_FEE_RATE);
    const exitSlFeePerUnit = PreciseMath.multiply(cleanSl, PilotTradeValidator.TAKER_FEE_RATE);
    const exitTpFeePerUnit = PreciseMath.multiply(cleanTp, PilotTradeValidator.MAKER_FEE_RATE);

    const netRiskPerUnit = PreciseMath.add(grossRiskPerUnit, PreciseMath.add(entryFeePerUnit, exitSlFeePerUnit));
    const netRewardPerUnit = PreciseMath.subtract(grossRewardPerUnit, PreciseMath.add(entryFeePerUnit, exitTpFeePerUnit));

    if (netRiskPerUnit <= 0) {
      return {
        valid: false,
        rejectionReason: "MATHEMATICAL_ANOMALY: Risco líquido calculado menor ou igual a zero.",
      };
    }

    const netRewardRiskRatio = netRewardPerUnit / netRiskPerUnit;
    if (netRewardRiskRatio < PilotTradeValidator.MIN_REWARD_RISK_RATIO) {
      return {
        valid: false,
        rejectionReason: `INSUFFICIENT_REWARD_RISK_RATIO: R:R Líquido (${netRewardRiskRatio.toFixed(2)}x) inferior ao patamar mínimo exigido (${PilotTradeValidator.MIN_REWARD_RISK_RATIO}x).`,
        details: { netRewardRiskRatio, cleanEntry, cleanSl, cleanTp },
      };
    }

    // 3. Resolução de Dimensionamento: Nocional Alvo vs. Teto de Risco em Dólares
    // Teto de perda absoluta permitida: max 2.0% do capital (ex: $1.40 USD para $70 USD)
    const maxAllowedLossUsd = PreciseMath.multiply(currentBalanceUsd, PilotTradeValidator.MAX_RISK_PERCENT);

    // Dimensionamento com base no risco técnico por unidade: Qty = MaxLoss / NetRiskPerUnit
    const technicalQuantity = maxAllowedLossUsd / netRiskPerUnit;

    // Trunca estritamente para baixo no múltiplo de stepSize
    let quantizedQty = PreciseMath.quantizeLotDown(technicalQuantity, filters.stepSize);
    let calculatedNotional = PreciseMath.multiply(quantizedQty, cleanEntry);

    // Se o lote resultar em valor nocional abaixo do mínimo de segurança ($11.00 USD),
    // testamos elevar a quantidade para atingir o mínimo nocional de segurança:
    if (calculatedNotional < PilotTradeValidator.TARGET_NOTIONAL_MIN_USD) {
      const minRequiredQty = PilotTradeValidator.TARGET_NOTIONAL_MIN_USD / cleanEntry;
      // Arredonda para cima no múltiplo de stepSize para atingir >= TARGET_NOTIONAL_MIN_USD
      const steps = Math.ceil(minRequiredQty / filters.stepSize);
      const adjustedQty = steps * filters.stepSize;
      const testNotional = PreciseMath.multiply(adjustedQty, cleanEntry);
      const testRiskAmount = PreciseMath.multiply(adjustedQty, netRiskPerUnit);

      // Verificação decisiva: Esse lote mínimo de $11 USD cabe no teto de risco de $1.40 USD?
      if (testRiskAmount > maxAllowedLossUsd) {
        return {
          valid: false,
          rejectionReason: `RISK_EXCEEDS_CAPITAL_LIMIT: O lote mínimo necessário para cumprir o NOTIONAL da Binance ($${testNotional.toFixed(2)} USD) exigiria risco de $${testRiskAmount.toFixed(2)} USD, excedendo o teto máximo de perda de 2.0% ($${maxAllowedLossUsd.toFixed(2)} USD). Operação sumariamente rejeitada por preservação da banca.`,
          details: { testNotional, testRiskAmount, maxAllowedLossUsd, cleanEntry, cleanSl },
        };
      }

      quantizedQty = this.metadataService.quantizeQuantity(adjustedQty, filters);
      calculatedNotional = PreciseMath.multiply(quantizedQty, cleanEntry);
    }

    // Se o nocional ultrapassar o teto operacional máximo ($15 USD)
    if (calculatedNotional > PilotTradeValidator.TARGET_NOTIONAL_MAX_USD) {
      const maxUnits = PilotTradeValidator.TARGET_NOTIONAL_MAX_USD / cleanEntry;
      quantizedQty = PreciseMath.quantizeLotDown(maxUnits, filters.stepSize);
      calculatedNotional = PreciseMath.multiply(quantizedQty, cleanEntry);
    }

    // Validação final de LOT_SIZE e MIN_NOTIONAL da Binance
    if (quantizedQty < filters.minQty) {
      return {
        valid: false,
        rejectionReason: `LOT_SIZE_FILTER_FAILURE: Quantidade truncada (${quantizedQty}) inferior ao minQty (${filters.minQty}) do par.`,
      };
    }

    if (calculatedNotional < filters.minNotional) {
      return {
        valid: false,
        rejectionReason: `MIN_NOTIONAL_FILTER_FAILURE: Nocional ($${calculatedNotional.toFixed(2)}) abaixo do minNotional da Binance ($${filters.minNotional.toFixed(2)}).`,
      };
    }

    const finalRiskAmountUsd = PreciseMath.multiply(quantizedQty, netRiskPerUnit);
    const finalRiskPercent = (finalRiskAmountUsd / currentBalanceUsd) * 100;

    if (finalRiskAmountUsd > maxAllowedLossUsd * 1.05) { // 5% de tolerância a arredondamento de stepSize
      return {
        valid: false,
        rejectionReason: `RISK_SAFETY_CAP_EXCEEDED: Perda calculada ($${finalRiskAmountUsd.toFixed(2)}) excede o teto permitido ($${maxAllowedLossUsd.toFixed(2)}).`,
      };
    }

    // 4. Emissão da Ordem Sanitizada
    const approvedOrder: ValidatedPilotOrder = {
      symbol: filters.symbol,
      side: "BUY",
      type: "LIMIT_MAKER",
      timeInForce: "GTX",
      quantity: quantizedQty,
      price: cleanEntry,
      notionalUsd: calculatedNotional,
      stopLoss: cleanSl,
      takeProfit: cleanTp,
      riskAmountUsd: finalRiskAmountUsd,
      riskPercentOfCapital: finalRiskPercent,
      netRewardRiskRatio,
      recvWindow: 5000,
    };

    return {
      valid: true,
      order: approvedOrder,
      details: {
        filters,
        cleanEntry,
        cleanSl,
        cleanTp,
        netRewardRiskRatio,
      },
    };
  }
}
