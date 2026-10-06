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
  const prevStrong = avgVol > 0 && prevCandle.volume >= avgVol * 0.7 && prevCandle.close >= prevCandle.open;
  const currentGreen = last.close >= last.open;
  const currentVolumeGood = avgVol > 0 && last.volume >= avgVol * 0.6;
  const isHoldingEmaSupport = last.close >= fastNow * 0.997 && rsi >= 45 && rsi <= 68;

  // Rejeição de pavio superior (Bull trap / exaustão compradora)
  const candleRange = last.high - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  const isTopRejection = candleRange > 0 && (upperWick / candleRange) >= 0.45;

  // Voto de fluxo calibrado:
  // BUY: impulso com volume ou suporte sustentado na EMA9 sem rejeição de topo
  // SELL: rejeição explícita de topo ou candle vermelho com volume de despejo (> 1.3x) perdendo a média
  // HOLD: recuos saudáveis de baixo volume em consolidação
  const flow: QuantVote = (!isTopRejection && (prevStrong || (currentGreen && currentVolumeGood) || isHoldingEmaSupport))
    ? "BUY"
    : (isTopRejection || (last.close < last.open && avgVol > 0 && last.volume > avgVol * 1.3 && last.close < fastNow))
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
      momentum: macd ? `MACD ${hist >= 0 ? "+" : ""}${hist.toFixed(4)} · RSI ${rsi.toFixed(0)} (máx ≤ 68)` : "poucos candles",
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
  aiSignals: AISignalData[]
): SignalResult {
  const closes = klines.map((k) => k.close);
  const last = klines[klines.length - 1];

  switch (bot.strategy) {
    case "QUANT_ENSEMBLE": {
      const { votes } = analysis;
      // Regra de Proteção Institucional: NUNCA compra contra a tendência (se trend for SELL, bloqueia)
      if (votes.trend === "SELL") {
        return { ok: false, detail: "bloqueado por tendência de baixa (EMA rápida < EMA lenta)" };
      }
      if (analysis.rsi > 68) {
        return { ok: false, detail: `RSI (${analysis.rsi.toFixed(0)}) esticado para compra institucional (máx ≤ 68)` };
      }
      const buys = [votes.trend, votes.momentum, votes.flow].filter((v) => v === "BUY").length;
      return { ok: analysis.committee === "BUY", detail: `${buys}/3 análises favoráveis (tendência altista e RSI ${analysis.rsi.toFixed(0)} saudável)` };
    }

    case "RSI": {
      const period = bot.rsiPeriod || 14;
      const rsi = calculateRSI(closes, period);
      const limit = bot.buyThreshold || 35;
      const isOversold = rsi <= limit;
      const isRebound = rsi <= limit + 12 && last.close >= last.open;
      // Suporte em tendência de alta: RSI em pullback saudável entre 40 e 55 voltando a subir
      const isPullbackSupport = rsi >= 40 && rsi <= 55 && last.close >= last.open && analysis.votes.trend === "BUY";
      const ok = isOversold || isRebound || isPullbackSupport;
      return {
        ok,
        detail: isOversold
          ? `RSI(${period}) ${rsi.toFixed(1)} em sobrevenda (≤ ${limit})`
          : isRebound
            ? `RSI(${period}) ${rsi.toFixed(1)} com repique altista (≤ ${limit + 12})`
            : isPullbackSupport
              ? `RSI(${period}) ${rsi.toFixed(1)} em suporte na tendência altista`
              : `RSI(${period}) ${rsi.toFixed(1)} — aguarda sobrevenda (≤ ${limit}) ou repique`,
      };
    }

    case "MACD": {
      const macd = calculateMACD(closes, bot.emaFast || 12, bot.emaSlow || 26, 9);
      if (!macd) return { ok: false, detail: "poucos candles para o MACD" };
      const crossed = macd.prevHistogram <= 0 && macd.histogram > 0;
      const bullishMomentum = macd.histogram > 0 && macd.macd >= macd.signal;
      const ok = crossed || bullishMomentum;
      return {
        ok,
        detail: crossed
          ? "MACD cruzou para cima da linha de sinal"
          : bullishMomentum
            ? `Momento altista MACD (+${macd.histogram.toFixed(4)}) acima do sinal`
            : `histograma ${macd.histogram >= 0 ? "+" : ""}${macd.histogram.toFixed(4)} — aguarda momento altista`,
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
      // Rompimento Inteligente & Dinâmico:
      // 1. Rompimento de pivô recente (máxima dos últimos 8 a 10 candles), OU
      // 2. Rompimento de continuação de alta (fechamento acima da máxima anterior em tendência EMA9 > EMA21 com volume), OU
      // 3. Rompimento e cruzamento ascendente da EMA rápida
      const prevPivot = klines.slice(-11, -1);
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

      const isPivotBreak = last.close >= resistance * 0.999 && effectiveVol >= 1.2;
      const isTrendContinuation = fastNow > slowNow && last.close > prevCandle.high && last.close >= last.open && effectiveVol >= 1.0;
      const isEmaBreakout = last.open < fastNow && last.close > fastNow && effectiveVol >= 1.1;

      const broke = isPivotBreak || isTrendContinuation || isEmaBreakout;
      const strong = effectiveVol >= 0.9;

      const candleRange = last.high - last.low;
      const upperWick = last.high - Math.max(last.open, last.close);
      const isWickTrap = candleRange > 0 && (upperWick / candleRange) >= 0.45;
      const rsiOk = analysis.rsi <= 70;

      const ok = broke && strong && !isWickTrap && rsiOk;
      return {
        ok,
        detail: !broke
          ? `aguardando rompimento de pivô ($${last.close.toFixed(4)} < $${resistance.toFixed(4)}) ou continuação com volume`
          : !strong
            ? `volume insuficiente (${effectiveVol.toFixed(1)}× — precisa ≥ 0.9×)`
            : isWickTrap
              ? `rejeição de topo com pavio no candle de rompimento (perigo de falso rompimento)`
              : !rsiOk
                ? `RSI sobrecomprado (${analysis.rsi.toFixed(0)} > 70) no rompimento`
                : `rompimento confirmado (${isPivotBreak ? "pivô recente" : isTrendContinuation ? "continuação de alta" : "cruzamento de média"}) com volume ${effectiveVol.toFixed(1)}×`,
      };
    }

    case "MEAN_REVERSION": {
      const boll = calculateBollinger(closes, 20, 2);
      if (!boll) return { ok: false, detail: "poucos candles para Bollinger" };
      const inBuyZone = boll.percentB <= 0.25 || last.close <= boll.lower * 1.01;
      return {
        ok: inBuyZone,
        detail: `posição na banda ${(boll.percentB * 100).toFixed(0)}% — zona inferior de compra (≤ 25%)`,
      };
    }

    case "GRID": {
      const window = klines.slice(-60);
      const lo = Math.min(...window.map((k) => k.low));
      const hi = Math.max(...window.map((k) => k.high));
      const rangePct = lo > 0 ? ((hi - lo) / lo) * 100 : 0;
      const pos = hi > lo ? (last.close - lo) / (hi - lo) : 0.5;
      const sideways = rangePct <= 10;
      const inBuyZone = pos <= 0.50;
      return {
        ok: sideways && inBuyZone,
        detail: `faixa de 60 candles de 1m: ${rangePct.toFixed(1)}% ${sideways ? "(canal 1m válido)" : "(muito ampla > 10%)"} · preço em ${(pos * 100).toFixed(0)}% (compra ≤ 50%)`,
      };
    }

    case "AI": {
      const minConf = bot.signalConfidenceThreshold ?? 70; // em %
      const signal = aiSignals.find((s) => s.symbol === bot.symbol);
      if (!signal) return { ok: false, detail: "nenhum sinal da IA para este ativo" };
      // O store guarda a confiança dos sinais em 0–1; aceita também 0–100 por segurança.
      const confPct = signal.confidence <= 1 ? signal.confidence * 100 : signal.confidence;
      const ok = signal.action === "BUY" && confPct >= minConf;
      return { ok, detail: `IA: ${signal.action} com ${confPct.toFixed(0)}% de confiança (precisa de COMPRA ≥ ${minConf}%)` };
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

  // Filtro Auto-Screener: Se ativo, exige que o ativo seja uma moeda em alta real com volume significativo
  if (bot.useAutoScreener || bot.symbol === "AUTO") {
    const change24h = ticker.priceChangePercent ?? 0;
    const vol = ticker.quoteVolume ?? 0;
    const isHotCandidate = change24h >= 0.2 && vol >= 5_000_000;
    checks.push({
      label: "Auto-Screener Alta",
      ok: isHotCandidate,
      detail: isHotCandidate
        ? `Líder em alta confirmada (+${change24h.toFixed(1)}% 24h, Vol US$ ${(vol / 1e6).toFixed(1)}M)`
        : `Ativo sem momentum suficiente (+${change24h.toFixed(1)}% 24h, Vol US$ ${(vol / 1e6).toFixed(1)}M — precisa ≥ +0.2% e ≥ $5M)`,
    });
  }

  const signal = evaluateStrategySignal({ ...bot, symbol: evalSymbol }, klines, analysis, aiSignals);
  checks.push({ label: "Estratégia", ok: signal.ok, detail: signal.detail });

  checks.push({
    label: "Veto de volatilidade",
    ok: !analysis.vetoed,
    detail: `ATR ${(analysis.relATR * 100).toFixed(1)}% (bloqueia ≥ ${VOLATILITY_VETO_LIMIT * 100}%)`,
  });

  // Filtro de Spread e Livro de Ofertas: Veta entradas com spread alargado ou livro dominado por vendedores
  if (bot.useOrderBookFilter !== false && orderBook) {
    checks.push({
      label: "Livro & Spread",
      ok: orderBook.ok,
      detail: orderBook.detail,
    });
  }

  // Filtro Multi-Timeframe (15m + 1m): Só compra no 1m se a macro-tendência de 15m estiver altista
  if (bot.useMultiTimeframe !== false) {
    if (klines15m && klines15m.length >= 20) {
      const closes15m = klines15m.map((k) => k.close);
      const fast15 = emaSeries(closes15m, 9);
      const slow15 = emaSeries(closes15m, 21);
      const fastNow15 = fast15[fast15.length - 1];
      const slowNow15 = slow15[slow15.length - 1];
      const lastClose15 = closes15m[closes15m.length - 1];

      const trend15mOk = fastNow15 >= slowNow15;
      const priceAboveEma15m = lastClose15 >= slowNow15 * 0.993; // tolerância para pullback controlado
      const is15mBullish = trend15mOk && priceAboveEma15m;

      checks.push({
        label: "Multi-Timeframe 15m",
        ok: is15mBullish,
        detail: !trend15mOk
          ? `Tendência 15m em baixa (EMA9 < EMA21 no 15m) — aguardando alinhamento altista`
          : !priceAboveEma15m
            ? `Preço 15m abaixo da EMA21 ($${lastClose15.toFixed(4)} < $${slowNow15.toFixed(4)}) — aguardando sustentação`
            : `Tendência 15m altista confirmada (EMA9 > EMA21 e preço sobre a média)`,
      });
    } else {
      const change24h = ticker.priceChangePercent ?? 0;
      const isNotDumping = change24h >= -2.5;
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
  // Impede compra se o candle de 1m esticou demais acima da EMA9 (> 1.2%) ou se formou rejeição com pavio superior longo (> 40%)
  const closes1m = klines.map((k) => k.close);
  const fastEma1m = emaSeries(closes1m, 9);
  const lastFastEma = fastEma1m[fastEma1m.length - 1];
  const lastCandle = klines[klines.length - 1];
  const candleRange = lastCandle.high - lastCandle.low;
  const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
  const wickRejection = candleRange > 0 && (upperWick / candleRange) >= 0.45;
  const distFromEma9Pct = lastFastEma > 0 ? ((lastCandle.close - lastFastEma) / lastFastEma) * 100 : 0;
  const isExtendedFromEma = distFromEma9Pct > 1.8;

  const isPullbackHealthy = !wickRejection && !isExtendedFromEma;
  checks.push({
    label: "Anti-Topo & Pullback",
    ok: isPullbackHealthy,
    detail: isExtendedFromEma
      ? `Preço esticado (+${distFromEma9Pct.toFixed(1)}% acima da EMA9) — aguardando recuo para a média`
      : wickRejection
        ? `Rejeição vendedora de topo (pavio ${(upperWick / candleRange * 100).toFixed(0)}%) — perigo de falso rompimento`
        : `Preço em suporte saudável (distância da EMA9: ${distFromEma9Pct.toFixed(1)}%)`,
  });

  if (bot.useMarketRegime) {
    const style = getStrategy(bot.strategy)?.style ?? "HYBRID";
    const adx = analysis.adx;
    const adxText = adx === null ? "ADX indisponível" : `ADX ${adx.toFixed(0)}`;
    let ok = true;
    if (adx !== null && style === "TREND") ok = adx >= 18;
    if (adx !== null && style === "REVERSION") ok = adx <= 28;
    checks.push({
      label: "Regime",
      ok,
      detail:
        style === "HYBRID"
          ? `${adxText} (estratégia funciona em qualquer regime)`
          : `${adxText} — estratégia de ${style === "TREND" ? `tendência precisa de ADX ≥ 18` : `reversão precisa de ADX ≤ 28`}`,
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

  const blocker = checks.find((c) => !c.ok);
  return {
    shouldBuy: !blocker,
    reason: blocker ? `${blocker.label}: ${blocker.detail}` : `Entrada confirmada — ${signal.detail}`,
    checks,
  };
}
