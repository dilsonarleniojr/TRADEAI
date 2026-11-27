package com.vcs.tradeai.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.vcs.tradeai.BuildConfig
import com.vcs.tradeai.network.NetworkMonitor
import com.vcs.tradeai.network.NetworkStatus
import com.vcs.tradeai.network.NetworkType
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class TradeAIUiState(
    val isNetworkConnected: Boolean = true,
    val connectionType: NetworkType = NetworkType.OTHER,
    val activeUrl: String = BuildConfig.TRADEAI_PRIMARY_URL,
    val isLoading: Boolean = true,
    val progress: Float = 0f,
    val canGoBack: Boolean = false,
    val hasError: Boolean = false,
    val errorMessage: String = "",
    val tradingMode: String = "paper", // "paper" | "live"
    val activeSymbol: String = "BTCUSDT",
    val hasOpenModalOrDrawer: Boolean = false,
    val lastBridgeHeartbeatMs: Long? = null,
    val isFeedStale: Boolean = false,
    val networkStatus: NetworkStatus = NetworkStatus(isConnected = true, transport = NetworkType.OTHER)
) {
    val currentUrl: String get() = activeUrl
}

sealed interface TradeAIEvent {
    data class ReloadUrl(val url: String) : TradeAIEvent
    data object NotifyNetworkRestored : TradeAIEvent
    data object GoBack : TradeAIEvent
    data object DismissModal : TradeAIEvent
    data class PerformHaptic(val type: String) : TradeAIEvent
}

class TradeAIViewModel(application: Application) : AndroidViewModel(application) {

    private val networkMonitor = NetworkMonitor(application)

    private val _uiState = MutableStateFlow(TradeAIUiState())
    val uiState: StateFlow<TradeAIUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<TradeAIEvent>(extraBufferCapacity = 8)
    val events: SharedFlow<TradeAIEvent> = _events.asSharedFlow()

    private var previousConnectedState: Boolean? = null

    init {
        observeNetwork()
    }

    private fun observeNetwork() {
        viewModelScope.launch {
            networkMonitor.statusFlow.collect { status ->
                val wasConnected = previousConnectedState
                previousConnectedState = status.isConnected

                _uiState.update {
                    it.copy(
                        isNetworkConnected = status.isConnected,
                        connectionType = status.transport,
                        networkStatus = status
                    )
                }

                // Transição real de offline -> online
                if (wasConnected == false && status.isConnected) {
                    if (_uiState.value.hasError) {
                        reconnect(_uiState.value.activeUrl)
                    } else {
                        _events.tryEmit(TradeAIEvent.NotifyNetworkRestored)
                    }
                }
            }
        }
    }

    fun onTradingStateChanged(mode: String, symbol: String, hasBlockingModal: Boolean) {
        val previousMode = _uiState.value.tradingMode
        _uiState.update {
            it.copy(
                tradingMode = mode,
                activeSymbol = symbol,
                hasOpenModalOrDrawer = hasBlockingModal
            )
        }
        // Se comutou para live, dispara feedback háptico de segurança
        if (previousMode != "live" && mode == "live") {
            _events.tryEmit(TradeAIEvent.PerformHaptic("heavy"))
        }
    }

    fun onFeedHeartbeat(isStale: Boolean, ageMs: Long) {
        _uiState.update {
            it.copy(
                isFeedStale = isStale,
                lastBridgeHeartbeatMs = ageMs
            )
        }
    }

    fun onRequestHaptic(type: String) {
        _events.tryEmit(TradeAIEvent.PerformHaptic(type))
    }

    fun dismissBlockingModal() {
        _uiState.update { it.copy(hasOpenModalOrDrawer = false) }
        _events.tryEmit(TradeAIEvent.DismissModal)
    }

    fun onPageStarted(url: String?, canGoBack: Boolean) {
        _uiState.update {
            it.copy(
                activeUrl = url ?: it.activeUrl,
                isLoading = true,
                hasError = false,
                errorMessage = "",
                canGoBack = canGoBack
            )
        }
    }

    fun onProgressChanged(newProgress: Int) {
        val normalized = (newProgress / 100f).coerceIn(0f, 1f)
        _uiState.update {
            it.copy(
                progress = normalized,
                isLoading = newProgress < 100
            )
        }
    }

    fun onPageFinished(url: String?, canGoBack: Boolean) {
        _uiState.update {
            it.copy(
                activeUrl = url ?: it.activeUrl,
                isLoading = false,
                progress = 1f,
                canGoBack = canGoBack
            )
        }
    }

    fun onMainFrameError(description: String) {
        _uiState.update {
            it.copy(
                hasError = true,
                errorMessage = description,
                isLoading = false
            )
        }
    }

    fun onBackPressed() {
        if (_uiState.value.hasOpenModalOrDrawer) {
            dismissBlockingModal()
        } else if (_uiState.value.canGoBack) {
            _events.tryEmit(TradeAIEvent.GoBack)
        }
    }

    fun reconnect(targetUrl: String = _uiState.value.activeUrl) {
        _uiState.update {
            it.copy(
                activeUrl = targetUrl,
                hasError = false,
                errorMessage = "",
                isLoading = true,
                progress = 0f
            )
        }
        _events.tryEmit(TradeAIEvent.ReloadUrl(targetUrl))
    }

    override fun onCleared() {
        super.onCleared()
        networkMonitor.stopMonitoring()
    }
}
