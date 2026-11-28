# ProGuard / R8 rules for TradeAI
# Preserves annotations, JavascriptInterface and bridge serialization

-keepattributes *Annotation*
-keepattributes JavascriptInterface

# Preserve JavaScript Interface methods
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve Bridge, ViewModel and Network models across reflection / obfuscation
-keep class com.vcs.tradeai.bridge.** { *; }
-keep class com.vcs.tradeai.viewmodel.** { *; }
-keep class com.vcs.tradeai.network.** { *; }
-keep class com.vcs.tradeai.BuildConfig { *; }

# Preserve Compose Runtime
-keep class androidx.compose.runtime.** { *; }
