/**
 * Utilitário de logging controlado para o console do cliente.
 * Evita poluição do console (C2) limitando avisos de rede e erros repetitivos
 * para no máximo 1 ocorrência por tipo a cada 30 segundos.
 */

const lastLoggedMap = new Map<string, number>();

export function throttledWarn(key: string, message: string, detail?: unknown, intervalMs = 30_000): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const lastTime = lastLoggedMap.get(key) || 0;
  if (now - lastTime >= intervalMs) {
    lastLoggedMap.set(key, now);
    if (detail !== undefined) {
      console.warn(`[TradeAI Throttled] ${message}`, detail);
    } else {
      console.warn(`[TradeAI Throttled] ${message}`);
    }
  }
}

export function throttledError(key: string, message: string, detail?: unknown, intervalMs = 30_000): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const lastTime = lastLoggedMap.get(key) || 0;
  if (now - lastTime >= intervalMs) {
    lastLoggedMap.set(key, now);
    if (detail !== undefined) {
      console.warn(`[TradeAI Network Warn] ${message}`, detail);
    } else {
      console.warn(`[TradeAI Network Warn] ${message}`);
    }
  }
}
