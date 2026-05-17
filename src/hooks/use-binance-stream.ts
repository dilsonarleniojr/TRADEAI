"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useCryptoStore, type TickerData } from "@/lib/store";

type ConnectionStatus = "connected" | "disconnected" | "connecting" | "rest-api";

export function useBinanceStream() {
  const socketRef = useRef<Socket | null>(null);
  const { selectedSymbol, updateTicker } = useCryptoStore();
  const setConnectionStatus = useCryptoStore((s) => s.setConnectionStatus);
  const reconnectAttemptRef = useRef(0);
  const failedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    function connectSocket() {
      if (!mounted) return;

      const socket = io({
        transports: ["polling", "websocket"],
        upgrade: true,
        reconnection: true,
        reconnectionAttempts: 30,
        reconnectionDelay: 3000,
        reconnectionDelayMax: 30000,
        timeout: 25000,
        query: { XTransformPort: "3002" },
        path: "/socket.io",
        withCredentials: false,
      });

      socketRef.current = socket;

      // Don't override the default "rest-api" status - we start with REST API active
      // and only change to "connecting" if we're actively trying WebSocket upgrade
      // The REST API data is already flowing from useBinanceData()

      socket.on("connect", () => {
        if (!mounted) return;
        console.log("[BinanceStream] Connected via", socket.io.engine?.transport?.name || "unknown");
        reconnectAttemptRef.current = 0;
        setConnectionStatus("connected");
        socket.emit("subscribe", selectedSymbol);
      });

      socket.on("ticker:update", (data: {
        symbol: string;
        price: string;
        open: string;
        high: string;
        low: string;
        volume: string;
        quoteVolume: string;
        priceChange: string;
        priceChangePercent: string;
        timestamp: number;
      }) => {
        if (!mounted) return;
        updateTicker(data.symbol.toUpperCase(), {
          symbol: data.symbol.toUpperCase(),
          price: parseFloat(data.price),
          priceChange: parseFloat(data.priceChange),
          priceChangePercent: parseFloat(data.priceChangePercent),
          high: parseFloat(data.high),
          low: parseFloat(data.low),
          volume: parseFloat(data.volume),
          quoteVolume: parseFloat(data.quoteVolume),
        });
      });

      socket.on("subscribed", (data: { symbol: string }) => {
        if (!mounted) return;
        console.log("[BinanceStream] Subscribed to", data.symbol);
      });

      socket.on("unsubscribed", (data: { symbol: string }) => {
        if (!mounted) return;
        console.log("[BinanceStream] Unsubscribed from", data.symbol);
      });

      socket.on("disconnect", (reason) => {
        if (!mounted) return;
        console.log("[BinanceStream] Disconnected:", reason);
        setConnectionStatus("disconnected");
      });

      socket.on("reconnect_attempt", (attempt) => {
        if (!mounted) return;
        reconnectAttemptRef.current = attempt;
        // Only log every 5th attempt to reduce noise
        if (attempt === 1 || attempt % 5 === 0) {
          console.log("[BinanceStream] Reconnect attempt:", attempt);
        }
        // Keep rest-api status rather than showing confusing "connecting"
        // Only show connecting on first attempt
        if (attempt === 1) {
          setConnectionStatus("connecting");
        }
      });

      socket.on("reconnect_failed", () => {
        if (!mounted) return;
        console.log("[BinanceStream] Reconnect failed - REST API will continue providing data");
        setConnectionStatus("rest-api");
      });

      socket.on("connect_error", (err) => {
        if (!mounted) return;
        // Reduce log noise - only log first error and then every 10th
        const attempt = reconnectAttemptRef.current;
        if (attempt <= 1 || attempt % 10 === 0) {
          console.warn("[BinanceStream] Connection issue (REST API fallback active):", err.message);
        }
        // After 2 failed attempts, transition to rest-api mode
        if (attempt >= 2 && !failedRef.current) {
          failedRef.current = true;
          setConnectionStatus("rest-api");
        }
      });
    }

    connectSocket();

    return () => {
      mounted = false;
      const socket = socketRef.current;
      if (socket) {
        socket.emit("unsubscribe", selectedSymbol);
        socket.disconnect();
        socketRef.current = null;
      }
      // Don't set disconnected - REST API is still active
      setConnectionStatus("rest-api");
    };
  }, []); // Connect once on mount

  // When selectedSymbol changes, subscribe/unsubscribe
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;

    socket.emit("subscribe", selectedSymbol);

    return () => {
      socket.emit("unsubscribe", selectedSymbol);
    };
  }, [selectedSymbol]);

  const getSocket = useCallback(() => socketRef.current, []);

  return { getSocket };
}
