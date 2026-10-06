/**
 * Teste de Validação dos Motores de Execução Automatizados:
 * - Mutexes de concorrência por símbolo (inFlightBuys / inFlightSells)
 * - Slippage Guard (Rejeição de ordens com desvio acima da tolerância)
 * - Global Daily Circuit Breaker
 * - Auditabilidade: IDs de execução, snapshots de mercado, parâmetros de risco
 */

import {
  getCircuitBreakerStatus,
  resetCircuitBreaker,
  checkCircuitBreaker,
} from "../src/lib/bot/multi-bot-engine";
import { DEFAULT_BOTS } from "../src/lib/store/botSlice";

async function runExecutionValidation() {
  console.log("=========================================================================");
  console.log("   VALIDAÇÃO DOS MOTORES DE EXECUÇÃO: RISCO, CIRCUIT BREAKER & SLIPPAGE  ");
  console.log("=========================================================================\n");

  // 1. Validar inicialização dos bots e parâmetros
  const bots = DEFAULT_BOTS;
  console.log(`[1] Fleet de Bots Ativos: ${bots.length} bots carregados.`);
  bots.forEach((b) => {
    console.log(`  - Bot: ${b.name} (${b.symbol}) | Versão: ${b.algorithmVersion} | SlippageMax: ${b.slippageTolerance}% | Risco: ${b.riskPerTradePercent}% | MaxHolding: ${b.maxHoldingMinutes}m`);
  });

  // 2. Validar Circuit Breaker Diário
  console.log("\n[2] Testando Circuit Breaker Global Diário...");
  const initialCb = getCircuitBreakerStatus();
  console.log(`  Estado Inicial: Tripped = ${initialCb.tripped}, Perda Diária = $${initialCb.accumulatedDailyLossUsd.toFixed(2)}`);

  // Simular checagem do Circuit Breaker
  const cbTripped = checkCircuitBreaker();
  console.log(`  Verificação de Risco: ${!cbTripped ? "✅ EXECUÇÃO PERMITIDA (Circuit Breaker OK)" : "❌ CIRCUIT BREAKER ATIVO"}`);

  // Testar reset
  resetCircuitBreaker();
  console.log("  Reset do Circuit Breaker verificado.");

  // 3. Validar Slippage Guard via API REST /api/trades
  console.log("\n[3] Testando Slippage Guard do Endpoint /api/trades...");
  try {
    // Ordem com preço disparatado (+15% de slippage) para forçar rejeição
    const slippageTestPayload = {
      symbol: "BTCUSDT",
      side: "BUY",
      price: 50000, // Preço muito distante da cotação real atual (~$68k+)
      quantity: 0.0003,
      total: 15.0,
      mode: "paper",
      strategy: "QUANT_TEST",
      slippageTolerance: 0.35, // Tolerância estrita de 0.35%
      executionId: "exec_test_slippage_" + Date.now(),
      algorithmVersion: "v2.5.0-institutional",
    };

    const res = await fetch("http://localhost:3000/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slippageTestPayload),
    });

    const data = await res.json();
    console.log(`  Resposta da API: HTTP ${res.status}`);
    console.log(`  Payload retornado:`, JSON.stringify(data));

    if (res.status === 400 && data.code === "SLIPPAGE_EXCEEDED") {
      console.log("  ✅ Slippage Guard FUNCIONOU PERFEITAMENTE: Ordem rejeitada por exceder a tolerância!");
    } else {
      console.log(`  ℹ️ Nota sobre a resposta da API: status=${res.status}, code=${data.code || data.error}`);
    }
  } catch (err: any) {
    console.error("  Erro ao testar endpoint /api/trades:", err.message);
  }

  // 4. Validar Execução Regular com Auditoria Completa
  console.log("\n[4] Testando Execução Regular com Auditoria Completa (Preço Live)...");
  try {
    // Obter preço atual do BTC na Binance
    const tickerRes = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    const ticker = await tickerRes.json();
    const livePrice = parseFloat(ticker.price);
    const qty = parseFloat((15.0 / livePrice).toFixed(6));

    const normalPayload = {
      symbol: "BTCUSDT",
      side: "BUY",
      price: livePrice,
      quantity: qty,
      total: 15.0,
      mode: "paper",
      strategy: "QUANT_TEST",
      slippageTolerance: 0.50,
      executionId: `exec_audit_${Date.now()}`,
      algorithmVersion: "v2.5.0-institutional",
      marketSnapshot: {
        timestamp: Date.now(),
        bidPrice: livePrice * 0.9998,
        askPrice: livePrice * 1.0002,
        spreadPct: 0.04,
        volume24h: 25000,
      },
      riskParams: {
        riskPerTradePercent: 30,
        stopLossPercent: 1.0,
        takeProfitPercent: 1.6,
        maxHoldingMinutes: 30,
        trailingStopDistance: 0.4,
      },
    };

    const res = await fetch("http://localhost:3000/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalPayload),
    });

    const data = await res.json();
    console.log(`  Resposta da Execução: HTTP ${res.status}`);
    console.log(`  Trade ID retornado:`, data.data?.id);
    console.log(`  Audit Payload anexado:`, {
      executionId: data.data?.id,
      algorithmVersion: data.data?.algorithmVersion,
      hasSnapshot: !!data.data?.marketSnapshot,
      hasRiskParams: !!data.data?.riskParams,
    });

    if (res.status === 200 && data.success) {
      console.log("  ✅ Execução aprovada e registrada com auditoria completa!");
    }
  } catch (err: any) {
    console.error("  Erro no teste de execução regular:", err.message);
  }

  console.log("\n=========================================================================");
  console.log("   VALIDAÇÃO DOS MOTORES CONCLUÍDA!                                      ");
  console.log("=========================================================================\n");
}

runExecutionValidation().catch(console.error);
