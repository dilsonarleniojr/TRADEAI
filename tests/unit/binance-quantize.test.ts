import { describe, expect, it } from "bun:test";
import { formatQtyDown, formatQtyUp, formatPriceNearest } from "@/lib/binance/quantize";
import { sanitizeOrderToExchangeFilters } from "@/lib/bot/order-reconciliation-engine";

describe("formatQtyDown — quantidade no múltiplo do stepSize, para baixo", () => {
  it("step 0.5: nunca arredonda para cima (2.9 → 2.5)", () => {
    expect(formatQtyDown(2.9, 0.5)).toBe("2.5");
    expect(formatQtyDown(2.5, 0.5)).toBe("2.5");
  });

  it("não perde um step por erro de float (0.3 / 0.1)", () => {
    expect(formatQtyDown(0.3, 0.1)).toBe("0.3");
    expect(formatQtyDown(0.7, 0.1)).toBe("0.7");
  });

  it("step 1 e 0.001", () => {
    expect(formatQtyDown(1234.99, 1)).toBe("1234");
    expect(formatQtyDown(0.015799, 0.001)).toBe("0.015");
  });

  it("step pequeno não vira notação científica", () => {
    expect(formatQtyDown(0.00000005, 0.00000001)).toBe("0.00000005");
    expect(formatQtyDown(0.0000001, 0.0000001)).toBe("0.0000001");
  });

  it("quantidade grande com step 1", () => {
    expect(formatQtyDown(123456789.9, 1)).toBe("123456789");
  });

  it("quantidade menor que o step → 0", () => {
    expect(formatQtyDown(0.0004, 0.001)).toBe("0.000");
  });
});

describe("formatQtyUp — para cima no múltiplo do stepSize", () => {
  it("arredonda para o próximo step e mantém valor exato", () => {
    expect(formatQtyUp(2.1, 0.5)).toBe("2.5");
    expect(formatQtyUp(0.3, 0.1)).toBe("0.3");
    expect(formatQtyUp(0.00012, 0.0001)).toBe("0.0002");
  });
});

describe("formatPriceNearest — preço no tick mais próximo", () => {
  it("tick 0.01 e 0.5", () => {
    expect(formatPriceNearest(65000.126, 0.01)).toBe("65000.13");
    expect(formatPriceNearest(10.74, 0.5)).toBe("10.5");
    expect(formatPriceNearest(10.76, 0.5)).toBe("11.0");
  });

  it("tick pequeno sem notação científica", () => {
    expect(formatPriceNearest(0.0000123456, 0.00000001)).toBe("0.00001235");
  });
});

describe("sanitizeOrderToExchangeFilters — mesmo arredondamento seguro", () => {
  const filter = { tickSize: 0.01, stepSize: 0.1, minQty: 0.1, maxQty: 1000, minNotional: 0 } as any;

  it("0.3 com step 0.1 continua 0.3", () => {
    expect(sanitizeOrderToExchangeFilters(10, 0.3, filter).sanitizedQuantity).toBe(0.3);
  });

  it("step 0.5 não arredonda quantidade para cima", () => {
    const r = sanitizeOrderToExchangeFilters(10, 2.9, { ...filter, stepSize: 0.5, minQty: 0.5 });
    expect(r.sanitizedQuantity).toBe(2.5);
  });
});
