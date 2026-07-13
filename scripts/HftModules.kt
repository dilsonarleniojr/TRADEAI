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
    private var spreadSumSq = 0.0

    /**
     * Calcula o Z-Score do spread em tempo real de forma incremental O(1).
     */
    fun calculateZScore(priceA: Double, priceB: Double, beta: Double = 1.0): Double {
        val spread = priceA - (beta * priceB)
        
        if (count < period) {
            spreadBuffer[idx] = spread
            spreadSum += spread
            spreadSumSq += spread * spread
            idx = (idx + 1) % period
            count++
            return 0.0
        }
        
        // Atualização incremental do spread médio e soma dos quadrados (O(1))
        val oldSpread = spreadBuffer[idx]
        spreadBuffer[idx] = spread
        idx = (idx + 1) % period

        spreadSum = spreadSum - oldSpread + spread
        spreadSumSq = spreadSumSq - (oldSpread * oldSpread) + (spread * spread)
        
        val mean = spreadSum / period
        // Variância = E[X^2] - (E[X])^2
        val variance = (spreadSumSq / period) - (mean * mean)
        val stdDev = if (variance > 0.0) sqrt(variance) else 0.0
        
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
