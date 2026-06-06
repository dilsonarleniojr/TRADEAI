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
  // === Layer 1 ===
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "AVAXUSDT", "ADAUSDT",
  "DOTUSDT", "ATOMUSDT", "NEARUSDT", "ALGOUSDT", "SUIUSDT", "APTUSDT",
  "SEIUSDT", "TIAUSDT", "INJUSDT",

  // === Layer 2 ===
  "MATICUSDT", "ARBUSDT", "OPUSDT", "MANTAUSDT", "STRKUSDT",

  // === DeFi ===
  "LINKUSDT", "UNIUSDT", "AAVEUSDT", "MKRUSDT", "COMPUSDT",
  "CRVUSDT", "SNXUSDT", "LDOUSDT", "DYDXUSDT", "PENDLEUSDT",

  // === Meme ===
  "DOGEUSDT", "SHIBUSDT", "PEPEUSDT", "FLOKIUSDT", "BONKUSDT", "WIFUSDT",

  // === AI ===
  "FETUSDT", "RENDERUSDT", "AKTUSDT", "TAOUSDT",

  // === Gaming ===
  "IMXUSDT", "GALAUSDT", "RONINUSDT", "AXSUSDT",

  // === Storage/Infrastructure ===
  "FILUSDT", "ARUSDT", "ETHFIUSDT",

  // === Stablecoin/Exchange ===
  "XRPUSDT", "LTCUSDT", "TRXUSDT", "XLMUSDT",
];

// ============================================================
// Symbol Categories
// ============================================================
const SYMBOL_CATEGORIES: Record<string, string> = {
  // Layer 1
  BTCUSDT: "Layer 1", ETHUSDT: "Layer 1", SOLUSDT: "Layer 1", BNBUSDT: "Layer 1",
  AVAXUSDT: "Layer 1", ADAUSDT: "Layer 1", DOTUSDT: "Layer 1", ATOMUSDT: "Layer 1",
  NEARUSDT: "Layer 1", ALGOUSDT: "Layer 1", SUIUSDT: "Layer 1", APTUSDT: "Layer 1",
  SEIUSDT: "Layer 1", TIAUSDT: "Layer 1", INJUSDT: "Layer 1",
  // Layer 2
  MATICUSDT: "Layer 2", ARBUSDT: "Layer 2", OPUSDT: "Layer 2",
  MANTAUSDT: "Layer 2", STRKUSDT: "Layer 2",
  // DeFi
  LINKUSDT: "DeFi", UNIUSDT: "DeFi", AAVEUSDT: "DeFi", MKRUSDT: "DeFi",
  COMPUSDT: "DeFi", CRVUSDT: "DeFi", SNXUSDT: "DeFi", LDOUSDT: "DeFi",
  DYDXUSDT: "DeFi", PENDLEUSDT: "DeFi",
  // Meme
  DOGEUSDT: "Meme", SHIBUSDT: "Meme", PEPEUSDT: "Meme", FLOKIUSDT: "Meme",
  BONKUSDT: "Meme", WIFUSDT: "Meme",
  // AI
  FETUSDT: "AI", RENDERUSDT: "AI", AKTUSDT: "AI", TAOUSDT: "AI",
  // Gaming
  IMXUSDT: "Gaming", GALAUSDT: "Gaming", RONINUSDT: "Gaming", AXSUSDT: "Gaming",
  // Storage/Infrastructure
  FILUSDT: "Storage/Infrastructure", ARUSDT: "Storage/Infrastructure", ETHFIUSDT: "Storage/Infrastructure",
  // Stablecoin/Exchange
  XRPUSDT: "Stablecoin/Exchange", LTCUSDT: "Stablecoin/Exchange",
  TRXUSDT: "Stablecoin/Exchange", XLMUSDT: "Stablecoin/Exchange",
};

// ============================================================
// Symbol Names
// ============================================================
const SYMBOL_NAMES: Record<string, string> = {
  // Layer 1
  BTCUSDT: "Bitcoin", ETHUSDT: "Ethereum", SOLUSDT: "Solana", BNBUSDT: "BNB",
  AVAXUSDT: "Avalanche", ADAUSDT: "Cardano", DOTUSDT: "Polkadot", ATOMUSDT: "Cosmos",
  NEARUSDT: "NEAR Protocol", ALGOUSDT: "Algorand", SUIUSDT: "Sui", APTUSDT: "Aptos",
  SEIUSDT: "Sei", TIAUSDT: "Celestia", INJUSDT: "Injective",
  // Layer 2
  MATICUSDT: "Polygon", ARBUSDT: "Arbitrum", OPUSDT: "Optimism",
  MANTAUSDT: "Manta Network", STRKUSDT: "Starknet",
  // DeFi
  LINKUSDT: "Chainlink", UNIUSDT: "Uniswap", AAVEUSDT: "Aave", MKRUSDT: "Maker",
  COMPUSDT: "Compound", CRVUSDT: "Curve", SNXUSDT: "Synthetix", LDOUSDT: "Lido DAO",
  DYDXUSDT: "dYdX", PENDLEUSDT: "Pendle",
  // Meme
  DOGEUSDT: "Dogecoin", SHIBUSDT: "Shiba Inu", PEPEUSDT: "Pepe",
  FLOKIUSDT: "Floki", BONKUSDT: "Bonk", WIFUSDT: "dogwifhat",
  // AI
  FETUSDT: "Fetch.ai", RENDERUSDT: "Render", AKTUSDT: "Akash Network", TAOUSDT: "Bittensor",
  // Gaming
  IMXUSDT: "Immutable", GALAUSDT: "Gala", RONINUSDT: "Ronin", AXSUSDT: "Axie Infinity",
  // Storage/Infrastructure
  FILUSDT: "Filecoin", ARUSDT: "Arweave", ETHFIUSDT: "ether.fi",
  // Stablecoin/Exchange
  XRPUSDT: "XRP", LTCUSDT: "Litecoin", TRXUSDT: "TRON", XLMUSDT: "Stellar",
};

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

// Priority symbols - fetch these first (top 12 by volume)
const PRIORITY_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT",
  "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT",
  "DOTUSDT", "LINKUSDT", "MATICUSDT", "ATOMUSDT",
];

// Extended symbols - fetch after priority
const EXTENDED_SYMBOLS = TOP_SYMBOLS.filter(s => !PRIORITY_SYMBOLS.includes(s));

// Initial fetch - just priority symbols
async function fetchInitialTickers(): Promise<any[]> {
  try {
    const results = await Promise.all(
      PRIORITY_SYMBOLS.map(async (symbol) => {
        try {
          const resp = await fetch(`${BINANCE_REST_BASE}/ticker/24hr?symbol=${symbol}`, {
            signal: AbortSignal.timeout(10000),
          });
          if (resp.ok) return await resp.json();
          return null;
        } catch { return null; }
      })
    );
    return results.filter(Boolean);
  } catch (err) {
    console.error("[Cache] Initial ticker fetch error:", err);
    return [];
  }
}

async function fetchAllTickers(): Promise<any[]> {
  const now = Date.now();
  if (tickerCache.length > 0 && now - tickerCacheTime < TICKER_CACHE_TTL) {
    return tickerCache;
  }

  try {
    // Fetch individual tickers in small batches
    const results: any[] = [];
    const batchSize = 4;
    const allSymbols = [...PRIORITY_SYMBOLS, ...EXTENDED_SYMBOLS];
    
    for (let i = 0; i < allSymbols.length; i += batchSize) {
      const batch = allSymbols.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (symbol) => {
          try {
            const resp = await fetch(`${BINANCE_REST_BASE}/ticker/24hr?symbol=${symbol}`, {
              signal: AbortSignal.timeout(8000),
            });
            if (resp.ok) return await resp.json();
            return null;
          } catch { return null; }
        })
      );
      results.push(...batchResults.filter(Boolean));
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < allSymbols.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
    tickerCache = results;
    tickerCacheTime = now;
    console.log(`[Cache] Fetched ${tickerCache.length}/${allSymbols.length} tickers`);
    return tickerCache;
  } catch (err) {
    console.error("[Cache] Ticker fetch error:", err);
    return tickerCache; // Return stale cache if available
  }
}

// Background refresh - incremental, only a few at a time
let refreshInProgress = false;
let lastRefreshIndex = 0;

async function backgroundRefresh() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    // Fetch only 8 symbols per refresh cycle to avoid overloading
    const symbolsToFetch = TOP_SYMBOLS.slice(lastRefreshIndex, lastRefreshIndex + 8);
    if (symbolsToFetch.length === 0) {
      lastRefreshIndex = 0; // Reset to beginning
      refreshInProgress = false;
      return;
    }
    
    const results = await Promise.all(
      symbolsToFetch.map(async (symbol) => {
        try {
          const resp = await fetch(`${BINANCE_REST_BASE}/ticker/24hr?symbol=${symbol}`, {
            signal: AbortSignal.timeout(8000),
          });
          if (resp.ok) return await resp.json();
          return null;
        } catch { return null; }
      })
    );
    
    const validResults = results.filter(Boolean);
    // Merge with existing cache - update existing or add new
    for (const ticker of validResults) {
      const existingIdx = tickerCache.findIndex((t: any) => t.symbol === ticker.symbol);
      if (existingIdx >= 0) {
        tickerCache[existingIdx] = ticker;
      } else {
        tickerCache.push(ticker);
      }
    }
    
    lastRefreshIndex += 8;
    if (lastRefreshIndex >= TOP_SYMBOLS.length) {
      lastRefreshIndex = 0; // Full cycle complete, restart
    }
    tickerCacheTime = Date.now();
    console.log(`[Refresh] +${validResults.length} tickers, total: ${tickerCache.length}, next: ${lastRefreshIndex}`);
  } catch {} finally {
    refreshInProgress = false;
  }
}

// Fetch initial data on startup, then start incremental refresh
fetchInitialTickers().then(initial => {
  tickerCache = initial;
  tickerCacheTime = Date.now();
  console.log(`[Startup] Loaded ${initial.length} priority tickers`);
  
  // Start incremental refresh every 10 seconds
  // Each refresh fetches 8 symbols, so full cycle = ~7 refreshes = ~70 seconds
  setTimeout(() => {
    backgroundRefresh();
    setInterval(backgroundRefresh, 10000);
  }, 5000);
});

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

        case "/api/market/categories": {
          return new Response(JSON.stringify({ data: SYMBOL_CATEGORIES, timestamp: Date.now() }), {
            headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
        }

        case "/api/market/symbols": {
          const symbols = TOP_SYMBOLS.map(sym => ({
            symbol: sym,
            name: SYMBOL_NAMES[sym] || sym.replace("USDT", ""),
            category: SYMBOL_CATEGORIES[sym] || "Other",
          }));
          return new Response(JSON.stringify({ data: symbols, timestamp: Date.now() }), {
            headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
        }

        case "/api/market/depth": {
          const symbol = url.searchParams.get("symbol") || "BTCUSDT";
          const limit = url.searchParams.get("limit") || "20";
          const bUrl = `${BINANCE_REST_BASE}/depth?symbol=${symbol.toUpperCase()}&limit=${limit}`;
          const resp = await fetch(bUrl, { signal: AbortSignal.timeout(8000) });
          if (!resp.ok) {
            return new Response(JSON.stringify({ error: "Failed to fetch depth" }), {
              status: resp.status, headers: { "Content-Type": "application/json", ...corsHeaders() },
            });
          }
          const raw = await resp.json();
          // Transform arrays to objects: [[price, qty], ...] -> [{price, volume}, ...]
          const bids = (raw.bids || []).map((b: string[]) => ({
            price: parseFloat(b[0]),
            volume: parseFloat(b[1]),
          }));
          const asks = (raw.asks || []).map((a: string[]) => ({
            price: parseFloat(a[0]),
            volume: parseFloat(a[1]),
          }));
          return new Response(JSON.stringify({
            symbol: symbol.toUpperCase(), bids, asks,
            lastUpdateId: raw.lastUpdateId, timestamp: Date.now(),
          }), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
        }

        case "/health":
          return new Response(JSON.stringify({
            status: "ok", service: "binance-service", port: PORT,
            uptime: process.uptime(), activeStreams: streamManager.connectionCount,
            symbolCount: TOP_SYMBOLS.length, timestamp: Date.now(),
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
  socket.on("trade-executed", (data: any) => {
    console.log(`[SocketIO] trade-executed:`, data);
    io.emit("trade-executed", data);
  });
  socket.on("balance-update", (data: any) => {
    console.log(`[SocketIO] balance-update:`, data);
    io.emit("balance-update", data);
  });
  socket.on("telemetry:event", (data: any) => {
    console.log(`[SocketIO] telemetry:event:`, data);
    io.emit("telemetry:event", data);
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
console.log(`  GET /api/market/categories`);
console.log(`  GET /api/market/symbols`);
console.log(`  GET /health`);
console.log(`[BinanceService] Tracking ${TOP_SYMBOLS.length} symbols across 7 categories`);
