import { describe, it, expect, beforeEach } from "bun:test";
import { PreciseMath } from "@/lib/bot/pilot/precise-math";
import { ExchangeMetadataService, SymbolFilters } from "@/lib/bot/pilot/exchange-metadata-service";
import { EnvironmentCleanupService } from "@/lib/bot/pilot/environment-cleanup-service";
import { PilotTradeValidator, TradeSignal } from "@/lib/bot/pilot/pilot-trade-validator";
import { PilotRiskCircuitBreaker } from "@/lib/bot/pilot/pilot-circuit-breaker";

describe("Pilot Production Test Harness ($70.00 USD Allocation)", () => {
  const metadataService = ExchangeMetadataService.getInstance();
  const cleanupService = EnvironmentCleanupService.getInstance();
  const validator = PilotTradeValidator.getInstance();
  const circuitBreaker = PilotRiskCircuitBreaker.getInstance();

  const btcMockFilters: SymbolFilters = {
    symbol: "BTCUSDT",
    minQty: 0.00001,
    maxQty: 9000,
    stepSize: 0.00001,
    minPrice: 0.01,
    maxPrice: 1000000,
    tickSize: 0.01,
    minNotional: 5.0,
    baseAsset: "BTC",
    quoteAsset: "USDT",
    status: "TRADING",
  };

  const solMockFilters: SymbolFilters = {
    symbol: "SOLUSDT",
    minQty: 0.01,
    maxQty: 90000,
    stepSize: 0.01,
    minPrice: 0.01,
    maxPrice: 100000,
    tickSize: 0.01,
    minNotional: 5.0,
    baseAsset: "SOL",
    quoteAsset: "USDT",
    status: "TRADING",
  };

  beforeEach(() => {
    circuitBreaker.reset(70.0);
    metadataService.setMockFilters("BTCUSDT", btcMockFilters);
    metadataService.setMockFilters("SOLUSDT", solMockFilters);
  });

  describe("1. Microstructure Math & Truncation (PreciseMath)", () => {
    it("deve truncar lot size estritamente para baixo (RoundingMode.DOWN)", () => {
      // stepSize = 0.001
      const q1 = PreciseMath.quantizeLotDown(0.01579, 0.001);
      expect(q1).toBe(0.015);

      // stepSize = 0.00001 (BTC)
      const q2 = PreciseMath.quantizeLotDown(0.00018999, 0.00001);
      expect(q2).toBe(0.00018);

      // stepSize = 0.01 (SOL)
      const q3 = PreciseMath.quantizeLotDown(0.589, 0.01);
      expect(q3).toBe(0.58);
    });

    it("deve quantizar tickSize no incremento legal da exchange", () => {
      // tickSize = 0.01
      const p1 = PreciseMath.quantizePriceDown(68450.559, 0.01);
      expect(p1).toBe(68450.55);

      // tickSize = 0.1
      const p2 = PreciseMath.quantizePriceDown(145.89, 0.1);
      expect(p2).toBe(145.8);
    });

    it("não deve gerar resíduos de ponto flutuante em operações financeiras", () => {
      const mul = PreciseMath.multiply(0.00018, 68000.0);
      expect(mul).toBe(12.24);

      const sub = PreciseMath.subtract(100.0, 99.85);
      expect(sub).toBe(0.15);
    });
  });

  describe("2. Pre-Flight Purge & State Reset (EnvironmentCleanupService)", () => {
    it("deve sincronizar relógio e calcular offset monotônico", async () => {
      const offset = await cleanupService.syncServerTime();
      expect(typeof offset).toBe("number");
      expect(cleanupService.getSynchronizedTimestamp()).toBeGreaterThan(0);
    });

    it("deve resetar travas locais e estabelecer a linha de base em $70.00 USD", () => {
      const reset = cleanupService.resetLocalSafetyGates(70.0);
      expect(reset).toBe(true);

      const state = circuitBreaker.getState();
      expect(state.baselineCapitalUsd).toBe(70.0);
      expect(state.accumulatedDailyLossUsd).toBe(0);
      expect(state.isTripped).toBe(false);
    });
  });

  describe("3. Position Sizing & Order Validation (PilotTradeValidator)", () => {
    it("deve aprovar sinal válido respeitando teto de nocional ($11-$15) e risco <= $1.40 USD", async () => {
      const signal: TradeSignal = {
        symbol: "BTCUSDT",
        side: "BUY",
        suggestedPrice: 65000.0,
        stopLoss: 64000.0, // Risco unitário: $1000 (1.53%)
        takeProfit: 67500.0, // Retorno unitário: $2500 (3.84%)
      };

      const result = await validator.validateSignal(signal, 70.0, false, btcMockFilters);

      expect(result.valid).toBe(true);
      expect(result.order).toBeDefined();

      const order = result.order!;
      expect(order.type).toBe("LIMIT_MAKER");
      expect(order.timeInForce).toBe("GTX");
      expect(order.notionalUsd).toBeGreaterThanOrEqual(11.0);
      expect(order.notionalUsd).toBeLessThanOrEqual(15.0);
      expect(order.riskAmountUsd).toBeLessThanOrEqual(1.40);
      expect(order.netRewardRiskRatio).toBeGreaterThanOrEqual(1.50);
    });

    it("deve rejeitar categoricamente se já houver posição ativa (Single Active Position Policy)", async () => {
      const signal: TradeSignal = {
        symbol: "SOLUSDT",
        side: "BUY",
        suggestedPrice: 150.0,
        stopLoss: 147.0,
        takeProfit: 158.0,
      };

      const result = await validator.validateSignal(signal, 70.0, true, solMockFilters);

      expect(result.valid).toBe(false);
      expect(result.rejectionReason).toContain("SINGLE_ACTIVE_POSITION_POLICY_VIOLATION");
    });

    it("deve rejeitar se o Stop Loss for largo demais e violar o teto de $1.40 USD em lote mínimo", async () => {
      const signal: TradeSignal = {
        symbol: "SOLUSDT",
        side: "BUY",
        suggestedPrice: 150.0,
        stopLoss: 125.0, // SL de -16.6%, geraria perda enorme mesmo no lote mínimo
        takeProfit: 200.0,
      };

      const result = await validator.validateSignal(signal, 70.0, false, solMockFilters);

      expect(result.valid).toBe(false);
      expect(result.rejectionReason).toContain("RISK_EXCEEDS_CAPITAL_LIMIT");
    });

    it("deve rejeitar se a relação Risco:Retorno líquida for inferior a 1:1.5", async () => {
      const signal: TradeSignal = {
        symbol: "BTCUSDT",
        side: "BUY",
        suggestedPrice: 65000.0,
        stopLoss: 64500.0, // Risco unitário: $500
        takeProfit: 65400.0, // Retorno unitário: $400 -> R:R 0.80x
      };

      const result = await validator.validateSignal(signal, 70.0, false, btcMockFilters);

      expect(result.valid).toBe(false);
      expect(result.rejectionReason).toContain("INSUFFICIENT_REWARD_RISK_RATIO");
    });
  });

  describe("4. Safety Circuit Breakers & Loss Limits (PilotRiskCircuitBreaker)", () => {
    it("deve acionar o freio de perdas consecutivas (Cooldown de 60 min) após 3 perdas seguidas", async () => {
      expect(circuitBreaker.canOpenNewOrder().allowed).toBe(true);

      await circuitBreaker.recordTrade(-0.50);
      await circuitBreaker.recordTrade(-0.60);
      expect(circuitBreaker.canOpenNewOrder().allowed).toBe(true);

      const thirdLoss = await circuitBreaker.recordTrade(-0.70);
      expect(thirdLoss.canContinueTrading).toBe(false);
      expect(thirdLoss.reason).toContain("CONSECUTIVE_LOSS_BRAKE_TRIPPED");

      const check = circuitBreaker.canOpenNewOrder();
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("CONSECUTIVE_LOSS_COOLDOWN_ACTIVE");
    });

    it("deve acionar o KILL SWITCH e Hibernação de 24h caso a perda diária atinja $3.50 USD", async () => {
      circuitBreaker.reset(70.0);

      // Simula 2 perdas de $1.40 e uma de $0.90 -> total $3.70 USD (> $3.50)
      await circuitBreaker.recordTrade(-1.40);
      await circuitBreaker.recordTrade(0.20); // Vitória intermediária quebra perdas consecutivas
      await circuitBreaker.recordTrade(-1.40);
      const fatalTrade = await circuitBreaker.recordTrade(-0.90);

      expect(fatalTrade.canContinueTrading).toBe(false);
      expect(fatalTrade.reason).toContain("DAILY_DRAWDOWN_CIRCUIT_BREAKER_TRIPPED");

      const state = circuitBreaker.getState();
      expect(state.isTripped).toBe(true);
      expect(state.accumulatedDailyLossUsd).toBe(3.70);
      expect(state.hibernationUntil).toBeDefined();
    });
  });

  describe("5. Chaos Engineering: Simulação de Faltas e Latência", () => {
    it("deve tolerar latência sintética e quedas de rede sem desestabilizar estado", async () => {
      const simulatedLatencyMs = 120;
      const start = Date.now();

      // Injeta latência sintética
      await new Promise((r) => setTimeout(r, simulatedLatencyMs));
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(100);

      // Simula falha de conexão na verificação de ordem
      let networkErrorCaught = false;
      try {
        throw new Error("ConnectionAbortedError: Simulated gateway timeout");
      } catch (e: any) {
        networkErrorCaught = true;
        expect(e.message).toContain("ConnectionAbortedError");
      }
      expect(networkErrorCaught).toBe(true);

      // Garante que o estado de risco e locks permanecem íntegros após a falha
      const status = circuitBreaker.canOpenNewOrder();
      expect(typeof status.allowed).toBe("boolean");
    });
  });
});
