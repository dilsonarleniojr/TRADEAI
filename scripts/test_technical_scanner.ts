import {
  calculatePivotPoints,
  checkResistanceProximity,
  calculateTechnicalScannerScore,
} from "../src/lib/bot/indicators";
import { evaluateEntry } from "../src/lib/bot/entry-engine";
import { applyGatekeeper, MIN_RISK_REWARD_THRESHOLD } from "../src/lib/ai/signal-agent";
import type { KlineData } from "../src/lib/store";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    process.exit(1);
  }
  console.log(`✅ SUCESSO: ${message}`);
}

console.log("=== INICIANDO SUÍTE DE TESTES: SKILL TECHNICAL-SCANNER ===\n");

// 1. Teste de Pivot Points
console.log("--- 1. Validação Matemática dos Pivot Points ---");
// Exemplo: High = 100, Low = 90, Close = 95
// PP = (100 + 90 + 95)/3 = 95
// R1 = 2*95 - 90 = 100
// S1 = 2*95 - 100 = 90
// R2 = 95 + (100 - 90) = 105
// S2 = 95 - (100 - 90) = 85
const piv = calculatePivotPoints(100, 90, 95);
assert(piv.pp === 95, `PP esperado 95, recebido ${piv.pp}`);
assert(piv.r1 === 100, `R1 esperado 100, recebido ${piv.r1}`);
assert(piv.s1 === 90, `S1 esperado 90, recebido ${piv.s1}`);
assert(piv.r2 === 105, `R2 esperado 105, recebido ${piv.r2}`);
assert(piv.s2 === 85, `S2 esperado 85, recebido ${piv.s2}`);

// 2. Teste de Proximidade de Resistência (Anti-Topo)
console.log("\n--- 2. Validação Anti-Topo & Proximidade de Resistência ---");
// R1 = 100. Preço = 99.5 -> Distância = (100 - 99.5)/99.5 = 0.50% (< 0.8% -> DEVE VETAR)
const unsafeCheck = checkResistanceProximity(99.5, piv, 0.8);
assert(!unsafeCheck.safeToBuy, "Preço a 0.5% de R1 deve ser vetado (safeToBuy = false)");
assert(unsafeCheck.nearestLevel === "R1", "Nível mais próximo deve ser R1");

// Preço = 97.0 -> Distância = (100 - 97)/97 = 3.09% (>= 0.8% -> DEVE APROVAR)
const safeCheck = checkResistanceProximity(97.0, piv, 0.8);
assert(safeCheck.safeToBuy, "Preço a 3.09% de R1 deve ser aprovado (safeToBuy = true)");

// 3. Teste de Score Composto de 6 Indicadores
console.log("\n--- 3. Validação do Score Composto da Skill technical-scanner ---");
// Cria série sintética de 40 candles em tendência de alta
const dummyKlines: KlineData[] = [];
let price = 50;
for (let i = 0; i < 40; i++) {
  price += 0.5;
  dummyKlines.push({
    time: 1000 + i * 60,
    open: price - 0.2,
    high: price + 0.3,
    low: price - 0.3,
    close: price,
    volume: 1000 + i * 50,
  });
}
const score = calculateTechnicalScannerScore(dummyKlines);
assert(score.compositeScore > 0, `Score composto em alta deve ser positivo (recebido: ${score.compositeScore})`);
assert(score.regime === "Trending Up" || score.regime === "Ranging", `Regime detectado: ${score.regime}`);

// 4. Teste do Gatekeeper de R:R (AI Signal Agent)
console.log("\n--- 4. Validação da Matriz de Risco do Gatekeeper (R:R >= 2.2:1) ---");
assert(MIN_RISK_REWARD_THRESHOLD === 2.2, `MIN_RISK_REWARD_THRESHOLD deve ser 2.2 (atual: ${MIN_RISK_REWARD_THRESHOLD})`);

// Sinal com R:R = 1.5 (Stop = 90, Preço = 100, Alvo = 115 -> R:R = 15/10 = 1.5 < 2.2)
const badRrSignal = applyGatekeeper(
  {
    signal: "BUY",
    confidence_score: 85,
    stop_loss: 90,
    take_profit: 115,
    key_driver: "Teste R:R baixo",
    risk_warning: "Alerta",
  },
  100
);
assert(badRrSignal.signal === "HOLD", "Sinal com R:R 1.5 deve ser convertido para HOLD");
assert(badRrSignal.vetoed === true, "Sinal com R:R 1.5 deve ser vetado");

// Sinal com R:R = 2.5 (Stop = 90, Preço = 100, Alvo = 125 -> R:R = 25/10 = 2.5 >= 2.2)
const goodRrSignal = applyGatekeeper(
  {
    signal: "BUY",
    confidence_score: 90,
    stop_loss: 90,
    take_profit: 125,
    key_driver: "Teste R:R favorável",
    risk_warning: "Alerta",
  },
  100
);
assert(goodRrSignal.signal === "BUY", "Sinal com R:R 2.5 deve permanecer BUY");
assert(goodRrSignal.vetoed === false, "Sinal com R:R 2.5 não deve ser vetado");
assert(goodRrSignal.risk_reward_ratio === 2.5, `R:R retornado deve ser 2.5 (recebido: ${goodRrSignal.risk_reward_ratio})`);

console.log("\n🎉 TODOS OS TESTES QUANTITATIVOS DA SKILL TECHNICAL-SCANNER PASSARAM COM SUCESSO!");
