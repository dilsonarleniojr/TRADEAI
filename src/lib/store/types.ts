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

export type BotStrategy =
  | "AI"
  | "RSI"
  | "MACD"
  | "GRID"
  | "DCA"
  | "BREAKOUT"
  | "MEAN_REVERSION"
  | "QUANT_ENSEMBLE"
  | string;

export interface BotConfigData {
  strategy: BotStrategy;
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
  // Strategy specific params
  gridLower?: number;
  gridUpper?: number;
  gridCount?: number;
  dcaInterval?: number;
  dcaAmount?: number;
  breakoutVolumeMultiplier?: number;
  bollingerPeriod?: number;
  bollingerMultiplier?: number;
}

export interface BotPosition {
  symbol: string;
  side: "BUY";
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  totalCost: number;
  highestPrice: number; // For trailing stop calculation
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  entryTime: string;
}

export interface BotStats {
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  realizedPnl: number;
  lastAction?: string;
  lastActionTime?: string;
}

export interface BotInstance {
  id: string;
  name: string;
  symbol: string;
  strategy: BotStrategy;
  active: boolean;
  status: "idle" | "scanning" | "in_position" | "take_profit" | "stopped";
  
  // Profit-seeking parameters
  takeProfit: number; // Target profit % to trigger sell (e.g. 2.5%, 3.5%)
  stopLoss: number;   // Max loss % protection (e.g. 1.8%, 2.0%)
  trailingStop: boolean; // Protect locked profit when pulling back from peak
  trailingStopDistance: number; // % drop from peak to trigger trailing profit lock
  
  // Capital & Sizing
  allocationAmount: number; // USDT allocated per trade (e.g. 100 USDT)
  maxDailyTrades: number;
  
  // Strategy settings
  buyThreshold: number;  // e.g. RSI 30
  sellThreshold: number; // e.g. RSI 70
  rsiPeriod: number;
  emaFast: number;
  emaSlow: number;
  autoTradeSignals?: boolean;
  signalConfidenceThreshold?: number;
  useQuantFunnel?: boolean;
  useMarketRegime?: boolean;
  useEnsemble?: boolean;

  // Active position held by this bot
  position?: BotPosition | null;

  // Real-time statistics
  stats: BotStats;
  createdAt: string;
}

export interface PortfolioPosition {
  symbol: string;
  quantity: number;
  avgPrice: number;
  marketPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
}

export interface PortfolioData {
  totalValue: number;
  cashBalance: number;
  assetBalance: number;
  assetQuantity: number;
  pnl: number;
  pnlPercent: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
  positions?: PortfolioPosition[];
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
  botId?: string;
  botName?: string;
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

export interface BotLogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: "info" | "buy" | "sell" | "profit" | "loss" | "system" | "warning" | "error" | "success";
  botId?: string;
  botName?: string;
}

export interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice?: number;
  direction?: "above" | "below";
  currentPrice: number;
  isTriggered: boolean;
  createdAt: string;
  type?: "price" | "volatility" | "liquidity" | "indicator" | "sr_breakout";
  threshold?: number;
  indicatorName?: "RSI" | "MACD";
  srLevel?: "support" | "resistance";
  indicatorValue?: number;
  message?: string;
}

export type ActiveSection = "dashboard" | "chart" | "ai" | "bot" | "backtest" | "history" | "education";
export type TradingMode = "paper" | "live";
export type ConnectionStatus = "connected" | "disconnected" | "connecting" | "rest-api";
export type SyncMode = "realtime" | "polling" | "offline";

export interface ScheduledOrder {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  triggerPrice: number;
  quantity: number;
  direction: "above" | "below";
  isTriggered: boolean;
  createdAt: string;
}

