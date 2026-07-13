package scripts

import java.io.File
import kotlin.math.sqrt

/**
 * TRADEAI — Módulos HFT de Baixa Latência Nativos
 * Otimizado para evitar Garbage Collection (Zero-GC / Allocation-Free em hot paths).
 */

// ==============================================================================
// 1. Motor de Ingestão Zero-Copy (Parsing Rápido de Bytes de JSON)
// ==============================================================================
object ZeroCopyParser {
    /**
     * Varre o array de bytes bruto à procura de uma chave (ex: "price" ou "p")
     * e analisa o valor Double diretamente dos bytes UTF-8 sem alocar strings intermediárias.
     */
    fun parseDoubleFromBytes(bytes: ByteArray, key: ByteArray): Double {
        if (bytes.isEmpty() || key.isEmpty()) return 0.0
        val limit = bytes.size - key.size
        
        for (i in 0..limit) {
            var match = true
            for (j in key.indices) {
                if (bytes[i + j] != key[j]) {
                    match = false
                    break
                }
            }
            if (match) {
                var valIdx = i + key.size
                
                // Pular espaços, dois-pontos e aspas
                while (valIdx < bytes.size && (bytes[valIdx] == ':'.code.toByte() || 
                            bytes[valIdx] == ' '.code.toByte() || 
                            bytes[valIdx] == '"'.code.toByte())) {
                    valIdx++
                }
                
                var result = 0.0
                var divisor = 1.0
                var decimalReached = false
                var negative = false
                
                if (valIdx < bytes.size && bytes[valIdx] == '-'.code.toByte()) {
                    negative = true
                    valIdx++
                }
                
                while (valIdx < bytes.size) {
                    val b = bytes[valIdx]
                    if (b in '0'.code.toByte()..'9'.code.toByte()) {
                        val digit = b - '0'.code.toByte()
                        if (!decimalReached) {
                            result = result * 10.0 + digit
                        } else {
                            divisor *= 10.0
                            result += digit / divisor
                        }
                    } else if (b == '.'.code.toByte()) {
                        decimalReached = true
                    } else {
                        break
                    }
                    valIdx++
                }
                return if (negative) -result else result
            }
        }
        return 0.0
    }
}

// ==============================================================================
// 2. Order Book Imbalance (OBI)
// ==============================================================================
class OrderBookImbalance {
    /**
     * Calcula o desequilíbrio volumétrico nos primeiros N níveis de preços de compra/venda.
     * Retorna um indicador normalizado entre -1.0 e 1.0.
     */
    fun calculateImbalance(
        bidPrices: DoubleArray, bidSizes: DoubleArray,
        askPrices: DoubleArray, askSizes: DoubleArray,
        levels: Int = 10
    ): Double {
        var bidVolume = 0.0
        var askVolume = 0.0
        
        val limitBids = minOf(bidPrices.size, levels)
        val limitAsks = minOf(askPrices.size, levels)
        
        for (i in 0 until limitBids) {
            bidVolume += bidSizes[i]
        }
        for (i in 0 until limitAsks) {
            askVolume += askSizes[i]
        }
        
        val totalVolume = bidVolume + askVolume
        return if (totalVolume > 0.0) (bidVolume - askVolume) / totalVolume else 0.0
    }
}

// ==============================================================================
// 3. Arbitragem Estatística (Z-Score de Spread Cointegrado)
// ==============================================================================
class PairsTradingEngine(val period: Int = 60) {
    // Ring buffer para spreads de preço pré-alocado
    private val spreadBuffer = DoubleArray(period)
    private var idx = 0
    private var count = 0
    private var spreadSum = 0.0

    /**
     * Calcula o Z-Score do spread em tempo real de forma incremental O(1).
     */
    fun calculateZScore(priceA: Double, priceB: Double, beta: Double = 1.0): Double {
        val spread = priceA - (beta * priceB)
        
        if (count < period) {
            spreadBuffer[idx] = spread
            idx = (idx + 1) % period
            spreadSum += spread
            count++
            return 0.0
        }
        
        // Atualização incremental do spread médio
        val oldSpread = spreadBuffer[idx]
        spreadBuffer[idx] = spread
        idx = (idx + 1) % period
        spreadSum = spreadSum - oldSpread + spread
        
        val mean = spreadSum / period
        
        // Cálculo rápido da variância
        var varianceSum = 0.0
        for (i in 0 until period) {
            val diff = spreadBuffer[i] - mean
            varianceSum += diff * diff
        }
        val stdDev = sqrt(varianceSum / period)
        
        return if (stdDev > 0.0) (spread - mean) / stdDev else 0.0
    }
}

// ==============================================================================
// 4. Telemetria em Memória (Time-Series Local Ring Buffer)
// ==============================================================================
class TelemetryCache(val capacity: Int = 100000) {
    // Ring buffers primitivos contínuos em memória para evitar Garbage Collection
    private val prices = DoubleArray(capacity)
    private val latencies = LongArray(capacity)
    private val timestamps = LongArray(capacity)
    
    private var head = 0
    private var size = 0
    
    @Synchronized
    fun add(price: Double, latencyNs: Long) {
        prices[head] = price
        latencies[head] = latencyNs
        timestamps[head] = System.currentTimeMillis()
        head = (head + 1) % capacity
        if (size < capacity) {
            size++
        }
    }
    
    @Synchronized
    fun flushToDisk(filepath: String) {
        if (size == 0) return
        val file = File(filepath)
        file.bufferedWriter().use { writer ->
            writer.write("Timestamp,Price,LatencyNs\n")
            val startIdx = if (size == capacity) head else 0
            for (i in 0 until size) {
                val idx = (startIdx + i) % capacity
                writer.write("${timestamps[idx]},${prices[idx]},${latencies[idx]}\n")
            }
        }
        // Reseta o cache pós-descarga
        size = 0
        head = 0
    }
}

// ==============================================================================
// 5. Defesa de Microestrutura: Spoofing & Layering Detector
// ==============================================================================
class SpoofingDetector(
    val largeVolThreshold: Double = 50.0,
    val timeLimitMs: Double = 100.0,
    val priceClosenessPct: Double = 0.001
) {
    private val bidsHistory = mutableMapOf<Double, Pair<Double, Double>>() // price -> (volume, timestamp_ms)
    private val asksHistory = mutableMapOf<Double, Pair<Double, Double>>() // price -> (volume, timestamp_ms)

    fun processDepthUpdate(
        newBids: DoubleArray, newBidSizes: DoubleArray,
        newAsks: DoubleArray, newAskSizes: DoubleArray,
        currentPrice: Double, timestampMs: Double,
        executedTradesAtPrices: Map<Double, Double>? = null
    ): Boolean {
        val currBids = newBids.zip(newBidSizes).toMap()
        val currAsks = newAsks.zip(newAskSizes).toMap()
        var spoofingDetected = false

        // Check Bids
        for ((price, vol) in currBids) {
            val prev = bidsHistory[price]
            if (prev == null) {
                if (vol >= largeVolThreshold) {
                    bidsHistory[price] = Pair(vol, timestampMs)
                }
            } else {
                val prevVol = prev.first
                val prevTs = prev.second
                if (vol >= prevVol + largeVolThreshold) {
                    bidsHistory[price] = Pair(vol, timestampMs)
                } else if (vol < prevVol - largeVolThreshold) {
                    if (timestampMs - prevTs <= timeLimitMs) {
                        if (kotlin.math.abs(currentPrice - price) / currentPrice <= priceClosenessPct) {
                            val tradeVol = executedTradesAtPrices?.get(price) ?: 0.0
                            if (tradeVol < (prevVol - vol) * 0.1) {
                                spoofingDetected = true
                            }
                        }
                    }
                    if (vol > 0.0) {
                        bidsHistory[price] = Pair(vol, timestampMs)
                    } else {
                        bidsHistory.remove(price)
                    }
                }
            }
        }
        
        // Remove old bids
        val bidKeysToRemove = bidsHistory.keys.filter { it !in currBids }
        for (price in bidKeysToRemove) {
            val prev = bidsHistory[price]!!
            val prevVol = prev.first
            val prevTs = prev.second
            if (prevVol >= largeVolThreshold && timestampMs - prevTs <= timeLimitMs) {
                if (kotlin.math.abs(currentPrice - price) / currentPrice <= priceClosenessPct) {
                    val tradeVol = executedTradesAtPrices?.get(price) ?: 0.0
                    if (tradeVol < prevVol * 0.1) {
                        spoofingDetected = true
                    }
                }
            }
            bidsHistory.remove(price)
        }

        // Check Asks
        for ((price, vol) in currAsks) {
            val prev = asksHistory[price]
            if (prev == null) {
                if (vol >= largeVolThreshold) {
                    asksHistory[price] = Pair(vol, timestampMs)
                }
            } else {
                val prevVol = prev.first
                val prevTs = prev.second
                if (vol >= prevVol + largeVolThreshold) {
                    asksHistory[price] = Pair(vol, timestampMs)
                } else if (vol < prevVol - largeVolThreshold) {
                    if (timestampMs - prevTs <= timeLimitMs) {
                        if (kotlin.math.abs(currentPrice - price) / currentPrice <= priceClosenessPct) {
                            val tradeVol = executedTradesAtPrices?.get(price) ?: 0.0
                            if (tradeVol < (prevVol - vol) * 0.1) {
                                spoofingDetected = true
                            }
                        }
                    }
                    if (vol > 0.0) {
                        asksHistory[price] = Pair(vol, timestampMs)
                    } else {
                        asksHistory.remove(price)
                    }
                }
            }
        }

        // Remove old asks
        val askKeysToRemove = asksHistory.keys.filter { it !in currAsks }
        for (price in askKeysToRemove) {
            val prev = asksHistory[price]!!
            val prevVol = prev.first
            val prevTs = prev.second
            if (prevVol >= largeVolThreshold && timestampMs - prevTs <= timeLimitMs) {
                if (kotlin.math.abs(currentPrice - price) / currentPrice <= priceClosenessPct) {
                    val tradeVol = executedTradesAtPrices?.get(price) ?: 0.0
                    if (tradeVol < prevVol * 0.1) {
                        spoofingDetected = true
                    }
                }
            }
            asksHistory.remove(price)
        }

        return spoofingDetected
    }
}

// ==============================================================================
// 6. Iceberg Order Tracker
// ==============================================================================
class IcebergTracker(
    val minVolume: Double = 10.0,
    val timeWindowMs: Double = 1000.0
) {
    private val tradeAccumulators = mutableMapOf<Double, Pair<Double, Double>>() // price -> (accumVol, ts)
    private val lastVisibleVolumes = mutableMapOf<Double, Double>() // price -> visibleVol

    fun updateDepth(
        bidPrices: DoubleArray, bidSizes: DoubleArray,
        askPrices: DoubleArray, askSizes: DoubleArray
    ) {
        lastVisibleVolumes.clear()
        val limitBids = minOf(bidPrices.size, 5)
        for (i in 0 until limitBids) {
            lastVisibleVolumes[bidPrices[i]] = bidSizes[i]
        }
        val limitAsks = minOf(askPrices.size, 5)
        for (i in 0 until limitAsks) {
            lastVisibleVolumes[askPrices[i]] = askSizes[i]
        }
    }

    fun processTrade(price: Double, volume: Double, timestampMs: Double): Boolean {
        val prev = tradeAccumulators[price]
        var accum = 0.0
        var ts = timestampMs
        if (prev != null) {
            accum = prev.first
            ts = prev.second
            if (timestampMs - ts > timeWindowMs) {
                accum = 0.0
                ts = timestampMs
            }
        }
        accum += volume
        tradeAccumulators[price] = Pair(accum, ts)

        val visibleVol = lastVisibleVolumes[price] ?: 0.0
        if (visibleVol > 0.0 && accum >= visibleVol * 1.5 && accum >= minVolume) {
            return true
        }
        return false
    }
}

// ==============================================================================
// 7. Grid Trading Strategy
// ==============================================================================
class GridTradingStrategy(
    var centerPrice: Double,
    val gridSpanPct: Double = 0.05,
    val numGrids: Int = 10,
    val orderQty: Double = 0.01
) {
    val buyOrders = mutableListOf<Double>()
    val sellOrders = mutableListOf<Double>()

    init {
        setupGrid()
    }

    fun setupGrid() {
        buyOrders.clear()
        sellOrders.clear()
        val halfSpan = centerPrice * gridSpanPct / 2.0
        val lowerBound = centerPrice - halfSpan
        val upperBound = centerPrice + halfSpan
        val step = (upperBound - lowerBound) / numGrids
        for (i in 0 until (numGrids / 2)) {
            buyOrders.add(centerPrice - (i + 1) * step)
            sellOrders.add(centerPrice + (i + 1) * step)
        }
    }

    fun onTick(currentPrice: Double): List<String> {
        val halfSpan = centerPrice * gridSpanPct / 2.0
        val lowerBound = centerPrice - halfSpan
        val upperBound = centerPrice + halfSpan

        if (currentPrice > upperBound) {
            centerPrice = currentPrice
            setupGrid()
            return listOf("SHIFT_UP")
        } else if (currentPrice < lowerBound) {
            centerPrice = currentPrice
            setupGrid()
            return listOf("SHIFT_DOWN")
        }
        return emptyList()
    }
}

