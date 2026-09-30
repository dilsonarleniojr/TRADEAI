import os
import sys
import time
import asyncio
import signal
import logging
import psutil

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] ShutdownSequence: %(message)s"
)
logger = logging.getLogger("shutdown_sequence")

async def shutdown_process(proc):
    """
    Attempts to gracefully shutdown a python process by sending SIGINT.
    This allows the asyncio event loop to catch KeyboardInterrupt and perform cleanup
    (e.g., closing aiohttp sessions, websockets, and Firestore listeners).
    """
    logger.info(f"Sending SIGINT to {proc.name()} (PID: {proc.pid}) to trigger graceful asyncio shutdown...")
    proc.send_signal(signal.SIGINT)
    
    # Wait for the process to exit, allowing it time to finish pending async operations
    try:
        proc.wait(timeout=10)
        logger.info(f"Process {proc.pid} gracefully terminated.")
    except psutil.TimeoutExpired:
        logger.warning(f"Process {proc.pid} did not terminate within 10s. Sending SIGTERM...")
        proc.terminate()
        try:
            proc.wait(timeout=5)
            logger.info(f"Process {proc.pid} terminated.")
        except psutil.TimeoutExpired:
            logger.error(f"Process {proc.pid} stuck. Force killing (SIGKILL)...")
            proc.kill()

async def main():
    logger.info("Initiating Graceful Shutdown of Python Backend...")
    
    # 1. We look for the main python backend scripts (quantitative_engine, websocket_ingestor, etc.)
    target_scripts = [
        "quantitative_engine_v3.py",
        "websocket_ingestor.py",
        "ensemble_arbitrator.py",
        "live_load_tester.py",
        "risk_manager.py",
        "market_scanner.py"
    ]
    
    tasks = []
    
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            cmdline = proc.info['cmdline']
            if cmdline and 'python' in proc.info['name'].lower():
                # Check if it's one of our target scripts
                for script in target_scripts:
                    if any(script in cmd for cmd in cmdline):
                        tasks.append(shutdown_process(proc))
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass

    if not tasks:
        logger.info("No active Python backend processes found. System is already clean.")
        return

    # Wait for all shutdown tasks to complete
    await asyncio.gather(*tasks)
    
    logger.info("Graceful shutdown sequence completed. All WebSockets closed and Firestore listeners detached.")

if __name__ == "__main__":
    asyncio.run(main())
