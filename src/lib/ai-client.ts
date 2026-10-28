import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getProvider, type AIProviderId } from "@/lib/ai/providers";
import { getActiveProvider, getModel, resolveApiKey } from "@/lib/ai/settings";
import { computeDeterministicEmbedding, cosineSimilarityFloat32 } from "@/lib/ai/agent-runtime";

// Cliente de IA compartilhado pelas rotas /api/ai/*. O motor (Claude, OpenAI, Gemini ou Qwen)
// é escolhido em Configurações → Motor de IA; as rotas não precisam saber qual está ativo.

/** A IA não está disponível (sem chave, recusa ou erro da API). As rotas usam isso para cair no fallback. */
export class AIUnavailableError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AIUnavailableError";
  }
}

export type Effort = "low" | "medium" | "high";
export type ModelCascadeTier = "fast" | "balanced" | "frontier";

/** Mensagem neutra. `content` em blocos só aparece no histórico de conversas feitas com o Claude. */
export interface AIMessage {
  role: "user" | "assistant";
  content: string | Anthropic.Beta.BetaContentBlockParam[];
}

export interface AskAIOptions {
  system: string;
  messages: AIMessage[];
  maxTokens?: number;
  /** Profundidade de raciocínio (usado pelo Claude). "low" para respostas curtas/JSON; "medium" para conversa. */
  effort?: Effort;
  /** Força um motor específico (ex.: botão "Testar"); por padrão usa o ativo. */
  provider?: AIProviderId;
  /** Tier de Model Cascading ("fast" usa SLM/mini para tarefas estruturadas/JSON; "frontier" para raciocínio profundo) */
  cascadeTier?: ModelCascadeTier;
  /** Força saída estrita em JSON object (response_format: json_object) */
  jsonMode?: boolean;
  /** Habilita Cache Semântico em memória (TTL padrão 45s, similaridade >= 0.96) */
  enableSemanticCache?: boolean;
  semanticCacheTtlMs?: number;
}

export interface AIReply {
  text: string;
  provider: AIProviderId;
  model: string;
  /** Conteúdo para guardar no histórico e reenviar no próximo turno (blocos completos no Claude). */
  assistantContent: AIMessage["content"];
  cachedSemanticHit?: boolean;
}

/**
 * Roteamento Inteligente de Modelos (Model Cascading)
 * Mapeia cada provedor e tier de complexidade para o modelo de melhor relação custo/latência/precisão.
 */
const CASCADE_MODEL_MAP: Record<AIProviderId, Record<ModelCascadeTier, string>> = {
  gemini: {
    fast: "gemini-flash-lite-latest",
    balanced: "gemini-2.5-flash",
    frontier: "gemini-2.5-pro",
  },
  openai: {
    fast: "gpt-4o-mini",
    balanced: "gpt-4o",
    frontier: "o1",
  },
  claude: {
    fast: "claude-haiku-4-5-20251001",
    balanced: "claude-sonnet-5-5",
    frontier: "claude-opus-5-5",
  },
  qwen: {
    fast: "qwen-turbo",
    balanced: "qwen-plus",
    frontier: "qwen-max",
  },
};

export function selectCascadedModel(provider: AIProviderId, tier?: ModelCascadeTier): string {
  const configured = getModel(provider);
  if (!tier) return configured;
  return CASCADE_MODEL_MAP[provider]?.[tier] || configured;
}

interface SemanticCacheEntry {
  keyHash: string;
  embedding: Float32Array;
  reply: AIReply;
  expiresAt: number;
}

const MAX_SEMANTIC_CACHE_ENTRIES = 150;
const semanticPromptCache = new Map<string, SemanticCacheEntry>();

export function clearSemanticPromptCache(): void {
  semanticPromptCache.clear();
}

function lookupSemanticCache(
  system: string,
  userPrompt: string,
  similarityThreshold = 0.96
): AIReply | null {
  const now = Date.now();
  const composite = `${system.slice(0, 180)}||${userPrompt}`;
  const exact = semanticPromptCache.get(composite);
  if (exact) {
    if (exact.expiresAt > now) {
      return { ...exact.reply, cachedSemanticHit: true };
    }
    semanticPromptCache.delete(composite);
  }

  const queryVec = computeDeterministicEmbedding(composite);
  for (const [k, entry] of semanticPromptCache.entries()) {
    if (entry.expiresAt <= now) {
      semanticPromptCache.delete(k);
      continue;
    }
    const sim = cosineSimilarityFloat32(queryVec, entry.embedding);
    if (sim >= similarityThreshold) {
      return { ...entry.reply, cachedSemanticHit: true };
    }
  }
  return null;
}

function storeSemanticCache(
  system: string,
  userPrompt: string,
  reply: AIReply,
  ttlMs = 45_000
): void {
  const composite = `${system.slice(0, 180)}||${userPrompt}`;
  if (semanticPromptCache.size >= MAX_SEMANTIC_CACHE_ENTRIES) {
    const oldestKey = semanticPromptCache.keys().next().value;
    if (oldestKey) semanticPromptCache.delete(oldestKey);
  }
  semanticPromptCache.set(composite, {
    keyHash: composite,
    embedding: computeDeterministicEmbedding(composite),
    reply,
    expiresAt: Date.now() + ttlMs,
  });
}

// Endpoints compatíveis com a API da OpenAI documentados pelos próprios fornecedores.
const OPENAI_COMPATIBLE_BASE: Partial<Record<AIProviderId, string>> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/",
  qwen: process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
};

const anthropicClients = new Map<string, Anthropic>();
const openaiClients = new Map<string, OpenAI>();

function requireKey(provider: AIProviderId): string {
  const { key } = resolveApiKey(provider);
  if (!key) {
    const info = getProvider(provider);
    throw new AIUnavailableError(
      `${info.name} sem chave: informe a chave em Configurações → Motor de IA ou defina ${info.envKeys[0]} no .env.local.`
    );
  }
  return key;
}

export function getAnthropic(key: string): Anthropic {
  let c = anthropicClients.get(key);
  if (!c) {
    c = new Anthropic({ apiKey: key });
    anthropicClients.set(key, c);
  }
  return c;
}

export function getOpenAICompatible(provider: AIProviderId, key: string): OpenAI {
  const cacheKey = `${provider}:${key}`;
  let c = openaiClients.get(cacheKey);
  if (!c) {
    c = new OpenAI({ apiKey: key, baseURL: OPENAI_COMPATIBLE_BASE[provider] });
    openaiClients.set(cacheKey, c);
  }
  return c;
}

function contentToText(content: AIMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlockParam => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function askClaude(o: AskAIOptions, model: string): Promise<AIReply> {
  const client = getAnthropic(requireKey("claude"));
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model,
      max_tokens: o.maxTokens ?? 4096,
      system: o.system,
      messages: o.messages,
      output_config: { effort: o.effort ?? "low" },
      // Se o modelo recusar por política, a API reexecuta em outro modelo recomendado na mesma chamada.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AIUnavailableError("Chave da Anthropic inválida.", 401);
    } else if (error instanceof Anthropic.RateLimitError) {
      throw new AIUnavailableError("Limite de requisições do Claude atingido. Tente novamente em instantes.", 429);
    } else if (error instanceof Anthropic.APIError) {
      throw new AIUnavailableError(`Erro da API do Claude (${error.status}): ${error.message}`, error.status);
    }
    throw new AIUnavailableError(`Falha ao contatar o Claude: ${(error as Error)?.message ?? error}`);
  }

  if (response.stop_reason === "refusal") {
    throw new AIUnavailableError("O Claude recusou esta solicitação.");
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return {
    text,
    provider: "claude",
    model: response.model,
    assistantContent: response.content as Anthropic.Beta.BetaContentBlockParam[],
  };
}

async function askOpenAICompatible(o: AskAIOptions, provider: AIProviderId, model: string): Promise<AIReply> {
  const info = getProvider(provider);
  const client = getOpenAICompatible(provider, requireKey(provider));
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: o.system },
    ...o.messages.map((m) => ({ role: m.role, content: contentToText(m.content) })),
  ];
  const limit = o.maxTokens ?? 4096;

  let completion: OpenAI.Chat.ChatCompletion;
  try {
    completion = await client.chat.completions.create({
      model,
      messages,
      ...(o.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      // A OpenAI exige max_completion_tokens nos modelos novos; Gemini e Qwen aceitam max_tokens.
      ...(provider === "openai" ? { max_completion_tokens: limit } : { max_tokens: limit }),
    });
  } catch (error) {
    if (error instanceof OpenAI.AuthenticationError) {
      throw new AIUnavailableError(`Chave do ${info.name} inválida.`, 401);
    } else if (error instanceof OpenAI.RateLimitError) {
      throw new AIUnavailableError(`Limite de requisições do ${info.name} atingido. Tente novamente em instantes.`, 429);
    } else if (error instanceof OpenAI.APIError) {
      throw new AIUnavailableError(`Erro da API do ${info.name} (${error.status ?? "rede"}): ${error.message}`, error.status);
    }
    throw new AIUnavailableError(`Falha ao contatar o ${info.name}: ${(error as Error)?.message ?? error}`);
  }

  const choice = completion.choices[0];
  if (choice?.finish_reason === "content_filter") {
    throw new AIUnavailableError(`O ${info.name} bloqueou esta solicitação pelo filtro de conteúdo.`);
  }
  const text = (choice?.message?.content ?? "").trim();
  return { text, provider, model: completion.model || model, assistantContent: text };
}

const ALL_AI_PROVIDERS: AIProviderId[] = ["gemini", "openai", "claude", "qwen"];

/**
 * Chamada resiliente ao motor de IA ativo.
 * Quando o motor ativo falhar (timeout, rate limit 429 ou erro de API),
 * a operação em andamento é automaticamente movida para o próximo motor em funcionamento.
 */
export async function askAI(o: AskAIOptions): Promise<AIReply> {
  const provider = o.provider ?? getActiveProvider();
  const model = selectCascadedModel(provider, o.cascadeTier);

  const lastUserText =
    o.messages.length > 0 ? contentToText(o.messages[o.messages.length - 1].content) : "";
  if (o.enableSemanticCache !== false && o.messages.length === 1 && lastUserText) {
    const cached = lookupSemanticCache(o.system, lastUserText);
    if (cached) return cached;
  }

  try {
    const reply =
      provider === "claude"
        ? await askClaude(o, model)
        : await askOpenAICompatible(o, provider, model);
    if (o.enableSemanticCache !== false && o.messages.length === 1 && lastUserText) {
      storeSemanticCache(o.system, lastUserText, reply, o.semanticCacheTtlMs ?? 45_000);
    }
    return reply;
  } catch (primaryError) {
    // Se um provedor específico foi forçado explicitamente pelo chamador sem opção de failover, relança
    if (o.provider && o.provider !== getActiveProvider()) {
      throw primaryError;
    }

    // Busca outros motores que possuem chave de API disponível
    const fallbackProviders = ALL_AI_PROVIDERS.filter((p) => p !== provider && resolveApiKey(p).key);

    for (const fallback of fallbackProviders) {
      try {
        console.warn(
          `[AI Engine Failover] Motor "${provider}" falhou (${(primaryError as Error)?.message}). Movendo operação para o motor em funcionamento "${fallback}"...`
        );
        const fallbackModel = selectCascadedModel(fallback, o.cascadeTier);
        const reply =
          fallback === "claude"
            ? await askClaude({ ...o, provider: fallback }, fallbackModel)
            : await askOpenAICompatible({ ...o, provider: fallback }, fallback, fallbackModel);

        if (o.enableSemanticCache !== false && o.messages.length === 1 && lastUserText) {
          storeSemanticCache(o.system, lastUserText, reply, o.semanticCacheTtlMs ?? 45_000);
        }
        return reply;
      } catch (fallbackError) {
        console.warn(`[AI Engine Failover] Motor "${fallback}" também falhou. Tentando próximo...`);
      }
    }

    // Se nenhum outro motor estiver em funcionamento, relança o erro do motor original
    throw primaryError;
  }
}

/** Atalho para uma pergunta única (system + uma mensagem do usuário); devolve só o texto. */
export async function askAIOnce(
  system: string,
  prompt: string,
  options: Omit<AskAIOptions, "system" | "messages"> = {}
): Promise<string> {
  return (await askAI({ system, messages: [{ role: "user", content: prompt }], ...options })).text;
}

/** Modelos disponíveis na conta do provedor (para o seletor da tela). */
export async function listModels(provider: AIProviderId): Promise<string[]> {
  const key = requireKey(provider);
  const ids: string[] = [];
  try {
    if (provider === "claude") {
      for await (const m of getAnthropic(key).models.list()) ids.push(m.id);
    } else {
      for await (const m of getOpenAICompatible(provider, key).models.list()) ids.push(m.id.replace(/^models\//, ""));
    }
  } catch (error) {
    const status = (error as { status?: number })?.status;
    throw new AIUnavailableError(`Não foi possível listar os modelos: ${(error as Error)?.message ?? error}`, status);
  }
  return Array.from(new Set(ids)).sort();
}

// Extrai JSON de uma resposta que pode vir dentro de ```json ... ```.
export function parseJsonLoose<T = unknown>(text: string): T | null {
  const cleaned = text.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}
