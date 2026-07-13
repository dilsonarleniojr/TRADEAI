package scripts

import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.PriorityBlockingQueue
import java.util.concurrent.atomic.AtomicDouble

/**
 * TRADEAI — Motor Concorrente Multi-Asset de Alta Performance
 * Desenhado para execução assíncrona tolerante a falhas e isolamento estrito de estado (Actor Model).
 */

// ==============================================================================
// 1. Multiplexação de WebSockets (Combined Streams Router)
// ==============================================================================
class WebSocketMultiplexer(
    private val coroutineScope: CoroutineScope,
    private val actors: ConcurrentHashMap<String, AssetActor>
) {
    /**
     * Recebe mensagens brutas vindas do Combined WebSocket Stream
     * e roteia o payload para o canal correspondente em tempo de execução.
     */
    fun routeMessage(streamName: String, price: Double) {
        val symbol = parseSymbolFromStream(streamName)
        val actor = actors[symbol]
        if (actor != null) {
            coroutineScope.launch {
                actor.sendTick(price)
            }
        }
    }

    private fun parseSymbolFromStream(stream: String): String {
        // Ex: "btcusdt@bookTicker" -> "BTCUSDT"
        return stream.split("@")[0].uppercase()
    }
}

// ==============================================================================
// 2. Isolamento de Estado (Actor Model via Coroutines + Channels + Mutex)
// ==============================================================================
class AssetActor(
    val symbol: String,
    private val scope: CoroutineScope,
    private val riskManager: GlobalRiskManager
) {
    private val tickChannel = Channel<Double>(Channel.CONFLATED) // Descarta ticks velhos se houver lentidão
    private val mutex = Mutex()
    
    // Estado local isolado do ativo
    private var lastPrice = 0.0
    private var positionSize = 0.0

    init {
        scope.launch(Dispatchers.Default) {
            for (price in tickChannel) {
                processTick(price)
            }
        }
    }

    suspend fun sendTick(price: Double) {
        tickChannel.send(price)
    }

    private suspend fun processTick(price: Double) {
        mutex.withLock {
            lastPrice = price
            
            // Decisão lógica concorrente
            if (shouldBuy() && positionSize == 0.0) {
                val requiredMargin = price * 0.1 // 10% de margem
                if (riskManager.tryAllocateExposure(symbol, requiredMargin)) {
                    positionSize = 0.1
                    println("🛒 [$symbol] Posição comprada a $price (Margem Alocada)")
                } else {
                    println("⚠️ [$symbol] Entrada bloqueada pelo Global Risk Manager (Limite de Exposição)")
                }
            }
        }
    }

    private fun shouldBuy(): Boolean {
        // Lógica de indicador local simplificada
        return lastPrice > 0.0
    }
}

// ==============================================================================
// 3. Global Risk Manager (Exposure Limiter Thread-Safe)
// ==============================================================================
class GlobalRiskManager(val maxGlobalExposure: Double) {
    private val activeExposures = ConcurrentHashMap<String, Double>()
    private val currentTotalExposure = AtomicDouble(0.0)
    private val riskMutex = Mutex()

    /**
     * Tenta alocar margem/exposição para uma nova entrada.
     * Thread-safe e sem lock bloqueante (non-blocking concurrency).
     */
    suspend fun tryAllocateExposure(symbol: String, amount: Double): Boolean {
        riskMutex.withLock {
            val total = currentTotalExposure.get()
            if (total + amount <= maxGlobalExposure) {
                activeExposures[symbol] = (activeExposures[symbol] ?: 0.0) + amount
                currentTotalExposure.addAndGet(amount)
                return true
            }
            return false
        }
    }

    suspend fun releaseExposure(symbol: String) {
        riskMutex.withLock {
            val allocated = activeExposures.remove(symbol) ?: 0.0
            currentTotalExposure.addAndGet(-allocated)
        }
    }

    fun getTotalExposure(): Double = currentTotalExposure.get()
}

// AtomicDouble helper for compilation compatibility
class AtomicDouble(initialValue: Double = 0.0) {
    private val lock = Any()
    @Volatile
    private var value = initialValue

    fun get(): Double = synchronized(lock) { value }
    
    fun addAndGet(delta: Double): Double = synchronized(lock) {
        value += delta
        value
    }
}

// ==============================================================================
// 4. Fila de Ordens e Prevenção de Rate Limits (Batch Dispatcher)
// ==============================================================================
data class PriorityOrder(
    val symbol: String,
    val side: String,
    val quantity: Double,
    val priority: Int // 1: Alta (Liquidação/Stop), 3: Baixa (Entrada Limit)
) : Comparable<PriorityOrder> {
    override fun compareTo(other: PriorityOrder): Int {
        return this.priority.compareTo(other.priority) // Menor número = maior prioridade
    }
}

class BatchOrderDispatcher(
    private val scope: CoroutineScope,
    private val rateLimitPerPeriod: Int = 50,
    private val periodMs: Long = 10000
) {
    private val orderQueue = PriorityBlockingQueue<PriorityOrder>()
    private var isRunning = false
    private var dispatchedInWindow = 0
    private var windowStartTimestamp = System.currentTimeMillis()

    fun start() {
        isRunning = true
        scope.launch(Dispatchers.IO) {
            while (isRunning) {
                val now = System.currentTimeMillis()
                if (now - windowStartTimestamp >= periodMs) {
                    // Reseta a janela deslizante de rate limits
                    dispatchedInWindow = 0
                    windowStartTimestamp = now
                }

                if (dispatchedInWindow < rateLimitPerPeriod) {
                    val order = orderQueue.poll()
                    if (order != null) {
                        dispatchToExchange(order)
                        dispatchedInWindow++
                    } else {
                        delay(10) // Fila vazia, descansa curto
                    }
                } else {
                    // Janela cheia, dorme até o reset
                    val waitTime = periodMs - (now - windowStartTimestamp)
                    if (waitTime > 0) {
                        delay(waitTime)
                    }
                }
            }
        }
    }

    fun stop() {
        isRunning = false
    }

    fun enqueueOrder(order: PriorityOrder) {
        orderQueue.put(order)
    }

    private fun dispatchToExchange(order: PriorityOrder) {
        println("📡 [Dispatcher] Enviando ordem prioridade [${order.priority}] para ${order.symbol}: ${order.side} ${order.quantity}")
    }

    fun getQueueSize(): Int = orderQueue.size
}

// ==============================================================================
// 5. Portfolio Risk Manager (Real-Time VaR)
// ==============================================================================
class PortfolioRiskManager(
    val capital: Double,
    val maxVarLimit: Double = 0.05
) {
    private val priceHistory = mutableMapOf<String, MutableList<Double>>()
    var deleveraged = false

    fun updateMarketData(symbol: String, price: Double) {
        val history = priceHistory.getOrPut(symbol) { mutableListOf() }
        history.add(price)
        if (history.size > 30) {
            history.removeAt(0)
        }
    }

    fun calculatePortfolioVar(activePositions: Map<String, Double>): Double {
        if (activePositions.isEmpty()) return 0.0

        val returnsMap = mutableMapOf<String, List<Double>>()
        val currentPrices = mutableMapOf<String, Double>()

        for (symbol in activePositions.keys) {
            val history = priceHistory[symbol] ?: emptyList()
            if (history.size < 5) return 0.0

            currentPrices[symbol] = history.last()
            val rets = mutableListOf<Double>()
            for (i in 1 until history.size) {
                rets.add((history[i] - history[i - 1]) / history[i - 1])
            }
            returnsMap[symbol] = rets
        }

        val symbols = activePositions.keys.toList()
        val nAssets = symbols.size

        val portfolioValues = mutableMapOf<String, Double>()
        var totalPortfolioValue = 0.0
        for (sym in symbols) {
            val qty = kotlin.math.abs(activePositions[sym] ?: 0.0)
            val price = currentPrices[sym] ?: 0.0
            val value = qty * price
            portfolioValues[sym] = value
            totalPortfolioValue += value
        }

        if (totalPortfolioValue == 0.0) return 0.0

        val weights = symbols.map { (portfolioValues[it] ?: 0.0) / totalPortfolioValue }

        var m = returnsMap[symbols[0]]?.size ?: 0
        for (sym in symbols) {
            m = minOf(m, returnsMap[sym]?.size ?: 0)
        }

        if (m < 4) return 0.0

        val means = symbols.associateWith { sym ->
            (returnsMap[sym]?.take(m)?.sum() ?: 0.0) / m
        }

        val covMatrix = Array(nAssets) { DoubleArray(nAssets) }
        for (i in 0 until nAssets) {
            for (j in 0 until nAssets) {
                val symI = symbols[i]
                val symJ = symbols[j]
                val retsI = returnsMap[symI] ?: emptyList()
                val retsJ = returnsMap[symJ] ?: emptyList()
                val meanI = means[symI] ?: 0.0
                val meanJ = means[symJ] ?: 0.0

                var covSum = 0.0
                for (t in 0 until m) {
                    covSum += (retsI[t] - meanI) * (retsJ[t] - meanJ)
                }
                covMatrix[i][j] = covSum / (m - 1)
            }
        }

        var pVar = 0.0
        for (i in 0 until nAssets) {
            for (j in 0 until nAssets) {
                pVar += weights[i] * weights[j] * covMatrix[i][j]
            }
        }

        val pVarScaled = pVar * 30.0
        val pStd = kotlin.math.sqrt(maxOf(0.0, pVarScaled))
        val varPct = 2.33 * pStd
        val portfolioVar = varPct * totalPortfolioValue

        if (portfolioVar > (capital * maxVarLimit)) {
            deleveraged = true
            println("🚨 VaR LIMITE EXCEDIDO: VaR = $portfolioVar USDT > Limite ${capital * maxVarLimit} USDT. Iniciando De-leveraging!")
        }

        return portfolioVar
    }
}

// ==============================================================================
// 6. Bot Fleet Orchestrator & Schedulers
// ==============================================================================
class BotFleetOrchestrator(val totalCapital: Double) {
    val bots = mutableMapOf<String, Any>()
    val allocations = mutableMapOf<String, Double>()
    val usedMargins = mutableMapOf<String, Double>()
    val cronTriggers = mutableListOf<CronTrigger>()
    val eventTriggers = mutableListOf<EventTrigger>()

    // Global settings feature toggles & variables
    var isIcebergProtectionActive = true
    var isAutoFailoverActive = true
    var useHalfKellySizing = true
    var historicalWinRate = 0.55
    var twapDurationMinutes = 15

    // State flows mirroring fleet status
    private val _activeBots = MutableStateFlow<List<BotState>>(
        listOf(
            BotState(
                id = "bot_1",
                name = "ScalpingBTC",
                symbol = "BTCUSDT",
                pnl = 125.40,
                status = BotWorkerStatus.RUNNING,
                parameters = mapOf("gridLevels" to "10", "useKelly" to "true")
            ),
            BotState(
                id = "bot_2",
                name = "GridETH",
                symbol = "ETHUSDT",
                pnl = -45.20,
                status = BotWorkerStatus.PAUSED,
                parameters = mapOf("rsiPeriod" to "14", "buyThreshold" to "30")
            ),
            BotState(
                id = "bot_3",
                name = "MeanReversionSOL",
                symbol = "SOLUSDT",
                pnl = 0.0,
                status = BotWorkerStatus.ERROR,
                parameters = mapOf("emaFast" to "9", "emaSlow" to "21")
            )
        )
    )
    val activeBots: StateFlow<List<BotState>> = _activeBots.asStateFlow()

    private val _marginLedger = MutableStateFlow(
        MarginLedgerState(
            totalAccount = totalCapital,
            allocatedMargin = 750.0,
            freeMargin = totalCapital - 750.0
        )
    )
    val marginLedger: StateFlow<MarginLedgerState> = _marginLedger.asStateFlow()

    fun toggleBotStatus(botId: String) {
        _activeBots.update { currentList ->
            currentList.map { bot ->
                if (bot.id == botId) {
                    val newStatus = when (bot.status) {
                        BotWorkerStatus.RUNNING -> BotWorkerStatus.PAUSED
                        BotWorkerStatus.PAUSED -> BotWorkerStatus.RUNNING
                        BotWorkerStatus.ERROR -> BotWorkerStatus.RUNNING
                    }
                    bot.copy(status = newStatus)
                } else {
                    bot
                }
            }
        }
    }

    fun stopBot(botId: String) {
        _activeBots.update { currentList ->
            currentList.filter { it.id != botId }
        }
        updateMarginLedger()
    }

    fun registerBot(botState: BotState, marginAllocation: Double) {
        _activeBots.update { currentList ->
            currentList + botState
        }
        updateMarginLedger()
    }

    fun updateBotParameters(botId: String, newParams: Map<String, String>) {
        _activeBots.update { currentList ->
            currentList.map { bot ->
                if (bot.id == botId) {
                    bot.copy(parameters = newParams)
                } else {
                    bot
                }
            }
        }
    }

    private fun updateMarginLedger() {
        val currentList = _activeBots.value
        val newAllocated = currentList.size * 250.0
        val free = totalCapital - newAllocated
        _marginLedger.update { 
            it.copy(allocatedMargin = newAllocated, freeMargin = free)
        }
    }

    data class CronTrigger(val timeStr: String, val action: () -> Unit, var lastRun: Double = 0.0)
    data class EventTrigger(val metricName: String, val operator: String, val value: Double, val action: () -> Unit)

    fun registerBot(botId: String, botInstance: Any, marginAllocation: Double) {
        bots[botId] = botInstance
        allocations[botId] = marginAllocation
        usedMargins[botId] = 0.0
    }

    fun tryAllocateBotMargin(botId: String, amount: Double): Boolean {
        val allocated = allocations[botId] ?: 0.0
        val used = usedMargins[botId] ?: 0.0
        if (used + amount <= allocated) {
            usedMargins[botId] = used + amount
            return true
        }
        return false
    }

    fun releaseBotMargin(botId: String, amount: Double) {
        val used = usedMargins[botId] ?: 0.0
        usedMargins[botId] = maxOf(0.0, used - amount)
    }

    fun addCronTrigger(timeStr: String, action: () -> Unit) {
        cronTriggers.add(CronTrigger(timeStr, action))
    }

    fun addEventTrigger(metricName: String, operator: String, value: Double, action: () -> Unit) {
        eventTriggers.add(EventTrigger(metricName, operator, value, action))
    }

    fun runSchedulerTick(currentTimeStr: String, externalMetrics: Map<String, Double>? = null) {
        for (trigger in cronTriggers) {
            if (trigger.timeStr == currentTimeStr) {
                val now = System.currentTimeMillis().toDouble()
                if (now - trigger.lastRun > 60000.0) {
                    trigger.lastRun = now
                    trigger.action()
                }
            }
        }

        if (externalMetrics != null) {
            for (trigger in eventTriggers) {
                val metricVal = externalMetrics[trigger.metricName]
                if (metricVal != null) {
                    var triggered = false
                    if (trigger.operator == "<" && metricVal < trigger.value) triggered = true
                    if (trigger.operator == ">" && metricVal > trigger.value) triggered = true
                    if (trigger.operator == "==" && metricVal == trigger.value) triggered = true

                    if (triggered) {
                        trigger.action()
                    }
                }
            }
        }
    }
}

// ==============================================================================
// 7. Crypto Screener (Asynchronous Market Scan)
// ==============================================================================
class CryptoScreener(val checkIntervalMs: Long = 3600000) {
    private var isRunning = false
    private var screenerJob: Job? = null
    var lastPicks = listOf<String>()

    fun start(scope: CoroutineScope) {
        isRunning = true
        screenerJob = scope.launch(Dispatchers.Default) {
            while (isRunning) {
                try {
                    scanMarket()
                    delay(checkIntervalMs)
                } catch (e: CancellationException) {
                    break
                } catch (e: Exception) {
                    println("❌ [Screener JVM] Error scanning: ${e.message}")
                    delay(10000)
                }
            }
        }
    }

    fun stop() {
        isRunning = false
        screenerJob?.cancel()
    }

    private fun scanMarket(): List<String> {
        val mockData = listOf(
            mapOf("symbol" to "BTCUSDT", "change" to "5.5", "volume" to "50000000.0", "volatility" to "0.03"),
            mapOf("symbol" to "ETHUSDT", "change" to "-2.1", "volume" to "30000000.0", "volatility" to "0.04"),
            mapOf("symbol" to "SOLUSDT", "change" to "12.4", "volume" to "25000000.0", "volatility" to "0.08"),
            mapOf("symbol" to "LINKUSDT", "change" to "8.2", "volume" to "12000000.0", "volatility" to "0.06"),
            mapOf("symbol" to "AVAXUSDT", "change" to "15.0", "volume" to "8000000.0", "volatility" to "0.09")
        )

        val scored = mockData.map { item ->
            val sym = item["symbol"] ?: ""
            val change = item["change"]?.toDoubleOrNull() ?: 0.0
            val vol = item["volatility"]?.toDoubleOrNull() ?: 0.0
            Pair(sym, change * vol)
        }.sortedByDescending { it.second }

        lastPicks = scored.take(3).map { it.first }
        println("🔥 [Screener JVM] Top 3 setup picks: $lastPicks")
        return lastPicks
    }
}


