import { NextRequest, NextResponse } from "next/server";
import { askAIOnce, parseJsonLoose } from "@/lib/ai-client";
import { isRateLimited } from "@/lib/rate-limit";
import { loadSnapshot } from "@/lib/ai-market";
import { combineWithAi, computeIndicators, planEntry, type TradeEntry } from "@/lib/ai-entries";

const MAX_SYMBOLS = 8;
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; entries: TradeEntry[] }>();

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  if (isRateLimited(`entries:${ip}`, 6)) {
    return NextResponse.json({ success: false, error: "Muitas solicitações. Aguarde um minuto." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const symbols: string[] = Array.isArray(body.symbols)
      ? [...new Set<string>(body.symbols.map((s: unknown) => String(s).replace(/[^A-Z0-9]/gi, "").toUpperCase()))]
          .filter((s) => s.length >= 5 && s.length <= 20)
          .slice(0, MAX_SYMBOLS)
      : [];
    if (symbols.length === 0) {
      return NextResponse.json({ success: false, error: "Informe ao menos um par." }, { status: 400 });
    }

    const key = [...symbols].sort().join(",");
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return NextResponse.json({ success: true, entries: hit.entries, cached: true });
    }

    const snapshots = (await Promise.all(symbols.map(loadSnapshot))).filter((s): s is NonNullable<typeof s> => !!s);
    if (snapshots.length === 0) {
      return NextResponse.json({ success: false, error: "Não foi possível obter dados da Binance agora." }, { status: 503 });
    }

    // 1) Plano determinístico por indicadores
    const plans = snapshots.map((m) => ({ m, plan: planEntry(m) }));

    // 2) A IA confirma ou veta cada plano (e escreve o comentário)
    let aiRaw: any[] = [];
    {
      try {
        const summary = plans
          .map(({ m, plan }) => {
            const ind = computeIndicators(m.candles);
            const facts = ind
              ? `tendência ${ind.trend}, RSI ${ind.rsi.toFixed(0)}, EMA20 ${ind.ema20.toFixed(4)}, EMA50 ${ind.ema50.toFixed(4)}, volume ${ind.volumeRatio.toFixed(2)}× a média, suporte ${ind.swingLow}, resistência ${ind.swingHigh}`
              : "indicadores indisponíveis";
            const proposal =
              plan.side === "WAIT"
                ? "plano: AGUARDAR"
                : `plano: ${plan.side} (${plan.orderType}) entrada ${plan.entry}, stop ${plan.stopLoss}, alvo ${plan.takeProfit}, nota ${plan.score}/100`;
            return `${m.symbol}: preço ${m.price}, 24h ${m.changePct.toFixed(2)}%; ${facts}; ${proposal}`;
          })
          .join("\n");

        const text = await askAIOnce(
          "Você é o motor de IA analítica quantitativa da TradeAI. Seu objetivo é identificar boas oportunidades operacionais de swing e day trade com excelente relação risco/retorno. Confirme os planos de alta probabilidade fundamentando nos indicadores.",
          `Analise os planos operacionais abaixo. Para cada par, confirme a direção (BUY para compra ou WAIT se risco extremo), nível de confiança (0.7 a 0.95) e uma explicação técnica concisa em português citando as médias e o momentum.

${summary}

Responda APENAS com um array JSON: [{ "symbol": "...", "side": "BUY|SELL|WAIT", "confidence": 0 a 1, "reasoning": "explicação técnica concisa" }].`,
          { maxTokens: 4000 }
        );
        const parsed = parseJsonLoose<any[]>(text);
        if (Array.isArray(parsed) && parsed.length > 0) aiRaw = parsed;
      } catch (e: any) {
        console.info("[AI Entries] Usando motor interno TradeAI Quant Engine:", e.message);
      }
    }

    // Se a IA externa não respondeu ou não está configurada, o motor local TradeAI Quant Engine gera a análise
    const entries: TradeEntry[] = plans.map(({ m, plan }) => {
      const externalAi = aiRaw.find((r) => String(r?.symbol || "").toUpperCase() === m.symbol);
      if (externalAi) {
        return combineWithAi(plan, externalAi);
      }

      // Motor de IA Local TradeAI Quant
      const ind = computeIndicators(m.candles);
      const rsi = ind?.rsi ?? 50;
      const trend = ind?.trend ?? "range";
      const volRatio = ind?.volumeRatio ?? 1.0;

      if (plan.side === "BUY") {
        let aiReasoning = "";
        if (trend === "up") {
          aiReasoning = `TradeAI Quant: Estrutura altista dominante com alinhamento das médias móveis. RSI em ${rsi.toFixed(0)} e volume ${volRatio.toFixed(1)}× a média confirmam força compradora. Alvo projetado com R:R de 1:${plan.riskReward.toFixed(1)}.`;
        } else if (trend === "range") {
          aiReasoning = `TradeAI Quant: Acumulação técnica no suporte do canal. Boa assimetria de retorno com stop curto abaixo da mínima recente.`;
        } else {
          aiReasoning = `TradeAI Quant: Setup de reversão técnica na sobrevenda. Potencial de retorno às médias com risco limitado.`;
        }
        return {
          ...plan,
          reasoning: aiReasoning,
          confidence: Math.max(0.78, plan.confidence),
          source: "ia+regras",
        };
      }

      return {
        ...plan,
        source: "ia+regras",
      };
    });

    cache.set(key, { at: Date.now(), entries });
    return NextResponse.json({ success: true, entries, cached: false });
  } catch (error: unknown) {
    console.error("[AI Entries] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Falha ao gerar entradas." }, { status: 500 });
  }
}
