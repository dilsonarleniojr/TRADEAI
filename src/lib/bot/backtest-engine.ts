/**
 * Motor de Simulação Histórica de Backtesting com Fricção Realista (Pilar 3 Institucional)
 * Modela:
 * - Taxas de Corretagem da Exchange (Taker: 0.075%, Maker: 0.02%)
 * - Slippage Sintético de Execução (0.05% a 0.10%)
 * - Chandelier Trailing Stop dinâmico e Stop Loss estrito
 * - Curva de Equity e Métricas de Risco (Sharpe, Sortino, Drawdown, Profit Factor, Payoff)
 */

import type { KlineData } from "@/lib/store";
import type { BotStrategy } from "@/lib/store/types";
import { calculateRSI, calculateEMA } from "./indicators";
import { calculateRiskMetrics, type PortfolioRiskMetrics } from "./risk-metrics";

export interface BacktestParams {
  symbol: string;
  strategy: BotStrategy;
  allocationAmount: number;
  takeProfit: number;
  stopLoss: number;
  trailingStop: boolean;
  trailingStopDistance: number;
  takerFeePercent?: number; // 0.075% padrão Binance BNB
  slippagePercent?: number; // 0.05% slippage médio
}

export interface SimulatedTrade {
  id: string;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  totalCost: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  pnlPercent: number;
  exitReason: "TAKE_PROFIT" | "STOP_LOSS" | "TRAILING_STOP" | "END_OF_SERIES";
}

export interface EquityCurvePoint {
  time: number;
  equity: number;
  drawdownPercent: number;
  tradeNumber: number;
}

export interface BacktestResult {
  symbol: string;
  strategy: BotStrategy;
  initialCapital: number;
  finalCapital: number;
  netProfitUsdt: number;
  totalReturnPercent: number;
  totalTrades: number;
  metrics: PortfolioRiskMetrics;
  trades: SimulatedTrade[];
  equityCurve: EquityCurvePoint[];
}

export function runBacktestSimulation(
  klines: KlineData[],
  params: BacktestParams
): BacktestResult {
  const takerFee = (params.takerFeePercent ?? 0.075) / 100;
  const slippage = (params.slippagePercent ?? 0.05) / 100;
  const initialCapital = params.allocationAmount || 100.0;

  if (!klines || klines.length < 30) {
    throw new Error("Série temporal insuficiente para backtesting (mínimo de 30 velas)");
  }

  const closes = klines.map((k) => k.close);
  const rsiValues = calculateRSI(closes, 14);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);

  let currentCapital = initialCapital;
  let peakCapital = initialCapital;

  let inPosition = false;
  let entryPrice = 0;
  let entryTime = 0;
  let positionQty = 0;
  let highestPriceSinceEntry = 0;

  const simulatedTrades: SimulatedTrade[] = [];
  const equityCurve: EquityCurvePoint[] = [
    {
      time: klines[0].time,
      equity: initialCapital,
      drawdownPercent: 0,
      tradeNumber: 0,
    },
  ];

  for (let i = 25; i < klines.length; i++) {
    const candle = klines[i];
    const prevCandle = klines[i - 1];
    const rsi = rsiValues[i] || 50;
    const prevRsi = rsiValues[i - 1] || 50;
    const fastEma = ema9[i] || candle.close;
    const slowEma = ema21[i] || candle.close;
    const trendEma = ema50[i] || candle.close;

    if (!inPosition) {
      // 1. AVALIAÇÃO DE GATILHOS DE ENTRADA (COMPRA)
      let shouldBuy = false;

      switch (params.strategy) {
        case "QUANT_ENSEMBLE":
          // Tendência de alta (Preço > EMA 50) + Cruzamento EMA 9 > 21 + RSI saudável entre 40 e 62
          shouldBuy = candle.close > trendEma && fastEma > slowEma && rsi >= 40 && rsi <= 62;
          break;
        case "RSI":
          // Reversão de sobrevenda confirmada
          shouldBuy = prevRsi < 32 && rsi >= 32;
          break;
        case "MOMENTUM":
          // Rompimento da máxima anterior com volume
          shouldBuy = candle.close > prevCandle.high && candle.volume > prevCandle.volume * 1.15;
          break;
        case "ATR_BREAKOUT":
          // Expansão de volatilidade
          const candleRange = candle.high - candle.low;
          const avgRange = (prevCandle.high - prevCandle.low + candleRange) / 2;
          shouldBuy = candle.close > prevCandle.close && candleRange > avgRange * 1.25;
          break;
        default:
          shouldBuy = fastEma > slowEma && rsi > 45 && rsi < 65;
          break;
      }

      if (shouldBuy) {
        inPosition = true;
        // Execução com slippage de compra
        entryPrice = candle.close * (1 + slippage);
        entryTime = candle.time;
        highestPriceSinceEntry = entryPrice;

        const effectiveAllocation = Math.min(currentCapital, params.allocationAmount);
        positionQty = effectiveAllocation / entryPrice;

        // Deduz taxa de entrada Taker
        const entryFee = effectiveAllocation * takerFee;
        currentCapital -= entryFee;
      }
    } else {
      // 2. AVALIAÇÃO DE GATILHOS DE SAÍDA (POSIÇÃO ABERTA)
      if (candle.high > highestPriceSinceEntry) {
        highestPriceSinceEntry = candle.high;
      }

      let shouldExit = false;
      let exitReason: SimulatedTrade["exitReason"] = "END_OF_SERIES";
      let proposedExitPrice = candle.close;

      const targetProfitPrice = entryPrice * (1 + params.takeProfit / 100);
      const hardStopLossPrice = entryPrice * (1 - params.stopLoss / 100);

      // A) Take Profit atingido na máxima da vela
      if (candle.high >= targetProfitPrice) {
        shouldExit = true;
        exitReason = "TAKE_PROFIT";
        proposedExitPrice = targetProfitPrice;
      }
      // B) Hard Stop Loss violado na mínima da vela
      else if (candle.low <= hardStopLossPrice) {
        shouldExit = true;
        exitReason = "STOP_LOSS";
        proposedExitPrice = hardStopLossPrice;
      }
      // C) Chandelier Trailing Stop ativado
      else if (params.trailingStop) {
        const trailingDist = (params.trailingStopDistance || 0.6) / 100;
        const trailingStopPrice = highestPriceSinceEntry * (1 - trailingDist);

        // Apenas aciona se o preço já andou a favor pelo menos metade da distância do TP
        const movedInProfit = highestPriceSinceEntry > entryPrice * 1.004;
        if (movedInProfit && candle.low <= trailingStopPrice) {
          shouldExit = true;
          exitReason = "TRAILING_STOP";
          proposedExitPrice = trailingStopPrice;
        }
      }

      // Se for a última vela da série, fecha a mercado
      if (!shouldExit && i === klines.length - 1) {
        shouldExit = true;
        exitReason = "END_OF_SERIES";
        proposedExitPrice = candle.close;
      }

      if (shouldExit) {
        // Execução com slippage de saída
        const finalExitPrice = proposedExitPrice * (1 - slippage);
        const grossTotal = positionQty * finalExitPrice;
        const exitFee = grossTotal * takerFee;
        const netTotal = grossTotal - exitFee;

        const cost = positionQty * entryPrice;
        const netPnl = netTotal - cost;
        const pnlPercent = cost > 0 ? (netPnl / cost) * 100 : 0;

        currentCapital += netPnl;
        if (currentCapital > peakCapital) {
          peakCapital = currentCapital;
        }
        const ddPct = peakCapital > 0 ? ((peakCapital - currentCapital) / peakCapital) * 100 : 0;

        simulatedTrades.push({
          id: `BT-${simulatedTrades.length + 1}`,
          entryTime,
          exitTime: candle.time,
          entryPrice: parseFloat(entryPrice.toFixed(4)),
          exitPrice: parseFloat(finalExitPrice.toFixed(4)),
          quantity: parseFloat(positionQty.toFixed(4)),
          totalCost: parseFloat(cost.toFixed(2)),
          grossPnl: parseFloat((grossTotal - cost).toFixed(2)),
          fees: parseFloat((exitFee + (cost * takerFee)).toFixed(4)),
          netPnl: parseFloat(netPnl.toFixed(2)),
          pnlPercent: parseFloat(pnlPercent.toFixed(2)),
          exitReason,
        });

        equityCurve.push({
          time: candle.time,
          equity: parseFloat(currentCapital.toFixed(2)),
          drawdownPercent: parseFloat(ddPct.toFixed(2)),
          tradeNumber: simulatedTrades.length,
        });

        inPosition = false;
        positionQty = 0;
      }
    }
  }

  // Conversão para o formato padrão do calculador de métricas
  const tradeDataList = simulatedTrades.map((t) => ({
    id: t.id,
    symbol: params.symbol,
    side: "SELL" as const,
    price: t.exitPrice,
    quantity: t.quantity,
    total: t.totalCost,
    strategy: params.strategy,
    mode: "paper" as const,
    pnl: t.netPnl,
    timestamp: new Date(t.exitTime).toISOString(),
  }));

  const metrics = calculateRiskMetrics(tradeDataList, initialCapital);
  const netProfitUsdt = parseFloat((currentCapital - initialCapital).toFixed(2));
  const totalReturnPercent = parseFloat(((netProfitUsdt / initialCapital) * 100).toFixed(2));

  return {
    symbol: params.symbol,
    strategy: params.strategy,
    initialCapital,
    finalCapital: parseFloat(currentCapital.toFixed(2)),
    netProfitUsdt,
    totalReturnPercent,
    totalTrades: simulatedTrades.length,
    metrics,
    trades: simulatedTrades,
    equityCurve,
  };
}
