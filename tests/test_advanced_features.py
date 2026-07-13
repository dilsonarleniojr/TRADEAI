import unittest
import os
import sys
import time

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from scripts.hft_modules import SpoofingDetector, IcebergTracker, GridTradingStrategy
from scripts.risk_manager import RiskManager
from scripts.multi_asset_hft_engine import BotFleetOrchestrator

class TestAdvancedFeatures(unittest.IsolatedAsyncioTestCase):

    def test_spoofing_detector(self):
        detector = SpoofingDetector(large_vol_threshold=10.0, time_limit_ms=50.0, price_closeness_pct=0.005)
        
        # 1. Standard addition of large bid at price 60000.0
        bids = [["60000.0", 12.0]]
        asks = [["60100.0", 1.0]]
        is_spoof = detector.process_depth_update(bids, asks, current_price=59900.0, timestamp_ms=1000.0)
        self.assertFalse(is_spoof)

        # 2. Large order is removed at Timestamp = 1020 (diff < 50ms)
        # Price is close
        bids_empty = [["60000.0", 0.0]]
        is_spoof = detector.process_depth_update(bids_empty, asks, current_price=59900.0, timestamp_ms=1020.0, executed_trades_at_prices={60000.0: 0.0})
        self.assertTrue(is_spoof)

        # Reset detector
        detector = SpoofingDetector(large_vol_threshold=10.0, time_limit_ms=50.0, price_closeness_pct=0.005)
        
        # 3. Addition
        detector.process_depth_update(bids, asks, current_price=59900.0, timestamp_ms=1000.0)
        
        # 4. Large order is filled (trade volume is equal to decrease) -> No spoof
        is_spoof = detector.process_depth_update(bids_empty, asks, current_price=59900.0, timestamp_ms=1020.0, executed_trades_at_prices={60000.0: 12.0})
        self.assertFalse(is_spoof)

    def test_iceberg_tracker(self):
        tracker = IcebergTracker(min_volume=5.0, time_window_ms=500.0)
        
        bids = [["60000.0", 2.0]]
        asks = [["60100.0", 1.0]]
        tracker.update_depth(bids, asks)
        
        is_iceberg = tracker.process_trade(price=60000.0, volume=1.5, timestamp_ms=1000.0)
        self.assertFalse(is_iceberg)
        
        is_iceberg = tracker.process_trade(price=60000.0, volume=4.0, timestamp_ms=1010.0)
        self.assertTrue(is_iceberg)

    def test_grid_trading_strategy(self):
        strategy = GridTradingStrategy(center_price=100.0, grid_span_pct=0.10, num_grids=10, order_qty=0.01)
        
        actions = strategy.on_tick(current_price=102.0)
        self.assertEqual(len(actions), 0)
        
        actions = strategy.on_tick(current_price=106.0)
        self.assertEqual(len(actions), 1)
        self.assertEqual(actions[0][0], "SHIFT_UP")
        self.assertEqual(strategy.center_price, 106.0)

    def test_portfolio_var_and_deleveraging(self):
        risk = RiskManager(capital=10000.0, max_var_limit=0.01)
        
        for p in [100.0, 102.0, 98.0, 105.0, 95.0, 110.0]:
            risk.update_market_data("BTCUSDT", p)
            risk.update_market_data("ETHUSDT", p / 10.0)
            
        positions = {"BTCUSDT": 1.0, "ETHUSDT": 10.0}
        var = risk.calculate_portfolio_var(positions)
        self.assertTrue(var >= 0.0)
        
        for p in [100.0, 150.0, 70.0, 200.0, 50.0, 300.0]:
            risk.update_market_data("BTCUSDT", p)
            risk.update_market_data("ETHUSDT", p / 10.0)
            
        positions_large = {"BTCUSDT": 10.0, "ETHUSDT": 100.0}
        var_large = risk.calculate_portfolio_var(positions_large)
        self.assertTrue(risk.deleveraged)
        self.assertEqual(positions_large["BTCUSDT"], 5.0)

    async def test_bot_fleet_orchestrator(self):
        orchestrator = BotFleetOrchestrator(total_capital=1000.0)
        
        orchestrator.register_bot("BotA", bot_instance=None, margin_allocation=300.0)
        orchestrator.register_bot("BotB", bot_instance=None, margin_allocation=200.0)
        
        ok1 = await orchestrator.try_allocate_bot_margin("BotA", 200.0)
        self.assertTrue(ok1)
        
        ok2 = await orchestrator.try_allocate_bot_margin("BotA", 150.0)
        self.assertFalse(ok2)
        
        ok3 = await orchestrator.try_allocate_bot_margin("BotB", 150.0)
        self.assertTrue(ok3)
        
        cron_triggered = False
        def cron_action():
            nonlocal cron_triggered
            cron_triggered = True
            
        orchestrator.add_cron_trigger("20:55", cron_action)
        
        await orchestrator.run_scheduler_tick("20:55")
        self.assertTrue(cron_triggered)

        event_triggered = False
        def event_action():
            nonlocal event_triggered
            event_triggered = True
            
        orchestrator.add_event_trigger("BTC.D", "<", 40.0, event_action)
        await orchestrator.run_scheduler_tick("12:00", external_metrics={"BTC.D": 38.0})
        self.assertTrue(event_triggered)

if __name__ == '__main__':
    unittest.main()
