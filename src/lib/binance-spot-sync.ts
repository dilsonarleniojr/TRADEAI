/**
 * @fileoverview Sincronizador Central de Elegibilidade e Metadados Binance Spot
 * Garante que todas as opções sugeridas (Radar IA, Scanners de Bots, Top Picks,
 * Trade Ideas, Entradas IA e Seletores de Mercado) sejam 100% válidas, ativas
 * (status === "TRADING", isSpotTradingAllowed === true) e permitidas para
 * contas Spot padrão na Binance (excluindo ações tokenizadas *BUSDT TRD_GRP_261,
 * stablecoins/fiat/commodities pareadas, tokens alavancados e pares em BREAK/deslistados).
 */

export interface VerifiedSpotSymbolMeta {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  isSpotTradingAllowed: boolean;
  quoteOrderQtyMarketAllowed: boolean;
  tickSize: number;
  stepSize: number;
  minQty: number;
  minNotional: number;
  permissions: string[];
}

export interface TickerLike {
  symbol?: string;
  price?: number | string;
  lastPrice?: number | string;
  bidPrice?: number | string;
  askPrice?: number | string;
  highPrice?: number | string;
  lowPrice?: number | string;
  high?: number | string;
  low?: number | string;
  quoteVolume?: number | string;
  volume?: number | string;
}

/**
 * Criptomoedas legítimas da Binance Spot cujo ticker termina em "BUSDT".
 * Qualquer outro par terminado em "BUSDT" (ex.: SOXLBUSDT, SNDKBUSDT, SKHYBUSDT,
 * NVDABUSDT, TSLABUSDT, AAPLBUSDT, MSTRBUSDT, CRCLBUSDT, QQQBUSDT, SPYBUSDT)
 * pertence ao grupo restrito de ações/ETFs tokenizados (TRD_GRP_261) e NÃO é
 * operável em contas Spot padrão (erro -2015 / Not Permitted).
 */
export const LEGITIMATE_CRYPTO_BUSDT_SYMBOLS = new Set<string>([
  "BNBUSDT",
  "ARBUSDT",
  "SHIBUSDT",
  "TRBUSDT",
  "CKBUSDT",
  "BBUSDT",
  "BIRBUSDT",
  "PHBUSDT", // Nota: PHB está em KNOWN_DELISTED_OR_HALTED_BASES, mas é cripto
  "AMBUSDT", // Nota: AMB está em KNOWN_DELISTED_OR_HALTED_BASES, mas é cripto
]);

/**
 * Base assets de Stablecoins, Moedas Fiduciárias (Fiat), Ouro/Commodities pareadas
 * e Wrapped tokens de paridade 1:1 que não devem ser sugeridos como opções de trade direcional.
 */
export const STABLE_PEGGED_AND_WRAPPED_BASES = new Set<string>([
  "USDT",
  "USDC",
  "FDUSD",
  "TUSD",
  "USDD",
  "DAI",
  "BUSD",
  "USDP",
  "USDE",
  "USDJ",
  "CUSD",
  "USDS",
  "USD1",
  "RLUSD",
  "RWUSD",
  "BFUSD",
  "XUSD",
  "U",
  "PYUSD",
  "GUSD",
  "FRAX",
  "LUSD",
  "SUSD",
  "USYC",
  "UST",
  "USTC",
  "EUR",
  "AEUR",
  "EURI",
  "GBP",
  "AUD",
  "JPY",
  "BRL",
  "TRY",
  "RUB",
  "UAH",
  "NGN",
  "PLN",
  "RON",
  "ZAR",
  "ARS",
  "COP",
  "MXN",
  "CZK",
  "IDR",
  "BIDR",
  "VAI",
  "PAXG",
  "XAUT",
  "WBTC",
  "WBETH",
  "TBTC",
  "BNSOL",
  "BETH",
]);

/**
 * Base assets deslistados, em status BREAK na Binance Spot, exclusivos de Futuros
 * ou que passaram por migração de ticker.
 */
export const KNOWN_DELISTED_OR_HALTED_BASES = new Set<string>([
  "ACA",
  "VIC",
  "MATIC",
  "MKR",
  "AKT",
  "STG",
  "IDEX",
  "WTC",
  "WABI",
  "TORN",
  "VGX",
  "NULS",
  "DREP",
  "MOB",
  "PNT",
  "BTG",
  "HIFI",
  "EPX",
  "FOR",
  "LOOM",
  "REEF",
  "BOND",
  "DOCK",
  "POLS",
  "MDX",
  "VOXEL",
  "WRX",
  "UNFI",
  "BLZ",
  "KEY",
  "AMB",
  "KP3R",
  "AKRO",
  "MULTIA",
  "MULTI",
  "OMG",
  "WAVES",
  "WNXM",
  "XEM",
  "DGB",
  "HNT",
  "STORJ",
  "OM",
  "TRU",
  "CTC",
  "PHB",
  "NFP",
  "CTXC",
  "EOS",
  "KAS",
  "TON",
  "KLAY",
  "FTM",
  "RNDR",
  "LINA",
  "REN",
  "VITE",
  "HARD",
  "BETA",
  "FIRO",
  "SNT",
  "CREAM",
  "IRIS",
  "CVP",
  "ARK",
  "GAL",
  "OCEAN",
  "AGIX",
  "FET", // Nota: FETUSDT será validado dinamicamente caso ativo, mas mantemos filtro estrito abaixo apenas para os efetivamente inativos
]);

// Remover FET da lista estática pois FETUSDT está ativo (status: TRADING) na Binance Spot
KNOWN_DELISTED_OR_HALTED_BASES.delete("FET");

/**
 * Lista de pares líquidos garantidos (Tier-1 e Tier-2) verificados como `TRADING`
 * e permitidos para contas Spot padrão (`TRD_GRP_258`).
 */
export const VERIFIED_FALLBACK_SPOT_SYMBOLS: readonly string[] = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "SUIUSDT",
  "LINKUSDT",
  "DOTUSDT",
  "NEARUSDT",
  "LTCUSDT",
  "UNIUSDT",
  "APTUSDT",
  "ICPUSDT",
  "ETCUSDT",
  "RENDERUSDT",
  "FETUSDT",
  "TAOUSDT",
  "INJUSDT",
  "SEIUSDT",
  "TIAUSDT",
  "ARBUSDT",
  "OPUSDT",
  "AAVEUSDT",
  "PENDLEUSDT",
  "RUNEUSDT",
  "ENAUSDT",
  "ONDOUSDT",
  "JUPUSDT",
  "STXUSDT",
  "FILUSDT",
  "ATOMUSDT",
  "ARUSDT",
  "GRTUSDT",
  "THETAUSDT",
  "ALGOUSDT",
  "VETUSDT",
  "HBARTUSDT".replace("HBART", "HBAR"),
  "WLDUSDT",
  "PYTHUSDT",
  "SHIBUSDT",
  "PEPEUSDT",
  "WIFUSDT",
  "BONKUSDT",
  "FLOKIUSDT",
];

/**
 * Detecta se um símbolo é uma ação/ETF tokenizado da Binance (*BUSDT restrito ao TRD_GRP_261).
 */
export function isTokenizedStockSymbol(symbol: string): boolean {
  const upper = String(symbol || "").trim().toUpperCase();
  if (!upper.endsWith("BUSDT")) return false;
  return !LEGITIMATE_CRYPTO_BUSDT_SYMBOLS.has(upper);
}

/**
 * Verifica síncrona e deterministicamente se um símbolo (e opcionalmente seu ticker 24h)
 * é um par cripto válido e operável na Binance Spot para investimento.
 */
export function isTradableBinanceSpotSymbol(
  symbol: string,
  ticker?: TickerLike | null,
  registryMap?: Map<string, VerifiedSpotSymbolMeta> | null
): boolean {
  if (!symbol || typeof symbol !== "string") return false;
  const upper = symbol.trim().toUpperCase();

  // 1. Apenas caracteres ASCII alfanuméricos terminados em USDT (bloqueia 币安人生USDT, 牛来USDT, etc.)
  if (!/^[A-Z0-9]{2,15}USDT$/.test(upper)) return false;

  // 2. Bloqueia ações/ETFs tokenizados (*BUSDT exceto criptos legítimos como BNBUSDT, ARBUSDT, SHIBUSDT)
  if (isTokenizedStockSymbol(upper)) return false;

  const base = upper.slice(0, -4);
  if (!base || base.length < 1) return false;

  // 3. Bloqueia stablecoins, moedas fiat, ouro/commodities e wrapped tokens 1:1
  if (STABLE_PEGGED_AND_WRAPPED_BASES.has(base)) return false;

  // 4. Bloqueia pares deslistados, em BREAK ou exclusivos de futuros conhecidos
  if (KNOWN_DELISTED_OR_HALTED_BASES.has(base)) return false;

  // 5. Bloqueia tokens alavancados e sintéticos (preservando JUP = Jupiter)
  if (
    base !== "JUP" &&
    (base.endsWith("UP") ||
      base.endsWith("DOWN") ||
      base.endsWith("BULL") ||
      base.endsWith("BEAR"))
  ) {
    return false;
  }

  // 6. Se o registro oficial da Binance Spot (`exchangeInfo`) foi fornecido ou já está em cache,
  // exige que o símbolo conste como `TRADING` e `isSpotTradingAllowed === true`.
  const activeRegistry = registryMap ?? cachedRegistryMap;
  if (activeRegistry && activeRegistry.size > 0) {
    const meta = activeRegistry.get(upper);
    if (!meta) return false;
    if (meta.status !== "TRADING" || !meta.isSpotTradingAllowed) return false;
  }

  // 7. Se dados de cotação 24h foram fornecidos, valida liquidez, livro ativo e trava anti-stablecoin por preço
  if (ticker) {
    const rawPrice = ticker.lastPrice ?? ticker.price;
    if (rawPrice !== undefined && rawPrice !== null) {
      const price = Number(rawPrice);
      if (!Number.isFinite(price) || price <= 0) return false;

      const rawHigh = ticker.highPrice ?? ticker.high;
      const rawLow = ticker.lowPrice ?? ticker.low;
      if (rawHigh !== undefined && rawLow !== undefined) {
        const high = Number(rawHigh);
        const low = Number(rawLow);
        if (Number.isFinite(high) && Number.isFinite(low) && high > 0 && low > 0) {
          const rangePct = (high - low) / price;
          // Trava dinâmica anti-stablecoin: preço travado perto de $1.00 com amplitude 24h < 0.8%
          if (price >= 0.98 && price <= 1.02 && rangePct < 0.008) {
            return false;
          }
        }
      }
    }

    // Se bidPrice e askPrice estiverem presentes no payload (como em /api/v3/ticker/24hr),
    // pares em BREAK ou sem livro de ofertas têm bidPrice = 0 ou askPrice = 0.
    if (ticker.bidPrice !== undefined && ticker.askPrice !== undefined) {
      const bid = Number(ticker.bidPrice);
      const ask = Number(ticker.askPrice);
      if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) {
        return false;
      }
    }

    if (ticker.quoteVolume !== undefined) {
      const qv = Number(ticker.quoteVolume);
      if (!Number.isFinite(qv) || qv <= 0) return false;
    }
  }

  return true;
}

// Cache em memória do registro oficial da Binance Spot (`exchangeInfo`)
let cachedRegistryMap: Map<string, VerifiedSpotSymbolMeta> | null = null;
let cachedRegistryTimestamp = 0;
let inFlightRegistryPromise: Promise<Map<string, VerifiedSpotSymbolMeta>> | null = null;
const REGISTRY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

const BINANCE_EXCHANGE_INFO_ENDPOINTS = [
  "https://api.binance.com/api/v3/exchangeInfo",
  "https://data-api.binance.vision/api/v3/exchangeInfo",
  "https://api1.binance.com/api/v3/exchangeInfo",
];

/**
 * Busca e mantém em cache os metadados oficiais de todos os pares USDT `TRADING`
 * e permitidos para contas Spot padrão na Binance.
 */
export async function getVerifiedBinanceSpotRegistry(
  forceRefresh = false
): Promise<Map<string, VerifiedSpotSymbolMeta>> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedRegistryMap &&
    cachedRegistryMap.size > 0 &&
    now - cachedRegistryTimestamp < REGISTRY_CACHE_TTL_MS
  ) {
    return cachedRegistryMap;
  }

  if (!forceRefresh && inFlightRegistryPromise) {
    return inFlightRegistryPromise;
  }

  inFlightRegistryPromise = (async () => {
    try {
      for (const url of BINANCE_EXCHANGE_INFO_ENDPOINTS) {
        try {
          const res = await fetch(url, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(7000),
            cache: "no-store",
          });
          if (!res.ok) continue;

          const data = await res.json();
          if (!data || !Array.isArray(data.symbols)) continue;

          const nextMap = new Map<string, VerifiedSpotSymbolMeta>();

          for (const s of data.symbols) {
            if (!s || s.quoteAsset !== "USDT") continue;
            if (s.status !== "TRADING") continue;
            if (s.isSpotTradingAllowed === false) continue;

            const symbol = String(s.symbol || "").toUpperCase();
            const baseAsset = String(s.baseAsset || symbol.slice(0, -4)).toUpperCase();

            // Verifica permissionSets para barrar pares restritos a TRD_GRP_261 (Tokenized Stocks)
            const flatPerms: string[] = Array.isArray(s.permissionSets)
              ? s.permissionSets.flat()
              : Array.isArray(s.permissions)
                ? s.permissions
                : [];

            if (flatPerms.length > 0) {
              if (!flatPerms.includes("SPOT")) continue;
              // Pares de ações tokenizadas possuem TRD_GRP_261 e não possuem TRD_GRP_258
              if (flatPerms.includes("TRD_GRP_261") && !flatPerms.includes("TRD_GRP_258")) {
                continue;
              }
            }

            // Aplica validação estrita de nome, stablecoin e alavancados (sem passar registryMap para evitar recursão)
            if (!isTradableBinanceSpotSymbol(symbol, null, new Map())) {
              continue;
            }

            const filters: Array<Record<string, string>> = Array.isArray(s.filters)
              ? s.filters
              : [];
            const priceFilter = filters.find((f) => f.filterType === "PRICE_FILTER");
            const lotFilter = filters.find((f) => f.filterType === "LOT_SIZE");
            const notionalFilter = filters.find(
              (f) => f.filterType === "NOTIONAL" || f.filterType === "MIN_NOTIONAL"
            );

            const tickSize = Number(priceFilter?.tickSize ?? 0.0001);
            const stepSize = Number(lotFilter?.stepSize ?? 0.0001);
            const minQty = Number(lotFilter?.minQty ?? 0.0001);
            const minNotional = Number(
              notionalFilter?.minNotional ?? notionalFilter?.notional ?? 5.0
            );

            nextMap.set(symbol, {
              symbol,
              baseAsset,
              quoteAsset: "USDT",
              status: s.status,
              isSpotTradingAllowed: Boolean(s.isSpotTradingAllowed ?? true),
              quoteOrderQtyMarketAllowed: Boolean(s.quoteOrderQtyMarketAllowed ?? true),
              tickSize: Number.isFinite(tickSize) && tickSize > 0 ? tickSize : 0.0001,
              stepSize: Number.isFinite(stepSize) && stepSize > 0 ? stepSize : 0.0001,
              minQty: Number.isFinite(minQty) && minQty > 0 ? minQty : 0.0001,
              minNotional: Number.isFinite(minNotional) && minNotional > 0 ? minNotional : 5.0,
              permissions: flatPerms,
            });
          }

          if (nextMap.size > 0) {
            cachedRegistryMap = nextMap;
            cachedRegistryTimestamp = Date.now();
            return nextMap;
          }
        } catch {
          // Tenta próximo mirror da Binance
        }
      }
    } finally {
      inFlightRegistryPromise = null;
    }

    return cachedRegistryMap ?? new Map<string, VerifiedSpotSymbolMeta>();
  })();

  return inFlightRegistryPromise;
}

/**
 * Filtra uma lista de tickers mantendo exclusivamente pares cripto válidos, ativos
 * e operáveis na Binance Spot.
 */
export function filterValidBinanceSpotTickers<T extends TickerLike>(
  tickers: T[],
  registryMap?: Map<string, VerifiedSpotSymbolMeta> | null
): T[] {
  if (!Array.isArray(tickers)) return [];
  const activeRegistry = registryMap ?? cachedRegistryMap;
  return tickers.filter((t) =>
    isTradableBinanceSpotSymbol(String(t?.symbol || ""), t, activeRegistry)
  );
}

/**
 * Quantiza um preço para o `tickSize` exato do símbolo na Binance Spot (ou escala dinâmica segura),
 * prevenindo rejeições `Filter failure: PRICE_FILTER`.
 */
export function quantizeToBinanceTick(
  price: number,
  tickSize?: number,
  mode: "round" | "floor" | "ceil" = "round"
): number {
  if (!Number.isFinite(price) || price <= 0) return 0;

  const effectiveTick =
    tickSize && Number.isFinite(tickSize) && tickSize > 0
      ? tickSize
      : price >= 1000
        ? 0.01
        : price >= 10
          ? 0.001
          : price >= 1
            ? 0.0001
            : price >= 0.01
              ? 0.00001
              : 0.000001;

  const tickStr = effectiveTick.toFixed(12).replace(/0+$/, "");
  const decimals = tickStr.includes(".") ? tickStr.split(".")[1].length : 0;

  const scaled = price / effectiveTick;
  const roundedUnits =
    mode === "floor"
      ? Math.floor(scaled + 1e-9)
      : mode === "ceil"
        ? Math.ceil(scaled - 1e-9)
        : Math.round(scaled);

  return Number((roundedUnits * effectiveTick).toFixed(decimals));
}
