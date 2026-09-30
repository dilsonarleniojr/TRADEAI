# -*- coding: utf-8 -*-
"""
TRADEAI — Python Equivalent FIX Gateway, Latency-Injecting Backtester & Observability
"""

import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FixAndTelemetryEngine")

# ==============================================================================
# 1. Gateway FIX 4.4
# ==============================================================================
class FixGateway:
    """
    Lightweight FIX 4.4 message builder.
    """
    SOH = "\x01"

    def __init__(self):
        self.seq_num = 1

    def create_new_order_single(self, cl_ord_id: str, symbol: str, side: str, quantity: float, price: float) -> str:
        """
        NewOrderSingle (MsgType=D)
        """
        # Mapping side
        side_val = "1" if side.upper() == "BUY" else "2"
        
        body_parts = [
            f"11={cl_ord_id}",
            "21=1",
            f"55={symbol}",
            f"54={side_val}",
            f"60={int(time.time() * 1000)}",
            f"38={quantity}",
            "40=2",
            f"44={price}"
        ]
        body = self.SOH.join(body_parts) + self.SOH
        body_len = len(body)

        header_parts = [
            "8=FIX.4.4",
            f"9={body_len}",
            "35=D",
            f"34={self.seq_num}",
            "49=TRADEAI",
            "56=EXCHANGE"
        ]
        self.seq_num += 1
        header = self.SOH.join(header_parts) + self.SOH
        
        message_prefix = header + body
        checksum = self._calculate_checksum(message_prefix)
        
        return f"{message_prefix}10={checksum}{self.SOH}"

    def _calculate_checksum(self, data: str) -> str:
        total = sum(ord(c) for c in data)
        check = total % 256
        return f"{check:03d}"

# ==============================================================================
# 2. Queue Position Tracker
# ==============================================================================
class QueuePositionTracker:
    """
    Tracks order book depth queues and estimates placement for limit orders.
    """
    def __init__(self, symbol: str):
        self.symbol = symbol
        self.queue_estimates = {}

    def register_order(self, price: float, volume_ahead: float):
        self.queue_estimates[price] = volume_ahead

    def process_order_flow_event(self, price: float, event_size: float, is_execution: bool):
        current_ahead = self.queue_estimates.get(price)
        if current_ahead is None:
            return

        if is_execution:
            updated = max(0.0, current_ahead - event_size)
            if updated == 0.0:
                del self.queue_estimates[price]
                logger.info(f"🎯 [{self.symbol}] Order queue at {price} reached the top!")
            else:
                self.queue_estimates[price] = updated
        else:
            # Cancellation: assume 50% probability it was in front of us
            cancelled_ahead = event_size * 0.5
            updated = max(0.0, current_ahead - cancelled_ahead)
            self.queue_estimates[price] = updated

    def get_estimated_volume_ahead(self, price: float) -> float:
        return self.queue_estimates.get(price, 0.0)

# ==============================================================================
# 3. Motor de Backtesting Event-Driven com Injeção de Latência
# ==============================================================================
class LatencyInjectionBacktester:
    """
    Replays historical ticks, simulating execution lag (RTT) and slippage.
    """
    def __init__(self, ticks: list, rtt_ms: int = 50):
        """
        Ticks: list of (timestamp_ms, price)
        """
        self.ticks = sorted(ticks, key=lambda x: x[0])
        self.rtt = rtt_ms

    def simulate_order_execution(self, side: str, limit_price: float, quantity: float, trigger_time_ms: int) -> dict:
        """
        Finds the filled price at (trigger_time_ms + RTT_ms) to emulate slippage.
        """
        execution_time = trigger_time_ms + self.rtt
        
        # Search first tick after execution time
        fill_tick = None
        for timestamp, price in self.ticks:
            if timestamp >= execution_time:
                fill_tick = (timestamp, price)
                break
                
        if not fill_tick:
            # Fallback to last tick available
            fill_tick = self.ticks[-1]
            
        fill_price = fill_tick[1]
        
        # Slippage computation
        if side.upper() == "BUY":
            slippage = fill_price - limit_price
        else:
            slippage = limit_price - fill_price
            
        return {
            "status": "FILLED",
            "trigger_time": trigger_time_ms,
            "execution_time": fill_tick[0],
            "fill_price": fill_price,
            "slippage": slippage,
            "quantity": quantity
        }

# ==============================================================================
# 4. Prometheus Metrics Formatter
# ==============================================================================
class PrometheusFormatter:
    """
    Generates telemetry output blocks in Prometheus metric formats.
    """
    def format_metrics(self, gc_pauses_ms: int, tcp_throughput_pps: int, tick_to_trade_us: int) -> str:
        lines = [
            "# HELP jvm_gc_pause_ms Total Garbage Collection pause time in milliseconds",
            "# TYPE jvm_gc_pause_ms counter",
            f"jvm_gc_pause_ms {gc_pauses_ms}",
            "",
            "# HELP network_tcp_throughput_pps Number of TCP packets processed per second",
            "# TYPE network_tcp_throughput_pps gauge",
            f"network_tcp_throughput_pps {tcp_throughput_pps}",
            "",
            "# HELP tick_to_trade_latency_us Latency of execution cycle in microseconds",
            "# TYPE tick_to_trade_latency_us gauge",
            f"tick_to_trade_latency_us {tick_to_trade_us}"
        ]
        return "\n".join(lines) + "\n"
