import { NextRequest, NextResponse } from "next/server";
import type { TradeJournalRecord } from "@/lib/journal/trade-journal-engine";
import {
  MAX_SYNC_BATCH_RECORDS,
  MAX_SYNC_PAYLOAD_BYTES,
  persistJournalBatchToSqlite,
  loadJournalRecordsFromSqlite,
  clearJournalSqlite,
} from "@/lib/journal/sync-sqlite";

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
