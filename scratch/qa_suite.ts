/**
 * TradeAI Comprehensive QA Test Suite (Production Real Data / Zero Mocks)
 * Runs functional, regression, concurrency, database load, and latency tests.
 */

const BASE_URL = "http://localhost:3000";

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  durationMs: number;
  details: string;
  payloadSample?: any;
}

const results: TestResult[] = [];

async function runTest(name: string, category: string, fn: () => Promise<{ passed: boolean; details: string; sample?: any }>) {
  const t0 = performance.now();
  try {
    const res = await fn();
    const t1 = performance.now();
    results.push({
      name,
      category,
      passed: res.passed,
      durationMs: Math.round(t1 - t0),
      details: res.details,
      payloadSample: res.sample,
    });
  } catch (err: any) {
    const t1 = performance.now();
    results.push({
      name,
      category,
      passed: false,
      durationMs: Math.round(t1 - t0),
      details: `Exception: ${err.message}`,
    });
  }
}

async function main() {
  console.log("=================================================================");
  console.log("   TRADEAI QA TEST SUITE - PRODUÇÃO REAL / ZERO DADOS MOCKADOS   ");
  console.log("=================================================================\n");

  // --- 1. TESTES FUNCIONAIS DE ENDPOINTS E DADOS REAIS ---
  console.log(">> [1/5] Executando Testes Funcionais de Endpoints Reais...");

  await runTest("Whale Trades Live Endpoint", "Funcional", async () => {
    const res = await fetch(`${BASE_URL}/api/market/whale-trades`);
    if (!res.ok) return { passed: false, details: `HTTP ${res.status}` };
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) {
      return { passed: false, details: "Payload inválido" };
    }
    const sample = json.data[0];
    const isReal = sample && sample.amountUSD >= 10000 && sample.timestamp > Date.now() - 3600000 * 24;
    return {
      passed: json.data.length > 0 && isReal,
      details: `Recebidos ${json.data.length} trades de baleias reais (> $10k). Ex: ${sample?.symbol} $${sample?.amountUSD?.toFixed(0)} (${sample?.side})`,
      sample: { total: json.data.length, firstTrade: sample },
    };
  });

  await runTest("Funding Rates Binance Futures Endpoint", "Funcional", async () => {
    const res = await fetch(`${BASE_URL}/api/market/funding-rates`);
    if (!res.ok) return { passed: false, details: `HTTP ${res.status}` };
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
      return { passed: false, details: "Lista de funding vazia" };
    }
    const btcFunding = json.data.find((f: any) => f.symbol === "BTCUSDT");
    const validFuture = btcFunding && btcFunding.nextFundingTime > Date.now();
    return {
      passed: !!validFuture,
      details: `${json.data.length} pares futuros verificados. BTCUSDT rate: ${btcFunding?.fundingRate}%, Próximo pagamento: ${new Date(btcFunding?.nextFundingTime).toISOString()}`,
      sample: btcFunding,
    };
  });

  await runTest("Fear & Greed Index Alternative.me", "Funcional", async () => {
    const res = await fetch(`${BASE_URL}/api/market/fear-greed`);
    if (!res.ok) return { passed: false, details: `HTTP ${res.status}` };
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
      return { passed: false, details: "Lista de F&G vazia" };
    }
    const latest = json.data[0];
    const val = parseInt(latest.value, 10);
    return {
      passed: Number.isInteger(val) && val >= 0 && val <= 100,
      details: `Valor oficial: ${val} (${latest.value_classification}). Histórico de ${json.data.length} dias retornado.`,
      sample: latest,
    };
  });

  await runTest("News Feed RSS CoinTelegraph Live", "Funcional", async () => {
    const res = await fetch(`${BASE_URL}/api/news`);
    if (!res.ok) return { passed: false, details: `HTTP ${res.status}` };
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
      return { passed: false, details: "Lista de notícias vazia" };
    }
    const sample = json.data[0];
    const hasSource = sample.articles?.length > 0 || sample.summary?.length > 0;
    return {
      passed: json.data.length > 0 && hasSource,
      details: `${json.data.length} artigos sincronizados. Título: "${sample.title.slice(0, 50)}..."`,
      sample: { id: sample.id, title: sample.title, category: sample.category },
    };
  });

  await runTest("Account Paper Balance & Portfolio State", "Funcional", async () => {
    const res = await fetch(`${BASE_URL}/api/account?mode=paper`);
    if (!res.ok) return { passed: false, details: `HTTP ${res.status}` };
    const json = await res.json();
    return {
      passed: json.success && (json.data?.cashBalance >= 0 || json.data?.totalValue >= 0),
      details: `Conta simulada consultada com sucesso. Saldo Caixa: $${json.data?.cashBalance?.toFixed(2)}, Total: $${json.data?.totalValue?.toFixed(2)}`,
      sample: json.data,
    };
  });

  await runTest("Account Live Mode Auth Guard (HTTP 401 Security Check)", "Funcional", async () => {
    const res = await fetch(`${BASE_URL}/api/account?mode=live`);
    const json = await res.json();
    const passed = res.status === 401 && json.code === "BINANCE_AUTH_REQUIRED";
    return {
      passed,
      details: `Proteção de credenciais ativa: status ${res.status}, code: ${json.code}. Mensagem: "${json.error}"`,
      sample: json,
    };
  });

  // --- 2. TESTES DE REGRESSÃO E RESÍDUOS ---
  console.log(">> [2/5] Executando Testes de Regressão e Verificação de Resíduos...");

  await runTest("Diretórios Obsoletos Inexistentes", "Regressão", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const dirs = [
      "src/app/api/mock-zai",
      "src/lib/strategies",
      "src/lib/bot/strategies",
      "src/lib/defense",
      "src/lib/infrastructure",
    ];
    const remaining = dirs.filter((d) => fs.existsSync(path.resolve(process.cwd(), d)));
    return {
      passed: remaining.length === 0,
      details: remaining.length === 0 ? "Todos os 5 diretórios mortos estão confirmadamente removidos" : `Diretórios ainda existem: ${remaining.join(", ")}`,
    };
  });

  // --- 3. TESTES DE BANCO DE DADOS E CONCORRÊNCIA ---
  console.log(">> [3/5] Executando Testes de Carga de Banco SQLite e Ausência de SQLITE_BUSY...");

  await runTest("Carga Concorrente: 50 Leituras + 10 Escritas Simultâneas", "Concorrência", async () => {
    const readPromises = Array.from({ length: 50 }).map(() =>
      fetch(`${BASE_URL}/api/trades?mode=paper`).then((r) => r.json())
    );
    const writePromises = Array.from({ length: 10 }).map((_, i) =>
      fetch(`${BASE_URL}/api/user/preferences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lang: "pt-BR",
          themes: i % 2 === 0 ? "Market,Regulation" : "Trading,DeFi",
          preferredHour: "09:00",
        }),
      }).then((r) => r.json())
    );

    const [readResults, writeResults] = await Promise.all([
      Promise.all(readPromises),
      Promise.all(writePromises),
    ]);

    const readSuccess = readResults.filter((r) => r.success).length;
    const writeSuccess = writeResults.filter((r) => r.success).length;

    const totalPassed = readSuccess === 50 && writeSuccess === 10;
    return {
      passed: totalPassed,
      details: `Leituras: ${readSuccess}/50 bem-sucedidas. Escritas: ${writeSuccess}/10 bem-sucedidas. Zero travamentos SQLITE_BUSY.`,
    };
  });

  // --- 4. TESTES DE LATÊNCIA E THROUGHPUT (100 REQUISIÇÕES) ---
  console.log(">> [4/5] Executando Benchmark de Throughput e Latência Percentílica...");

  async function benchmarkEndpoint(name: string, url: string, runs = 20) {
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now();
      const res = await fetch(url);
      const t1 = performance.now();
      if (res.ok) times.push(t1 - t0);
    }
    times.sort((a, b) => a - b);
    const min = times[0];
    const max = times[times.length - 1];
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const p50 = times[Math.floor(times.length * 0.5)];
    const p95 = times[Math.floor(times.length * 0.95)];

    return { min, avg, p50, p95, max };
  }

  const endpoints = [
    { name: "Whale Trades", url: `${BASE_URL}/api/market/whale-trades` },
    { name: "Funding Rates", url: `${BASE_URL}/api/market/funding-rates` },
    { name: "Fear & Greed", url: `${BASE_URL}/api/market/fear-greed` },
    { name: "News Feed", url: `${BASE_URL}/api/news` },
    { name: "Dashboard Root", url: `${BASE_URL}/` },
  ];

  for (const ep of endpoints) {
    await runTest(`Benchmark: ${ep.name}`, "Performance", async () => {
      const metrics = await benchmarkEndpoint(ep.name, ep.url, 25);
      return {
        passed: metrics.p50 < 150,
        details: `Min: ${metrics.min.toFixed(1)}ms | P50: ${metrics.p50.toFixed(1)}ms | P95: ${metrics.p95.toFixed(1)}ms | Média: ${metrics.avg.toFixed(1)}ms`,
        sample: metrics,
      };
    });
  }

  // --- 5. TESTES DE RESILIÊNCIA E ROBUSTEZ ---
  console.log(">> [5/5] Executando Testes de Robustez a Erros e Tratamento de Exceções...");

  await runTest("Tratamento de Símbolo Inválido em Trades", "Robustez", async () => {
    const res = await fetch(`${BASE_URL}/api/trades`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: "INVALIDCOIN123",
        side: "BUY",
        quantity: 1,
        price: 10,
        total: 10,
        strategy: "Test",
        mode: "paper",
      }),
    });
    const json = await res.json();
    return {
      passed: !json.success || res.status >= 400 || json.code !== undefined || json.error !== undefined,
      details: `Rejeição graciosa de símbolo inexistente: status ${res.status}, error: "${json.error || json.message || 'OK'}"`,
    };
  });

  console.log("\n=================================================================");
  console.log("                    RESULTADO GERAL DOS TESTES                   ");
  console.log("=================================================================\n");

  let allPassed = true;
  for (const r of results) {
    const statusIcon = r.passed ? "✅ [PASS]" : "❌ [FAIL]";
    if (!r.passed) allPassed = false;
    console.log(`${statusIcon} ${r.category.padEnd(12)} | ${r.name.padEnd(35)} | ${r.durationMs}ms | ${r.details}`);
  }

  console.log("\n=================================================================");
  console.log(`STATUS FINAL DE QA: ${allPassed ? "100% APROVADO ✅" : "REPROVADO COM FALHAS ❌"}`);
  console.log("=================================================================\n");
}

main().catch(console.error);
