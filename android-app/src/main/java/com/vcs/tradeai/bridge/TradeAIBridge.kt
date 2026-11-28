package com.vcs.tradeai.bridge

import android.webkit.JavascriptInterface

/**
 * Interface bidirecional segura exposta para o JavaScript como `window.TradeAINative`.
 * Permite ao frontend web (Next.js/React) notificar o shell Android nativo sobre:
 * - Alteração no estado de trading (modo paper/live, par ativo, modal/gaveta aberta).
 * - Heartbeat de dados em tempo real (mercado vivo vs cotações obsoletas).
 * - Solicitação de feedback tátil háptico nativo em operações críticas.
 */
class TradeAIBridge(
    private val onTradingStateChanged: (mode: String, symbol: String, hasBlockingModal: Boolean) -> Unit,
    private val onFeedHeartbeat: (isStale: Boolean, ageMs: Long) -> Unit,
    private val onRequestHaptic: (type: String) -> Unit
) {
    @JavascriptInterface
    fun onTradingStateChanged(mode: String?, symbol: String?, hasBlockingModal: Boolean) {
        onTradingStateChanged.invoke(
            mode ?: "paper",
            symbol ?: "BTCUSDT",
            hasBlockingModal
        )
    }

    @JavascriptInterface
    fun onFeedHeartbeat(isStale: Boolean, ageMs: Long) {
        onFeedHeartbeat.invoke(isStale, ageMs)
    }

    @JavascriptInterface
    fun onRequestHaptic(type: String?) {
        onRequestHaptic.invoke(type ?: "selection")
    }
}
