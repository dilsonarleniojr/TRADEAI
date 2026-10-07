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
// 3. Memória de Longo Prazo (Long-Term Memory Store)
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

  public recall(query: string, category?: MemoryEntry["category"], limit: number = 5): MemoryEntry[] {
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
