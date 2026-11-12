import { sealSecret, openSecret } from "@/lib/secret-box";
import type { NextRequest, NextResponse } from "next/server";

// As chaves da Binance ficam SOMENTE no servidor: o navegador recebe apenas um
// cookie httpOnly com o conteúdo criptografado (AES-256-GCM) e nunca consegue lê-lo.

export const BINANCE_COOKIE = "tradeai_binance";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
}

function encrypt(payload: BinanceCredentials): string {
  return sealSecret(JSON.stringify(payload));
}

function decrypt(token: string): BinanceCredentials | null {
  const json = openSecret(token);
  if (!json) return null; // cookie adulterado, expirado ou de outra chave
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed.apiKey === "string" && typeof parsed.apiSecret === "string") {
      return { apiKey: parsed.apiKey, apiSecret: parsed.apiSecret, testnet: parsed.testnet === true };
    }
  } catch {
    // conteúdo inválido
  }
  return null;
}

function isHttpsRequest(request?: Request): boolean {
  if (!request) return false;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProto) return forwardedProto === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function setBinanceSession(res: NextResponse, creds: BinanceCredentials, request?: Request) {
  res.cookies.set(BINANCE_COOKIE, encrypt(creds), {
    httpOnly: true,
    sameSite: "strict",
    secure: isHttpsRequest(request),
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearBinanceSession(res: NextResponse, request?: Request) {
  res.cookies.set(BINANCE_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: isHttpsRequest(request),
    path: "/",
    maxAge: 0,
  });
}

export function readBinanceSession(request: NextRequest | Request): BinanceCredentials | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${BINANCE_COOKIE}=`));
  if (!match) return null;
  return decrypt(match.slice(BINANCE_COOKIE.length + 1));
}

// Credenciais usadas pelas rotas: sessão do usuário, com fallback para variáveis de ambiente.
export function getBinanceCredentials(request: NextRequest | Request): BinanceCredentials {
  const session = readBinanceSession(request);
  if (session) return session;
  return {
    apiKey: (process.env.BINANCE_API_KEY?.replace(/['"]/g, "") || "").trim(),
    apiSecret: (process.env.BINANCE_API_SECRET?.replace(/['"]/g, "") || "").trim(),
    testnet: process.env.APP_ENV !== "production",
  };
}

// Defesa contra CSRF em rotas que alteram estado: valida Origin/Referer/Sec-Fetch-Site.
export function isSameOrigin(request: Request): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (secFetchSite === "cross-site") {
    return false;
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }

  // Sem Origin e sem Referer: aceita apenas se não veio de contexto cross-site
  return secFetchSite !== "cross-site";
}
