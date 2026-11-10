import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  ColdTierCompactionEngine,
  type DailyRollupSnapshot,
  type ColdTierCompactionReport,
  type LongHorizonWindow,
} from "@/lib/journal/cold-tier-compaction-engine";
import { loadJournalRecordsFromSqlite } from "@/app/api/journal/sync/route";

let rollupTableReady: Promise<void> | null = null;

/**
 * Garante a existência da tabela "TradeJournalDailyRollup" e seu índice por data UTC no SQLite WAL.
 */
function ensureRollupTable(): Promise<void> {
  rollupTableReady ??= (async () => {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TradeJournalDailyRollup" (
        "dateUtc" TEXT NOT NULL,
        "mode" TEXT NOT NULL,
        "totalTrades" INTEGER NOT NULL,
        "winningTrades" INTEGER NOT NULL,
        "losingTrades" INTEGER NOT NULL,
        "grossPnl" REAL NOT NULL,
        "netPnl" REAL NOT NULL,
        "totalFeesUsd" REAL NOT NULL,
        "totalInvestedUsd" REAL NOT NULL,
        "sumGainPct" REAL NOT NULL,
        "sumGainPctSq" REAL NOT NULL,
        "sumDownsidePctSq" REAL NOT NULL,
        "openingEquity" REAL NOT NULL,
        "closingEquity" REAL NOT NULL,
        "highWaterMarkEquity" REAL NOT NULL,
        "maxIntraDayDrawdownPct" REAL NOT NULL,
        "sharpeEstimate" REAL NOT NULL,
        "sortinoEstimate" REAL NOT NULL,
        "isImmutableUtcClosed" INTEGER NOT NULL DEFAULT 0,
        "codec" TEXT NOT NULL DEFAULT 'TJC1_DEFLATE',
        "rawBytes" INTEGER NOT NULL DEFAULT 0,
        "compactedBytes" INTEGER NOT NULL DEFAULT 0,
        "compressionRatio" REAL NOT NULL DEFAULT 1.0,
        "columnarPayloadBase64" TEXT,
        "updatedAtMs" REAL NOT NULL,
        PRIMARY KEY ("dateUtc", "mode")
      )
    `);
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_journal_rollup_date" ON "TradeJournalDailyRollup" ("dateUtc" ASC)`
    );
  })().catch((err) => {
    rollupTableReady = null;
    throw err;
  });

  return rollupTableReady;
}

/**
 * Persiste snapshots de agregação diária (Daily Rollup) no SQLite WAL em transação atômica.
 * Respeita a imutabilidade de sessões UTC já fechadas a menos que forceRebuild seja true.
 */
async function persistDailyRollupsToSqlite(
  rollups: DailyRollupSnapshot[],
  options?: { forceRebuild?: boolean }
): Promise<{ upsertedCount: number }> {
  await ensureRollupTable();
  if (!Array.isArray(rollups) || rollups.length === 0) {
    return { upsertedCount: 0 };
  }

  const forceRebuild = options?.forceRebuild === true;
  const statements = rollups.map((r) =>
    db.$executeRawUnsafe(
      `INSERT INTO "TradeJournalDailyRollup" (
        "dateUtc", "mode", "totalTrades", "winningTrades", "losingTrades",
        "grossPnl", "netPnl", "totalFeesUsd", "totalInvestedUsd",
        "sumGainPct", "sumGainPctSq", "sumDownsidePctSq",
        "openingEquity", "closingEquity", "highWaterMarkEquity",
        "maxIntraDayDrawdownPct", "sharpeEstimate", "sortinoEstimate",
        "isImmutableUtcClosed", "codec", "rawBytes", "compactedBytes",
        "compressionRatio", "columnarPayloadBase64", "updatedAtMs"
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )
      ON CONFLICT("dateUtc", "mode") DO UPDATE SET
        "totalTrades" = CASE WHEN "TradeJournalDailyRollup"."isImmutableUtcClosed" = 1 AND ? = 0 THEN "TradeJournalDailyRollup"."totalTrades" ELSE excluded."totalTrades" END,
        "winningTrades" = CASE WHEN "TradeJournalDailyRollup"."isImmutableUtcClosed" = 1 AND ? = 0 THEN "TradeJournalDailyRollup"."winningTrades" ELSE excluded."winningTrades" END,
        "losingTrades" = CASE WHEN "TradeJournalDailyRollup"."isImmutableUtcClosed" = 1 AND ? = 0 THEN "TradeJournalDailyRollup"."losingTrades" ELSE excluded."losingTrades" END,
        "grossPnl" = CASE WHEN "TradeJournalDailyRollup"."isImmutableUtcClosed" = 1 AND ? = 0 THEN "TradeJournalDailyRollup"."grossPnl" ELSE excluded."grossPnl" END,
        "netPnl" = CASE WHEN "TradeJournalDailyRollup"."isImmutableUtcClosed" = 1 AND ? = 0 THEN "TradeJournalDailyRollup"."netPnl" ELSE excluded."netPnl" END,
        "totalFeesUsd" = CASE WHEN "TradeJournalDailyRollup"."isImmutableUtcClosed" = 1 AND ? = 0 THEN "TradeJournalDailyRollup"."totalFeesUsd" ELSE excluded."totalFeesUsd" END,
        "totalInvestedUsd" = CASE WHEN "TradeJournalDailyRollup"."isImmutableUtcClosed" = 1 AND ? = 0 THEN "TradeJournalDailyRollup"."totalInvestedUsd" ELSE excluded."totalInvestedUsd" END,
        "sumGainPct" = CASE WHEN "TradeJournalDailyRollup"."isImmutableUtcClosed" = 1 AND ? = 0 THEN "TradeJournalDailyRollup"."sumGainPct" ELSE excluded."sumGainPct" END,
        "sumGainPctSq" = CASE WHEN "TradeJournalDailyRollup"."isImmutableUtcClosed" = 1 AND ? = 0 THEN "TradeJournalDailyRollup"."sumGainPctSq" ELSE excluded."sumGainPctSq" END,
        "sumDownsidePctSq" = CASE WHEN "TradeJournalDailyRollup"."isImmutableUtcClosed" = 1 AND ? = 0 THEN "TradeJournalDailyRollup"."sumDownsidePctSq" ELSE excluded."sumDownsidePctSq" END,
        "openingEquity" = CASE WHEN "TradeJournalDailyRollup"."isImmutableUtcClosed" = 1 AND ? = 0 THEN "TradeJournalDailyRollup"."openingEquity" ELSE excluded."openingEquity" END,
        "closingEquity" = CASE WHEN "TradeJournalDailyRollup"."isImmutableUtcClosed" = 1 AND ? = 0 THEN "TradeJournalDailyRollup"."closingEquity" ELSE excluded."closingEquity" END,
        "highWaterMarkEquity" = CASE WHEN "TradeJournalDailyRollup"."isImmutableUtcClosed" = 1 AND ? = 0 THEN "TradeJournalDailyRollup"."highWaterMarkEquity" ELSE excluded."highWaterMarkEquity" END,
        "maxIntraDayDrawdownPct" = CASE WHEN "TradeJournalDailyRollup"."isImmutableUtcClosed" = 1 AND ? = 0 THEN "TradeJournalDailyRollup"."maxIntraDayDrawdownPct" ELSE excluded."maxIntraDayDrawdownPct" END,
        "sharpeEstimate" = CASE WHEN "TradeJournalDailyRollup"."isImmutableUtcClosed" = 1 AND ? = 0 THEN "TradeJournalDailyRollup"."sharpeEstimate" ELSE excluded."sharpeEstimate" END,
        "sortinoEstimate" = CASE WHEN "TradeJournalDailyRollup"."isImmutableUtcClosed" = 1 AND ? = 0 THEN "TradeJournalDailyRollup"."sortinoEstimate" ELSE excluded."sortinoEstimate" END,
        "isImmutableUtcClosed" = MAX("TradeJournalDailyRollup"."isImmutableUtcClosed", excluded."isImmutableUtcClosed"),
        "codec" = excluded."codec",
        "rawBytes" = excluded."rawBytes",
        "compactedBytes" = excluded."compactedBytes",
        "compressionRatio" = excluded."compressionRatio",
        "columnarPayloadBase64" = COALESCE(excluded."columnarPayloadBase64", "TradeJournalDailyRollup"."columnarPayloadBase64"),
        "updatedAtMs" = excluded."updatedAtMs"`,
      r.dateUtc,
      r.mode,
      r.totalTrades,
      r.winningTrades,
      r.losingTrades,
      r.grossPnl,
      r.netPnl,
      r.totalFeesUsd,
      r.totalInvestedUsd,
      r.sumGainPct,
      r.sumGainPctSq,
      r.sumDownsidePctSq,
      r.openingEquity,
      r.closingEquity,
      r.highWaterMarkEquity,
      r.maxIntraDayDrawdownPct,
      r.sharpeEstimate,
      r.sortinoEstimate,
      r.isImmutableUtcClosed ? 1 : 0,
      r.codec,
      r.rawBytes,
      r.compactedBytes,
      r.compressionRatio,
      r.columnarPayloadBase64 ?? null,
      r.updatedAtMs,
      // Flags para CASE WHEN forceRebuild
      forceRebuild ? 1 : 0,
      forceRebuild ? 1 : 0,
      forceRebuild ? 1 : 0,
      forceRebuild ? 1 : 0,
      forceRebuild ? 1 : 0,
      forceRebuild ? 1 : 0,
      forceRebuild ? 1 : 0,
      forceRebuild ? 1 : 0,
      forceRebuild ? 1 : 0,
      forceRebuild ? 1 : 0,
      forceRebuild ? 1 : 0,
      forceRebuild ? 1 : 0,
      forceRebuild ? 1 : 0,
      forceRebuild ? 1 : 0,
      forceRebuild ? 1 : 0,
      forceRebuild ? 1 : 0
    )
  );

  await db.$transaction(statements);
  return { upsertedCount: rollups.length };
}

/**
 * Carrega os snapshots diários (Daily Rollups) do SQLite em O(1) em relação ao número de trades.
 */
export async function loadDailyRollupsFromSqlite(options?: {
  mode?: "all" | "live" | "paper";
  includePayload?: boolean;
}): Promise<DailyRollupSnapshot[]> {
  await ensureRollupTable();
  const mode = options?.mode ?? "all";
  const includePayload = options?.includePayload === true;

  const cols = includePayload
    ? `*`
    : `"dateUtc", "mode", "totalTrades", "winningTrades", "losingTrades", "grossPnl", "netPnl", "totalFeesUsd", "totalInvestedUsd", "sumGainPct", "sumGainPctSq", "sumDownsidePctSq", "openingEquity", "closingEquity", "highWaterMarkEquity", "maxIntraDayDrawdownPct", "sharpeEstimate", "sortinoEstimate", "isImmutableUtcClosed", "codec", "rawBytes", "compactedBytes", "compressionRatio", "updatedAtMs"`;

  const rows =
    mode === "live" || mode === "paper"
      ? await db.$queryRawUnsafe<any[]>(
          `SELECT ${cols} FROM "TradeJournalDailyRollup" WHERE "mode" = ? ORDER BY "dateUtc" ASC`,
          mode
        )
      : await db.$queryRawUnsafe<any[]>(
          `SELECT ${cols} FROM "TradeJournalDailyRollup" ORDER BY "dateUtc" ASC`
        );

  return Array.isArray(rows)
    ? rows.map((row) => ({
        dateUtc: String(row.dateUtc),
        mode: row.mode === "live" ? "live" : "paper",
        totalTrades: Number(row.totalTrades || 0),
        winningTrades: Number(row.winningTrades || 0),
        losingTrades: Number(row.losingTrades || 0),
        grossPnl: Number(row.grossPnl || 0),
        netPnl: Number(row.netPnl || 0),
        totalFeesUsd: Number(row.totalFeesUsd || 0),
        totalInvestedUsd: Number(row.totalInvestedUsd || 0),
        sumGainPct: Number(row.sumGainPct || 0),
        sumGainPctSq: Number(row.sumGainPctSq || 0),
        sumDownsidePctSq: Number(row.sumDownsidePctSq || 0),
        openingEquity: Number(row.openingEquity || 1000),
        closingEquity: Number(row.closingEquity || 1000),
        highWaterMarkEquity: Number(row.highWaterMarkEquity || 1000),
        maxIntraDayDrawdownPct: Number(row.maxIntraDayDrawdownPct || 0),
        sharpeEstimate: Number(row.sharpeEstimate || 0),
        sortinoEstimate: Number(row.sortinoEstimate || 0),
        isImmutableUtcClosed: Boolean(row.isImmutableUtcClosed),
        codec: String(row.codec || "TJC1_DEFLATE"),
        rawBytes: Number(row.rawBytes || 0),
        compactedBytes: Number(row.compactedBytes || 0),
        compressionRatio: Number(row.compressionRatio || 1.0),
        columnarPayloadBase64: row.columnarPayloadBase64
          ? String(row.columnarPayloadBase64)
          : undefined,
        updatedAtMs: Number(row.updatedAtMs || Date.now()),
      }))
    : [];
}

/**
 * Executa a rotina de Compactação Colunar e Agregação Diária sobre os registros em SQLite
 */
export async function runSqliteColdTierCompaction(
  initialCapital = 10000
): Promise<ColdTierCompactionReport> {
  const records = await loadJournalRecordsFromSqlite(20000);
  const report = ColdTierCompactionEngine.buildDailyRollups(records, initialCapital, {
    includeColumnarArchive: true,
  });
  if (report.rollups.length > 0) {
    await persistDailyRollupsToSqlite(report.rollups, { forceRebuild: true });
  }
  return report;
}

export async function clearDailyRollupsSqlite(): Promise<void> {
  await ensureRollupTable();
  await db.$executeRawUnsafe(`DELETE FROM "TradeJournalDailyRollup"`);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const horizon = (searchParams.get("horizon") || "ALL") as LongHorizonWindow;
    const mode = (searchParams.get("mode") || "all") as "all" | "live" | "paper";
    const initialCapital = Number(searchParams.get("initialCapital") || 10000);
    const includePayload = searchParams.get("includePayload") === "true";

    const startMs = performance.now();
    const rollups = await loadDailyRollupsFromSqlite({ mode, includePayload });
    const metrics = ColdTierCompactionEngine.computeMetricsFromDailyRollups(rollups, {
      horizon,
      mode,
      initialCapital,
    });
    const queryDurationMs = Number((performance.now() - startMs).toFixed(2));

    return NextResponse.json({
      success: true,
      horizon,
      mode,
      rollupDaysCount: rollups.length,
      queryDurationMs,
      metrics,
      rollups,
    });
  } catch (err: any) {
    console.error("[/api/journal/rollup GET] Erro ao consultar rollups diários:", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Falha ao carregar rollups diários.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const initialCapital = Number(body?.initialCapital || 10000);

    const report = await runSqliteColdTierCompaction(initialCapital);
    return NextResponse.json({
      success: true,
      report: {
        ...report,
        // Omite payloads base64 pesados na resposta de resumo por padrão
        rollups: report.rollups.map((r) => ({
          ...r,
          columnarPayloadBase64: undefined,
        })),
      },
    });
  } catch (err: any) {
    console.error("[/api/journal/rollup POST] Erro ao compactar rollups:", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Falha ao executar compactação colunar e rollup diário.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await clearDailyRollupsSqlite();
    return NextResponse.json({
      success: true,
      cleared: true,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Falha ao limpar tabela de rollups diários.",
      },
      { status: 500 }
    );
  }
}
