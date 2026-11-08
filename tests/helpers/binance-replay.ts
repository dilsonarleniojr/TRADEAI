import { readFileSync } from "fs";

// Reproduz respostas públicas da Binance gravadas em tests/fixtures, sem rede.
// - /api/v3/time responde com a hora atual.
// - Timestamps de candles e tickers são deslocados para que o último candle feche "agora"
//   (os dados não envelhecem com o passar dos dias e não caem em vetos de dado desatualizado).
// - URL não gravada da Binance → erro explícito (dependência de rede nova aparece no teste).
// - Hosts de fora da Binance → 503 (os testes já tratam indisponibilidade desses serviços).

interface Fixture {
  recordedAt: number;
  responses: Record<string, { status: number; body: unknown }>;
}

function key(url: string): string {
  const u = new URL(url);
  for (const p of ["timestamp", "signature", "recvWindow"]) u.searchParams.delete(p);
  return `${u.pathname}?${u.searchParams.toString()}`;
}

function shiftTimes(path: string, body: any, delta: number): any {
  if (path.endsWith("/klines") && Array.isArray(body)) {
    return body.map((k: any[]) => {
      const c = [...k];
      c[0] = Number(c[0]) + delta;
      c[6] = Number(c[6]) + delta;
      return c;
    });
  }
  if (path.endsWith("/ticker/24hr")) {
    const fix = (t: any) => ({ ...t, openTime: Number(t.openTime) + delta, closeTime: Number(t.closeTime) + delta });
    return Array.isArray(body) ? body.map(fix) : fix(body);
  }
  if (path.endsWith("/exchangeInfo") && body && typeof body === "object") {
    return { ...body, serverTime: Number(body.serverTime ?? 0) + delta };
  }
  return body;
}

/** Instala o fetch de reprodução; devolve uma função que restaura o fetch original. */
export function installBinanceReplay(fixturePath: string): () => void {
  const fixture: Fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const real = globalThis.fetch;
  const delta = Date.now() - fixture.recordedAt;

  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return new Response("{}", { status: 503 });
    }

    if (u.host !== "api.binance.com") {
      return new Response(JSON.stringify({ error: "rede desativada nos testes" }), { status: 503 });
    }
    if (u.pathname === "/api/v3/time") {
      return new Response(JSON.stringify({ serverTime: Date.now() }), { status: 200 });
    }

    const hit = fixture.responses[key(url)];
    if (!hit) {
      throw new Error(`[binance-replay] URL não gravada em ${fixturePath}: ${key(url)}`);
    }
    const body = shiftTimes(u.pathname, structuredClone(hit.body), delta);
    return new Response(JSON.stringify(body), { status: hit.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  return () => {
    globalThis.fetch = real;
  };
}
