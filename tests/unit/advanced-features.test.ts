import { describe, it, expect, beforeEach } from "bun:test";
import {
  TradeJournalEngine,
  type TradeJournalRecord,
} from "@/lib/journal/trade-journal-engine";
import {
  TelegramNotificationService,
} from "@/lib/telegram/telegram-service";
import {
  OrderFlowAnomalyScanner,
} from "@/lib/order-flow/anomaly-scanner";
import {
  AdaptiveDcaEngine,
} from "@/lib/bot/adaptive-dca-engine";

describe("TradeAI - Advanced Institutional Features Suite", () => {
  /* ========================================================================
   * 1. SCANNER DE ANOMALIAS DE MERCADO E ORDER FLOW (RVOL 3-SIGMA & L2 BOOK)
   * ======================================================================== */
  describe("1. Scanner de Anomalias de Order Flow (RVOL & Absorção L2)", () => {
    let scanner: OrderFlowAnomalyScanner;

    beforeEach(() => {
      scanner = OrderFlowAnomalyScanner.getInstance();
      scanner.clearAlerts();
      scanner.updateConfig({
        volumeWindowSize: 10,
        sigmaThreshold: 3.0,
        imbalanceBuyThreshold: 0.70,
        imbalanceSellThreshold: 0.30,
        sustainDurationMs: 2000,
        depthLevels: 5,
      });
    });

    it("deve calcular média e desvio padrão e detectar picos de volume anômalo >= 3σ", () => {
      const symbol = "BTCUSDT";

      // Alimenta 10 períodos normais com volume médio em torno de 100 USDT
      const baselineVolumes = [95, 102, 98, 105, 100, 97, 103, 99, 101, 100];
      for (const vol of baselineVolumes) {
        const alert = scanner.processVolumeTick(symbol, vol);
        expect(alert).toBeNull();
      }

      // Alimenta um volume colossal repentino (+6σ)
      const spikeAlert = scanner.processVolumeTick(symbol, 450);
      expect(spikeAlert).not.toBeNull();
      expect(spikeAlert?.type).toBe("VOLUME_SPIKE_3SIGMA");
      expect(spikeAlert?.metrics.zScore).toBeGreaterThanOrEqual(3.0);
      expect(spikeAlert?.metrics.rvol).toBeGreaterThan(3.5);
      expect(spikeAlert?.severity).toBe("CRITICAL");
    });

    it("deve detectar desbalanceamento L2 superior a 70/30 quando sustentado no tempo", () => {
      const symbol = "ETHUSDT";
      const startTime = 10000;

      // 1. Livro com 80% de compradores (400 Bids vs 100 Asks) no instante inicial
      const alertInit = scanner.processOrderBook({
        symbol,
        bids: [
          { price: 3000, quantity: 100 },
          { price: 2999, quantity: 100 },
          { price: 2998, quantity: 100 },
          { price: 2997, quantity: 100 },
        ],
        asks: [
          { price: 3001, quantity: 50 },
          { price: 3002, quantity: 50 },
        ],
        timestamp: startTime,
      });

      // Não dispara imediatamente (precisa sustentar por sustainDurationMs = 2000ms)
      expect(alertInit).toBeNull();

      // 2. Livro continua fortemente comprador 2500ms depois (> 2000ms)
      const alertSustained = scanner.processOrderBook({
        symbol,
        bids: [
          { price: 3000.5, quantity: 120 },
          { price: 3000, quantity: 120 },
        ],
        asks: [
          { price: 3001, quantity: 40 },
          { price: 3002, quantity: 40 },
        ],
        timestamp: startTime + 2500,
      });

      expect(alertSustained).not.toBeNull();
      expect(alertSustained?.type).toBe("BOOK_IMBALANCE_BUY_DOMINANCE");
      expect(alertSustained?.metrics.imbalanceRatio).toBeGreaterThanOrEqual(0.70);
      expect(alertSustained?.metrics.sustainedDurationMs).toBeGreaterThanOrEqual(2000);
    });

    it("deve redefinir estado quando o livro de ofertas retornar ao equilíbrio", () => {
      const symbol = "SOLUSDT";
      const start = 5000;

      // Desbalanceamento vendedor inicial (85% sellers)
      scanner.processOrderBook({
        symbol,
        bids: [{ price: 150, quantity: 15 }],
        asks: [{ price: 151, quantity: 85 }],
        timestamp: start,
      });

      // Retorno ao equilíbrio (50/50)
      const neutralAlert = scanner.processOrderBook({
        symbol,
        bids: [{ price: 150, quantity: 50 }],
        asks: [{ price: 151, quantity: 50 }],
        timestamp: start + 1000,
      });

      expect(neutralAlert).toBeNull();
    });
  });

  /* ========================================================================
   * 2. NOTIFICAÇÕES REMOTAS E BOT TELEGRAM
   * ======================================================================== */
  describe("2. Notificações Remotas via Telegram Bot", () => {
    let tgService: TelegramNotificationService;

    beforeEach(() => {
      tgService = TelegramNotificationService.getInstance();
      tgService.updateConfig({
        botToken: "123456:mock_token",
        chatId: "987654321",
        enabled: true,
        notifyOnOrder: true,
        notifyOnTpSl: true,
        notifyOnKillSwitch: true,
        notifyDailyDigest: true,
        allowedChatIds: ["987654321"],
      });
    });

    it("deve formatar mensagens ricas de execução de ordem com risco", () => {
      let enqueuedText = "";
      const origEnqueue = tgService.enqueueMessage.bind(tgService);
      tgService.enqueueMessage = (text: string) => {
        enqueuedText = text;
      };

      tgService.notifyOrderExecution({
        symbol: "BTCUSDT",
        side: "BUY",
        price: 65420.5,
        quantity: 0.005,
        totalUsd: 327.1,
        mode: "live",
        strategy: "Momentum Breakout",
        riskPerTradePercent: 2.5,
        stopLossPrice: 64500.0,
        takeProfitPrice: 67500.0,
      });

      expect(enqueuedText).toContain("ORDEM EXECUTADA: BUY BTCUSDT");
      expect(enqueuedText).toContain("LIVE");
      expect(enqueuedText).toContain("$65420.5000");
      expect(enqueuedText).toContain("2.5% do NAV");

      tgService.enqueueMessage = origEnqueue;
    });

    it("deve formatar saída de trade com MAE e MFE e resultado em USD", () => {
      let exitMsg = "";
      tgService.enqueueMessage = (text: string) => {
        exitMsg = text;
      };

      tgService.notifyTradeExit({
        symbol: "SOLUSDT",
        side: "BUY",
        entryPrice: 140.0,
        exitPrice: 145.6,
        grossPnl: 5.6,
        netPnl: 5.31,
        gainPercent: 4.0,
        exitReason: "Take-Profit Dinâmico Parabólico",
        durationFormatted: "28m 14s",
        maePercent: -0.45,
        mfePercent: 4.8,
      });

      expect(exitMsg).toContain("*TAKE-PROFIT ATINGIDO (LUCRO)*: *SOLUSDT*");
      expect(exitMsg).toContain("+$5.3100 USD (+4.00%)");
      expect(exitMsg).toContain("• *MAE (Pior Excursão):* `-0.45%`");
      expect(exitMsg).toContain("• *MFE (Pico de Lucro):* `4.80%`");
      expect(exitMsg).toContain("28m 14s");
    });

    it("deve formatar alerta de emergência do Kill Switch", () => {
      let killMsg = "";
      tgService.enqueueMessage = (text: string) => {
        killMsg = text;
      };

      tgService.notifyEmergencyKillSwitch({
        reason: "Perda diária acumulada de 3.2% excedeu limite de 3.0%",
        dailyDrawdownPercent: 3.2,
        actionsTaken: "Todos os robôs foram pausados e posições fechadas.",
      });

      expect(killMsg).toContain("CIRCUIT BREAKER / KILL SWITCH ACIONADO!");
      expect(killMsg).toContain("• *Drawdown Diário:* `3.20%`");
    });
  });

  /* ========================================================================
   * 3. DIÁRIO DE TRADES AUTOMATIZADO (TRADE JOURNAL & MAE/MFE ANALYTICS)
   * ======================================================================== */
  describe("3. Diário de Trades Automatizado (MAE, MFE & Analytics)", () => {
    let journal: TradeJournalEngine;

    beforeEach(() => {
      journal = TradeJournalEngine.getInstance();
      journal.clearAllRecords();
    });

    it("deve registrar trade e calcular com precisão MAE (pior excursão) e MFE (melhor excursão)", () => {
      const record = journal.recordTrade({
        symbol: "BTCUSDT",
        side: "BUY",
        mode: "live",
        entryPrice: 60000,
        exitPrice: 62400, // +4.0%
        quantity: 0.1,
        lowestPrice: 59400,  // -1.0% pior queda
        highestPrice: 63000, // +5.0% melhor pico
        entryTimestampMs: 1700000000000,
        exitTimestampMs: 1700003600000, // 1 hora
        exitReason: "Take Profit Target",
        commissionRate: 0.001,
        spreadPercent: 0.04,
      });

      expect(record.maePercent).toBeCloseTo(-1.0, 1);
      expect(record.mfePercent).toBeCloseTo(5.0, 1);
      expect(record.gainPercent).toBeCloseTo(4.0, 1);
      expect(record.durationMinutes).toBe(60);
      expect(record.durationFormatted).toBe("1h 0m");

      // Verificação de comissão e spread
      // totalInvested = 6000, totalReturned = 6240, soma = 12240
      // commission (0.1%) = 12.24 USD
      // spreadCost (0.02%) = 2.448 USD
      // netPnl = 240 - (12.24 + 2.448) = 225.312 USD
      expect(record.netPnl).toBeLessThan(record.grossPnl);
      expect(record.netPnl).toBeCloseTo(225.31, 1);
    });

    it("deve calcular métricas agregadas de desempenho (Win Rate, Profit Factor, Sharpe)", () => {
      // Trade 1: Lucro de $100
      journal.recordTrade({
        symbol: "BTCUSDT",
        entryPrice: 100,
        exitPrice: 110,
        quantity: 10,
        highestPrice: 112,
        lowestPrice: 98,
        commissionRate: 0,
        spreadPercent: 0,
      });

      // Trade 2: Lucro de $50
      journal.recordTrade({
        symbol: "ETHUSDT",
        entryPrice: 200,
        exitPrice: 210,
        quantity: 5,
        highestPrice: 215,
        lowestPrice: 195,
        commissionRate: 0,
        spreadPercent: 0,
      });

      // Trade 3: Prejuízo de $30
      journal.recordTrade({
        symbol: "SOLUSDT",
        entryPrice: 50,
        exitPrice: 47,
        quantity: 10,
        highestPrice: 51,
        lowestPrice: 46,
        commissionRate: 0,
        spreadPercent: 0,
      });

      const metrics = journal.calculateMetrics(journal.getAllRecords(), 1000);

      expect(metrics.totalTrades).toBe(3);
      expect(metrics.winTrades).toBe(2);
      expect(metrics.lossTrades).toBe(1);
      expect(metrics.winRate).toBeCloseTo(66.7, 1);
      expect(metrics.totalNetPnl).toBeCloseTo(120, 1);
      // Profit Factor: Ganhos brutos (100 + 50) / Perdas brutas (30) = 5.0
      expect(metrics.profitFactor).toBeCloseTo(5.0, 1);
      expect(metrics.equityCurve.length).toBe(4); // Inicial + 3 trades
    });

    it("deve exportar registros em formato CSV com cabeçalhos e colunas corretas", () => {
      journal.recordTrade({
        symbol: "BTCUSDT",
        entryPrice: 60000,
        exitPrice: 61000,
        quantity: 0.1,
      });

      const csv = journal.exportToCsv();
      expect(csv).toContain("Symbol,Side,Mode");
      expect(csv).toContain('"BTCUSDT"');
      expect(csv).toContain("MAE %");
      expect(csv).toContain("MFE %");
    });
  });

  /* ========================================================================
   * 4. MOTOR DE REVERSÃO / DCA ADAPTATIVO COM FILTRO DE REGIME E TREND BRAKE
   * ======================================================================== */
  describe("4. Motor de Reversão / DCA Adaptativo (Dynamic ATR Grid & Trend Brake)", () => {
    let dcaEngine: AdaptiveDcaEngine;

    beforeEach(() => {
      dcaEngine = AdaptiveDcaEngine.getInstance();
      dcaEngine.updateConfig({
        maxLevels: 4,
        atrMultiplierStep: 1.5,
        baseAllocationUsd: 50,
        maxExposurePercent: 5.0, // Máx 5% de 1000 USD = $50 USD
        useTrendBrake: true,
        breakoutRvolThreshold: 2.0,
      });
    });

    it("deve calcular espaçamento de grade baseado em múltiplos dinâmicos do ATR", () => {
      const plan = dcaEngine.generateDynamicGrid({
        symbol: "BTCUSDT",
        entryPrice: 60000,
        atrValue: 300, // ATR de 300 USDT
        accountNavUsd: 5000, // 5% do NAV = 250 USD
        tickSize: 1,
        stepSize: 0.001,
      });

      expect(plan.levels.length).toBeGreaterThan(0);
      // Nível 1: atrMultiple = 1.5 -> priceDrop = 1.5 * 300 = 450 -> targetPrice = 59550
      expect(plan.levels[0].targetPrice).toBe(59550);
      expect(plan.levels[0].atrMultiple).toBe(1.5);

      // Nível 2: atrMultiple = 3.0 -> priceDrop = 3.0 * 300 = 900 -> targetPrice = 59100
      expect(plan.levels[1].targetPrice).toBe(59100);
      expect(plan.levels[1].atrMultiple).toBe(3.0);

      expect(plan.trendBrakeActive).toBe(false);
    });

    it("deve ativar Trend Brake e vetar ordens de grade contra rompimento violento abaixo da EMA 200", () => {
      const plan = dcaEngine.generateDynamicGrid({
        symbol: "ETHUSDT",
        entryPrice: 3000,
        atrValue: 25,
        accountNavUsd: 2000,
        macroContext: {
          symbol: "ETHUSDT",
          currentPrice: 2950,
          ema200Macro: 3100,
          macroRvol: 2.8, // RVOL > 2.0 (Volume agressivo na queda)
          isBearishBreakout: true,
          priceSlopePercent: -2.1,
        },
      });

      expect(plan.trendBrakeActive).toBe(true);
      expect(plan.trendBrakeReason).toContain("Rompimento baixista violento");
      // Todos os níveis devem ter sido vetados pela trava de tendência
      for (const level of plan.levels) {
        expect(level.status).toBe("VETOED_BY_TREND_BRAKE");
      }
    });

    it("deve respeitar estritamente o limite máximo de exposição do NAV da banca", () => {
      const nav = 1000; // 5% de 1000 = $50 USD
      const plan = dcaEngine.generateDynamicGrid({
        symbol: "SOLUSDT",
        entryPrice: 150,
        atrValue: 2,
        accountNavUsd: nav,
      });

      expect(plan.totalAllocatedUsd).toBeLessThanOrEqual(50.0);
    });
  });
});
