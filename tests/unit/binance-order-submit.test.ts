import { describe, expect, it } from "bun:test";
import { submitSpotOrder, generateClientOrderId } from "@/lib/binance/order-submit";

type Call = { url: string; method: string };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function mockFetch(handlers: Array<(url: string, init?: RequestInit) => Response | Promise<Response>>) {
  const calls: Call[] = [];
  let i = 0;
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method || "GET" });
    const h = handlers[Math.min(i++, handlers.length - 1)];
    return h(url, init);
  };
  return { fn, calls };
}

const base = {
  baseUrl: "https://testnet.binance.vision",
  symbol: "BTCUSDT",
  queryString: "symbol=BTCUSDT&side=BUY&type=MARKET&quoteOrderQty=10.00&timestamp=1&recvWindow=10000",
  apiKey: "k",
  apiSecret: "s",
  getTimestamp: async () => 2,
};

const posts = (calls: Call[]) => calls.filter((c) => c.method === "POST");

describe("submitSpotOrder — envio idempotente de ordens", () => {
  it("gera clientOrderId no formato aceito e diferente a cada ordem", () => {
    const a = generateClientOrderId();
    const b = generateClientOrderId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{1,36}$/);
  });

  it("envia newClientOrderId junto com a ordem", async () => {
    const { fn, calls } = mockFetch([() => json(200, { orderId: 1, status: "FILLED" })]);
    const res = await submitSpotOrder({ ...base, fetchImpl: fn });
    expect(res.ok).toBe(true);
    expect(posts(calls)).toHaveLength(1);
    expect(calls[0].url).toContain("newClientOrderId=");
  });

  it("não reenvia a ordem após 5xx e recupera a ordem executada pelo clientOrderId", async () => {
    const { fn, calls } = mockFetch([
      () => json(503, { code: -1001, msg: "Internal error" }),
      () => json(200, { orderId: 7, status: "FILLED", executedQty: "0.001", cummulativeQuoteQty: "10" }),
    ]);
    const res = await submitSpotOrder({ ...base, fetchImpl: fn });
    expect(posts(calls)).toHaveLength(1);
    expect(calls[1].method).toBe("GET");
    expect(calls[1].url).toContain("origClientOrderId=");
    expect(res.ok).toBe(true);
    expect((await res.json()).orderId).toBe(7);
  });

  it("não reenvia a ordem após erro de rede (timeout)", async () => {
    const { fn, calls } = mockFetch([
      () => { throw new Error("The operation timed out"); },
      () => json(200, { orderId: 8, status: "FILLED" }),
    ]);
    const res = await submitSpotOrder({ ...base, fetchImpl: fn });
    expect(posts(calls)).toHaveLength(1);
    expect((await res.json()).orderId).toBe(8);
  });

  it("quando a ordem não existe (-2013), falha sem reenviar", async () => {
    const { fn, calls } = mockFetch([
      () => json(502, {}),
      () => json(400, { code: -2013, msg: "Order does not exist." }),
    ]);
    await expect(submitSpotOrder({ ...base, fetchImpl: fn })).rejects.toThrow(/não foi executada/);
    expect(posts(calls)).toHaveLength(1);
  });

  it("quando a consulta também falha, sinaliza status desconhecido", async () => {
    const { fn, calls } = mockFetch([
      () => json(500, {}),
      () => { throw new Error("network down"); },
    ]);
    try {
      await submitSpotOrder({ ...base, fetchImpl: fn });
      throw new Error("deveria ter falhado");
    } catch (err: any) {
      expect(err.code).toBe("ORDER_STATUS_UNKNOWN");
      expect(err.message).toMatch(/DESCONHECIDO/);
    }
    expect(posts(calls)).toHaveLength(1);
  });

  it("devolve erros 4xx sem consultar nem reenviar (tratamento fica com quem chamou)", async () => {
    const { fn, calls } = mockFetch([() => json(400, { code: -2010, msg: "Account has insufficient balance" })]);
    const res = await submitSpotOrder({ ...base, fetchImpl: fn });
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(1);
  });

  it("não repete em 429 (limite de requisições)", async () => {
    const { fn, calls } = mockFetch([() => json(429, { code: -1003, msg: "Too many requests" })]);
    const res = await submitSpotOrder({ ...base, fetchImpl: fn });
    expect(res.status).toBe(429);
    expect(calls).toHaveLength(1);
  });
});
