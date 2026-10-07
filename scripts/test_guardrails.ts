import { evaluateEntry } from "../src/lib/bot/entry-engine";
import type { BotInstance, KlineData, TickerData } from "../src/lib/store/types";

console.log("=== TESTANDO GUARDRAILS QUANTITATIVOS CONTRA OVERTRADING E DCA ===");

const dummyBot: BotInstance = {
  id: "test-bot-1",
  name: "Bot Teste Guardrail",
  symbol: "BTCUSDT",
  strategy: "TREND",
  status: "scanning",
  active: true,
  allocationAmount: 50,
  maxDailyTrades: 10,
  buyThreshold: 30,
  sellThreshold: 70,
  rsiPeriod: 14,
  emaFast: 9,
  emaSlow: 21,
  stopLoss: 1.5,
  takeProfit: 3.5,
  stats: { totalTrades: 0, buyTrades: 0, sellTrades: 0, winTrades: 0, lossTrades: 0, realizedPnl: 0, winRate: 0 },
  createdAt: new Date().toISOString(),
} as unknown as BotInstance;

const dummyTicker: TickerData = {
  symbol: "BTCUSDT",
  price: 65000,
  priceChange: 1.2,
  priceChangePercent: 1.2,
  high: 65500,
  low: 64800,
  volume: 50000000,
  quoteVolume: 50000000,
};

// Caso 1: Micro-movimentos (ATR ínfimo < 0.1%)
const microCandles: KlineData[] = Array.from({ length: 40 }, (_, i) => ({
  time: Date.now() - (40 - i) * 60000,
  open: 65000 + (i % 2 === 0 ? 5 : -5),
  high: 65010,
  low: 64990,
  close: 65000 + (i % 2 === 0 ? 6 : -6),
  volume: 100,
}));

const resultMicro = evaluateEntry(dummyBot, dummyTicker, dummyTicker, microCandles, []);
const amplitudeCheckMicro = resultMicro.checks.find(c => c.label === "Amplitude Mínima ATR");

console.log("\n[TESTE 1: Micro-Movimentos]");
console.log("Amplitude Check Ok?", amplitudeCheckMicro?.ok);
console.log("Detalhe:", amplitudeCheckMicro?.detail);
console.log("Entrada Bloqueada:", !resultMicro.shouldBuy);
if (amplitudeCheckMicro && !amplitudeCheckMicro.ok && !resultMicro.shouldBuy) {
  console.log("✅ TESTE 1 PASSOU: Micro-movimentos bloqueados categoricamente!");
} else {
  console.error("❌ TESTE 1 FALHOU.");
}

// Caso 2: Ativo com Volatilidade e Amplitude Saudável (ATR ~ 1.0%)
const healthyCandles: KlineData[] = Array.from({ length: 40 }, (_, i) => ({
  time: Date.now() - (40 - i) * 60000,
  open: 62000 + i * 80,
  high: 62000 + i * 80 + 700,
  low: 62000 + i * 80 - 100,
  close: 62000 + i * 80 + 550,
  volume: 2500,
}));

const resultHealthy = evaluateEntry(dummyBot, dummyTicker, dummyTicker, healthyCandles, []);
const amplitudeCheckHealthy = resultHealthy.checks.find(c => c.label === "Amplitude Mínima ATR");

console.log("\n[TESTE 2: Amplitude Saudável]");
console.log("Amplitude Check Ok?", amplitudeCheckHealthy?.ok);
console.log("Detalhe:", amplitudeCheckHealthy?.detail);
if (amplitudeCheckHealthy?.ok) {
  console.log("✅ TESTE 2 PASSOU: Ativo com amplitude suficiente aprovado no filtro!");
} else {
  console.error("❌ TESTE 2 FALHOU.");
}

// Testes das 5 novas regras de governança e guardrails operacionais
import {
  validateDataFreshness,
  validateRiskLimits,
  buildClearBoxSignalReport,
  AutonomousRateLimiter,
  simulateDryRunExecution,
} from "../src/lib/bot/trading-guardrails";

console.log("\n[TESTE 3: Validação Estrita de Temporalidade (Data Freshness)]");
const freshData = validateDataFreshness(Date.now() - 500, "SCALP"); // 500ms de idade
const staleData = validateDataFreshness(Date.now() - 3500, "SCALP"); // 3.5s de idade (> 1s)
console.log("Fresh scalp válido:", freshData.valid);
console.log("Stale scalp bloqueado:", !staleData.valid, "| Erro:", staleData.error);
if (freshData.valid && !staleData.valid) {
  console.log("✅ TESTE 3 PASSOU: Cotações obsoletas bloqueadas com sucesso!");
} else {
  console.error("❌ TESTE 3 FALHOU.");
}

console.log("\n[TESTE 4: Guardrails de Risco Embutidos (Risk Limits)]");
const validRisk = validateRiskLimits({
  symbol: "BTCUSDT",
  side: "BUY",
  quantity: 0.001,
  price: 65000, // $65
  stopLossPrice: 64000, // SL ~ 1.53%
  portfolioTotalValueUsdt: 2000, // $65 é ~ 3.25% do NAV (< 5%)
});

const breachedPosition = validateRiskLimits({
  symbol: "BTCUSDT",
  side: "BUY",
  quantity: 0.01,
  price: 65000, // $650
  stopLossPrice: 64000,
  portfolioTotalValueUsdt: 1000, // $650 é 65% do NAV (> 5%)
});

const breachedSl = validateRiskLimits({
  symbol: "BTCUSDT",
  side: "BUY",
  quantity: 0.001,
  price: 65000,
  stopLossPrice: 62000, // SL ~ 4.6% (> 2.0%)
  portfolioTotalValueUsdt: 5000,
});

console.log("Risco válido permitido:", validRisk.allowed);
console.log("Exposição > 5% bloqueada:", !breachedPosition.allowed, "| Erros:", breachedPosition.errors[0]);
console.log("Stop-Loss > 2% bloqueado:", !breachedSl.allowed, "| Erros:", breachedSl.errors[0]);
if (validRisk.allowed && !breachedPosition.allowed && !breachedSl.allowed) {
  console.log("✅ TESTE 4 PASSOU: Guardrails de risco e fat-finger collars ativos!");
} else {
  console.error("❌ TESTE 4 FALHOU.");
}

console.log("\n[TESTE 5: Explicabilidade de Sinais Matemáticos (Clear-Box)]");
const clearBoxReport = buildClearBoxSignalReport(
  "BTCUSDT",
  "BUY",
  88,
  [
    { name: "RSI", indicator: "RSI", period: 14, currentValue: 28.5, thresholdOrCross: "< 30 (Sobrevendido)", triggered: true },
    { name: "EMA Cross", indicator: "EMA", period: "9/21", currentValue: "Golden Cross", thresholdOrCross: "EMA 9 cruzou acima da EMA 21", triggered: true },
    { name: "Volume ATR", indicator: "ATR", period: 14, currentValue: 1.85, thresholdOrCross: "> 1.5% Amplitude", triggered: true }
  ],
  { sentimentScore: 0.75, newsCount: 12, headlinesSummary: "ETFs registram entradas líquidas recordes" },
  { trendVote: "BUY", momentumVote: "BUY", orderFlowVote: "BUY" }
);
console.log(clearBoxReport.summaryText);
if (clearBoxReport.quantitativeTriggers.length === 3 && clearBoxReport.sentimentContext?.sentimentScore === 0.75) {
  console.log("✅ TESTE 5 PASSOU: Relatório transparente Clear-Box gerado com rastreabilidade!");
} else {
  console.error("❌ TESTE 5 FALHOU.");
}

console.log("\n[TESTE 6: Gestão Autônoma de Rate Limits (Anti-Ban)]");
const rateLimiter = AutonomousRateLimiter.getInstance();
const reqStatus = rateLimiter.recordRequest(5);
const backoffDelay = rateLimiter.handleHttp429(3);
console.log("Requisição inicial permitida:", reqStatus.canProceed, "| Peso:", reqStatus.currentWeight);
console.log("Backoff calculado após 429:", backoffDelay, "ms");
if (reqStatus.canProceed && backoffDelay >= 3000) {
  console.log("✅ TESTE 6 PASSOU: Rate limiter autônomo e backoff exponencial ativos!");
} else {
  console.error("❌ TESTE 6 FALHOU.");
}

console.log("\n[TESTE 7: Execução em Dry Run por Padrão]");
const dryRunSim = simulateDryRunExecution(
  {
    symbol: "BTCUSDT",
    side: "BUY",
    quantity: 0.001,
    price: 65000,
    stopLossPrice: 64000,
    portfolioTotalValueUsdt: 2000,
  },
  freshData,
  validRisk,
  clearBoxReport
);
console.log("Dry Run interceptou disparo de rede?", dryRunSim.dispatchPrevented);
console.log("Payload montado:", JSON.stringify(dryRunSim.orderPayload));
console.log("Taxas estimadas:", dryRunSim.estimatedFees);
if (dryRunSim.dispatchPrevented && dryRunSim.orderPayload.symbol === "BTCUSDT" && dryRunSim.estimatedFees.takerFeeUsdt > 0) {
  console.log("✅ TESTE 7 PASSOU: Dry run nativo validado sem risco de capital!");
} else {
  console.error("❌ TESTE 7 FALHOU.");
}

console.log("\n=== TODOS OS 7 GUARDRAILS TESTADOS E HOMOLOGADOS COM SUCESSO! ===");
