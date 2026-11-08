import { PreciseMath } from "@/lib/bot/pilot/precise-math";

// Ajuste de quantidade/preço aos filtros LOT_SIZE (stepSize) e PRICE_FILTER (tickSize) da Binance.
// Trabalha em unidades inteiras do passo e devolve string decimal com as casas do passo,
// sem notação científica (ex.: 1e-7), que a Binance rejeita.

function decimalsOf(step: number): number {
  return PreciseMath.countDecimals(PreciseMath.toFixedString(step));
}

type Mode = "down" | "up" | "nearest";

function quantize(value: number, step: number, mode: Mode): string {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0 || value < 0) {
    throw new Error(`Valor (${value}) ou passo (${step}) inválido para ajuste aos filtros da Binance.`);
  }
  const d = decimalsOf(step);
  const factor = Math.pow(10, d);
  // Arredonda em 1e-6 da menor casa para absorver resíduos de float (0.3 * 10 = 3.0000000000000004).
  const scaled = Math.round(value * factor * 1e6) / 1e6;
  const stepUnits = Math.round(step * factor);
  const ratio = scaled / stepUnits;
  const count = mode === "down" ? Math.floor(ratio) : mode === "up" ? Math.ceil(ratio) : Math.round(ratio);

  const digits = BigInt(count * stepUnits).toString().padStart(d + 1, "0");
  return d === 0 ? digits : `${digits.slice(0, -d)}.${digits.slice(-d)}`;
}

/** Quantidade para baixo no múltiplo do stepSize (nunca excede o valor pedido/saldo). */
export function formatQtyDown(quantity: number, stepSize: number): string {
  return quantize(quantity, stepSize, "down");
}

/** Quantidade para cima no múltiplo do stepSize (usado para garantir o mínimo nocional). */
export function formatQtyUp(quantity: number, stepSize: number): string {
  return quantize(quantity, stepSize, "up");
}

/** Preço no múltiplo do tickSize mais próximo. */
export function formatPriceNearest(price: number, tickSize: number): string {
  return quantize(price, tickSize, "nearest");
}
