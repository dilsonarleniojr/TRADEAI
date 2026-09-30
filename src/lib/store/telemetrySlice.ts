import type { StateCreator } from "zustand";
import type { ConnectionStatus, SyncMode } from "./types";

export interface TelemetrySlice {
  // Socket.IO connection status
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;

  // Sync mode (derived from connection behavior)
  syncMode: SyncMode;
  setSyncMode: (mode: SyncMode) => void;

  // Last successful sync timestamp
  lastSyncAt: number;
  setLastSyncAt: (ts: number) => void;

  // Polling failure count (for offline detection)
  pollingFailures: number;
  incrementPollingFailures: () => void;
  resetPollingFailures: () => void;

  // Loading states
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const createTelemetrySlice: StateCreator<TelemetrySlice, [], [], TelemetrySlice> = (set) => ({
  // Connection status
  connectionStatus: "rest-api" as ConnectionStatus,
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // Sync mode
  syncMode: "polling" as SyncMode,
  setSyncMode: (mode) => set({ syncMode: mode }),

  // Last sync
  lastSyncAt: 0,
  setLastSyncAt: (ts) => set({ lastSyncAt: ts }),

  // Polling failures
  pollingFailures: 0,
  incrementPollingFailures: () =>
    set((state) => {
      const newCount = state.pollingFailures + 1;
      return {
        pollingFailures: newCount,
        // Auto-transition to offline after 3 consecutive failures
        syncMode: newCount >= 3 ? "offline" : state.syncMode,
      };
    }),
  resetPollingFailures: () => set({ pollingFailures: 0, syncMode: "polling" }),

  // Loading
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
});
