import { describe, expect, it, beforeEach } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { BINANCE_RECV_WINDOW_MS, getBinanceTimestamp, resetBinanceTimeSync } from "@/lib/binance/time";

const BASE = "https://testnet.binance.vision";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("recvWindow", () => {
  it("fica no máximo em 10 s (doc oficial recomenda ≤ 5 s; máximo 60 s)", () => {
    expect(BINANCE_RECV_WINDOW_MS).toBeGreaterThan(0);
    expect(BINANCE_RECV_WINDOW_MS).toBeLessThanOrEqual(10000);
  });

  it("nenhum arquivo em src/ usa recvWindow=60000", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && /recvWindow(=|:\s*)60000/.test(readFileSync(p, "utf8"))) hits.push(p);
      }
    };
    walk(join(import.meta.dir, "../../src"));
    expect(hits).toEqual([]);
  });
});

describe("getBinanceTimestamp — relógio sincronizado com a Binance", () => {
  beforeEach(() => resetBinanceTimeSync());

  it("aplica o offset do serverTime", async () => {
    const ts = await getBinanceTimestamp(BASE, async () => json(200, { serverTime: 1_000_500 }), () => 1_000_000);
    expect(ts).toBe(1_000_500);
  });

  it("reaproveita o offset sem nova consulta dentro de 30 min", async () => {
    let calls = 0;
    const f = async () => { calls++; return json(200, { serverTime: 2_000 }); };
    await getBinanceTimestamp(BASE, f, () => 1_000);
    const ts = await getBinanceTimestamp(BASE, f, () => 61_000);
    expect(calls).toBe(1);
    expect(ts).toBe(62_000);
  });

  it("ressincroniza após 30 min", async () => {
    let calls = 0;
    const f = async () => { calls++; return json(200, { serverTime: 0 }); };
    await getBinanceTimestamp(BASE, f, () => 1_000);
    await getBinanceTimestamp(BASE, f, () => 1_000 + 30 * 60 * 1000 + 1);
    expect(calls).toBe(2);
  });

  it("falha na consulta sem offset anterior → relógio local", async () => {
    const ts = await getBinanceTimestamp(BASE, async () => { throw new Error("x"); }, () => 5_000);
    expect(ts).toBe(5_000);
  });

  it("falha na consulta com offset anterior → mantém o offset", async () => {
    await getBinanceTimestamp(BASE, async () => json(200, { serverTime: 1_300 }), () => 1_000);
    const ts = await getBinanceTimestamp(BASE, async () => json(500, {}), () => 1_000 + 31 * 60 * 1000);
    expect(ts).toBe(1_000 + 31 * 60 * 1000 + 300);
  });

  it("offsets separados por ambiente (produção × testnet)", async () => {
    await getBinanceTimestamp(BASE, async () => json(200, { serverTime: 1_100 }), () => 1_000);
    const prod = await getBinanceTimestamp("https://api.binance.com", async () => json(200, { serverTime: 900 }), () => 1_000);
    expect(prod).toBe(900);
  });
});
