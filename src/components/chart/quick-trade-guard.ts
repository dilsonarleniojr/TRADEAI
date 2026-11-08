/**
 * Quick Trade Execution Guard & Lock Helpers (UI-003)
 */

export interface QuickTradeGuardParams {
  isSubmitting: boolean;
  quantity: number;
  currentPrice: number;
  tradingMode: "live" | "paper";
}

export interface QuickTradeGuardResult {
  canExecute: boolean;
  reason?: string;
  totalUsdt: number;
}

export function validateQuickTradeExecution(
  params: QuickTradeGuardParams
): QuickTradeGuardResult {
  const { isSubmitting, quantity, currentPrice, tradingMode } = params;

  if (isSubmitting) {
    return {
      canExecute: false,
      reason: "Requisição em andamento. Aguarde a confirmação do servidor.",
      totalUsdt: 0,
    };
  }

  if (!quantity || quantity <= 0) {
    return {
      canExecute: false,
      reason: "Quantidade inválida para ordem.",
      totalUsdt: 0,
    };
  }

  if (!currentPrice || currentPrice <= 0) {
    return {
      canExecute: false,
      reason: "Preço atual de mercado indisponível.",
      totalUsdt: 0,
    };
  }

  const totalUsdt = quantity * currentPrice;

  if (tradingMode === "live" && totalUsdt < 5.0) {
    return {
      canExecute: false,
      reason: "A Binance exige valor mínimo de $5.00 USDT por ordem Spot.",
      totalUsdt,
    };
  }

  return {
    canExecute: true,
    totalUsdt,
  };
}
