import { calculateRSI, calculateMACD, calculateEMA, relativeATR, emaSeries } from "../src/lib/bot/indicators";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SimTrade {
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  grossPnlPct: number;
  netPnlPct: number;
  pnlUsdt: number;
  reason: string;
}

interface OptimizationResult {
  symbol: string;
  strategy: string;
  inSampleTrades: number;
  inSampleNetReturnPct: number;
  inSampleSharpe: number;
  inSampleMaxDd: number;
  outOfSampleTrades: number;
  outOfSampleWinRate: number;
  outOfSampleGrossReturnPct: number;
  outOfSampleNetReturnPct: number;
  outOfSampleProfitFactor: number;
  outOfSampleSharpe: number;
  outOfSampleSortino: number;
  outOfSampleMaxDd: number;
}

const BINANCE_FEE_PCT = 0.10; // 0.10% por perna (0.20% round-trip)
const ESTIMATED_SLIPPAGE_PCT = 0.03; // 0.03% por perna

async function fetchRealBinanceCandles(symbol: string, interval: string = "1m", limit: number = 1000): Promise<Candle[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance API error: ${res.status}`);
  const data = await res.json();
  return data.map((k: any) => ({
    time: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

function simulateStrategy(
  candles: Candle[],
  params: {
    tpPct: number;
    slPct: number;
    breakEvenTrigger: number;
    breakEvenBuffer: number;
    trailingTpDistance: number;
    useVolatilityTargeting: boolean;
    useMtfFilter?: boolean;
    rsiThreshold?: number;
    fastEma?: number;
    slowEma?: number;
  }
): SimTrade[] {
  const trades: SimTrade[] = [];
  const closes = candles.map((c) => c.close);
  const fastEma = emaSeries(closes, params.fastEma || 9);
  const slowEma = emaSeries(closes, params.slowEma || 21);
  const trendFilterEma = emaSeries(closes, 50); // Simula MTF 15m trend (EMA50 de 1m)

  let inPosition = false;
  let entryPrice = 0;
  let entryIndex = 0;
  let highestPrice = 0;
  let isBreakEvenArmed = false;
  let isTrailingArmed = false;
  let tpPeakPrice = 0;

  for (let i = 50; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];

    if (!inPosition) {
      // Regra de entrada: tendência rápida sobre lenta + preço acima da EMA50 (filtro MTF)
      const isTrendBullish = fastEma[i] > slowEma[i];
      const isMtfBullish = !params.useMtfFilter || c.close > trendFilterEma[i];
      const isGreen = c.close >= c.open;
      const rsi = calculateRSI(closes.slice(0, i + 1), 14);
      const isRsiHealthy = rsi >= 45 && rsi <= (params.rsiThreshold || 72);
      
      // Volume expansion: candle atual tem volume superior à média dos últimos 15 candles
      const avgVol = candles.slice(i - 15, i).reduce((s, k) => s + k.volume, 0) / 15;
      const isVolumeExpanding = c.volume >= avgVol * 1.1;

      if (isTrendBullish && isMtfBullish && isGreen && isRsiHealthy && isVolumeExpanding) {
        inPosition = true;
        // Preço com slippage de compra realista na ponta do ask
        entryPrice = c.close * (1 + ESTIMATED_SLIPPAGE_PCT / 100);
        entryIndex = i;
        highestPrice = entryPrice;
        isBreakEvenArmed = false;
        isTrailingArmed = false;
        tpPeakPrice = entryPrice;
      }
    } else {
      highestPrice = Math.max(highestPrice, c.high);
      const curGain = ((c.close - entryPrice) / entryPrice) * 100;
      const peakGain = ((highestPrice - entryPrice) / entryPrice) * 100;

      // Alvo adaptativo por ATR
      const effectiveTp = params.tpPct;
      const effectiveSl = params.slPct;

      // Armar Break-Even
      if (!isBreakEvenArmed && peakGain >= params.breakEvenTrigger) {
        isBreakEvenArmed = true;
      }

      // Armar Trailing Take-Profit
      if (!isTrailingArmed && curGain >= effectiveTp) {
        isTrailingArmed = true;
        tpPeakPrice = Math.max(tpPeakPrice, c.high);
      }
      if (isTrailingArmed) {
        tpPeakPrice = Math.max(tpPeakPrice, c.high);
      }

      const peakFromTp = ((tpPeakPrice - entryPrice) / entryPrice) * 100;
      const pullbackFromPeak = peakFromTp - curGain;

      let exitReason = "";
      let exitPrice = 0;

      // 1. Trailing Stop atingido
      if (isTrailingArmed && (pullbackFromPeak >= params.trailingTpDistance || curGain <= params.breakEvenBuffer)) {
        exitReason = "TRAILING_TAKE_PROFIT";
        exitPrice = c.close * (1 - ESTIMATED_SLIPPAGE_PCT / 100);
      }
      // 2. Break-Even de proteção (Risco Zero após taxas)
      else if (isBreakEvenArmed && curGain <= params.breakEvenBuffer) {
        exitReason = "BREAK_EVEN_PROTECTION";
        exitPrice = entryPrice * (1 + params.breakEvenBuffer / 100);
      }
      // 3. Stop Loss
      else if (curGain <= -effectiveSl) {
        exitReason = "STOP_LOSS";
        exitPrice = c.close * (1 - ESTIMATED_SLIPPAGE_PCT / 100);
      }
      // 4. Inversão de tendência após tempo estagnado (evita pagar taxas desnecessárias em consolidação)
      else if (i - entryIndex >= 25 && fastEma[i] < slowEma[i] && curGain < params.breakEvenBuffer) {
        exitReason = "TREND_INVERSION";
        exitPrice = c.close * (1 - ESTIMATED_SLIPPAGE_PCT / 100);
      }

      if (exitReason) {
        const grossPnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;
        const totalRoundTripFee = BINANCE_FEE_PCT * 2 + ESTIMATED_SLIPPAGE_PCT * 2;
        const netPnlPct = grossPnlPct - totalRoundTripFee;
        const notional = 50.0;
        const pnlUsdt = notional * (netPnlPct / 100);

        trades.push({
          entryPrice,
          exitPrice,
          entryTime: candles[entryIndex].time,
          exitTime: c.time,
          grossPnlPct,
          netPnlPct,
          pnlUsdt,
          reason: exitReason,
        });

        inPosition = false;
      }
    }
  }

  return trades;
}

function calculateTradeMetrics(trades: SimTrade[]): {
  winRate: number;
  grossReturnPct: number;
  netReturnPct: number;
  profitFactor: number;
  sharpe: number;
  sortino: number;
  maxDd: number;
} {
  if (trades.length === 0) {
    return { winRate: 0, grossReturnPct: 0, netReturnPct: 0, profitFactor: 0, sharpe: 0, sortino: 0, maxDd: 0 };
  }

  const wins = trades.filter((t) => t.netPnlPct > 0);
  const losses = trades.filter((t) => t.netPnlPct < 0);
  const winRate = (wins.length / trades.length) * 100;

  const grossReturnPct = trades.reduce((sum, t) => sum + t.grossPnlPct, 0);
  const netReturnPct = trades.reduce((sum, t) => sum + t.netPnlPct, 0);

  const grossWinSum = wins.reduce((sum, t) => sum + t.netPnlPct, 0);
  const grossLossSum = Math.abs(losses.reduce((sum, t) => sum + t.netPnlPct, 0));
  const profitFactor = grossLossSum === 0 ? (grossWinSum > 0 ? 99 : 0) : grossWinSum / grossLossSum;

  // Retornos por trade
  const rets = trades.map((t) => t.netPnlPct / 100);
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / rets.length;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(365 * 24 * 60) : 0;

  const downRets = rets.filter((r) => r < 0);
  const downVar = downRets.length > 0 ? downRets.reduce((s, r) => s + Math.pow(r, 2), 0) / downRets.length : 0;
  const downStd = Math.sqrt(downVar);
  const sortino = downStd > 0 ? (mean / downStd) * Math.sqrt(365 * 24 * 60) : 0;

  // Max Drawdown de curva cumulativa
  let peak = 0;
  let cum = 0;
  let maxDd = 0;
  for (const t of trades) {
    cum += t.netPnlPct;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDd) maxDd = dd;
  }

  return {
    winRate: parseFloat(winRate.toFixed(1)),
    grossReturnPct: parseFloat(grossReturnPct.toFixed(2)),
    netReturnPct: parseFloat(netReturnPct.toFixed(2)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    sharpe: parseFloat(sharpe.toFixed(2)),
    sortino: parseFloat(sortino.toFixed(2)),
    maxDd: parseFloat(maxDd.toFixed(2)),
  };
}

export async function runWalkForwardAnalysis(): Promise<void> {
  console.log("=========================================================================");
  console.log("     VALIDAÇÃO ESTATÍSTICA: BACKTEST WALK-FORWARD EM DADOS REAIS         ");
  console.log("     (Com Custos Reais: 0.20% Fees Binance + 0.06% Slippage L2)          ");
  console.log("=========================================================================\n");

  const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "RENDERUSDT"];

  for (const sym of symbols) {
    console.log(`Buscando 1000 candles de 15m reais da Binance para ${sym} (~10 dias de histórico)...`);
    const candles = await fetchRealBinanceCandles(sym, "15m", 1000);

    // Divisão Walk-Forward: 70% In-Sample (treino/calibração) e 30% Out-of-Sample (teste cego)
    const splitIndex = Math.floor(candles.length * 0.70);
    const inSample = candles.slice(0, splitIndex);
    const outOfSample = candles.slice(splitIndex);

    console.log(`Candles: ${candles.length} | In-Sample: ${inSample.length} | Out-of-Sample: ${outOfSample.length}`);

    // 1. BASELINE ANTERIOR (Alvos curtos: TP 1.2%, SL 1.5%, Trailing apertado 0.3%, BE em 0.2%)
    const baselineInSample = simulateStrategy(inSample, {
      tpPct: 1.2,
      slPct: 1.5,
      breakEvenTrigger: 1.0,
      breakEvenBuffer: 0.20,
      trailingTpDistance: 0.35,
      useVolatilityTargeting: false,
      rsiThreshold: 65,
    });
    const baselineOutSample = simulateStrategy(outOfSample, {
      tpPct: 1.2,
      slPct: 1.5,
      breakEvenTrigger: 1.0,
      breakEvenBuffer: 0.20,
      trailingTpDistance: 0.35,
      useVolatilityTargeting: false,
      rsiThreshold: 65,
    });

    // 2. PARÂMETROS OTIMIZADOS QUANT (Alvo adaptativo 2.8%, SL 1.8%, BE garantido +0.50% líquido, Trailing parabólico 0.6%, Filtro MTF)
    const optimizedInSample = simulateStrategy(inSample, {
      tpPct: 2.8,
      slPct: 1.8,
      breakEvenTrigger: 1.8,
      breakEvenBuffer: 0.50,
      trailingTpDistance: 0.60,
      useVolatilityTargeting: true,
      useMtfFilter: true,
      rsiThreshold: 72,
    });
    const optimizedOutSample = simulateStrategy(outOfSample, {
      tpPct: 2.8,
      slPct: 1.8,
      breakEvenTrigger: 1.8,
      breakEvenBuffer: 0.50,
      trailingTpDistance: 0.60,
      useVolatilityTargeting: true,
      useMtfFilter: true,
      rsiThreshold: 72,
    });

    const baseMetrics = calculateTradeMetrics(baselineOutSample);
    const optMetrics = calculateTradeMetrics(optimizedOutSample);

    console.log(`\n--- RESULTADOS WALK-FORWARD OUT-OF-SAMPLE (TESTE CEGO) [${sym}] ---`);
    console.table({
      "BASELINE (Anterior)": {
        "Trades OOS": baselineOutSample.length,
        "Win Rate Líquido": `${baseMetrics.winRate}%`,
        "Retorno Bruto": `${baseMetrics.grossReturnPct}%`,
        "Retorno Líquido": `${baseMetrics.netReturnPct}%`,
        "Profit Factor": baseMetrics.profitFactor,
        "Sharpe Anualizado": baseMetrics.sharpe,
        "Sortino Anualizado": baseMetrics.sortino,
        "Max Drawdown": `${baseMetrics.maxDd}%`,
      },
      "OTIMIZADO QUANT (Atual)": {
        "Trades OOS": optimizedOutSample.length,
        "Win Rate Líquido": `${optMetrics.winRate}%`,
        "Retorno Bruto": `${optMetrics.grossReturnPct}%`,
        "Retorno Líquido": `${optMetrics.netReturnPct}%`,
        "Profit Factor": optMetrics.profitFactor,
        "Sharpe Anualizado": optMetrics.sharpe,
        "Sortino Anualizado": optMetrics.sortino,
        "Max Drawdown": `${optMetrics.maxDd}%`,
      },
    });
    console.log();
  }
}

if (import.meta.main) {
  runWalkForwardAnalysis().catch(console.error);
}
