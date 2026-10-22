import { describe, it, expect, beforeEach } from "bun:test";
import { GraduatedCircuitBreaker } from "@/lib/bot/pilot/chaos-test-harness";
import { DirectOperationManager } from "@/lib/bot/pilot/direct-operation-manager";
import type { SpoofingAlert } from "@/lib/order-book-imbalance";

describe("Radar Sniper & GraduatedCircuitBreaker: Liquidity Spoofing Guard", () => {
  let cb: GraduatedCircuitBreaker;

  beforeEach(() => {
    cb = GraduatedCircuitBreaker.getInstance();
    cb.reset();
  });

  it("deve registrar o alerta de spoofing no GraduatedCircuitBreaker e aplicar pausa de 3000ms", () => {
    const alert: SpoofingAlert = {
      isAlertActive: true,
      side: "BID",
      dropPct: 35.5,
      severity: "WARNING",
      timeDeltaMs: 400,
      timestamp: Date.now(),
      message: "Queda súbita de 35.5% no Bid detectada",
      advice: "Pausar despacho a mercado.",
    };

    cb.registerSpoofingAlert("BTCUSDT", alert);

    expect(cb.isSpoofingHalted("BTCUSDT")).toBe(true);
    expect(cb.getSpoofingAlert("BTCUSDT")).not.toBeNull();
    expect(cb.getSpoofingAlert("BTCUSDT")?.dropPct).toBe(35.5);

    // Avaliação de saúde deve refletir a pausa de spoofing
    const health = cb.evaluateHealth({ symbol: "BTCUSDT" });
    expect(health.canOpenNewOrder).toBe(false);
    expect(health.tier).toBe("TIER_SPOOFING_PAUSE");
    expect(health.reason).toContain("Liquidity Spoofing Guard Ativo");
  });

  it("não deve acionar pausa no Circuit Breaker se a oscilação for inferior a 30%", () => {
    const normalAlert: SpoofingAlert = {
      isAlertActive: false,
      side: "BID",
      dropPct: 15.0,
      severity: "WARNING",
      timeDeltaMs: 400,
      timestamp: Date.now(),
      message: "Normal",
      advice: "Normal",
    };

    cb.registerSpoofingAlert("ETHUSDT", normalAlert);
    expect(cb.isSpoofingHalted("ETHUSDT")).toBe(false);

    const health = cb.evaluateHealth({ symbol: "ETHUSDT" });
    expect(health.canOpenNewOrder).toBe(true);
    expect(health.tier).toBe("NORMAL");
  });

  it("deve pausar o despacho do Radar Sniper por 3 segundos quando spoofing for detectado no disparo", async () => {
    // 1. Cria sessão simulada em WAITING_TRIGGER
    const session = DirectOperationManager.createSessionForTesting({
      symbol: "SOLUSDT",
      status: "WAITING_TRIGGER",
      targetEntryPrice: 150.0,
      entryPrice: 150.0,
      triggerCondition: {
        triggerType: "RADAR_SNIPER",
        targetPrice: 150.0,
        triggerDirection: "LESS_THAN_OR_EQUAL",
        expirationMinutes: 15,
      },
    });

    // 2. Simula SpoofingAlert ativo no momento do disparo (preço atinge 149.90 <= 150.0)
    const spoofAlert: SpoofingAlert = {
      isAlertActive: true,
      side: "BID",
      dropPct: 42.0,
      severity: "WARNING",
      timeDeltaMs: 250,
      timestamp: Date.now(),
      message: "Parede de 42% no Bid evaporou",
      advice: "Aguardar reconstituição do suporte",
    };

    // Registra alerta no circuit breaker e na sessão
    cb.registerSpoofingAlert("SOLUSDT", spoofAlert);
    session.injectedSpoofingAlert = spoofAlert;

    // 3. Processa o tick de preço que normalmente ativaria a sessão
    const afterTick = await DirectOperationManager.processPriceTick(session.id, 149.90);

    // 4. Valida que a sessão NÃO foi ativada, permaneceu em WAITING_TRIGGER e pausou o radar
    expect(afterTick.status).toBe("WAITING_TRIGGER");
    expect(afterTick.isSpoofingProtectionTriggered).toBe(true);
    expect(afterTick.spoofingEvasionsCount).toBe(1);
    expect(afterTick.radarPausedUntil).toBeGreaterThan(Date.now());
    expect(afterTick.spoofingEvents).toBeDefined();
    expect(afterTick.spoofingEvents?.length).toBe(1);
    expect(afterTick.spoofingEvents?.[0].dropPct).toBe(42.0);
    expect(afterTick.spoofingEvents?.[0].side).toBe("BID");
    expect(afterTick.spoofingEvents?.[0].price).toBe(149.90);

    // 5. Novo tick durante a janela de pausa deve ser imediatamente ignorado
    const duringPause = await DirectOperationManager.processPriceTick(session.id, 149.80);
    expect(duringPause.status).toBe("WAITING_TRIGGER");
    expect(duringPause.spoofingEvasionsCount).toBe(1); // Não reincrementa dentro da mesma pausa

    DirectOperationManager.clearSession(session.id);
  });

  it("deve reavaliar e ativar a sessão quando a pausa de 3 segundos expirar e o book estiver estável", async () => {
    const session = DirectOperationManager.createSessionForTesting({
      symbol: "ADAUSDT",
      status: "WAITING_TRIGGER",
      targetEntryPrice: 0.50,
      entryPrice: 0.50,
      triggerCondition: {
        triggerType: "RADAR_SNIPER",
        targetPrice: 0.50,
        triggerDirection: "LESS_THAN_OR_EQUAL",
        expirationMinutes: 15,
      },
    });

    // Simula que a pausa expirou no passado
    session.radarPausedUntil = Date.now() - 50;
    session.isSpoofingProtectionTriggered = false;
    session.injectedSpoofingAlert = null;
    cb.reset();

    // Processa o tick com preço no alvo e book limpo
    const activated = await DirectOperationManager.processPriceTick(session.id, 0.499);

    expect(activated.status).toBe("ACTIVE");
    expect(activated.entryPrice).toBe(0.499);

    DirectOperationManager.clearSession(session.id);
  });

  it("deve permitir forceEntry() mesmo se houver spoofing ativo (soberania do operador)", async () => {
    const session = DirectOperationManager.createSessionForTesting({
      symbol: "BNBUSDT",
      status: "WAITING_TRIGGER",
      targetEntryPrice: 600.0,
      entryPrice: 600.0,
    });

    const spoofAlert: SpoofingAlert = {
      isAlertActive: true,
      side: "BID",
      dropPct: 48.0,
      severity: "CRITICAL",
      timeDeltaMs: 150,
      timestamp: Date.now(),
      message: "Parede de 48% cancelada",
      advice: "Perigo iminente",
    };
    cb.registerSpoofingAlert("BNBUSDT", spoofAlert);
    session.injectedSpoofingAlert = spoofAlert;

    // Força entrada manual (force = true)
    const forced = await DirectOperationManager.forceEntry(session.id);

    expect(forced.status).toBe("ACTIVE");

    DirectOperationManager.clearSession(session.id);
  });

  it("deve registrar e consultar eventos globais de evasão de spoofing para o gráfico principal", () => {
    DirectOperationManager.clearSpoofingEvents();

    const timestamp1 = Date.now() - 60000;
    const timestamp2 = Date.now() - 10000;

    DirectOperationManager.recordSpoofingEvasion("SOLUSDT", {
      timestamp: timestamp1,
      price: 152.4,
      dropPct: 38.5,
      side: "BID",
      actionTaken: "Despacho pausado por 3s para reavaliar profundidade real",
    });

    DirectOperationManager.recordSpoofingEvasion("BTCUSDT", {
      timestamp: timestamp2,
      price: 64200.0,
      dropPct: 45.0,
      side: "ASK",
      actionTaken: "Despacho pausado por 3s para reavaliar profundidade real",
    });

    const allEvents = DirectOperationManager.getSpoofingEvents();
    expect(allEvents.length).toBe(2);

    const solEvents = DirectOperationManager.getSpoofingEvents("SOLUSDT");
    expect(solEvents.length).toBe(1);
    expect(solEvents[0].symbol).toBe("SOLUSDT");
    expect(solEvents[0].price).toBe(152.4);
    expect(solEvents[0].dropPct).toBe(38.5);
    expect(solEvents[0].side).toBe("BID");

    const btcEvents = DirectOperationManager.getSpoofingEvents("BTCUSDT");
    expect(btcEvents.length).toBe(1);
    expect(btcEvents[0].symbol).toBe("BTCUSDT");
    expect(btcEvents[0].price).toBe(64200.0);
    expect(btcEvents[0].dropPct).toBe(45.0);
    expect(btcEvents[0].side).toBe("ASK");

    DirectOperationManager.clearSpoofingEvents();
  });

  it("deve registrar evento global de evasão de spoofing automaticamente quando o Radar Sniper pausar o disparo", async () => {
    DirectOperationManager.clearSpoofingEvents();

    const session = DirectOperationManager.createSessionForTesting({
      symbol: "AVAXUSDT",
      status: "WAITING_TRIGGER",
      targetEntryPrice: 28.50,
      entryPrice: 28.50,
      triggerCondition: {
        triggerType: "RADAR_SNIPER",
        targetPrice: 28.50,
        triggerDirection: "LESS_THAN_OR_EQUAL",
        expirationMinutes: 15,
      },
    });

    const spoofAlert: SpoofingAlert = {
      isAlertActive: true,
      side: "BID",
      dropPct: 36.2,
      severity: "WARNING",
      timeDeltaMs: 250,
      timestamp: Date.now(),
      message: "Parede cancelada no Bid (-36.2%)",
      advice: "Pausar",
    };
    cb.registerSpoofingAlert("AVAXUSDT", spoofAlert);
    session.injectedSpoofingAlert = spoofAlert;

    // Processa tick que ativa a proteção
    await DirectOperationManager.processPriceTick(session.id, 28.45);

    const avaxEvents = DirectOperationManager.getSpoofingEvents("AVAXUSDT");
    expect(avaxEvents.length).toBeGreaterThanOrEqual(1);
    expect(avaxEvents[0].symbol).toBe("AVAXUSDT");
    expect(avaxEvents[0].dropPct).toBe(36.2);
    expect(avaxEvents[0].side).toBe("BID");

    DirectOperationManager.clearSession(session.id);
    DirectOperationManager.clearSpoofingEvents();
  });
});

