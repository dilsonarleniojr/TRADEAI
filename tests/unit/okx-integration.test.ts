import { describe, expect, it } from "bun:test";
import { toOkxInstrument, fromOkxInstrument, signOkxHeaders } from "@/lib/okx/okx-client";
import { formatOkxTimestamp } from "@/lib/okx/okx-client";

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
});
