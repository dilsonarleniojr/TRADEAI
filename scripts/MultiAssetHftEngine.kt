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
// 0. Object Pool Pattern para Dados de Mercado (Zero-GC no fast-path)
// ==============================================================================
data class TickData(
    var symbol: String = "",
    var price: Double = 0.0,
    var volume: Double = 0.0,
    var timestamp: Long = 0L
)

class TickDataPool(maxSize: Int = 10000) {
    private val pool = java.util.concurrent.ConcurrentLinkedQueue<TickData>()

    init {
        for (i in 0 until maxSize) {
            pool.offer(TickData())
        }
    }

    fun acquire(symbol: String, price: Double, volume: Double, timestamp: Long): TickData {
        val tick = pool.poll() ?: TickData()
        tick.symbol = symbol
        tick.price = price
        tick.volume = volume
        tick.timestamp = timestamp
        return tick
    }

    fun release(tick: TickData) {
        tick.symbol = ""
        tick.price = 0.0
        tick.volume = 0.0
        tick.timestamp = 0L
        pool.offer(tick)
    }
}

object TickPoolProvider {
    val pool = TickDataPool()
}

// ==============================================================================
// 1. Multiplexação de WebSockets (Combined Streams Router)
// ==============================================================================
class WebSocketMultiplexer(
    private val coroutineScope: CoroutineScope,
    private val actors: ConcurrentHashMap<String, AssetActor>
) {
    private val streamSymbolCache = ConcurrentHashMap<String, String>()

    /**
     * Recebe mensagens brutas vindas do Combined WebSocket Stream
     * e roteia o payload para o canal correspondente em tempo de execução.
     */
    fun routeMessage(streamName: String, price: Double) {
        val symbol = parseSymbolFromStream(streamName)
        val actor = actors[symbol]
        if (actor != null) {
            // Adquire objeto do pool de forma síncrona ultra-rápida (Zero-GC)
            val tick = TickPoolProvider.pool.acquire(symbol, price, 0.0, System.currentTimeMillis())
            actor.sendTickNonBlocking(tick)
        }
    }

    private fun parseSymbolFromStream(stream: String): String {
        return streamSymbolCache.computeIfAbsent(stream) { s ->
            val atIndex = s.indexOf('@')
            if (atIndex != -1) {
                s.substring(0, atIndex).uppercase()
            } else {
                s.uppercase()
            }
        }
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
    private val tickChannel = Channel<TickData>(Channel.CONFLATED) // Descarta ticks velhos se houver lentidão
    private val mutex = Mutex()
    
    // Estado local isolado do ativo
    private var lastPrice = 0.0
    private var positionSize = 0.0

    init {
        scope.launch(Dispatchers.Default) {
            for (tick in tickChannel) {
                processTick(tick)
            }
        }
    }

    fun sendTickNonBlocking(tick: TickData) {
        tickChannel.trySend(tick)
    }

    suspend fun sendTick(tick: TickData) {
        tickChannel.send(tick)
    }

    private suspend fun processTick(tick: TickData) {
        mutex.withLock {
            lastPrice = tick.price
            
            // Decisão lógica concorrente
            if (shouldBuy() && positionSize == 0.0) {
                val requiredMargin = tick.price * 0.1 // 10% de margem
                if (riskManager.tryAllocateExposure(symbol, requiredMargin)) {
                    positionSize = 0.1
                    println("🛒 [$symbol] Posição comprada a ${tick.price} (Margem Alocada)")
                } else {
                    println("⚠️ [$symbol] Entrada bloqueada pelo Global Risk Manager (Limite de Exposição)")
                }
            }
        }
        // Recicla o tick de volta ao pool após o processamento
        TickPoolProvider.pool.release(tick)
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
    companion object {
        const val MAX_ASSETS = 32
        const val HISTORY_WINDOW = 30
    }

    private val symbolToIndex = java.util.concurrent.ConcurrentHashMap<String, Int>()
    @Volatile
    private var assetCount = 0

    // Pre-allocated primitive buffers to avoid heap allocations in hot path
    private val priceHistory = Array(MAX_ASSETS) { DoubleArray(HISTORY_WINDOW) }
    private val writeCursors = IntArray(MAX_ASSETS)
    private val historySizes = IntArray(MAX_ASSETS)

    // Temporary calculations layout to avoid boxing/unboxing
    private val tempWeights = DoubleArray(MAX_ASSETS)
    private val tempPrices = DoubleArray(MAX_ASSETS)
    private val tempValues = DoubleArray(MAX_ASSETS)
    private val tempReturns = Array(MAX_ASSETS) { DoubleArray(HISTORY_WINDOW) }
    private val tempMeans = DoubleArray(MAX_ASSETS)
    private val flatCovMatrix = DoubleArray(MAX_ASSETS * MAX_ASSETS)

    var deleveraged = false

    private fun getOrRegisterAsset(symbol: String): Int {
        return symbolToIndex.computeIfAbsent(symbol) {
            val idx = assetCount
            if (assetCount < MAX_ASSETS) {
                assetCount++
            }
            idx
        }
    }

    fun updateMarketData(symbol: String, price: Double) {
        val idx = getOrRegisterAsset(symbol)
        if (idx >= MAX_ASSETS) return

        val cursor = writeCursors[idx]
        priceHistory[idx][cursor] = price
        writeCursors[idx] = (cursor + 1) % HISTORY_WINDOW
        if (historySizes[idx] < HISTORY_WINDOW) {
            historySizes[idx]++
        }
    }

    private fun getHistoryValue(assetIdx: Int, stepsBack: Int): Double {
        val size = historySizes[assetIdx]
        if (stepsBack >= size) return 0.0
        val cursor = writeCursors[assetIdx]
        val idx = (cursor - 1 - stepsBack + HISTORY_WINDOW) % HISTORY_WINDOW
        return priceHistory[assetIdx][idx]
    }

    fun calculatePortfolioVar(activePositions: Map<String, Double>): Double {
        if (activePositions.isEmpty()) return 0.0

        var totalPortfolioValue = 0.0
        
        // 1. Gather prices and compute weights in O(1) space
        for ((symbol, qty) in activePositions) {
            val idx = getOrRegisterAsset(symbol)
            if (idx >= MAX_ASSETS) continue
            val size = historySizes[idx]
            if (size < 5) return 0.0

            val currentPrice = getHistoryValue(idx, 0)
            tempPrices[idx] = currentPrice
            val absVal = kotlin.math.abs(qty) * currentPrice
            tempValues[idx] = absVal
            totalPortfolioValue += absVal
            tempWeights[idx] = 0.0 // reset
        }

        if (totalPortfolioValue == 0.0) return 0.0

        for ((symbol, _) in activePositions) {
            val idx = symbolToIndex[symbol] ?: continue
            if (idx < MAX_ASSETS) {
                tempWeights[idx] = tempValues[idx] / totalPortfolioValue
            }
        }

        // 2. Compute returns in O(1) space
        val m = HISTORY_WINDOW - 1
        for ((symbol, _) in activePositions) {
            val idx = symbolToIndex[symbol] ?: continue
            if (idx >= MAX_ASSETS) continue
            val size = historySizes[idx]
            val actualM = size - 1
            if (actualM < 4) return 0.0

            var sumReturns = 0.0
            for (t in 0 until actualM) {
                val pT = getHistoryValue(idx, t)
                val pTPrev = getHistoryValue(idx, t + 1)
                val ret = if (pTPrev != 0.0) (pT - pTPrev) / pTPrev else 0.0
                tempReturns[idx][t] = ret
                sumReturns += ret
            }
            tempMeans[idx] = sumReturns / actualM
        }

        // 3. Compute flat covariance matrix
        for ((symI, _) in activePositions) {
            val i = symbolToIndex[symI] ?: continue
            if (i >= MAX_ASSETS) continue
            for ((symJ, _) in activePositions) {
                val j = symbolToIndex[symJ] ?: continue
                if (j >= MAX_ASSETS) continue
                val meanI = tempMeans[i]
                val meanJ = tempMeans[j]

                var covSum = 0.0
                for (t in 0 until m) {
                    covSum += (tempReturns[i][t] - meanI) * (tempReturns[j][t] - meanJ)
                }
                flatCovMatrix[i * MAX_ASSETS + j] = covSum / (m - 1)
            }
        }

        // 4. Calculate Portfolio Variance
        var pVar = 0.0
        for ((symI, _) in activePositions) {
            val i = symbolToIndex[symI] ?: continue
            if (i >= MAX_ASSETS) continue
            for ((symJ, _) in activePositions) {
                val j = symbolToIndex[symJ] ?: continue
                if (j >= MAX_ASSETS) continue
                pVar += tempWeights[i] * tempWeights[j] * flatCovMatrix[i * MAX_ASSETS + j]
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

        return portfolioVar
    }
}

// ==============================================================================
// 6. Bot Fleet Orchestrator & Schedulers
// ==============================================================================
class BotFleetOrchestrator(
    val totalCapital: Double,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
) {
    val bots = ConcurrentHashMap<String, Any>()
    val allocations = ConcurrentHashMap<String, Double>()
    val usedMargins = ConcurrentHashMap<String, Double>()
    val cronTriggers = CopyOnWriteArrayList<CronTrigger>()
    val eventTriggers = CopyOnWriteArrayList<EventTrigger>()

    val lastHeartbeats = ConcurrentHashMap<String, Long>()
    val botJobs = ConcurrentHashMap<String, Job>()

    private val supervisorJob = SupervisorJob()
    private val watchdogScope = CoroutineScope(supervisorJob + Dispatchers.Default)

    var isChaosScenarioActive = false
    var isTradingFrozen = false

    // Global settings feature toggles & variables
    var isIcebergProtectionActive = true
    var isAutoFailoverActive = true
    var useHalfKellySizing = true
    var historicalWinRate = 0.55
    var twapDurationMinutes = 15

    private val marginMutex = Mutex()

    init {
        // Inicializa o loop de simulação de monitoramento para cada bot registrado por padrão
        for (bot in listOf("bot_1", "bot_2", "bot_3")) {
            lastHeartbeats[bot] = System.currentTimeMillis()
            val job = scope.launch(Dispatchers.Default) {
                runBotExecutionLoop(bot)
            }
            botJobs[bot] = job
        }
        startWatchdog()
        startReconciler()
    }

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

    suspend fun tryAllocateBotMargin(botId: String, amount: Double): Boolean {
        marginMutex.withLock {
            val allocated = allocations[botId] ?: 0.0
            val used = usedMargins[botId] ?: 0.0
            if (used + amount <= allocated) {
                usedMargins[botId] = used + amount
                return true
            }
            return false
        }
    }

    suspend fun releaseBotMargin(botId: String, amount: Double) {
        marginMutex.withLock {
            val used = usedMargins[botId] ?: 0.0
            usedMargins[botId] = maxOf(0.0, used - amount)
        }
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
                    scope.launch(Dispatchers.Default) {
                        try {
                            trigger.action()
                        } catch (e: Exception) {
                            println("❌ Error executing scheduled trigger: ${e.message}")
                        }
                    }
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
                        scope.launch(Dispatchers.Default) {
                            try {
                                trigger.action()
                            } catch (e: Exception) {
                                println("❌ Error executing event trigger: ${e.message}")
                            }
                        }
                    }
            }
        }
    }

    fun reportHeartbeat(botId: String) {
        lastHeartbeats[botId] = System.currentTimeMillis()
    }

    private fun startWatchdog() {
        watchdogScope.launch {
            while (isActive) {
                val now = System.currentTimeMillis()
                for ((botId, lastTime) in lastHeartbeats) {
                    if (now - lastTime > 1000) {
                        println("🚨 [Watchdog] Heartbeat timeout for bot: $botId! Executing Self-Healing...")
                        // 1. Cancel bot coroutine exclusively
                        val job = botJobs[botId]
                        job?.cancel()

                        // 2. REST Fallback: Cancel all orders for corresponding bot symbol
                        val bot = _activeBots.value.find { it.id == botId }
                        if (bot != null) {
                            fallbackCancelOrders(bot.symbol)
                            // 3. Restart bot instance from scratch
                            restartBotInstance(bot)
                        }
                    }
                }
                delay(200)
            }
        }
    }

    private fun startReconciler() {
        watchdogScope.launch {
            while (isActive) {
                delay(180000) // 3 minutes
                runReconciliation()
            }
        }
    }

    private fun fallbackCancelOrders(symbol: String) {
        println("📡 [Watchdog REST Fallback] Enviando comando 'Cancel All Orders' para o par $symbol via API REST...")
    }

    private fun restartBotInstance(bot: BotState) {
        println("🔄 [Watchdog Self-Healing] Reiniciando bot ${bot.name} (${bot.id}) a partir do zero...")
        lastHeartbeats[bot.id] = System.currentTimeMillis()
        val newJob = scope.launch(Dispatchers.Default) {
            runBotExecutionLoop(bot.id)
        }
        botJobs[bot.id] = newJob
    }

    suspend fun runBotExecutionLoop(botId: String) {
        while (true) {
            reportHeartbeat(botId)
            delay(300)
        }
    }

    fun runReconciliation() {
        println("🔍 [Reconciler] Iniciando verificação de conciliação ativa com a Exchange...")
        var divergenceDetected = false
        
        for (bot in _activeBots.value) {
            if (bot.pnl != 0.0 && isChaosScenarioActive) {
                divergenceDetected = true
                break
            }
        }

        if (divergenceDetected) {
            println("🚨 [Reconciler] DIVERGÊNCIA DETECTADA! Estado local diverge da corretora. Iniciando correção...")
            isTradingFrozen = true
            
            println("⚖️ [Reconciler] Ajustando posições locais. Corretora reporta saldo zero. Fonte da verdade aplicada.")
            _activeBots.update { currentList ->
                currentList.map { bot ->
                    bot.copy(pnl = 0.0)
                }
            }
            updateMarginLedger()

            println("🧹 [Reconciler] Limpando livro de ofertas e cancelando ordens órfãs...")
            isTradingFrozen = false
            println("✅ [Reconciler] Auto-cura concluída. Sistema restaurado e descongelado.")
        } else {
            println("✅ [Reconciler] Estado em perfeita harmonia com a Exchange.")
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


