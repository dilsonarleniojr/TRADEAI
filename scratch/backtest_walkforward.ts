/**
 * Backtest e Walk-Forward Validation Engine (Zero Mocks / 100% Dados Reais Binance)
 *
 * Avalia motores de execução intradiários em BTCUSDT, ETHUSDT e SOLUSDT
 * com modelagem real de taxas (0.10% compra + 0.10% venda) e slippage (0.05%).
 */

export {};

interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

interface TradeResult {
  symbol: string;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  grossPnl: number;
  netPnl: number;
  returnPct: number;
  netReturnPct: number;
  durationMinutes: number;
  exitReason: "TP" | "SL" | "TRAILING" | "BREAK_EVEN" | "TIME_STOP";
}

interface StrategyMetrics {
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  netProfit: number;
  netReturnPct: number;
  maxDrawdownPct: number;
  avgWinPct: number;
  avgLossPct: number;
  rewardToRisk: number;
  sharpeRatio: number;
  sortinoRatio: number;
  avgDurationMinutes: number;
}

// Cálculo de EMA
function calculateEMA(values: number[], period: number): number[] {
  const ema: number[] = new Array(values.length).fill(0);
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  ema[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    ema[i] = values[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

// Cálculo de RSI
function calculateRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = new Array(closes.length).fill(50);
  if (closes.length <= period) return rsi;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsi[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i] = 100 - 100 / (1 + rs);
    }
  }
  return rsi;
}

// Download de candles reais da Binance REST
async function fetchBinanceKlines(symbol: string, interval = "15m", limit = 1000): Promise<Candle[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao obter candles de ${symbol} na Binance: HTTP ${res.status}`);
  }
  const raw = await res.json();
  return raw.map((r: any) => ({
    openTime: r[0],
    open: parseFloat(r[1]),
    high: parseFloat(r[2]),
    low: parseFloat(r[3]),
    close: parseFloat(r[4]),
    volume: parseFloat(r[5]),
    closeTime: r[6],
  }));
}

// Motor de simulação da estratégia quantitativa TradeAI
function simulateStrategy(
  candles: Candle[],
  symbol: string,
  strategyType: "TREND_MOMENTUM" | "MEAN_REVERSION" | "VOL_BREAKOUT" = "MEAN_REVERSION",
  config = {
    takeProfit: 2.8, // 2.8% TP
    stopLoss: 1.5, // 1.5% SL
    trailingStopDistance: 0.6, // 0.6% Trailing dist
    breakEvenTrigger: 1.2, // Armar break-even em +1.2%
    stagnationMinutes: 90, // 1.5h de tolerância para consolidação
    maxHoldingMinutes: 180, // 3h de holding intradiário máximo
    slippagePct: 0.05, // 0.05% slippage real
    feePct: 0.10, // 0.10% taxa por perna (0.20% roundtrip)
    initialCapital: 1000.0,
    riskFraction: 0.35, // 35% de alocação por trade
  }
): { trades: TradeResult[]; metrics: StrategyMetrics } {
  const closes = candles.map((c) => c.close);
  const emaFast = calculateEMA(closes, 9);
  const emaSlow = calculateEMA(closes, 21);
  const rsi = calculateRSI(closes, 14);

  // Média de volume de 20 candles
  const avgVolumes: number[] = new Array(candles.length).fill(0);
  for (let i = 20; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - 20; j < i; j++) sum += candles[j].volume;
    avgVolumes[i] = sum / 20;
  }

  const trades: TradeResult[] = [];
  let capital = config.initialCapital;
  let inPosition = false;
  let entryPrice = 0;
  let entryTime = 0;
  let positionQty = 0;
  let peakPrice = 0;
  let breakEvenArmed = false;
  let positionHoldingCandles = 0;

  for (let i = 25; i < candles.length; i++) {
    const c = candles[i];
    const prevC = candles[i - 1];
    const avgVol = avgVolumes[i];

    if (!inPosition) {
      let shouldBuy = false;

      // Candle não pode ser rejeição de topo (upper wick < 40%)
      const candleRange = c.high - c.low;
      const upperWick = c.high - Math.max(c.open, c.close);
      const isTopRejection = candleRange > 0 && (upperWick / candleRange) >= 0.40;

      if (strategyType === "MEAN_REVERSION") {
        // Mean Reversion (Dip Hunter): Compra sobrevenda severa com reversão confirmada
        const rsiOversold = rsi[i - 1] <= 36 || rsi[i - 2] <= 32;
        const isBullishReversal = c.close > c.open && c.close > prevC.close;
        const volumeBounce = avgVol > 0 && c.volume >= avgVol * 0.8;
        shouldBuy = rsiOversold && isBullishReversal && volumeBounce && !isTopRejection;
      } else if (strategyType === "TREND_MOMENTUM") {
        // Trend Momentum: EMA9 > EMA21 + Pullback com RSI 42-65
        const isUptrend = emaFast[i - 1] >= emaSlow[i - 1] && c.close >= emaFast[i - 1] * 0.995;
        const rsiHealthy = rsi[i - 1] >= 42 && rsi[i - 1] <= 65;
        const isGreenTrigger = c.close > c.open && c.close > prevC.close && !isTopRejection;
        shouldBuy = isUptrend && rsiHealthy && isGreenTrigger;
      } else if (strategyType === "VOL_BREAKOUT") {
        // Volume Breakout: Rompimento de máxima de 20 candles com volume > 1.4x
        let highest20 = 0;
        for (let j = i - 20; j < i; j++) {
          if (candles[j].high > highest20) highest20 = candles[j].high;
        }
        const isBreakout = c.close > highest20;
        const volumeSurge = avgVol > 0 && c.volume >= avgVol * 1.4;
        shouldBuy = isBreakout && volumeSurge && !isTopRejection;
      }

      if (shouldBuy) {
        // Aplica slippage na entrada
        entryPrice = c.close * (1 + config.slippagePct / 100);
        entryTime = c.closeTime;
        const alloc = capital * config.riskFraction;
        positionQty = alloc / entryPrice;
        peakPrice = entryPrice;
        breakEvenArmed = false;
        positionHoldingCandles = 0;
        inPosition = true;
      }
    } else {
      positionHoldingCandles++;
      if (c.high > peakPrice) peakPrice = c.high;

      let exitPrice = 0;
      let exitReason: TradeResult["exitReason"] = "TP";
      let shouldExit = false;

      const gainFromEntry = ((c.high - entryPrice) / entryPrice) * 100;
      const lossFromEntry = ((c.low - entryPrice) / entryPrice) * 100;
      const currentGainPct = ((c.close - entryPrice) / entryPrice) * 100;
      const holdingMinutes = positionHoldingCandles * 15;

      // 1. Arme do Break-Even (+1.4%)
      if (!breakEvenArmed && gainFromEntry >= config.breakEvenTrigger) {
        breakEvenArmed = true;
      }

      // 2. Take-Profit Direto
      if (gainFromEntry >= config.takeProfit) {
        exitPrice = entryPrice * (1 + config.takeProfit / 100);
        exitReason = "TP";
        shouldExit = true;
      }
      // 3. Trailing Stop após Break-Even
      else if (breakEvenArmed) {
        const peakGain = ((peakPrice - entryPrice) / entryPrice) * 100;
        const currentPullback = ((peakPrice - c.low) / peakPrice) * 100;

        if (currentPullback >= config.trailingStopDistance && peakGain > config.breakEvenTrigger) {
          exitPrice = peakPrice * (1 - config.trailingStopDistance / 100);
          exitReason = "TRAILING";
          shouldExit = true;
        } else if (c.low <= entryPrice * 1.0025) {
          // Protege no break-even (+0.25% para cobrir taxas da exchange)
          exitPrice = entryPrice * 1.0025;
          exitReason = "BREAK_EVEN";
          shouldExit = true;
        }
      }
      // 4. Stop-Loss de Proteção
      else if (lossFromEntry <= -config.stopLoss) {
        exitPrice = entryPrice * (1 - config.stopLoss / 100);
        exitReason = "SL";
        shouldExit = true;
      }
      // 5. Saída por Estagnação (Time-Stop Inteligente):
      // Apenas sai se o trade passou de 2h estagnado no zero/leve prejuízo (entre -0.6% e +0.4%)
      else if (
        holdingMinutes >= config.stagnationMinutes &&
        currentGainPct <= 0.4 &&
        currentGainPct >= -config.stopLoss * 0.5
      ) {
        exitPrice = c.close;
        exitReason = "TIME_STOP";
        shouldExit = true;
      }
      // 6. Limite Absoluto de Holding Intradiário (4h)
      else if (holdingMinutes >= config.maxHoldingMinutes) {
        exitPrice = c.close;
        exitReason = "TIME_STOP";
        shouldExit = true;
      }

      if (shouldExit) {
        // Aplica slippage na saída
        const finalExitPrice = exitPrice * (1 - config.slippagePct / 100);
        const grossReturnPct = ((finalExitPrice - entryPrice) / entryPrice) * 100;
        const roundtripFeesPct = config.feePct * 2;
        const netReturnPct = grossReturnPct - roundtripFeesPct;

        const totalInvested = positionQty * entryPrice;
        const grossPnl = (totalInvested * grossReturnPct) / 100;
        const netPnl = (totalInvested * netReturnPct) / 100;

        capital += netPnl;

        trades.push({
          symbol,
          entryTime,
          exitTime: c.closeTime,
          entryPrice,
          exitPrice: finalExitPrice,
          quantity: positionQty,
          grossPnl,
          netPnl,
          returnPct: grossReturnPct,
          netReturnPct,
          durationMinutes: holdingMinutes,
          exitReason,
        });

        inPosition = false;
      }
    }
  }

  // Métricas Quantitativas
  const totalTrades = trades.length;
  const winTrades = trades.filter((t) => t.netPnl > 0).length;
  const lossTrades = trades.filter((t) => t.netPnl <= 0).length;
  const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;

  let grossProfit = 0;
  let grossLoss = 0;
  trades.forEach((t) => {
    if (t.netPnl > 0) grossProfit += t.netPnl;
    else grossLoss += Math.abs(t.netPnl);
  });
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.0 : 1.0;
  const netProfit = trades.reduce((acc, t) => acc + t.netPnl, 0);
  const netReturnPct = ((capital - config.initialCapital) / config.initialCapital) * 100;

  // Max Drawdown
  let peak = config.initialCapital;
  let maxDD = 0;
  let currentEquity = config.initialCapital;
  for (const t of trades) {
    currentEquity += t.netPnl;
    if (currentEquity > peak) peak = currentEquity;
    const dd = ((peak - currentEquity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  // Reward to Risk
  const winReturns = trades.filter((t) => t.netReturnPct > 0).map((t) => t.netReturnPct);
  const lossReturns = trades.filter((t) => t.netReturnPct <= 0).map((t) => Math.abs(t.netReturnPct));
  const avgWinPct = winReturns.length > 0 ? winReturns.reduce((a, b) => a + b, 0) / winReturns.length : 0;
  const avgLossPct = lossReturns.length > 0 ? lossReturns.reduce((a, b) => a + b, 0) / lossReturns.length : 1;
  const rewardToRisk = avgLossPct > 0 ? avgWinPct / avgLossPct : 1.0;

  // Sharpe & Sortino
  const returns = trades.map((t) => t.netReturnPct);
  const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 1
    ? returns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1)
    : 0.0001;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(252 * 4) : 0; // Anualizado para intradiário

  const downsideReturns = returns.filter((r) => r < 0);
  const downsideVariance = downsideReturns.length > 0
    ? downsideReturns.reduce((acc, r) => acc + Math.pow(r, 2), 0) / downsideReturns.length
    : 0.0001;
  const downsideStdDev = Math.sqrt(downsideVariance);
  const sortinoRatio = downsideStdDev > 0 ? (meanReturn / downsideStdDev) * Math.sqrt(252 * 4) : 0;

  const avgDurationMinutes = trades.length > 0
    ? trades.reduce((acc, t) => acc + t.durationMinutes, 0) / trades.length
    : 0;

  return {
    trades,
    metrics: {
      totalTrades,
      winTrades,
      lossTrades,
      winRate: parseFloat(winRate.toFixed(2)),
      grossProfit: parseFloat(grossProfit.toFixed(2)),
      grossLoss: parseFloat(grossLoss.toFixed(2)),
      profitFactor: parseFloat(profitFactor.toFixed(2)),
      netProfit: parseFloat(netProfit.toFixed(2)),
      netReturnPct: parseFloat(netReturnPct.toFixed(2)),
      maxDrawdownPct: parseFloat(maxDD.toFixed(2)),
      avgWinPct: parseFloat(avgWinPct.toFixed(2)),
      avgLossPct: parseFloat(avgLossPct.toFixed(2)),
      rewardToRisk: parseFloat(rewardToRisk.toFixed(2)),
      sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
      sortinoRatio: parseFloat(sortinoRatio.toFixed(2)),
      avgDurationMinutes: Math.round(avgDurationMinutes),
    },
  };
}

async function main() {
  console.log("=========================================================================");
  console.log("   TRADEAI VALIDAÇÃO QUANTITATIVA: BACKTEST & WALK-FORWARD ROLLING       ");
  console.log("   Fonte: 100% Cotações Reais Binance REST (Zero Mocks / Zero Sintéticos)");
  console.log("=========================================================================\n");

  const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
  const strategies: ("MEAN_REVERSION" | "TREND_MOMENTUM" | "VOL_BREAKOUT")[] = [
    "MEAN_REVERSION",
    "TREND_MOMENTUM",
    "VOL_BREAKOUT",
  ];

  for (const symbol of symbols) {
    console.log(`\n=======================================================`);
    console.log(`>>> Ativo: ${symbol} (Candles Reais Binance 15m)`);
    console.log(`=======================================================`);

    const candles = await fetchBinanceKlines(symbol, "15m", 1000);
    console.log(`[Binance] ${candles.length} candles 15m baixados com sucesso.`);
    console.log(`Período analisado: ${new Date(candles[0].openTime).toISOString()} até ${new Date(candles[candles.length - 1].closeTime).toISOString()}`);

    const splitIndex = Math.floor(candles.length * 0.65);
    const inSampleCandles = candles.slice(0, splitIndex);
    const outOfSampleCandles = candles.slice(splitIndex);

    for (const strat of strategies) {
      console.log(`\n-------------------------------------------------------`);
      console.log(`>>> Estratégia: ${strat}`);
      console.log(`-------------------------------------------------------`);

      // Configuração ágil de curto prazo intradiário
      const shortTermConfig = {
        takeProfit: 1.4,            // 1.4% TP para alvos rápidos de curto prazo
        stopLoss: 0.9,             // 0.9% SL rígido
        trailingStopDistance: 0.4, // 0.4% Trailing após break-even
        breakEvenTrigger: 0.7,     // Armar break-even em +0.7%
        stagnationMinutes: 45,     // 45 min de tolerância para consolidação
        maxHoldingMinutes: 90,     // 90 min de holding intradiário máximo
        slippagePct: 0.05,         // 0.05% slippage real
        feePct: 0.10,              // 0.10% taxa por perna (0.20% roundtrip)
        initialCapital: 1000.0,
        riskFraction: 0.35,        // 35% de alocação por trade
      };

      // 1. In-Sample
      const inSample = simulateStrategy(inSampleCandles, symbol, strat, shortTermConfig);
      console.log(`[In-Sample] Trades: ${inSample.metrics.totalTrades} | WinRate: ${inSample.metrics.winRate}% | PF: ${inSample.metrics.profitFactor} | RetLiq: ${inSample.metrics.netReturnPct}% | MaxDD: ${inSample.metrics.maxDrawdownPct}% | Sharpe: ${inSample.metrics.sharpeRatio}`);

      // 2. Out-of-Sample
      const outOfSample = simulateStrategy(outOfSampleCandles, symbol, strat, shortTermConfig);
      console.log(`[Out-Sample] Trades: ${outOfSample.metrics.totalTrades} | WinRate: ${outOfSample.metrics.winRate}% | PF: ${outOfSample.metrics.profitFactor} | RetLiq: ${outOfSample.metrics.netReturnPct}% | MaxDD: ${outOfSample.metrics.maxDrawdownPct}% | Sharpe: ${outOfSample.metrics.sharpeRatio}`);

      // 3. Walk-Forward
      const windowSize = 300;
      const testSize = 120;
      let wfCount = 0;
      let positiveWindows = 0;

      for (let start = 0; start + windowSize + testSize <= candles.length; start += testSize) {
        wfCount++;
        const oosWindow = candles.slice(start + windowSize, start + windowSize + testSize);
        const oosRes = simulateStrategy(oosWindow, symbol, strat, shortTermConfig);
        if (oosRes.metrics.netReturnPct >= 0) positiveWindows++;
      }
      const wfConsistency = wfCount > 0 ? (positiveWindows / wfCount) * 100 : 0;
      console.log(`[Walk-Forward] ${positiveWindows}/${wfCount} janelas positivas (${wfConsistency.toFixed(1)}% consistência)`);
    }
  }

  console.log("\n=========================================================================");
  console.log("   TODAS AS VALIDAÇÕES QUANTITATIVAS CONCLUÍDAS COM SUCESSO!           ");
  console.log("=========================================================================\n");
}

main().catch(console.error);
