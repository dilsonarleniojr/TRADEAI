package com.vcs.tradeai

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.vcs.tradeai.bridge.TradeAIBridge
import com.vcs.tradeai.network.NetworkType
import com.vcs.tradeai.ui.theme.TradeAITheme
import com.vcs.tradeai.ui.theme.TradeBackground
import com.vcs.tradeai.ui.theme.TradeBearRed
import com.vcs.tradeai.ui.theme.TradeBullGreen
import com.vcs.tradeai.ui.theme.TradePrimary
import com.vcs.tradeai.ui.theme.TradeSurface
import com.vcs.tradeai.ui.theme.TradeTextMuted
import com.vcs.tradeai.ui.theme.TradeTextPrimary
import com.vcs.tradeai.ui.theme.TradeTextSecondary
import com.vcs.tradeai.ui.theme.TradeWarning
import com.vcs.tradeai.viewmodel.TradeAIEvent
import com.vcs.tradeai.viewmodel.TradeAIViewModel

class MainActivity : ComponentActivity() {
    private val viewModel: TradeAIViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Quick Win 1: Bloqueio estrito de prints/gravação em produção
        if (!BuildConfig.DEBUG) {
            window.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            )
        }
        enableEdgeToEdge()
        setContent {
            TradeAITheme {
                Scaffold(
                    modifier = Modifier.fillMaxSize(),
                    containerColor = TradeBackground
                ) { innerPadding ->
                    TradeAIApp(
                        viewModel = viewModel,
                        modifier = Modifier.padding(innerPadding)
                    )
                }
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun TradeAIApp(
    viewModel: TradeAIViewModel,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    val haptics = LocalHapticFeedback.current
    var webView: WebView? by remember { mutableStateOf(null) }

    val primaryUrl = BuildConfig.TRADEAI_PRIMARY_URL
    val fallbackUrl = BuildConfig.TRADEAI_FALLBACK_URL

    // BackHandler inteligente: se houver modal ou gaveta aberta no web, fecha antes de voltar página
    BackHandler(enabled = uiState.hasOpenModalOrDrawer || uiState.canGoBack) {
        viewModel.onBackPressed()
    }

    LaunchedEffect(viewModel, webView) {
        val currentWebView = webView ?: return@LaunchedEffect
        viewModel.events.collect { event ->
            when (event) {
                is TradeAIEvent.ReloadUrl -> currentWebView.loadUrl(event.url)
                is TradeAIEvent.GoBack -> if (currentWebView.canGoBack()) currentWebView.goBack()
                is TradeAIEvent.DismissModal -> {
                    currentWebView.evaluateJavascript(
                        """
                        (function() {
                            window.dispatchEvent(new CustomEvent('tradeai:dismiss-modal'));
                            var closeBtn = document.querySelector('[role="dialog"] button[aria-label*="Close" i], [data-state="open"] button[aria-label*="Close" i], button[data-dialog-close]');
                            if (closeBtn) {
                                closeBtn.click();
                            } else {
                                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
                            }
                        })();
                        """.trimIndent(),
                        null
                    )
                }
                is TradeAIEvent.NotifyNetworkRestored -> {
                    currentWebView.evaluateJavascript(
                        """
                        window.dispatchEvent(new CustomEvent('tradeai:network-restored', {
                            detail: { transport: '${uiState.connectionType.name}' }
                        }));
                        """.trimIndent(),
                        null
                    )
                }
                is TradeAIEvent.PerformHaptic -> {
                    when (event.type.lowercase()) {
                        "heavy", "live", "error", "alert" -> haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        else -> haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    }
                }
            }
        }
    }

    // Quick Win 2 & Etapa 3: Desanexação segura do WebView e remoção da interface JS
    DisposableEffect(Unit) {
        onDispose {
            webView?.apply {
                stopLoading()
                removeJavascriptInterface("TradeAINative")
                webChromeClient = null
                webViewClient = WebViewClient()
                clearHistory()
                removeAllViews()
                destroy()
            }
            webView = null
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(TradeBackground)
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context ->
                WebView(context).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    // Quick Win 4: Aceleração de hardware na GPU
                    setLayerType(View.LAYER_TYPE_HARDWARE, null)
                    isVerticalScrollBarEnabled = false
                    isHorizontalScrollBarEnabled = false

                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        databaseEnabled = true
                        cacheMode = WebSettings.LOAD_DEFAULT
                        useWideViewPort = true
                        loadWithOverviewMode = true
                        // Quick Win 3: Bloqueio estrito de arquivos locais
                        allowFileAccess = false
                        allowContentAccess = false
                        // Quick Win 5: Bloqueio de conteúdo misto em produção
                        mixedContentMode = if (BuildConfig.DEBUG) {
                            WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                        } else {
                            WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        }
                    }

                    // Etapa 3: Ponte bidirecional nativa exposta ao frontend Web
                    val bridge = TradeAIBridge(
                        onTradingStateChanged = { mode, symbol, hasBlockingModal ->
                            viewModel.onTradingStateChanged(mode, symbol, hasBlockingModal)
                        },
                        onFeedHeartbeat = { isStale, ageMs ->
                            viewModel.onFeedHeartbeat(isStale, ageMs)
                        },
                        onRequestHaptic = { type ->
                            viewModel.onRequestHaptic(type)
                        }
                    )
                    addJavascriptInterface(bridge, "TradeAINative")

                    webChromeClient = object : WebChromeClient() {
                        override fun onProgressChanged(view: WebView?, newProgress: Int) {
                            viewModel.onProgressChanged(newProgress)
                        }
                    }

                    webViewClient = object : WebViewClient() {
                        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                            viewModel.onPageStarted(url, view?.canGoBack() == true)
                        }

                        override fun onPageFinished(view: WebView?, url: String?) {
                            viewModel.onPageFinished(url, view?.canGoBack() == true)

                            // Injeção de Dark Mode Institucional e registro do Native Bridge
                            val js = """
                                (function() {
                                    try {
                                        document.documentElement.classList.add('dark');
                                        localStorage.setItem('theme', 'dark');
                                        if (!document.getElementById('tradeai-injected-dark-theme')) {
                                            var style = document.createElement('style');
                                            style.id = 'tradeai-injected-dark-theme';
                                            style.textContent = `
                                                html, body, main { background-color: #090d14 !important; color: #f1f5f9 !important; }
                                                .bg-white, .bg-\\[\\#F2F4F7\\], .bg-background { background-color: #090d14 !important; }
                                                .glass, div[class*='rounded-xl'][class*='p-4'] { background-color: #0f1622 !important; border-color: rgba(255, 255, 255, 0.08) !important; }
                                                header, nav { background-color: #0b1019 !important; border-color: rgba(255, 255, 255, 0.08) !important; }
                                            `;
                                            document.head.appendChild(style);
                                        }
                                        window.__tradeai_native_ready = true;
                                    } catch(e) {}
                                })();
                            """.trimIndent()
                            view?.evaluateJavascript(js, null)
                        }

                        override fun onReceivedError(
                            view: WebView?,
                            request: WebResourceRequest?,
                            error: WebResourceError?
                        ) {
                            if (request?.isForMainFrame == true) {
                                viewModel.onMainFrameError(
                                    error?.description?.toString() ?: "Falha ao conectar ao servidor TradeAI"
                                )
                            }
                        }
                    }

                    loadUrl(uiState.activeUrl)
                    webView = this
                }
            },
            update = { webView = it }
        )

        // Banner 1: Sem rede no dispositivo
        if (!uiState.isNetworkConnected && !uiState.hasError) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter)
                    .background(TradeBearRed.copy(alpha = 0.95f))
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Sem conexão no dispositivo — dados de cotação podem estar obsoletos",
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Center
                )
            }
        } else if (uiState.isFeedStale && !uiState.hasError) {
            // Banner 2: Feed stale / latência alta reportado pelo frontend
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter)
                    .background(TradeWarning.copy(alpha = 0.95f))
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Aviso de Latência: feed de ordens desatualizado (${uiState.lastBridgeHeartbeatMs ?: 0}ms)",
                    color = TradeBackground,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center
                )
            }
        }

        // Barra de progresso de carregamento
        if (uiState.isLoading && uiState.progress < 1f) {
            LinearProgressIndicator(
                progress = { uiState.progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter),
                color = TradePrimary,
                trackColor = TradeBackground
            )
        }

        // Tela de Erro / Falha de Conexão com Diagnóstico Nativo
        if (uiState.hasError) {
            val transportLabel = when (uiState.connectionType) {
                NetworkType.WIFI -> "Wi-Fi"
                NetworkType.CELLULAR -> "Dados móveis"
                NetworkType.ETHERNET -> "Ethernet"
                NetworkType.OTHER -> "Rede ativa"
                NetworkType.NONE -> "Sem conexão"
            }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(TradeBackground)
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "TradeAI",
                        fontSize = 32.sp,
                        fontWeight = FontWeight.Bold,
                        color = TradePrimary
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Conexão com o TradeAI interrompida",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TradeTextPrimary,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Status da rede local: $transportLabel",
                        fontSize = 12.sp,
                        color = TradeTextSecondary,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = uiState.errorMessage,
                        fontSize = 14.sp,
                        color = TradeTextMuted,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(24.dp))
                    Button(
                        onClick = {
                            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                            viewModel.reconnect(primaryUrl)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = TradePrimary)
                    ) {
                        Text("Reconectar ao TradeAI", color = TradeBackground, fontWeight = FontWeight.Bold)
                    }
                    if (BuildConfig.ALLOW_DEBUG_ENDPOINTS && fallbackUrl != primaryUrl) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Button(
                            onClick = {
                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                viewModel.reconnect(fallbackUrl)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = TradeSurface)
                        ) {
                            Text("Debug LAN ($fallbackUrl)", color = TradePrimary)
                        }
                    }
                }
            }
        }
    }
}
