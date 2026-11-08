import crypto from "crypto";
import { BINANCE_RECV_WINDOW_MS } from "@/lib/binance/time";

// Envio de ordem Spot sem risco de duplicidade.
// Doc oficial (General API Information → HTTP Return Codes): um 5XX "NÃO deve ser tratado como falha;
// o status de execução é DESCONHECIDO e pode ter sido um sucesso". Por isso a ordem nunca é reenviada
// automaticamente: em resultado incerto, consultamos GET /api/v3/order pelo origClientOrderId.

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface SubmitSpotOrderOptions {
  baseUrl: string;
  symbol: string;
  /** Query já montada (com timestamp e recvWindow), sem signature e sem newClientOrderId. */
  queryString: string;
  apiKey: string;
  apiSecret: string;
  /** Timestamp sincronizado com a Binance, usado na consulta de reconciliação. */
  getTimestamp: () => Promise<number>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/** Id único por ordem (32 caracteres, só letras, números e hífen). */
export function generateClientOrderId(): string {
  return `tai-${crypto.randomUUID().replace(/-/g, "").slice(0, 28)}`;
}

function sign(query: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(query).digest("hex");
}

function unknownStatusError(clientOrderId: string, detail: string): Error {
  const err: any = new Error(
    `Status da ordem DESCONHECIDO na Binance (clientOrderId ${clientOrderId}): ${detail}. ` +
      `Confira as ordens na Binance antes de tentar de novo para não comprar/vender em dobro.`
  );
  err.code = "ORDER_STATUS_UNKNOWN";
  err.clientOrderId = clientOrderId;
  return err;
}

async function findOrderByClientId(
  opts: SubmitSpotOrderOptions,
  fetchImpl: FetchLike,
  clientOrderId: string
): Promise<Response> {
  const timestamp = await opts.getTimestamp();
  const query = `symbol=${opts.symbol}&origClientOrderId=${clientOrderId}&timestamp=${timestamp}&recvWindow=${BINANCE_RECV_WINDOW_MS}`;
  let res: Response;
  try {
    res = await fetchImpl(`${opts.baseUrl}/api/v3/order?${query}&signature=${sign(query, opts.apiSecret)}`, {
      headers: { "X-MBX-APIKEY": opts.apiKey },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
    });
  } catch (e: any) {
    throw unknownStatusError(clientOrderId, `falha ao consultar a ordem (${e?.message || e})`);
  }

  if (res.ok) {
    const data = await res.json();
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  }

  const body = await res.json().catch(() => null);
  if (body?.code === -2013) {
    const err: any = new Error(
      `A ordem não foi executada pela Binance (clientOrderId ${clientOrderId} não existe). Nenhuma ordem foi reenviada automaticamente.`
    );
    err.code = "ORDER_NOT_PLACED";
    err.clientOrderId = clientOrderId;
    throw err;
  }
  throw unknownStatusError(clientOrderId, `consulta retornou HTTP ${res.status}`);
}

/**
 * Envia POST /api/v3/order uma única vez, com newClientOrderId.
 * - Sucesso ou erro 4xx/429/418: devolve a resposta original (quem chama trata a mensagem).
 * - 5xx ou erro de rede/timeout: consulta a ordem pelo clientOrderId e devolve o resultado como 200,
 *   lança ORDER_NOT_PLACED se ela não existir, ou ORDER_STATUS_UNKNOWN se não der para saber.
 */
export async function submitSpotOrder(opts: SubmitSpotOrderOptions): Promise<Response> {
  const fetchImpl = opts.fetchImpl ?? (fetch as FetchLike);
  const clientOrderId = generateClientOrderId();
  const query = `${opts.queryString}&newClientOrderId=${clientOrderId}`;

  let res: Response;
  try {
    res = await fetchImpl(`${opts.baseUrl}/api/v3/order?${query}&signature=${sign(query, opts.apiSecret)}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": opts.apiKey },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
    });
  } catch {
    return findOrderByClientId(opts, fetchImpl, clientOrderId);
  }

  if (res.status >= 500) {
    return findOrderByClientId(opts, fetchImpl, clientOrderId);
  }
  return res;
}
