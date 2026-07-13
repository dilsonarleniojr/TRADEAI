import unittest
import asyncio
import time
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from scripts.multi_asset_hft_engine import (
    WebSocketMultiplexer,
    AssetActor,
    GlobalRiskManager,
    BotFleetOrchestrator,
    tick_pool
)

class TestSelfHealingAndGcTuning(unittest.IsolatedAsyncioTestCase):
    
    def test_tick_data_pool_recycling(self):
        """
        Verify Object Pool recycles TickData instances without allocating new ones.
        """
        initial_pool_size = len(tick_pool.pool)
        
        # Acquire 5 tick objects
        ticks = [tick_pool.acquire("BTCUSDT", 60000.0, 1.5, time.time()) for _ in range(5)]
        self.assertEqual(len(tick_pool.pool), initial_pool_size - 5)
        
        # Release them back
        for t in ticks:
            tick_pool.release(t)
            
        self.assertEqual(len(tick_pool.pool), initial_pool_size)

    async def test_watchdog_detects_and_restarts_frozen_bot(self):
        """
        Verify Watchdog supervisor identifies stale heartbeat, terminates thread and recovers.
        """
        orchestrator = BotFleetOrchestrator(total_capital=10000.0)
        
        # Register a mock bot
        orchestrator.register_bot("bot_test", MagicBotInstance(), 500.0)
        
        # Force stale heartbeat (simulate worker deadlock or infinite loop)
        orchestrator.last_heartbeats["bot_test"] = time.time() - 2.0  # 2 seconds ago (threshold is 1s)
        
        # Let watchdog scan
        await asyncio.sleep(0.3)
        
        # Verify the stale task was cancelled and restarted (timestamp renewed)
        self.assertTrue(time.time() - orchestrator.last_heartbeats["bot_test"] < 0.5)
        
        # Clean up tasks
        orchestrator.watchdog_task.cancel()
        orchestrator.reconciler_task.cancel()
        for task in orchestrator.bot_tasks.values():
            task.cancel()

    async def test_active_reconciliation_fixes_divergence(self):
        """
        Verify ActiveReconciler identifies position mismatch, freezes trading, corrects state, and unfreezes.
        """
        orchestrator = BotFleetOrchestrator(total_capital=10000.0)
        
        # Force chaos scenario and position drift
        orchestrator.is_chaos_scenario_active = True
        orchestrator.used_margins["bot_test"] = 250.0  # Local position margin
        
        # Execute active reconciliation
        await orchestrator.run_reconciliation()
        
        # Assert divergence was fixed (margin ledger reset, trading unfrozen)
        self.assertEqual(orchestrator.used_margins.get("bot_test", 0.0), 0.0)
        self.assertFalse(orchestrator.is_trading_frozen)
        
        # Clean up tasks
        orchestrator.watchdog_task.cancel()
        orchestrator.reconciler_task.cancel()
        for task in orchestrator.bot_tasks.values():
            task.cancel()

class MagicBotInstance:
    pass

if __name__ == '__main__':
    unittest.main()
