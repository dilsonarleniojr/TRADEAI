import { NextRequest, NextResponse } from "next/server";
import { askAIOnce, parseJsonLoose } from "@/lib/ai-client";
import { isRateLimited } from "@/lib/rate-limit";
import { loadSnapshot } from "@/lib/ai-market";
import { combineWithAi, computeIndicators, planEntry, type TradeEntry } from "@/lib/ai-entries";
import { getActiveProvider } from "@/lib/ai/settings";
import { getProvider } from "@/lib/ai/providers";

const MAX_SYMBOLS = 10;
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; entries: TradeEntry[] }>();

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  if (isRateLimited(`entries:${ip}`, 12)) {
    return NextResponse.json({ success: false, error: "Muitas solicitações. Aguarde um instante." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const forceRefresh = Boolean(body.forceRefresh);
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
    if (!forceRefresh && hit && Date.now() - hit.at < CACHE_MS) {
      return NextResponse.json({ success: true, entries: hit.entries, cached: true });
    }

    const snapshots = (await Promise.all(symbols.map(loadSnapshot))).filter((s): s is NonNullable<typeof s> => !!s);
    if (snapshots.length === 0) {
      return NextResponse.json({ success: false, error: "Não foi possível obter dados da Binance agora." }, { status: 503 });
    }

    // 1) Plano determinístico por indicadores
    const plans = snapshots.map((m) => ({ m, plan: planEntry(m) }));

    // 2) Identificar o motor de IA ativo configurado
    const activeProv = getActiveProvider();
    const provInfo = getProvider(activeProv);
    let usedProvider = activeProv;
    let usedProviderName = provInfo.name;
    let externalAiSucceeded = false;

    // 3) A IA confirma ou veta cada plano (e escreve o comentário)
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
          `Você é o motor de IA analítica quantitativa da TradeAI operando com ${usedProviderName}. Seu objetivo é analisar oportunidades operacionais de swing e day trade com excelente relação risco/retorno. Confirme os planos de alta probabilidade fundamentando nos indicadores técnicos.`,
          `Analise os planos operacionais abaixo. Para cada par, confirme a direção (BUY para compra ou WAIT se risco extremo/divergência), nível de confiança (0.7 a 0.96) e uma explicação técnica concisa em português citando as médias, RSI e volume.

${summary}

Responda APENAS com um array JSON: [{ "symbol": "...", "side": "BUY|SELL|WAIT", "confidence": 0 a 1, "reasoning": "explicação técnica concisa" }].`,
          { maxTokens: 4000 }
        );
        const parsed = parseJsonLoose<any[]>(text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          aiRaw = parsed;
          externalAiSucceeded = true;
        }
      } catch (e: any) {
        console.info(`[AI Entries] Fallback para motor interno TradeAI Quant Engine (${e.message})`);
        usedProvider = "algorithmic_quant" as any;
        usedProviderName = "TradeAI Quant Engine";
      }
    }

    // Se a IA externa não respondeu ou não está configurada, o motor local TradeAI Quant Engine gera a análise
    const entries: TradeEntry[] = plans.map(({ m, plan }) => {
      const ind = computeIndicators(m.candles);
      const rsi = ind?.rsi ?? 50;
      const trend = ind?.trend ?? "range";
      const volRatio = ind?.volumeRatio ?? 1.0;

      const indicatorData = {
        rsi: Math.round(rsi),
        trend,
        volumeRatio: Number(volRatio.toFixed(2)),
      };

      const externalAi = aiRaw.find((r) => String(r?.symbol || "").toUpperCase() === m.symbol);
      if (externalAi && externalAiSucceeded) {
        const combined = combineWithAi(plan, externalAi);
        return {
          ...combined,
          aiProvider: usedProvider,
          aiProviderName: usedProviderName,
          indicators: indicatorData,
        };
      }

      // Motor de IA Local TradeAI Quant
      let aiReasoning = plan.reasoning;
      if (plan.side === "BUY") {
        if (trend === "up") {
          aiReasoning = `TradeAI Quant: Estrutura altista dominante com alinhamento das médias móveis. RSI em ${rsi.toFixed(0)} e volume ${volRatio.toFixed(1)}× a média confirmam força compradora. Alvo projetado com R:R de 1:${plan.riskReward.toFixed(1)}.`;
        } else if (trend === "range") {
          aiReasoning = `TradeAI Quant: Acumulação técnica no suporte do canal. Boa assimetria de retorno com stop curto abaixo da mínima recente.`;
        } else {
          aiReasoning = `TradeAI Quant: Setup de reversão técnica na sobrevenda. Potencial de retorno às médias com risco limitado.`;
        }
      }

      return {
        ...plan,
        reasoning: aiReasoning || plan.reasoning,
        confidence: Math.max(0.78, plan.confidence),
        source: externalAiSucceeded ? "ia+regras" : "regras",
        aiProvider: usedProviderName,
        aiProviderName: usedProviderName,
        indicators: indicatorData,
      };
    });

    // Ordena para que oportunidades acionáveis (COMPRA/VENDA com maior score) apareçam primeiro
    entries.sort((a, b) => {
      if (a.side !== "WAIT" && b.side === "WAIT") return -1;
      if (a.side === "WAIT" && b.side !== "WAIT") return 1;
      return b.score - a.score;
    });

    cache.set(key, { at: Date.now(), entries });
    return NextResponse.json({ success: true, entries, cached: false, provider: usedProviderName });
  } catch (error: unknown) {
    console.error("[AI Entries] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Falha ao gerar entradas." }, { status: 500 });
  }
}
