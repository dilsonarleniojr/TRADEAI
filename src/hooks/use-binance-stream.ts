"use client";
import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useCryptoStore, type TickerData } from "@/lib/store";
import { syncManager } from "@/lib/realtime-sync";
import { useShallow } from "zustand/react/shallow";
import { feedWatchdog } from "@/lib/websocket/feed-watchdog";
import { reconnectionManager } from "@/lib/websocket/reconnection-manager";
import { flightRecorder } from "@/lib/telemetry/flight-recorder";
import { structuredLogger } from "@/lib/telemetry/structured-logger";
import { TickCoalescer } from "@/lib/performance/tick-coalescer";
import {
  BinanceWorkerManager,
  OrderBookFetchError,
} from "@/lib/performance/binance-worker-manager";
import { OffscreenChartController } from "@/lib/performance/offscreen-chart-controller";

let globalSocket: Socket | null = null;
let globalWorkerManager: BinanceWorkerManager | null = null;
let activeHookCount = 0;
let atomicDrainRafId: number | null = null;

// Desacoplamento de streaming: buffer de segundo plano (document.hidden) e despachante V-Sync de alta frequência (foreground)
const backgroundTickerBuffer = new Map<string, TickerData>();
let backgroundFlushTimer: any = null;
let isDocumentHidden = typeof document !== "undefined" ? document.hidden : false;

// TickCoalescer alinhado ao V-Sync da tela (requestAnimationFrame / 60-144 FPS)
// Elimina saturação de Event Loop e consolida rajadas de WebSocket em 1 único render por frame
const vSyncCoalescer = new TickCoalescer((batchMap) => {
  const batch: Record<string, TickerData> = {};
  for (const [sym, ticker] of batchMap.entries()) {
    batch[sym] = ticker as TickerData;
  }
  const store = useCryptoStore.getState();
  store.updateTickersBatch(batch);
  const updatedStore = useCryptoStore.getState();
  updatedStore.updateBotPnls(updatedStore.tickers);
  updatedStore.updateBotPositionsRealtime(updatedStore.tickers);
});

function flushBackgroundTickers() {
  if (backgroundFlushTimer) {
    clearTimeout(backgroundFlushTimer);
    backgroundFlushTimer = null;
  }
  if (backgroundTickerBuffer.size === 0) return;

  const batch: Record<string, TickerData> = {};
  for (const [sym, ticker] of backgroundTickerBuffer.entries()) {
    batch[sym] = ticker;
  }
  backgroundTickerBuffer.clear();

  const store = useCryptoStore.getState();
  store.updateTickersBatch(batch);
  const updatedStore = useCryptoStore.getState();
  updatedStore.updateBotPnls(updatedStore.tickers);
  updatedStore.updateBotPositionsRealtime(updatedStore.tickers);
}

function handleIncomingTicker(sym: string, ticker: TickerData) {
  // Registra chegada de tick no Stale Feed Watchdog
  feedWatchdog.recordTick(sym, Date.now());

  // Se a aba estiver em segundo plano, bufferiza e atualiza de forma controlada
  // Com posições abertas, drena a cada 1.000ms para garantir trailing stop e precisão de saída sem lag
  if (typeof document !== "undefined" && isDocumentHidden) {
    backgroundTickerBuffer.set(sym, ticker);
    if (!backgroundFlushTimer) {
      const hasOpenPos = useCryptoStore.getState().bots.some((b) => !!b.position && b.position.quantity > 0);
      const flushDelay = hasOpenPos ? 1000 : 2500;
      backgroundFlushTimer = setTimeout(flushBackgroundTickers, flushDelay);
    }
    return;
  }

  // Aba em primeiro plano: coalescência atômica alinhada ao V-Sync nativo da GPU
  vSyncCoalescer.enqueue(ticker);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    isDocumentHidden = document.hidden;
    if (!isDocumentHidden) {
      // Aba voltou a ficar em foco: descarrega imediatamente os tickers pendentes
      flushBackgroundTickers();
      vSyncCoalescer.flushNow();
    }
  });
}

function getNeededSymbols(): string[] {
  const store = useCryptoStore.getState();
  const set = new Set<string>();
  if (store.selectedSymbol && store.selectedSymbol !== "AUTO") {
    set.add(store.selectedSymbol.toUpperCase());
  }
  store.bots.forEach((b) => {
    // 1. Qualquer robô que possua posição aberta (mesmo se pausado ou em cooldown) DEVE ter seu preço transmitido em tempo real
    if (b.position?.symbol) {
      set.add(b.position.symbol.toUpperCase());
    }
    if (b.active) {
      if (b.overrideSymbol && b.overrideSymbol !== "AUTO") {
        set.add(b.overrideSymbol.toUpperCase());
      }
      if (b.symbol && b.symbol !== "AUTO") {
        set.add(b.symbol.toUpperCase());
      }
    }
  });

  // 2. Monitorar moedas sob custódia na carteira da Binance
  if (Array.isArray(store.portfolio?.positions)) {
    store.portfolio.positions.forEach((p) => {
      if (p?.symbol && p.quantity > 0) set.add(p.symbol.toUpperCase());
    });
  }

  // Sempre monitorar pares-chave da Binance para screener e benchmark
  set.add("BTCUSDT");
  set.add("ETHUSDT");
  set.add("SOLUSDT");
  set.add("BNBUSDT");
  set.add("XRPUSDT");
  return Array.from(set).filter((s) => s && s !== "AUTO" && s.endsWith("USDT"));
}

function syncSocketSubscriptions(socket: Socket) {
  if (!socket || !socket.connected) return;
  const symbols = getNeededSymbols();
  symbols.forEach((sym) => {
    socket.emit("subscribe", sym);
  });
}

/**
 * Loop contínuo de drenagem atômica alinhado a requestAnimationFrame (V-Sync).
 * Consome da LockFreeSPSCQueue / SharedMemoryAtomicQueue sem bloquear a Main Thread.
 */
function startAtomicQueueConsumer() {
  if (typeof window === "undefined") return;
  if (atomicDrainRafId !== null) return;

  function drainStep() {
    if (!globalWorkerManager) {
      atomicDrainRafId = null;
      return;
    }

    if (globalWorkerManager.isUsingSharedMemory()) {
      const drained = globalWorkerManager.drainQueue((t) => {
        handleIncomingTicker(t.symbol, t);
      }, 256);

      if (drained > 0) {
        const store = useCryptoStore.getState();
        if (store.connectionStatus !== "connected") {
          store.setConnectionStatus("connected");
          store.setSyncMode("realtime");
        }
      }
    }

    atomicDrainRafId = window.requestAnimationFrame(drainStep);
  }

  atomicDrainRafId = window.requestAnimationFrame(drainStep);
}

function stopAtomicQueueConsumer() {
  if (atomicDrainRafId !== null) {
    if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(atomicDrainRafId);
    }
    atomicDrainRafId = null;
  }
}

/**
 * Inicia a ingestão em tempo real delegando estritamente para o Web Worker dedicado.
 * Zero JSON.parse e zero decodificação de rede na Main Thread.
 */
function startWorkerStream() {
  if (typeof window === "undefined") return;

  const symbols = getNeededSymbols();
  if (symbols.length === 0) return;

  if (!globalWorkerManager) {
    globalWorkerManager = new BinanceWorkerManager(
      // Callback para Modo B (Transferable ArrayBuffer) e Modo C (Batch Fallback)
      (batchTickers) => {
        const store = useCryptoStore.getState();
        if (store.connectionStatus !== "connected") {
          store.setConnectionStatus("connected");
          store.setSyncMode("realtime");
        }
        batchTickers.forEach((t) => {
          handleIncomingTicker(t.symbol, t);
        });
      },
      // Callback para erros tipados (OrderBookFetchError / HTTP 429/418)
      (err: OrderBookFetchError) => {
        if (err.isRateLimit) {
          structuredLogger.log(
            "BINANCE_API",
            "WARN",
            `Rate limit de cotação detectado (HTTP ${err.statusCode}): ${err.message}`,
            {
              symbol: err.symbol,
              metadata: { statusCode: err.statusCode, isRateLimit: true },
            }
          );
          useCryptoStore.getState().setConnectionStatus("rate-limited" as any);
        } else {
          structuredLogger.log("MARKET_DATA", "WARN", `Erro na thread de worker Binance: ${err.message}`, {
            symbol: err.symbol,
          });
        }
      }
    );

    const started = globalWorkerManager.start();
    if (started) {
      console.log(
        `[BinanceStream] Web Worker conectado com isolamento de rede e buffer atômico para: ${symbols.join(", ")}`
      );
      globalWorkerManager.subscribe(symbols);
      startAtomicQueueConsumer();
      return;
    }
  }

  if (globalWorkerManager) {
    globalWorkerManager.subscribe(symbols);
    startAtomicQueueConsumer();
  }
}

function stopWorkerStream() {
  stopAtomicQueueConsumer();
  if (globalWorkerManager) {
    globalWorkerManager.destroy();
    globalWorkerManager = null;
  }
}

export function useBinanceStream() {
  const { selectedSymbol, activeBotSymbolsKey } = useCryptoStore(
    useShallow((s) => ({
      selectedSymbol: s.selectedSymbol,
      activeBotSymbolsKey: s.bots
        .map((b) =>
          (b.position && b.position.quantity > 0 ? b.position.symbol : undefined) ||
          (b.active
            ? (b.overrideSymbol && b.overrideSymbol !== "AUTO"
                ? b.overrideSymbol
                : b.symbol === "AUTO" || b.useAutoScreener
                ? "AUTO"
                : b.symbol)
            : undefined)
        )
        .filter(Boolean)
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
          startWorkerStream();
        }
        return;
      }

      const isProxy =
        typeof window !== "undefined" &&
        (window.location.port === "81" || window.location.search.includes("XTransformPort"));
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
        reconnectionManager.reset();
        reconnectionManager.syncClock().catch(() => {});
        feedWatchdog.start();
        syncManager.onWSConnected();
        syncSocketSubscriptions(socket);
      });

      socket.on(
        "ticker:update",
        (data: {
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
          handleIncomingTicker(sym, {
            symbol: sym,
            price: parseFloat(data.price),
            priceChange: parseFloat(data.priceChange),
            priceChangePercent: parseFloat(data.priceChangePercent),
            high: parseFloat(data.high),
            low: parseFloat(data.low),
            volume: parseFloat(data.volume),
            quoteVolume: parseFloat(data.quoteVolume),
          });
        }
      );

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
        startWorkerStream();
      });

      socket.on("reconnect_attempt", (attempt) => {
        reconnectAttemptRef.current = attempt;
        if (attempt === 1 || attempt % 5 === 0) {
          console.log("[BinanceStream] Reconnect attempt:", attempt);
        }
        if (attempt === 1) {
          useCryptoStore.getState().setConnectionStatus("connecting");
        }
        startWorkerStream();
      });

      socket.on("reconnect_failed", () => {
        console.log("[BinanceStream] Reconnect failed — Web Worker atomic stream active");
        syncManager.onWSDisconnected();
        startWorkerStream();
      });

      socket.on("connect_error", (err) => {
        const attempt = reconnectAttemptRef.current;
        if (attempt <= 1 || attempt % 10 === 0) {
          console.warn("[BinanceStream] Connection issue (worker stream active):", err.message);
        }
        if (attempt >= 2 && !failedRef.current) {
          failedRef.current = true;
          syncManager.onWSDisconnected();
        }
        startWorkerStream();
      });
    }

    connectSocket();
    // Inicia stream via Web Worker em paralelo
    startWorkerStream();

    return () => {
      mounted = false;
      activeHookCount--;
      if (activeHookCount <= 0) {
        console.log("[BinanceStream] No active hooks left, cleaning up connections & worker");
        const socket = globalSocket;
        if (socket) {
          socket.disconnect();
          globalSocket = null;
        }
        stopWorkerStream();
        setConnectionStatus("rest-api");
      }
    };
  }, [setConnectionStatus]);

  // Sincroniza assinaturas sempre que mudar o símbolo selecionado ou os robôs ativos
  useEffect(() => {
    const socket = globalSocket;
    if (socket && socket.connected) {
      syncSocketSubscriptions(socket);
    }
    // Re-sincroniza assinaturas no Web Worker com a tabela de símbolos atualizada
    if (globalWorkerManager) {
      const symbols = getNeededSymbols();
      globalWorkerManager.subscribe(symbols);
    }
  }, [selectedSymbol, activeBotSymbolsKey]);

  const getSocket = useCallback(() => globalSocket, []);

  return { getSocket };
}

export { vSyncCoalescer };

/**
 * Retorna a instância global ativa do BinanceWorkerManager (Worker de Ingestão de Microestrutura).
 */
export function getGlobalWorkerManager(): BinanceWorkerManager | null {
  return globalWorkerManager;
}

/**
 * Conecta diretamente um OffscreenChartController ao Ingestion Worker ativo via MessagePort Peer-to-Peer.
 */
export function connectChartToWorker(renderController: OffscreenChartController): MessageChannel | null {
  if (!globalWorkerManager) return null;
  return OffscreenChartController.connectWorkers(globalWorkerManager, renderController);
}

