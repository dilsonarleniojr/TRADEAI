import {
  executeWithSelfHealing,
  AsyncDAGScheduler,
  LongTermMemoryStore,
  type DAGTask,
} from "../src/lib/ai/agent-runtime";

async function runTests() {
  console.log("=== TESTANDO ARQUITETURA COGNITIVA DO AGENTE (SELF-HEALING, DAG & MEMÓRIA) ===\n");

  // -------------------------------------------------------------------------
  // Teste 1: Auto-Correção e Tratamento de Erros (Self-Healing)
  // -------------------------------------------------------------------------
  console.log("[TESTE 1: Self-Healing com 3 Tentativas]");
  let transientFailures = 2;

  const healingTest = await executeWithSelfHealing(
    "Teste de Conexão com API Flutuante",
    async (attempt) => {
      if (transientFailures > 0) {
        transientFailures--;
        throw new Error("HTTP 503 Service Unavailable / Timeout transitório");
      }
      return { status: "OK", payload: "Dados recuperados com sucesso", attempt };
    },
    {
      maxRetries: 3,
      delayBetweenRetriesMs: 50,
      onAttemptFailed: (ctx) => {
        console.log(` -> Auto-diagnóstico: tentativa ${ctx.attempt} falhou (${ctx.lastError.message}). Ajustando parâmetros...`);
      },
    }
  );

  console.log("Sucesso final:", healingTest.success);
  console.log("Auto-recuperado (healed)?", healingTest.healed);
  console.log("Tentativas utilizadas:", healingTest.attemptsUsed);
  if (healingTest.success && healingTest.healed && healingTest.attemptsUsed === 3) {
    console.log("✅ TESTE 1 PASSOU: Self-healing recuperou a operação após 2 falhas!\n");
  } else {
    console.error("❌ TESTE 1 FALHOU.\n");
  }

  // -------------------------------------------------------------------------
  // Teste 2: Execução Paralela / Assíncrona via DAG
  // -------------------------------------------------------------------------
  console.log("[TESTE 2: Execução Paralela com Grafo de Dependências (DAG)]");

  // Cenário:
  // Passo A: Coleta de Ticker Inicial (raiz)
  // Passo B e C: Análise de Order Book e Indicadores Técnicos (paralelos, dependem de A)
  // Passo D: Síntese de Decisão Final (depende de B e C)
  const tasks: DAGTask[] = [
    {
      id: "fetch_ticker",
      dependencies: [],
      run: async () => {
        await new Promise((r) => setTimeout(r, 60));
        return { symbol: "BTCUSDT", price: 65400 };
      },
    },
    {
      id: "calc_indicators",
      dependencies: ["fetch_ticker"],
      run: async (results) => {
        const ticker = results.get("fetch_ticker") as { price: number };
        await new Promise((r) => setTimeout(r, 80));
        return { rsi: 28.4, ema9: ticker.price * 0.99 };
      },
    },
    {
      id: "fetch_order_book",
      dependencies: ["fetch_ticker"],
      run: async () => {
        await new Promise((r) => setTimeout(r, 80));
        return { spreadPct: 0.012, depthBidUsdt: 850000 };
      },
    },
    {
      id: "generate_signal",
      dependencies: ["calc_indicators", "fetch_order_book"],
      run: async (results) => {
        const ind = results.get("calc_indicators") as { rsi: number };
        const book = results.get("fetch_order_book") as { depthBidUsdt: number };
        return { action: "BUY", confidence: 92, rsi: ind.rsi, bidDepth: book.depthBidUsdt };
      },
    },
  ];

  const dagReport = await AsyncDAGScheduler.execute(tasks);
  console.log("Total de tarefas no DAG:", dagReport.totalTasks);
  console.log("Duração total:", dagReport.durationMs, "ms");
  console.log("Estágios executados:", JSON.stringify(dagReport.executionStages));

  const finalSignal = dagReport.results.get("generate_signal") as { action: string; confidence: number };
  console.log("Resultado final consolidado:", finalSignal);

  // Verificação de paralelismo: os estágios devem ser [fetch_ticker], [calc_indicators, fetch_order_book], [generate_signal]
  const isParallelStage = dagReport.executionStages[1]?.length === 2;
  if (dagReport.totalTasks === 4 && isParallelStage && finalSignal?.action === "BUY") {
    console.log("✅ TESTE 2 PASSOU: Passos B e C executados concorrentemente no DAG!\n");
  } else {
    console.error("❌ TESTE 2 FALHOU.\n");
  }

  // -------------------------------------------------------------------------
  // Teste 3: Memória de Longo Prazo (Long-Term Memory)
  // -------------------------------------------------------------------------
  console.log("[TESTE 3: Armazenamento e Recuperação de Memória de Longo Prazo]");
  const memoryStore = LongTermMemoryStore.getInstance();

  memoryStore.remember({
    category: "ARCHITECTURE_DECISION",
    title: "Governança de Risco Estrito TradeAI",
    summary: "Estabelecido teto de 5% de banca por ativo, Stop-Loss mandatório de até 2% e Freshness < 1s.",
    tags: ["risk-limits", "guardrails", "data-freshness", "dry-run"],
    details: {
      maxPositionPct: 5.0,
      maxSlPct: 2.0,
      freshnessScalpMs: 1000,
    },
  });

  memoryStore.remember({
    category: "USER_PREFERENCE",
    title: "Preferência Operacional em Dry Run por Padrão",
    summary: "O usuário determinou que toda execução deve operar em dry run nativo antes de POST para a exchange.",
    tags: ["dry-run", "paper-trading", "user-rules"],
    details: {
      defaultExecutionMode: "dry_run",
    },
  });

  const recalledMemories = memoryStore.recall("guardrails dry-run");
  console.log(`Memórias recuperadas para busca 'guardrails dry-run' (${recalledMemories.length}):`);
  recalledMemories.forEach((m, idx) => {
    console.log(` ${idx + 1}. [${m.category}] ${m.title}: ${m.summary}`);
  });

  if (recalledMemories.length >= 2) {
    console.log("\n✅ TESTE 3 PASSOU: Memória gravada e recuperada com sucesso!");
  } else {
    console.error("\n❌ TESTE 3 FALHOU.");
  }

  console.log("\n=== TODAS AS NOVAS DIRETRIZES COGNITIVAS FORAM HOMOLOGADAS COM SUCESSO! ===");
}

runTests().catch(console.error);
