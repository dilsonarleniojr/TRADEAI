/**
 * OfflineSimulationEngine
 * -----------------------
 * Institutional offline paper trading & market replay engine.
 * Works seamlessly in offline PWA environments:
 * - Geometric Brownian Motion (GBM) synthetic tick generation or offline kline replay
 * - Order execution with realistic friction (Maker/Taker fees, slippage)
 * - Complete local portfolio tracking (Equity curve, Realized/Unrealized PnL, Drawdown)
 */

import { PreciseMath } from '@/lib/bot/pilot/precise-math';

export interface SimulatedOrder {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  price?: number;
  quantity: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  status: 'OPEN' | 'FILLED' | 'CANCELLED';
  createdAt: number;
  filledAt?: number;
  avgFillPrice?: number;
}

export interface SimulatedPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface OfflineSimStats {
  balance: number;
  equity: number;
  initialBalance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number;
  maxDrawdownPct: number;
  peakEquity: number;
}

export interface SyntheticTickConfig {
  initialPrice: number;
  volatility: number; // e.g. 0.02 (2% daily vol)
  drift: number; // e.g. 0.0001
  tickSize: number;
  timeStepSeconds: number;
}

export class OfflineSimulationEngine {
  private balance: number;
  private initialBalance: number;
  private positions: Map<string, SimulatedPosition> = new Map();
  private openOrders: Map<string, SimulatedOrder> = new Map();
  private closedTrades: Array<{
    id: string;
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    realizedPnl: number;
    fee: number;
    closedAt: number;
  }> = [];

  private currentPrices: Map<string, number> = new Map();
  private equityCurve: Array<{ timestamp: number; equity: number }> = [];
  private peakEquity: number;
  private maxDrawdownPct: number = 0;

  // Friction parameters
  private makerFeeRate: number = 0.0002; // 0.02%
  private takerFeeRate: number = 0.0005; // 0.05%
  private slippageRate: number = 0.0003; // 0.03%

  constructor(initialBalance: number = 10000) {
    this.initialBalance = initialBalance;
    this.balance = initialBalance;
    this.peakEquity = initialBalance;
    this.recordEquity(Date.now());
  }

  setPrice(symbol: string, price: number): void {
    this.currentPrices.set(symbol, price);
    this.checkPendingOrders(symbol, price);
    this.updatePositionsPnl(symbol, price);
    this.recordEquity(Date.now());
  }

  getPrice(symbol: string): number {
    return this.currentPrices.get(symbol) || 0;
  }

  /**
   * Generates a synthetic next price using Geometric Brownian Motion (GBM).
   */
  generateSyntheticTick(symbol: string, config: SyntheticTickConfig): number {
    const current = this.currentPrices.get(symbol) || config.initialPrice;
    const dt = config.timeStepSeconds / 86400; // annualized or normalized
    
    // Box-Muller transform for standard normal random number
    const u1 = Math.random() || 1e-7;
    const u2 = Math.random() || 1e-7;
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

    const priceChange =
      current * (config.drift * dt + config.volatility * Math.sqrt(dt) * z);
    let nextPrice = current + priceChange;

    // Round to tickSize
    if (config.tickSize > 0) {
      nextPrice = Math.round(nextPrice / config.tickSize) * config.tickSize;
    }
    nextPrice = Math.max(0.01, nextPrice);

    this.setPrice(symbol, nextPrice);
    return nextPrice;
  }

  /**
   * Places an order in the offline simulator.
   */
  placeOrder(order: Omit<SimulatedOrder, 'id' | 'status' | 'createdAt'>): SimulatedOrder {
    const id = `sim-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newOrder: SimulatedOrder = {
      ...order,
      id,
      status: 'OPEN',
      createdAt: Date.now(),
    };

    const currentPrice = this.getPrice(order.symbol);

    if (order.type === 'MARKET') {
      if (currentPrice <= 0) {
        throw new Error(`Cannot execute MARKET order: No price available for ${order.symbol}`);
      }
      return this.fillOrder(newOrder, currentPrice, true);
    }

    // LIMIT order
    this.openOrders.set(id, newOrder);
    if (currentPrice > 0) {
      this.checkPendingOrders(order.symbol, currentPrice);
    }
    return newOrder;
  }

  /**
   * Closes an existing position at current market price.
   */
  closePosition(symbol: string): number {
    const pos = this.positions.get(symbol);
    if (!pos) return 0;

    const currentPrice = this.getPrice(symbol);
    if (currentPrice <= 0) {
      throw new Error(`No market price available to close position ${symbol}`);
    }

    const effectiveExit =
      pos.side === 'LONG'
        ? currentPrice * (1 - this.slippageRate)
        : currentPrice * (1 + this.slippageRate);

    const pnl =
      pos.side === 'LONG'
        ? (effectiveExit - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - effectiveExit) * pos.quantity;

    const fee = effectiveExit * pos.quantity * this.takerFeeRate;
    const netPnl = pnl - fee;

    this.balance = PreciseMath.add(this.balance, netPnl);
    this.positions.delete(symbol);

    this.closedTrades.push({
      id: `trade-${Date.now()}`,
      symbol,
      side: pos.side,
      entryPrice: pos.entryPrice,
      exitPrice: effectiveExit,
      quantity: pos.quantity,
      realizedPnl: netPnl,
      fee,
      closedAt: Date.now(),
    });

    this.recordEquity(Date.now());
    return netPnl;
  }

  getStats(): OfflineSimStats {
    let totalUnrealized = 0;
    this.positions.forEach((pos) => {
      totalUnrealized = PreciseMath.add(totalUnrealized, pos.unrealizedPnl);
    });

    const equity = PreciseMath.add(this.balance, totalUnrealized);
    const realizedPnl = this.closedTrades.reduce((acc, t) => acc + t.realizedPnl, 0);

    const wins = this.closedTrades.filter((t) => t.realizedPnl > 0).length;
    const losses = this.closedTrades.filter((t) => t.realizedPnl < 0).length;
    const totalTrades = this.closedTrades.length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    return {
      balance: Number(this.balance.toFixed(2)),
      equity: Number(equity.toFixed(2)),
      initialBalance: this.initialBalance,
      realizedPnl: Number(realizedPnl.toFixed(2)),
      unrealizedPnl: Number(totalUnrealized.toFixed(2)),
      totalTrades,
      winningTrades: wins,
      losingTrades: losses,
      winRatePct: Number(winRate.toFixed(2)),
      maxDrawdownPct: Number(this.maxDrawdownPct.toFixed(2)),
      peakEquity: Number(this.peakEquity.toFixed(2)),
    };
  }

  getPositions(): SimulatedPosition[] {
    return Array.from(this.positions.values());
  }

  getClosedTrades() {
    return [...this.closedTrades];
  }

  // --- Private Execution Routines ---

  private fillOrder(order: SimulatedOrder, marketPrice: number, isTaker: boolean): SimulatedOrder {
    const feeRate = isTaker ? this.takerFeeRate : this.makerFeeRate;
    const slippage = isTaker ? (order.side === 'BUY' ? this.slippageRate : -this.slippageRate) : 0;
    const fillPrice = marketPrice * (1 + slippage);
    const notional = fillPrice * order.quantity;
    const fee = notional * feeRate;

    // Update position
    const existing = this.positions.get(order.symbol);
    if (!existing) {
      const side = order.side === 'BUY' ? 'LONG' : 'SHORT';
      this.positions.set(order.symbol, {
        symbol: order.symbol,
        side,
        quantity: order.quantity,
        entryPrice: fillPrice,
        currentPrice: marketPrice,
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
        stopLoss: order.stopLossPrice,
        takeProfit: order.takeProfitPrice,
      });
      this.balance = PreciseMath.subtract(this.balance, fee);
    } else {
      // Closing or adding to position
      if (
        (existing.side === 'LONG' && order.side === 'SELL') ||
        (existing.side === 'SHORT' && order.side === 'BUY')
      ) {
        // Reducing / Closing position
        const pnl =
          existing.side === 'LONG'
            ? (fillPrice - existing.entryPrice) * order.quantity
            : (existing.entryPrice - fillPrice) * order.quantity;
        const netPnl = pnl - fee;
        this.balance = PreciseMath.add(this.balance, netPnl);

        if (order.quantity >= existing.quantity) {
          this.positions.delete(order.symbol);
        } else {
          existing.quantity = PreciseMath.subtract(existing.quantity, order.quantity);
        }

        this.closedTrades.push({
          id: `trade-${Date.now()}`,
          symbol: order.symbol,
          side: existing.side,
          entryPrice: existing.entryPrice,
          exitPrice: fillPrice,
          quantity: order.quantity,
          realizedPnl: netPnl,
          fee,
          closedAt: Date.now(),
        });
      } else {
        // Increasing position size
        const totalQty = PreciseMath.add(existing.quantity, order.quantity);
        const weightedEntry =
          (existing.entryPrice * existing.quantity + fillPrice * order.quantity) / totalQty;
        existing.entryPrice = weightedEntry;
        existing.quantity = totalQty;
        this.balance = PreciseMath.subtract(this.balance, fee);
      }
    }

    order.status = 'FILLED';
    order.filledAt = Date.now();
    order.avgFillPrice = fillPrice;
    this.openOrders.delete(order.id);
    return order;
  }

  private checkPendingOrders(symbol: string, price: number): void {
    // Check stop loss / take profit triggers on open positions
    const pos = this.positions.get(symbol);
    if (pos) {
      if (pos.side === 'LONG') {
        if (pos.stopLoss && price <= pos.stopLoss) {
          this.closePosition(symbol);
          return;
        }
        if (pos.takeProfit && price >= pos.takeProfit) {
          this.closePosition(symbol);
          return;
        }
      } else {
        if (pos.stopLoss && price >= pos.stopLoss) {
          this.closePosition(symbol);
          return;
        }
        if (pos.takeProfit && price <= pos.takeProfit) {
          this.closePosition(symbol);
          return;
        }
      }
    }

    // Check open limit orders
    this.openOrders.forEach((order) => {
      if (order.symbol === symbol && order.price !== undefined) {
        if (order.side === 'BUY' && price <= order.price) {
          this.fillOrder(order, order.price, false);
        } else if (order.side === 'SELL' && price >= order.price) {
          this.fillOrder(order, order.price, false);
        }
      }
    });
  }

  private updatePositionsPnl(symbol: string, currentPrice: number): void {
    const pos = this.positions.get(symbol);
    if (!pos) return;

    pos.currentPrice = currentPrice;
    const diff =
      pos.side === 'LONG'
        ? currentPrice - pos.entryPrice
        : pos.entryPrice - currentPrice;

    pos.unrealizedPnl = diff * pos.quantity;
    pos.unrealizedPnlPct = (diff / pos.entryPrice) * 100;
  }

  private recordEquity(timestamp: number): void {
    let totalUnrealized = 0;
    this.positions.forEach((p) => {
      totalUnrealized += p.unrealizedPnl;
    });
    const currentEquity = this.balance + totalUnrealized;
    this.equityCurve.push({ timestamp, equity: currentEquity });

    if (currentEquity > this.peakEquity) {
      this.peakEquity = currentEquity;
    }

    const dd =
      this.peakEquity > 0
        ? ((this.peakEquity - currentEquity) / this.peakEquity) * 100
        : 0;
    if (dd > this.maxDrawdownPct) {
      this.maxDrawdownPct = dd;
    }
  }
}
