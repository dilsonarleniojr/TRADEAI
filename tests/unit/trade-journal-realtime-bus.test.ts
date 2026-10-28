import { describe, it, expect, beforeEach } from "bun:test";
import {
  tradeJournalEngine,
  TRADE_EXECUTION_CHANNEL_NAME,
  TRADE_EXECUTION_CUSTOM_EVENT,
  JOURNAL_UPDATED_CUSTOM_EVENT,
  type BotExecutionEventPayload,
  type TradeJournalRecord,
} from "@/lib/journal/trade-journal-engine";
import { DirectOperationManager, type DirectOperationSession } from "@/lib/bot/pilot/direct-operation-manager";

describe("TradeJournalEngine Real-Time Execution Bus (BroadcastChannel & CustomEvent)", () => {
  beforeEach(() => {
    tradeJournalEngine.clearAllRecords();
  });

  it("acumula novos pontos na curva de patrimônio em tempo real quando eventos de TP e SL são disparados pelo Live Fleet e Direct AI Trade", () => {
    const snapshots: number[] = [];
    const executionEvents: Array<{ record: TradeJournalRecord; event: BotExecutionEventPayload }> = [];

    const unsubJournal = tradeJournalEngine.subscribe((records) => {
      const metrics = tradeJournalEngine.calculateMetrics(records, 1000);
      snapshots.push(metrics.equityCurve.length);
    });

    const unsubExec = tradeJournalEngine.subscribeExecutionEvents((record, event) => {
      executionEvents.push({ record, event });
    });

    // Inicialmente sem trades -> 1 ponto base na curva (Início = $1000)
    expect(snapshots[snapshots.length - 1]).toBe(1);

    // 1. Live Fleet aciona Take-Profit parcial
    tradeJournalEngine.dispatchExecutionEvent({
      eventId: "fleet_partial_1",
      source: "LIVE_FLEET",
      triggerType: "PARTIAL_TAKE_PROFIT",
      botId: "bot-alpha",
      botName: "Alpha Trend",
      symbol: "BTCUSDT",
      side: "BUY",
      mode: "paper",
      strategy: "EMA_CROSS",
      entryPrice: 60000,
      exitPrice: 61200,
      quantity: 0.01,
      entryTimestampMs: Date.now() - 120000,
      exitTimestampMs: Date.now() - 60000,
      exitReason: "TP_PARCIAL_50PCT",
    });

    // Com 1 trade encerrado, a curva de patrimônio possui Ponto Inicial (Base $1000) + 1º Trade = 2 pontos
    expect(snapshots[snapshots.length - 1]).toBe(2);
    expect(executionEvents.length).toBe(1);
    expect(executionEvents[0].event.source).toBe("LIVE_FLEET");
    expect(executionEvents[0].event.triggerType).toBe("PARTIAL_TAKE_PROFIT");

    // 2. Direct AI Trade aciona Stop-Loss / Trailing Stop
    tradeJournalEngine.dispatchExecutionEvent({
      eventId: "direct_close_sess_01",
      source: "DIRECT_AI_TRADE",
      triggerType: "TRAILING_STOP",
      botId: "sess_01",
      botName: "Direct AI Sniper (Runner)",
      symbol: "SOLUSDT",
      side: "BUY",
      mode: "paper",
      strategy: "AI_SNIPER",
      entryPrice: 150,
      exitPrice: 153.5,
      quantity: 2,
      entryTimestampMs: Date.now() - 50000,
      exitTimestampMs: Date.now(),
      exitReason: "TP3_RUNNER_TRAILING_STOP",
    });

    // A curva de patrimônio acumula imediatamente o 3º ponto sem necessidade de refresh manual
    expect(snapshots[snapshots.length - 1]).toBe(3);
    expect(executionEvents.length).toBe(2);
    expect(executionEvents[1].event.source).toBe("DIRECT_AI_TRADE");
    expect(executionEvents[1].event.triggerType).toBe("TRAILING_STOP");

    const finalMetrics = tradeJournalEngine.calculateMetrics(tradeJournalEngine.getAllRecords(), 1000);
    expect(finalMetrics.equityCurve.length).toBe(3);
    expect(finalMetrics.equityCurve[2].equity).toBeGreaterThan(1000);

    unsubJournal();
    unsubExec();
  });

  it("garante idempotência O(1) contra eventos duplicados de mesmo eventId entre servidor/cliente/abas", () => {
    const payload: BotExecutionEventPayload = {
      eventId: "dedup_event_123",
      source: "DIRECT_AI_TRADE",
      triggerType: "TAKE_PROFIT",
      botId: "sess_dedup",
      botName: "Direct AI Sniper",
      symbol: "ETHUSDT",
      side: "BUY",
      mode: "paper",
      entryPrice: 3000,
      exitPrice: 3090,
      quantity: 0.5,
      exitReason: "TARGET_REACHED",
    };

    const rec1 = tradeJournalEngine.dispatchExecutionEvent(payload);
    const rec2 = tradeJournalEngine.dispatchExecutionEvent(payload);

    expect(rec1.id).toBe("dedup_event_123");
    expect(rec2.id).toBe("dedup_event_123");
    expect(tradeJournalEngine.getAllRecords().length).toBe(1);
  });

  it("escuta CustomEvent(TRADE_EXECUTION_CUSTOM_EVENT) disparado no barramento global e emite JOURNAL_UPDATED_CUSTOM_EVENT", () => {
    let updatedEventReceived = false;
    const onUpdated = (evt: Event) => {
      const customEvt = evt as CustomEvent;
      if (customEvt.detail?.latestRecord?.symbol === "AVAXUSDT") {
        updatedEventReceived = true;
      }
    };

    globalThis.addEventListener(JOURNAL_UPDATED_CUSTOM_EVENT, onUpdated);

    const externalPayload: BotExecutionEventPayload = {
      eventId: "custom_evt_avax_1",
      source: "LIVE_FLEET",
      triggerType: "STOP_LOSS",
      botId: "bot-avax",
      botName: "AVAX Scalper",
      symbol: "AVAXUSDT",
      side: "BUY",
      mode: "paper",
      entryPrice: 35,
      exitPrice: 34.3,
      quantity: 10,
      exitReason: "STOP_LOSS_FIXO",
    };

    globalThis.dispatchEvent(
      new CustomEvent(TRADE_EXECUTION_CUSTOM_EVENT, {
        detail: externalPayload,
      })
    );

    globalThis.removeEventListener(JOURNAL_UPDATED_CUSTOM_EVENT, onUpdated);

    expect(updatedEventReceived).toBe(true);
    expect(tradeJournalEngine.getAllRecords().length).toBe(1);
    expect(tradeJournalEngine.getAllRecords()[0].symbol).toBe("AVAXUSDT");
    expect(tradeJournalEngine.getChannelStatus().lastTriggerType).toBe("STOP_LOSS");
  });

  it("sincroniza eventos via BroadcastChannel quando mensagens chegam no canal tradeai_execution_channel_v1", async () => {
    if (typeof BroadcastChannel === "undefined") {
      return;
    }

    const peerChannel = new BroadcastChannel(TRADE_EXECUTION_CHANNEL_NAME);
    const syncedPromise = new Promise<TradeJournalRecord>((resolve) => {
      const unsub = tradeJournalEngine.subscribe((records) => {
        const found = records.find((r) => r.id === "bc_peer_trade_01");
        if (found) {
          unsub();
          resolve(found);
        }
      });
    });

    const peerRecord: TradeJournalRecord = {
      id: "bc_peer_trade_01",
      botId: "peer-bot",
      botName: "Peer Fleet Bot",
      symbol: "BNBUSDT",
      side: "BUY",
      mode: "paper",
      strategy: "MOMENTUM",
      entryPrice: 580,
      exitPrice: 595,
      quantity: 1,
      totalInvested: 580,
      totalReturned: 595,
      grossPnl: 15,
      netPnl: 13.82,
      netGainPercent: 2.38,
      commissionFeesUsd: 1.18,
      spreadCostUsd: 0.29,
      highestPrice: 596,
      lowestPrice: 579,
      maePercent: -0.17,
      mfePercent: 2.75,
      entryTime: new Date(Date.now() - 60000).toISOString(),
      exitTime: new Date().toISOString(),
      entryTimestampMs: Date.now() - 60000,
      exitTimestampMs: Date.now(),
      durationMs: 60000,
      durationMinutes: 1,
      durationFormatted: "1m 0s",
      exitReason: "TAKE_PROFIT",
    };

    peerChannel.postMessage({
      type: "BOT_EXECUTION_RECORDED",
      record: peerRecord,
      event: {
        eventId: peerRecord.id,
        source: "LIVE_FLEET",
        triggerType: "TAKE_PROFIT",
        symbol: "BNBUSDT",
        entryPrice: 580,
        exitPrice: 595,
        quantity: 1,
        exitReason: "TAKE_PROFIT",
      },
    });

    const syncedRecord = await syncedPromise;
    peerChannel.close();

    expect(syncedRecord.symbol).toBe("BNBUSDT");
    const metrics = tradeJournalEngine.calculateMetrics(tradeJournalEngine.getAllRecords(), 1000);
    expect(metrics.equityCurve.length).toBe(2);
    expect(metrics.equityCurve[1].equity).toBeCloseTo(1013.82, 2);
  });

  it("integra DirectOperationManager (TP1 e encerramento final) diretamente ao TradeJournalEngine em tempo real", async () => {
    const session = DirectOperationManager.createSessionForTesting({
      id: "sess_live_bridge_01",
      symbol: "BTCUSDT",
      baseCurrency: "BTC",
      quoteCurrency: "USDT",
      investedAmountUsd: 100,
      durationMinutes: 15,
      startTime: Date.now() - 120000,
      endTime: Date.now() + 600000,
      entryPrice: 60000,
      targetPrice: 63000,
      stopLossPrice: 59100,
      quantity: 0.001666,
      notionalUsd: 100,
      riskUsd: 1.5,
      status: "ACTIVE",
      mode: "paper",
      currentPrice: 60000,
      unrealizedPnlUsd: 0,
      unrealizedPnlPercent: 0,
      realizedPnlUsd: 0,
      realizedPnlPercent: 0,
      feeDeductedUsd: 0,
      tp1Price: 60600,
      tp2Price: 61500,
      tp3Price: 63000,
      isTp1Taken: false,
      isTp2Taken: false,
      highestPriceReached: 60000,
      lowestPriceReached: 59950,
      injectedOrderBookRatio: 0.85,
    });

    // Simula tick atingindo TP1 ($60,700 >= tp1Price $60,600)
    await DirectOperationManager.processPriceTick(session.id, 60700);

    const recordsAfterTp1 = tradeJournalEngine.getAllRecords();
    expect(recordsAfterTp1.some((r) => r.id === `direct_tp1_${session.id}`)).toBe(true);

    // Simula fechamento final no alvo (TARGET_REACHED)
    await DirectOperationManager.closeOperation(session.id, "TARGET_REACHED", 63000);

    const recordsAfterClose = tradeJournalEngine.getAllRecords();
    expect(recordsAfterClose.some((r) => r.id === `direct_close_${session.id}`)).toBe(true);

    const metrics = tradeJournalEngine.calculateMetrics(recordsAfterClose, 1000);
    // Ponto inicial + TP1 + Fechamento Final = 3 pontos na curva de patrimônio
    expect(metrics.equityCurve.length).toBe(3);
    expect(metrics.totalNetPnl).toBeGreaterThan(0);
  });
});
