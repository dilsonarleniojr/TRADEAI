import { evaluateEntry } from "../src/lib/bot/entry-engine";
import { getSymbolKlines } from "../src/lib/bot/kline-cache";
import { getOrderBookAnalysis } from "../src/lib/bot/order-book-cache";
import { DEFAULT_BOTS } from "../src/lib/store/botSlice";

async function inspectBots() {
  console.log("=========================================================================");
  console.log("   INSPEÇÃO DE DECISÃO DOS BOTS AO VIVO (POR QUE ESTÃO DEMORANDO?)       ");
  console.log("=========================================================================\n");

  // Buscar cotações reais da Binance
  const tickerRes = await fetch("https://api.binance.com/api/v3/ticker/24hr");
  const allTickers = await tickerRes.json();
  const tickerMap: Record<string, any> = {};
  allTickers.forEach((t: any) => {
    tickerMap[t.symbol] = {
      symbol: t.symbol,
      price: parseFloat(t.lastPrice),
      priceChangePercent: parseFloat(t.priceChangePercent),
      quoteVolume: parseFloat(t.quoteVolume),
      high: parseFloat(t.highPrice),
      low: parseFloat(t.lowPrice),
    };
  });

  const btcTicker = tickerMap["BTCUSDT"];

  for (const bot of DEFAULT_BOTS) {
    const symbol = bot.symbol === "AUTO" ? "SOLUSDT" : bot.symbol;
    console.log(`-------------------------------------------------------------------------`);
    console.log(`🤖 Bot: ${bot.name} | Par: ${symbol} | Estratégia: ${bot.strategy}`);
    console.log(`-------------------------------------------------------------------------`);

    const [klines1m, klines15m, orderBook] = await Promise.all([
      getSymbolKlines(symbol, "1m"),
      getSymbolKlines(symbol, "15m"),
      getOrderBookAnalysis(symbol, bot.maxSpreadPercent || 0.4, bot.minBidAskRatio || 0.5),
    ]);

    const ticker = tickerMap[symbol] || {
      symbol,
      price: klines1m[klines1m.length - 1]?.close || 100,
      priceChangePercent: 0,
      quoteVolume: 10000000,
    };

    const decision = evaluateEntry(bot, ticker, btcTicker, klines1m, [], klines15m, orderBook);

    console.log(`  Decisão: ${decision.shouldBuy ? "✅ COMPRAR IMEDIATAMENTE" : "❌ NÃO COMPRA NO MOMENTO"}`);
    console.log(`  Motivo Principal: ${decision.reason}`);
    console.log(`  Verificações Detalhadas:`);
    decision.checks.forEach((c) => {
      console.log(`    [${c.ok ? "✅ PASSOU" : "❌ BLOQUEOU"}] ${c.label}: ${c.detail}`);
    });
    console.log();
  }
}

inspectBots().catch(console.error);
