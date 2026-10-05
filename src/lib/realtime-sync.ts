/**
 * RealTimeSyncManager
 *
 * Manages the real-time data synchronization strategy:
 * 1. Primary: Socket.IO (WebSocket) for instant updates
 * 2. Fallback: REST API polling when WebSocket drops
 * 3. Offline: Badge shown after 3 consecutive polling failures
 *
 * Events listened:
 * - balance-update → updates account/portfolio
 * - trade-executed → adds trade to history
 * - portfolio-update → updates portfolio metrics
 * - ticker:update → updates market prices
 */

import { useCryptoStore } from "@/lib/store";

export type SyncStatus = "realtime" | "polling" | "offline";

export interface SyncManagerState {
  status: SyncStatus;
  lastSuccessfulSync: number;
  pollingFailureCount: number;
  wsConnected: boolean;
}

class RealTimeSyncManagerImpl {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private pollingIntervalMs = 5000;
  private maxPollingFailures = 3;

  /**
   * Notify the manager that WebSocket connected.
   * Stops polling and switches to realtime mode.
   */
  onWSConnected(): void {
    const store = useCryptoStore.getState();
    store.setConnectionStatus("connected");
    store.setSyncMode("realtime");
    store.resetPollingFailures();
    store.setLastSyncAt(Date.now());

    // Stop polling — WS handles everything, unless we are in live mode
    if (store.tradingMode !== "live") {
      this.stopPolling();
    } else {
      // Ensure polling remains active to sync live balance
      this.startPolling();
    }

    console.log("[SyncManager] WS connected → realtime mode");
  }

  /**
   * Notify the manager that WebSocket disconnected.
   * Starts polling as fallback.
   */
  onWSDisconnected(): void {
    const store = useCryptoStore.getState();
    store.setConnectionStatus("disconnected");

    // Don't start polling if already in polling mode
    if (store.syncMode !== "polling") {
      store.setSyncMode("polling");
      console.log("[SyncManager] WS disconnected → polling mode");
    }

    this.startPolling();
  }

  /**
   * Notify successful REST API data fetch.
   * Resets failure count and updates sync timestamp.
   */
  onPollingSuccess(): void {
    const store = useCryptoStore.getState();
    store.resetPollingFailures();
    store.setLastSyncAt(Date.now());

    if (store.connectionStatus !== "connected") {
      store.setConnectionStatus("rest-api");
    }
  }

  /**
   * Notify failed REST API polling attempt.
   * After maxPollingFailures, switches to offline mode.
   */
  onPollingFailure(): void {
    const store = useCryptoStore.getState();
    store.incrementPollingFailures();

    const failures = store.pollingFailures + 1; // incrementPollingFailures is async
    if (failures >= this.maxPollingFailures) {
      console.warn(`[SyncManager] ${failures} polling failures → offline mode`);
      store.setConnectionStatus("disconnected");
    }
  }

  /**
   * Start periodic polling for account, trades, and market data.
   */
  startPolling(): void {
    if (this.pollingInterval) return; // Already polling

    this.pollingInterval = setInterval(async () => {
      const store = useCryptoStore.getState();

      // Don't poll if WS is connected (realtime mode) unless in live trading mode
      if (store.connectionStatus === "connected" && store.tradingMode !== "live") {
        this.stopPolling();
        return;
      }

      try {
        const accountRes = await fetch(`/api/account?mode=${store.tradingMode}`);
        if (accountRes.ok) {
          const result = await accountRes.json();
          if (result.success && result.data) {
            store.setAccount(result.data);
          }
        }

        this.onPollingSuccess();
      } catch (err) {
        this.onPollingFailure();
      }
    }, this.pollingIntervalMs);
  }

  /**
   * Stop polling.
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Clean up all resources.
   */
  destroy(): void {
    this.stopPolling();
  }
}

// Singleton instance
export const syncManager = new RealTimeSyncManagerImpl();
