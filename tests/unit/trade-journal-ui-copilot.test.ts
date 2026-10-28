import { describe, expect, test } from "bun:test";
import {
  calculateMfeCaptureEfficiency,
  calculateBipartiteExcursionWidths,
  computeUnderwaterDrawdownSeries,
  computeInstitutionalRiskTelemetry,
  buildPostTradeCoTPrompt,
  buildCopilotFleetDryRunPreview,
} from "@/lib/journal/post-trade-copilot-prompt";
import {
  TradeJournalEngine,
  BoundedIdRingBuffer,
  addExactUsd,
  subExactUsd,
  mulExactUsd,
} from "@/lib/journal/trade-journal-engine";
import { sanitizeSafeString } from "@/app/api/journal/sync/route";
import { selectCascadedModel } from "@/lib/ai-client";
import {
  LongTermMemoryStore,
  evaluateLLMResponseGovernance,
} from "@/lib/ai/agent-runtime";
import { AGENT_SYSTEM_PROMPT, applyGatekeeper } from "@/lib/ai/signal-agent";
import { isQuantCopilotHotkey } from "@/hooks/use-desktop-hotkeys";
import { useCryptoStore } from "@/lib/store";

describe("UI/UX Institutional Enhancements & Post-Trade Quant Copilot", () => {
  test("1. Calcula Eficiência de Captura MFE e Proporção Bipartida MAE vs MFE com precisão", () => {
    // Trade com MFE de +2.0% e Net Gain de +1.5% => 75.0% de captura
    const eff = calculateMfeCaptureEfficiency(1.5, 2.0);
    expect(eff).toBe(75);

    // Trade perdedor => 0% de captura MFE
    expect(calculateMfeCaptureEfficiency(-0.8, 1.2)).toBe(0);

    // Barra bipartida com MAE -0.5% e MFE +1.5% => 25% MAE / 75% MFE
    const widths = calculateBipartiteExcursionWidths(-0.5, 1.5);
    expect(widths.maeWidthPercent).toBe(25);
    expect(widths.mfeWidthPercent).toBe(75);
  });

  test("2. Constrói a série Underwater Drawdown (Pico-a-Vale) e Delta PnL para o Crosshair SVG", () => {
    const curve = [
      { timestamp: 1700000000000, equity: 1000 },
      { timestamp: 1700000060000, equity: 1100 }, // Novo pico: 1100
      { timestamp: 1700000120000, equity: 1045 }, // Queda de -55 sobre 1100 => -5.0%
      { timestamp: 1700000180000, equity: 1150 }, // Recuperação e novo pico: 1150 => 0.0%
    ];

    const series = computeUnderwaterDrawdownSeries(curve);
    expect(series).toHaveLength(4);
    expect(series[1].peakEquity).toBe(1100);
    expect(series[1].deltaPnl).toBe(100);
    expect(series[1].drawdownPercent).toBe(0);

    expect(series[2].peakEquity).toBe(1100);
    expect(series[2].deltaPnl).toBe(-55);
    expect(series[2].drawdownPercent).toBe(-5);

    expect(series[3].peakEquity).toBe(1150);
    expect(series[3].drawdownPercent).toBe(0);
  });

  test("3. Monitora Guardrails Institucionais (Trava de Perda Diária -3.0% NAV e Consecutive Loss Brake 0/3)", () => {
    const engine = new TradeJournalEngine();
    const now = Date.now();

    // Registra 3 perdas consecutivas hoje totalizando ~ -$32 em banca de $1,000 (> 3.0% de perda diária)
    const r1 = engine.recordTrade({
      symbol: "BTCUSDT",
      side: "LONG",
      mode: "paper",
      botId: "bot-1",
      botName: "Fleet Alpha",
      entryPrice: 100,
      exitPrice: 99,
      quantity: 10,
      entryTime: now - 180_000,
      exitTime: now - 120_000,
      lowestPriceDuringTrade: 98.8,
      highestPriceDuringTrade: 100.2,
      exitReason: "STOP_LOSS",
    });
    const r2 = engine.recordTrade({
      symbol: "ETHUSDT",
      side: "LONG",
      mode: "paper",
      botId: "bot-1",
      botName: "Fleet Alpha",
      entryPrice: 100,
      exitPrice: 99,
      quantity: 10,
      entryTime: now - 110_000,
      exitTime: now - 60_000,
      lowestPriceDuringTrade: 98.9,
      highestPriceDuringTrade: 100.1,
      exitReason: "STOP_LOSS",
    });
    const r3 = engine.recordTrade({
      symbol: "SOLUSDT",
      side: "LONG",
      mode: "paper",
      botId: "bot-1",
      botName: "Fleet Alpha",
      entryPrice: 100,
      exitPrice: 98.8,
      quantity: 10,
      entryTime: now - 50_000,
      exitTime: now - 10_000,
      lowestPriceDuringTrade: 98.5,
      highestPriceDuringTrade: 100.1,
      exitReason: "STOP_LOSS",
    });

    const telemetry = computeInstitutionalRiskTelemetry([r3, r2, r1], 1000);
    expect(telemetry.consecutiveLosses).toBe(3);
    expect(telemetry.circuitBreakerTripped).toBe(true);
    expect(telemetry.riskStatus).toBe("CRITICO");
    expect(telemetry.dailyLossPercentOfNav).toBeLessThanOrEqual(-3.0);
  });

  test("4. Gera o Prompt Institucional Chain-of-Thought completo com blocos XML e contrato JSON", () => {
    const engine = new TradeJournalEngine();
    const rec = engine.recordTrade({
      symbol: "SOLUSDT",
      side: "LONG",
      mode: "live",
      botId: "direct-ai-1",
      botName: "Direct AI Trade",
      entryPrice: 150,
      exitPrice: 154.5,
      quantity: 2,
      entryTime: Date.now() - 300_000,
      exitTime: Date.now(),
      lowestPriceDuringTrade: 149.4,
      highestPriceDuringTrade: 155.2,
      exitReason: "PARTIAL_TP2",
    });

    const metrics = engine.calculateMetrics([rec], 1000);
    const bundle = buildPostTradeCoTPrompt({
      metrics,
      horizonWindow: "LIVE",
      lastRecord: rec,
    });

    expect(bundle.promptText).toContain("<diagnostico_assimetria_mae_mfe>");
    expect(bundle.promptText).toContain("<impacto_friccao_e_custos>");
    expect(bundle.promptText).toContain("<correlacao_orderflow_l2>");
    expect(bundle.promptText).toContain("<plano_acao_parametrico>");
    expect(bundle.promptText).toContain('"statusRisco"');
    expect(bundle.mfeCaptureEfficiencyPercent).toBeGreaterThan(50);
  });

  test("5. Valida o Atalho Global de Teclado (Alt+J / Cmd+Shift+C / Ctrl+Shift+C) e disparo da Auditoria Instantânea no Store", () => {
    // Alt + J
    expect(
      isQuantCopilotHotkey({
        key: "j",
        code: "KeyJ",
        altKey: true,
        ctrlKey: false,
        metaKey: false,
      })
    ).toBe(true);

    // Cmd + Shift + C (macOS)
    expect(
      isQuantCopilotHotkey({
        key: "C",
        code: "KeyC",
        altKey: false,
        ctrlKey: false,
        metaKey: true,
        shiftKey: true,
      })
    ).toBe(true);

    // Ctrl + Shift + C (Linux / Windows)
    expect(
      isQuantCopilotHotkey({
        key: "c",
        code: "KeyC",
        altKey: false,
        ctrlKey: true,
        metaKey: false,
        shiftKey: true,
      })
    ).toBe(true);

    // Tecla comum não deve disparar
    expect(
      isQuantCopilotHotkey({
        key: "j",
        code: "KeyJ",
        altKey: false,
      })
    ).toBe(false);

    // Verifica transição de estado no Zustand Store sem trocar a seção ativa (ex.: "chart")
    useCryptoStore.getState().setActiveSection("chart");
    useCryptoStore.getState().setOpenQuantCopilotModal(false);
    const prevCount = useCryptoStore.getState().quantCopilotAutoAuditCount;

    useCryptoStore.getState().triggerQuantCopilotInstantAudit();

    const nextState = useCryptoStore.getState();
    expect(nextState.openQuantCopilotModal).toBe(true);
    expect(nextState.quantCopilotAutoAuditCount).toBe(prevCount + 1);
    expect(nextState.activeSection).toBe("chart");
  });

  test("6. Valida o Dry-Run Preview e Aplicação em 1 Clique das Recomendações Paramétricas na Frota Ativa (Apply to Active Fleet)", () => {
    const store = useCryptoStore.getState();
    const bots = store.bots;
    expect(bots.length).toBeGreaterThan(0);

    // Gera o Dry-Run Preview para calibragem de Trailing Stop / Realização Parcial TP1 (quando captura MFE < 60%)
    const preview = buildCopilotFleetDryRunPreview({
      actionIndex: 0,
      recommendation: {
        parametro: "Trailing Stop / Realização Parcial TP1",
        valorAtual: "TP1 50% @ +1.2% | SL -2.0%",
        valorSugerido: "TP1 60% @ +1.6% + Break-Even @ +1.35%",
        racionalQuant: "Captura MFE em 48% exige realização parcial mais rápida.",
      },
      bots,
      mfeCaptureEfficiencyPercent: 48.0,
      consecutiveLosses: 0,
    });

    expect(preview.executionMode).toBe("dry_run");
    expect(preview.guardrailValidation.passed).toBe(true);
    expect(preview.sanitizedPatch.stopLoss).toBeLessThanOrEqual(2.0);
    expect(preview.sanitizedPatch.usePartialTp).toBe(true);
    expect(preview.sanitizedPatch.partialTpPercent).toBe(60);
    expect(preview.sanitizedPatch.partialTpTrigger).toBe(1.6);
    expect(preview.dryRunPayloadJson).toContain('"execution_mode": "dry_run"');

    // Simula a confirmação explícita do operador aplicando o patch sanitizado no primeiro robô da frota
    const targetBotId = preview.targetBotIds[0];
    store.updateBot(targetBotId, {
      usePartialTp: preview.sanitizedPatch.usePartialTp,
      partialTpPercent: preview.sanitizedPatch.partialTpPercent,
      partialTpTrigger: preview.sanitizedPatch.partialTpTrigger,
      trailingStop: preview.sanitizedPatch.trailingStop,
      trailingStopDistance: preview.sanitizedPatch.trailingStopDistance,
      stopLoss: preview.sanitizedPatch.stopLoss,
    });

    const updatedBot = useCryptoStore.getState().bots.find((b) => b.id === targetBotId);
    expect(updatedBot?.usePartialTp).toBe(true);
    expect(updatedBot?.partialTpPercent).toBe(60);
    expect(updatedBot?.partialTpTrigger).toBe(1.6);
    expect(updatedBot?.stopLoss).toBe(1.8);
  });

  test("7. Garante Precisão Financeira de Ponto Fixo (Micro-Units 1e8), Ring Buffer O(1) e Sanitização Anti-Log-Injection", () => {
    // 1. Eliminação total de deriva IEEE-754 (0.1 + 0.2 === 0.3 exato)
    expect(addExactUsd(0.1, 0.2, 4)).toBe(0.3);
    expect(subExactUsd(0.3, 0.1, 4)).toBe(0.2);
    expect(mulExactUsd(100.125, 2, 4)).toBe(200.25);

    // 2. BoundedIdRingBuffer com despejo circular determinístico O(1)
    const ring = new BoundedIdRingBuffer(16);
    for (let i = 0; i < 20; i++) {
      ring.add(`evt_${i}`);
    }
    expect(ring.size).toBe(16);
    expect(ring.has("evt_0")).toBe(false); // Evicted deterministically
    expect(ring.has("evt_19")).toBe(true);

    // 3. Sanitização de strings contra Log Injection (CRLF / caracteres de controle ASCII)
    const maliciousInput = "BTCUSDT\r\n[CRITICAL] Fake Admin Log\u0000";
    const cleaned = sanitizeSafeString(maliciousInput, "FALLBACK", 64);
    expect(cleaned).not.toContain("\r");
    expect(cleaned).not.toContain("\n");
    expect(cleaned).not.toContain("\u0000");
  });

  test("8. Valida Otimização do Pipeline de IA: Model Cascading, Hybrid Search (BM25 + Cosseno RRF) e Governança Anti-Alucinação", () => {
    // 1. Model Cascading: roteia tarefas rápidas para SLMs/Mini e raciocínio complexo para modelos Frontier
    expect(selectCascadedModel("openai", "fast")).toBe("gpt-4o-mini");
    expect(selectCascadedModel("openai", "frontier")).toBe("o1");
    expect(selectCascadedModel("gemini", "fast")).toBe("gemini-flash-lite-latest");
    expect(selectCascadedModel("claude", "fast")).toBe("claude-haiku-4-5-20251001");

    // 2. Compressão Semântica XML no System Prompt do Agente de Sinais
    expect(AGENT_SYSTEM_PROMPT).toContain("<grounding_rules>");
    expect(AGENT_SYSTEM_PROMPT).toContain("<output_schema>");
    expect(AGENT_SYSTEM_PROMPT.length).toBeLessThan(950);

    // 3. Hybrid Search (BM25 + Dense Cosine Embedding + Reciprocal Rank Fusion RRF)
    const memStore = LongTermMemoryStore.getInstance();
    memStore.remember({
      category: "QUANT_STRATEGY",
      title: "Calibragem Trailing Stop ATR e Order Flow L2",
      summary: "Redução de devolução de MFE usando parcial TP1 em +1.6% e filtro RVOL > 3 sigma.",
      tags: ["mfe", "trailing-stop", "order-flow", "atr"],
      details: { minRr: 2.2 },
    });
    const hybridHits = memStore.recallHybrid("otimizar captura MFE trailing stop order flow", "QUANT_STRATEGY", 3);
    expect(hybridHits.length).toBeGreaterThan(0);
    expect(hybridHits[0].rrfScore).toBeGreaterThan(0);
    expect(hybridHits[0].denseCosineScore).toBeGreaterThan(0);

    // 4. Avaliação de Governança LLM (Faithfulness, Context Recall, JSON Schema Compliance e Detecção de Alucinação)
    const validDecision = {
      signal: "BUY",
      confidence_score: 84,
      risk_reward_ratio: 2.5,
      key_driver: "Tendência de alta com OFI comprador",
      risk_warning: "Volatilidade moderada antes do fechamento",
      stop_loss: 98.5,
      take_profit: 103.8,
    };
    const evalGood = evaluateLLMResponseGovernance({
      promptText: AGENT_SYSTEM_PROMPT,
      responseText: JSON.stringify(validDecision),
      parsedDecision: validDecision,
      referencePrice: 100,
      toolsInvokedCount: 3,
      requiredToolsCount: 3,
      modelTier: "fast",
    });
    expect(evalGood.faithfulnessScore).toBe(1);
    expect(evalGood.hallucinationRate).toBe(0);
    expect(evalGood.jsonSchemaCompliance).toBe(1);
    expect(evalGood.passedGovernanceGate).toBe(true);

    // Caso de alucinação: recomenda BUY sem invocar ferramentas (toolsInvokedCount = 0) e com stop_loss fora de escala
    const hallucinatedDecision = {
      signal: "BUY",
      stop_loss: 10, // -90% de distância absurda do preço de referência 100
      take_profit: 250,
    };
    const evalBad = evaluateLLMResponseGovernance({
      promptText: AGENT_SYSTEM_PROMPT,
      responseText: JSON.stringify(hallucinatedDecision),
      parsedDecision: hallucinatedDecision,
      referencePrice: 100,
      toolsInvokedCount: 0,
      requiredToolsCount: 3,
      modelTier: "fast",
    });
    expect(evalBad.hallucinationRate).toBeGreaterThan(0.5);
    expect(evalBad.passedGovernanceGate).toBe(false);

    // Gatekeeper determinístico veta R:R < 2.2
    const gated = applyGatekeeper(
      { signal: "BUY", confidence_score: 80, stop_loss: 98, take_profit: 101 },
      100
    );
    expect(gated.signal).toBe("HOLD");
    expect(gated.vetoed).toBe(true);
  });
});
