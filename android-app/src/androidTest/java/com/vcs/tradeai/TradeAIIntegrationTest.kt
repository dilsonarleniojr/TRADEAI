package com.vcs.tradeai

import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.ValueCallback
import android.webkit.WebView
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.vcs.tradeai.bridge.TradeAIBridge
import com.vcs.tradeai.viewmodel.TradeAIEvent
import com.vcs.tradeai.viewmodel.TradeAIViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class TradeAIIntegrationTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    /**
     * Teste 1: Valida os callbacks da TradeAIBridge para o TradeAIViewModel.
     * Cobre atualização de modo ("live" / "paper"), par, modal/drawer aberto,
     * status stale (> 10_000 ms), fallback seguro para valores nulos e háptica.
     */
    @Test
    fun testTradeAIBridgeToViewModelCallbacks() {
        val activity = composeTestRule.activity
        val viewModel = ViewModelProvider(activity)[TradeAIViewModel::class.java]

        var capturedHapticType: String? = null
        val bridge = TradeAIBridge(
            onTradingStateChanged = { mode, symbol, hasBlockingModal ->
                viewModel.onTradingStateChanged(mode, symbol, hasBlockingModal)
            },
            onFeedHeartbeat = { isStale, ageMs ->
                viewModel.onFeedHeartbeat(isStale, ageMs)
            },
            onRequestHaptic = { type ->
                capturedHapticType = type
                viewModel.onRequestHaptic(type)
            }
        )

        // 1. Atualização para modo Live com par ETHUSDT e modal aberto
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            bridge.onTradingStateChanged("live", "ETHUSDT", true)
        }
        val state1 = viewModel.uiState.value
        assertEquals("live", state1.tradingMode)
        assertEquals("ETHUSDT", state1.activeSymbol)
        assertTrue(state1.hasOpenModalOrDrawer)

        // 2. Heartbeat com feed stale (> 10s)
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            bridge.onFeedHeartbeat(true, 12500L)
        }
        val state2 = viewModel.uiState.value
        assertTrue(state2.isFeedStale)
        assertEquals(12500L, state2.lastBridgeHeartbeatMs)

        // 3. Fallback seguro para valores nulos (null -> "paper", null -> "BTCUSDT")
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            bridge.onTradingStateChanged(null, null, false)
        }
        val state3 = viewModel.uiState.value
        assertEquals("paper", state3.tradingMode)
        assertEquals("BTCUSDT", state3.activeSymbol)
        assertFalse(state3.hasOpenModalOrDrawer)

        // 4. Solicitação háptica nativa
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            bridge.onRequestHaptic("heavy")
        }
        assertEquals("heavy", capturedHapticType)
    }

    /**
     * Teste 2: Valida a transição para modo Live disparando evento háptico "heavy".
     */
    @Test
    fun testLiveModeTransitionEmitsHapticEvent() = runBlocking {
        val activity = composeTestRule.activity
        val viewModel = ViewModelProvider(activity)[TradeAIViewModel::class.java]

        val receivedHaptic = AtomicReference<String?>(null)
        val job = launch {
            viewModel.events.collect { event ->
                if (event is TradeAIEvent.PerformHaptic) {
                    receivedHaptic.set(event.type)
                }
            }
        }

        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            // Garante início em paper
            viewModel.onTradingStateChanged("paper", "BTCUSDT", false)
            // Transição para live
            viewModel.onTradingStateChanged("live", "BTCUSDT", false)
        }

        // Aguarda evento háptico ser emitido
        composeTestRule.waitUntil(timeoutMillis = 2000) {
            receivedHaptic.get() != null
        }

        assertEquals("heavy", receivedHaptic.get())
        job.cancel()
    }

    /**
     * Teste 3: Valida a presença da WebView com a interface Javascript "TradeAINative" registrada.
     */
    @Test
    fun testWebViewExposesTradeAINativeInterface() {
        val activity = composeTestRule.activity
        val latch = CountDownLatch(1)
        val isInterfaceExposed = AtomicBoolean(false)

        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            // Procura a WebView na hierarquia de views
            val rootView = activity.findViewById<ViewGroup>(android.R.id.content)
            val webView = findWebView(rootView)
            assertNotNull("WebView deve estar presente na hierarquia da Activity", webView)

            webView?.let { wv ->
                // Valida que Javascript está habilitado
                assertTrue("JavaScript deve estar ativado na WebView", wv.settings.javaScriptEnabled)

                // Avalia se o objeto TradeAINative foi injetado pelo addJavascriptInterface
                wv.evaluateJavascript("typeof window.TradeAINative !== 'undefined'") { result ->
                    val isExposed = result == "true" || result == "\"true\""
                    isInterfaceExposed.set(isExposed)
                    latch.countDown()
                }
            } ?: latch.countDown()
        }

        latch.await(3, TimeUnit.SECONDS)
        assertTrue("Interface window.TradeAINative deve estar exposta no runtime JS", isInterfaceExposed.get())
    }

    /**
     * Teste 4: Valida o consumo do evento DismissModal ao pressionar Back com modal aberto.
     */
    @Test
    fun testBackPressedDismissesModalWhenModalIsOpen() = runBlocking {
        val activity = composeTestRule.activity
        val viewModel = ViewModelProvider(activity)[TradeAIViewModel::class.java]

        val dismissReceived = AtomicBoolean(false)
        val job = launch {
            viewModel.events.collect { event ->
                if (event is TradeAIEvent.DismissModal) {
                    dismissReceived.set(true)
                }
            }
        }

        // Simula modal aberto via bridge
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            viewModel.onTradingStateChanged("paper", "BTCUSDT", true)
        }
        assertTrue(viewModel.uiState.value.hasOpenModalOrDrawer)

        // Executa ação de voltar
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            viewModel.onBackPressed()
        }

        composeTestRule.waitUntil(timeoutMillis = 2000) {
            dismissReceived.get()
        }

        assertTrue("Evento DismissModal deve ser emitido quando modal estiver aberto", dismissReceived.get())
        assertFalse("hasOpenModalOrDrawer deve ser atualizado para false após dismiss", viewModel.uiState.value.hasOpenModalOrDrawer)
        job.cancel()
    }

    /**
     * Teste 5: Valida a recriação da MainActivity (mudança de configuração / lifecycle) sem crash.
     */
    @Test
    fun testMainActivityRecreationLifecycle() {
        val scenario = composeTestRule.activityRule.scenario
        assertNotNull(scenario)

        // Recria a activity para testar retenção de estado e reinicialização segura
        scenario.recreate()
        composeTestRule.waitForIdle()

        scenario.onActivity { recreatedActivity ->
            assertNotNull("Activity recriada não pode ser nula", recreatedActivity)
            assertFalse("Activity recriada não deve estar finalizando", recreatedActivity.isFinishing)
        }
    }

    /**
     * Função auxiliar para localizar recursivamente a WebView na árvore de views.
     */
    private fun findWebView(viewGroup: ViewGroup): WebView? {
        for (i in 0 until viewGroup.childCount) {
            val child = viewGroup.getChildAt(i)
            if (child is WebView) {
                return child
            } else if (child is ViewGroup) {
                val found = findWebView(child)
                if (found != null) return found
            }
        }
        return null
    }
}
