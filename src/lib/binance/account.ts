import crypto from "crypto";
import type { FetchLike } from "@/lib/binance/order-submit";

// Saldo livre de um ativo na carteira Spot (GET /api/v3/account). Falha fechada:
// se o saldo não puder ser lido, lança BALANCE_UNAVAILABLE em vez de seguir sem validação.

export interface FetchFreeBalanceOptions {
  baseUrl: string;
  asset: string;
  apiKey: string;
  apiSecret: string;
  /** Timestamp já sincronizado com a Binance. */
  timestamp: number;
  recvWindow: number;
  fetchImpl?: FetchLike;
}

function unavailable(asset: string, detail: string): never {
  const err: any = new Error(
    `Não foi possível ler o saldo de ${asset} na Binance (${detail}). Ordem não enviada; tente novamente.`
  );
  err.code = "BALANCE_UNAVAILABLE";
  throw err;
}

export async function fetchFreeBalance(opts: FetchFreeBalanceOptions): Promise<number> {
  const fetchImpl = opts.fetchImpl ?? (fetch as FetchLike);
  const query = `omitZeroBalances=true&timestamp=${opts.timestamp}&recvWindow=${opts.recvWindow}`;
  const signature = crypto.createHmac("sha256", opts.apiSecret).update(query).digest("hex");

  let data: any;
  try {
    const res = await fetchImpl(`${opts.baseUrl}/api/v3/account?${query}&signature=${signature}`, {
      headers: { "X-MBX-APIKEY": opts.apiKey },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      unavailable(opts.asset, `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }
    data = await res.json();
  } catch (err: any) {
    if (err?.code === "BALANCE_UNAVAILABLE") throw err;
    unavailable(opts.asset, err?.message || "erro de rede");
  }

  if (!Array.isArray(data?.balances)) unavailable(opts.asset, "resposta sem saldos");

  const entry = data.balances.find((b: any) => b.asset === opts.asset);
  // Com omitZeroBalances=true, ativo ausente significa saldo zero.
  if (!entry) return 0;

  const free = parseFloat(entry.free);
  if (!Number.isFinite(free) || free < 0) unavailable(opts.asset, "saldo inválido");
  return free;
}
