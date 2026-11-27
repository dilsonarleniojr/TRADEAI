import crypto from "crypto";
import type { OkxCredentials } from "./okx-session";
import { formatStepExact, formatTickExact } from "@/lib/format-step";

export const OKX_BASE_URL = "https://www.okx.com";
const OKX_HOST = "www.okx.com";

// Captura a referência original do fetch na inicialização do módulo para detectar mocks em testes unitários.
const INITIAL_FETCH = typeof globalThis.fetch === "function" ? globalThis.fetch : null;

export interface OkxSessionStatus {
  connected: boolean;
  simulated: boolean;
}

export interface OkxInstrumentFilters {
  lotSz: string;
  minSz: string;
  tickSz: string;
  fetchedAt: number;
}

const instrumentFilterCache = new Map<string, OkxInstrumentFilters>();
const INSTRUMENT_CACHE_TTL_MS = 10 * 60 * 1000;

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
 * Formata quantidade ou preço conforme o step/tick da OKX usando aritmética decimal exata.
 */
export function formatOkxStep(
  value: number | string,
  stepStr: string,
  rounding: "floor" | "round" = "floor"
): string {
  if (rounding === "round") {
    return formatTickExact(value, stepStr);
  }
  return formatStepExact(value, stepStr);
}

interface OkxHttpResponse {
  status: number;
  text: string;
  json: any;
}

async function httpsRequestWithFamily(
  method: string,
  requestPath: string,
  bodyStr: string,
  headers: Record<string, string>,
  family: 4 | 6,
  timeoutMs = 8000
): Promise<OkxHttpResponse> {
  if (typeof window !== "undefined") {
    throw new Error("Requisições privadas à OKX só podem ser executadas no servidor.");
  }
  const { default: https } = await import(/* webpackIgnore: true */ "https");
  return new Promise((resolve, reject) => {
    const reqHeaders: Record<string, string | number> = { ...headers };
    if (bodyStr) {
      reqHeaders["Content-Length"] = Buffer.byteLength(bodyStr);
    }

    const req = https.request(
      {
        hostname: OKX_HOST,
        port: 443,
        path: requestPath,
        method: method.toUpperCase(),
        headers: reqHeaders,
        family,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: any = null;
          try {
            json = text ? JSON.parse(text) : {};
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode || 500, text, json });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error(`Timeout (${timeoutMs}ms) ao conectar na OKX via IPv${family}`));
    });
    req.on("error", (err) => reject(err));

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

function isIpWhitelistError(res: OkxHttpResponse): boolean {
  const code = String(res.json?.code ?? "");
  const msg = String(res.json?.msg || res.text || "").toLowerCase();
  return code === "50110" || msg.includes("ip") && msg.includes("whitelist");
}

/**
 * Executa requisição na API OKX V5 priorizando IPv4 (`family: 4`) com fallback automático para IPv6 (`family: 6`)
 * caso ocorra erro de whitelist IP (code 50110), evitando o problema dual-stack do `fetch` do Bun no Cloudflare.
 */
async function requestOkxApi(
  method: string,
  requestPath: string,
  bodyStr: string,
  creds: OkxCredentials,
  isPublic = false
): Promise<OkxHttpResponse> {
  // Se globalThis.fetch foi substituído por um mock em testes unitários, delega para ele.
  const isMockedFetch =
    typeof globalThis.fetch === "function" &&
    (INITIAL_FETCH !== null ? globalThis.fetch !== INITIAL_FETCH : Boolean((globalThis.fetch as any)?.mock));

  if (isMockedFetch) {
    const headers: Record<string, string> = isPublic
      ? { "Content-Type": "application/json" }
      : signOkxHeaders(method, requestPath, bodyStr, creds);
    const res = await globalThis.fetch(`${OKX_BASE_URL}${requestPath}`, {
      method: method.toUpperCase(),
      headers,
      ...(bodyStr && method.toUpperCase() !== "GET" ? { body: bodyStr } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text().catch(() => "");
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = null;
    }
    return { status: res.status, text, json };
  }

  const runAttempt = async (family: 4 | 6): Promise<OkxHttpResponse> => {
    const headers: Record<string, string> = isPublic
      ? { "Content-Type": "application/json" }
      : signOkxHeaders(method, requestPath, bodyStr, creds);
    return httpsRequestWithFamily(method, requestPath, bodyStr, headers, family, 8000);
  };

  let firstRes: OkxHttpResponse;
  try {
    firstRes = await runAttempt(4);
  } catch (ipv4Err: any) {
    // Se IPv4 falhar por rede, tenta IPv6
    try {
      return await runAttempt(6);
    } catch {
      throw ipv4Err;
    }
  }

  if (!isPublic && (firstRes.status === 401 || isIpWhitelistError(firstRes))) {
    if (isIpWhitelistError(firstRes)) {
      const secondRes = await runAttempt(6).catch(() => null);
      if (secondRes && secondRes.status >= 200 && secondRes.status < 300 && String(secondRes.json?.code) === "0") {
        return secondRes;
      }
      if (secondRes && !isIpWhitelistError(secondRes) && secondRes.status !== 401) {
        return secondRes;
      }
      const rawMsg = firstRes.json?.msg || firstRes.text;
      const ipMatch = String(rawMsg).match(/Your IP\s+([^\s]+)\s+is not included/i);
      const blockedIp = ipMatch?.[1] || "atual do servidor";
      throw new Error(
        `IP bloqueado pela whitelist da API OKX (${blockedIp}). Adicione o IPv4/IPv6 do servidor na lista de IPs confiáveis da sua chave API na OKX. Detalhe: ${rawMsg}`
      );
    }
  }

  return firstRes;
}

/**
 * Busca e cacheia filtros de lote e tick do instrumento Spot na OKX.
 */
export async function getOkxInstrumentFilters(instId: string): Promise<OkxInstrumentFilters> {
  const cached = instrumentFilterCache.get(instId);
  if (cached && Date.now() - cached.fetchedAt < INSTRUMENT_CACHE_TTL_MS) {
    return cached;
  }

  const fallback: OkxInstrumentFilters = {
    lotSz: "0.000001",
    minSz: "0.00001",
    tickSz: "0.0001",
    fetchedAt: Date.now(),
  };

  try {
    const requestPath = `/api/v5/public/instruments?instType=SPOT&instId=${encodeURIComponent(instId)}`;
    const res = await requestOkxApi("GET", requestPath, "", {
      apiKey: "",
      apiSecret: "",
      passphrase: "",
      simulated: false,
    }, true);

    const item = res.json?.data?.[0];
    if (res.status >= 200 && res.status < 300 && String(res.json?.code) === "0" && item) {
      const filters: OkxInstrumentFilters = {
        lotSz: String(item.lotSz || fallback.lotSz),
        minSz: String(item.minSz || fallback.minSz),
        tickSz: String(item.tickSz || fallback.tickSz),
        fetchedAt: Date.now(),
      };
      instrumentFilterCache.set(instId, filters);
      return filters;
    }
  } catch {
    // Fallback silencioso para não impedir envio se endpoint público oscilar
  }

  return cached || fallback;
}

export interface OkxAccountConfig {
  acctLv: string;
  perm: string;
  ip: string;
  fetchedAt: number;
}

const accountConfigCache = new Map<string, OkxAccountConfig>();
const ACCOUNT_CONFIG_TTL_MS = 60 * 1000;

/**
 * Consulta configuração de conta e permissões da API Key (GET /api/v5/account/config).
 */
export async function fetchOkxAccountConfig(creds: OkxCredentials): Promise<OkxAccountConfig | null> {
  const cacheKey = `${creds.apiKey}:${Boolean(creds.simulated)}`;
  const cached = accountConfigCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < ACCOUNT_CONFIG_TTL_MS) {
    return cached;
  }

  try {
    const res = await requestOkxApi("GET", "/api/v5/account/config", "", creds);
    const item = res.json?.data?.[0];
    if (res.status >= 200 && res.status < 300 && String(res.json?.code) === "0" && item && (item.perm || item.acctLv)) {
      const cfg: OkxAccountConfig = {
        acctLv: String(item.acctLv || ""),
        perm: String(item.perm || ""),
        ip: String(item.ip || ""),
        fetchedAt: Date.now(),
      };
      accountConfigCache.set(cacheKey, cfg);
      return cfg;
    }
  } catch {
    // Falha opcional não impede consulta de saldo
  }
  return cached || null;
}

/**
 * Consulta a carteira / saldo da conta unificada na OKX (GET /api/v5/account/balance)
 */
export async function fetchOkxAccount(creds: OkxCredentials) {
  const requestPath = "/api/v5/account/balance";
  const [res, accountCfg] = await Promise.all([
    requestOkxApi("GET", requestPath, "", creds),
    fetchOkxAccountConfig(creds),
  ]);

  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `Falha ao consultar saldo OKX (${res.status}): ${(res.json?.msg || res.text || "").slice(0, 180)}`
    );
  }

  const json = res.json || {};
  if (json.code !== "0" && json.code !== 0) {
    throw new Error(`Erro na API OKX: ${json.msg || `Código ${json.code}`}`);
  }

  const data = json.data?.[0];
  const details: any[] = data?.details || [];

  let cashBalance = 0;
  let cashFree = 0;
  let totalEquityUsd = parseFloat(data?.totalEq || "0") || 0;
  let assetQuantity = 0;
  const positions: Array<{
    symbol: string;
    quantity: number;
    avgPrice: number;
    marketPrice: number;
    marketValue: number;
    currentPrice: number;
    currentValue: number;
    totalCost: number;
    unrealizedPnl: number;
    unrealizedPnlPercent: number;
    realizedPnl: number;
    costKnown: boolean;
  }> = [];

  for (const item of details) {
    const ccy = (item.ccy || "").toUpperCase();
    const availBal = parseFloat(item.availBal || item.availEq || item.cashBal || "0") || 0;
    const totalQty = parseFloat(item.cashBal || item.eq || item.availBal || "0") || 0;
    const eqUsd = parseFloat(item.eqUsd || "0") || 0;

    if (ccy === "USDT") {
      cashBalance += totalQty > 0 ? totalQty : availBal;
      cashFree += availBal;
    } else if (totalQty > 0 || availBal > 0) {
      const qty = availBal > 0 ? availBal : totalQty;
      const sym = `${ccy}USDT`;
      const priceBasisQty = totalQty > 0 ? totalQty : qty;
      const currentPrice = priceBasisQty > 0 && eqUsd > 0 ? eqUsd / priceBasisQty : 0;
      const marketValue = eqUsd > 0 ? eqUsd : qty * currentPrice;

      positions.push({
        symbol: sym,
        quantity: qty,
        avgPrice: currentPrice,
        marketPrice: currentPrice,
        marketValue,
        currentPrice,
        currentValue: marketValue,
        totalCost: marketValue,
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
        realizedPnl: 0,
        costKnown: currentPrice > 0,
      });

      if (ccy === "BTC") {
        assetQuantity = qty;
      }
    }
  }

  let fundingBalance = 0;
  let fundingWarning: string | undefined;

  if (totalEquityUsd === 0 && cashBalance === 0 && positions.length === 0) {
    try {
      const fundingRes = await requestOkxApi("GET", "/api/v5/asset/balances?ccy=USDT", "", creds);
      if (fundingRes.status >= 200 && fundingRes.status < 300 && String(fundingRes.json?.code) === "0") {
        const fundingList: any[] = fundingRes.json?.data || [];
        for (const fItem of fundingList) {
          if ((fItem.ccy || "").toUpperCase() === "USDT") {
            fundingBalance += parseFloat(fItem.availBal || fItem.bal || "0") || 0;
          }
        }
        if (fundingBalance > 0) {
          fundingWarning = `Detectados $${fundingBalance.toFixed(2)} USDT na Conta de Fundos (Funding) da OKX. Transfira para a Conta de Trading (Unified) na OKX para os robôs operarem.`;
          console.warn(`[OKX Account] ${fundingWarning}`);
        }
      }
    } catch {
      // Ignora erro opcional no endpoint de funding
    }
  }

  const assetBalance = positions.reduce((acc, p) => acc + p.marketValue, 0);
  if (totalEquityUsd === 0) {
    totalEquityUsd = cashBalance + assetBalance;
  }

  let permissionWarning: string | undefined;
  if (accountCfg?.perm && !accountCfg.perm.toLowerCase().includes("trade")) {
    permissionWarning =
      "Sua chave API da OKX possui apenas permissão de Leitura (read_only). Acesse OKX → Perfil → API → Editar e marque 'Negociar (Trade)' com a opção 'Spot' habilitada.";
  }

  const combinedWarning = [permissionWarning, fundingWarning].filter(Boolean).join(" ") || undefined;

  return {
    id: "okx-live-account",
    userId: "okx_user",
    cashBalance,
    cashFree,
    totalValue: totalEquityUsd,
    totalBalance: totalEquityUsd,
    assetBalance,
    assetQuantity,
    symbol: "BTCUSDT",
    pnl: 0,
    pnlPercent: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    source: creds.simulated ? "okx-demo" : "okx-live",
    positions,
    portfolio: positions,
    fundingBalance,
    permissions: accountCfg?.perm,
    accountLevel: accountCfg?.acctLv,
    warning: combinedWarning,
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
  sellAll?: boolean;
}

/**
 * Consulta status e quantidade executada de uma ordem Spot na OKX (GET /api/v5/trade/order)
 */
export async function getOkxOrderStatus(symbol: string, orderId: string, creds: OkxCredentials) {
  const instId = toOkxInstrument(symbol);
  const requestPath = `/api/v5/trade/order?instId=${encodeURIComponent(instId)}&ordId=${encodeURIComponent(orderId)}`;
  const res = await requestOkxApi("GET", requestPath, "", creds);

  if (res.status < 200 || res.status >= 300 || String(res.json?.code) !== "0") {
    throw new Error(res.json?.msg || `Erro ao consultar status da ordem na OKX (${res.status})`);
  }

  const order = res.json?.data?.[0];
  if (!order) {
    throw new Error("Ordem não encontrada na OKX.");
  }

  const state = String(order.state || "").toLowerCase();
  const mappedStatus =
    state === "filled"
      ? "FILLED"
      : state === "partially_filled"
        ? "PARTIALLY_FILLED"
        : state === "canceled" || state === "mmp_canceled"
          ? "CANCELED"
          : "NEW";

  return {
    orderId: String(order.ordId || orderId),
    symbol: fromOkxInstrument(order.instId || instId),
    status: mappedStatus,
    executedQty: parseFloat(order.accFillSz || "0") || 0,
    origQty: parseFloat(order.sz || "0") || 0,
    price: parseFloat(order.avgPx || order.px || "0") || 0,
    rawState: state,
  };
}

/**
 * Cancela uma ordem aberta na OKX (POST /api/v5/trade/cancel-order)
 */
export async function cancelOkxOrder(symbol: string, orderId: string, creds: OkxCredentials) {
  const instId = toOkxInstrument(symbol);
  const requestPath = "/api/v5/trade/cancel-order";
  const bodyStr = JSON.stringify({ instId, ordId: orderId });
  const res = await requestOkxApi("POST", requestPath, bodyStr, creds);

  const item = res.json?.data?.[0];
  if (res.status < 200 || res.status >= 300 || String(res.json?.code) !== "0" || (item?.sCode && item.sCode !== "0")) {
    throw new Error(item?.sMsg || res.json?.msg || `Erro ao cancelar ordem na OKX (${res.status})`);
  }

  return item || res.json;
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
  clientOrderId?: string,
  sellAll?: boolean
) {
  let resolvedSymbol: string;
  let resolvedSide: "BUY" | "SELL";
  let resolvedQty: number;
  let resolvedCreds: OkxCredentials;
  let resolvedPrice: number | undefined;
  let resolvedOrdType: "MARKET" | "LIMIT";
  let resolvedTotalVal: number | undefined;
  let resolvedClientOrderId: string | undefined;
  let resolvedSellAll: boolean;

  if (typeof symbolOrCreds === "object" && typeof sideOrInput === "object") {
    resolvedCreds = symbolOrCreds;
    resolvedSymbol = sideOrInput.symbol;
    resolvedSide = sideOrInput.side;
    resolvedQty = sideOrInput.quantity;
    resolvedPrice = sideOrInput.price;
    resolvedOrdType = (sideOrInput.orderType || "MARKET").toUpperCase() as "MARKET" | "LIMIT";
    resolvedTotalVal = sideOrInput.totalVal;
    resolvedClientOrderId = sideOrInput.clientOrderId;
    resolvedSellAll = Boolean(sideOrInput.sellAll);
  } else {
    resolvedSymbol = String(symbolOrCreds);
    resolvedSide = sideOrInput as "BUY" | "SELL";
    resolvedQty = Number(quantity || 0);
    resolvedCreds = creds!;
    resolvedPrice = price;
    resolvedOrdType = orderType;
    resolvedTotalVal = totalVal;
    resolvedClientOrderId = clientOrderId;
    resolvedSellAll = Boolean(sellAll);
  }

  const requestPath = "/api/v5/trade/order";
  const instId = toOkxInstrument(resolvedSymbol);
  const baseCcy = instId.split("-")[0];
  const normalizedSide = resolvedSide.toLowerCase() as "buy" | "sell";
  const normalizedOrdType = resolvedOrdType.toLowerCase() as "market" | "limit";

  const filters = await getOkxInstrumentFilters(instId);

  const clOrdId = (resolvedClientOrderId || `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`)
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 32);

  let szStr = formatOkxStep(resolvedQty, filters.lotSz, "floor");

  // Na venda na OKX Spot, a taxa da compra anterior foi descontada na moeda base; consulta saldo livre real.
  if (normalizedSide === "sell") {
    try {
      const balRes = await requestOkxApi(
        "GET",
        `/api/v5/account/balance?ccy=${encodeURIComponent(baseCcy)}`,
        "",
        resolvedCreds
      );
      const balDetails = balRes.json?.data?.[0]?.details;
      if (balRes.status >= 200 && balRes.status < 300 && String(balRes.json?.code) === "0" && Array.isArray(balDetails)) {
        const assetDetail = balDetails.find((d: any) => String(d.ccy || "").toUpperCase() === baseCcy);
        const availBal = assetDetail ? parseFloat(assetDetail.availBal || assetDetail.availEq || "0") || 0 : 0;

        if (availBal <= 0) {
          const err: any = new Error(`Você não possui saldo de ${baseCcy} na sua conta Trading da OKX para vender no Spot.`);
          err.code = "NO_BALANCE";
          throw err;
        }

        const targetQty = resolvedSellAll || resolvedQty >= availBal * 0.85 ? availBal : Math.min(resolvedQty, availBal);
        szStr = formatOkxStep(targetQty, filters.lotSz, "floor");
        const finalSellQty = parseFloat(szStr);
        const minSzNum = parseFloat(filters.minSz) || 0;
        const estUsd = resolvedPrice && resolvedPrice > 0 ? finalSellQty * resolvedPrice : (resolvedTotalVal || 0);

        if (finalSellQty <= 0 || finalSellQty < minSzNum || (estUsd > 0 && estUsd < 1.0)) {
          const err: any = new Error(
            `Quantidade de ${baseCcy} (${szStr}) é inferior ao mínimo exigido pela OKX (minSz: ${filters.minSz}).`
          );
          err.code = "MIN_NOTIONAL_DUST";
          err.residualUsdt = estUsd;
          err.baseAsset = baseCcy;
          throw err;
        }
      }
    } catch (balErr: any) {
      if (balErr?.code === "NO_BALANCE" || balErr?.code === "MIN_NOTIONAL_DUST") {
        throw balErr;
      }
      // Prossegue com szStr sanitizado caso a consulta pontual de saldo oscile
    }
  }

  const buildOrderPayload = (tdMode: "cash" | "cross") => {
    const payload: Record<string, any> = {
      instId,
      tdMode,
      side: normalizedSide,
      ordType: normalizedOrdType,
      clOrdId,
    };

    if (tdMode === "cross") {
      payload.ccy = "USDT";
    }

    if (normalizedOrdType === "market") {
      if (normalizedSide === "buy") {
        // Na OKX, ordens a mercado de compra Spot usam tgtCcy para comprar por montante nocional USDT
        if (resolvedTotalVal && resolvedTotalVal > 0) {
          payload.tgtCcy = "quote_ccy";
          payload.sz = resolvedTotalVal.toFixed(2);
        } else {
          payload.tgtCcy = "base_ccy";
          payload.sz = szStr;
        }
      } else {
        payload.sz = szStr;
      }
    } else {
      if (!resolvedPrice || resolvedPrice <= 0) {
        throw new Error("Preço limite obrigatório para ordens LIMIT na OKX.");
      }
      payload.px = formatOkxStep(resolvedPrice, filters.tickSz, "round");
      payload.sz = szStr;
    }

    return payload;
  };

  let bodyStr = JSON.stringify(buildOrderPayload("cash"));
  let res = await requestOkxApi("POST", requestPath, bodyStr, resolvedCreds);
  let json = res.json || {};
  let orderData = json.data?.[0] || {};

  const firstAttemptCode = String(orderData.sCode || json.code || "");
  const firstAttemptMsg = String(orderData.sMsg || json.msg || "");
  const firstAttemptRejected =
    res.status < 200 ||
    res.status >= 300 ||
    (json.code !== "0" && json.code !== 0) ||
    (orderData.sCode && String(orderData.sCode) !== "0");

  if (firstAttemptRejected) {
    console.warn(
      `[OKX Order] Tentativa tdMode=cash rejeitada em ${instId} (${normalizedSide}): sCode=${firstAttemptCode} sMsg="${firstAttemptMsg}"`
    );
  }

  // Fallback automático caso a conta OKX esteja em modo Single/Multi-currency Margin (51010)
  // ou a chave permita apenas margem cruzada/Spot específico (50124)
  if (firstAttemptRejected && (firstAttemptCode === "51010" || firstAttemptCode === "50124")) {
    const crossPayload = buildOrderPayload("cross");
    crossPayload.clOrdId = `${clOrdId.slice(0, 30)}x`;
    bodyStr = JSON.stringify(crossPayload);
    res = await requestOkxApi("POST", requestPath, bodyStr, resolvedCreds);
    json = res.json || {};
    orderData = json.data?.[0] || {};
  }

  const finalCode = String(orderData.sCode || json.code || res.status || "");
  const isOrderRejected =
    res.status < 200 ||
    res.status >= 300 ||
    (json.code !== "0" && json.code !== 0) ||
    (orderData.sCode && String(orderData.sCode) !== "0");

  if (isOrderRejected) {
    if (firstAttemptCode === "51010" && finalCode === "50124") {
      throw new Error(
        `Conta OKX recusou modo cash (${firstAttemptCode}: ${firstAttemptMsg}) e a chave não tem permissão de margem cross (${finalCode}). Verifique o modo da conta na OKX (Trading -> Configurações -> Modo de conta).`
      );
    }
    if (finalCode === "50124") {
      const cfg = await fetchOkxAccountConfig(resolvedCreds);
      const perm = cfg?.perm || "";
      const acctLv = cfg?.acctLv || "desconhecido";
      if (perm && !perm.toLowerCase().includes("trade")) {
        throw new Error(
          `Chave API da OKX sem permissão de negociação (perm: ${perm}, código 50124). Acesse OKX → Perfil → API → Editar na sua chave e marque a permissão 'Negociar (Trade)'.`
        );
      }
      if (perm) {
        throw new Error(
          `A OKX recusou a ordem no par ${instId} com código 50124 (perm: ${perm}, conta nível ${acctLv}, detalhe: ${orderData.sMsg || json.msg || firstAttemptMsg || "sem detalhe"}). Se 'Spot' e '${baseCcy}' já estão liberados na chave, esse par pode estar restrito via API na sua conta/região ou exigir modo de conta nível 2 (Single-currency margin).`
        );
      }
      throw new Error(
        "Ordem rejeitada pela OKX (código 50124): esta chave API não possui permissão de negociação no mercado Spot. Acesse OKX → Perfil → API → Editar e habilite 'Trade' + mercado 'Spot' (e verifique se Real vs Demo coincidem)."
      );
    }
    const errorMsg = orderData.sMsg || json.msg || `Erro HTTP ${res.status}`;
    const errCode = orderData.sCode || json.code || res.status;
    throw new Error(`Ordem rejeitada pela OKX: ${errorMsg} (código ${errCode})`);
  }

  let executedQty = normalizedSide === "sell" ? parseFloat(szStr) || resolvedQty : resolvedQty;
  let cummulativeQuoteQty = resolvedTotalVal || 0;

  if (orderData.ordId && normalizedOrdType === "market") {
    try {
      const fillInfo = await getOkxOrderStatus(resolvedSymbol, String(orderData.ordId), resolvedCreds);
      if (fillInfo.executedQty > 0) {
        executedQty = fillInfo.executedQty;
        if (fillInfo.price > 0) {
          cummulativeQuoteQty = parseFloat((fillInfo.executedQty * fillInfo.price).toFixed(4));
        }
      }
    } catch {
      // Mantém estimativa informada se consulta pós-execução ainda estiver propagando
    }
  }

  return {
    orderId: orderData.ordId,
    clientOrderId: orderData.clOrdId,
    status: String(orderData.sCode) === "0" ? "FILLED" : "NEW",
    executedQty,
    cummulativeQuoteQty,
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
  await fetch("/api/okx/login", { method: "DELETE" }).catch(() => { });
}
