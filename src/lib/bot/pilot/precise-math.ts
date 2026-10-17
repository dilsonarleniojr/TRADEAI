/**
 * PreciseMath: Utilitário de precisão decimal arbitrária para microestrutura e regras de troca.
 * 
 * Regra: É estritamente proibido o uso de operações com ponto flutuante binário (float/double)
 * para cálculos financeiros, cálculo de lot size (stepSize) e tick size (tickSize), prevenindo
 * erros de precisão e rejeições da exchange (-1013 Filter failure: LOT_SIZE).
 */

export class PreciseMath {
  /**
   * Converte número, string ou bigint para string decimal padronizada sem notação científica
   */
  public static toFixedString(val: number | string): string {
    if (typeof val === "string") {
      if (!val.includes("e") && !val.includes("E")) {
        return val.trim();
      }
      val = Number(val);
    }
    const str = val.toFixed(10);
    return str.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  }

  /**
   * Retorna o número de casas decimais a partir de uma string ou número (ex: 0.001 -> 3)
   */
  public static countDecimals(val: number | string): number {
    const s = typeof val === "string" ? val : val.toString();
    if (s.includes(".")) {
      const parts = s.split(".");
      return parts[1] ? parts[1].length : 0;
    }
    if (s.toLowerCase().includes("e-")) {
      const parts = s.toLowerCase().split("e-");
      return parseInt(parts[1], 10);
    }
    return 0;
  }

  /**
   * Arredonda ESTRITAMENTE para baixo (RoundingMode.DOWN / Floor) no múltiplo exato de stepSize.
   * Exemplo: quantity = 0.01579, stepSize = 0.001 -> 0.015
   */
  public static quantizeLotDown(quantity: number | string, stepSize: number | string): number {
    const qStr = this.toFixedString(quantity);
    const sStr = this.toFixedString(stepSize);

    const decimals = this.countDecimals(sStr);
    const qNum = parseFloat(qStr);
    const sNum = parseFloat(sStr);

    if (sNum <= 0 || isNaN(qNum)) return 0;

    const factor = Math.pow(10, decimals);
    const scaledQty = Math.round(qNum * factor * 1000) / 1000;
    const scaledStep = Math.round(sNum * factor * 1000) / 1000;

    const steps = Math.floor(scaledQty / scaledStep);
    const result = (steps * scaledStep) / factor;

    return parseFloat(result.toFixed(decimals));
  }

  /**
   * Trunca o preço no incremento exato de tickSize
   */
  public static quantizePriceDown(price: number | string, tickSize: number | string): number {
    const pStr = this.toFixedString(price);
    const tStr = this.toFixedString(tickSize);

    const decimals = this.countDecimals(tStr);
    const pNum = parseFloat(pStr);
    const tNum = parseFloat(tStr);

    if (tNum <= 0 || isNaN(pNum)) return 0;

    const factor = Math.pow(10, decimals);
    const scaledPrice = Math.round(pNum * factor * 1000) / 1000;
    const scaledTick = Math.round(tNum * factor * 1000) / 1000;

    const ticks = Math.floor(scaledPrice / scaledTick);
    const result = (ticks * scaledTick) / factor;

    return parseFloat(result.toFixed(decimals));
  }

  /**
   * Multiplicação segura sem resíduo de ponto flutuante
   */
  public static multiply(a: number, b: number): number {
    const aStr = a.toString();
    const bStr = b.toString();
    const decA = this.countDecimals(aStr);
    const decB = this.countDecimals(bStr);
    const factor = Math.pow(10, decA + decB);
    const scaledA = Math.round(a * Math.pow(10, decA));
    const scaledB = Math.round(b * Math.pow(10, decB));
    return (scaledA * scaledB) / factor;
  }

  /**
   * Subtração segura (a - b)
   */
  public static subtract(a: number, b: number): number {
    const maxDec = Math.max(this.countDecimals(a), this.countDecimals(b));
    const factor = Math.pow(10, maxDec);
    return Math.round(a * factor - b * factor) / factor;
  }

  /**
   * Adição segura (a + b)
   */
  public static add(a: number, b: number): number {
    const maxDec = Math.max(this.countDecimals(a), this.countDecimals(b));
    const factor = Math.pow(10, maxDec);
    return Math.round(a * factor + b * factor) / factor;
  }

  /**
   * Arredonda um valor decimal estritamente para baixo com N casas decimais
   */
  public static roundDown(val: number, decimals = 2): number {
    if (!Number.isFinite(val)) return 0;
    const factor = Math.pow(10, decimals);
    return Math.floor(val * factor) / factor;
  }

  /**
   * Arredonda com precisão para N casas decimais
   */
  public static round(val: number, decimals = 8): number {
    if (!Number.isFinite(val)) return 0;
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
  }

  /**
   * Arredonda o preço para CIMA (Ceil) no múltiplo exato de tickSize.
   * Utilizado para Take-Profit garantindo que o R:R líquido nunca sofra redução por truncamento.
   */
  public static quantizePriceUp(price: number | string, tickSize: number | string): number {
    const pStr = this.toFixedString(price);
    const tStr = this.toFixedString(tickSize);

    const decimals = this.countDecimals(tStr);
    const pNum = parseFloat(pStr);
    const tNum = parseFloat(tStr);

    if (tNum <= 0 || isNaN(pNum)) return 0;

    const factor = Math.pow(10, decimals);
    const scaledPrice = Math.round(pNum * factor * 1000) / 1000;
    const scaledTick = Math.round(tNum * factor * 1000) / 1000;

    const ticks = Math.ceil(scaledPrice / scaledTick);
    const result = (ticks * scaledTick) / factor;

    return parseFloat(result.toFixed(decimals));
  }
}
