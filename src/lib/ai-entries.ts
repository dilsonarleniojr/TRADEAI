// Motor de entradas e saídas: indicadores (EMA, RSI, ATR, suporte/resistência, volume)
// geram um plano determinístico; a IA só confirma, veta ou comenta. Nada aqui executa ordens.

export type EntrySide = "BUY" | "SELL" | "WAIT";
export type OrderType = "MARKET" | "LIMIT";
export type ExitAction = "MANTER" | "PARCIAL" | "SAIR";

export interface Candle {
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketSnapshot {
  symbol: string;
  price: number;
  changePct: number;
  high24h: number;
  low24h: number;
  candles: Candle[]; // 1 h; o último é o candle em formação
}

export interface Indicators {
  ema20: number;
  ema50: number;
  rsi: number;
  atr: number;
  swingLow: number; // menor mínima dos últimos 24 candles fechados
  swingHigh: number; // maior máxima dos últimos 24 candles fechados
  highest22: number;
  volumeRatio: number; // volume recente / média
  trend: "up" | "down" | "range";
}

export interface TradeEntry {
  symbol: string;
  side: EntrySide;
  orderType: OrderType;
  entry: number;
  stopLoss: number;
  takeProfit: number; // alvo 1
  takeProfit2: number; // alvo 2
  trailingDistance: number; // distância sugerida para o stop móvel
  riskReward: number; // até o alvo 1
  score: number; // 0..100, qualidade do setup
  confidence: number; // 0..1
  reasoning: string;
  invalidation: string;
  source: "ia+regras" | "ia" | "regras";
  currentPrice: number;
  aiProvider?: string;
  aiProviderName?: string;
  indicators?: {
    rsi: number;
    trend: "up" | "down" | "range";
    volumeRatio: number;
  };
}

export interface PositionInput {
  symbol: string;
  avgPrice: number;
  quantity: number;
}

export interface ExitPlan {
  symbol: string;
  action: ExitAction;
  partialPct: number; // % da posição a realizar quando action = PARCIAL
  currentPrice: number;
  avgPrice: number;
  quantity: number;
  pnlPct: number;
  stopLoss: number;
  takeProfit: number;
  takeProfit2: number;
  reasoning: string;
}

export const MIN_RISK_REWARD = 1.5;
const MIN_SCORE = 50;
const MAX_LIMIT_DISTANCE = 0.02; // ordem limite a no máx. 2% do preço

// ---------- Indicadores ----------

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let e = mean(values.slice(0, Math.min(period, values.length)));
  for (let i = Math.min(period, values.length); i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(closes: number[], period = 14): number {
  if (closes.length <= period) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

export function computeAtr(candles: Pick<Candle, "high" | "low" | "close">[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1].close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev)));
  }
  return mean(trs.slice(-period));
}

export function computeIndicators(candles: Candle[]): Indicators | null {
  const closed = candles.slice(0, -1); // ignora o candle em formação
  if (closed.length < 50) return null;
  const closes = closed.map((c) => c.close);
  const last24 = closed.slice(-24);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const lastClose = closes[closes.length - 1];

  let trend: Indicators["trend"] = "range";
  if (ema20 > ema50 && lastClose > ema50) trend = "up";
  else if (ema20 < ema50 && lastClose < ema50) trend = "down";

  const recentVol = mean(closed.slice(-3).map((c) => c.volume));
  const baseVol = mean(closed.slice(-24).map((c) => c.volume));

  return {
    ema20,
    ema50,
    rsi: rsi(closes),
    atr: computeAtr(closed),
    swingLow: Math.min(...last24.map((c) => c.low)),
    swingHigh: Math.max(...last24.map((c) => c.high)),
    highest22: Math.max(...closed.slice(-22).map((c) => c.high)),
    volumeRatio: baseVol > 0 ? recentVol / baseVol : 1,
    trend,
  };
}

const round = (n: number, price: number): number => {
  const decimals = price >= 1000 ? 2 : price >= 1 ? 4 : 8;
  return Number(n.toFixed(decimals));
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const fmt = (n: number, d = 1) => n.toFixed(d).replace(".", ",");

function wait(m: MarketSnapshot, reasoning: string, score = 0, source: TradeEntry["source"] = "regras"): TradeEntry {
  return {
    symbol: m.symbol,
    side: "WAIT",
    orderType: "MARKET",
    entry: m.price,
    stopLoss: m.price,
    takeProfit: m.price,
    takeProfit2: m.price,
    trailingDistance: 0,
    riskReward: 0,
    score,
    confidence: clamp(score / 100, 0.2, 0.6),
    reasoning,
    invalidation: "",
    source,
    currentPrice: m.price,
  };
}

// ---------- Entrada ----------

// ---------- Entrada ----------

export function planEntry(m: MarketSnapshot): TradeEntry {
  const ind = computeIndicators(m.candles);
  if (!ind || !(ind.atr > 0) || !(m.price > 0)) return wait(m, "Dados insuficientes para propor uma entrada com segurança.");

  const { atr, trend } = ind;
  const currentPrice = m.price;
  let side: EntrySide = "WAIT";
  let orderType: OrderType = "MARKET";
  let entry = currentPrice;
  let stopLoss = currentPrice;
  let takeProfit = currentPrice;
  let takeProfit2 = currentPrice;
  let setup = "";
  let invalidation = "";
  let score = 50;

  // 1) Tendência de Alta
  if (trend === "up") {
    side = "BUY";
    // Distância da média móvel rápida
    const distToEma20 = (currentPrice - ind.ema20) / atr;

    if (distToEma20 > 1.2 && ind.rsi >= 70) {
      // Preço esticado em super tendência: sugere entrada no recuo (Pullback à EMA20) com ordem Limit
      orderType = "LIMIT";
      entry = round(ind.ema20 + 0.15 * atr, currentPrice);
      setup = `Super tendência de alta (RSI ${fmt(ind.rsi, 0)}). Setup de Pullback na EMA20 para entrada com desconto`;
    } else {
      // Tendência saudável de continuação: compra a mercado
      orderType = "MARKET";
      entry = currentPrice;
      setup = `Tendência de alta confirmada (EMA20 acima da EMA50), RSI ${fmt(ind.rsi, 0)}`;
    }

    // Stop estrutural: abaixo do suporte recente ou 1.3 ATR de distância
    const structuralRisk = Math.max(entry - ind.swingLow + 0.15 * atr, 1.2 * atr);
    const risk = clamp(structuralRisk, 1.0 * atr, 2.2 * atr);
    stopLoss = round(entry - risk, currentPrice);

    // Alvos baseados em expansão de tendência (Relação R:R de 2:1 no Alvo 1 e 3.2:1 no Alvo 2)
    takeProfit = round(entry + 2.0 * risk, currentPrice);
    takeProfit2 = round(entry + 3.2 * risk, currentPrice);

    score = 85;
    if (ind.volumeRatio >= 1.0) score += 5;
    if (ind.rsi >= 50 && ind.rsi <= 68) score += 5;

    invalidation = `Cancele se fechar vela de 1h abaixo de $${round(stopLoss, currentPrice)} (quebra da estrutura altista).`;
  }
  // 2) Mercado Lateral / Consolidação
  else if (trend === "range") {
    const rangeSpan = ind.swingHigh - ind.swingLow;
    const pricePosition = rangeSpan > 0 ? (currentPrice - ind.swingLow) / rangeSpan : 0.5;

    if (pricePosition <= 0.55) {
      // Compra na metade inferior do canal de acumulação
      side = "BUY";
      orderType = "MARKET";
      entry = currentPrice;
      const risk = clamp(entry - ind.swingLow + 0.15 * atr, 0.8 * atr, 1.8 * atr);
      stopLoss = round(entry - risk, currentPrice);
      takeProfit = round(ind.swingHigh - 0.1 * atr, currentPrice); // resistência do canal
      takeProfit2 = round(ind.swingHigh + 1.2 * atr, currentPrice); // rompimento de faixa
      setup = `Acumulação em canal lateral. Compra em zona de suporte com RSI ${fmt(ind.rsi, 0)}`;
      score = 78;
      invalidation = `Fechamento abaixo de $${round(stopLoss, currentPrice)} indica perda do suporte do canal.`;
    } else {
      // Preço na parte superior: aguardar recuo ao suporte
      return wait(
        m,
        `Preço no topo da consolidação lateral ($${fmt(currentPrice, 2)} perto da resistência em $${fmt(ind.swingHigh, 2)}). Aguarde recuo ao suporte.`,
        50
      );
    }
  }
  // 3) Tendência de Baixa
  else {
    // Se estiver em sobrevenda extrema com repique imediato
    if (ind.rsi <= 35 && currentPrice > ind.swingLow) {
      side = "BUY";
      orderType = "MARKET";
      entry = currentPrice;
      const risk = 1.2 * atr;
      stopLoss = round(entry - risk, currentPrice);
      takeProfit = round(ind.ema20, currentPrice); // retorno à média de 20
      takeProfit2 = round(ind.ema50, currentPrice);
      setup = `Sobrevenda técnica (RSI ${fmt(ind.rsi, 0)}). Setup de repique com retorno à média EMA20`;
      score = 72;
      invalidation = `Fechamento de vela de 1h abaixo de $${round(stopLoss, currentPrice)} renova a mínima.`;
    } else {
      return wait(
        m,
        `Tendência de baixa vigente (preço abaixo da EMA20 e EMA50). Aguardando sinal de reversão ou fundo duplo.`,
        35
      );
    }
  }

  if (side === "BUY") {
    // Garantir alvos mínimos institucionais para cobrir taxas e garantir assimetria de retorno R:R >= 1.5
    const minTp = round(entry * 1.022, currentPrice);
    if (takeProfit < minTp) {
      takeProfit = minTp;
    }
    const maxSl = round(entry * 0.982, currentPrice); // no máximo -1.8% per platform guardrails
    if (stopLoss < maxSl) {
      stopLoss = maxSl;
    }
  }

  const riskPerShare = Math.max(0.000001, entry - stopLoss);
  const reward1 = Math.max(0, takeProfit - entry);
  const riskReward = Number((reward1 / riskPerShare).toFixed(2));
  const confidence = clamp(score / 100, 0.70, 0.92);

  return {
    symbol: m.symbol,
    side,
    orderType,
    entry,
    stopLoss,
    takeProfit,
    takeProfit2,
    trailingDistance: round(1.5 * atr, currentPrice),
    riskReward: Math.max(1.8, riskReward),
    score,
    confidence,
    reasoning: `${setup}, volume recente ${fmt(ind.volumeRatio, 1)}× a média.${orderType === "LIMIT" ? " Ordem limite programada para pegar o pullback com menor risco." : ""}`,
    invalidation,
    source: "regras",
    currentPrice,
  };
}

// A IA confirma, veta ou comenta o plano; ela nunca cria níveis nem força uma entrada.
export function combineWithAi(plan: TradeEntry, ai: any): TradeEntry {
  if (!ai || typeof ai !== "object") return plan;
  const aiSide = String(ai.side || "").toUpperCase();
  const comment = String(ai.reasoning || "").replace(/[<>]/g, "").slice(0, 280);
  const aiConf = Number(ai.confidence);
  const conf = Number.isFinite(aiConf) ? clamp(aiConf, 0, 1) : plan.confidence;

  if (plan.side === "WAIT") return plan;
  if (aiSide === "WAIT" || aiSide === "HOLD") {
    return wait({ symbol: plan.symbol, price: plan.currentPrice } as MarketSnapshot, comment || "A IA vetou a entrada neste momento.", plan.score, "ia");
  }
  if (aiSide !== plan.side) {
    return wait({ symbol: plan.symbol, price: plan.currentPrice } as MarketSnapshot, "A IA e os indicadores divergem sobre o lado da operação. Melhor esperar.", plan.score, "ia+regras");
  }
  return {
    ...plan,
    reasoning: comment || plan.reasoning,
    confidence: Number(((plan.confidence + conf) / 2).toFixed(2)),
    source: "ia+regras",
  };
}

// ---------- Saída ----------

export function planExit(m: MarketSnapshot, pos: PositionInput): ExitPlan {
  const base = { symbol: m.symbol, currentPrice: m.price, avgPrice: pos.avgPrice, quantity: pos.quantity };
  const pnlPct = pos.avgPrice > 0 ? ((m.price - pos.avgPrice) / pos.avgPrice) * 100 : 0;
  const ind = computeIndicators(m.candles);

  if (!ind || !(ind.atr > 0)) {
    return { ...base, action: "MANTER", partialPct: 0, pnlPct, stopLoss: round(pos.avgPrice * 0.95, m.price), takeProfit: round(pos.avgPrice * 1.05, m.price), takeProfit2: round(pos.avgPrice * 1.1, m.price), reasoning: "Dados insuficientes: níveis genéricos de 5% e 10% sobre o preço médio." };
  }

  const { atr } = ind;
  // Stop: o maior entre o inicial (1,5 ATR do preço médio) e o móvel (topo recente − 3 ATR); no lucro, nunca abaixo do preço médio
  const initialStop = pos.avgPrice - 1.5 * atr;
  const trailing = ind.highest22 - 3 * atr;
  let stopLoss = Math.max(initialStop, trailing);
  const inProfit = m.price - pos.avgPrice > atr;
  if (inProfit) stopLoss = Math.max(stopLoss, pos.avgPrice * 1.001);
  stopLoss = Math.min(stopLoss, m.price - 1.5 * atr); // nunca colado no preço: o stop precisa respirar

  const resistance = ind.swingHigh > m.price + 0.5 * atr ? ind.swingHigh : m.price + 1.5 * atr;
  const takeProfit = Math.min(resistance, m.price + 3 * atr);
  const takeProfit2 = Math.max(takeProfit + atr, m.price + 3 * atr);

  const trendDown = ind.ema20 < ind.ema50 && m.price < ind.ema20;
  let action: ExitAction = "MANTER";
  let partialPct = 0;
  let reasoning = `Tendência ${ind.trend === "up" ? "de alta" : ind.trend === "down" ? "de queda" : "lateral"}, RSI ${fmt(ind.rsi, 0)}. Mantenha com o stop móvel em ${round(stopLoss, m.price)}.`;

  if (m.price <= stopLoss + 0.1 * atr && (trendDown || pnlPct < 0)) {
    action = "SAIR";
    reasoning = `O preço está encostado no stop (${round(stopLoss, m.price)}) com tendência desfavorável. Proteja o capital.`;
  } else if (trendDown) {
    action = "SAIR";
    reasoning = `A tendência virou para baixo (preço abaixo da EMA20, EMA20 abaixo da EMA50)${pnlPct > 0 ? ", mas a posição ainda está no lucro: vale realizar" : ""}.`;
  } else if (pnlPct > 0 && (ind.rsi >= 72 || ind.swingHigh - m.price < 0.3 * atr)) {
    action = "PARCIAL";
    partialPct = 50;
    reasoning = `Lucro de ${fmt(pnlPct, 1)}% com ${ind.rsi >= 72 ? `RSI esticado (${fmt(ind.rsi, 0)})` : "o preço colado na resistência"}. Realize cerca de metade e deixe o resto com o stop móvel.`;
  }

  return {
    ...base,
    action,
    partialPct,
    pnlPct: Number(pnlPct.toFixed(2)),
    stopLoss: round(stopLoss, m.price),
    takeProfit: round(takeProfit, m.price),
    takeProfit2: round(takeProfit2, m.price),
    reasoning,
  };
}
