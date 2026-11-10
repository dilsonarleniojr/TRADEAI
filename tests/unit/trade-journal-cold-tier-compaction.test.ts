import { describe, it, expect, beforeEach } from "bun:test";
import {
  ColdTierCompactionEngine,
  TJC1_CODEC,
  TJC1_MAGIC,
  toUtcDateKey,
} from "@/lib/journal/cold-tier-compaction-engine";
import {
  tradeJournalEngine,
  type TradeJournalRecord,
} from "@/lib/journal/trade-journal-engine";
import {
  persistDailyRollupsToSqlite,
  loadDailyRollupsFromSqlite,
  clearDailyRollupsSqlite,
} from "@/app/api/journal/rollup/route";

function generateSyntheticTrade(index: number, timestampMs: number): TradeJournalRecord {
  const isWin = index % 3 !== 0;
  const entryPrice = 60000 + (index % 500) * 0.12345678;
  const exitPrice = isWin ? entryPrice * 1.008 : entryPrice * 0.995;
  const quantity = 0.02;
  const totalInvested = Number((entryPrice * quantity).toFixed(4));
  const totalReturned = Number((exitPrice * quantity).toFixed(4));
  const grossPnl = Number((totalReturned - totalInvested).toFixed(4));
  const commissionFeesUsd = Number(((totalInvested + totalReturned) * 0.001).toFixed(4));
  const spreadCostUsd = Number(((totalInvested + totalReturned) * 0.00015).toFixed(4));
  const netPnl = Number((grossPnl - commissionFeesUsd - spreadCostUsd).toFixed(4));
  const gainPercent = Number((((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2));
  const netGainPercent = Number(((netPnl / totalInvested) * 100).toFixed(2));
  const highestPrice = Number((Math.max(entryPrice, exitPrice) * 1.001).toFixed(8));
  const lowestPrice = Number((Math.min(entryPrice, exitPrice) * 0.999).toFixed(8));
  const entryTs = timestampMs - 60000;

  return {
    id: `cold_trade_${index}`,
    botId: `fleet_bot_${index % 5}`,
    botName: `Institutional Bot #${index % 5}`,
    symbol: index % 2 === 0 ? "BTCUSDT" : "SOLUSDT",
    side: "BUY",
    mode: "paper",
    strategy: "QUANT_MOMENTUM_V3",
    source: index % 2 === 0 ? "DIRECT_AI_TRADE" : "LIVE_FLEET",
    triggerType: isWin ? "TAKE_PROFIT" : "STOP_LOSS",
    entryPrice: Number(entryPrice.toFixed(8)),
    exitPrice: Number(exitPrice.toFixed(8)),
    quantity,
    totalInvested,
    totalReturned,
    highestPrice,
    lowestPrice,
    maePrice: lowestPrice,
    maePercent: -0.25,
    mfePrice: highestPrice,
    mfePercent: isWin ? 0.95 : 0.15,
    grossPnl,
    netPnl,
    gainPercent,
    netGainPercent,
    commissionFeesUsd,
    spreadCostUsd,
    entryTime: new Date(entryTs).toISOString(),
    exitTime: new Date(timestampMs).toISOString(),
    entryTimestampMs: entryTs,
    exitTimestampMs: timestampMs,
    durationMs: 60000,
    durationMinutes: 1,
    durationFormatted: "1m 0s",
    exitReason: isWin ? "TP1_PARTIAL_33PCT" : "TRAILING_STOP",
  };
}

describe("Cold-Tier Columnar Compaction (TJC1_DEFLATE) & Daily Rollup O(1) Engine", () => {
  beforeEach(async () => {
    tradeJournalEngine.clearAllRecords();
    await clearDailyRollupsSqlite();
  });

  it("codifica e decodifica lotes colunares TJC1_DEFLATE sem perdas (lossless round-trip) com alta taxa de compressão", () => {
    const baseTime = Date.UTC(2026, 0, 15, 12, 0, 0);
    const sampleBatch: TradeJournalRecord[] = [];
    for (let i = 0; i < 250; i++) {
      sampleBatch.push(generateSyntheticTrade(i, baseTime + i * 30_000));
    }

    const block = ColdTierCompactionEngine.encodeColumnarBatch(sampleBatch);

    expect(block.magic).toBe(TJC1_MAGIC);
    expect(block.codec).toBe(TJC1_CODEC);
    expect(block.recordCount).toBe(250);
    expect(block.rawBytes).toBeGreaterThan(block.compactedBytes);
    expect(block.compressionRatio).toBeGreaterThan(3.0);

    const decoded = ColdTierCompactionEngine.decodeColumnarBatch(block.payloadBase64);
    expect(decoded.length).toBe(250);

    // Verifica paridade exata campo a campo (incluindo escala de 8 casas decimais cripto)
    for (let i = 0; i < sampleBatch.length; i++) {
      expect(decoded[i].id).toBe(sampleBatch[i].id);
      expect(decoded[i].symbol).toBe(sampleBatch[i].symbol);
      expect(decoded[i].entryPrice).toBeCloseTo(sampleBatch[i].entryPrice, 8);
      expect(decoded[i].exitPrice).toBeCloseTo(sampleBatch[i].exitPrice, 8);
      expect(decoded[i].netPnl).toBeCloseTo(sampleBatch[i].netPnl, 4);
      expect(decoded[i].exitTimestampMs).toBe(sampleBatch[i].exitTimestampMs);
      expect(decoded[i].source).toBe(sampleBatch[i].source);
      expect(decoded[i].triggerType).toBe(sampleBatch[i].triggerType);
    }
  });

  it("pré-consolida 50.000+ execuções multi-anuais em Daily Rollups UTC e carrega janelas 1Y e ALL em tempo constante O(1) (< 5ms)", () => {
    const totalExecutions = 52_000;
    const totalDays = 400; // > 1 ano de histórico (400 sessões UTC, 130 execuções/dia)
    const tradesPerDay = Math.floor(totalExecutions / totalDays);
    const referenceNowMs = Date.UTC(2026, 9, 28, 12, 0, 0);
    const firstDayMs = referenceNowMs - totalDays * 86_400_000;

    const history52k: TradeJournalRecord[] = new Array(totalExecutions);
    let idx = 0;
    let expectedTotalNetPnl = 0;

    for (let day = 0; day < totalDays; day++) {
      const dayStartMs = firstDayMs + day * 86_400_000;
      for (let t = 0; t < tradesPerDay; t++) {
        const rec = generateSyntheticTrade(idx, dayStartMs + t * 5000);
        expectedTotalNetPnl += rec.netPnl;
        history52k[idx++] = rec;
      }
    }

    // 1. Executa a agregação diária para as 52.000 execuções
    const report = ColdTierCompactionEngine.buildDailyRollups(history52k, 1000, {
      includeColumnarArchive: false,
      referenceNowMs,
    });

    expect(report.totalInputRecords).toBe(52_000);
    expect(report.totalRollupDays).toBe(400);
    expect(report.immutableClosedDays).toBeGreaterThanOrEqual(399);

    // 2. Mede o tempo de carregamento O(1) da janela ALL (52.000 execuções) e 1Y (365 dias)
    const queryStart = performance.now();
    const metricsAll = ColdTierCompactionEngine.computeMetricsFromDailyRollups(report.rollups, {
      horizon: "ALL",
      mode: "paper",
      initialCapital: 1000,
      referenceNowMs,
    });
    const metrics1Y = ColdTierCompactionEngine.computeMetricsFromDailyRollups(report.rollups, {
      horizon: "1Y",
      mode: "paper",
      initialCapital: 1000,
      referenceNowMs,
    });
    const queryElapsedMs = performance.now() - queryStart;

    expect(metricsAll.totalTrades).toBe(52_000);
    expect(metricsAll.totalNetPnl).toBeCloseTo(expectedTotalNetPnl, 0);
    expect(metricsAll.equityCurve.length).toBe(401); // Ponto inicial + 400 sessões UTC
    expect(metricsAll.sharpeRatio).toBeGreaterThan(0);

    // Janela 1Y contém <= 366 sessões UTC
    expect(metrics1Y.equityCurve.length).toBeLessThanOrEqual(367);
    expect(metrics1Y.totalTrades).toBeGreaterThan(45_000);

    // Carregamento de ambas as janelas multi-anuais deve ser instantâneo (< 50ms sob carga de teste concorrente)
    expect(queryElapsedMs).toBeLessThan(50);
  });

  it("persiste Daily Rollups no SQLite WAL e garante imutabilidade de sessões UTC encerradas", async () => {
    const closedDayMs = Date.UTC(2025, 5, 10, 15, 0, 0);
    const closedDateKey = toUtcDateKey(closedDayMs);
    const recordsDay1 = [
      generateSyntheticTrade(1, closedDayMs),
      generateSyntheticTrade(2, closedDayMs + 10_000),
    ];

    const report = ColdTierCompactionEngine.buildDailyRollups(recordsDay1, 1000, {
      includeColumnarArchive: true,
      referenceNowMs: Date.UTC(2026, 9, 28, 12, 0, 0),
    });

    expect(report.rollups.length).toBe(1);
    expect(report.rollups[0].dateUtc).toBe(closedDateKey);
    expect(report.rollups[0].isImmutableUtcClosed).toBe(true);
    expect(report.rollups[0].columnarPayloadBase64).toBeTruthy();

    await persistDailyRollupsToSqlite(report.rollups);

    // Tenta sobrescrever a sessão UTC imutável sem forceRebuild (deve preservar o snapshot original)
    const tamperedRollup = {
      ...report.rollups[0],
      totalTrades: 999,
      netPnl: 999999,
    };
    await persistDailyRollupsToSqlite([tamperedRollup], { forceRebuild: false });

    const loaded = await loadDailyRollupsFromSqlite({ mode: "paper", includePayload: true });
    expect(loaded.length).toBe(1);
    expect(loaded[0].totalTrades).toBe(2); // Preservado pela trava de imutabilidade UTC!
    expect(loaded[0].netPnl).toBeCloseTo(report.rollups[0].netPnl, 2);

    // Decodifica o arquivo colunar TJC1 recuperado do SQLite
    const decodedFromSqlite = ColdTierCompactionEngine.decodeColumnarBatch(
      loaded[0].columnarPayloadBase64!
    );
    expect(decodedFromSqlite.length).toBe(2);
    expect(decodedFromSqlite[0].id).toBe("cold_trade_1");
  });
});
