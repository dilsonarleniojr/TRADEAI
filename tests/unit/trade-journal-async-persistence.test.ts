import { describe, it, expect, beforeEach } from "bun:test";
import {
  tradeJournalEngine,
  type TradeJournalRecord,
} from "@/lib/journal/trade-journal-engine";
import {
  journalPersistenceManager,
  JOURNAL_PERSISTENCE_DEBOUNCE_MS,
} from "@/lib/journal/journal-persistence-worker-manager";
import {
  getJournalPersistenceWorkerSource,
  JOURNAL_IDB_NAME,
  JOURNAL_IDB_STORE,
} from "@/workers/journal-persistence.worker";
import {
  persistJournalBatchToSqlite,
  loadJournalRecordsFromSqlite,
  clearJournalSqlite,
} from "@/app/api/journal/sync/route";

describe("Persistência Assíncrona em Lote (500ms Debounced Batch Write - IndexedDB + SQLite WAL)", () => {
  beforeEach(async () => {
    tradeJournalEngine.clearAllRecords();
    journalPersistenceManager.resetTelemetryForTesting();
    journalPersistenceManager.configure({
      debounceMs: JOURNAL_PERSISTENCE_DEBOUNCE_MS,
      maxBatchSize: 200,
      sqliteSyncEnabled: false,
      customBatchSink: null,
    });
  });

  it("coalesce rajadas de eventos parciais (TP1/TP2 + Live Fleet) em uma única escrita em lote debounced", async () => {
    const flushedBatches: TradeJournalRecord[][] = [];

    tradeJournalEngine.configurePersistence({
      debounceMs: 60,
      maxBatchSize: 500,
      customBatchSink: async (batch) => {
        flushedBatches.push(batch);
        return { persistedIndexedDb: batch.length, persistedSqlite: batch.length };
      },
    });

    // Dispara 40 eventos parciais consecutivos (Direct AI Trade TP1/TP2 + Live Fleet)
    for (let i = 0; i < 40; i++) {
      tradeJournalEngine.dispatchExecutionEvent({
        eventId: `burst_partial_${i}`,
        source: i % 2 === 0 ? "DIRECT_AI_TRADE" : "LIVE_FLEET",
        triggerType: "PARTIAL_TAKE_PROFIT",
        botId: `bot_${i % 4}`,
        botName: i % 2 === 0 ? "Direct AI Sniper (TP1)" : "Fleet Alpha",
        symbol: i % 2 === 0 ? "BTCUSDT" : "SOLUSDT",
        side: "BUY",
        mode: "paper",
        entryPrice: 60000,
        exitPrice: 60600 + i * 5,
        quantity: 0.01,
        exitTimestampMs: Date.now() + i,
        exitReason: i % 2 === 0 ? "TP1_PARTIAL_33PCT" : "TP_PARCIAL_50PCT",
      });
    }

    // Imediatamente após a rajada síncrona, nenhum flush bloqueante ocorreu: todos os 40 estão no buffer O(1)
    const immediateStats = tradeJournalEngine.getPersistenceStats();
    expect(immediateStats.pendingBatchSize).toBe(40);
    expect(flushedBatches.length).toBe(0);

    // Aguarda a janela de debounce expirar
    await new Promise((r) => setTimeout(r, 110));

    expect(flushedBatches.length).toBe(1);
    expect(flushedBatches[0].length).toBe(40);

    const postFlushStats = tradeJournalEngine.getPersistenceStats();
    expect(postFlushStats.pendingBatchSize).toBe(0);
    expect(postFlushStats.totalBatchesFlushed).toBe(1);
    expect(postFlushStats.totalRecordsPersisted).toBe(40);
    expect(postFlushStats.mainThreadFullJsonSerializations).toBe(0);
  });

  it("processa > 1.200 execuções em alta frequência sem serialização JSON.stringify síncrona na Main Thread", async () => {
    let sinkCalls = 0;
    let totalSinkRecords = 0;

    tradeJournalEngine.configurePersistence({
      debounceMs: 500,
      maxBatchSize: 300,
      customBatchSink: (batch) => {
        sinkCalls++;
        totalSinkRecords += batch.length;
        return { persistedIndexedDb: batch.length, persistedSqlite: batch.length };
      },
    });

    const totalExecutions = 1250;
    const startMs = performance.now();

    for (let i = 0; i < totalExecutions; i++) {
      tradeJournalEngine.dispatchExecutionEvent({
        eventId: `hft_exec_${i}`,
        source: i % 3 === 0 ? "DIRECT_AI_TRADE" : "LIVE_FLEET",
        triggerType: i % 2 === 0 ? "PARTIAL_TAKE_PROFIT" : "TAKE_PROFIT",
        botId: `hft_bot_${i % 8}`,
        botName: "HFT Scalper",
        symbol: "ETHUSDT",
        side: "BUY",
        mode: "paper",
        entryPrice: 3000,
        exitPrice: 3015 + (i % 20),
        quantity: 0.1,
        entryTimestampMs: Date.now() - 10000 + i,
        exitTimestampMs: Date.now() + i,
        exitReason: "TP_SCALP",
      });
    }

    const ingestElapsedMs = performance.now() - startMs;
    const avgLatencyPerEventMs = ingestElapsedMs / totalExecutions;

    // Força o flush residual do último lote
    const finalStats = await tradeJournalEngine.flushPersistence();

    // Verifica que todas as 1.250 execuções estão retidas em memória (> 1.000) e foram persistidas em lotes
    expect(tradeJournalEngine.getAllRecords().length).toBe(totalExecutions);
    expect(totalSinkRecords).toBe(totalExecutions);
    expect(finalStats.totalRecordsPersisted).toBe(totalExecutions);
    expect(finalStats.mainThreadFullJsonSerializations).toBe(0);
    expect(sinkCalls).toBeGreaterThanOrEqual(4); // 1250 / 300 => 4 auto-flushes + 1 residual
    expect(avgLatencyPerEventMs).toBeLessThan(0.5);
  });

  it("persiste e recupera lotes transacionais diretamente no SQLite WAL via /api/journal/sync helpers", async () => {
    await clearJournalSqlite();

    const sampleRecords: TradeJournalRecord[] = [
      {
        id: "sqlite_batch_rec_1",
        botId: "direct-sess-101",
        botName: "Direct AI Sniper (TP1)",
        symbol: "BTCUSDT",
        side: "BUY",
        mode: "paper",
        strategy: "AI_SNIPER",
        source: "DIRECT_AI_TRADE",
        triggerType: "PARTIAL_TAKE_PROFIT",
        entryPrice: 64000,
        exitPrice: 64800,
        quantity: 0.05,
        totalInvested: 3200,
        totalReturned: 3240,
        grossPnl: 40,
        netPnl: 33.56,
        gainPercent: 1.25,
        netGainPercent: 1.05,
        commissionFeesUsd: 6.44,
        spreadCostUsd: 0.96,
        highestPrice: 64900,
        lowestPrice: 63950,
        maePrice: 63950,
        maePercent: -0.08,
        mfePrice: 64900,
        mfePercent: 1.41,
        entryTime: new Date(Date.now() - 90000).toISOString(),
        exitTime: new Date(Date.now() - 30000).toISOString(),
        entryTimestampMs: Date.now() - 90000,
        exitTimestampMs: Date.now() - 30000,
        durationMs: 60000,
        durationMinutes: 1,
        durationFormatted: "1m 0s",
        exitReason: "TP1_PARTIAL_33PCT",
        notes: "Teste SQLite WAL Batch 1",
      },
      {
        id: "sqlite_batch_rec_2",
        botId: "fleet-bot-202",
        botName: "Live Fleet Momentum",
        symbol: "SOLUSDT",
        side: "BUY",
        mode: "live",
        strategy: "MOMENTUM_BREAKOUT",
        source: "LIVE_FLEET",
        triggerType: "TAKE_PROFIT",
        entryPrice: 160,
        exitPrice: 166.4,
        quantity: 5,
        totalInvested: 800,
        totalReturned: 832,
        grossPnl: 32,
        netPnl: 30.12,
        gainPercent: 4.0,
        netGainPercent: 3.76,
        commissionFeesUsd: 1.63,
        spreadCostUsd: 0.25,
        highestPrice: 167,
        lowestPrice: 159.5,
        maePrice: 159.5,
        maePercent: -0.31,
        mfePrice: 167,
        mfePercent: 4.38,
        entryTime: new Date(Date.now() - 60000).toISOString(),
        exitTime: new Date().toISOString(),
        entryTimestampMs: Date.now() - 60000,
        exitTimestampMs: Date.now(),
        durationMs: 60000,
        durationMinutes: 1,
        durationFormatted: "1m 0s",
        exitReason: "TAKE_PROFIT",
        notes: "Teste SQLite WAL Batch 2",
      },
    ];

    const writeRes = await persistJournalBatchToSqlite(sampleRecords);
    expect(writeRes.persistedCount).toBe(2);

    const loadedAll = await loadJournalRecordsFromSqlite(100);
    expect(loadedAll.length).toBe(2);
    expect(loadedAll[0].id).toBe("sqlite_batch_rec_2"); // Ordenado por exitTimestampMs DESC
    expect(loadedAll[1].id).toBe("sqlite_batch_rec_1");

    const loadedSolLive = await loadJournalRecordsFromSqlite(100, "SOLUSDT", "live");
    expect(loadedSolLive.length).toBe(1);
    expect(loadedSolLive[0].symbol).toBe("SOLUSDT");
    expect(loadedSolLive[0].triggerType).toBe("TAKE_PROFIT");

    await clearJournalSqlite();
    const afterClear = await loadJournalRecordsFromSqlite(100);
    expect(afterClear.length).toBe(0);
  });

  it("valida o código-fonte do Web Worker de persistência (IndexedDB + /api/journal/sync)", () => {
    const workerCode = getJournalPersistenceWorkerSource();
    expect(workerCode).toContain(JOURNAL_IDB_NAME);
    expect(workerCode).toContain(JOURNAL_IDB_STORE);
    expect(workerCode).toContain("FLUSH_BATCH");
    expect(workerCode).toContain("LOAD_ALL");
    expect(workerCode).toContain("/api/journal/sync");
  });
});
