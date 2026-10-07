/**
 * Institutional Pre-Order Validation, Reconciliation & Safety Engine
 * Fulfills Pillar 1 (I/O Resiliency), Pillar 2 (Safety Nets) & Pillar 4 (Structured Logging)
 */

export interface SymbolExchangeFilter {
  symbol: string;
  tickSize: number;
  stepSize: number;
  minNotional: number;
  minQty: number;
  maxQty: number;
}

export interface SanitizedOrderResult {
  valid: boolean;
  sanitizedPrice: number;
  sanitizedQuantity: number;
  notionalUsdt: number;
  rejectionReason?: string;
}

/**
 * Filtro Pré-Ordem em Memória:
 * Sanitiza e arredonda preço e lote para o tickSize e stepSize exatos da exchange,
 * garantindo que o valor nocional atinja o minNotional antes do envio de rede.
 */
export function sanitizeOrderToExchangeFilters(
  price: number,
  quantity: number,
  filter: SymbolExchangeFilter
): SanitizedOrderResult {
  if (price <= 0 || quantity <= 0) {
    return {
      valid: false,
      sanitizedPrice: 0,
      sanitizedQuantity: 0,
      notionalUsdt: 0,
      rejectionReason: `Preço (${price}) ou quantidade (${quantity}) não positivos.`,
    };
  }

  // Ajuste de Precisão Decimal com base no tickSize e stepSize
  const priceDecimals = Math.max(0, Math.round(-Math.log10(filter.tickSize)));
  const qtyDecimals = Math.max(0, Math.round(-Math.log10(filter.stepSize)));

  const stepCount = Math.floor(quantity / filter.stepSize);
  const rawQty = stepCount * filter.stepSize;
  const sanitizedQuantity = Number(rawQty.toFixed(qtyDecimals));

  const tickCount = Math.round(price / filter.tickSize);
  const rawPrice = tickCount * filter.tickSize;
  const sanitizedPrice = Number(rawPrice.toFixed(priceDecimals));

  const notionalUsdt = Number((sanitizedPrice * sanitizedQuantity).toFixed(4));

  if (sanitizedQuantity < filter.minQty) {
    return {
      valid: false,
      sanitizedPrice,
      sanitizedQuantity,
      notionalUsdt,
      rejectionReason: `[MIN_QTY_BREACH] Quantidade ${sanitizedQuantity} abaixo do mínimo permitido (${filter.minQty}).`,
    };
  }

  if (sanitizedQuantity > filter.maxQty) {
    return {
      valid: false,
      sanitizedPrice,
      sanitizedQuantity,
      notionalUsdt,
      rejectionReason: `[MAX_QTY_BREACH] Quantidade ${sanitizedQuantity} excede o limite máximo da exchange (${filter.maxQty}).`,
    };
  }

  if (notionalUsdt < filter.minNotional) {
    return {
      valid: false,
      sanitizedPrice,
      sanitizedQuantity,
      notionalUsdt,
      rejectionReason: `[MIN_NOTIONAL_BREACH] Nocional da ordem ($${notionalUsdt} USDT) abaixo do piso da exchange ($${filter.minNotional} USDT).`,
    };
  }

  return {
    valid: true,
    sanitizedPrice,
    sanitizedQuantity,
    notionalUsdt,
  };
}

/**
 * Trava de Volatilidade Extrema (Spread Blowout):
 * Impede novas compras se o spread relativo do book exceder o limiar de liquidez.
 */
export function checkExtremeSpreadVeto(
  spreadPercent: number,
  maxAllowedSpreadPercent: number = 0.35 // 0.35% de spread máximo tolerável
): { allowed: boolean; reason?: string } {
  if (spreadPercent > maxAllowedSpreadPercent) {
    return {
      allowed: false,
      reason: `[EXTREME_SPREAD_VETO] Spread do livro de ofertas (${spreadPercent.toFixed(3)}%) excede o teto seguro de ${maxAllowedSpreadPercent}%. Mercado em vácuo de liquidez.`,
    };
  }
  return { allowed: true };
}

/**
 * Limite de Perdas Consecutivas (Consecutive Loss Brake):
 * Trava o bot temporariamente caso ele acumule uma sequência de stops consecutivos.
 */
export function evaluateConsecutiveLossBrake(
  recentTradesPnl: number[],
  maxConsecutiveLosses: number = 3
): { tripped: boolean; consecutiveCount: number; reason?: string } {
  let consecutiveCount = 0;
  for (const pnl of recentTradesPnl) {
    if (pnl < 0) {
      consecutiveCount++;
    } else if (pnl > 0) {
      break; // Interrompe ao encontrar um win
    }
  }

  if (consecutiveCount >= maxConsecutiveLosses) {
    return {
      tripped: true,
      consecutiveCount,
      reason: `[CONSECUTIVE_LOSS_TRIPPED] Detectadas ${consecutiveCount} perdas consecutivas (limite: ${maxConsecutiveLosses}). Bot congelado para auto-preservação de capital.`,
    };
  }

  return { tripped: false, consecutiveCount };
}

export interface ExchangeOpenOrder {
  orderId: string;
  clientOrderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  origQty: number;
  time: number;
}

export interface KnownBotState {
  activeOrderIds: Set<string>;
  activeClientOrderIds: Set<string>;
}

export interface ReconciliationReport {
  timestamp: number;
  matchedCount: number;
  orphanOrders: ExchangeOpenOrder[];
  actionRequired: boolean;
}

/**
 * Gerenciador de Posições e Ordens Órfãs:
 * Compara as ordens abertas na exchange com a memória de ordens ativas do bot,
 * identificando resquícios não executados para cancelamento preventivo.
 */
export function reconcileOrphanOrders(
  exchangeOrders: ExchangeOpenOrder[],
  botState: KnownBotState
): ReconciliationReport {
  const orphanOrders: ExchangeOpenOrder[] = [];
  let matchedCount = 0;

  for (const order of exchangeOrders) {
    const isMatched =
      botState.activeOrderIds.has(order.orderId) ||
      botState.activeClientOrderIds.has(order.clientOrderId);

    if (isMatched) {
      matchedCount++;
    } else {
      orphanOrders.push(order);
    }
  }

  return {
    timestamp: Date.now(),
    matchedCount,
    orphanOrders,
    actionRequired: orphanOrders.length > 0,
  };
}

/**
 * Structured JSON Logger Institucional (Pilar 4)
 */
export type LogLevel = "INFO" | "WARN" | "ERROR" | "CRITICAL";

export interface StructuredLogMessage {
  timestamp: string;
  level: LogLevel;
  subsystem: string;
  event: string;
  details: Record<string, unknown>;
}

export function emitStructuredLog(
  level: LogLevel,
  subsystem: string,
  event: string,
  details: Record<string, unknown>
): StructuredLogMessage {
  const entry: StructuredLogMessage = {
    timestamp: new Date().toISOString(),
    level,
    subsystem,
    event,
    details,
  };

  const jsonString = JSON.stringify(entry);
  if (level === "ERROR" || level === "CRITICAL") {
    console.error(jsonString);
  } else if (level === "WARN") {
    console.warn(jsonString);
  } else {
    console.log(jsonString);
  }

  return entry;
}
