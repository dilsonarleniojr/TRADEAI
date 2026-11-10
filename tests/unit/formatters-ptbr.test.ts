import { describe, it, expect } from "bun:test";
import {
  formatCurrency,
  formatPercent,
  formatPrice,
  formatVolume,
  formatCryptoAmount,
} from "@/lib/format";

describe("Formatadores pt-BR Centralizados (Fase 4)", () => {
  describe("formatCurrency", () => {
    it("deve formatar valores positivos em USD com pontuação brasileira", () => {
      expect(formatCurrency(10011.30)).toBe("US$ 10.011,30");
      expect(formatCurrency(25.00)).toBe("US$ 25,00");
      expect(formatCurrency(9986.30)).toBe("US$ 9.986,30");
    });

    it("deve formatar valores negativos com travessão tipográfico e US$ antecedendo o número", () => {
      expect(formatCurrency(-12.29)).toBe("−US$ 12,29");
      expect(formatCurrency(-0.05)).toBe("−US$ 0,05");
      expect(formatCurrency(-300.34)).toBe("−US$ 300,34");
    });

    it("deve formatar zero corretamente", () => {
      expect(formatCurrency(0)).toBe("US$ 0,00");
      expect(formatCurrency(null)).toBe("US$ 0,00");
      expect(formatCurrency(undefined)).toBe("US$ 0,00");
    });

    it("deve formatar valores pequenos (sub-dólar) com casas decimais adequadas sem truncar", () => {
      expect(formatCurrency(0.00215276)).toBe("US$ 0,00215276");
      expect(formatCurrency(0.0312)).toBe("US$ 0,0312");
    });

    it("deve formatar números abreviados compactos em mil, mi, bi", () => {
      expect(formatCurrency(1250000000, { compact: true })).toBe("US$ 1,25 bi");
      expect(formatCurrency(3500000, { compact: true })).toBe("US$ 3,5 mi");
      expect(formatCurrency(45000, { compact: true })).toBe("US$ 45 mil");
    });
  });

  describe("formatPercent", () => {
    it("deve exibir sinal explícito positivo e vírgula decimal", () => {
      expect(formatPercent(0.11)).toBe("+0,11%");
      expect(formatPercent(3.6)).toBe("+3,60%");
    });

    it("deve exibir sinal tipográfico negativo e vírgula decimal", () => {
      expect(formatPercent(-2.45)).toBe("−2,45%");
      expect(formatPercent(-1.8)).toBe("−1,80%");
    });

    it("deve exibir 0,00% neutro", () => {
      expect(formatPercent(0)).toBe("0,00%");
      expect(formatPercent(null)).toBe("0,00%");
    });
  });

  describe("formatVolume", () => {
    it("deve retornar travessão quando volume for zero ou nulo", () => {
      expect(formatVolume(0)).toBe("—");
      expect(formatVolume(null)).toBe("—");
      expect(formatVolume(-10)).toBe("—");
    });

    it("deve formatar volume positivo com abreviações", () => {
      expect(formatVolume(45000)).toBe("US$ 45 mil");
      expect(formatVolume(2500000)).toBe("US$ 2,5 mi");
    });
  });

  describe("formatPrice", () => {
    it("deve formatar preços com padrão pt-BR", () => {
      expect(formatPrice(68005.00)).toBe("68.005,00");
      expect(formatPrice(1.3223)).toBe("1,3223");
      expect(formatPrice(0.0312)).toBe("0,0312");
    });
  });
});
