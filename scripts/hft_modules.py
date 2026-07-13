# -*- coding: utf-8 -*-
"""
TRADEAI — Python Equivalent High-Performance HFT Modules
Includes:
1. Zero-Copy byte parsing
2. Order Book Imbalance (OBI)
3. Pairs Trading Z-Score calculation
4. Ring-buffered Telemetry Cache
"""

import math
import time
import csv
import threading
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("HftModulesPy")

# ==============================================================================
# 1. Zero-Copy parsing helper
# ==============================================================================
def parse_double_from_bytes(raw_bytes: bytes, key: bytes) -> float:
    """
    Scans a raw byte array directly to parse a float/double value,
    skipping standard json.loads/string decoding overhead.
    """
    idx = raw_bytes.find(key)
    if idx == -1:
        return 0.0
    val_idx = idx + len(key)
    # skip quotes, colons, spaces
    while val_idx < len(raw_bytes) and raw_bytes[val_idx] in (58, 32, 34): # 58=:, 32=space, 34="
        val_idx += 1
    # read digits (includes '.', '-' and scientific-notation markers 'e'/'E'/'+' as a defensive
    # measure: exchange price/qty fields are always plain fixed-point decimals today, never
    # exponential notation, but this avoids silently truncating the value if that ever changes)
    start = val_idx
    while val_idx < len(raw_bytes) and (
        48 <= raw_bytes[val_idx] <= 57 or  # 0-9
        raw_bytes[val_idx] in (46, 45, 43, 101, 69)  # '.', '-', '+', 'e', 'E'
    ):
        val_idx += 1
    val_str = raw_bytes[start:val_idx].decode('utf-8')
    try:
        return float(val_str)
    except ValueError:
        return 0.0

# ==============================================================================
# 2. Order Book Imbalance (OBI)
# ==============================================================================
class OrderBookImbalance:
    """
    Tracks imbalance ratio of order book depth volumes.
    """
    def calculate_imbalance(self, bids: list, asks: list, levels: int = 10) -> float:
        """
        Bids and asks list structure: [[price, size], [price, size], ...]
        Returns ratio from -1.0 to 1.0.
        """
        bid_vol = 0.0
        ask_vol = 0.0
        
        limit_bids = min(len(bids), levels)
        limit_asks = min(len(asks), levels)
        
        for i in range(limit_bids):
            bid_vol += float(bids[i][1])
            
        for i in range(limit_asks):
            ask_vol += float(asks[i][1])
            
        total_vol = bid_vol + ask_vol
        if total_vol <= 0.0:
            return 0.0
        return (bid_vol - ask_vol) / total_vol

# ==============================================================================
# 3. Pairs Trading spread & Z-score tracker
# ==============================================================================
class PairsTradingEngine:
    """
    Monitors price spread between two assets and calculates incremental rolling Z-score.
    """
    def __init__(self, period: int = 60):
        self.period = period
        self.spread_buffer = [0.0] * period
        self.idx = 0
        self.count = 0
        self.spread_sum = 0.0

    def calculate_zscore(self, price_a: float, price_b: float, beta: float = 1.0) -> float:
        """
        Spread = PriceA - beta * PriceB
        """
        spread = price_a - (beta * price_b)
        
        if self.count < self.period:
            self.spread_buffer[self.idx] = spread
            self.idx = (self.idx + 1) % self.period
            self.spread_sum += spread
            self.count += 1
            return 0.0
            
        old_spread = self.spread_buffer[self.idx]
        self.spread_buffer[self.idx] = spread
        self.idx = (self.idx + 1) % self.period
        self.spread_sum = self.spread_sum - old_spread + spread
        
        mean = self.spread_sum / self.period
        
        variance_sum = 0.0
        for i in range(self.period):
            diff = self.spread_buffer[i] - mean
            variance_sum += diff * diff
            
        std_dev = math.sqrt(variance_sum / self.period)
        if std_dev <= 0.0:
            return 0.0
        return (spread - mean) / std_dev

# ==============================================================================
# 4. Telemetry cache Ring Buffer
# ==============================================================================
class TelemetryCache:
    """
    Thread-safe in-memory cache to save telemetry events without disk write latency.
    """
    def __init__(self, capacity: int = 100000):
        self.capacity = capacity
        self.prices = [0.0] * capacity
        self.latencies = [0] * capacity
        self.timestamps = [0.0] * capacity
        self.head = 0
        self.size = 0
        self.lock = threading.Lock()

    def add(self, price: float, latency_ns: int):
        with self.lock:
            self.prices[self.head] = price
            self.latencies[self.head] = latency_ns
            self.timestamps[self.head] = time.time()
            self.head = (self.head + 1) % self.capacity
            if self.size < self.capacity:
                self.size += 1

    def flush_to_disk(self, filepath: str):
        with self.lock:
            if self.size == 0:
                return
                
            try:
                with open(filepath, 'w', newline='') as f:
                    writer = csv.writer(f)
                    writer.writerow(["Timestamp", "Price", "LatencyNs"])
                    
                    start_idx = self.head if self.size == self.capacity else 0
                    for i in range(self.size):
                        idx = (start_idx + i) % self.capacity
                        writer.writerow([self.timestamps[idx], self.prices[idx], self.latencies[idx]])
            except Exception as e:
                logger.error(f"❌ Failed to flush telemetry batch: {e}")
                
            # Reset states
            self.size = 0
            self.head = 0


# ==============================================================================
# 5. Defesa de Microestrutura: Spoofing & Layering Detector
# ==============================================================================
class SpoofingDetector:
    def __init__(self, large_vol_threshold=50.0, time_limit_ms=100.0, price_closeness_pct=0.001):
        self.large_vol_threshold = large_vol_threshold
        self.time_limit_ms = time_limit_ms
        self.price_closeness_pct = price_closeness_pct
        self.bids_history = {}  # price -> (volume, timestamp_ms)
        self.asks_history = {}  # price -> (volume, timestamp_ms)

    def process_depth_update(self, new_bids, new_asks, current_price, timestamp_ms, executed_trades_at_prices=None):
        """
        new_bids: list of [price, volume]
        new_asks: list of [price, volume]
        Returns True if spoofing is detected.
        """
        curr_bids = {float(p): float(v) for p, v in new_bids}
        curr_asks = {float(p): float(v) for p, v in new_asks}
        
        spoofing_detected = False
        
        # Check Bids
        for price, vol in curr_bids.items():
            prev_vol, prev_ts = self.bids_history.get(price, (0.0, 0.0))
            if vol >= prev_vol + self.large_vol_threshold:
                self.bids_history[price] = (vol, timestamp_ms)
            elif vol < prev_vol - self.large_vol_threshold:
                if prev_ts > 0 and (timestamp_ms - prev_ts) <= self.time_limit_ms:
                    if abs(current_price - price) / current_price <= self.price_closeness_pct:
                        trade_vol = executed_trades_at_prices.get(price, 0.0) if executed_trades_at_prices else 0.0
                        if trade_vol < (prev_vol - vol) * 0.1:
                            spoofing_detected = True
                if vol > 0:
                    self.bids_history[price] = (vol, timestamp_ms)
                else:
                    self.bids_history.pop(price, None)

        for price in list(self.bids_history.keys()):
            if price not in curr_bids:
                prev_vol, prev_ts = self.bids_history[price]
                if prev_vol >= self.large_vol_threshold and (timestamp_ms - prev_ts) <= self.time_limit_ms:
                    if abs(current_price - price) / current_price <= self.price_closeness_pct:
                        trade_vol = executed_trades_at_prices.get(price, 0.0) if executed_trades_at_prices else 0.0
                        if trade_vol < prev_vol * 0.1:
                            spoofing_detected = True
                self.bids_history.pop(price, None)

        # Check Asks
        for price, vol in curr_asks.items():
            prev_vol, prev_ts = self.asks_history.get(price, (0.0, 0.0))
            if vol >= prev_vol + self.large_vol_threshold:
                self.asks_history[price] = (vol, timestamp_ms)
            elif vol < prev_vol - self.large_vol_threshold:
                if prev_ts > 0 and (timestamp_ms - prev_ts) <= self.time_limit_ms:
                    if abs(current_price - price) / current_price <= self.price_closeness_pct:
                        trade_vol = executed_trades_at_prices.get(price, 0.0) if executed_trades_at_prices else 0.0
                        if trade_vol < (prev_vol - vol) * 0.1:
                            spoofing_detected = True
                if vol > 0:
                    self.asks_history[price] = (vol, timestamp_ms)
                else:
                    self.asks_history.pop(price, None)

        for price in list(self.asks_history.keys()):
            if price not in curr_asks:
                prev_vol, prev_ts = self.asks_history[price]
                if prev_vol >= self.large_vol_threshold and (timestamp_ms - prev_ts) <= self.time_limit_ms:
                    if abs(current_price - price) / current_price <= self.price_closeness_pct:
                        trade_vol = executed_trades_at_prices.get(price, 0.0) if executed_trades_at_prices else 0.0
                        if trade_vol < prev_vol * 0.1:
                            spoofing_detected = True
                self.asks_history.pop(price, None)

        return spoofing_detected


# ==============================================================================
# 6. Iceberg Order Tracker
# ==============================================================================
class IcebergTracker:
    def __init__(self, min_volume=10.0, time_window_ms=1000.0):
        self.min_volume = min_volume
        self.time_window_ms = time_window_ms
        self.trade_accumulators = {}  # price -> (accum_vol, timestamp_ms)
        self.last_visible_volumes = {}  # price -> visible_vol

    def update_depth(self, bids, asks):
        self.last_visible_volumes.clear()
        for p, v in bids[:5]:
            self.last_visible_volumes[float(p)] = float(v)
        for p, v in asks[:5]:
            self.last_visible_volumes[float(p)] = float(v)

    def process_trade(self, price, volume, timestamp_ms):
        price = float(price)
        volume = float(volume)
        accum, ts = self.trade_accumulators.get(price, (0.0, timestamp_ms))
        
        if timestamp_ms - ts > self.time_window_ms:
            accum = 0.0
            ts = timestamp_ms
            
        accum += volume
        self.trade_accumulators[price] = (accum, ts)
        
        visible_vol = self.last_visible_volumes.get(price, 0.0)
        if visible_vol > 0.0 and accum >= visible_vol * 1.5 and accum >= self.min_volume:
            return True
        return False


# ==============================================================================
# 7. Grid Trading Strategy
# ==============================================================================
class GridTradingStrategy:
    def __init__(self, center_price, grid_span_pct=0.05, num_grids=10, order_qty=0.01):
        self.center_price = center_price
        self.grid_span_pct = grid_span_pct
        self.num_grids = num_grids
        self.order_qty = order_qty
        self.buy_orders = []
        self.sell_orders = []
        self.setup_grid()

    def setup_grid(self):
        self.buy_orders.clear()
        self.sell_orders.clear()
        half_span = self.center_price * self.grid_span_pct / 2.0
        lower_bound = self.center_price - half_span
        upper_bound = self.center_price + half_span
        step = (upper_bound - lower_bound) / self.num_grids
        for i in range(self.num_grids // 2):
            self.buy_orders.append(self.center_price - (i + 1) * step)
            self.sell_orders.append(self.center_price + (i + 1) * step)

    def on_tick(self, current_price):
        half_span = self.center_price * self.grid_span_pct / 2.0
        lower_bound = self.center_price - half_span
        upper_bound = self.center_price + half_span
        
        if current_price > upper_bound:
            self.center_price = current_price
            self.setup_grid()
            return [("SHIFT_UP", self.center_price, self.order_qty)]
        elif current_price < lower_bound:
            self.center_price = current_price
            self.setup_grid()
            return [("SHIFT_DOWN", self.center_price, self.order_qty)]
        return []

