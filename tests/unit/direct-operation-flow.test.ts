import { describe, it, expect, beforeEach } from "bun:test";
import { CurrencyPairNormalizer } from "@/lib/bot/pilot/currency-pair-normalizer";
import { DirectOperationManager } from "@/lib/bot/pilot/direct-operation-manager";
import { ExchangeMetadataService } from "@/lib/bot/pilot/exchange-metadata-service";
import { MarketOpportunitySelector } from "@/lib/bot/pilot/market-opportunity-selector";

describe("Operação Direta com IA & Normalização de Cotação", () => {
  beforeEach(() => {
    DirectOperationManager.resetMocks();

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
      const { session: created } = await DirectOperationManager.startOperation({
        amount: 25.0,
        durationMinutes: 5,
        mode: "paper",
      });

      const session = created.status === "WAITING_TRIGGER"
        ? await DirectOperationManager.forceEntry(created.id)
        : created;

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
      const { session: created } = await DirectOperationManager.startOperation({
        amount: 20.0,
        durationMinutes: 1,
        mode: "paper",
      });

      const session = created.status === "WAITING_TRIGGER"
        ? await DirectOperationManager.forceEntry(created.id)
        : created;

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
      const { session: created } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        mode: "paper",
      });

      const session = created.status === "WAITING_TRIGGER"
        ? await DirectOperationManager.forceEntry(created.id)
        : created;

      const initialQty = session.quantity;
      const partialTarget = session.partialTargetPrice!;

      // Simula tick de preço atingindo a meta parcial
      const updated = await DirectOperationManager.processPriceTick(session.id, partialTarget);

      expect(updated.isPartialProfitTaken).toBe(true);
      expect(updated.breakEvenProtected).toBe(true);
      expect(updated.partialQuantityExecuted).toBeGreaterThan(0);
      expect(updated.partialRealizedPnlUsd).toBeGreaterThanOrEqual(0);
      expect(updated.quantity).toBeLessThan(initialQty);
      expect(updated.stopLossPrice).toBeGreaterThan(session.entryPrice); // Break-even + margem de taxas
      expect(updated.trailingStopPrice).toBe(updated.stopLossPrice);

      DirectOperationManager.clearSession(session.id);
    });

    it("deve elevar o trailing stop dinamicamente quando o ativo expande ganhos no runner", async () => {
      const { session: created } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        mode: "paper",
      });

      const session = created.status === "WAITING_TRIGGER"
        ? await DirectOperationManager.forceEntry(created.id)
        : created;

      // Define alvos distantes e escalonados para testar o trailing do runner sem colidir com alvos prematuramente
      session.partialTargetPrice = session.entryPrice * 1.010;
      session.tp1Price = session.entryPrice * 1.010;
      session.tp2Price = session.entryPrice * 1.020;
      session.tp3Price = session.entryPrice * 1.050;
      session.targetPrice = session.entryPrice * 1.050;

      // 1. Atinge parcial (TP1) a +1.0%
      await DirectOperationManager.processPriceTick(session.id, session.partialTargetPrice);

      // 2. Preço dispara ainda mais (+2.5% acima da entrada, mantendo runner ativo)
      const higherPrice = session.entryPrice * 1.025;
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
      const { session: created } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        mode: "paper",
      });

      const session = created.status === "WAITING_TRIGGER"
        ? await DirectOperationManager.forceEntry(created.id)
        : created;

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
      expect(afterTp1.tp1RealizedPnlUsd).toBeGreaterThanOrEqual(0);

      // 2. Tick atinge TP2: realiza mais 33% e aperta o Trailing Stop (0.8% da máxima)
      const afterTp2 = await DirectOperationManager.processPriceTick(session.id, session.tp2Price!);
      expect(afterTp2.isTp2Taken).toBe(true);
      expect(afterTp2.tp2QuantityExecuted).toBeGreaterThan(0);
      expect(afterTp2.trailingStopPrice).toBeGreaterThan(session.entryPrice);
      expect(afterTp2.trailingStopPrice).toBeGreaterThanOrEqual(afterTp2.highestPriceReached! * 0.992 - 0.001);

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

  describe("7. Funcionalidades de Próxima Geração v2.0 (Trading Strategist Pro, Chaos Engineering & AI Engineer)", () => {
    it("deve calcular bandas de VWAP intradiária e identificar fair value institucional", () => {
      const selector = MarketOpportunitySelector.getInstance();
      const mockKlines = [
        { open: 100, high: 102, low: 99, close: 101, volume: 1000 },
        { open: 101, high: 104, low: 100, close: 103, volume: 1500 },
        { open: 103, high: 105, low: 102, close: 104, volume: 2000 },
      ];

      const vwapResult = selector.calculateIntradayVwapBands(mockKlines, 103.5);

      expect(vwapResult.vwap).toBeGreaterThan(100);
      expect(vwapResult.vwap).toBeLessThan(105);
      expect(vwapResult.upperBand1).toBeGreaterThan(vwapResult.vwap);
      expect(vwapResult.upperBand2).toBeGreaterThan(vwapResult.upperBand1);
      expect(vwapResult.lowerBand1).toBeLessThan(vwapResult.vwap);
      expect(vwapResult.lowerBand2).toBeLessThan(vwapResult.lowerBand1);
      expect(vwapResult.positionContext).toBeDefined();
    });

    it("deve calcular o stop dinâmico Chandelier Exit respeitando o ATR", () => {
      const selector = MarketOpportunitySelector.getInstance();
      const highestPrice = 50000;
      const atr = 750;
      const multiplier = 2.0;

      const chandelier = selector.calculateChandelierExit(highestPrice, atr, multiplier);

      expect(chandelier.highestPrice).toBe(highestPrice);
      expect(chandelier.chandelierStop).toBe(50000 - 750 * 2.0); // 48500
      expect(chandelier.distancePct).toBe(3.0);
    });

    it("deve calcular dimensionamento por Kelly Fracionário respeitando o teto de risco institucional ($1.40 USD)", () => {
      const selector = MarketOpportunitySelector.getInstance();
      const kelly = selector.calculateFractionalKellySizing(0.65, 1.8, 70.0, 0.25);

      expect(kelly.kellyPercent).toBeGreaterThan(0);
      expect(kelly.fractionalMultiplier).toBe(0.25);
      expect(kelly.suggestedRiskUsd).toBeLessThanOrEqual(1.40); // Teto de 2% de $70
      expect(kelly.suggestedNotionalUsd).toBeGreaterThanOrEqual(12.0);
      expect(kelly.suggestedNotionalUsd).toBeLessThanOrEqual(35.0);
      expect(kelly.rationale).toContain("Kelly Fracionário");
    });

    it("deve simular injeção de grey failure, perda de pacotes e cotações obsoletas no ChaosInjector", async () => {
      const { ChaosInjector } = require("@/lib/bot/pilot/chaos-test-harness");

      // 1. Injeção de perda de pacotes
      const dropInjector = new ChaosInjector({
        enabled: true,
        name: "test-loss-gateway",
        dropRate: 1.0, // 100% de perda
        seed: 42,
      });

      let dropCaught = false;
      try {
        await dropInjector.wrap(async () => "sucesso");
      } catch (err: any) {
        dropCaught = true;
        expect(err.message).toContain("ConnectionAbortedError");
      }
      expect(dropCaught).toBe(true);

      // 2. Injeção de Grey Failure (Latência)
      const latencyInjector = new ChaosInjector({
        enabled: true,
        name: "test-latency-gateway",
        latencyMs: 30,
        jitterMs: 10,
        dropRate: 0.0,
      });

      const start = Date.now();
      const res = await latencyInjector.wrap(async () => "ok");
      const elapsed = Date.now() - start;
      expect(res).toBe("ok");
      expect(elapsed).toBeGreaterThanOrEqual(25);

      // 3. Injeção de dados obsoletos (Stale Timestamp)
      const now = Date.now();
      const staleTime = latencyInjector.injectStaleTimestamp(now, 45000);
      expect(now - staleTime).toBe(45000);
    });

    it("deve escalonar os 3 níveis proporcionais de contenção do GraduatedCircuitBreaker", () => {
      const { GraduatedCircuitBreaker } = require("@/lib/bot/pilot/chaos-test-harness");
      const cb = GraduatedCircuitBreaker.getInstance();
      cb.reset();

      // Nível 0: Normal
      const normal = cb.evaluateHealth({ latencyMs: 50, spreadPct: 0.0003 });
      expect(normal.tier).toBe("NORMAL");
      expect(normal.positionScale).toBe(1.0);
      expect(normal.canOpenNewOrder).toBe(true);

      // Nível 1: Cautela (Spread alargado > 0.12%)
      const caution = cb.evaluateHealth({ latencyMs: 50, spreadPct: 0.0018 });
      expect(caution.tier).toBe("TIER_1_CAUTION");
      expect(caution.positionScale).toBe(0.5); // reduz lote em 50%
      expect(caution.canOpenNewOrder).toBe(true);

      // Nível 2: Suspensão de novas ordens (>= 2 perdas consecutivas)
      cb.recordTradeOutcome(-1.0);
      cb.recordTradeOutcome(-1.0);
      const suspended = cb.evaluateHealth({ latencyMs: 50, spreadPct: 0.0003 });
      expect(suspended.tier).toBe("TIER_2_SUSPEND_NEW_ORDERS");
      expect(suspended.positionScale).toBe(0.0);
      expect(suspended.canOpenNewOrder).toBe(false);

      // Nível 3: Kill Switch Global (Perda diária acumulada >= $3.50 USD)
      cb.recordTradeOutcome(-2.0); // Total de perdas: $4.00 USD > $3.50 USD
      const halted = cb.evaluateHealth({ latencyMs: 50, spreadPct: 0.0003 });
      expect(halted.tier).toBe("TIER_3_EMERGENCY_HALT");
      expect(halted.positionScale).toBe(0.0);
      expect(halted.canOpenNewOrder).toBe(false);

      cb.reset();
    });

    it("deve gerar auto-reflexão pós-trade da IA com métricas MFE/MAE no encerramento da operação", async () => {
      const { session: created } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        strategy: "AUTO",
        mode: "paper",
      });

      const session = created.status === "WAITING_TRIGGER"
        ? await DirectOperationManager.forceEntry(created.id)
        : created;

      // Simula expansão para alvo (MFE) e recuo controlado (MAE) sem violar SL
      await DirectOperationManager.processPriceTick(session.id, session.entryPrice * 1.012); // Pico MFE +1.2%
      await DirectOperationManager.processPriceTick(session.id, session.entryPrice * 0.998); // Recuo MAE -0.2%

      const closed = await DirectOperationManager.closeOperation(
        session.id,
        "TARGET_REACHED",
        session.entryPrice * 1.010
      );

      expect(closed.status).toBe("CLOSED");
      expect(closed.postTradeJournal).toBeDefined();

      const journal = closed.postTradeJournal!;
      expect(journal.mfePercent).toBeGreaterThan(0);
      expect(journal.maePercent).toBeLessThanOrEqual(0);
      expect(journal.exitEfficiencyPct).toBeGreaterThan(0);
      expect(journal.rating).toBeDefined();
      expect(journal.aiReflection).toContain("Operação encerrada via");
      expect(journal.lessonsLearned.length).toBeGreaterThan(0);

      // Verifica que a entrada consta no diário global da IA
      const allEntries = DirectOperationManager.getTradeJournal();
      expect(allEntries.length).toBeGreaterThanOrEqual(1);

      DirectOperationManager.clearSession(session.id);
    });

    it("deve recalibrar heuristicamente o TP2 de 2.0x para 1.7x quando a eficiência média < 50% e MFE recorrente > 2.0%", () => {
      const { MarketOpportunitySelector } = require("@/lib/bot/pilot/market-opportunity-selector");
      const selector = MarketOpportunitySelector.getInstance();

      // Simula 10 operações históricas com MFE > 2.0% mas saída ineficiente (< 50%)
      const mockJournals = Array.from({ length: 10 }, (_, i) => ({
        id: `journal-mock-${i}`,
        mfePercent: 2.4, // MFE expressivo > 2.0%
        exitEfficiencyPct: 35.0, // Eficiência baixa (< 50%)
        realizedPnlPercent: 0.8,
      }));

      const recalibration = selector.calculateHeuristicTargetRecalibration(mockJournals);
      expect(recalibration.isRecalibrated).toBe(true);
      expect(recalibration.tp2Multiplier).toBe(1.7);
      expect(recalibration.averageExitEfficiency).toBeLessThan(50);
      expect(recalibration.recurrentHighMfeCount).toBe(10);
      expect(recalibration.reason).toContain("Multiplicador TP2 contraído de 2.0x para 1.7x");

      // Verifica se a escada tripla calcula o TP2 mais próximo (com 1.7x em vez de 2.0x)
      const filters = { minPrice: 0.01, maxPrice: 100000, tickSize: 0.01, stepSize: 0.001, minQty: 0.001, maxQty: 1000, minNotional: 5.0 };
      const defaultLadder = selector.calculateTripleTargetLadder(100.0, 98.0, 0.02, filters, 2.0);
      const recalibratedLadder = selector.calculateTripleTargetLadder(100.0, 98.0, 0.02, filters, recalibration.tp2Multiplier);

      expect(recalibratedLadder.tp2Price).toBeLessThan(defaultLadder.tp2Price);
      expect(recalibratedLadder.tp2Price).toBe(103.4); // 100 + (100 * 0.02 * 1.7) = 103.4
      expect(defaultLadder.tp2Price).toBe(104.0); // 100 + (100 * 0.02 * 2.0) = 104.0
    });

    it("deve manter o multiplicador padrão de 2.0x quando a eficiência média de saída for saudável (>= 50%)", () => {
      const { MarketOpportunitySelector } = require("@/lib/bot/pilot/market-opportunity-selector");
      const selector = MarketOpportunitySelector.getInstance();

      const healthyJournals = Array.from({ length: 10 }, (_, i) => ({
        id: `journal-healthy-${i}`,
        mfePercent: 2.2,
        exitEfficiencyPct: 78.0, // Eficiência alta
        realizedPnlPercent: 1.7,
      }));

      const recalibration = selector.calculateHeuristicTargetRecalibration(healthyJournals);
      expect(recalibration.isRecalibrated).toBe(false);
      expect(recalibration.tp2Multiplier).toBe(2.0);
      expect(recalibration.averageExitEfficiency).toBe(78.0);
      expect(recalibration.reason).toContain("Multiplicador padrão TP2 2.0x mantido");
    });

    it("deve acionar o Trailing Stop Agressivo (+0.60%) quando a operação registrar MAE inicial <= -0.60% antes do TP1", async () => {
      const { session: created } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        strategy: "AUTO",
        mode: "paper",
      });

      const session = created.status === "WAITING_TRIGGER"
        ? await DirectOperationManager.forceEntry(created.id)
        : created;

      // Garante margem do Stop Loss inicial para registrar a excursão adversa sem violar o stop
      session.stopLossPrice = session.entryPrice * 0.98;

      // 1. Simula estresse inicial com recuo severo: MAE de -0.65% (<= -0.60%)
      await DirectOperationManager.processPriceTick(session.id, session.entryPrice * 0.9935);

      // 2. Preço se recupera e atinge o Alvo TP1
      const afterTp1 = await DirectOperationManager.processPriceTick(session.id, session.tp1Price!);

      expect(afterTp1.isTp1Taken).toBe(true);
      expect(afterTp1.breakEvenProtected).toBe(true);
      expect(afterTp1.isAggressiveBreakEvenActive).toBe(true);
      expect(afterTp1.breakEvenOffsetPct).toBe(0.60);
      expect(afterTp1.initialMaeAtTp1Pct).toBeLessThanOrEqual(-0.60);
      expect(afterTp1.trailingStopPrice).toBeGreaterThan(session.entryPrice);

      DirectOperationManager.clearSession(session.id);
    });

    it("deve manter o Break-Even padrão (+0.35%) quando o movimento for limpo com MAE > -0.60% antes do TP1", async () => {
      const { session: created } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        strategy: "AUTO",
        mode: "paper",
      });

      const session = created.status === "WAITING_TRIGGER"
        ? await DirectOperationManager.forceEntry(created.id)
        : created;

      // 1. Simula recuo superficial limpo: MAE de apenas -0.2% (> -0.60%)
      await DirectOperationManager.processPriceTick(session.id, session.entryPrice * 0.998);

      // 2. Preço atinge o Alvo TP1
      const afterTp1 = await DirectOperationManager.processPriceTick(session.id, session.tp1Price!);

      expect(afterTp1.isTp1Taken).toBe(true);
      expect(afterTp1.breakEvenProtected).toBe(true);
      expect(afterTp1.isAggressiveBreakEvenActive).toBe(false);
      expect(afterTp1.breakEvenOffsetPct).toBe(0.35);
      expect(afterTp1.initialMaeAtTp1Pct).toBeGreaterThan(-0.60);
      expect(afterTp1.trailingStopPrice).toBeGreaterThan(session.entryPrice);

      DirectOperationManager.clearSession(session.id);
    });

    it("deve acionar o Order Book Skew Gate (liquidando 50% em vez de 33%) quando a razão Bid/Ask Depth <= 0.40 no disparo do TP1", async () => {
      const { session: created } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        strategy: "AUTO",
        mode: "paper",
      });

      const session = created.status === "WAITING_TRIGGER"
        ? await DirectOperationManager.forceEntry(created.id)
        : created;

      const initialQty = session.quantity;

      // Injeta assimetria no livro L2 com razão Bid/Ask Depth de 0.35 (<= 0.40)
      DirectOperationManager.setMockOrderBookRatio(session.symbol, 0.35);

      // Preço atinge o Alvo TP1
      const afterTp1 = await DirectOperationManager.processPriceTick(session.id, session.tp1Price!);

      expect(afterTp1.isTp1Taken).toBe(true);
      expect(afterTp1.isSkewGateActive).toBe(true);
      expect(afterTp1.orderBookSkewRatio).toBe(0.35);
      expect(afterTp1.tp1LiquidationPct).toBe(50);
      expect(Math.abs(afterTp1.tp1QuantityExecuted - initialQty * 0.50)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(afterTp1.quantity - initialQty * 0.50)).toBeLessThanOrEqual(0.1);

      // Limpa mock e sessão
      DirectOperationManager.setMockOrderBookRatio(session.symbol, null);
      DirectOperationManager.clearSession(session.id);
    });

    it("deve manter a liquidação padrão de 33% no TP1 quando o Order Book L2 for equilibrado com razão Bid/Ask Depth > 0.40", async () => {
      const { session: created } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        strategy: "AUTO",
        mode: "paper",
      });

      const session = created.status === "WAITING_TRIGGER"
        ? await DirectOperationManager.forceEntry(created.id)
        : created;

      const initialQty = session.quantity;

      // Injeta livro L2 favorável com razão Bid/Ask Depth de 1.25 (> 0.40)
      DirectOperationManager.setMockOrderBookRatio(session.symbol, 1.25);

      // Preço atinge o Alvo TP1
      const afterTp1 = await DirectOperationManager.processPriceTick(session.id, session.tp1Price!);

      expect(afterTp1.isTp1Taken).toBe(true);
      expect(afterTp1.isSkewGateActive).toBe(false);
      expect(afterTp1.orderBookSkewRatio).toBe(1.25);
      expect(afterTp1.tp1LiquidationPct).toBe(33);
      expect(Math.abs(afterTp1.tp1QuantityExecuted - initialQty * 0.33)).toBeLessThanOrEqual(1.0);
      expect(Math.abs(afterTp1.quantity - initialQty * 0.67)).toBeLessThanOrEqual(1.0);

      // Limpa mock e sessão
      DirectOperationManager.setMockOrderBookRatio(session.symbol, null);
      DirectOperationManager.clearSession(session.id);
    });

    it("deve antecipar o TP2 a mercado quando o preço se aproximar a menos de 0.20% do alvo e houver divergência negativa de CVD (< 0)", async () => {
      const { session: created } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        strategy: "AUTO",
        mode: "paper",
      });

      const session = created.status === "WAITING_TRIGGER"
        ? await DirectOperationManager.forceEntry(created.id)
        : created;

      // Executa TP1 primeiro
      await DirectOperationManager.processPriceTick(session.id, session.tp1Price!);
      expect(session.isTp1Taken).toBe(true);
      expect(session.isTp2Taken).toBe(false);

      const remainingQtyBeforeTp2 = session.quantity;

      // Injeta CVD Delta negativo (-14.5%) simulando exaustão compradora e agressão de venda no topo
      DirectOperationManager.setMockCvdDelta(session.symbol, -14.5);

      // Preço aproxima-se a 0.15% do TP2 (dentro da janela <= 0.20%, mas sem tocar o alvo exato)
      const nearTp2Price = session.tp2Price! * 0.9985;
      expect(nearTp2Price).toBeLessThan(session.tp2Price!);
      expect(nearTp2Price).toBeGreaterThanOrEqual(session.tp2Price! * 0.998);

      const afterNearTick = await DirectOperationManager.processPriceTick(session.id, nearTp2Price);

      // TP2 deve ter sido antecipado a mercado devido ao CVD Exhaustion Filter!
      expect(afterNearTick.isTp2Taken).toBe(true);
      expect(afterNearTick.isCvdExhaustionTriggered).toBe(true);
      expect(afterNearTick.cvdDeltaAtTp2Pct).toBe(-14.5);
      expect(afterNearTick.tp2AnticipatedReason).toBe("CVD_EXHAUSTION");
      expect(Math.abs(afterNearTick.tp2QuantityExecuted - remainingQtyBeforeTp2 * 0.5)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(afterNearTick.quantity - remainingQtyBeforeTp2 * 0.5)).toBeLessThanOrEqual(0.1);
      expect(afterNearTick.trailingStopPrice).toBeGreaterThan(0);

      // Encerra e valida reflexão no diário
      const closed = await DirectOperationManager.closeOperation(session.id, "TARGET_REACHED", nearTp2Price);
      expect(closed.postTradeJournal?.isCvdExhaustionTriggered).toBe(true);
      expect(closed.postTradeJournal?.lessonsLearned.some((l) => l.includes("CVD Exhaustion Filter acionado em TP2"))).toBe(true);

      // Limpa mock e sessão
      DirectOperationManager.setMockCvdDelta(session.symbol, null);
      DirectOperationManager.clearSession(session.id);
    }, 15000);

    it("não deve antecipar o TP2 na aproximação se o CVD Delta for positivo (>= 0), aguardando o toque direto no alvo", async () => {
      const { session: created } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        strategy: "AUTO",
        mode: "paper",
      });

      const session = created.status === "WAITING_TRIGGER"
        ? await DirectOperationManager.forceEntry(created.id)
        : created;

      // Injeta CVD Delta fortemente positivo (+22.0%), indicando fluxo comprador saudável
      DirectOperationManager.setMockCvdDelta(session.symbol, 22.0);

      // Executa TP1 primeiro
      await DirectOperationManager.processPriceTick(session.id, session.tp1Price!);
      expect(session.isTp1Taken).toBe(true);
      expect(session.isTp2Taken).toBe(false);

      // Preço aproxima-se a 0.15% do TP2 (sem tocar o alvo)
      const nearTp2Price = session.tp2Price! * 0.9985;
      const afterNearTick = await DirectOperationManager.processPriceTick(session.id, nearTp2Price);

      // Com CVD positivo, TP2 NÃO deve ser antecipado prematuramente
      expect(afterNearTick.isTp2Taken).toBe(false);
      expect(afterNearTick.isCvdExhaustionTriggered).toBeFalsy();

      // Quando o preço toca o alvo exato TP2, a execução regular ocorre
      const afterTouch = await DirectOperationManager.processPriceTick(session.id, session.tp2Price!);
      expect(afterTouch.isTp2Taken).toBe(true);
      expect(afterTouch.isCvdExhaustionTriggered).toBe(false);

      // Limpa mock e sessão
      DirectOperationManager.setMockCvdDelta(session.symbol, null);
      DirectOperationManager.clearSession(session.id);
    });
  });

  describe("Blindagem de Lucro Mínimo Absoluto no Runner (TP3 Hard Floor)", () => {
    it("deve ativar o TP3 Hard Floor (>= +1.0% ou TP1) após a execução do TP2 e liquidar o runner se recuar abaixo do piso", async () => {
      const { session: created } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        strategy: "AUTO",
        mode: "paper",
      });

      const session = created.status === "WAITING_TRIGGER"
        ? await DirectOperationManager.forceEntry(created.id)
        : created;

      // 1. Executa TP1
      await DirectOperationManager.processPriceTick(session.id, session.tp1Price!);
      expect(session.isTp1Taken).toBe(true);

      // 2. Executa TP2
      await DirectOperationManager.processPriceTick(session.id, session.tp2Price!);
      expect(session.isTp2Taken).toBe(true);

      // 3. Valida ativação do TP3 Hard Floor
      expect(session.isTp3HardFloorActive).toBe(true);
      const min1PctFloor = session.entryPrice * 1.010;
      expect(session.tp3HardFloorPrice).toBeGreaterThanOrEqual(min1PctFloor - 0.001);
      expect(session.tp3HardFloorPct).toBeGreaterThanOrEqual(1.0);
      expect(session.trailingStopPrice).toBeGreaterThanOrEqual(session.tp3HardFloorPrice!);

      // 4. Preço recua testando o piso rígido
      const breachPrice = session.tp3HardFloorPrice! * 0.9995;
      const closed = await DirectOperationManager.processPriceTick(session.id, breachPrice);

      // 5. O Runner deve ter sido liquidado sem devolver o lucro consolidado
      expect(closed.status).toBe("CLOSED");
      expect(closed.closeReason).toBe("STOP_LOSS");
      expect(closed.postTradeJournal?.isTp3HardFloorActive).toBe(true);
      expect(closed.postTradeJournal?.lessonsLearned.some((l) => l.includes("Blindagem TP3 Hard Floor ativada após TP2"))).toBe(true);

      DirectOperationManager.clearSession(session.id);
    });

    it("deve expandir o trailing stop acima do Hard Floor conforme o runner renova máximas sem jamais retroceder abaixo do piso", async () => {
      const { session: created } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        strategy: "AUTO",
        mode: "paper",
      });

      const session = created.status === "WAITING_TRIGGER"
        ? await DirectOperationManager.forceEntry(created.id)
        : created;

      // Define alvos distantes para permitir que o runner expanda livremente no teste sem colidir com TP3
      session.targetPrice = session.entryPrice * 1.15;
      session.tp3Price = session.entryPrice * 1.15;
      DirectOperationManager.updateSessionForTesting(session.id, {
        targetPrice: session.entryPrice * 1.15,
        tp3Price: session.entryPrice * 1.15,
      });

      // Executa TP1 e TP2
      await DirectOperationManager.processPriceTick(session.id, session.tp1Price!);
      await DirectOperationManager.processPriceTick(session.id, session.tp2Price!);
      expect(session.isTp3HardFloorActive).toBe(true);

      const initialHardFloor = session.tp3HardFloorPrice!;
      expect(initialHardFloor).toBeGreaterThanOrEqual(session.entryPrice * 1.010 - 0.001);

      // Runner tem forte expansão favorável (+4.0% acima da entrada)
      const surgePrice = session.entryPrice * 1.040;
      const afterSurge = await DirectOperationManager.processPriceTick(session.id, surgePrice);

      // O Trailing Stop de 0.8% abaixo da máxima de $surgePrice deve ser maior que o piso rígido inicial
      const expectedSurgeTrailing = surgePrice * 0.992;
      expect(afterSurge.trailingStopPrice).toBeGreaterThan(initialHardFloor);
      expect(afterSurge.trailingStopPrice!).toBeGreaterThanOrEqual(expectedSurgeTrailing - 0.001);

      // Preço recua levemente para surgePrice * 0.995 (acima do novo trailing stop)
      const afterSmallPullback = await DirectOperationManager.processPriceTick(session.id, surgePrice * 0.995);
      expect(afterSmallPullback.status).toBe("ACTIVE");
      // O trailing stop não pode ter regredido
      expect(afterSmallPullback.trailingStopPrice).toBeGreaterThan(initialHardFloor);

      DirectOperationManager.clearSession(session.id);
    });
  });

  describe("Aceleração Dinâmica de Expansão do Runner por ATR Spike (Runner Momentum Acceleration)", () => {
    it("deve afrouxar o trailing stop do runner pós-TP2 para 1.2% sob Spike de Volume (> 2.5x) e rompimento de Upper BB, respeitando o piso rígido", async () => {
      const { session: created } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        strategy: "AUTO",
        mode: "paper",
      });

      const session = created.status === "WAITING_TRIGGER"
        ? await DirectOperationManager.forceEntry(created.id)
        : created;

      // Define alvos amplos para permitir que o runner expanda livremente no teste sem colidir precocemente com TP3
      session.tp1Price = session.entryPrice * 1.015;
      session.tp2Price = session.entryPrice * 1.030;
      session.targetPrice = session.entryPrice * 1.15;
      session.tp3Price = session.entryPrice * 1.15;
      DirectOperationManager.updateSessionForTesting(session.id, {
        tp1Price: session.entryPrice * 1.015,
        tp2Price: session.entryPrice * 1.030,
        targetPrice: session.entryPrice * 1.15,
        tp3Price: session.entryPrice * 1.15,
        endTime: Date.now() + 600000,
      });

      // 1. Executa TP1 e TP2
      await DirectOperationManager.processPriceTick(session.id, session.tp1Price!);
      await DirectOperationManager.processPriceTick(session.id, session.tp2Price!);
      expect(session.isTp2Taken).toBe(true);
      expect(session.isTp3HardFloorActive).toBe(true);

      // 2. Injeta Spike de Volume (> 2.5x) e Rompimento de Upper BB na máxima
      DirectOperationManager.setMockRunnerSpike(session.symbol, {
        isSpike: true,
        isExhausted: false,
        volumeRatio: 3.4,
      });

      const peakPrice = session.entryPrice * 1.050;
      const afterSpike = await DirectOperationManager.processPriceTick(session.id, peakPrice);

      // 3. Valida afrouxamento temporário para 1.2% (factor 0.988)
      expect(afterSpike.isRunnerAccelerationActive).toBe(true);
      expect(afterSpike.runnerTrailingFactor).toBe(0.988);
      expect(afterSpike.runnerVolumeRatio).toBe(3.4);
      expect(afterSpike.trailingStopPrice).toBeGreaterThanOrEqual(session.tp3HardFloorPrice!);

      // 4. Preço recua 1.0% abaixo da máxima (recuo que estoparia 0.8%, mas sobrevive em 1.2%)
      const pullback1PctPrice = peakPrice * 0.990;
      const afterPullback = await DirectOperationManager.processPriceTick(session.id, pullback1PctPrice);

      expect(afterPullback.status).toBe("ACTIVE");
      expect(afterPullback.isRunnerAccelerationActive).toBe(true);

      DirectOperationManager.setMockRunnerSpike(session.symbol, null);
      DirectOperationManager.clearSession(session.id);
    });

    it("deve apertar o trailing stop para 0.5% (clímax travado) assim que a exaustão volumétrica for detectada no runner", async () => {
      const { session: created } = await DirectOperationManager.startOperation({
        amount: 30.0,
        durationMinutes: 5,
        strategy: "AUTO",
        mode: "paper",
      });

      const session = created.status === "WAITING_TRIGGER"
        ? await DirectOperationManager.forceEntry(created.id)
        : created;

      // Define alvos amplos para permitir teste de clímax do runner sem encerrar no alvo final TP3
      session.tp1Price = session.entryPrice * 1.015;
      session.tp2Price = session.entryPrice * 1.030;
      session.targetPrice = session.entryPrice * 1.15;
      session.tp3Price = session.entryPrice * 1.15;
      DirectOperationManager.updateSessionForTesting(session.id, {
        tp1Price: session.entryPrice * 1.015,
        tp2Price: session.entryPrice * 1.030,
        targetPrice: session.entryPrice * 1.15,
        tp3Price: session.entryPrice * 1.15,
        endTime: Date.now() + 600000,
      });

      // Executa TP1 e TP2
      await DirectOperationManager.processPriceTick(session.id, session.tp1Price!);
      await DirectOperationManager.processPriceTick(session.id, session.tp2Price!);

      // 1. Inicia em aceleração de spike a +5.0%
      DirectOperationManager.setMockRunnerSpike(session.symbol, {
        isSpike: true,
        isExhausted: false,
        volumeRatio: 3.0,
      });
      const peakPrice = session.entryPrice * 1.050;
      const afterSpike = await DirectOperationManager.processPriceTick(session.id, peakPrice);
      expect(afterSpike.isRunnerAccelerationActive).toBe(true);

      // 2. Agora o volume seca / exaure (< 1.5x)
      DirectOperationManager.setMockRunnerSpike(session.symbol, {
        isSpike: false,
        isExhausted: true,
        volumeRatio: 1.1,
      });

      const afterExhaustion = await DirectOperationManager.processPriceTick(session.id, peakPrice);

      // 3. Valida transição para Clímax Tightening (factor 0.995 / 0.5%)
      expect(afterExhaustion.isRunnerAccelerationActive).toBe(false);
      expect(afterExhaustion.isRunnerClimaxTighteningActive).toBe(true);
      expect(afterExhaustion.runnerTrailingFactor).toBe(0.995);

      const expected05PctStop = peakPrice * 0.995;
      expect(afterExhaustion.trailingStopPrice!).toBeGreaterThanOrEqual(expected05PctStop - 0.001);

      // 4. Preço recua e é liquidado no topo protegido pelo aperto de clímax
      const breachPrice = expected05PctStop * 0.9995;
      const closed = await DirectOperationManager.processPriceTick(session.id, breachPrice);

      expect(closed.status).toBe("CLOSED");
      expect(closed.closeReason).toBe("STOP_LOSS");
      expect(closed.postTradeJournal?.lessonsLearned.some((l) => l.includes("Clímax e Exaustão Volumétrica no Runner"))).toBe(true);

      DirectOperationManager.setMockRunnerSpike(session.symbol, null);
      DirectOperationManager.clearSession(session.id);
    });
  });
});



