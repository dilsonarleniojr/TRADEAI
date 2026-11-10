import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { TradeJournalRecord } from "@/lib/journal/trade-journal-engine";

let journalTableReady: Promise<void> | null = null;

/**
 * Garante a existência da tabela "TradeJournalRecord" e seus índices compostos no SQLite (WAL Mode)
 * sem exigir migração manual bloqueante.
 */
function ensureJournalTable(): Promise<void> {
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

export const MAX_SYNC_BATCH_RECORDS = 2000;
export const MAX_SYNC_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Sanitiza strings removendo caracteres de controle ASCII (prevenção de Log Injection CWE-117 e XSS/Null-byte)
 * e truncando no tamanho máximo permitido.
 */
function sanitizeSafeString(val: unknown, fallback: string, maxLength = 128): string {
  if (typeof val !== "string" && typeof val !== "number") return fallback;
  const cleaned = String(val)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .trim();
  if (!cleaned) return fallback;
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

function sanitizeNumber(val: unknown, fallback = 0, min = -1e12, max = 1e12): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function normalizeRecord(raw: Partial<TradeJournalRecord>): TradeJournalRecord | null {
  if (!raw || typeof raw !== "object" || !raw.id || !raw.symbol) {
    return null;
  }
  const safeId = sanitizeSafeString(raw.id, "", 96);
  const safeSymbol = sanitizeSafeString(raw.symbol, "", 24)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
  if (!safeId || !safeSymbol) {
    return null;
  }

  const now = Date.now();
  const entryPrice = sanitizeNumber(raw.entryPrice, 0, 0, 1e9);
  const exitPrice = sanitizeNumber(raw.exitPrice, 0, 0, 1e9);
  const highestPrice = sanitizeNumber(raw.highestPrice, exitPrice, 0, 1e9);
  const lowestPrice = sanitizeNumber(raw.lowestPrice, entryPrice, 0, 1e9);
  const netGainPercent = sanitizeNumber(raw.netGainPercent, 0, -1000, 100000);
  return {
    id: safeId,
    botId: sanitizeSafeString(raw.botId, "manual-or-global", 64),
    botName: sanitizeSafeString(raw.botName, "Operador / Global", 80),
    symbol: safeSymbol,
    side: raw.side === "SELL" ? "SELL" : "BUY",
    mode: raw.mode === "live" ? "live" : "paper",
    strategy: sanitizeSafeString(raw.strategy, "AI_QUANT", 64),
    source: raw.source,
    triggerType: raw.triggerType,
    entryPrice,
    exitPrice,
    quantity: sanitizeNumber(raw.quantity, 0, 0, 1e12),
    totalInvested: sanitizeNumber(raw.totalInvested, 0, 0, 1e12),
    totalReturned: sanitizeNumber(raw.totalReturned, 0, 0, 1e12),
    grossPnl: sanitizeNumber(raw.grossPnl, 0),
    netPnl: sanitizeNumber(raw.netPnl, 0),
    gainPercent: sanitizeNumber(raw.gainPercent, netGainPercent, -1000, 100000),
    netGainPercent,
    commissionFeesUsd: sanitizeNumber(raw.commissionFeesUsd, 0, 0, 1e9),
    spreadCostUsd: sanitizeNumber(raw.spreadCostUsd, 0, 0, 1e9),
    highestPrice,
    lowestPrice,
    maePrice: sanitizeNumber(raw.maePrice, lowestPrice, 0, 1e9),
    maePercent: sanitizeNumber(raw.maePercent, 0, -100, 0),
    mfePrice: sanitizeNumber(raw.mfePrice, highestPrice, 0, 1e9),
    mfePercent: sanitizeNumber(raw.mfePercent, 0, 0, 100000),
    entryTime: sanitizeSafeString(raw.entryTime, new Date(now - 60000).toISOString(), 40),
    exitTime: sanitizeSafeString(raw.exitTime, new Date(now).toISOString(), 40),
    entryTimestampMs: sanitizeNumber(raw.entryTimestampMs, now - 60000, 0, 9e15),
    exitTimestampMs: sanitizeNumber(raw.exitTimestampMs, now, 0, 9e15),
    durationMs: sanitizeNumber(raw.durationMs, 60000, 0, 9e15),
    durationMinutes: sanitizeNumber(raw.durationMinutes, 1, 0, 1e9),
    durationFormatted: sanitizeSafeString(raw.durationFormatted, "1m 0s", 32),
    exitReason: sanitizeSafeString(raw.exitReason, "TAKE_PROFIT", 64),
    notes: raw.notes ? sanitizeSafeString(raw.notes, "", 512) : undefined,
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
    const contentLengthHeader = req.headers.get("content-length");
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_SYNC_PAYLOAD_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: `Payload excede o limite de segurança de ${MAX_SYNC_PAYLOAD_BYTES} bytes.`,
        },
        { status: 413 }
      );
    }

    const body = await req.json();
    const rawRecords: TradeJournalRecord[] = Array.isArray(body?.records)
      ? body.records
      : body?.record
        ? [body.record]
        : [];

    if (rawRecords.length > MAX_SYNC_BATCH_RECORDS) {
      return NextResponse.json(
        {
          success: false,
          error: `Lote excede o limite máximo de ${MAX_SYNC_BATCH_RECORDS} registros por transação.`,
        },
        { status: 413 }
      );
    }

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
