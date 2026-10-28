import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { TradeJournalRecord } from "@/lib/journal/trade-journal-engine";

let journalTableReady: Promise<void> | null = null;

/**
 * Garante a existência da tabela "TradeJournalRecord" e seus índices compostos no SQLite (WAL Mode)
 * sem exigir migração manual bloqueante.
 */
export function ensureJournalTable(): Promise<void> {
  journalTableReady ??= (async () => {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TradeJournalRecord" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "botId" TEXT NOT NULL,
        "botName" TEXT NOT NULL,
        "symbol" TEXT NOT NULL,
        "side" TEXT NOT NULL,
        "mode" TEXT NOT NULL,
        "strategy" TEXT NOT NULL,
        "source" TEXT,
        "triggerType" TEXT,
        "entryPrice" REAL NOT NULL,
        "exitPrice" REAL NOT NULL,
        "quantity" REAL NOT NULL,
        "totalInvested" REAL NOT NULL,
        "totalReturned" REAL NOT NULL,
        "grossPnl" REAL NOT NULL,
        "netPnl" REAL NOT NULL,
        "netGainPercent" REAL NOT NULL,
        "commissionFeesUsd" REAL NOT NULL,
        "spreadCostUsd" REAL NOT NULL,
        "highestPrice" REAL NOT NULL,
        "lowestPrice" REAL NOT NULL,
        "maePercent" REAL NOT NULL,
        "mfePercent" REAL NOT NULL,
        "entryTime" TEXT NOT NULL,
        "exitTime" TEXT NOT NULL,
        "entryTimestampMs" REAL NOT NULL,
        "exitTimestampMs" REAL NOT NULL,
        "durationMs" REAL NOT NULL,
        "durationMinutes" REAL NOT NULL,
        "durationFormatted" TEXT NOT NULL,
        "exitReason" TEXT NOT NULL,
        "notes" TEXT
      )
    `);
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_trade_journal_exit_ts" ON "TradeJournalRecord" ("exitTimestampMs" DESC)`
    );
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_trade_journal_symbol_mode" ON "TradeJournalRecord" ("symbol", "mode")`
    );
  })().catch((err) => {
    journalTableReady = null;
    throw err;
  });

  return journalTableReady;
}

function sanitizeNumber(val: unknown, fallback = 0): number {
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeRecord(raw: Partial<TradeJournalRecord>): TradeJournalRecord | null {
  if (!raw || typeof raw !== "object" || !raw.id || !raw.symbol) {
    return null;
  }
  const now = Date.now();
  const entryPrice = sanitizeNumber(raw.entryPrice, 0);
  const exitPrice = sanitizeNumber(raw.exitPrice, 0);
  const highestPrice = sanitizeNumber(raw.highestPrice, exitPrice);
  const lowestPrice = sanitizeNumber(raw.lowestPrice, entryPrice);
  const netGainPercent = sanitizeNumber(raw.netGainPercent, 0);
  return {
    id: String(raw.id),
    botId: String(raw.botId || "manual-or-global"),
    botName: String(raw.botName || "Operador / Global"),
    symbol: String(raw.symbol).toUpperCase(),
    side: raw.side === "SELL" ? "SELL" : "BUY",
    mode: raw.mode === "live" ? "live" : "paper",
    strategy: String(raw.strategy || "AI_QUANT"),
    source: raw.source,
    triggerType: raw.triggerType,
    entryPrice,
    exitPrice,
    quantity: sanitizeNumber(raw.quantity, 0),
    totalInvested: sanitizeNumber(raw.totalInvested, 0),
    totalReturned: sanitizeNumber(raw.totalReturned, 0),
    grossPnl: sanitizeNumber(raw.grossPnl, 0),
    netPnl: sanitizeNumber(raw.netPnl, 0),
    gainPercent: sanitizeNumber(raw.gainPercent, netGainPercent),
    netGainPercent,
    commissionFeesUsd: sanitizeNumber(raw.commissionFeesUsd, 0),
    spreadCostUsd: sanitizeNumber(raw.spreadCostUsd, 0),
    highestPrice,
    lowestPrice,
    maePrice: sanitizeNumber(raw.maePrice, lowestPrice),
    maePercent: sanitizeNumber(raw.maePercent, 0),
    mfePrice: sanitizeNumber(raw.mfePrice, highestPrice),
    mfePercent: sanitizeNumber(raw.mfePercent, 0),
    entryTime: String(raw.entryTime || new Date(now - 60000).toISOString()),
    exitTime: String(raw.exitTime || new Date(now).toISOString()),
    entryTimestampMs: sanitizeNumber(raw.entryTimestampMs, now - 60000),
    exitTimestampMs: sanitizeNumber(raw.exitTimestampMs, now),
    durationMs: sanitizeNumber(raw.durationMs, 60000),
    durationMinutes: sanitizeNumber(raw.durationMinutes, 1),
    durationFormatted: String(raw.durationFormatted || "1m 0s"),
    exitReason: String(raw.exitReason || "TAKE_PROFIT"),
    notes: raw.notes ? String(raw.notes) : undefined,
  };
}

/**
 * Persiste um lote de registros no SQLite usando transação atômica com INSERT OR REPLACE.
 */
export async function persistJournalBatchToSqlite(
  records: TradeJournalRecord[]
): Promise<{ persistedCount: number; durationMs: number }> {
  const start = performance.now();
  await ensureJournalTable();

  const validRecords: TradeJournalRecord[] = [];
  for (const r of records) {
    const norm = normalizeRecord(r);
    if (norm) validRecords.push(norm);
  }

  if (validRecords.length === 0) {
    return { persistedCount: 0, durationMs: 0 };
  }

  // Divide em chunks de 100 registros por transação SQLite para máxima vazão sem estourar variáveis SQL
  const CHUNK_SIZE = 100;
  for (let i = 0; i < validRecords.length; i += CHUNK_SIZE) {
    const chunk = validRecords.slice(i, i + CHUNK_SIZE);
    const statements = chunk.map((rec) =>
      db.$executeRawUnsafe(
        `INSERT OR REPLACE INTO "TradeJournalRecord" (
          "id", "botId", "botName", "symbol", "side", "mode", "strategy",
          "source", "triggerType", "entryPrice", "exitPrice", "quantity",
          "totalInvested", "totalReturned", "grossPnl", "netPnl", "netGainPercent",
          "commissionFeesUsd", "spreadCostUsd", "highestPrice", "lowestPrice",
          "maePercent", "mfePercent", "entryTime", "exitTime",
          "entryTimestampMs", "exitTimestampMs", "durationMs", "durationMinutes",
          "durationFormatted", "exitReason", "notes"
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?
        )`,
        rec.id,
        rec.botId,
        rec.botName,
        rec.symbol,
        rec.side,
        rec.mode,
        rec.strategy,
        rec.source ?? null,
        rec.triggerType ?? null,
        rec.entryPrice,
        rec.exitPrice,
        rec.quantity,
        rec.totalInvested,
        rec.totalReturned,
        rec.grossPnl,
        rec.netPnl,
        rec.netGainPercent,
        rec.commissionFeesUsd,
        rec.spreadCostUsd,
        rec.highestPrice,
        rec.lowestPrice,
        rec.maePercent,
        rec.mfePercent,
        rec.entryTime,
        rec.exitTime,
        rec.entryTimestampMs,
        rec.exitTimestampMs,
        rec.durationMs,
        rec.durationMinutes,
        rec.durationFormatted,
        rec.exitReason,
        rec.notes ?? null
      )
    );

    await db.$transaction(statements);
  }

  const durationMs = Number((performance.now() - start).toFixed(2));
  return { persistedCount: validRecords.length, durationMs };
}

export async function loadJournalRecordsFromSqlite(
  limit = 5000,
  symbol?: string,
  mode?: string
): Promise<TradeJournalRecord[]> {
  await ensureJournalTable();
  const safeLimit = Math.max(1, Math.min(20000, Number(limit) || 5000));

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (symbol && /^[A-Z0-9]{3,20}$/i.test(symbol)) {
    conditions.push(`"symbol" = ?`);
    params.push(symbol.toUpperCase());
  }
  if (mode === "live" || mode === "paper") {
    conditions.push(`"mode" = ?`);
    params.push(mode);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(safeLimit);

  const rows = await db.$queryRawUnsafe<TradeJournalRecord[]>(
    `SELECT * FROM "TradeJournalRecord" ${whereClause} ORDER BY "exitTimestampMs" DESC LIMIT ?`,
    ...params
  );

  return Array.isArray(rows)
    ? rows.map((row) => ({
        ...row,
        gainPercent: sanitizeNumber((row as any).gainPercent, row.netGainPercent),
        maePrice: sanitizeNumber((row as any).maePrice, row.lowestPrice),
        mfePrice: sanitizeNumber((row as any).mfePrice, row.highestPrice),
        source: row.source || undefined,
        triggerType: row.triggerType || undefined,
        notes: row.notes || undefined,
      }))
    : [];
}

export async function clearJournalSqlite(): Promise<void> {
  await ensureJournalTable();
  await db.$executeRawUnsafe(`DELETE FROM "TradeJournalRecord"`);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawRecords: TradeJournalRecord[] = Array.isArray(body?.records)
      ? body.records
      : body?.record
        ? [body.record]
        : [];

    if (rawRecords.length === 0) {
      return NextResponse.json({
        success: true,
        persistedCount: 0,
        durationMs: 0,
      });
    }

    const result = await persistJournalBatchToSqlite(rawRecords);
    return NextResponse.json({
      success: true,
      persistedCount: result.persistedCount,
      durationMs: result.durationMs,
    });
  } catch (err: any) {
    console.error("[/api/journal/sync POST] Erro ao sincronizar lote SQLite:", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Falha ao persistir lote de trades no SQLite.",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit") || 5000);
    const symbol = searchParams.get("symbol") || undefined;
    const mode = searchParams.get("mode") || undefined;

    const records = await loadJournalRecordsFromSqlite(limit, symbol, mode);
    return NextResponse.json({
      success: true,
      count: records.length,
      records,
    });
  } catch (err: any) {
    console.error("[/api/journal/sync GET] Erro ao carregar registros SQLite:", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Falha ao carregar registros do SQLite.",
        records: [],
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await clearJournalSqlite();
    return NextResponse.json({
      success: true,
      cleared: true,
    });
  } catch (err: any) {
    console.error("[/api/journal/sync DELETE] Erro ao limpar registros SQLite:", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Falha ao limpar registros no SQLite.",
      },
      { status: 500 }
    );
  }
}
