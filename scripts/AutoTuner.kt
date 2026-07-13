package scripts

import kotlin.math.sqrt

// ==============================================================================
// 8. Auto-Tuner de Parâmetros (Combinatória e Walk-Forward Analysis)
// ==============================================================================
data class TunedParameters(
    val shortPeriod: Int,
    val longPeriod: Int,
    val rsiPeriod: Int,
    val stopLossPct: Double,
    val takeProfitPct: Double,
    val expectedSharpe: Double
)

class AutoTunerEngine {
    
    fun optimizeParameters(symbol: String, history: List<TickData>): TunedParameters {
        if (history.size < 20) {
            // Retorna padrão seguro caso histórico seja escasso
            return TunedParameters(10, 21, 14, 0.02, 0.04, 1.5)
        }

        var bestParams = TunedParameters(10, 21, 14, 0.02, 0.04, -999.0)
        var maxScore = -999.0

        // Combinatória walk-forward sobre intervalos de períodos de indicadores
        for (shortPeriod in listOf(5, 10, 15)) {
            for (longPeriod in listOf(20, 30, 40)) {
                for (rsiPeriod in listOf(7, 14)) {
                    val score = simulateAndBacktest(history, shortPeriod, longPeriod, rsiPeriod)
                    if (score > maxScore) {
                        maxScore = score
                        bestParams = TunedParameters(
                            shortPeriod = shortPeriod,
                            longPeriod = longPeriod,
                            rsiPeriod = rsiPeriod,
                            stopLossPct = 0.02,
                            takeProfitPct = 0.05,
                            expectedSharpe = score
                        )
                    }
                }
            }
        }
        return bestParams
    }

    private fun simulateAndBacktest(
        history: List<TickData>,
        shortPeriod: Int,
        longPeriod: Int,
        rsiPeriod: Int
    ): Double {
        var lastPrice = 0.0
        val trades = mutableListOf<Double>()
        var entryPrice = 0.0
        var isBought = false

        // Simula operações baseadas na combinação cruzamento de preço
        for (i in 0 until history.size) {
            val price = history[i].price
            if (i < longPeriod) continue
            
            // Simula cruzamento simples
            if (!isBought && price > history[i - shortPeriod].price) {
                entryPrice = price
                isBought = true
            } else if (isBought && price < history[i - shortPeriod].price) {
                val ret = (price - entryPrice) / entryPrice
                trades.add(ret)
                isBought = false
            }
        }

        if (trades.isEmpty()) return 0.0

        // 1. Sharpe Ratio Simplificado
        val mean = trades.average()
        val variance = trades.map { kotlin.math.pow(it - mean, 2.0) }.sum() / trades.size
        val stdDev = kotlin.math.sqrt(variance)
        val rawSharpe = if (stdDev > 0.0) mean / stdDev else 0.0

        // 2. Detecção e Penalidade de Overfitting (Foco em poucos trades de sorte)
        val totalProfit = trades.filter { it > 0 }.sum()
        var maxSingleTrade = 0.0
        for (t in trades) {
            if (t > maxSingleTrade) maxSingleTrade = t
        }

        val luckyTradeRatio = if (totalProfit > 0.0) maxSingleTrade / totalProfit else 0.0
        val penalty = if (luckyTradeRatio > 0.50 || trades.size < 3) 0.1 else 1.0

        return rawSharpe * penalty
    }
}

// ==============================================================================
// 9. Alvos Dinâmicos Baseados em Volatilidade (ATR) e Livro de Ofertas (Order Book)
// ==============================================================================
data class OrderBookData(
    val bids: List<Pair<Double, Double>>,
    val asks: List<Pair<Double, Double>>
)

data class ExitTargets(
    val stopLoss: Double,
    val takeProfit: Double
)

class DynamicExitCalculator {

    fun calculateTargets(
        symbol: String,
        entryPrice: Double,
        atr: Double,
        orderBook: OrderBookData,
        side: String = "BUY"
    ): ExitTargets {
        // Encontra muros de liquidez (níveis com maiores volumes de ordens limitadas)
        val supportWall = orderBook.bids.maxByOrNull { it.second }?.first ?: (entryPrice * 0.98)
        val resistanceWall = orderBook.asks.maxByOrNull { it.second }?.first ?: (entryPrice * 1.02)

        return if (side == "BUY") {
            // Stop Loss colocado logo abaixo do suporte, ajustado pela volatilidade ATR
            val stopLoss = minOf(supportWall - (1.5 * atr), entryPrice * 0.95)
            // Take Profit colocado logo abaixo da resistência, ajustado pelo ATR
            val takeProfit = maxOf(resistanceWall - (0.5 * atr), entryPrice * 1.02)
            ExitTargets(stopLoss, takeProfit)
        } else {
            // Venda/Short: SL acima da resistência, TP próximo ao suporte
            val stopLoss = maxOf(resistanceWall + (1.5 * atr), entryPrice * 1.05)
            val takeProfit = minOf(supportWall + (0.5 * atr), entryPrice * 0.98)
            ExitTargets(stopLoss, takeProfit)
        }
    }
}
