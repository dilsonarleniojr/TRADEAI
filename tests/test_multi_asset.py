import unittest
import asyncio
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from scripts.multi_asset_hft_engine import WebSocketMultiplexer, AssetActor, GlobalRiskManager, BatchOrderDispatcher, PriorityOrder

class TestMultiAssetEngine(unittest.IsolatedAsyncioTestCase):
    
    async def test_websocket_multiplexer_routing(self):
        """
        Verify multiplexer parses stream names and routes to correct actor channel.
        """
        risk = GlobalRiskManager(max_global_exposure=1000.0)
        actor_btc = AssetActor("BTCUSDT", risk)
        actor_eth = AssetActor("ETHUSDT", risk)
        
        actors = {"BTCUSDT": actor_btc, "ETHUSDT": actor_eth}
        multiplexer = WebSocketMultiplexer(actors)
        
        # Route ticks
        multiplexer.route_message("btcusdt@bookTicker", 60000.0)
        multiplexer.route_message("ethusdt@bookTicker", 3200.0)
        
        # Verify queues received the ticks
        tick_btc = await actor_btc.tick_queue.get()
        tick_eth = await actor_eth.tick_queue.get()
        
        self.assertEqual(tick_btc, 60000.0)
        self.assertEqual(tick_eth, 3200.0)

    async def test_global_risk_manager_veto(self):
        """
        Verify GlobalRiskManager limits max global exposure and blocks additions.
        """
        risk = GlobalRiskManager(max_global_exposure=1000.0)
        
        ok1 = await risk.try_allocate_exposure("BTCUSDT", 300.0)
        ok2 = await risk.try_allocate_exposure("ETHUSDT", 300.0)
        ok3 = await risk.try_allocate_exposure("SOLUSDT", 300.0)
        
        self.assertTrue(ok1)
        self.assertTrue(ok2)
        self.assertTrue(ok3)
        self.assertEqual(risk.get_total_exposure(), 900.0)
        
        ok4 = await risk.try_allocate_exposure("BNBUSDT", 200.0)
        self.assertFalse(ok4, "GlobalRiskManager should have vetoed exposure exceeding 1000.0")
        self.assertEqual(risk.get_total_exposure(), 900.0)
        
        await risk.release_exposure("BTCUSDT")
        self.assertEqual(risk.get_total_exposure(), 600.0)
        
        ok5 = await risk.try_allocate_exposure("BNBUSDT", 200.0)
        self.assertTrue(ok5)
        self.assertEqual(risk.get_total_exposure(), 800.0)

    async def test_priority_order_dispatch(self):
        """
        Verify dispatcher processes higher-priority orders (liquidations) first.
        """
        dispatcher = BatchOrderDispatcher(rate_limit_per_period=10, period_seconds=1.0)
        
        order_low_1 = PriorityOrder("BTCUSDT", "BUY", 0.05, priority=3)
        order_high = PriorityOrder("ETHUSDT", "SELL", 1.2, priority=1) 
        order_low_2 = PriorityOrder("SOLUSDT", "BUY", 10.0, priority=3)
        
        dispatcher.enqueue_order(order_low_1)
        dispatcher.enqueue_order(order_high)
        dispatcher.enqueue_order(order_low_2)
        
        self.assertEqual(dispatcher.get_queue_size(), 3)
        
        task = asyncio.create_task(dispatcher.start())
        await asyncio.sleep(0.1) 
        await dispatcher.stop()
        
        try:
            await task
        except asyncio.CancelledError:
            pass
            
        history = dispatcher.dispatched_history
        self.assertEqual(len(history), 3)
        self.assertEqual(history[0].symbol, "ETHUSDT") 
        self.assertEqual(history[0].priority, 1)

if __name__ == '__main__':
    unittest.main()
