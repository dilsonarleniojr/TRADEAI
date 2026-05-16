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
    // Connect to the Binance Socket.IO service
    const socket = io("/?XTransformPort=3002", {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 3000,
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

    socket.on("disconnect", () => {
      console.log("[BinanceStream] Disconnected");
      setConnectionStatus("disconnected");
    });

    socket.on("reconnect_attempt", () => {
      setConnectionStatus("connecting");
    });

    socket.on("reconnect_failed", () => {
      setConnectionStatus("disconnected");
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
