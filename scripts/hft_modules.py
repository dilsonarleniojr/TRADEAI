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
