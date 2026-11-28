import { NextResponse } from "next/server";
import { AuthService } from "@/lib/auth/auth-service";
import { isSameOrigin } from "@/lib/binance-session";
import { getClientRateLimitKey, isRateLimited } from "@/lib/rate-limit";

export interface GuardOptions {
  /** Exige cookie tradeai_session ou Bearer token válido (quando REQUIRE_AUTH=true ou requireSession explicitamente ativo) */
  requireSession?: boolean;
  /** Limite de requisições por janela (padrão: sem limite específico se omitido) */
  rateLimit?: { limit: number; windowMs?: number; scope?: string };
}

function readSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith("tradeai_session="));
  return match ? match.slice("tradeai_session=".length) : null;
}

/**
 * Centraliza defesa CSRF (Same-Origin), Rate Limiting e Autenticação de Sessão.
 * Retorna `NextResponse` de erro se bloqueado, ou `null` se autorizado.
 */
export function guardApiRequest(request: Request, options: GuardOptions = {}): NextResponse | null {
  const method = request.method.toUpperCase();
  const isMutating = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";

  if (isMutating && !isSameOrigin(request)) {
    return NextResponse.json(
      { success: false, error: "Requisição cross-origin bloqueada por política CSRF." },
      { status: 403 }
    );
  }

  if (options.rateLimit) {
    const key = getClientRateLimitKey(request, options.rateLimit.scope || "api");
    if (isRateLimited(key, options.rateLimit.limit, options.rateLimit.windowMs ?? 60_000)) {
      return NextResponse.json(
        { success: false, error: "Muitas requisições. Tente novamente em instantes." },
        { status: 429 }
      );
    }
  }

  const requireAuth = options.requireSession === true || process.env.REQUIRE_AUTH === "true";
  if (requireAuth) {
    const authHeader = request.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const token = readSessionCookie(request) || bearerToken;
    const user = token ? AuthService.validateSession(token) : null;
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Autenticação obrigatória. Faça login para continuar." },
        { status: 401 }
      );
    }
  }

  return null;
}

