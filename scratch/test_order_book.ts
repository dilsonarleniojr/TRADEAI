import { getOrderBookAnalysis } from "../src/lib/bot/order-book-cache";

async function run() {
  console.log("=== TESTANDO MICROESTRUTURA E ORDER BOOK COM DADOS REAIS ===");
  const btc = await getOrderBookAnalysis("BTCUSDT");
  console.log("BTC Depth Analysis:", btc);

  const sol = await getOrderBookAnalysis("SOLUSDT");
  console.log("SOL Depth Analysis:", sol);

  const eth = await getOrderBookAnalysis("ETHUSDT");
  console.log("ETH Depth Analysis:", eth);
}

run().catch(console.error);
