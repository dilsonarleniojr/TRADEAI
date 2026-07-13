package scripts

import java.io.OutputStream
import java.net.ServerSocket
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * TRADEAI — Integração FIX Protocol & Telemetria Prometheus
 * Alta performance, alocação reduzida de memória (Low Allocation).
 */

// ==============================================================================
// 1. Gateway do Protocolo FIX 4.4 (Financial Information eXchange)
// ==============================================================================
object FixGateway {
    private const val SOH = '\u0001' // Caractere delimitador FIX padrão (SOH)
    private var sequenceNumber = 1

    /**
     * Monta uma mensagem FIX 4.4 para novas ordens limit (Tag 35=D).
     */
    fun createNewOrderSingle(
        clOrdID: String,
        symbol: String,
        side: Char, // '1' = Buy, '2' = Sell
        quantity: Double,
        price: Double
    ): String {
        val body = StringBuilder(128)
        
        // Body tags
        body.append("11=").append(clOrdID).append(SOH) // ClOrdID
        body.append("21=1").append(SOH)               // HandlInst: Private
        body.append("55=").append(symbol).append(SOH)  // Symbol
        body.append("54=").append(side).append(SOH)    // Side
        body.append("60=").append(System.currentTimeMillis()).append(SOH) // TransactTime
        body.append("38=").append(quantity).append(SOH) // OrderQty
        body.append("40=2").append(SOH)               // OrdType: Limit
        body.append("44=").append(price).append(SOH)    // Price

        val bodyLength = body.length

        // Header tags (reuse body but prepend header)
        val msg = StringBuilder(256)
        msg.append("8=FIX.4.4").append(SOH)          // BeginString
        msg.append("9=").append(bodyLength).append(SOH) // BodyLength
        msg.append("35=D").append(SOH)              // MsgType: NewOrderSingle
        msg.append("34=").append(sequenceNumber++).append(SOH) // MsgSeqNum
        msg.append("49=TRADEAI").append(SOH)        // SenderCompID
        msg.append("56=EXCHANGE").append(SOH)       // TargetCompID

        msg.append(body)

        val checksum = calculateChecksum(msg)

        msg.append("10=").append(checksum).append(SOH)
        return msg.toString()
    }

    private fun calculateChecksum(data: CharSequence): String {
        var sum = 0
        for (i in 0 until data.length) {
            sum += data[i].code
        }
        val check = sum % 256
        val d1 = check / 100
        val d2 = (check / 10) % 10
        val d3 = check % 10
        // Use char array for zero-alloc checksum string conversion
        return String(charArrayOf((d1 + 48).toChar(), (d2 + 48).toChar(), (d3 + 48).toChar()))
    }
}

// ==============================================================================
// 2. Queue Position Tracker (Estimador de Fila de Ofertas)
// ==============================================================================
class QueuePositionTracker(val symbol: String) {
    // Armazena a posição estimada da nossa ordem limite em cada nível de preço
    // Preço -> Volume de ordens à nossa frente
    private val queueEstimates = ConcurrentHashMap<Double, Double>()

    /**
     * Registra o envio da nossa ordem limite a um preço específico com o volume acumulado à frente.
     */
    fun registerOrder(price: Double, volumeAhead: Double) {
        queueEstimates[price] = volumeAhead
    }

    /**
     * Atualiza a posição da fila a partir dos eventos de profundidade do livro (Order Flow).
     */
    fun processOrderFlowEvent(price: Double, eventSize: Double, isExecution: Boolean) {
        val currentAhead = queueEstimates[price] ?: return

        if (isExecution) {
            // Se ocorreu execução neste preço, decrementa do volume à nossa frente
            val updated = maxOf(0.0, currentAhead - eventSize)
            if (updated == 0.0) {
                queueEstimates.remove(price)
                println("🎯 [$symbol] Ordem Limite a $price atingiu o topo da fila (Execução iminente!)")
            } else {
                queueEstimates[price] = updated
            }
        } else {
            // Cancelamentos à nossa frente reduzem a fila. Assumimos probabilidade estocástica de 50%
            // de que o cancelamento ocorreu à nossa frente se estiver na fila.
            val cancelledAhead = eventSize * 0.5
            val updated = maxOf(0.0, currentAhead - cancelledAhead)
            queueEstimates[price] = updated
        }
    }

    fun getEstimatedVolumeAhead(price: Double): Double {
        return queueEstimates[price] ?: 0.0
    }
}

// ==============================================================================
// 3. Exportador de Telemetria (Prometheus Endpoint HTTP leve)
// ==============================================================================
class PrometheusMetricsServer(val port: Int = 8080) {
    private var serverSocket: ServerSocket? = null
    private var isRunning = false

    // Métricas thread-safe coletadas em tempo real
    val gcPausesMs = AtomicLong(0)
    val tcpThroughputPps = AtomicLong(0)
    val tickToTradeLatencyUs = AtomicLong(0)

    fun start() {
        isRunning = true
        Thread {
            serverSocket = ServerSocket(port)
            while (isRunning) {
                try {
                    val socket = serverSocket?.accept() ?: break
                    val output: OutputStream = socket.getOutputStream()
                    
                    val metricsPayload = StringBuilder()
                    metricsPayload.append("# HELP jvm_gc_pause_ms Total Garbage Collection pause time in milliseconds\n")
                    metricsPayload.append("# TYPE jvm_gc_pause_ms counter\n")
                    metricsPayload.append("jvm_gc_pause_ms ").append(gcPausesMs.get()).append("\n\n")

                    metricsPayload.append("# HELP network_tcp_throughput_pps Number of TCP packets processed per second\n")
                    metricsPayload.append("# TYPE network_tcp_throughput_pps gauge\n")
                    metricsPayload.append("network_tcp_throughput_pps ").append(tcpThroughputPps.get()).append("\n\n")

                    metricsPayload.append("# HELP tick_to_trade_latency_us Latency of execution cycle in microseconds\n")
                    metricsPayload.append("# TYPE tick_to_trade_latency_us gauge\n")
                    metricsPayload.append("tick_to_trade_latency_us ").append(tickToTradeLatencyUs.get()).append("\n")

                    val body = metricsPayload.toString().toByteArray(StandardCharsets.UTF_8)
                    
                    // HTTP Raw Response headers
                    val headers = ("HTTP/1.1 200 OK\r\n" +
                            "Content-Type: text/plain; version=0.0.4; charset=utf-8\r\n" +
                            "Content-Length: " + body.size + "\r\n" +
                            "Connection: close\r\n\r\n")
                    
                    output.write(headers.toByteArray(StandardCharsets.UTF_8))
                    output.write(body)
                    output.flush()
                    socket.close()
                } catch (e: Exception) {
                    // Fail silent
                }
            }
        }.start()
    }

    fun stop() {
        isRunning = false
        serverSocket?.close()
    }
}
