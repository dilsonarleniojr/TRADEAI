import { describe, expect, it } from "bun:test";
import { fetchFreeBalance } from "@/lib/binance/account";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

const base = {
  baseUrl: "https://testnet.binance.vision",
  apiKey: "k",
  apiSecret: "s",
  timestamp: 1,
  recvWindow: 10000,
};

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e: any) {
    return e.code;
  }
  return undefined;
}

describe("fetchFreeBalance — saldo livre com falha fechada", () => {
  it("devolve o saldo livre do ativo e assina a requisição", async () => {
    let calledUrl = "";
    const free = await fetchFreeBalance({
      ...base,
      asset: "BTC",
      fetchImpl: async (url) => {
        calledUrl = url;
        return json(200, { balances: [{ asset: "BTC", free: "0.01234", locked: "0" }] });
      },
    });
    expect(free).toBe(0.01234);
    expect(calledUrl).toContain("/api/v3/account?");
    expect(calledUrl).toContain("signature=");
  });

  it("ativo ausente com omitZeroBalances → saldo 0", async () => {
    const free = await fetchFreeBalance({ ...base, asset: "ETH", fetchImpl: async () => json(200, { balances: [] }) });
    expect(free).toBe(0);
  });

  it("HTTP de erro → BALANCE_UNAVAILABLE", async () => {
    const p = fetchFreeBalance({ ...base, asset: "BTC", fetchImpl: async () => json(401, { code: -2015 }) });
    expect(await codeOf(p)).toBe("BALANCE_UNAVAILABLE");
  });

  it("erro de rede → BALANCE_UNAVAILABLE", async () => {
    const p = fetchFreeBalance({ ...base, asset: "BTC", fetchImpl: async () => { throw new Error("timeout"); } });
    expect(await codeOf(p)).toBe("BALANCE_UNAVAILABLE");
  });

  it("resposta sem lista de saldos → BALANCE_UNAVAILABLE", async () => {
    const p = fetchFreeBalance({ ...base, asset: "BTC", fetchImpl: async () => json(200, {}) });
    expect(await codeOf(p)).toBe("BALANCE_UNAVAILABLE");
  });

  it("saldo inválido → BALANCE_UNAVAILABLE", async () => {
    const p = fetchFreeBalance({
      ...base,
      asset: "BTC",
      fetchImpl: async () => json(200, { balances: [{ asset: "BTC", free: "abc" }] }),
    });
    expect(await codeOf(p)).toBe("BALANCE_UNAVAILABLE");
  });
});
