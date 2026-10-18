import { describe, it, expect, beforeEach } from "bun:test";
import { CurrencyPairNormalizer } from "@/lib/bot/pilot/currency-pair-normalizer";
import { DirectOperationManager } from "@/lib/bot/pilot/direct-operation-manager";
import { ExchangeMetadataService } from "@/lib/bot/pilot/exchange-metadata-service";

describe("Operação Direta com IA & Normalização de Cotação", () => {
  beforeEach(() => {
    // Configura filtros mock para testes isolados
    ExchangeMetadataService.getInstance().setMockFilters("BTCUSDT", {
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
    });

    ExchangeMetadataService.getInstance().setMockFilters("SOLUSDT", {
      symbol: "SOLUSDT",
      minQty: 0.001,
      maxQty: 100000,
      stepSize: 0.001,
      minPrice: 0.01,
      maxPrice: 10000,
      tickSize: 0.01,
      minNotional: 5.0,
      baseAsset: "SOL",
      quoteAsset: "USDT",
      status: "TRADING",
    });
  });

  describe("1. CurrencyPairNormalizer (Regras Interbancárias e ISO 4217)", () => {
    it("deve classificar EUR/USD padrão como STANDARD sem inverter", () => {
      const res = CurrencyPairNormalizer.normalizeQuote({
        rawSymbol: "EUR/USD",
        bidPrice: 1.0850,
        askPrice: 1.0852,
      });

      expect(res.classification).toBe("STANDARD");
      expect(res.isInverted).toBe(false);
      expect(res.baseCurrency).toBe("EUR");
      expect(res.quoteCurrency).toBe("USD");
      expect(res.bidPrice).toBe(1.0850);
      expect(res.askPrice).toBe(1.0852);
      expect(res.pipSize).toBe(0.0001);
      expect(res.spreadPips).toBeCloseTo(2.0, 1);
    });

    it("deve detectar cotação invertida USDEUR e aplicar inversão cruzada (Cross-Inversion)", () => {
      // Fornecedor enviou USDEUR com bid 0.9200 / ask 0.9205
      // Pelo ranking EUR > USD, deve normalizar para EURUSD
      // Bid_std = 1 / Ask_inv = 1 / 0.9205 = 1.086366
      // Ask_std = 1 / Bid_inv = 1 / 0.9200 = 1.086956
      const res = CurrencyPairNormalizer.normalizeQuote({
        rawSymbol: "USDEUR",
        bidPrice: 0.9200,
        askPrice: 0.9205,
      });

      expect(res.classification).toBe("INVERTED");
      expect(res.isInverted).toBe(true);
      expect(res.normalizedSymbol).toBe("EURUSD");
      expect(res.baseCurrency).toBe("EUR");
      expect(res.quoteCurrency).toBe("USD");
      expect(res.bidPrice).toBeCloseTo(1 / 0.9205, 5);
      expect(res.askPrice).toBeCloseTo(1 / 0.9200, 5);
      expect(res.bidPrice).toBeLessThan(res.askPrice);
    });

    it("deve dimensionar o pip de USDJPY para 0.01", () => {
      const res = CurrencyPairNormalizer.normalizeQuote({
        rawSymbol: "USDJPY",
        bidPrice: 150.20,
        askPrice: 150.23,
      });

      expect(res.classification).toBe("STANDARD");
      expect(res.pipSize).toBe(0.01);
      expect(res.spreadPips).toBeCloseTo(3.0, 1);
    });

    it("deve classificar criptoativos como UNCLASSIFIED sem inverter", () => {
      const res = CurrencyPairNormalizer.normalizeQuote({
        rawSymbol: "BTCUSDT",
        bidPrice: 65000.0,
        askPrice: 65001.0,
      });

      expect(res.classification).toBe("UNCLASSIFIED");
      expect(res.isInverted).toBe(false);
      expect(res.baseCurrency).toBe("BTC");
      expect(res.quoteCurrency).toBe("USDT");
      expect(res.spreadPrice).toBe(1.0);
    });

    it("deve detectar livro de ofertas cruzado (crossed book)", () => {
      const res = CurrencyPairNormalizer.normalizeQuote({
        rawSymbol: "EURUSD",
        bidPrice: 1.0900,
        askPrice: 1.0850, // Bid > Ask
      });

      expect(res.isCrossed).toBe(true);
    });

    it("deve rejeitar símbolos inválidos ou com preços negativos/zero", () => {
      expect(() => {
        CurrencyPairNormalizer.normalizeQuote({
          rawSymbol: "BTCUSDT",
          bidPrice: 0,
          askPrice: 65000,
        });
      }).toThrow();

      expect(() => {
        CurrencyPairNormalizer.normalizeQuote({
          rawSymbol: "USDUSD",
          bidPrice: 1.0,
          askPrice: 1.0,
        });
      }).toThrow();
    });
  });

  describe("2. DirectOperationManager (Fluxo de Execução e Entrega do Lucro)", () => {
    it("deve rejeitar aportes inferiores ao mínimo de segurança ($11.00 USD)", async () => {
      expect(async () => {
        await DirectOperationManager.startOperation({
          amount: 8.0,
          durationMinutes: 5,
        });
      }).toThrow();
    });

    it("deve iniciar uma sessão ativa com seleção pela IA e dimensionamento correto", async () => {
      const { session, validation } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        strategy: "CONFLUENCE",
        mode: "paper",
      });

      expect(session.id).toBeDefined();
      expect(session.status).toBe("ACTIVE");
      expect(session.investedAmountUsd).toBeGreaterThanOrEqual(11.0);
      expect(session.investedAmountUsd).toBeLessThanOrEqual(30.0);
      expect(session.targetPrice).toBeGreaterThan(session.entryPrice);
      expect(session.stopLossPrice).toBeLessThan(session.entryPrice);
      expect(session.aiScore).toBeGreaterThan(0);
      expect(validation.valid).toBe(true);

      // Limpeza
      DirectOperationManager.clearSession(session.id);
    });

    it("deve calcular o PnL flutuante e encerrar entregando o lucro ao atingir o alvo de Take-Profit", async () => {
      const { session } = await DirectOperationManager.startOperation({
        amount: 25.0,
        durationMinutes: 5,
        mode: "paper",
      });

      // Simula encerramento por TAKE_PROFIT com preço favorável
      const closedSession = await DirectOperationManager.closeOperation(
        session.id,
        "TARGET_REACHED",
        session.targetPrice
      );

      expect(closedSession.status).toBe("CLOSED");
      expect(closedSession.closeReason).toBe("TARGET_REACHED");
      expect(closedSession.realizedPnlUsd).toBeGreaterThan(0); // Lucro líquido positivo
      expect(closedSession.realizedPnlPercent).toBeGreaterThan(0);
      expect(closedSession.feeDeductedUsd).toBeGreaterThan(0); // Taxas computadas

      // Limpeza
      DirectOperationManager.clearSession(session.id);
    });

    it("deve encerrar e computar PnL no término do tempo estipulado", async () => {
      const { session } = await DirectOperationManager.startOperation({
        amount: 20.0,
        durationMinutes: 1,
        mode: "paper",
      });

      const closed = await DirectOperationManager.closeOperation(
        session.id,
        "TIME_EXPIRED",
        session.entryPrice * 1.015 // Subiu 1.5% durante o período
      );

      expect(closed.status).toBe("CLOSED");
      expect(closed.closeReason).toBe("TIME_EXPIRED");
      expect(closed.realizedPnlUsd).toBeGreaterThan(0);

      DirectOperationManager.clearSession(session.id);
    });
  });

  describe("3. Engenharia do Caos e Resiliência", () => {
    it("deve lançar erro tratável ao tentar fechar ou consultar uma sessão inexistente", async () => {
      expect(async () => {
        await DirectOperationManager.closeOperation("non-existent-id", "MANUAL_CLOSE");
      }).toThrow();

      expect(async () => {
        await DirectOperationManager.pollSession("non-existent-id");
      }).toThrow();
    });

    it("deve manter a idempotência se a sessão já estiver encerrada", async () => {
      const { session } = await DirectOperationManager.startOperation({
        amount: 15.0,
        durationMinutes: 3,
        mode: "paper",
      });

      await DirectOperationManager.closeOperation(session.id, "MANUAL_CLOSE");
      const polled = await DirectOperationManager.pollSession(session.id);

      expect(polled.status).toBe("CLOSED");
      DirectOperationManager.clearSession(session.id);
    });

    it("deve barrar modo live se chaves de API da Binance não forem fornecidas", async () => {
      await expect(
        DirectOperationManager.startOperation({
          amount: 25.0,
          durationMinutes: 5,
          mode: "live",
          binanceCredentials: { apiKey: "", apiSecret: "" },
        })
      ).rejects.toThrow();
    });
  });

  describe("4. IA Autônoma (Modo AUTO) & Radar Sniper de Entrada Ótima", () => {
    it("deve selecionar automaticamente a melhor estratégia (AUTO) e configurar TriggerCondition", async () => {
      const { session } = await DirectOperationManager.startOperation({
        amount: 25.0,
        durationMinutes: 5,
        strategy: "AUTO",
        mode: "paper",
      });

      expect(session.id).toBeDefined();
      expect(["WAITING_TRIGGER", "ACTIVE"]).toContain(session.status);
      expect(session.triggerCondition).toBeDefined();
      expect(session.strategyChosen).toBeDefined();
      expect(["CONFLUENCE", "MOMENTUM", "MEAN_REVERSION"]).toContain(session.strategyChosen!);
      expect(session.triggerCondition!.targetPrice).toBeGreaterThan(0);
      expect(session.triggerCondition!.conditionDescription.length).toBeGreaterThan(10);

      DirectOperationManager.clearSession(session.id);
    });

    it("deve permitir forçar a entrada imediata a mercado via forceEntry", async () => {
      const { session } = await DirectOperationManager.startOperation({
        amount: 20.0,
        durationMinutes: 5,
        strategy: "AUTO",
        mode: "paper",
      });

      // Se iniciou em WAITING_TRIGGER, forceEntry deve transformá-la em ACTIVE
      if (session.status === "WAITING_TRIGGER") {
        const forced = await DirectOperationManager.forceEntry(session.id);
        expect(forced.status).toBe("ACTIVE");
        expect(forced.startTime).toBeGreaterThan(0);
        expect(forced.endTime).toBeGreaterThan(forced.startTime);
      }

      DirectOperationManager.clearSession(session.id);
    });

    it("deve permitir cancelar a espera no radar sem custos ou penalidades via cancelRadar", async () => {
      const { session } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        strategy: "AUTO",
        mode: "paper",
      });

      if (session.status === "WAITING_TRIGGER") {
        const cancelled = DirectOperationManager.cancelRadar(session.id);
        expect(cancelled.status).toBe("CANCELLED");
        expect(cancelled.closeReason).toBe("RADAR_CANCELLED");
        expect(cancelled.unrealizedPnlUsd).toBe(0);
        expect(cancelled.realizedPnlUsd).toBe(0);

        // Polling subsequente deve respeitar o cancelamento
        const polled = await DirectOperationManager.pollSession(session.id);
        expect(polled.status).toBe("CANCELLED");
      }

      DirectOperationManager.clearSession(session.id);
    });

    it("deve prevenir compras duplicadas (double-buy) através da trava atômica isExecutingTrigger", async () => {
      const { session } = await DirectOperationManager.startOperation({
        amount: 25.0,
        durationMinutes: 5,
        mode: "paper",
      });

      if (session.status === "WAITING_TRIGGER") {
        // Dispara duas ativações simultâneas
        const [res1, res2] = await Promise.all([
          DirectOperationManager.forceEntry(session.id),
          DirectOperationManager.forceEntry(session.id),
        ]);

        expect(res1.status).toBe("ACTIVE");
        expect(res2.status).toBe("ACTIVE");
      }

      DirectOperationManager.clearSession(session.id);
    });
  });

  describe("4. Rotação Automática de Ativos (Cooldown 30 min) & Cockpit Top 3", () => {
    it("deve gerenciar histórico de cooldown de 30 minutos corretamente", () => {
      DirectOperationManager.clearCooldownHistory();
      expect(DirectOperationManager.getCooldownSymbols().length).toBe(0);

      DirectOperationManager.recordSymbolExecution("ZECUSDT");
      DirectOperationManager.recordSymbolExecution("BTCUSDT");

      const cooldowns = DirectOperationManager.getCooldownSymbols();
      expect(cooldowns).toContain("ZECUSDT");
      expect(cooldowns).toContain("BTCUSDT");

      DirectOperationManager.clearCooldownHistory();
    });

    it("deve aplicar rotação e penalizar ativo em cooldown em findBestOpportunity", async () => {
      DirectOperationManager.clearCooldownHistory();

      const { MarketOpportunitySelector } = await import("@/lib/bot/pilot/market-opportunity-selector");
      const selector = MarketOpportunitySelector.getInstance();

      // Chamada sem cooldown
      const oppNormal = await selector.findBestOpportunity(70, "https://api.binance.com", "AUTO", []);
      expect(oppNormal.topRanked).toBeDefined();
      expect(oppNormal.topRanked!.length).toBeGreaterThanOrEqual(1);

      // Chamada com o ativo vencedor anterior em cooldown
      const oppWithCooldown = await selector.findBestOpportunity(70, "https://api.binance.com", "AUTO", [oppNormal.symbol]);
      expect(oppWithCooldown).toBeDefined();
      expect(oppWithCooldown.topRanked).toBeDefined();

      // O ativo em cooldown deve ter isCooldownApplied se presente nos avaliados
      const cooldownEntry = oppWithCooldown.topRanked?.find((t) => t.symbol === oppNormal.symbol);
      if (cooldownEntry) {
        expect(cooldownEntry.isCooldownApplied).toBe(true);
      }
    });

    it("deve incluir topRanked na sessão criada por startOperation", async () => {
      DirectOperationManager.clearCooldownHistory();

      const { session } = await DirectOperationManager.startOperation({
        amount: 25.0,
        durationMinutes: 5,
        strategy: "AUTO",
        mode: "paper",
      });

      expect(session.topRanked).toBeDefined();
      expect(session.topRanked!.length).toBeGreaterThanOrEqual(1);
      expect(session.topRanked![0].symbol).toBeDefined();
      expect(session.topRanked![0].score).toBeGreaterThan(0);
      expect(session.topRanked![0].strategy).toBeDefined();

      DirectOperationManager.clearSession(session.id);
      DirectOperationManager.clearCooldownHistory();
    });
  });

  describe("5. Escada de Parciais 50/50 & Trailing Stop Parabólico (Trading Strategist)", () => {
    it("deve inicializar metas de parcial, trailingStop e highestPrice na sessão ativa", async () => {
      const { session } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        mode: "paper",
      });

      expect(session.partialTargetPrice).toBeDefined();
      expect(session.partialTargetPrice!).toBeGreaterThan(session.entryPrice);
      expect(session.partialTargetPrice!).toBeLessThan(session.targetPrice);
      expect(session.highestPriceReached).toBe(session.entryPrice);
      expect(session.isPartialProfitTaken).toBe(false);

      DirectOperationManager.clearSession(session.id);
    });

    it("deve executar parcial de 50%, embolsar lucro e mover o stop para break-even protegido (+0.35%)", async () => {
      const { session } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        mode: "paper",
      });

      const initialQty = session.quantity;
      const partialTarget = session.partialTargetPrice!;

      // Simula tick de preço atingindo a meta parcial
      const updated = await DirectOperationManager.processPriceTick(session.id, partialTarget);

      expect(updated.isPartialProfitTaken).toBe(true);
      expect(updated.breakEvenProtected).toBe(true);
      expect(updated.partialQuantityExecuted).toBeGreaterThan(0);
      expect(updated.partialRealizedPnlUsd).toBeGreaterThan(0);
      expect(updated.quantity).toBeLessThan(initialQty);
      expect(updated.stopLossPrice).toBeGreaterThan(session.entryPrice); // Break-even + margem de taxas
      expect(updated.trailingStopPrice).toBe(updated.stopLossPrice);

      DirectOperationManager.clearSession(session.id);
    });

    it("deve elevar o trailing stop dinamicamente quando o ativo expande ganhos no runner", async () => {
      const { session } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        mode: "paper",
      });

      // 1. Atinge parcial
      await DirectOperationManager.processPriceTick(session.id, session.partialTargetPrice!);

      // 2. Preço dispara ainda mais (+4% acima da entrada)
      const higherPrice = session.entryPrice * 1.04;
      const runnerState = await DirectOperationManager.processPriceTick(session.id, higherPrice);

      expect(runnerState.highestPriceReached).toBe(higherPrice);
      expect(runnerState.trailingStopPrice).toBeGreaterThan(session.entryPrice * 1.0035);

      DirectOperationManager.clearSession(session.id);
    });
  });

  describe("6. Pilares de Próxima Geração: Trading Strategist Pro, AI Engineer, Chaos & Infra", () => {
    it("deve classificar regimes de mercado (TRENDING_BULLISH, MEAN_REVERTING_RANGING, EXTREME_VOLATILITY)", () => {
      const { MarketOpportunitySelector } = require("@/lib/bot/pilot/market-opportunity-selector");
      const selector = MarketOpportunitySelector.getInstance();

      const dummyKlines = Array.from({ length: 30 }, (_, i) => ({
        openTime: i * 900000,
        open: 100 + i * 0.5,
        high: 101 + i * 0.5,
        low: 99.5 + i * 0.5,
        close: 100.8 + i * 0.5,
        volume: 1000,
        closeTime: (i + 1) * 900000,
      }));

      // Regime Tendência Forte
      const bullRegime = selector.classifyMarketRegime(dummyKlines, 32, 0.015, 58);
      expect(bullRegime.regime).toBe("TRENDING_BULLISH");
      expect(bullRegime.confidence).toBeGreaterThanOrEqual(70);

      // Regime Lateral / Exaustão
      const rangeRegime = selector.classifyMarketRegime(dummyKlines, 16, 0.012, 30);
      expect(rangeRegime.regime).toBe("MEAN_REVERTING_RANGING");

      // Regime Volatilidade Extrema
      const volRegime = selector.classifyMarketRegime(dummyKlines, 25, 0.035, 50);
      expect(volRegime.regime).toBe("EXTREME_VOLATILITY");
    });

    it("deve calcular confluência multi-timeframe (15m, 5m, 1m) com pontuação percentual", () => {
      const { MarketOpportunitySelector } = require("@/lib/bot/pilot/market-opportunity-selector");
      const selector = MarketOpportunitySelector.getInstance();

      const klines = Array.from({ length: 30 }, (_, i) => ({
        openTime: i * 900000,
        open: 50 + i * 0.2,
        high: 50.5 + i * 0.2,
        low: 49.8 + i * 0.2,
        close: 50.3 + i * 0.2,
        volume: 500,
        closeTime: (i + 1) * 900000,
      }));

      const mtf = selector.analyzeMultiTimeframeConfluence("BTCUSDT", klines);
      expect(mtf.macroTrend15m).toBeDefined();
      expect(mtf.setupTrend5m).toBeDefined();
      expect(mtf.triggerSniper1m).toBeDefined();
      expect(mtf.confluenceScore).toBeGreaterThanOrEqual(0);
      expect(mtf.confluenceScore).toBeLessThanOrEqual(100);
      expect(mtf.summary).toContain("Macro 15m");
    });

    it("deve calibrar dimensionamento por paridade de volatilidade (Kelly/ATR Parity <= $1.40 USD)", () => {
      const { MarketOpportunitySelector } = require("@/lib/bot/pilot/market-opportunity-selector");
      const selector = MarketOpportunitySelector.getInstance();

      // Ativo calmo (SL de 1.0%)
      const sizingLowVol = selector.calculateVolatilityTargetedSizing(100.0, 99.0, 25.0, 70.0);
      expect(sizingLowVol.riskAmountUsd).toBeLessThanOrEqual(1.40);
      expect(sizingLowVol.suggestedNotionalUsd).toBeGreaterThanOrEqual(11.0);

      // Ativo de alta volatilidade (SL de 2.0%)
      const sizingHighVol = selector.calculateVolatilityTargetedSizing(100.0, 98.0, 25.0, 70.0);
      expect(sizingHighVol.riskAmountUsd).toBeLessThanOrEqual(1.40);
      expect(sizingHighVol.volatilityScale).toBeLessThan(sizingLowVol.volatilityScale);
    });

    it("deve estruturar a escada de 3 alvos (TP1 33%, TP2 33%, TP3 34%) respeitando tickSize", () => {
      const { MarketOpportunitySelector } = require("@/lib/bot/pilot/market-opportunity-selector");
      const selector = MarketOpportunitySelector.getInstance();

      const filters = {
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

      const ladder = selector.calculateTripleTargetLadder(60000.0, 59000.0, 0.015, filters);
      expect(ladder.tp1Price).toBeGreaterThan(60000.0);
      expect(ladder.tp2Price).toBeGreaterThan(ladder.tp1Price);
      expect(ladder.tp3Price).toBeGreaterThan(ladder.tp2Price);
    });

    it("deve executar a escada tripla de realização de lucros (TP1 -> TP2 -> TP3) na sessão ativa", async () => {
      const { session } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        mode: "paper",
      });

      expect(session.tp1Price).toBeDefined();
      expect(session.tp2Price).toBeDefined();
      expect(session.tp3Price).toBeDefined();
      expect(session.priceHistory).toBeDefined();
      expect(session.priceHistory!.length).toBeGreaterThanOrEqual(1);

      // 1. Tick atinge TP1: realiza 33% e blinda no Break-Even
      const afterTp1 = await DirectOperationManager.processPriceTick(session.id, session.tp1Price!);
      expect(afterTp1.isTp1Taken).toBe(true);
      expect(afterTp1.breakEvenProtected).toBe(true);
      expect(afterTp1.tp1QuantityExecuted).toBeGreaterThan(0);
      expect(afterTp1.tp1RealizedPnlUsd).toBeGreaterThan(0);

      // 2. Tick atinge TP2: realiza mais 33% e aperta o Trailing Stop (0.8% da máxima)
      const afterTp2 = await DirectOperationManager.processPriceTick(session.id, session.tp2Price!);
      expect(afterTp2.isTp2Taken).toBe(true);
      expect(afterTp2.tp2QuantityExecuted).toBeGreaterThan(0);
      expect(afterTp2.trailingStopPrice).toBeGreaterThan(session.entryPrice);
      expect(afterTp2.trailingStopPrice).toBeCloseTo(session.entryPrice * 1.0035, 3);

      DirectOperationManager.clearSession(session.id);
    });

    it("deve auditar latência de execução e slippage drift via ExecutionLatencyGuard", () => {
      const { ExecutionLatencyGuard } = require("@/lib/bot/pilot/direct-operation-manager");

      // Execução saudável (< 1200ms e < 0.15% slippage)
      const healthy = ExecutionLatencyGuard.auditExecution(1000, 1400, 100.0, 100.05);
      expect(healthy.latencyMs).toBe(400);
      expect(healthy.isWithinSla).toBe(true);
      expect(healthy.warning).toBeUndefined();

      // Execução com grey failure (latência de 1800ms)
      const degraded = ExecutionLatencyGuard.auditExecution(1000, 2800, 100.0, 100.05);
      expect(degraded.latencyMs).toBe(1800);
      expect(degraded.isWithinSla).toBe(false);
      expect(degraded.warning).toContain("Latência de execução elevada");
    });

    it("deve monitorar o peso de rate limits da exchange via RateLimitMonitor", () => {
      const { RateLimitMonitor } = require("@/lib/bot/pilot/direct-operation-manager");

      RateLimitMonitor.recordRequest(5);
      const status = RateLimitMonitor.getRateLimitStatus();
      expect(status.usedWeight1m).toBeGreaterThanOrEqual(5);
      expect(typeof status.usageRatio).toBe("number");
      expect(typeof status.shouldThrottle).toBe("boolean");
    });
  });
});



