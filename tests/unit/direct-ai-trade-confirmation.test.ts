import { describe, it, expect } from "bun:test";
import {
  getDirectAiTradeModeConfig,
  validateDirectAiTradeAmount,
} from "../../src/components/bot/direct-ai-trade-confirmation";

describe("DirectAiTrade Confirmation & Security Guardrails (UI-002)", () => {
  it("deve requerer confirmação dupla e retornar textos de risco de dinheiro real no modo LIVE", () => {
    const config = getDirectAiTradeModeConfig("live", 50.0);

    expect(config.isReal).toBe(true);
    expect(config.requiresConfirmation).toBe(true);
    expect(config.badgeLabel).toBe("LIVE SPOT BINANCE");
    expect(config.buttonText).toContain("REAL com IA");
    expect(config.buttonText).toContain("$50.00 USDT");
    expect(config.warningText).toContain("MODO REAL ATIVO");
    expect(config.colorClass).toContain("rose");
  });

  it("não deve requerer confirmação dupla e retornar visual amigável no modo PAPER", () => {
    const config = getDirectAiTradeModeConfig("paper", 25.0);

    expect(config.isReal).toBe(false);
    expect(config.requiresConfirmation).toBe(false);
    expect(config.badgeLabel).toBe("PAPER SIMULADO");
    expect(config.buttonText).toContain("SIMULADA com IA");
    expect(config.buttonText).toContain("$25.00 USDT");
    expect(config.warningText).toContain("MODO SIMULADO ATIVO");
    expect(config.colorClass).toContain("cyan");
  });

  it("deve rejeitar valores inferiores a $11.00 USDT na Binance Spot", () => {
    const invalid = validateDirectAiTradeAmount(10.0);
    expect(invalid.isValid).toBe(false);
    expect(invalid.error).toContain("mínimo");

    const valid = validateDirectAiTradeAmount(15.0);
    expect(valid.isValid).toBe(true);
    expect(valid.error).toBeUndefined();
  });
});

