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
      expect(async () => {
        await DirectOperationManager.startOperation({
          amount: 25.0,
          durationMinutes: 5,
          mode: "live",
          binanceCredentials: { apiKey: "", apiSecret: "" },
        });
      }).toThrow();
    });
  });
});

