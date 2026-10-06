import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calculateRiskMetrics } from "@/lib/bot/risk-metrics";
import type { TradeData } from "@/lib/store/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode"); // "live" | "paper"
    const botId = searchParams.get("botId");

    const whereClause: any = {};
    if (mode) whereClause.mode = mode;
    if (botId) whereClause.botConfigId = botId;

    const rawTrades = await db.trade.findMany({
      where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      orderBy: { timestamp: "asc" },
      take: 200,
    });

    const mappedTrades: TradeData[] = rawTrades.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      side: t.side as "BUY" | "SELL",
      price: t.price,
      quantity: t.quantity,
      total: t.total,
      strategy: t.strategy,
      mode: t.mode as any,
      pnl: t.pnl ?? 0,
      timestamp: t.timestamp.toISOString(),
      botId: t.botConfigId ?? undefined,
      botName: undefined,
    }));

    const metrics = calculateRiskMetrics(mappedTrades);

    return NextResponse.json({
      success: true,
      data: metrics,
      count: mappedTrades.length,
    });
  } catch (error: any) {
    console.error("[RiskMetrics API] Error calculating metrics:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to calculate risk metrics" },
      { status: 500 }
    );
  }
}
