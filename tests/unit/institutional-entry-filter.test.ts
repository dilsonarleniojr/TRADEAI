import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateInstitutionalEntry,
  checkThesisInvalidation,
  MANDATORY_NO_TRADE_MESSAGE,
  INSTITUTIONAL_RULES,
} from "@/lib/bot/institutional-entry-filter";
import {
  AGENT_SYSTEM_PROMPT,
  MIN_RISK_REWARD_THRESHOLD,
  applyGatekeeper,
} from "@/lib/ai/signal-agent";

describe("InstitutionalEntryFilter", () => {
  const validInput = {
    asset: "SOLUSDT",
    side: "BUY" as const,
    entryPrice: 100,
    stopLoss: 98.5, // 1.5% risk
    target1: 103.5, // +3.5%
    target2: 106.2, // +6.2% -> R:R = 4.13
    allocatedCapitalPct: 5,
    currentAllocatedPortfolioPct: 10,
    trendConfirmed: true,
    volumeAboveAverage: true,
    favorableMomentum: true,
    macroNonContradictory: true,
    estimatedProbabilityPct: 75,
    quoteVolume24hUsdt: 50_000_000,
    spreadPct: 0.05,
    unpredictableVolatilityEvent: false,
  };

  it("deve aprovar operação quando todos os critérios institucionais (R:R >= 1:4, Prob > 70%, Alocação <= 30%) forem atendidos", () => {
    const res = evaluateInstitutionalEntry(validInput);
    assert.equal(res.shouldOperate, true);
    assert.equal(res.statusMessage, "OPERAR");
    assert.equal(res.failedCriteria.length, 0);
    assert.ok(res.riskRewardRatio >= INSTITUTIONAL_RULES.MIN_RISK_REWARD);
    assert.ok(res.recommendation !== null);
    assert.equal(res.recommendation?.side, "Compra");
    assert.ok(res.recommendation?.protectedCapitalPct >= 70);
  });

  it("deve retornar NÃO OPERAR quando a relação risco/retorno for menor que 1:4", () => {
    const res = evaluateInstitutionalEntry({
      ...validInput,
      target1: 103.0,
      target2: 104.5, // R:R = 3.0
    });
    assert.equal(res.shouldOperate, false);
    assert.equal(res.statusMessage, MANDATORY_NO_TRADE_MESSAGE);
    assert.ok(res.failedCriteria.some((c) => c.includes("1:4")));
  });

  it("deve retornar NÃO OPERAR quando a probabilidade estimada for <= 70%", () => {
    const res = evaluateInstitutionalEntry({
      ...validInput,
      estimatedProbabilityPct: 70,
    });
    assert.equal(res.shouldOperate, false);
    assert.equal(res.statusMessage, MANDATORY_NO_TRADE_MESSAGE);
  });

  it("deve retornar NÃO OPERAR quando alocação exceder 30% ou capital protegido cair abaixo de 70%", () => {
    const overSingle = evaluateInstitutionalEntry({
      ...validInput,
      allocatedCapitalPct: 31,
    });
    assert.equal(overSingle.shouldOperate, false);
    assert.equal(overSingle.statusMessage, MANDATORY_NO_TRADE_MESSAGE);

    const overPortfolio = evaluateInstitutionalEntry({
      ...validInput,
      allocatedCapitalPct: 10,
      currentAllocatedPortfolioPct: 25, // total 35% -> protegido 65%
    });
    assert.equal(overPortfolio.shouldOperate, false);
    assert.equal(overPortfolio.statusMessage, MANDATORY_NO_TRADE_MESSAGE);
  });

  it("deve retornar NÃO OPERAR quando faltar confirmação de tendência, volume, momentum, macro ou liquidez", () => {
    const noVolume = evaluateInstitutionalEntry({ ...validInput, volumeAboveAverage: false });
    const badMacro = evaluateInstitutionalEntry({ ...validInput, macroNonContradictory: false });
    const lowLiq = evaluateInstitutionalEntry({ ...validInput, quoteVolume24hUsdt: 500_000 });
    const highVolEvent = evaluateInstitutionalEntry({ ...validInput, unpredictableVolatilityEvent: true });

    for (const r of [noVolume, badMacro, lowLiq, highVolEvent]) {
      assert.equal(r.shouldOperate, false);
      assert.equal(r.statusMessage, MANDATORY_NO_TRADE_MESSAGE);
    }
  });

  it("deve detectar invalidação de tese automaticamente quando stop ou tendência forem violados", () => {
    const ok = checkThesisInvalidation({
      side: "BUY",
      currentPrice: 101,
      stopLoss: 98.5,
      trendStillConfirmed: true,
      momentumStillFavorable: true,
    });
    assert.equal(ok.invalidated, false);

    const invalidated = checkThesisInvalidation({
      side: "BUY",
      currentPrice: 98.4,
      stopLoss: 98.5,
      trendStillConfirmed: false,
      momentumStillFavorable: true,
    });
    assert.equal(invalidated.invalidated, true);
    assert.equal(invalidated.reasons.length, 2);
  });

  it("deve aplicar R:R >= 4.0 e Probabilidade > 70% no SignalAgent", () => {
    assert.equal(MIN_RISK_REWARD_THRESHOLD, 4.0);
    assert.ok(AGENT_SYSTEM_PROMPT.length < 950);

    const vetoedRR = applyGatekeeper(
      {
        signal: "BUY",
        confidence_score: 80,
        stop_loss: 98,
        take_profit: 106, // R:R 3.0
        key_driver: "Rompimento",
        risk_warning: "Nenhum",
      },
      100
    );
    assert.equal(vetoedRR.signal, "HOLD");
    assert.equal(vetoedRR.vetoed, true);

    const vetoedProb = applyGatekeeper(
      {
        signal: "BUY",
        confidence_score: 68,
        stop_loss: 98,
        take_profit: 108, // R:R 4.0
        key_driver: "Rompimento",
        risk_warning: "Nenhum",
      },
      100
    );
    assert.equal(vetoedProb.signal, "HOLD");
    assert.equal(vetoedProb.vetoed, true);

    const approved = applyGatekeeper(
      {
        signal: "BUY",
        confidence_score: 76,
        stop_loss: 98,
        take_profit: 108, // R:R 4.0
        key_driver: "Confluência",
        risk_warning: "Sem garantia de lucro",
      },
      100
    );
    assert.equal(approved.signal, "BUY");
    assert.equal(approved.vetoed, false);
    assert.equal(approved.risk_reward_ratio, 4.0);
  });
});
