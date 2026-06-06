"use client";

import { useCryptoStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface DataSourceBadgeProps {
  className?: string;
  showLabel?: boolean;
}

/**
 * Displays a badge indicating if data is real (Binance) or simulated.
 * Reads from the store's tradingMode.
 */
export function DataSourceBadge({ className, showLabel = true }: DataSourceBadgeProps) {
  const tradingMode = useCryptoStore((s) => s.tradingMode);
  const connectionStatus = useCryptoStore((s) => s.connectionStatus);

  const isReal = tradingMode === "live";
  const isConnected = connectionStatus === "connected" || connectionStatus === "rest-api";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border transition-colors",
        isReal
          ? "bg-crypto-green/10 text-crypto-green border-crypto-green/20"
          : "bg-crypto-cyan/10 text-crypto-cyan border-crypto-cyan/20",
        className
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          isReal ? "bg-crypto-green" : "bg-crypto-cyan",
          isConnected && "animate-pulse"
        )}
      />
      {showLabel && (
        <span>{isReal ? "Dados Reais" : "Simulação Ativa"}</span>
      )}
    </span>
  );
}

/**
 * Connection quality badge showing sync mode.
 */
export function SyncModeBadge({ className }: { className?: string }) {
  const syncMode = useCryptoStore((s) => s.syncMode);
  const connectionStatus = useCryptoStore((s) => s.connectionStatus);

  const config = {
    realtime: {
      label: "Socket.IO",
      color: "bg-crypto-green/10 text-crypto-green border-crypto-green/20",
      dot: "bg-crypto-green",
      icon: "🟢",
    },
    polling: {
      label: "REST API",
      color: "bg-crypto-cyan/10 text-crypto-cyan border-crypto-cyan/20",
      dot: "bg-crypto-cyan",
      icon: "🔵",
    },
    offline: {
      label: "Offline",
      color: "bg-crypto-red/10 text-crypto-red border-crypto-red/20",
      dot: "bg-crypto-red",
      icon: "🔴",
    },
  };

  const mode = connectionStatus === "connected" ? "realtime" : 
               connectionStatus === "disconnected" ? "offline" : 
               (syncMode as keyof typeof config);
  const c = config[mode] || config.polling;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border",
        c.color,
        className
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", c.dot, mode !== "offline" && "animate-pulse")} />
      <span>{c.label}</span>
    </span>
  );
}
