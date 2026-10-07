// Test all 7 tools from Trade Hub API directly
import { POST } from "../src/app/api/ai/trade-hub/route";

async function runTests() {
  console.log("=== INICIANDO TESTE COMPLETO DOS 7 MÓDULOS DO TRADE HUB ===");

  const tools = [
    { tool: "trade_ideas", params: { category: "all" } },
    { tool: "technical_analyst", params: { symbol: "BTCUSDT" } },
    { tool: "news_to_trade", params: {} },
    { tool: "strategy_tester", params: { strategyName: "Crossover de Média Móvel (EMA 9/21)", symbol: "BTCUSDT", period: "Últimos 90 dias" } },
    { tool: "portfolio_risk", params: {} },
    { tool: "journal_analyzer", params: {} },
    { tool: "daily_plan", params: { primarySymbol: "BTCUSDT", traderStyle: "Day Trader" } },
  ];

  for (const item of tools) {
    console.log(`\nTesting tool: ${item.tool}...`);
    const req = new Request("http://localhost:3000/api/ai/trade-hub", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });

    const res = await POST(req);
    const json = await res.json();
    console.log(`Result for ${item.tool}: status=${res.status}, success=${json.success}`);
    if (!json.success) {
      console.error(`ERROR on ${item.tool}:`, json.error);
      process.exit(1);
    }
  }

  console.log("\n=== TODOS OS 7 MÓDULOS PASSARAM COM SUCESSO! ===");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
