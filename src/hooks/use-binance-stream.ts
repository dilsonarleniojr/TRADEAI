"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useCryptoStore, type TickerData } from "@/lib/store";
import { syncManager } from "@/lib/realtime-sync";

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

      const isProxy = typeof window !== "undefined" && (window.location.port === "81" || window.location.search.includes("XTransformPort"));
      const socketUrl = isProxy ? "" : "http://localhost:3002";

      const socket = io(socketUrl, {
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

      socket.on("connect", () => {
        if (!mounted) return;
        console.log("[BinanceStream] Connected via", socket.io.engine?.transport?.name || "unknown");
        reconnectAttemptRef.current = 0;
        failedRef.current = false;
        syncManager.onWSConnected();
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

      socket.on("balance-update", (data: any) => {
        if (!mounted) return;
        console.log("[BinanceStream] Balance updated via Socket.IO:", data);
        useCryptoStore.getState().setAccount(data);
      });

      socket.on("trade-executed", (data: any) => {
        if (!mounted) return;
        console.log("[BinanceStream] Trade received via Socket.IO:", data);
        const store = useCryptoStore.getState();
        // Deduplicate by id
        const exists = store.trades.some(t => t.id === data.id);
        if (!exists) {
          store.addTrade({
            id: data.id,
            symbol: data.symbol,
            side: data.side,
            price: data.price,
            quantity: data.quantity,
            total: data.total,
            strategy: data.strategy || "Manual",
            mode: data.mode || "paper",
            pnl: data.pnl || 0,
            timestamp: data.timestamp || new Date().toISOString(),
          });
        }
      });

      socket.on("portfolio-update", (data: any) => {
        if (!mounted) return;
        console.log("[BinanceStream] Portfolio updated via Socket.IO:", data);
        useCryptoStore.getState().setAccount(data);
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
        syncManager.onWSDisconnected();
      });

      socket.on("reconnect_attempt", (attempt) => {
        if (!mounted) return;
        reconnectAttemptRef.current = attempt;
        if (attempt === 1 || attempt % 5 === 0) {
          console.log("[BinanceStream] Reconnect attempt:", attempt);
        }
        if (attempt === 1) {
          setConnectionStatus("connecting");
        }
      });

      socket.on("reconnect_failed", () => {
        if (!mounted) return;
        console.log("[BinanceStream] Reconnect failed — polling fallback active");
        syncManager.onWSDisconnected();
      });

      socket.on("connect_error", (err) => {
        if (!mounted) return;
        const attempt = reconnectAttemptRef.current;
        if (attempt <= 1 || attempt % 10 === 0) {
          console.warn("[BinanceStream] Connection issue (fallback active):", err.message);
        }
        if (attempt >= 2 && !failedRef.current) {
          failedRef.current = true;
          syncManager.onWSDisconnected();
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
