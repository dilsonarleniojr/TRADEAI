// Motor de decisão de entrada. É o ÚNICO lugar que decide se um robô compra.
// A frota (multi-bot-engine) e o painel "Motores" usam as mesmas funções,
// então o que o painel mostra é exatamente o que o robô enxerga.

import type { AISignalData, BotEntryCheck, BotInstance, KlineData, TickerData } from "@/lib/store";
import {
  averageVolume,
  calculateBollinger,
  calculateMACD,
  calculateRSI,
  emaSeries,
  relativeATR,
  calculateADX,
  calculatePivotPoints,
  checkResistanceProximity,
  calculateTechnicalScannerScore,
} from "./indicators";
import {
  checkRelativeStrength,
  ensembleDecision,
  regimeFromADX,
  ADX_RANGE,
  ADX_TREND,
  type MarketRegime,
  type ModelVotes,
  type QuantVote,
  type StrengthCheck,
} from "./quant-engine";
import { getStrategy, VOLATILITY_VETO_LIMIT } from "./strategy-catalog";
import type { OrderBookAnalysis } from "@/lib/bot/order-book-cache";
import { riskManager } from "./risk-manager";
import { MathematicalExpectancyGate } from "./mathematical-expectancy-gate";

export const MIN_CANDLES = 25;

export interface MarketAnalysis {
  ready: boolean;
  adx: number | null;
  regime: MarketRegime;
  relATR: number;
  vetoed: boolean;
  votes: ModelVotes;
  voteDetails: { trend: string; momentum: string; flow: string };
  committee: QuantVote;
  strength: StrengthCheck;
  rsi: number;
}

export interface EntryDecision {
  shouldBuy: boolean;
  reason: string;
  checks: BotEntryCheck[];
  suggestedTp?: number;
  suggestedSl?: number;
  relATR?: number;
  expectedValuePercent?: number;
  suggestedNavPercent?: number;
}

const DEFAULT_FAST = 9;
const DEFAULT_SLOW = 21;

/** Leitura completa do ativo: regime, risco, votos do comitê e força vs BTC. */
export function analyzeMarket(
  symbol: string,
  ticker: TickerData,
  btcTicker: TickerData | undefined,
  klines: KlineData[],
  params: { emaFast?: number; emaSlow?: number; rsiPeriod?: number } = {}
): MarketAnalysis {
  const strength = checkRelativeStrength(symbol, ticker, btcTicker);
  const empty: MarketAnalysis = {
    ready: false,
    adx: null,
    regime: "NEUTRAL",
    relATR: 0,
    vetoed: false,
    votes: { trend: "HOLD", momentum: "HOLD", flow: "HOLD" },
    voteDetails: { trend: "sem dados", momentum: "sem dados", flow: "sem dados" },
    committee: "HOLD",
    strength,
    rsi: 50,
  };
  if (klines.length < MIN_CANDLES) return empty;

  const closes = klines.map((k) => k.close);
  const last = klines[klines.length - 1];
  const prevCandle = klines.length >= 2 ? klines[klines.length - 2] : last;
  const fastP = params.emaFast ?? DEFAULT_FAST;
  const slowP = params.emaSlow ?? DEFAULT_SLOW;

  const adx = calculateADX(klines, 14);
  const atr = relativeATR(klines);
  const rsi = calculateRSI(closes, params.rsiPeriod ?? 14);

  // Tendência: EMA rápida vs lenta
  const fast = emaSeries(closes, fastP);
  const slow = emaSeries(closes, slowP);
  const fastNow = fast[fast.length - 1];
  const slowNow = slow[slow.length - 1];
  const trend: QuantVote = fastNow > slowNow ? "BUY" : fastNow < slowNow ? "SELL" : "HOLD";

  // Momentum: histograma MACD + RSI fora de sobrecompra (captura impulsos e apoios de suporte)
  const macd = calculateMACD(closes, 12, 26, 9);
  const hist = macd?.histogram ?? 0;
  const isHealthyPullback = hist >= -0.0008 && fastNow >= slowNow && rsi >= 45 && rsi <= 68;
  const momentum: QuantVote = macd
    ? (hist > 0 && rsi <= 68) || isHealthyPullback
      ? "BUY"
      : hist < -0.002 || rsi > 74
        ? "SELL"
        : "HOLD"
    : "HOLD";

  // Fluxo: avalia volume e direção com rigor institucional (rejeita candles com pavio superior de exaustão)
  const avgVol = averageVolume(klines, 20, 1);
  const prevStrong = avgVol > 0 && prevCandle.volume >= avgVol * 0.6 && prevCandle.close >= prevCandle.open;
  const currentGreen = last.close >= last.open;
  const currentVolumeGood = avgVol > 0 && last.volume >= avgVol * 0.45;
  const isHoldingEmaSupport = last.close >= fastNow * 0.997 && rsi >= 40 && rsi <= 68;

  // Rejeição de pavio superior (Bull trap / exaustão compradora)
  // Só qualifica rejeição de topo se o candle tiver amplitude real perceptível (≥ 0.15% do preço)
  // e o fechamento estiver esticado acima da EMA rápida (evitando falso veto por ruído de fração de centavo)
  const candleRange = last.high - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  const hasRealRange = last.close > 0 && candleRange >= (last.close * 0.0015);
  const isTopRejection = hasRealRange && (last.close >= fastNow * 1.002) && candleRange > 0 && (upperWick / candleRange) >= 0.50;

  // Voto de fluxo calibrado:
  // BUY: impulso comprador ativo ou sustentação sobre médias com suporte
  // SELL: rejeição explícita de topo com volume ou candle vermelho de despejo (> 1.3x) perdendo a média
  // HOLD: consolidação normal ou recuos saudáveis
  const isHealthyGreen = currentGreen && currentVolumeGood;
  const isSustainedBreak = prevStrong && currentGreen && !isTopRejection;
  const flow: QuantVote = (!isTopRejection && (isHealthyGreen || isSustainedBreak || isHoldingEmaSupport))
    ? "BUY"
    : (isTopRejection || (last.close < last.open && avgVol > 0 && last.volume > avgVol * 1.3 && last.close < fastNow * 0.997))
      ? "SELL"
      : "HOLD";

  const votes: ModelVotes = { trend, momentum, flow };

  return {
    ready: true,
    adx,
    regime: regimeFromADX(adx),
    relATR: atr,
    vetoed: atr >= VOLATILITY_VETO_LIMIT,
    votes,
    voteDetails: {
      trend: `EMA${fastP} ${fastNow >= slowNow ? ">" : "<"} EMA${slowP}`,
      momentum: macd ? `MACD ${hist >= 0 ? "+" : ""}${hist.toFixed(4)} · RSI ${rsi.toFixed(0)} (máx ≤ 65)` : "poucos candles",
      flow: avgVol > 0 ? `Vol ${(last.volume / avgVol).toFixed(1)}× média · ${currentGreen ? "verde" : "vermelho"}${isTopRejection ? " (rejeição)" : ""}` : "sem volume",
    },
    committee: ensembleDecision(votes),
    strength,
    rsi,
  };
}

interface SignalResult {
  ok: boolean;
  detail: string;
}

/** Regra de compra da estratégia escolhida no robô (ver strategy-catalog.ts). */
export function evaluateStrategySignal(
  bot: Pick<
    BotInstance,
    "strategy" | "symbol" | "buyThreshold" | "rsiPeriod" | "emaFast" | "emaSlow" | "signalConfidenceThreshold"
  >,
  klines: KlineData[],
  analysis: MarketAnalysis,
  aiSignals: AISignalData[],
  klines15m?: KlineData[]
): SignalResult {
  const closes = klines.map((k) => k.close);
  const last = klines[klines.length - 1];
  const prevCandle = klines.length >= 2 ? klines[klines.length - 2] : last;

  switch (bot.strategy) {
    case "QUANT_ENSEMBLE": {
      const { votes } = analysis;
      if (analysis.rsi > 74) {
        return { ok: false, detail: `RSI (${analysis.rsi.toFixed(0)}) sobrecomprado no topo (máx ≤ 74)` };
      }
      if (votes.flow === "SELL") {
        return { ok: false, detail: "bloqueado por pressão vendedora acentuada no fluxo de volume" };
      }

      const fastP = bot.emaFast ?? DEFAULT_FAST;
      const slowP = bot.emaSlow ?? DEFAULT_SLOW;
      const fast = emaSeries(closes, fastP);
      const slow = emaSeries(closes, slowP);
      const slowNow = slow[slow.length - 1];

      const buys = [votes.trend, votes.momentum, votes.flow].filter((v) => v === "BUY").length;
      // Pullback com momentum positivo apoiado sobre a média
      const isHoldingSupport = last.close >= slowNow * 0.995 && analysis.rsi >= 38 && analysis.rsi <= 68;
      const isPullbackBuy = votes.momentum === "BUY" && isHoldingSupport && buys >= 1;
      const isTrendBuy = buys >= 2 && votes.trend !== "SELL";

      const ok = isTrendBuy || isPullbackBuy;
      return {
        ok,
        detail: ok
          ? `${buys}/3 análises favoráveis (${isPullbackBuy ? "pullback com momentum" : "tendência ativa"} · RSI ${analysis.rsi.toFixed(0)})`
          : votes.trend === "SELL" && !isPullbackBuy
            ? "aguarda alinhamento altista ou repique com momentum em suporte"
            : `${buys}/3 análises favoráveis — aguardando confirmação adicional`,
      };
    }

    case "RSI": {
      const period = bot.rsiPeriod || 14;
      const rsi = calculateRSI(closes, period);
      const limit = bot.buyThreshold || 35;
      const isOversold = rsi <= limit;
      // Repique de sobrevenda: exige candle verde OU rompimento de máxima anterior (confirmação obrigatória de reversão Anti-Faca Caindo)
      const isReversalCandle = last.close > last.open && (prevCandle ? last.close > prevCandle.high : true);
      const isOversoldBounce = isOversold && (last.close >= last.open || isReversalCandle);
      const isRebound = rsi <= limit + 8 && isReversalCandle;
      // Suporte em tendência: exige tendência altista (fast > slow) e candle de alta sustentando acima da média rápida
      const fastP = bot.emaFast ?? DEFAULT_FAST;
      const slowP = bot.emaSlow ?? DEFAULT_SLOW;
      const fast = emaSeries(closes, fastP);
      const slow = emaSeries(closes, slowP);
      const fastNow = fast[fast.length - 1];
      const slowNow = slow[slow.length - 1];
      const isTrendBullish = fastNow > slowNow;
      const isPullbackSupport = isTrendBullish && rsi >= 38 && rsi <= 62 && last.close > fastNow && last.close >= last.open;
      const ok = isOversoldBounce || isRebound || isPullbackSupport;
      return {
        ok,
        detail: isOversoldBounce
          ? `RSI(${period}) ${rsi.toFixed(1)} com repique de sobrevenda confirmado (candle verde)`
          : isOversold
            ? `RSI(${period}) ${rsi.toFixed(1)} em sobrevenda (≤ ${limit}), aguardando candle comprador de confirmação (Anti-Faca Caindo)`
            : isRebound
              ? `RSI(${period}) ${rsi.toFixed(1)} com repique altista confirmado`
              : isPullbackSupport
                ? `RSI(${period}) ${rsi.toFixed(1)} em suporte com EMA${fastP} > EMA${slowP}`
                : `RSI(${period}) ${rsi.toFixed(1)} — aguarda sobrevenda com confirmação ou repique em suporte`,
      };
    }

    case "MACD": {
      const macd = calculateMACD(closes, bot.emaFast || 12, bot.emaSlow || 26, 9);
      if (!macd) return { ok: false, detail: "poucos candles para o MACD" };
      
      const freshCross = macd.prevHistogram <= 0 && macd.histogram > 0;
      const accelerating = macd.histogram > macd.prevHistogram && macd.histogram > 0;
      // Sustentação positiva acima da linha zero em momentum altista
      const positiveMomentum = macd.histogram > 0 && (last.close >= last.open || prevCandle.close >= prevCandle.open);
      // Reversão precoce: histograma virando para cima
      const turningUp = macd.histogram > macd.prevHistogram && (last.close >= last.open || last.close >= prevCandle.close * 0.999);
      const momentumOk = freshCross || accelerating || positiveMomentum || turningUp;

      const rsiOk = analysis.rsi <= 74;
      const candleRange = last.high - last.low;
      const upperWick = last.high - Math.max(last.open, last.close);
      const hasRealRange = last.close > 0 && candleRange >= (last.close * 0.0015);
      const fast = emaSeries(closes, 9);
      const fastNow = fast[fast.length - 1];
      const isWickTrap = hasRealRange && last.close >= fastNow * 1.002 && (upperWick / candleRange) >= 0.50;

      const ok = momentumOk && rsiOk && !isWickTrap;
      return {
        ok,
        detail: !momentumOk
          ? "histograma MACD desacelerando — aguardando reversão altista"
          : !rsiOk
            ? `RSI sobrecomprado (${analysis.rsi.toFixed(0)} > 74) no topo do movimento`
            : isWickTrap
              ? "rejeição de topo com pavio superior em candle esticado (risco de bull trap)"
              : freshCross
                ? "cruzamento altista fresco do MACD acima do sinal"
                : turningUp
                  ? `curvatura altista do MACD (+${macd.histogram.toFixed(4)}) com momentum ativo`
                  : `impulso altista do MACD (+${macd.histogram.toFixed(4)}) com RSI saudável`,
      };
    }

    case "EMA_CROSS": {
      const fastP = bot.emaFast || 9;
      const slowP = bot.emaSlow || 21;
      const fast = emaSeries(closes, fastP);
      const slow = emaSeries(closes, slowP);
      const fastNow = fast[fast.length - 1];
      const slowNow = slow[slow.length - 1];
      const fastPrev = fast[fast.length - 2] ?? fastNow;
      const slowPrev = slow[slow.length - 2] ?? slowNow;

      const crossedUp = fastPrev <= slowPrev && fastNow > slowNow;
      const bullishTrend = fastNow > slowNow && last.close >= fastNow * 0.997; // sustentando sobre a média rápida
      const rsiOk = analysis.rsi <= 68;

      const ok = (crossedUp || bullishTrend) && rsiOk;
      return {
        ok,
        detail: crossedUp
          ? `EMA${fastP} cruzou para cima da EMA${slowP}`
          : bullishTrend
            ? `EMA${fastP} > EMA${slowP} com preço sustentando sobre a média`
            : `EMA${fastP} < EMA${slowP} — aguardando cruzamento altista`,
      };
    }

    case "BREAKOUT": {
      // Rompimento Institucional Rigoroso:
      // 1. Rompimento de pivô/resistência recente (últimos 15 candles), OU
      // 2. Rompimento de continuação de alta com volume institucional comprovado (≥ 1.6x)
      const prevPivot = klines.slice(-16, -1);
      const resistance = prevPivot.length > 0 ? Math.max(...prevPivot.map((k) => k.high)) : last.close;
      const avgVol = averageVolume(klines, 20, 1);
      const volMult = avgVol > 0 ? last.volume / avgVol : 0;
      const prevVolMult = avgVol > 0 && klines.length >= 2 ? klines[klines.length - 2].volume / avgVol : 0;
      const effectiveVol = Math.max(volMult, prevVolMult);

      const fastEma = emaSeries(closes, 9);
      const slowEma = emaSeries(closes, 21);
      const fastNow = fastEma[fastEma.length - 1];
      const slowNow = slowEma[slowEma.length - 1];
      const prevCandle = klines.length >= 2 ? klines[klines.length - 2] : last;

      // Exige rompimento limpo acima da resistência com volume institucional (≥ 1.6x)
      const isPivotBreak = last.close > resistance && effectiveVol >= 1.6;
      const isTrendContinuation = fastNow > slowNow && last.close > prevCandle.high && last.close >= last.open && effectiveVol >= 1.6;

      const broke = isPivotBreak || isTrendContinuation;
      const strong = effectiveVol >= 1.5;

      const candleRange = last.high - last.low;
      const upperWick = last.high - Math.max(last.open, last.close);
      const isWickTrap = candleRange > 0 && (upperWick / candleRange) >= 0.35;
      const rsiOk = analysis.rsi >= 45 && analysis.rsi <= 68;

      const ok = broke && strong && !isWickTrap && rsiOk;
      return {
        ok,
        detail: !broke
          ? `aguardando rompimento real ($${last.close.toFixed(4)} ≤ $${resistance.toFixed(4)}) com volume institucional`
          : !strong
            ? `volume insuficiente (${effectiveVol.toFixed(1)}× — precisa ≥ 1.5× para evitar bull trap)`
            : isWickTrap
              ? `rejeição de topo com pavio superior longo (${((upperWick / candleRange) * 100).toFixed(0)}%) — perigo de falso rompimento`
              : !rsiOk
                ? `RSI fora da zona ideal (${analysis.rsi.toFixed(0)} — precisa entre 45 e 68)`
                : `rompimento institucional confirmado (${isPivotBreak ? "pivô 15p" : "continuação"}) com volume ${effectiveVol.toFixed(1)}×`,
      };
    }

    case "MEAN_REVERSION": {
      const boll = calculateBollinger(closes, 20, 2);
      if (!boll) return { ok: false, detail: "poucos candles para Bollinger" };
      // 🛡️ Filtro Rigoroso de Reversão à Média Institucional:
      // Exige estritamente percentB <= 0.20 (preço no fundo da banda de Bollinger)
      // E rejeição compradora (candle verde ou martelo de absorção)
      // E RSI em sobrevenda ou repique inicial (RSI <= 42)
      const candleRange = last.high - last.low;
      const lowerWick = Math.min(last.open, last.close) - last.low;
      const isHammer = candleRange > 0 && (lowerWick / candleRange) >= 0.30;
      const isGreenCandle = last.close >= last.open;
      const hasSupportRejection = isGreenCandle || isHammer;
      const isRsiFavorable = analysis.rsi <= 42;
      const inBuyZone = boll.percentB <= 0.20 && hasSupportRejection && isRsiFavorable;

      return {
        ok: inBuyZone,
        detail: !inBuyZone
          ? boll.percentB > 0.20
            ? `preço fora do fundo da banda (${(boll.percentB * 100).toFixed(0)}% > 20% — bloqueado para não comprar no topo/meio)`
            : !isRsiFavorable
            ? `RSI ${analysis.rsi.toFixed(0)} muito alto para reversão à média (precisa ≤ 42)`
            : `fundo atingido (${(boll.percentB * 100).toFixed(0)}%), aguardando candle comprador de absorção`
          : `reversão confirmada no fundo da banda (${(boll.percentB * 100).toFixed(0)}% ≤ 20%) com rejeição compradora e RSI ${analysis.rsi.toFixed(0)}`,
      };
    }

    case "GRID": {
      const window = klines.slice(-60);
      const lo = Math.min(...window.map((k) => k.low));
      const hi = Math.max(...window.map((k) => k.high));
      const rangePct = lo > 0 ? ((hi - lo) / lo) * 100 : 0;
      const pos = hi > lo ? (last.close - lo) / (hi - lo) : 0.5;
      const sideways = rangePct <= 10;
      const inBuyZone = pos <= 0.60;
      return {
        ok: sideways && inBuyZone,
        detail: `faixa de 60 candles de 1m: ${rangePct.toFixed(1)}% ${sideways ? "(canal 1m válido)" : "(muito ampla > 10%)"} · preço em ${(pos * 100).toFixed(0)}% (compra ≤ 60%)`,
      };
    }

    case "AI": {
      const minConf = bot.signalConfidenceThreshold ?? 70; // em %
      const signal = aiSignals.find((s) => s.symbol === bot.symbol);
      if (!signal) return { ok: false, detail: "nenhum sinal da IA para este ativo" };

      // 🛡️ Data Freshness Guardrail: Sinais de IA devem ter no máximo 10 minutos
      if (signal.createdAt) {
        const signalAgeMs = Date.now() - new Date(signal.createdAt).getTime();
        if (signalAgeMs > 10 * 60 * 1000) {
          const ageMin = Math.round(signalAgeMs / 60000);
          return { ok: false, detail: `sinal de IA obsoleto (${ageMin}m atrás > teto de 10m) — aguardando nova análise fresca` };
        }
      }

      // O store guarda a confiança dos sinais em 0–1; aceita também 0–100 por segurança.
      const confPct = signal.confidence <= 1 ? signal.confidence * 100 : signal.confidence;
      const isConfOk = signal.action === "BUY" && confPct >= minConf;
      if (!isConfOk) {
        return { ok: false, detail: `IA: ${signal.action} com ${confPct.toFixed(0)}% de confiança (precisa de COMPRA ≥ ${minConf}%)` };
      }

      // 🛡️ Mitigação de Confiança Cega em IA: O comitê quantitativo institucional NÃO pode vetar com SELL
      if (analysis.committee === "SELL") {
        return { ok: false, detail: `IA indica COMPRA (${confPct.toFixed(0)}%), mas Comitê Quantitativo indica VENDA — confluência ausente` };
      }

      // Validação de confluência macro 15m se klines estiver disponível
      if (klines15m && klines15m.length >= 10) {
        const closes15 = klines15m.map((k) => k.close);
        const ema21_15 = emaSeries(closes15, 21);
        const lastClose15 = closes15[closes15.length - 1];
        const lastEma21_15 = ema21_15[ema21_15.length - 1];
        if (lastClose15 < lastEma21_15 * 0.995) {
          return { ok: false, detail: `IA indica COMPRA, mas ativo abaixo da EMA21 de 15m ($${lastClose15.toFixed(4)} < $${lastEma21_15.toFixed(4)}) — tendência macro fraca` };
        }
      }

      // Validação técnica complementar: exige confirmação de candle comprador ou sustentação na EMA9
      const closes = klines.map((k) => k.close);
      const ema9 = emaSeries(closes, 9);
      const lastEma = ema9[ema9.length - 1];
      const lastCandle = klines[klines.length - 1];
      const isGreenOrRebound = lastCandle.close >= lastCandle.open || (prevCandle && lastCandle.close > prevCandle.close);
      if (!isGreenOrRebound) {
        return { ok: false, detail: `IA indica COMPRA (${confPct.toFixed(0)}%), mas candle 1m em queda — aguardando candle comprador de confirmação (Anti-Faca Caindo)` };
      }

      return { ok: true, detail: `IA: COMPRA confirmada com ${confPct.toFixed(0)}% de confiança e confluência quantitativa` };
    }

    default:
      return { ok: false, detail: `estratégia "${bot.strategy}" sem regra no motor` };
  }
}

export interface EntryDecision {
  shouldBuy: boolean;
  /** Frase curta para o cartão do robô e para o log. */
  reason: string;
  checks: BotEntryCheck[];
}

/**
 * Decisão final de entrada: sinal da estratégia + veto de volatilidade (sempre)
 * + filtros opcionais do robô. Todo filtro só pode BLOQUEAR; nenhum força uma compra.
 */
export function evaluateEntry(
  bot: BotInstance,
  ticker: TickerData,
  btcTicker: TickerData | undefined,
  klines: KlineData[],
  aiSignals: AISignalData[],
  klines15m?: KlineData[],
  orderBook?: OrderBookAnalysis
): EntryDecision {
  const evalSymbol = (ticker?.symbol && ticker.symbol !== "AUTO") ? ticker.symbol : bot.symbol;
  const analysis = analyzeMarket(evalSymbol, ticker, btcTicker, klines, {
    emaFast: bot.emaFast,
    emaSlow: bot.emaSlow,
    rsiPeriod: bot.rsiPeriod,
  });

  if (!analysis.ready) {
    const checks = [{ label: "Dados", ok: false, detail: `aguardando ${MIN_CANDLES} candles de 1m (tem ${klines.length})` }];
    return { shouldBuy: false, reason: checks[0].detail, checks };
  }

  const checks: BotEntryCheck[] = [];

  // 🛡️ PISO UNIVERSAL DE LIQUIDEZ E VOLUME 24H (Guardrail Institucional para TODOS os Robôs):
  // Previne armadilhas de baixa liquidez e spreads largos que causam derrapagem e falsos stops
  // (ex: pares de baixa liquidez onde qualquer ordem a mercado gera perda instantânea)
  const vol24h = ticker.quoteVolume ?? 0;
  const isMajorPair = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"].includes(evalSymbol);
  const minRequiredVol24h = isMajorPair ? 5_000_000 : 10_000_000;
  const isLiquiditySufficient = vol24h >= minRequiredVol24h;

  checks.push({
    label: "Liquidez 24h",
    ok: isLiquiditySufficient,
    detail: isLiquiditySufficient
      ? `Volume 24h robusto ($${(vol24h / 1e6).toFixed(1)}M ≥ $${(minRequiredVol24h / 1e6).toFixed(0)}M)`
      : `Volume 24h insuficiente ($${(vol24h / 1e6).toFixed(1)}M < $${(minRequiredVol24h / 1e6).toFixed(0)}M) — risco de spread tóxico e baixa liquidez`,
  });

  // Filtro Auto-Screener: Se ativo (e sem override manual forçado pelo operador), exige momentum seguro e bloqueia exaustão
  if ((bot.useAutoScreener || bot.symbol === "AUTO") && (!bot.overrideSymbol || bot.overrideSymbol === "AUTO")) {
    const change24h = ticker.priceChangePercent ?? 0;
    const vol = ticker.quoteVolume ?? 0;
    const currentPrice = ticker.price || 0;
    const isExhausted = change24h > 18.0;
    const isSubPenny = currentPrice > 0 && currentPrice < 0.005;
    const isMomentumValid = change24h >= 0.5 && !isExhausted;
    const isVolumeValid = vol >= 10_000_000;
    const isHotCandidate = isMomentumValid && isVolumeValid && !isSubPenny;
    checks.push({
      label: "Auto-Screener Alta",
      ok: isHotCandidate,
      detail: isExhausted
        ? `Ativo em exaustão parabólica (+${change24h.toFixed(1)}% 24h > teto de +18%) — bloqueado contra compra no topo (Anti-FOMO)`
        : isSubPenny
          ? `Cotação sub-penny ($${currentPrice.toFixed(4)} < $0.005) — bloqueado contra spread tóxico`
          : isHotCandidate
            ? `Líder em momentum saudável (+${change24h.toFixed(1)}% 24h, Vol US$ ${(vol / 1e6).toFixed(1)}M)`
            : `Ativo sem liquidez/momentum suficiente (+${change24h.toFixed(1)}% 24h, Vol US$ ${(vol / 1e6).toFixed(1)}M — precisa entre +0.5% e +18.0% e Vol ≥ $10M)`,
    });
  } else if (bot.overrideSymbol && bot.overrideSymbol !== "AUTO") {
    checks.push({
      label: "Override Manual",
      ok: true,
      detail: `Fixação manual no par ${bot.overrideSymbol.replace("USDT", "")}/USDT por decisão direta do operador`,
    });
  }

  const signal = evaluateStrategySignal({ ...bot, symbol: evalSymbol }, klines, analysis, aiSignals, klines15m);
  checks.push({ label: "Estratégia", ok: signal.ok, detail: signal.detail });

  checks.push({
    label: "Veto de volatilidade",
    ok: !analysis.vetoed,
    detail: `ATR ${(analysis.relATR * 100).toFixed(1)}% (bloqueia ≥ ${VOLATILITY_VETO_LIMIT * 100}%)`,
  });

  // Filtro de Spread e Livro de Ofertas: Veta entradas com spread alargado ou livro dominado por vendedores
  if (bot.useOrderBookFilter !== false && orderBook) {
    const isSpreadTolerable = typeof orderBook.spreadPercent === "number" ? orderBook.spreadPercent <= 0.12 : true;
    const isOrderBookOk = orderBook.ok && isSpreadTolerable;
    checks.push({
      label: "Livro & Spread",
      ok: isOrderBookOk,
      detail: !isSpreadTolerable
        ? `Spread do livro muito aberto (${orderBook.spreadPercent.toFixed(2)}% > 0.12%) — risco severo de slippage`
        : orderBook.detail,
    });
  }

  // Filtro Multi-Timeframe (15m + 1m): Só compra no 1m se a macro-tendência de 15m estiver altista ou em suporte/repique saudável
  if (bot.useMultiTimeframe !== false) {
    if (klines15m && klines15m.length >= 20) {
      const closes15m = klines15m.map((k) => k.close);
      const fast15 = emaSeries(closes15m, 9);
      const slow15 = emaSeries(closes15m, 21);
      const fastNow15 = fast15[fast15.length - 1];
      const slowNow15 = slow15[slow15.length - 1];
      const lastClose15 = closes15m[closes15m.length - 1];

      const isReversionOrGridStrategy = bot.strategy === "RSI" || bot.strategy === "MEAN_REVERSION" || bot.strategy === "GRID";
      const lastCandle15m = klines15m[klines15m.length - 1];
      const isGreen15m = lastCandle15m.close >= lastCandle15m.open;
      const range15m = lastCandle15m.high - lastCandle15m.low;
      const lowerWick15m = Math.min(lastCandle15m.open, lastCandle15m.close) - lastCandle15m.low;
      const isHammer15m = range15m > 0 && (lowerWick15m / range15m) >= 0.35;
      const hasReversalSupport15m = isGreen15m || isHammer15m;

      // Tendência 15m: altista (fast >= slow) ou suporte em consolidação lateral onde o preço sustenta sobre a média
      const isConsolidationSupport = fastNow15 >= slowNow15 * 0.998 && lastClose15 >= slowNow15 * 0.995;
      const isMacroUptrend = fastNow15 >= slowNow15 || isConsolidationSupport;

      // 🛡️ FIM DA ISENÇÃO DE MACRO: Mesmo estratégias de dip/reversão DEVEM ter suporte confirmado ou repique comprador no 15m
      const trend15mOk = isMacroUptrend
        ? true
        : isReversionOrGridStrategy && hasReversalSupport15m && lastClose15 >= slowNow15 * 0.975;

      const priceAboveEma15m = isMacroUptrend
        ? lastClose15 >= slowNow15 * 0.992 // tolerância para pullback controlado
        : hasReversalSupport15m; // se em correção, exige rejeição de fundo compradora

      // Anti-Exaustão Macro: impede compra se o preço no 15m já estiver esticado > 2.8% acima da EMA rápida
      const distFromEma9Pct15m = fastNow15 > 0 ? ((lastClose15 - fastNow15) / fastNow15) * 100 : 0;
      const is15mOverextended = distFromEma9Pct15m > 2.8;
      const is15mBullish = trend15mOk && priceAboveEma15m && !is15mOverextended;

      checks.push({
        label: "Multi-Timeframe 15m",
        ok: is15mBullish,
        detail: !trend15mOk
          ? isReversionOrGridStrategy
            ? `Tendência 15m em colapso (EMA9 < EMA21 no 15m) sem candle comprador/martelo de absorção (Anti-Faca Caindo)`
            : `Tendência 15m em baixa (EMA9 < EMA21 no 15m) — aguardando alinhamento altista`
          : !priceAboveEma15m
            ? `Preço 15m abaixo da EMA21 ($${lastClose15.toFixed(4)} < $${slowNow15.toFixed(4)}) — aguardando sustentação`
            : is15mOverextended
              ? `Preço 15m esticado (+${distFromEma9Pct15m.toFixed(1)}% acima da EMA9 no 15m) — aguardando pullback macro (Anti-FOMO)`
              : `Tendência 15m favorável (${isMacroUptrend ? "EMA9 > EMA21 e preço sobre suporte" : "repique comprador com absorção de fundo no 15m"})`,
      });
    } else {
      const change24h = ticker.priceChangePercent ?? 0;
      const isNotDumping = change24h >= -0.8;
      checks.push({
        label: "Multi-Timeframe 15m",
        ok: isNotDumping,
        detail: isNotDumping
          ? `Variação 24h favorável (${change24h >= 0 ? "+" : ""}${change24h.toFixed(1)}%) · sincronizando candles 15m`
          : `Ativo em forte queda 24h (${change24h.toFixed(1)}%) — bloqueado para proteção`,
      });
    }
  }

  // 🛡️ Filtro Anti-Topo & Pullback Saudável:
  // Impede compra se o candle de 1m esticou demais acima da EMA9 (> 0.85%) ou se formou exaustão com pavio superior (≥ 35%)
  const closes1m = klines.map((k) => k.close);
  const fastEma1m = emaSeries(closes1m, 9);
  const lastFastEma = fastEma1m[fastEma1m.length - 1];
  const lastCandle = klines[klines.length - 1];
  const candleRange = lastCandle.high - lastCandle.low;
  const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
  const distFromEma9Pct = lastFastEma > 0 ? ((lastCandle.close - lastFastEma) / lastFastEma) * 100 : 0;
  const isExtendedFromEma = distFromEma9Pct > 0.85;

  // Veta por rejeição de topo se o candle tiver pavio superior expressivo (≥ 35% da amplitude)
  const isWideCandle = candleRange > (lastCandle.close * 0.0015);
  const wickRejection = isWideCandle && candleRange > 0 && (upperWick / candleRange) >= 0.35;
  const isFallingKnife = distFromEma9Pct < -1.2;

  const isPullbackHealthy = !wickRejection && !isExtendedFromEma && !isFallingKnife;
  checks.push({
    label: "Anti-Topo & Pullback",
    ok: isPullbackHealthy,
    detail: isExtendedFromEma
      ? `Preço esticado (+${distFromEma9Pct.toFixed(2)}% acima da EMA9 de 1m) — aguardando recuo para a média (Anti-FOMO)`
      : isFallingKnife
        ? `Preço em queda livre (${distFromEma9Pct.toFixed(2)}% abaixo da EMA9 de 1m) — aguardando suporte`
        : wickRejection
          ? `Rejeição vendedora de topo (pavio ${(upperWick / candleRange * 100).toFixed(0)}%) — perigo de falso rompimento`
          : `Preço em suporte saudável (distância da EMA9: ${distFromEma9Pct.toFixed(2)}%)`,
  });

  // 🛡️ Filtro de Regime Macro do Bitcoin (BTCUSDT Guardrail):
  // Se o ativo for uma altcoin, veta compra se o BTC estiver em forte queda no dia (≤ -1.2%) (se ativo pelo usuário)
  if (evalSymbol !== "BTCUSDT" && btcTicker) {
    const isFilterActive = riskManager.getProtectionSettings().btcMacroFilter;
    const btcChange = btcTicker.priceChangePercent ?? 0;
    const isBtcSevereDrop = btcChange <= -1.2;
    checks.push({
      label: "Regime Macro BTC",
      ok: !isFilterActive || !isBtcSevereDrop,
      detail: !isFilterActive
        ? `Filtro macro BTC desativado pelo usuário (${btcChange >= 0 ? "+" : ""}${btcChange.toFixed(1)}% 24h)`
        : isBtcSevereDrop
        ? `Bitcoin em forte queda (${btcChange.toFixed(1)}% 24h) — altcoins bloqueadas para proteção contra despejo em cascata`
        : `Bitcoin estável (${btcChange >= 0 ? "+" : ""}${btcChange.toFixed(1)}% 24h) — ambiente macro favorável`,
    });
  }

  if (bot.useMarketRegime) {
    const style = getStrategy(bot.strategy)?.style ?? "HYBRID";
    const adx = analysis.adx;
    const adxText = adx === null ? "ADX indisponível" : `ADX ${adx.toFixed(0)}`;
    let ok = true;
    if (adx !== null && style === "TREND") ok = adx >= 22;
    if (adx !== null && style === "REVERSION") ok = adx <= 24;
    checks.push({
      label: "Regime",
      ok,
      detail:
        style === "HYBRID"
          ? `${adxText} (estratégia funciona em qualquer regime)`
          : `${adxText} — estratégia de ${style === "TREND" ? `tendência precisa de ADX ≥ 22` : `reversão precisa de ADX ≤ 24`}`,
    });
  }

  if (bot.useQuantFunnel) {
    const s = analysis.strength;
    checks.push({
      label: "Força vs BTC",
      ok: s.ok,
      detail: s.liquid
        ? `${s.relativeStrength >= 0 ? "+" : ""}${s.relativeStrength.toFixed(1)} p.p. vs BTC em 24h (precisa ≥ -2)`
        : `volume 24h de US$ ${(s.volume24h / 1e6).toFixed(0)} mi (precisa ≥ 50 mi)`,
    });
  }

  if (bot.useEnsemble && bot.strategy !== "QUANT_ENSEMBLE") {
    checks.push({
      label: "Comitê",
      ok: analysis.committee === "BUY",
      detail: `comitê: ${analysis.committee === "BUY" ? "COMPRA" : analysis.committee === "SELL" ? "VENDA" : "NEUTRO"} (precisa de 2/3)`,
    });
  }

  // 🛡️ SKILL technical-scanner: Filtro de Níveis Chave e Pivots Diários
  // Para estratégias de rompimento (BREAKOUT), momentum (MACD) ou comitê, o teste de R1 é gatilho de aceleração
  const currentEvalPrice = ticker.price || (klines.length > 0 ? klines[klines.length - 1].close : 0);
  const dailyHigh = Math.max(ticker.high || 0, currentEvalPrice);
  const dailyLow = Math.min(ticker.low && ticker.low > 0 ? ticker.low : currentEvalPrice, currentEvalPrice);
  const pivots = calculatePivotPoints(dailyHigh, dailyLow, currentEvalPrice);
  const isBreakoutOrTrend = bot.strategy === "BREAKOUT" || bot.strategy === "QUANT_ENSEMBLE" || bot.strategy === "MACD";
  const resistanceCheck = checkResistanceProximity(currentEvalPrice, pivots, isBreakoutOrTrend ? 0.20 : 0.35);

  checks.push({
    label: "Pivots Diários (Resistência)",
    ok: resistanceCheck.safeToBuy || isBreakoutOrTrend,
    detail: (resistanceCheck.safeToBuy || isBreakoutOrTrend)
      ? `Espaço livre até ${resistanceCheck.nearestLevel} ($${resistanceCheck.levelPrice} · +${resistanceCheck.distancePercent}%)`
      : (resistanceCheck.warning || "Preço colado em resistência chave"),
  });

  // 🛡️ SKILL technical-scanner: Confirmação de Volume
  // Analisa os últimos 3 candles recentes para evitar falso bloqueio no início de minutos ou consolidação pré-rompimento
  const avgVol = averageVolume(klines, 20, 1);
  const lastVol = klines.length > 0 ? klines[klines.length - 1].volume : 0;
  const prevVol = klines.length >= 2 ? klines[klines.length - 2].volume : lastVol;
  const prev2Vol = klines.length >= 3 ? klines[klines.length - 3].volume : prevVol;
  const effectiveVol = Math.max(lastVol, prevVol, prev2Vol);
  const volRatio = avgVol > 0 ? effectiveVol / avgVol : 1;

  // Estratégias de Grid e Reversão (ex: Bot Delta e Bot Gamma) acumulam em consolidação/suporte (baixo volume)
  const isReversionOrGridVol = bot.strategy === "GRID" || bot.strategy === "RSI" || bot.strategy === "MEAN_REVERSION";
  const minVolRequired = isReversionOrGridVol ? 0.12 : 0.30;
  const isVolumeSufficient = avgVol === 0 || volRatio >= minVolRequired;

  checks.push({
    label: "Volume vs Média",
    ok: isVolumeSufficient,
    detail: isVolumeSufficient
      ? `Volume de fluxo ${volRatio.toFixed(2)}x da média de 20p`
      : `Volume murcho (${volRatio.toFixed(2)}x da média) — risco de falso rompimento`,
  });

  // Alvos Dinâmicos Adaptativos por ATR com Risco:Retorno Assimétrico Positivo (R:R ≥ 1.85x a 2.5x)
  const relATRPercent = (analysis.relATR || 0) * 100;
  let suggestedSl = bot.stopLoss || 1.25;
  let suggestedTp = bot.takeProfit || 3.2;
  const estimatedRoundtripFees = 0.10; // Post-Only Maker 0.05% entrada + 0.05% saída
  const estimatedSlippage = 0.05; // margem conservadora de derrapagem
  const totalFriction = estimatedRoundtripFees + estimatedSlippage; // ~0.15%

  if (relATRPercent > 0) {
    // Stop adaptativo estrito conforme Guardrail Institucional (piso 1.1% e teto 1.35% para proteger capital contra perdas acentuadas)
    const atrSl = parseFloat((relATRPercent * 1.2).toFixed(1));
    suggestedSl = Math.max(1.10, Math.min(1.35, Math.min(bot.stopLoss || 1.25, atrSl || 1.25)));
    // Alvo adaptativo institucional garantindo Payoff bruto >= 2.5x a 4.0x (entre 3.2% e 5.5%)
    const targetWithPayoff = parseFloat((suggestedSl * 2.5).toFixed(1));
    const dynamicAtrTp = parseFloat((relATRPercent * 2.2).toFixed(1));
    suggestedTp = Math.max(3.2, Math.min(5.5, Math.max(bot.takeProfit || 3.5, targetWithPayoff, dynamicAtrTp)));
  } else {
    suggestedSl = Math.max(1.10, Math.min(1.35, bot.stopLoss || 1.25));
    suggestedTp = Math.max(3.2, Math.min(5.5, bot.takeProfit || 3.5));
  }

  // Potencial de ganho líquido do trade (Take Profit alvo deduzido das taxas operacionais e slippage)
  const netGainPotential = parseFloat((suggestedTp - totalFriction).toFixed(2));

  // 🛡️ Filtro de Amplitude Mínima ATR (Regra 6 dos Guardrails - Anti-Overtrading em Micro-Movimentos):
  // Proibido abrir operações em ativos cujo potencial de ganho até o alvo ATR seja inferior a 1.50% líquido de taxas.
  const isAmplitudeSufficient = netGainPotential >= 1.50;

  checks.push({
    label: "Amplitude Mínima ATR",
    ok: isAmplitudeSufficient,
    detail: isAmplitudeSufficient
      ? `Potencial de ganho líquido (+${netGainPotential.toFixed(2)}%) acima do piso institucional de 1.5% (Alvo: +${suggestedTp}%)`
      : `Potencial de ganho líquido (+${netGainPotential.toFixed(2)}%) insuficiente para cobrir custos e taxas (precisa ≥ 1.50% líquido)`,
  });

  // 🛡️ Etapa 3: Filtro de Viabilidade Operacional (RiskManager - R:R Líquido ≥ 1:1.5)
  // Calcula preços projetados absolutos e valida a assimetria positiva deduzindo taxas de corretagem
  const projectedSlPrice = currentEvalPrice > 0 ? currentEvalPrice * (1 - suggestedSl / 100) : 0;
  const projectedTpPrice = currentEvalPrice > 0 ? currentEvalPrice * (1 + suggestedTp / 100) : 0;

  const viability = (currentEvalPrice > 0 && projectedSlPrice > 0 && projectedTpPrice > 0)
    ? riskManager.evaluateOperationalViability({
        entryPrice: currentEvalPrice,
        stopLossPrice: projectedSlPrice,
        takeProfitPrice: projectedTpPrice,
        isMaker: true, // Prioridade Post-Only Maker
      })
    : { viable: true, reason: "Preços de referência em cálculo inicial" };

  checks.push({
    label: "Viabilidade Operacional R:R",
    ok: viability.viable,
    detail: viability.reason,
  });

  // 🛡️ Portão de Expectativa Matemática & Dimensionamento Fracionário de Kelly (EV Gate)
  const is15mTrendOk = checks.find((c) => c.label === "Multi-Timeframe 15m")?.ok ?? true;
  const isBookOk = checks.find((c) => c.label === "Livro & Spread")?.ok ?? true;
  const winProbability = MathematicalExpectancyGate.estimateConfluenceProbability({
    hasTrendAlignment: analysis.votes.trend === "BUY" || signal.ok,
    hasMomentumAlignment: analysis.votes.momentum === "BUY" || (analysis.rsi >= 40 && analysis.rsi <= 65),
    hasOrderBookSupport: isBookOk && (orderBook ? (orderBook.imbalanceRatio ? orderBook.imbalanceRatio >= 1.05 : true) : true),
    hasMultiTimeframe15m: is15mTrendOk,
    adxStrength: analysis.adx ?? 20,
  });

  const evResult = MathematicalExpectancyGate.evaluate({
    winProbability,
    projectedTpPercent: suggestedTp,
    projectedSlPercent: suggestedSl,
    isMaker: true,
    estimatedSlippagePercent: 0.05,
  });

  if (bot.useMathematicalExpectancyGate !== false) {
    checks.push({
      label: "Expectativa Matemática (EV Gate)",
      ok: evResult.viable,
      detail: evResult.reason + ` (Kelly: ${(evResult.recommendedKellyFraction * 100).toFixed(1)}% | NAV: ${evResult.suggestedNavPercent}%)`,
    });
  }

  const blocker = checks.find((c) => !c.ok);
  return {
    shouldBuy: !blocker,
    reason: blocker
      ? `${blocker.label}: ${blocker.detail}`
      : `Entrada confirmada — ${signal.detail} (Alvo ATR: +${suggestedTp}% / Stop: -${suggestedSl}% | EV: +${evResult.expectedValuePercent.toFixed(2)}%)`,
    checks,
    suggestedTp,
    suggestedSl,
    relATR: analysis.relATR,
    expectedValuePercent: evResult.expectedValuePercent,
    suggestedNavPercent: evResult.suggestedNavPercent,
  };
}
