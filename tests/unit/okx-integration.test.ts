import { describe, expect, it, mock } from "bun:test";
import {
  toOkxInstrument,
  fromOkxInstrument,
  signOkxHeaders,
  executeOkxOrder,
  fetchOkxAccount,
  formatOkxStep,
  formatOkxTimestamp,
} from "@/lib/okx/okx-client";

describe("OKX v5 Integration & Symbol Normalization", () => {
  it("converte símbolos Spot Binance para o formato OKX com hífen", () => {
    expect(toOkxInstrument("BTCUSDT")).toBe("BTC-USDT");
    expect(toOkxInstrument("ETHUSDT")).toBe("ETH-USDT");
    expect(toOkxInstrument("SOLUSDT")).toBe("SOL-USDT");
    expect(toOkxInstrument("BTC-USDT")).toBe("BTC-USDT");
  });

  it("converte instrumentos OKX para formato canônico do TradeAI", () => {
    expect(fromOkxInstrument("BTC-USDT")).toBe("BTCUSDT");
    expect(fromOkxInstrument("ETH-USDT")).toBe("ETHUSDT");
    expect(fromOkxInstrument("BTCUSDT")).toBe("BTCUSDT");
  });

  it("gera timestamp ISO 8601 UTC estrito no padrão exigido pela OKX", () => {
    const ts = formatOkxTimestamp();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("produz assinatura HMAC-SHA256 Base64 válida para a API da OKX v5", () => {
    const creds = {
      apiKey: "my-api-key",
      apiSecret: "my-secret-key-123",
      passphrase: "my-passphrase",
      simulated: false,
    };
    const method = "GET";
    const path = "/api/v5/account/balance";
    const body = "";

    const headers = signOkxHeaders(method, path, body, creds);

    expect(headers["OK-ACCESS-KEY"]).toBe("my-api-key");
    expect(headers["OK-ACCESS-PASSPHRASE"]).toBe("my-passphrase");
    expect(headers["OK-ACCESS-TIMESTAMP"]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof headers["OK-ACCESS-SIGN"]).toBe("string");
    expect(headers["OK-ACCESS-SIGN"].length).toBeGreaterThan(10);
    expect(headers["x-simulated-trading"]).toBe("0");
  });

  it("injeta cabeçalho x-simulated-trading: 1 quando em modo simulado", () => {
    const creds = {
      apiKey: "my-api-key",
      apiSecret: "sec",
      passphrase: "pass",
      simulated: true,
    };
    const headers = signOkxHeaders("GET", "/api/v5/account/balance", "", creds);
    expect(headers["x-simulated-trading"]).toBe("1");
  });

  it("suporta chamada de executeOkxOrder tanto posicional quanto por objeto de opções", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          code: "0",
          msg: "",
          data: [{ ordId: "okx-ord-999", clOrdId: "cl999", sCode: "0" }],
        }),
        { status: 200 }
      )
    ) as any;

    try {
      const creds = {
        apiKey: "my-api-key",
        apiSecret: "sec",
        passphrase: "pass",
        simulated: true,
      };

      const resPositional = await executeOkxOrder("BTCUSDT", "BUY", 0.001, creds, undefined, "MARKET", 95);
      expect(resPositional.orderId).toBe("okx-ord-999");
      expect(resPositional.symbol).toBe("BTCUSDT");

      const resObject = await executeOkxOrder(creds, {
        symbol: "ETHUSDT",
        side: "SELL",
        quantity: 0.05,
        orderType: "market",
      });
      expect(resObject.orderId).toBe("okx-ord-999");
      expect(resObject.symbol).toBe("ETHUSDT");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("formata quantidades e preços pelo lotSz e tickSz sem erro IEEE 754", () => {
    expect(formatOkxStep(0.12345678, "0.0001", "floor")).toBe("0.1234");
    expect(formatOkxStep(105.678, "0.05", "round")).toBe("105.70");
    expect(formatOkxStep(1.9, "1", "floor")).toBe("1");
  });

  it("normaliza fetchOkxAccount com totalValue, assetBalance, pnl e marketPrice/marketValue", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          code: "0",
          msg: "",
          data: [
            {
              totalEq: "250.50",
              details: [
                { ccy: "USDT", availBal: "150.50", cashBal: "150.50", eqUsd: "150.50" },
                { ccy: "SOL", availBal: "0.5", cashBal: "0.5", eqUsd: "100.00" },
              ],
            },
          ],
        }),
        { status: 200 }
      )
    ) as any;

    try {
      const acc = await fetchOkxAccount({
        apiKey: "k",
        apiSecret: "s",
        passphrase: "p",
        simulated: true,
      });
      expect(acc.source).toBe("okx-demo");
      expect(acc.cashBalance).toBe(150.5);
      expect(acc.assetBalance).toBe(100);
      expect(acc.totalValue).toBe(250.5);
      expect(acc.pnl).toBe(0);
      expect(acc.pnlPercent).toBe(0);
      expect(acc.positions).toHaveLength(1);
      expect(acc.positions[0].symbol).toBe("SOLUSDT");
      expect(acc.positions[0].marketPrice).toBe(200);
      expect(acc.positions[0].marketValue).toBe(100);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("ajusta quantidade no SELL pelo saldo livre real e faz fallback tdMode cash->cross no erro 51010", async () => {
    const originalFetch = globalThis.fetch;
    const sentPayloads: any[] = [];
    let orderAttempt = 0;

    globalThis.fetch = mock(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/v5/public/instruments")) {
        return new Response(
          JSON.stringify({
            code: "0",
            data: [{ lotSz: "0.0001", minSz: "0.0001", tickSz: "0.01" }],
          }),
          { status: 200 }
        );
      }
      if (u.includes("/api/v5/account/balance")) {
        return new Response(
          JSON.stringify({
            code: "0",
            data: [{ details: [{ ccy: "SOL", availBal: "0.4995", cashBal: "0.4995", eqUsd: "99.90" }] }],
          }),
          { status: 200 }
        );
      }
      if (u.includes("/api/v5/trade/order") && (!init?.method || init.method === "POST")) {
        orderAttempt++;
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        sentPayloads.push(body);
        if (orderAttempt === 1) {
          return new Response(
            JSON.stringify({
              code: "1",
              data: [{ ordId: "", sCode: "51010", sMsg: "Account mode incompatible" }],
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            code: "0",
            data: [{ ordId: "okx-sell-51010-ok", clOrdId: body.clOrdId, sCode: "0" }],
          }),
          { status: 200 }
        );
      }
      if (u.includes("/api/v5/trade/order?")) {
        return new Response(
          JSON.stringify({
            code: "0",
            data: [{ ordId: "okx-sell-51010-ok", state: "filled", accFillSz: "0.4995", avgPx: "200.0" }],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ code: "0", data: [] }), { status: 200 });
    }) as any;

    try {
      const result = await executeOkxOrder(
        { apiKey: "k", apiSecret: "s", passphrase: "p", simulated: false },
        {
          symbol: "SOLUSDT",
          side: "SELL",
          quantity: 0.5, // maior que availBal (0.4995) por causa da taxa de compra
          orderType: "MARKET",
          sellAll: true,
        }
      );

      expect(sentPayloads).toHaveLength(2);
      expect(sentPayloads[0].tdMode).toBe("cash");
      expect(sentPayloads[0].sz).toBe("0.4995");
      expect(sentPayloads[1].tdMode).toBe("cross");
      expect(sentPayloads[1].ccy).toBe("USDT");
      expect(result.orderId).toBe("okx-sell-51010-ok");
      expect(result.executedQty).toBe(0.4995);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
