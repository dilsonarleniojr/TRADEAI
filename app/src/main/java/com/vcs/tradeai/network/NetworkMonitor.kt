package com.vcs.tradeai.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import java.util.concurrent.ConcurrentHashMap

enum class NetworkType {
    WIFI,
    CELLULAR,
    ETHERNET,
    OTHER,
    NONE
}

// Alias para compatibilidade
typealias NetworkTransport = NetworkType

data class NetworkStatus(
    val isConnected: Boolean = false,
    val transport: NetworkType = NetworkType.NONE,
    val wasDisconnected: Boolean = false
)

class NetworkMonitor(context: Context) {

    private val connectivityManager =
        context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val activeNetworks: MutableSet<Network> = ConcurrentHashMap.newKeySet()
    private var registeredCallback: ConnectivityManager.NetworkCallback? = null

    val statusFlow: Flow<NetworkStatus> = callbackFlow {
        var hasSeenDisconnect = false

        fun currentSnapshot(): NetworkStatus {
            val connected = activeNetworks.isNotEmpty()
            val transport = resolveTransport()
            return NetworkStatus(
                isConnected = connected,
                transport = if (connected) transport else NetworkType.NONE,
                wasDisconnected = connected && hasSeenDisconnect
            )
        }

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                activeNetworks.add(network)
                trySend(currentSnapshot())
            }

            override fun onCapabilitiesChanged(
                network: Network,
                networkCapabilities: NetworkCapabilities
            ) {
                val hasInternet = networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                val isValidated = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) || hasInternet
                } else {
                    hasInternet
                }
                if (isValidated) {
                    activeNetworks.add(network)
                } else {
                    activeNetworks.remove(network)
                }
                trySend(currentSnapshot())
            }

            override fun onLost(network: Network) {
                activeNetworks.remove(network)
                if (activeNetworks.isEmpty()) {
                    hasSeenDisconnect = true
                }
                trySend(currentSnapshot())
            }

            override fun onUnavailable() {
                activeNetworks.clear()
                hasSeenDisconnect = true
                trySend(currentSnapshot())
            }
        }

        // Snapshot inicial
        activeNetworks.clear()
        connectivityManager.allNetworks.forEach { net ->
            val caps = connectivityManager.getNetworkCapabilities(net)
            if (caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true) {
                activeNetworks.add(net)
            }
        }
        trySend(currentSnapshot())

        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        registeredCallback = callback
        connectivityManager.registerNetworkCallback(request, callback)

        awaitClose {
            stopMonitoring()
            activeNetworks.clear()
        }
    }.distinctUntilChanged()

    fun stopMonitoring() {
        registeredCallback?.let {
            try {
                connectivityManager.unregisterNetworkCallback(it)
            } catch (_: Exception) {}
            registeredCallback = null
        }
    }

    private fun resolveTransport(): NetworkType {
        val activeNetwork = connectivityManager.activeNetwork ?: return NetworkType.NONE
        val caps = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return NetworkType.NONE
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> NetworkType.WIFI
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> NetworkType.CELLULAR
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> NetworkType.ETHERNET
            else -> NetworkType.OTHER
        }
    }
}
