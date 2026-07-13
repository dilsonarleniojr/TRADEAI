package scripts

import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
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
