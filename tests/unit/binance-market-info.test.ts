import { describe, expect, it } from "bun:test";
import { fetchSymbolFilters, fetchCurrentPrice } from "@/lib/binance/market-info";

const BASE = "https://testnet.binance.vision";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

const fullInfo = {
  symbols: [
    {
      symbol: "BTCUSDT",
      quoteOrderQtyMarketAllowed: true,
      filters: [
        { filterType: "PRICE_FILTER", tickSize: "0.01000000" },
        { filterType: "LOT_SIZE", stepSize: "0.00001000", minQty: "0.00001000" },
        { filterType: "NOTIONAL", minNotional: "5.00000000" },
      ],
    },
  ],
};

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e: any) {
    return e.code;
  }
  return undefined;
}

describe("fetchSymbolFilters — falha fechada sem filtros reais", () => {
  it("lê LOT_SIZE, PRICE_FILTER e NOTIONAL", async () => {
    const f = await fetchSymbolFilters(BASE, "BTCUSDT", async () => json(200, fullInfo));
    expect(f).toEqual({ stepSize: 0.00001, minQty: 0.00001, tickSize: 0.01, minNotional: 5, quoteOrderQtyAllowed: true });
  });

  it("aceita MIN_NOTIONAL (formato antigo)", async () => {
    const info = structuredClone(fullInfo);
    info.symbols[0].filters[2] = { filterType: "MIN_NOTIONAL", minNotional: "10" } as any;
    const f = await fetchSymbolFilters(BASE, "BTCUSDT", async () => json(200, info));
    expect(f.minNotional).toBe(10);
  });

  it("erro de rede → FILTERS_UNAVAILABLE", async () => {
    const fail = async () => { throw new Error("timeout"); };
    expect(await codeOf(fetchSymbolFilters(BASE, "BTCUSDT", fail))).toBe("FILTERS_UNAVAILABLE");
  });

  it("HTTP de erro → FILTERS_UNAVAILABLE", async () => {
    expect(await codeOf(fetchSymbolFilters(BASE, "BTCUSDT", async () => json(503, {})))).toBe("FILTERS_UNAVAILABLE");
  });

  it("símbolo ausente na resposta → FILTERS_UNAVAILABLE", async () => {
    expect(await codeOf(fetchSymbolFilters(BASE, "BTCUSDT", async () => json(200, { symbols: [] })))).toBe("FILTERS_UNAVAILABLE");
  });

  it("sem LOT_SIZE ou PRICE_FILTER → FILTERS_UNAVAILABLE", async () => {
    const noLot = structuredClone(fullInfo);
    noLot.symbols[0].filters = noLot.symbols[0].filters.filter((f) => f.filterType !== "LOT_SIZE");
    expect(await codeOf(fetchSymbolFilters(BASE, "BTCUSDT", async () => json(200, noLot)))).toBe("FILTERS_UNAVAILABLE");

    const noPrice = structuredClone(fullInfo);
    noPrice.symbols[0].filters = noPrice.symbols[0].filters.filter((f) => f.filterType !== "PRICE_FILTER");
    expect(await codeOf(fetchSymbolFilters(BASE, "BTCUSDT", async () => json(200, noPrice)))).toBe("FILTERS_UNAVAILABLE");
  });

  it("stepSize zero/inválido → FILTERS_UNAVAILABLE", async () => {
    const bad = structuredClone(fullInfo);
    (bad.symbols[0].filters[1] as any).stepSize = "0";
    expect(await codeOf(fetchSymbolFilters(BASE, "BTCUSDT", async () => json(200, bad)))).toBe("FILTERS_UNAVAILABLE");
  });
});

describe("fetchCurrentPrice — falha fechada sem preço", () => {
  it("devolve o preço", async () => {
    expect(await fetchCurrentPrice(BASE, "BTCUSDT", async () => json(200, { price: "65000.12" }))).toBe(65000.12);
  });

  it("erro de rede, HTTP de erro ou preço inválido → PRICE_UNAVAILABLE", async () => {
    expect(await codeOf(fetchCurrentPrice(BASE, "BTCUSDT", async () => { throw new Error("x"); }))).toBe("PRICE_UNAVAILABLE");
    expect(await codeOf(fetchCurrentPrice(BASE, "BTCUSDT", async () => json(500, {})))).toBe("PRICE_UNAVAILABLE");
    expect(await codeOf(fetchCurrentPrice(BASE, "BTCUSDT", async () => json(200, { price: "0" })))).toBe("PRICE_UNAVAILABLE");
    expect(await codeOf(fetchCurrentPrice(BASE, "BTCUSDT", async () => json(200, {})))).toBe("PRICE_UNAVAILABLE");
  });
});
