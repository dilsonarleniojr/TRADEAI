# -*- coding: utf-8 -*-
"""
TRADEAI — Hyperparameter and Execution Engine Optimizer
Runs automated parameter searches (Grid, Random, Bayesian, Evolutionary)
under realistic matching engine conditions: latency, slippage, order slicing,
throttling, and time-in-force limits.
"""

import os
import sys
import time
import json
import csv
import math
import random
import argparse
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("HyperOptimizer")

# Import numpy, pandas, scipy
try:
    import numpy as np
    import pandas as pd
except ImportError:
    logger.error("Please run this script using 'uv run --with numpy --with pandas'")
    sys.exit(1)


from binance import Client

# =============================================================================
# SECTION 1: DATA FETCHER
# =============================================================================
def fetch_binance_data(symbol: str, days: int) -> pd.DataFrame:
    """
    Fetches historical k-line data from Binance.
    """
    logger.info(f"Fetching historical data for {symbol} ({days} days)...")
    client = Client()
    # Fetching 1-minute k-lines
    klines = client.get_historical_klines(symbol, Client.KLINE_INTERVAL_1MINUTE, f"{days} days ago UTC")
    
    df = pd.DataFrame(klines, columns=[
        'timestamp', 'open', 'high', 'low', 'close', 'volume', 'close_time',
        'quote_asset_volume', 'number_of_trades', 'taker_buy_base_asset_volume',
        'taker_buy_quote_asset_volume', 'ignore'
    ])
    
    # Basic data cleaning and type conversion
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms').dt.tz_localize('UTC').dt.tz_convert(None)
    
    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = pd.to_numeric(df[col])
        
    # Simulate tick-level data from k-line data
    df['bid_price'] = df['close'] * 0.9999
    df['ask_price'] = df['close'] * 1.0001
    df['last_price'] = df['close']
    df['bid_size'] = df['volume'] / 2
    df['ask_size'] = df['volume'] / 2
    
    # Convert timestamp to unix timestamp
    df['timestamp'] = df['timestamp'].apply(lambda x: x.timestamp())

    return df


# =============================================================================
# SECTION 2: MATCHING ENGINE SIMULATOR
# =============================================================================
class SimulatedMatchingEngine:
    def __init__(self, 
                 initial_balance: float = 1000000.0, 
                 commission_pct: float = 0.00075, # 7.5 bps
                 latency_ms: float = 50.0,
                 batch_size: int = 5,
                 batching_window_ms: float = 50.0,
                 throttling_limit_per_s: int = 100,
                 slippage_model: str = "dynamic"):
        self.cash = initial_balance
        self.portfolio_value = initial_balance
        self.position = 0.0
        self.avg_entry_price = 0.0
        self.commission_pct = commission_pct
        self.latency_s = latency_ms / 1000.0
        self.batch_size = batch_size
        self.batching_window_s = batching_window_ms / 1000.0
        self.throttling_limit = throttling_limit_per_s
        self.slippage_model = slippage_model
        
        # State tracking
        self.trades = []
        self.orders_sent_in_last_s = [] # timestamps of orders
        self.batch_queue = [] # orders waiting to be batched
        self.last_batch_time = 0.0
        
        # Statistics
        self.total_orders_submitted = 0
        self.total_orders_filled = 0
        self.total_orders_rejected = 0
        self.total_slippage_bps = 0.0
        self.total_commissions = 0.0
        
        # Active working limit orders
        self.working_orders = [] # list of dicts

    def process_order(self, order: dict, current_time: float, current_book: dict):
        """
        Ingests order and applies throttling, latency delay, and batching.
        Order structure: {id, side, type, price, qty, time_in_force, callback}
        """
        self.total_orders_submitted += 1
        
        # 1. Check Throttling
        # Clean older orders from throttling log
        self.orders_sent_in_last_s = [t for t in self.orders_sent_in_last_s if current_time - t < 1.0]
        if len(self.orders_sent_in_last_s) >= self.throttling_limit:
            self.total_orders_rejected += 1
            logger.debug("Order rejected due to throttling limit.")
            return {"status": "REJECTED_THROTTLED", "price": 0.0, "qty": 0.0}
            
        self.orders_sent_in_last_s.append(current_time)
        
        # 2. Add Latency Delay (dispatch timestamp)
        order["dispatch_time"] = current_time + self.latency_s
        
        # 3. Add to batching queue
        self.batch_queue.append(order)
        return {"status": "QUEUED"}

    def run_matching_logic(self, current_time: float, current_book: dict):
        """
        Simulates the batching window and matches the queued orders.
        """
        fills = []
        
        # Execute batch if time window or size limit is reached
        time_elapsed_since_batch = current_time - self.last_batch_time
        if len(self.batch_queue) >= self.batch_size or (self.batch_queue and time_elapsed_since_batch >= self.batching_window_s):
            self.last_batch_time = current_time
            
            # Process batched orders that have surpassed their latency delay
            runnable_orders = [o for o in self.batch_queue if current_time >= o["dispatch_time"]]
            self.batch_queue = [o for o in self.batch_queue if current_time < o["dispatch_time"]]
            
            for order in runnable_orders:
                fill = self._execute_matching(order, current_book, current_time)
                if fill:
                    fills.append(fill)
                    
        # Also process working limit orders against current book
        still_working = []
        for order in self.working_orders:
            fill = self._match_limit_order(order, current_book, current_time)
            if fill:
                fills.append(fill)
            else:
                still_working.append(order)
        self.working_orders = still_working
        
        return fills

    def _execute_matching(self, order: dict, book: dict, timestamp: float) -> dict:
        """
        Matches an order immediately or places it as working order based on type and TIF.
        """
        side = order["side"]
        qty = order["qty"]
        price = order["price"]
        tif = order.get("time_in_force", "GTC")
        
        bid = book["bid_price"]
        ask = book["ask_price"]
        bid_sz = book["bid_size"]
        ask_sz = book["ask_size"]
        
        if order["type"] == "MARKET":
            # Market orders execute immediately at best ask (BUY) or best bid (SELL)
            execution_price = ask if side == "BUY" else bid
            book_depth = ask_sz if side == "BUY" else bid_sz
            
            # Apply slippage model
            slippage = self._calculate_slippage(qty, execution_price, book_depth, book)
            if side == "BUY":
                final_price = execution_price + slippage
            else:
                final_price = execution_price - slippage
                
            # Log slippage in bps
            sl_bps = (slippage / execution_price) * 10000 if execution_price > 0 else 0
            self.total_slippage_bps += sl_bps
            
            fill = self._execute_fill(order["id"], side, qty, final_price, timestamp, "MARKET_FILL")
            self.total_orders_filled += 1
            return fill
            
        elif order["type"] == "LIMIT":
            # Check if limit matches immediately
            if side == "BUY" and price >= ask:
                # Immediate matching
                final_price = ask # matched at best ask
                fill = self._execute_fill(order["id"], side, qty, final_price, timestamp, "LIMIT_IOC_FILL")
                self.total_orders_filled += 1
                return fill
            elif side == "SELL" and price <= bid:
                final_price = bid # matched at best bid
                fill = self._execute_fill(order["id"], side, qty, final_price, timestamp, "LIMIT_IOC_FILL")
                self.total_orders_filled += 1
                return fill
            else:
                # Limit order doesn't match immediately
                if tif == "GTC":
                    self.working_orders.append(order)
                elif tif in ["IOC", "FOK"]:
                    self.total_orders_rejected += 1
                    logger.debug(f"Limit order {order['id']} cancelled due to TIF: {tif}")
                return None

    def _match_limit_order(self, order: dict, book: dict, timestamp: float) -> dict:
        """
        Checks if working limit order is filled by new tick.
        """
        side = order["side"]
        qty = order["qty"]
        price = order["price"]
        
        low = book["bid_price"] # conservative estimate
        high = book["ask_price"]
        
        if side == "BUY" and low <= price:
            # Filled
            fill = self._execute_fill(order["id"], side, qty, price, timestamp, "LIMIT_BOOK_FILL")
            self.total_orders_filled += 1
            return fill
        elif side == "SELL" and high >= price:
            fill = self._execute_fill(order["id"], side, qty, price, timestamp, "LIMIT_BOOK_FILL")
            self.total_orders_filled += 1
            return fill
        return None

    def _calculate_slippage(self, qty: float, price: float, book_depth: float, book: dict) -> float:
        """
        Applies requested slippage model (fixed, proportional, dynamic)
        """
        if self.slippage_model == "fixed":
            # 2 bps fixed slippage
            return price * 0.0002
            
        elif self.slippage_model == "proportional":
            # Slippage scales with order quantity relative to book depth
            ratio = qty / (book_depth if book_depth > 0 else 1.0)
            return price * 0.0002 * (1.0 + ratio)
            
        elif self.slippage_model == "dynamic":
            # Real dynamic model incorporating spread, size vs depth, volatility
            half_spread = (book["ask_price"] - book["bid_price"]) / 2.0
            ratio = qty / (book_depth if book_depth > 0 else 0.1)
            volatility_factor = abs(book["ask_price"] - book["last_price"]) / book["last_price"]
            
            # Base slippage is half the spread + premium for executing large sizes
            slippage = half_spread + price * 0.0001 * math.sqrt(ratio) * (1.0 + 10.0 * volatility_factor)
            
            # Latency penalty: if latency is high, add drift penalty
            latency_penalty = price * 0.00005 * (self.latency_s * 10.0)
            return slippage + latency_penalty
            
        return 0.0

    def _execute_fill(self, order_id: str, side: str, qty: float, price: float, timestamp: float, reason: str) -> dict:
        """
        Updates capital, position, average price and records trade.
        """
        trade_value = qty * price
        comm = trade_value * self.commission_pct
        self.total_commissions += comm
        
        if side == "BUY":
            # Deduct cash, increase position
            self.cash -= (trade_value + comm)
            # Update avg cost
            total_qty = self.position + qty
            if total_qty > 0:
                self.avg_entry_price = (self.position * self.avg_entry_price + trade_value) / total_qty
            self.position = total_qty
            pnl = 0.0
        else:
            # Sell: Increase cash, decrease position
            pnl = (price - self.avg_entry_price) * qty if self.position > 0 else 0.0
            self.cash += (trade_value - comm)
            self.position = max(0.0, self.position - qty)
            if self.position == 0.0:
                self.avg_entry_price = 0.0
                
        trade = {
            "id": f"t_{order_id}_{int(timestamp*1000)}",
            "side": side,
            "price": price,
            "quantity": qty,
            "total": trade_value,
            "commission": comm,
            "pnl": pnl,
            "timestamp": timestamp,
            "reason": reason
        }
        self.trades.append(trade)
        return trade

    def update_portfolio_value(self, current_price: float):
        self.portfolio_value = self.cash + self.position * current_price


# =============================================================================
# SECTION 3: STRATEGIES PIPELINE
# =============================================================================
class DynamicExitCalculator:
    def calculate_targets(
        self, entry_price: float, atr: float, order_book: dict, side: str = "BUY"
    ):
        # The order book in the simulated data is just bid/ask price and size,
        # not a full order book. We'll simulate some liquidity walls.
        bids = [(order_book['bid_price'], order_book['bid_size'])]
        asks = [(order_book['ask_price'], order_book['ask_size'])]

        support_wall = max(bids, key=lambda x: x[1])[0] if bids else entry_price * 0.98
        resistance_wall = max(asks, key=lambda x: x[1])[0] if asks else entry_price * 1.02

        if side == "BUY":
            stop_loss = min(support_wall - (1.5 * atr), entry_price * 0.95)
            take_profit = max(resistance_wall - (0.5 * atr), entry_price * 1.02)
        else: # SELL
            stop_loss = max(resistance_wall + (1.5 * atr), entry_price * 1.05)
            take_profit = min(support_wall + (0.5 * atr), entry_price * 0.98)
            
        return {"stop_loss": stop_loss, "take_profit": take_profit}

def calculate_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Calculates the Average True Range (ATR)."""
    high_low = df['ask_price'] - df['bid_price'] # Using ask/bid as high/low for tick data
    high_close = np.abs(df['ask_price'] - df['last_price'].shift())
    low_close = np.abs(df['bid_price'] - df['last_price'].shift())
    
    tr = np.max([high_low, high_close, low_close], axis=0)
    
    return pd.Series(tr).rolling(window=period).mean()

class IntradayStrategyEvaluator:
    def __init__(self, df: pd.DataFrame, strategy: str, initial_balance: float = 1000000.0):
        self.df = df
        self.strategy = strategy
        self.initial_balance = initial_balance

    def evaluate(self, params: dict, engine_config: dict) -> dict:
        """
        Runs full backtest of the strategy on the tick data using the SimulatedMatchingEngine.
        Returns detailed performance metrics and equity curve.
        """
        # Instantiate matching engine
        engine = SimulatedMatchingEngine(
            initial_balance=self.initial_balance,
            commission_pct=0.00075,
            latency_ms=engine_config.get("latency_ms", 50.0),
            batch_size=engine_config.get("batch_size", 5),
            batching_window_ms=engine_config.get("batching_window_ms", 50.0),
            throttling_limit_per_s=engine_config.get("throttling_limit_per_s", 100),
            slippage_model=engine_config.get("slippage_model", "dynamic")
        )
        
        exit_calculator = DynamicExitCalculator()
        self.df['atr'] = calculate_atr(self.df)

        position_size_pct = params.get("position_size_pct", 1.0) / 100.0
        order_slices = int(params.get("order_slices", 1))
        reevaluation_interval = params.get("reevaluation_interval_s", 1.0)
        
        last_eval_time = 0.0
        order_id_counter = 0
        
        # Active slicing jobs
        # job: {side, total_qty, filled_qty, slices_remaining, price_limit}
        slicing_jobs = []
        
        equity_curve = []
        timestamps = self.df["timestamp"].values
        bids = self.df["bid_price"].values
        asks = self.df["ask_price"].values
        bid_sizes = self.df["bid_size"].values
        ask_sizes = self.df["ask_size"].values
        lasts = self.df["last_price"].values
        volumes = self.df["volume"].values
        atrs = self.df["atr"].values

        # Precompute indicators for Momentum (Fast EMA / Slow EMA on tick steps)
        # Using simple exponential smoothing tracking inside the loop for memory efficiency
        fast_period = params.get("ema_fast", 50)
        slow_period = params.get("ema_slow", 150)
        fast_alpha = 2.0 / (fast_period + 1.0)
        slow_alpha = 2.0 / (slow_period + 1.0)
        
        ema_fast = lasts[0]
        ema_slow = lasts[0]
        prev_ema_fast = ema_fast
        prev_ema_slow = ema_slow
        
        stride = 1
        total_len = len(self.df)
        ticks_per_day = 43200
        
        # Risk Manager limits
        max_drawdown_limit = params.get("max_drawdown_limit_pct", 10.0) / 100.0
        highest_equity = self.initial_balance
        kill_switch_activated = False
        
        for idx in range(1, total_len, stride):
            t = timestamps[idx]
            bid = bids[idx]
            ask = asks[idx]
            bid_sz = bid_sizes[idx]
            ask_sz = ask_sizes[idx]
            last = lasts[idx]
            vol = volumes[idx]
            atr = atrs[idx]
            
            book = {
                "bid_price": bid,
                "ask_price": ask,
                "bid_size": bid_sz,
                "ask_size": ask_sz,
                "last_price": last,
                "volume": vol,
                "bids": [[bid, bid_sz]],
                "asks": [[ask, ask_sz]]
            }
            
            # Check matching engine active limit orders and batching
            fills = engine.run_matching_logic(t, book)
            
            # Update equity
            engine.update_portfolio_value(last)
            
            # Kill Switch Check
            if engine.portfolio_value > highest_equity:
                highest_equity = engine.portfolio_value
            dd = (highest_equity - engine.portfolio_value) / highest_equity
            if dd >= max_drawdown_limit and not kill_switch_activated:
                kill_switch_activated = True
                logger.warning(f"🚨 RISK MANAGER: Kill Switch triggered! Drawdown {dd*100:.2f}% exceeds limit of {max_drawdown_limit*100:.2f}%. Liquidating position.")
                # Cancel all working orders
                engine.working_orders = []
                engine.batch_queue = []
                # Place market order to liquidate
                if engine.position > 0:
                    order_id_counter += 1
                    engine.process_order({
                        "id": f"kill_{order_id_counter}",
                        "side": "SELL",
                        "type": "MARKET",
                        "price": bid,
                        "qty": engine.position,
                        "time_in_force": "IOC"
                    }, t, book)
                continue
                
            if kill_switch_activated:
                continue

            # Update indicators
            prev_ema_fast = ema_fast
            prev_ema_slow = ema_slow
            ema_fast = last * fast_alpha + ema_fast * (1 - fast_alpha)
            ema_slow = last * slow_alpha + ema_slow * (1 - slow_alpha)
            
            # 1. Process active slicing jobs
            still_slicing = []
            for job in slicing_jobs:
                if job["slices_remaining"] > 0 and t - job["last_slice_time"] >= reevaluation_interval:
                    job["slices_remaining"] -= 1
                    job["last_slice_time"] = t
                    
                    slice_qty = job["slice_size"]
                    order_id_counter += 1
                    engine.process_order({
                        "id": f"slice_{order_id_counter}",
                        "side": job["side"],
                        "type": "MARKET",
                        "price": ask if job["side"] == "BUY" else bid,
                        "qty": slice_qty,
                        "time_in_force": "IOC"
                    }, t, book)
                    
                if job["slices_remaining"] > 0:
                    still_slicing.append(job)
            slicing_jobs = still_slicing

            # 2. Evaluate Strategy signal at intervals
            if t - last_eval_time >= reevaluation_interval:
                last_eval_time = t
                
                # Check Stop Loss & Take Profit
                if engine.position > 0 and engine.avg_entry_price > 0:
                    targets = exit_calculator.calculate_targets(engine.avg_entry_price, atr, book, "BUY")
                    sl_price = targets["stop_loss"]
                    tp_price = targets["take_profit"]
                    
                    # Stop loss triggered
                    if bid <= sl_price:
                        order_id_counter += 1
                        engine.process_order({
                            "id": f"sl_{order_id_counter}",
                            "side": "SELL",
                            "type": "MARKET",
                            "price": bid,
                            "qty": engine.position,
                            "time_in_force": "IOC"
                        }, t, book)
                        continue
                    # Take profit triggered
                    elif ask >= tp_price:
                        order_id_counter += 1
                        engine.process_order({
                            "id": f"tp_{order_id_counter}",
                            "side": "SELL",
                            "type": "MARKET",
                            "price": bid,
                            "qty": engine.position,
                            "time_in_force": "IOC"
                        }, t, book)
                        continue
                    # Golden Cross (BUY)
                    if prev_ema_fast <= prev_ema_slow and ema_fast > ema_slow and engine.position == 0:
                        target_capital = engine.portfolio_value * position_size_pct
                        qty = target_capital / ask
                        
                        if order_slices > 1:
                            slicing_jobs.append({
                                "side": "BUY",
                                "slice_size": qty / order_slices,
                                "slices_remaining": order_slices,
                                "last_slice_time": t
                            })
                        else:
                            order_id_counter += 1
                            engine.process_order({
                                "id": f"buy_{order_id_counter}",
                                "side": "BUY",
                                "type": "MARKET",
                                "price": ask,
                                "qty": qty,
                                "time_in_force": "GTC"
                            }, t, book)
                            
                    # Death Cross (SELL)
                    elif prev_ema_fast >= prev_ema_slow and ema_fast < ema_slow and engine.position > 0:
                        qty = engine.position
                        if order_slices > 1:
                            slicing_jobs.append({
                                "side": "SELL",
                                "slice_size": qty / order_slices,
                                "slices_remaining": order_slices,
                                "last_slice_time": t
                            })
                        else:
                            order_id_counter += 1
                            engine.process_order({
                                "id": f"sell_{order_id_counter}",
                                "side": "SELL",
                                "type": "MARKET",
                                "price": bid,
                                "qty": qty,
                                "time_in_force": "GTC"
                            }, t, book)
                            
                elif self.strategy == "Market Making":
                    # Market Making places limit buy below bid, limit sell above ask
                    engine.working_orders = [o for o in engine.working_orders if not o["id"].startswith("mm_")]
                    
                    mm_spread = params.get("mm_spread_pct", 0.05) / 100.0
                    buy_limit = bid * (1.0 - mm_spread)
                    sell_limit = ask * (1.0 + mm_spread)
                    
                    target_qty = (engine.portfolio_value * position_size_pct) / last
                    
                    order_id_counter += 1
                    engine.process_order({
                        "id": f"mm_buy_{order_id_counter}",
                        "side": "BUY",
                        "type": "LIMIT",
                        "price": buy_limit,
                        "qty": target_qty,
                        "time_in_force": "GTC"
                    }, t, book)
                    
                    order_id_counter += 1
                    engine.process_order({
                        "id": f"mm_sell_{order_id_counter}",
                        "side": "SELL",
                        "type": "LIMIT",
                        "price": sell_limit,
                        "qty": target_qty,
                        "time_in_force": "GTC"
                    }, t, book)
            
            # Decimate equity curve logging to avoid massive arrays in JSON
            log_interval = max(100, ticks_per_day // 10)
            if idx % log_interval == 0:
                dt_str = datetime.fromtimestamp(t).strftime('%Y-%m-%d %H:%M')
                equity_curve.append({
                    "time": int(t * 1000),
                    "date": dt_str,
                    "value": round(engine.portfolio_value, 2)
                })
        
        # End of backtest: Force close position
        if engine.position > 0:
            final_bid = bids[-1]
            trade_val = engine.position * final_bid
            comm = trade_val * engine.commission_pct
            engine.cash += (trade_val - comm)
            engine.position = 0.0
            engine.portfolio_value = engine.cash
            
        # Calculate daily returns for Sharpe/Sortino
        eq_df = pd.DataFrame(equity_curve)
        if len(eq_df) > 1:
            eq_df["daily_val"] = eq_df["value"]
            daily_returns = eq_df["daily_val"].pct_change().dropna().values
        else:
            daily_returns = np.array([0.0])
            
        # Sharpe & Sortino Ratios (Annualized)
        rf_daily = 0.02 / 252.0
        avg_ret = np.mean(daily_returns) if len(daily_returns) > 0 else 0.0
        std_ret = np.std(daily_returns) if len(daily_returns) > 1 else 0.0
        
        sharpe = ((avg_ret - rf_daily) / std_ret) * math.sqrt(252) if std_ret > 0 else 0.0
        
        downside_returns = daily_returns[daily_returns < 0]
        downside_std = np.std(downside_returns) if len(downside_returns) > 1 else 0.0
        sortino = ((avg_ret - rf_daily) / downside_std) * math.sqrt(252) if downside_std > 0 else (99.0 if avg_ret > 0 else 0.0)
        
        # Max Drawdown calculation
        peak = self.initial_balance
        max_dd = 0.0
        for eq in equity_curve:
            val = eq["value"]
            if val > peak:
                peak = val
            dd = (peak - val) / peak
            if dd > max_dd:
                max_dd = dd
                
        # Fill Rate
        fill_rate = (engine.total_orders_filled / engine.total_orders_submitted * 100.0) if engine.total_orders_submitted > 0 else 0.0
        
        # Avg Slippage
        avg_slippage = (engine.total_slippage_bps / engine.total_orders_filled) if engine.total_orders_filled > 0 else 0.0
        
        metrics = {
            "initial_balance": self.initial_balance,
            "final_balance": round(engine.portfolio_value, 2),
            "net_pnl": round(engine.portfolio_value - self.initial_balance, 2),
            "net_pnl_pct": round((engine.portfolio_value - self.initial_balance) / self.initial_balance * 100.0, 2),
            "sharpe": round(float(sharpe), 2),
            "sortino": round(float(sortino), 2),
            "max_drawdown_pct": round(max_dd * 100.0, 2),
            "total_orders_submitted": engine.total_orders_submitted,
            "total_orders_filled": engine.total_orders_filled,
            "total_orders_rejected": engine.total_orders_rejected,
            "fill_rate_pct": round(fill_rate, 2),
            "avg_slippage_bps": round(avg_slippage, 2),
            "execution_cost": round(engine.total_commissions + (engine.total_slippage_bps / 10000.0 * self.initial_balance), 2),
            "equity_curve": equity_curve,
            "trades": engine.trades
        }
        return metrics


# =============================================================================
# SECTION 4: SEARCH ALGORITHMS
# =============================================================================
class HyperparameterOptimizer:
    def __init__(self, evaluator: IntradayStrategyEvaluator, method: str, num_iterations: int = 20):
        self.evaluator = evaluator
        self.method = method
        self.num_iterations = num_iterations
        
        # Parameter bounds
        self.param_bounds = {
            "position_size_pct": (0.1, 5.0),    # Continuous %
            "order_slices": (1, 20),            # Discrete fatias
            "reevaluation_interval_s": (0.1, 5.0) # Discrete seconds
        }
        
        self.engine_config = {
            "latency_ms": 100.0,
            "batch_size": 10,
            "batching_window_ms": 50.0,
            "throttling_limit_per_s": 100,
            "slippage_model": "dynamic"
        }

    def run(self) -> dict:
        """
        Launches the selected optimizer search method.
        """
        logger.info(f"Starting Hyperparameter Optimization using {self.method}...")
        
        runs = []
        best_metric = -999.0
        best_config = None
        
        # Output telemetry progress to stderr so Next.js script runner can scan it
        def print_progress(iteration, current_cfg, current_metrics):
            prog = {
                "type": "progress",
                "iteration": iteration,
                "total": self.num_iterations,
                "current_config": current_cfg,
                "current_sharpe": current_metrics["sharpe"],
                "best_sharpe": best_metric
            }
            sys.stderr.write(json.dumps(prog) + "
")
            sys.stderr.flush()

        if self.method == "Grid":
            pos_grid = [1.0, 2.5, 5.0]
            sl_grid = [0.5, 1.5, 3.0]
            tp_grid = [1.0, 2.5, 5.0]
            slices_grid = [1, 5, 10]
            reeval_grid = [0.5, 2.0, 4.0]
            
            grid_points = []
            for p in pos_grid:
                for sl in sl_grid:
                    for tp in tp_grid:
                        for sc in slices_grid:
                            for rv in reeval_grid:
                                grid_points.append({
                                    "position_size_pct": p,
                                    "stop_loss_pct": sl,
                                    "take_profit_pct": tp,
                                    "order_slices": sc,
                                    "reevaluation_interval_s": rv
                                })
            
            if len(grid_points) > self.num_iterations:
                grid_points = random.sample(grid_points, self.num_iterations)
                
            for idx, cfg in enumerate(grid_points):
                res = self.evaluator.evaluate(cfg, self.engine_config)
                score = res["sharpe"]
                runs.append({"config": cfg, "metrics": res})
                
                if score > best_metric:
                    best_metric = score
                    best_config = cfg
                print_progress(idx + 1, cfg, res)
                
        elif self.method == "Random":
            for i in range(self.num_iterations):
                cfg = self._sample_random_config()
                res = self.evaluator.evaluate(cfg, self.engine_config)
                score = res["sharpe"]
                runs.append({"config": cfg, "metrics": res})
                
                if score > best_metric:
                    best_metric = score
                    best_config = cfg
                print_progress(i + 1, cfg, res)
                
        elif self.method == "Bayesian":
            evaluated_x = []
            evaluated_y = []
            
            init_steps = min(5, self.num_iterations)
            for i in range(init_steps):
                cfg = self._sample_random_config()
                res = self.evaluator.evaluate(cfg, self.engine_config)
                score = res["sharpe"]
                runs.append({"config": cfg, "metrics": res})
                
                evaluated_x.append(self._config_to_vector(cfg))
                evaluated_y.append(score)
                
                if score > best_metric:
                    best_metric = score
                    best_config = cfg
                print_progress(i + 1, cfg, res)
                
            for i in range(init_steps, self.num_iterations):
                X_train = np.array(evaluated_x)
                y_train = np.array(evaluated_y)
                
                candidates = [self._sample_random_config() for _ in range(50)]
                candidate_vecs = np.array([self._config_to_vector(c) for c in candidates])
                
                l = 1.5
                K_obs = np.exp(-np.sum((X_train[:, None] - X_train[None, :])**2, axis=-1) / (2.0 * l**2))
                noise_var = 0.05
                K_inv = np.linalg.inv(K_obs + noise_var * np.eye(len(X_train)))
                
                predicted_means = []
                predicted_stds = []
                for xc in candidate_vecs:
                    k_star = np.exp(-np.sum((X_train - xc)**2, axis=-1) / (2.0 * l**2))
                    mu = k_star.dot(K_inv).dot(y_train)
                    var = 1.0 - k_star.dot(K_inv).dot(k_star)
                    predicted_means.append(mu)
                    predicted_stds.append(math.sqrt(max(0.01, var)))
                    
                ucb_scores = np.array(predicted_means) + 2.0 * np.array(predicted_stds)
                best_cand_idx = np.argmax(ucb_scores)
                
                best_cand_cfg = candidates[best_cand_idx]
                res = self.evaluator.evaluate(best_cand_cfg, self.engine_config)
                score = res["sharpe"]
                runs.append({"config": best_cand_cfg, "metrics": res})
                
                evaluated_x.append(self._config_to_vector(best_cand_cfg))
                evaluated_y.append(score)
                
                if score > best_metric:
                    best_metric = score
                    best_config = best_cand_cfg
                print_progress(i + 1, best_cand_cfg, res)
                
        elif self.method == "Evolutionary":
            pop_size = 10
            generations = max(2, self.num_iterations // pop_size)
            
            population = [self._sample_random_config() for _ in range(pop_size)]
            eval_count = 0
            
            for gen in range(generations):
                evaluated_pop = []
                for idx, ind in enumerate(population):
                    res = self.evaluator.evaluate(ind, self.engine_config)
                    score = res["sharpe"]
                    runs.append({"config": ind, "metrics": res})
                    
                    evaluated_pop.append((ind, res, score))
                    eval_count += 1
                    
                    if score > best_metric:
                        best_metric = score
                        best_config = ind
                    print_progress(eval_count, ind, res)
                    
                    if eval_count >= self.num_iterations:
                        break
                        
                if eval_count >= self.num_iterations:
                    break
                    
                evaluated_pop.sort(key=lambda x: x[2], reverse=True)
                parents = [x[0] for x in evaluated_pop[:5]]
                
                new_pop = []
                new_pop.extend(parents[:2])
                
                while len(new_pop) < pop_size:
                    p1, p2 = random.sample(parents, 2)
                    child = self._crossover_and_mutate(p1, p2)
                    new_pop.append(child)
                population = new_pop
                
        runs.sort(key=lambda x: x["metrics"]["sharpe"], reverse=True)
        return {
            "best_config": best_config,
            "best_metrics": runs[0]["metrics"],
            "all_runs": runs
        }

    def _sample_random_config(self) -> dict:
        cfg = {}
        for name, bounds in self.param_bounds.items():
            if name in ["order_slices"]:
                cfg[name] = random.randint(bounds[0], bounds[1])
            else:
                cfg[name] = round(random.uniform(bounds[0], bounds[1]), 3)
        return cfg

    def _config_to_vector(self, cfg: dict) -> np.ndarray:
        vec = []
        for name, bounds in self.param_bounds.items():
            val = cfg[name]
            norm_val = (val - bounds[0]) / (bounds[1] - bounds[0])
            vec.append(norm_val)
        return np.array(vec)

    def _crossover_and_mutate(self, p1: dict, p2: dict) -> dict:
        child = {}
        for name, bounds in self.param_bounds.items():
            weight = random.random()
            val = weight * p1[name] + (1.0 - weight) * p2[name]
            
            if random.random() < 0.15:
                mutation_range = (bounds[1] - bounds[0]) * 0.1
                val += random.uniform(-mutation_range, mutation_range)
                
            if name in ["order_slices"]:
                child[name] = int(np.clip(val, bounds[0], bounds[1]))
            else:
                child[name] = round(float(np.clip(val, bounds[0], bounds[1])), 3)
        return child


# =============================================================================
# SECTION 5: WALK-FORWARD VALIDATION
# =============================================================================
def run_walk_forward_validation(df: pd.DataFrame, strategy: str, best_cfg: dict, engine_config: dict) -> dict:
    """
    Split the df into 3 sequential train-test folds.
    Evaluate train/test Sharpe ratios to measure robustness.
    """
    logger.info("Running Walk-Forward validation...")
    total_len = len(df)
    fold_len = total_len // 4
    
    folds = [
        {"train": df.iloc[0: 2*fold_len], "test": df.iloc[2*fold_len: 3*fold_len]},
        {"train": df.iloc[fold_len: 3*fold_len], "test": df.iloc[3*fold_len: 4*fold_len]}
    ]
    
    results = []
    robust_count = 0
    
    for idx, fold in enumerate(folds):
        eval_train = IntradayStrategyEvaluator(fold["train"], strategy)
        eval_test = IntradayStrategyEvaluator(fold["test"], strategy)
        
        train_res = eval_train.evaluate(best_cfg, engine_config)
        test_res = eval_test.evaluate(best_cfg, engine_config)
        
        train_sh = train_res["sharpe"]
        test_sh = test_res["sharpe"]
        
        is_robust = (test_sh >= 0.7 * train_sh) if train_sh > 0 else (test_sh >= train_sh)
        if is_robust:
            robust_count += 1
            
        results.append({
            "fold": idx + 1,
            "train_sharpe": train_sh,
            "test_sharpe": test_sh,
            "train_pnl": train_res["net_pnl"],
            "test_pnl": test_res["net_pnl"],
            "robust": is_robust
        })
        
    robustness_pct = (robust_count / len(folds)) * 100.0 if folds else 0.0
    return {
        "robustness_pct": robustness_pct,
        "folds": results
    }


# =============================================================================
# SECTION 6: SENSITIVITY MATRIX CALCULATION
# =============================================================================
def calculate_sensitivity_matrix(all_runs: list) -> list:
    """
    Computes correlation between parameter configurations and the final Sharpe ratio.
    """
    data = []
    for r in all_runs:
        row = {**r["config"], "sharpe": r["metrics"]["sharpe"], "drawdown": r["metrics"]["max_drawdown_pct"]}
        data.append(row)
        
    df = pd.DataFrame(data)
    if len(df) <= 1:
        return []
        
    corr = df.corr()["sharpe"].drop("sharpe").fillna(0.0).to_dict()
    
    matrix = []
    for param, value in corr.items():
        matrix.append({
            "parameter": param,
            "correlation_with_sharpe": round(value, 3)
        })
    return matrix



# =============================================================================
# SECTION 7: FASTAPI SERVICE
# =============================================================================

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class OptimizationRequest(BaseModel):
    strategy: str = "Momentum"
    method: str = "Bayesian"
    scenario: str = "normal_market"
    iterations: int = 15
    symbol: str = "BTCUSDT"

@app.post("/optimize")
async def optimize(request: OptimizationRequest):
    output_json = f"public/optimization_results_{request.symbol}_{request.strategy}.json"
    output_csv = f"public/optimized_trades_{request.symbol}_{request.strategy}.csv"

    os.makedirs(os.path.dirname(output_json) or '.', exist_ok=True)
    os.makedirs(os.path.dirname(output_csv) or '.', exist_ok=True)

    days = 30
    if request.scenario == "high_volatility":
        days = 7
    elif request.scenario == "low_liquidity":
        days = 14

    df_tick = fetch_binance_data(request.symbol, days)

    evaluator = IntradayStrategyEvaluator(df_tick, request.strategy, initial_balance=1000000.0)
    optimizer = HyperparameterOptimizer(evaluator, request.method, num_iterations=request.iterations)

    if request.scenario == "variable_latency":
        optimizer.engine_config["latency_ms"] = 500.0
    elif request.scenario == "low_liquidity":
        optimizer.engine_config["slippage_model"] = "dynamic"

    start_time = time.perf_counter()
    opt_results = optimizer.run()
    elapsed = time.perf_counter() - start_time

    wf_results = run_walk_forward_validation(df_tick, request.strategy, opt_results["best_config"], optimizer.engine_config)
    sensitivity = calculate_sensitivity_matrix(opt_results["all_runs"])

    best_trades = opt_results["best_metrics"]["trades"]
    with open(output_csv, mode="w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["trade_id", "side", "price", "quantity", "total", "commission", "pnl", "timestamp", "reason"])
        for t in best_trades:
            writer.writerow([
                t["id"], t["side"], t["price"], t["quantity"], t["total"],
                t.get("commission", 0.0), t["pnl"], t["timestamp"], t.get("reason", "")
            ])

    export_runs = []
    for run in opt_results["all_runs"]:
        clean_run = {
            "config": run["config"],
            "metrics": {k: v for k, v in run["metrics"].items() if k != "trades"}
        }
        export_runs.append(clean_run)

    final_payload = {
        "symbol": request.symbol,
        "strategy": request.strategy,
        "search_method": request.method,
        "scenario": request.scenario,
        "iterations": request.iterations,
        "elapsed_seconds": round(elapsed, 2),
        "best_config": opt_results["best_config"],
        "best_metrics": {k: v for k, v in opt_results["best_metrics"].items() if k != "trades"},
        "all_runs": export_runs,
        "sensitivity_matrix": sensitivity,
        "walk_forward": wf_results,
        "equity_curve": opt_results["best_metrics"]["equity_curve"],
        "timestamp": time.time()
    }

    with open(output_json, "w") as f:
        json.dump(final_payload, f, indent=2)

    logger.info(f"✅ Optimization complete! Output JSON written to {output_json}")
    logger.info(f"✅ Trade log written to {output_csv}")

    return final_payload

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

