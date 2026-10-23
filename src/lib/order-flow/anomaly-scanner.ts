/**
 * TradeAI - Scanner de Anomalias de Mercado e Order Flow
 *
 * Módulo de inteligência de microestrutura em tempo real:
 * 1. Detector de Volume Anômalo (RVOL e Z-Score >= 3σ)
 * 2. Rastreador de Desbalanceamento de Order Book L2 (Top 5-10 níveis com absorção agressiva >= 70/30)
 */

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBookSnapshot {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export type AnomalyType =
  | "VOLUME_SPIKE_3SIGMA"
  | "BOOK_IMBALANCE_BUY_DOMINANCE"
  | "BOOK_IMBALANCE_SELL_DOMINANCE"
  | "AGGRESSIVE_ABSORPTION";

export interface AnomalyAlert {
  id: string;
  symbol: string;
  type: AnomalyType;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  message: string;
  timestamp: number;
  metrics: {
    rvol?: number;
    zScore?: number;
    currentVolume?: number;
    meanVolume?: number;
    imbalanceRatio?: number; // 0.0 - 1.0 (ex: 0.75 = 75% Bids)
    sustainedDurationMs?: number;
    bidLiquidityUsd?: number;
    askLiquidityUsd?: number;
    bestBid?: number;
    bestAsk?: number;
  };
}

export interface ScannerConfig {
  volumeWindowSize: number;       // Janela de períodos para média e desvio (padrão 20)
  sigmaThreshold: number;          // Múltiplos de desvio-padrão para spike de volume (padrão 3.0)
  imbalanceBuyThreshold: number;   // Limiar de dominância compradora (padrão 0.70 = 70%)
  imbalanceSellThreshold: number;  // Limiar de dominância vendedora (padrão 0.30 = 30%)
  sustainDurationMs: number;       // Duração mínima sustentada em ms para alertar desbalanceamento (padrão 3000ms)
  depthLevels: number;             // Quantidade de níveis superiores do book a considerar (padrão 10)
}

interface ImbalanceState {
  currentDominance: "BUY" | "SELL" | "NEUTRAL";
  startedAtMs: number;
  lastRatio: number;
  hasFiredAlert: boolean;
}

export class OrderFlowAnomalyScanner {
  private static instance: OrderFlowAnomalyScanner | null = null;
  private config: ScannerConfig = {
    volumeWindowSize: 20,
    sigmaThreshold: 3.0,
    imbalanceBuyThreshold: 0.70,
    imbalanceSellThreshold: 0.30,
    sustainDurationMs: 3000,
    depthLevels: 10,
  };

  // Histórico de volumes por símbolo: symbol -> array de volumes passados
  private volumeHistory: Map<string, number[]> = new Map();
  // Estado de sustentação de desbalanceamento por símbolo: symbol -> ImbalanceState
  private imbalanceStates: Map<string, ImbalanceState> = new Map();
  // Lista dos últimos alertas gerados (mantidos em memória para o cockpit da UI)
  private recentAlerts: AnomalyAlert[] = [];
  private listeners: Array<(alert: AnomalyAlert) => void> = [];

  private constructor() {}

  public static getInstance(): OrderFlowAnomalyScanner {
    if (!OrderFlowAnomalyScanner.instance) {
      OrderFlowAnomalyScanner.instance = new OrderFlowAnomalyScanner();
    }
    return OrderFlowAnomalyScanner.instance;
  }

  public updateConfig(newConfig: Partial<ScannerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): ScannerConfig {
    return { ...this.config };
  }

  /**
   * Alimenta um novo volume para análise estatística de anomalia (RVOL & 3σ).
   * Pode ser chamado a cada fechamento de vela ou tick de volume acumulado.
   */
  public processVolumeTick(symbol: string, currentVolume: number, timestamp: number = Date.now()): AnomalyAlert | null {
    const sym = symbol.toUpperCase();
    let history = this.volumeHistory.get(sym);
    if (!history) {
      history = [];
      this.volumeHistory.set(sym, history);
    }

    // Se temos histórico suficiente para calcular média e desvio padrão
    if (history.length >= 5) {
      const mean = history.reduce((sum, v) => sum + v, 0) / history.length;
      const variance = history.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / history.length;
      const stdDev = Math.sqrt(variance);

      const rvol = mean > 0 ? parseFloat((currentVolume / mean).toFixed(2)) : 1.0;
      const zScore = stdDev > 0 ? parseFloat(((currentVolume - mean) / stdDev).toFixed(2)) : 0;

      // Spike anômalo se Z-Score exceder o threshold (ex: > 3σ)
      if (zScore >= this.config.sigmaThreshold) {
        const alert: AnomalyAlert = {
          id: `vol_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          symbol: sym,
          type: "VOLUME_SPIKE_3SIGMA",
          severity: zScore >= 4.5 ? "CRITICAL" : "HIGH",
          message: `Pico de Volume Anômalo detectado em ${sym}: RVOL de ${rvol}x (+${zScore}σ acima da média)`,
          timestamp,
          metrics: {
            rvol,
            zScore,
            currentVolume,
            meanVolume: parseFloat(mean.toFixed(2)),
          },
        };

        this.emitAlert(alert);

        // Adiciona ao histórico limitando a janela
        history.push(currentVolume);
        if (history.length > this.config.volumeWindowSize) {
          history.shift();
        }
        return alert;
      }
    }

    // Adiciona o volume à janela
    history.push(currentVolume);
    if (history.length > this.config.volumeWindowSize) {
      history.shift();
    }
    return null;
  }

  /**
   * Alimenta a profundidade L2 do Order Book para cálculo contínuo da razão de desbalanceamento e absorção.
   */
  public processOrderBook(snapshot: OrderBookSnapshot): AnomalyAlert | null {
    const sym = snapshot.symbol.toUpperCase();
    const levels = this.config.depthLevels;

    const topBids = snapshot.bids.slice(0, levels);
    const topAsks = snapshot.asks.slice(0, levels);

    if (topBids.length === 0 || topAsks.length === 0) return null;

    // Soma ponderada da liquidez nos top níveis (USDT nocional ou volume base)
    const bidVolume = topBids.reduce((sum, b) => sum + b.quantity, 0);
    const askVolume = topAsks.reduce((sum, a) => sum + a.quantity, 0);
    const totalVolume = bidVolume + askVolume;

    if (totalVolume <= 0) return null;

    // Razão de desbalanceamento (0.0 = 100% Asks, 1.0 = 100% Bids, 0.5 = equilíbrio)
    const imbalanceRatio = parseFloat((bidVolume / totalVolume).toFixed(4));
    const now = snapshot.timestamp || Date.now();

    const bestBid = topBids[0]?.price;
    const bestAsk = topAsks[0]?.price;
    const bidLiquidityUsd = topBids.reduce((sum, b) => sum + (b.price * b.quantity), 0);
    const askLiquidityUsd = topAsks.reduce((sum, a) => sum + (a.price * a.quantity), 0);

    let state = this.imbalanceStates.get(sym);
    if (!state) {
      state = { currentDominance: "NEUTRAL", startedAtMs: now, lastRatio: imbalanceRatio, hasFiredAlert: false };
      this.imbalanceStates.set(sym, state);
    }

    state.lastRatio = imbalanceRatio;

    // Checagem de Dominância Compradora (>= 70%)
    if (imbalanceRatio >= this.config.imbalanceBuyThreshold) {
      if (state.currentDominance !== "BUY") {
        state.currentDominance = "BUY";
        state.startedAtMs = now;
        state.hasFiredAlert = false;
      } else {
        const sustainedMs = now - state.startedAtMs;
        if (sustainedMs >= this.config.sustainDurationMs && !state.hasFiredAlert) {
          state.hasFiredAlert = true;
          const alert: AnomalyAlert = {
            id: `imb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            symbol: sym,
            type: "BOOK_IMBALANCE_BUY_DOMINANCE",
            severity: imbalanceRatio >= 0.85 ? "CRITICAL" : "HIGH",
            message: `Desbalanceamento do Book em ${sym}: Compradores dominam ${(imbalanceRatio * 100).toFixed(1)}% da liquidez L2 por ${(sustainedMs / 1000).toFixed(1)}s (Possível Absorção / Pressão de Alta)`,
            timestamp: now,
            metrics: {
              imbalanceRatio,
              sustainedDurationMs: sustainedMs,
              bidLiquidityUsd: parseFloat(bidLiquidityUsd.toFixed(2)),
              askLiquidityUsd: parseFloat(askLiquidityUsd.toFixed(2)),
              bestBid,
              bestAsk,
            },
          };
          this.emitAlert(alert);
          return alert;
        }
      }
    }
    // Checagem de Dominância Vendedora (<= 30%)
    else if (imbalanceRatio <= this.config.imbalanceSellThreshold) {
      if (state.currentDominance !== "SELL") {
        state.currentDominance = "SELL";
        state.startedAtMs = now;
        state.hasFiredAlert = false;
      } else {
        const sustainedMs = now - state.startedAtMs;
        if (sustainedMs >= this.config.sustainDurationMs && !state.hasFiredAlert) {
          state.hasFiredAlert = true;
          const alert: AnomalyAlert = {
            id: `imb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            symbol: sym,
            type: "BOOK_IMBALANCE_SELL_DOMINANCE",
            severity: imbalanceRatio <= 0.15 ? "CRITICAL" : "HIGH",
            message: `Desbalanceamento do Book em ${sym}: Vendedores dominam ${((1 - imbalanceRatio) * 100).toFixed(1)}% da liquidez L2 por ${(sustainedMs / 1000).toFixed(1)}s (Forte Pressão de Queda)`,
            timestamp: now,
            metrics: {
              imbalanceRatio,
              sustainedDurationMs: sustainedMs,
              bidLiquidityUsd: parseFloat(bidLiquidityUsd.toFixed(2)),
              askLiquidityUsd: parseFloat(askLiquidityUsd.toFixed(2)),
              bestBid,
              bestAsk,
            },
          };
          this.emitAlert(alert);
          return alert;
        }
      }
    }
    // Retorno ao equilíbrio
    else {
      state.currentDominance = "NEUTRAL";
      state.hasFiredAlert = false;
      state.startedAtMs = now;
    }

    return null;
  }

  public getRecentAlerts(limit: number = 20): AnomalyAlert[] {
    return this.recentAlerts.slice(0, limit);
  }

  public clearAlerts(): void {
    this.recentAlerts = [];
  }

  public subscribe(callback: (alert: AnomalyAlert) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private emitAlert(alert: AnomalyAlert): void {
    this.recentAlerts.unshift(alert);
    if (this.recentAlerts.length > 100) {
      this.recentAlerts = this.recentAlerts.slice(0, 100);
    }
    for (const listener of this.listeners) {
      try {
        listener(alert);
      } catch (err) {
        console.error("[OrderFlowAnomalyScanner] Erro no listener:", err);
      }
    }
  }
}

export const orderFlowAnomalyScanner = OrderFlowAnomalyScanner.getInstance();
