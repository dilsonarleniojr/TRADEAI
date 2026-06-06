// Shared types used across all store slices
// Extracted from the original monolithic store.ts for backward compatibility

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
  useQuantFunnel: boolean;
  useMarketRegime: boolean;
  useEnsemble: boolean;
  rsiPeriod: number;
  emaFast: number;
  emaSlow: number;
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
  stopLoss: number;
  takeProfit: number;
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

export type ActiveSection = "dashboard" | "chart" | "ai" | "bot" | "backtest" | "history";
export type TradingMode = "paper" | "live";
export type ConnectionStatus = "connected" | "disconnected" | "connecting" | "rest-api";
export type SyncMode = "realtime" | "polling" | "offline";
