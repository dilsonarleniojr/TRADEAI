"use client";
import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useCryptoStore, type TickerData } from "@/lib/store";
import { syncManager } from "@/lib/realtime-sync";
import { useShallow } from "zustand/react/shallow";

let globalSocket: Socket | null = null;
let globalNativeWs: WebSocket | null = null;
let nativeWsReconnectTimer: any = null;
let activeHookCount = 0;

function getNeededSymbols(): string[] {
  const store = useCryptoStore.getState();
  const set = new Set<string>();
  if (store.selectedSymbol && store.selectedSymbol !== "AUTO") {
    set.add(store.selectedSymbol.toUpperCase());
  }
  store.bots.forEach((b) => {
    if (b.active) {
      if (b.overrideSymbol && b.overrideSymbol !== "AUTO") {
        set.add(b.overrideSymbol.toUpperCase());
      }
      if (b.symbol === "AUTO" || b.useAutoScreener) {
        if (b.position?.symbol) {
          set.add(b.position.symbol.toUpperCase());
        }
      } else if (b.symbol && b.symbol !== "AUTO") {
        set.add(b.symbol.toUpperCase());
      }
    }
  });
  // Sempre monitorar pares-chave da Binance para screener e benchmark
  set.add("BTCUSDT");
  set.add("ETHUSDT");
  set.add("SOLUSDT");
  return Array.from(set).filter((s) => s && s !== "AUTO" && s.endsWith("USDT"));
}

function syncSocketSubscriptions(socket: Socket) {
  if (!socket || !socket.connected) return;
  const symbols = getNeededSymbols();
  symbols.forEach((sym) => {
    socket.emit("subscribe", sym);
  });
}

function startNativeWsFallback() {
  if (typeof window === "undefined") return;
  if (globalNativeWs && (globalNativeWs.readyState === WebSocket.OPEN || globalNativeWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const symbols = getNeededSymbols();
  if (symbols.length === 0) return;

  const streams = symbols.map((s) => `${s.toLowerCase()}@ticker`).join("/");
  const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

  try {
    const ws = new WebSocket(url);
    globalNativeWs = ws;

    ws.onopen = () => {
      console.log(`[BinanceStream] Native WS Fallback conectado para: ${symbols.join(", ")}`);
      useCryptoStore.getState().setConnectionStatus("connected");
      useCryptoStore.getState().setSyncMode("realtime");
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const data = payload?.data;
        if (!data || !data.s) return;

        const sym = data.s.toUpperCase();
        useCryptoStore.getState().updateTicker(sym, {
          symbol: sym,
          price: parseFloat(data.c),
          priceChange: parseFloat(data.p),
          priceChangePercent: parseFloat(data.P),
          high: parseFloat(data.h),
          low: parseFloat(data.l),
          volume: parseFloat(data.v),
          quoteVolume: parseFloat(data.q),
        });

        const store = useCryptoStore.getState();
        store.updateBotPnls(store.tickers);
        store.updateBotPositionsRealtime(store.tickers);
      } catch {}
    };

    ws.onerror = (err) => {
      console.warn("[BinanceStream] Native WS error:", err);
    };

    ws.onclose = () => {
      globalNativeWs = null;
      // Reconnect native WS fallback se Socket.IO ainda não estiver conectado
      if (!globalSocket || !globalSocket.connected) {
        if (nativeWsReconnectTimer) clearTimeout(nativeWsReconnectTimer);
        nativeWsReconnectTimer = setTimeout(() => {
          if (!globalSocket || !globalSocket.connected) {
            startNativeWsFallback();
          }
        }, 3000);
      }
    };
  } catch (err: any) {
    console.warn("[BinanceStream] Falha ao iniciar Native WS fallback:", err.message);
  }
}

function stopNativeWsFallback() {
  if (nativeWsReconnectTimer) {
    clearTimeout(nativeWsReconnectTimer);
    nativeWsReconnectTimer = null;
  }
  if (globalNativeWs) {
    try {
      globalNativeWs.close();
    } catch {}
    globalNativeWs = null;
  }
}

export function useBinanceStream() {
  const { selectedSymbol, activeBotSymbolsKey } = useCryptoStore(
    useShallow((s) => ({
      selectedSymbol: s.selectedSymbol,
      activeBotSymbolsKey: s.bots
        .filter((b) => b.active)
        .map((b) => (b.position?.symbol || (b.overrideSymbol && b.overrideSymbol !== "AUTO" ? b.overrideSymbol : (b.symbol === "AUTO" || b.useAutoScreener ? "AUTO" : b.symbol))))
        .sort()
        .join(","),
    }))
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
        if (globalSocket.connected) {
          syncManager.onWSConnected();
          syncSocketSubscriptions(globalSocket);
        } else {
          startNativeWsFallback();
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
        syncSocketSubscriptions(socket);
        stopNativeWsFallback();
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
        const sym = data.symbol.toUpperCase();
        useCryptoStore.getState().updateTicker(sym, {
          symbol: sym,
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
        const exists = store.trades.some((t) => t.id === data.id);
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
        startNativeWsFallback();
      });

      socket.on("reconnect_attempt", (attempt) => {
        reconnectAttemptRef.current = attempt;
        if (attempt === 1 || attempt % 5 === 0) {
          console.log("[BinanceStream] Reconnect attempt:", attempt);
        }
        if (attempt === 1) {
          useCryptoStore.getState().setConnectionStatus("connecting");
        }
        startNativeWsFallback();
      });

      socket.on("reconnect_failed", () => {
        console.log("[BinanceStream] Reconnect failed — native WS fallback active");
        syncManager.onWSDisconnected();
        startNativeWsFallback();
      });

      socket.on("connect_error", (err) => {
        const attempt = reconnectAttemptRef.current;
        if (attempt <= 1 || attempt % 10 === 0) {
          console.warn("[BinanceStream] Connection issue (native fallback active):", err.message);
        }
        if (attempt >= 2 && !failedRef.current) {
          failedRef.current = true;
          syncManager.onWSDisconnected();
        }
        startNativeWsFallback();
      });
    }

    connectSocket();

    return () => {
      mounted = false;
      activeHookCount--;
      if (activeHookCount <= 0) {
        console.log("[BinanceStream] No active hooks left, cleaning up connections");
        const socket = globalSocket;
        if (socket) {
          socket.disconnect();
          globalSocket = null;
        }
        stopNativeWsFallback();
        setConnectionStatus("rest-api");
      }
    };
  }, []);

  // Sincroniza assinaturas sempre que mudar o símbolo selecionado ou os robôs ativos
  useEffect(() => {
    const socket = globalSocket;
    if (socket && socket.connected) {
      syncSocketSubscriptions(socket);
    } else {
      // Re-estabelece Native WS fallback com os novos símbolos necessários
      stopNativeWsFallback();
      startNativeWsFallback();
    }
  }, [selectedSymbol, activeBotSymbolsKey]);

  const getSocket = useCallback(() => globalSocket, []);

  return { getSocket };
}
