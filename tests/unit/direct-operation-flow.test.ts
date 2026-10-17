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
        amount: 15.0,
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
});



