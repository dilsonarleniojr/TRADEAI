import { describe, expect, test } from "bun:test";
import {
  calculateMfeCaptureEfficiency,
  calculateBipartiteExcursionWidths,
  computeUnderwaterDrawdownSeries,
  computeInstitutionalRiskTelemetry,
  buildPostTradeCoTPrompt,
} from "@/lib/journal/post-trade-copilot-prompt";
import { TradeJournalEngine } from "@/lib/journal/trade-journal-engine";
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
});
