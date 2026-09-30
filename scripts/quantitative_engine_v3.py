# -*- coding: utf-8 -*-
"""
TRADEAI — QuantitativeEngineV3 (Real Round-Trip Binance Testnet Diagnostic)
Measures latency (in milliseconds) of:
A) Entry Market Order -> B) Filled Confirmation -> C) Institutional OCO Placement -> D) Database Persistence.
"""

import os
import sys
import time
import asyncio
import logging
from dotenv import load_dotenv

# Include scripts folder in path for imports
sys.path.append(os.path.abspath(os.path.dirname(__file__)))
from binance_connector import BinanceConnector

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("QuantitativeEngineV3")

class QuantitativeEngineV3:
    def __init__(self, testnet: bool = True):
        self.connector = BinanceConnector(testnet=testnet)
        self.db_fs = None
        self.initialized = False

    async def initialize(self):
        """
        Initializes connectors and Firestore clients
        """
        await self.connector.start()
        
        # Initialize Firestore
        if FIREBASE_AVAILABLE:
            try:
                if not firebase_admin._apps:
                    project_id = os.getenv("FIREBASE_PROJECT_ID", "tradeai3-dfc7c")
                    cred = credentials.ApplicationDefault() if os.getenv("GOOGLE_APPLICATION_CREDENTIALS") else None
                    if cred:
                        firebase_admin.initialize_app(cred, {'projectId': project_id})
                        self.db_fs = firestore.client()
                        logger.info("✅ Firebase SDK loaded inside engine.")
            except Exception as e:
                logger.warning(f"⚠️ Could not load Firebase inside engine: {e}")
        self.initialized = True

    async def execute_trade_roundtrip(self, symbol: str, quantity: float, tp_pct: float = 0.02, sl_pct: float = 0.02):
        """
        Runs the full trade roundtrip cycle and profiles the milliseconds spent at each step.
        """
        if not self.initialized:
            await self.initialize()

        logger.info(f"🚀 Starting Real Latency Test on {symbol}...")
        timings = {}
        
        # 0. Get current price ticker for calculations
        ticker = await self.connector.get_orderbook_ticker(symbol)
        current_price = float(ticker.get('askPrice', 0))
        if current_price == 0:
            raise ValueError(f"Could not fetch orderbook price for {symbol}")

        # Round values based on Lot/Step size limits to prevent filters crash
        step_size = await self.connector.get_symbol_step_size(symbol)
        qty_clean = round(quantity - (quantity % step_size), 5)
        if qty_clean <= 0:
            qty_clean = step_size
            
        logger.info(f"Targeting: {qty_clean} {symbol} @ Approx ${current_price}")

        # PHASE A: SUBMIT ENTRY MARKET BUY ORDER
        time_a = time.perf_counter()
        try:
            logger.info("A) Dispatching Market Buy order to Binance...")
            buy_order = await self.connector.create_order(
                symbol=symbol,
                side="BUY",
                type="MARKET",
                quantity=qty_clean
            )
            time_b = time.perf_counter()
            timings["market_dispatch_ms"] = (time_b - time_a) * 1000
            logger.info(f"   * Market Order Placed. Client latency: {timings['market_dispatch_ms']:.2f} ms")
        except Exception as e:
            logger.error(f"❌ Failed to dispatch Market order: {e}")
            return None

        # PHASE B: RECEIVE FILLED STATUS
        # If market order, check if already filled or poll status
        order_id = buy_order.get("orderId")
        actual_buy_price = current_price
        
        time_b_poll_start = time.perf_counter()
        if buy_order.get("status") == "FILLED":
            time_c = time.perf_counter()
            timings["fill_confirmation_ms"] = (time_c - time_b_poll_start) * 1000
            logger.info("   * Order FILLED immediately on dispatch confirmation.")
        else:
            logger.info("   * Order not filled instantly, polling status...")
            filled = False
            for attempt in range(10):
                check = await self.connector.get_order(symbol, order_id)
                if check.get("status") == "FILLED":
                    filled = True
                    break
                await asyncio.sleep(0.05)
            time_c = time.perf_counter()
            timings["fill_confirmation_ms"] = (time_c - time_b_poll_start) * 1000
            
            if not filled:
                logger.error("❌ Market Order was not filled in time.")
                return None
            logger.info(f"   * Order filled after polling. Polling latency: {timings['fill_confirmation_ms']:.2f} ms")

        # Read actual execution price from fill data
        fills = buy_order.get("fills", [])
        if fills:
            actual_buy_price = sum(float(f["price"]) * float(f["qty"]) for f in fills) / sum(float(f["qty"]) for f in fills)
        else:
            actual_check = await self.connector.get_order(symbol, order_id)
            actual_buy_price = float(actual_check.get("price", current_price))
            if actual_buy_price == 0:
                actual_buy_price = current_price

        # PHASE C: SUBMIT INSTITUTIONAL OCO BRACKETS (TP/SL)
        # Calculate OCO parameters
        take_profit_price = round(actual_buy_price * (1.0 + tp_pct), 2)
        stop_loss_trigger = round(actual_buy_price * (1.0 - sl_pct), 2)
        stop_loss_limit = round(stop_loss_trigger * 0.995, 2) # Limit slightly lower to prevent execution slips

        logger.info(f"C) Dispatching Institutional OCO: TakeProfit=${take_profit_price}, StopTrigger=${stop_loss_trigger}, StopLimit=${stop_loss_limit}")
        
        time_c_start = time.perf_counter()
        try:
            oco_order = await self.connector.create_oco_order(
                symbol=symbol,
                side="SELL",
                quantity=qty_clean,
                price=take_profit_price,
                stop_price=stop_loss_trigger,
                stop_limit_price=stop_loss_limit
            )
            time_d = time.perf_counter()
            timings["oco_placement_ms"] = (time_d - time_c_start) * 1000
            logger.info(f"   * OCO Brackets routed successfully. OCO latency: {timings['oco_placement_ms']:.2f} ms")
        except Exception as e:
            logger.error(f"❌ Failed to place institutional OCO: {e}. Positions left uncovered!")
            oco_order = None
            time_d = time.perf_counter()
            timings["oco_placement_ms"] = (time_d - time_c_start) * 1000

        # PHASE D: DATABASE PERSISTENCE (Firestore / SQLite API)
        time_d_start = time.perf_counter()
        db_persisted = False
        
        # Prepare payload
        payload = {
            "symbol": symbol,
            "buy_order_id": str(order_id),
            "buy_price": actual_buy_price,
            "quantity": qty_clean,
            "oco_order_id": str(oco_order.get("orderListId")) if oco_order else "failed",
            "tp_price": take_profit_price,
            "sl_price": stop_loss_trigger,
            "status": "active",
            "timestamp": time.time(),
            "timings_ms": {
                "market_dispatch": timings["market_dispatch_ms"],
                "fill_confirmation": timings["fill_confirmation_ms"],
                "oco_placement": timings["oco_placement_ms"]
            }
        }

        # Persist to Firestore if available
        if self.db_fs is not None:
            try:
                doc_ref = self.db_fs.collection("positions").document(f"pos_{order_id}")
                await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: doc_ref.set(payload)
                )
                db_persisted = True
            except Exception as e:
                logger.error(f"❌ Firestore persistence failed: {e}")

        # Also fallback/send to local Next.js API
        try:
            async with aiohttp.ClientSession() as session:
                local_payload = {
                    "symbol": symbol,
                    "side": "BUY",
                    "price": actual_buy_price,
                    "quantity": qty_clean,
                    "total": round(qty_clean * actual_buy_price, 2),
                    "strategy": "Binance-OCO-Engine",
                    "mode": "live",
                    "pnl": 0.0
                }
                async with session.post("http://localhost:3000/api/trades", json=local_payload) as resp:
                    if resp.status == 200:
                        db_persisted = True
        except Exception as e:
            logger.warning(f"⚠️ Local SQLite persistence failed: {e}")

        time_e = time.perf_counter()
        timings["db_persistence_ms"] = (time_e - time_d_start) * 1000
        timings["total_roundtrip_ms"] = (time_e - time_a) * 1000

        print("\n⚡ QuantitativeEngineV3 Round-Trip Latency Diagnostic:")
        print(f"   - Symbol: {symbol}")
        print(f"   - Quantity: {qty_clean}")
        print(f"   - Market Order Dispatch: {timings['market_dispatch_ms']:.2f} ms")
        print(f"   - Fill Confirmation: {timings['fill_confirmation_ms']:.2f} ms")
        print(f"   - OCO Bracket Placement: {timings['oco_placement_ms']:.2f} ms")
        print(f"   - DB/Firestore Persistence: {timings['db_persistence_ms']:.2f} ms")
        print(f"   - 🏁 Total Latency (Start -> Finish): {timings['total_roundtrip_ms']:.2f} ms")
        print(f"   - DB Persisted: {'Yes ✅' if db_persisted else 'No ❌'}")
        
        return timings

    async def close(self):
        await self.connector.close()

async def main():
    # Instantiate Diagnostic tool targeting Binance Testnet
    engine = QuantitativeEngineV3(testnet=True)
    await engine.initialize()
    try:
        # Run test with small volume of highly liquid pair (e.g. BTCUSDT)
        await engine.execute_trade_roundtrip(symbol="BTCUSDT", quantity=0.001)
    finally:
        await engine.close()

if __name__ == "__main__":
    asyncio.run(main())
