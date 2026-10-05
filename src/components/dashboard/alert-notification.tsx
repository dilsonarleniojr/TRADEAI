"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useCryptoStore, type PriceAlert } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { X, ArrowUp, ArrowDown, BellRing } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";

// Play a short notification beep using Web Audio API
function playAlertSound() {
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = "sine";
    gainNode.gain.value = 0.15;

    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch {
    // Web Audio API not available, silently skip
  }
}

interface AlertNotificationProps {
  alert: PriceAlert | null;
  onDismiss: () => void;
}

function AlertNotificationCard({ alert, onDismiss }: AlertNotificationProps) {
  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [alert, onDismiss]);

  if (!alert) return null;

  const isAbove = alert.direction === "above";
  const priceDiff = Math.abs(alert.currentPrice - (alert.targetPrice ?? 0));

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn(
        "relative w-80 rounded-xl border p-4 shadow-2xl backdrop-blur-xl",
        "bg-card/95 border-crypto-gold/40",
        "glow-gold"
      )}
      style={{
        animation: "glow-breathe 2s ease-in-out infinite",
        boxShadow: "0 0 20px oklch(0.75 0.17 75 / 15%), 0 0 40px oklch(0.75 0.17 75 / 5%)",
      }}
    >
      {/* Glowing border animation */}
      <div
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{
          border: "1px solid transparent",
          backgroundClip: "padding-box",
          backgroundImage:
            "linear-gradient(var(--card), var(--card)), linear-gradient(135deg, #f59e0b, #06b6d4, #f59e0b)",
          backgroundOrigin: "border-box",
          WebkitMask: "linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          animation: "gradient-shift 3s ease infinite",
          backgroundSize: "200% 200%",
        }}
      />

      {/* Close button */}
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Content */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-crypto-gold/20 shrink-0">
          <BellRing className="w-5 h-5 text-crypto-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold">{alert.symbol.replace("USDT", "")}</span>
            <span className="text-[10px] text-crypto-gold font-semibold bg-crypto-gold/10 px-1.5 py-0.5 rounded">
              ALERT TRIGGERED
            </span>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <div
              className={cn(
                "flex items-center gap-1 text-xs font-medium",
                isAbove ? "text-crypto-green" : "text-crypto-red"
              )}
            >
              {isAbove ? (
                <ArrowUp className="w-3.5 h-3.5" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5" />
              )}
              {isAbove ? "Above" : "Below"}
            </div>
            <span className="text-xs text-muted-foreground">
              ${formatPrice(alert.targetPrice ?? 0)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] text-muted-foreground block">Preço Atual</span>
              <span className="text-base font-bold font-mono">
                ${formatPrice(alert.currentPrice)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground block">Difference</span>
              <span
                className={cn(
                  "text-sm font-semibold",
                  isAbove ? "text-crypto-green" : "text-crypto-red"
                )}
              >
                {isAbove ? "+" : "-"}${formatPrice(priceDiff)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Auto-dismiss progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-crypto-gold/10 rounded-b-xl overflow-hidden">
        <motion.div
          className="h-full bg-crypto-gold/60"
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: 8, ease: "linear" }}
        />
      </div>
    </motion.div>
  );
}

export function AlertNotification() {
  const { alerts } = useCryptoStore(
  useShallow((s) => ({ alerts: s.alerts }))
);
  const [currentNotification, setCurrentNotification] = useState<PriceAlert | null>(null);
  const previouslyTriggeredIdsRef = useRef<Set<string>>(new Set());
  const pendingAlertsRef = useRef<PriceAlert[]>([]);
  const [, forceUpdate] = useState(0);

  // Detect newly triggered alerts and queue them
  useEffect(() => {
    const newlyTriggered = alerts.filter(
      (alert) => alert.isTriggered && !previouslyTriggeredIdsRef.current.has(alert.id)
    );

    if (newlyTriggered.length > 0) {
      newlyTriggered.forEach(async (a) => {
        previouslyTriggeredIdsRef.current.add(a.id);
        // Emit telemetry event
        const { telemetry } = await import('@/lib/telemetry');
        telemetry.emit('alert', {
          alertId: a.id,
          symbol: a.symbol,
          targetPrice: a.targetPrice,
          direction: a.direction,
          currentPrice: a.currentPrice,
          isTriggered: true,
          createdAt: a.createdAt,
        });
      });
      pendingAlertsRef.current = [...pendingAlertsRef.current, ...newlyTriggered];
      playAlertSound();

      // If no current notification, show the first one
      if (!currentNotification && pendingAlertsRef.current.length > 0) {
        const next = pendingAlertsRef.current[0];
        pendingAlertsRef.current = pendingAlertsRef.current.slice(1);
        setCurrentNotification(next);
      }
    }
  }, [alerts, currentNotification]);

  const dismissNotification = useCallback(() => {
    setCurrentNotification(null);

    // Show next queued notification after a brief delay
    setTimeout(() => {
      if (pendingAlertsRef.current.length > 0) {
        const next = pendingAlertsRef.current[0];
        pendingAlertsRef.current = pendingAlertsRef.current.slice(1);
        setCurrentNotification(next);
      }
    }, 300);
  }, []);

  return (
    <div className="fixed top-4 right-4 z-[200] pointer-events-none">
      <AnimatePresence>
        {currentNotification && (
          <div className="pointer-events-auto">
            <AlertNotificationCard
              alert={currentNotification}
              onDismiss={dismissNotification}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
