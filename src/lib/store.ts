// Re-export everything from the new sliced store for backward compatibility.
// All imports from "@/lib/store" continue to work unchanged.
export { useCryptoStore } from "./store/index";
export type {
  TickerData,
  KlineData,
  BotConfigData,
  BotInstance,
  BotPosition,
  BotStrategy,
  BotStats,
  BotEntryCheck,
  PortfolioData,
  PortfolioPosition,
  TradeData,
  AISignalData,
  ChatMessage,
  PriceAlert,
  ActiveSection,
  TradingMode,
  ConnectionStatus,
  SyncMode,
  CryptoStore,
} from "./store/index";
