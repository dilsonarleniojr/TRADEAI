import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";

// ============================================================
// Configuration
// ============================================================
const PORT = 3001;
const SOCKET_PORT = 3002;
const BINANCE_REST_BASE = "https://api.binance.com/api/v3";
const BINANCE_WS_BASE = "wss://stream.binance.com:9443/ws";

const TOP_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT",
  "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT",
  "DOTUSDT", "MATICUSDT", "LINKUSDT", "ATOMUSDT",
];

// ============================================================
// Types
// ============================================================
interface BinanceMiniTicker {
  e: string; E: number; s: string;
  c: string; o: string; h: string; l: string;
  v: string; q: string; P: string; p: string;
}

// ============================================================
// CORS
// ============================================================
function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// ============================================================
// Binance Stream Manager (Socket.IO forwarding)
// ============================================================
class BinanceStreamManager {
  private connections: Map<string, WebSocket> = new Map();
  private subscribers: Map<string, Set<string>> = new Map();
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private io: SocketIOServer | null = null;

  get connectionCount() { return this.connections.size; }
  setIO(io: SocketIOServer) { this.io = io; }

  subscribe(socketId: string, symbol: string) {
    const s = symbol.toUpperCase();
    if (!this.subscribers.has(s)) this.subscribers.set(s, new Set());
    this.subscribers.get(s)!.add(socketId);
    if (!this.connections.has(s)) this.createBinanceConnection(s);
  }

  unsubscribe(socketId: string, symbol: string) {
    const s = symbol.toUpperCase();
    const subs = this.subscribers.get(s);
    if (subs) {
      subs.delete(socketId);
      if (subs.size === 0) { this.closeBinanceConnection(s); this.subscribers.delete(s); }
    }
  }

  unsubscribeAll(socketId: string) {
    for (const [symbol, subs] of this.subscribers.entries()) {
      subs.delete(socketId);
      if (subs.size === 0) { this.closeBinanceConnection(symbol); this.subscribers.delete(symbol); }
    }
  }

  private createBinanceConnection(symbol: string) {
    const wsUrl = `${BINANCE_WS_BASE}/${symbol.toLowerCase()}@ticker`;
    console.log(`[BinanceWS] Connecting to ${wsUrl}`);
    try {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        console.log(`[BinanceWS] Connected for ${symbol}`);
        const timer = this.reconnectTimers.get(symbol);
        if (timer) { clearTimeout(timer); this.reconnectTimers.delete(symbol); }
      };
      ws.onmessage = (event) => {
        try {
          const data: BinanceMiniTicker = JSON.parse(event.data as string);
          if (this.io && data.s) {
            this.io.to(`market:${symbol}`).emit("ticker:update", {
              symbol: data.s, price: data.c, open: data.o,
              high: data.h, low: data.l, volume: data.v,
              quoteVolume: data.q, priceChange: data.p,
              priceChangePercent: data.P, timestamp: data.E,
            });
          }
        } catch {}
      };
      ws.onerror = () => { console.error(`[BinanceWS] Error for ${symbol}`); };
      ws.onclose = () => {
        console.log(`[BinanceWS] Disconnected for ${symbol}`);
        this.connections.delete(symbol);
        if (this.subscribers.get(symbol)?.size) {
          const timer = setTimeout(() => {
            this.reconnectTimers.delete(symbol);
            if (this.subscribers.get(symbol)?.size) this.createBinanceConnection(symbol);
          }, 3000);
          this.reconnectTimers.set(symbol, timer);
        }
      };
      this.connections.set(symbol, ws);
    } catch {
      const timer = setTimeout(() => {
        this.reconnectTimers.delete(symbol);
        if (this.subscribers.get(symbol)?.size) this.createBinanceConnection(symbol);
      }, 5000);
      this.reconnectTimers.set(symbol, timer);
    }
  }

  private closeBinanceConnection(symbol: string) {
    const ws = this.connections.get(symbol);
    if (ws) { ws.close(); this.connections.delete(symbol); }
    const timer = this.reconnectTimers.get(symbol);
    if (timer) { clearTimeout(timer); this.reconnectTimers.delete(symbol); }
  }
}

const streamManager = new BinanceStreamManager();

// ============================================================
// Cache for ticker data (refreshed periodically)
// ============================================================
let tickerCache: any[] = [];
let tickerCacheTime = 0;
const TICKER_CACHE_TTL = 30000; // 30 seconds

async function fetchAllTickers(): Promise<any[]> {
  const now = Date.now();
  if (tickerCache.length > 0 && now - tickerCacheTime < TICKER_CACHE_TTL) {
    return tickerCache;
  }

  try {
    // Fetch individual tickers in parallel to avoid URL length issues
    const promises = TOP_SYMBOLS.map(async (symbol) => {
      try {
        const resp = await fetch(`${BINANCE_REST_BASE}/ticker/24hr?symbol=${symbol}`);
        if (resp.ok) return await resp.json();
        return null;
      } catch { return null; }
    });

    const results = await Promise.all(promises);
    tickerCache = results.filter(Boolean);
    tickerCacheTime = now;
    return tickerCache;
  } catch (err) {
    console.error("[Cache] Ticker fetch error:", err);
    return tickerCache; // Return stale cache if available
  }
}

// Start periodic refresh
setInterval(async () => {
  try {
    const results = await Promise.all(
      TOP_SYMBOLS.map(async (symbol) => {
        try {
          const resp = await fetch(`${BINANCE_REST_BASE}/ticker/24hr?symbol=${symbol}`);
          if (resp.ok) return await resp.json();
          return null;
        } catch { return null; }
      })
    );
    tickerCache = results.filter(Boolean);
    tickerCacheTime = Date.now();
  } catch {}
}, 30000);

// ============================================================
// Bun.serve for REST API
// ============================================================

console.log(`[BinanceService] Starting on port ${PORT}...`);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      switch (path) {
        case "/api/market/ticker": {
          const data = await fetchAllTickers();
          return new Response(JSON.stringify({ data, timestamp: Date.now() }), {
            headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
        }

        case "/api/market/klines": {
          const symbol = url.searchParams.get("symbol") || "BTCUSDT";
          const interval = url.searchParams.get("interval") || "1h";
          const limit = url.searchParams.get("limit") || "100";
          const bUrl = `${BINANCE_REST_BASE}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
          const resp = await fetch(bUrl);
          if (!resp.ok) {
            return new Response(JSON.stringify({ error: "Failed to fetch klines" }), {
              status: resp.status, headers: { "Content-Type": "application/json", ...corsHeaders() },
            });
          }
          const raw: any[] = await resp.json();
          const data = raw.map((k) => ({
            openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4],
            volume: k[5], closeTime: k[6], quoteVolume: k[7], trades: k[8],
          }));
          return new Response(JSON.stringify({ symbol: symbol.toUpperCase(), interval, data, timestamp: Date.now() }), {
            headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
        }

        case "/api/market/price": {
          const symbol = url.searchParams.get("symbol") || "BTCUSDT";
          const bUrl = `${BINANCE_REST_BASE}/ticker/price?symbol=${symbol.toUpperCase()}`;
          const resp = await fetch(bUrl);
          if (!resp.ok) {
            return new Response(JSON.stringify({ error: "Failed to fetch price" }), {
              status: resp.status, headers: { "Content-Type": "application/json", ...corsHeaders() },
            });
          }
          const data = await resp.json();
          return new Response(JSON.stringify({ data, timestamp: Date.now() }), {
            headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
        }

        case "/api/market/highlights": {
          const tickers = await fetchAllTickers();
          const sorted = [...tickers].sort(
            (a: any, b: any) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent)
          );
          const topGainers = sorted.slice(0, 5);
          const topLosers = sorted.slice(-5).reverse();
          const byVolume = [...tickers].sort(
            (a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)
          );
          const mostActive = byVolume.slice(0, 5);
          return new Response(JSON.stringify({
            data: { topGainers, topLosers, mostActive }, timestamp: Date.now()
          }), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
        }

        case "/health":
          return new Response(JSON.stringify({
            status: "ok", service: "binance-service", port: PORT,
            uptime: process.uptime(), activeStreams: streamManager.connectionCount,
            timestamp: Date.now(),
          }), { headers: { "Content-Type": "application/json", ...corsHeaders() } });

        default:
          return new Response(JSON.stringify({ error: "Not found", path }), {
            status: 404, headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
      }
    } catch (err: any) {
      console.error("[API] Error:", err);
      return new Response(JSON.stringify({ error: "Internal server error", details: err.message }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }
  },
});

console.log(`[BinanceService] REST API running on http://localhost:${PORT}`);

// ============================================================
// Socket.IO on separate port
// ============================================================
const socketServer = createServer();
const io = new SocketIOServer(socketServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
  path: "/socket.io",
});
streamManager.setIO(io);

io.on("connection", (socket) => {
  console.log(`[SocketIO] Client connected: ${socket.id}`);
  socket.on("subscribe", (symbol: string) => {
    const s = symbol.toUpperCase();
    socket.join(`market:${s}`);
    streamManager.subscribe(socket.id, s);
    socket.emit("subscribed", { symbol: s });
  });
  socket.on("unsubscribe", (symbol: string) => {
    const s = symbol.toUpperCase();
    socket.leave(`market:${s}`);
    streamManager.unsubscribe(socket.id, s);
    socket.emit("unsubscribed", { symbol: s });
  });
  socket.on("disconnect", () => { streamManager.unsubscribeAll(socket.id); });
});

socketServer.listen(SOCKET_PORT, () => {
  console.log(`[BinanceService] Socket.IO running on port ${SOCKET_PORT}`);
});

process.on("uncaughtException", (err) => console.error("[FATAL]", err));
process.on("unhandledRejection", (r) => console.error("[FATAL]", r));

console.log(`[BinanceService] Endpoints:`);
console.log(`  GET /api/market/ticker`);
console.log(`  GET /api/market/klines?symbol=BTCUSDT&interval=1h&limit=100`);
console.log(`  GET /api/market/price?symbol=BTCUSDT`);
console.log(`  GET /api/market/highlights`);
console.log(`  GET /health`);
