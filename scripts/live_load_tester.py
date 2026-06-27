# -*- coding: utf-8 -*-
"""
TRADEAI — Live Load Tester (Concurrency & Performance Stress Tool)
Exclusively uses real data from the Binance API to generate concurrent trade commands.
Supports both Firestore (Firebase) and local REST API stress testing.
"""

import os
import time
import asyncio
import logging
import aiohttp
from dotenv import load_dotenv

# Try importing Firebase/Firestore dependencies
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
logger = logging.getLogger("LiveLoadTester")

BINANCE_PRICE_URL = "https://api.binance.com/api/v3/ticker/price"
LOCAL_API_URL = "http://localhost:3000/api/trades"
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "tradeai3-dfc7c")

# Initialize Firebase if credentials exist
db_fs = None
if FIREBASE_AVAILABLE:
    try:
        # Initialize default app if not already initialized
        if not firebase_admin._apps:
            cred = credentials.ApplicationDefault() if os.getenv("GOOGLE_APPLICATION_CREDENTIALS") else None
            if cred:
                firebase_admin.initialize_app(cred, {
                    'projectId': FIREBASE_PROJECT_ID,
                })
                db_fs = firestore.client()
                logger.info("✅ Firebase Admin SDK initialized successfully.")
            else:
                logger.warning("⚠️ GOOGLE_APPLICATION_CREDENTIALS not found. Firestore direct writes disabled.")
    except Exception as e:
        logger.error(f"❌ Failed to initialize Firebase Admin: {e}")

async def get_live_prices(session: aiohttp.ClientSession, symbols: list) -> dict:
    """
    Fetches real-time price tickers from public Binance API
    """
    prices = {}
    try:
        async with session.get(BINANCE_PRICE_URL) as response:
            if response.status == 200:
                data = await response.json()
                for item in data:
                    sym = item['symbol']
                    if sym in symbols:
                        prices[sym] = float(item['price'])
        logger.info(f"📈 Real prices fetched from Binance: {prices}")
    except Exception as e:
        logger.error(f"❌ Failed to fetch prices from Binance: {e}")
    return prices

async def dispatch_trade_to_rest(session: aiohttp.ClientSession, trade: dict) -> dict:
    """
    Sends trade command to Next.js API endpoint concurrently
    """
    start_time = time.perf_counter()
    result = {"success": False, "latency_ms": 0, "status": 0, "error": None}
    try:
        async with session.post(LOCAL_API_URL, json=trade, timeout=5000) as response:
            latency = (time.perf_counter() - start_time) * 1000
            result["status"] = response.status
            result["latency_ms"] = latency
            if response.status == 200:
                result["success"] = True
            elif response.status == 429:
                result["error"] = "Rate Limited (429)"
            else:
                body = await response.text()
                result["error"] = f"HTTP {response.status}: {body[:100]}"
    except Exception as e:
        result["latency_ms"] = (time.perf_counter() - start_time) * 1000
        result["error"] = str(e)
    return result

async def dispatch_trade_to_firestore(trade: dict) -> dict:
    """
    Sends trade command directly to Firestore database collection 'commands'
    """
    if db_fs is None:
        return {"success": False, "latency_ms": 0, "error": "Firestore not initialized"}
    
    start_time = time.perf_counter()
    try:
        # Generate document inside 'commands' collection
        doc_ref = db_fs.collection("commands").document()
        # Run blocking Firestore write in executor
        await asyncio.get_event_loop().run_in_executor(
            None, 
            lambda: doc_ref.set({
                **trade,
                "command": "EXECUTE_TRADE",
                "timestamp": firestore.SERVER_TIMESTAMP,
                "status": "pending"
            })
        )
        latency = (time.perf_counter() - start_time) * 1000
        return {"success": True, "latency_ms": latency}
    except Exception as e:
        return {
            "success": False, 
            "latency_ms": (time.perf_counter() - start_time) * 1000, 
            "error": str(e)
        }

async def run_load_test():
    target_symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "LTCUSDT"]
    
    async with aiohttp.ClientSession() as session:
        # 1. Fetch real prices
        prices = await get_live_prices(session, target_symbols)
        if not prices:
            logger.error("❌ Cannot run load test without live price tickers.")
            return

        # 2. Build 5 to 10 concurrent trade orders
        trades = []
        for i, (sym, price) in enumerate(list(prices.items())[:8]):
            side = "BUY" if i % 2 == 0 else "SELL"
            qty = round(150.0 / price, 4) # Allocate ~$150 per trade
            trades.append({
                "symbol": sym,
                "side": side,
                "price": price,
                "quantity": qty,
                "total": round(qty * price, 2),
                "strategy": "Load-Test",
                "mode": "paper"
            })

        logger.info(f"🔥 Launching {len(trades)} concurrent trades...")

        # 3. Choose targets based on configuration
        # Stress-test Next.js REST API
        logger.info("⚡ Stress testing Local REST API (/api/trades)...")
        tasks = [dispatch_trade_to_rest(session, t) for t in trades]
        results = await asyncio.gather(*tasks)

        # Print statistics
        successes = sum(1 for r in results if r["success"])
        rate_limits = sum(1 for r in results if r["error"] == "Rate Limited (429)")
        latencies = [r["latency_ms"] for r in results]
        avg_latency = sum(latencies) / len(latencies) if latencies else 0

        print("\n📊 REST API Concurrency Test Results:")
        print(f"   - Total Dispatched: {len(trades)}")
        print(f"   - Success Rate: {successes}/{len(trades)}")
        print(f"   - Rate Limited (429): {rate_limits}")
        print(f"   - Average Latency: {avg_latency:.2f} ms")
        print(f"   - Min Latency: {min(latencies):.2f} ms")
        print(f"   - Max Latency: {max(latencies):.2f} ms")
        for i, r in enumerate(results):
            print(f"     * Order #{i+1} ({trades[i]['symbol']}): Status={r['status']}, Latency={r['latency_ms']:.1f}ms, Err={r['error']}")

        # 4. If Firestore is active, test Firestore concurrent insertion
        if db_fs is not None:
            print("\n⚡ Stress testing Firestore insertions...")
            fs_tasks = [dispatch_trade_to_firestore(t) for t in trades]
            fs_results = await asyncio.gather(*fs_tasks)
            
            fs_successes = sum(1 for r in fs_results if r["success"])
            fs_latencies = [r["latency_ms"] for r in fs_results]
            fs_avg = sum(fs_latencies) / len(fs_latencies) if fs_latencies else 0
            
            print("📊 Firestore Concurrency Test Results:")
            print(f"   - Success Rate: {fs_successes}/{len(trades)}")
            print(f"   - Average Latency: {fs_avg:.2f} ms")
            for i, r in enumerate(fs_results):
                print(f"     * Order #{i+1} ({trades[i]['symbol']}): Latency={r['latency_ms']:.1f}ms, Err={r['error']}")

if __name__ == "__main__":
    asyncio.run(run_load_test())
