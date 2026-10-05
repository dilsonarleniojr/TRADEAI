import { NextRequest, NextResponse } from 'next/server';
import { askAIOnce } from '@/lib/ai-client';

// Cache SL/TP results to avoid excessive AI API calls (429 rate limiting)
const sltpCache = new Map<string, { data: Record<string, unknown>; timestamp: number }>();
const SLTP_CACHE_DURATION = 3 * 60 * 1000; // 3 minutes

// Rate limiter: max 1 AI call per 10 seconds
let lastAICallTime = 0;
const AI_CALL_MIN_INTERVAL = 10000; // 10 seconds

// ATR (Average True Range) calculation
function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (highs.length < 2) return 0;

  const trueRanges: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) {
    return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
  }

  // Use EMA-style ATR
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  return atr;
}

// Support/Resistance finder using pivot points
function findSupportResistance(highs: number[], lows: number[], closes: number[], currentPrice: number): {
  supports: number[];
  resistances: number[];
  nearestSupport: number;
  nearestResistance: number;
} {
  if (highs.length < 5) {
    return { supports: [], resistances: [], nearestSupport: currentPrice * 0.95, nearestResistance: currentPrice * 1.05 };
  }

  // Find local min/max (pivot points)
  const supports: number[] = [];
  const resistances: number[] = [];
  const lookback = 3;

  for (let i = lookback; i < lows.length - lookback; i++) {
    const isSupport = lows.slice(i - lookback, i + lookback + 1).every((l, idx) => l >= lows[i] || idx === lookback);
    const isResistance = highs.slice(i - lookback, i + lookback + 1).every((h, idx) => h <= highs[i] || idx === lookback);

    if (isSupport) supports.push(lows[i]);
    if (isResistance) resistances.push(highs[i]);
  }

  // Also add pivot point levels
  if (closes.length > 0) {
    const lastClose = closes[closes.length - 1];
    const lastHigh = highs[highs.length - 1];
    const lastLow = lows[lows.length - 1];
    const pivot = (lastHigh + lastLow + lastClose) / 3;
    const r1 = 2 * pivot - lastLow;
    const s1 = 2 * pivot - lastHigh;
    const r2 = pivot + (lastHigh - lastLow);
    const s2 = pivot - (lastHigh - lastLow);

    supports.push(s1, s2);
    resistances.push(r1, r2);
  }

  // Filter and sort - only keep levels near current price (within 15%)
  const threshold = currentPrice * 0.15;
  const filteredSupports = supports
    .filter(s => s < currentPrice && (currentPrice - s) < threshold)
    .sort((a, b) => b - a); // descending (closest first)

  const filteredResistances = resistances
    .filter(r => r > currentPrice && (r - currentPrice) < threshold)
    .sort((a, b) => a - b); // ascending (closest first)

  return {
    supports: filteredSupports,
    resistances: filteredResistances,
    nearestSupport: filteredSupports[0] || currentPrice * 0.97,
    nearestResistance: filteredResistances[0] || currentPrice * 1.03,
  };
}

// Bollinger Bands calculation
function calculateBollingerBands(closes: number[], period: number = 20, stdDev: number = 2): {
  upper: number;
  middle: number;
  lower: number;
} {
  if (closes.length < period) {
    const sma = closes.reduce((a, b) => a + b, 0) / closes.length;
    return { upper: sma * 1.02, middle: sma, lower: sma * 0.98 };
  }

  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
  const sd = Math.sqrt(variance);

  return {
    upper: sma + stdDev * sd,
    middle: sma,
    lower: sma - stdDev * sd,
  };
}

// RSI calculation
function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export async function POST(request: NextRequest) {
  try {
    const { symbol, price, high24h, low24h, volume, priceChange24h } = await request.json();

    if (!symbol || !price) {
      return NextResponse.json({ error: 'Símbolo e preço são obrigatórios' }, { status: 400 });
    }

    // Fetch klines data from Binance for technical analysis
    let klinesData: { open: number; high: number; low: number; close: number; volume: number }[] = [];
    try {
      const klinesRes = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=100`
      );
      if (klinesRes.ok) {
        const rawData = await klinesRes.json();
        klinesData = rawData.map((k: string[]) => ({
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));
      }
    } catch {
      // If Binance API fails, use provided data for estimates
    }

    const currentPrice = parseFloat(String(price));
    const highs = klinesData.map(k => k.high);
    const lows = klinesData.map(k => k.low);
    const closes = klinesData.map(k => k.close);

    // Calculate technical indicators
    const atr = klinesData.length > 1 ? calculateATR(highs, lows, closes, 14) : currentPrice * 0.02;
    const sr = findSupportResistance(highs, lows, closes, currentPrice);
    const bb = calculateBollingerBands(closes);
    const rsi = calculateRSI(closes);

    // Determine market bias based on technicals
    let bias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (rsi < 35 && priceChange24h < -2) bias = 'bearish'; // oversold, might bounce
    else if (rsi > 65 && priceChange24h > 2) bias = 'bullish'; // overbought, might drop
    else if (priceChange24h > 1) bias = 'bullish';
    else if (priceChange24h < -1) bias = 'bearish';

    // Calculate SL/TP based on ATR multiples and S/R levels
    // Conservative: 1.5x ATR for SL, 3x ATR for TP (2:1 R:R)
    // Moderate: 2x ATR for SL, 4x ATR for TP (2:1 R:R)
    // Aggressive: 1x ATR for SL, 3x ATR for TP (3:1 R:R)

    let stopLoss: number;
    let takeProfit: number;
    let recommendation: 'COMPRA' | 'VENDA' | 'NEUTRO';

    if (bias === 'bullish' || priceChange24h <= 0) {
      // For buy setups: SL below entry, TP above
      // Use nearest support as SL anchor, nearest resistance as TP anchor
      const slFromATR = currentPrice - 1.5 * atr;
      const slFromSupport = sr.nearestSupport;
      const slFromBB = bb.lower;

      // Take the highest SL (closest to entry but still protective)
      stopLoss = Math.max(slFromATR, Math.max(slFromSupport, slFromBB));
      // Ensure SL is actually below entry
      if (stopLoss >= currentPrice) stopLoss = slFromATR;

      const tpFromATR = currentPrice + 3 * atr;
      const tpFromResistance = sr.nearestResistance;
      const tpFromBB = bb.upper;

      // Take the lowest TP (closest realistic target)
      takeProfit = Math.min(tpFromATR, Math.min(tpFromResistance, tpFromBB));
      // Ensure TP is above entry
      if (takeProfit <= currentPrice) takeProfit = tpFromATR;

      recommendation = bias === 'bullish' ? 'COMPRA' : 'NEUTRO';
    } else {
      // For sell setups: SL above entry, TP below
      const slFromATR = currentPrice + 1.5 * atr;
      const slFromResistance = sr.nearestResistance;
      const slFromBB = bb.upper;

      stopLoss = Math.min(slFromATR, Math.min(slFromResistance, slFromBB));
      if (stopLoss <= currentPrice) stopLoss = slFromATR;

      const tpFromATR = currentPrice - 3 * atr;
      const tpFromSupport = sr.nearestSupport;
      const tpFromBB = bb.lower;

      takeProfit = Math.max(tpFromATR, Math.max(tpFromSupport, tpFromBB));
      if (takeProfit >= currentPrice) takeProfit = tpFromATR;

      recommendation = 'VENDA';
    }

    // Calculate risk/reward
    const risk = Math.abs(currentPrice - stopLoss);
    const reward = Math.abs(takeProfit - currentPrice);
    const riskRewardRatio = risk > 0 ? reward / risk : 0;

    const slPercent = ((currentPrice - stopLoss) / currentPrice) * 100;
    const tpPercent = ((takeProfit - currentPrice) / currentPrice) * 100;

    // Build response data first (without AI reasoning)
    const responseData: Record<string, unknown> = {
      symbol,
      currentPrice,
      stopLoss: parseFloat(stopLoss.toFixed(2)),
      takeProfit: parseFloat(takeProfit.toFixed(2)),
      slPercent: parseFloat(slPercent.toFixed(2)),
      tpPercent: parseFloat(tpPercent.toFixed(2)),
      riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
      atr: parseFloat(atr.toFixed(2)),
      support: parseFloat(sr.nearestSupport.toFixed(2)),
      resistance: parseFloat(sr.nearestResistance.toFixed(2)),
      rsi: parseFloat(rsi.toFixed(1)),
      bollingerLower: parseFloat(bb.lower.toFixed(2)),
      bollingerUpper: parseFloat(bb.upper.toFixed(2)),
      recommendation,
      reasoning: '',
    };

    // Check cache first
    const cacheKey = `${symbol}-${currentPrice.toFixed(0)}`;
    const cached = sltpCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < SLTP_CACHE_DURATION) {
      return NextResponse.json({ success: true, data: cached.data, cached: true });
    }

    // Generate AI reasoning only if rate limiter allows
    const now = Date.now();
    const canCallAI = now - lastAICallTime >= AI_CALL_MIN_INTERVAL;

    let reasoning = '';
    if (canCallAI) {
      const reasoningPrompt = `Com base na análise técnica de ${symbol}:
- Preço atual: $${currentPrice.toFixed(2)}
- ATR(14): $${atr.toFixed(2)}
- RSI(14): ${rsi.toFixed(1)}
- Suporte mais próximo: $${sr.nearestSupport.toFixed(2)}
- Resistência mais próxima: $${sr.nearestResistance.toFixed(2)}
- Stop Loss calculado: $${stopLoss.toFixed(2)} (${slPercent.toFixed(1)}%)
- Take Profit calculado: $${takeProfit.toFixed(2)} (${tpPercent > 0 ? '+' : ''}${tpPercent.toFixed(1)}%)
- Recomendação: ${recommendation}

Explique em 1-2 frases em português brasileiro por que esses valores de SL/TP são adequados.`;

      try {
        lastAICallTime = Date.now();
        reasoning = await askAIOnce(
          'Você é um analista técnico de criptomoedas. Responda de forma concisa em português brasileiro.',
          reasoningPrompt,
          { maxTokens: 1500 }
        );
        if (!reasoning) throw new Error('resposta vazia');
      } catch {
        reasoning = recommendation === 'COMPRA'
          ? `SL baseado em suporte ($${sr.nearestSupport.toFixed(2)}) e ATR, TP baseado em resistência ($${sr.nearestResistance.toFixed(2)}). Risco/Recompensa de 1:${riskRewardRatio.toFixed(1)}.`
          : recommendation === 'VENDA'
            ? `SL baseado em resistência ($${sr.nearestResistance.toFixed(2)}) e ATR, TP baseado em suporte ($${sr.nearestSupport.toFixed(2)}). Risco/Recompensa de 1:${riskRewardRatio.toFixed(1)}.`
            : `SL e TP baseados em ATR ($${atr.toFixed(2)}) e níveis de suporte/resistência. Aguardando confirmação de tendência.`;
      }
    } else {
      // Use fallback reasoning when rate-limited
      reasoning = recommendation === 'COMPRA'
        ? `SL em $${stopLoss.toFixed(2)} (suporte/ATR), TP em $${takeProfit.toFixed(2)} (resistência). R:R de 1:${riskRewardRatio.toFixed(1)}.`
        : recommendation === 'VENDA'
          ? `SL em $${stopLoss.toFixed(2)} (resistência/ATR), TP em $${takeProfit.toFixed(2)} (suporte). R:R de 1:${riskRewardRatio.toFixed(1)}.`
          : `SL e TP baseados em ATR ($${atr.toFixed(2)}) e suporte/resistência. Aguardando confirmação.`;
    }

    responseData.reasoning = reasoning;

    // Cache the result
    sltpCache.set(cacheKey, { data: responseData, timestamp: Date.now() });

    // Clean old cache entries (keep last 50)
    if (sltpCache.size > 50) {
      const entries = Array.from(sltpCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
      sltpCache.clear();
      entries.slice(-30).forEach(([k, v]) => sltpCache.set(k, v));
    }

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('SL/TP Calculator error:', error);
    return NextResponse.json(
      { error: 'Falha ao calcular SL/TP', details: message },
      { status: 500 }
    );
  }
}
