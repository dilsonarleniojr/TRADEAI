import { NextRequest, NextResponse } from "next/server";
import { askAIOnce, parseJsonLoose } from "@/lib/ai-client";
import { isRateLimited } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";

const MIN_WIDGETS = 4;
const MAX_WIDGETS = 8;

interface WidgetInfo {
  id: string;
  title: string;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (isRateLimited(`preset:${ip}`, 6)) {
    return NextResponse.json({ success: false, error: "Muitas solicitações. Aguarde um minuto." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const widgets: WidgetInfo[] = Array.isArray(body.widgets)
      ? body.widgets
          .filter((w: any) => w && typeof w.id === "string" && typeof w.title === "string")
          .map((w: any) => ({ id: w.id.slice(0, 40), title: w.title.slice(0, 80) }))
          .slice(0, 40)
      : [];
    if (widgets.length < MIN_WIDGETS) {
      return NextResponse.json({ success: false, error: "Lista de widgets inválida." }, { status: 400 });
    }
    const allowed = new Set(widgets.map((w) => w.id));

    const m = body.market || {};
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const context = {
      avgChange24h: num(m.avgChange24h),
      advancers: num(m.advancers),
      decliners: num(m.decliners),
      tradingMode: m.tradingMode === "live" ? "real" : "simulado",
      botsActive: num(m.botsActive),
      hasOpenPosition: !!m.hasOpenPosition,
    };

    {
      try {
        const text = await askAIOnce(
          "Você monta painéis de trading úteis e enxutos. Responda apenas com JSON válido.",
          `Monte o painel ideal para este momento, escolhendo entre ${MIN_WIDGETS} e ${MAX_WIDGETS} widgets, em ordem de importância.

Situação: variação média 24h ${context.avgChange24h.toFixed(2)}%; ${context.advancers} moedas em alta e ${context.decliners} em queda; modo ${context.tradingMode}; ${context.botsActive} bots ativos; posição aberta: ${context.hasOpenPosition ? "sim" : "não"}.

Widgets disponíveis (id: título):
${widgets.map((w) => `${w.id}: ${w.title}`).join("\n")}

Responda APENAS com JSON: { "ids": ["id1", "id2", ...], "reason": "uma frase em português explicando a escolha" }`,
          { maxTokens: 2000 }
        );
        const parsed = parseJsonLoose<{ ids?: unknown; reason?: unknown }>(text);
        if (parsed && Array.isArray(parsed.ids)) {
          const ids = [...new Set(parsed.ids.map(String))].filter((id) => allowed.has(id)).slice(0, MAX_WIDGETS);
          if (ids.length >= MIN_WIDGETS) {
            return NextResponse.json({
              success: true,
              ids,
              reason: String(parsed.reason || "Seleção sugerida pela IA para o momento atual.").slice(0, 240),
              source: "ia",
            });
          }
        }
      } catch (e: any) {
        console.warn("[AI Preset] Falha na IA, usando regras:", e.message);
      }
    }

    // Plano B por regras simples
    const pick = (...ids: string[]) => ids.filter((id) => allowed.has(id));
    const ids = context.hasOpenPosition || context.botsActive > 0
      ? pick("pnl-tracker", "open-orders", "risk-module", "ai-entries", "market-highlights", "portfolio-pro")
      : context.avgChange24h < -2
        ? pick("fear-greed", "ai-entries", "market-highlights", "liquidation-heatmap", "funding-rates", "crypto-news")
        : pick("ai-entries", "market-highlights", "ai-signals", "watchlist-alerts", "multi-timeframe", "market-table");
    return NextResponse.json({
      success: true,
      ids: ids.length >= MIN_WIDGETS ? ids : widgets.slice(0, 6).map((w) => w.id),
      reason: "IA indisponível: seleção por regras com base no mercado e nas suas posições.",
      source: "regras",
    });
  } catch (error: unknown) {
    console.error("[AI Preset] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Falha ao montar o painel." }, { status: 500 });
  }
}
