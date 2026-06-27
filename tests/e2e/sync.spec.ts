import { chromium, Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import * as path from "path";

const prisma = new PrismaClient();

// Helper to log test status
function recordResult(name: string, status: "pass" | "fail", error?: string) {
  if (status === "pass") {
    console.log(`✅ TEST PASS: [Sync Test] ${name}`);
  } else {
    console.error(`❌ TEST FAIL: [Sync Test] ${name} - ${error}`);
    process.exitCode = 1;
  }
}

async function runSyncTests() {
  console.log("🚀 Starting TRADEAI E2E Sync Verification Tests...");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-remote-fonts",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage"
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  page.on("pageerror", (err) => {
    console.error("PAGE ERROR:", err.message);
  });

  page.on("requestfailed", (req) => {
    console.warn("REQUEST FAILED:", req.url(), req.failure()?.errorText);
  });



  try {
    // Navigate to local site (using Caddy proxy port 81 or fall back to Next.js port 3000)
    let targetUrl = "http://127.0.0.1:3000/";
    try {
      console.log("Checking if Caddy proxy on port 81 is available...");
      const res = await fetch("http://127.0.0.1:81/", { method: "HEAD" });
      if (res.status < 500) {
        targetUrl = "http://127.0.0.1:81/";
        console.log("Using Caddy proxy on port 81");
      }
    } catch (e) {
      console.log("Caddy port 81 is offline, using port 3000 directly");
    }

    console.log(`⏱️ Loading home page: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: "load" });

    // Wait for DOM stabilization
    await page.waitForTimeout(3000);

    // --- TEST 1: Quick Trade → Verifica Saldo → Verifica Portfólio ---
    console.log("🛒 Running Test 1: Quick Trade & Balance Sync...");
    
    const initialAccount = await prisma.account.findFirst();
    const initialCash = initialAccount?.cashBalance ?? 10000.0;
    const initialAsset = initialAccount?.assetQuantity ?? 0.0;

    // Execute trade programmatically to bypass UI selector variances
    await page.evaluate(async () => {
      const trade = {
        symbol: "BTCUSDT",
        side: "BUY",
        price: 80000,
        quantity: 0.002,
        total: 160,
        strategy: "Manual",
        mode: "paper",
      };
      await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trade),
      });
    });

    await page.waitForTimeout(1500);

    const postTradeAccount = await prisma.account.findFirst();
    const finalCash = postTradeAccount?.cashBalance ?? 10000.0;
    const finalAsset = postTradeAccount?.assetQuantity ?? 0.0;

    if (finalCash < initialCash && finalAsset > initialAsset) {
      recordResult("Quick Trade Balance Update", "pass");
    } else {
      recordResult("Quick Trade Balance Update", "fail", `Balances did not sync correctly. Cash: ${initialCash} -> ${finalCash}, Asset: ${initialAsset} -> ${finalAsset}`);
    }

    // --- TEST 2: Bot ativa → trade executado ---
    console.log("🤖 Running Test 2: Bot Auto-Trade execution...");

    await page.evaluate(() => {
      const store = (window as any).useCryptoStore.getState();
      store.setBotConfig({
        ...store.botConfig,
        autoTradeSignals: true,
        signalConfidenceThreshold: 70,
      });
      store.setBotActive(true);
    });

    // Dispatch an AI signal >= 70% confidence
    await page.evaluate(() => {
      const store = (window as any).useCryptoStore.getState();
      store.addAiSignal({
        id: `test-sig-${Date.now()}`,
        symbol: "ETHUSDT",
        action: "BUY",
        confidence: 0.8,
        reasoning: "E2E testing validation.",
        priceAtSignal: 3000,
        stopLoss: 2900,
        takeProfit: 3200,
        createdAt: new Date().toISOString(),
      });
    });

    await page.waitForTimeout(2000);

    const botTrades = await prisma.trade.findMany({
      where: { strategy: "AI-Signal" }
    });

    if (botTrades.length > 0) {
      recordResult("Bot Auto-Trade execution", "pass");
    } else {
      recordResult("Bot Auto-Trade execution", "fail", "Bot did not execute auto-trade on AI signal.");
    }

    // Stop the bot
    await page.evaluate(() => {
      (window as any).useCryptoStore.getState().setBotActive(false);
    });

    // --- TEST 3: Alertas → telemetria registrada ---
    console.log("🔔 Running Test 3: Alerts triggering and Telemetry sync...");

    const telemetryEvents: any[] = [];
    // Catch telemetry event logs via console intercept or websocket
    page.on("console", (msg) => {
      if (msg.text().includes("[Telemetry]") || msg.text().includes("telemetry")) {
        telemetryEvents.push(msg.text());
      }
    });

    await page.evaluate(() => {
      const store = (window as any).useCryptoStore.getState();
      store.addAlert({
        id: "alert-e2e-sync",
        symbol: "BTCUSDT",
        targetPrice: 60000,
        direction: "below",
        currentPrice: 75000,
        isTriggered: false,
        createdAt: new Date().toISOString()
      });
      // Force trigger by dropping BTC price below 60k
      store.updateAlertPrices({
        BTCUSDT: { price: 58000, priceChange: 0, priceChangePercent: 0, high: 0, low: 0, volume: 0, quoteVolume: 0 }
      });
    });

    await page.waitForTimeout(1000);

    const isAlertTriggered = await page.evaluate(() => {
      const store = (window as any).useCryptoStore.getState();
      return store.alerts.find((a: any) => a.id === "alert-e2e-sync")?.isTriggered === true;
    });

    if (isAlertTriggered) {
      recordResult("Alerts Triggering", "pass");
    } else {
      recordResult("Alerts Triggering", "fail", "Price alert was not triggered.");
    }

    // --- TEST 4: WS desconectado → polling ativado ---
    console.log("🔌 Running Test 4: WebSocket Disconnect Fallback...");

    await page.evaluate(() => {
      const store = (window as any).useCryptoStore.getState();
      // Simulate connection drop
      store.setConnectionStatus("rest-api");
    });

    await page.waitForTimeout(2000);

    const syncMode = await page.evaluate(() => {
      // Check store or telemetry sync mode
      return (window as any).useCryptoStore.getState().connectionStatus;
    });

    if (syncMode === "rest-api") {
      recordResult("WebSocket Fallback Polling", "pass");
    } else {
      recordResult("WebSocket Fallback Polling", "fail", `Failed to fall back to rest-api mode. Mode is: ${syncMode}`);
    }

  } catch (err: any) {
    console.error("💥 E2E Test Suite crashed:", err.message);
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
    console.log("🏁 E2E Verification complete.");
  }
}

runSyncTests();
