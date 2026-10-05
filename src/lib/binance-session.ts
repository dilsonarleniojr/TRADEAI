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

export function setBinanceSession(res: NextResponse, creds: BinanceCredentials) {
  res.cookies.set(BINANCE_COOKIE, encrypt(creds), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearBinanceSession(res: NextResponse) {
  res.cookies.set(BINANCE_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
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
    apiKey: process.env.BINANCE_API_KEY?.replace(/['"]/g, "") || "",
    apiSecret: process.env.BINANCE_API_SECRET?.replace(/['"]/g, "") || "",
    testnet: process.env.APP_ENV !== "production",
  };
}

// Defesa contra CSRF em rotas que alteram a sessão: exige mesma origem quando o header existe.
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
