"use client";
import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useCryptoStore, type TickerData } from "@/lib/store";
import { syncManager } from "@/lib/realtime-sync";
import { useShallow } from "zustand/react/shallow";

let globalSocket: Socket | null = null;
let activeHookCount = 0;

export function useBinanceStream() {
  const { selectedSymbol } = useCryptoStore(
  useShallow((s) => ({ selectedSymbol: s.selectedSymbol }))
);
  const setConnectionStatus = useCryptoStore((s) => s.setConnectionStatus);
  const reconnectAttemptRef = useRef(0);
  const failedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    activeHookCount++;

    function connectSocket() {
      if (!mounted) return;

      if (globalSocket) {
        console.log("[BinanceStream] Reusing global socket instance. Active hooks:", activeHookCount);
        if (globalSocket.connected) {
          syncManager.onWSConnected();
          globalSocket.emit("subscribe", selectedSymbol);
        }
        return;
      }

      const isProxy = typeof window !== "undefined" && (window.location.port === "81" || window.location.search.includes("XTransformPort"));
      const socketUrl = isProxy ? "" : "http://localhost:3002";

      console.log("[BinanceStream] Creating new global socket connection to", socketUrl);
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

      globalSocket = socket;

      socket.on("connect", () => {
        console.log("[BinanceStream] Connected via", socket.io.engine?.transport?.name || "unknown");
        reconnectAttemptRef.current = 0;
        failedRef.current = false;
        syncManager.onWSConnected();
        socket.emit("subscribe", useCryptoStore.getState().selectedSymbol);
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
        useCryptoStore.getState().updateTicker(data.symbol.toUpperCase(), {
          symbol: data.symbol.toUpperCase(),
          price: parseFloat(data.price),
          priceChange: parseFloat(data.priceChange),
          priceChangePercent: parseFloat(data.priceChangePercent),
          high: parseFloat(data.high),
          low: parseFloat(data.low),
          volume: parseFloat(data.volume),
          quoteVolume: parseFloat(data.quoteVolume),
        });
        const store = useCryptoStore.getState();
        store.updateBotPnls(store.tickers);
        store.updateBotPositionsRealtime(store.tickers);
      });

      socket.on("balance-update", (data: any) => {
        console.log("[BinanceStream] Balance updated via Socket.IO:", data);
        useCryptoStore.getState().setAccount(data);
      });

      socket.on("trade-executed", (data: any) => {
        console.log("[BinanceStream] Trade received via Socket.IO:", data);
        const store = useCryptoStore.getState();
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
        console.log("[BinanceStream] Portfolio updated via Socket.IO:", data);
        useCryptoStore.getState().setAccount(data);
      });

      socket.on("subscribed", (data: { symbol: string }) => {
        console.log("[BinanceStream] Subscribed to", data.symbol);
      });

      socket.on("disconnect", (reason) => {
        console.log("[BinanceStream] Disconnected:", reason);
        syncManager.onWSDisconnected();
      });

      socket.on("reconnect_attempt", (attempt) => {
        reconnectAttemptRef.current = attempt;
        if (attempt === 1 || attempt % 5 === 0) {
          console.log("[BinanceStream] Reconnect attempt:", attempt);
        }
        if (attempt === 1) {
          useCryptoStore.getState().setConnectionStatus("connecting");
        }
      });

      socket.on("reconnect_failed", () => {
        console.log("[BinanceStream] Reconnect failed — polling fallback active");
        syncManager.onWSDisconnected();
      });

      socket.on("connect_error", (err) => {
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
      activeHookCount--;
      if (activeHookCount <= 0) {
        console.log("[BinanceStream] No active hooks left, disconnecting global socket");
        const socket = globalSocket;
        if (socket) {
          socket.emit("unsubscribe", useCryptoStore.getState().selectedSymbol);
          socket.disconnect();
          globalSocket = null;
        }
        setConnectionStatus("rest-api");
      } else {
        console.log(`[BinanceStream] Hook unmounted. ${activeHookCount} hooks still active. Keeping socket alive.`);
      }
    };
  }, []);

  useEffect(() => {
    const socket = globalSocket;
    if (!socket || !socket.connected) return;

    socket.emit("subscribe", selectedSymbol);
  }, [selectedSymbol]);

  const getSocket = useCallback(() => globalSocket, []);

  return { getSocket };
}
