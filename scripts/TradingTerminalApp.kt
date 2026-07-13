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
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
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

open class ViewModel {
    val viewModelScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
}

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

object FleetContainer {
    val orchestrator = BotFleetOrchestrator(1000.0)
}

class OrchestratorViewModel : ViewModel() {
    private val orchestrator = FleetContainer.orchestrator
    private val _uiState = MutableStateFlow(OrchestratorUiState())
    val uiState: StateFlow<OrchestratorUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            orchestrator.activeBots.collect { list ->
                _uiState.update { it.copy(bots = list) }
            }
        }
        viewModelScope.launch {
            orchestrator.marginLedger.collect { ledger ->
                _uiState.update { it.copy(marginLedger = ledger) }
            }
        }
    }

    fun toggleBotStatus(botId: String) {
        orchestrator.toggleBotStatus(botId)
    }

    fun stopBot(botId: String) {
        orchestrator.stopBot(botId)
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

@Immutable
data class EngineSettingsState(
    val isIcebergProtectionEnabled: Boolean = true,
    val isAutoFailoverEnabled: Boolean = true,
    val useHalfKellySizing: Boolean = true,
    val historicalWinRate: Double = 0.55,
    val twapDurationMinutes: Int = 15
)

class EngineSettingsViewModel : ViewModel() {
    private val orchestrator = FleetContainer.orchestrator
    private val _settingsState = MutableStateFlow(EngineSettingsState(
        isIcebergProtectionEnabled = orchestrator.isIcebergProtectionActive,
        isAutoFailoverEnabled = orchestrator.isAutoFailoverActive,
        useHalfKellySizing = orchestrator.useHalfKellySizing,
        historicalWinRate = orchestrator.historicalWinRate,
        twapDurationMinutes = orchestrator.twapDurationMinutes
    ))
    val settingsState: StateFlow<EngineSettingsState> = _settingsState.asStateFlow()

    fun toggleIcebergProtection(enabled: Boolean) {
        _settingsState.update { it.copy(isIcebergProtectionEnabled = enabled) }
        orchestrator.isIcebergProtectionActive = enabled
    }

    fun toggleAutoFailover(enabled: Boolean) {
        _settingsState.update { it.copy(isAutoFailoverEnabled = enabled) }
        orchestrator.isAutoFailoverActive = enabled
    }

    fun toggleHalfKelly(enabled: Boolean) {
        _settingsState.update { it.copy(useHalfKellySizing = enabled) }
        orchestrator.useHalfKellySizing = enabled
    }

    fun updateWinRate(rate: Double) {
        _settingsState.update { it.copy(historicalWinRate = rate) }
        orchestrator.historicalWinRate = rate
    }

    fun updateTwapDuration(minutes: Int) {
        _settingsState.update { it.copy(twapDurationMinutes = minutes) }
        orchestrator.twapDurationMinutes = minutes
    }
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
    binder.viewModel { EngineSettingsViewModel() }
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
    private val hapticsManager: HapticsManager,
    private val settingsViewModel: EngineSettingsViewModel
) {
    fun registerRoutes() {
        builder.composable("trading_terminal") {
            TradingTerminalScreen(
                viewModel = viewModel,
                hapticsManager = hapticsManager,
                settingsViewModel = settingsViewModel
            )
        }
        builder.composable("engine_settings") {
            EngineSettingsScreen(viewModel = settingsViewModel)
        }
    }
}

// ==============================================================================
// 6. Tela Principal do Terminal HFT com Skeletons de Estado Inicial
// ==============================================================================
// Decisions log model
data class DecisionLog(
    val timestamp: Long,
    val message: String,
    val isRejected: Boolean
)

// ==============================================================================
// 6. Tela Principal do Terminal HFT com Skeletons de Estado Inicial
// ==============================================================================
@OptIn(ExperimentalMaterialApi::class)
@Composable
fun TradingTerminalScreen(
    viewModel: TradingViewModel,
    hapticsManager: HapticsManager,
    settingsViewModel: EngineSettingsViewModel,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsState()
    val settingsState by settingsViewModel.settingsState.collectAsState()
    val sheetState = rememberModalBottomSheetState(initialValue = ModalBottomSheetValue.Hidden)
    val coroutineScope = rememberCoroutineScope()

    val orchestratorViewModel = remember { OrchestratorViewModel() }
    val orchestratorState by orchestratorViewModel.uiState.collectAsState()
    var currentTab by remember { mutableStateOf(0) } // 0: Terminal HFT, 1: Fleet Orchestrator, 2: Settings
    var showCreateBotDialog by remember { mutableStateOf(false) }

    val decisionLogs = remember {
        listOf(
            DecisionLog(System.currentTimeMillis() - 25000, "Ordem Limitada BTC cancelada: Toxicidade detectada (Spoofing)", true),
            DecisionLog(System.currentTimeMillis() - 18000, "Ordem Compra ETH preenchida: Iceberg institutional block sweep", false),
            DecisionLog(System.currentTimeMillis() - 12000, "Entrada Rejeitada NEAR: ATR Volatilidade excede limiar do VaR (Veto)", true),
            DecisionLog(System.currentTimeMillis() - 5000, "Sizing recalculado Half-Kelly: Win Rate 55% -> 12.5% margem", false)
        )
    }

    if (showCreateBotDialog) {
        NewBotCreationDialog(
            onDismiss = { showCreateBotDialog = false },
            onCreate = { name, symbol, strategy, parameters, margin ->
                val newBot = BotState(
                    id = "bot_${System.currentTimeMillis()}",
                    name = name,
                    symbol = symbol,
                    pnl = 0.0,
                    status = BotWorkerStatus.RUNNING,
                    parameters = parameters
                )
                // Register bot to backend orchestrator instance
                FleetContainer.orchestrator.registerBot(newBot, margin)
                showCreateBotDialog = false
                toast = "Bot $name registrado com margem $$margin"
            }
        )
    }

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
                .background(OledPalette.Background),
            verticalArrangement = Arrangement.spacedBy(0.dp)
        ) {
            // Persistent Telemetry Ribbon at top
            TelemetryRibbon(state = state, settingsState = settingsState, orchestratorState = orchestratorState)

            Column(
                modifier = Modifier
                    .fillMaxSize()
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
                    Text(
                        text = "ENGINE SETTINGS",
                        color = if (currentTab == 2) OledPalette.SignalOrange else OledPalette.TextSecondary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier.clickable { currentTab = 2 }
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
                                    .weight(0.50f)
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
                                modifier = Modifier.weight(0.50f)
                            )
                        }
                    }

                    // Decisions logs console
                    DecisionsAuditConsole(
                        logs = decisionLogs,
                        modifier = Modifier.height(120.dp)
                    )

                    QuickPositionCard(
                        size = state.currentPositionSize,
                        pnl = state.currentPnL,
                        onClick = { coroutineScope.launch { sheetState.show() } },
                        onDoubleTap = {
                            println("🎯 DOUBLE TAP DETECTED: Open SL input modal!")
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
                } else if (currentTab == 1) {
                    // ==========================================
                    // Fleet Orchestrator Dashboard View
                    // ==========================================
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        MarginLedgerMeter(ledgerState = orchestratorState.marginLedger, modifier = Modifier.weight(1f))
                        Spacer(modifier = Modifier.width(16.dp))
                        Button(
                            onClick = { showCreateBotDialog = true },
                            colors = ButtonDefaults.buttonColors(backgroundColor = OledPalette.SignalOrange, contentColor = OledPalette.Background),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("+ CRIAR BOT", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                        }
                    }

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
                } else {
                    // ==========================================
                    // Engine Settings View
                    // ==========================================
                    EngineSettingsScreen(viewModel = settingsViewModel)
                }
            }
        }
    }
}

// Global toast indicator helper
var toast: String = ""

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
                onToggle = onToggleStatus,
                onStop = onStopBot,
                onConfigure = onSelectConfig
            )
        }
    }
}

@Composable
fun BotStatusCard(
    bot: BotState,
    onToggle: (String) -> Unit,
    onStop: (String) -> Unit,
    onConfigure: (String) -> Unit,
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
                                onStop(bot.id)
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
                                onToggle(bot.id)
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
                                onStop(bot.id)
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
                        onClick = { onConfigure(bot.id) },
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

// ==============================================================================
// 17. Telemetry Ribbon (Barra de Status Persistente)
// ==============================================================================
@Composable
fun TelemetryRibbon(
    state: TradingUiState,
    settingsState: EngineSettingsState,
    orchestratorState: OrchestratorUiState,
    modifier: Modifier = Modifier
) {
    TopAppBar(
        backgroundColor = OledPalette.Surface,
        contentColor = OledPalette.TextPrimary,
        elevation = 4.dp,
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .background(OledPalette.SignalOrange, shape = RoundedCornerShape(4.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Text("IA", color = OledPalette.Background, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "CRYPTO IA PRO",
                    color = OledPalette.TextPrimary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                LatencyIndicator(
                    latency = state.apiLatencyMs,
                    isConnected = state.isWebSocketConnected,
                    isAnomaly = state.isAnomalyDetected
                )

                val regimeText = if (state.candles.size > 14) "TRENDING" else "CHAOTIC"
                val regimeColor = if (regimeText == "TRENDING") OledPalette.SignalGreen else OledPalette.SignalOrange
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(6.dp).background(regimeColor, shape = RoundedCornerShape(3.dp)))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "REGIME: $regimeText",
                        color = regimeColor,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }

                val relativeATR = 0.024
                val totalVaR = orchestratorState.marginLedger.allocatedMargin * relativeATR * 1.65
                val isVaRHigh = totalVaR > orchestratorState.marginLedger.totalAccount * 0.1
                val varColor = if (isVaRHigh) OledPalette.SignalRed else OledPalette.SignalGreen
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(6.dp).background(varColor, shape = RoundedCornerShape(3.dp)))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "VaR: $${String.format("%.2f", totalVaR)} (${if (isVaRHigh) "PERIGO" else "BAIXO"})",
                        color = varColor,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }
    }
}

// Formatador estático reutilizável para logs para evitar alocação de objetos no loop de renderização
private val logTimeFormatter = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault())

// ==============================================================================
// 18. Console de Auditoria de Decisões (Logs de Recusa/Aceite)
// ==============================================================================
@Composable
fun DecisionsAuditConsole(
    logs: List<DecisionLog>,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        backgroundColor = OledPalette.Surface,
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                text = "CONSOLE DE AUDITORIA DE DECISÕES (LOGS)",
                color = OledPalette.SignalOrange,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                modifier = Modifier.padding(bottom = 8.dp)
            )

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                items(
                    items = logs,
                    key = { it.timestamp } // Chave estável para evitar recomposição desnecessária
                ) { log ->
                    val color = if (log.isRejected) OledPalette.SignalRed else OledPalette.SignalGreen
                    
                    // Pre-format sem alocar novos SimpleDateFormat no loop
                    val formattedTime = remember(log.timestamp) {
                        logTimeFormatter.format(java.util.Date(log.timestamp))
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = log.message,
                            color = color,
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace,
                            modifier = Modifier.weight(1f)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = formattedTime,
                            color = OledPalette.TextSecondary,
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }
            }
        }
    }
}

// ==============================================================================
// 19. Engine Settings & Feature Toggles Screen
// ==============================================================================
@Composable
fun EngineSettingsScreen(
    viewModel: EngineSettingsViewModel,
    modifier: Modifier = Modifier
) {
    val settingsState by viewModel.settingsState.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(OledPalette.Background),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "CONFIGURAÇÕES GLOBAIS DE EXECUÇÃO",
            color = OledPalette.SignalOrange,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace
        )

        Card(
            modifier = Modifier.fillMaxWidth(),
            backgroundColor = OledPalette.Surface,
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("ATIVAR PROTEÇÃO ICEBERG", color = OledPalette.TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Text("Rastreia ordens ocultas institucionais e previne sweep.", color = OledPalette.TextSecondary, fontSize = 11.sp)
                    }
                    Switch(
                        checked = settingsState.isIcebergProtectionEnabled,
                        onCheckedChange = { viewModel.toggleIcebergProtection(it) },
                        colors = SwitchDefaults.colors(checkedThumbColor = OledPalette.SignalOrange)
                    )
                }

                Divider(color = OledPalette.Divider)

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("ATIVAR FAILOVER AUTOMÁTICO", color = OledPalette.TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Text("Redireciona endpoints em caso de anomalia de latência.", color = OledPalette.TextSecondary, fontSize = 11.sp)
                    }
                    Switch(
                        checked = settingsState.isAutoFailoverEnabled,
                        onCheckedChange = { viewModel.toggleAutoFailover(it) },
                        colors = SwitchDefaults.colors(checkedThumbColor = OledPalette.SignalOrange)
                    )
                }

                Divider(color = OledPalette.Divider)

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("USAR HALF-KELLY PARA SIZING", color = OledPalette.TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Text("Reduz a fração Kelly pela metade para controle de ruído.", color = OledPalette.TextSecondary, fontSize = 11.sp)
                    }
                    Switch(
                        checked = settingsState.useHalfKellySizing,
                        onCheckedChange = { viewModel.toggleHalfKelly(it) },
                        colors = SwitchDefaults.colors(checkedThumbColor = OledPalette.SignalOrange)
                    )
                }
            }
        }
    }
}

// ==============================================================================
// 20. Diálogo de Criação de Novo Bot com injeção de parâmetros dinâmica (DSL)
// ==============================================================================
@Composable
fun NewBotCreationDialog(
    onDismiss: () -> Unit,
    onCreate: (name: String, symbol: String, strategy: String, parameters: Map<String, String>, margin: Double) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var symbol by remember { mutableStateOf("BTCUSDT") }
    var strategy by remember { mutableStateOf("AI") }
    var margin by remember { mutableStateOf("250.0") }

    // Dynamic fields depending on strategy type
    var rsiPeriod by remember { mutableStateOf("14") }
    var rsiBuyThreshold by remember { mutableStateOf("30") }
    var rsiSellThreshold by remember { mutableStateOf("70") }

    var emaFast by remember { mutableStateOf("9") }
    var emaSlow by remember { mutableStateOf("21") }

    var historicalWinRate by remember { mutableStateOf("0.55") }
    var twapDurationMinutes by remember { mutableStateOf("15") }

    AlertDialog(
        onDismissRequest = onDismiss,
        backgroundColor = OledPalette.Surface,
        title = {
            Text(
                text = "REGISTRAR NOVA ESTRATÉGIA",
                color = OledPalette.TextPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Nome do Bot (opcional)", color = OledPalette.TextSecondary) },
                    colors = TextFieldDefaults.outlinedTextFieldColors(textColor = OledPalette.TextPrimary, focusedBorderColor = OledPalette.SignalOrange),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                // Strategy selector
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    listOf("AI", "RSI", "MACD", "KELLY", "TWAP").forEach { s ->
                        val selected = strategy == s
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .background(if (selected) OledPalette.SignalOrange else OledPalette.Background, shape = RoundedCornerShape(4.dp))
                                .clickable { strategy = s }
                                .padding(vertical = 6.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = s,
                                color = if (selected) OledPalette.Background else OledPalette.TextSecondary,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = symbol,
                    onValueChange = { symbol = it },
                    label = { Text("Símbolo (Par)", color = OledPalette.TextSecondary) },
                    colors = TextFieldDefaults.outlinedTextFieldColors(textColor = OledPalette.TextPrimary, focusedBorderColor = OledPalette.SignalOrange),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = margin,
                    onValueChange = { margin = it },
                    label = { Text("Margem Alocada ($)", color = OledPalette.TextSecondary) },
                    colors = TextFieldDefaults.outlinedTextFieldColors(textColor = OledPalette.TextPrimary, focusedBorderColor = OledPalette.SignalOrange),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                // Dynamic param rendering logic (DSL)
                if (strategy == "KELLY") {
                    OutlinedTextField(
                        value = historicalWinRate,
                        onValueChange = { historicalWinRate = it },
                        label = { Text("Win Rate Histórico (ex: 0.55)", color = OledPalette.TextSecondary) },
                        colors = TextFieldDefaults.outlinedTextFieldColors(textColor = OledPalette.TextPrimary, focusedBorderColor = OledPalette.SignalOrange),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                } else if (strategy == "TWAP") {
                    OutlinedTextField(
                        value = twapDurationMinutes,
                        onValueChange = { twapDurationMinutes = it },
                        label = { Text("Duração em Minutos (ex: 15)", color = OledPalette.TextSecondary) },
                        colors = TextFieldDefaults.outlinedTextFieldColors(textColor = OledPalette.TextPrimary, focusedBorderColor = OledPalette.SignalOrange),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                } else if (strategy == "RSI") {
                    OutlinedTextField(
                        value = rsiPeriod,
                        onValueChange = { rsiPeriod = it },
                        label = { Text("Período RSI", color = OledPalette.TextSecondary) },
                        colors = TextFieldDefaults.outlinedTextFieldColors(textColor = OledPalette.TextPrimary, focusedBorderColor = OledPalette.SignalOrange),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = rsiBuyThreshold,
                        onValueChange = { rsiBuyThreshold = it },
                        label = { Text("Compra RSI (<)", color = OledPalette.TextSecondary) },
                        colors = TextFieldDefaults.outlinedTextFieldColors(textColor = OledPalette.TextPrimary, focusedBorderColor = OledPalette.SignalOrange),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = rsiSellThreshold,
                        onValueChange = { rsiSellThreshold = it },
                        label = { Text("Venda RSI (>)", color = OledPalette.TextSecondary) },
                        colors = TextFieldDefaults.outlinedTextFieldColors(textColor = OledPalette.TextPrimary, focusedBorderColor = OledPalette.SignalOrange),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                } else if (strategy == "MACD") {
                    OutlinedTextField(
                        value = emaFast,
                        onValueChange = { emaFast = it },
                        label = { Text("EMA Rápida", color = OledPalette.TextSecondary) },
                        colors = TextFieldDefaults.outlinedTextFieldColors(textColor = OledPalette.TextPrimary, focusedBorderColor = OledPalette.SignalOrange),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = emaSlow,
                        onValueChange = { emaSlow = it },
                        label = { Text("EMA Lenta", color = OledPalette.TextSecondary) },
                        colors = TextFieldDefaults.outlinedTextFieldColors(textColor = OledPalette.TextPrimary, focusedBorderColor = OledPalette.SignalOrange),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val finalParams = when (strategy) {
                        "KELLY" -> mapOf("winRate" to historicalWinRate, "useKelly" to "true")
                        "TWAP" -> mapOf("durationMinutes" to twapDurationMinutes)
                        "RSI" -> mapOf("rsiPeriod" to rsiPeriod, "buyThreshold" to rsiBuyThreshold, "sellThreshold" to rsiSellThreshold)
                        "MACD" -> mapOf("emaFast" to emaFast, "emaSlow" to emaSlow)
                        else -> mapOf("confidence" to "75")
                    }
                    onCreate(
                        name.ifBlank { "${strategy}_${symbol}" },
                        symbol,
                        strategy,
                        finalParams,
                        margin.toDoubleOrNull() ?: 250.0
                    )
                },
                colors = ButtonDefaults.buttonColors(backgroundColor = OledPalette.SignalOrange)
            ) {
                Text("REGISTRAR", color = OledPalette.Background)
            }
        },
        dismissButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(backgroundColor = OledPalette.Surface)
            ) {
                Text("CANCELAR", color = OledPalette.TextPrimary)
            }
        }
    )
}


