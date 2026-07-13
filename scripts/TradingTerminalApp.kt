package scripts

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * TRADEAI — Terminal GUI Militar (Militarmente Eficiente, OLED Black, Glanceability e Háptica)
 * Versão Hardened com suporte a DI (Koin/Hilt), Navegação Compose e Skeletons de Inicialização.
 */

// ==============================================================================
// 1. Definição de Cores OLED Militares (Glanceability)
// ==============================================================================
object OledPalette {
    val Background = Color(0xFF000000)      // True OLED Black para máximo contraste
    val Surface = Color(0xFF121212)         // Cinza escuro para recipientes secundários
    
    // Cores semânticas restritas a avisos e status
    val SignalGreen = Color(0xFF22C55E)     // Verde: lucros ou conexões perfeitas
    val SignalRed = Color(0xFFEF4444)       // Vermelho: perdas críticas, desconexões e Kill Switch
    val SignalOrange = Color(0xFFF59E0B)    // Laranja: failover ou latência moderada
    
    val TextPrimary = Color(0xFFFFFFFF)     // Texto principal
    val TextSecondary = Color(0xFF888888)   // Textos de suporte e menus (cinza neutro)
    val Divider = Color(0xFF262626)         // Divisores de baixo contraste
}

@Immutable
data class Candle(
    val timestamp: Long,
    val open: Double,
    val high: Double,
    val low: Double,
    val close: Double
)

@Immutable
data class TradingUiState(
    val symbol: String = "BTCUSDT",
    val currentPrice: Double = 0.0,
    val bidPrice: Double = 0.0,
    val askPrice: Double = 0.0,
    val currentPositionSize: Double = 0.25,
    val currentPositionEntry: Double = 59800.0,
    val currentTrailingStop: Double = 59200.0,
    val currentPnL: Double = 825.50,
    val candles: List<Candle> = emptyList(),
    val apiLatencyMs: Long = 0,
    val isWebSocketConnected: Boolean = false,
    val isWebSocketFailoverActive: Boolean = false,
    val isAnomalyDetected: Boolean = false,
    val twapVwapQueue: List<String> = emptyList(),
    val isBuyHalted: Boolean = false
)

class TradingViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(TradingUiState())
    val uiState: StateFlow<TradingUiState> = _uiState.asStateFlow()

    fun updatePrice(price: Double, bid: Double, ask: Double) {
        _uiState.update { 
            it.copy(currentPrice = price, bidPrice = bid, askPrice = ask)
        }
    }

    fun updateLatency(latency: Long) {
        _uiState.update { it.copy(apiLatencyMs = latency) }
    }

    fun updateWebSocketStatus(connected: Boolean, failover: Boolean) {
        _uiState.update { 
            it.copy(isWebSocketConnected = connected, isWebSocketFailoverActive = failover)
        }
    }
}

open class ViewModel

// ==============================================================================
// 2. Feedback Háptico Avançado (Haptic Engine Interface)
// ==============================================================================
enum class HapticPattern {
    ORDER_PLACED,       // Double quick pulse (confirmação rápida)
    WS_DISCONNECTED,    // Triple heavy pulse (alerta de queda de socket)
    EMERGENCY_KILL      // Continuous heavy vibration (confirmação de zeragem total)
}

class HapticsManager(private val androidContext: Any? = null) {
    fun triggerFeedback(pattern: HapticPattern) {
        println("⚡ HAPTIC MOTOR: Dispatching vibration pattern: $pattern")
    }
}

// ==============================================================================
// 3. Animações de Estado Crítico (Pulsar/Blink Modifiers)
// ==============================================================================
@Composable
fun Modifier.pulsating(durationMs: Int = 1000): Modifier {
    val infiniteTransition = rememberInfiniteTransition()
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.2f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = durationMs, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        )
    )
    return this.graphicsLayer { this.alpha = alpha }
}

// ==============================================================================
// 4. Injeção de Dependências (DI Koin Module Structure)
// ==============================================================================
interface KoinModuleBinder {
    fun single(block: () -> Any)
    fun viewModel(block: () -> ViewModel)
}

fun tradingAppModule(binder: KoinModuleBinder) {
    binder.single { HapticsManager() }
    binder.viewModel { TradingViewModel() }
}

// ==============================================================================
// 5. Grafo de Navegação Compose (Navigation Destinations)
// ==============================================================================
interface NavGraphBuilder {
    fun composable(route: String, content: @Composable () -> Unit)
}

class AppNavigation(
    private val builder: NavGraphBuilder,
    private val viewModel: TradingViewModel,
    private val hapticsManager: HapticsManager
) {
    fun registerRoutes() {
        builder.composable("trading_terminal") {
            TradingTerminalScreen(viewModel = viewModel, hapticsManager = hapticsManager)
        }
    }
}

// ==============================================================================
// 6. Tela Principal do Terminal HFT com Skeletons de Estado Inicial
// ==============================================================================
@OptIn(ExperimentalMaterialApi::class)
@Composable
fun TradingTerminalScreen(
    viewModel: TradingViewModel,
    hapticsManager: HapticsManager,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsState()
    val sheetState = rememberModalBottomSheetState(initialValue = ModalBottomSheetValue.Hidden)
    val coroutineScope = rememberCoroutineScope()

    ModalBottomSheetLayout(
        sheetState = sheetState,
        sheetBackgroundColor = OledPalette.Surface,
        sheetContentColor = OledPalette.TextPrimary,
        sheetShape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        sheetContent = {
            PositionDetailsSheet(
                entryPriceProvider = { state.currentPositionEntry },
                currentPriceProvider = { state.currentPrice },
                trailingStopProvider = { state.currentTrailingStop },
                pnlProvider = { state.currentPnL },
                onClose = { coroutineScope.launch { sheetState.hide() } }
            )
        }
    ) {
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(OledPalette.Background)
                .padding(16.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Topo: Indicadores Semânticos e Alerta Pulsante
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = state.symbol,
                    color = OledPalette.TextPrimary,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )

                // Refinement (Phase 3): Sub-componente com leitura adiada de estado
                LatencyIndicator(
                    latencyProvider = { state.apiLatencyMs },
                    isConnectedProvider = { state.isWebSocketConnected },
                    isAnomalyProvider = { state.isAnomalyDetected }
                )
            }

            // Lógica de Visibilidade: Exibe Skeleton Loader se os dados estiverem vazios/carregando
            if (state.candles.isEmpty() || state.currentPrice == 0.0) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .fillMaxHeight()
                        .background(OledPalette.Surface, shape = RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = OledPalette.SignalOrange)
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = "ASSINANDO WEBSOCKET FEED...",
                            color = OledPalette.TextSecondary,
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            } else {
                // Refinement (Phase 3): Gráfico com leitura adiada dos dados
                HighFrequencyChart(
                    candlesProvider = { state.candles },
                    currentPriceProvider = { state.currentPrice },
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .fillMaxHeight()
                        .padding(vertical = 16.dp)
                )
            }

            // Refinement (Phase 3): Card de Posição com leitura adiada
            QuickPositionCard(
                sizeProvider = { state.currentPositionSize },
                pnlProvider = { state.currentPnL },
                onClick = { coroutineScope.launch { sheetState.show() } }
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Botão deslizante do Kill Switch
            Box(
                modifier = Modifier.fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                SwipeToConfirmKillSwitch(
                    isBuyHaltedProvider = { state.isBuyHalted },
                    onConfirmed = {
                        hapticsManager.triggerFeedback(HapticPattern.EMERGENCY_KILL)
                        println("🚨 EMERGENCY CRYPTO KILL SWITCH CONFIRMED!")
                    }
                )
            }
        }
    }
}

// ==============================================================================
// 7. Latency Indicator (Componente isolado para mitigar recomposição)
// ==============================================================================
@Composable
fun LatencyIndicator(
    latencyProvider: () -> Long,
    isConnectedProvider: () -> Boolean,
    isAnomalyProvider: () -> Boolean
) {
    val latency = latencyProvider()
    val isConnected = isConnectedProvider()
    val isAnomaly = isAnomalyProvider()
    val isPulsingRequired = latency > 150 || isAnomaly

    Row(
        modifier = if (isPulsingRequired) Modifier.pulsating() else Modifier,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .background(
                    color = if (isConnected) OledPalette.SignalGreen else OledPalette.SignalRed,
                    shape = RoundedCornerShape(5.dp)
                )
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = "LATENCY: ${latency}ms",
            color = if (isPulsingRequired) OledPalette.SignalRed else OledPalette.TextSecondary,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace
        )
    }
}

// ==============================================================================
// 8. Quick Position Card (Componente isolado para mitigar recomposição)
// ==============================================================================
@Composable
fun QuickPositionCard(
    sizeProvider: () -> Double,
    pnlProvider: () -> Double,
    onClick: () -> Unit
) {
    val size = sizeProvider()
    val pnl = pnlProvider()

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        backgroundColor = OledPalette.Surface,
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("POSIÇÃO ABERTA", color = OledPalette.TextSecondary, fontSize = 11.sp)
                Text(
                    text = "$size BTC",
                    color = OledPalette.TextPrimary,
                    fontWeight = FontWeight.Bold
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("PNL CORRENTE", color = OledPalette.TextSecondary, fontSize = 11.sp)
                Text(
                    text = "+$$pnl",
                    color = OledPalette.SignalGreen,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

// ==============================================================================
// 9. Modal Bottom Sheet Component para Detalhes de Posição (Leitura Adiada)
// ==============================================================================
@Composable
fun PositionDetailsSheet(
    entryPriceProvider: () -> Double,
    currentPriceProvider: () -> Double,
    trailingStopProvider: () -> Double,
    pnlProvider: () -> Double,
    onClose: () -> Unit
) {
    val entryPrice = entryPriceProvider()
    val currentPrice = currentPriceProvider()
    val trailingStop = trailingStopProvider()
    val pnl = pnlProvider()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(OledPalette.Surface)
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "DETALHES DA POSIÇÃO",
                color = OledPalette.TextPrimary,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp
            )
            Text(
                text = "FECHAR",
                color = OledPalette.SignalRed,
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp,
                modifier = Modifier.clickable { onClose() }
            )
        }

        Divider(color = OledPalette.Divider)

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("Entrada", color = OledPalette.TextSecondary, fontSize = 14.sp)
            Text("$$entryPrice", color = OledPalette.TextPrimary, fontWeight = FontWeight.Bold)
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("Preço Corrente", color = OledPalette.TextSecondary, fontSize = 14.sp)
            Text("$$currentPrice", color = OledPalette.TextPrimary, fontWeight = FontWeight.Bold)
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("Trailing Stop Ativo (ATR)", color = OledPalette.TextSecondary, fontSize = 14.sp)
            Text("$$trailingStop", color = OledPalette.SignalOrange, fontWeight = FontWeight.Bold)
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("Lucro/Prejuízo Estimado", color = OledPalette.TextSecondary, fontSize = 14.sp)
            Text(
                text = "+$$pnl",
                color = OledPalette.SignalGreen,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

// ==============================================================================
// 10. Desenho do Gráfico OLED (Canvas com Leitura Adiada de dados)
// ==============================================================================
@Composable
fun HighFrequencyChart(
    candlesProvider: () -> List<Candle>,
    currentPriceProvider: () -> Double,
    modifier: Modifier = Modifier
) {
    Canvas(modifier = modifier.background(OledPalette.Background)) {
        val candles = candlesProvider()
        val currentPrice = currentPriceProvider()
        if (candles.isEmpty()) return@Canvas

        val canvasWidth = size.width
        val canvasHeight = size.height

        val maxHigh = candles.maxOf { it.high }
        val minLow = candles.minOf { it.low }
        val priceRange = maxHigh - minLow

        val candleWidth = canvasWidth / candles.size
        
        val gridLines = 5
        for (i in 0..gridLines) {
            val y = canvasHeight * (i.toFloat() / gridLines)
            drawLine(
                color = OledPalette.Divider,
                start = Offset(0f, y),
                end = Offset(canvasWidth, y),
                strokeWidth = 1f
            )
        }

        candles.forEachIndexed { index, candle ->
            val isGreen = candle.close >= candle.open
            val color = if (isGreen) OledPalette.SignalGreen else OledPalette.SignalRed

            val x = index * candleWidth + (candleWidth / 2f)
            val yHigh = (canvasHeight * (1f - ((candle.high - minLow) / priceRange).toFloat()))
            val yLow = (canvasHeight * (1f - ((candle.low - minLow) / priceRange).toFloat()))
            val yOpen = (canvasHeight * (1f - ((candle.open - minLow) / priceRange).toFloat()))
            val yClose = (canvasHeight * (1f - ((candle.close - minLow) / priceRange).toFloat()))

            drawLine(
                color = color,
                start = Offset(x, yHigh),
                end = Offset(x, yLow),
                strokeWidth = 2f
            )

            val top = minOf(yOpen, yClose)
            val bottom = maxOf(yOpen, yClose)
            val bodyHeight = maxOf(abs(bottom - top), 2f)

            drawRect(
                color = color,
                topLeft = Offset(x - (candleWidth * 0.3f), top),
                size = Size(candleWidth * 0.6f, bodyHeight)
            )
        }

        if (currentPrice >= minLow && currentPrice <= maxHigh) {
            val yCurrent = (canvasHeight * (1f - ((currentPrice - minLow) / priceRange).toFloat()))
            drawLine(
                color = Color(0xFF06B6D4),
                start = Offset(0f, yCurrent),
                end = Offset(canvasWidth, yCurrent),
                strokeWidth = 2f,
                pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(10f, 10f), 0f)
            )
        }
    }
}

private fun abs(value: Float): Float = if (value < 0) -value else value

// ==============================================================================
// 11. Componente de Kill Switch Deslizante (Mecânico com Leitura Adiada)
// ==============================================================================
@Composable
fun SwipeToConfirmKillSwitch(
    isBuyHaltedProvider: () -> Boolean,
    onConfirmed: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isBuyHalted = isBuyHaltedProvider()
    val width = 280.dp
    val dragSize = 64.dp
    val dragSizePx = with(LocalDensity.current) { dragSize.toPx() }
    val widthPx = with(LocalDensity.current) { width.toPx() }
    val maxDrag = widthPx - dragSizePx

    var dragOffset by remember { mutableStateOf(0f) }
    val animatedOffset by animateFloatAsState(targetValue = dragOffset)

    Box(
        modifier = modifier
            .width(width)
            .height(64.dp)
            .background(Color(0xFF3F0B0B), shape = RoundedCornerShape(32.dp))
            .padding(4.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = if (isBuyHalted) "COMPRAS INTERROMPIDAS - CANCELAR" else "DESLIZE PARA CANCELAR TUDO",
                color = Color(0xFFFCA5A5),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )
        }

        Box(
            modifier = Modifier
                .offset { IntOffset(animatedOffset.roundToInt(), 0) }
                .size(dragSize - 8.dp)
                .background(OledPalette.SignalRed, shape = RoundedCornerShape(28.dp))
                .draggable(
                    orientation = Orientation.Horizontal,
                    state = rememberDraggableState { delta ->
                        dragOffset = (dragOffset + delta).coerceIn(0f, maxDrag)
                    },
                    onDragStopped = {
                        if (dragOffset >= maxDrag * 0.95f) {
                            onConfirmed()
                        }
                        dragOffset = 0f
                    }
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = "Liquidate",
                tint = Color.White
            )
        }
    }
}
