import { sealSecret, openSecret } from "@/lib/secret-box";
import type { NextRequest, NextResponse } from "next/server";

// As chaves da OKX ficam SOMENTE no servidor: o navegador recebe apenas um
// cookie httpOnly com o conteúdo criptografado (AES-256-GCM) e nunca consegue lê-lo.

export const OKX_COOKIE = "tradeai_okx";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface OkxCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  simulated: boolean;
}

function encrypt(payload: OkxCredentials): string {
  return sealSecret(JSON.stringify(payload));
}

function decrypt(token: string): OkxCredentials | null {
  const json = openSecret(token);
  if (!json) return null; // cookie adulterado, expirado ou de outra chave
  try {
    const parsed = JSON.parse(json);
    if (
      typeof parsed.apiKey === "string" &&
      typeof parsed.apiSecret === "string" &&
      typeof parsed.passphrase === "string"
    ) {
      return {
        apiKey: parsed.apiKey,
        apiSecret: parsed.apiSecret,
        passphrase: parsed.passphrase,
        simulated: parsed.simulated === true,
      };
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

export function setOkxSession(res: NextResponse, creds: OkxCredentials, request?: Request) {
  res.cookies.set(OKX_COOKIE, encrypt(creds), {
    httpOnly: true,
    sameSite: "strict",
    secure: isHttpsRequest(request),
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearOkxSession(res: NextResponse, request?: Request) {
  res.cookies.set(OKX_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: isHttpsRequest(request),
    path: "/",
    maxAge: 0,
  });
}

export function readOkxSession(request: NextRequest | Request): OkxCredentials | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${OKX_COOKIE}=`));
  if (!match) return null;
  return decrypt(match.slice(OKX_COOKIE.length + 1));
}

// Credenciais usadas pelas rotas: sessão do usuário, com fallback para variáveis de ambiente.
export function getOkxCredentials(request: NextRequest | Request): OkxCredentials {
  const session = readOkxSession(request);
  if (session) return session;
  return {
    apiKey: (process.env.OKX_API_KEY?.replace(/['"]/g, "") || "").trim(),
    apiSecret: (process.env.OKX_API_SECRET?.replace(/['"]/g, "") || "").trim(),
    passphrase: (process.env.OKX_PASSPHRASE?.replace(/['"]/g, "") || "").trim(),
    simulated: process.env.OKX_SIMULATED === "true" || process.env.APP_ENV !== "production",
  };
}

