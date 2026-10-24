import pytest
import numpy as np
from fastapi.testclient import TestClient

from quant_ai.conformal_predictor import ConformalPredictor
from quant_ai.adversarial_tester import (
    AdversarialRobustnessConfig,
    SignalAdversarialTester,
    wilson_upper_bound,
    NOISE_RANDOM_SIGN,
    NOISE_UNIFORM,
    NOISE_MONTECARLO_WORST,
)
from quant_ai.main import app

client = TestClient(app)


def test_conformal_predictor_calibration_and_intervals():
    residuals = [0.05, 0.02, 0.10, 0.04, 0.08, 0.01, 0.03, 0.07, 0.09, 0.06]
    predictor = ConformalPredictor(alpha=0.10)
    predictor.calibrate(residuals)

    assert predictor.q_hat is not None
    assert predictor.q_hat > 0

    points = [100.0, 105.0]
    intervals = predictor.predict_interval(points)
    assert len(intervals) == 2
    for it in intervals:
        assert it.lower == pytest.approx(it.point - predictor.q_hat)
        assert it.upper == pytest.approx(it.point + predictor.q_hat)
        assert it.interval_width == pytest.approx(2 * predictor.q_hat)


def test_wilson_upper_bound():
    # 0 flips on 100 trials at 95% confidence should be small but strictly > 0
    upper = wilson_upper_bound(0, 100, 0.95)
    assert 0.0 < upper < 0.05

    # 5 flips on 100 trials
    upper_5 = wilson_upper_bound(5, 100, 0.95)
    assert upper_5 > 0.05


def test_adversarial_tester_robust_and_fragile_model():
    np.random.seed(42)
    # High margin data (far from 0.5)
    X_clean = np.random.uniform(0.7, 0.9, size=(50, 4))
    
    config = AdversarialRobustnessConfig(
        epsilon=0.01,
        flip_tolerance_pct=5.0,
        noise_type=NOISE_RANDOM_SIGN,
        seed=42,
        decision_threshold=0.5,
    )
    tester = SignalAdversarialTester(config)
    
    # Model: mean(X) > 0.5
    model_func = lambda x: (np.mean(x, axis=1) > 0.5).astype(int)
    report = tester.evaluate_model(model_func, X_clean)

    assert report.total_samples == 50
    assert report.flipped_signals == 0
    assert report.is_robust is True


def test_api_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "quant-ai-service"


def test_api_conformal_predict_endpoint():
    payload = {
        "residuals": [0.1, 0.2, 0.15, 0.05, 0.25, 0.18, 0.12],
        "point_predictions": [65000.0, 65500.0],
        "alpha": 0.05,
    }
    response = client.post("/api/conformal/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data["intervals"]) == 2
    assert data["alpha"] == 0.05
    assert data["coverage_guarantee_pct"] == 95.0
    assert data["quantile_q"] > 0


def test_api_adversarial_audit_endpoint():
    payload = {
        "features": [
            [0.8, 0.85, 0.9],
            [0.75, 0.8, 0.85],
            [0.2, 0.15, 0.1],
            [0.18, 0.22, 0.15],
        ],
        "decision_threshold": 0.5,
        "epsilon": 0.01,
        "flip_tolerance_pct": 10.0,
        "noise_type": "random_sign",
        "n_trials": 10,
        "seed": 42,
    }
    response = client.post("/api/adversarial/audit", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "vulnerability_score_pct" in data
    assert "is_robust" in data
    assert "flip_rate_ci_upper_pct" in data


def test_api_chart_vision_endpoint():
    payload = {
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "image_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "mime_type": "image/png",
        "additional_context": "Unit test run",
    }
    response = client.post("/api/vision/analyze-chart", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["symbol"] == "BTCUSDT"
    assert "primary_trend" in data
    assert "key_levels" in data
    assert len(data["key_levels"]) > 0
