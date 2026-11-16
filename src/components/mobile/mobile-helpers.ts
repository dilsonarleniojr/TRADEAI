import type { KlineData } from "@/lib/store";
import { useCryptoStore } from "@/lib/store";
import { calculateEMA, calculateRSI, emaSeries } from "@/lib/bot/indicators";
import { detectMarketRegime, type MarketRegime } from "@/lib/bot/quant-engine";
import { structuredLogger } from "@/lib/telemetry/structured-logger";

export type MobileRegimeDisplay = "Trending Bull" | "Trending Bear" | "Ranging" | "High Volatility";

export interface MobileRegimeSummary {
  raw: MarketRegime;
  label: MobileRegimeDisplay;
  tone: "bull" | "bear" | "neutral" | "volatility";
}

export interface MobileIndicatorSnapshot {
  rsi14: number;
  ema9: number;
  ema21: number;
  vwap: number;
  ema9Series: number[];
  ema21Series: number[];
  vwapSeries: number[];
}

export const MOBILE_PAIRS = [
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
] as const;

/** Classifica o regime de mercado atual reutilizando detectMarketRegime(klines) e EMAs. */
export function computeMobileRegime(klines: KlineData[]): MobileRegimeSummary {
  if (!klines || klines.length < 15) {
    return { raw: "NEUTRAL", label: "Ranging", tone: "neutral" };
  }

  const raw = detectMarketRegime(klines);
  const closes = klines.map((k) => k.close);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);

  const recent = klines.slice(-14);
  let rangeSum = 0;
  for (const k of recent) {
    if (k.close > 0) {
      rangeSum += (k.high - k.low) / k.close;
    }
  }
  const avgVolatility = rangeSum / Math.max(1, recent.length);

  if (avgVolatility >= 0.025) {
    return { raw, label: "High Volatility", tone: "volatility" };
  }

  if (raw === "TREND_FOLLOWING") {
    return ema9 >= ema21
      ? { raw, label: "Trending Bull", tone: "bull" }
      : { raw, label: "Trending Bear", tone: "bear" };
  }

  return { raw, label: "Ranging", tone: "neutral" };
}

/** Calcula indicadores técnicos em memória para os gráficos e cartões mobile usando indicators.ts. */
export function computeMobileIndicators(klines: KlineData[]): MobileIndicatorSnapshot {
  if (!klines || klines.length === 0) {
    return { rsi14: 50, ema9: 0, ema21: 0, vwap: 0, ema9Series: [], ema21Series: [], vwapSeries: [] };
  }

  const closes = klines.map((k) => k.close);
  const rsi14 = calculateRSI(closes, 14);
  const ema9Series = emaSeries(closes, 9);
  const ema21Series = emaSeries(closes, 21);

  const vwapSeries: number[] = [];
  let cumPV = 0;
  let cumVol = 0;
  for (const k of klines) {
    const typical = (k.high + k.low + k.close) / 3;
    const vol = k.volume > 0 ? k.volume : 1;
    cumPV += typical * vol;
    cumVol += vol;
    vwapSeries.push(cumVol > 0 ? cumPV / cumVol : k.close);
  }

  const last = closes.length - 1;
  return {
    rsi14,
    ema9: ema9Series[last] ?? closes[last],
    ema21: ema21Series[last] ?? closes[last],
    vwap: vwapSeries[last] ?? closes[last],
    ema9Series,
    ema21Series,
    vwapSeries,
  };
}

/** Formata preço de forma compacta com casas decimais adequadas em fonte monoespaçada. */
export function formatMonoPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "0.00";
  if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

/** Parse seguro de respostas JSON evitando crash caso o servidor devolva HTML. */
export async function safeParseResponseJson(res: Response): Promise<any> {
  try {
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

const activeSliceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Cancela imediatamente todos os fatiamentos TWAP/VWAP em andamento. */
export function cancelAllSlicedExecutions(): number {
  let cancelled = 0;
  for (const [id, timer] of activeSliceTimers.entries()) {
    clearTimeout(timer);
    activeSliceTimers.delete(id);
    cancelled++;
    const store = useCryptoStore.getState();
    const target = store.activeBots.find((b) => b.id === id);
    if (target && target.status === "RUNNING") {
      store.toggleBotInstance(id);
    }
  }
  if (cancelled > 0) {
    structuredLogger.warn("RISK_ENGINE", `⏹️ ${cancelled} lote(s) TWAP/VWAP cancelados pelo operador.`);
  }
  return cancelled;
}

export interface SlicedOrderRequest {
  symbol: string;
  side: "BUY" | "SELL";
  totalUsd: number;
  slices: number;
  algo: "TWAP" | "VWAP";
  exchange: "binance" | "okx";
  tradingMode: "paper" | "live";
  intervalMs?: number;
}

/**
 * Executa ordens fracionadas (TWAP uniforme ou VWAP ponderada) reutilizando /api/trades
 * e reportando ExecutionProgress em tempo real no store para a aba Posições & Ordens.
 */
export function startSlicedOrderExecution(req: SlicedOrderRequest): string {
  const store = useCryptoStore.getState();
  const totalSlices = Math.max(2, Math.min(10, req.slices));
  const sliceIntervalMs = req.intervalMs ?? 5000;

  store.addBotInstance({
    name: `${req.algo} ${req.side} ${req.symbol.replace("USDT", "")}`,
    symbol: req.symbol,
    strategy: req.algo,
    parameters: {
      side: req.side,
      exchange: req.exchange,
      slices: String(totalSlices),
    },
    allocatedMargin: req.totalUsd,
    shadowMode: req.tradingMode === "paper",
    ...({ allocatedCapital: req.totalUsd } as object),
  });

  const created = useCryptoStore.getState().activeBots.at(-1);
  const instanceId = created?.id ?? `slice-${Date.now()}`;

  // Distribuição VWAP dá peso maior às primeiras fatias de liquidez; TWAP divide igualmente.
  const weights: number[] = [];
  let weightSum = 0;
  for (let i = 0; i < totalSlices; i++) {
    const w = req.algo === "VWAP" ? totalSlices - i + 0.5 : 1;
    weights.push(w);
    weightSum += w;
  }

  let currentSlice = 0;
  let executedVol = 0;

  store.updateBotProgress(instanceId, {
    slicesDone: 0,
    totalSlices,
    executedVolume: 0,
    remainingVolume: req.totalUsd,
    estimatedMinutesLeft: Math.max(1, Math.ceil((totalSlices * sliceIntervalMs) / 60000)),
  });

  const runNextSlice = async () => {
    const st = useCryptoStore.getState();
    const botEntry = st.activeBots.find((b) => b.id === instanceId);
    if (!botEntry || botEntry.status !== "RUNNING") {
      activeSliceTimers.delete(instanceId);
      return;
    }

    const sliceNotional = parseFloat(((req.totalUsd * weights[currentSlice]) / weightSum).toFixed(2));
    const currentPrice = st.tickers[req.symbol]?.price || 0;
    if (currentPrice <= 0) {
      structuredLogger.warn("MARKET_DATA", `[${req.algo}] Preço indisponível para ${req.symbol}, aguardando próximo ciclo.`);
    } else {
      const qty = parseFloat((sliceNotional / currentPrice).toFixed(6));
      try {
        const res = await fetch("/api/trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: req.symbol,
            side: req.side,
            price: currentPrice,
            quantity: qty,
            total: sliceNotional,
            strategy: `${req.algo} (${currentSlice + 1}/${totalSlices})`,
            mode: req.tradingMode,
            exchange: req.exchange,
            orderType: "MARKET",
          }),
        });
        const json = await safeParseResponseJson(res);
        if (res.ok && json?.success) {
          if (json.data) st.addTrade(json.data);
          if (json.account) st.setAccount(json.account);
          executedVol = parseFloat((executedVol + sliceNotional).toFixed(2));
          structuredLogger.info(
            "BINANCE_API",
            `[${req.algo}] Fatia ${currentSlice + 1}/${totalSlices} ${req.side} ${req.symbol} ($${sliceNotional}) executada.`
          );
        } else {
          structuredLogger.error(
            "BINANCE_API",
            `[${req.algo}] Falha na fatia ${currentSlice + 1}: ${json?.error || `HTTP ${res.status}`}`
          );
        }
      } catch (err: any) {
        structuredLogger.error("BINANCE_API", `[${req.algo}] Erro de rede na fatia ${currentSlice + 1}: ${err?.message}`);
      }
    }

    currentSlice++;
    const remainingSlices = totalSlices - currentSlice;
    useCryptoStore.getState().updateBotProgress(instanceId, {
      slicesDone: currentSlice,
      totalSlices,
      executedVolume: executedVol,
      remainingVolume: Math.max(0, parseFloat((req.totalUsd - executedVol).toFixed(2))),
      estimatedMinutesLeft: remainingSlices > 0 ? Math.max(1, Math.ceil((remainingSlices * sliceIntervalMs) / 60000)) : 0,
    });

    if (currentSlice < totalSlices) {
      const t = setTimeout(runNextSlice, sliceIntervalMs);
      activeSliceTimers.set(instanceId, t);
    } else {
      activeSliceTimers.delete(instanceId);
      const latest = useCryptoStore.getState().activeBots.find((b) => b.id === instanceId);
      if (latest && latest.status === "RUNNING") {
        useCryptoStore.getState().toggleBotInstance(instanceId);
      }
    }
  };

  runNextSlice();
  return instanceId;
}
