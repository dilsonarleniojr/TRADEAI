"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useCryptoStore, type TickerData } from "@/lib/store";

type ConnectionStatus = "connected" | "disconnected" | "connecting";

export function useBinanceStream() {
  const socketRef = useRef<Socket | null>(null);
  const { selectedSymbol, updateTicker } = useCryptoStore();
  const setConnectionStatus = useCryptoStore((s) => s.setConnectionStatus);

  useEffect(() => {
    // Connect to the Binance Socket.IO service through Caddy gateway
    // The XTransformPort query parameter tells Caddy to forward to port 3002
    const socket = io({
      transports: ["polling", "websocket"],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      timeout: 20000,
      // Force the connection URL to include the port transform for Caddy
      query: { XTransformPort: "3002" },
      // Important: Socket.IO path must match server config
      path: "/socket.io",
    });

    socketRef.current = socket;

    setConnectionStatus("connecting");

    socket.on("connect", () => {
      console.log("[BinanceStream] Connected, subscribing to", selectedSymbol);
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
      console.log("[BinanceStream] Subscribed to", data.symbol);
    });

    socket.on("unsubscribed", (data: { symbol: string }) => {
      console.log("[BinanceStream] Unsubscribed from", data.symbol);
    });

    socket.on("disconnect", (reason) => {
      console.log("[BinanceStream] Disconnected:", reason);
      setConnectionStatus("disconnected");
    });

    socket.on("reconnect_attempt", (attempt) => {
      console.log("[BinanceStream] Reconnect attempt:", attempt);
      setConnectionStatus("connecting");
    });

    socket.on("reconnect_failed", () => {
      console.log("[BinanceStream] Reconnect failed");
      setConnectionStatus("disconnected");
    });

    socket.on("connect_error", (err) => {
      console.error("[BinanceStream] Connection error:", err.message);
    });

    return () => {
      socket.emit("unsubscribe", selectedSymbol);
      socket.disconnect();
      socketRef.current = null;
      setConnectionStatus("disconnected");
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
