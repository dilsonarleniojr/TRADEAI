/**
 * Utilitário de conexão e fail-fast com o microserviço local da Binance.
 * Se o serviço em localhost:3001 não estiver rodando, ativa circuit-breaker de 60s
 * para evitar overhead de 1.5s a 2s de timeout em todas as requisições de mercado.
 */

const BINANCE_SERVICE_URL = process.env.BINANCE_SERVICE_URL || 'http://localhost:3001';
let serviceOfflineUntil = 0;

export async function fetchFromBinanceService(path: string, timeoutMs: number = 400): Promise<Response | null> {
  if (Date.now() < serviceOfflineUntil) {
    return null;
  }

  try {
    const res = await fetch(`${BINANCE_SERVICE_URL}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    if (res.ok) {
      serviceOfflineUntil = 0;
      return res;
    }
    // Se respondeu status de erro (ex: 404/500), não marca offline mas retorna null
    return null;
  } catch {
    // Falha de rede/conexão recusada: desliga chamadas por 60s
    serviceOfflineUntil = Date.now() + 60_000;
    return null;
  }
}
