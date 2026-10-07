/**
 * Test Suite: Automated Bot Creation on AI Entry Linking ("Vincular Robô")
 */

import { useCryptoStore, type BotInstance } from "../src/lib/store";
import type { TradeEntry } from "../src/lib/ai-entries";

async function run() {
  console.log("======================================================================");
  console.log("🧪 TESTE: CRIAÇÃO AUTOMÁTICA DE ROBÔ A PARTIR DO 'VINCULAR ROBÔ' (IA)");
  console.log("======================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${msg}`);
      failed++;
    }
  }

  // 1. Simula a entrada de TRB/USDT exatamente como exibida na imagem do usuário
  const trbEntry: TradeEntry = {
    symbol: "TRBUSDT",
    side: "BUY",
    source: "ia",
    aiProvider: "Claude",
    orderType: "MARKET",
    currentPrice: 22.66,
    entry: 22.66,
    stopLoss: 20.8136, // -8.15%
    takeProfit: 26.3529, // +16.30%
    takeProfit2: 28.5686, // +26.08%
    trailingDistance: 1.2589, // 5.56%
    riskReward: 2.00,
    score: 90,
    confidence: 84,
    reasoning: "Tendência de alta confirmada: preço (22.66) acima da EMA20 (21.85) e da EMA50 (21.03)...",
    invalidation: "Cancele se fechar vela de 1h abaixo de $20.8136",
    indicators: {
      rsi: 69,
      trend: "up",
      volumeRatio: 1.28,
    },
  };

  const store = useCryptoStore.getState();
  
  // Define patrimônio simulado
  store.setPortfolio({
    ...store.portfolio,
    totalValue: 100, // $100 patrimônio
    cashBalance: 100,
  });

  const equity = store.portfolio.totalValue;
  const RISK_PER_TRADE = 0.01;
  const MAX_POSITION_SHARE = 0.25;

  const riskPerUnit = Math.abs(trbEntry.entry - trbEntry.stopLoss);
  const riskUsd = equity * RISK_PER_TRADE;
  const notional = Math.min((riskUsd / riskPerUnit) * trbEntry.entry, equity * MAX_POSITION_SHARE);

  assert(notional > 0, `Dimensionamento calculado: $${notional.toFixed(2)} USDT`);

  // Executa o linking
  const cleanSym = trbEntry.symbol.toUpperCase();
  const baseSym = cleanSym.replace("USDT", "");
  const tpPct = Number(Math.max(0.5, ((trbEntry.takeProfit - trbEntry.entry) / trbEntry.entry) * 100).toFixed(2));
  const slPct = Number(Math.max(0.3, (Math.abs(trbEntry.entry - trbEntry.stopLoss) / trbEntry.entry) * 100).toFixed(2));
  const trailPct = Number(((trbEntry.trailingDistance / trbEntry.entry) * 100).toFixed(2));
  const allocationAmount = Math.max(10, Number(notional.toFixed(2)));

  assert(tpPct === 16.30, `Take Profit percentual esperado 16.30%, obtido ${tpPct}%`);
  assert(slPct === 8.15, `Stop Loss percentual esperado 8.15%, obtido ${slPct}%`);
  assert(trailPct === 5.56, `Trailing Stop percentual esperado 5.56%, obtido ${trailPct}%`);

  const botId = store.addBot({
    name: `Bot ${baseSym} — IA (${trbEntry.source})`,
    symbol: cleanSym,
    strategy: "AI",
    active: true,
    takeProfit: tpPct,
    stopLoss: slPct,
    trailingStop: true,
    trailingStopDistance: trailPct,
    allocationAmount,
    autoBreakEven: true,
    breakEvenTrigger: Number((tpPct * 0.5).toFixed(2)),
    breakEvenBuffer: 0.25,
    usePartialTp: true,
    partialTpTrigger: tpPct,
    partialTpPercent: 50,
    trailingTakeProfit: true,
    trailingTakeProfitDistance: trailPct,
    signalConfidenceThreshold: trbEntry.confidence,
    aiEngine: trbEntry.aiProvider || trbEntry.source,
    algorithmVersion: "v2.5.0-ai-linked",
    autoTradeSignals: true,
    useMarketRegime: true,
    useMultiTimeframe: true,
  });

  const updatedStore = useCryptoStore.getState();
  const createdBot = updatedStore.bots.find((b) => b.id === botId);

  assert(!!createdBot, "Robô inserido com sucesso na frota de bots");
  assert(createdBot?.symbol === "TRBUSDT", "Símbolo do robô configurado como TRBUSDT");
  assert(createdBot?.active === true, "Robô criado no estado ATIVO (active: true)");
  assert(createdBot?.status === "scanning", "Status do robô definido como 'scanning'");
  assert(createdBot?.takeProfit === 16.30, "Take Profit gravado exatamente como 16.30%");
  assert(createdBot?.stopLoss === 8.15, "Stop Loss gravado exatamente como 8.15%");
  assert(createdBot?.trailingStopDistance === 5.56, "Trailing Distance gravado como 5.56%");
  assert(createdBot?.allocationAmount === allocationAmount, `Alocação gravada como $${allocationAmount}`);
  assert(createdBot?.usePartialTp === true && createdBot?.partialTpPercent === 50, "Realização parcial configurada para 50% no Alvo 1");
  assert(createdBot?.autoBreakEven === true, "Auto Break-Even ativado para proteger entrada");
  assert(createdBot?.aiEngine === "Claude", "Origem de Inteligência Artificial gravada como 'Claude'");
  assert(updatedStore.selectedBotId === botId, "Robô recém-criado foi selecionado como selectedBotId");

  console.log("======================================================================");
  console.log(`📊 RESULTADO FINAL: ${passed} PASSOU | ${failed} FALHOU`);
  console.log("======================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

run();
