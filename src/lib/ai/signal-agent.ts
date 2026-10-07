// Agente de sinais com Tool Use. O LLM ativo (Claude, OpenAI, Gemini ou Qwen) pode chamar
// ferramentas ligadas aos motores reais (candles + indicadores, livro de ofertas L2, funding/24h,
// avaliação de risco). Cada chamada é registrada em telemetria para o widget "AI Brain".
//
// Regra de segurança: qualquer falha do LLM (sem chave, erro HTTP, timeout, JSON inválido)
// resulta em HOLD com `agent_error = true`. Um erro de sistema nunca gera BUY/SELL.

import Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { getAnthropic, getOpenAICompatible, parseJsonLoose } from "@/lib/ai-client";
import { getActiveProvider, getModel, resolveApiKey } from "@/lib/ai/settings";
import type { AIProviderId } from "@/lib/ai/providers";
import { getOrderBookAnalysis, getDepthSlippage } from "@/lib/bot/order-book-cache";
import {
  calculateADX,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  relativeATR,
  calculatePivotPoints,
  checkResistanceProximity,
  calculateTechnicalScannerScore,
} from "@/lib/bot/indicators";
import type { KlineData } from "@/lib/store";

export const MIN_RISK_REWARD_THRESHOLD = 2.2;
const TOOL_TIMEOUT_MS = 3_000;
const LLM_TIMEOUT_MS = 20_000;
const MAX_ITERATIONS = 4;
const BINANCE = "https://api.binance.com";
const BINANCE_FUTURES = "https://fapi.binance.com";

// ---------------------------------------------------------------------------
// Telemetria
// ---------------------------------------------------------------------------

/** success: dados reais completos. fallback: dados parciais. failed: sem dados (timeout/erro). */
export type ToolStatus = "success" | "fallback" | "failed";

export interface ToolInvocation {
  name: string;
  label: string;
  status: ToolStatus;
  duration_ms: number;
  args: Record<string, unknown>;
  summary?: string;
  error?: string;
}

export interface AgentTelemetry {
  /** agent: o LLM respondeu. fail_safe: o LLM falhou e o sistema forçou HOLD. */
  mode: "agent" | "fail_safe";
  provider: AIProviderId | null;
  model: string | null;
  iterations: number;
  tools: ToolInvocation[];
  llm_error?: string;
  started_at: string;
  duration_ms: number;
}

export interface AgentSignal {
  signal: "BUY" | "SELL" | "HOLD";
  confidence_score: number;
  risk_reward_ratio: number;
  key_driver: string;
  risk_warning: string;
  stop_loss: number;
  take_profit: number;
  vetoed: boolean;
  veto_reason?: string;
  agent_error: boolean;
  error_reason?: string;
  agent_telemetry: AgentTelemetry;
}

// ---------------------------------------------------------------------------
// Ferramentas (motores reais)
// ---------------------------------------------------------------------------

interface ToolDef {
  name: string;
  label: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required: string[] };
}

const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"];

export const AGENT_TOOLS: ToolDef[] = [
  {
    name: "trend_momentum_analysis",
    label: "Tendência & Momentum",
    description:
      "Busca candles reais da Binance e calcula RSI(14), EMA 20/50, MACD(12,26,9), ADX(14) e ATR relativo. Use para avaliar tendência e momentum.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Par, ex: BTCUSDT" },
        interval: { type: "string", enum: INTERVALS, description: "Tempo gráfico" },
      },
      required: ["symbol", "interval"],
    },
  },
  {
    name: "order_book_liquidity",
    label: "Livro de Ofertas L2",
    description:
      "Lê o livro de ofertas L2 real (20 níveis): spread, volume de bids/asks, desequilíbrio de fluxo (OFI, -1 a +1), melhor bid/ask.",
    parameters: {
      type: "object",
      properties: { symbol: { type: "string", description: "Par, ex: BTCUSDT" } },
      required: ["symbol"],
    },
  },
  {
    name: "market_context",
    label: "Funding & Scanner 24h",
    description:
      "Funding rate real dos futuros perpétuos e estatísticas 24h do par, incluindo a posição do par no ranking de volume do scanner de mercado (pares USDT).",
    parameters: {
      type: "object",
      properties: { symbol: { type: "string", description: "Par, ex: BTCUSDT" } },
      required: ["symbol"],
    },
  },
  {
    name: "trade_risk_evaluation",
    label: "Avaliação de Risco",
    description:
      "Valida um plano de trade: calcula a relação risco/retorno real, a distância do stop em múltiplos de ATR (1h) e o slippage estimado pela profundidade do livro. Use antes de propor BUY ou SELL.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Par, ex: BTCUSDT" },
        side: { type: "string", enum: ["BUY", "SELL"] },
        entry_price: { type: "number" },
        stop_loss: { type: "number" },
        take_profit: { type: "number" },
        order_usd: { type: "number", description: "Tamanho da ordem em USDT (padrão 100)" },
      },
      required: ["symbol", "side", "entry_price", "stop_loss", "take_profit"],
    },
  },
  {
    name: "technical_scanner",
    label: "Scanner Técnico & Pivots",
    description:
      "Calcula os Pivot Points diários (PP, R1, S1, R2, S2), o Composite Score de 6 indicadores (-12 a +12) e detecta a proximidade de resistências. Use para evitar comprar no topo ou colado em resistências.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Par, ex: BTCUSDT" },
      },
      required: ["symbol"],
    },
  },
];

const TOOL_LABELS = Object.fromEntries(AGENT_TOOLS.map((t) => [t.name, t.label]));

class ToolDataError extends Error {}

async function fetchJson(url: string, signal: AbortSignal): Promise<any> {
  const res = await fetch(url, { cache: "no-store", signal });
  if (!res.ok) throw new ToolDataError(`HTTP ${res.status} em ${new URL(url).pathname}`);
  return res.json();
}

function cleanSymbol(raw: unknown): string {
  const s = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) throw new ToolDataError("symbol ausente");
  return s.endsWith("USDT") ? s : `${s}USDT`;
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

async function fetchKlines(symbol: string, interval: string, signal: AbortSignal): Promise<KlineData[]> {
  const raw = await fetchJson(`${BINANCE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=200`, signal);
  if (!Array.isArray(raw) || raw.length === 0) throw new ToolDataError("Binance não retornou candles");
  return raw.map((k: any[]) => ({
    time: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

interface ToolOutcome {
  status: ToolStatus;
  data: Record<string, unknown>;
  summary: string;
}

async function trendMomentum(args: any, signal: AbortSignal): Promise<ToolOutcome> {
  const symbol = cleanSymbol(args.symbol);
  const interval = INTERVALS.includes(args.interval) ? args.interval : "1h";
  const klines = await fetchKlines(symbol, interval, signal);
  const closes = klines.map((k) => k.close);
  const last = closes[closes.length - 1];
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const macd = calculateMACD(closes);
  const adx = calculateADX(klines);
  const rsi = calculateRSI(closes);
  const trend = last > ema20 && ema20 > ema50 ? "ALTA" : last < ema20 && ema20 < ema50 ? "BAIXA" : "LATERAL";
  const complete = closes.length >= 60 && macd !== null && adx !== null;
  return {
    status: complete ? "success" : "fallback",
    data: {
      symbol,
      interval,
      candles: closes.length,
      last_close: last,
      rsi_14: round(rsi, 2),
      ema_20: round(ema20),
      ema_50: round(ema50),
      macd_hist: macd ? round(macd.histogram, 6) : null,
      adx_14: adx !== null ? round(adx, 2) : null,
      atr_relative_percent: round(relativeATR(klines) * 100, 3),
      trend,
      ...(complete ? {} : { warning: "Histórico insuficiente para MACD/ADX" }),
    },
    summary: `${trend} · RSI ${rsi.toFixed(1)}${adx !== null ? ` · ADX ${adx.toFixed(1)}` : ""}`,
  };
}

async function orderBook(args: any): Promise<ToolOutcome> {
  const symbol = cleanSymbol(args.symbol);
  const a = await getOrderBookAnalysis(symbol);
  // O cache devolve um placeholder 50/50 com bestBid = 0 quando não há dados: isso é falha, não dado.
  // ok = false com preços válidos é só o filtro de entrada do robô rejeitando o book, e segue como dado.
  if (a.bestBid <= 0 || a.bestAsk <= 0) {
    throw new ToolDataError(a.detail || "Livro de ofertas indisponível");
  }
  return {
    status: "success",
    data: {
      symbol,
      best_bid: a.bestBid,
      best_ask: a.bestAsk,
      spread_percent: round(a.spreadPercent, 6),
      bid_volume: round(a.bidVolume),
      ask_volume: round(a.askVolume),
      buyer_percent: round(a.buyerPercent, 1),
      seller_percent: round(a.sellerPercent, 1),
      order_flow_imbalance: round(a.orderFlowImbalance, 3),
      bot_entry_filter: a.ok ? "aprovado" : `bloqueado: ${a.detail}`,
    },
    summary: `OFI ${a.orderFlowImbalance >= 0 ? "+" : ""}${a.orderFlowImbalance.toFixed(2)} · spread ${a.spreadPercent.toFixed(3)}%`,
  };
}

async function marketContext(args: any, signal: AbortSignal): Promise<ToolOutcome> {
  const symbol = cleanSymbol(args.symbol);
  const [funding, tickers] = await Promise.allSettled([
    fetchJson(`${BINANCE_FUTURES}/fapi/v1/premiumIndex?symbol=${symbol}`, signal),
    fetchJson(`${BINANCE}/api/v3/ticker/24hr`, signal),
  ]);
  const data: Record<string, unknown> = { symbol };
  const missing: string[] = [];

  if (funding.status === "fulfilled" && funding.value?.lastFundingRate !== undefined) {
    data.funding_rate_percent = round(parseFloat(funding.value.lastFundingRate) * 100, 4);
    data.mark_price = parseFloat(funding.value.markPrice);
  } else {
    missing.push("funding (par sem perpétuo ou API indisponível)");
  }

  if (tickers.status === "fulfilled" && Array.isArray(tickers.value)) {
    const usdt = tickers.value
      .filter((t: any) => typeof t.symbol === "string" && t.symbol.endsWith("USDT"))
      .map((t: any) => ({ symbol: t.symbol, qv: parseFloat(t.quoteVolume) }))
      .sort((x: any, y: any) => y.qv - x.qv);
    const rank = usdt.findIndex((t: any) => t.symbol === symbol);
    const own = tickers.value.find((t: any) => t.symbol === symbol);
    if (own) {
      data.price_change_percent_24h = parseFloat(own.priceChangePercent);
      data.quote_volume_24h_usdt = round(parseFloat(own.quoteVolume), 0);
      data.high_24h = parseFloat(own.highPrice);
      data.low_24h = parseFloat(own.lowPrice);
      data.volume_rank_usdt_pairs = rank >= 0 ? rank + 1 : null;
      data.usdt_pairs_ranked = usdt.length;
    } else {
      missing.push("par não encontrado no scanner 24h");
    }
  } else {
    missing.push("scanner 24h");
  }

  if (missing.length === 2) throw new ToolDataError(missing.join("; "));
  if (missing.length) data.missing = missing;
  const fr = data.funding_rate_percent as number | undefined;
  return {
    status: missing.length ? "fallback" : "success",
    data,
    summary: [
      fr !== undefined ? `funding ${fr >= 0 ? "+" : ""}${fr}%` : null,
      data.volume_rank_usdt_pairs ? `rank vol #${data.volume_rank_usdt_pairs}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

async function tradeRisk(args: any, signal: AbortSignal): Promise<ToolOutcome> {
  const symbol = cleanSymbol(args.symbol);
  const side = args.side === "SELL" ? "SELL" : "BUY";
  const entry = Number(args.entry_price);
  const sl = Number(args.stop_loss);
  const tp = Number(args.take_profit);
  const orderUsd = Number(args.order_usd) > 0 ? Number(args.order_usd) : 100;
  if (![entry, sl, tp].every((n) => Number.isFinite(n) && n > 0)) {
    throw new ToolDataError("entry_price, stop_loss e take_profit devem ser números positivos");
  }
  const geometryOk = side === "BUY" ? sl < entry && entry < tp : tp < entry && entry < sl;
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  const rr = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0; // mesmo arredondamento do gatekeeper

  const data: Record<string, unknown> = {
    symbol,
    side,
    geometry_valid: geometryOk,
    risk_reward_ratio: round(rr, 2),
    stop_distance_percent: round((risk / entry) * 100, 3),
    target_distance_percent: round((reward / entry) * 100, 3),
    passes_min_rr: geometryOk && rr >= MIN_RISK_REWARD_THRESHOLD,
  };
  let partial = false;
  try {
    const klines = await fetchKlines(symbol, "1h", signal);
    const atr = relativeATR(klines) * entry;
    data.atr_1h = round(atr);
    data.stop_in_atr_multiples = atr > 0 ? round(risk / atr, 2) : null;

    const high = Math.max(...klines.slice(-24).map((k) => k.high), entry);
    const low = Math.min(...klines.slice(-24).map((k) => k.low), entry);
    const pivots = calculatePivotPoints(high, low, entry);
    const resCheck = checkResistanceProximity(entry, pivots, 0.8);
    data.resistance_safe_to_buy = side === "BUY" ? resCheck.safeToBuy : true;
    if (side === "BUY" && !resCheck.safeToBuy) {
      data.resistance_warning = resCheck.warning;
    }
  } catch {
    partial = true;
    data.atr_1h = null;
  }
  try {
    data.estimated_slippage_percent = await getDepthSlippage(symbol, orderUsd, side);
  } catch {
    partial = true;
  }
  return {
    status: partial ? "fallback" : "success",
    data,
    summary: geometryOk ? `R:R ${rr.toFixed(2)}${rr >= MIN_RISK_REWARD_THRESHOLD ? " ✓" : " < 2.2"}` : "SL/TP no lado errado",
  };
}

async function technicalScanner(args: any, signal: AbortSignal): Promise<ToolOutcome> {
  const symbol = cleanSymbol(args.symbol);
  const [klines1h, ticker] = await Promise.all([
    fetchKlines(symbol, "1h", signal),
    fetchJson(`${BINANCE}/api/v3/ticker/24hr?symbol=${symbol}`, signal).catch(() => null),
  ]);

  const currentPrice = klines1h[klines1h.length - 1]?.close || 0;
  const high24h = ticker ? parseFloat(ticker.highPrice) : Math.max(...klines1h.slice(-24).map((k) => k.high));
  const low24h = ticker ? parseFloat(ticker.lowPrice) : Math.min(...klines1h.slice(-24).map((k) => k.low));

  const pivots = calculatePivotPoints(high24h, low24h, currentPrice);
  const resCheck = checkResistanceProximity(currentPrice, pivots, 0.8);
  const score = calculateTechnicalScannerScore(klines1h);

  const data: Record<string, unknown> = {
    symbol,
    current_price: currentPrice,
    pivots: {
      pp: pivots.pp,
      r1: pivots.r1,
      r2: pivots.r2,
      s1: pivots.s1,
      s2: pivots.s2,
    },
    resistance_check: {
      safe_to_buy: resCheck.safeToBuy,
      nearest_level: resCheck.nearestLevel,
      distance_percent: resCheck.distancePercent,
      warning: resCheck.warning || null,
    },
    composite_score: score.compositeScore,
    recommendation: score.recommendation,
    regime: score.regime,
    scores_breakdown: score.scores,
  };

  return {
    status: "success",
    data,
    summary: `Score ${score.compositeScore} (${score.recommendation}) · Reg: ${score.regime} · R1: $${pivots.r1} (${resCheck.safeToBuy ? "livre" : "VETO resist."})`,
  };
}

const TOOL_IMPLS: Record<string, (args: any, signal: AbortSignal) => Promise<ToolOutcome>> = {
  trend_momentum_analysis: trendMomentum,
  order_book_liquidity: (args) => orderBook(args),
  market_context: marketContext,
  trade_risk_evaluation: tradeRisk,
  technical_scanner: technicalScanner,
};

/** Executa uma ferramenta com limite rígido de 3s. Nunca lança: falhas viram resultado de erro para o LLM. */
export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ invocation: ToolInvocation; result: Record<string, unknown> }> {
  const started = Date.now();
  const base = { name, label: TOOL_LABELS[name] ?? name, args };
  const impl = TOOL_IMPLS[name];
  if (!impl) {
    const error = `Ferramenta desconhecida: ${name}`;
    return {
      invocation: { ...base, status: "failed", duration_ms: 0, error },
      result: { error },
    };
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ToolDataError(`timeout de ${TOOL_TIMEOUT_MS / 1000}s`));
    }, TOOL_TIMEOUT_MS);
  });

  try {
    const outcome = await Promise.race([impl(args, controller.signal), timeout]);
    return {
      invocation: { ...base, status: outcome.status, duration_ms: Date.now() - started, summary: outcome.summary },
      result: { status: outcome.status, ...outcome.data },
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return {
      invocation: { ...base, status: "failed", duration_ms: Date.now() - started, error },
      result: { error: `${name} falhou (${error}). Não invente estes dados: use outra ferramenta ou decida HOLD.` },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Loop do agente (por provedor)
// ---------------------------------------------------------------------------

export const AGENT_SYSTEM_PROMPT = `Você é um motor quantitativo de análise de criptoativos com acesso a ferramentas que leem dados reais da Binance.
Use as ferramentas para obter tendência, livro de ofertas, scanner técnico (Pivots e Composite Score) e contexto antes de decidir.
Antes de propor BUY ou SELL, valide o plano com trade_risk_evaluation.
Se uma ferramenta falhar, NÃO invente os dados dela: decida com o que tem ou responda HOLD.

REGRAS DE OURO DA SKILL TECHNICAL-SCANNER:
1. NUNCA recomende BUY se a cotação estiver a menos de 0.8% da resistência R1 ou R2 dos Pivots Diários.
2. NUNCA recomende BUY se o Composite Score for menor que +3 ou se a tendência diária for de baixa.
3. Relação R:R mínima obrigatória: 2.2:1. Se a distância até o alvo/resistência for menor que 2.2x o stop loss, a resposta DEVE ser HOLD.

Resposta final: EXCLUSIVAMENTE um objeto JSON, sem texto fora dele:
{
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence_score": <inteiro 0-100>,
  "risk_reward_ratio": <número>,
  "key_driver": "<no máximo 10 palavras>",
  "risk_warning": "<no máximo 10 palavras>",
  "stop_loss": <preço>,
  "take_profit": <preço>
}
Regras: BUY exige stop_loss < preço < take_profit com R:R >= 2.2. SELL exige take_profit < preço < stop_loss com R:R >= 2.2. R:R abaixo de 2.2 DEVE ser HOLD.
Para HOLD, stop_loss e take_profit iguais ao preço atual.`;

class LLMFailure extends Error {}

interface LoopResult {
  text: string;
  iterations: number;
  model: string;
}

type ToolRunner = (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;

async function runClaudeLoop(key: string, model: string, user: string, runTool: ToolRunner): Promise<LoopResult> {
  const client = getAnthropic(key);
  const tools: Anthropic.Tool[] = AGENT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool.InputSchema,
  }));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    // Na última volta as ferramentas saem da lista para forçar a resposta final.
    const last = i === MAX_ITERATIONS;
    let res: Anthropic.Message;
    try {
      res = await client.messages.create(
        {
          model,
          max_tokens: 1500,
          system: AGENT_SYSTEM_PROMPT,
          messages,
          ...(last ? {} : { tools }),
        },
        { timeout: LLM_TIMEOUT_MS, maxRetries: 0 }
      );
    } catch (e) {
      throw new LLMFailure(e instanceof Anthropic.APIError ? `Claude HTTP ${e.status}: ${e.message}` : String(e));
    }
    if (res.stop_reason === "refusal") throw new LLMFailure("O Claude recusou a solicitação");

    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason === "tool_use" && toolUses.length && !last) {
      messages.push({ role: "assistant", content: res.content });
      const results = await Promise.all(
        toolUses.map(async (tu) => ({
          type: "tool_result" as const,
          tool_use_id: tu.id,
          content: JSON.stringify(await runTool(tu.name, (tu.input ?? {}) as Record<string, unknown>)),
        }))
      );
      messages.push({ role: "user", content: results });
      continue;
    }
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { text, iterations: i, model: res.model };
  }
  throw new LLMFailure("Limite de iterações atingido sem resposta final");
}

async function runOpenAICompatibleLoop(
  provider: AIProviderId,
  key: string,
  model: string,
  user: string,
  runTool: ToolRunner
): Promise<LoopResult> {
  const client = getOpenAICompatible(provider, key);
  const tools: OpenAI.Chat.ChatCompletionTool[] = AGENT_TOOLS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
    { role: "user", content: user },
  ];

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    const last = i === MAX_ITERATIONS;
    let completion: OpenAI.Chat.ChatCompletion;
    try {
      completion = await client.chat.completions.create(
        {
          model,
          messages,
          ...(last ? {} : { tools, tool_choice: "auto" as const }),
          ...(provider === "openai" ? { max_completion_tokens: 1500 } : { max_tokens: 1500 }),
        },
        { timeout: LLM_TIMEOUT_MS, maxRetries: 0 }
      );
    } catch (e) {
      const status = (e as { status?: number })?.status;
      throw new LLMFailure(`${provider}${status ? ` HTTP ${status}` : ""}: ${(e as Error)?.message ?? e}`);
    }
    const msg = completion.choices?.[0]?.message;
    if (!msg) throw new LLMFailure(`${provider} retornou resposta vazia`);

    const calls = (msg.tool_calls ?? []).filter(
      (c): c is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => c.type === "function"
    );
    if (calls.length && !last) {
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
      for (const call of calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          // Argumentos inválidos: a ferramenta devolve o erro de validação ao LLM.
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(await runTool(call.function.name, args)),
        });
      }
      continue;
    }
    return { text: msg.content ?? "", iterations: i, model: completion.model || model };
  }
  throw new LLMFailure("Limite de iterações atingido sem resposta final");
}

// ---------------------------------------------------------------------------
// Gatekeeper
// ---------------------------------------------------------------------------

function limitWords(s: unknown, fallback: string): string {
  const text = typeof s === "string" && s.trim() ? s.trim() : fallback;
  return text.split(/\s+/).slice(0, 10).join(" ");
}

function holdAt(price: number) {
  return { stop_loss: price, take_profit: price };
}

interface RawDecision {
  signal?: string;
  confidence_score?: number;
  risk_reward_ratio?: number;
  key_driver?: string;
  risk_warning?: string;
  stop_loss?: number;
  take_profit?: number;
}

/**
 * Aplica as travas sobre a decisão do LLM. O R:R é recalculado a partir dos preços:
 * o valor declarado pelo modelo nunca é usado para aprovar uma ordem.
 */
export function applyGatekeeper(raw: RawDecision, price: number) {
  let signal = String(raw.signal ?? "HOLD").toUpperCase() as AgentSignal["signal"];
  if (!["BUY", "SELL", "HOLD"].includes(signal)) signal = "HOLD";
  const confidence = Math.max(0, Math.min(100, Math.round(Number(raw.confidence_score) || 0)));
  const sl = Number(raw.stop_loss);
  const tp = Number(raw.take_profit);

  const base = {
    confidence_score: confidence,
    key_driver: limitWords(raw.key_driver, "Sem gatilho informado"),
    risk_warning: limitWords(raw.risk_warning, "Sem alerta informado"),
  };

  if (signal === "HOLD") {
    return { ...base, signal, risk_reward_ratio: 0, ...holdAt(price), vetoed: false };
  }

  const validNumbers = [sl, tp, price].every((n) => Number.isFinite(n) && n > 0);
  const geometryOk = validNumbers && (signal === "BUY" ? sl < price && price < tp : tp < price && price < sl);
  const rr = geometryOk ? Math.round((Math.abs(tp - price) / Math.abs(price - sl)) * 100) / 100 : 0;

  if (!geometryOk) {
    return {
      ...base,
      signal: "HOLD" as const,
      risk_reward_ratio: 0,
      ...holdAt(price),
      vetoed: true,
      veto_reason: `Operação vetada: stop/alvo inconsistentes com ${signal} ao preço atual`,
    };
  }
  if (rr < MIN_RISK_REWARD_THRESHOLD) {
    return {
      ...base,
      signal: "HOLD" as const,
      risk_reward_ratio: rr,
      ...holdAt(price),
      vetoed: true,
      veto_reason: "Operação vetada pela matriz de risco: Assimetria desfavorável",
    };
  }
  return { ...base, signal, risk_reward_ratio: rr, stop_loss: sl, take_profit: tp, vetoed: false };
}

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------

export async function runSignalAgent(
  symbol: string,
  price: number,
  marketBrief: string,
  opts: { provider?: AIProviderId } = {}
): Promise<AgentSignal> {
  const startedAt = new Date();
  const tools: ToolInvocation[] = [];
  const runTool: ToolRunner = async (name, args) => {
    const { invocation, result } = await executeAgentTool(name, args);
    tools.push(invocation);
    return result;
  };

  const provider = opts.provider ?? getActiveProvider();
  const telemetry = (extra: Partial<AgentTelemetry>): AgentTelemetry => ({
    mode: "agent",
    provider,
    model: null,
    iterations: 0,
    tools,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    ...extra,
  });

  const failSafe = (reason: string, extra: Partial<AgentTelemetry> = {}): AgentSignal => ({
    signal: "HOLD",
    confidence_score: 0,
    risk_reward_ratio: 0,
    key_driver: "Falha do motor de IA: sinal bloqueado",
    risk_warning: "Nenhuma decisão de mercado foi gerada",
    ...holdAt(price),
    vetoed: false,
    agent_error: true,
    error_reason: reason,
    agent_telemetry: telemetry({ mode: "fail_safe", llm_error: reason, ...extra }),
  });

  if (!(price > 0)) return failSafe("Preço atual inválido ou ausente");

  const { key } = resolveApiKey(provider);
  if (!key) return failSafe(`Sem chave de API para o motor "${provider}"`);

  const model = getModel(provider);
  const user = `Analise ${symbol} ao preço atual de ${price}.\n${marketBrief}\nUse as ferramentas antes de decidir e responda só com o JSON final.`;

  let loop: LoopResult;
  try {
    loop =
      provider === "claude"
        ? await runClaudeLoop(key, model, user, runTool)
        : await runOpenAICompatibleLoop(provider, key, model, user, runTool);
  } catch (e) {
    return failSafe(e instanceof Error ? e.message : String(e), { model });
  }

  const parsed = parseJsonLoose<RawDecision>(loop.text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return failSafe("Resposta do LLM não é um JSON válido", { model: loop.model, iterations: loop.iterations });
  }

  const declared = String(parsed.signal ?? "").toUpperCase();
  if (!["BUY", "SELL", "HOLD"].includes(declared)) {
    return failSafe(`Resposta do LLM sem campo "signal" válido`, { model: loop.model, iterations: loop.iterations });
  }

  const decision = applyGatekeeper(parsed, price);
  return {
    ...decision,
    agent_error: false,
    agent_telemetry: telemetry({ model: loop.model, iterations: loop.iterations }),
  };
}
