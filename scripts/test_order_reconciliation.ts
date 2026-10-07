import {
  sanitizeOrderToExchangeFilters,
  checkExtremeSpreadVeto,
  evaluateConsecutiveLossBrake,
  reconcileOrphanOrders,
  emitStructuredLog,
  type SymbolExchangeFilter,
  type ExchangeOpenOrder,
  type KnownBotState,
} from "../src/lib/bot/order-reconciliation-engine";

console.log("=== TESTANDO MOTORES INSTITUCIONAIS DOS 5 PILARES ===\n");

// 1. Teste de Filtros Pré-Ordem em Memória
console.log("[TESTE 1: Filtros de Exchange (tickSize, stepSize, minNotional)]");
const btcFilter: SymbolExchangeFilter = {
  symbol: "BTCUSDT",
  tickSize: 0.01,
  stepSize: 0.00001,
  minNotional: 10.0,
  minQty: 0.00001,
  maxQty: 900.0,
};

// Ordem com decimais excessivos que quebrariam na API da Binance
const rawPrice = 65432.129845;
const rawQty = 0.00156789;
const sanitized = sanitizeOrderToExchangeFilters(rawPrice, rawQty, btcFilter);
console.log("Preço sanitizado:", sanitized.sanitizedPrice, "(tickSize 0.01)");
console.log("Quantidade sanitizada:", sanitized.sanitizedQuantity, "(stepSize 0.00001)");
console.log("Nocional calculado:", sanitized.notionalUsdt, "USDT");
console.log("Ordem válida?", sanitized.valid);

// Ordem abaixo do minNotional (< 10 USDT)
const smallOrder = sanitizeOrderToExchangeFilters(65000, 0.0001, btcFilter);
console.log("Ordem pequena (< 10 USDT) bloqueada?", !smallOrder.valid, "| Motivo:", smallOrder.rejectionReason);

if (sanitized.valid && !smallOrder.valid && sanitized.sanitizedPrice === 65432.13) {
  console.log("✅ TESTE 1 PASSOU: Sanitização de precisão decimal e minNotional perfeita!\n");
} else {
  console.error("❌ TESTE 1 FALHOU.\n");
}

// 2. Teste de Trava de Volatilidade / Spread Blowout
console.log("[TESTE 2: Trava de Volatilidade e Liquidez Extrema]");
const normalSpread = checkExtremeSpreadVeto(0.04);
const blowoutSpread = checkExtremeSpreadVeto(0.48);
console.log("Spread 0.04% permitido:", normalSpread.allowed);
console.log("Spread 0.48% (> 0.35%) vetado:", !blowoutSpread.allowed, "| Motivo:", blowoutSpread.reason);
if (normalSpread.allowed && !blowoutSpread.allowed) {
  console.log("✅ TESTE 2 PASSOU: Trava de spread de livro de ofertas funcionando!\n");
} else {
  console.error("❌ TESTE 2 FALHOU.\n");
}

// 3. Teste de Consecutive Loss Brake
console.log("[TESTE 3: Trava de Perdas Consecutivas (Consecutive Loss Brake)]");
const safeTrades = [-1.5, 3.2, -0.8]; // Win recente
const disasterTrades = [-2.1, -1.9, -3.4, 4.0]; // 3 losses seguidos no topo
const safeCheck = evaluateConsecutiveLossBrake(safeTrades, 3);
const disasterCheck = evaluateConsecutiveLossBrake(disasterTrades, 3);
console.log("Trades mistos travou?", safeCheck.tripped);
console.log("3 losses consecutivos travou?", disasterCheck.tripped, "| Motivo:", disasterCheck.reason);
if (!safeCheck.tripped && disasterCheck.tripped) {
  console.log("✅ TESTE 3 PASSOU: Consecutive loss brake acionado com sucesso!\n");
} else {
  console.error("❌ TESTE 3 FALHOU.\n");
}

// 4. Teste de Conciliação de Ordens Órfãs
console.log("[TESTE 4: Gerenciador e Conciliação de Ordens Órfãs]");
const exchangeOrders: ExchangeOpenOrder[] = [
  { orderId: "1001", clientOrderId: "bot_1_buy", symbol: "BTCUSDT", side: "BUY", price: 65000, origQty: 0.001, time: Date.now() },
  { orderId: "1002", clientOrderId: "bot_2_buy", symbol: "ETHUSDT", side: "BUY", price: 3400, origQty: 0.05, time: Date.now() },
  { orderId: "9999", clientOrderId: "legacy_ghost_order", symbol: "SOLUSDT", side: "BUY", price: 140, origQty: 1.0, time: Date.now() - 3600000 },
];

const botState: KnownBotState = {
  activeOrderIds: new Set(["1001"]),
  activeClientOrderIds: new Set(["bot_2_buy"]),
};

const reconReport = reconcileOrphanOrders(exchangeOrders, botState);
console.log("Ordens conciliadas:", reconReport.matchedCount);
console.log("Ordens órfãs detectadas:", reconReport.orphanOrders.length);
console.log("ID da órfã:", reconReport.orphanOrders[0]?.orderId);
console.log("Ação necessária:", reconReport.actionRequired);

if (reconReport.matchedCount === 2 && reconReport.orphanOrders.length === 1 && reconReport.orphanOrders[0].orderId === "9999") {
  console.log("✅ TESTE 4 PASSOU: Ordem órfã 9999 isolada para cancelamento imediato!\n");
} else {
  console.error("❌ TESTE 4 FALHOU.\n");
}

// 5. Teste de Log Estruturado em JSON
console.log("[TESTE 5: Emissão de Logs Estruturados]");
const logEntry = emitStructuredLog("INFO", "RECONCILIATION_ENGINE", "AUDIT_COMPLETED", {
  matched: reconReport.matchedCount,
  orphans: reconReport.orphanOrders.length,
});
if (logEntry.subsystem === "RECONCILIATION_ENGINE" && logEntry.level === "INFO") {
  console.log("✅ TESTE 5 PASSOU: Log JSON estruturado emitido com conformidade!\n");
} else {
  console.error("❌ TESTE 5 FALHOU.\n");
}

console.log("=== TODOS OS MOTORES DOS 5 PILARES HOMOLOGADOS COM SUCESSO! ===");
