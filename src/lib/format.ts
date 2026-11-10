/**
 * Utilitários centralizados de formatação para pt-BR.
 * Garante padronização em toda a interface da plataforma TradeAI:
 * - Moeda: US$ 10.011,30 ou −US$ 12,29
 * - Percentual com sinal: +0,11% ou −2,45%
 * - Milhares com ponto e decimais com vírgula
 * - Abreviações: mil, mi, bi
 * - Preços cripto de baixo valor com até 8 casas decimais
 */

const PT_BR = "pt-BR";

/**
 * Converte valor desconhecido (string | number | undefined | null) para número seguro.
 */
function toNumeric(val: number | string | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Formata um número como moeda em USD com padrão brasileiro:
 * Ex: 10011.3 -> "US$ 10.011,30"
 *     -12.29 -> "−US$ 12,29"
 *     0.00215276 -> "US$ 0,00215276"
 */
export function formatCurrency(
  value: number | string | null | undefined,
  options?: {
    showSign?: boolean;
    compact?: boolean;
    minDecimals?: number;
    maxDecimals?: number;
  }
): string {
  const num = toNumeric(value);
  if (num === null) {
    return "US$ 0,00";
  }

  const absVal = Math.abs(num);
  const isNegative = num < -0.00000001;
  const isPositive = num > 0.00000001;

  // Formatação compacta (mil, mi, bi)
  if (options?.compact && absVal >= 1000) {
    if (absVal >= 1_000_000_000) {
      const formatted = (absVal / 1_000_000_000).toLocaleString(PT_BR, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2,
      });
      const prefix = isNegative ? "−US$ " : options?.showSign && isPositive ? "+US$ " : "US$ ";
      return `${prefix}${formatted} bi`;
    }
    if (absVal >= 1_000_000) {
      const formatted = (absVal / 1_000_000).toLocaleString(PT_BR, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2,
      });
      const prefix = isNegative ? "−US$ " : options?.showSign && isPositive ? "+US$ " : "US$ ";
      return `${prefix}${formatted} mi`;
    }
    if (absVal >= 1_000) {
      const remainder = (absVal / 1_000) % 1;
      const formatted = (absVal / 1_000).toLocaleString(PT_BR, {
        minimumFractionDigits: remainder === 0 ? 0 : 1,
        maximumFractionDigits: 1,
      });
      const prefix = isNegative ? "−US$ " : options?.showSign && isPositive ? "+US$ " : "US$ ";
      return `${prefix}${formatted} mil`;
    }
  }

  // Decimais dinâmicos para criptoativos
  let minDec = options?.minDecimals ?? 2;
  let maxDec = options?.maxDecimals ?? 2;

  if (absVal > 0 && absVal < 0.01) {
    minDec = options?.minDecimals ?? 4;
    maxDec = options?.maxDecimals ?? 8;
  } else if (absVal >= 0.01 && absVal < 1) {
    minDec = options?.minDecimals ?? 2;
    maxDec = options?.maxDecimals ?? 4;
  }

  const formattedAbs = absVal.toLocaleString(PT_BR, {
    minimumFractionDigits: minDec,
    maximumFractionDigits: maxDec,
  });

  if (isNegative) {
    return `−US$ ${formattedAbs}`;
  }
  if (options?.showSign && isPositive) {
    return `+US$ ${formattedAbs}`;
  }
  return `US$ ${formattedAbs}`;
}

/**
 * Formata um preço numérico simples (com pontuação pt-BR)
 */
export function formatPrice(price: number | string | null | undefined): string {
  const num = toNumeric(price);
  if (num === null) return "0,00";

  const absPrice = Math.abs(num);
  let minDec = 2;
  let maxDec = 2;

  if (absPrice > 0 && absPrice < 0.0001) {
    minDec = 6;
    maxDec = 8;
  } else if (absPrice >= 0.0001 && absPrice < 1) {
    minDec = 4;
    maxDec = 6;
  } else if (absPrice >= 1 && absPrice < 100) {
    // Para altcoins de baixo valor unitário (XRP, ADA, SUI), permitir até 4 casas se houver decimais
    minDec = 2;
    maxDec = 4;
  }

  return num.toLocaleString(PT_BR, {
    minimumFractionDigits: minDec,
    maximumFractionDigits: maxDec,
  });
}

/**
 * Formata volume financeiro em USD com abreviações pt-BR (mil, mi, bi)
 * Retorna "—" quando volume for zero ou nulo.
 */
export function formatVolume(volume: number | string | null | undefined): string {
  const num = toNumeric(volume);
  if (num === null || num <= 0) return "—";
  return formatCurrency(volume, { compact: true });
}

/**
 * Formata um valor percentual com sinal explícito e vírgula decimal:
 * Ex: 0.11 -> "+0,11%"
 *    -12.5 -> "−12,50%"
 *     0    -> "0,00%"
 */
export function formatPercent(
  percent: number | string | null | undefined,
  decimals = 2
): string {
  const num = toNumeric(percent);
  if (num === null) {
    return "0,00%";
  }

  const isNeg = num < -0.0001;
  const isPos = num > 0.0001;
  const absFormatted = Math.abs(num).toLocaleString(PT_BR, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (isNeg) {
    return `−${absFormatted}%`;
  }
  if (isPos) {
    return `+${absFormatted}%`;
  }
  return `0,00%`;
}

/**
 * Alias com compatibilidade retroativa para percentuais com sinal explícito
 */
export function formatPercentWithSign(
  percent: number | string | null | undefined,
  decimals = 2
): string {
  return formatPercent(percent, decimals);
}

/**
 * Formata quantidade de criptomoedas com casas decimais apropriadas.
 */
export function formatCryptoAmount(
  amount: number | string | null | undefined,
  symbol?: string
): string {
  const num = toNumeric(amount);
  if (num === null) return "0";

  const absAmount = Math.abs(num);
  let decimals = 4;
  if (absAmount >= 1000) decimals = 2;
  else if (absAmount < 0.001) decimals = 6;

  const formatted = num.toLocaleString(PT_BR, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });

  return symbol ? `${formatted} ${symbol}` : formatted;
}

/**
 * Formata horário no formato HH:mm
 */
export function formatTime(timestamp: number | string | Date | null | undefined): string {
  if (!timestamp) return "--:--";
  const date = typeof timestamp === "object" ? timestamp : new Date(timestamp);
  if (isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString(PT_BR, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Formata data no formato dd/mm/aaaa
 */
export function formatDate(timestamp: number | string | Date | null | undefined): string {
  if (!timestamp) return "";
  const date = typeof timestamp === "object" ? timestamp : new Date(timestamp);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString(PT_BR, { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Formata data/hora completa para padrão brasileiro:
 * Ex: 08/11/2026 23:15 ou 23:15:02
 */
export function formatDateTime(
  timestamp: number | string | Date | null | undefined,
  type: "full" | "time" | "date" | "short" = "short"
): string {
  if (!timestamp) return "—";

  const date = typeof timestamp === "object" ? timestamp : new Date(timestamp);
  if (isNaN(date.getTime())) return "—";

  if (type === "time") {
    return date.toLocaleTimeString(PT_BR, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  if (type === "date") {
    return date.toLocaleDateString(PT_BR, { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  if (type === "short") {
    return date.toLocaleDateString(PT_BR, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleString(PT_BR, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Abrevia números inteiros grandes (ex: ordens, volume de contratos):
 * Ex: 12500 -> "12,5 mil"
 */
export function formatCompactNumber(value: number | string | null | undefined): string {
  const num = toNumeric(value);
  if (num === null) return "0";
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toLocaleString(PT_BR, { maximumFractionDigits: 2 })} bi`;
  }
  if (abs >= 1_000_000) {
    return `${(num / 1_000_000).toLocaleString(PT_BR, { maximumFractionDigits: 2 })} mi`;
  }
  if (abs >= 1_000) {
    return `${(num / 1_000).toLocaleString(PT_BR, { maximumFractionDigits: 1 })} mil`;
  }
  return num.toLocaleString(PT_BR);
}
