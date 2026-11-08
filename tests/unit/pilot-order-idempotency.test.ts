import { describe, expect, it, afterEach } from "bun:test";
import { PilotOrderExecutor } from "@/lib/bot/pilot/pilot-order-executor";

type Call = { url: string; method: string };
const realFetch = globalThis.fetch;
let calls: Call[] = [];

/** POST /api/v3/order responde conforme `post`; GET /api/v3/order (consulta) conforme `query`. */
function installFetch(post: () => Response, query: () => Response) {
  calls = [];
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";
    calls.push({ url, method });
    if (url.includes("/api/v3/time")) return new Response(JSON.stringify({ serverTime: Date.now() }), { status: 200 });
    if (url.includes("/api/v3/account")) {
      return new Response(JSON.stringify({ balances: [{ asset: "USDT", free: "1000" }, { asset: "BTC", free: "1" }] }), { status: 200 });
    }
    if (url.includes("/api/v3/order")) return method === "POST" ? post() : query();
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

const filters = { quoteAsset: "USDT", stepSize: 0.00001, tickSize: 0.01, minQty: 0.00001, minNotional: 5 } as any;
const credentials = { apiKey: "k", apiSecret: "s", testnet: true };
const filled = (side: string) =>
  new Response(
    JSON.stringify({ orderId: 42, clientOrderId: "tai-x", symbol: "BTCUSDT", side, status: "FILLED", executedQty: "0.001", cummulativeQuoteQty: "65" }),
    { status: 200 }
  );
const posts = () => calls.filter((c) => c.method === "POST" && c.url.includes("/api/v3/order"));

describe("PilotOrderExecutor — envio idempotente", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("compra envia newClientOrderId", async () => {
    installFetch(() => filled("BUY"), () => filled("BUY"));
    const r = await PilotOrderExecutor.getInstance().executeLiveBuy({ symbol: "BTCUSDT", notionalUsd: 65, filters, credentials });
    expect(posts()).toHaveLength(1);
    expect(posts()[0].url).toContain("newClientOrderId=");
    expect(r.orderId).toBe(42);
  });

  it("compra com 5xx não reenvia e recupera a ordem executada", async () => {
    installFetch(() => new Response("{}", { status: 503 }), () => filled("BUY"));
    const r = await PilotOrderExecutor.getInstance().executeLiveBuy({ symbol: "BTCUSDT", notionalUsd: 65, filters, credentials });
    expect(posts()).toHaveLength(1);
    expect(calls.some((c) => c.method === "GET" && c.url.includes("origClientOrderId="))).toBe(true);
    expect(r.status).toBe("FILLED");
    expect(r.executedQty).toBe(0.001);
  });

  it("venda com timeout não reenvia e recupera a ordem executada", async () => {
    installFetch(() => { throw new Error("The operation timed out"); }, () => filled("SELL"));
    const r = await PilotOrderExecutor.getInstance().executeLiveSell({
      symbol: "BTCUSDT", baseAsset: "BTC", quantity: 0.001, filters, credentials,
    });
    expect(posts()).toHaveLength(1);
    expect(r.orderId).toBe(42);
  });

  it("status desconhecido vira erro explícito, sem reenvio", async () => {
    installFetch(() => new Response("{}", { status: 500 }), () => { throw new Error("rede"); });
    let code: string | undefined;
    try {
      await PilotOrderExecutor.getInstance().executeLiveBuy({ symbol: "BTCUSDT", notionalUsd: 65, filters, credentials });
    } catch (e: any) {
      code = e.code;
    }
    expect(code).toBe("ORDER_STATUS_UNKNOWN");
    expect(posts()).toHaveLength(1);
  });

  it("erro 4xx mantém a mensagem tratada do executor", async () => {
    installFetch(() => new Response(JSON.stringify({ code: -2010, msg: "insufficient" }), { status: 400 }), () => filled("BUY"));
    await expect(
      PilotOrderExecutor.getInstance().executeLiveBuy({ symbol: "BTCUSDT", notionalUsd: 65, filters, credentials })
    ).rejects.toThrow(/Saldo insuficiente.*-2010/);
  });
});
