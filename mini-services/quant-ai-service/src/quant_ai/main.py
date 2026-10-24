"""
quant_ai.main
-------------
FastAPI Microservice entrypoint for Quantitative AI:
1. Conformal Prediction intervals (95% coverage)
2. Adversarial robustness gating against L2 spoofing & microstructure noise
3. Multimodal chart vision with Gemini 2.5 Flash
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Carregar variáveis de ambiente de .env
load_dotenv()

from quant_ai.conformal_predictor import ConformalPredictor, ConformalPredictionInterval
from quant_ai.adversarial_tester import (
    AdversarialRobustnessConfig,
    SignalAdversarialTester,
    NOISE_RANDOM_SIGN,
    NOISE_UNIFORM,
    NOISE_MONTECARLO_WORST,
)
from quant_ai.gemini_vision import GeminiChartVisionService, ChartVisionAnalysis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("quant-ai-service")

app = FastAPI(
    title="TradeAI Quant AI Microservice",
    description="Institutional Conformal Prediction, Adversarial Robustness and Gemini Vision",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

vision_service = GeminiChartVisionService()


# ---------------------------------------------------------------------------
# Request & Response Models
# ---------------------------------------------------------------------------
class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


class ConformalPredictRequest(BaseModel):
    residuals: List[float] = Field(..., description="Calibration residuals |y - y_hat|")
    point_predictions: List[float] = Field(..., description="Point predictions to wrap in intervals")
    alpha: float = Field(default=0.05, ge=0.001, le=0.5, description="Significance level (e.g. 0.05 for 95% coverage)")


class ConformalIntervalItem(BaseModel):
    point: float
    lower: float
    upper: float
    interval_width: float


class ConformalPredictResponse(BaseModel):
    intervals: List[ConformalIntervalItem]
    quantile_q: float
    alpha: float
    coverage_guarantee_pct: float
    sample_count: int


class AdversarialAuditRequest(BaseModel):
    features: List[List[float]] = Field(..., description="Out-of-sample 2D feature matrix (e.g. orderbook depth, momentum)")
    decision_threshold: float = Field(default=0.5, description="Binary decision boundary threshold")
    epsilon: float = Field(default=0.01, ge=0.0, description="Perturbation budget as fraction of feature scale")
    flip_tolerance_pct: float = Field(default=5.0, ge=0.0, description="Maximum allowable flip percentage")
    noise_type: str = Field(default=NOISE_RANDOM_SIGN, description="'uniform', 'random_sign', or 'montecarlo_worst'")
    n_trials: int = Field(default=25, ge=1, description="Number of Monte Carlo trials if noise_type is montecarlo_worst")
    seed: Optional[int] = Field(default=42, description="Random seed for determinism")


class ChartVisionRequest(BaseModel):
    symbol: str = Field(default="BTCUSDT")
    timeframe: str = Field(default="1h")
    image_base64: str = Field(..., description="Base64 encoded chart screenshot")
    mime_type: str = Field(default="image/png")
    additional_context: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(
        status="ok",
        service="quant-ai-service",
        version="0.1.0",
    )


@app.post("/api/conformal/predict", response_model=ConformalPredictResponse)
def predict_conformal(payload: ConformalPredictRequest):
    try:
        if len(payload.residuals) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Calibration residuals must not be empty.",
            )
        
        predictor = ConformalPredictor(alpha=payload.alpha)
        predictor.calibrate(payload.residuals)
        
        intervals = predictor.predict_interval(payload.point_predictions)
        
        return ConformalPredictResponse(
            intervals=[
                ConformalIntervalItem(
                    point=it.point,
                    lower=it.lower,
                    upper=it.upper,
                    interval_width=it.interval_width,
                )
                for it in intervals
            ],
            quantile_q=predictor.q_hat,
            alpha=payload.alpha,
            coverage_guarantee_pct=(1.0 - payload.alpha) * 100.0,
            sample_count=len(payload.residuals),
        )
    except Exception as e:
        logger.error(f"Conformal prediction error: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@app.post("/api/adversarial/audit")
def audit_adversarial_robustness(payload: AdversarialAuditRequest):
    try:
        X = np.asarray(payload.features, dtype=float)
        if X.ndim != 2 or X.shape[0] == 0 or X.shape[1] == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Features must be a non-empty 2D array.",
            )

        config = AdversarialRobustnessConfig(
            epsilon=payload.epsilon,
            flip_tolerance_pct=payload.flip_tolerance_pct,
            noise_type=payload.noise_type,
            n_trials=payload.n_trials,
            seed=payload.seed,
            decision_threshold=payload.decision_threshold,
        )
        tester = SignalAdversarialTester(config)

        # Baseline model: feature mean above decision_threshold -> 1 (BUY), else 0 (SELL)
        def model_func(feats: np.ndarray) -> np.ndarray:
            # normalized mean across features
            scores = np.mean(feats, axis=1)
            return (scores > config.decision_threshold).astype(int)

        report = tester.evaluate_model(model_func, X)
        return report.as_dict()

    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Adversarial audit failed: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@app.post("/api/vision/analyze-chart", response_model=ChartVisionAnalysis)
async def analyze_chart(payload: ChartVisionRequest):
    try:
        analysis = await vision_service.analyze_chart(
            symbol=payload.symbol,
            timeframe=payload.timeframe,
            image_base64=payload.image_base64,
            mime_type=payload.mime_type,
            additional_context=payload.additional_context,
        )
        return analysis
    except Exception as e:
        logger.error(f"Chart vision analysis failed: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
