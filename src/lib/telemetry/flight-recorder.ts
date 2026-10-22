import { CircularBuffer } from "./circular-buffer";
import { structuredLogger } from "./structured-logger";

export interface BookLevel {
  price: number;
  quantity: number;
}

export interface FlightRecorderOrderBookSnapshot {
  symbol: string;
  timestamp: number;
  bids: BookLevel[]; // Top 10 bids
  asks: BookLevel[]; // Top 10 asks
  spread: number;
  spreadPercent: number;
}

export interface FlightRecorderTrade {
  id: string;
  timestamp: number;
  price: number;
  quantity: number;
  side: "BUY" | "SELL";
}

export interface FlightRecorderBotState {
  botId: string;
  botName: string;
  strategy: string;
  symbol: string;
  entryPrice?: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  trailingStopActive?: boolean;
  trailingStopPrice?: number;
  availableBalanceUsdt?: number;
  indicators?: {
    rsi?: number;
    emaFast?: number;
    emaSlow?: number;
    atr?: number;
    orderFlowImbalance?: number;
  };
}

export interface FlightSnapshot {
  id: string;
  timestamp: number;
  formattedTime: string;
  triggerReason:
    | "ORDER_REJECTED"
    | "STOP_LOSS_TRIGGERED"
    | "PRICE_ANOMALY_SPREAD_SPIKE"
    | "CIRCUIT_BREAKER_TRIPPED"
    | "MANUAL_OPERATOR_TRIGGER";
  symbol: string;
  details: string;
  botState?: FlightRecorderBotState;
  orderBook: FlightRecorderOrderBookSnapshot;
  recentTrades: FlightRecorderTrade[];
}

export class FlightRecorder {
  private recentTradesBuffer = new Map<string, CircularBuffer<FlightRecorderTrade>>();
  private lastBookSnapshots = new Map<string, FlightRecorderOrderBookSnapshot>();
  private snapshotsBuffer = new CircularBuffer<FlightSnapshot>(50);

  /**
   * Alimenta a fita contínua de trades para garantir que o snapshot
   * pós-mortem contenha os últimos 20 trades executados no instante exato.
   */
  recordTrade(symbol: string, trade: FlightRecorderTrade): void {
    const sym = symbol.toUpperCase();
    if (!this.recentTradesBuffer.has(sym)) {
      this.recentTradesBuffer.set(sym, new CircularBuffer<FlightRecorderTrade>(20));
    }
    this.recentTradesBuffer.get(sym)!.push(trade);
  }

  /**
   * Atualiza o estado L2 do livro de ofertas para o símbolo (top 10).
   */
  updateOrderBookSnapshot(
    symbol: string,
    bids: [string | number, string | number][],
    asks: [string | number, string | number][]
  ): void {
    const sym = symbol.toUpperCase();
    const parsedBids: BookLevel[] = bids.slice(0, 10).map(([p, q]) => ({
      price: typeof p === "string" ? parseFloat(p) : p,
      quantity: typeof q === "string" ? parseFloat(q) : q,
    }));
    const parsedAsks: BookLevel[] = asks.slice(0, 10).map(([p, q]) => ({
      price: typeof p === "string" ? parseFloat(p) : p,
      quantity: typeof q === "string" ? parseFloat(q) : q,
    }));

    const bestBid = parsedBids[0]?.price || 0;
    const bestAsk = parsedAsks[0]?.price || 0;
    const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
    const spreadPercent = bestBid > 0 ? (spread / bestBid) * 100 : 0;

    this.lastBookSnapshots.set(sym, {
      symbol: sym,
      timestamp: Date.now(),
      bids: parsedBids,
      asks: parsedAsks,
      spread,
      spreadPercent,
    });
  }

  /**
   * Grava imediatamente um snapshot pós-mortem (Flight Recorder)
   * acionado em caso de anomalia, rejeição de ordem ou stop loss.
   */
  captureSnapshot(
    triggerReason: FlightSnapshot["triggerReason"],
    symbol: string,
    details: string,
    botState?: FlightRecorderBotState
  ): FlightSnapshot {
    const sym = symbol.toUpperCase();
    const now = Date.now();
    const date = new Date(now);
    const pad = (n: number, z = 2) => String(n).padStart(z, "0");
    const formattedTime = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(
      date.getMilliseconds(),
      3
    )}`;

    const orderBook: FlightRecorderOrderBookSnapshot = this.lastBookSnapshots.get(sym) || {
      symbol: sym,
      timestamp: now,
      bids: [],
      asks: [],
      spread: 0,
      spreadPercent: 0,
    };

    const tradesBuffer = this.recentTradesBuffer.get(sym);
    const recentTrades = tradesBuffer ? tradesBuffer.toArrayReversed() : [];

    const snapshot: FlightSnapshot = {
      id: `snapshot-${now}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: now,
      formattedTime,
      triggerReason,
      symbol: sym,
      details,
      botState,
      orderBook,
      recentTrades,
    };

    this.snapshotsBuffer.push(snapshot);

    structuredLogger.critical("RISK_ENGINE", `🚨 [FLIGHT_RECORDER] Snapshot pós-mortem salvo: ${triggerReason} em ${sym}. Motivo: ${details}`, {
      symbol: sym,
      botId: botState?.botId,
      metadata: { snapshotId: snapshot.id, spreadPercent: orderBook.spreadPercent },
    });

    return snapshot;
  }

  getSnapshots(): FlightSnapshot[] {
    return this.snapshotsBuffer.toArrayReversed();
  }

  getLatestSnapshot(): FlightSnapshot | null {
    const all = this.snapshotsBuffer.toArrayReversed();
    return all.length > 0 ? all[0] : null;
  }

  exportSnapshotJson(snapshotId?: string): string {
    const snapshots = this.getSnapshots();
    const target = snapshotId ? snapshots.find((s) => s.id === snapshotId) : snapshots[0];
    if (!target) {
      return JSON.stringify({ error: "Nenhum snapshot pós-mortem disponível para exportação" }, null, 2);
    }
    return JSON.stringify(target, null, 2);
  }

  clear(): void {
    this.snapshotsBuffer.clear();
    this.recentTradesBuffer.clear();
    this.lastBookSnapshots.clear();
  }
}

export const flightRecorder = new FlightRecorder();
