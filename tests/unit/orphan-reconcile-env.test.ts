import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { DirectOperationManager } from "@/lib/bot/pilot/direct-operation-manager";
import { resetBinanceTimeSync } from "@/lib/binance/time";

type Call = { url: string; method: string };

const realFetch = globalThis.fetch;
let calls: Call[] = [];

function installFetch(cancelStatus = 200) {
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method || "GET" });
    if (url.includes("/api/v3/time")) {
      return new Response(JSON.stringify({ serverTime: Date.now() }), { status: 200 });
    }
    if (cancelStatus !== 200) {
      return new Response(JSON.stringify({ code: -2011, msg: "Unknown order sent." }), { status: cancelStatus });
    }
    return new Response(JSON.stringify([{ orderId: 1 }, { orderId: 2 }]), { status: 200 });
  }) as typeof fetch;
}

const deletes = () => calls.filter((c) => c.method === "DELETE");

describe("reconcileOrphanOrders — ambiente correto e requisição assinada válida", () => {
  beforeEach(() => {
    calls = [];
    resetBinanceTimeSync();
    DirectOperationManager.clearCooldownHistory();
    DirectOperationManager.recordSymbolExecution("BTCUSDT");
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    DirectOperationManager.clearCooldownHistory();
  });

  it("com credencial de testnet cancela na testnet, nunca na produção", async () => {
    installFetch();
    const res = await DirectOperationManager.reconcileOrphanOrders({ apiKey: "k", apiSecret: "s", testnet: true });
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0].url.startsWith("https://testnet.binance.vision/api/v3/openOrders?")).toBe(true);
    expect(calls.some((c) => c.url.includes("api.binance.com"))).toBe(false);
    expect(res.cancelledOrdersCount).toBe(2);
  });

  it("com credencial de produção usa api.binance.com", async () => {
    installFetch();
    await DirectOperationManager.reconcileOrphanOrders({ apiKey: "k", apiSecret: "s", testnet: false });
    expect(deletes()[0].url.startsWith("https://api.binance.com/api/v3/openOrders?")).toBe(true);
  });

  it("envia recvWindow e timestamp sincronizado", async () => {
    installFetch();
    await DirectOperationManager.reconcileOrphanOrders({ apiKey: "k", apiSecret: "s", testnet: true });
    expect(deletes()[0].url).toMatch(/recvWindow=\d+/);
    expect(calls.some((c) => c.url === "https://testnet.binance.vision/api/v3/time")).toBe(true);
  });

  it("falha no cancelamento é reportada, não engolida", async () => {
    installFetch(400);
    const res = await DirectOperationManager.reconcileOrphanOrders({ apiKey: "k", apiSecret: "s", testnet: true });
    expect(res.cancelledOrdersCount).toBe(0);
    expect(res.errors?.length).toBe(1);
    expect(res.errors?.[0]).toContain("BTCUSDT");
  });
});
