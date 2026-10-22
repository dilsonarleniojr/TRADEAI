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
  useMultiTimeframe?: boolean;
  useAutoScreener?: boolean;
  autoBreakEven?: boolean;
  breakEvenTrigger?: number;
  breakEvenBuffer?: number;
  useMathematicalExpectancyGate?: boolean; // Portão de Expectativa Matemática (EV >= +0.40% & Kelly)
  // Scalping de Curto Prazo: Parciais, Time-Stop e Filtro BTC
  usePartialTp?: boolean;
  partialTpTrigger?: number;
  partialTpPercent?: number;
  timeStopMinutes?: number;
  useBtcGatekeeper?: boolean;
  rsiPeriod: number;
  emaFast: number;
  stopAfterProfit?: boolean;
  useAiExit?: boolean; // Venda no Melhor Momento sugerida por Inteligência Artificial
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
  /** Modo em que a posição foi aberta. Só pode ser encerrada pelo motor nesse mesmo modo. */
  mode?: TradingMode;
  /** Break-Even Automático armado para proteger o capital com risco zero */
  isBreakEvenArmed?: boolean;
  breakEvenPrice?: number;
  /** Estágio 2 da Escada de Lucro: Piso de Lucro Garantido (Lock-in >= +1.20%) */
  isProfitFloorArmed?: boolean;
  /** Trailing Take-Profit Dinâmico: deixa o lucro correr além da meta em fortes altas */
  isTakeProfitArmed?: boolean;
  tpPeakPrice?: number;
  /** Quantidade de ordens DCA (preço médio) executadas nesta posição */
  dcaCount?: number;
  /** Realização Parcial (Scale-Out 50/50 no primeiro alvo) */
  partialTpExecuted?: boolean;
  partialTpSoldQty?: number;
  partialTpRealizedPnl?: number;
  /** Alvos Dinâmicos Adaptativos por ATR */
  dynamicTakeProfit?: number;
  dynamicStopLoss?: number;
  relativeAtrAtEntry?: number;
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
  /** Resultado da última análise de entrada (por que o robô comprou ou aguarda). */
  entryChecks?: BotEntryCheck[];
  /** Métricas de Risco Quantitativo (Sharpe, Sortino, Expectancy, Profit Factor) */
  sharpeRatio?: number;
  sortinoRatio?: number;
  profitFactor?: number;
  expectancy?: number;
  maxDrawdown?: number;

  /** Telemetria de Frequência de Disparo (Entry Frequency Telemetry) */
  scansPerMinute?: number;
  evaluatedPairsCount?: number;
  approvalsCount?: number;
  totalChecksCount?: number;
  triggerProximityPercent?: number;
  lastVetoReason?: string;
  lastVetoIndicator?: string;
  /** Mini histórico dos últimos 10 ticks de proximidade (0-100%) para Sparkline */
  proximityHistory?: number[];
}

export interface BotEntryCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export interface BotInstance {
  id: string;
  name: string;
  symbol: string;
  strategy: BotStrategy;
  active: boolean;
  status: "idle" | "scanning" | "in_position" | "take_profit" | "stopped";

  // Override manual de ativo para Auto-Screener (fixação temporária de par pelo operador)
  overrideSymbol?: string;
  overrideMode?: "indefinite" | "single_trade" | "1h" | "4h";
  overrideExpiresAt?: number; // timestamp ms quando expira (para 1h e 4h)

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
  useMultiTimeframe?: boolean;
  useAutoScreener?: boolean;
  autoBreakEven?: boolean; // Break-Even Automático (move stop para o lucro/zero após atingir gatilho)
  breakEvenTrigger?: number; // % de lucro para armar o break-even (ex: 1.0% ou 1.2%)
  breakEvenBuffer?: number; // % acima do preço de entrada para cobrir taxas da Binance (ex: +0.25%)
  useMathematicalExpectancyGate?: boolean; // Portão de Expectativa Matemática (EV >= +0.40% & Kelly)

  // Trailing Take-Profit Dinâmico (deixar o lucro correr em fortes altas)
  trailingTakeProfit?: boolean;
  trailingTakeProfitDistance?: number; // % de recuo do topo para realizar (ex: 0.6%)

  // DCA Inteligente em Suporte (Preço Médio Estratégico)
  useSmartDca?: boolean;
  maxDcaOrders?: number; // Máximo de recompras (padrão 1)
  dcaDipThreshold?: number; // % de recuo para avaliar DCA em suporte (ex: 1.5%)
  dcaMultiplier?: number; // Multiplicador de capital para o DCA (padrão 1.0)

  // Filtro de Spread e Livro de Ofertas (Order Book Imbalance)
  useOrderBookFilter?: boolean;
  maxSpreadPercent?: number; // Spread máximo tolerado (padrão 0.15%)
  minBidAskRatio?: number; // Proporção mínima de compradores vs vendedores no book (padrão 0.45)

  // Encerramento automático após lucro (Operação Única)
  stopAfterProfit?: boolean;

  // Saída Inteligente por IA (Venda no Melhor Momento)
  useAiExit?: boolean; // Vende no melhor momento sugerido pela IA baseado em esgotamento e momentum

  // Scalping de Curto Prazo
  usePartialTp?: boolean; // Realização Parcial de 50% no primeiro alvo
  partialTpTrigger?: number; // % de lucro para parcial (padrão 1.0%)
  partialTpPercent?: number; // % da posição a vender (padrão 50%)
  timeStopMinutes?: number; // Saída por estagnação de capital (padrão 60 min base + 15 min de tolerância com saída a prejuízo zero)
  useBtcGatekeeper?: boolean; // Filtro Direcional BTC (bloqueia compras se BTC cair no 5m)

  // Governança e Controle de Risco Institucional (v2.5.0)
  algorithmVersion?: string; // Versão formal do algoritmo (ex: "v2.5.0-institutional")
  slippageTolerance?: number; // Tolerância máxima de slippage em % (ex: 0.35%)
  riskPerTradePercent?: number; // % explícita de risco por ordem do saldo livre (ex: 35.0%)
  maxHoldingMinutes?: number; // Holding time máximo para encerramento intradiário de proteção (padrão 60 min)
  disableConsecutiveLossBrake?: boolean; // Permite desativar a pausa por perdas consecutivas neste robô

  // Último relatório de execução gerado ao finalizar
  lastReport?: BotExecutionReport | null;

  // Active position held by this bot
  position?: BotPosition | null;

  // AI provenance
  aiEngine?: string;

  // Real-time statistics
  stats: BotStats;
  createdAt: string;
}

export interface MarketSnapshot {
  refPrice: number;
  bidPrice?: number;
  askPrice?: number;
  spreadPercent?: number;
  rsi1m?: number;
  rsi15m?: number;
  orderBookRatio?: number;
  timestamp: number;
}

export interface RiskParams {
  riskPerTradePercent: number;
  maxOrderUsd: number;
  slippageTolerancePercent: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  holdingTimeLimitMinutes?: number;
}

export interface BotExecutionReport {
  id: string;
  botId: string;
  botName: string;
  symbol: string;
  strategy: string;
  mode: "live" | "paper";
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  totalInvested: number; // Volume de compra em USDT
  totalReturned: number; // Volume de venda em USDT
  grossPnl: number;      // PnL Bruto em USDT
  gainPercent: number;   // % de lucro/prejuízo
  buyFee: number;        // Taxa estimada de compra (ex: 0.1% Binance)
  sellFee: number;       // Taxa estimada de venda (ex: 0.1% Binance)
  totalFees: number;     // Total de custos/taxas em USDT
  netPnl: number;        // PnL Líquido após taxas em USDT
  netGainPercent: number;// % Líquido
  entryTime: string;
  exitTime: string;
  durationFormatted: string;
  exitReason: string;
  botTotalTrades: number;
  botWinTrades: number;
  botLossTrades: number;
  botWinRate: number;
  botAccumulatedPnl: number;

  // Auditoria e Governança
  executionId?: string;
  algorithmVersion?: string;
  marketSnapshot?: MarketSnapshot;
  riskParams?: RiskParams;
  slippagePercent?: number;
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
  netPnl?: number;
  timestamp: string;
  botId?: string;
  botName?: string;
  sellAll?: boolean;

  // Governança, Rastreabilidade e Auditoria
  executionId?: string;
  algorithmVersion?: string;
  marketSnapshot?: MarketSnapshot;
  riskParams?: RiskParams;
  slippagePercent?: number;

  // Microestrutura e Execução Institucional (Maker vs Taker)
  orderType?: 'MARKET' | 'LIMIT' | 'LIMIT_MAKER';
  limitPrice?: number;
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
  // Campos estritos HFT / Microestrutura
  signal?: "BUY" | "SELL" | "HOLD";
  confidence_score?: number;
  risk_reward_ratio?: number;
  key_driver?: string;
  risk_warning?: string;
  vetoed?: boolean;
  veto_reason?: string;
  flow_context?: {
    vwap?: number;
    vwap_distance_percent?: number;
    order_flow_imbalance?: number;
    funding_rate_percent?: number;
    liquidity_controller?: string;
  };
  // Telemetria do agente (ferramentas chamadas e falhas do LLM)
  agent_error?: boolean;
  error_reason?: string;
  agent_telemetry?: AgentTelemetryData;
}

export type AgentToolStatus = "success" | "fallback" | "failed";

export interface AgentToolInvocationData {
  name: string;
  label: string;
  status: AgentToolStatus;
  duration_ms: number;
  summary?: string;
  error?: string;
}

export interface AgentTelemetryData {
  mode: "agent" | "fail_safe";
  provider: string | null;
  model: string | null;
  iterations: number;
  tools: AgentToolInvocationData[];
  llm_error?: string;
  started_at: string;
  duration_ms: number;
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

export type ActiveSection = "dashboard" | "chart" | "ai" | "bot" | "backtest" | "history" | "education" | "institutional" | "trade-hub";
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
  marginMode?: "SPOT" | "ISOLATED" | "CROSS";
  leverage?: number;
  timeStopHours?: number;
  horizon?: "RAPIDO" | "MEDIO_LONGO";
}

export interface TradePrefill {
  symbol: string;
  side: "BUY" | "SELL";
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  tp1?: number;
  tp2?: number;
  riskReward?: number;
  winProbability?: number;
  reason?: string;
  source?: string;
  timestamp?: number;

  // Gerenciador de Horizonte, Alavancagem e Margem Institucional
  horizon?: "RAPIDO" | "MEDIO_LONGO";
  horizonLabel?: string;
  marginMode?: "SPOT" | "ISOLATED" | "CROSS";
  suggestedLeverage?: number;
  timeStopHours?: number;
  timeStopEnabled?: boolean;
  riskAllocationPercent?: number;
  maxRiskPerTradePercent?: number;
}

export interface SpoofingChartMarker {
  id: string;
  symbol: string;
  timestamp: number;
  price?: number;
  dropPct: number;
  side?: 'BID' | 'ASK' | 'NONE' | 'BUY' | 'SELL';
  severity?: 'WARNING' | 'CRITICAL';
  actionTaken?: string;
  message?: string;
}
