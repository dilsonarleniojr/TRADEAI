/**
 * Quick Trade Execution Guard, Lock & Formatting Helpers (UI-003)
 */

const QUOTE_ASSET_REGEX = /USDT$|BUSD$|USDC$/;

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

/**
 * Remove o sufixo da moeda de cotação (USDT, BUSD, USDC) usando Regex pré-compilada.
 */
export function stripQuoteAsset(symbol?: string): string {
  return (symbol || "BTCUSDT").replace(QUOTE_ASSET_REGEX, "");
}

/**
 * Determina a precisão ideal de casas decimais em O(1) com base na faixa de preço.
 */
export function getQuantityDecimals(price: number): number {
  if (price > 1000) return 6;
  if (price > 1) return 4;
  if (price < 0.01) return 2;
  return 4;
}

/**
 * Formata uma quantidade numérica para string sem zeros à direita desnecessários.
 */
export function formatQuantityByPrice(rawQty: number, price: number): string {
  if (!Number.isFinite(rawQty) || rawQty <= 0 || price <= 0) return "";
  const decimals = getQuantityDecimals(price);
  return Number(rawQty.toFixed(decimals)).toString();
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

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      canExecute: false,
      reason: "Quantidade inválida para ordem.",
      totalUsdt: 0,
    };
  }

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
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
