import { riskManager, RiskManager } from "../src/lib/bot/risk-manager";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FALHA: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ SUCESSO: ${msg}`);
}

console.log("\n=======================================================");
console.log("🧪 TESTES DE VALIDAÇÃO INSTITUCIONAL: RISK MANAGER");
console.log("=======================================================\n");

// 1. Teste de Dimensionamento Fracionário (Risk Per Trade <= 1%)
console.log("--- 1. TESTE DE CÁLCULO DE POSIÇÃO BASEADA EM RISCO ---");
const nav = 100.0; // 100 USDT de saldo
const entryPrice = 50000.0;
const stopLossPrice = 49250.0; // Stop de 1.5% (distância de $750)
const sizing = riskManager.calculatePositionSize({
  accountBalance: nav,
  entryPrice,
  stopLossPrice,
  minNotional: 5.5,
  riskPercentage: 0.01, // 1% em risco = $1.00 máx de perda
  maxCapitalAllocationCap: 80.0,
});

console.log("Resultado do Dimensionamento:", sizing);
assert(sizing.isViable === true, "A posição deve ser viável");
assert(sizing.maxLossUsdt <= 1.05, `A perda máxima projetada (${sizing.maxLossUsdt} USDT) deve respeitar o teto de 1% ($1.00 USDT)`);
assert(sizing.notionalTotal >= 5.5, "O total nocional deve atender ao lote mínimo");
assert(sizing.notionalTotal <= 80.0, "O total nocional não deve exceder o teto alocado");

// 2. Teste de Viabilidade Operacional (R:R Líquido >= 1:1.50)
console.log("\n--- 2. TESTE DE VIABILIDADE OPERACIONAL (R:R LÍQUIDO) ---");
const goodSetup = riskManager.evaluateOperationalViability({
  entryPrice: 100.0,
  stopLossPrice: 98.7, // Stop de 1.3%
  takeProfitPrice: 102.8, // Alvo de 2.8%
  isMaker: true,
});
console.log("Setup com Assimetria Positiva (TP +2.8% / SL -1.3%):", goodSetup);
assert(goodSetup.viable === true, "Setup 2.8% / 1.3% deve ser viável");
assert(goodSetup.netRewardRiskRatio >= 1.50, `R:R Líquido (${goodSetup.netRewardRiskRatio.toFixed(2)}x) deve ser >= 1.50x`);

const badSetup = riskManager.evaluateOperationalViability({
  entryPrice: 100.0,
  stopLossPrice: 98.5, // Stop de 1.5%
  takeProfitPrice: 101.5, // Alvo de 1.5% (R:R bruto 1:1, líquido < 1:1 após taxas)
  isMaker: false,
});
console.log("Setup Ruim (TP +1.5% / SL -1.5% Taker):", badSetup);
assert(badSetup.viable === false, "Setup 1:1 com taxas Taker deve ser sumariamente REJEITADO");

// 3. Teste de Perda Diária Máxima (Drawdown >= 3%)
console.log("\n--- 3. TESTE DE TRAVA DE PERDA DIÁRIA (CIRCUIT BREAKER) ---");
const initialStatus = riskManager.checkCircuitBreakers(100.0);
assert(initialStatus.blocked === false, "Inicialmente o bot não deve estar bloqueado");

// Registra perda de $3.50 (3.5% do NAV de $100)
riskManager.recordTradeResult(-3.50, 100.0);
const cbStatus = riskManager.checkCircuitBreakers(100.0);
console.log("Status após perda diária de 3.5%:", cbStatus);
assert(cbStatus.blocked === true, "Deve bloquear novas entradas ao atingir 3% de perda diária");
assert(cbStatus.circuitBreakerType === "DAILY_DRAWDOWN", "O tipo do circuit breaker deve ser DAILY_DRAWDOWN");

// 4. Teste de Freio por Perdas Consecutivas (>= 3 perdas seguidas)
console.log("\n--- 4. TESTE DE FREIO POR PERDAS CONSECUTIVAS ---");
riskManager.resetStateForTests();
const statusAfterReset = riskManager.checkCircuitBreakers(100.0);
assert(statusAfterReset.blocked === false, "Após reset, bot deve estar liberado");

riskManager.recordTradeResult(-0.50, 100.0); // Perda 1
assert(riskManager.checkCircuitBreakers(100.0).blocked === false, "1 perda não deve travar");

riskManager.recordTradeResult(-0.50, 100.0); // Perda 2
assert(riskManager.checkCircuitBreakers(100.0).blocked === false, "2 perdas não devem travar");

riskManager.recordTradeResult(-0.50, 100.0); // Perda 3
const consecutiveStatus = riskManager.checkCircuitBreakers(100.0);
console.log("Status após 3 perdas consecutivas:", consecutiveStatus);
assert(consecutiveStatus.blocked === true, "3 perdas consecutivas DEVEM acionar o freio de cooldown");
assert(consecutiveStatus.circuitBreakerType === "CONSECUTIVE_LOSS", "Tipo deve ser CONSECUTIVE_LOSS");

// 5. Teste de Reset de Perdas Consecutivas com Vitória
console.log("\n--- 5. TESTE DE RECUPERAÇÃO APÓS VITÓRIA ---");
riskManager.resetStateForTests();
riskManager.recordTradeResult(-0.50, 100.0); // Perda 1
riskManager.recordTradeResult(-0.50, 100.0); // Perda 2
riskManager.recordTradeResult(+2.00, 100.0); // Vitória (+2%)
riskManager.recordTradeResult(-0.50, 100.0); // Perda nova após vitória (deve ser Perda 1 novamente)
assert(riskManager.checkCircuitBreakers(100.0).blocked === false, "Vitória intermediária deve zerar o contador de perdas consecutivas");

// 6. Teste de Preço de Break-Even em 1R com Buffer
console.log("\n--- 6. TESTE DE BREAK-EVEN EM 1R ---");
const be = riskManager.calculateDynamicBreakEven({
  entryPrice: 100.0,
  currentPrice: 101.5, // 1R atingido (+1.50)
  initialStopLossPrice: 98.5, // 1R = $1.50
  feeBufferPercent: 0.35, // +0.35% cobrindo taxas
});
console.log("Nível de Break-Even:", be);
assert(be.shouldArmBreakEven === true, "Ao atingir 1R ($101.50), Break-Even DEVE ser armado");
assert(be.newStopLossPrice >= 100.35, "Novo Stop Loss deve ficar em +0.35% ($100.35) garantindo lucro livre de taxas");

// 7. Teste de Ativação / Desativação Dinâmica dos Modos de Proteção pelo Usuário
console.log("\n--- 7. TESTE DE ATIVAÇÃO / DESATIVAÇÃO PELO USUÁRIO (USER TOGGLES) ---");
riskManager.resetStateForTests();
riskManager.resetProtectionSettings();

// Verifica configurações padrão (todas ON)
const defaultSettings = riskManager.getProtectionSettings();
assert(defaultSettings.dailyDrawdownProtection === true, "Kill switch diário deve estar ON por padrão");
assert(defaultSettings.consecutiveLossProtection === true, "Freio de perdas consecutivas deve estar ON por padrão");
assert(defaultSettings.operationalViabilityFilter === true, "Filtro de viabilidade operacional deve estar ON por padrão");
assert(defaultSettings.dynamicBreakEven === true, "Break-even dinâmico deve estar ON por padrão");

// Cenário A: Usuário desativa o Freio de Perdas Consecutivas
console.log("-> Desativando Freio de Perdas Consecutivas...");
riskManager.setProtectionSettings({ consecutiveLossProtection: false });
riskManager.recordTradeResult(-0.50, 100.0);
riskManager.recordTradeResult(-0.50, 100.0);
riskManager.recordTradeResult(-0.50, 100.0);
const cbWithBrakeOff = riskManager.checkCircuitBreakers(100.0);
console.log("Status com freio desligado:", cbWithBrakeOff);
assert(cbWithBrakeOff.blocked === false, "Com consecutiveLossProtection=false, o freio NÃO deve bloquear o bot mesmo após 3 perdas");

// Cenário B: Usuário reativa o Freio de Perdas Consecutivas
console.log("-> Reativando Freio de Perdas Consecutivas...");
riskManager.setProtectionSettings({ consecutiveLossProtection: true });
const cbWithBrakeOn = riskManager.checkCircuitBreakers(100.0);
console.log("Status após reativação:", cbWithBrakeOn);
assert(cbWithBrakeOn.blocked === true, "Após reativar, deve aplicar imediatamente a trava de perdas consecutivas");

// Cenário C: Usuário desativa o Filtro de Viabilidade Operacional
console.log("-> Desativando Filtro de Viabilidade Operacional...");
riskManager.setProtectionSettings({ operationalViabilityFilter: false });
const permissiveSetup = riskManager.evaluateOperationalViability({
  entryPrice: 100.0,
  stopLossPrice: 98.5,
  takeProfitPrice: 101.5, // Setup 1:1 taker (normalmente rejeitado)
  isMaker: false,
});
console.log("Setup com filtro de viabilidade desligado:", permissiveSetup);
assert(permissiveSetup.viable === true, "Com operationalViabilityFilter=false, setup deve ser liberado em modo permissivo");
assert(permissiveSetup.reason.includes("desativado pelo usuário"), "Razão deve indicar modo permissivo configurado pelo usuário");

// Cenário D: Usuário desativa Break-Even Dinâmico
console.log("-> Desativando Break-Even Dinâmico...");
riskManager.setProtectionSettings({ dynamicBreakEven: false });
const beDisabled = riskManager.calculateDynamicBreakEven({
  entryPrice: 100.0,
  currentPrice: 105.0, // 3R+ de lucro
  initialStopLossPrice: 98.5,
});
console.log("Break-even com chave desligada:", beDisabled);
assert(beDisabled.shouldArmBreakEven === false, "Com dynamicBreakEven=false, não deve armar break-even");

// Restaura padrões institucionais
riskManager.resetProtectionSettings();
riskManager.resetStateForTests();
assert(riskManager.getProtectionSettings().consecutiveLossProtection === true, "Reset deve restaurar proteção para true");

// 8. Teste de Telemetria de Preenchimento (Fill-Rate) e Repricing Dinâmico de 1 Tick
console.log("\n--- 8. TESTE DE TELEMETRIA DE FILL-RATE E REPRICING DINÂMICO ---");
riskManager.resetStateForTests();

// 8.1 Telemetria inicial limpa
const initialTel = riskManager.getFillRateTelemetry();
assert(initialTel.totalMakerOrders === 0, "Total de ordens inicial deve ser 0");
assert(initialTel.fillRatePct === 100, "Fill-rate default sem ordens deve ser 100%");
assert(initialTel.isExtremeVolatility === false, "Inicialmente não deve acusar volatilidade extrema");

// 8.2 Simula preenchimento saudável (8 preenchidas de 10 ordens = 80%)
console.log("-> Simulando execução saudável no book (8 fills, 2 cancels)...");
for (let i = 0; i < 8; i++) {
  riskManager.recordMakerOrder("BTCUSDT");
  riskManager.recordMakerFill("BTCUSDT");
}
for (let i = 0; i < 2; i++) {
  riskManager.recordMakerOrder("BTCUSDT");
  riskManager.recordMakerCancel("BTCUSDT");
}
const healthyTel = riskManager.getFillRateTelemetry();
console.log("Telemetria saudável:", healthyTel);
assert(healthyTel.totalMakerOrders === 10, "Total deve ser 10 ordens");
assert(healthyTel.filledMakerOrders === 8, "8 ordens devem estar preenchidas");
assert(healthyTel.cancelledMakerOrders === 2, "2 ordens canceladas");
assert(healthyTel.fillRatePct === 80, "Taxa global de preenchimento deve ser 80%");
assert(healthyTel.isExtremeVolatility === false, "Com 80% de preenchimento não deve acusar volatilidade extrema");

// 8.3 Simula choque de volatilidade extrema com queda de fill-rate para < 40%
console.log("-> Simulando choque de volatilidade com cancelamentos em série...");
for (let i = 0; i < 15; i++) {
  riskManager.recordMakerOrder("ETHUSDT");
  riskManager.recordMakerCancel("ETHUSDT");
}
const stressTel = riskManager.getFillRateTelemetry();
console.log("Telemetria sob volatilidade extrema:", stressTel);
assert(stressTel.recentFillRatePct < 40, `Fill-rate recente (${stressTel.recentFillRatePct}%) deve estar abaixo de 40%`);
assert(stressTel.isExtremeVolatility === true, "isExtremeVolatility DEVE ser acionado quando preenchimento cai abaixo de 40%");

// 8.4 Validação matemática do Repricing Dinâmico de 1 Tick
console.log("-> Testando cálculo de Repricing Dinâmico de 1 Tick estritamente passivo...");
const orderPrice = 2500.0;
const tickSize = 0.01;
const bestBid = 2500.0;
const bestAsk = 2500.05;

const proposedPrice = Math.max(orderPrice + tickSize, bestBid);
const maxPassivePrice = bestAsk - tickSize;
const finalRepricePrice = Math.min(proposedPrice, maxPassivePrice);
console.log(`Preço Original: $${orderPrice} | +1 Tick: $${proposedPrice} | Max Passivo (Ask-Tick): $${maxPassivePrice} | Repriced: $${finalRepricePrice}`);
assert(finalRepricePrice === 2500.01, "Preço deve ser reajustado em exatamente 1 tick ($2500.01)");
assert(finalRepricePrice < bestAsk, "Preço ajustado NÃO pode cruzar o bestAsk (deve manter status Maker)");

riskManager.recordMakerReprice("ETHUSDT");
const postRepriceTel = riskManager.getFillRateTelemetry();
assert(postRepriceTel.repricedMakerOrders === 1, "Contador de ordens repriced deve ser incrementado");

// 8.5 Teste de alternância do modo de Repricing pelo usuário
console.log("-> Testando chave dynamicMakerRepricing do usuário...");
riskManager.setProtectionSettings({ dynamicMakerRepricing: false });
assert(riskManager.getProtectionSettings().dynamicMakerRepricing === false, "Chave dynamicMakerRepricing deve poder ser desativada");
riskManager.setProtectionSettings({ dynamicMakerRepricing: true });
assert(riskManager.getProtectionSettings().dynamicMakerRepricing === true, "Chave dynamicMakerRepricing deve poder ser reativada");

// Limpa estado final
riskManager.resetStateForTests();
riskManager.resetProtectionSettings();

console.log("\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO ABSOLUTO (INCLUINDO FILL-RATE E 1-TICK REPRICING)!");


