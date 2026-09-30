import unittest
import os
import sys
import tempfile
import time

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from scripts.hft_modules import parse_double_from_bytes, OrderBookImbalance, PairsTradingEngine, TelemetryCache

class TestHftModules(unittest.TestCase):
    
    def test_zero_copy_parser(self):
        """
        Verify that raw byte parser matches float conversion.
        """
        raw_json_bytes = b'{"e":"depthUpdate","E":16252438,"s":"BTCUSDT","p":60050.25,"v":0.005}'
        price = parse_double_from_bytes(raw_json_bytes, b'"p"')
        self.assertEqual(price, 60050.25)
        
        volume = parse_double_from_bytes(raw_json_bytes, b'"v"')
        self.assertEqual(volume, 0.005)
        
        val = parse_double_from_bytes(raw_json_bytes, b'"xyz"')
        self.assertEqual(val, 0.0)

    def test_order_book_imbalance(self):
        """
        Verify OBI calculation matching volume spreads.
        """
        obi_detector = OrderBookImbalance()
        
        bids = [["60000.0", 1.0] for _ in range(5)]
        asks = [["60100.0", 1.0] for _ in range(5)]
        imbalance = obi_detector.calculate_imbalance(bids, asks, levels=5)
        self.assertEqual(imbalance, 0.0)
        
        bids_strong = [["60000.0", 2.0], ["60010.0", 3.0], ["60020.0", 3.0]]
        asks_weak = [["60100.0", 1.0], ["60110.0", 1.0]]
        imbalance_strong = obi_detector.calculate_imbalance(bids_strong, asks_weak, levels=5)
        self.assertEqual(imbalance_strong, 0.6)

    def test_pairs_trading_zscore(self):
        """
        Verify pairs trading cointegrated spread Z-score.
        """
        engine = PairsTradingEngine(period=5)
        
        prices_a = [100.0, 101.0, 100.5, 99.0, 98.0]
        prices_b = [100.0, 101.0, 100.5, 99.0, 98.0]
        
        zscores = []
        for a, b in zip(prices_a, prices_b):
            z = engine.calculate_zscore(a, b, beta=1.0)
            zscores.append(z)
            
        self.assertEqual(zscores[0], 0.0)
        self.assertEqual(zscores[3], 0.0)
        
        z_spike = engine.calculate_zscore(120.0, 90.0, beta=1.0) 
        self.assertTrue(z_spike > 1.0)
        
        z_drop = engine.calculate_zscore(90.0, 120.0, beta=1.0) 
        self.assertTrue(z_drop < -1.0)

    def test_telemetry_cache_flushing(self):
        """
        Verify that ring-buffered telemetry caches prices/latencies and flushes in batch to CSV.
        """
        cache = TelemetryCache(capacity=10)
        
        for i in range(5):
            cache.add(price=60000.0 + i, latency_ns=100 + i * 5)
            
        self.assertEqual(cache.size, 5)
        self.assertEqual(cache.head, 5)
        
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp_path = tmp.name
            
        try:
            cache.flush_to_disk(tmp_path)
            
            self.assertEqual(cache.size, 0)
            self.assertEqual(cache.head, 0)
            
            with open(tmp_path, 'r') as f:
                lines = f.readlines()
                self.assertEqual(len(lines), 6) 
                self.assertTrue(lines[0].startswith("Timestamp,Price,LatencyNs"))
                self.assertTrue(lines[1].split(',')[1].startswith("60000"))
                self.assertTrue(lines[5].split(',')[2].strip() == "120")
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

if __name__ == '__main__':
    unittest.main()
