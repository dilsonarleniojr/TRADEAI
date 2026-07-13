# -*- coding: utf-8 -*-
"""
TRADEAI — Python Equivalent Multi-Asset Concurrent Trading Engine
Includes:
1. WebSocketMultiplexer (stream routing)
2. AssetActor (asyncio state isolation)
3. GlobalRiskManager (exposure threshold check)
4. BatchOrderDispatcher (priority order queueing)
"""

import asyncio
import time
import logging
from queue import PriorityQueue

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MultiAssetHftEngine")

# ==============================================================================
# 1. WebSocket Multiplexer
# ==============================================================================
class WebSocketMultiplexer:
    """
    Multiplexes ticker streams to corresponding asset actors.
    """
    def __init__(self, actors: dict):
        self.actors = actors

    def route_message(self, stream_name: str, price: float):
        symbol = self.parse_symbol(stream_name)
        actor = self.actors.get(symbol)
        if actor:
            actor.send_tick(price)

    def parse_symbol(self, stream: str) -> str:
        # Ex: "btcusdt@bookTicker" -> "BTCUSDT"
        return stream.split("@")[0].upper()

# ==============================================================================
# 2. Asset Actor (Actor Model via asyncio.Queue + asyncio.Lock)
# ==============================================================================
class AssetActor:
    """
    Manages local isolated state for a single symbol using async queue loops.
    """
    def __init__(self, symbol: str, risk_manager):
        self.symbol = symbol
        self.risk_manager = risk_manager
        self.tick_queue = asyncio.Queue(maxsize=10) # Conflated equivalent via quick processing
        self.lock = asyncio.Lock()
        
        # Local state
        self.last_price = 0.0
        self.position_size = 0.0
        self.is_running = True

    def send_tick(self, price: float):
        try:
            self.tick_queue.put_nowait(price)
        except asyncio.QueueFull:
            # Conflate: drop old, put new
            try:
                self.tick_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            self.tick_queue.put_nowait(price)

    async def start(self):
        while self.is_running:
            price = await self.tick_queue.get()
            await self.process_tick(price)
            self.tick_queue.task_done()

    async def stop(self):
        self.is_running = False

    async def process_tick(self, price: float):
        async with self.lock:
            self.last_price = price
            
            # Simple entry condition
            if self.last_price > 0.0 and self.position_size == 0.0:
                required_margin = price * 0.1
                # Try allocating on global risk manager
                allocated = await self.risk_manager.try_allocate_exposure(self.symbol, required_margin)
                if allocated:
                    self.position_size = 0.1
                    logger.info(f"🛒 [{self.symbol}] Buy executed at {price} (Margin allocated)")
                else:
                    logger.warning(f"⚠️ [{self.symbol}] Margin request blocked by Global Risk Manager")

# ==============================================================================
# 3. Global Risk Manager
# ==============================================================================
class GlobalRiskManager:
    """
    Thread-safe orchestrator monitoring account-wide exposure limits.
    """
    def __init__(self, max_global_exposure: float):
        self.max_global_exposure = max_global_exposure
        self.active_exposures = {}
        self.lock = asyncio.Lock()

    async def try_allocate_exposure(self, symbol: str, amount: float) -> bool:
        async with self.lock:
            total_current = sum(self.active_exposures.values())
            if total_current + amount <= self.max_global_exposure:
                self.active_exposures[symbol] = self.active_exposures.get(symbol, 0.0) + amount
                return True
            return False

    async def release_exposure(self, symbol: str):
        async with self.lock:
            if symbol in self.active_exposures:
                del self.active_exposures[symbol]

    def get_total_exposure(self) -> float:
        return sum(self.active_exposures.values())

# ==============================================================================
# 4. Batch Order Dispatcher (Priority Queue Rate-Limiter)
# ==============================================================================
class PriorityOrder:
    """
    Holds order state with prioritization comparison.
    """
    def __init__(self, symbol: str, side: str, quantity: float, priority: int):
        self.symbol = symbol
        self.side = side
        self.quantity = quantity
        self.priority = priority # lower value = higher priority

    def __lt__(self, other):
        return self.priority < other.priority

class BatchOrderDispatcher:
    """
    Dispatches orders prioritizing critical liquidations under strict API rate limits.
    """
    def __init__(self, rate_limit_per_period: int = 50, period_seconds: float = 10.0):
        self.rate_limit = rate_limit_per_period
        self.period = period_seconds
        self.order_queue = PriorityQueue()
        self.dispatched_in_window = 0
        self.window_start = time.time()
        self.is_running = False
        self.dispatched_history = [] # For test assertions

    async def start(self):
        self.is_running = True
        while self.is_running:
            now = time.time()
            if now - self.window_start >= self.period:
                self.dispatched_in_window = 0
                self.window_start = now

            if self.dispatched_in_window < self.rate_limit:
                if not self.order_queue.empty():
                    order = self.order_queue.get()
                    await self.dispatch_to_exchange(order)
                    self.dispatched_in_window += 1
                else:
                    await asyncio.sleep(0.01) # Small sleep when empty
            else:
                wait_time = self.period - (now - self.window_start)
                if wait_time > 0:
                    await asyncio.sleep(wait_time)

    async def stop(self):
        self.is_running = False

    def enqueue_order(self, order: PriorityOrder):
        self.order_queue.put(order)

    async def dispatch_to_exchange(self, order: PriorityOrder):
        logger.info(f"📡 [Dispatcher] Executing prioritized order [{order.priority}] on {order.symbol}: {order.side} {order.quantity}")
        self.dispatched_history.append(order)

    def get_queue_size(self) -> int:
        return self.order_queue.qsize()
