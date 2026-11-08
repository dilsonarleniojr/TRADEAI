import { isIP } from "net";

/**
 * IP do cliente para rate limit.
 * Ordem: `x-real-ip` (o Caddy sobrescreve com o IP de quem conectou) e, sem ele, a entrada mais
 * à direita do `x-forwarded-for` (a acrescentada pelo proxy mais próximo). Valor que não é IP vira "unknown".
 * Limite: se a porta do Next estiver exposta sem o proxy, o cliente controla esses cabeçalhos (ver A-08).
 */
export function getClientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real && isIP(real)) return real;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const last = forwarded.split(",").map((s) => s.trim()).filter(Boolean).pop();
    if (last && isIP(last)) return last;
  }
  return "unknown";
}
