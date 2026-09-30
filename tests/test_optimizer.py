# -*- coding: utf-8 -*-
"""
TRADEAI — Test Suite for Hyperparameter Optimizer and Simulated Matching Engine
"""

import os
import sys
import json
import pandas as pd
import numpy as np

# Add scripts directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from scripts.hyperparameter_optimizer import (
    generate_tick_dataset,
    SimulatedMatchingEngine,
    IntradayStrategyEvaluator,
    HyperparameterOptimizer,
    run_walk_forward_validation
)

def test_dataset_generation():
    """
    Validates tick dataset generation structure and profiles.
    """
    print("\n[TEST] Testing dataset generation...")
    symbol = "BTCUSDT"
    
    # 1. Normal Market
    df = generate_tick_dataset(symbol, "normal_market", days=1)
    assert len(df) > 0, "Dataset should not be empty"
    required_cols = ["timestamp", "symbol", "bid_price", "bid_size", "ask_price", "ask_size", "last_price", "volume"]
    for col in required_cols:
        assert col in df.columns, f"Column {col} missing in dataset"
        
    print("   - Columns verified successfully.")
    
    # 2. High Volatility
    df_vol = generate_tick_dataset(symbol, "high_volatility", days=1)
    # Volatility should have higher standard deviation of returns
    std_normal = np.std(np.diff(df["last_price"].values))
    std_vol = np.std(np.diff(df_vol["last_price"].values))
    assert std_vol > std_normal, "Volatility dataset should have higher variance"
    print("   - Volatility levels verified successfully.")
    print("✅ test_dataset_generation passed!")

def test_matching_engine():
    """
    Validates matching engine execution logic (slippage models, throttling, and fills).
    """
    print("\n[TEST] Testing matching engine...")
    
    # Setup engine with small limits to trigger throttling
    engine = SimulatedMatchingEngine(
        initial_balance=10000.0,
        commission_pct=0.00075,
        latency_ms=50.0,
        batch_size=5,
        batching_window_ms=50.0,
        throttling_limit_per_s=5, # very low limit
        slippage_model="dynamic"
    )
    
    book = {
        "bid_price": 99.0,
        "ask_price": 101.0,
        "bid_size": 2.0,
        "ask_size": 2.0,
        "last_price": 100.0,
        "volume": 10.0
    }
    
    # 1. Test Throttling Rejections
    t = 1780281600.0
    for i in range(7): # submit 7 orders inside same second (limit is 5)
        res = engine.process_order({
            "id": f"o_{i}",
            "side": "BUY",
            "type": "MARKET",
            "price": 101.0,
            "qty": 1.0,
            "time_in_force": "IOC"
        }, t, book)
        
    assert engine.total_orders_submitted == 7
    assert engine.total_orders_rejected == 2, f"Should reject 2 throttled orders, got {engine.total_orders_rejected}"
    print("   - Throttling rules verified successfully.")
    
    # 2. Test Batching and Execution Latency
    # Engine latency is 50ms (0.05s)
    # Batch window is 50ms
    # Process matching at t + 0.1s (past latency and batch window)
    engine.run_matching_logic(t + 0.1, book)
    
    # Check that batched orders filled
    assert engine.total_orders_filled == 5, f"Should fill 5 batched orders, got {engine.total_orders_filled}"
    print("   - Latency batching fills verified successfully.")
    
    # 3. Test Dynamic Slippage
    # Let's inspect the fill prices
    last_trade = engine.trades[-1]
    # ask_price was 101.0. With qty = 1.0 vs ask_size = 2.0, dynamic slippage will be applied
    assert last_trade["price"] > 101.0, "Execution price should slide above ask due to dynamic slippage"
    print(f"   - Base ask: $101.0 -> Executed fill: ${last_trade['price']:.4f} (slippage applied)")
    print("✅ test_matching_engine passed!")

def test_optimizer_search():
    """
    Runs short optimization sweeps to verify search algorithms convergence and WF validation.
    """
    print("\n[TEST] Testing optimizer search sweeps...")
    symbol = "BTCUSDT"
    df = generate_tick_dataset(symbol, "normal_market", days=1)
    
    evaluator = IntradayStrategyEvaluator(df, "Momentum", initial_balance=100000.0)
    
    # Test Bayesian Optimizer (2 iterations)
    opt = HyperparameterOptimizer(evaluator, "Bayesian", num_iterations=2)
    res = opt.run()
    assert res["best_config"] is not None
    assert len(res["all_runs"]) == 2
    print("   - Bayesian sweep verified successfully.")
    
    # Test Evolutionary Optimizer (2 iterations)
    opt_evo = HyperparameterOptimizer(evaluator, "Evolutionary", num_iterations=2)
    res_evo = opt_evo.run()
    assert res_evo["best_config"] is not None
    assert len(res_evo["all_runs"]) == 2
    print("   - Evolutionary sweep verified successfully.")
    
    # Test Walk Forward validation
    wf = run_walk_forward_validation(df, "Momentum", res["best_config"], opt.engine_config)
    assert "robustness_pct" in wf
    assert len(wf["folds"]) == 2
    print("   - Walk-forward folds verified successfully.")
    print("✅ test_optimizer_search passed!")

def main():
    test_dataset_generation()
    test_matching_engine()
    test_optimizer_search()
    print("\n🎉 ALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    main()
