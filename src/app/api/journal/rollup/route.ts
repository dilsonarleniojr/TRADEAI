import { NextRequest, NextResponse } from "next/server";
import {
  ColdTierCompactionEngine,
  type LongHorizonWindow,
} from "@/lib/journal/cold-tier-compaction-engine";
import {
  loadDailyRollupsFromSqlite,
  runSqliteColdTierCompaction,
  clearDailyRollupsSqlite,
} from "@/lib/journal/rollup-sqlite";

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
