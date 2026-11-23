import { describe, expect, it } from "bun:test";
import fs from "fs";
import path from "path";
import { useCryptoStore } from "@/lib/store";
import nextConfig from "../../next.config";

const ROOT = path.resolve(import.meta.dir, "../..");

describe("QA — Correções Médias e Baixas (Web TradeAI)", () => {
  it("1. applyRealtimeFrameBatch executa 1 única notificação Zustand e evita clone quando sem mudanças", () => {
    const store = useCryptoStore.getState();

    // Prepara um bot com posição aberta para validar atualização conjunta no mesmo frame
    store.setBots([
      {
        id: "qa-bot-1",
        name: "QA Bot",
        symbol: "BTCUSDT",
        strategy: "AI",
        active: true,
        status: "running",
        config: {} as any,
        stats: {
          totalTrades: 0,
          buyTrades: 0,
          sellTrades: 0,
          winTrades: 0,
          lossTrades: 0,
          winRate: 0,
          realizedPnl: 0,
          lastAction: "idle",
          lastActionTime: new Date().toISOString(),
        },
        position: {
          symbol: "BTCUSDT",
          quantity: 0.5,
          entryPrice: 60000,
          currentPrice: 60000,
          highestPrice: 60000,
          lowestPrice: 60000,
          unrealizedPnl: 0,
          unrealizedPnlPercent: 0,
          openedAt: new Date().toISOString(),
        },
      } as any,
    ]);

    let notifyCount = 0;
    const unsubscribe = useCryptoStore.subscribe(() => {
      notifyCount++;
    });

    const batch1 = {
      BTCUSDT: {
        symbol: "BTCUSDT",
        price: 61000,
        priceChange: 1000,
        priceChangePercent: 1.67,
        high: 61500,
        low: 59500,
        volume: 1000,
        quoteVolume: 60000000,
        bidPrice: 60995,
        askPrice: 61005,
      },
    };

    useCryptoStore.getState().applyRealtimeFrameBatch(batch1);
    expect(notifyCount).toBe(1);

    const stateAfterFirst = useCryptoStore.getState();
    expect(stateAfterFirst.tickers.BTCUSDT?.price).toBe(61000);
    expect(stateAfterFirst.bots[0]?.position?.currentPrice).toBe(61000);
    expect(stateAfterFirst.bots[0]?.position?.unrealizedPnl).toBe(500);

    // Segunda chamada com os mesmos valores não deve notificar nem clonar state.tickers
    const tickersRefBefore = stateAfterFirst.tickers;
    useCryptoStore.getState().applyRealtimeFrameBatch(batch1);
    expect(notifyCount).toBe(1);
    expect(useCryptoStore.getState().tickers).toBe(tickersRefBefore);

    unsubscribe();
  });

  it("2. Worker de indicadores suporta ichimoku/bollinger/vwap/ema_ribbon e CandlestickChart usa singleton persistente", async () => {
    // Valida worker diretamente simulando self.postMessage
    const posted: any[] = [];
    const origSelf = (globalThis as any).self;
    (globalThis as any).self = {
      postMessage: (msg: any) => posted.push(msg),
      onmessage: null,
    };

    await import("../../src/workers/indicators.worker");
    const handler = (globalThis as any).self.onmessage;
    expect(typeof handler).toBe("function");

    const prices = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5);
    const highs = prices.map((p) => p + 2);
    const lows = prices.map((p) => p - 2);

    handler({ data: { id: 1, type: "bollinger", payload: { prices, period: 20, multiplier: 2 } } });
    handler({ data: { id: 2, type: "ichimoku", payload: { highs, lows } } });

    expect(posted.length).toBe(2);
    expect(posted[0]).toMatchObject({ id: 1, success: true });
    expect(posted[0].result.upper.length).toBe(60);
    expect(posted[1]).toMatchObject({ id: 2, success: true });
    expect(posted[1].result.tenkanSen.length).toBe(60);
    expect(posted[1].result.senkouSpanB.length).toBe(60);

    (globalThis as any).self = origSelf;

    // Confirma no código que CandlestickChart não usa worker.terminate() por chamada e cancela gerações obsoletas
    const chartSrc = fs.readFileSync(path.join(ROOT, "src/components/chart/candlestick-chart.tsx"), "utf8");
    expect(chartSrc).toContain("sharedIndicatorsWorker");
    expect(chartSrc).toContain("cancelPendingIndicatorTasks");
    expect(chartSrc).toContain("terminateIndicatorsWorkerSingleton");
    expect(chartSrc).not.toContain("const worker = new Worker(new URL(\"../../workers/indicators.worker.ts\"");
  });

  it("3. Modal de confirmação Live em MarketView exibe spread, slippage, taxa e alerta > 0,35%", () => {
    const marketViewSrc = fs.readFileSync(path.join(ROOT, "src/components/v2/market-view.tsx"), "utf8");
    expect(marketViewSrc).toContain("Spread atual");
    expect(marketViewSrc).toContain("Slippage estimado (MARKET)");
    expect(marketViewSrc).toContain("Taxa estimada (Taker 0,10% padrão)");
    expect(marketViewSrc).toContain("spreadPct > 0.35");
    expect(marketViewSrc).toContain("Spread acima de 0,35%");
  });

  it("4. next.config.ts tem reactStrictMode: true e sem typescript.ignoreBuildErrors", () => {
    expect(nextConfig.reactStrictMode).toBe(true);
    expect((nextConfig as any).typescript?.ignoreBuildErrors).toBeUndefined();
  });

  it("5. Logs financeiros restritos a development e apiKey inicial vazia em SettingsScreen", () => {
    const streamSrc = fs.readFileSync(path.join(ROOT, "src/hooks/use-binance-stream.ts"), "utf8");
    expect(streamSrc).toContain('if (process.env.NODE_ENV === "development")');

    const settingsSrc = fs.readFileSync(
      path.join(ROOT, "src/components/smart-trading/screens/settings-screen.tsx"),
      "utf8"
    );
    expect(settingsSrc).toContain("const [apiKey, setApiKey] = useState('')");
    expect(settingsSrc).not.toContain("vm208349028490284092840928409284029482");
  });
});
