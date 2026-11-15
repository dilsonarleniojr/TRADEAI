import crypto from "crypto";
import type { OkxCredentials } from "./okx-session";

export const OKX_BASE_URL = "https://www.okx.com";

export interface OkxSessionStatus {
  connected: boolean;
  simulated: boolean;
}

/**
 * Converte símbolo padrão do TradeAI (ex: BTCUSDT) para o padrão de instrumento Spot da OKX (BTC-USDT)
 */
export function toOkxInstrument(symbol: string): string {
  const clean = symbol.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (clean.includes("-")) return clean;
  if (clean.endsWith("USDT")) {
    return `${clean.slice(0, -4)}-USDT`;
  }
  if (clean.endsWith("USDC")) {
    return `${clean.slice(0, -4)}-USDC`;
  }
  if (clean.endsWith("BTC") && clean.length > 3) {
    return `${clean.slice(0, -3)}-BTC`;
  }
  return `${clean}-USDT`;
}

/**
 * Converte instrumento da OKX (ex: BTC-USDT) para símbolo padrão do TradeAI (BTCUSDT)
 */
export function fromOkxInstrument(instId: string): string {
  return instId.replace(/-/g, "").toUpperCase();
}

/**
 * Retorna timestamp ISO 8601 UTC estrito no formato exigido pela OKX v5.
 */
export function formatOkxTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Gera headers assinados para a API v5 da OKX conforme a especificação institucional:
 * Prehash: timestamp + METHOD + requestPath + body
 * HMAC-SHA256 codificado em Base64
 */
export function signOkxHeaders(
  method: string,
  requestPath: string,
  body: string = "",
  creds: OkxCredentials
): Record<string, string> {
  const timestamp = new Date().toISOString();
  const upperMethod = method.toUpperCase();
  const prehash = `${timestamp}${upperMethod}${requestPath}${body}`;

  const signature = crypto
    .createHmac("sha256", creds.apiSecret)
    .update(prehash)
    .digest("base64");

  return {
    "OK-ACCESS-KEY": creds.apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": creds.passphrase,
    "x-simulated-trading": creds.simulated ? "1" : "0",
    "Content-Type": "application/json",
  };
}

/**
 * Consulta a carteira / saldo da conta unificada na OKX (GET /api/v5/account/balance)
 */
export async function fetchOkxAccount(creds: OkxCredentials) {
  const requestPath = "/api/v5/account/balance";
  const headers = signOkxHeaders("GET", requestPath, "", creds);

  const res = await fetch(`${OKX_BASE_URL}${requestPath}`, {
    method: "GET",
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Falha ao consultar saldo OKX (${res.status}): ${errorText.slice(0, 150)}`);
  }

  const json = await res.json();
  if (json.code !== "0" && json.code !== 0) {
    throw new Error(`Erro na API OKX: ${json.msg || `Código ${json.code}`}`);
  }

  const data = json.data?.[0];
  const details: any[] = data?.details || [];

  let cashBalance = 0;
  let totalEquityUsd = parseFloat(data?.totalEq || "0") || 0;
  let assetQuantity = 0;
  const positions: Array<{
    symbol: string;
    quantity: number;
    avgPrice: number;
    currentPrice: number;
    totalCost: number;
    currentValue: number;
    unrealizedPnl: number;
    unrealizedPnlPercent: number;
  }> = [];

  for (const item of details) {
    const ccy = (item.ccy || "").toUpperCase();
    const availBal = parseFloat(item.availBal || item.cashBal || "0") || 0;
    const eqUsd = parseFloat(item.eqUsd || "0") || 0;

    if (ccy === "USDT") {
      cashBalance += availBal;
    } else if (availBal > 0) {
      const sym = `${ccy}USDT`;
      const currentPrice = availBal > 0 ? eqUsd / availBal : 0;
      positions.push({
        symbol: sym,
        quantity: availBal,
        avgPrice: currentPrice,
        currentPrice,
        totalCost: eqUsd,
        currentValue: eqUsd,
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
      });
      if (ccy === "BTC") {
        assetQuantity = availBal;
      }
    }
  }

  if (totalEquityUsd === 0) {
    totalEquityUsd = cashBalance + positions.reduce((acc, p) => acc + p.currentValue, 0);
  }

  return {
    id: "okx-live-account",
    userId: "okx_user",
    cashBalance,
    totalBalance: totalEquityUsd,
    assetQuantity,
    symbol: "BTCUSDT",
    source: creds.simulated ? "okx-demo" : "okx-live",
    positions,
    portfolio: positions,
    syncedAt: Date.now(),
  };
}

export interface OkxOrderInput {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price?: number;
  orderType?: "MARKET" | "LIMIT" | "market" | "limit";
  totalVal?: number;
  clientOrderId?: string;
}

/**
 * Executa uma ordem Spot a mercado ou a limite na OKX (POST /api/v5/trade/order)
 */
export async function executeOkxOrder(
  symbolOrCreds: string | OkxCredentials,
  sideOrInput: "BUY" | "SELL" | OkxOrderInput,
  quantity?: number,
  creds?: OkxCredentials,
  price?: number,
  orderType: "MARKET" | "LIMIT" = "MARKET",
  totalVal?: number,
  clientOrderId?: string
) {
  let resolvedSymbol: string;
  let resolvedSide: "BUY" | "SELL";
  let resolvedQty: number;
  let resolvedCreds: OkxCredentials;
  let resolvedPrice: number | undefined;
  let resolvedOrdType: "MARKET" | "LIMIT";
  let resolvedTotalVal: number | undefined;
  let resolvedClientOrderId: string | undefined;

  if (typeof symbolOrCreds === "object" && typeof sideOrInput === "object") {
    resolvedCreds = symbolOrCreds;
    resolvedSymbol = sideOrInput.symbol;
    resolvedSide = sideOrInput.side;
    resolvedQty = sideOrInput.quantity;
    resolvedPrice = sideOrInput.price;
    resolvedOrdType = (sideOrInput.orderType || "MARKET").toUpperCase() as "MARKET" | "LIMIT";
    resolvedTotalVal = sideOrInput.totalVal;
    resolvedClientOrderId = sideOrInput.clientOrderId;
  } else {
    resolvedSymbol = String(symbolOrCreds);
    resolvedSide = sideOrInput as "BUY" | "SELL";
    resolvedQty = Number(quantity || 0);
    resolvedCreds = creds!;
    resolvedPrice = price;
    resolvedOrdType = orderType;
    resolvedTotalVal = totalVal;
    resolvedClientOrderId = clientOrderId;
  }

  const requestPath = "/api/v5/trade/order";
  const instId = toOkxInstrument(resolvedSymbol);
  const normalizedSide = resolvedSide.toLowerCase() as "buy" | "sell";
  const normalizedOrdType = resolvedOrdType.toLowerCase() as "market" | "limit";

  const clOrdId = (resolvedClientOrderId || `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`)
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 32);

  const payload: Record<string, any> = {
    instId,
    tdMode: "cash", // Spot Cash trading
    side: normalizedSide,
    ordType: normalizedOrdType,
    clOrdId,
  };

  if (normalizedOrdType === "market") {
    if (normalizedSide === "buy") {
      // Na OKX, ordens a mercado de compra Spot usam tgtCcy para comprar por montante nocional USDT
      if (resolvedTotalVal && resolvedTotalVal > 0) {
        payload.tgtCcy = "quote_ccy";
        payload.sz = resolvedTotalVal.toFixed(2);
      } else {
        payload.tgtCcy = "base_ccy";
        payload.sz = resolvedQty.toString();
      }
    } else {
      payload.sz = resolvedQty.toString();
    }
  } else {
    // Limit order
    if (!resolvedPrice || resolvedPrice <= 0) {
      throw new Error("Preço limite obrigatório para ordens LIMIT na OKX.");
    }
    payload.px = resolvedPrice.toString();
    payload.sz = resolvedQty.toString();
  }

  const bodyStr = JSON.stringify(payload);
  const headers = signOkxHeaders("POST", requestPath, bodyStr, resolvedCreds);

  const res = await fetch(`${OKX_BASE_URL}${requestPath}`, {
    method: "POST",
    headers,
    body: bodyStr,
    signal: AbortSignal.timeout(8000),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json.code !== "0" && json.code !== 0)) {
    const errorMsg = json.msg || `Erro HTTP ${res.status}`;
    throw new Error(`Ordem rejeitada pela OKX: ${errorMsg} (código ${json.code})`);
  }

  const orderData = json.data?.[0] || {};
  return {
    orderId: orderData.ordId,
    clientOrderId: orderData.clOrdId,
    status: orderData.sCode === "0" ? "FILLED" : "NEW",
    executedQty: resolvedQty,
    cummulativeQuoteQty: resolvedTotalVal || 0,
    symbol: resolvedSymbol,
    side: resolvedSide,
    raw: orderData,
  };
}

// Helpers do navegador (client-side)
export async function restoreOkxSession(): Promise<OkxSessionStatus> {
  try {
    const res = await fetch("/api/okx/login", { cache: "no-store" });
    const data = await res.json();
    return { connected: !!data.connected, simulated: Boolean(data.simulated) };
  } catch {
    return { connected: false, simulated: false };
  }
}

export async function disconnectOkxSession(): Promise<void> {
  await fetch("/api/okx/login", { method: "DELETE" }).catch(() => {});
}
