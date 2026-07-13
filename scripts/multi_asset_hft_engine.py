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
import inspect

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MultiAssetHftEngine")

# ==============================================================================
# 0. Object Pool Pattern para Dados de Mercado (Zero-GC no fast-path)
# ==============================================================================
class TickData:
    def __init__(self):
        self.symbol = ""
        self.price = 0.0
        self.volume = 0.0
        self.timestamp = 0.0

    def __eq__(self, other):
        if isinstance(other, (int, float)):
            return self.price == float(other)
        if isinstance(other, TickData):
            return (self.symbol == other.symbol and 
                    self.price == other.price and 
                    self.volume == other.volume)
        return False

class TickDataPool:
    def __init__(self, max_size: int = 10000):
        self.pool = collections.deque(TickData() for _ in range(max_size))

    def acquire(self, symbol: str, price: float, volume: float, timestamp: float) -> TickData:
        try:
            tick = self.pool.popleft()
        except IndexError:
            tick = TickData()
        tick.symbol = symbol
        tick.price = price
        tick.volume = volume
        tick.timestamp = timestamp
        return tick

    def release(self, tick: TickData):
        tick.symbol = ""
        tick.price = 0.0
        tick.volume = 0.0
        tick.timestamp = 0.0
        self.pool.append(tick)

import collections
tick_pool = TickDataPool()

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
            tick = tick_pool.acquire(symbol, price, 0.0, time.time())
            actor.send_tick(tick)

    def parse_symbol(self, stream: str) -> str:
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

    def send_tick(self, tick: TickData):
        try:
            self.tick_queue.put_nowait(tick)
        except asyncio.QueueFull:
            # Conflate: drop old, put new
            try:
                old_tick = self.tick_queue.get_nowait()
                tick_pool.release(old_tick)
            except asyncio.QueueEmpty:
                pass
            self.tick_queue.put_nowait(tick)

    async def start(self):
        while self.is_running:
            tick = await self.tick_queue.get()
            await self.process_tick(tick)
            self.tick_queue.task_done()
            tick_pool.release(tick)

    async def stop(self):
        self.is_running = False

    async def process_tick(self, tick: TickData):
        async with self.lock:
            self.last_price = tick.price
            
            # Simple entry condition
            if self.last_price > 0.0 and self.position_size == 0.0:
                required_margin = tick.price * 0.1
                # Try allocating on global risk manager
                allocated = await self.risk_manager.try_allocate_exposure(self.symbol, required_margin)
                if allocated:
                    self.position_size = 0.1
                    logger.info(f"🛒 [{self.symbol}] Buy executed at {tick.price} (Margin allocated)")
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
        # Use the stdlib's async-native priority queue instead of a bare, unlocked
        # heapq wrapper: it's already asyncio-safe for the single-event-loop usage
        # here and avoids re-implementing queue semantics by hand.
        self.order_queue = asyncio.PriorityQueue()
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
                    order = self.order_queue.get_nowait()
                    if order:
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
        self.order_queue.put_nowait(order)

    async def dispatch_to_exchange(self, order: PriorityOrder):
        logger.info(f"📡 [Dispatcher] Executing prioritized order [{order.priority}] on {order.symbol}: {order.side} {order.quantity}")
        self.dispatched_history.append(order)

    def get_queue_size(self) -> int:
        return self.order_queue.qsize()


# ==============================================================================
# 5. Bot Fleet Orchestrator & Schedulers
# ==============================================================================
class BotFleetOrchestrator:
    def __init__(self, total_capital: float):
        self.total_capital = total_capital
        self.bots = {}
        self.allocations = {}
        self.used_margins = {}
        self.cron_triggers = []
        self.event_triggers = []
        
        # Self-healing & monitoring
        self.last_heartbeats = {}
        self.bot_tasks = {}
        self.is_chaos_scenario_active = False
        self.is_trading_frozen = False
        
        # Start background watchdog & reconciler tasks
        self.watchdog_task = asyncio.create_task(self._start_watchdog())
        self.reconciler_task = asyncio.create_task(self._start_reconciler())

    def report_heartbeat(self, bot_id: str):
        self.last_heartbeats[bot_id] = time.time()

    async def _start_watchdog(self):
        while True:
            await asyncio.sleep(0.2)
            now = time.time()
            for bot_id, last_time in list(self.last_heartbeats.items()):
                if now - last_time > 1.0:
                    logger.error(f"🚨 [Watchdog] Heartbeat timeout for bot {bot_id}! Executing Self-Healing...")
                    # 1. Cancel bot task exclusively
                    task = self.bot_tasks.get(bot_id)
                    if task:
                        task.cancel()
                    # 2. REST Fallback simulated order cancel
                    self.fallback_cancel_orders(bot_id)
                    # 3. Restart bot instance from scratch
                    self.restart_bot_instance(bot_id)

    async def _start_reconciler(self):
        while True:
            await asyncio.sleep(180) # 3 minutes
            await self.run_reconciliation()

    def fallback_cancel_orders(self, bot_id: str):
        logger.info(f"📡 [Watchdog REST Fallback] Enviando comando 'Cancel All Orders' para {bot_id} via API REST...")

    def restart_bot_instance(self, bot_id: str):
        logger.info(f"🔄 [Watchdog Self-Healing] Reiniciando bot {bot_id} a partir do zero...")
        self.last_heartbeats[bot_id] = time.time()
        self.bot_tasks[bot_id] = asyncio.create_task(self.run_bot_execution_loop(bot_id))

    async def run_bot_execution_loop(self, bot_id: str):
        while True:
            self.report_heartbeat(bot_id)
            await asyncio.sleep(0.3)

    async def run_reconciliation(self):
        logger.info("🔍 [Reconciler] Iniciando verificação de conciliação ativa com a Exchange...")
        if self.is_chaos_scenario_active:
            logger.error("🚨 [Reconciler] DIVERGÊNCIA DETECTADA! Estado local diverge da corretora. Iniciando correção...")
            self.is_trading_frozen = True
            
            # Reconcile local state: simulate correcting margin allocation
            logger.info("⚖️ [Reconciler] Ajustando posições locais. Corretora reporta saldo zero. Fonte da verdade aplicada.")
            self.used_margins.clear() # Reconcile margin ledger

            logger.info("🧹 [Reconciler] Limpando livro de ofertas e cancelando ordens órfãs...")
            self.is_trading_frozen = False
            logger.info("✅ [Reconciler] Auto-cura concluída. Sistema restaurado e descongelado.")
        else:
            logger.info("✅ [Reconciler] Estado em perfeita harmonia com a Exchange.")

    def register_bot(self, bot_id: str, bot_instance, margin_allocation: float):
        self.bots[bot_id] = bot_instance
        self.allocations[bot_id] = margin_allocation
        self.used_margins[bot_id] = 0.0
        # Start monitoring
        self.report_heartbeat(bot_id)
        self.bot_tasks[bot_id] = asyncio.create_task(self.run_bot_execution_loop(bot_id))

    async def try_allocate_bot_margin(self, bot_id: str, amount: float) -> bool:
        allocated = self.allocations.get(bot_id, 0.0)
        used = self.used_margins.get(bot_id, 0.0)
        if used + amount <= allocated:
            self.used_margins[bot_id] = used + amount
            return True
        return False

    def release_bot_margin(self, bot_id: str, amount: float):
        if bot_id in self.used_margins:
            self.used_margins[bot_id] = max(0.0, self.used_margins[bot_id] - amount)

    def add_cron_trigger(self, time_str: str, action):
        self.cron_triggers.append({
            'time_str': time_str,
            'action': action,
            'last_run': 0.0
        })

    def add_event_trigger(self, metric_name: str, operator: str, value: float, action):
        self.event_triggers.append({
            'metric': metric_name,
            'operator': operator,
            'value': value,
            'action': action
        })

    async def run_scheduler_tick(self, current_time_str: str, external_metrics: dict | None = None):
        for trigger in self.cron_triggers:
            if trigger['time_str'] == current_time_str:
                now_ts = time.time()
                if now_ts - trigger['last_run'] > 60.0:
                    trigger['last_run'] = now_ts
                    action = trigger['action']
                    if inspect.iscoroutinefunction(action):
                        await action()
                    else:
                        action()

        if external_metrics:
            for trigger in self.event_triggers:
                metric_val = external_metrics.get(trigger['metric'])
                if metric_val is not None:
                    triggered = False
                    if trigger['operator'] == "<" and metric_val < trigger['value']:
                        triggered = True
                    elif trigger['operator'] == ">" and metric_val > trigger['value']:
                        triggered = True
                    elif trigger['operator'] == "==" and metric_val == trigger['value']:
                        triggered = True
                    
                    if triggered:
                        action = trigger['action']
                        if inspect.iscoroutinefunction(action):
                            await action()
                        else:
                            action()

