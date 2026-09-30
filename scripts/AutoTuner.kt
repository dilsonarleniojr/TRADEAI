package scripts

import kotlin.math.*
import kotlinx.coroutines.*

// ==============================================================================
// TRADEAI — Auto-Tuner: Motor de Otimização Dinâmica v2.0
//
// Arquitetura:
//   ParameterSpace          → Define o universo de busca combinatória
//   BacktestEngine          → Simula EMA/RSI/ATR reais sobre dados históricos
//   WalkForwardAnalyzer     → Divide janela in-sample / out-of-sample (70/30)
//   OverfittingPenaltyEngine→ 4 penalidades matemáticas anti-overfitting
//   DynamicExitCalculator   → Muros de Liquidez + ATR para SL/TP dinâmicos
//   AutoTunerEngine         → Orquestrador assíncrono (Dispatchers.Default)
// ==============================================================================

// ==============================================================================
// 1. Espaço de Parâmetros
// ==============================================================================

/**
 * Define o universo completo de hiperparâmetros a serem varridos.
 * Combinações válidas (shortPeriod < longPeriod): ~1.240
 */
data class ParameterCombo(
    val shortPeriod: Int,       // Período da EMA rápida (5..25)
    val longPeriod: Int,        // Período da EMA lenta  (20..60)
    val rsiPeriod: Int,         // Período do RSI (7..21)
    val atrPeriod: Int,         // Período do ATR (10..20)
    val stopAtrMultiplier: Double, // Multiplicador ATR para Stop Loss (1.0..3.0)
    val tpAtrMultiplier: Double    // Multiplicador ATR para Take Profit (1.5..4.0)
)

object ParameterSpace {
    /** Gera todas as combinações válidas de hiperparâmetros. */
    fun generateCombinations(): List<ParameterCombo> {
        val combos = mutableListOf<ParameterCombo>()
        val shortRange = (5..25 step 2).toList()         // 11 valores
        val longRange  = (20..60 step 4).toList()         // 11 valores
        val rsiRange   = listOf(7, 9, 14, 21)             //  4 valores
        val atrRange   = listOf(10, 14, 20)               //  3 valores
        val stopMults  = listOf(1.0, 1.5, 2.0, 2.5, 3.0) //  5 valores
        val tpMults    = listOf(1.5, 2.0, 2.5, 3.0, 4.0) //  5 valores

        for (s in shortRange) {
            for (l in longRange) {
                if (s >= l) continue   // Restrição: EMA rápida < EMA lenta
                for (rsi in rsiRange) {
                    for (atr in atrRange) {
                        for (sm in stopMults) {
                            for (tm in tpMults) {
                                if (tm <= sm) continue // TP > SL sempre
                                combos.add(ParameterCombo(s, l, rsi, atr, sm, tm))
                            }
                        }
                    }
                }
            }
        }
        return combos
    }
}

// ==============================================================================
// 2. Indicadores Técnicos Reais
// ==============================================================================

object TechnicalIndicators {

    /** Exponential Moving Average (EMA) sobre lista de preços. */
    fun ema(prices: List<Double>, period: Int): List<Double> {
        if (prices.size < period) return emptyList()
        val k = 2.0 / (period + 1.0)
        val result = mutableListOf<Double>()
        var prevEma = prices.take(period).average()
        result.add(prevEma)
        for (i in period until prices.size) {
            prevEma = prices[i] * k + prevEma * (1.0 - k)
            result.add(prevEma)
        }
        return result
    }

    /** Relative Strength Index (RSI) com Wilder's smoothing. */
    fun rsi(prices: List<Double>, period: Int): List<Double> {
        if (prices.size < period + 1) return emptyList()
        val result = mutableListOf<Double>()
        val changes = prices.zipWithNext { a, b -> b - a }

        // Primeira média de ganhos/perdas
        var avgGain = changes.take(period).filter { it > 0 }.average().let { if (it.isNaN()) 0.0 else it }
        var avgLoss = changes.take(period).filter { it < 0 }.map { -it }.average().let { if (it.isNaN()) 0.0 else it }

        fun rsVal(): Double {
            if (avgLoss == 0.0) return 100.0
            val rs = avgGain / avgLoss
            return 100.0 - (100.0 / (1.0 + rs))
        }
        result.add(rsVal())

        // Smoothed Wilder's RSI
        for (i in period until changes.size) {
            val gain = if (changes[i] > 0) changes[i] else 0.0
            val loss = if (changes[i] < 0) -changes[i] else 0.0
            avgGain = (avgGain * (period - 1) + gain) / period
            avgLoss = (avgLoss * (period - 1) + loss) / period
            result.add(rsVal())
        }
        return result
    }

    /** Average True Range (ATR) com smoothing de Wilder. */
    fun atr(highs: List<Double>, lows: List<Double>, closes: List<Double>, period: Int): List<Double> {
        if (closes.size < period + 1) return emptyList()
        val trList = mutableListOf<Double>()
        for (i in 1 until closes.size) {
            val tr = maxOf(
                highs[i] - lows[i],
                abs(highs[i] - closes[i - 1]),
                abs(lows[i] - closes[i - 1])
            )
            trList.add(tr)
        }
        if (trList.size < period) return emptyList()
        val result = mutableListOf<Double>()
        var atrVal = trList.take(period).average()
        result.add(atrVal)
        for (i in period until trList.size) {
            atrVal = (atrVal * (period - 1) + trList[i]) / period
            result.add(atrVal)
        }
        return result
    }

    /**
     * Calcula R² (Coeficiente de Determinação) de uma curva de equity.
     * R² próximo de 1.0 = crescimento linear e consistente.
     */
    fun equityCurveR2(equityCurve: List<Double>): Double {
        if (equityCurve.size < 3) return 0.0
        val n = equityCurve.size.toDouble()
        val xMean = (n - 1) / 2.0
        val yMean = equityCurve.average()
        var ssRes = 0.0
        var ssTot = 0.0
        // Ajuste de linha de regressão linear OLS
        var sxy = 0.0
        var sxx = 0.0
        equityCurve.forEachIndexed { i, y ->
            val dx = i - xMean
            sxy += dx * (y - yMean)
            sxx += dx * dx
        }
        val slope = if (sxx != 0.0) sxy / sxx else 0.0
        val intercept = yMean - slope * xMean
        equityCurve.forEachIndexed { i, y ->
            val predicted = intercept + slope * i
            ssRes += (y - predicted).pow(2)
            ssTot += (y - yMean).pow(2)
        }
        return if (ssTot == 0.0) 0.0 else maxOf(0.0, 1.0 - ssRes / ssTot)
    }
}

// ==============================================================================
// 3. Resultado do Backtest
// ==============================================================================

data class BacktestResult(
    val sharpe: Double,
    val totalReturn: Double,
    val maxDrawdown: Double,        // Percentual (0.0..1.0)
    val totalTrades: Int,
    val winRate: Double,
    val luckyTradeRatio: Double,    // Fração do lucro em 1 trade lucky
    val equityCurveR2: Double,      // Linearidade da curva de equity (0..1)
    val equityCurve: List<Double>   // Para análise walk-forward
)

// ==============================================================================
// 4. Motor de Backtest com Indicadores Reais
// ==============================================================================

class BacktestEngine {

    /**
     * Simula estratégia de cruzamento de EMA + filtro RSI sobre dados históricos.
     * Usa ATR para calcular Stop Loss e Take Profit dinâmicos em cada trade.
     */
    fun simulate(
        history: List<TickData>,
        params: ParameterCombo
    ): BacktestResult {
        val minRequired = params.longPeriod + params.atrPeriod + 5
        if (history.size < minRequired) {
            return BacktestResult(0.0, 0.0, 0.0, 0, 0.0, 0.0, 0.0, emptyList())
        }

        val prices = history.map { it.price }
        // Simulamos High/Low como ±0.1% do preço de fechamento (dados tick → candle sintético)
        val highs  = prices.map { it * 1.001 }
        val lows   = prices.map { it * 0.999 }

        val emaFastAll = TechnicalIndicators.ema(prices, params.shortPeriod)
        val emaSlowAll = TechnicalIndicators.ema(prices, params.longPeriod)
        val rsiAll     = TechnicalIndicators.rsi(prices, params.rsiPeriod)
        val atrAll     = TechnicalIndicators.atr(highs, lows, prices, params.atrPeriod)

        // Alinha todos os indicadores ao mesmo índice base
        val offset = params.longPeriod  // índice de prices correspondente ao emaSlowAll[0]
        val rsiOffset = params.rsiPeriod
        val atrOffset = params.atrPeriod + 1

        // Capital tracking
        var capital = 1.0
        var entryPrice = 0.0
        var stopLoss = 0.0
        var takeProfit = 0.0
        var inTrade = false
        val tradeReturns = mutableListOf<Double>()
        val equityCurve = mutableListOf<Double>(capital)

        for (i in 0 until emaFastAll.size) {
            val priceIdx = i + offset
            if (priceIdx >= prices.size) break
            val currentPrice = prices[priceIdx]

            // Índices relativos para RSI e ATR
            val rsiIdx = priceIdx - rsiOffset
            val atrIdx = priceIdx - atrOffset
            if (rsiIdx < 0 || rsiIdx >= rsiAll.size) continue
            if (atrIdx < 0 || atrIdx >= atrAll.size) continue

            val emaFast = emaFastAll[i]
            val emaSlow = if (i < emaSlowAll.size) emaSlowAll[i] else continue
            val rsi = rsiAll[rsiIdx]
            val atrVal = atrAll[atrIdx]

            if (!inTrade) {
                // Sinal de entrada: cruzamento EMA para cima + RSI não sobrecomprado
                val prevIdx = maxOf(0, i - 1)
                val prevFast = emaFastAll[prevIdx]
                val prevSlow = if (prevIdx < emaSlowAll.size) emaSlowAll[prevIdx] else continue

                if (prevFast <= prevSlow && emaFast > emaSlow && rsi < 65.0) {
                    entryPrice = currentPrice
                    stopLoss   = currentPrice - params.stopAtrMultiplier * atrVal
                    takeProfit = currentPrice + params.tpAtrMultiplier * atrVal
                    inTrade = true
                }
            } else {
                // Saída por TP, SL ou cruzamento inverso
                val emaFastPrev = emaFastAll[maxOf(0, i - 1)]
                val emaSlowPrev = if (i - 1 >= 0 && i - 1 < emaSlowAll.size) emaSlowAll[i - 1] else emaSlow
                val crossDown = emaFastPrev > emaSlowPrev && emaFast <= emaSlow

                val exitByStop   = currentPrice <= stopLoss
                val exitByTarget = currentPrice >= takeProfit
                val exitByCross  = crossDown && rsi > 55.0

                if (exitByStop || exitByTarget || exitByCross) {
                    val ret = (currentPrice - entryPrice) / entryPrice
                    capital *= (1.0 + ret)
                    tradeReturns.add(ret)
                    equityCurve.add(capital)
                    inTrade = false
                }
            }
        }

        if (tradeReturns.isEmpty()) {
            return BacktestResult(0.0, 0.0, 0.0, 0, 0.0, 0.0, 0.0, equityCurve)
        }

        // Métricas de performance
        val mean = tradeReturns.average()
        val variance = tradeReturns.map { (it - mean).pow(2) }.average()
        val stdDev = sqrt(variance)
        val sharpe = if (stdDev > 0.0) (mean / stdDev) * sqrt(252.0) else 0.0

        val wins = tradeReturns.count { it > 0 }
        val winRate = wins.toDouble() / tradeReturns.size.toDouble()
        val totalReturn = capital - 1.0

        // Max Drawdown
        var peak = equityCurve.first()
        var maxDrawdown = 0.0
        for (val v in equityCurve) {
            if (v > peak) peak = v
            val dd = (peak - v) / peak
            if (dd > maxDrawdown) maxDrawdown = dd
        }

        // Lucky trade ratio: fração do lucro total concentrada no maior trade
        val profits = tradeReturns.filter { it > 0 }
        val totalProfit = profits.sum()
        val maxSingleProfit = profits.maxOrNull() ?: 0.0
        val luckyTradeRatio = if (totalProfit > 0.0) maxSingleProfit / totalProfit else 0.0

        // R² da equity curve (linearidade = consistência)
        val r2 = TechnicalIndicators.equityCurveR2(equityCurve)

        return BacktestResult(
            sharpe           = sharpe,
            totalReturn      = totalReturn,
            maxDrawdown      = maxDrawdown,
            totalTrades      = tradeReturns.size,
            winRate          = winRate,
            luckyTradeRatio  = luckyTradeRatio,
            equityCurveR2    = r2,
            equityCurve      = equityCurve.toList()
        )
    }
}

// ==============================================================================
// 5. Walk-Forward Analyzer (70% In-Sample / 30% Out-of-Sample)
// ==============================================================================

data class WalkForwardResult(
    val inSampleResult: BacktestResult,
    val outOfSampleResult: BacktestResult,
    /** Estabilidade: quanto menor a diferença de Sharpe, mais robusto o parâmetro */
    val sharpeDivergence: Double,
    val robustnessScore: Double   // Score composto final (maior = melhor)
)

class WalkForwardAnalyzer(private val backtestEngine: BacktestEngine = BacktestEngine()) {

    private val inSampleRatio = 0.70

    fun analyze(history: List<TickData>, params: ParameterCombo): WalkForwardResult {
        val splitIdx = (history.size * inSampleRatio).toInt()
        val inSample  = history.subList(0, splitIdx)
        val outSample = history.subList(splitIdx, history.size)

        val inResult  = backtestEngine.simulate(inSample, params)
        val outResult = backtestEngine.simulate(outSample, params)

        val sharpeDivergence = abs(inResult.sharpe - outResult.sharpe)
        // Robustez: Sharpe out-of-sample pesado, penalizando divergência
        val robustness = outResult.sharpe - (sharpeDivergence * 0.5)

        return WalkForwardResult(
            inSampleResult  = inResult,
            outOfSampleResult = outResult,
            sharpeDivergence  = sharpeDivergence,
            robustnessScore   = robustness
        )
    }
}

// ==============================================================================
// 6. Motor de Penalidade Anti-Overfitting (4 Camadas Matemáticas)
// ==============================================================================

/**
 * Retorna um multiplicador de penalidade entre 0.0 (descartado) e 1.0 (sem penalidade).
 * Score final = rawScore * penaltyMultiplier
 */
object OverfittingPenaltyEngine {

    /**
     * P1 — Lucky Trade Penalty:
     *   Se um único trade representa >45% do lucro total, o resultado é provavelmente sorte.
     *   Penaliza com fator 0.10 (quasi-descarte).
     */
    private fun luckyTradePenalty(result: BacktestResult): Double {
        return if (result.luckyTradeRatio > 0.45) 0.10 else 1.0
    }

    /**
     * P2 — Minimum Trade Count Penalty:
     *   Menos de 5 trades = sem significância estatística. Descarta completamente.
     */
    private fun minTradesPenalty(result: BacktestResult): Double {
        return when {
            result.totalTrades < 3  -> 0.0
            result.totalTrades < 5  -> 0.3
            result.totalTrades < 10 -> 0.7
            else                    -> 1.0
        }
    }

    /**
     * P3 — Walk-Forward Stability Penalty:
     *   Se o Sharpe in-sample diverge muito do out-of-sample, o parâmetro é overfit.
     *   Divergência > 1.5 = penalidade severa (0.2).
     *   Divergência > 0.8 = penalidade moderada (0.5).
     */
    private fun walkForwardStabilityPenalty(wfResult: WalkForwardResult): Double {
        return when {
            wfResult.sharpeDivergence > 1.5 -> 0.20
            wfResult.sharpeDivergence > 0.8 -> 0.50
            wfResult.sharpeDivergence > 0.4 -> 0.80
            else                            -> 1.0
        }
    }

    /**
     * P4 — Equity Curve Linearity Penalty:
     *   R² < 0.60 = lucros concentrados em bursts (não linear/consistente).
     *   Penaliza distribuições de lucro não-uniformes.
     */
    private fun equityCurveLinearityPenalty(result: BacktestResult): Double {
        return when {
            result.equityCurveR2 < 0.30 -> 0.20
            result.equityCurveR2 < 0.50 -> 0.50
            result.equityCurveR2 < 0.70 -> 0.80
            else                        -> 1.0
        }
    }

    /**
     * Aplica todas as 4 penalidades e retorna o score ajustado final.
     */
    fun applyPenalties(
        rawScore: Double,
        outResult: BacktestResult,
        wfResult: WalkForwardResult
    ): Double {
        val p1 = luckyTradePenalty(outResult)
        val p2 = minTradesPenalty(outResult)
        val p3 = walkForwardStabilityPenalty(wfResult)
        val p4 = equityCurveLinearityPenalty(outResult)
        val combined = p1 * p2 * p3 * p4
        return rawScore * combined
    }
}

// ==============================================================================
// 7. Alvos Dinâmicos Baseados em Liquidez (Order Book Walls + ATR)
// ==============================================================================

data class OrderBookData(
    val bids: List<Pair<Double, Double>>,  // (price, size) ordenado desc
    val asks: List<Pair<Double, Double>>   // (price, size) ordenado asc
)

data class LiquidityWall(val price: Double, val totalVolume: Double, val isBid: Boolean)

data class ExitTargets(
    val stopLoss: Double,
    val takeProfit: Double,
    val riskRewardRatio: Double,
    val stopLossRationale: String,
    val takeProfitRationale: String
)

class DynamicExitCalculator {

    /**
     * Identifica os TOP-5 muros de liquidez no book (bid e ask lado).
     * Um "muro" é um nível de preço com volume anormalmente alto
     * (>2 desvios padrão acima da média de volume nos níveis visíveis).
     */
    private fun detectLiquidityWalls(
        orderBook: OrderBookData,
        topN: Int = 5
    ): Pair<List<LiquidityWall>, List<LiquidityWall>> {
        fun wallsFromSide(levels: List<Pair<Double, Double>>, isBid: Boolean): List<LiquidityWall> {
            if (levels.isEmpty()) return emptyList()
            val volumes = levels.map { it.second }
            val mean = volumes.average()
            val std  = sqrt(volumes.map { (it - mean).pow(2) }.average())
            val threshold = mean + 1.5 * std  // Nível de "muro": 1.5σ acima da média

            return levels
                .filter { it.second >= threshold }
                .sortedByDescending { it.second }
                .take(topN)
                .map { LiquidityWall(it.first, it.second, isBid) }
        }

        val bidWalls = wallsFromSide(orderBook.bids, isBid = true)
        val askWalls = wallsFromSide(orderBook.asks, isBid = false)
        return Pair(bidWalls, askWalls)
    }

    /**
     * Calcula Stop Loss e Take Profit dinâmicos baseados em:
     *   1. Muros de liquidez do Order Book (onde estão os grandes players)
     *   2. ATR (volatilidade atual) para ajuste de amplitude
     *
     * Para BUY:
     *   - Stop Loss = muro de suporte mais próximo abaixo do preço, recuando 1x ATR
     *   - Take Profit = muro de resistência mais próximo acima, avançando 0.5x ATR
     *
     * Para SELL/SHORT (simétrico invertido)
     */
    fun calculateTargets(
        entryPrice: Double,
        atr: Double,
        orderBook: OrderBookData,
        side: String = "BUY",
        atrStopMultiplier: Double = 1.5,
        atrTpMultiplier: Double = 0.5
    ): ExitTargets {
        val (bidWalls, askWalls) = detectLiquidityWalls(orderBook)

        return if (side == "BUY") {
            // Muro de suporte: muro de bids mais próximo ABAIXO do preço
            val nearestSupport = bidWalls
                .filter { it.price < entryPrice }
                .maxByOrNull { it.price }

            // Muro de resistência: muro de asks mais próximo ACIMA do preço
            val nearestResistance = askWalls
                .filter { it.price > entryPrice }
                .minByOrNull { it.price }

            val slBase = nearestSupport?.price ?: (entryPrice * 0.975)
            val tpBase = nearestResistance?.price ?: (entryPrice * 1.025)

            val stopLoss   = minOf(slBase - atrStopMultiplier * atr, entryPrice * 0.96)
            val takeProfit = maxOf(tpBase - atrTpMultiplier  * atr, entryPrice * 1.015)

            val rr = if (entryPrice - stopLoss > 0) {
                (takeProfit - entryPrice) / (entryPrice - stopLoss)
            } else 0.0

            val slRationale = if (nearestSupport != null)
                "Muro bid ${nearestSupport.price.format(2)} (vol=${nearestSupport.totalVolume.format(1)}) − ATR×${atrStopMultiplier}"
            else "Fallback: entry×0.975 − ATR×${atrStopMultiplier}"

            val tpRationale = if (nearestResistance != null)
                "Muro ask ${nearestResistance.price.format(2)} (vol=${nearestResistance.totalVolume.format(1)}) − ATR×${atrTpMultiplier}"
            else "Fallback: entry×1.025 − ATR×${atrTpMultiplier}"

            ExitTargets(stopLoss, takeProfit, rr, slRationale, tpRationale)
        } else {
            // SHORT: lógica espelhada
            val nearestResistance = askWalls
                .filter { it.price > entryPrice }
                .minByOrNull { it.price }

            val nearestSupport = bidWalls
                .filter { it.price < entryPrice }
                .maxByOrNull { it.price }

            val slBase = nearestResistance?.price ?: (entryPrice * 1.025)
            val tpBase = nearestSupport?.price ?: (entryPrice * 0.975)

            val stopLoss   = maxOf(slBase + atrStopMultiplier * atr, entryPrice * 1.04)
            val takeProfit = minOf(tpBase + atrTpMultiplier  * atr, entryPrice * 0.985)

            val rr = if (stopLoss - entryPrice > 0) {
                (entryPrice - takeProfit) / (stopLoss - entryPrice)
            } else 0.0

            val slRationale = if (nearestResistance != null)
                "Muro ask ${nearestResistance.price.format(2)} + ATR×${atrStopMultiplier} (SHORT)"
            else "Fallback: entry×1.025 + ATR×${atrStopMultiplier}"

            val tpRationale = if (nearestSupport != null)
                "Muro bid ${nearestSupport.price.format(2)} + ATR×${atrTpMultiplier} (SHORT)"
            else "Fallback: entry×0.975 + ATR×${atrTpMultiplier}"

            ExitTargets(stopLoss, takeProfit, rr, slRationale, tpRationale)
        }
    }

    /** Gera um OrderBook mock realista para uso quando não há dados ao vivo. */
    fun generateMockOrderBook(currentPrice: Double): OrderBookData {
        val bids = (1..20).map { level ->
            val price = currentPrice - (level * currentPrice * 0.001)
            val baseVol = 2.0 + (level * 0.3)
            // Simula muros: alguns níveis têm volume anormalmente alto
            val vol = if (level in listOf(3, 7, 12)) baseVol * 8.0 else baseVol
            Pair(price, vol)
        }
        val asks = (1..20).map { level ->
            val price = currentPrice + (level * currentPrice * 0.001)
            val baseVol = 2.0 + (level * 0.3)
            val vol = if (level in listOf(4, 9, 15)) baseVol * 8.0 else baseVol
            Pair(price, vol)
        }
        return OrderBookData(bids, asks)
    }

    private fun Double.format(decimals: Int) = "%.${decimals}f".format(this)
}

// ==============================================================================
// 8. Parâmetros Otimizados (Output Rico do Auto-Tuner)
// ==============================================================================

data class TunedParameters(
    // Parâmetros de Indicadores
    val shortPeriod: Int,
    val longPeriod: Int,
    val rsiPeriod: Int,
    val atrPeriod: Int,
    // Saídas Dinâmicas
    val stopLoss: Double,
    val takeProfit: Double,
    val riskRewardRatio: Double,
    val stopLossAtrMultiplier: Double,
    val takeProfitAtrMultiplier: Double,
    val stopLossRationale: String,
    val takeProfitRationale: String,
    // Métricas de Qualidade
    val expectedSharpe: Double,
    val expectedMaxDrawdown: Double,
    val expectedWinRate: Double,
    val totalTradesInWindow: Int,
    val equityCurveR2: Double,
    val overallScore: Double,
    // Metadata
    val optimizationWindowDays: Int,
    val totalCombosEvaluated: Int
)

// ==============================================================================
// 9. AutoTunerEngine — Orquestrador Assíncrono Principal
// ==============================================================================

/**
 * Motor central de otimização. Roda em background (Dispatchers.Default).
 *
 * Uso:
 *   val engine = AutoTunerEngine()
 *   val result = engine.optimizeParametersAsync(
 *       scope       = viewModelScope,
 *       symbol      = "BTCUSDT",
 *       history     = historicalTicks,
 *       orderBook   = liveOrderBook,
 *       onProgress  = { done, total -> updateUi(done, total) }
 *   )
 */
class AutoTunerEngine(
    private val backtest: BacktestEngine         = BacktestEngine(),
    private val wfa:      WalkForwardAnalyzer    = WalkForwardAnalyzer(),
    private val exits:    DynamicExitCalculator  = DynamicExitCalculator()
) {
    companion object {
        const val DEFAULT_WINDOW_DAYS = 14
        val WINDOW_OPTIONS = listOf(7, 14, 30)
    }

    /**
     * Otimização assíncrona completa com walk-forward e anti-overfitting.
     *
     * @param scope       CoroutineScope do ViewModel (cancela automaticamente com o ciclo de vida)
     * @param symbol      Par a otimizar (ex: "BTCUSDT")
     * @param history     Lista de TickData dos últimos N dias
     * @param orderBook   Snapshot atual do book (opcional; usa mock se null)
     * @param windowDays  Janela de otimização (7, 14 ou 30 dias)
     * @param onProgress  Callback de progresso (done: Int, total: Int)
     * @return TunedParameters com os melhores parâmetros + saídas dinâmicas
     */
    suspend fun optimizeParametersAsync(
        scope: CoroutineScope,
        symbol: String,
        history: List<TickData>,
        orderBook: OrderBookData? = null,
        windowDays: Int = DEFAULT_WINDOW_DAYS,
        onProgress: ((done: Int, total: Int) -> Unit)? = null
    ): TunedParameters = withContext(Dispatchers.Default) {

        val allCombos = ParameterSpace.generateCombinations()
        val total = allCombos.size
        var done = 0

        // Fallback seguro com histórico insuficiente
        val minRequired = 50
        if (history.size < minRequired) {
            println("⚠️ [AutoTuner] Histórico insuficiente (${history.size} ticks). Retornando parâmetros conservadores.")
            return@withContext safeDefaults(windowDays, total)
        }

        println("🔬 [AutoTuner] Iniciando otimização: ${total} combinações × janela ${windowDays}d × ${history.size} ticks")

        // Paralelizar combinações em chunks para eficiência
        val chunkSize = 50
        val results = mutableListOf<Pair<ParameterCombo, Double>>()
        val resultsMutex = java.util.concurrent.ConcurrentLinkedQueue<Pair<ParameterCombo, Double>>()

        allCombos.chunked(chunkSize).map { chunk ->
            async {
                for (combo in chunk) {
                    val wfResult   = wfa.analyze(history, combo)
                    val outResult  = wfResult.outOfSampleResult
                    val rawScore   = wfResult.robustnessScore
                    val adjScore   = OverfittingPenaltyEngine.applyPenalties(rawScore, outResult, wfResult)

                    resultsMutex.add(Pair(combo, adjScore))

                    // Atualiza progresso de forma thread-safe
                    val currentDone = synchronized(this@optimizeParametersAsync) { ++done }
                    if (currentDone % 50 == 0 || currentDone == total) {
                        onProgress?.invoke(currentDone, total)
                    }
                }
            }
        }.awaitAll()

        results.addAll(resultsMutex)

        // Seleciona o melhor conjunto
        val best = results.maxByOrNull { it.second }
        if (best == null || best.second <= 0.0) {
            println("⚠️ [AutoTuner] Nenhum parâmetro válido encontrado. Retornando defaults seguros.")
            return@withContext safeDefaults(windowDays, total)
        }

        val bestCombo = best.first
        val bestScore = best.second

        // Resultado de backtest do melhor parâmetro (out-of-sample)
        val bestWfResult  = wfa.analyze(history, bestCombo)
        val bestOutResult = bestWfResult.outOfSampleResult

        // Calcular saídas dinâmicas baseadas em liquidez + ATR do melhor parâmetro
        val lastPrice = history.last().price
        val prices    = history.takeLast(bestCombo.atrPeriod + 10).map { it.price }
        val highs     = prices.map { it * 1.001 }
        val lows      = prices.map { it * 0.999 }
        val atrSeries = TechnicalIndicators.atr(highs, lows, prices, bestCombo.atrPeriod)
        val currentAtr = atrSeries.lastOrNull() ?: (lastPrice * 0.005)

        val book = orderBook ?: exits.generateMockOrderBook(lastPrice)
        val exitTargets = exits.calculateTargets(
            entryPrice          = lastPrice,
            atr                 = currentAtr,
            orderBook           = book,
            side                = "BUY",
            atrStopMultiplier   = bestCombo.stopAtrMultiplier,
            atrTpMultiplier     = bestCombo.tpAtrMultiplier
        )

        println("✅ [AutoTuner] Melhor combo: EMA(${bestCombo.shortPeriod}/${bestCombo.longPeriod}), RSI(${bestCombo.rsiPeriod}), ATR(${bestCombo.atrPeriod})")
        println("   Score Ajustado: ${"%.4f".format(bestScore)}, Sharpe OOS: ${"%.3f".format(bestOutResult.sharpe)}, Drawdown: ${"%.2f".format(bestOutResult.maxDrawdown * 100)}%, R²: ${"%.3f".format(bestOutResult.equityCurveR2)}")
        println("   SL: ${"%.2f".format(exitTargets.stopLoss)} → ${exitTargets.stopLossRationale}")
        println("   TP: ${"%.2f".format(exitTargets.takeProfit)} → ${exitTargets.takeProfitRationale}")
        println("   R/R: ${"%.2f".format(exitTargets.riskRewardRatio)}:1")

        TunedParameters(
            shortPeriod              = bestCombo.shortPeriod,
            longPeriod               = bestCombo.longPeriod,
            rsiPeriod                = bestCombo.rsiPeriod,
            atrPeriod                = bestCombo.atrPeriod,
            stopLoss                 = exitTargets.stopLoss,
            takeProfit               = exitTargets.takeProfit,
            riskRewardRatio          = exitTargets.riskRewardRatio,
            stopLossAtrMultiplier    = bestCombo.stopAtrMultiplier,
            takeProfitAtrMultiplier  = bestCombo.tpAtrMultiplier,
            stopLossRationale        = exitTargets.stopLossRationale,
            takeProfitRationale      = exitTargets.takeProfitRationale,
            expectedSharpe           = bestOutResult.sharpe,
            expectedMaxDrawdown      = bestOutResult.maxDrawdown,
            expectedWinRate          = bestOutResult.winRate,
            totalTradesInWindow      = bestOutResult.totalTrades,
            equityCurveR2            = bestOutResult.equityCurveR2,
            overallScore             = bestScore,
            optimizationWindowDays   = windowDays,
            totalCombosEvaluated     = total
        )
    }

    /** Parâmetros conservadores para fallback quando histórico é insuficiente. */
    private fun safeDefaults(windowDays: Int, totalCombos: Int) = TunedParameters(
        shortPeriod              = 9,
        longPeriod               = 21,
        rsiPeriod                = 14,
        atrPeriod                = 14,
        stopLoss                 = 0.0,  // Será preenchido pela UI com base no preço atual
        takeProfit               = 0.0,
        riskRewardRatio          = 1.5,
        stopLossAtrMultiplier    = 1.5,
        takeProfitAtrMultiplier  = 2.5,
        stopLossRationale        = "Fallback conservador (histórico insuficiente)",
        takeProfitRationale      = "Fallback conservador (histórico insuficiente)",
        expectedSharpe           = 0.0,
        expectedMaxDrawdown      = 0.05,
        expectedWinRate          = 0.50,
        totalTradesInWindow      = 0,
        equityCurveR2            = 0.0,
        overallScore             = 0.0,
        optimizationWindowDays   = windowDays,
        totalCombosEvaluated     = totalCombos
    )
}
