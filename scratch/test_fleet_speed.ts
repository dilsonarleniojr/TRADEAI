import { scanHotCoins } from "../src/lib/bot/quant-engine";
import { evaluateEntry } from "../src/lib/bot/entry-engine";
import { getSymbolKlines } from "../src/lib/bot/kline-cache";
import { DEFAULT_BOTS } from "../src/lib/store/botSlice";

async function test() {
  console.log("Buscando 24hr tickers na Binance...");
  const tickerRes = await fetch("https://api.binance.com/api/v3/ticker/24hr");
  const allTickers = await tickerRes.json();
  const tickerMap: Record<string, any> = {};
  allTickers.forEach((t: any) => {
    tickerMap[t.symbol] = {
      symbol: t.symbol,
      price: parseFloat(t.lastPrice),
      priceChangePercent: parseFloat(t.priceChangePercent),
      quoteVolume: parseFloat(t.quoteVolume),
    };
  });
  const candidates = scanHotCoins(tickerMap, tickerMap["BTCUSDT"], 12);
  console.log("Top Hot Coins encontradas:", candidates.map(c => `${c.symbol} (+${c.priceChangePercent.toFixed(1)}%)`).join(", "));
  
  const bot = DEFAULT_BOTS.find(b => b.useAutoScreener || b.symbol === "AUTO")!;
  for (const cand of candidates) {
    const k1m = await getSymbolKlines(cand.symbol, "1m");
    const k15m = await getSymbolKlines(cand.symbol, "15m");
    const decision = evaluateEntry(bot, tickerMap[cand.symbol], tickerMap["BTCUSDT"], k1m, [], k15m);
    console.log(`Cand: ${cand.symbol} -> shouldBuy: ${decision.shouldBuy} | Reason: ${decision.reason}`);
    if (decision.shouldBuy) {
      console.log(`>>> GATILHO COMPRA EM ${cand.symbol}!`);
      break;
    }
  }
}
test().catch(console.error);
