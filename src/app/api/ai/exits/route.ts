import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { loadSnapshot } from "@/lib/ai-market";
import { planExit, type ExitPlan, type PositionInput } from "@/lib/ai-entries";

const MAX_POSITIONS = 10;

// Sugestões de saída (stop, alvos, realização parcial) para as posições abertas do usuário.
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (isRateLimited(`exits:${ip}`, 12)) {
    return NextResponse.json({ success: false, error: "Muitas solicitações. Aguarde um minuto." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const positions: PositionInput[] = (Array.isArray(body.positions) ? body.positions : [])
      .map((p: any) => ({
        symbol: String(p?.symbol || "").replace(/[^A-Z0-9]/gi, "").toUpperCase(),
        avgPrice: Number(p?.avgPrice),
        quantity: Number(p?.quantity),
      }))
      .filter((p: PositionInput) => p.symbol.length >= 5 && p.avgPrice > 0 && p.quantity > 0)
      .slice(0, MAX_POSITIONS);

    if (positions.length === 0) {
      return NextResponse.json({ success: false, error: "Nenhuma posição válida informada." }, { status: 400 });
    }

    const plans: ExitPlan[] = [];
    for (const pos of positions) {
      const m = await loadSnapshot(pos.symbol);
      if (m) plans.push(planExit(m, pos));
    }
    if (plans.length === 0) {
      return NextResponse.json({ success: false, error: "Não foi possível obter dados da Binance agora." }, { status: 503 });
    }
    return NextResponse.json({ success: true, exits: plans });
  } catch (error: unknown) {
    console.error("[AI Exits] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Falha ao analisar as saídas." }, { status: 500 });
  }
}
