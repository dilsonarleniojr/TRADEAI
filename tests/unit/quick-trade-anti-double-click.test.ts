import { describe, expect, it } from "bun:test";
import { validateQuickTradeExecution } from "../../src/components/chart/quick-trade-guard";

describe("QuickTrade Anti-Double-Click Lock & Guardrails (UI-003)", () => {
  it("deve bloquear execução quando isSubmitting for verdadeiro (lock ativo)", () => {
    const result = validateQuickTradeExecution({
      isSubmitting: true,
      quantity: 0.05,
      currentPrice: 65000,
      tradingMode: "live",
    });

    expect(result.canExecute).toBe(false);
    expect(result.reason).toContain("Requisição em andamento");
  });

  it("deve rejeitar ordens no modo LIVE com valor total inferior a $5.00 USDT", () => {
    const result = validateQuickTradeExecution({
      isSubmitting: false,
      quantity: 0.00005, // ~$3.25 @ $65k
      currentPrice: 65000,
      tradingMode: "live",
    });

    expect(result.canExecute).toBe(false);
    expect(result.reason).toContain("$5.00 USDT");
  });

  it("deve permitir execução quando requisição não estiver pendente e valor for válido", () => {
    const result = validateQuickTradeExecution({
      isSubmitting: false,
      quantity: 0.01, // $650 @ $65k
      currentPrice: 65000,
      tradingMode: "paper",
    });

    expect(result.canExecute).toBe(true);
    expect(result.totalUsdt).toBe(650);
  });
});
