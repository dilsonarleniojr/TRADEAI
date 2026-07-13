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

if __name__ == '__main__':
    unittest.main()
