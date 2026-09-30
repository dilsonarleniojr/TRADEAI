import unittest
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from scripts.fix_and_telemetry_engine import FixGateway, QueuePositionTracker, LatencyInjectionBacktester, PrometheusFormatter

class TestFixTelemetry(unittest.TestCase):

    def test_fix_gateway_message_building(self):
        """
        Verify FIX 4.4 parser/generator produces valid tag structures.
        """
        gateway = FixGateway()
        message = gateway.create_new_order_single(
            cl_ord_id="ord123",
            symbol="BTCUSDT",
            side="BUY",
            quantity=0.15,
            price=60250.0
        )
        
        # Delimiter SOH is \x01
        self.assertIn("8=FIX.4.4\x01", message)
        self.assertIn("35=D\x01", message)  # MsgType: NewOrderSingle
        self.assertIn("11=ord123\x01", message)
        self.assertIn("55=BTCUSDT\x01", message)
        self.assertIn("54=1\x01", message)  # Side Buy is 1
        self.assertIn("38=0.15\x01", message)
        self.assertIn("44=60250.0\x01", message)
        
        # Verify checksum tag 10 is present at the end
        self.assertTrue(message.endswith("\x01"))
        self.assertIn("\x0110=", message)

    def test_queue_position_tracker(self):
        """
        Verify order flow changes subtract from ahead volume in limit queues.
        """
        tracker = QueuePositionTracker("BTCUSDT")
        
        # Place order at price 60000.0 with 50.0 BTC ahead in queue
        tracker.register_order(price=60000.0, volume_ahead=50.0)
        self.assertEqual(tracker.get_estimated_volume_ahead(60000.0), 50.0)
        
        # Execution of 15.0 BTC at 60000.0 -> subtract 15.0 directly
        tracker.process_order_flow_event(price=60000.0, event_size=15.0, is_execution=True)
        self.assertEqual(tracker.get_estimated_volume_ahead(60000.0), 35.0)
        
        # Cancellation of 10.0 BTC at 60000.0 -> subtract 50% (5.0 BTC)
        tracker.process_order_flow_event(price=60000.0, event_size=10.0, is_execution=False)
        self.assertEqual(tracker.get_estimated_volume_ahead(60000.0), 30.0)
        
        # Big execution to reach top of queue (35.0 BTC execution) -> reduce to 0
        tracker.process_order_flow_event(price=60000.0, event_size=35.0, is_execution=True)
        self.assertEqual(tracker.get_estimated_volume_ahead(60000.0), 0.0)

    def test_latency_injection_backtester(self):
        """
        Verify execution latency RTT injection simulates slippage correctly.
        """
        # Create tick array: price moves upward over time
        ticks = [
            (1000, 60000.0),
            (1010, 60010.0),
            (1020, 60020.0),
            (1030, 60030.0),
            (1040, 60040.0),
            (1050, 60050.0),
            (1060, 60060.0),
            (1070, 60070.0),
        ]
        
        # Case A: Backtester with 30ms RTT delay
        backtester_30 = LatencyInjectionBacktester(ticks, rtt_ms=30)
        
        # Trigger BUY order at limit price 60000.0 at time=1010
        # Expected execution time = 1010 + 30 = 1040
        # Expected filled price at time=1040 is 60040.0
        # Expected slippage = 60040.0 - 60000.0 = 40.0
        res_30 = backtester_30.simulate_order_execution("BUY", limit_price=60000.0, quantity=1.0, trigger_time_ms=1010)
        self.assertEqual(res_30["execution_time"], 1040)
        self.assertEqual(res_30["fill_price"], 60040.0)
        self.assertEqual(res_30["slippage"], 40.0)

        # Case B: Backtester with 50ms RTT delay
        # Expected execution time = 1010 + 50 = 1060
        # Expected filled price at time=1060 is 60060.0
        # Expected slippage = 60060.0 - 60000.0 = 60.0
        backtester_50 = LatencyInjectionBacktester(ticks, rtt_ms=50)
        res_50 = backtester_50.simulate_order_execution("BUY", limit_price=60000.0, quantity=1.0, trigger_time_ms=1010)
        self.assertEqual(res_50["execution_time"], 1060)
        self.assertEqual(res_50["fill_price"], 60060.0)
        self.assertEqual(res_50["slippage"], 60.0)

    def test_prometheus_telemetry_metrics_formatting(self):
        """
        Verify exporter returns correctly formatted Prometheus text blocks.
        """
        formatter = PrometheusFormatter()
        text = formatter.format_metrics(gc_pauses_ms=120, tcp_throughput_pps=14500, tick_to_trade_us=45)
        
        self.assertIn("jvm_gc_pause_ms 120\n", text)
        self.assertIn("network_tcp_throughput_pps 14500\n", text)
        self.assertIn("tick_to_trade_latency_us 45\n", text)
        self.assertTrue(text.startswith("# HELP"))

if __name__ == '__main__':
    unittest.main()
