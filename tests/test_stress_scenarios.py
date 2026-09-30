import unittest
import asyncio
import os
import sys
from unittest.mock import AsyncMock, patch, MagicMock
from binance.exceptions import BinanceAPIException

# Adiciona o diretório scripts ao path do python
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from scripts.binance_connector import BinanceConnector
from scripts.quantitative_engine_v3 import QuantitativeEngineV3

class TestStressScenarios(unittest.IsolatedAsyncioTestCase):
    
    @patch('scripts.binance_connector.AsyncClient')
    async def test_rate_limit_retry(self, mock_client):
        """
        Verify that retry_on_rate_limit_and_timeout decorator retries on -1003 (Rate Limit)
        and eventually succeeds or propagates.
        """
        connector = BinanceConnector(testnet=True)
        connector.client = AsyncMock()
        
        # Simula 2 falhas de Rate Limit (-1003) e 1 sucesso final
        side_effect = [
            BinanceAPIException(MagicMock(status_code=429), 429, '{"code":-1003, "msg":"Too many requests"}'),
            BinanceAPIException(MagicMock(status_code=429), 429, '{"code":-1003, "msg":"Too many requests"}'),
            {"symbol": "BTCUSDT", "bidPrice": "60000", "askPrice": "60100"}
        ]
        
        # Patch sleep para evitar esperas durante a execução do teste rápido
        with patch('asyncio.sleep', AsyncMock()) as mock_sleep:
            connector.client.get_orderbook_ticker = AsyncMock(side_effect=side_effect)
            
            res = await connector.get_orderbook_ticker("BTCUSDT")
            
            self.assertEqual(res["askPrice"], "60100")
            self.assertEqual(connector.client.get_orderbook_ticker.call_count, 3)
            self.assertEqual(mock_sleep.call_count, 2)

    @patch('scripts.quantitative_engine_v3.BinanceConnector')
    async def test_emergency_liquidation_on_oco_failure(self, mock_connector_cls):
        """
        Verify that if OCO order placement fails, the emergency liquidation fail-safe
        is triggered immediately to sell the open position and close risk.
        """
        mock_connector = mock_connector_cls.return_value
        mock_connector.start = AsyncMock()
        mock_connector.start_ticker_stream = AsyncMock()
        mock_connector.get_cached_price = AsyncMock(return_value={'bid': 60000.0, 'ask': 60100.0, 'last': 60050.0})
        mock_connector.get_symbol_step_size = AsyncMock(return_value=0.00001)
        mock_connector.close = AsyncMock()
        
        # Mock client and get_klines for ATR calculations
        mock_client = AsyncMock()
        mock_client.get_klines = AsyncMock(return_value=[
            [0, "60000.0", "60100.0", "59900.0", "60050.0", 1.0, 0, "1.0", 1] for _ in range(14)
        ])
        mock_connector.client = mock_client
        
        # A compra inicial é bem sucedida via create_slippage_protected_order
        mock_connector.create_slippage_protected_order = AsyncMock(return_value={
            "orderId": 12345, "status": "FILLED", "fills": [{"price": "60100", "qty": "0.001"}]
        })
        
        # A segunda chamada de create_order representa o envio da liquidação emergencial SELL MARKET
        mock_connector.create_order = AsyncMock(return_value={"orderId": 99999, "status": "FILLED"})
        
        # OCO falha
        mock_connector.create_oco_order = AsyncMock(side_effect=RuntimeError("Exchange OCO overload"))
        
        engine = QuantitativeEngineV3(testnet=True)
        await engine.initialize()
        
        # Executa o roundtrip - deve retornar None devido à falha de OCO, mas disparar liquidação emergencial
        timings = await engine.execute_trade_roundtrip(symbol="BTCUSDT", quantity=0.001)
        
        self.assertIsNone(timings)
        
        # Verifica se o OCO foi chamado e falhou
        mock_connector.create_oco_order.assert_called_once()
        
        # Verifica se a liquidação de emergência foi chamada com SELL MARKET
        mock_connector.create_order.assert_called_once_with(
            symbol="BTCUSDT",
            side="SELL",
            type="MARKET",
            quantity=0.2
        )

    async def test_corrupted_payload_discard(self):
        """
        Verify that corrupted, malformed, or empty websocket payloads
        are safely caught and discarded without crashing the receiver loop
        or forcing a websocket reconnection.
        """
        import aiohttp as real_aiohttp
        import scripts.binance_connector
        
        # Simulates WSMsgType text messages
        class MockWSMsg:
            def __init__(self, data, is_text=True):
                self.type = real_aiohttp.WSMsgType.TEXT if is_text else real_aiohttp.WSMsgType.CLOSED
                self.data = data
            def json(self):
                import json
                return json.loads(self.data)

        # Sequence of messages: 
        # 1. Valid BBO message
        # 2. Corrupted JSON (SyntaxError)
        # 3. Valid BBO message with different price
        # 4. Truncated fields (KeyError/ValueError)
        # 5. Closed connection message
        mock_messages = [
            MockWSMsg('{"s":"BTCUSDT","b":"60100","a":"60200"}'),
            MockWSMsg('{"s":"BTCUSDT","b":"invalid_number","a":"60200"}'), # Fast parse will fail on float() or JSON fallback fails
            MockWSMsg('{"s":"BTCUSDT","b":"60300","a":"60400"}'),
            MockWSMsg('{"s":"BTCUSDT"}'), # Missing "b" and "a" keys
            MockWSMsg(None, is_text=False)
        ]

        class MockWSConnection:
            def __init__(self):
                self.closed = False
                self.msg_idx = 0
            def __aiter__(self):
                return self
            async def __anext__(self):
                if self.msg_idx >= len(mock_messages):
                    raise StopAsyncIteration
                msg = mock_messages[self.msg_idx]
                self.msg_idx += 1
                return msg
            async def close(self):
                self.closed = True

        mock_ws = MockWSConnection()
        
        # Configure the mocked aiohttp module directly with a real class
        class MockClientSession:
            async def __aenter__(self):
                return self
            async def __aexit__(self, exc_type, exc, tb):
                pass
            def ws_connect(self, *args, **kwargs):
                class WSContext:
                    async def __aenter__(self):
                        return mock_ws
                    async def __aexit__(self, exc_type, exc, tb):
                        pass
                return WSContext()

        mock_aiohttp = MagicMock()
        mock_aiohttp.ClientSession = MockClientSession
        mock_aiohttp.WSMsgType = real_aiohttp.WSMsgType
        
        # Swap reference in connector module
        old_aiohttp = scripts.binance_connector.aiohttp
        scripts.binance_connector.aiohttp = mock_aiohttp
        
        try:
            connector = BinanceConnector(testnet=True)
            # Patch logger to verify warnings are logged for corruption
            with patch('scripts.binance_connector.logger.warning') as mock_warning:
                # Run stream loop for 0.1s or until finished
                task = asyncio.create_task(connector.start_ticker_stream("BTCUSDT"))
                await asyncio.sleep(0.05)
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                
                # Check that valid messages successfully updated the cache
                self.assertEqual(connector.prices_cache["BTCUSDT"]["bid"], 60300.0)
                self.assertEqual(connector.prices_cache["BTCUSDT"]["ask"], 60400.0)
                
                # Verify logger was called to log warnings for discarded payloads
                self.assertTrue(mock_warning.called)
        finally:
            scripts.binance_connector.aiohttp = old_aiohttp

if __name__ == '__main__':
    unittest.main()
