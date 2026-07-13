package scripts

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.runtime.*
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.input.pointer.pointerInput
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
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
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

enum class BotWorkerStatus {
    RUNNING, PAUSED, ERROR
}

@Immutable
data class BotState(
    val id: String,
    val name: String,
    val symbol: String,
    val pnl: Double,
    val status: BotWorkerStatus,
    val parameters: Map<String, String> = emptyMap()
)

@Immutable
data class MarginLedgerState(
    val totalAccount: Double = 1000.0,
    val allocatedMargin: Double = 0.0,
    val freeMargin: Double = 1000.0
)

@Immutable
data class OrchestratorUiState(
    val bots: List<BotState> = emptyList(),
    val marginLedger: MarginLedgerState = MarginLedgerState(),
    val isFormVisible: Boolean = false,
    val selectedBotForConfig: String? = null
)

class OrchestratorViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(OrchestratorUiState())
    val uiState: StateFlow<OrchestratorUiState> = _uiState.asStateFlow()

    init {
        _uiState.value = OrchestratorUiState(
            bots = listOf(
                BotState(
                    id = "bot_1",
                    name = "ScalpingBTC",
                    symbol = "BTCUSDT",
                    pnl = 125.40,
                    status = BotWorkerStatus.RUNNING,
                    parameters = mapOf("gridLevels" to "10", "trailingDistance" to "0.005")
                ),
                BotState(
                    id = "bot_2",
                    name = "GridETH",
                    symbol = "ETHUSDT",
                    pnl = -45.20,
                    status = BotWorkerStatus.PAUSED,
                    parameters = mapOf("gridLevels" to "20", "stepSize" to "0.01")
                ),
                BotState(
                    id = "bot_3",
                    name = "MeanReversionSOL",
                    symbol = "SOLUSDT",
                    pnl = 0.0,
                    status = BotWorkerStatus.ERROR,
                    parameters = mapOf("period" to "14", "deviation" to "2.0")
                )
            ),
            marginLedger = MarginLedgerState(
                totalAccount = 1000.0,
                allocatedMargin = 500.0,
                freeMargin = 500.0
            )
        )
    }

    fun toggleBotStatus(botId: String) {
        _uiState.update { state ->
            val updatedBots = state.bots.map { bot ->
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
            state.copy(bots = updatedBots)
        }
    }

    fun stopBot(botId: String) {
        _uiState.update { state ->
            val updatedBots = state.bots.filter { it.id != botId }
            val newAllocated = updatedBots.size * 250.0
            val free = state.marginLedger.totalAccount - newAllocated
            state.copy(
                bots = updatedBots,
                marginLedger = state.marginLedger.copy(
                    allocatedMargin = newAllocated,
                    freeMargin = free
                )
            )
        }
    }

    fun updateBotParameters(botId: String, newParams: Map<String, String>) {
        _uiState.update { state ->
            val updatedBots = state.bots.map { bot ->
                if (bot.id == botId) {
                    bot.copy(parameters = newParams)
                } else {
                    bot
                }
            }
            state.copy(bots = updatedBots)
        }
    }

    fun selectBotForConfig(botId: String?) {
        _uiState.update { it.copy(selectedBotForConfig = botId, isFormVisible = botId != null) }
    }
}

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

    val orchestratorViewModel = remember { OrchestratorViewModel() }
    val orchestratorState by orchestratorViewModel.uiState.collectAsState()
    var currentTab by remember { mutableStateOf(0) } // 0: Terminal HFT, 1: Fleet Orchestrator

    ModalBottomSheetLayout(
        sheetState = sheetState,
        sheetBackgroundColor = OledPalette.Surface,
        sheetContentColor = OledPalette.TextPrimary,
        sheetShape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        sheetContent = {
            PositionDetailsSheet(
                entryPrice = state.currentPositionEntry,
                currentPrice = state.currentPrice,
                trailingStop = state.currentTrailingStop,
                pnl = state.currentPnL,
                onClose = { coroutineScope.launch { sheetState.hide() } }
            )
        }
    ) {
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(OledPalette.Background)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Tab Selection Header
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(20.dp)
            ) {
                Text(
                    text = "TERMINAL HFT",
                    color = if (currentTab == 0) OledPalette.SignalOrange else OledPalette.TextSecondary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier.clickable { currentTab = 0 }
                )
                Text(
                    text = "FLEET ORCHESTRATOR",
                    color = if (currentTab == 1) OledPalette.SignalOrange else OledPalette.TextSecondary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier.clickable { currentTab = 1 }
                )
            }

            if (currentTab == 0) {
                // ==========================================
                // HFT Terminal View
                // ==========================================
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = state.symbol,
                            color = OledPalette.TextSecondary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        AnimatedPriceTicker(
                            price = state.currentPrice,
                            fontSize = 24.sp
                        )
                    }

                    LatencyIndicator(
                        latency = state.apiLatencyMs,
                        isConnected = state.isWebSocketConnected,
                        isAnomaly = state.isAnomalyDetected
                    )
                }

                if (state.candles.isEmpty() || state.currentPrice == 0.0) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
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
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        HighFrequencyChart(
                            candlesProvider = { state.candles },
                            currentPriceProvider = { state.currentPrice },
                            modifier = Modifier
                                .weight(0.55f)
                                .fillMaxWidth()
                        )

                        val mockBids = remember(state.currentPrice) {
                            listOf(
                                Pair(state.currentPrice - 1.0, 1.25),
                                Pair(state.currentPrice - 2.0, 4.80),
                                Pair(state.currentPrice - 3.0, 10.50),
                                Pair(state.currentPrice - 4.0, 3.10),
                                Pair(state.currentPrice - 5.0, 7.65)
                            )
                        }
                        val mockAsks = remember(state.currentPrice) {
                            listOf(
                                Pair(state.currentPrice + 1.0, 0.95),
                                Pair(state.currentPrice + 2.0, 5.15),
                                Pair(state.currentPrice + 3.0, 8.40),
                                Pair(state.currentPrice + 4.0, 2.70),
                                Pair(state.currentPrice + 5.0, 12.05)
                            )
                        }
                        MarketDepthView(
                            bids = mockBids,
                            asks = mockAsks,
                            modifier = Modifier.weight(0.45f)
                        )
                    }
                }

                QuickPositionCard(
                    size = state.currentPositionSize,
                    pnl = state.currentPnL,
                    onClick = { coroutineScope.launch { sheetState.show() } },
                    onDoubleTap = {
                        println("🎯 DOUBLE TAP DETECTED: Open numerical keyboard to adjust Stop-Loss!")
                    }
                )

                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    SwipeToConfirmKillSwitch(
                        isBuyHalted = state.isBuyHalted,
                        onConfirmed = {
                            hapticsManager.triggerFeedback(HapticPattern.EMERGENCY_KILL)
                            println("🚨 EMERGENCY CRYPTO KILL SWITCH CONFIRMED!")
                        }
                    )
                }
            } else {
                // ==========================================
                // Fleet Orchestrator Dashboard View
                // ==========================================
                MarginLedgerMeter(ledgerState = orchestratorState.marginLedger)

                if (orchestratorState.isFormVisible && orchestratorState.selectedBotForConfig != null) {
                    val selectedBot = orchestratorState.bots.find { it.id == orchestratorState.selectedBotForConfig }
                    if (selectedBot != null) {
                        DynamicFormBuilder(
                            bot = selectedBot,
                            onSave = { newParams ->
                                orchestratorViewModel.updateBotParameters(selectedBot.id, newParams)
                                orchestratorViewModel.selectBotForConfig(null)
                            },
                            onClose = {
                                orchestratorViewModel.selectBotForConfig(null)
                            }
                        )
                    }
                }

                BotFleetDashboard(
                    uiState = orchestratorState,
                    onToggleStatus = { botId -> orchestratorViewModel.toggleBotStatus(botId) },
                    onStopBot = { botId -> orchestratorViewModel.stopBot(botId) },
                    onSelectConfig = { botId -> orchestratorViewModel.selectBotForConfig(botId) },
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

// ==============================================================================
// 7. Latency Indicator (Componente isolado; parâmetros primitivos estáveis permitem
//    ao Compose pular a recomposição quando os valores não mudam)
// ==============================================================================
@Composable
fun LatencyIndicator(
    latency: Long,
    isConnected: Boolean,
    isAnomaly: Boolean
) {
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
// 8. Quick Position Card (Componente isolado; parâmetros primitivos estáveis permitem
//    ao Compose pular a recomposição quando os valores não mudam)
// ==============================================================================
@Composable
fun QuickPositionCard(
    size: Double,
    pnl: Double,
    onClick: () -> Unit,
    onDoubleTap: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .pointerInput(Unit) {
                detectTapGestures(
                    onDoubleTap = { onDoubleTap() },
                    onTap = { onClick() }
                )
            },
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
// 9. Modal Bottom Sheet Component para Detalhes de Posição (parâmetros primitivos
//    estáveis permitem ao Compose pular a recomposição quando os valores não mudam)
// ==============================================================================
@Composable
fun PositionDetailsSheet(
    entryPrice: Double,
    currentPrice: Double,
    trailingStop: Double,
    pnl: Double,
    onClose: () -> Unit
) {
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
    // Alocado uma única vez e reutilizado em todos os frames de desenho — criar um
    // FloatArray + PathEffect novos a cada frame dentro do Canvas custaria alocações
    // desnecessárias no orçamento de 16ms, já que o padrão do tracejado é constante.
    val currentPriceDashEffect = remember {
        androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(10f, 10f), 0f)
    }

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
                pathEffect = currentPriceDashEffect
            )
        }
    }
}

private fun abs(value: Float): Float = if (value < 0) -value else value

// ==============================================================================
// 11. Componente de Kill Switch Deslizante (parâmetro primitivo estável em vez de
//    provider lambda — mesma correção aplicada aos demais componentes leves)
// ==============================================================================
@Composable
fun SwipeToConfirmKillSwitch(
    isBuyHalted: Boolean,
    onConfirmed: () -> Unit,
    modifier: Modifier = Modifier
) {
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

// ==============================================================================
// 12. Margin Ledger Components
// ==============================================================================
@Composable
fun MarginLedgerMeter(
    ledgerState: MarginLedgerState,
    modifier: Modifier = Modifier
) {
    val usageRatio = if (ledgerState.totalAccount > 0.0) {
        ledgerState.allocatedMargin / ledgerState.totalAccount
    } else 0.0

    val isAlert = usageRatio > 0.8
    val progressColor = if (isAlert) OledPalette.SignalRed else OledPalette.SignalGreen

    Card(
        modifier = modifier.fillMaxWidth(),
        backgroundColor = OledPalette.Surface,
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("LEDGER DE MARGEM GLOBAL", color = OledPalette.TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("Total: $${ledgerState.totalAccount}", color = OledPalette.TextPrimary, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                }

                Box(
                    modifier = Modifier.size(50.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(
                        progress = usageRatio.toFloat(),
                        color = progressColor,
                        strokeWidth = 6.dp,
                        modifier = Modifier.fillMaxSize()
                    )
                    Text(
                        text = "${(usageRatio * 100).roundToInt()}%",
                        color = if (isAlert) OledPalette.SignalRed else OledPalette.TextPrimary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text("Alocado", color = OledPalette.TextSecondary, fontSize = 11.sp)
                    Text("$${ledgerState.allocatedMargin}", color = progressColor, fontWeight = FontWeight.Bold)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("Livre", color = OledPalette.TextSecondary, fontSize = 11.sp)
                    Text("$${ledgerState.freeMargin}", color = OledPalette.TextPrimary, fontWeight = FontWeight.Bold)
                }
            }

            if (isAlert) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth().pulsating(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = "Risco Alto",
                        tint = OledPalette.SignalRed,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "RISCO EXTREMO: EXPOSIÇÃO > 80%",
                        color = OledPalette.SignalRed,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }
    }
}

// ==============================================================================
// 13. Multi-Bot Fleet Dashboard Components
// ==============================================================================
@Composable
fun BotFleetDashboard(
    uiState: OrchestratorUiState,
    onToggleStatus: (String) -> Unit,
    onStopBot: (String) -> Unit,
    onSelectConfig: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(
            items = uiState.bots,
            key = { it.id } // Stable key to prevent full list recompositions!
        ) { bot ->
            BotStatusCard(
                bot = bot,
                onToggle = { onToggleStatus(bot.id) },
                onStop = { onStopBot(bot.id) },
                onConfigure = { onSelectConfig(bot.id) }
            )
        }
    }
}

@Composable
fun BotStatusCard(
    bot: BotState,
    onToggle: () -> Unit,
    onStop: () -> Unit,
    onConfigure: () -> Unit,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()
    var dragOffsetX by remember { mutableStateOf(0f) }
    
    val statusColor = when (bot.status) {
        BotWorkerStatus.RUNNING -> OledPalette.SignalGreen
        BotWorkerStatus.PAUSED -> OledPalette.SignalOrange
        BotWorkerStatus.ERROR -> OledPalette.SignalRed
    }

    val pnlColor = if (bot.pnl >= 0.0) OledPalette.SignalGreen else OledPalette.SignalRed

    Card(
        modifier = modifier
            .fillMaxWidth()
            .pointerInput(Unit) {
                detectHorizontalDragGestures(
                    onDragEnd = {
                        if (kotlin.math.abs(dragOffsetX) > 250f) {
                            coroutineScope.launch(Dispatchers.Default) {
                                onStop()
                            }
                        }
                        dragOffsetX = 0f
                    },
                    onHorizontalDrag = { _, dragAmount ->
                        dragOffsetX += dragAmount
                    }
                )
            }
            .graphicsLayer {
                translationX = dragOffsetX
            },
        backgroundColor = OledPalette.Surface,
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = bot.name,
                        color = OledPalette.TextPrimary,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = bot.symbol,
                        color = OledPalette.TextSecondary,
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .background(statusColor, shape = RoundedCornerShape(4.dp))
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = bot.status.name,
                        color = statusColor,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("PnL CORRENTE", color = OledPalette.TextSecondary, fontSize = 11.sp)
                    Text(
                        text = (if (bot.pnl >= 0.0) "+$" else "-$") + kotlin.math.abs(bot.pnl),
                        color = pnlColor,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            coroutineScope.launch(Dispatchers.Default) {
                                onToggle()
                            }
                        },
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = OledPalette.Background,
                            contentColor = OledPalette.TextPrimary
                        ),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            text = if (bot.status == BotWorkerStatus.RUNNING) "PAUSAR" else "RETOMAR",
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Button(
                        onClick = {
                            coroutineScope.launch(Dispatchers.Default) {
                                onStop()
                            }
                        },
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = OledPalette.Background,
                            contentColor = OledPalette.SignalRed
                        ),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            text = "DESTRUIR",
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Button(
                        onClick = onConfigure,
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = OledPalette.Background,
                            contentColor = OledPalette.SignalOrange
                        ),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            text = "CONFIG",
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

// ==============================================================================
// 14. Dynamic Form Builder Component
// ==============================================================================
@Composable
fun DynamicFormBuilder(
    bot: BotState,
    onSave: (Map<String, String>) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    val tempParams = remember(bot.id) { 
        bot.parameters.toMutableStateMap() 
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        backgroundColor = OledPalette.Surface,
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "AJUSTAR PARÂMETROS: ${bot.name}",
                    color = OledPalette.TextPrimary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
                Text(
                    text = "FECHAR",
                    color = OledPalette.SignalRed,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable { onClose() }
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            tempParams.forEach { (key, value) ->
                Column(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                    Text(
                        text = key.uppercase(),
                        color = OledPalette.TextSecondary,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    OutlinedTextField(
                        value = value,
                        onValueChange = { newValue ->
                            tempParams[key] = newValue
                        },
                        colors = TextFieldDefaults.outlinedTextFieldColors(
                            textColor = OledPalette.TextPrimary,
                            focusedBorderColor = OledPalette.SignalOrange,
                            unfocusedBorderColor = OledPalette.Divider
                        ),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Button(
                onClick = {
                    onSave(tempParams.toMap())
                },
                colors = ButtonDefaults.buttonColors(
                    backgroundColor = OledPalette.SignalOrange,
                    contentColor = OledPalette.Background
                ),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = "APLICAR ALTERAÇÕES DSL",
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

// ==============================================================================
// 15. Market Depth (Visual Order Book with Depth Bars)
// ==============================================================================
@Composable
fun MarketDepthView(
    bids: List<Pair<Double, Double>>,
    asks: List<Pair<Double, Double>>,
    modifier: Modifier = Modifier
) {
    val maxVolume = remember(bids, asks) {
        val maxBidVol = bids.maxOfOrNull { it.second } ?: 1.0
        val maxAskVol = asks.maxOfOrNull { it.second } ?: 1.0
        maxOf(maxBidVol, maxAskVol, 1.0)
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        backgroundColor = OledPalette.Surface,
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                text = "LIVRO DE OFERTAS (MARKET DEPTH)",
                color = OledPalette.TextSecondary,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                modifier = Modifier.padding(bottom = 8.dp)
            )

            asks.take(5).reversed().forEach { (price, volume) ->
                DepthRow(
                    price = price,
                    volume = volume,
                    maxVolume = maxVolume,
                    isBid = false
                )
            }

            Divider(color = OledPalette.Divider, modifier = Modifier.padding(vertical = 6.dp))

            bids.take(5).forEach { (price, volume) ->
                DepthRow(
                    price = price,
                    volume = volume,
                    maxVolume = maxVolume,
                    isBid = true
                )
            }
        }
    }
}

@Composable
fun DepthRow(
    price: Double,
    volume: Double,
    maxVolume: Double,
    isBid: Boolean
) {
    val barColor = if (isBid) OledPalette.SignalGreen.copy(alpha = 0.15f) else OledPalette.SignalRed.copy(alpha = 0.15f)
    val textColor = if (isBid) OledPalette.SignalGreen else OledPalette.SignalRed
    val fillRatio = (volume / maxVolume).coerceIn(0.0, 1.0).toFloat()

    val tabularTextStyle = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontSize = 12.sp,
        fontFeatureSettings = "tnum"
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(24.dp)
            .drawBehind {
                val barWidth = size.width * fillRatio
                drawRect(
                    color = barColor,
                    topLeft = Offset(if (isBid) 0f else size.width - barWidth, 0f),
                    size = Size(barWidth, size.height)
                )
            }
            .padding(horizontal = 8.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = String.format("%.2f", price),
                color = textColor,
                style = tabularTextStyle
            )
            Text(
                text = String.format("%.4f", volume),
                color = OledPalette.TextPrimary,
                style = tabularTextStyle
            )
        }
    }
}

// ==============================================================================
// 16. Animated Price Ticker (Odometer Animation per digit)
// ==============================================================================
@OptIn(ExperimentalAnimationApi::class)
@Composable
fun AnimatedPriceTicker(
    price: Double,
    modifier: Modifier = Modifier,
    color: Color = OledPalette.TextPrimary,
    fontSize: TextUnit = 24.sp
) {
    val priceString = String.format("%.2f", price)
    
    val tabularTextStyle = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontSize = fontSize,
        fontWeight = FontWeight.Bold,
        fontFeatureSettings = "tnum"
    )

    Row(modifier = modifier) {
        priceString.forEachIndexed { index, char ->
            AnimatedContent(
                targetState = char,
                transitionSpec = {
                    if (targetState > initialState) {
                        slideInVertically { height -> -height } + fadeIn() with
                                slideOutVertically { height -> height } + fadeOut()
                    } else {
                        slideInVertically { height -> height } + fadeIn() with
                                slideOutVertically { height -> -height } + fadeOut()
                    }.using(
                        SizeTransform(clip = false)
                    )
                }
            ) { targetChar ->
                Text(
                    text = targetChar.toString(),
                    color = color,
                    style = tabularTextStyle
                )
            }
        }
    }
}


