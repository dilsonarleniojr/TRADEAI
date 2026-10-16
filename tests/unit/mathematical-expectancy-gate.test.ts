import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MathematicalExpectancyGate } from "@/lib/bot/mathematical-expectancy-gate";

describe("MathematicalExpectancyGate", () => {
  it("deve rejeitar trades com Valor Esperado (EV) negativo ou abaixo de +0.40%", () => {
    // 40% win rate com 2.0% TP e 1.8% SL
    const result = MathematicalExpectancyGate.evaluate({
      winProbability: 0.40,
      projectedTpPercent: 2.0,
      projectedSlPercent: 1.8,
      isMaker: true,
    });

    assert.equal(result.viable, false);
    assert.ok(result.expectedValuePercent < 0.40);
  });

  it("deve aprovar oportunidades com alta confluência e assimetria R:R positiva (EV >= +0.40%)", () => {
    // 60% win rate com 3.5% TP e 1.25% SL
    const result = MathematicalExpectancyGate.evaluate({
      winProbability: 0.60,
      projectedTpPercent: 3.5,
      projectedSlPercent: 1.25,
      isMaker: true,
      estimatedSlippagePercent: 0.05,
    });

    assert.equal(result.viable, true);
    assert.ok(result.expectedValuePercent >= 0.40);
    assert.ok(result.netPayoffRatio >= 1.85);
    assert.ok(result.suggestedNavPercent >= 1.0);
    assert.ok(result.suggestedNavPercent <= 5.0); // Teto de 5% NAV
  });

  it("deve calcular o Critério de Kelly Fracionário (Quarter Kelly) respeitando os limites institucionais", () => {
    const result = MathematicalExpectancyGate.evaluate({
      winProbability: 0.65,
      projectedTpPercent: 4.2,
      projectedSlPercent: 1.35,
      isMaker: true,
    });

    assert.ok(result.recommendedKellyFraction > 0);
    assert.ok(result.suggestedNavPercent >= 1.0);
    assert.ok(result.suggestedNavPercent <= 5.0);
  });

  it("deve deduzir corretamente as taxas Maker (0.10%) e Taker (0.20%) e derrapagem", () => {
    const makerResult = MathematicalExpectancyGate.evaluate({
      winProbability: 0.55,
      projectedTpPercent: 3.0,
      projectedSlPercent: 1.3,
      isMaker: true,
      estimatedSlippagePercent: 0.02,
    });

    const takerResult = MathematicalExpectancyGate.evaluate({
      winProbability: 0.55,
      projectedTpPercent: 3.0,
      projectedSlPercent: 1.3,
      isMaker: false,
      estimatedSlippagePercent: 0.05,
    });

    assert.ok(makerResult.totalFrictionPercent < takerResult.totalFrictionPercent);
    assert.ok(makerResult.expectedValuePercent > takerResult.expectedValuePercent);
  });

  it("deve estimar a probabilidade de vitória com base no comitê de confluência técnica", () => {
    const highProb = MathematicalExpectancyGate.estimateConfluenceProbability({
      hasTrendAlignment: true,
      hasMomentumAlignment: true,
      hasOrderBookSupport: true,
      hasMultiTimeframe15m: true,
      adxStrength: 32,
    });

    const lowProb = MathematicalExpectancyGate.estimateConfluenceProbability({
      hasTrendAlignment: false,
      hasMomentumAlignment: false,
      hasOrderBookSupport: false,
      hasMultiTimeframe15m: false,
      adxStrength: 10,
    });

    assert.ok(highProb >= 0.70);
    assert.ok(lowProb < 0.45);
  });

  it("deve identificar corretamente robôs deficitários para corte imediato de sangria", () => {
    const isDeficit = (pnl: number, losses: number, wins: number, symbol?: string) => {
      const DEFICIT_SYMBOLS = new Set(["DOGEUSDT", "APTUSDT", "NEARUSDT", "FETUSDT"]);
      return (
        (pnl < -0.10 && losses > wins) ||
        pnl < -0.25 ||
        (losses >= 2 && wins === 0) ||
        (Boolean(symbol && DEFICIT_SYMBOLS.has(symbol)) && pnl < 0)
      );
    };

    // Robôs da frota do usuário
    assert.equal(isDeficit(-0.19, 1, 0, "DOGEUSDT"), true); // DOGE
    assert.equal(isDeficit(-0.18, 1, 0, "APTUSDT"), true);  // APT
    assert.equal(isDeficit(-0.16, 1, 0, "NEARUSDT"), true); // NEAR
    assert.equal(isDeficit(-0.11, 1, 0, "FETUSDT"), true);  // FET

    // Robôs lucrativos / saudáveis
    assert.equal(isDeficit(0.24, 0, 1, "SUIUSDT"), false);  // SUI
    assert.equal(isDeficit(0.12, 0, 1, "AVAXUSDT"), false); // AVAX
    assert.equal(isDeficit(0.00, 0, 0, "BTCUSDT"), false);  // Neutro
  });
});
