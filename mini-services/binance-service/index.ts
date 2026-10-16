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
  "POLUSDT", "ARBUSDT", "OPUSDT", "MANTAUSDT", "STRKUSDT",

  // === DeFi ===
  "LINKUSDT", "UNIUSDT", "AAVEUSDT", "ONDOUSDT", "ENAUSDT",
  "CRVUSDT", "SNXUSDT", "LDOUSDT", "DYDXUSDT", "PENDLEUSDT",

  // === Meme ===
  "DOGEUSDT", "SHIBUSDT", "PEPEUSDT", "FLOKIUSDT", "BONKUSDT", "WIFUSDT",

  // === AI ===
  "FETUSDT", "RENDERUSDT", "TAOUSDT", "WLDUSDT",

  // === Gaming ===
  "IMXUSDT", "GALAUSDT", "RONINUSDT", "AXSUSDT",

  // === Storage/Infrastructure ===
  "FILUSDT", "ARUSDT", "ETHFIUSDT",

  // === Stablecoin/Exchange ===
  "XRPUSDT", "LTCUSDT", "TRXUSDT", "XLMUSDT",

  // === Top Gainers / Novas Moedas em Alta ===
  "MOVRUSDT", "JUPUSDT", "ZROUSDT", "PUMPUSDT", "BERAUSDT",
  "PHAUSDT", "NIGHTUSDT", "INITUSDT", "OGUSDT", "QNTUSDT",
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
  POLUSDT: "Layer 2", ARBUSDT: "Layer 2", OPUSDT: "Layer 2",
  MANTAUSDT: "Layer 2", STRKUSDT: "Layer 2",
  // DeFi
  LINKUSDT: "DeFi", UNIUSDT: "DeFi", AAVEUSDT: "DeFi", ONDOUSDT: "DeFi",
  ENAUSDT: "DeFi", CRVUSDT: "DeFi", SNXUSDT: "DeFi", LDOUSDT: "DeFi",
  DYDXUSDT: "DeFi", PENDLEUSDT: "DeFi",
  // Meme
  DOGEUSDT: "Meme", SHIBUSDT: "Meme", PEPEUSDT: "Meme", FLOKIUSDT: "Meme",
  BONKUSDT: "Meme", WIFUSDT: "Meme",
  // AI
  FETUSDT: "AI", RENDERUSDT: "AI", TAOUSDT: "AI", WLDUSDT: "AI",
  // Gaming
  IMXUSDT: "Gaming", GALAUSDT: "Gaming", RONINUSDT: "Gaming", AXSUSDT: "Gaming",
  // Storage/Infrastructure
  FILUSDT: "Storage/Infrastructure", ARUSDT: "Storage/Infrastructure", ETHFIUSDT: "Storage/Infrastructure",
  // Stablecoin/Exchange
  XRPUSDT: "Stablecoin/Exchange", LTCUSDT: "Stablecoin/Exchange",
  TRXUSDT: "Stablecoin/Exchange", XLMUSDT: "Stablecoin/Exchange",
  // Top Gainers / Novas Moedas
  MOVRUSDT: "Layer 1", JUPUSDT: "DeFi", ZROUSDT: "Storage/Infrastructure",
  PUMPUSDT: "Meme", BERAUSDT: "Layer 1", PHAUSDT: "AI",
  NIGHTUSDT: "Storage/Infrastructure", INITUSDT: "Layer 1", OGUSDT: "Gaming", QNTUSDT: "Storage/Infrastructure",
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
  POLUSDT: "Polygon Ecosystem Token", ARBUSDT: "Arbitrum", OPUSDT: "Optimism",
  MANTAUSDT: "Manta Network", STRKUSDT: "Starknet",
  // DeFi
  LINKUSDT: "Chainlink", UNIUSDT: "Uniswap", AAVEUSDT: "Aave", ONDOUSDT: "Ondo",
  ENAUSDT: "Ethena", CRVUSDT: "Curve", SNXUSDT: "Synthetix", LDOUSDT: "Lido DAO",
  DYDXUSDT: "dYdX", PENDLEUSDT: "Pendle",
  // Meme
  DOGEUSDT: "Dogecoin", SHIBUSDT: "Shiba Inu", PEPEUSDT: "Pepe",
  FLOKIUSDT: "Floki", BONKUSDT: "Bonk", WIFUSDT: "dogwifhat",
  // AI
  FETUSDT: "Artificial Superintelligence", RENDERUSDT: "Render", TAOUSDT: "Bittensor", WLDUSDT: "Worldcoin",
  // Gaming
  IMXUSDT: "Immutable", GALAUSDT: "Gala", RONINUSDT: "Ronin", AXSUSDT: "Axie Infinity",
  // Storage/Infrastructure
  FILUSDT: "Filecoin", ARUSDT: "Arweave", ETHFIUSDT: "ether.fi",
  // Stablecoin/Exchange
  XRPUSDT: "XRP", LTCUSDT: "Litecoin", TRXUSDT: "TRON", XLMUSDT: "Stellar",
  // Top Gainers / Novas Moedas
  MOVRUSDT: "Moonriver", JUPUSDT: "Jupiter", ZROUSDT: "LayerZero",
  PUMPUSDT: "Pump", BERAUSDT: "Berachain", PHAUSDT: "Phala Network",
  NIGHTUSDT: "Midnight", INITUSDT: "Initia", OGUSDT: "OG Fan Token", QNTUSDT: "Quant",
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

interface TrackedSymbolInfo {
  symbol: string;
  name: string;
  short: string;
  category: string;
  baseAsset: string;
  quoteAsset: string;
  isSpotTradingAllowed: boolean;
  minNotional: number;
  stepSize: number;
  tickSize: number;
}

const trackedSymbolsMap = new Map<string, TrackedSymbolInfo>();
let trackedSymbolsList: string[] = [...TOP_SYMBOLS];

// Initialize default symbols into map
TOP_SYMBOLS.forEach((sym) => {
  const short = sym.replace("USDT", "");
  trackedSymbolsMap.set(sym, {
    symbol: sym,
    name: SYMBOL_NAMES[sym] || short,
    short,
    category: SYMBOL_CATEGORIES[sym] || "Inovação",
    baseAsset: short,
    quoteAsset: "USDT",
    isSpotTradingAllowed: true,
    minNotional: 5.0,
    stepSize: 0.0001,
    tickSize: 0.01,
  });
});

// ============================================================
// Cache for ticker data (refreshed periodically)
// ============================================================
let tickerCache: any[] = [];
let tickerCacheTime = 0;
const TICKER_CACHE_TTL = 15000; // 15 seconds

// Priority symbols (top by volume)
const PRIORITY_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT",
  "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT",
  "DOTUSDT", "LINKUSDT", "MATICUSDT", "ATOMUSDT",
];

// Synchronize all available spot USDT pairs from Binance exchangeInfo
async function syncBinanceExchangeInfo(): Promise<number> {
  try {
    console.log("[BinanceService] Sincronizando moedas e pares com a Binance (exchangeInfo)...");
    const resp = await fetch(`${BINANCE_REST_BASE}/exchangeInfo`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) {
      console.warn(`[BinanceService] Falha ao consultar exchangeInfo: status ${resp.status}`);
      return trackedSymbolsList.length;
    }

    const data = await resp.json();
    if (!data || !Array.isArray(data.symbols)) return trackedSymbolsList.length;

    const spotUsdtSymbols = data.symbols.filter(
      (s: any) => s.status === "TRADING" && s.quoteAsset === "USDT" && s.isSpotTradingAllowed
    );

    const newMap = new Map<string, TrackedSymbolInfo>();

    for (const item of spotUsdtSymbols) {
      const sym = item.symbol;
      const baseAsset = item.baseAsset;
      let minNotional = 5.0;
      let stepSize = 0.0001;
      let tickSize = 0.01;

      if (Array.isArray(item.filters)) {
        for (const f of item.filters) {
          if (f.filterType === "NOTIONAL" && f.minNotional) {
            minNotional = parseFloat(f.minNotional);
          } else if (f.filterType === "LOT_SIZE" && f.stepSize) {
            stepSize = parseFloat(f.stepSize);
          } else if (f.filterType === "PRICE_FILTER" && f.tickSize) {
            tickSize = parseFloat(f.tickSize);
          }
        }
      }

      const name = SYMBOL_NAMES[sym] || baseAsset;
      const category = SYMBOL_CATEGORIES[sym] || "Inovação";

      newMap.set(sym, {
        symbol: sym,
        name,
        short: baseAsset,
        category,
        baseAsset,
        quoteAsset: "USDT",
        isSpotTradingAllowed: true,
        minNotional,
        stepSize,
        tickSize,
      });
    }

    if (newMap.size > 0) {
      trackedSymbolsMap.clear();
      for (const [k, v] of newMap) {
        trackedSymbolsMap.set(k, v);
      }

      // Keep priority symbols first, then remaining alphabetically
      const remaining = Array.from(newMap.keys()).filter((s) => !PRIORITY_SYMBOLS.includes(s)).sort();
      trackedSymbolsList = [...PRIORITY_SYMBOLS.filter((s) => newMap.has(s)), ...remaining];

      console.log(`[BinanceService] ✅ Sincronização concluída: ${trackedSymbolsList.length} moedas Spot USDT ativas rastreadas.`);
    }

    return trackedSymbolsList.length;
  } catch (err: any) {
    console.error("[BinanceService] Erro ao sincronizar com Binance exchangeInfo:", err.message);
    return trackedSymbolsList.length;
  }
}

async function fetchAllTickers(forceRefresh = false): Promise<any[]> {
  const now = Date.now();
  if (!forceRefresh && tickerCache.length > 0 && now - tickerCacheTime < TICKER_CACHE_TTL) {
    return tickerCache;
  }

  try {
    // Single request fetches 24hr tickers for the whole Binance exchange
    const resp = await fetch(`${BINANCE_REST_BASE}/ticker/24hr`, {
      signal: AbortSignal.timeout(10000),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data) && data.length > 0) {
        const filtered = data
          .filter((t: any) => trackedSymbolsMap.has(t.symbol))
          .sort((a: any, b: any) => parseFloat(b.quoteVolume || "0") - parseFloat(a.quoteVolume || "0"));

        if (filtered.length > 0) {
          tickerCache = filtered;
          tickerCacheTime = now;
          return tickerCache;
        }
      }
    }
  } catch (err: any) {
    console.warn("[BinanceService] Erro no fetch global de tickers:", err.message);
  }

  // Fallback: batch fetch top symbols
  if (tickerCache.length === 0) {
    try {
      const encoded = encodeURIComponent(JSON.stringify(TOP_SYMBOLS));
      const resp = await fetch(`${BINANCE_REST_BASE}/ticker/24hr?symbols=${encoded}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          tickerCache = data;
          tickerCacheTime = now;
          return tickerCache;
        }
      }
    } catch {}
  }

  return tickerCache;
}

// Background refresh loop
let refreshInProgress = false;
async function backgroundRefresh() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    await fetchAllTickers(true);
  } catch (err: any) {
    console.warn("[Refresh] Erro no refresh em background:", err.message);
  } finally {
    refreshInProgress = false;
  }
}

// Initialize on startup: first sync all Binance exchange symbols, then load tickers
(async () => {
  try {
    await syncBinanceExchangeInfo();
  } catch (e) {
    console.error("[Startup] Initial sync failed:", e);
  }

  try {
    await fetchAllTickers(true);
    console.log(`[Startup] ${tickerCache.length} tickers carregados da Binance`);
  } catch (e) {
    console.error("[Startup] Initial ticker fetch failed:", e);
  }

  // Refresh tickers every 15 seconds
  setInterval(backgroundRefresh, 15000);

  // Re-synchronize exchangeInfo every 2 hours to catch new listings
  setInterval(syncBinanceExchangeInfo, 2 * 60 * 60 * 1000);
})();


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
          const symbols = Array.from(trackedSymbolsMap.values());
          return new Response(JSON.stringify({ data: symbols, count: symbols.length, timestamp: Date.now() }), {
            headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
        }

        case "/api/market/sync": {
          const count = await syncBinanceExchangeInfo();
          const tickers = await fetchAllTickers(true);
          return new Response(JSON.stringify({
            success: true,
            symbolsCount: count,
            tickersCount: tickers.length,
            timestamp: Date.now(),
          }), {
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
            symbolCount: trackedSymbolsList.length, timestamp: Date.now(),
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
    if (!symbol || typeof symbol !== "string") return;
    const s = symbol.toUpperCase().trim();
    if (s === "AUTO" || !s.endsWith("USDT")) return;
    socket.join(`market:${s}`);
    streamManager.subscribe(socket.id, s);
    socket.emit("subscribed", { symbol: s });
  });
  socket.on("unsubscribe", (symbol: string) => {
    if (!symbol || typeof symbol !== "string") return;
    const s = symbol.toUpperCase().trim();
    if (s === "AUTO" || !s.endsWith("USDT")) return;
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
console.log(`  GET /api/market/symbols`);
console.log(`  GET /api/market/sync`);
console.log(`  GET /api/market/klines?symbol=BTCUSDT&interval=1h&limit=100`);
console.log(`  GET /api/market/price?symbol=BTCUSDT`);
console.log(`  GET /api/market/highlights`);
console.log(`  GET /api/market/categories`);
console.log(`  GET /health`);
console.log(`[BinanceService] Sincronização dinâmica de moedas Binance ativada.`);

