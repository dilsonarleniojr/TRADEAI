export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

export interface DiscordConfig {
  enabled: boolean;
  webhookUrl: string;
}

export interface NotificationEventFilters {
  tradeEntries: boolean;
  tradeExits: boolean;
  fleetRotations: boolean;
  circuitBreakers: boolean;
}

export interface NotificationSettings {
  telegram: TelegramConfig;
  discord: DiscordConfig;
  filters: NotificationEventFilters;
}

export type NotificationEventType =
  | "TRADE_ENTRY"
  | "TRADE_EXIT"
  | "FLEET_ROTATION"
  | "CIRCUIT_BREAKER_TRIPPED"
  | "CIRCUIT_BREAKER_RESET"
  | "SYSTEM_TEST";

export interface NotificationPayload {
  type: NotificationEventType;
  title: string;
  message: string;
  symbol?: string;
  side?: "BUY" | "SELL";
  price?: number;
  quantity?: number;
  pnlUsdt?: number;
  pnlPercent?: number;
  strategy?: string;
  botName?: string;
  reason?: string;
  mode?: "paper" | "live";
  timestamp?: number;
}
