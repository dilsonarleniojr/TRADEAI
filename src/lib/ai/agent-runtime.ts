/**
 * Agent Cognitive Architecture Runtime Engine for TradeAI
 * Implements:
 * 1. Self-Healing Task Execution (automatic error evaluation & parameter retry loop)
 * 2. Asynchronous DAG Execution (parallel dependency scheduling)
 * 3. Long-Term Memory Vector/Semantic Store (knowledge extraction & persistent retrieval)
 */

import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// 1. Self-Healing Task Pipeline
// ---------------------------------------------------------------------------

export interface RetryContext {
  attempt: number;
  maxAttempts: number;
  lastError: Error;
  suggestedAction?: string;
}

export interface SelfHealingResult<T> {
  success: boolean;
  result?: T;
  attemptsUsed: number;
  errors: string[];
  healed: boolean;
}

/**
 * Executa uma operação assíncrona com loop de auto-recuperação (Self-Healing).
 * Em caso de falha, aciona o handler de erro para auto-correção por até maxRetries tentativas.
 */
export async function executeWithSelfHealing<T>(
  taskName: string,
  operation: (attempt: number) => Promise<T>,
  options: {
    maxRetries?: number;
    delayBetweenRetriesMs?: number;
    onAttemptFailed?: (context: RetryContext) => Promise<void> | void;
  } = {}
): Promise<SelfHealingResult<T>> {
  const maxRetries = options.maxRetries ?? 3;
  const delayMs = options.delayBetweenRetriesMs ?? 500;
  const errors: string[] = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation(attempt);
      return {
        success: true,
        result,
        attemptsUsed: attempt,
        errors,
        healed: attempt > 1,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`[Tentativa ${attempt}/${maxRetries} Falhou]: ${errorMsg}`);

      if (options.onAttemptFailed && err instanceof Error) {
        await options.onAttemptFailed({
          attempt,
          maxAttempts: maxRetries,
          lastError: err,
        });
      }

      if (attempt < maxRetries) {
        // Pausa progressiva antes da próxima tentativa
        await new Promise((r) => setTimeout(r, delayMs * attempt));
      }
    }
  }

  return {
    success: false,
    attemptsUsed: maxRetries,
    errors,
    healed: false,
  };
}

// ---------------------------------------------------------------------------
// 2. Execução Paralela / Assíncrona via Grafo de Dependências (DAG)
// ---------------------------------------------------------------------------

export interface DAGTask<T = unknown> {
  id: string;
  dependencies: string[]; // IDs de tarefas que devem concluir antes desta
  run: (results: Map<string, unknown>) => Promise<T>;
}

export interface DAGExecutionReport {
  totalTasks: number;
  durationMs: number;
  executionStages: string[][]; // Agrupamento de tarefas executadas em paralelo por estágio
  results: Map<string, unknown>;
  errors: Map<string, string>;
}

/**
 * Escalonador assíncrono que analisa as dependências de um DAG e executa tarefas independentes
 * em paralelo, reduzindo drasticamente o tempo de processamento.
 */
export class AsyncDAGScheduler {
  public static async execute(tasks: DAGTask[]): Promise<DAGExecutionReport> {
    const startTime = Date.now();
    const results = new Map<string, unknown>();
    const errors = new Map<string, string>();
    const remainingTasks = new Map(tasks.map((t) => [t.id, t]));
    const executionStages: string[][] = [];

    while (remainingTasks.size > 0) {
      // Encontra tarefas cujas dependências já foram satisfeitas
      const readyTasks: DAGTask[] = [];
      for (const task of remainingTasks.values()) {
        const allDepsSatisfied = task.dependencies.every((depId) => results.has(depId));
        if (allDepsSatisfied) {
          readyTasks.push(task);
        }
      }

      if (readyTasks.length === 0) {
        throw new Error(
          `[DAG_DEADLOCK_DETECTED] Dependência circular ou pendente não resolvida em: ${Array.from(
            remainingTasks.keys()
          ).join(", ")}`
        );
      }

      const stageTaskIds = readyTasks.map((t) => t.id);
      executionStages.push(stageTaskIds);

      // Dispara todas as tarefas prontas em paralelo
      await Promise.all(
        readyTasks.map(async (task) => {
          try {
            const out = await task.run(results);
            results.set(task.id, out);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.set(task.id, msg);
          } finally {
            remainingTasks.delete(task.id);
          }
        })
      );
    }

    return {
      totalTasks: tasks.length,
      durationMs: Date.now() - startTime,
      executionStages,
      results,
      errors,
    };
  }
}

// ---------------------------------------------------------------------------
// 3. Memória de Longo Prazo (Long-Term Memory Store + Hybrid BM25 & Cosine RAG)
// ---------------------------------------------------------------------------

export interface MemoryEntry {
  id: string;
  category: "ARCHITECTURE_DECISION" | "BUG_RESOLUTION" | "USER_PREFERENCE" | "QUANT_STRATEGY";
  title: string;
  summary: string;
  tags: string[];
  details: Record<string, unknown>;
  timestamp: string;
  sourceContext?: string;
}

export interface HybridRetrievalMatch {
  entry: MemoryEntry;
  bm25Score: number;
  denseCosineScore: number;
  rrfScore: number;
}

/**
 * Gera um vetor de embedding léxico-semântico esparso normalizado (64 dimensões)
 * em memória com custo zero de API externa, permitindo calcular similaridade de cosseno
 * combinada com BM25 e Reciprocal Rank Fusion (RRF).
 */
export function computeDeterministicEmbedding(text: string, dims = 64): Float32Array {
  const vec = new Float32Array(dims);
  const cleaned = text.toLowerCase().replace(/[^a-z0-9_+-]/g, " ");
  const tokens = cleaned.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return vec;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    let h1 = 2166136261;
    let h2 = 16777619;
    for (let c = 0; c < tok.length; c++) {
      const code = tok.charCodeAt(c);
      h1 ^= code;
      h1 = Math.imul(h1, 16777619);
      h2 = (h2 * 31 + code) | 0;
    }
    const idx1 = Math.abs(h1) % dims;
    const idx2 = Math.abs(h2) % dims;
    vec[idx1] += 1.0;
    vec[idx2] += 0.5;
  }

  let normSq = 0;
  for (let d = 0; d < dims; d++) {
    normSq += vec[d] * vec[d];
  }
  const norm = Math.sqrt(normSq);
  if (norm > 0) {
    for (let d = 0; d < dims; d++) {
      vec[d] /= norm;
    }
  }
  return vec;
}

export function cosineSimilarityFloat32(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
  }
  return Math.max(0, Math.min(1, dot));
}

export class LongTermMemoryStore {
  private static instance: LongTermMemoryStore;
  private filePath: string;
  private memories: MemoryEntry[] = [];

  private constructor() {
    this.filePath = path.resolve(process.cwd(), "db/agent_memory.json");
    this.load();
  }

  public static getInstance(): LongTermMemoryStore {
    if (!LongTermMemoryStore.instance) {
      LongTermMemoryStore.instance = new LongTermMemoryStore();
    }
    return LongTermMemoryStore.instance;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        this.memories = JSON.parse(raw);
      } else {
        this.memories = [];
      }
    } catch {
      this.memories = [];
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.memories, null, 2), "utf-8");
    } catch (err) {
      console.error("[LongTermMemoryStore] Erro ao salvar memória:", err);
    }
  }

  public remember(entry: Omit<MemoryEntry, "id" | "timestamp">): MemoryEntry {
    const record: MemoryEntry = {
      ...entry,
      id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
    };
    this.memories.unshift(record);
    this.save();
    return record;
  }

  /**
   * Hybrid Search (BM25 + Dense Cosine Embedding + Reciprocal Rank Fusion RRF)
   * Substitui o `.includes()` ingênuo por ranqueamento híbrido de alta precisão e recall.
   */
  public recallHybrid(
    query: string,
    category?: MemoryEntry["category"],
    limit: number = 5
  ): HybridRetrievalMatch[] {
    const pool = category
      ? this.memories.filter((m) => m.category === category)
      : this.memories;
    if (pool.length === 0) return [];

    const queryTokens = query
      .toLowerCase()
      .replace(/[^a-z0-9_+-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2);
    const queryVec = computeDeterministicEmbedding(query);

    const k1 = 1.5;
    const b = 0.75;
    const docs = pool.map((m) => {
      const text = `${m.title} ${m.summary} ${m.tags.join(" ")}`.toLowerCase();
      const tokens = text.replace(/[^a-z0-9_+-]/g, " ").split(/\s+/).filter(Boolean);
      return { entry: m, text, tokens, vec: computeDeterministicEmbedding(text) };
    });

    const avgDl =
      docs.reduce((acc, d) => acc + d.tokens.length, 0) / Math.max(1, docs.length);

    // Calcula BM25 e Cosseno para cada documento
    const scored = docs.map((doc) => {
      let bm25 = 0;
      for (const qTok of queryTokens) {
        const tf = doc.tokens.filter((t) => t === qTok || t.includes(qTok)).length;
        if (tf === 0) continue;
        const df = docs.filter((d) =>
          d.tokens.some((t) => t === qTok || t.includes(qTok))
        ).length;
        const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
        const num = tf * (k1 + 1);
        const den = tf + k1 * (1 - b + b * (doc.tokens.length / Math.max(1, avgDl)));
        bm25 += idf * (num / den);
      }

      const denseCosine = cosineSimilarityFloat32(queryVec, doc.vec);
      return {
        entry: doc.entry,
        bm25Score: Number(bm25.toFixed(4)),
        denseCosineScore: Number(denseCosine.toFixed(4)),
        rrfScore: 0,
      };
    });

    const byBm25 = [...scored].sort((a, b) => b.bm25Score - a.bm25Score);
    const byDense = [...scored].sort((a, b) => b.denseCosineScore - a.denseCosineScore);

    const rrfK = 60;
    for (const item of scored) {
      const rankBm25 = byBm25.findIndex((x) => x.entry.id === item.entry.id) + 1;
      const rankDense = byDense.findIndex((x) => x.entry.id === item.entry.id) + 1;
      item.rrfScore = Number((1 / (rrfK + rankBm25) + 1 / (rrfK + rankDense)).toFixed(6));
    }

    return scored
      .filter((s) => s.bm25Score > 0 || s.denseCosineScore > 0.1)
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, limit);
  }

  public recall(query: string, category?: MemoryEntry["category"], limit: number = 5): MemoryEntry[] {
    const hybrid = this.recallHybrid(query, category, limit);
    if (hybrid.length > 0) {
      return hybrid.map((h) => h.entry);
    }
    const qLower = query.toLowerCase();
    const filtered = this.memories.filter((m) => {
      if (category && m.category !== category) return false;
      const matchText = `${m.title} ${m.summary} ${m.tags.join(" ")}`.toLowerCase();
      return matchText.includes(qLower) || m.tags.some((t) => qLower.includes(t.toLowerCase()));
    });
    return filtered.slice(0, limit);
  }

  public getAll(): MemoryEntry[] {
    return [...this.memories];
  }
}

// ---------------------------------------------------------------------------
// 4. LLM Evaluation & Operational Governance Suite (Faithfulness & Grounding)
// ---------------------------------------------------------------------------

export interface LLMEvaluationMetrics {
  faithfulnessScore: number;       // 0..1: proporção de afirmações ancoradas no contexto real
  contextRecallScore: number;      // 0..1: cobertura das ferramentas/indicadores obrigatórios
  jsonSchemaCompliance: number;    // 1.0 se validado sem reparo regex, 0.5 se reparado, 0.0 se falhou
  hallucinationRate: number;       // 0..1: fração de números/níveis inventados fora da tolerância
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  estimatedCostPer1kRequestsUsd: number;
  passedGovernanceGate: boolean;
}

/**
 * Avalia deterministicamente a fidelidade (Faithfulness), aderência ao JSON Schema
 * e ausência de alucinação numérica da resposta de um agente em relação ao contexto de ferramentas.
 */
export function evaluateLLMResponseGovernance(params: {
  promptText: string;
  responseText: string;
  parsedDecision: Record<string, unknown> | null;
  referencePrice: number;
  toolsInvokedCount: number;
  requiredToolsCount?: number;
  modelTier?: "fast" | "balanced" | "frontier";
}): LLMEvaluationMetrics {
  const {
    promptText,
    responseText,
    parsedDecision,
    referencePrice,
    toolsInvokedCount,
    requiredToolsCount = 2,
    modelTier = "fast",
  } = params;

  const estimatedPromptTokens = Math.max(1, Math.ceil(promptText.length / 4));
  const estimatedCompletionTokens = Math.max(1, Math.ceil(responseText.length / 4));

  // Custo médio por 1M tokens por tier (Fast ~$0.15/1M in, $0.60/1M out; Balanced ~$2.50/1M in, $10/1M out)
  const inRatePerMillion = modelTier === "fast" ? 0.15 : modelTier === "balanced" ? 1.25 : 3.0;
  const outRatePerMillion = modelTier === "fast" ? 0.60 : modelTier === "balanced" ? 5.0 : 15.0;
  const singleCallCostUsd =
    (estimatedPromptTokens / 1_000_000) * inRatePerMillion +
    (estimatedCompletionTokens / 1_000_000) * outRatePerMillion;
  const estimatedCostPer1kRequestsUsd = Number((singleCallCostUsd * 1000).toFixed(4));

  // 1. JSON Schema Compliance
  const trimmed = responseText.trim();
  const isStrictRawJson = trimmed.startsWith("{") && trimmed.endsWith("}") && parsedDecision !== null;
  const jsonSchemaCompliance = isStrictRawJson ? 1.0 : parsedDecision !== null ? 0.5 : 0.0;

  // 2. Context Recall (cobertura das ferramentas de verificação de mercado/risco)
  const contextRecallScore = Number(
    Math.min(1.0, toolsInvokedCount / Math.max(1, requiredToolsCount)).toFixed(2)
  );

  // 3. Verificação de Fidelidade (Faithfulness) e Detecção de Alucinação Numérica
  let hallucinationPenalties = 0;
  let checks = 3;

  if (!parsedDecision) {
    hallucinationPenalties += 3;
  } else {
    const sl = Number(parsedDecision.stop_loss ?? referencePrice);
    const tp = Number(parsedDecision.take_profit ?? referencePrice);
    // Se stop_loss ou take_profit destoarem mais de 35% do preço de referência em spot/day-trade, é alucinação de escala
    if (referencePrice > 0) {
      if (!Number.isFinite(sl) || Math.abs(sl - referencePrice) / referencePrice > 0.35) {
        hallucinationPenalties += 1;
      }
      if (!Number.isFinite(tp) || Math.abs(tp - referencePrice) / referencePrice > 0.35) {
        hallucinationPenalties += 1;
      }
    }
    const signal = String(parsedDecision.signal ?? "").toUpperCase();
    if ((signal === "BUY" || signal === "SELL") && toolsInvokedCount === 0) {
      // Recomendar compra/venda sem invocar nenhuma ferramenta de grounding é alucinação pura
      hallucinationPenalties += 1;
    }
  }

  const hallucinationRate = Number(Math.min(1, hallucinationPenalties / checks).toFixed(2));
  const faithfulnessScore = Number((1 - hallucinationRate).toFixed(2));
  const passedGovernanceGate =
    jsonSchemaCompliance >= 0.5 && faithfulnessScore >= 0.67 && hallucinationRate === 0;

  return {
    faithfulnessScore,
    contextRecallScore,
    jsonSchemaCompliance,
    hallucinationRate,
    estimatedPromptTokens,
    estimatedCompletionTokens,
    estimatedCostPer1kRequestsUsd,
    passedGovernanceGate,
  };
}
