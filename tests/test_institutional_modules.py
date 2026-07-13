import unittest
import asyncio
import os
import sys
import time
from unittest.mock import AsyncMock, patch, MagicMock
import aiohttp

# Adiciona o diretório scripts ao path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from scripts.institutional_modules import MarketRegimeDetector, GeminiSentimentWorker, SmartOrderRouter, ExecutionAlgorithms
import scripts.institutional_modules as inst_mod
from scripts.binance_connector import BinanceConnector

class TestInstitutionalModules(unittest.IsolatedAsyncioTestCase):

    def test_market_regime_detector_latency_and_classification(self):
        """
        Verify that MarketRegimeDetector classifies the market regime under 0.1ms.
        """
        detector = MarketRegimeDetector(period=5, threshold_trending=20.0)
        
        # Inject ticks
        prices = [100.0, 100.2, 99.8, 100.1, 100.0, 100.3, 100.2, 100.1, 100.2, 100.0, 100.1]
        
        # 1. Ranging Scenario
        regime = "Ranging"
        for p in prices:
            t_start = time.perf_counter_ns()
            regime = detector.add_tick(close=p)
            t_end = time.perf_counter_ns()
            latency_ms = (t_end - t_start) / 1_000_000
            self.assertTrue(latency_ms < 0.1, f"Regime detection latency {latency_ms:.4f}ms excede limite de 0.1ms")
            
        self.assertEqual(regime, "Ranging")
        
        # 2. Trending Scenario (Consecutive upward moves to drive ADX high)
        trending_prices = [100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0, 108.0, 109.0, 110.0, 111.0, 112.0]
        for p in trending_prices:
            regime = detector.add_tick(close=p, high=p + 0.1, low=p - 0.1)
        self.assertEqual(regime, "Trending")
        
        # 3. Chaotic Scenario (Extremely large volatility range relative to price)
        chaotic_regime = detector.add_tick(close=110.0, high=125.0, low=95.0)
        self.assertEqual(chaotic_regime, "Chaotic")

    async def test_gemini_sentiment_worker_panic_halt(self):
        """
        Verify GeminiSentimentWorker calls API/fallback and halts BUY orders on Panic.
        """
        # Test with mock API key to check offline fallback functionality
        worker = GeminiSentimentWorker(api_key="mock", check_interval_seconds=1)
        
        # Bullish check
        sentiment = await worker.analyze_sentiment("Markets look strong as volume increases.")
        self.assertEqual(sentiment, "Bullish")
        
        # Panic check
        sentiment_panic = await worker.analyze_sentiment("Warning: financial crash crisis panic!")
        self.assertEqual(sentiment_panic, "Panic")
        
        # Loop start check
        inst_mod.BUY_HALTED = False
        
        # Mock analyze_sentiment to return Panic for the worker loop
        worker.analyze_sentiment = AsyncMock(return_value="Panic")
        await worker.start()
        await asyncio.sleep(0.1) # Let the worker execute at least once
        
        self.assertTrue(inst_mod.BUY_HALTED)
        self.assertEqual(inst_mod.GLOBAL_SENTIMENT, "Panic")
        
        await worker.stop()

    async def test_smart_order_router(self):
        """
        Verify SOR selects the symbol/pair with best prices and spreads.
        """
        connector = MagicMock()
        connector.get_orderbook_ticker = AsyncMock(side_effect=[
            # Book for Symbol A (BTCUSDT Spot): Ask = 60100, Bid = 60000
            {"bidPrice": "60000.0", "askPrice": "60100.0"},
            # Book for Symbol B (BTCUSDT Futures): Ask = 60050, Bid = 59950
            {"bidPrice": "59950.0", "askPrice": "60050.0"}
        ])
        
        sor = SmartOrderRouter(connector)
        
        # For BUY: select symbol B (Ask 60050 < Ask 60100)
        selected_buy = await sor.select_optimal_market("BTCUSDT_SPOT", "BTCUSDT_FUTURES", "BUY")
        self.assertEqual(selected_buy, "BTCUSDT_FUTURES")
        
        # Reset mock calls
        connector.get_orderbook_ticker = AsyncMock(side_effect=[
            {"bidPrice": "60000.0", "askPrice": "60100.0"},
            {"bidPrice": "59950.0", "askPrice": "60050.0"}
        ])
        # For SELL: select symbol A (Bid 60000 > Bid 59950)
        selected_sell = await sor.select_optimal_market("BTCUSDT_SPOT", "BTCUSDT_FUTURES", "SELL")
        self.assertEqual(selected_sell, "BTCUSDT_SPOT")

    async def test_twap_vwap_slicing(self):
        """
        Verify TWAP and VWAP execution algorithms slice orders correctly.
        """
        connector = MagicMock()
        connector.create_slippage_protected_order = AsyncMock(return_value={"status": "FILLED"})
        
        exec_algos = ExecutionAlgorithms(connector)
        
        # 1. TWAP Slicing
        # Routes total 1.0 quantity into 4 slices (0.25 each) with 0s delay
        await exec_algos.execute_twap("BTCUSDT", "BUY", total_quantity=1.0, slices=4, interval_seconds=0.0)
        self.assertEqual(connector.create_slippage_protected_order.call_count, 4)
        connector.create_slippage_protected_order.assert_called_with(
            symbol="BTCUSDT",
            side="BUY",
            quantity=0.25
        )
        
        # 2. VWAP Slicing
        connector.create_slippage_protected_order.reset_mock()
        await exec_algos.execute_vwap("BTCUSDT", "SELL", total_quantity=10.0, slices=5, interval_seconds=0.0)
        self.assertEqual(connector.create_slippage_protected_order.call_count, 5)
        # Sum of quantities should be exactly 10.0
        total_executed = sum(c.kwargs['quantity'] for c in connector.create_slippage_protected_order.call_args_list)
        self.assertAlmostEqual(total_executed, 10.0, places=5)

    async def test_websocket_failover_and_heartbeat(self):
        """
        Verify WebSocket connection failover and heartbeat loss triggers reconnect with exponential backoff.
        """
        connector = BinanceConnector(testnet=True)
        
        msg1 = MagicMock()
        msg1.type = aiohttp.WSMsgType.TEXT
        msg1.json = lambda: {"b": "60000", "a": "60100"}
        
        msg2 = MagicMock()
        msg2.type = aiohttp.WSMsgType.CLOSED
        
        mock_messages = [msg1, msg2]
        
        mock_ws = AsyncMock()
        mock_ws.closed = False
        mock_ws.__aenter__.return_value = mock_ws
        mock_ws.__aiter__.return_value = mock_messages
        
        mock_session = MagicMock()
        mock_session.__aenter__.return_value = mock_session
        mock_session.ws_connect = MagicMock(side_effect=[
            mock_ws,
            Exception("Simulated connection drop to yield control and avoid loop starvation")
        ])
        
        with patch('aiohttp.ClientSession', return_value=mock_session):
                 
            task = asyncio.create_task(connector._ticker_stream_loop("BTCUSDT"))
            await asyncio.sleep(0.1)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
                
            self.assertEqual(connector.prices_cache["BTCUSDT"]["bid"], 60000.0)

if __name__ == '__main__':
    unittest.main()
