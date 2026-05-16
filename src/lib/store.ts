import { create } from "zustand";

export interface TickerData {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
}

export interface KlineData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BotConfigData {
  strategy: "RSI" | "MACD" | "AI";
  symbol: string;
  stopLoss: number;
  takeProfit: number;
  maxDailyTrades: number;
  buyThreshold: number;
  sellThreshold: number;
  initialBalance: number;
  autoTradeSignals: boolean;
  signalConfidenceThreshold: number;
}

export interface PortfolioData {
  totalValue: number;
  cashBalance: number;
  assetBalance: number;
  assetQuantity: number;
  pnl: number;
  pnlPercent: number;
}

export interface TradeData {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  total: number;
  strategy: string;
  mode: string;
  pnl: number;
  timestamp: string;
}

export interface AISignalData {
  id: string;
  symbol: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  priceAtSignal: number;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  direction: "above" | "below";
  currentPrice: number;
  isTriggered: boolean;
  createdAt: string;
}

interface CryptoStore {
  // Active section/tab
  activeSection: "dashboard" | "chart" | "ai" | "bot" | "backtest" | "history";
  setActiveSection: (section: CryptoStore["activeSection"]) => void;

  // Selected symbol
  selectedSymbol: string;
  setSelectedSymbol: (symbol: string) => void;

  // Trading mode
  tradingMode: "paper" | "live";
  setTradingMode: (mode: CryptoStore["tradingMode"]) => void;

  // Market data
  tickers: Record<string, TickerData>;
  setTickers: (tickers: Record<string, TickerData>) => void;
  updateTicker: (symbol: string, data: TickerData) => void;

  // Kline data
  klines: KlineData[];
  setKlines: (klines: KlineData[]) => void;

  // Socket.IO connection status
  connectionStatus: "connected" | "disconnected" | "connecting";
  setConnectionStatus: (status: "connected" | "disconnected" | "connecting") => void;

  // Bot status
  botActive: boolean;
  setBotActive: (active: boolean) => void;
  botConfig: BotConfigData;
  setBotConfig: (config: BotConfigData) => void;

  // Portfolio
  portfolio: PortfolioData;
  setPortfolio: (portfolio: PortfolioData) => void;

  // Trades
  trades: TradeData[];
  setTrades: (trades: TradeData[]) => void;
  addTrade: (trade: TradeData) => void;

  // AI Signals
  aiSignals: AISignalData[];
  setAiSignals: (signals: AISignalData[]) => void;
  addAiSignal: (signal: AISignalData) => void;

  // Chat messages
  chatMessages: ChatMessage[];
  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;

  // Price alerts
  alerts: PriceAlert[];
  addAlert: (alert: PriceAlert) => void;
  removeAlert: (id: string) => void;
  updateAlertPrices: (tickers: Record<string, TickerData>) => void;

  // Watchlist
  watchlist: string[];
  toggleWatchlist: (symbol: string) => void;
  isInWatchlist: (symbol: string) => boolean;

  // Loading states
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const useCryptoStore = create<CryptoStore>((set) => ({
  // Active section
  activeSection: "dashboard",
  setActiveSection: (section) => set({ activeSection: section }),

  // Selected symbol
  selectedSymbol: "BTCUSDT",
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),

  // Trading mode
  tradingMode: "paper",
  setTradingMode: (mode) => set({ tradingMode: mode }),

  // Market data
  tickers: {},
  setTickers: (tickers) => set({ tickers }),
  updateTicker: (symbol, data) =>
    set((state) => ({
      tickers: { ...state.tickers, [symbol]: data },
    })),

  // Kline data
  klines: [],
  setKlines: (klines) => set({ klines }),

  // Socket.IO connection status
  connectionStatus: "disconnected" as const,
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // Bot status
  botActive: false,
  setBotActive: (active) => set({ botActive: active }),
  botConfig: {
    strategy: "AI",
    symbol: "BTCUSDT",
    stopLoss: 2,
    takeProfit: 5,
    maxDailyTrades: 10,
    buyThreshold: 30,
    sellThreshold: 70,
    initialBalance: 10000,
    autoTradeSignals: false,
    signalConfidenceThreshold: 75,
  },
  setBotConfig: (config) => set({ botConfig: config }),

  // Portfolio
  portfolio: {
    totalValue: 10000,
    cashBalance: 10000,
    assetBalance: 0,
    assetQuantity: 0,
    pnl: 0,
    pnlPercent: 0,
  },
  setPortfolio: (portfolio) => set({ portfolio }),

  // Trades
  trades: [],
  setTrades: (trades) => set({ trades }),
  addTrade: (trade) =>
    set((state) => ({
      trades: [trade, ...state.trades],
    })),

  // AI Signals
  aiSignals: [],
  setAiSignals: (signals) => set({ aiSignals: signals }),
  addAiSignal: (signal) =>
    set((state) => ({
      aiSignals: [signal, ...state.aiSignals],
    })),

  // Chat messages
  chatMessages: [],
  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, message],
    })),
  clearChat: () => set({ chatMessages: [] }),

  // Price alerts
  alerts: [],
  addAlert: (alert) =>
    set((state) => ({
      alerts: [...state.alerts, alert],
    })),
  removeAlert: (id) =>
    set((state) => ({
      alerts: state.alerts.filter((a) => a.id !== id),
    })),
  updateAlertPrices: (tickers) =>
    set((state) => ({
      alerts: state.alerts.map((alert) => {
        const ticker = tickers[alert.symbol];
        if (!ticker) return alert;
        const newPrice = ticker.price;
        const triggered =
          alert.direction === "above"
            ? newPrice >= alert.targetPrice
            : newPrice <= alert.targetPrice;
        return {
          ...alert,
          currentPrice: newPrice,
          isTriggered: triggered,
        };
      }),
    })),

  // Watchlist
  watchlist: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
  toggleWatchlist: (symbol) =>
    set((state) => ({
      watchlist: state.watchlist.includes(symbol)
        ? state.watchlist.filter((s) => s !== symbol)
        : [...state.watchlist, symbol],
    })),
  isInWatchlist: (symbol) => {
    return useCryptoStore.getState().watchlist.includes(symbol);
  },

  // Loading states
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
}));
