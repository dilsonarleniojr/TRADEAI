package com.vcs.tradeai.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val InstitutionalDarkColorScheme = darkColorScheme(
    primary = TradePrimary,
    onPrimary = TradeBackground,
    primaryContainer = TradeSurfaceVariant,
    onPrimaryContainer = TradeTextPrimary,
    secondary = TradeSecondary,
    onSecondary = TradeTextPrimary,
    background = TradeBackground,
    onBackground = TradeTextPrimary,
    surface = TradeSurface,
    onSurface = TradeTextPrimary,
    surfaceVariant = TradeSurfaceVariant,
    onSurfaceVariant = TradeTextSecondary,
    error = TradeBearRed,
    onError = TradeTextPrimary,
    outline = TradeBorder
)

@Composable
fun TradeAITheme(
    darkTheme: Boolean = true, // Modo escuro institucional como padrão para terminal financeiro
    dynamicColor: Boolean = false, // Desabilitado para preservar a paleta de trading de alta fidelidade
    content: @Composable () -> Unit
) {
    val colorScheme = InstitutionalDarkColorScheme

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window
            if (window != null) {
                window.statusBarColor = TradeBackground.toArgb()
                window.navigationBarColor = TradeBackground.toArgb()
                val insetsController = WindowCompat.getInsetsController(window, view)
                insetsController.isAppearanceLightStatusBars = false
                insetsController.isAppearanceLightNavigationBars = false
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
