import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { getClientIp } from "@/lib/client-ip";

const req = (headers: Record<string, string>) => new Request("http://localhost/api/x", { headers });

describe("getClientIp — IP do cliente para rate limit", () => {
  it("prioriza x-real-ip (sobrescrito pelo Caddy)", () => {
    expect(getClientIp(req({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" }))).toBe("203.0.113.7");
  });

  it("sem x-real-ip, usa a entrada mais à direita do x-forwarded-for (proxy mais próximo)", () => {
    expect(getClientIp(req({ "x-forwarded-for": "6.6.6.6, 198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("aceita IPv6", () => {
    expect(getClientIp(req({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("valor que não é IP vira 'unknown' (não cria chaves arbitrárias no limitador)", () => {
    expect(getClientIp(req({ "x-forwarded-for": "qualquer-coisa-" + "x".repeat(500) }))).toBe("unknown");
    expect(getClientIp(req({ "x-real-ip": "<script>" }))).toBe("unknown");
  });

  it("sem cabeçalhos → 'unknown'", () => {
    expect(getClientIp(req({}))).toBe("unknown");
  });

  it("as rotas com rate limit não leem x-forwarded-for diretamente", () => {
    const routes = [
      "src/app/api/trades/route.ts",
      "src/app/api/alerts/route.ts",
      "src/app/api/ai/entries/route.ts",
      "src/app/api/ai/exits/route.ts",
      "src/app/api/ai/dashboard-preset/route.ts",
    ];
    for (const r of routes) {
      const src = readFileSync(join(import.meta.dir, "../..", r), "utf8");
      expect(src.includes("headers.get('x-forwarded-for')") || src.includes('headers.get("x-forwarded-for")')).toBe(false);
    }
  });
});
