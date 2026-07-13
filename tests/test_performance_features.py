import unittest
import asyncio
import os
import sys
from unittest.mock import AsyncMock, patch, MagicMock

# Adiciona o diretório scripts ao path do python
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from scripts.indicator_engine import IncrementalIndicatorEngine
from scripts.risk_manager import RiskManager
from scripts.binance_connector import BinanceConnector

class TestPerformanceFeatures(unittest.IsolatedAsyncioTestCase):
    
    def test_incremental_indicators(self):
        """
        Verify O(1) Incremental calculations.
        """
        engine = IncrementalIndicatorEngine(ema_fast_period=5, ema_slow_period=10, rsi_period=5, atr_period=5)
        
        prices = [100.0, 101.0, 102.0, 101.5, 99.0, 98.0, 99.5]
        highs = [100.5, 101.5, 102.5, 102.0, 99.5, 98.5, 100.0]
        lows = [99.5, 100.5, 101.5, 101.0, 98.5, 97.5, 99.0]
        
        last_state = {}
        for p, h, l in zip(prices, highs, lows):
            last_state = engine.update(close_price=p, high_price=h, low_price=l)
            
        self.assertIsNotNone(last_state["ema_fast"])
        self.assertIsNotNone(last_state["ema_slow"])
        self.assertIsNotNone(last_state["rsi"])
        self.assertIsNotNone(last_state["atr"])
        
        # Verify basic direction of indicators
        self.assertTrue(last_state["ema_fast"] < 100.0) # fast EMA should have pulled down due to recent drop to 98
        self.assertTrue(last_state["atr"] > 0.0) # ATR should reflect volatility

    async def test_position_sizing_and_trailing_stop(self):
        """
        Verify Volatility-Adjusted Trailing Stop and Position Sizing.
        """
        capital = 10000.0
        risk_manager = RiskManager(capital=capital, max_loss_pct=0.02, atr_multiplier=2.0)
        
        # 1. Position Sizing Check
        entry_price = 100.0
        atr = 2.0 # Volatility is $2.0. With multiplier 2.0, Stop loss distance is 2 * 2.0 = 4.0
        # Risking 1% of $10,000 = $100. Size should be 100.0 / 4.0 = 25 units
        qty = risk_manager.calculate_position_size(capital=capital, entry_price=entry_price, atr=atr, risk_pct=0.01)
        self.assertEqual(qty, 25.0)
        
        # 2. Dynamic Trailing Stop check
        # Open position with initial ATR = 2.0 (entry = 100.0, stop = 96.0)
        risk_manager.open_position(entry_price=entry_price, qty=qty, symbol="BTCUSDT", initial_atr=atr)
        self.assertEqual(risk_manager.trailing_stop_price, 96.0)
        
        # Price goes up to 105.0. New stop should trail to 105.0 - (2.0 * 2.0) = 101.0
        await risk_manager.on_tick(105.0, current_atr=2.0)
        self.assertEqual(risk_manager.highest_price, 105.0)
        self.assertEqual(risk_manager.trailing_stop_price, 101.0)
        self.assertTrue(risk_manager.position['active'])
        
        # Price falls to 102.0. Stop price should remain at 101.0
        await risk_manager.on_tick(102.0, current_atr=2.0)
        self.assertEqual(risk_manager.highest_price, 105.0)
        self.assertEqual(risk_manager.trailing_stop_price, 101.0)
        self.assertTrue(risk_manager.position['active'])
        
        # Price drops to 100.5 (below stop price of 101.0). Should trigger Kill Switch!
        await risk_manager.on_tick(100.5, current_atr=2.0)
        self.assertFalse(risk_manager.position['active'])
        self.assertEqual(len(risk_manager.market_orders), 1)

    async def test_slippage_protection(self):
        """
        Verify that BBO cache check correctly creates a LIMIT IOC order.
        """
        connector = BinanceConnector(testnet=True)
        connector.get_cached_price = AsyncMock(return_value={'bid': 60000.0, 'ask': 60100.0, 'last': 60050.0})
        connector.create_order = AsyncMock(return_value={"orderId": 77777, "status": "FILLED"})
        
        # Test Buy Order with max slippage 0.5% (0.005)
        # Ask is 60100.0. Limit should be 60100.0 * 1.005 = 60400.50
        order = await connector.create_slippage_protected_order(
            symbol="BTCUSDT",
            side="BUY",
            quantity=0.001,
            max_slippage_pct=0.005
        )
        
        self.assertEqual(order["orderId"], 77777)
        connector.create_order.assert_called_once_with(
            symbol="BTCUSDT",
            side="BUY",
            type="LIMIT",
            quantity=0.001,
            price=60400.50,
            timeInForce="IOC"
        )

if __name__ == '__main__':
    unittest.main()
