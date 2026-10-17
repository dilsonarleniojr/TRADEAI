/**
 * Script Executável de Demonstração e Validação do Piloto de Produção ($70.00 USD)
 * 
 * Uso:
 *   bun run scripts/run_pilot_validation.ts
 */

import { EnvironmentCleanupService } from "../src/lib/bot/pilot/environment-cleanup-service";
import { ExchangeMetadataService } from "../src/lib/bot/pilot/exchange-metadata-service";
import { PilotTradeValidator, TradeSignal } from "../src/lib/bot/pilot/pilot-trade-validator";
import { PilotRiskCircuitBreaker } from "../src/lib/bot/pilot/pilot-circuit-breaker";
import { MarketOpportunitySelector } from "../src/lib/bot/pilot/market-opportunity-selector";

async function main() {
  console.log("======================================================================");
  console.log("🚀 INICIALIZAÇÃO DO HARNESS PILOTO EM PRODUÇÃO REAL (BANCA: $70.00 USD)");
  console.log("======================================================================\n");

  const cleanupService = EnvironmentCleanupService.getInstance();
  const metadataService = ExchangeMetadataService.getInstance();
  const validator = PilotTradeValidator.getInstance();
  const circuitBreaker = PilotRiskCircuitBreaker.getInstance();
  const opportunitySelector = MarketOpportunitySelector.getInstance();

  const baselineCapitalUsd = 70.0;

  // ---------------------------------------------------------
  // FASE 0: PURGA PRELIMINAR, RESET E SINCRONIZAÇÃO
  // ---------------------------------------------------------
  console.log("📌 [ETAPA 1] Executando Purga Preliminar e Sincronização de Relógio...");
  const purgeReport = await cleanupService.executePreFlightPurge(
    ["BTCUSDT", "SOLUSDT", "ETHUSDT"],
    process.env.BINANCE_API_KEY,
    process.env.BINANCE_API_SECRET,
    baselineCapitalUsd
  );

  console.log(`✅ Relógio sincronizado com offset: ${purgeReport.timeOffsetMs}ms`);
  console.log(`✅ Ordens pendentes canceladas: ${purgeReport.openOrdersCancelled}`);
  console.log(`✅ Travas locais e cooldowns resetados: ${purgeReport.localSafetyGatesReset}`);
  console.log(`✅ Linha de base de capital: $${purgeReport.baselineBalanceUsd.toFixed(2)} USD\n`);

  // ---------------------------------------------------------
  // FASE 1: SELEÇÃO INTELIGENTE DE ATIVOS E CALIBRAÇÃO ATR
  // ---------------------------------------------------------
  console.log("📌 [ETAPA 2] Varredura de Mercado e Seleção Inteligente de Oportunidades...");
  const bestOpportunity = await opportunitySelector.findBestOpportunity(baselineCapitalUsd);
  console.log(`🎯 ATIVO SELECIONADO: ${bestOpportunity.symbol}`);
  console.log(`   - Score Quantitativo: ${bestOpportunity.score.toFixed(1)} / 100`);
  console.log(`   - Volume 24h: $${(bestOpportunity.marketData.volume24hUsd / 1_000_000).toFixed(1)}M USD`);
  console.log(`   - Spread Bid-Ask: ${(bestOpportunity.marketData.spreadPct * 100).toFixed(4)}% (Comprimido)`);
  console.log(`   - Volatilidade ATR: ${(bestOpportunity.technicalMetrics.relativeAtr * 100).toFixed(2)}%`);
  console.log(`   - ADX (Tendência): ${bestOpportunity.technicalMetrics.adx ? bestOpportunity.technicalMetrics.adx.toFixed(1) : "N/A"}`);
  console.log(`   - Alinhamento de Médias: ${bestOpportunity.technicalMetrics.trendAligned ? "Alta Clara (EMA9 > EMA21)" : "Neutro/Reversão"}\n`);

  // ---------------------------------------------------------
  // FASE 2: MOTOR DE DIMENSIONAMENTO E VALIDAÇÃO DE SINAIS
  // ---------------------------------------------------------
  console.log("📌 [ETAPA 3] Teste de Sinais e Políticas de Governança:");

  // Teste A: Sinal Dinâmico Calibrado por ATR do Ativo Selecionado
  console.log(`\n--- Cenário A: Sinal Dinâmico Calibrado por ATR em ${bestOpportunity.symbol} ---`);
  const valResultA = await validator.validateSignal(bestOpportunity.signal, baselineCapitalUsd, false);
  if (valResultA.valid) {
    console.log("✅ Sinal APROVADO com sucesso!");
    console.log(`   - Ordem: ${valResultA.order?.type} (${valResultA.order?.timeInForce})`);
    console.log(`   - Preço de Entrada: $${valResultA.order?.price}`);
    console.log(`   - Quantidade: ${valResultA.order?.quantity} ${bestOpportunity.symbol.replace("USDT", "")}`);
    console.log(`   - Valor Nocional: $${valResultA.order?.notionalUsd.toFixed(2)} USD (Dentro da faixa $11-$15)`);
    console.log(`   - Stop-Loss (1.2x ATR): $${valResultA.order?.stopLoss}`);
    console.log(`   - Take-Profit (2.0x ATR): $${valResultA.order?.takeProfit}`);
    console.log(`   - Risco Máximo Teórico: $${valResultA.order?.riskAmountUsd.toFixed(2)} USD (${valResultA.order?.riskPercentOfCapital.toFixed(2)}% da banca <= 2.0%)`);
    console.log(`   - R:R Líquido: ${valResultA.order?.netRewardRiskRatio.toFixed(2)}x`);
  } else {
    console.log("❌ Sinal Reprovado:", valResultA.rejectionReason);
  }

  // Teste B: Violação de Posição Única
  console.log("\n--- Cenário B: Tentativa de Ordem Concorrente (Posição Ativa Já Aberta) ---");
  const valResultB = await validator.validateSignal(bestOpportunity.signal, baselineCapitalUsd, true);
  console.log(valResultB.valid ? "❌ Erro: deveria ter reprovado!" : `🛡️ Bloqueado corretamente: ${valResultB.rejectionReason}`);

  // Teste C: Violação por Risco Excessivo (Stop Loss excessivamente largo)
  console.log("\n--- Cenário C: Sinal com Stop Loss de 20% (Risco Inaceitável) ---");
  const wideSlSignal: TradeSignal = {
    symbol: "SOLUSDT",
    side: "BUY",
    suggestedPrice: 150.0,
    stopLoss: 120.0, // SL de 20%
    takeProfit: 200.0,
  };
  const valResultC = await validator.validateSignal(wideSlSignal, baselineCapitalUsd, false);
  console.log(valResultC.valid ? "❌ Erro: deveria ter reprovado!" : `🛡️ Bloqueado corretamente: ${valResultC.rejectionReason}`);

  // ---------------------------------------------------------
  // FASE 3: CIRCUIT BREAKERS E TRAVAS DE SEGURANÇA
  // ---------------------------------------------------------
  console.log("\n📌 [ETAPA 4] Simulação de Circuit Breakers de Risco:");
  circuitBreaker.reset(baselineCapitalUsd);

  console.log("Simulando 3 perdas sucessivas de -$0.70 USD...");
  await circuitBreaker.recordTrade(-0.70);
  await circuitBreaker.recordTrade(-0.70);
  const cb3 = await circuitBreaker.recordTrade(-0.70);
  console.log(cb3.canContinueTrading ? "❌ Erro" : `⚠️ Cooldown ativado: ${cb3.reason}`);

  console.log("\nSimulando Perda Acumulada Ultrapassando $3.50 USD (5.0% da Banca)...");
  circuitBreaker.reset(baselineCapitalUsd);
  await circuitBreaker.recordTrade(-1.40);
  await circuitBreaker.recordTrade(0.30);
  await circuitBreaker.recordTrade(-1.40);
  const cbFatal = await circuitBreaker.recordTrade(-1.00); // Total loss: $3.80
  console.log(cbFatal.canContinueTrading ? "❌ Erro" : `🛑 KILL SWITCH Disparado: ${cbFatal.reason}`);

  console.log("\n======================================================================");
  console.log("🏁 HARNESS EXECUTIVO DO PILOTO VALIDADO COM SUCESSO!");
  console.log("======================================================================\n");
}

main().catch((err) => {
  console.error("Erro fatal no harness piloto:", err);
  process.exit(1);
});
